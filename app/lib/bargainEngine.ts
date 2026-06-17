/**
 * BargainBot Negotiation Engine v3 — Ultra Interactive
 *
 * - Context-aware responses based on negotiation history
 * - Customer mood detection (polite, pushy, casual)
 * - Discount % request handling (e.g. "I want 30%")
 * - No-repeat tracking per session
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
  sessionExpired: boolean;  // true when customer walks away
}

// ─── Intent parsing ───────────────────────────────────────────────────────────

const GREETING  = /^(hi|hello|hey|howdy|yo|sup|greetings|good\s*(morning|afternoon|evening))/i;

// EXPLICIT WALK-AWAY — checked FIRST before accept/reject to avoid misparse
const WALK_AWAY = /\b(no\s*deal|not\s*interested|forget\s*it|never\s*mind|nevermind|no\s*thanks|no\s*thank\s*you|walk\s*away|not\s*happening|pass|skip|cancel|bye|goodbye|leave it|not\s*buying)\b/i;

// Accept — must NOT fire if "no" appears before "deal"
const ACCEPT    = /\b(yes|yeah|yep|yup|okay|deal|sure|sounds good|i('ll| will) take it|let('s| us) do it|agreed|accept|done|i'll take|works for me|let's go|go ahead|i want it|take it|i'll do it)\b/i;

const REJECT    = /\b(no(?!\s*deal)|nope|nah|too (much|high|expensive)|can('t| not) do|not good enough|lower|better|more discount|come down|reduce|cheaper|less|want more|give me more|try again|not enough|still too|that'?s? (too|not))\b/i;
const QTY_RE    = /\b(\d+)\s*(units?|pcs?|pieces?|items?|qty|quantity|of them|of those|nos?)?\b/i;
const DISC_REQ  = /(\d+)\s*%/;

export type WalkAway = "walkaway";

type Mood = "polite" | "pushy" | "casual" | "neutral";

const POLITE = /\b(please|thank|thanks|appreciate|kindly|could you|would you|may i)\b/i;
const PUSHY  = /\b(come on|seriously|ridiculous|cmon|give me|must have)\b/i;
const CASUAL = /\b(yo|man|dude|bro|sup|lol|haha)\b/i;

function detectMood(msg: string): Mood {
  if (POLITE.test(msg)) return "polite";
  if (PUSHY.test(msg))  return "pushy";
  if (CASUAL.test(msg)) return "casual";
  return "neutral";
}

export function parseIntent(msg: string): {
  intent: Intent | "walkaway"; qty: number | null; mood: Mood; requestedDiscount?: number;
} {
  const t    = msg.trim();
  const low  = t.toLowerCase();
  const mood = detectMood(low);

  // 1. Walk-away — explicit "no deal", "not interested", etc. — checked FIRST
  if (WALK_AWAY.test(low)) return { intent: "walkaway", qty: null, mood };

  // 2. Discount % request — before qty check
  const discMatch = DISC_REQ.exec(t);
  if (discMatch) {
    const pct = parseInt(discMatch[1], 10);
    return { intent: "reject", qty: null, mood, requestedDiscount: pct };
  }

  // 3. Greeting
  if (GREETING.test(low)) return { intent: "greeting", qty: null, mood };

  // 4. Reject — before accept (catches "no" phrases)
  if (REJECT.test(low)) return { intent: "reject", qty: null, mood };

  // 5. Accept
  if (ACCEPT.test(low)) return { intent: "accept", qty: null, mood };

  // 6. Quantity
  const m = QTY_RE.exec(t);
  if (m) return { intent: "qty", qty: parseInt(m[1], 10), mood };

  return { intent: "unrecognized", qty: null, mood };
}

// ─── Discount calculation ─────────────────────────────────────────────────────

export function discountForQty(qty: number, rule: ProductRule): number {
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

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ─── Response bank ────────────────────────────────────────────────────────────

interface Ctx {
  qty?: number; discount?: number; prevQty?: number; prevDiscount?: number;
  mood?: Mood; round?: number; maxRounds?: number;
  qtyIncrease?: number; discountIncrease?: number;
}

type RFn = (c: Ctx) => string;

class ResponseBank {
  private banks: Record<string, RFn[]> = {};

  add(key: string, ...fns: RFn[]) {
    if (!this.banks[key]) this.banks[key] = [];
    this.banks[key].push(...fns);
  }

  pick(key: string, ctx: Ctx, usedIds: string[]): string {
    const list = this.banks[key];
    if (!list || list.length === 0) return "";
    const avail = list.map((fn, i) => ({ fn, id: `${key}-${i}` }))
                      .filter(r => !usedIds.includes(r.id));
    const pool = avail.length > 0 ? avail : list.map((fn, i) => ({ fn, id: `${key}-${i}` }));
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return chosen.fn(ctx);
  }

  // BUG-1 FIX: return the actual chosen ID so callers can store it for deduplication
  pickWithId(key: string, ctx: Ctx, usedIds: string[]): { text: string; id: string } {
    const list = this.banks[key];
    if (!list || list.length === 0) return { text: "", id: "" };
    const avail = list.map((fn, i) => ({ fn, id: `${key}-${i}` }))
                      .filter(r => !usedIds.includes(r.id));
    const pool = avail.length > 0 ? avail : list.map((fn, i) => ({ fn, id: `${key}-${i}` }));
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return { text: chosen.fn(ctx), id: chosen.id };
  }
}

// ─── Response banks ───────────────────────────────────────────────────────────

const friendly     = new ResponseBank();
const professional = new ResponseBank();
const enthusiastic = new ResponseBank();

/* ── FRIENDLY ─────────────────────────────────────────────────────────────── */

