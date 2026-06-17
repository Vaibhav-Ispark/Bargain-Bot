/**
 * App Proxy handler
 *
 * Shopify proxies requests from:
 *   https://{shop}.myshopify.com/apps/bargainbot?bb_route=...
 *
 * All BargainBot widget routes are public (no auth needed beyond shop verification).
 * We skip HMAC verification for widget routes since they handle their own validation
 * (session IDs, shop field in body, etc.)
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { action as widgetConfig } from "./api.widget.config";
import { action as bargainStart }   from "./api.bargain.start";
import { action as bargainEmail }   from "./api.bargain.email";
import { action as bargainMessage } from "./api.bargain.message";
import { action as bargainClose }   from "./api.bargain.close";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";
  // Respond to preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return Response.json({ ok: true }, { headers: corsHeaders(origin) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url   = new URL(request.url);
  const route = url.searchParams.get("bb_route") || "";

  // Shop can come from query params (Shopify injects it) or request body
  const shopFromProxy = url.searchParams.get("shop") || "";
  let body: Record<string, unknown> = {};
  try {
    body = await request.clone().json();
  } catch { /* non-JSON body */ }

  // Inject shop from proxy params if not in body
  if (shopFromProxy && !body.shop) {
    body.shop = shopFromProxy;
  }

  const enrichedRequest = new Request(request.url, {
    method:  request.method,
    headers: new Headers({ "Content-Type": "application/json" }),
    body:    JSON.stringify(body),
  });

  const ctx = { request: enrichedRequest, params: {}, context: {} } as ActionFunctionArgs;

  if (route === "widget/config")   return widgetConfig(ctx);
  if (route === "bargain/start")   return bargainStart(ctx);
  if (route === "bargain/email")   return bargainEmail(ctx);
  if (route === "bargain/message") return bargainMessage(ctx);
  if (route === "bargain/close")   return bargainClose(ctx);

  return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders(origin) });
};
