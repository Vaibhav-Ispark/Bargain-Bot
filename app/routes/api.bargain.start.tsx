/**
 * POST /api/bargain/start
 *
 * Public endpoint. Creates a new bargain session and returns the greeting.
 *
 * Body: { shop: string; productId: string; customerId?: string }
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";

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
    const body = await request.json() as {
      shop: string;
      productId: string;
      customerId?: string;
      customerEmail?: string;
    };
    const { shop, productId, customerId, customerEmail } = body;

    if (!shop || !productId) {
      return Response.json(
        { error: "shop and productId are required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const [rule, settings] = await Promise.all([
      db.productRule.findUnique({
        where: { shop_productId: { shop, productId } },
      }),
      db.widgetSettings.findUnique({ where: { shop } }),
    ]);

    if (!rule || !rule.enabled) {
      return Response.json(
        { error: "Bargaining not available for this product" },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    const greeting =
      settings?.greeting ??
      "Hey! Want to make a deal? Tell me how many you'd like and we'll see what we can do 🤝";

    const initialTranscript = JSON.stringify([
      { role: "bot", text: greeting, ts: new Date().toISOString() },
    ]);

    const session = await db.bargainSession.create({
      data: {
        shop,
        productRuleId: rule.id,
        customerId:    customerId ?? null,
        customerEmail: customerEmail ? customerEmail.trim().toLowerCase() : null,
        status:        "active",
        currentRound:  0,
        currentDiscount: 0,
        transcript:    initialTranscript,
      },
    });

    return Response.json(
      {
        sessionId:     session.id,
        greeting,
        needsEmail:    false,  // email already provided
      },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err) {
    console.error("[bargain/start]", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
};
