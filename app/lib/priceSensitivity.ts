/**
 * BargainBot — Price Sensitivity Prediction
 *
 * Scores each customer's price sensitivity (0–100) after every message
 * based on behavioral signals, then adjusts the negotiation strategy:
 *
 *   Score 0–30  (LOW)    → Customer isn't very price-driven. Hold firm.
 *                           Smaller concession steps, fewer extra rounds.
 *
 *   Score 31–60 (MEDIUM) → Normal negotiation. Use base rule settings.
 *
 *   Score 61–100 (HIGH)  → Customer is very price-conscious. Be generous.
 *                           Larger concession steps, more patience.
 *
 * Signals used:
 *   1. Rejection count     — more rejections = higher sensitivity
 *   2. Highest % asked     — asking for 40%+ = high sensitivity
 *   3. Response speed      — fast replies = engaged/motivated buyer
 *   4. Quantity commitment — increasing qty = lower sensitivity (committed)
 *   5. Round depth         — reaching many rounds = high sensitivity
 */

export type SensitivityLabel = "low" | "medium" | "high";

export interface SensitivityInput {
  rejectionCount:    number;   // total rejections so far
  highDiscountAsked: number;   // highest % the customer explicitly asked for (0 if never)
  currentRound:      number;   // how many rounds have passed
  maxRounds:         number;   // rule's max rounds
  maxDiscount:       number;   // rule's max discount
  qtyIncreased:      boolean;  // did customer increase qty this message?
  responseTimeMs:    number;   // ms between customer's last two messages (0 = unknown)
}

export interface SensitivityResult {
  score:             number;          // 0–100
  label:             SensitivityLabel;
  adjustedConcessionStep: number;     // modified from base step
  adjustedMaxRounds:      number;     // modified from base maxRounds
  insight:           string;          // human-readable merchant insight
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function calculateSensitivity(
  input: SensitivityInput,
  baseStep: number,
): SensitivityResult {
  let score = 50; // start neutral

  // ── Signal 1: Rejection count (0–25 pts) ─────────────────────────────────
  // More rejections = more price-sensitive
  const rejectionScore = Math.min(input.rejectionCount * 8, 25);
  score += rejectionScore;

  // ── Signal 2: Highest discount requested (0–30 pts) ──────────────────────
  // Asking for ≥ maxDiscount = max sensitivity
  // Asking for nothing = neutral (0)
  if (input.highDiscountAsked > 0) {
    const discRatio = Math.min(input.highDiscountAsked / Math.max(input.maxDiscount, 1), 1);
    const discScore = discRatio * 30;
    score += discScore;
  } else {
    // Never asked for a specific % — slightly less sensitive
    score -= 5;
  }

  // ── Signal 3: Round depth (0–20 pts) ─────────────────────────────────────
  // Deep into rounds = persistent = price-sensitive
  const roundRatio  = Math.min(input.currentRound / Math.max(input.maxRounds, 1), 1);
  const roundScore  = roundRatio * 20;
  score += roundScore;

  // ── Signal 4: Quantity commitment (-15 pts if increased) ─────────────────
  // Increasing quantity shows commitment beyond price — lower sensitivity
  if (input.qtyIncreased) {
    score -= 15;
  }

  // ── Signal 5: Response speed (±10 pts) ───────────────────────────────────
  // Fast replies (< 5s) = highly engaged, likely price-sensitive
  // Very slow replies (> 60s) = just browsing, less sensitive
  if (input.responseTimeMs > 0) {
    if (input.responseTimeMs < 5_000) {
      score += 10; // very fast = motivated/anxious about price
    } else if (input.responseTimeMs > 60_000) {
      score -= 10; // very slow = casual, not price-driven
    }
  }

  // Clamp to 0–100
  score = Math.round(Math.max(0, Math.min(100, score)));

  // ── Label ─────────────────────────────────────────────────────────────────
  const label: SensitivityLabel =
    score <= 30 ? "low" :
    score <= 60 ? "medium" : "high";

  // ── Adjust negotiation strategy ───────────────────────────────────────────
  let adjustedConcessionStep = baseStep;
  let adjustedMaxRounds      = input.maxRounds;

  if (label === "high") {
    // Price-sensitive: be more generous — bigger steps, more rounds
    adjustedConcessionStep = parseFloat((baseStep * 1.5).toFixed(1));
    adjustedMaxRounds      = input.maxRounds + 2;
  } else if (label === "low") {
    // Not price-sensitive: hold firm — smaller steps, fewer extra rounds
    adjustedConcessionStep = parseFloat((baseStep * 0.6).toFixed(1));
    adjustedMaxRounds      = Math.max(input.maxRounds - 1, 2);
  }
  // medium: use base values as-is

  // ── Merchant insight ──────────────────────────────────────────────────────
  const insight = buildInsight(label, score, input);

  return { score, label, adjustedConcessionStep, adjustedMaxRounds, insight };
}

function buildInsight(
  label: SensitivityLabel,
  score: number,
  input: SensitivityInput,
): string {
  const reasons: string[] = [];

  if (input.rejectionCount >= 3)    reasons.push(`rejected ${input.rejectionCount} offers`);
  if (input.highDiscountAsked > 0)  reasons.push(`asked for up to ${input.highDiscountAsked}% off`);
  if (input.qtyIncreased)           reasons.push("increased quantity (committed buyer)");
  if (input.responseTimeMs < 5_000 && input.responseTimeMs > 0)
                                    reasons.push("responding very quickly");
  if (input.responseTimeMs > 60_000) reasons.push("slow responses (browsing)");

  const labelMap: Record<SensitivityLabel, string> = {
    low:    "Low price sensitivity",
    medium: "Medium price sensitivity",
    high:   "High price sensitivity",
  };

  const base = `${labelMap[label]} (score: ${score}/100)`;
  return reasons.length > 0
    ? `${base} — ${reasons.join(", ")}.`
    : base + ".";
}

// ─── Label helpers ────────────────────────────────────────────────────────────

export function sensitivityLabel(score: number): SensitivityLabel {
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  return "high";
}

export function sensitivityEmoji(label: SensitivityLabel): string {
  return { low: "🟢", medium: "🟡", high: "🔴" }[label];
}

export function sensitivityDescription(label: SensitivityLabel): string {
  return {
    low:    "Not very price-driven. Holds firm on fewer concessions.",
    medium: "Normal buyer. Standard negotiation pace.",
    high:   "Very price-conscious. Responds well to larger concessions.",
  }[label];
}
