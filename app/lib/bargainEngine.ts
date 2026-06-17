/**
 * BargainBot Negotiation Engine v4 — Natural & Human
 *
 * Philosophy (from reference images):
 * - Never tell the customer to "keep pushing" or reveal negotiation mechanics
 * - Respond naturally to anything the customer says
 * - Gradually increase discount through rounds, not based on qty alone
 * - Handle vague input intelligently (ask for what's missing)
 * - Win-win: customer feels they earned the deal, merchant protects margin
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuantityTier {
  minQty: number;
  discount: number;
}

export interface ProductRule {
  minQuantity: number;
  triggerQuantity: number;
  openingDiscount: number;
  maxDiscount: number;
  concessionStep: number;
  maxRounds: number;
  dealExpiryMins: number;
  tiers: QuantityTier[];
}

export interface SessionState {
  currentRound: number;
  currentDiscount: number;
  agreedQty: number | null;
  agreedDiscount: number | null;
  status: "active" | "closed" | "expired";
  lastQty?: number;
  usedResponseIds?: string[];
}

export type Tone = "friendly" | "professional" | "enthusiastic";
export type Intent = "greeting" | "qty" | "accept" | "reject" | "unrecognized";

export interface EngineResult {
  response: string;
  intent: Intent | "walkaway";
  parsedQty: number | null;
  sessionUpdate: Partial<SessionState>;
  dealClosed: boolean;
  sessionExpired: boolean;
}

// ─── Intent parsing ───────────────────────────────────────────────────────────

const GREETING   = /^(hi|hello|hey|howdy|yo|sup|greetings|good\s*(morning|afternoon|evening))/i;
const WALK_AWAY  = /\b(no\s*deal|not\s*interested|forget\s*it|never\s*mind|nevermind|no\s*thanks|no\s*thank\s*you|walk\s*away|not\s*happening|pass|skip|cancel|bye|goodbye|leave it|not\s*buying)\b/i;
const ACCEPT     = /\b(yes|yeah|yep|yup|okay|deal|sure|sounds good|i('ll| will) take it|let('s| us) do it|agreed|accept|done|i'll take|works for me|let's go|go ahead|i want it|take it|i'll do it|ok)\b/i;
const REJECT     = /\b(no(?!\s*deal)|nope|nah|too (much|high|expensive)|can('t| not) do|not good enough|lower|better|more discount|come down|reduce|cheaper|less|want more|give me more|try again|not enough|still too|that'?s? (too|not))\b/i;
const QTY_RE     = /\b(\d+)\s*(units?|pcs?|pieces?|items?|qty|quantity|of them|of those|nos?)?\b/i;
const DISC_REQ   = /(\d+)\s*%/;
// Vague interest — "more", "better deal", "i want more", free-text without qty/discount
const VAGUE_MORE = /\b(more|better|something better|not enough|higher|bigger discount|improve|what else|can you do better)\b/i;

type Mood = "polite" | "pushy" | "casual" | "neutral";
const POLITE = /\b(please|thank|thanks|appreciate|kindly|could you|would you|may i)\b/i;
const PUSHY  = /\b(come on|seriously|ridiculous|cmon|give me|must have)\b/i;

function detectMood(msg: string): Mood {
  if (POLITE.test(msg)) return "polite";
  if (PUSHY.test(msg))  return "pushy";
  return "neutral";
}

export function parseIntent(msg: string): {
  intent: Intent | "walkaway"; qty: number | null; mood: Mood; requestedDiscount?: number; isVague?: boolean;
} {
  const t    = msg.trim();
  const low  = t.toLowerCase();
  const mood = detectMood(low);

  // 1. Walk-away
  if (WALK_AWAY.test(low)) return { intent: "walkaway", qty: null, mood };

  // 2. Discount % request — before qty so "30%" isn't parsed as 30 units
  const discMatch = DISC_REQ.exec(t);
  if (discMatch) {
    return { intent: "reject", qty: null, mood, requestedDiscount: parseInt(discMatch[1], 10) };
  }

  // 3. Greeting
  if (GREETING.test(low)) return { intent: "greeting", qty: null, mood };

  // 4. Reject
  if (REJECT.test(low)) return { intent: "reject", qty: null, mood };

  // 5. Accept
  if (ACCEPT.test(low)) return { intent: "accept", qty: null, mood };

  // 6. Quantity
  const m = QTY_RE.exec(t);
  if (m) return { intent: "qty", qty: parseInt(m[1], 10), mood };

  // 7. Vague "more / better" — treat as rejection with vague flag
  if (VAGUE_MORE.test(low)) return { intent: "reject", qty: null, mood, isVague: true };

  return { intent: "unrecognized", qty: null, mood };
}

// ─── Discount calculation ─────────────────────────────────────────────────────

/** Maximum discount available for a given quantity (the ceiling, not the offer) */
export function discountCeilingForQty(qty: number, rule: ProductRule): number {
  if (rule.tiers.length > 0) {
    const sorted = [...rule.tiers].sort((a, b) => b.minQty - a.minQty);
    for (const tier of sorted) {
      if (qty >= tier.minQty) return Math.min(tier.discount, rule.maxDiscount);
    }
  }
  const base    = Math.max(rule.triggerQuantity, rule.minQuantity, 1);
  const ceiling = base * 10;
  const ratio   = Math.min((qty - base) / Math.max(ceiling - base, 1), 1);
  const scaled  = rule.openingDiscount + ratio * (rule.maxDiscount - rule.openingDiscount);
  return parseFloat(Math.min(scaled, rule.maxDiscount).toFixed(1));
}