friendly.add("greeting",
  () => "Hey there! 👋 Tell me how many units you want and I'll find you a sweet deal!",
  () => "Hi! Ready to save big? Drop a quantity and let's make it happen! 🤝",
  () => "Welcome! I'm your personal deal-maker. What quantity are we talking about? 😊",
  () => "Hey! Let's negotiate something awesome. How many units? 🎯",
  () => "Hi there! Bulk orders mean better prices. What's your quantity? 💪",
  () => "Hey! No cap — drop your number and let's make it happen. 🔥",
);

friendly.add("belowMin",
  (c) => `Oops! Need at least ${c.qty} units to start bargaining. Can you do that? 😊`,
  (c) => `Hey, minimum is ${c.qty} units for deals. Think you can bump it up? 🙏`,
  (c) => `Almost! I need ${c.qty}+ units to work with. Can you meet that?`,
);

friendly.add("belowTrigger",
  (c) => `So close! Deals start at ${c.qty} units. Go for it and I'll make it worth your while! 🙌`,
  (c) => `Nice try! But I can only negotiate on ${c.qty}+ units. Can you match that? 💪`,
  (c) => `Volume pricing kicks in at ${c.qty} units. Get there and watch the savings roll in! 🎉`,
);

friendly.add("firstOffer",
  (c) => `Alright! ${c.qty} units? I can do ${c.discount}% off right now 🤝 What do you say?`,
  (c) => `Nice! For ${c.qty} units I'll give you ${c.discount}% off. Pretty good, right? 😄`,
  (c) => `${c.qty} units gets you ${c.discount}% discount. That's my opening offer! Deal?`,
  (c) => `Okay! ${c.discount}% off ${c.qty} units — starting strong! Want to take it? 💰`,
);

friendly.add("qtyIncrease",
  (c) => `Ooh smart move! Going from ${c.prevQty} to ${c.qty} units bumps you to ${c.discount}% off! 🎯`,
  (c) => `Love it! More units = better deal. ${c.qty} units gets you ${c.discount}% off now! 🚀`,
  (c) => `YES! You jumped to ${c.qty} units! That earns you ${c.discount}% off. Much better! 💪`,
  (c) => `Now we're talking! ${c.qty} units unlocks ${c.discount}% off. You're catching on! 😊`,
  (c) => `Nice! Adding ${c.qtyIncrease} more units boosted you to ${c.discount}% off! 🔥`,
);

