// @ts-nocheck
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const ruleId = Number(params.ruleId);
  const rule = await db.productRule.findFirst({
    where: { id: ruleId, shop: session.shop },
    include: { tiers: true },
  });
  if (!rule) throw new Response("Not found", { status: 404 });
  return { rule };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const ruleId = Number(params.ruleId);
  const formData = await request.formData();

  // Server-side validation (BUG-27 fix)
  const raw = {
    minQuantity:     Math.max(1, Math.min(9999, Number(formData.get("minQuantity")     ?? 1))),
    triggerQuantity: Math.max(1, Math.min(9999, Number(formData.get("triggerQuantity") ?? 1))),
    openingDiscount: Math.max(0, Math.min(100,  Number(formData.get("openingDiscount") ?? 5))),
    maxDiscount:     Math.max(0, Math.min(100,  Number(formData.get("maxDiscount")     ?? 20))),
    concessionStep:  Math.max(0.1, Math.min(50, Number(formData.get("concessionStep")  ?? 2))),
    maxRounds:       Math.max(1, Math.min(20,   Number(formData.get("maxRounds")       ?? 3))),
    dealExpiryMins:  Math.max(1, Math.min(10080, Number(formData.get("dealExpiryMins") ?? 30))),
  };
  // Ensure opening <= max
  if (raw.openingDiscount > raw.maxDiscount) raw.openingDiscount = raw.maxDiscount;
  // Ensure triggerQty >= minQty
  if (raw.triggerQuantity < raw.minQuantity) raw.triggerQuantity = raw.minQuantity;

  const { minQuantity, triggerQuantity, openingDiscount, maxDiscount, concessionStep, maxRounds, dealExpiryMins } = raw;

  const tiers: { minQty: number; discount: number }[] = [];
  let i = 0;
  while (formData.has(`tierMinQty_${i}`)) {
    const minQty   = Number(formData.get(`tierMinQty_${i}`));
    const discount = Math.min(Number(formData.get(`tierDiscount_${i}`)), maxDiscount); // BUG-28 fix
    if (minQty > 0 && discount > 0) tiers.push({ minQty, discount });
    i++;
  }

  const rule = await db.productRule.findFirst({
    where: { id: ruleId, shop },
    select: { id: true },
  });
  if (!rule) throw new Response("Not found", { status: 404 });

  await db.productRule.update({
    where: { id: rule.id },
    data: {
      minQuantity, triggerQuantity, openingDiscount,
      maxDiscount, concessionStep, maxRounds, dealExpiryMins,
      tiers: { deleteMany: {}, create: tiers },
    },
  });

  return redirect("/app/products");
};

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #c9cccf", borderRadius: 6, boxSizing: "border-box",
  fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500, color: "#202223",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: "#6d7175", marginTop: 3,
};
const fieldGroupStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
};
const sectionStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 8, border: "1px solid #e1e3e5",
  padding: "20px 24px", marginBottom: 16,
};
const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: "#202223", marginTop: 0, marginBottom: 16,
};
const btnPrimary: React.CSSProperties = {
  padding: "9px 20px", background: "#008060", color: "#fff",
  border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary: React.CSSProperties = {
  padding: "9px 20px", background: "#fff", color: "#202223",
  border: "1px solid #c9cccf", borderRadius: 6, fontSize: 14,
  fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  textDecoration: "none", display: "inline-block",
};

interface Tier { minQty: number; discount: number }

export default function EditRulePage() {
  const { rule } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [tiers, setTiers] = useState<Tier[]>(
    rule.tiers.map((t) => ({ minQty: t.minQty, discount: t.discount }))
  );

  function addTier() { setTiers([...tiers, { minQty: 0, discount: 0 }]); }
  function removeTier(i: number) { setTiers(tiers.filter((_, j) => j !== i)); }
  function updateTier(i: number, key: keyof Tier, val: number) {
    setTiers(tiers.map((t, j) => j === i ? { ...t, [key]: val } : t));
  }

  return (
    <s-page heading={`Edit Rules — ${rule.productTitle}`}>
      <s-button slot="primary-action" variant="secondary">
        <Form method="GET" action="/app/products" style={{ display: "inline" }}>
          <button type="submit" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit" }}>← Back</button>
        </Form>
      </s-button>

      <Form method="POST">

        {/* ── Quantity ── */}
        <div style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Quantity Settings</h2>
          <div style={fieldGroupStyle}>
            <div>
              <label style={labelStyle} htmlFor="minQuantity">Minimum Order Quantity</label>
              <input id="minQuantity" style={fieldStyle} type="number" name="minQuantity" min="1" defaultValue={rule.minQuantity} />
              <p style={hintStyle}>Customers must order at least this many units to bargain</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="triggerQuantity">Trigger Quantity</label>
              <input id="triggerQuantity" style={fieldStyle} type="number" name="triggerQuantity" min="1" defaultValue={rule.triggerQuantity} />
              <p style={hintStyle}>Min qty before bot makes a discount offer</p>
            </div>
          </div>
        </div>

        {/* ── Discounts ── */}
        <div style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Discount Settings</h2>
          <div style={{ ...fieldGroupStyle, marginBottom: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="openingDiscount">Opening Discount (%)</label>
              <input id="openingDiscount" style={fieldStyle} type="number" name="openingDiscount" min="0" max="100" step="0.5" defaultValue={rule.openingDiscount} />
              <p style={hintStyle}>First offer when no qty tier matches</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="maxDiscount">Maximum Discount (%)</label>
              <input id="maxDiscount" style={fieldStyle} type="number" name="maxDiscount" min="0" max="100" step="0.5" defaultValue={rule.maxDiscount} />
              <p style={hintStyle}>Bot never offers more than this</p>
            </div>
          </div>
          <div style={{ ...fieldGroupStyle, marginBottom: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="concessionStep">Concession Step (%)</label>
              <input id="concessionStep" style={fieldStyle} type="number" name="concessionStep" min="0" max="50" step="0.5" defaultValue={rule.concessionStep} />
              <p style={hintStyle}>Extra % added each time customer rejects</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="maxRounds">Max Negotiation Rounds</label>
              <input id="maxRounds" style={fieldStyle} type="number" name="maxRounds" min="1" max="10" defaultValue={rule.maxRounds} />
              <p style={hintStyle}>After this the bot sends its final offer</p>
            </div>
          </div>
          <div style={{ maxWidth: 260 }}>
            <label style={labelStyle} htmlFor="dealExpiryMins">Deal Expiry (minutes)</label>
            <input id="dealExpiryMins" style={fieldStyle} type="number" name="dealExpiryMins" min="5" defaultValue={rule.dealExpiryMins} />
            <p style={hintStyle}>Discount code expires this many minutes after deal closes</p>
          </div>
        </div>

        {/* ── Tiers ── */}
        <div style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Quantity Tiers (optional)</h2>
          <p style={{ fontSize: 13, color: "#6d7175", marginTop: 0, marginBottom: 16 }}>
            Offer bigger discounts at higher quantities. If none are set, the opening discount always applies.
          </p>

          {/* Hidden inputs carry tier state into FormData */}
          {tiers.map((t, i) => (
            <span key={i}>
              <input type="hidden" name={`tierMinQty_${i}`}   value={t.minQty} />
              <input type="hidden" name={`tierDiscount_${i}`} value={t.discount} />
            </span>
          ))}

          {tiers.map((tier, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, marginBottom: 12, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Tier {i + 1} — Min Qty</label>
                <input
                  style={fieldStyle} type="number" min="1"
                  value={tier.minQty}
                  onChange={(e) => updateTier(i, "minQty", Number(e.target.value))}
                />
              </div>
              <div>
                <label style={labelStyle}>Discount (%)</label>
                <input
                  style={fieldStyle} type="number" min="0" max="100" step="0.5"
                  value={tier.discount}
                  onChange={(e) => updateTier(i, "discount", Number(e.target.value))}
                />
              </div>
              <button type="button" style={{ ...btnSecondary, padding: "9px 14px" }} onClick={() => removeTier(i)}>
                ✕
              </button>
            </div>
          ))}

          <button type="button" style={btnSecondary} onClick={addTier}>
            + Add Tier
          </button>
        </div>

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 12 }}>
          <button type="submit" style={btnPrimary} disabled={saving}>
            {saving ? "Saving…" : "Save Rules"}
          </button>
          <Form method="GET" action="/app/products" style={{ display: "inline" }}>
            <button type="submit" style={btnSecondary}>Cancel</button>
          </Form>
        </div>

      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
