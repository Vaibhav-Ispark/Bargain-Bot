// @ts-nocheck
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sensitivityLabel, sensitivityEmoji, sensitivityDescription } from "../lib/priceSensitivity";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    totalSessions, activeSessions, closedSessions, expiredSessions,
    totalDeals, convertedDeals, topProducts, dealsByDay,
    recentSessions,
  ] = await Promise.all([
    db.bargainSession.count({ where: { shop } }),
    db.bargainSession.count({ where: { shop, status: "active" } }),
    db.bargainSession.count({ where: { shop, status: "closed" } }),
    db.bargainSession.count({ where: { shop, status: "expired" } }),
    db.deal.count({ where: { shop } }),
    db.deal.count({ where: { shop, converted: true } }),
    db.deal.groupBy({
      by: ["productId"],
      where: { shop },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    db.deal.findMany({
      where: { shop, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true, finalDiscount: true, finalQty: true },
      orderBy: { createdAt: "asc" },
    }),
    // Recent sessions with sensitivity data
    db.bargainSession.findMany({
      where: { shop, currentRound: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        customerEmail: true,
        sensitivityScore: true,
        rejectionCount: true,
        highDiscountAsked: true,
        currentRound: true,
        status: true,
        agreedDiscount: true,
        agreedQty: true,
        startedAt: true,
        productRule: { select: { productTitle: true } },
      },
    }),
  ]);

  const productIds = topProducts.map((p) => p.productId);
  const rules = await db.productRule.findMany({
    where: { shop, productId: { in: productIds } },
    select: { productId: true, productTitle: true },
  });
  const titleMap: Record<string, string> = {};
  for (const r of rules) titleMap[r.productId] = r.productTitle;

  const avgDiscountResult = await db.deal.aggregate({
    where: { shop },
    _avg: { finalDiscount: true },
  });

  // Sensitivity breakdown counts
  const lowCount    = recentSessions.filter(s => s.sensitivityScore <= 30).length;
  const mediumCount = recentSessions.filter(s => s.sensitivityScore > 30 && s.sensitivityScore <= 60).length;
  const highCount   = recentSessions.filter(s => s.sensitivityScore > 60).length;

  return {
    stats: {
      totalSessions, activeSessions, closedSessions, expiredSessions,
      totalDeals, convertedDeals,
      conversionRate: totalDeals > 0 ? ((convertedDeals / totalDeals) * 100).toFixed(1) : "0.0",
      // BUG-29 FIX: exclude active sessions from close rate — only count completed negotiations
      sessionCloseRate: (closedSessions + expiredSessions) > 0
        ? ((closedSessions / (closedSessions + expiredSessions)) * 100).toFixed(1)
        : "0.0",
      avgDiscount: (avgDiscountResult._avg.finalDiscount ?? 0).toFixed(1),
    },
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      title: titleMap[p.productId] ?? "Deleted Product",  // BUG-30 FIX
      count: p._count.id,
    })),
    dealsByDay,
    sensitivityBreakdown: { lowCount, mediumCount, highCount },
    recentSessions: recentSessions.map(s => ({
      id: s.id,
      email: s.customerEmail ?? "Guest",
      product: s.productRule?.productTitle ?? "—",
      score: Math.round(s.sensitivityScore ?? 50),
      label: sensitivityLabel(s.sensitivityScore ?? 50),
      emoji: sensitivityEmoji(sensitivityLabel(s.sensitivityScore ?? 50)),
      rejections: s.rejectionCount ?? 0,
      highDiscountAsked: s.highDiscountAsked ?? 0,
      rounds: s.currentRound,
      status: s.status,
      agreedDiscount: s.agreedDiscount,
      agreedQty: s.agreedQty,
      date: s.startedAt,
    })),
  };
};

const cardStyle = {
  background: "#fff", borderRadius: 8, border: "1px solid #e1e3e5",
  padding: "16px 20px", flex: 1,
};
const numStyle = { fontSize: 28, fontWeight: 700, color: "#202223", margin: "4px 0" };
const labelStyle = { fontSize: 12, color: "#6d7175", margin: 0 };

const SENSITIVITY_COLORS: Record<string, string> = {
  low:    "#e8f5e9",
  medium: "#fff8e1",
  high:   "#fdecea",
};
const SENSITIVITY_TEXT: Record<string, string> = {
  low:    "#2e7d32",
  medium: "#e65100",
  high:   "#c62828",
};