friendly.add("counterOffer",
  (c) => `Not enough? Alright, I'll bump it to ${c.discount}% off. How's that? 😊`,
  (c) => `Fair enough! Let's try ${c.discount}%. Better? 💪`,
  (c) => `You drive a tough bargain! ${c.discount}% off — can we call it a deal? 🤝`,
  (c) => `Okay okay, ${c.discount}%! I'm pushing it for you here 😄`,
  (c) => `Alright, you got me — ${c.discount}% discount. That work for you? 🙏`,
);

friendly.add("politeReject",
  (c) => `I appreciate the courtesy! Let me stretch to ${c.discount}% for you 😊`,
  (c) => `Your politeness deserves a better deal — how about ${c.discount}%? 🤝`,
);

friendly.add("pushyReject",
  (c) => `Whoa, easy there! ${c.discount}% is as far as I can push it 😅`,
  (c) => `Alright alright! ${c.discount}% — but that's seriously my best! 💪`,
);

friendly.add("finalOffer",
  (c) => `This is it — I've hit my limit. ${c.discount}% off ${c.qty} units, final offer! 🎯`,
  (c) => `Last call: ${c.discount}% off ${c.qty} units. I genuinely can't go further. Deal?`,
  (c) => `You squeezed every drop out of me! ${c.discount}% for ${c.qty} units — that's all I've got! 😅`,
  (c) => `Maxed out! ${c.discount}% on ${c.qty} units. Take it or leave it (please take it!) 🙏`,
  (c) => `Okay I talked to my manager and ${c.discount}% is our absolute ceiling. Deal? 😬`,
  (c) => `I literally cannot go higher than ${c.discount}%. ${c.qty} units at ${c.discount}% — final answer! 🙌`,
);

/* After max rounds — customer keeps pushing. Vary the pushback dramatically */
friendly.add("beyondMax",
  (c) => `I already gave you my best — ${c.discount}% for ${c.qty} units. Still on the table! 😅`,
  (c) => `Come on, ${c.discount}% is a great deal! I can't move from here. Yes or no? 🤝`,
  (c) => `You're a tough one! But ${c.discount}% is seriously the floor. Want it or not? 😄`,
  (c) => `Haha you're persistent! I respect it. But ${c.discount}% is locked in — take it! 💪`,
  (c) => `My hands are tied at ${c.discount}%! Grab it before I change my mind (just kidding, I can't) 😂`,
  (c) => `Okay, let me be real with you — ${c.discount}% is genuinely the max. Deal? 🙏`,
  (c) => `${c.discount}% is my final offer and it's still standing! Clock's ticking... ⏰`,
  (c) => `I admire the hustle! But ${c.discount}% is it. Won't budge. Deal or no deal? 🎯`,
  (c) => `You've negotiated hard and ${c.discount}% is your reward — best I can do! 🏆`,
  (c) => `Still here? That tells me you want this deal. ${c.discount}% is yours — just say yes! 😊`,
);

friendly.add("discountRequest",
  (c) => `Ha! I like your style asking for ${c.discount}% upfront! 😄 But first — how many units do you want?`,
  (c) => `${c.discount}%? Bold move! 💪 Tell me how many units first and I'll see what I can do!`,
  (c) => `Love the confidence! But discounts depend on quantity. How many units are you buying? 🤔`,
  (c) => `Straight shooter, I see! ${c.discount}% depends on quantity though. How many? 😊`,
);

friendly.add("tooHighDiscount",
  (c) => `Whoa! ${c.discount}% is way above my limit. My max is ${c.prevDiscount}% — want to take it? 😅`,
  (c) => `I wish I could do ${c.discount}%! But ${c.prevDiscount}% is absolutely my ceiling. Deal? 🙏`,
);