/**
 * Actual offer discount — always starts at openingDiscount, climbs per round.
 * High qty → higher ceiling, but still needs rounds to reach it.
 */
export function discountForQty(qty: number, rule: ProductRule, round = 1): number {
  const ceiling      = discountCeilingForQty(qty, rule);
  const earnedDiscount = rule.openingDiscount + (round - 1) * rule.concessionStep;
  return parseFloat(Math.min(earnedDiscount, ceiling, rule.maxDiscount).toFixed(1));
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ─── Response system ──────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

type Ctx = {
  qty?: number; discount?: number; prevQty?: number; prevDiscount?: number;
  productTitle?: string;
};

// ─── Response banks ───────────────────────────────────────────────────────────
// NO meta-commentary. Natural, warm, human. Like a real salesperson.

const GREETINGS = [
  "Hey! Looking to get a better price on this? Tell me how many you need and I'll see what I can do 😊",
  "Hi there! This is a great product. How many are you thinking of getting?",
  "Welcome! I can work something out for the right order. What quantity are you after?",
  "Hey! Happy to help you get a deal. How many units do you need?",
  "Good to see you! What quantity were you thinking?",
];

const BELOW_MIN = (min: number) => pick([
  `We work on bulk orders — the minimum for a deal is ${min} units. Can you do that?`,
  `To make this worthwhile for both of us, I need at least ${min} units. Is that doable?`,
  `I can only work on orders of ${min}+ units. Can you meet that?`,
]);

const BELOW_TRIGGER = (trig: number) => pick([
  `Deals start at ${trig} units — once you're there I can make it interesting for you!`,
  `I need at least ${trig} units to start negotiating. Can you match that?`,
  `At ${trig}+ units, we can talk. What do you say?`,
]);

const FIRST_OFFER = (qty: number, disc: number) => pick([
  `For ${qty} units, I can do ${disc}% off. How does that sound?`,
  `Let me start you at ${disc}% off for ${qty} units. Interested?`,
  `${qty} units? I can offer you ${disc}% off right now. What do you think?`,
  `Okay — ${disc}% discount on ${qty} units. That's my opening offer. Deal?`,
  `For an order of ${qty}, I'm thinking ${disc}% off. Does that work?`,
]);

const QTY_INCREASE = (qty: number, disc: number, prev: number) => pick([
  `Going from ${prev} to ${qty} units — I can do ${disc}% off. That works better for both of us.`,
  `${qty} units? Now we're getting somewhere. I can offer ${disc}% off for that.`,
  `I like that! For ${qty} units I'll do ${disc}% off.`,
  `Bigger order, better deal — ${qty} units gets you ${disc}% off.`,
]);

const COUNTER_OFFER = (qty: number, disc: number) => pick([
  `Let me push a bit harder — I can do ${disc}% off for ${qty} units.`,
  `Alright, I'll move to ${disc}%. How's that?`,
  `I can stretch to ${disc}% off. Will that work?`,
  `${disc}% off for ${qty} units — that's a solid deal. What do you say?`,
  `I'll go to ${disc}% off. Is that closer to what you had in mind?`,
]);

const COUNTER_POLITE = (qty: number, disc: number) => pick([
  `Since you asked nicely — ${disc}% off for you. Deal?`,
  `I appreciate the courtesy! Let me offer you ${disc}% off.`,
]);

const FINAL_OFFER = (qty: number, disc: number) => pick([
  `Honestly, ${disc}% off for ${qty} units is the best I can do. That's my final offer.`,
  `I've pushed as far as I can — ${disc}% off on ${qty} units. I hope that works for you.`,
  `${disc}% off is my absolute limit for this order. I genuinely can't go further.`,
  `Last one from me — ${disc}% off for ${qty} units. I'd love to close this with you.`,
  `I'm at my ceiling: ${disc}% off for ${qty} units. That's everything I've got.`,
]);

const BEYOND_MAX = (qty: number, disc: number) => pick([
  `I really am stuck at ${disc}% — that's genuinely the max I can approve. Is it a deal?`,
  `${disc}% is locked in. I'd love to get this done for you — can we make it work?`,
  `I've already gone to my limit of ${disc}%. The offer is right here if you want it.`,
  `${disc}% off for ${qty} units — it's yours whenever you're ready. Just say the word.`,
  `Look, ${disc}% is the best this product ever goes. It's a good deal — shall we close?`,
  `I'm not going to be able to beat ${disc}%. But I hope we can still make this work!`,
]);

const DISCOUNT_REQUEST_NO_QTY = (pct: number) => pick([
  `${pct}% — noted! Tell me how many units you need and I'll see what I can do.`,
  `I'd love to get you ${pct}% off. First, how many units are you ordering?`,
  `The discount depends on quantity. How many units are you thinking?`,
  `To get there, I need a quantity. What were you planning to order?`,
]);

const DISCOUNT_TOO_HIGH = (asked: number, max: number) => pick([
  `I wish I could do ${asked}%, but I'm capped at ${max}% for this product. Can we work with that?`,
  `${asked}% is beyond what I'm authorised to offer — my max is ${max}%. Is that workable?`,
  `That's a bit above my limit. The best I can get to is ${max}% off. How does that sound?`,
]);

const DISCOUNT_NEGOTIATING = (asked: number, offering: number) => pick([
  `I can't jump straight to ${asked}%, but I can move to ${offering}% right now.`,
  `${asked}% is a stretch for me — let me offer ${offering}% and we go from there.`,
  `I'm at ${offering}% for now — let's see if we can work from here.`,
]);

const VAGUE_NO_QTY = () => pick([
  "Tell me how many units you need and I'll work something out for you.",
  "What quantity are you thinking? That'll help me put together an offer.",
  "How many units are you looking at? I can tailor the price around that.",
  "I need a quantity to work with — what did you have in mind?",
]);

const VAGUE_HAS_QTY = (qty: number, disc: number) => pick([
  `For ${qty} units, the best I can do right now is ${disc}% off. Does that help?`,
  `I can offer ${disc}% off on the ${qty} units we discussed. Better?`,
  `How about I move to ${disc}% off for your ${qty}? That's a step in the right direction.`,
]);

const UNRECOGNIZED = () => pick([
  "I'm not sure I follow — are you asking about a quantity or a discount?",
  "Could you clarify what you're after? A number of units, or a specific discount?",
  "I want to help — just tell me how many units you'd like and we can take it from there.",
  "What would make this deal work for you? A quantity, a price — just let me know.",
]);

const ACCEPT_DEAL = (qty: number, disc: number) => pick([
  `Great! ${disc}% off on ${qty} units — let me get your discount code ready.`,
  `Deal! ${qty} units at ${disc}% off. Generating your code now...`,
  `Love it — ${disc}% discount on ${qty} units. One moment while I lock this in for you.`,
  `You've got it! ${disc}% off for ${qty} units. Code coming right up.`,
  `Perfect, we have a deal — ${disc}% off, ${qty} units. Let me grab your code.`,
]);

const WALK_AWAY_RESP = () => pick([
  "No problem at all — the offer stands if you change your mind. See you around! 👋",
  "Fair enough! Come back anytime — happy to help whenever you're ready.",
  "Got it. If you ever reconsider, I'll be here. Take care! 😊",
  "Totally fine! The door's open whenever you'd like to revisit this.",
]);

const TIMEOUT_RESP = () => pick([
  "Looks like we couldn't quite get there today — no worries! Come back whenever you're ready.",
  "I think we've run out of room on this one. Feel free to start fresh anytime!",
  "Seems like we've hit an impasse — let's leave it here. Reach out again when you're ready.",
]);

// ─── Main engine ──────────────────────────────────────────────────────────────

export function processMessage(
  message: string,
  rule: ProductRule,
  session: SessionState,
  tone: Tone = "friendly",
): EngineResult {
  const parsed = parseIntent(message);
  const { intent, qty: parsedQty, mood, requestedDiscount, isVague } = parsed;
  const sessionUpdate: Partial<SessionState> = {};
  const usedIds = session.usedResponseIds || [];
  let response = "";
  let dealClosed = false;
  let sessionExpired = false;

  // ── Walk-away ────────────────────────────────────────────────────────────
  if (intent === "walkaway") {
    sessionUpdate.status = "expired";
    sessionExpired = true;
    return { response: WALK_AWAY_RESP(), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  // ── Greeting ─────────────────────────────────────────────────────────────
  if (intent === "greeting") {
    return { response: pick(GREETINGS), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  // ── Unrecognized ─────────────────────────────────────────────────────────
  if (intent === "unrecognized") {
    // If they have a qty on record, reference it
    if (session.agreedQty) {
      const d = discountForQty(session.agreedQty, rule, session.currentRound);
      return { response: VAGUE_HAS_QTY(session.agreedQty, d), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }
    return { response: UNRECOGNIZED(), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  // ── Quantity ──────────────────────────────────────────────────────────────
  if (intent === "qty" && parsedQty !== null) {
    const qty = parsedQty;

    if (qty < rule.minQuantity) {
      return { response: BELOW_MIN(rule.minQuantity), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }
    if (qty < rule.triggerQuantity) {
      return { response: BELOW_TRIGGER(rule.triggerQuantity), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    const round      = session.currentRound + 1;
    const prevQty    = session.agreedQty || session.lastQty || 0;
    const prevDisc   = session.currentDiscount || 0;
    const isIncrease = qty > prevQty && prevQty > 0;
    const discount   = discountForQty(qty, rule, round);
    const isFinal    = round >= rule.maxRounds || discount >= rule.maxDiscount;

    sessionUpdate.currentRound    = round;
    sessionUpdate.currentDiscount = discount;
    sessionUpdate.agreedQty       = qty;
    sessionUpdate.lastQty         = prevQty;
    sessionUpdate.usedResponseIds = [...usedIds, `qty-${Math.random()}`];

    if (isFinal) {
      response = FINAL_OFFER(qty, discount);
    } else if (isIncrease) {
      response = QTY_INCREASE(qty, discount, prevQty);
    } else if (round === 1) {
      response = FIRST_OFFER(qty, discount);
    } else {
      response = COUNTER_OFFER(qty, discount);
    }

    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  // ── Accept ────────────────────────────────────────────────────────────────
  if (intent === "accept") {
    const qty      = session.agreedQty;
    const discount = session.currentDiscount;

    if (!qty || !discount) {
      return { response: pick(GREETINGS), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    const validDiscount = clamp(discount, 0, rule.maxDiscount);
    sessionUpdate.status        = "closed";
    sessionUpdate.agreedQty     = qty;
    sessionUpdate.agreedDiscount = validDiscount;
    dealClosed = true;
    return { response: ACCEPT_DEAL(qty, validDiscount), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  // ── Reject / discount request ─────────────────────────────────────────────
  if (intent === "reject") {
    const qty         = session.agreedQty;
    const currentDisc = session.currentDiscount;
    const round       = session.currentRound + 1;

    // Vague "more / better" with no qty yet
    if ((isVague || !requestedDiscount) && !qty) {
      return { response: VAGUE_NO_QTY(), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    // Vague with qty — show improved offer
    if (isVague && qty) {
      const newDisc = clamp(currentDisc + rule.concessionStep, 0, rule.maxDiscount);
      const isFinal = round >= rule.maxRounds || newDisc >= rule.maxDiscount;
      sessionUpdate.currentRound    = round;
      sessionUpdate.currentDiscount = newDisc;
      response = isFinal ? FINAL_OFFER(qty, newDisc) : VAGUE_HAS_QTY(qty, newDisc);
      return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    // Specific discount % requested
    if (requestedDiscount !== undefined) {
      if (!qty) {
        return { response: DISCOUNT_REQUEST_NO_QTY(requestedDiscount), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
      }

      // Already at max
      if (currentDisc >= rule.maxDiscount) {
        sessionUpdate.currentRound = round;
        sessionUpdate.currentDiscount = rule.maxDiscount;
        return { response: BEYOND_MAX(qty, rule.maxDiscount), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
      }

      const nextDisc = clamp(currentDisc + rule.concessionStep, 0, rule.maxDiscount);
      const isFinal  = round >= rule.maxRounds || nextDisc >= rule.maxDiscount;
      sessionUpdate.currentRound    = round;
      sessionUpdate.currentDiscount = nextDisc;

      if (requestedDiscount > rule.maxDiscount) {
        response = isFinal
          ? FINAL_OFFER(qty, rule.maxDiscount)
          : DISCOUNT_TOO_HIGH(requestedDiscount, nextDisc);
        sessionUpdate.currentDiscount = isFinal ? rule.maxDiscount : nextDisc;
      } else if (requestedDiscount <= nextDisc) {
        // Within reach — grant it
        sessionUpdate.currentDiscount = Math.min(requestedDiscount, rule.maxDiscount);
        response = isFinal ? FINAL_OFFER(qty, sessionUpdate.currentDiscount) : COUNTER_OFFER(qty, sessionUpdate.currentDiscount);
      } else {
        // They asked for more than we can give in one step
        response = isFinal ? FINAL_OFFER(qty, nextDisc) : DISCOUNT_NEGOTIATING(requestedDiscount, nextDisc);
      }

      sessionUpdate.usedResponseIds = [...usedIds, `reject-${Math.random()}`];
      return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    // Plain rejection (no specific %)
    const qty2     = qty ?? rule.triggerQuantity;
    const alreadyMax = currentDisc >= rule.maxDiscount;
    const extraRounds = round - rule.maxRounds;

    // Auto-close if pushing way past max rounds
    if (extraRounds >= 3 && alreadyMax) {
      sessionUpdate.status = "expired";
      sessionExpired = true;
      return { response: TIMEOUT_RESP(), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    const newDisc  = alreadyMax ? rule.maxDiscount : clamp(currentDisc + rule.concessionStep, 0, rule.maxDiscount);
    const pastMax  = round > rule.maxRounds || alreadyMax;
    sessionUpdate.currentRound    = round;
    sessionUpdate.currentDiscount = newDisc;

    if (pastMax) {
      response = BEYOND_MAX(qty2, newDisc);
    } else if (round >= rule.maxRounds || newDisc >= rule.maxDiscount) {
      response = FINAL_OFFER(qty2, newDisc);
    } else if (mood === "polite" && qty) {
      response = COUNTER_POLITE(qty2, newDisc);
    } else {
      response = COUNTER_OFFER(qty2, newDisc);
    }

    sessionUpdate.usedResponseIds = [...usedIds, `plain-reject-${Math.random()}`];
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  return { response: UNRECOGNIZED(), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
}
