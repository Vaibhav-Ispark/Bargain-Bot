// @ts-nocheck
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const skip = (page - 1) * PAGE_SIZE;

  const [deals, total] = await Promise.all([
    db.deal.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        productRule: { select: { productTitle: true } },
        session: { select: { transcript: true, customerId: true, customerEmail: true } },
      },
    }),
    db.deal.count({ where: { shop } }),
  ]);

  return { deals, total, page, totalPages: Math.ceil(total / PAGE_SIZE) };
};

export default function DealsPage() {
  const { deals, total, page, totalPages } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const expandedId = searchParams.get("expand");

  function toggleExpand(id: number) {
    setSearchParams((p) => {
      if (expandedId === String(id)) p.delete("expand");
      else p.set("expand", String(id));
      return p;
    });
  }

  return (
    <s-page heading="Deal Logs">
      <s-paragraph slot="subtitle">{total} total deals</s-paragraph>

      {deals.length === 0 ? (
        <s-section heading="No deals yet">
          <s-paragraph>Deals appear here once customers start bargaining.</s-paragraph>
        </s-section>
      ) : (
        <s-section heading="Deals">
          <s-stack direction="block" gap="base">
            {deals.map((deal) => {
              let transcript: { role: string; text: string; ts: string }[] = [];
              try { transcript = JSON.parse(deal.session?.transcript ?? "[]"); } catch {}
              const isExpanded = expandedId === String(deal.id);

              return (
                <s-box
                  key={deal.id}
                  padding="base"
                  border-width="base"
                  border-radius="base"
                  background="surface"
                >
                  <s-stack direction="inline">
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-heading>{deal.productRule.productTitle}</s-heading>
                      <s-stack direction="inline" gap="base">
                        <s-badge tone={deal.converted ? "success" : "warning"}>
                          {deal.converted ? "Converted" : "Pending"}
                        </s-badge>
                        <s-text>{deal.finalQty} units · {deal.finalDiscount.toFixed(1)}% off</s-text>
                        <s-text>Code: {deal.discountCode}</s-text>
                        {deal.session?.customerEmail ? (
                          <s-text>👤 {deal.session.customerEmail}</s-text>
                        ) : deal.session?.customerId ? (
                          <s-text>👤 Customer #{deal.session.customerId}</s-text>
                        ) : null}
                        <s-text>{new Date(deal.createdAt).toLocaleString()}</s-text>
                      </s-stack>
                    </s-stack>
                    <s-button variant="secondary" onClick={() => toggleExpand(deal.id)}>
                      {isExpanded ? "Hide Transcript" : "View Transcript"}
                    </s-button>
                  </s-stack>

                  {isExpanded && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #e1e3e5", paddingTop: 12 }}>
                      {transcript.length === 0 ? (
                        <s-paragraph>No transcript available.</s-paragraph>
                      ) : (
                        transcript.map((msg, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: msg.role === "customer" ? "flex-end" : "flex-start",
                              marginBottom: 6,
                            }}
                          >
                            <div
                              style={{
                                background: msg.role === "customer" ? "#e3f5eb" : "#f6f6f7",
                                border: "1px solid #e1e3e5",
                                borderRadius: 8,
                                padding: "6px 10px",
                                maxWidth: "70%",
                                fontSize: 13,
                              }}
                            >
                              <strong style={{ fontSize: 11, opacity: 0.6 }}>
                                {msg.role === "customer" ? "Customer" : "Bot"}
                              </strong>
                              <div>{msg.text}</div>
                              {msg.ts && (
                                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                                  {new Date(msg.ts).toLocaleTimeString()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </s-box>
              );
            })}
          </s-stack>

          {totalPages > 1 && (
            <s-stack direction="inline" gap="base" style={{ marginTop: 16 }}>
              {page > 1 && <s-link href={`/app/deals?page=${page - 1}`}>← Previous</s-link>}
              <s-text>Page {page} of {totalPages}</s-text>
              {page < totalPages && <s-link href={`/app/deals?page=${page + 1}`}>Next →</s-link>}
            </s-stack>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
