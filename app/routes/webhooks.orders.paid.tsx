/**
 * POST /webhooks/orders/paid
 *
 * Marks a BargainBot deal as converted when an order is paid.
 * Matches by discount code present in the order.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface OrderLineItem {
  discount_allocations?: { discount_application_index: number; amount: string }[];
}

interface OrderPaidPayload {
  id: number;
  discount_codes?: { code: string }[];
  line_items?: OrderLineItem[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  const order = payload as OrderPaidPayload;
  const orderId = String(order.id);
  const discountCodes = (order.discount_codes ?? []).map((d) =>
    d.code.toUpperCase()
  );

  // Find deals matching any of the discount codes in this order
  const matchingDeals = await db.deal.findMany({
    where: {
      shop,
      discountCode: { in: discountCodes },
      converted: false,
    },
  });

  if (matchingDeals.length > 0) {
    await db.deal.updateMany({
      where: { id: { in: matchingDeals.map((d) => d.id) } },
      data: { converted: true, shopifyOrderId: orderId },
    });
    console.log(
      `[webhook] Marked ${matchingDeals.length} deal(s) as converted for order ${orderId}`
    );
  }

  return new Response(null, { status: 200 });
};
