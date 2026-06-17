// @ts-nocheck
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useState, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await db.widgetSettings.findUnique({ where: { shop: session.shop } });
  return {
    settings: settings ?? {
      botName: "BargainBot", primaryColor: "#008060", tone: "friendly",
      position: "bottom-right",
      greeting: "Hey! Want to make a deal? Tell me how many you'd like and we'll see what we can do 🤝",
      logoUrl: "",
      proactiveTrigger: true,
      proactiveDelay: 30,
      proactiveMessage: "Psst — want a deal? 👀",
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const data = {
    botName:          (fd.get("botName")          as string) || "BargainBot",
    primaryColor:     (fd.get("primaryColor")      as string) || "#008060",
    tone:             (fd.get("tone")              as string) || "friendly",
    position:         (fd.get("position")          as string) || "bottom-right",
    greeting:         (fd.get("greeting")          as string) || "Hey! Want to make a deal? Tell me how many you'd like and we'll see what we can do 🤝",
    logoUrl:          (fd.get("logoUrl")           as string) || "",
    proactiveTrigger: fd.get("proactiveTrigger") === "true",
    proactiveDelay:   Math.max(5, Math.min(120, Number(fd.get("proactiveDelay") || 30))),
    proactiveMessage: (fd.get("proactiveMessage") as string) || "Psst — want a deal? 👀",
  };
  await db.widgetSettings.upsert({ where: { shop }, create: { shop, ...data }, update: data });
  return { saved: true };
};

const sectionStyle = {
  background: "#fff", borderRadius: 8, border: "1px solid #e1e3e5",
  padding: "20px 24px", marginBottom: 16,
};
const h2Style = { fontSize: 15, fontWeight: 600, color: "#202223", marginTop: 0, marginBottom: 16 };
const labelStyle = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500, color: "#202223" };
const fieldStyle = {
  width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #c9cccf", borderRadius: 6, boxSizing: "border-box", fontFamily: "inherit",
};
const hintStyle = { fontSize: 12, color: "#6d7175", marginTop: 3 };

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const [color, setColor]           = useState(settings.primaryColor);
  const [botName, setBotName]       = useState(settings.botName);
  const [greeting, setGreeting]     = useState(settings.greeting);
  const [tone, setTone]             = useState(settings.tone || "friendly");         // BUG-33 fix
  const [position, setPosition]     = useState(settings.position || "bottom-right"); // BUG-33 fix
  const [logoUrl, setLogoUrl]       = useState(settings.logoUrl || "");
  const [logoPreview, setLogoPreview] = useState(settings.logoUrl || "");
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (max 200KB)
    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file (PNG, JPG, SVG).");
      return;
    }
    if (file.size > 200 * 1024) {
      setLogoError("Image must be under 200KB.");
      return;
    }
    setLogoError("");

    // Convert to base64 data URL for storage
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoUrl(dataUrl);
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoUrl("");
    setLogoPreview("");
    setLogoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Logo display in preview: image or fallback emoji
  const previewLogo = logoPreview
    ? <img src={logoPreview} alt="logo" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />
    : <span style={{ fontSize: 20 }}>🤝</span>;

  return (
    <s-page heading="Widget Settings">

      {actionData?.saved && (
        <s-banner tone="success" title="Saved">Settings saved successfully.</s-banner>
      )}

      <Form method="POST">
        {/* Hidden field for logo URL (base64 or URL) */}
        <input type="hidden" name="logoUrl" value={logoUrl} />

        {/* ── Bot Identity ─────────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Bot Identity</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="botName">Bot Name</label>
              <input id="botName" name="botName" style={fieldStyle} type="text"
                value={botName} onChange={(e) => setBotName(e.target.value)} />
              <p style={hintStyle}>Name shown to customers in the chat widget</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="tone">Tone</label>
              <select id="tone" name="tone" style={{ ...fieldStyle, height: 38 }} value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="friendly">Friendly — casual and warm</option>
                <option value="professional">Professional — formal and direct</option>
                <option value="enthusiastic">Enthusiastic — high-energy and fun</option>
              </select>
              <p style={hintStyle}>How the bot communicates with customers</p>
            </div>
          </div>
        </div>

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Widget Logo</h2>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>

            {/* Current logo preview */}
            <div style={{
              width: 72, height: 72, borderRadius: 12, border: "2px solid #e1e3e5",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: color, flexShrink: 0, overflow: "hidden",
            }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 32 }}>🤝</span>}
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Upload Logo Image</label>
              <p style={{ ...hintStyle, marginBottom: 10 }}>PNG, JPG or SVG · Max 200KB · Recommended: 64×64px square</p>

              {/* URL input */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelStyle, fontSize: 12 }}>Or paste image URL</label>
                <input
                  type="url"
                  placeholder="https://your-cdn.com/logo.png"
                  style={{ ...fieldStyle, marginBottom: 4 }}
                  value={logoUrl.startsWith("data:") ? "" : logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    setLogoPreview(e.target.value);
                  }}
                />
              </div>

              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleLogoFile}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "7px 16px", border: "1px solid #c9cccf", borderRadius: 6,
                    background: "#fff", fontSize: 13, cursor: "pointer",
                  }}>
                  📁 Upload Image
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={clearLogo}
                    style={{
                      padding: "7px 16px", border: "1px solid #c9cccf", borderRadius: 6,
                      background: "#fff", fontSize: 13, cursor: "pointer", color: "#d72c0d",
                    }}>
                    ✕ Remove
                  </button>
                )}
              </div>
              {logoError && <p style={{ color: "#d72c0d", fontSize: 12, marginTop: 6 }}>{logoError}</p>}
              <p style={hintStyle}>If no logo, the default 🤝 emoji will be shown.</p>
            </div>
          </div>
        </div>

        {/* ── Appearance ───────────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Appearance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "end" }}>
            <div>
              <label style={labelStyle} htmlFor="primaryColor">Primary Colour</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input id="primaryColor" name="primaryColor" type="color"
                  value={color} onChange={(e) => setColor(e.target.value)}
                  style={{ width: 48, height: 38, border: "1px solid #c9cccf", borderRadius: 6, cursor: "pointer", padding: 2 }} />
                <code style={{ fontSize: 13 }}>{color}</code>
              </div>
              <p style={hintStyle}>Widget header and button colour</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="position">Widget Position</label>
              <select id="position" name="position" style={{ ...fieldStyle, maxWidth: 220, height: 38 }} value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Opening Message ───────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Opening Message</h2>
          <label style={labelStyle} htmlFor="greeting">Greeting Message</label>
          <textarea id="greeting" name="greeting" rows={3}
            style={{ ...fieldStyle, resize: "vertical" }}
            value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          <p style={hintStyle}>First message customers see when opening the chat widget</p>
        </div>

        {/* ── Live Preview ──────────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Preview</h2>
          <p style={{ fontSize: 13, color: "#6d7175", marginTop: 0 }}>Live preview of the chat widget.</p>
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 10, maxWidth: 300, overflow: "hidden" }}>
            <div style={{ background: color, color: "#fff", padding: "12px 16px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              {previewLogo}
              <span>{botName}</span>
            </div>
            <div style={{ padding: "12px 14px", background: "#f6f6f7" }}>
              <div style={{ background: "#fff", border: "1px solid #e4e4e4", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                {greeting}
              </div>
            </div>
          </div>
          {/* FAB preview */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,.2)",
            }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />
                : <span style={{ fontSize: 22 }}>🤝</span>}
            </div>
            <span style={{ fontSize: 12, color: "#6d7175" }}>Floating button (bottom-right)</span>
          </div>
        </div>

        {/* ── Proactive Trigger Settings (BUG-43) ─────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Proactive Trigger</h2>
          <p style={{ fontSize: 13, color: "#6d7175", marginTop: 0, marginBottom: 16 }}>
            Automatically prompt visitors after they spend time on a product page.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="checkbox"
                id="proactiveTrigger"
                name="proactiveTrigger"
                value="true"
                defaultChecked={settings.proactiveTrigger ?? true}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="proactiveTrigger" style={{ fontSize: 14, cursor: "pointer" }}>
                Enable Proactive Trigger
              </label>
            </div>
            <div style={{ maxWidth: 280 }}>
              <label style={labelStyle} htmlFor="proactiveDelay">
                Trigger Delay: <strong>{settings.proactiveDelay ?? 30}s</strong>
              </label>
              <input
                id="proactiveDelay"
                name="proactiveDelay"
                type="range"
                min={5} max={120} step={5}
                defaultValue={settings.proactiveDelay ?? 30}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6d7175" }}>
                <span>5s</span><span>60s</span><span>120s</span>
              </div>
              <p style={hintStyle}>Seconds after page load before the tooltip appears</p>
            </div>
            <div>
              <label style={labelStyle} htmlFor="proactiveMessage">Trigger Message</label>
              <input
                id="proactiveMessage"
                name="proactiveMessage"
                type="text"
                style={{ ...fieldStyle, maxWidth: 360 }}
                defaultValue={settings.proactiveMessage ?? "Psst — want a deal? 👀"}
              />
              <p style={hintStyle}>Message shown in the tooltip bubble</p>
            </div>
          </div>
        </div>

        <button type="submit"
          style={{ padding: "10px 24px", background: "#008060", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </button>

      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
