document.documentElement.setAttribute("data-page", "admin-transport");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminTransportLoaded) return;
  window.__mblAdminTransportLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-transport]";
  const root = findRoot();
  if (!root) {
    console.error("[TRANSPORT] Root introuvable. Ajoute <div data-mbl-transport></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[TRANSPORT]", ...a);
  const warn = (...a) => DEBUG && console.warn("[TRANSPORT]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";
  const BILLING_ROOT = `${APP_ROOT}/facturation`;

  const CONFIG = {
    ROOT_SELECTOR,

    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),

    ORGANIZATION_ID: String(root.dataset.organizationId || CFG.ORGANIZATION_ID || window.__MBL_ORG_ID__ || "").trim(),

    CLIENTS_TABLE: String(root.dataset.clientsTable || CFG.CLIENTS_TABLE || "clients"),
    VEHICLES_TABLE: String(root.dataset.vehiclesTable || "transport_vehicles"),
    DRIVERS_TABLE: String(root.dataset.driversTable || "transport_drivers"),
    RATE_CARDS_TABLE: String(root.dataset.rateCardsTable || "transport_rate_cards"),
    TOURS_TABLE: String(root.dataset.toursTable || "transport_tours"),
    SHIPMENTS_TABLE: String(root.dataset.shipmentsTable || "transport_shipments"),

    EDGE_FN_ROUTE: String(root.dataset.edgeFnRoute || CFG.EDGE_FN_ROUTE || "transport-route"),

    QUOTE_URL: String(root.dataset.quoteUrl || `${BILLING_ROOT}/devis-add`),
    INVOICE_URL: String(root.dataset.invoiceUrl || `${BILLING_ROOT}/invoice`),

    CURRENCY: String(root.dataset.currency || CFG.CURRENCY || "EUR").trim() || "EUR",
    THEME_PRIMARY: String(root.dataset.themePrimary || CFG.THEME_PRIMARY || "").trim(),
  };

  const STR = {
    title: "Transport",
    subtitle: "Flotte, chauffeurs, tournees et courses",
    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour acceder au module transport.",
    loginCta: "Se connecter",
    forbiddenTitle: "Acces refuse",
    forbiddenBody: "Ce module est reserve aux administrateurs.",
    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module Transport.",
    moduleCta: "Gerer mon abonnement",
    loadError: "Impossible de charger le module transport.",
    saving: "Enregistrement...",
    saved: "Enregistre",
    deleted: "Supprime",
    confirmDelete: "Supprimer cet element ?",
    searchPlaceholder: "Rechercher par ref, client, adresse...",
    tabShipments: "Courses",
    tabTours: "Tournees",
    tabVehicles: "Vehicules",
    tabDrivers: "Chauffeurs",
    tabRates: "Tarifs",
    btnNew: "Nouveau",
    btnClose: "Fermer",
    btnCancel: "Annuler",
    btnSave: "Enregistrer",
    btnDelete: "Supprimer",
    btnComputeRoute: "Calculer distance",
    btnEstimate: "Estimer tarif",
    btnQuote: "Creer devis",
    btnInvoice: "Creer facture",
    emptyTitle: "Aucun resultat",
    emptyBody: "Aucun element ne correspond aux filtres actuels.",
    statusDraft: "Brouillon",
    statusPlanned: "Planifie",
    statusInProgress: "En cours",
    statusDone: "Termine",
    statusCanceled: "Annule",
  };

  function findRoot() {
    return document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-transport") || null;
  }

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function formatMoney(cents) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency: CONFIG.CURRENCY });
  }

  function parseMoneyToCents(value) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function pad2(n) {
    const v = String(n || "");
    return v.length === 1 ? "0" + v : v;
  }

  function fmtDate(isoOrDate) {
    if (!isoOrDate) return "";
    const d = new Date(isoOrDate);
    if (!Number.isFinite(d.getTime())) return "";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function clean(s) {
    return String(s || "").trim().toLowerCase();
  }

  function readPrimary() {
    const fromDs = String(root.dataset.themePrimary || "").trim();
    if (fromDs) return fromDs;
    const fromCfg = String(CONFIG.THEME_PRIMARY || "").trim();
    if (fromCfg) return fromCfg;
    try {
      const v = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary") || "").trim();
      if (v) return v;
    } catch (_) {}
    return "#0ea5e9";
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
    (document.head || document.documentElement).appendChild(s);
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
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (!window.supabase?.createClient) return null;
    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: CONFIG.AUTH_STORAGE_KEY,
      },
    });
    window.__MBL_SUPABASE__ = client;
    return client;
  }

  function injectStyles() {
    if (document.getElementById("mbl-transport-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-transport-style";
    const primary = readPrimary();
    st.textContent = `
      html[data-page="admin-transport"] .tr-shell, 
      html[data-page="admin-transport"] .tr-shell * { box-sizing: border-box; }

      html[data-page="admin-transport"] .tr-shell {
        --tr-primary: ${primary};
        --tr-ink: rgba(2, 6, 23, 0.92);
        --tr-muted: rgba(2, 6, 23, 0.62);
        --tr-border: rgba(15, 23, 42, 0.10);
        --tr-surface: rgba(255,255,255,0.78);
        --tr-surface2: rgba(255,255,255,0.92);
        --tr-shadow: 0 20px 60px rgba(2,6,23,0.10);
        --tr-radius: 18px;
        font-family: inherit;
        color: var(--tr-ink);
        width: min(1180px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: var(--tr-radius);
        border: 1px solid var(--tr-border);
        background:
          radial-gradient(900px 480px at 20% 0%, rgba(14,165,233,0.14), transparent 60%),
          radial-gradient(900px 480px at 100% 0%, rgba(37,99,235,0.10), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.94));
        box-shadow: var(--tr-shadow);
      }

      html[data-page="admin-transport"] .tr-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }

      html[data-page="admin-transport"] .tr-title {
        font-size: 24px;
        font-weight: 900;
        margin: 0;
        letter-spacing: -0.02em;
      }

      html[data-page="admin-transport"] .tr-subtitle {
        margin: 4px 0 0;
        color: var(--tr-muted);
      }

      html[data-page="admin-transport"] .tr-actions { display: flex; gap: 10px; align-items: center; }

      html[data-page="admin-transport"] .tr-btn {
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        color: var(--tr-ink);
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .12s ease, box-shadow .16s ease, border-color .16s ease;
      }
      html[data-page="admin-transport"] .tr-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(14,165,233,0.45);
        box-shadow: 0 12px 24px rgba(2,6,23,0.12);
      }
      html[data-page="admin-transport"] .tr-btn:disabled { opacity: .55; cursor: not-allowed; transform:none; box-shadow:none; }

      html[data-page="admin-transport"] .tr-btn--primary {
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        color: #fff;
        border-color: rgba(14,165,233,0.55);
      }
      html[data-page="admin-transport"] .tr-btn--danger {
        background: rgba(255,255,255,0.92);
        border-color: rgba(239,68,68,0.35);
        color: rgba(153,27,27,0.92);
      }

      html[data-page="admin-transport"] .tr-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 10px 0 14px;
      }
      html[data-page="admin-transport"] .tr-tab {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.70);
        color: rgba(2,6,23,0.78);
        height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        font-weight: 900;
        cursor: pointer;
      }
      html[data-page="admin-transport"] .tr-tab[aria-selected="true"] {
        background: rgba(14,165,233,0.12);
        border-color: rgba(14,165,233,0.40);
        color: rgba(12,74,110,0.98);
      }

      html[data-page="admin-transport"] .tr-topbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }

      html[data-page="admin-transport"] .tr-search {
        flex: 1;
        min-width: 180px;
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        outline: none;
      }
      html[data-page="admin-transport"] .tr-search:focus { border-color: rgba(14,165,233,0.55); box-shadow: 0 0 0 4px rgba(14,165,233,0.12); }

      html[data-page="admin-transport"] .tr-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      html[data-page="admin-transport"] .tr-card {
        background: rgba(255,255,255,0.86);
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }

      html[data-page="admin-transport"] .tr-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      html[data-page="admin-transport"] .tr-row h3 { margin: 0; font-size: 15px; font-weight: 900; }
      html[data-page="admin-transport"] .tr-meta { color: var(--tr-muted); font-size: 13px; line-height: 1.4; margin-top: 2px; }

      html[data-page="admin-transport"] .tr-badges { display:flex; gap:8px; flex-wrap: wrap; justify-content:flex-end; }
      html[data-page="admin-transport"] .tr-badge {
        display:inline-flex; align-items:center; gap:8px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.92);
        padding: 6px 10px;
        border-radius: 999px;
        font-weight: 900;
        font-size: 12px;
        color: rgba(2,6,23,0.74);
      }
      html[data-page="admin-transport"] .tr-dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      html[data-page="admin-transport"] .tr-badge.is-draft .tr-dot { background: rgba(148,163,184,0.92); }
      html[data-page="admin-transport"] .tr-badge.is-planned .tr-dot { background: rgba(59,130,246,0.92); }
      html[data-page="admin-transport"] .tr-badge.is-progress .tr-dot { background: rgba(234,179,8,0.92); }
      html[data-page="admin-transport"] .tr-badge.is-done .tr-dot { background: rgba(34,197,94,0.92); }
      html[data-page="admin-transport"] .tr-badge.is-canceled .tr-dot { background: rgba(239,68,68,0.92); }

      html[data-page="admin-transport"] .tr-actions-inline { display:flex; gap:10px; flex-wrap: wrap; margin-top: 12px; }

      html[data-page="admin-transport"] .tr-empty {
        text-align:center;
        padding: 32px 14px;
        color: var(--tr-muted);
      }
      html[data-page="admin-transport"] .tr-empty strong { display:block; color: rgba(2,6,23,0.84); margin-bottom: 6px; }

      /* Modal */
      html[data-page="admin-transport"] .tr-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: none;
      }
      html[data-page="admin-transport"] .tr-modal.is-open { display: block; }
      html[data-page="admin-transport"] .tr-modal__backdrop { position:absolute; inset:0; background: rgba(2,6,23,0.55); backdrop-filter: blur(8px); }
      html[data-page="admin-transport"] .tr-modal__panel {
        position: absolute;
        left: 50%;
        top: 6vh;
        transform: translateX(-50%);
        width: min(780px, calc(100% - 24px));
        max-height: 88vh;
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.96);
        box-shadow: 0 28px 90px rgba(2,6,23,0.28);
        padding: 16px;
      }
      html[data-page="admin-transport"] .tr-modal__head {
        display:flex; align-items:flex-start; justify-content: space-between; gap: 10px;
        margin-bottom: 12px;
      }
      html[data-page="admin-transport"] .tr-modal__title { margin:0; font-size: 16px; font-weight: 900; }
      html[data-page="admin-transport"] .tr-form { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      html[data-page="admin-transport"] .tr-form .tr-full { grid-column: 1 / -1; }
      html[data-page="admin-transport"] .tr-label { display:block; font-weight: 900; font-size: 12px; color: rgba(2,6,23,0.78); margin-bottom: 6px; }
      html[data-page="admin-transport"] .tr-input, html[data-page="admin-transport"] .tr-select, html[data-page="admin-transport"] .tr-textarea {
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.98);
        padding: 10px 12px;
        outline: none;
      }
      html[data-page="admin-transport"] .tr-textarea { min-height: 90px; resize: vertical; }
      html[data-page="admin-transport"] .tr-input:focus, html[data-page="admin-transport"] .tr-select:focus, html[data-page="admin-transport"] .tr-textarea:focus {
        border-color: rgba(14,165,233,0.55);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }
      html[data-page="admin-transport"] .tr-modal__foot { display:flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }

      /* Classic alerts */
      html[data-page="admin-transport"] .tr-alert {
        display:none;
        margin: 12px 0;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(241,245,249,0.9);
        color: rgba(2,6,23,0.82);
        font-weight: 800;
      }
      html[data-page="admin-transport"] .tr-alert.is-error {
        border-color: rgba(239,68,68,0.30);
        background: rgba(254,242,242,0.92);
        color: rgba(153,27,27,0.92);
      }
      html[data-page="admin-transport"] .tr-alert.is-ok {
        border-color: rgba(34,197,94,0.30);
        background: rgba(240,253,244,0.92);
        color: rgba(20,83,45,0.92);
      }

      @media (max-width: 720px) {
        html[data-page="admin-transport"] .tr-form { grid-template-columns: 1fr; }
        html[data-page="admin-transport"] .tr-head { flex-direction: column; }
        html[data-page="admin-transport"] .tr-actions { width: 100%; }
        html[data-page="admin-transport"] .tr-actions .tr-btn { flex: 1; }
      }
    `;
    document.head.appendChild(st);
  }

  function renderShell() {
    root.innerHTML = `
      <section class="tr-shell">
        <header class="tr-head">
          <div>
            <h1 class="tr-title">${escapeHTML(STR.title)}</h1>
            <p class="tr-subtitle">${escapeHTML(STR.subtitle)}</p>
          </div>
          <div class="tr-actions">
            <button type="button" class="tr-btn tr-btn--primary" data-action="new">${escapeHTML(STR.btnNew)}</button>
          </div>
        </header>

        <div class="tr-tabs" role="tablist">
          <button type="button" class="tr-tab" data-tab="shipments" role="tab" aria-selected="true">${escapeHTML(STR.tabShipments)}</button>
          <button type="button" class="tr-tab" data-tab="tours" role="tab" aria-selected="false">${escapeHTML(STR.tabTours)}</button>
          <button type="button" class="tr-tab" data-tab="vehicles" role="tab" aria-selected="false">${escapeHTML(STR.tabVehicles)}</button>
          <button type="button" class="tr-tab" data-tab="drivers" role="tab" aria-selected="false">${escapeHTML(STR.tabDrivers)}</button>
          <button type="button" class="tr-tab" data-tab="rates" role="tab" aria-selected="false">${escapeHTML(STR.tabRates)}</button>
        </div>

        <div class="tr-topbar">
          <input class="tr-search" data-search placeholder="${escapeHTML(STR.searchPlaceholder)}" />
        </div>

        <div class="tr-alert" data-alert></div>
        <div class="tr-grid" data-body></div>
      </section>

      <div class="tr-modal" data-modal aria-hidden="true">
        <div class="tr-modal__backdrop" data-modal-backdrop></div>
        <div class="tr-modal__panel" role="dialog" aria-modal="true" aria-label="Edition">
          <div class="tr-modal__head">
            <h2 class="tr-modal__title" data-modal-title></h2>
            <button type="button" class="tr-btn" data-modal-close>${escapeHTML(STR.btnClose)}</button>
          </div>
          <div data-modal-body></div>
          <div class="tr-modal__foot" data-modal-foot></div>
        </div>
      </div>
    `;

    return {
      tabs: Array.from(root.querySelectorAll(".tr-tab[data-tab]")),
      newBtn: root.querySelector('[data-action="new"]'),
      search: root.querySelector("[data-search]"),
      alert: root.querySelector("[data-alert]"),
      body: root.querySelector("[data-body]"),
      modal: root.querySelector("[data-modal]"),
      modalBackdrop: root.querySelector("[data-modal-backdrop]"),
      modalClose: root.querySelector("[data-modal-close]"),
      modalTitle: root.querySelector("[data-modal-title]"),
      modalBody: root.querySelector("[data-modal-body]"),
      modalFoot: root.querySelector("[data-modal-foot]"),
    };
  }

  function showAlert(els, msg, kind) {
    if (!els.alert) return;
    els.alert.textContent = msg || "";
    els.alert.style.display = msg ? "block" : "none";
    els.alert.classList.toggle("is-error", kind === "error");
    els.alert.classList.toggle("is-ok", kind === "ok");
  }

  function openModal(els, { title, bodyHtml, footHtml }) {
    els.modalTitle.textContent = title || "";
    els.modalBody.innerHTML = bodyHtml || "";
    els.modalFoot.innerHTML = footHtml || "";
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
    try {
      document.documentElement.setAttribute("data-mbl-modal", "1");
    } catch (_) {}
  }

  function closeModal(els) {
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
    els.modalTitle.textContent = "";
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
    try {
      document.documentElement.removeAttribute("data-mbl-modal");
    } catch (_) {}
  }

  function statusBadge(status) {
    const s = clean(status);
    const label =
      s === "planned"
        ? STR.statusPlanned
        : s === "in_progress"
          ? STR.statusInProgress
          : s === "done"
            ? STR.statusDone
            : s === "canceled"
              ? STR.statusCanceled
              : STR.statusDraft;
    const cls =
      s === "planned"
        ? "is-planned"
        : s === "in_progress"
          ? "is-progress"
          : s === "done"
            ? "is-done"
            : s === "canceled"
              ? "is-canceled"
              : "is-draft";
    return `<span class="tr-badge ${cls}"><span class="tr-dot"></span>${escapeHTML(label)}</span>`;
  }

  function pickClientName(row) {
    const c = row?.client || row?.clients || null;
    if (c && typeof c === "object") {
      return String(c.legal_name || c.name || c.trade_name || "").trim();
    }
    return String(row?.client_name || "").trim();
  }

  // Pricing engine (client-side) - must stay deterministic.
  function computeShipmentPriceCents({ distance_m, rateCard }) {
    const distM = Number(distance_m || 0);
    const km = distM > 0 ? distM / 1000 : 0;
    const mode = String(rateCard?.pricing_mode || "distance");
    const base = Math.max(0, Number(rateCard?.base_fee_cents || 0));
    const perKm = Math.max(0, Number(rateCard?.per_km_cents || 0));
    const minPrice = Math.max(0, Number(rateCard?.min_price_cents || 0));
    const tiers = Array.isArray(rateCard?.tiers) ? rateCard.tiers : [];

    let total = 0;
    if (mode === "flat") {
      total = base;
    } else if (mode === "distance_tiers" && tiers.length) {
      // tiers: [{ up_to_km, per_km_cents }]
      let chosen = null;
      for (const t of tiers) {
        const upTo = Number(t?.up_to_km);
        if (!Number.isFinite(upTo) || upTo <= 0) continue;
        if (km <= upTo) {
          chosen = t;
          break;
        }
      }
      if (!chosen) chosen = tiers[tiers.length - 1];
      const tierPerKm = Math.max(0, Number(chosen?.per_km_cents || perKm || 0));
      total = base + Math.round(km * tierPerKm);
    } else {
      total = base + Math.round(km * perKm);
    }

    if (minPrice > 0) total = Math.max(total, minPrice);
    return Math.max(0, Math.round(total));
  }

  // =========================================================
  // Boot
  // =========================================================

  injectStyles();
  const els = renderShell();
  showAlert(els, "", "");

  let supabase = null;

  const state = {
    userId: "",
    organizationId: asUuid(CONFIG.ORGANIZATION_ID),
    isAdmin: false,
    transportEnabled: false,

    tab: "shipments",
    search: "",

    clients: [],
    vehicles: [],
    drivers: [],
    rateCards: [],
    tours: [],
    shipments: [],

    loading: new Set(),
  };

  // Wire shell actions.
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = String(btn.dataset.tab || "shipments");
      setTab(tab);
    });
  });

  els.newBtn.addEventListener("click", () => openNewForCurrentTab());

  els.search.addEventListener("input", () => {
    state.search = String(els.search.value || "");
    render();
  });

  els.modalBackdrop.addEventListener("click", () => closeModal(els));
  els.modalClose.addEventListener("click", () => closeModal(els));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (els.modal.classList.contains("is-open")) closeModal(els);
  });

  await boot();

  async function boot() {
    try {
      await ensureSupabaseJs();
      supabase = getSupabase();
      if (!supabase) throw new Error("Supabase non charge.");

      const user = (await supabase.auth.getUser())?.data?.user || null;
      state.userId = String(user?.id || "");

      if (!state.userId) {
        return renderBlocking({
          title: STR.loginTitle,
          body: STR.loginBody,
          cta: { label: STR.loginCta, href: CONFIG.LOGIN_PATH },
        });
      }

      await resolveOrgId();
      if (!state.organizationId) {
        return renderBlocking({
          title: STR.moduleMissingTitle,
          body: "Aucune organisation active pour ce compte.",
          cta: { label: STR.moduleCta, href: "/subscriptions" },
        });
      }

      const [isAdmin, transportEnabled] = await Promise.all([checkIsAdmin(), checkTransportEnabled()]);
      state.isAdmin = isAdmin;
      state.transportEnabled = transportEnabled;

      if (!transportEnabled) {
        return renderBlocking({
          title: STR.moduleMissingTitle,
          body: STR.moduleMissingBody,
          cta: { label: STR.moduleCta, href: "/subscriptions" },
        });
      }

      if (!isAdmin) {
        return renderBlocking({
          title: STR.forbiddenTitle,
          body: STR.forbiddenBody,
          cta: { label: "Retour", href: `${APP_ROOT}/admin/dashboard` },
        });
      }

      await preloadBase();
      await loadTabData(state.tab);
      render();
    } catch (e) {
      console.error("[TRANSPORT] boot error:", e);
      renderBlocking({ title: "Erreur", body: STR.loadError, cta: { label: "Recharger", href: location.href } });
    }
  }

  async function resolveOrgId() {
    state.organizationId = asUuid(state.organizationId);
    if (state.organizationId) {
      const check = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", state.userId)
        .eq("organization_id", state.organizationId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!check.error && check.data?.organization_id) return;
      state.organizationId = "";
    }

    const res = await supabase
      .from("organization_members")
      .select("organization_id, is_default, created_at")
      .eq("user_id", state.userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (!res.error && res.data?.[0]?.organization_id) {
      state.organizationId = asUuid(res.data[0].organization_id);
    }
  }

  async function checkIsAdmin() {
    const mem = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", state.organizationId)
      .eq("user_id", state.userId)
      .eq("is_active", true)
      .maybeSingle();
    const memRole = clean(mem?.data?.role || "");
    if (["owner", "admin", "manager"].includes(memRole)) return true;

    const prof = await supabase.from("profiles").select("role").eq("id", state.userId).maybeSingle();
    const pr = clean(prof?.data?.role || "");
    return pr === "admin";
  }

  async function checkTransportEnabled() {
    const ent = await supabase
      .from("organization_entitlements")
      .select("modules")
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    const mods = ent?.data?.modules && typeof ent.data.modules === "object" ? ent.data.modules : {};
    return Boolean(mods?.transport);
  }

  async function preloadBase() {
    await Promise.all([loadClients(), loadRateCards(), loadVehicles(), loadDrivers()]);
  }

  function renderBlocking({ title, body, cta }) {
    els.body.innerHTML = `
      <div class="tr-card">
        <div class="tr-row">
          <div>
            <h3>${escapeHTML(title)}</h3>
            <div class="tr-meta">${escapeHTML(body)}</div>
          </div>
        </div>
        <div class="tr-actions-inline">
          <a class="tr-btn tr-btn--primary" href="${escapeHTML(cta?.href || CONFIG.LOGIN_PATH)}" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
            ${escapeHTML(cta?.label || STR.loginCta)}
          </a>
        </div>
      </div>
    `;
  }

  function setTab(tab) {
    const next = String(tab || "shipments");
    state.tab = next;
    els.tabs.forEach((b) => {
      const active = String(b.dataset.tab) === next;
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.search.value = state.search || "";
    loadTabData(next).then(render).catch((e) => warn("loadTabData", e));
  }

  async function loadTabData(tab) {
    const t = String(tab || "");
    if (t === "shipments") return loadShipments();
    if (t === "tours") return loadTours();
    if (t === "vehicles") return loadVehicles();
    if (t === "drivers") return loadDrivers();
    if (t === "rates") return loadRateCards();
  }

  // =========================================================
  // Loaders
  // =========================================================

  async function loadClients() {
    const res = await supabase
      .from(CONFIG.CLIENTS_TABLE)
      .select("id,name,legal_name,trade_name,email,phone")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(600);
    if (!res.error) state.clients = res.data || [];
  }

  async function loadVehicles() {
    const res = await supabase
      .from(CONFIG.VEHICLES_TABLE)
      .select("*")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!res.error) state.vehicles = res.data || [];
  }

  async function loadDrivers() {
    const res = await supabase
      .from(CONFIG.DRIVERS_TABLE)
      .select("*")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!res.error) state.drivers = res.data || [];
  }

  async function loadRateCards() {
    const res = await supabase
      .from(CONFIG.RATE_CARDS_TABLE)
      .select("*")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!res.error) state.rateCards = res.data || [];
  }

  async function loadTours() {
    const res = await supabase
      .from(CONFIG.TOURS_TABLE)
      .select("*")
      .eq("organization_id", state.organizationId)
      .order("tour_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(600);
    if (!res.error) state.tours = res.data || [];
  }

  async function loadShipments() {
    const res = await supabase
      .from(CONFIG.SHIPMENTS_TABLE)
      .select("*, client:client_id(id,name,legal_name,trade_name)")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(900);
    if (!res.error) state.shipments = res.data || [];
  }

  // =========================================================
  // Renderers
  // =========================================================

  function matchesSearch(haystack) {
    const q = clean(state.search);
    if (!q) return true;
    return clean(haystack).includes(q);
  }

  function render() {
    showAlert(els, "", "");
    if (state.tab === "shipments") return renderShipments();
    if (state.tab === "tours") return renderTours();
    if (state.tab === "vehicles") return renderVehicles();
    if (state.tab === "drivers") return renderDrivers();
    if (state.tab === "rates") return renderRateCards();
  }

  function renderEmpty() {
    els.body.innerHTML = `
      <div class="tr-card tr-empty">
        <strong>${escapeHTML(STR.emptyTitle)}</strong>
        <div>${escapeHTML(STR.emptyBody)}</div>
      </div>
    `;
  }

  function renderShipments() {
    const rows = (state.shipments || []).filter((s) => {
      const label = [
        s.reference,
        s.title,
        pickClientName(s),
        s.pickup_address,
        s.delivery_address,
        s.pickup_city,
        s.delivery_city,
      ]
        .filter(Boolean)
        .join(" ");
      return matchesSearch(label);
    });

    if (!rows.length) return renderEmpty();

    els.body.innerHTML = rows
      .map((s) => {
        const clientName = pickClientName(s) || "—";
        const dist = Number(s.distance_m || 0) > 0 ? `${(Number(s.distance_m) / 1000).toFixed(1)} km` : "—";
        const price = Number.isFinite(Number(s.price_cents)) ? formatMoney(s.price_cents) : "—";
        const when = s.planned_pickup_at ? fmtDateTime(s.planned_pickup_at) : fmtDate(s.created_at);
        const isBilled = Boolean(s.facture_id);
        const billed = isBilled ? `<span class="tr-badge is-done"><span class="tr-dot"></span>Facturee</span>` : "";

        return `
          <article class="tr-card" data-id="${escapeHTML(s.id)}" data-entity="shipment">
            <div class="tr-row">
              <div>
                <h3>${escapeHTML(s.reference || "Course")} ${escapeHTML(s.title ? " - " + s.title : "")}</h3>
                <div class="tr-meta">
                  <div><strong>${escapeHTML(clientName)}</strong> • ${escapeHTML(when)}</div>
                  <div>${escapeHTML(s.pickup_city || "")} ${escapeHTML(s.pickup_address || "")}</div>
                  <div>${escapeHTML(s.delivery_city || "")} ${escapeHTML(s.delivery_address || "")}</div>
                </div>
              </div>
              <div class="tr-badges">
                ${statusBadge(s.status)}
                <span class="tr-badge"><span class="tr-dot"></span>${escapeHTML(dist)}</span>
                <span class="tr-badge"><span class="tr-dot"></span>${escapeHTML(price)}</span>
                ${billed}
              </div>
            </div>
            <div class="tr-actions-inline">
              <button type="button" class="tr-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="tr-btn" data-action="quote" ${!s.client_id ? "disabled" : ""}>${escapeHTML(
                STR.btnQuote
              )}</button>
              <button type="button" class="tr-btn tr-btn--primary" data-action="invoice" ${!s.client_id ? "disabled" : ""}>${escapeHTML(
                STR.btnInvoice
              )}</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="shipment"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openShipmentModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteShipment(id));
      card.querySelector('[data-action="quote"]').addEventListener("click", () => goQuoteFromShipment(id));
      card.querySelector('[data-action="invoice"]').addEventListener("click", () => goInvoiceFromShipment(id));
    });
  }

  function renderTours() {
    const tours = (state.tours || []).filter((t) => {
      const label = [t.reference, t.start_city, t.end_city, t.start_address, t.end_address].filter(Boolean).join(" ");
      return matchesSearch(label);
    });
    if (!tours.length) return renderEmpty();

    const driverById = new Map((state.drivers || []).map((d) => [String(d.id), d]));
    const vehicleById = new Map((state.vehicles || []).map((v) => [String(v.id), v]));

    els.body.innerHTML = tours
      .map((t) => {
        const driver = driverById.get(String(t.driver_id || "")) || null;
        const vehicle = vehicleById.get(String(t.vehicle_id || "")) || null;
        const driverName = driver ? [driver.first_name, driver.last_name].filter(Boolean).join(" ") : "";
        const vehicleName = vehicle ? String(vehicle.plate_number || vehicle.name || "").trim() : "";
        const dist = Number(t.distance_m || 0) > 0 ? `${(Number(t.distance_m) / 1000).toFixed(1)} km` : "—";
        const day = t.tour_date ? fmtDate(t.tour_date) : "—";
        return `
          <article class="tr-card" data-id="${escapeHTML(t.id)}" data-entity="tour">
            <div class="tr-row">
              <div>
                <h3>${escapeHTML(t.reference || "Tournee")} • ${escapeHTML(day)}</h3>
                <div class="tr-meta">
                  <div>${escapeHTML(driverName || "—")} ${vehicleName ? "• " + escapeHTML(vehicleName) : ""}</div>
                  <div>Depart: ${escapeHTML(t.start_city || "")} ${escapeHTML(t.start_address || "")}</div>
                  <div>Arrivee: ${escapeHTML(t.end_city || "")} ${escapeHTML(t.end_address || "")}</div>
                </div>
              </div>
              <div class="tr-badges">
                ${statusBadge(t.status)}
                <span class="tr-badge"><span class="tr-dot"></span>${escapeHTML(dist)}</span>
              </div>
            </div>
            <div class="tr-actions-inline">
              <button type="button" class="tr-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="tour"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openTourModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTour(id));
    });
  }

  function renderVehicles() {
    const vehicles = (state.vehicles || []).filter((v) => matchesSearch([v.plate_number, v.name, v.brand, v.model].filter(Boolean).join(" ")));
    if (!vehicles.length) return renderEmpty();

    els.body.innerHTML = vehicles
      .map((v) => {
        const label = String(v.plate_number || "").trim() || "—";
        const meta = [v.vehicle_type, v.brand, v.model].filter(Boolean).join(" • ") || "—";
        return `
          <article class="tr-card" data-id="${escapeHTML(v.id)}" data-entity="vehicle">
            <div class="tr-row">
              <div>
                <h3>${escapeHTML(label)} ${v.name ? " - " + escapeHTML(v.name) : ""}</h3>
                <div class="tr-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="tr-badges">
                <span class="tr-badge"><span class="tr-dot"></span>${v.is_active ? "Actif" : "Inactif"}</span>
              </div>
            </div>
            <div class="tr-actions-inline">
              <button type="button" class="tr-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="vehicle"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openVehicleModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteVehicle(id));
    });
  }

  function renderDrivers() {
    const drivers = (state.drivers || []).filter((d) => matchesSearch([d.first_name, d.last_name, d.email, d.phone].filter(Boolean).join(" ")));
    if (!drivers.length) return renderEmpty();

    els.body.innerHTML = drivers
      .map((d) => {
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || "—";
        const meta = [d.email, d.phone, d.license_number].filter(Boolean).join(" • ") || "—";
        return `
          <article class="tr-card" data-id="${escapeHTML(d.id)}" data-entity="driver">
            <div class="tr-row">
              <div>
                <h3>${escapeHTML(name)}</h3>
                <div class="tr-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="tr-badges">
                <span class="tr-badge"><span class="tr-dot"></span>${d.is_active ? "Actif" : "Inactif"}</span>
              </div>
            </div>
            <div class="tr-actions-inline">
              <button type="button" class="tr-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="driver"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openDriverModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteDriver(id));
    });
  }

  function renderRateCards() {
    const cards = (state.rateCards || []).filter((r) => matchesSearch([r.code, r.name, r.pricing_mode].filter(Boolean).join(" ")));
    if (!cards.length) return renderEmpty();

    els.body.innerHTML = cards
      .map((r) => {
        const mode = String(r.pricing_mode || "distance");
        const desc =
          mode === "flat"
            ? `Forfait ${formatMoney(r.base_fee_cents)}`
            : mode === "distance_tiers"
              ? `Base ${formatMoney(r.base_fee_cents)} + paliers`
              : `Base ${formatMoney(r.base_fee_cents)} + ${formatMoney(r.per_km_cents)}/km`;
        return `
          <article class="tr-card" data-id="${escapeHTML(r.id)}" data-entity="rate">
            <div class="tr-row">
              <div>
                <h3>${escapeHTML(r.code || "TARIF")} • ${escapeHTML(r.name || "")}</h3>
                <div class="tr-meta">${escapeHTML(desc)}</div>
              </div>
              <div class="tr-badges">
                <span class="tr-badge"><span class="tr-dot"></span>${r.is_active ? "Actif" : "Inactif"}</span>
              </div>
            </div>
            <div class="tr-actions-inline">
              <button type="button" class="tr-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="rate"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openRateCardModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteRateCard(id));
    });
  }

  // =========================================================
  // Modal builders
  // =========================================================

  function optionList(items, getLabel, selected) {
    const sel = String(selected || "");
    return [
      `<option value="">—</option>`,
      ...items.map((it) => {
        const id = String(it.id || "");
        const label = String(getLabel(it) || "").trim() || id;
        return `<option value="${escapeHTML(id)}"${id === sel ? " selected" : ""}>${escapeHTML(label)}</option>`;
      }),
    ].join("");
  }

  function statusOptions(selected) {
    const s = clean(selected);
    const opts = [
      { v: "draft", l: STR.statusDraft },
      { v: "planned", l: STR.statusPlanned },
      { v: "in_progress", l: STR.statusInProgress },
      { v: "done", l: STR.statusDone },
      { v: "canceled", l: STR.statusCanceled },
    ];
    return opts.map((o) => `<option value="${o.v}"${o.v === s ? " selected" : ""}>${escapeHTML(o.l)}</option>`).join("");
  }

  function pricingModeOptions(selected) {
    const v = String(selected || "distance");
    const opts = [
      { v: "distance", l: "Distance" },
      { v: "flat", l: "Forfait" },
      { v: "distance_tiers", l: "Distance (paliers)" },
    ];
    return opts.map((o) => `<option value="${o.v}"${o.v === v ? " selected" : ""}>${escapeHTML(o.l)}</option>`).join("");
  }

  function openVehicleModal(id) {
    const v = (state.vehicles || []).find((x) => String(x.id) === String(id)) || null;
    openModal(els, {
      title: v ? "Modifier vehicule" : "Nouveau vehicule",
      bodyHtml: `
        <form class="tr-form" data-form="vehicle">
          <div>
            <label class="tr-label">Immatriculation</label>
            <input class="tr-input" name="plate_number" required value="${escapeHTML(v?.plate_number || "")}" />
          </div>
          <div>
            <label class="tr-label">Nom (optionnel)</label>
            <input class="tr-input" name="name" value="${escapeHTML(v?.name || "")}" />
          </div>
          <div>
            <label class="tr-label">Type</label>
            <input class="tr-input" name="vehicle_type" value="${escapeHTML(v?.vehicle_type || "")}" placeholder="Fourgon, PL, VL..." />
          </div>
          <div>
            <label class="tr-label">Marque / modele</label>
            <input class="tr-input" name="brand_model" value="${escapeHTML([v?.brand, v?.model].filter(Boolean).join(" "))}" />
          </div>
          <div>
            <label class="tr-label">Charge utile (kg)</label>
            <input class="tr-input" name="payload_kg" type="number" min="0" step="1" value="${escapeHTML(v?.payload_kg ?? "")}" />
          </div>
          <div>
            <label class="tr-label">Volume (m3)</label>
            <input class="tr-input" name="volume_m3" type="number" min="0" step="0.01" value="${escapeHTML(v?.volume_m3 ?? "")}" />
          </div>
          <div class="tr-full">
            <label class="tr-label"><input type="checkbox" name="is_active" ${v?.is_active === false ? "" : "checked"} /> Actif</label>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="vehicle"]');
      const payload = {
        organization_id: state.organizationId,
        plate_number: String(form.plate_number.value || "").trim(),
        name: String(form.name.value || "").trim() || null,
        vehicle_type: String(form.vehicle_type.value || "").trim() || null,
        payload_kg: form.payload_kg.value ? Number(form.payload_kg.value) : null,
        volume_m3: form.volume_m3.value ? Number(form.volume_m3.value) : null,
        is_active: Boolean(form.is_active.checked),
      };

      const bm = String(form.brand_model.value || "").trim();
      if (bm) {
        const parts = bm.split(" ");
        payload.brand = parts.shift() || null;
        payload.model = parts.join(" ").trim() || null;
      } else {
        payload.brand = null;
        payload.model = null;
      }

      if (!payload.plate_number) return showAlert(els, "Immatriculation requise.", "error");
      showAlert(els, STR.saving, "");

      const res = v
        ? await supabase.from(CONFIG.VEHICLES_TABLE).update(payload).eq("id", v.id)
        : await supabase.from(CONFIG.VEHICLES_TABLE).insert(payload);

      if (res.error) return showAlert(els, res.error.message, "error");
      await loadVehicles();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openDriverModal(id) {
    const d = (state.drivers || []).find((x) => String(x.id) === String(id)) || null;
    openModal(els, {
      title: d ? "Modifier chauffeur" : "Nouveau chauffeur",
      bodyHtml: `
        <form class="tr-form" data-form="driver">
          <div>
            <label class="tr-label">Prenom</label>
            <input class="tr-input" name="first_name" value="${escapeHTML(d?.first_name || "")}" />
          </div>
          <div>
            <label class="tr-label">Nom</label>
            <input class="tr-input" name="last_name" value="${escapeHTML(d?.last_name || "")}" />
          </div>
          <div>
            <label class="tr-label">Email</label>
            <input class="tr-input" name="email" type="email" value="${escapeHTML(d?.email || "")}" />
          </div>
          <div>
            <label class="tr-label">Telephone</label>
            <input class="tr-input" name="phone" value="${escapeHTML(d?.phone || "")}" />
          </div>
          <div>
            <label class="tr-label">Permis</label>
            <input class="tr-input" name="license_number" value="${escapeHTML(d?.license_number || "")}" />
          </div>
          <div>
            <label class="tr-label">Expiration</label>
            <input class="tr-input" name="license_expiry" type="date" value="${escapeHTML((d?.license_expiry || "").slice(0, 10))}" />
          </div>
          <div class="tr-full">
            <label class="tr-label"><input type="checkbox" name="is_active" ${d?.is_active === false ? "" : "checked"} /> Actif</label>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="driver"]');
      const payload = {
        organization_id: state.organizationId,
        first_name: String(form.first_name.value || "").trim() || null,
        last_name: String(form.last_name.value || "").trim() || null,
        email: String(form.email.value || "").trim() || null,
        phone: String(form.phone.value || "").trim() || null,
        license_number: String(form.license_number.value || "").trim() || null,
        license_expiry: form.license_expiry.value ? String(form.license_expiry.value) : null,
        is_active: Boolean(form.is_active.checked),
      };

      showAlert(els, STR.saving, "");
      const res = d
        ? await supabase.from(CONFIG.DRIVERS_TABLE).update(payload).eq("id", d.id)
        : await supabase.from(CONFIG.DRIVERS_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");
      await loadDrivers();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openRateCardModal(id) {
    const r = (state.rateCards || []).find((x) => String(x.id) === String(id)) || null;
    const tiersTxt = r?.tiers ? JSON.stringify(r.tiers, null, 2) : "[]";
    openModal(els, {
      title: r ? "Modifier tarif" : "Nouveau tarif",
      bodyHtml: `
        <form class="tr-form" data-form="rate">
          <div>
            <label class="tr-label">Code</label>
            <input class="tr-input" name="code" value="${escapeHTML(r?.code || "")}" placeholder="EX: ZONE-A" />
          </div>
          <div>
            <label class="tr-label">Nom</label>
            <input class="tr-input" name="name" required value="${escapeHTML(r?.name || "")}" />
          </div>
          <div>
            <label class="tr-label">Mode de calcul</label>
            <select class="tr-select" name="pricing_mode">${pricingModeOptions(r?.pricing_mode || "distance")}</select>
          </div>
          <div>
            <label class="tr-label">TVA (%) (optionnel)</label>
            <input class="tr-input" name="vat_rate" type="number" step="0.1" min="0" max="100" value="${escapeHTML(r?.vat_rate ?? "")}" />
          </div>
          <div>
            <label class="tr-label">Base (EUR)</label>
            <input class="tr-input" name="base_fee" type="number" step="0.01" min="0" value="${escapeHTML(Number(r?.base_fee_cents || 0) / 100)}" />
          </div>
          <div>
            <label class="tr-label">Prix / km (EUR)</label>
            <input class="tr-input" name="per_km" type="number" step="0.01" min="0" value="${escapeHTML(Number(r?.per_km_cents || 0) / 100)}" />
          </div>
          <div>
            <label class="tr-label">Minimum (EUR)</label>
            <input class="tr-input" name="min_price" type="number" step="0.01" min="0" value="${escapeHTML(Number(r?.min_price_cents || 0) / 100)}" />
          </div>
          <div class="tr-full">
            <label class="tr-label">Paliers (JSON) si mode = "Distance (paliers)"</label>
            <textarea class="tr-textarea" name="tiers" spellcheck="false">${escapeHTML(tiersTxt)}</textarea>
          </div>
          <div class="tr-full">
            <label class="tr-label"><input type="checkbox" name="is_active" ${r?.is_active === false ? "" : "checked"} /> Actif</label>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="rate"]');
      const payload = {
        organization_id: state.organizationId,
        code: String(form.code.value || "").trim() || null,
        name: String(form.name.value || "").trim(),
        pricing_mode: String(form.pricing_mode.value || "distance"),
        base_fee_cents: parseMoneyToCents(form.base_fee.value),
        per_km_cents: parseMoneyToCents(form.per_km.value),
        min_price_cents: parseMoneyToCents(form.min_price.value),
        vat_rate: form.vat_rate.value ? Number(form.vat_rate.value) : null,
        tiers: [],
        is_active: Boolean(form.is_active.checked),
      };
      if (!payload.name) return showAlert(els, "Nom requis.", "error");

      const tiersRaw = String(form.tiers.value || "").trim();
      if (payload.pricing_mode === "distance_tiers") {
        try {
          const parsed = JSON.parse(tiersRaw || "[]");
          payload.tiers = Array.isArray(parsed) ? parsed : [];
        } catch {
          return showAlert(els, "JSON paliers invalide.", "error");
        }
      } else {
        payload.tiers = [];
      }

      showAlert(els, STR.saving, "");
      const res = r
        ? await supabase.from(CONFIG.RATE_CARDS_TABLE).update(payload).eq("id", r.id)
        : await supabase.from(CONFIG.RATE_CARDS_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");
      await loadRateCards();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openTourModal(id) {
    const t = (state.tours || []).find((x) => String(x.id) === String(id)) || null;
    const driverOptions = optionList(state.drivers || [], (d) => [d.first_name, d.last_name].filter(Boolean).join(" "), t?.driver_id);
    const vehicleOptions = optionList(state.vehicles || [], (v) => v.plate_number || v.name, t?.vehicle_id);

    openModal(els, {
      title: t ? "Modifier tournee" : "Nouvelle tournee",
      bodyHtml: `
        <form class="tr-form" data-form="tour">
          <div>
            <label class="tr-label">Reference</label>
            <input class="tr-input" name="reference" value="${escapeHTML(t?.reference || "")}" placeholder="EX: T-2026-0001" />
          </div>
          <div>
            <label class="tr-label">Date</label>
            <input class="tr-input" type="date" name="tour_date" value="${escapeHTML((t?.tour_date || "").slice(0, 10))}" />
          </div>
          <div>
            <label class="tr-label">Chauffeur</label>
            <select class="tr-select" name="driver_id">${driverOptions}</select>
          </div>
          <div>
            <label class="tr-label">Vehicule</label>
            <select class="tr-select" name="vehicle_id">${vehicleOptions}</select>
          </div>
          <div class="tr-full">
            <label class="tr-label">Adresse depart</label>
            <input class="tr-input" name="start_address" value="${escapeHTML(t?.start_address || "")}" />
          </div>
          <div class="tr-full">
            <label class="tr-label">Adresse arrivee</label>
            <input class="tr-input" name="end_address" value="${escapeHTML(t?.end_address || "")}" />
          </div>
          <div>
            <label class="tr-label">Statut</label>
            <select class="tr-select" name="status">${statusOptions(t?.status || "draft")}</select>
          </div>
          <div>
            <label class="tr-label">Distance (km)</label>
            <input class="tr-input" name="distance_km" value="${escapeHTML(t?.distance_m ? (Number(t.distance_m) / 1000).toFixed(1) : "")}" placeholder="Auto" disabled />
          </div>
          <div class="tr-full">
            <label class="tr-label">Notes</label>
            <textarea class="tr-textarea" name="notes">${escapeHTML(t?.notes || "")}</textarea>
          </div>
        </form>

        <div class="tr-card" style="margin-top:12px;">
          <div class="tr-row">
            <div>
              <h3>Courses de la tournee</h3>
              <div class="tr-meta">Assigne des courses a cette tournee, puis calcule la distance sur plusieurs adresses.</div>
            </div>
          </div>
          <div class="tr-actions-inline" style="margin-top:10px;">
            <button type="button" class="tr-btn" data-action="add-shipments" ${t ? "" : "disabled"}>Ajouter des courses</button>
            <button type="button" class="tr-btn tr-btn--primary" data-action="compute-tour" ${t ? "" : "disabled"}>${escapeHTML(
              STR.btnComputeRoute
            )}</button>
          </div>
          <div class="tr-meta" data-tour-shipments style="margin-top:10px;"></div>
        </div>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    const shipmentsBox = els.modalBody.querySelector("[data-tour-shipments]");

    const renderTourShipments = () => {
      if (!t?.id) {
        shipmentsBox.innerHTML = `<em>Enregistre la tournee pour ajouter des courses.</em>`;
        return;
      }
      const list = (state.shipments || [])
        .filter((s) => String(s.tour_id || "") === String(t?.id || ""))
        .sort((a, b) => Number(a.tour_sequence || 0) - Number(b.tour_sequence || 0));
      if (!list.length) {
        shipmentsBox.innerHTML = `<em>Aucune course assignee.</em>`;
        return;
      }
      shipmentsBox.innerHTML = list
        .map((s, idx) => {
          const label = `${s.reference || "Course"} - ${pickClientName(s) || "—"} (${(Number(s.distance_m || 0) / 1000).toFixed(1)} km)`;
          return `<div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:8px 0; border-top:1px solid rgba(15,23,42,0.08);">
            <div style="min-width:0;">
              <strong>${escapeHTML(label)}</strong>
              <div class="tr-meta">${escapeHTML(s.pickup_city || "")} -> ${escapeHTML(s.delivery_city || "")}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap: wrap; justify-content:flex-end;">
              <button type="button" class="tr-btn" data-action="up" data-sid="${escapeHTML(s.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="tr-btn" data-action="down" data-sid="${escapeHTML(s.id)}" ${idx === list.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="tr-btn tr-btn--danger" data-action="remove" data-sid="${escapeHTML(s.id)}">Retirer</button>
            </div>
          </div>`;
        })
        .join("");

      shipmentsBox.querySelectorAll("button[data-action]").forEach((btn) => {
        const sid = String(btn.getAttribute("data-sid") || "");
        const action = String(btn.getAttribute("data-action") || "");
        if (action === "remove") btn.addEventListener("click", () => unassignShipmentFromTour(sid, t.id));
        if (action === "up") btn.addEventListener("click", () => moveShipmentInTour(sid, -1, t.id));
        if (action === "down") btn.addEventListener("click", () => moveShipmentInTour(sid, +1, t.id));
      });
    };

    renderTourShipments();

    const addBtn = els.modalBody.querySelector('[data-action="add-shipments"]');
    const computeBtn = els.modalBody.querySelector('[data-action="compute-tour"]');

    addBtn?.addEventListener("click", () => openAssignShipmentsModal(t.id, renderTourShipments));
    computeBtn?.addEventListener("click", () => computeTourDistance(t.id));

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="tour"]');
      const payload = {
        organization_id: state.organizationId,
        reference: String(form.reference.value || "").trim() || null,
        tour_date: form.tour_date.value ? String(form.tour_date.value) : null,
        driver_id: form.driver_id.value ? String(form.driver_id.value) : null,
        vehicle_id: form.vehicle_id.value ? String(form.vehicle_id.value) : null,
        start_address: String(form.start_address.value || "").trim() || null,
        end_address: String(form.end_address.value || "").trim() || null,
        status: String(form.status.value || "draft"),
        notes: String(form.notes.value || "").trim() || null,
      };

      showAlert(els, STR.saving, "");
      const res = t
        ? await supabase.from(CONFIG.TOURS_TABLE).update(payload).eq("id", t.id)
        : await supabase.from(CONFIG.TOURS_TABLE).insert(payload).select("id").maybeSingle();

      if (res.error) return showAlert(els, res.error.message, "error");
      await loadTours();
      if (!t) {
        // Refresh shipments assignment UI after creating a tour (needs id).
        await loadShipments();
      }
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openAssignShipmentsModal(tourId, onDone) {
    const available = (state.shipments || []).filter((s) => !s.tour_id);
    if (!available.length) {
      showAlert(els, "Aucune course disponible.", "error");
      return;
    }

    openModal(els, {
      title: "Ajouter des courses",
      bodyHtml: `
        <div class="tr-meta">Selectionne une ou plusieurs courses a assigner a la tournee.</div>
        <div style="margin-top:10px; display:grid; gap:10px;">
          ${available
            .slice(0, 80)
            .map((s) => {
              const label = `${s.reference || "Course"} - ${pickClientName(s) || "—"}`;
              return `<label style="display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid rgba(15,23,42,0.10); border-radius:14px; background: rgba(255,255,255,0.92);">
                <input type="checkbox" value="${escapeHTML(s.id)}" data-sel />
                <span style="min-width:0;">
                  <strong>${escapeHTML(label)}</strong>
                  <div class="tr-meta">${escapeHTML(s.pickup_city || "")} -> ${escapeHTML(s.delivery_city || "")}</div>
                </span>
              </label>`;
            })
            .join("")}
        </div>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML("Ajouter")}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const ids = Array.from(els.modalBody.querySelectorAll("input[data-sel]:checked")).map((i) => String(i.value));
      if (!ids.length) return;

      const current = (state.shipments || []).filter((s) => String(s.tour_id || "") === String(tourId));
      const baseSeq = current.reduce((m, s) => Math.max(m, Number(s.tour_sequence || 0)), 0);

      showAlert(els, STR.saving, "");
      for (let i = 0; i < ids.length; i++) {
        const sid = ids[i];
        const seq = baseSeq + i + 1;
        const up = await supabase
          .from(CONFIG.SHIPMENTS_TABLE)
          .update({ tour_id: tourId, tour_sequence: seq })
          .eq("id", sid);
        if (up.error) {
          showAlert(els, up.error.message, "error");
          return;
        }
      }

      await loadShipments();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      onDone && onDone();
      render();
    });
  }

  async function moveShipmentInTour(shipmentId, delta, tourId) {
    const list = (state.shipments || [])
      .filter((s) => String(s.tour_id || "") === String(tourId))
      .sort((a, b) => Number(a.tour_sequence || 0) - Number(b.tour_sequence || 0));
    const idx = list.findIndex((s) => String(s.id) === String(shipmentId));
    if (idx < 0) return;
    const j = idx + delta;
    if (j < 0 || j >= list.length) return;
    const a = list[idx];
    const b = list[j];

    const seqA = Number(a.tour_sequence || 0) || idx + 1;
    const seqB = Number(b.tour_sequence || 0) || j + 1;

    await supabase.from(CONFIG.SHIPMENTS_TABLE).update({ tour_sequence: seqB }).eq("id", a.id);
    await supabase.from(CONFIG.SHIPMENTS_TABLE).update({ tour_sequence: seqA }).eq("id", b.id);
    await loadShipments();
    render();
  }

  async function unassignShipmentFromTour(shipmentId, tourId) {
    showAlert(els, STR.saving, "");
    const res = await supabase
      .from(CONFIG.SHIPMENTS_TABLE)
      .update({ tour_id: null, tour_sequence: null })
      .eq("id", shipmentId);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadShipments();
    showAlert(els, STR.saved, "ok");
    render();
  }

  function openShipmentModal(id) {
    const s = (state.shipments || []).find((x) => String(x.id) === String(id)) || null;
    const clientOptions = optionList(state.clients || [], (c) => c.legal_name || c.name || c.trade_name, s?.client_id);
    const rateOptions = optionList(state.rateCards || [], (r) => `${r.code || "TARIF"} • ${r.name}`, s?.rate_card_id);
    const tourOptions = optionList(state.tours || [], (t) => `${t.reference || "Tournee"} • ${t.tour_date ? fmtDate(t.tour_date) : ""}`, s?.tour_id);

    const distKm = s?.distance_m ? (Number(s.distance_m) / 1000).toFixed(1) : "";
    const durMin = s?.duration_s ? Math.round(Number(s.duration_s) / 60) : "";
    const price = Number.isFinite(Number(s?.price_cents)) ? (Number(s.price_cents) / 100).toFixed(2) : "";

    openModal(els, {
      title: s ? "Modifier course" : "Nouvelle course",
      bodyHtml: `
        <form class="tr-form" data-form="shipment">
          <div>
            <label class="tr-label">Reference</label>
            <input class="tr-input" name="reference" value="${escapeHTML(s?.reference || "")}" placeholder="EX: C-2026-0001" />
          </div>
          <div>
            <label class="tr-label">Client</label>
            <select class="tr-select" name="client_id">${clientOptions}</select>
          </div>
          <div class="tr-full">
            <label class="tr-label">Titre (optionnel)</label>
            <input class="tr-input" name="title" value="${escapeHTML(s?.title || "")}" placeholder="EX: Livraison palettes" />
          </div>

          <div class="tr-full">
            <label class="tr-label">Adresse de chargement</label>
            <input class="tr-input" name="pickup_address" value="${escapeHTML(s?.pickup_address || "")}" />
          </div>
          <div class="tr-full">
            <label class="tr-label">Adresse de livraison</label>
            <input class="tr-input" name="delivery_address" value="${escapeHTML(s?.delivery_address || "")}" />
          </div>

          <div>
            <label class="tr-label">Enlevement (prevu)</label>
            <input class="tr-input" type="datetime-local" name="planned_pickup_at" value="${escapeHTML(toLocalDatetimeValue(s?.planned_pickup_at))}" />
          </div>
          <div>
            <label class="tr-label">Livraison (prevue)</label>
            <input class="tr-input" type="datetime-local" name="planned_delivery_at" value="${escapeHTML(toLocalDatetimeValue(s?.planned_delivery_at))}" />
          </div>

          <div>
            <label class="tr-label">Poids (kg)</label>
            <input class="tr-input" type="number" step="0.1" min="0" name="weight_kg" value="${escapeHTML(s?.weight_kg ?? "")}" />
          </div>
          <div>
            <label class="tr-label">Volume (m3)</label>
            <input class="tr-input" type="number" step="0.01" min="0" name="volume_m3" value="${escapeHTML(s?.volume_m3 ?? "")}" />
          </div>
          <div>
            <label class="tr-label">Palettes</label>
            <input class="tr-input" type="number" step="1" min="0" name="pallet_count" value="${escapeHTML(s?.pallet_count ?? "")}" />
          </div>
          <div>
            <label class="tr-label">Statut</label>
            <select class="tr-select" name="status">${statusOptions(s?.status || "draft")}</select>
          </div>

          <div>
            <label class="tr-label">Tournee (optionnel)</label>
            <select class="tr-select" name="tour_id">${tourOptions}</select>
          </div>
          <div>
            <label class="tr-label">Tarif</label>
            <select class="tr-select" name="rate_card_id">${rateOptions}</select>
          </div>

          <div>
            <label class="tr-label">Distance (km)</label>
            <input class="tr-input" name="distance_km" value="${escapeHTML(distKm)}" placeholder="Auto" disabled />
          </div>
          <div>
            <label class="tr-label">Duree (min)</label>
            <input class="tr-input" name="duration_min" value="${escapeHTML(durMin)}" placeholder="Auto" disabled />
          </div>
          <div>
            <label class="tr-label">Tarif estime (EUR)</label>
            <input class="tr-input" name="price" value="${escapeHTML(price)}" placeholder="Auto" />
          </div>
          <div>
            <label class="tr-label">TVA (%) (optionnel)</label>
            <input class="tr-input" name="vat_rate" type="number" step="0.1" min="0" max="100" value="${escapeHTML(s?.vat_rate ?? "")}" />
          </div>

          <div class="tr-full">
            <label class="tr-label">Notes</label>
            <textarea class="tr-textarea" name="notes">${escapeHTML(s?.notes || "")}</textarea>
          </div>
        </form>
        <div class="tr-actions-inline">
          <button type="button" class="tr-btn" data-action="route">${escapeHTML(STR.btnComputeRoute)}</button>
          <button type="button" class="tr-btn" data-action="estimate">${escapeHTML(STR.btnEstimate)}</button>
        </div>
      `,
      footHtml: `
        <button type="button" class="tr-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="tr-btn tr-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    const form = els.modalBody.querySelector('[data-form="shipment"]');

    els.modalBody.querySelector('[data-action="route"]').addEventListener("click", async () => {
      const pickup = String(form.pickup_address.value || "").trim();
      const delivery = String(form.delivery_address.value || "").trim();
      if (!pickup || !delivery) return showAlert(els, "Adresses requises.", "error");

      showAlert(els, "Calcul distance...", "");
      const { data, error } = await supabase.functions.invoke(CONFIG.EDGE_FN_ROUTE, {
        body: { organization_id: state.organizationId, waypoints: [{ address: pickup }, { address: delivery }] },
      });
      if (error) return showAlert(els, error.message || "Erreur distance.", "error");

      const distance_m = Number(data?.distance_m || 0);
      const duration_s = Number(data?.duration_s || 0);
      form.distance_km.value = distance_m > 0 ? (distance_m / 1000).toFixed(1) : "";
      form.duration_min.value = duration_s > 0 ? String(Math.round(duration_s / 60)) : "";

      form.dataset.distance_m = String(distance_m || "");
      form.dataset.duration_s = String(duration_s || "");

      showAlert(els, "Distance calculee.", "ok");
    });

    els.modalBody.querySelector('[data-action="estimate"]').addEventListener("click", () => {
      const rateId = String(form.rate_card_id.value || "").trim();
      if (!rateId) return showAlert(els, "Choisis un tarif.", "error");
      const rate = (state.rateCards || []).find((x) => String(x.id) === rateId) || null;
      if (!rate) return showAlert(els, "Tarif introuvable.", "error");
      const dist = Number(form.dataset.distance_m || s?.distance_m || 0);
      if (!dist) return showAlert(els, "Calcule la distance avant.", "error");
      const priceCents = computeShipmentPriceCents({ distance_m: dist, rateCard: rate });
      form.price.value = (priceCents / 100).toFixed(2);
      if (!form.vat_rate.value && rate?.vat_rate != null) form.vat_rate.value = String(rate.vat_rate);
      showAlert(els, "Tarif estime.", "ok");
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const payload = {
        organization_id: state.organizationId,
        reference: String(form.reference.value || "").trim() || null,
        client_id: form.client_id.value ? String(form.client_id.value) : null,
        title: String(form.title.value || "").trim() || null,
        pickup_address: String(form.pickup_address.value || "").trim() || null,
        delivery_address: String(form.delivery_address.value || "").trim() || null,
        planned_pickup_at: form.planned_pickup_at.value ? new Date(form.planned_pickup_at.value).toISOString() : null,
        planned_delivery_at: form.planned_delivery_at.value ? new Date(form.planned_delivery_at.value).toISOString() : null,
        weight_kg: form.weight_kg.value ? Number(form.weight_kg.value) : null,
        volume_m3: form.volume_m3.value ? Number(form.volume_m3.value) : null,
        pallet_count: form.pallet_count.value ? Number(form.pallet_count.value) : null,
        status: String(form.status.value || "draft"),
        tour_id: form.tour_id.value ? String(form.tour_id.value) : null,
        rate_card_id: form.rate_card_id.value ? String(form.rate_card_id.value) : null,
        price_cents: form.price.value ? parseMoneyToCents(form.price.value) : null,
        vat_rate: form.vat_rate.value ? Number(form.vat_rate.value) : null,
        notes: String(form.notes.value || "").trim() || null,
      };

      const dist = Number(form.dataset.distance_m || s?.distance_m || 0);
      const dur = Number(form.dataset.duration_s || s?.duration_s || 0);
      if (dist) payload.distance_m = dist;
      if (dur) payload.duration_s = dur;

      showAlert(els, STR.saving, "");
      const res = s
        ? await supabase.from(CONFIG.SHIPMENTS_TABLE).update(payload).eq("id", s.id)
        : await supabase.from(CONFIG.SHIPMENTS_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");

      await loadShipments();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function toLocalDatetimeValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  // =========================================================
  // Navigation to billing
  // =========================================================

  function goQuoteFromShipment(id) {
    const s = (state.shipments || []).find((x) => String(x.id) === String(id)) || null;
    if (!s) return;
    const u = new URL(CONFIG.QUOTE_URL, location.origin);
    if (s.client_id) u.searchParams.set("client_id", String(s.client_id));
    u.searchParams.set("transport_shipment_id", String(s.id));
    location.href = u.pathname + u.search;
  }

  function goInvoiceFromShipment(id) {
    const s = (state.shipments || []).find((x) => String(x.id) === String(id)) || null;
    if (!s) return;
    const u = new URL(CONFIG.INVOICE_URL, location.origin);
    if (s.client_id) u.searchParams.set("client_id", String(s.client_id));
    u.searchParams.set("transport_shipment_id", String(s.id));
    location.href = u.pathname + u.search;
  }

  // =========================================================
  // Deletes
  // =========================================================

  async function deleteVehicle(id) {
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.VEHICLES_TABLE).delete().eq("id", id);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadVehicles();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteDriver(id) {
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.DRIVERS_TABLE).delete().eq("id", id);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadDrivers();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteRateCard(id) {
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.RATE_CARDS_TABLE).delete().eq("id", id);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadRateCards();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteTour(id) {
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.TOURS_TABLE).delete().eq("id", id);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadTours();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteShipment(id) {
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.SHIPMENTS_TABLE).delete().eq("id", id);
    if (res.error) return showAlert(els, res.error.message, "error");
    await loadShipments();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  // =========================================================
  // Tour distance calc (multiple addresses)
  // =========================================================

  async function computeTourDistance(tourId) {
    const t = (state.tours || []).find((x) => String(x.id) === String(tourId)) || null;
    if (!t) return;

    const list = (state.shipments || [])
      .filter((s) => String(s.tour_id || "") === String(tourId))
      .sort((a, b) => Number(a.tour_sequence || 0) - Number(b.tour_sequence || 0));

    const points = [];
    const startAddr = String(t.start_address || "").trim();
    if (startAddr) points.push({ address: startAddr });
    list.forEach((s) => {
      const a = String(s.pickup_address || "").trim();
      const b = String(s.delivery_address || "").trim();
      if (a) points.push({ address: a });
      if (b) points.push({ address: b });
    });
    const endAddr = String(t.end_address || "").trim();
    if (endAddr) points.push({ address: endAddr });

    if (points.length < 2) {
      showAlert(els, "Ajoute des adresses (depart/arrivee + courses).", "error");
      return;
    }

    showAlert(els, "Calcul distance tournee...", "");
    const { data, error } = await supabase.functions.invoke(CONFIG.EDGE_FN_ROUTE, {
      body: { organization_id: state.organizationId, waypoints: points },
    });
    if (error) return showAlert(els, error.message || "Erreur distance.", "error");
    const distance_m = Number(data?.distance_m || 0);
    const duration_s = Number(data?.duration_s || 0);
    const up = await supabase.from(CONFIG.TOURS_TABLE).update({ distance_m, duration_s }).eq("id", t.id);
    if (up.error) return showAlert(els, up.error.message, "error");
    await loadTours();
    showAlert(els, "Distance tournee calculee.", "ok");
    render();
  }

  // =========================================================
  // New action
  // =========================================================

  function openNewForCurrentTab() {
    if (state.tab === "shipments") return openShipmentModal("");
    if (state.tab === "tours") return openTourModal("");
    if (state.tab === "vehicles") return openVehicleModal("");
    if (state.tab === "drivers") return openDriverModal("");
    if (state.tab === "rates") return openRateCardModal("");
  }
});