friendly.add("accept",
  (c) => `Awesome! 🎉 ${c.discount}% off ${c.qty} units — deal locked! Getting your code...`,
  (c) => `YES!! You got ${c.discount}% off ${c.qty} units! Smart shopping! 🎊`,
  (c) => `Deal sealed! ${c.qty} units at ${c.discount}% off. You nailed it! 💰`,
  (c) => `Perfect! ${c.discount}% discount on ${c.qty} units. Your code is coming right up! 🚀`,
);

/* ── PROFESSIONAL ─────────────────────────────────────────────────────────── */

professional.add("greeting",
  () => "Welcome. Please specify your desired quantity for pricing.",
  () => "Good day. Kindly provide the quantity you wish to purchase.",
  () => "Please indicate your order quantity to proceed with negotiations.",
);
professional.add("belowMin",
  (c) => `Minimum order quantity is ${c.qty} units. Please revise.`,
);
professional.add("belowTrigger",
  (c) => `Volume pricing applies from ${c.qty} units. Please confirm if achievable.`,
);
professional.add("firstOffer",
  (c) => `For ${c.qty} units, I can offer ${c.discount}% discount. Acceptable?`,
  (c) => `An order of ${c.qty} units qualifies for ${c.discount}% reduction.`,
  (c) => `I propose ${c.discount}% off for your ${c.qty}-unit order.`,
);
professional.add("qtyIncrease",
  (c) => `Your increased order of ${c.qty} units allows ${c.discount}% discount.`,
  (c) => `${c.qty} units qualifies for an improved ${c.discount}% reduction.`,
);
professional.add("counterOffer",
  (c) => `I can revise to ${c.discount}%. Please advise if acceptable.`,
  (c) => `Revised offer: ${c.discount}% discount. Shall we proceed?`,
);
professional.add("finalOffer",
  (c) => `Final offer: ${c.discount}% on ${c.qty} units. I cannot reduce further.`,
  (c) => `Maximum concession: ${c.discount}% for ${c.qty} units.`,
  (c) => `This is my ceiling — ${c.discount}% on ${c.qty} units. Do you accept?`,
  (c) => `I've reached my limit at ${c.discount}%. Please advise if you wish to proceed.`,
);
professional.add("beyondMax",
  (c) => `My position remains at ${c.discount}%. This offer stands.`,
  (c) => `${c.discount}% is confirmed as my maximum. Do you accept or decline?`,
  (c) => `I cannot deviate from ${c.discount}%. Please make a decision.`,
  (c) => `The offer of ${c.discount}% for ${c.qty} units remains open. Your decision?`,
  (c) => `Reiterating: ${c.discount}% is the final figure. No further movement is possible.`,
);
professional.add("discountRequest",
  (c) => `You have requested ${c.discount}% discount. Please provide quantity first.`,
  (c) => `${c.discount}% is noted. I require quantity to proceed.`,
);
professional.add("tooHighDiscount",
  (c) => `${c.discount}% exceeds my limit. Maximum available: ${c.prevDiscount}%.`,
);
professional.add("accept",
  (c) => `Confirmed. ${c.discount}% discount on ${c.qty} units. Generating code.`,
  (c) => `Transaction agreed. ${c.qty} units at ${c.discount}% off. Code incoming.`,
);

/* ── ENTHUSIASTIC ─────────────────────────────────────────────────────────── */

