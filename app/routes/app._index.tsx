// @ts-nocheck
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [totalDeals, convertedDeals, activeSessions, productRules, expiredSessions] =
    await Promise.all([
      db.deal.count({ where: { shop } }),
      db.deal.count({ where: { shop, converted: true } }),
      db.bargainSession.count({ where: { shop, status: "active" } }),
      db.productRule.count({ where: { shop, enabled: true } }),
      db.bargainSession.count({ where: { shop, status: "expired" } }),
    ]);

  const closedSessions = await db.bargainSession.count({ where: { shop, status: "closed" } });
  const conversionRate = totalDeals > 0 ? ((convertedDeals / totalDeals) * 100).toFixed(1) : "0.0";
  const closeRate = (closedSessions + expiredSessions) > 0
    ? ((closedSessions / (closedSessions + expiredSessions)) * 100).toFixed(1)
    : "0.0";

  const recentDeals = await db.deal.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: {
      productRule: { select: { productTitle: true } },
      session: { select: { customerEmail: true } },
    },
  });

  const avgDiscountResult = await db.deal.aggregate({
    where: { shop },
    _avg: { finalDiscount: true },
  });

  return {
    stats: {
      totalDeals, convertedDeals, activeSessions, productRules,
      conversionRate, closeRate,
      avgDiscount: (avgDiscountResult._avg.finalDiscount ?? 0).toFixed(1),
    },
    recentDeals,
  };
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const BRAND   = "#008060";
const BRAND_L = "#e8f5f0";
const BORDER  = "#e1e3e5";
const TEXT_1  = "#202223";
const TEXT_2  = "#6d7175";
const WHITE   = "#ffffff";
const BG      = "#f6f6f7";

// ─── Component helpers ────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, accent = BRAND,
}: {
  icon: string; label: string; value: string | number; sub: string; accent?: string;
}) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "20px 22px", flex: 1, minWidth: 0,
      display: "flex", flexDirection: "column", gap: 6,
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 20, background: BRAND_L, width: 36, height: 36,
          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: TEXT_1, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: TEXT_2 }}>{sub}</div>
    </div>
  );
}

function NavCard({
  href, icon, title, desc, primary = false,
}: {
  href: string; icon: string; title: string; desc: string; primary?: boolean;
}) {
  return (
    <a href={href} style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      background: primary ? BRAND : WHITE,
      border: `1px solid ${primary ? BRAND : BORDER}`,
      borderRadius: 10, textDecoration: "none", cursor: "pointer",
      transition: "box-shadow 0.15s, transform 0.15s",
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.10)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "none";
      }}
    >
      <span style={{
        fontSize: 18, width: 38, height: 38, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: primary ? "rgba(255,255,255,.15)" : BRAND_L,
      }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: primary ? WHITE : TEXT_1 }}>{title}</div>
        <div style={{ fontSize: 12, color: primary ? "rgba(255,255,255,.75)" : TEXT_2, marginTop: 1 }}>{desc}</div>
      </div>
      <span style={{ marginLeft: "auto", color: primary ? "rgba(255,255,255,.6)" : TEXT_2, fontSize: 16 }}>›</span>
    </a>
  );
}

