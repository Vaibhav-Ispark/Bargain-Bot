/**
 * BargainBot — Floating Chat Widget v8
 * - Captures customer email before bargaining starts
 * - Detects logged-in customer email from Shopify meta tags
 * - Discount code locked to that email, single-use only
 */
(function () {
  "use strict";

  console.log("[BargainBot] v8 loaded");

  var cfg = window.BargainBotConfig;
  if (!cfg || !cfg.shop) { console.warn("[BargainBot] No config"); return; }

  var pid = String(cfg.productId || "").replace("gid://shopify/Product/", "").trim();
  if (!pid || pid === "0") { console.log("[BargainBot] Not a product page"); return; }

  var BASE = (cfg.appUrl || "").replace(/\/$/, "");
  // BASE is used for reference only — all API calls go through the Shopify app proxy
  console.log("[BargainBot] Init for product", pid);
  /* ── State ─────────────────────────────────────────────────────────────── */
  var sessionId      = null;
  var sessionEnded   = false;
  var isBusy         = false;
  var isOpen         = false;
  var configured     = false;
  var enabled        = false;
  var configChecked  = false;  // true once the config API has been called

  var color    = "#008060";
  var botName  = "BargainBot";
  var logoUrl  = "";
  var greeting = "";

  // Email: check sessionStorage first (persists within tab, clears on tab close)
  var SESSION_EMAIL_KEY = "bb_email_" + (cfg.shop || "");
  var customerEmail = (function() {
    try { return sessionStorage.getItem(SESSION_EMAIL_KEY) || null; } catch(e) { return null; }
  })();

  /* ── Detect logged-in customer ──────────────────────────────────────────── */
  function getShopifyCustomerEmail() {
    // Shopify renders customer email in a meta tag when logged in
    var m = document.querySelector('meta[name="shopify:customer-email"]');
    if (m && m.content) return m.content.trim().toLowerCase();
    // Fallback: check for customer JSON in page (some themes)
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.page) {
      var email = window.ShopifyAnalytics.meta.page.customerId;
      if (email && email.includes("@")) return email.toLowerCase();
    }
    return null;
  }

  function getCustomerId() {
    var m = document.querySelector('meta[name="shopify:customer-id"]');
    return m ? m.content : null;
  }

  function getVariantId() {
    // BUG-36 FIX: read at call time from the currently active/selected input
    // Check for selected variant via select element first (most themes)
    var select = document.querySelector("form[action*='/cart/add'] select[name='id']");
    if (select && select.value) return select.value;
    // Then check radio (some themes use radio buttons for variants)
    var radio = document.querySelector("form[action*='/cart/add'] input[name='id']:checked");
    if (radio) return radio.value;
    // Fallback: hidden input (default variant)
    var form = document.querySelector("form[action*='/cart/add']");
    var inp  = form && form.querySelector("input[name='id']");
    return inp ? inp.value : null;
  }

  /* ── API ────────────────────────────────────────────────────────────────── */
  // Use Shopify app proxy — served from the store domain, no CORS issues.
  // Route format must match app-proxy.tsx: widget/config, bargain/start, etc.
  var PROXY = "/apps/bargainbot";

  function post(path, body) {
    // Strip leading slash and any "api/" prefix — proxy routes don't use it
    var route = path.replace(/^\//, "").replace(/^api\//, "");
    var url   = PROXY + "?bb_route=" + encodeURIComponent(route);
    console.log("[BargainBot] POST", url, body);
    return fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).then(function (r) {
      console.log("[BargainBot] Response", r.status, url);
      if (!r.ok) return r.text().then(function (t) {
        console.error("[BargainBot] Error body:", t);
        throw new Error(r.status + ": " + t);
      });
      return r.json();
    });
  }

  /* ── Logo helpers ───────────────────────────────────────────────────────── */
  function logoHTML(size) {
    if (logoUrl) {
      return '<img src="' + logoUrl + '" alt="logo" style="width:' + size + 'px;height:' + size + 'px;border-radius:5px;object-fit:cover;">';
    }
    return '<span style="font-size:' + Math.round(size * 0.7) + 'px">🤝</span>';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function g(id) { return document.getElementById(id); }

  /* ── Build widget ───────────────────────────────────────────────────────── */
  function buildWidget() {
    if (!document.body) { console.error("[BargainBot] body not ready"); return; }

    var style = document.createElement("style");
    style.textContent = [
      /* FAB */
      "#bb-fab{position:fixed;bottom:24px;right:24px;width:60px;height:60px;",
      "border-radius:50%;border:none;cursor:pointer;background:" + color + ";",
      "color:#fff;display:flex;align-items:center;justify-content:center;",
      "box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:2147483646;",
      "transition:transform .18s,box-shadow .18s;}",
      "#bb-fab:hover{transform:scale(1.08);}",
      "#bb-fab.bb-left{right:auto;left:24px;}",
      /* Window */
      "#bb-win{position:fixed;bottom:96px;right:24px;width:360px;",
      "max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);",
      "background:#fff;border-radius:16px;",
      "box-shadow:0 8px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;",
      "z-index:2147483647;font-size:14px;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
      "transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .2s;",
      "transform-origin:bottom right;}",
      "#bb-win.bb-left{right:auto;left:24px;}",
      "#bb-win.bb-off{transform:scale(.88) translateY(16px);opacity:0;pointer-events:none;}",
      /* Header */
      "#bb-hdr{display:flex;align-items:center;gap:10px;padding:14px 16px;",
      "border-radius:16px 16px 0 0;background:" + color + ";color:#fff;flex-shrink:0;}",
      "#bb-hdr em{flex:1;font-weight:700;font-size:16px;font-style:normal;}",
      "#bb-hdr button{background:none;border:none;color:rgba(255,255,255,.85);",
      "font-size:22px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:4px;}",
      /* Email screen */
      "#bb-email-screen{flex:1;display:flex;flex-direction:column;justify-content:center;",
      "align-items:center;padding:28px 24px;background:#f6f6f7;gap:12px;}",
      "#bb-email-screen h3{margin:0;font-size:15px;font-weight:700;color:#202223;text-align:center;}",
      "#bb-email-screen p{margin:0;font-size:13px;color:#6d7175;text-align:center;line-height:1.5;}",
      "#bb-email-inp{width:100%;padding:10px 14px;font-size:14px;border:1.5px solid #c9cccf;",
      "border-radius:8px;outline:none;box-sizing:border-box;font-family:inherit;}",
      "#bb-email-inp:focus{border-color:" + color + ";}",
      "#bb-email-btn{width:100%;padding:11px;border:none;border-radius:8px;",
      "background:" + color + ";color:#fff;font-size:14px;font-weight:700;cursor:pointer;}",
      "#bb-email-err{color:#d72c0d;font-size:12px;margin:0;text-align:center;}",
      /* Messages */
      "#bb-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;",
      "flex-direction:column;gap:8px;background:#f6f6f7;}",
      ".bb-b,.bb-c{max-width:80%;padding:9px 13px;border-radius:14px;",
      "line-height:1.5;word-break:break-word;font-size:13.5px;}",
      ".bb-b{align-self:flex-start;background:#fff;border:1px solid #e4e4e4;",
      "border-bottom-left-radius:4px;color:#202223;}",
      ".bb-c{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;",
      "background:" + color + ";}",
      /* Typing */
      "#bb-dots{display:none;align-items:center;gap:4px;padding:8px 16px;background:#f6f6f7;}",
      ".bb-d{width:7px;height:7px;border-radius:50%;background:#adb5bd;",
      "display:inline-block;animation:bbd 1.2s infinite;}",
      ".bb-d:nth-child(2){animation-delay:.2s;}.bb-d:nth-child(3){animation-delay:.4s;}",
      "@keyframes bbd{0%,80%,100%{transform:scale(.7);opacity:.4;}40%{transform:scale(1);opacity:1;}}",
      /* Deal banner */
      "#bb-deal{display:none;flex-direction:column;gap:8px;margin:8px 12px;",
      "padding:12px;background:#e6f6ee;border:1px solid #b5dfc6;border-radius:10px;}",
      "#bb-code{font-size:20px;font-weight:800;letter-spacing:3px;color:#1a6637;",
      "text-align:center;background:#fff;border:1.5px dashed #b5dfc6;border-radius:6px;",
      "padding:8px;cursor:pointer;user-select:all;}",
      "#bb-code-note{font-size:11px;color:#6d7175;text-align:center;margin:0;}",
      "#bb-go{border:none;border-radius:7px;color:#fff;padding:10px 14px;font-size:14px;",
      "font-weight:700;cursor:pointer;background:" + color + ";}",
      /* Status / input */
      "#bb-st{padding:4px 14px;font-size:12px;min-height:20px;color:#6d7175;background:#fff;flex-shrink:0;}",
      "#bb-row{display:flex;gap:8px;padding:10px 12px 14px;border-top:1px solid #e8e8e8;background:#fff;flex-shrink:0;}",
      "#bb-inp{flex:1;border:1.5px solid #c9cccf;border-radius:8px;padding:8px 12px;",
      "font-size:14px;resize:none;outline:none;line-height:1.4;font-family:inherit;",
      "transition:border-color .15s;}",
      "#bb-inp:focus{border-color:" + color + ";}",
      "#bb-send{width:38px;height:38px;border:none;border-radius:8px;cursor:pointer;",
      "display:flex;align-items:center;justify-content:center;flex-shrink:0;",
      "background:" + color + ";}",
      "@media(max-width:480px){#bb-win{width:calc(100vw - 16px);right:8px !important;left:8px !important;bottom:88px;}}",
    ].join("");
    if (document.head) document.head.appendChild(style);

    /* FAB — hidden by default until config confirms bargaining is enabled */
    var fab = document.createElement("button");
    fab.id = "bb-fab";
    fab.setAttribute("aria-label", "Negotiate with " + botName);
    fab.setAttribute("title", "Negotiate price");
    fab.innerHTML = logoHTML(30);
    fab.style.display = "none";  // hidden until checkConfig() confirms enabled
    if (cfg.position === "bottom-left") fab.classList.add("bb-left");
    fab.addEventListener("click", onFabClick);
    document.body.appendChild(fab);

    /* Window */
    var win = document.createElement("div");
    win.id = "bb-win";
    win.className = "bb-off";
    if (cfg.position === "bottom-left") win.classList.add("bb-left");
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-modal", "true");
    win.setAttribute("aria-label", botName + " price negotiation");
    win.innerHTML =
      /* Header */
      '<div id="bb-hdr">' +
        '<span id="bb-logo-el">' + logoHTML(26) + '</span>' +
        '<em id="bb-name">' + esc(botName) + '</em>' +
        '<button id="bb-close" aria-label="Close">&#x2715;</button>' +
      '</div>' +
      /* Email capture screen (shown first) */
      '<div id="bb-email-screen">' +
        logoHTML(48) +
        '<h3>Let\'s make a deal! 🤝</h3>' +
        '<p>Enter your email to start negotiating.<br>Your discount code will be reserved just for you.</p>' +
        '<input id="bb-email-inp" type="email" placeholder="your@email.com" autocomplete="email" />' +
        '<p id="bb-email-err" style="display:none"></p>' +
        '<button id="bb-email-btn">Start Bargaining →</button>' +
      '</div>' +
      /* Chat area (hidden until email collected) */
      '<div id="bb-chat-area" style="display:none;flex:1;flex-direction:column;overflow:hidden;">' +
        '<div id="bb-msgs" role="log" aria-live="polite"></div>' +
        '<div id="bb-dots">' +
          '<span class="bb-d"></span><span class="bb-d"></span><span class="bb-d"></span>' +
        '</div>' +
        '<div id="bb-deal">' +
          '<p style="margin:0;font-weight:600;color:#1a6637;font-size:13px">🎉 Deal locked! Your discount code:</p>' +
          '<div id="bb-code" title="Click to copy"></div>' +
          '<p id="bb-code-note"></p>' +
          '<button id="bb-go">Go to Checkout →</button>' +
        '</div>' +
        '<div id="bb-st"></div>' +
        '<div id="bb-row">' +
          '<textarea id="bb-inp" rows="1" placeholder="e.g. I want 10 units…" aria-label="Message"></textarea>' +
          '<button id="bb-send" aria-label="Send">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">' +
              '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(win);

    /* Wire events */
    g("bb-close").addEventListener("click", closeChat);
    g("bb-email-btn").addEventListener("click", submitEmail);
    g("bb-email-inp").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submitEmail(); }
    });

    var sendBtn = g("bb-send");
    var inp     = g("bb-inp");
    var codeEl  = g("bb-code");
    if (sendBtn) sendBtn.addEventListener("click", sendMsg);
    if (inp) {
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
      });
      inp.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 100) + "px";
      });
    }
    if (codeEl) codeEl.addEventListener("click", copyCode);

    console.log("[BargainBot] Widget rendered");
  }

  /* ── Check config on page load — show FAB only if enabled ──────────────── */
  function checkConfig() {
    if (configChecked) return;
    configChecked = true;

    console.log("[BargainBot] checkConfig() — shop:", cfg.shop, "productId:", cfg.productId);

    post("/api/widget/config", { shop: cfg.shop, productId: cfg.productId })
      .then(function (d) {
        console.log("[BargainBot] config response:", JSON.stringify(d));
        if (!d.enabled) {
          console.log("[BargainBot] Bargaining NOT enabled for this product — FAB hidden");
          return;
        }

        enabled    = true;
        configured = true;

        if (d.widget) {
          if (d.widget.primaryColor)     updateColor(d.widget.primaryColor);
          if (d.widget.botName)          updateName(d.widget.botName);
          if (d.widget.logoUrl)          updateLogo(d.widget.logoUrl);
          if (d.widget.greeting)         greeting = d.widget.greeting;
          if (d.widget.proactiveTrigger !== undefined) cfg.proactiveTrigger = d.widget.proactiveTrigger;
          if (d.widget.proactiveDelay)   cfg.proactiveDelay   = d.widget.proactiveDelay;
          if (d.widget.proactiveMessage) cfg.proactiveMessage = d.widget.proactiveMessage;
        }

        var fab = g("bb-fab");
        console.log("[BargainBot] Showing FAB — element found:", !!fab);
        if (fab) fab.style.display = "flex";

        setupProactiveTrigger();
        console.log("[BargainBot] ✅ FAB now visible");
      })
      .catch(function (err) {
        console.error("[BargainBot] ❌ checkConfig FAILED:", err.message);
      });
  }

  /* ── FAB click ──────────────────────────────────────────────────────────── */
  function onFabClick() {
    // Config is already checked on page load — FAB is only visible if enabled
    if (!enabled) return;
    toggleChat();
  }

  /* ── Open / Close ───────────────────────────────────────────────────────── */
  function toggleChat() { isOpen ? closeChat() : openChat(); }

  function openChat() {
    isOpen = true;
    var win = g("bb-win");
    if (win) win.classList.remove("bb-off");
    var fab = g("bb-fab");
    if (fab) fab.innerHTML = '<span style="font-size:22px;line-height:1;">&#x2715;</span>';

    // If we have an active session already, just show the chat
    if (sessionId && !sessionEnded) return;

    // Session ended (deal done / walked away) — reset for a fresh negotiation
    if (sessionEnded) {
      resetForNewSession();
    }

    // Now decide: skip email screen or show it?
    var knownEmail = customerEmail || getShopifyCustomerEmail();
    if (knownEmail) {
      customerEmail = knownEmail;
      try { sessionStorage.setItem(SESSION_EMAIL_KEY, knownEmail); } catch(e) {}
      var emailInp = g("bb-email-inp");
      if (emailInp) emailInp.value = knownEmail;
      showChatArea();
      if (!isBusy) startSession();
    } else {
      // No email known — show the email capture screen
      showEmailScreen();
    }
  }

  /* ── Reset all chat state for a new session ─────────────────────────────── */
  function resetForNewSession() {
    sessionId    = null;
    sessionEnded = false;
    isBusy       = false;

    // Clear messages
    var msgs = g("bb-msgs");
    if (msgs) msgs.innerHTML = "";

    // Hide deal banner
    var deal = g("bb-deal");
    if (deal) deal.style.display = "none";

    // Clear status
    setStatus("", false);

    // Re-enable input
    var inp = g("bb-inp");
    var btn = g("bb-send");
    if (inp) { inp.disabled = false; inp.placeholder = "e.g. I want 10 units…"; inp.value = ""; inp.style.height = "auto"; }
    if (btn) btn.disabled = false;

    // Reset email screen button
    var emailBtn = g("bb-email-btn");
    if (emailBtn) emailBtn.disabled = false;
    var emailErr = g("bb-email-err");
    if (emailErr) { emailErr.style.display = "none"; emailErr.textContent = ""; }
  }

  function closeChat() {
    isOpen = false;
    var win = g("bb-win");
    if (win) win.classList.add("bb-off");
    var fab = g("bb-fab");
    if (fab) fab.innerHTML = logoHTML(30);
  }

  /* ── Email screen ───────────────────────────────────────────────────────── */
  function showEmailScreen() {
    var es = g("bb-email-screen");
    var ca = g("bb-chat-area");
    if (es) { es.style.display = "flex"; es.style.flexDirection = "column"; }
    if (ca) ca.style.display = "none";
  }

  function showChatArea() {
    var es = g("bb-email-screen");
    var ca = g("bb-chat-area");
    if (es) es.style.display = "none";
    if (ca) { ca.style.display = "flex"; ca.style.flexDirection = "column"; ca.style.flex = "1"; ca.style.overflow = "hidden"; }
  }

  function submitEmail() {
    var inp   = g("bb-email-inp");
    var errEl = g("bb-email-err");
    var btn   = g("bb-email-btn");
    var email = inp ? inp.value.trim().toLowerCase() : "";

    // Basic validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) { errEl.textContent = "Please enter a valid email address."; errEl.style.display = "block"; }
      return;
    }
    if (errEl) errEl.style.display = "none";
    if (btn)   btn.disabled = true;

    customerEmail = email;
    // Persist email in sessionStorage so we don't ask again within this tab
    try { sessionStorage.setItem(SESSION_EMAIL_KEY, email); } catch(e) {}

    // If session exists already, just save email
    if (sessionId) {
      post("/api/bargain/email", { sessionId: sessionId, email: customerEmail })
        .then(function () { showChatArea(); focusInput(); })
        .catch(function () { showChatArea(); focusInput(); });
      return;
    }

    // Otherwise start session with email
    showChatArea();
    startSession();
  }

  /* ── Session ────────────────────────────────────────────────────────────── */
  function startSession() {
    isBusy = true; dots(true);
    // Make sure we're showing chat area, not email screen
    showChatArea();
    
    post("/api/bargain/start", {
      shop:          cfg.shop,
      productId:     cfg.productId,
      customerId:    getCustomerId(),
      customerEmail: customerEmail,
    }).then(function (d) {
      if (d.error) {
        // Stay on chat area, show error — do NOT go back to email screen
        setStatus(d.error, true);
        return;
      }
      sessionId = d.sessionId;
      setStatus("", false);
      addMsg("bot", greeting || d.greeting);
      focusInput();
    }).catch(function (e) {
      console.error("[BargainBot] session start:", e);
      // Stay on chat area, show retry message — do NOT go back to email screen
      setStatus("Connection failed. Please try again.", true);
      // Add a retry button message
      addMsg("bot", "Having trouble connecting. Please check your network and try sending a message.");
    }).finally(function () { dots(false); isBusy = false; });
  }

  /* ── Send ───────────────────────────────────────────────────────────────── */
  function sendMsg() {
    if (isBusy) return;
    if (sessionEnded) {
      setStatus("This negotiation has ended. Tap 🤝 to start a new one.", false);
      return;
    }
    var inp = g("bb-inp");
    var txt = inp ? inp.value.trim() : "";
    if (!txt) return;

    // If no session yet (e.g. after a connection error), retry starting one
    if (!sessionId) {
      startSession();
      return;
    }

    addMsg("customer", txt);
    inp.value = ""; inp.style.height = "auto";
    setStatus(""); dots(true); isBusy = true;

    post("/api/bargain/message", { sessionId: sessionId, message: txt })
      .then(function (d) {
        if (d.error) { setStatus(d.error, true); return; }
        addMsg("bot", d.response);

        if (d.sessionExpired) {
          // Customer walked away — polite goodbye, lock and auto-close
          endSession("walked-away");
        } else if (d.dealClosed) {
          // Bot says deal is agreed — now generate the discount code
          generateDealCode();
        }
      })
      .catch(function (e) {
        console.error("[BargainBot] message:", e);
        setStatus("Something went wrong. Please try again.", true);
      })
      .finally(function () { dots(false); isBusy = false; focusInput(); });
  }

  /* ── End session (walk-away or final rejection) ─────────────────────────── */
  function endSession(reason) {
    sessionEnded = true;
    lockInput();
    setStatus(
      reason === "walked-away"
        ? "Chat closed · Tap 🤝 to start a new negotiation"
        : "Session ended · Tap 🤝 to negotiate again",
      false
    );
    // Auto-close the panel after 3.5 seconds
    // Email is intentionally KEPT in sessionStorage — don't ask again
    setTimeout(function () {
      closeChat();
      // sessionEnded stays true so openChat knows to resetForNewSession on next open
    }, 3500);
  }

  /* ── Generate discount code after deal accepted ─────────────────────────── */
  function generateDealCode() {
    isBusy = true; dots(true);
    post("/api/bargain/close", { sessionId: sessionId, shop: cfg.shop })
      .then(function (d) {
        if (d.error) {
          setStatus("Couldn't generate your code: " + d.error, true);
          return;
        }
        showDealBanner(d.discountCode, d.finalQty, d.lockedToEmail);
        lockInput();
        sessionEnded = true;
        setStatus("Deal locked! 🎉 Tap 🤝 to negotiate a new deal anytime.", false);
      })
      .catch(function (e) {
        console.error("[BargainBot] close:", e);
        setStatus("Failed to generate discount code. Please try again.", true);
      })
      .finally(function () { dots(false); isBusy = false; });
  }

  /* ── UI helpers ─────────────────────────────────────────────────────────── */
  function addMsg(role, text) {
    var box = g("bb-msgs"); if (!box) return;
    var el = document.createElement("div");
    el.className = role === "bot" ? "bb-b" : "bb-c";
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function dots(show) {
    var el = g("bb-dots");
    if (el) el.style.display = show ? "flex" : "none";
  }

  function setStatus(txt, isErr) {
    var el = g("bb-st"); if (!el) return;
    el.textContent = txt;
    el.style.color = isErr ? "#d72c0d" : "#6d7175";
  }

  function showDealBanner(code, qty, email) {
    var banner = g("bb-deal"), codeEl = g("bb-code"), noteEl = g("bb-code-note"), btn = g("bb-go");
    if (!banner || !codeEl) return;
    codeEl.textContent = code;
    if (noteEl) {
      noteEl.textContent = email
        ? "🔒 Locked to " + email + " · Single use only"
        : "🔒 Single use only";
    }
    if (btn) {
      var vid = getVariantId();
      btn.onclick = function () {
        // Upsell: ask once if they want more units before checkout
        var currentQty = qty;
        var wantMore = confirm(
          "Before you go — would you like to add more units at your discounted price?\n\n" +
          "Current deal: " + qty + " units at " + code + "\n\n" +
          "Click OK to increase quantity, or Cancel to proceed to checkout."
        );
        if (wantMore) {
          var newQty = parseInt(prompt("How many units would you like? (Current: " + qty + ")", qty) || qty, 10);
          if (newQty && newQty > qty) {
            currentQty = newQty;
          }
        }
        window.location.href = vid
          ? "/cart/" + vid + ":" + currentQty + "?discount=" + encodeURIComponent(code)
          : "/checkout?discount=" + encodeURIComponent(code);
      };
    }
    banner.style.display = "flex";
    banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function copyCode(e) {
    // BUG-37 FIX: use event.currentTarget instead of this for reliability
    var el = e.currentTarget || this;
    var code = el.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () {
        el.textContent = "✓ Copied!";
        setTimeout(function () { el.textContent = code; }, 2000);
      });
    }
  }

  function lockInput() {
    var inp = g("bb-inp"), btn = g("bb-send");
    if (inp) { inp.disabled = true; inp.placeholder = "Deal closed ✓"; }
    if (btn) btn.disabled = true;
  }

  function focusInput() {
    var inp = g("bb-inp");
    if (inp && !inp.disabled) setTimeout(function () { inp.focus(); }, 60);
  }

  /* ── Update helpers ─────────────────────────────────────────────────────── */
  function updateColor(c) {
    color = c;
    var fab = g("bb-fab"); if (fab) fab.style.background = c;
    var hdr = g("bb-hdr"); if (hdr) hdr.style.background = c;
    // BUG-34 FIX: reuse existing style tag, don't append a new one every time
    var s = document.getElementById("bb-color-override");
    if (!s) {
      s = document.createElement("style");
      s.id = "bb-color-override";
      if (document.head) document.head.appendChild(s);
    }
    s.textContent = ".bb-c{background:" + c + "!important;}"
      + "#bb-send,#bb-go,#bb-email-btn{background:" + c + "!important;}"
      + "#bb-inp:focus,#bb-email-inp:focus{border-color:" + c + "!important;}";
  }

  function updateName(n) {
    botName = n;
    var el = g("bb-name"); if (el) el.textContent = n;
  }

  function updateLogo(url) {
    logoUrl = url;
    var fab    = g("bb-fab");    if (fab)    fab.innerHTML = logoHTML(30);
    var logoEl = g("bb-logo-el"); if (logoEl) logoEl.innerHTML = logoHTML(26);
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */
  function init() {
    if (!document.body) { console.error("[BargainBot] body not available"); return; }
    buildWidget();
    // Check config immediately on load — FAB stays hidden until confirmed enabled
    checkConfig();
  }

  /* ── Proactive Trigger ──────────────────────────────────────────────────── */
  function setupProactiveTrigger() {
    // Liquid outputs boolean as true/false literals — handle both
    var enabled = cfg.proactiveTrigger === true || cfg.proactiveTrigger === "true";
    if (!enabled) return;

    var delay   = Math.max(5, parseInt(cfg.proactiveDelay, 10) || 30) * 1000;
    var message = cfg.proactiveMessage || "Psst — want a deal? 👀";
    var fired   = false;

    // Don't trigger if customer already opened widget
    var timer = setTimeout(function () {
      if (isOpen || fired) return;
      fired = true;
      showProactiveTooltip(message);
    }, delay);

    // Cancel if user clicked FAB before timer fires
    var fab = g("bb-fab");
    if (fab) {
      fab.addEventListener("click", function () {
        clearTimeout(timer);
        hideProactiveTooltip();
      }, { once: true });
    }
  }

  function showProactiveTooltip(message) {
    // Inject tooltip styles (BUG-35 FIX: arrow position via CSS classes, not cssText pseudo-selectors)
    if (!g("bb-tooltip-style")) {
      var s = document.createElement("style");
      s.id = "bb-tooltip-style";
      s.textContent = [
        "#bb-tooltip{position:fixed;z-index:2147483645;",
        "background:#202223;color:#fff;border-radius:10px;",
        "padding:10px 16px;font-size:13px;font-weight:500;",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
        "box-shadow:0 4px 20px rgba(0,0,0,.3);",
        "max-width:220px;line-height:1.4;",
        "animation:bb-tooltip-in .3s cubic-bezier(.34,1.56,.64,1);",
        "cursor:pointer;}",
        /* Arrow — right-aligned by default (bottom-right FAB) */
        "#bb-tooltip::after{content:'';position:absolute;bottom:-7px;right:16px;",
        "border:8px solid transparent;border-top-color:#202223;border-bottom:none;}",
        /* Arrow — left-aligned when FAB is bottom-left */
        "#bb-tooltip.bb-arrow-left::after{right:auto;left:16px;}",
        "@keyframes bb-tooltip-in{from{opacity:0;transform:scale(.85) translateY(8px);}to{opacity:1;transform:scale(1) translateY(0);}}",
        "@keyframes bb-pulse{0%,100%{box-shadow:0 4px 20px rgba(0,0,0,.25);}",
        "50%{box-shadow:0 0 0 10px rgba(0,128,96,.2),0 4px 20px rgba(0,0,0,.25);}}",
        "#bb-fab.bb-pulsing{animation:bb-pulse 1.5s ease-in-out infinite;}",
      ].join("");
      if (document.head) document.head.appendChild(s);
    }

    var fab = g("bb-fab");
    if (!fab) return;

    var rect   = fab.getBoundingClientRect();
    var isLeft = cfg.position === "bottom-left";

    var tip = document.createElement("div");
    tip.id  = "bb-tooltip";
    tip.textContent = message;

    // Position tooltip horizontally above the FAB
    if (isLeft) {
      tip.style.left  = "24px";
      tip.classList.add("bb-arrow-left"); // BUG-35 FIX: class-based arrow positioning
    } else {
      tip.style.right = "24px";
    }
    tip.style.bottom = (window.innerHeight - rect.top + 12) + "px";

    document.body.appendChild(tip);
    fab.classList.add("bb-pulsing");

    tip.addEventListener("click", function () {
      hideProactiveTooltip();
      onFabClick();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(hideProactiveTooltip, 8000);
  }

  function hideProactiveTooltip() {
    var tip = g("bb-tooltip");
    if (tip) tip.remove();
    var fab = g("bb-fab");
    if (fab) fab.classList.remove("bb-pulsing");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
