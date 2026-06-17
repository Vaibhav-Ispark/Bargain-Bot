/**
 * POST /api/widget/config
 * OPTIONS /api/widget/config  (CORS preflight)
 *
 * Public endpoint used by the storefront widget.
 * Returns widget settings and per-product bargaining rules.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle CORS preflight (OPTIONS arrives as a GET/loader in React Router)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  return new Response(null, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  try {
    const body = (await request.json()) as { shop: string; productId: string };
    const { shop, productId } = body;

    if (!shop || !productId) {
      return Response.json(
        { error: "shop and productId are required" },
        { status: 400, headers: cors(origin) }
      );
    }

    const [settings, rule] = await Promise.all([
      db.widgetSettings.findUnique({ where: { shop } }),
      db.productRule.findUnique({
        where: { shop_productId: { shop, productId } },
        include: { tiers: true },
      }),
    ]);

    if (!rule || !rule.enabled) {
      return Response.json({ enabled: false }, { status: 200, headers: cors(origin) });
    }

    return Response.json(
      {
        enabled: true,
        widget: {
          botName:          settings?.botName          ?? "BargainBot",
          primaryColor:     settings?.primaryColor     ?? "#008060",
          tone:             settings?.tone             ?? "friendly",
          position:         settings?.position         ?? "bottom-right",
          greeting:         settings?.greeting         ?? "Hey! Want to make a deal? Tell me how many you'd like 🤝",
          logoUrl:          settings?.logoUrl          ?? "",
          proactiveTrigger: settings?.proactiveTrigger ?? true,
          proactiveDelay:   settings?.proactiveDelay   ?? 30,
          proactiveMessage: settings?.proactiveMessage ?? "Psst — want a deal? 👀",
        },
        rule: {
          minQuantity:     rule.minQuantity,
          triggerQuantity: rule.triggerQuantity,
          openingDiscount: rule.openingDiscount,
          maxDiscount:     rule.maxDiscount,
          concessionStep:  rule.concessionStep,
          maxRounds:       rule.maxRounds,
          dealExpiryMins:  rule.dealExpiryMins,
          tiers: rule.tiers.map((t) => ({ minQty: t.minQty, discount: t.discount })),
        },
      },
      { status: 200, headers: cors(origin) }
    );
  } catch (err) {
    console.error("[widget/config]", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: cors(origin) }
    );
  }
};