enthusiastic.add("greeting",
  () => "OH HEY! 🔥 Ready to score an INSANE deal?! Tell me your quantity!",
  () => "WELCOME!! 🎉 You want deals? I've GOT deals! What's your quantity?!",
  () => "YO!! 🙌 Let's make some MAGIC happen! How many units?!",
);
enthusiastic.add("belowMin",
  (c) => `Whoa! Need at least ${c.qty} units! You've got this! 💪`,
);
enthusiastic.add("belowTrigger",
  (c) => `SO CLOSE! Get to ${c.qty} units and I'll blow your mind! 🤯`,
);
enthusiastic.add("firstOffer",
  (c) => `BOOM! ${c.qty} units = ${c.discount}% OFF!! MASSIVE! 🔥`,
  (c) => `OH WOW! ${c.discount}% on ${c.qty} units! This is FIRE! 🎯`,
  (c) => `YES! ${c.qty} units gets you ${c.discount}% off! INCREDIBLE! 💥`,
);
enthusiastic.add("qtyIncrease",
  (c) => `SMART MOVE!! ${c.qty} units UNLOCKS ${c.discount}% off! You're CRUSHING this! 🌟`,
  (c) => `WOAH!! ${c.qty} units?! That's ${c.discount}% OFF baby!! 💪`,
  (c) => `YOU LEGEND! ${c.qty} units earns ${c.discount}%! THAT'S what I'm talking about! 🚀`,
);
enthusiastic.add("counterOffer",
  (c) => `FINE! You got me! ${c.discount}%!! Happy NOW?! (I hope so!) 😄`,
  (c) => `OKAY OKAY! ${c.discount}%! You're a MASTER negotiator! 🎯`,
  (c) => `ALRIGHT! ${c.discount}%! You EARN this! 💪`,
);
enthusiastic.add("finalOffer",
  (c) => `EVERYTHING I'VE GOT! ${c.discount}% off ${c.qty} units! ABSOLUTE MAX!! 🔥`,
  (c) => `YOU WIN! ${c.discount}% for ${c.qty} units — FINAL ANSWER!! TAKE IT!! 🎯`,
  (c) => `I'M TAPPED OUT!! ${c.discount}% is ALL I HAVE! This is it!! 💥`,
  (c) => `MAXIMUM REACHED! ${c.discount}% off ${c.qty} units — MY BOSS WILL KILL ME!! 😅`,
);
enthusiastic.add("beyondMax",
  (c) => `STILL GOING?! I respect it!! But ${c.discount}% IS IT — FINAL!! 🔥`,
  (c) => `YOU'RE RELENTLESS!! I love it! But ${c.discount}% won't budge. DEAL?! 💪`,
  (c) => `OH COME ON!! ${c.discount}% is INCREDIBLE! Just SAY YES!! 🎉`,
  (c) => `OKAY OKAY I hear you but ${c.discount}% is literally my max! TAKE IT!! 🙌`,
  (c) => `${c.discount}%!! It's STILL there waiting for you!! Don't let it slip!! ⏰`,
  (c) => `You've been fighting hard — I respect the hustle! ${c.discount}% is your PRIZE!! 🏆`,
  (c) => `SERIOUSLY ${c.discount}% is AMAZING and it's YOURS!! Why are you waiting?! 😄`,
);
enthusiastic.add("discountRequest",
  (c) => `${c.discount}%?! I LOVE the ambition!! 🔥 But HOW MANY UNITS FIRST?! Let's GO!`,
  (c) => `STRAIGHT to ${c.discount}%! Guts!! 💪 Now tell me QUANTITY and let's MAKE MAGIC!`,
);
enthusiastic.add("tooHighDiscount",
  (c) => `${c.discount}%?! OH I WISH!! But ${c.prevDiscount}% is my MAX! Still AMAZING! 🎯`,
);
enthusiastic.add("accept",
  (c) => `WOO HOO!! 🎉🎉 ${c.discount}% off ${c.qty} units! LEGEND!! Code coming NOW!!`,
  (c) => `YES YES YES!!! 🥳 ${c.qty} units at ${c.discount}% off! BEST deal EVER!! 🚀`,
);

// ─── Selector ─────────────────────────────────────────────────────────────────

const banks: Record<Tone, ResponseBank> = { friendly, professional, enthusiastic };