export default function AnalyticsPage() {
  const { stats, topProducts, dealsByDay, sensitivityBreakdown, recentSessions } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics">

      {/* ── Session Stats ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202223", marginBottom: 12 }}>Sessions</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={cardStyle}>
            <p style={labelStyle}>Total Sessions</p>
            <p style={numStyle}>{stats.totalSessions}</p>
            <p style={labelStyle}>Active {stats.activeSessions} · Closed {stats.closedSessions} · Expired {stats.expiredSessions}</p>
          </div>
          <div style={cardStyle}>
            <p style={labelStyle}>Session Close Rate</p>
            <p style={numStyle}>{stats.sessionCloseRate}%</p>
            <p style={labelStyle}>Sessions that resulted in a deal</p>
          </div>
        </div>
      </div>

      {/* ── Deal Stats ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202223", marginBottom: 12 }}>Deals</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Deals Closed",      value: stats.totalDeals,     sub: "Discount codes issued" },
            { label: "Orders Converted",  value: stats.convertedDeals, sub: "Deals → paid orders" },
            { label: "Conversion Rate",   value: stats.conversionRate + "%", sub: "Closed deals → orders" },
            { label: "Avg Discount Given",value: stats.avgDiscount + "%", sub: "Across all closed deals" },
          ].map(c => (
            <div key={c.label} style={cardStyle}>
              <p style={labelStyle}>{c.label}</p>
              <p style={numStyle}>{c.value}</p>
              <p style={labelStyle}>{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Price Sensitivity Breakdown ───────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202223", marginBottom: 4 }}>
          🎯 Price Sensitivity Breakdown
        </h2>
        <p style={{ fontSize: 12, color: "#6d7175", marginBottom: 12 }}>
          Based on negotiation behavior: rejection count, discount demands, response speed & quantity commitment.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "🟢 Low Sensitivity",    count: sensitivityBreakdown.lowCount,    desc: "Hold firm — price isn't their main concern",   bg: "#e8f5e9", col: "#2e7d32" },
            { label: "🟡 Medium Sensitivity", count: sensitivityBreakdown.mediumCount, desc: "Normal negotiation — standard concession pace", bg: "#fff8e1", col: "#e65100" },
            { label: "🔴 High Sensitivity",   count: sensitivityBreakdown.highCount,   desc: "Very price-conscious — be more generous",       bg: "#fdecea", col: "#c62828" },
          ].map(c => (
            <div key={c.label} style={{ ...cardStyle, background: c.bg, border: "none" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: c.col, margin: 0 }}>{c.label}</p>
              <p style={{ ...numStyle, color: c.col }}>{c.count}</p>
              <p style={{ fontSize: 11, color: "#555", margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Recent Sessions with Sensitivity Score */}
        {recentSessions.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#202223", marginBottom: 8 }}>
              Recent Sessions — Sensitivity Scores
            </h3>
            <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 14px", background: "#f6f6f7", fontSize: 11, fontWeight: 600, color: "#6d7175" }}>
                <span>Customer</span>
                <span>Product</span>
                <span>Score</span>
                <span>Rejections</span>
                <span>Rounds</span>
                <span>Status</span>
                <span>Deal</span>
              </div>
              {recentSessions.map((s, i) => (
                <div key={s.id} style={{
                  display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr",
                  gap: 8, padding: "10px 14px", fontSize: 12, color: "#202223",
                  borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.email}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.product}
                  </span>
                  <span>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 12,
                      background: SENSITIVITY_COLORS[s.label],
                      color: SENSITIVITY_TEXT[s.label],
                      fontWeight: 600, fontSize: 11,
                    }}>
                      {s.emoji} {s.score}
                    </span>
                  </span>
                  <span>{s.rejections}x</span>
                  <span>{s.rounds}</span>
                  <span style={{ textTransform: "capitalize" }}>{s.status}</span>
                  <span>
                    {s.agreedDiscount
                      ? `${s.agreedQty} × ${s.agreedDiscount.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Top Products ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202223", marginBottom: 12 }}>Top Bargained Products</h2>
        {topProducts.length === 0 ? (
          <p style={{ color: "#6d7175", fontSize: 13 }}>No deals yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topProducts.map((p) => (
              <div key={p.productId} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{p.title}</span>
                <span style={{ background: "#f0f0f0", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                  {p.count} deals
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Deals Last 30 Days ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202223", marginBottom: 12 }}>Deals — Last 30 Days</h2>
        {dealsByDay.length === 0 ? (
          <p style={{ color: "#6d7175", fontSize: 13 }}>No deals in the last 30 days.</p>
        ) : (
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 14px", background: "#f6f6f7", fontSize: 11, fontWeight: 600, color: "#6d7175" }}>
              <span>Date</span><span>Qty</span><span>Discount</span>
            </div>
            {dealsByDay.map((deal, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                padding: "8px 14px", fontSize: 12,
                borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}>
                <span>{new Date(deal.createdAt).toLocaleDateString()}</span>
                <span>{deal.finalQty}</span>
                <span>{deal.finalDiscount.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
