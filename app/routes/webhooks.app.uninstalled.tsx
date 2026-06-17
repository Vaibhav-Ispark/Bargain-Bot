/**
 * POST /webhooks/app/uninstalled
 *
 * Cleans up sessions and merchant data when the app is uninstalled.
 * Note: Deal history is kept for audit purposes.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  if (session) {
    // Remove all Shopify OAuth sessions for this shop
    await db.session.deleteMany({ where: { shop } });
  }

  // Clean up active bargain sessions (leave deals for records)
  await db.bargainSession.updateMany({
    where: { shop, status: "active" },
    data: { status: "expired" },
  });

  return new Response(null, { status: 200 });
};
