/**
 * POST /api/bargain/message
 *
 * Public endpoint. Receives a customer message, runs the bargain engine,
 * updates the session, and returns the bot's response.
 *
 * Body: { sessionId: number; message: string }
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { processMessage, parseIntent, type Tone } from "../lib/bargainEngine";
import { calculateSensitivity } from "../lib/priceSensitivity";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle CORS preflight
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const body = await request.json() as { sessionId: number; message: string };
    const { sessionId, message } = body;

    if (!sessionId || !message?.trim()) {
      return Response.json(
        { error: "sessionId and message are required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Load session + rule + widget settings
    const session = await db.bargainSession.findUnique({
      where: { id: Number(sessionId) },
      include: {
        productRule: { include: { tiers: true } },
      },
    });

    if (!session) {
      return Response.json(
        { error: "Session not found" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    if (session.status !== "active") {
      return Response.json(
        { error: "Session is no longer active", status: session.status },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const rule = session.productRule;

    // Load tone from widget settings
    const widgetSettings = await db.widgetSettings.findUnique({ where: { shop: session.shop } });
    const tone = (widgetSettings?.tone ?? "friendly") as Tone;

    // ── Price Sensitivity Prediction ─────────────────────────────────────────
    // Calculate response time (ms since last message)
    const now = new Date();
    const responseTimeMs = session.lastMsgAt
      ? now.getTime() - new Date(session.lastMsgAt).getTime()
      : 0;

    // Detect if this message increases quantity
    const { qty: parsedQtyCheck } = (() => {
      const QTY_RE = /\b(\d+)\s*(units?|pcs?|pieces?|items?|qty|quantity)?\b/i;
      const m = QTY_RE.exec(message.trim());
      return { qty: m ? parseInt(m[1], 10) : null };
    })();
    const qtyIncreased = parsedQtyCheck !== null
      && session.agreedQty !== null
      && parsedQtyCheck > (session.agreedQty ?? 0);

    // Detect if asking for a specific discount
    const discMatch = /(\d+)\s*%/.exec(message.trim());
    const askedDiscount = discMatch ? parseInt(discMatch[1], 10) : 0;
    const newHighDiscountAsked = Math.max(session.highDiscountAsked ?? 0, askedDiscount);

    // BUG-13 FIX: Use engine intent to count rejections — not a separate regex that double-counts qty messages
    // We need to peek at the intent without running the full engine yet — parse intent first
    const { intent: peekedIntent } = parseIntent(message.trim());
    const isRejection = peekedIntent === "reject" || peekedIntent === "walkaway";
    const newRejectionCount = (session.rejectionCount ?? 0) + (isRejection ? 1 : 0);

    const sensitivity = calculateSensitivity(
      {
        rejectionCount:    newRejectionCount,
        highDiscountAsked: newHighDiscountAsked,
        currentRound:      session.currentRound,
        maxRounds:         rule.maxRounds,
        maxDiscount:       rule.maxDiscount,
        qtyIncreased,
        responseTimeMs,
      },
      rule.concessionStep,
    );

    // Build a sensitivity-adjusted rule for the engine
    const adjustedRule = {
      ...rule,
      tiers: rule.tiers,
      concessionStep: sensitivity.adjustedConcessionStep,
      maxRounds:      sensitivity.adjustedMaxRounds,
    };

    const sessionState = {
      currentRound:    session.currentRound,
      currentDiscount: session.currentDiscount,
      agreedQty:       session.agreedQty,
      agreedDiscount:  session.agreedDiscount,
      status:          session.status as "active" | "closed" | "expired",
      lastQty:         session.lastQty ?? undefined,
      usedResponseIds: session.usedResponseIds ? JSON.parse(session.usedResponseIds) : [],
    };

    const result = processMessage(message.trim(), adjustedRule, sessionState, tone);

    // Append to transcript
    let transcript: { role: string; text: string; ts: string }[] = [];
    try {
      transcript = JSON.parse(session.transcript);
    } catch { /* empty transcript */ }

    transcript.push({ role: "customer", text: message.trim(), ts: new Date().toISOString() });
    transcript.push({ role: "bot", text: result.response, ts: new Date().toISOString() });

    // Build update data — destructure usedResponseIds before spread to avoid type conflict (BUG-15 fix)
    const { usedResponseIds: usedIdsArray, ...restUpdate } = result.sessionUpdate;
    const updateData: Record<string, unknown> = {
      ...restUpdate,
      transcript:         JSON.stringify(transcript),
      updatedAt:          new Date(),
      // Sensitivity fields
      sensitivityScore:   sensitivity.score,
      rejectionCount:     newRejectionCount,
      highDiscountAsked:  newHighDiscountAsked,
      lastMsgAt:          now,
    };
    if (usedIdsArray) {
      updateData.usedResponseIds = JSON.stringify(usedIdsArray);
    }

    if (result.dealClosed) {
      updateData.status = "closed";
    }
    if (result.sessionExpired) {
      updateData.status = "expired";
    }

    await db.bargainSession.update({
      where: { id: session.id },
      data: updateData,
    });

    return Response.json(
      {
        response:       result.response,
        intent:         result.intent,
        dealClosed:     result.dealClosed,
        sessionExpired: result.sessionExpired ?? false,
        sensitivity: {
          score:   sensitivity.score,
          label:   sensitivity.label,
          insight: sensitivity.insight,
        },
        sessionState: {
          currentRound:    result.sessionUpdate.currentRound    ?? session.currentRound,
          currentDiscount: result.sessionUpdate.currentDiscount ?? session.currentDiscount,
          agreedQty:       result.sessionUpdate.agreedQty       ?? session.agreedQty,
          status:          result.dealClosed ? "closed" : result.sessionExpired ? "expired" : "active",
        },
      },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err) {
    console.error("[bargain/message]", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
};