function respond(tone: Tone, key: string, ctx: Ctx, usedIds: string[]): string {
  return banks[tone]?.pick(key, ctx, usedIds)
    || banks.friendly.pick(key, ctx, usedIds)
    || banks.friendly.pick("beyondMax", ctx, usedIds)
    || "";
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function processMessage(
  message: string,
  rule: ProductRule,
  session: SessionState,
  tone: Tone = "friendly",
): EngineResult {
  const { intent, qty: parsedQty, mood, requestedDiscount } = parseIntent(message);
  const sessionUpdate: Partial<SessionState> = {};
  const usedIds = session.usedResponseIds || [];
  let response = "";
  let dealClosed = false;
  let sessionExpired = false;

  /* ── Walk Away ────────────────────────────────────────────────────────── */
  if (intent === "walkaway") {
    const walkAwayResponses: Record<Tone, string[]> = {
      friendly: [
        "No worries! The deal will be here if you change your mind. Come back anytime! 👋",
        "Fair enough! No pressure at all. See you next time! 😊",
        "Totally fine! If you ever want to negotiate, just click the chat button. Take care! 🤝",
        "Got it — no deal this time! Door's always open if you reconsider. 👋",
      ],
      professional: [
        "Understood. This session has been closed. Thank you for your time.",
        "Noted. The offer is withdrawn. Feel free to return if you wish to negotiate.",
        "Session closed. No obligation — please return if your requirements change.",
      ],
      enthusiastic: [
        "Aww no?! Okay, no worries!! Come back anytime — deals are ALWAYS waiting!! 🔥",
        "We'll miss you!! 😢 But the deal will be RIGHT HERE if you change your mind!!",
        "Your loss!! (jk 😄) Come back soon — I've got deals ALL DAY!! 💪",
      ],
    };
    const pool = walkAwayResponses[tone] ?? walkAwayResponses.friendly;
    response = pool[Math.floor(Math.random() * pool.length)];
    sessionUpdate.status = "expired";
    sessionExpired = true;
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  /* ── Greeting ────────────────────────────────────────────────────────── */
  if (intent === "greeting") {
    response = respond(tone, "greeting", {}, usedIds);
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  /* ── Unrecognized ────────────────────────────────────────────────────── */
  if (intent === "unrecognized") {
    response = "Hmm, I didn't quite catch that. Just tell me how many units you'd like! 😊";
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  /* ── Quantity ────────────────────────────────────────────────────────── */
  if (intent === "qty" && parsedQty !== null) {
    const qty = parsedQty;

    if (qty < rule.minQuantity) {
      return { response: respond(tone, "belowMin", { qty: rule.minQuantity }, usedIds), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }
    if (qty < rule.triggerQuantity) {
      return { response: respond(tone, "belowTrigger", { qty: rule.triggerQuantity }, usedIds), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    const discount    = discountForQty(qty, rule);
    const prevQty     = session.agreedQty || session.lastQty || 0;
    const prevDisc    = session.currentDiscount || 0;
    const round       = session.currentRound + 1;
    const isIncrease  = qty > prevQty && prevQty > 0;

    sessionUpdate.currentRound    = round;
    sessionUpdate.currentDiscount = discount;
    sessionUpdate.agreedQty       = qty;
    sessionUpdate.lastQty         = prevQty;

    const ctx: Ctx = { qty, discount, prevQty, prevDiscount: prevDisc, round, maxRounds: rule.maxRounds, qtyIncrease: qty - prevQty };

    let category = "firstOffer";
    // BUG-2 FIX: check isIncrease BEFORE finalOffer so customer gets positive acknowledgement
    if (isIncrease) {
      category = "qtyIncrease";
    } else if (round >= rule.maxRounds || discount >= rule.maxDiscount) {
      category = "finalOffer";
    }
    response = respond(tone, category, ctx, usedIds);
    sessionUpdate.usedResponseIds = [...usedIds, `${category}-${Math.random()}`];
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  /* ── Accept ──────────────────────────────────────────────────────────── */
  if (intent === "accept") {
    const qty      = session.agreedQty;
    const discount = session.currentDiscount;
    if (!qty || !discount) {
      return { response: respond(tone, "greeting", {}, usedIds), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }
    const validDiscount = clamp(discount, 0, rule.maxDiscount);
    sessionUpdate.status        = "closed";
    sessionUpdate.agreedQty     = qty;
    sessionUpdate.agreedDiscount = validDiscount;
    dealClosed = true;
    response = respond(tone, "accept", { qty, discount: validDiscount }, usedIds); sessionUpdate.usedResponseIds = [...usedIds, "accept"];
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  /* ── Reject / discount request ───────────────────────────────────────── */
  if (intent === "reject") {
    // Customer asked for a specific discount %
    if (requestedDiscount !== undefined) {
      const qty = session.agreedQty;

      // No qty yet — ask for it first
      if (!qty) {
        return { response: respond(tone, "discountRequest", { discount: requestedDiscount }, usedIds), intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
      }

      const currentDisc = session.currentDiscount;
      const round       = session.currentRound + 1;
      const alreadyAtMax = currentDisc >= rule.maxDiscount;

      // If already at max, use beyondMax pool — don't reveal max again with same text
      if (alreadyAtMax) {
        sessionUpdate.currentRound = round;
        sessionUpdate.currentDiscount = rule.maxDiscount;
        sessionUpdate.usedResponseIds = [...usedIds, `beyondMax-${Math.random()}`];
        response = respond(tone, "beyondMax", { qty, discount: rule.maxDiscount, round, maxRounds: rule.maxRounds, mood }, usedIds);
        return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
      }

      // How much can we move this round? Only one concessionStep at a time.
      const nextDisc = clamp(currentDisc + rule.concessionStep, 0, rule.maxDiscount);
      const isFinal  = round >= rule.maxRounds || nextDisc >= rule.maxDiscount;

      sessionUpdate.currentRound    = round;
      sessionUpdate.currentDiscount = nextDisc;
      sessionUpdate.usedResponseIds = [...usedIds, `discount-req-${Math.random()}`];

      if (requestedDiscount <= nextDisc) {
        // Their request is within reach this round — grant it and be enthusiastic
        sessionUpdate.currentDiscount = Math.min(requestedDiscount, rule.maxDiscount);
        const ctx: Ctx = { qty, discount: sessionUpdate.currentDiscount, prevDiscount: currentDisc, round, maxRounds: rule.maxRounds, mood };
        response = respond(tone, isFinal ? "finalOffer" : "counterOffer", ctx, usedIds);
      } else if (requestedDiscount > rule.maxDiscount) {
        // Way too high — push back firmly but only offer concessionStep more
        const ctx: Ctx = { qty, discount: nextDisc, prevDiscount: currentDisc, round, maxRounds: rule.maxRounds, mood };
        // Build a custom "you're asking too much but here's a little more" response
        const pushbackResponses: Record<Tone, string[]> = {
          friendly: [
            `${requestedDiscount}%? Ha, I wish! 😅 Best I can do right now is ${nextDisc}% for ${qty} units. Take it?`,
            `Whoa, ${requestedDiscount}% is way out of my range! How about ${nextDisc}% — that's a real offer! 💪`,
            `I'd love to do ${requestedDiscount}%! But my manager would fire me 😄 I can stretch to ${nextDisc}%. Deal?`,
          ],
          professional: [
            `${requestedDiscount}% is not feasible. I can offer ${nextDisc}% at this stage.`,
            `That figure exceeds my limit. Current revised offer: ${nextDisc}% on ${qty} units.`,
          ],
          enthusiastic: [
            `${requestedDiscount}%?! LOVE THE AMBITION but NO WAY!! Here's ${nextDisc}% though — STILL AMAZING!! 🔥`,
            `HAHA! ${requestedDiscount}% is a DREAM! But ${nextDisc}% OFF is REAL and it's yours NOW! 💪`,
          ],
        };
        const pool = pushbackResponses[tone] || pushbackResponses.friendly;
        response = pool[Math.floor(Math.random() * pool.length)];
        if (isFinal) {
          sessionUpdate.currentDiscount = rule.maxDiscount;
          response = respond(tone, "finalOffer", { qty, discount: rule.maxDiscount, round, maxRounds: rule.maxRounds }, usedIds);
        }
      } else {
        // They asked for more than current but it's within max — offer the next step, not their full ask
        const ctx: Ctx = { qty, discount: nextDisc, prevDiscount: currentDisc, round, maxRounds: rule.maxRounds, mood };
        const negotiateResponses: Record<Tone, string[]> = {
          friendly: [
            `${requestedDiscount}%? I can't jump that far in one go! Meet me at ${nextDisc}% for now? 🤝`,
            `Nice try asking for ${requestedDiscount}%! I'll move to ${nextDisc}% — let's keep talking! 😄`,
            `I hear you — ${requestedDiscount}% would be great! But ${nextDisc}% is my next step. Deal?`,
          ],
          professional: [
            `${requestedDiscount}% is not achievable at once. Moving to ${nextDisc}% — shall we continue?`,
            `I can advance to ${nextDisc}% from ${currentDisc}%. Further negotiation is possible.`,
          ],
          enthusiastic: [
            `${requestedDiscount}% in ONE SHOT?! Slow down! I'll move to ${nextDisc}% — keep pushing! 🔥`,
            `BOLD ask! I'm at ${nextDisc}% now — let's KEEP GOING and see where we land! 💪`,
          ],
        };
        const pool = negotiateResponses[tone] || negotiateResponses.friendly;
        response = pool[Math.floor(Math.random() * pool.length)];
        if (isFinal) response = respond(tone, "finalOffer", ctx, usedIds);
      }

      return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
    }

    // ── Plain rejection (no specific % asked) — standard concession step ──
    const qty     = session.agreedQty ?? rule.triggerQuantity;
    const round   = session.currentRound + 1;
    const alreadyAtMax = session.currentDiscount >= rule.maxDiscount;
    const newDisc = alreadyAtMax
      ? rule.maxDiscount
      : clamp(session.currentDiscount + rule.concessionStep, 0, rule.maxDiscount);

    // If customer has been past max rounds for 3+ extra rounds, auto-close gracefully
    const extraRounds = round - rule.maxRounds;
    if (extraRounds >= 3 && alreadyAtMax) {
      const timeoutResponses: Record<Tone, string> = {
        friendly:     "I can see we're not going to find a middle ground today. No worries — come back anytime! 👋",
        professional: "We have been unable to reach an agreement. This session is now closed. Thank you.",
        enthusiastic: "Okay I've tried EVERYTHING!! Come back when you're ready — the door is ALWAYS open!! 👋🔥",
      };
      sessionUpdate.status = "expired";
      sessionExpired = true;
      return {
        response: timeoutResponses[tone] ?? timeoutResponses.friendly,
        intent, parsedQty, sessionUpdate, dealClosed, sessionExpired,
      };
    }

    const pastMaxRounds = round > rule.maxRounds;
    sessionUpdate.currentRound    = round;
    sessionUpdate.currentDiscount = newDisc;

    const ctx: Ctx = { qty, discount: newDisc, prevDiscount: session.currentDiscount, round, maxRounds: rule.maxRounds, mood };

    let category: string;
    if (pastMaxRounds || alreadyAtMax) {
      // Keep them at max but vary the response every time using beyondMax pool
      category = "beyondMax";
    } else if (newDisc >= rule.maxDiscount || round >= rule.maxRounds) {
      category = "finalOffer";
    } else if (mood === "polite") {
      category = "politeReject";
    } else if (mood === "pushy") {
      category = "pushyReject";
    } else {
      category = "counterOffer";
    }

    response = respond(tone, category, ctx, usedIds);
    sessionUpdate.usedResponseIds = [...usedIds, `${category}-${Math.random()}`];
    return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
  }

  response = "I didn't quite understand. Try telling me a quantity! 😊";
  return { response, intent, parsedQty, sessionUpdate, dealClosed, sessionExpired };
}





