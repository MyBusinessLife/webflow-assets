document.documentElement.setAttribute("data-page", "restaurant-order");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblRestaurantOrderLoaded) return;
  window.__mblRestaurantOrderLoaded = true;

  let root =
    document.querySelector("[data-mbl-restaurant-order]") ||
    document.querySelector("#mbl-restaurant-order") ||
    null;

  if (!root) {
    root = document.createElement("div");
    root.setAttribute("data-mbl-restaurant-order", "1");
    (document.body || document.documentElement).appendChild(root);
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[RESTAURANT-ORDER]", ...a);
  const warn = (...a) => DEBUG && console.warn("[RESTAURANT-ORDER]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",

    DEFAULT_QUERY_KEY: String(root.dataset.queryKey || "loc").trim() || "loc",
    DEFAULT_SOURCE: String(root.dataset.source || "qr").trim() || "qr",
  };

  const STR = {
    title: "Commande en ligne",
    subtitle: "Compose ta commande et envoie-la en quelques secondes",
    loading: "Chargement du menu...",
    loadError: "Impossible de charger le menu pour ce QR code.",
    emptyCatalog: "Aucun article disponible pour le moment.",
    emptyCart: "Ton panier est vide.",
    submit: "Valider la commande",
    submitting: "Envoi...",
    success: "Commande envoyee",
    successHint: "Ta commande a bien ete enregistree.",
    sourceKiosk: "Borne",
    sourceQr: "QR",
  };

  const state = {
    supabase: null,
    locationSlug: "",
    source: "qr",

    location: null,
    categories: [],
    items: [],

    activeCategoryId: "all",
    search: "",

    cart: [],
    customer_name: "",
    table_label: "",
    note: "",

    lastOrder: null,
  };

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clean(input) {
    return String(input || "").trim().toLowerCase();
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function parseQty(value) {
    const n = Number(String(value || "").replace(",", "."));
    if (!Number.isFinite(n)) return 1;
    return Math.max(0.001, n);
  }

  function formatMoney(cents, currency = "EUR") {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" });
  }

  function resolveSource() {
    const q = clean(url.searchParams.get("src") || url.searchParams.get("source") || "");
    const base = clean(CONFIG.DEFAULT_SOURCE);
    const candidate = q || base;
    return candidate === "kiosk" ? "kiosk" : "qr";
  }

  function resolveLocationSlug() {
    const dataSlug = String(root.dataset.locationSlug || "").trim();
    if (dataSlug) return dataSlug;

    const keys = [
      String(root.dataset.queryKey || "").trim(),
      CONFIG.DEFAULT_QUERY_KEY,
      "location",
      "location_slug",
      "slug",
      "restaurant",
    ].filter(Boolean);

    for (const k of keys) {
      const v = String(url.searchParams.get(k) || "").trim();
      if (v) return v;
    }

    // Auto-detect generated dynamic query key (rk_xxxxx...).
    for (const [k, v] of url.searchParams.entries()) {
      if (/^rk_[a-z0-9_]{6,}$/i.test(String(k || "").trim())) {
        const value = String(v || "").trim();
        if (value) return value;
      }
    }

    // Last fallback: first non-technical param value.
    for (const [k, v] of url.searchParams.entries()) {
      const key = clean(k);
      if (!key) continue;
      if (key === "source" || key === "src") continue;
      if (key.startsWith("utm_")) continue;
      const value = String(v || "").trim();
      if (value) return value;
    }

    return "";
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
        existing.addEventListener(
          "load",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true }
        );
        existing.addEventListener(
          "error",
          () => {
            clearTimeout(t);
            reject(new Error("Echec chargement supabase-js"));
          },
          { once: true }
        );
      });
      return;
    }

    const s = document.createElement("script");
    s.src = CONFIG.SUPABASE_CDN;
    s.async = true;
    s.dataset.mblLib = "supabase";
    document.head.appendChild(s);

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
      s.addEventListener(
        "load",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
      s.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          reject(new Error("Echec chargement supabase-js"));
        },
        { once: true }
      );
    });
  }

  function getSupabase() {
    if (window.__MBL_SUPABASE_PUBLIC__) return window.__MBL_SUPABASE_PUBLIC__;
    if (!window.supabase?.createClient) return null;
    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    window.__MBL_SUPABASE_PUBLIC__ = client;
    return client;
  }

  function injectStyles() {
    if (document.getElementById("mbl-restaurant-order-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-restaurant-order-style";
    st.textContent = `
      html[data-page="restaurant-order"] .ro-shell,
      html[data-page="restaurant-order"] .ro-shell * { box-sizing: border-box; }

      html[data-page="restaurant-order"] .ro-shell {
        --ro-primary: #0ea5e9;
        --ro-text: rgba(2,6,23,0.90);
        --ro-muted: rgba(2,6,23,0.62);
        --ro-border: rgba(15,23,42,0.11);
        max-width: 1120px;
        margin: 0 auto;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--ro-border);
        background:
          radial-gradient(920px 540px at 10% 0%, rgba(14,165,233,0.14), transparent 58%),
          radial-gradient(920px 560px at 94% 6%, rgba(2,6,23,0.09), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.95));
        box-shadow: 0 22px 60px rgba(2,6,23,0.10);
        color: var(--ro-text);
      }

      html[data-page="restaurant-order"] .ro-head {
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 10px;
      }
      html[data-page="restaurant-order"] .ro-title { margin:0; font-size: 24px; font-weight: 1000; letter-spacing: -0.02em; }
      html[data-page="restaurant-order"] .ro-subtitle { margin: 4px 0 0; color: var(--ro-muted); font-weight: 800; }

      html[data-page="restaurant-order"] .ro-grid {
        margin-top: 12px;
        display:grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 12px;
      }

      html[data-page="restaurant-order"] .ro-card {
        border: 1px solid var(--ro-border);
        background: rgba(255,255,255,0.92);
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 14px 28px rgba(2,6,23,0.08);
      }

      html[data-page="restaurant-order"] .ro-card__title {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 1000;
      }

      html[data-page="restaurant-order"] .ro-alert {
        margin-top: 10px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(241,245,249,0.95);
        padding: 10px 12px;
        font-weight: 800;
      }
      html[data-page="restaurant-order"] .ro-alert.is-error {
        border-color: rgba(239,68,68,0.30);
        background: rgba(254,242,242,0.96);
        color: rgba(153,27,27,0.92);
      }
      html[data-page="restaurant-order"] .ro-alert.is-ok {
        border-color: rgba(34,197,94,0.30);
        background: rgba(240,253,244,0.96);
        color: rgba(21,128,61,0.92);
      }

      html[data-page="restaurant-order"] .ro-tabs {
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      html[data-page="restaurant-order"] .ro-tab {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.88);
        color: rgba(2,6,23,0.82);
        height: 36px;
        border-radius: 999px;
        padding: 0 12px;
        font-weight: 900;
        cursor: pointer;
      }
      html[data-page="restaurant-order"] .ro-tab[aria-selected="true"] {
        border-color: rgba(14,165,233,0.35);
        background: rgba(14,165,233,0.14);
        color: rgba(12,74,110,0.95);
      }

      html[data-page="restaurant-order"] .ro-input,
      html[data-page="restaurant-order"] .ro-textarea {
        width: 100%;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.96);
        border-radius: 12px;
        padding: 10px 12px;
        outline: none;
      }
      html[data-page="restaurant-order"] .ro-input { height: 40px; }
      html[data-page="restaurant-order"] .ro-textarea { min-height: 80px; resize: vertical; }
      html[data-page="restaurant-order"] .ro-input:focus,
      html[data-page="restaurant-order"] .ro-textarea:focus {
        border-color: rgba(14,165,233,0.42);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }

      html[data-page="restaurant-order"] .ro-btn {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.94);
        color: rgba(2,6,23,0.90);
        height: 40px;
        border-radius: 12px;
        padding: 0 12px;
        font-weight: 900;
        cursor: pointer;
      }
      html[data-page="restaurant-order"] .ro-btn--primary {
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        color: #fff;
        border-color: rgba(14,165,233,0.56);
      }
      html[data-page="restaurant-order"] .ro-btn:disabled {
        opacity: 0.64;
        cursor: not-allowed;
      }

      html[data-page="restaurant-order"] .ro-menu-grid {
        display:grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
        margin-top: 10px;
      }
      html[data-page="restaurant-order"] .ro-item {
        border: 1px solid rgba(15,23,42,0.11);
        border-radius: 13px;
        background: rgba(255,255,255,0.94);
        padding: 10px;
        display:grid;
        gap: 8px;
      }
      html[data-page="restaurant-order"] .ro-item__title {
        margin:0;
        font-size: 14px;
        font-weight: 950;
      }
      html[data-page="restaurant-order"] .ro-item__meta {
        font-size: 12px;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
      }

      html[data-page="restaurant-order"] .ro-cart-list {
        display:grid;
        gap: 8px;
      }
      html[data-page="restaurant-order"] .ro-cart-item {
        border: 1px solid rgba(15,23,42,0.12);
        border-radius: 12px;
        background: rgba(255,255,255,0.95);
        padding: 9px;
      }

      html[data-page="restaurant-order"] .ro-summary {
        margin-top: 10px;
        border-top: 1px dashed rgba(15,23,42,0.16);
        padding-top: 10px;
        display:grid;
        gap: 6px;
      }
      html[data-page="restaurant-order"] .ro-summary__line {
        display:flex;
        justify-content: space-between;
        align-items:center;
        font-weight: 900;
      }
      html[data-page="restaurant-order"] .ro-summary__line.total {
        font-size: 18px;
        color: rgba(12,74,110,0.95);
      }

      html[data-page="restaurant-order"] .ro-empty {
        border: 1px dashed rgba(15,23,42,0.22);
        border-radius: 12px;
        background: rgba(255,255,255,0.88);
        color: rgba(2,6,23,0.60);
        text-align: center;
        font-weight: 800;
        padding: 18px 10px;
      }

      @media (max-width: 980px) {
        html[data-page="restaurant-order"] .ro-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  function totalsFromCart() {
    const subtotal = state.cart.reduce((acc, line) => {
      const qty = Number(line.qty || 0);
      const unit = Number(line.price_cents || 0);
      return acc + Math.round(qty * unit);
    }, 0);

    const vat = state.cart.reduce((acc, line) => {
      const qty = Number(line.qty || 0);
      const unit = Number(line.price_cents || 0);
      const rate = Number(line.vat_rate || 0);
      return acc + Math.round(Math.round(qty * unit) * rate / 100);
    }, 0);

    return { subtotal, vat, total: subtotal + vat };
  }

  function filteredItems() {
    const q = clean(state.search);
    return state.items.filter((it) => {
      if (state.activeCategoryId !== "all" && String(it.category_id || "") !== String(state.activeCategoryId)) return false;
      if (!q) return true;
      const hay = clean([it.name, it.description, (it.allergen_tags || []).join(" ")].filter(Boolean).join(" "));
      return hay.includes(q);
    });
  }

  function addItemToCart(item) {
    const existing = state.cart.find((x) => String(x.menu_item_id || "") === String(item.id));
    if (existing) {
      existing.qty = Math.max(0.001, Number(existing.qty || 0) + 1);
      return;
    }

    state.cart.push({
      menu_item_id: String(item.id),
      name: String(item.name || "Article"),
      qty: 1,
      price_cents: Number(item.price_cents || 0),
      vat_rate: Number(item.vat_rate || 0),
    });
  }

  async function callCatalogRpc(slug) {
    const res = await state.supabase.rpc("get_public_restaurant_catalog", { p_location_slug: slug });
    if (!res.error) return res;

    // Fallback for older deployments where only schema-qualified function exists.
    const fallback = await state.supabase.rpc("app.get_public_restaurant_catalog", { p_location_slug: slug });
    return fallback;
  }

  async function callCreateOrderRpc(payload) {
    const res = await state.supabase.rpc("create_public_restaurant_order", payload);
    if (!res.error) return res;

    const fallback = await state.supabase.rpc("app.create_public_restaurant_order", payload);
    return fallback;
  }

  async function loadCatalog() {
    if (!state.locationSlug) throw new Error("QR invalide: location manquante.");

    const res = await callCatalogRpc(state.locationSlug);
    if (res.error) throw res.error;

    const payload = res.data && typeof res.data === "object" ? res.data : {};
    if (!payload.ok) throw new Error(payload.error || STR.loadError);

    state.location = payload.location || null;
    state.categories = Array.isArray(payload.categories) ? payload.categories : [];
    state.items = Array.isArray(payload.items) ? payload.items : [];
  }

  function renderLoading() {
    root.innerHTML = `
      <section class="ro-shell">
        <div class="ro-alert">${escapeHTML(STR.loading)}</div>
      </section>
    `;
  }

  function renderError(msg) {
    root.innerHTML = `
      <section class="ro-shell">
        <div class="ro-alert is-error">${escapeHTML(msg || STR.loadError)}</div>
      </section>
    `;
  }

  function renderApp() {
    const totals = totalsFromCart();
    const items = filteredItems();
    const currency = String(state.location?.currency || "EUR");

    root.innerHTML = `
      <section class="ro-shell">
        <header class="ro-head">
          <div>
            <h1 class="ro-title">${escapeHTML(STR.title)}</h1>
            <p class="ro-subtitle">${escapeHTML(state.location?.name || "Restaurant")}</p>
            ${state.location?.notes ? `<p class="ro-subtitle" style="margin-top:4px;">${escapeHTML(state.location.notes)}</p>` : ""}
          </div>
          <div class="ro-alert" style="display:block;">
            Source: ${escapeHTML(state.source === "kiosk" ? STR.sourceKiosk : STR.sourceQr)}
          </div>
        </header>

        <div class="ro-grid">
          <section class="ro-card" data-panel-menu>
            <h3 class="ro-card__title">Menu</h3>

            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input class="ro-input" style="flex:1 1 260px;" data-k="search" placeholder="Rechercher un plat..." value="${escapeHTML(state.search)}" />
            </div>

            <div class="ro-tabs" style="margin-top:10px;" data-categories>
              <button class="ro-tab" data-category="all" aria-selected="${state.activeCategoryId === "all" ? "true" : "false"}">Tous</button>
              ${state.categories
                .map(
                  (c) =>
                    `<button class="ro-tab" data-category="${escapeHTML(c.id)}" aria-selected="${String(state.activeCategoryId) === String(c.id) ? "true" : "false"}">${escapeHTML(
                      c.name
                    )}</button>`
                )
                .join("")}
            </div>

            <div class="ro-menu-grid" data-menu-grid>
              ${
                items.length
                  ? items
                      .map(
                        (it) => `
                        <article class="ro-item" data-item-id="${escapeHTML(it.id)}">
                          <div>
                            <h4 class="ro-item__title">${escapeHTML(it.name)}</h4>
                            ${it.description ? `<div class="ro-item__meta">${escapeHTML(it.description)}</div>` : ""}
                          </div>
                          <div class="ro-item__meta">TVA ${escapeHTML(String(it.vat_rate || 0))}%</div>
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <strong>${escapeHTML(formatMoney(it.price_cents, currency))}</strong>
                            <button type="button" class="ro-btn ro-btn--primary" data-action="add">Ajouter</button>
                          </div>
                        </article>
                      `
                      )
                      .join("")
                  : `<div class="ro-empty">${escapeHTML(STR.emptyCatalog)}</div>`
              }
            </div>
          </section>

          <section class="ro-card" data-panel-cart>
            <h3 class="ro-card__title">Panier</h3>

            <div class="ro-cart-list" data-cart-list>
              ${
                state.cart.length
                  ? state.cart
                      .map(
                        (line, idx) => `
                          <article class="ro-cart-item" data-line-index="${idx}">
                            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                              <div>
                                <strong>${escapeHTML(line.name)}</strong>
                                <div class="ro-item__meta" style="margin-top:2px;">${escapeHTML(
                                  formatMoney(Number(line.price_cents || 0), currency)
                                )}</div>
                              </div>
                              <strong>${escapeHTML(formatMoney(Math.round(Number(line.qty || 0) * Number(line.price_cents || 0)), currency))}</strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;">
                              <div style="display:inline-flex;align-items:center;gap:4px;">
                                <button type="button" class="ro-btn" style="height:28px;" data-action="minus">-</button>
                                <input class="ro-input" style="height:28px;width:70px;text-align:center;padding:0 8px;" type="number" step="0.001" value="${escapeHTML(
                                  String(line.qty || 1)
                                )}" data-action="qty" />
                                <button type="button" class="ro-btn" style="height:28px;" data-action="plus">+</button>
                              </div>
                              <button type="button" class="ro-btn" style="height:28px;" data-action="remove">Retirer</button>
                            </div>
                          </article>
                        `
                      )
                      .join("")
                  : `<div class="ro-empty">${escapeHTML(STR.emptyCart)}</div>`
              }
            </div>

            <div class="ro-summary">
              <div class="ro-summary__line"><span>Sous-total HT</span><span>${escapeHTML(formatMoney(totals.subtotal, currency))}</span></div>
              <div class="ro-summary__line"><span>TVA</span><span>${escapeHTML(formatMoney(totals.vat, currency))}</span></div>
              <div class="ro-summary__line total"><span>Total TTC</span><span>${escapeHTML(formatMoney(totals.total, currency))}</span></div>
            </div>

            <div style="display:grid;gap:8px;margin-top:10px;">
              <label>
                <div class="ro-item__meta">Nom</div>
                <input class="ro-input" data-k="customer_name" value="${escapeHTML(state.customer_name)}" />
              </label>
              <label>
                <div class="ro-item__meta">Table / repere</div>
                <input class="ro-input" data-k="table_label" value="${escapeHTML(state.table_label)}" />
              </label>
              <label>
                <div class="ro-item__meta">Commentaire</div>
                <textarea class="ro-textarea" data-k="note">${escapeHTML(state.note)}</textarea>
              </label>

              <button type="button" class="ro-btn ro-btn--primary" data-action="submit" ${state.cart.length ? "" : "disabled"}>${escapeHTML(
      STR.submit
    )}</button>
            </div>

            ${
              state.lastOrder
                ? `<div class="ro-alert is-ok" style="margin-top:10px;">${escapeHTML(STR.success)}: ${escapeHTML(
                    state.lastOrder.reference || state.lastOrder.id
                  )}<br/>${escapeHTML(STR.successHint)}</div>`
                : ""
            }
          </section>
        </div>
      </section>
    `;

    const searchEl = root.querySelector('[data-k="search"]');
    searchEl?.addEventListener("input", () => {
      state.search = searchEl.value || "";
      renderApp();
    });

    root.querySelectorAll("[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeCategoryId = String(btn.getAttribute("data-category") || "all");
        renderApp();
      });
    });

    root.querySelectorAll("[data-item-id]").forEach((card) => {
      const itemId = String(card.getAttribute("data-item-id") || "");
      const item = state.items.find((it) => String(it.id) === itemId);
      if (!item) return;
      card.querySelector('[data-action="add"]')?.addEventListener("click", () => {
        addItemToCart(item);
        renderApp();
      });
    });

    root.querySelectorAll("[data-line-index]").forEach((card) => {
      const idx = Number(card.getAttribute("data-line-index"));
      if (!Number.isFinite(idx)) return;
      const line = state.cart[idx];
      if (!line) return;

      card.querySelector('[data-action="minus"]')?.addEventListener("click", () => {
        line.qty = Math.max(0.001, Number(line.qty || 0) - 1);
        renderApp();
      });

      card.querySelector('[data-action="plus"]')?.addEventListener("click", () => {
        line.qty = Math.max(0.001, Number(line.qty || 0) + 1);
        renderApp();
      });

      card.querySelector('[data-action="qty"]')?.addEventListener("input", (e) => {
        line.qty = parseQty(e.target.value);
        renderApp();
      });

      card.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
        state.cart.splice(idx, 1);
        renderApp();
      });
    });

    root.querySelector('[data-k="customer_name"]')?.addEventListener("input", (e) => {
      state.customer_name = e.target.value || "";
    });

    root.querySelector('[data-k="table_label"]')?.addEventListener("input", (e) => {
      state.table_label = e.target.value || "";
    });

    root.querySelector('[data-k="note"]')?.addEventListener("input", (e) => {
      state.note = e.target.value || "";
    });

    root.querySelector('[data-action="submit"]')?.addEventListener("click", submitOrder);
  }

  async function submitOrder() {
    if (!state.cart.length) return;

    const btn = root.querySelector('[data-action="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = STR.submitting;
    }

    try {
      const payload = {
        p_location_slug: state.locationSlug,
        p_source: state.source,
        p_table_label: String(state.table_label || "").trim() || null,
        p_customer_name: String(state.customer_name || "").trim() || null,
        p_note: String(state.note || "").trim() || null,
        p_lines: state.cart.map((line) => ({
          menu_item_id: asUuid(line.menu_item_id) || null,
          qty: parseQty(line.qty),
        })),
      };

      const res = await callCreateOrderRpc(payload);
      if (res.error) throw res.error;

      const data = res.data && typeof res.data === "object" ? res.data : {};
      if (!data.ok) throw new Error(data.error || "order_create_failed");

      state.lastOrder = data.order || null;
      state.cart = [];
      state.note = "";
      renderApp();
    } catch (e) {
      warn("submit order failed", e);
      const msg = String(e?.message || "").trim() || STR.loadError;
      const card = root.querySelector(".ro-shell");
      if (card) {
        const a = document.createElement("div");
        a.className = "ro-alert is-error";
        a.textContent = msg;
        const existing = card.querySelector(".ro-alert.is-error");
        if (existing) existing.remove();
        card.prepend(a);
      }
    } finally {
      const b = root.querySelector('[data-action="submit"]');
      if (b) {
        b.disabled = !state.cart.length;
        b.textContent = STR.submit;
      }
    }
  }

  injectStyles();
  renderLoading();

  try {
    state.locationSlug = resolveLocationSlug();
    state.source = resolveSource();

    await ensureSupabaseJs();
    state.supabase = getSupabase();
    if (!state.supabase) throw new Error("Supabase non initialise.");

    await loadCatalog();
    renderApp();
    log("ready", { slug: state.locationSlug, source: state.source });
  } catch (e) {
    warn("boot error", e);
    renderError(e?.message || STR.loadError);
  }
});