function StatusPill({ converted }: { converted: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: converted ? "#e3f5eb" : "#fff4e5",
      color: converted ? "#1a6637" : "#b54708",
    }}>
      <span style={{ fontSize: 8 }}>●</span>
      {converted ? "Converted" : "Pending"}
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { stats, recentDeals } = useLoaderData<typeof loader>();

  const isEmpty = recentDeals.length === 0;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>🤝</span>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT_1 }}>BargainBot</h1>
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: "#e3f5eb", color: "#1a6637",
          }}>LIVE</span>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: TEXT_2 }}>
          Your AI-powered price negotiation platform
        </p>
      </div>

      {/* ── Metric cards ── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricCard icon="🏷️" label="Active Rules"    value={stats.productRules}      sub="Products with bargaining on"          accent={BRAND} />
        <MetricCard icon="💬" label="Live Sessions"   value={stats.activeSessions}    sub="Customers negotiating now"            accent="#6366f1" />
        <MetricCard icon="🎯" label="Total Deals"     value={stats.totalDeals}        sub="Discount codes issued"                accent="#f59e0b" />
        <MetricCard icon="✅" label="Converted"       value={stats.convertedDeals}    sub={`${stats.conversionRate}% conversion rate`} accent="#10b981" />
        <MetricCard icon="📊" label="Avg Discount"    value={`${stats.avgDiscount}%`} sub="Across all closed deals"              accent="#ef4444" />
      </div>

      {/* ── Main content grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

        {/* ── Left: Recent Deals ── */}
        <div>
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden",
          }}>
            {/* Card header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "16px 20px", borderBottom: `1px solid ${BORDER}`,
              background: `linear-gradient(135deg, ${BRAND} 0%, #00a37a 100%)`,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: WHITE }}>Recent Deals</h2>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.75)" }}>Latest negotiated discounts</p>
              </div>
              <a href="/app/deals" style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "rgba(255,255,255,.15)", color: WHITE, textDecoration: "none",
                border: "1px solid rgba(255,255,255,.25)",
              }}>
                View All →
              </a>
            </div>

            {isEmpty ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: TEXT_1 }}>No deals yet</h3>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: TEXT_2, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
                  Enable bargaining on a product and customers will start negotiating deals.
                </p>
                <a href="/app/products" style={{
                  display: "inline-block", padding: "9px 20px", borderRadius: 8,
                  background: BRAND, color: WHITE, textDecoration: "none",
                  fontSize: 13, fontWeight: 700,
                }}>
                  Enable Your First Product →
                </a>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                  padding: "8px 20px", background: BG,
                  fontSize: 11, fontWeight: 700, color: TEXT_2, textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  <span>Product</span>
                  <span>Customer</span>
                  <span style={{ textAlign: "center" }}>Qty</span>
                  <span style={{ textAlign: "center" }}>Discount</span>
                  <span style={{ textAlign: "center" }}>Status</span>
                </div>

                {recentDeals.map((deal, i) => (
                  <div key={deal.id} style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                    padding: "13px 20px", alignItems: "center",
                    borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                    background: i % 2 === 0 ? WHITE : "#fafafa",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {deal.productRule.productTitle}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_2, marginTop: 2 }}>
                        {new Date(deal.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {deal.session?.customerEmail
                        ? deal.session.customerEmail.split("@")[0] + "…"
                        : "Guest"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20,
                        background: "#f0f0f0", fontSize: 12, fontWeight: 700, color: TEXT_1,
                      }}>{deal.finalQty}</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20,
                        background: BRAND_L, fontSize: 12, fontWeight: 700, color: BRAND,
                      }}>{deal.finalDiscount.toFixed(1)}%</span>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <StatusPill converted={deal.converted} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Quick Actions */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT_1 }}>Quick Actions</h3>
            </div>
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <NavCard href="/app/products"  icon="🏷️" title="Manage Products"  desc="Enable bargaining per product" primary />
              <NavCard href="/app/settings"  icon="⚙️" title="Widget Settings"  desc="Customize look and behavior" />
              <NavCard href="/app/analytics" icon="📊" title="Analytics"        desc="Sessions, deals and revenue" />
              <NavCard href="/app/deals"     icon="📋" title="Deal Logs"        desc="View all negotiated deals" />
            </div>
          </div>

          {/* Getting Started */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT_1 }}>Getting Started</h3>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { href: "/app/products",  num: "1", text: "Enable bargaining on a product" },
                { href: "/app/settings",  num: "2", text: "Customize your chat widget" },
                { href: "/app/analytics", num: "3", text: "Track deals and revenue" },
              ].map(step => (
                <a key={step.num} href={step.href} style={{
                  display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: "50%", background: BRAND_L,
                    color: BRAND, fontSize: 11, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{step.num}</span>
                  <span style={{ fontSize: 13, color: BRAND, fontWeight: 500 }}>{step.text}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Close Rate Widget */}
          <div style={{
            background: `linear-gradient(135deg, ${BRAND} 0%, #00a37a 100%)`,
            borderRadius: 12, padding: "18px 20px", color: WHITE,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Session Close Rate
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, marginBottom: 6 }}>
              {stats.closeRate}%
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Of completed negotiations resulted in a deal
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 12, height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, background: WHITE,
                width: `${Math.min(parseFloat(stats.closeRate), 100)}%`,
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
