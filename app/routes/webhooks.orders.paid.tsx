/**
 * POST /webhooks/orders/paid
 *
 * When an order is paid:
 * 1. Marks matching BargainBot deals as converted
 * 2. Adds "BargainBot" + discount code tags to the order
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface OrderPaidPayload {
  id: number;
  admin_graphql_api_id: string;
  discount_codes?: { code: string }[];
  tags?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  const order = payload as OrderPaidPayload;
  const orderId       = String(order.id);
  const orderGid      = order.admin_graphql_api_id; // gid://shopify/Order/123
  const discountCodes = (order.discount_codes ?? []).map((d) => d.code.toUpperCase());

  if (discountCodes.length === 0) {
    return new Response(null, { status: 200 });
  }

  // Find BargainBot deals matching any discount code in this order
  const matchingDeals = await db.deal.findMany({
    where: { shop, discountCode: { in: discountCodes }, converted: false },
  });

  if (matchingDeals.length === 0) {
    return new Response(null, { status: 200 });
  }

  // 1. Mark deals as converted in DB
  await db.deal.updateMany({
    where: { id: { in: matchingDeals.map((d) => d.id) } },
    data: { converted: true, shopifyOrderId: orderId },
  });

  console.log(`[webhook] Marked ${matchingDeals.length} deal(s) as converted for order ${orderId}`);

  // 2. Add tags to the Shopify order: "BargainBot" + each discount code used
  try {
    const bbCodes = matchingDeals.map((d) => d.discountCode);
    const tagsToAdd = ["BargainBot", ...bbCodes].join(", ");

    // Get existing tags first
    const existingTagsRes = await admin.graphql(
      `#graphql
      query getOrderTags($id: ID!) {
        order(id: $id) { tags }
      }`,
      { variables: { id: orderGid } }
    );
    const existingJson = await existingTagsRes.json();
    const existingTags: string[] = existingJson.data?.order?.tags ?? [];

    // Merge tags — avoid duplicates
    const allTags = [...new Set([...existingTags, "BargainBot", ...bbCodes])];

    await admin.graphql(
      `#graphql
      mutation addOrderTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: orderGid, tags: allTags } }
    );

    console.log(`[webhook] Tagged order ${orderId} with: ${tagsToAdd}`);
  } catch (err) {
    // Tagging failure shouldn't fail the webhook — deal is already marked converted
    console.error(`[webhook] Failed to tag order ${orderId}:`, err);
  }

  return new Response(null, { status: 200 });
};
