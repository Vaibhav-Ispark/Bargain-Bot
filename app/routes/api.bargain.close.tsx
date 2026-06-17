/**
 * POST /api/bargain/close
 *
 * Public endpoint. Validates the agreed deal, creates a Shopify price rule
 * and one-time discount code, saves a Deal record, and returns the code.
 *
 * Body: { sessionId: number; shop: string }
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
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
    const body = await request.json() as { sessionId: number; shop: string };
    const { sessionId, shop } = body;

    if (!sessionId || !shop) {
      return Response.json(
        { error: "sessionId and shop are required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Load session and validate
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

    if (session.shop !== shop) {
      return Response.json(
        { error: "Forbidden" },
        { status: 403, headers: corsHeaders(origin) }
      );
    }

    if (session.status !== "closed" && session.status !== "active") {
      return Response.json(
        { error: "Session has already expired or been processed" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Check if deal already exists — use transaction to prevent race condition (BUG-16 fix)
    const existingDeal = await db.deal.findUnique({ where: { sessionId: session.id } });
    if (existingDeal) {
      return Response.json(
        { discountCode: existingDeal.discountCode, alreadyExists: true },
        { status: 200, headers: corsHeaders(origin) }
      );
    }

    // Lock the session optimistically to prevent concurrent closes
    const locked = await db.bargainSession.updateMany({
      where: { id: session.id, status: { in: ["active", "closed"] } },
      data: { status: "closing" as any },
    });
    if (locked.count === 0) {
      // Another request already grabbed the lock
      await new Promise(r => setTimeout(r, 300));
      const raceCheck = await db.deal.findUnique({ where: { sessionId: session.id } });
      if (raceCheck) return Response.json({ discountCode: raceCheck.discountCode, alreadyExists: true }, { status: 200, headers: corsHeaders(origin) });
      return Response.json({ error: "Session is being processed" }, { status: 409, headers: corsHeaders(origin) });
    }

    const rule          = session.productRule;
    // Use agreedDiscount if set, otherwise fall back to currentDiscount (first-offer accept)
    const rawDiscount   = session.agreedDiscount ?? session.currentDiscount;
    const customerEmail = session.customerEmail;

    // Use agreedQty, fallback to lastQty
    const qty = session.agreedQty ?? session.lastQty;
    if (!qty || qty < 1) {
      return Response.json(
        { error: "Invalid deal — no quantity agreed. Please negotiate a quantity first." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // Server-side clamp discount
    const validDiscount = Math.min(Math.max(rawDiscount, 0), rule.maxDiscount);
    if (validDiscount <= 0) {
      return Response.json(
        { error: "Invalid deal — no discount agreed. Please complete negotiation first." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const expiresAt = new Date(Date.now() + rule.dealExpiryMins * 60 * 1000);
    const expiresAtISO = expiresAt.toISOString();

    // Get Shopify Admin API access for this shop
    const { admin } = await unauthenticated.admin(shop);

    // Build customer selection — lock to email if we have one
    let customerSelection: Record<string, unknown> = { all: true };
    if (customerEmail) {
      try {
        const customerQuery = await admin.graphql(
          `#graphql
          query getCustomerByEmail($query: String!) {
            customers(first: 1, query: $query) {
              edges { node { id } }
            }
          }`,
          { variables: { query: `email:${customerEmail}` } }
        );
        const customerJson = await customerQuery.json();
        const customerId = customerJson.data?.customers?.edges?.[0]?.node?.id;
        if (customerId) {
          // Lock to specific Shopify customer ID
          customerSelection = {
            customers: { customersToAdd: [customerId] },
          };
        }
        // else fall through to { all: true } with appliesOncePerCustomer
      } catch {
        // If customer lookup fails, fall through to all: true
      }
    }

    // Create discount code via Shopify GraphQL Discounts API
    const discountCode = `BB-${session.id}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const discountResponse = await admin.graphql(
      `#graphql
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) { edges { node { code } } }
              }
            }
          }
          userErrors { field message code }
        }
      }`,
      {
        variables: {
          basicCodeDiscount: {
            title:                  `BargainBot — Session ${session.id}`,
            code:                   discountCode,
            startsAt:               new Date().toISOString(),
            endsAt:                 expiresAtISO,
            usageLimit:             1,
            appliesOncePerCustomer: true,
            customerGets: {
              value:    { percentage: validDiscount / 100 },
              items:    { products: { productsToAdd: [rule.productId] } }, // locked to negotiated product
            },
            customerSelection,
          },
        },
      }
    );

    const discountJson = await discountResponse.json();
    const discountErrors =
      discountJson.data?.discountCodeBasicCreate?.userErrors ?? [];

    if (discountErrors.length > 0) {
      console.error("[bargain/close] discountCodeBasicCreate errors:", JSON.stringify(discountErrors));
      // Return the first user-friendly error message
      const firstMsg = discountErrors[0]?.message ?? "Unknown error";
      return Response.json(
        { error: `Shopify rejected discount: ${firstMsg}` },
        { status: 500, headers: corsHeaders(origin) }
      );
    }

    const discountNodeId =
      discountJson.data?.discountCodeBasicCreate?.codeDiscountNode?.id ?? "";

    // Save Deal to DB
    await db.deal.create({
      data: {
        shop,
        sessionId:     session.id,
        productRuleId: rule.id,
        productId:     rule.productId,
        finalQty:      qty,
        finalDiscount: validDiscount,
        discountCode,
        priceRuleId:   discountNodeId,
        expiresAt,
        converted:     false,
      },
    });

    // Mark session as closed with final values
    await db.bargainSession.update({
      where: { id: session.id },
      data:  { status: "closed", agreedQty: qty, agreedDiscount: validDiscount },
    });

    return Response.json(
      {
        discountCode,
        finalQty:      qty,
        finalDiscount: validDiscount,
        expiresAt:     expiresAtISO,
        lockedToEmail: customerEmail ?? null,
      },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err) {
    console.error("[bargain/close]", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
};
