// @ts-nocheck
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const gqlRes = await admin.graphql(`{
    products(first: 50) {
      edges { node {
        id title status
        featuredImage { url altText }
        variants(first: 1) { edges { node { price } } }
      }}
    }
  }`);
  const gqlJson = await gqlRes.json();
  const products =
    gqlJson.data?.products?.edges?.map((e: { node: unknown }) => e.node) ?? [];

  const rules = await db.productRule.findMany({ where: { shop }, include: { tiers: true } });
  const rulesMap: Record<string, (typeof rules)[number]> = {};
  for (const r of rules) rulesMap[r.productId] = r;

  return { products, rulesMap };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "delete") {
    await db.productRule.deleteMany({ where: { id: Number(fd.get("ruleId")), shop } });
    return { ok: true };
  }

  if (intent === "toggle") {
    await db.productRule.updateMany({
      where: { id: Number(fd.get("ruleId")), shop },
      data: { enabled: fd.get("enabled") === "true" },
    });
    return { ok: true };
  }

  // enable (upsert with custom values)
  const productId      = String(fd.get("productId") ?? "");
  const productTitle   = String(fd.get("productTitle") ?? "");
  const minQuantity    = Number(fd.get("minQuantity")    ?? 1);
  const triggerQuantity= Number(fd.get("triggerQuantity")?? 1);
  const openingDiscount= Number(fd.get("openingDiscount")?? 5);
  const maxDiscount    = Number(fd.get("maxDiscount")    ?? 20);
  const concessionStep = Number(fd.get("concessionStep") ?? 2);
  const maxRounds      = Number(fd.get("maxRounds")      ?? 3);
  const dealExpiryMins = Number(fd.get("dealExpiryMins") ?? 30);

  await db.productRule.upsert({
    where: { shop_productId: { shop, productId } },
    create: { shop, productId, productTitle, minQuantity, triggerQuantity,
      openingDiscount, maxDiscount, concessionStep, maxRounds, dealExpiryMins, enabled: true },
    update: { productTitle, minQuantity, triggerQuantity,
      openingDiscount, maxDiscount, concessionStep, maxRounds, dealExpiryMins },
  });
  return { ok: true };
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 12,
  padding: "18px 20px",
  marginBottom: 10,
  transition: "box-shadow 0.15s",
};
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16 };
const infoBlock: React.CSSProperties = { flex: 1, minWidth: 0 };
const title: React.CSSProperties = { fontWeight: 700, fontSize: 15, color: "#202223", margin: 0 };
const sub: React.CSSProperties = { fontSize: 12, color: "#6d7175", marginTop: 2 };
const badgeOn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 10px", borderRadius: 20,
  fontSize: 11, fontWeight: 700, background: "#e3f5eb", color: "#1a6637",
};
const badgeOff: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 10px", borderRadius: 20,
  fontSize: 11, fontWeight: 700, background: "#fff4e5", color: "#b54708",
};
const ruleRow: React.CSSProperties = {
  display: "flex", gap: 0, flexWrap: "wrap", marginTop: 12,
  border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden",
};
const ruleItem: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2,
  padding: "8px 14px", borderRight: "1px solid #e1e3e5",
  background: "#f9f9f9", minWidth: 80,
};
const ruleLabel: React.CSSProperties = { fontSize: 10, color: "#6d7175", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" };
const ruleValue: React.CSSProperties = { fontWeight: 700, fontSize: 14, color: "#202223" };

const btnPrimary: React.CSSProperties = {
  padding: "7px 16px", background: "#008060", color: "#fff",
  border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnSecondary: React.CSSProperties = {
  padding: "7px 16px", background: "#fff", color: "#202223",
  border: "1px solid #c9cccf", borderRadius: 7, fontSize: 13, cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnDanger: React.CSSProperties = {
  padding: "7px 12px", background: "#fff", color: "#d72c0d",
  border: "1px solid #fecdd3", borderRadius: 7, fontSize: 13, cursor: "pointer",
  whiteSpace: "nowrap",
};
const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 13,
  border: "1px solid #c9cccf", borderRadius: 7, boxSizing: "border-box", fontFamily: "inherit",
};
const formGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12,
};
const labelSt: React.CSSProperties = { fontSize: 12, color: "#6d7175", marginBottom: 3, display: "block", fontWeight: 500 };

interface ShopifyProduct {
  id: string; title: string; status: string;
  featuredImage?: { url: string; altText?: string };
  variants: { edges: [{ node: { price: string } }] };
}

// Inline enable form for a single product
function EnableForm({ product, onCancel }: { product: ShopifyProduct; onCancel: () => void }) {
  const fetcher = useFetcher();
  const [vals, setVals] = useState({
    minQuantity: 1, triggerQuantity: 1, openingDiscount: 5,
    maxDiscount: 20, concessionStep: 2, maxRounds: 3, dealExpiryMins: 30,
  });
  const busy = fetcher.state !== "idle";

  function set(key: string, v: number) { setVals((p) => ({ ...p, [key]: v })); }

  return (
    <div style={{ marginTop: 12, background: "#f6f6f7", borderRadius: 8, padding: "14px 16px", border: "1px solid #e1e3e5" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13 }}>Configure bargaining rules for <em>{product.title}</em></p>

      <div style={formGrid}>
        {[
          { key: "minQuantity",     label: "Min Qty",          min: 1,  max: 9999, step: 1 },
          { key: "triggerQuantity", label: "Trigger Qty",      min: 1,  max: 9999, step: 1 },
          { key: "openingDiscount", label: "Opening Disc. (%)", min: 0,  max: 100,  step: 0.5 },
          { key: "maxDiscount",     label: "Max Discount (%)",  min: 0,  max: 100,  step: 0.5 },
          { key: "concessionStep",  label: "Concession (%)",    min: 0,  max: 50,   step: 0.5 },
          { key: "maxRounds",       label: "Max Rounds",        min: 1,  max: 10,   step: 1 },
        ].map((f) => (
          <div key={f.key}>
            <label style={labelSt}>{f.label}</label>
            <input
              style={fieldStyle}
              type="number"
              min={f.min} max={f.max} step={f.step}
              value={vals[f.key as keyof typeof vals]}
              onChange={(e) => set(f.key, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          style={btnPrimary}
          disabled={busy}
          onClick={() => {
            fetcher.submit({
              intent: "enable",
              productId: product.id,
              productTitle: product.title,
              ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, String(v)])),
            }, { method: "POST" });
          }}
        >
          {busy ? "Enabling…" : "Enable Bargaining"}
        </button>
        <button style={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { products, rulesMap } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(ruleId: number, current: boolean) {
    fetcher.submit(
      { intent: "toggle", ruleId: String(ruleId), enabled: String(!current) },
      { method: "POST" }
    );
  }

  function handleDelete(ruleId: number) {
    if (confirm("Remove bargaining rules for this product?")) {
      fetcher.submit({ intent: "delete", ruleId: String(ruleId) }, { method: "POST" });
    }
  }

  return (
    <s-page heading="Products">
      <s-paragraph slot="subtitle">
        Enable bargaining per product. Each product has its own discount rules.
      </s-paragraph>

      <s-section heading="Your Products">
        {(products as ShopifyProduct[]).length === 0 ? (
          <s-paragraph>No products found. Add products to your Shopify store first.</s-paragraph>
        ) : (
          <div>
            {(products as ShopifyProduct[]).map((product) => {
              const rule = rulesMap[product.id];
              const price = product.variants?.edges?.[0]?.node?.price ?? "—";
              const showEnableForm = expandedId === product.id;

              return (
                <div key={product.id} style={card}>
                  <div style={row}>
                    {product.featuredImage && (
                      <img
                        src={product.featuredImage.url}
                        alt={product.featuredImage.altText ?? product.title}
                        width={52} height={52}
                        style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                      />
                    )}

                    <div style={infoBlock}>
                      <p style={title}>{product.title}</p>
                      <p style={sub}>{product.status} · ${price}</p>
                      {rule && (
                        <span style={rule.enabled ? badgeOn : badgeOff}>
                          {rule.enabled ? "Bargaining ON" : "Bargaining OFF"}
                        </span>
                      )}
                    </div>

                    {/* Action buttons — properly spaced */}
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                      {rule ? (
                        <>
                          <button
                            style={rule.enabled ? { ...btnSecondary, color: "#b54708" } : btnPrimary}
                            onClick={() => handleToggle(rule.id, rule.enabled)}
                          >
                            {rule.enabled ? "⏸ Pause" : "▶ Enable"}
                          </button>
                          <Form method="GET" action={`/app/product-edit/${rule.id}`} style={{ display: "inline" }}>
                            <button type="submit" style={btnSecondary}>✏️ Edit Rules</button>
                          </Form>
                          <button
                            style={btnDanger}
                            title="Remove bargaining rules"
                            onClick={() => handleDelete(rule.id)}
                          >
                            🗑
                          </button>
                        </>
                      ) : (
                        <button
                          style={btnPrimary}
                          onClick={() => setExpandedId(showEnableForm ? null : product.id)}
                        >
                          {showEnableForm ? "✕ Cancel" : "🤝 Enable Bargaining"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-product rule summary */}
                  {rule && (
                    <div style={ruleRow}>
                      {[
                        { label: "Opening", value: rule.openingDiscount + "%" },
                        { label: "Max Disc", value: rule.maxDiscount + "%" },
                        { label: "Step",     value: rule.concessionStep + "%" },
                        { label: "Rounds",   value: rule.maxRounds },
                        { label: "Min Qty",  value: rule.minQuantity },
                        { label: "Trigger",  value: rule.triggerQuantity },
                        { label: "Expiry",   value: rule.dealExpiryMins + "m" },
                        ...(rule.tiers?.length ? [{ label: "Tiers", value: rule.tiers.length + " tier" + (rule.tiers.length > 1 ? "s" : "") }] : []),
                      ].map((item, idx, arr) => (
                        <div key={item.label} style={{ ...ruleItem, borderRight: idx < arr.length - 1 ? "1px solid #e1e3e5" : "none" }}>
                          <span style={ruleLabel}>{item.label}</span>
                          <span style={ruleValue}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline enable form */}
                  {showEnableForm && (
                    <EnableForm
                      product={product}
                      onCancel={() => setExpandedId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
