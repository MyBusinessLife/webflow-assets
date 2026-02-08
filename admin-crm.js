document.documentElement.setAttribute("data-page", "admin-crm");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminCrmLoaded) return;
  window.__mblAdminCrmLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[CRM] Root introuvable. Ajoute <div data-mbl-crm></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[CRM]", ...a);
  const warn = (...a) => DEBUG && console.warn("[CRM]", ...a);

  const CFG = window.__MBL_CFG__ || {};

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    ORGANIZATION_ID: String(root.dataset.organizationId || CFG.ORGANIZATION_ID || window.__MBL_ORG_ID__ || "").trim(),
    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || "/application/login").trim(),

    CURRENCY: String(root.dataset.currency || CFG.CURRENCY || "EUR").trim() || "EUR",
    THEME_PRIMARY: String(root.dataset.themePrimary || CFG.THEME_PRIMARY || "").trim(),

    PIPELINES_TABLE: String(root.dataset.pipelinesTable || "crm_pipelines"),
    STAGES_TABLE: String(root.dataset.stagesTable || "crm_stages"),
    DEALS_TABLE: String(root.dataset.dealsTable || "crm_deals"),
    CLIENTS_TABLE: String(root.dataset.clientsTable || "clients"),
    CONTACTS_TABLE: String(root.dataset.contactsTable || "client_contacts"),

    MAX_DEALS: Math.max(50, Number(root.dataset.maxDeals || 800)),
  };

  const STR = {
    title: "CRM",
    subtitle: "Pipeline, opportunites et suivi client",
    viewBoard: "Kanban",
    viewTable: "Liste",
    pipelineLabel: "Pipeline",
    searchPlaceholder: "Rechercher une opportunite, un client…",
    addDeal: "Nouvelle opportunite",
    noDeals: "Aucune opportunite pour ce pipeline.",
    loginRequiredTitle: "Connexion requise",
    loginRequiredBody: "Connecte-toi pour acceder au CRM.",
    goLogin: "Se connecter",
    loadError: "Impossible de charger le CRM.",
    saving: "Enregistrement…",
    saved: "Enregistre",
    deleted: "Supprime",
    dealTitle: "Opportunite",
    dealClient: "Client",
    dealContact: "Contact",
    dealStage: "Etape",
    dealAmount: "Montant",
    dealProbability: "Probabilite",
    dealCloseDate: "Date de closing",
    dealDesc: "Description",
    dealNotes: "Notes",
    notePlaceholder: "Ajouter une note…",
    addNote: "Ajouter",
    create: "Creer",
    update: "Mettre a jour",
    cancel: "Annuler",
    delete: "Supprimer",
    contactAdd: "Ajouter un contact",
    contactName: "Nom",
    contactEmail: "Email",
    contactPhone: "Telephone",
    contactCreate: "Creer le contact",
  };

  function findRoot() {
    return (
      document.querySelector("[data-mbl-crm]") ||
      document.querySelector("#mbl-crm") ||
      document.querySelector(".mbl-crm") ||
      null
    );
  }

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pad2(n) {
    const v = String(n || "");
    return v.length === 1 ? "0" + v : v;
  }

  function formatDate(isoOrDate) {
    if (!isoOrDate) return "";
    const d = new Date(isoOrDate);
    if (!Number.isFinite(d.getTime())) return "";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function formatCents(cents) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency: CONFIG.CURRENCY, maximumFractionDigits: 0 });
  }

  function parseMoneyToCents(value) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function clamp255(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function parseColorToRgb(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
    }

    const m = s.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
    );
    if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };

    return null;
  }

  function darkenRgb(rgb, factor = 0.82) {
    const f = Math.max(0, Math.min(1, Number(factor) || 0.82));
    return { r: clamp255(rgb.r * f), g: clamp255(rgb.g * f), b: clamp255(rgb.b * f) };
  }

  function resolveThemePrimary() {
    const fromDs = String(CONFIG.THEME_PRIMARY || "").trim();
    if (fromDs) return fromDs;
    try {
      const v = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary") || "").trim();
      if (v) return v;
    } catch (_) {}
    return "#0ea5e9";
  }

  function injectStyles() {
    if (document.getElementById("mbl-crm-style")) return;
    const primary = resolveThemePrimary();
    const baseRgb = parseColorToRgb(primary) || { r: 14, g: 165, b: 233 };
    const darkRgb = darkenRgb(baseRgb, 0.82);
    const st = document.createElement("style");
    st.id = "mbl-crm-style";
    st.textContent = `
      html[data-page="admin-crm"] {
        --crm-primary: ${primary};
        --crm-primary-rgb: ${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b};
        --crm-primary-dark-rgb: ${darkRgb.r}, ${darkRgb.g}, ${darkRgb.b};
        --crm-bg: #f6fbff;
        --crm-card: #ffffff;
        --crm-text: #0b2240;
        --crm-muted: #5b728a;
        --crm-border: rgba(15, 23, 42, 0.10);
        --crm-shadow: 0 22px 60px rgba(2, 6, 23, 0.10);
        --crm-shadow-sm: 0 12px 28px rgba(2, 6, 23, 0.10);
      }

      .mbl-crm {
        background: radial-gradient(1000px 500px at 10% 0%, rgba(var(--crm-primary-rgb, 14, 165, 233),0.10), transparent 55%),
                    radial-gradient(900px 450px at 90% 10%, rgba(15,23,42,0.08), transparent 60%),
                    var(--crm-bg);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 18px;
        box-shadow: var(--crm-shadow);
        overflow: hidden;
        color: var(--crm-text);
      }

      .mbl-crm__top {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.70));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }

      .mbl-crm__title {
        margin: 0;
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 0.01em;
      }
      .mbl-crm__subtitle {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--crm-muted);
        font-weight: 650;
      }

      .mbl-crm__controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .crm-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .crm-label {
        font-size: 12px;
        font-weight: 800;
        color: rgba(2, 6, 23, 0.70);
      }
      .crm-select,
      .crm-input {
        height: 42px;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.96);
        padding: 0 12px;
        color: rgba(2, 6, 23, 0.88);
        font-weight: 750;
        outline: none;
        min-width: 180px;
      }
      .crm-input::placeholder { color: rgba(2, 6, 23, 0.40); font-weight: 650; }
      .crm-select:focus,
      .crm-input:focus {
        border-color: rgba(var(--crm-primary-rgb, 14, 165, 233),0.45);
        box-shadow: 0 0 0 4px rgba(var(--crm-primary-rgb, 14, 165, 233),0.14);
      }

      .crm-tabs {
        display: inline-flex;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.85);
        border-radius: 12px;
        overflow: hidden;
      }
      .crm-tab {
        border: 0;
        background: transparent;
        padding: 9px 12px;
        font-weight: 900;
        font-size: 13px;
        color: rgba(2, 6, 23, 0.65);
        cursor: pointer;
      }
      .crm-tab.is-active {
        background: linear-gradient(180deg, rgba(var(--crm-primary-rgb, 14, 165, 233),0.18), rgba(var(--crm-primary-rgb, 14, 165, 233),0.10));
        color: rgba(2, 6, 23, 0.90);
      }

      .crm-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 42px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2, 6, 23, 0.86);
        font-weight: 900;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      .crm-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(var(--crm-primary-rgb, 14, 165, 233),0.35);
        box-shadow: var(--crm-shadow-sm);
      }
      .crm-btn--primary {
        border-color: rgba(var(--crm-primary-rgb, 14, 165, 233),0.35);
        background: linear-gradient(180deg, rgba(var(--crm-primary-rgb, 14, 165, 233),0.95), rgba(var(--crm-primary-dark-rgb, 2, 132, 199),0.95));
        color: #fff;
      }
      .crm-btn--danger {
        border-color: rgba(239,68,68,0.30);
        background: #fff;
        color: #991b1b;
      }

      .mbl-crm__banner {
        display: none;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 750;
        font-size: 13px;
      }
      .mbl-crm__banner.is-error { display: block; background: #fef2f2; color: #991b1b; }
      .mbl-crm__banner.is-info { display: block; background: #eff6ff; color: #1e40af; }

      .mbl-crm__body {
        padding: 14px;
      }

      .crm-board {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        overflow-x: auto;
        padding-bottom: 6px;
      }
      .crm-col {
        flex: 0 0 320px;
        background: rgba(255,255,255,0.75);
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 16px;
        overflow: hidden;
      }
      .crm-col__head {
        padding: 12px 12px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.75));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .crm-col__title {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 950;
        font-size: 13px;
        letter-spacing: 0.01em;
      }
      .crm-pill {
        font-size: 12px;
        font-weight: 900;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        background: rgba(255,255,255,0.9);
        color: rgba(2, 6, 23, 0.72);
      }
      .crm-col__list {
        padding: 10px;
        min-height: 80px;
      }

      .crm-card {
        background: var(--crm-card);
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 14px;
        padding: 11px 11px 10px;
        box-shadow: 0 10px 26px rgba(2, 6, 23, 0.08);
        cursor: grab;
        transition: transform 140ms ease, box-shadow 160ms ease, border-color 160ms ease;
      }
      .crm-card + .crm-card { margin-top: 10px; }
      .crm-card:hover {
        transform: translateY(-1px);
        border-color: rgba(var(--crm-primary-rgb, 14, 165, 233),0.30);
        box-shadow: 0 16px 34px rgba(2, 6, 23, 0.12);
      }
      .crm-card:active { cursor: grabbing; }
      .crm-card.is-dragging { opacity: 0.55; transform: rotate(-1deg); }
      .crm-card__title { font-weight: 950; font-size: 13.5px; margin: 0 0 4px; }
      .crm-card__meta { font-size: 12.5px; color: var(--crm-muted); font-weight: 700; }
      .crm-card__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 8px;
      }
      .crm-amount { font-weight: 950; font-size: 13px; color: rgba(2, 6, 23, 0.88); }
      .crm-date { font-size: 12px; font-weight: 850; color: rgba(2, 6, 23, 0.62); }

      .crm-table-wrap {
        overflow: auto;
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 16px;
        background: rgba(255,255,255,0.72);
      }
      .crm-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 860px;
      }
      .crm-table th, .crm-table td {
        padding: 12px 12px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        vertical-align: middle;
      }
      .crm-table th {
        text-align: left;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(2, 6, 23, 0.55);
        font-weight: 950;
        background: rgba(255,255,255,0.86);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .crm-row {
        cursor: pointer;
        background: rgba(255,255,255,0.86);
      }
      .crm-row:hover {
        background: rgba(var(--crm-primary-rgb, 14, 165, 233),0.08);
      }
      .crm-muted { color: rgba(2, 6, 23, 0.58); font-weight: 750; }

      /* Modal */
      .crm-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(2, 6, 23, 0.56);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }
      .crm-modal__card {
        width: min(920px, 100%);
        background: rgba(255,255,255,0.98);
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        box-shadow: 0 30px 120px rgba(0,0,0,0.28);
        overflow: hidden;
        max-height: min(84vh, 860px);
        display: flex;
        flex-direction: column;
      }
      .crm-modal__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 16px 12px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
      }
      .crm-modal__head h3 { margin: 0; font-weight: 950; font-size: 16px; }
      .crm-modal__body {
        padding: 14px 16px 16px;
        overflow: auto;
      }
      .crm-grid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 14px;
      }
      .crm-cardbox {
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 16px;
        background: rgba(255,255,255,0.86);
        padding: 14px;
      }
      .crm-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .crm-form .crm-field { min-width: 0; }
      .crm-form .crm-field.is-full { grid-column: 1 / -1; }
      .crm-textarea {
        width: 100%;
        min-height: 92px;
        resize: vertical;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.96);
        padding: 10px 12px;
        font-weight: 750;
        color: rgba(2, 6, 23, 0.88);
        outline: none;
      }
      .crm-textarea:focus {
        border-color: rgba(var(--crm-primary-rgb, 14, 165, 233),0.45);
        box-shadow: 0 0 0 4px rgba(var(--crm-primary-rgb, 14, 165, 233),0.14);
      }

      .crm-notes {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .crm-note {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.88);
        border-radius: 14px;
        padding: 10px 12px;
      }
      .crm-note__meta {
        font-size: 12px;
        color: rgba(2,6,23,0.55);
        font-weight: 850;
        margin-bottom: 6px;
      }
      .crm-note__txt {
        font-size: 13px;
        color: rgba(2,6,23,0.82);
        font-weight: 700;
        white-space: pre-wrap;
      }

      @media (max-width: 860px) {
        .mbl-crm__top { align-items: flex-start; flex-direction: column; }
        .mbl-crm__controls { width: 100%; justify-content: flex-start; }
        .crm-input, .crm-select { min-width: 0; width: 100%; }
        .crm-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 7000);
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
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 7000);
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

  async function getSupabase() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    await ensureSupabaseJs();
    if (!window.supabase?.createClient) throw new Error("Supabase non charge.");
    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: CONFIG.AUTH_STORAGE_KEY },
    });
    window.__MBL_SUPABASE__ = client;
    return client;
  }

  async function getCurrentUser(supabase) {
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgId(supabase, userId) {
    if (CONFIG.ORGANIZATION_ID) return CONFIG.ORGANIZATION_ID;
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return "";
    return String(data?.[0]?.organization_id || "").trim();
  }

  function renderShell() {
    root.classList.add("mbl-crm");
    root.innerHTML = `
      <div class="mbl-crm__top">
        <div>
          <h2 class="mbl-crm__title">${escapeHTML(STR.title)}</h2>
          <p class="mbl-crm__subtitle">${escapeHTML(STR.subtitle)}</p>
        </div>
        <div class="mbl-crm__controls">
          <div class="crm-field">
            <div class="crm-label">${escapeHTML(STR.pipelineLabel)}</div>
            <select class="crm-select" data-pipeline></select>
          </div>
          <div class="crm-tabs" role="tablist">
            <button type="button" class="crm-tab is-active" data-view="board" role="tab" aria-selected="true">${escapeHTML(
              STR.viewBoard
            )}</button>
            <button type="button" class="crm-tab" data-view="table" role="tab" aria-selected="false">${escapeHTML(
              STR.viewTable
            )}</button>
          </div>
          <input class="crm-input" data-search placeholder="${escapeHTML(STR.searchPlaceholder)}" />
          <button type="button" class="crm-btn crm-btn--primary" data-add>${escapeHTML(STR.addDeal)}</button>
        </div>
      </div>
      <div class="mbl-crm__banner" data-banner></div>
      <div class="mbl-crm__body">
        <div data-view-wrap></div>
      </div>
    `;

    return {
      pipeline: root.querySelector("[data-pipeline]"),
      tabs: Array.from(root.querySelectorAll("[data-view]")),
      search: root.querySelector("[data-search]"),
      add: root.querySelector("[data-add]"),
      banner: root.querySelector("[data-banner]"),
      viewWrap: root.querySelector("[data-view-wrap]"),
    };
  }

  function showBanner(els, text, mode) {
    if (!els.banner) return;
    const m = String(mode || "");
    els.banner.className = "mbl-crm__banner";
    if (m === "error") els.banner.classList.add("is-error");
    if (m === "info") els.banner.classList.add("is-info");
    els.banner.textContent = text || "";
  }

  function toast(text) {
    const t = document.createElement("div");
    t.textContent = text || "";
    t.style.position = "fixed";
    t.style.right = "16px";
    t.style.bottom = "16px";
    t.style.zIndex = "2147483647";
    t.style.padding = "10px 12px";
    t.style.borderRadius = "12px";
    t.style.border = "1px solid rgba(15,23,42,0.12)";
    t.style.background = "rgba(255,255,255,0.96)";
    t.style.boxShadow = "0 18px 44px rgba(2,6,23,0.14)";
    t.style.fontWeight = "900";
    t.style.color = "rgba(2,6,23,0.85)";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function pickPipeline(pipelines) {
    const qp = String(url.searchParams.get("pipeline") || "").trim();
    if (qp && pipelines.some((p) => p.id === qp)) return qp;
    const def = pipelines.find((p) => p.is_default);
    return def?.id || pipelines[0]?.id || "";
  }

  function groupDealsByStage(deals) {
    const map = new Map();
    deals.forEach((d) => {
      const k = String(d.stage_id || "");
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    });
    return map;
  }

  function setView(state, els, view) {
    state.view = view;
    els.tabs.forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderCurrentView(state, els);
  }

  function normText(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function dealMatches(deal, q) {
    if (!q) return true;
    const hay = [
      deal.title,
      deal.client?.name,
      deal.contact?.name,
      deal.contact?.email,
    ]
      .filter(Boolean)
      .map(normText)
      .join(" | ");
    return hay.includes(q);
  }

  function renderBoard(state, els) {
    const q = normText(state.search);
    const filtered = state.deals.filter((d) => dealMatches(d, q));
    const grouped = groupDealsByStage(filtered);

    const stageHtml = state.stages
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((stg) => {
        const list = grouped.get(String(stg.id)) || [];
        const total = list.reduce((acc, d) => acc + Number(d.amount_cents || 0), 0);
        const pill = `${list.length} • ${formatCents(total)}`;
        return `
          <section class="crm-col" data-stage="${escapeHTML(stg.id)}">
            <div class="crm-col__head">
              <div class="crm-col__title">
                <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${escapeHTML(
                  stg.color || "var(--crm-primary)"
                )};box-shadow:0 0 0 3px rgba(255,255,255,0.9)"></span>
                <span>${escapeHTML(stg.name)}</span>
              </div>
              <span class="crm-pill">${escapeHTML(pill)}</span>
            </div>
            <div class="crm-col__list" data-dropzone>
              ${
                list
                  .map((d) => {
                    return `
                      <article class="crm-card" draggable="true" data-deal="${escapeHTML(d.id)}">
                        <div class="crm-card__title">${escapeHTML(d.title)}</div>
                        <div class="crm-card__meta">${escapeHTML(d.client?.name || "—")}</div>
                        <div class="crm-card__row">
                          <div class="crm-amount">${escapeHTML(formatCents(d.amount_cents || 0))}</div>
                          <div class="crm-date">${escapeHTML(d.expected_close_date ? formatDate(d.expected_close_date) : "")}</div>
                        </div>
                      </article>
                    `;
                  })
                  .join("") || `<div class="crm-muted" style="padding:8px 6px;">—</div>`
              }
            </div>
          </section>
        `;
      })
      .join("");

    els.viewWrap.innerHTML = `
      <div class="crm-board" data-board>
        ${stageHtml || `<div class="crm-muted">${escapeHTML(STR.noDeals)}</div>`}
      </div>
    `;

    wireBoardDnD(state, els);
    wireDealOpen(state, els);
  }

  function renderTable(state, els) {
    const q = normText(state.search);
    const filtered = state.deals.filter((d) => dealMatches(d, q));
    const stageById = new Map(state.stages.map((s) => [s.id, s]));

    els.viewWrap.innerHTML = `
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>${escapeHTML(STR.dealTitle)}</th>
              <th>${escapeHTML(STR.dealClient)}</th>
              <th>${escapeHTML(STR.dealStage)}</th>
              <th style="text-align:right">${escapeHTML(STR.dealAmount)}</th>
              <th>${escapeHTML(STR.dealCloseDate)}</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered
                .map((d) => {
                  const stg = stageById.get(d.stage_id) || null;
                  return `
                    <tr class="crm-row" data-deal="${escapeHTML(d.id)}">
                      <td><strong>${escapeHTML(d.title)}</strong></td>
                      <td class="crm-muted">${escapeHTML(d.client?.name || "—")}</td>
                      <td class="crm-muted">${escapeHTML(stg?.name || "—")}</td>
                      <td style="text-align:right"><strong>${escapeHTML(formatCents(d.amount_cents || 0))}</strong></td>
                      <td class="crm-muted">${escapeHTML(d.expected_close_date ? formatDate(d.expected_close_date) : "")}</td>
                    </tr>
                  `;
                })
                .join("") || `<tr><td colspan="5" class="crm-muted" style="padding:16px;">${escapeHTML(STR.noDeals)}</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    wireDealOpen(state, els);
  }

  function renderCurrentView(state, els) {
    if (state.view === "table") return renderTable(state, els);
    return renderBoard(state, els);
  }

  function wireDealOpen(state, els) {
    els.viewWrap.querySelectorAll("[data-deal]").forEach((node) => {
      node.addEventListener("click", (e) => {
        // Avoid opening when dragging
        if (state.drag.active) return;
        const id = String(node.getAttribute("data-deal") || "").trim();
        if (!id) return;
        const deal = state.deals.find((d) => d.id === id);
        if (!deal) return;
        openDealModal(state, els, deal);
      });
    });
  }

  function wireBoardDnD(state, els) {
    const board = els.viewWrap.querySelector("[data-board]");
    if (!board) return;

    const stageById = new Map(state.stages.map((s) => [s.id, s]));

    board.querySelectorAll("[data-deal]").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        const id = String(card.getAttribute("data-deal") || "").trim();
        state.drag.active = true;
        state.drag.dealId = id;
        card.classList.add("is-dragging");
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
        } catch (_) {}
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        setTimeout(() => {
          state.drag.active = false;
          state.drag.dealId = "";
        }, 40);
      });
    });

    board.querySelectorAll("[data-stage]").forEach((col) => {
      const stageId = String(col.getAttribute("data-stage") || "").trim();
      const dz = col.querySelector("[data-dropzone]");
      if (!dz) return;

      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = "move";
        } catch (_) {}
      });
      dz.addEventListener("drop", async (e) => {
        e.preventDefault();
        const id = state.drag.dealId || (() => {
          try {
            return String(e.dataTransfer.getData("text/plain") || "");
          } catch (_) {
            return "";
          }
        })();
        const deal = state.deals.find((d) => d.id === id);
        if (!deal) return;
        if (deal.stage_id === stageId) return;

        const stage = stageById.get(stageId);
        if (!stage) return;

        // Optimistic UI
        const prevStage = deal.stage_id;
        const prevStatus = deal.status;
        const prevClosedAt = deal.closed_at;
        deal.stage_id = stageId;
        const patch = computeDealOutcomePatch(stage);
        deal.status = patch.status;
        deal.closed_at = patch.closed_at;
        renderCurrentView(state, els);

        try {
          const supabase = state.supabase;
          const { error } = await supabase
            .from(CONFIG.DEALS_TABLE)
            .update({ stage_id: stageId, status: patch.status, closed_at: patch.closed_at })
            .eq("id", id);
          if (error) throw error;
        } catch (err) {
          warn("move deal failed:", err);
          // rollback
          deal.stage_id = prevStage;
          deal.status = prevStatus;
          deal.closed_at = prevClosedAt;
          renderCurrentView(state, els);
          toast("Impossible de deplacer l'opportunite.");
        }
      });
    });
  }

  function computeDealOutcomePatch(stage) {
    const now = new Date().toISOString();
    if (stage.is_won) return { status: "won", closed_at: now };
    if (stage.is_lost) return { status: "lost", closed_at: now };
    return { status: "open", closed_at: null };
  }

  function createModal(contentHtml) {
    const wrap = document.createElement("div");
    wrap.className = "crm-modal";
    wrap.innerHTML = contentHtml;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) close();
    });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") close();
      },
      { once: true }
    );
    return { wrap, close };
  }

  async function loadContactsForClient(state, clientId) {
    if (!clientId) return [];
    const { data, error } = await state.supabase
      .from(CONFIG.CONTACTS_TABLE)
      .select("id, name, email, phone, is_primary")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true })
      .limit(200);
    if (error) return [];
    return data || [];
  }

  async function loadNotes(state, dealId) {
    if (!dealId) return [];
    const { data, error } = await state.supabase
      .from("crm_notes")
      .select("id, content, created_at, created_by")
      .eq("entity_type", "deal")
      .eq("entity_id", dealId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return data || [];
  }

  async function addNote(state, dealId, content) {
    const txt = String(content || "").trim();
    if (!txt) return;
    const { error } = await state.supabase.from("crm_notes").insert({
      organization_id: state.orgId,
      entity_type: "deal",
      entity_id: dealId,
      content: txt,
      created_by: state.user?.id || null,
    });
    if (error) throw error;
  }

  function stageOptions(state) {
    return state.stages
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}</option>`)
      .join("");
  }

  function clientOptions(state) {
    return state.clients
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"))
      .map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`)
      .join("");
  }

  async function openDealModal(state, els, dealOrNull) {
    const isEdit = Boolean(dealOrNull?.id);
    const deal = dealOrNull
      ? JSON.parse(JSON.stringify(dealOrNull))
      : {
          id: "",
          title: "",
          client_id: state.clients[0]?.id || "",
          primary_contact_id: "",
          stage_id: state.stages.find((s) => !s.is_won && !s.is_lost)?.id || state.stages[0]?.id || "",
          amount_cents: 0,
          probability: 50,
          expected_close_date: "",
          description: "",
          status: "open",
        };

    const modal = createModal(`
      <div class="crm-modal__card" role="dialog" aria-modal="true">
        <div class="crm-modal__head">
          <h3>${escapeHTML(isEdit ? STR.update : STR.create)} ${escapeHTML(STR.dealTitle)}</h3>
          <div style="display:flex; gap:10px; align-items:center;">
            ${isEdit ? `<button type="button" class="crm-btn crm-btn--danger" data-del>${escapeHTML(STR.delete)}</button>` : ""}
            <button type="button" class="crm-btn" data-close>${escapeHTML(STR.cancel)}</button>
            <button type="button" class="crm-btn crm-btn--primary" data-save>${escapeHTML(isEdit ? STR.update : STR.create)}</button>
          </div>
        </div>
        <div class="crm-modal__body">
          <div class="crm-grid">
            <section class="crm-cardbox">
              <div class="crm-form">
                <div class="crm-field is-full">
                  <div class="crm-label">${escapeHTML(STR.dealTitle)}</div>
                  <input class="crm-input" data-f="title" placeholder="Ex: Contrat maintenance 2026" value="${escapeHTML(deal.title)}" />
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealClient)}</div>
                  <select class="crm-select" data-f="client">
                    <option value="">—</option>
                    ${clientOptions(state)}
                  </select>
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealContact)}</div>
                  <select class="crm-select" data-f="contact">
                    <option value="">—</option>
                  </select>
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealStage)}</div>
                  <select class="crm-select" data-f="stage">
                    ${stageOptions(state)}
                  </select>
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealAmount)}</div>
                  <input class="crm-input" data-f="amount" placeholder="0" value="${escapeHTML(
                    String((Number(deal.amount_cents || 0) / 100).toString().replace(".", ","))
                  )}" />
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealProbability)} (%)</div>
                  <input class="crm-input" data-f="prob" inputmode="numeric" value="${escapeHTML(String(deal.probability ?? 50))}" />
                </div>

                <div class="crm-field">
                  <div class="crm-label">${escapeHTML(STR.dealCloseDate)}</div>
                  <input class="crm-input" data-f="close" type="date" value="${escapeHTML(String(deal.expected_close_date || ""))}" />
                </div>

                <div class="crm-field is-full">
                  <div class="crm-label">${escapeHTML(STR.dealDesc)}</div>
                  <textarea class="crm-textarea" data-f="desc" placeholder="Contexte, besoin, prochaines etapes…">${escapeHTML(
                    deal.description || ""
                  )}</textarea>
                </div>
              </div>
            </section>

            <aside class="crm-cardbox">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:950">${escapeHTML(STR.dealNotes)}</div>
                <button type="button" class="crm-btn" data-add-contact style="height:38px">${escapeHTML(STR.contactAdd)}</button>
              </div>
              <div style="margin-top:10px; display:flex; gap:10px;">
                <textarea class="crm-textarea" data-note placeholder="${escapeHTML(STR.notePlaceholder)}" style="min-height:74px;"></textarea>
              </div>
              <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                <button type="button" class="crm-btn crm-btn--primary" data-note-add style="height:38px">${escapeHTML(
                  STR.addNote
                )}</button>
              </div>
              <div class="crm-notes" data-notes style="margin-top:12px;"></div>
            </aside>
          </div>
        </div>
      </div>
    `);

    const card = modal.wrap.querySelector(".crm-modal__card");
    const btnClose = modal.wrap.querySelector("[data-close]");
    const btnSave = modal.wrap.querySelector("[data-save]");
    const btnDel = modal.wrap.querySelector("[data-del]");
    const selClient = modal.wrap.querySelector('[data-f="client"]');
    const selContact = modal.wrap.querySelector('[data-f="contact"]');
    const selStage = modal.wrap.querySelector('[data-f="stage"]');
    const notesWrap = modal.wrap.querySelector("[data-notes]");

    btnClose?.addEventListener("click", modal.close);

    // Set current values
    if (selClient) selClient.value = deal.client_id || "";
    if (selStage) selStage.value = deal.stage_id || "";

    async function refreshContacts(clientId) {
      const contacts = await loadContactsForClient(state, clientId);
      selContact.innerHTML = `<option value="">—</option>` +
        contacts.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}${c.email ? " • " + escapeHTML(c.email) : ""}</option>`).join("");
      selContact.value = deal.primary_contact_id || "";
    }

    async function refreshNotes() {
      if (!deal.id) {
        notesWrap.innerHTML = `<div class="crm-muted">Les notes seront disponibles apres creation.</div>`;
        return;
      }
      const notes = await loadNotes(state, deal.id);
      notesWrap.innerHTML =
        notes
          .map(
            (n) => `
              <div class="crm-note">
                <div class="crm-note__meta">${escapeHTML(formatDate(n.created_at))}</div>
                <div class="crm-note__txt">${escapeHTML(n.content)}</div>
              </div>
            `
          )
          .join("") || `<div class="crm-muted">Aucune note.</div>`;
    }

    await refreshContacts(selClient.value);
    await refreshNotes();

    selClient?.addEventListener("change", async () => {
      deal.client_id = String(selClient.value || "").trim();
      deal.primary_contact_id = "";
      await refreshContacts(deal.client_id);
    });

    modal.wrap.querySelector("[data-note-add]")?.addEventListener("click", async () => {
      const ta = modal.wrap.querySelector("[data-note]");
      const txt = String(ta?.value || "").trim();
      if (!txt) return;
      try {
        if (!deal.id) {
          toast("Cree l'opportunite avant d'ajouter une note.");
          return;
        }
        await addNote(state, deal.id, txt);
        ta.value = "";
        await refreshNotes();
      } catch (e) {
        warn("add note error", e);
        toast("Impossible d'ajouter la note.");
      }
    });

    modal.wrap.querySelector("[data-add-contact]")?.addEventListener("click", () => {
      openContactQuickCreate(state, deal.client_id, async (newContactId) => {
        deal.primary_contact_id = newContactId || "";
        await refreshContacts(deal.client_id);
        selContact.value = newContactId || "";
      });
    });

    btnSave?.addEventListener("click", async () => {
      const title = String(modal.wrap.querySelector('[data-f="title"]')?.value || "").trim();
      if (!title) {
        toast("Titre requis.");
        return;
      }
      const clientId = String(selClient?.value || "").trim() || null;
      const contactId = String(selContact?.value || "").trim() || null;
      const stageId = String(selStage?.value || "").trim() || null;
      const amountCents = parseMoneyToCents(modal.wrap.querySelector('[data-f="amount"]')?.value || "");
      const prob = Math.max(0, Math.min(100, Number(modal.wrap.querySelector('[data-f="prob"]')?.value || 50) || 0));
      const close = String(modal.wrap.querySelector('[data-f="close"]')?.value || "").trim() || null;
      const desc = String(modal.wrap.querySelector('[data-f="desc"]')?.value || "").trim() || null;

      btnSave.disabled = true;
      const prevText = btnSave.textContent;
      btnSave.textContent = STR.saving;
      try {
        const stage = state.stages.find((s) => s.id === stageId) || null;
        const out = stage ? computeDealOutcomePatch(stage) : { status: "open", closed_at: null };
        const payload = {
          organization_id: state.orgId,
          pipeline_id: state.pipelineId,
          stage_id: stageId,
          title,
          client_id: clientId,
          primary_contact_id: contactId,
          amount_cents: amountCents,
          currency: CONFIG.CURRENCY,
          probability: prob,
          expected_close_date: close,
          description: desc,
          status: out.status,
          closed_at: out.closed_at,
        };

        let saved = null;
        if (isEdit) {
          const { data, error } = await state.supabase
            .from(CONFIG.DEALS_TABLE)
            .update(payload)
            .eq("id", deal.id)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          saved = data || { id: deal.id };
        } else {
          const { data, error } = await state.supabase
            .from(CONFIG.DEALS_TABLE)
            .insert(payload)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          saved = data;
        }

        toast(STR.saved);
        modal.close();
        await reloadDeals(state, els);
        if (!isEdit && saved?.id) {
          const just = state.deals.find((d) => d.id === saved.id);
          if (just) openDealModal(state, els, just);
        }
      } catch (e) {
        warn("save deal error", e);
        toast("Impossible d'enregistrer.");
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = prevText;
      }
    });

    btnDel?.addEventListener("click", async () => {
      if (!isEdit) return;
      if (!confirm("Supprimer cette opportunite ?")) return;
      btnDel.disabled = true;
      try {
        const { error } = await state.supabase.from(CONFIG.DEALS_TABLE).delete().eq("id", deal.id);
        if (error) throw error;
        toast(STR.deleted);
        modal.close();
        await reloadDeals(state, els);
      } catch (e) {
        warn("delete deal error", e);
        toast("Suppression impossible.");
      } finally {
        btnDel.disabled = false;
      }
    });

    // Autofocus
    setTimeout(() => {
      const input = modal.wrap.querySelector('[data-f="title"]');
      input?.focus?.();
    }, 0);
  }

  function openContactQuickCreate(state, clientId, onCreated) {
    const modal = createModal(`
      <div class="crm-modal__card" role="dialog" aria-modal="true" style="width:min(560px,100%);">
        <div class="crm-modal__head">
          <h3>${escapeHTML(STR.contactAdd)}</h3>
          <div style="display:flex; gap:10px;">
            <button type="button" class="crm-btn" data-close>${escapeHTML(STR.cancel)}</button>
            <button type="button" class="crm-btn crm-btn--primary" data-save>${escapeHTML(STR.contactCreate)}</button>
          </div>
        </div>
        <div class="crm-modal__body">
          <div class="crm-form">
            <div class="crm-field is-full">
              <div class="crm-label">${escapeHTML(STR.contactName)}</div>
              <input class="crm-input" data-f="name" placeholder="Ex: Jean Dupont" />
            </div>
            <div class="crm-field">
              <div class="crm-label">${escapeHTML(STR.contactEmail)}</div>
              <input class="crm-input" data-f="email" placeholder="email@domaine.fr" />
            </div>
            <div class="crm-field">
              <div class="crm-label">${escapeHTML(STR.contactPhone)}</div>
              <input class="crm-input" data-f="phone" placeholder="06..." />
            </div>
          </div>
        </div>
      </div>
    `);

    const btnClose = modal.wrap.querySelector("[data-close]");
    const btnSave = modal.wrap.querySelector("[data-save]");
    btnClose?.addEventListener("click", modal.close);

    btnSave?.addEventListener("click", async () => {
      const name = String(modal.wrap.querySelector('[data-f="name"]')?.value || "").trim();
      if (!name) return toast("Nom requis.");
      btnSave.disabled = true;
      try {
        const payload = {
          organization_id: state.orgId,
          client_id: clientId,
          name,
          email: String(modal.wrap.querySelector('[data-f="email"]')?.value || "").trim() || null,
          phone: String(modal.wrap.querySelector('[data-f="phone"]')?.value || "").trim() || null,
          is_active: true,
          is_primary: false,
        };
        const { data, error } = await state.supabase
          .from(CONFIG.CONTACTS_TABLE)
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        modal.close();
        toast("Contact cree.");
        if (typeof onCreated === "function") onCreated(data?.id || "");
      } catch (e) {
        warn("create contact error", e);
        toast("Impossible de creer le contact.");
      } finally {
        btnSave.disabled = false;
      }
    });

    setTimeout(() => modal.wrap.querySelector('[data-f="name"]')?.focus?.(), 0);
  }

  async function reloadDeals(state, els) {
    const { data, error } = await state.supabase
      .from(CONFIG.DEALS_TABLE)
      .select(
        "id, title, stage_id, pipeline_id, client_id, primary_contact_id, amount_cents, currency, probability, expected_close_date, status, closed_at, updated_at, created_at, client:client_id(id, name), contact:primary_contact_id(id, name, email)"
      )
      .eq("pipeline_id", state.pipelineId)
      .order("updated_at", { ascending: false })
      .limit(CONFIG.MAX_DEALS);
    if (error) throw error;
    state.deals = data || [];
    renderCurrentView(state, els);
  }

  async function loadInitial(state, els) {
    const [pipelinesRes, clientsRes] = await Promise.all([
      state.supabase
        .from(CONFIG.PIPELINES_TABLE)
        .select("id, name, sort_order, is_default, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(50),
      state.supabase
        .from(CONFIG.CLIENTS_TABLE)
        .select("id, name, email, phone, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(2000),
    ]);

    if (pipelinesRes.error) throw pipelinesRes.error;
    if (clientsRes.error) throw clientsRes.error;

    state.pipelines = pipelinesRes.data || [];
    state.clients = clientsRes.data || [];

    state.pipelineId = pickPipeline(state.pipelines);
    if (!state.pipelineId) throw new Error("Aucun pipeline.");

    // Fill pipeline select
    els.pipeline.innerHTML = state.pipelines
      .map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`)
      .join("");
    els.pipeline.value = state.pipelineId;

    // Stages
    const stgRes = await state.supabase
      .from(CONFIG.STAGES_TABLE)
      .select("id, name, key, sort_order, color, is_won, is_lost")
      .eq("pipeline_id", state.pipelineId)
      .order("sort_order", { ascending: true })
      .limit(60);
    if (stgRes.error) throw stgRes.error;
    state.stages = stgRes.data || [];

    await reloadDeals(state, els);
  }

  function wireEvents(state, els) {
    els.tabs.forEach((btn) => {
      btn.addEventListener("click", () => setView(state, els, btn.dataset.view || "board"));
    });

    els.pipeline.addEventListener("change", async () => {
      state.pipelineId = String(els.pipeline.value || "").trim();
      url.searchParams.set("pipeline", state.pipelineId);
      history.replaceState(null, "", url.toString());
      showBanner(els, "", "");
      try {
        const stgRes = await state.supabase
          .from(CONFIG.STAGES_TABLE)
          .select("id, name, key, sort_order, color, is_won, is_lost")
          .eq("pipeline_id", state.pipelineId)
          .order("sort_order", { ascending: true })
          .limit(60);
        if (stgRes.error) throw stgRes.error;
        state.stages = stgRes.data || [];
        await reloadDeals(state, els);
      } catch (e) {
        warn("pipeline change error", e);
        showBanner(els, STR.loadError, "error");
      }
    });

    let searchT = null;
    els.search.addEventListener("input", () => {
      clearTimeout(searchT);
      searchT = setTimeout(() => {
        state.search = String(els.search.value || "");
        renderCurrentView(state, els);
      }, 60);
    });

    els.add.addEventListener("click", () => openDealModal(state, els, null));
  }

  // ===== boot =====
  injectStyles();
  const els = renderShell();

  try {
    const supabase = await getSupabase();
    const user = await getCurrentUser(supabase);
    if (!user) {
      showBanner(els, STR.loginRequiredBody, "info");
      els.viewWrap.innerHTML = `
        <div style="padding:18px;">
          <div style="max-width:560px; background:#ffffff; border:1px solid rgba(15,23,42,0.10); border-radius:16px; padding:16px;">
            <div style="font-weight:950; font-size:16px;">${escapeHTML(STR.loginRequiredTitle)}</div>
            <div style="margin-top:6px; color: rgba(2,6,23,0.70); font-weight:750;">${escapeHTML(STR.loginRequiredBody)}</div>
            <div style="margin-top:12px;">
              <a class="crm-btn crm-btn--primary" href="${escapeHTML(CONFIG.LOGIN_PATH)}" style="text-decoration:none;">${escapeHTML(
                STR.goLogin
              )}</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) {
      showBanner(els, "Organisation introuvable pour ce compte.", "error");
      return;
    }

    const state = {
      supabase,
      user,
      orgId,
      pipelines: [],
      stages: [],
      clients: [],
      deals: [],
      pipelineId: "",
      view: "board",
      search: "",
      drag: { active: false, dealId: "" },
    };

    wireEvents(state, els);
    await loadInitial(state, els);
    renderCurrentView(state, els);
  } catch (e) {
    warn("boot error", e);
    showBanner(els, STR.loadError, "error");
  }
});
