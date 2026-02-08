document.documentElement.setAttribute("data-page", "admin-logistics");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminLogisticsLoaded) return;
  window.__mblAdminLogisticsLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-logistics]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-logistics") || null;
  if (!root) {
    console.error("[LOGISTICS] Root introuvable. Ajoute <div data-mbl-logistics></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[LOGISTICS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[LOGISTICS]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),
    SUBSCRIPTIONS_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",

    ORGANIZATION_ID: String(root.dataset.organizationId || CFG.ORGANIZATION_ID || window.__MBL_ORG_ID__ || "").trim(),

    WAREHOUSES_TABLE: String(root.dataset.warehousesTable || "logistics_warehouses"),
    LOCATIONS_TABLE: String(root.dataset.locationsTable || "logistics_locations"),
    STOCK_LEVELS_TABLE: String(root.dataset.stockLevelsTable || "logistics_stock_levels"),
    RESERVATIONS_TABLE: String(root.dataset.reservationsTable || "logistics_stock_reservations"),
    REORDER_TABLE: String(root.dataset.reorderTable || "logistics_reorder_rules"),
    MOVEMENTS_TABLE: String(root.dataset.movementsTable || "stock_movements"),
    PRODUCTS_TABLE: String(root.dataset.productsTable || "products"),

    THEME_PRIMARY: String(root.dataset.themePrimary || CFG.THEME_PRIMARY || "").trim(),
  };

  const STR = {
    title: "Logistique",
    subtitle: "Entrepots, emplacements, stock, reservations et operations",

    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour acceder au module Logistique.",
    loginCta: "Se connecter",

    forbiddenTitle: "Acces refuse",
    forbiddenBody: "Ce module est reserve aux administrateurs.",

    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module Logistique.",
    moduleCta: "Gerer mon abonnement",

    loadError: "Impossible de charger le module logistique.",
    saving: "Enregistrement...",
    saved: "Enregistre",
    deleted: "Supprime",
    confirmDelete: "Supprimer cet element ?",
    searchPlaceholder: "Rechercher (produit, SKU, emplacement, mouvement...)",

    tabStock: "Stock",
    tabMoves: "Mouvements",
    tabWarehouses: "Entrepots",
    tabLocations: "Emplacements",
    tabReservations: "Reservations",

    btnNew: "Nouveau",
    btnOps: "Operation stock",
    btnClose: "Fermer",
    btnCancel: "Annuler",
    btnSave: "Enregistrer",
    btnDelete: "Supprimer",
    btnRelease: "Liberer",

    emptyTitle: "Aucun resultat",
    emptyBody: "Aucun element ne correspond aux filtres actuels.",

    opReceipt: "Reception (Entree)",
    opShip: "Expedition (Sortie)",
    opTransfer: "Transfert",
    opAdjust: "Ajustement",

    moveIn: "ENTREE",
    moveOut: "SORTIE",
    moveAdj: "AJUST",
    moveReturn: "RETOUR",

    statusActive: "Actif",
    statusInactive: "Inactif",
  };

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

  function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function parseColorToRgb(color) {
    const c = String(color || "").trim();
    if (!c) return null;

    const hex3 = /^#([0-9a-f]{3})$/i.exec(c);
    const hex6 = /^#([0-9a-f]{6})$/i.exec(c);
    if (hex3) {
      const h = hex3[1];
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      };
    }
    if (hex6) {
      const h = hex6[1];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }

    const m = c
      .replace(/\s+/g, "")
      .match(/^rgba?\((\d{1,3})[,/](\d{1,3})[,/](\d{1,3})(?:[,/][0-9.]+)?\)$/i);
    if (m) {
      return { r: clamp(m[1], 0, 255), g: clamp(m[2], 0, 255), b: clamp(m[3], 0, 255) };
    }

    return null;
  }

  function rgba(rgb, a) {
    const r = clamp(rgb?.r, 0, 255);
    const g = clamp(rgb?.g, 0, 255);
    const b = clamp(rgb?.b, 0, 255);
    const alpha = clamp(a, 0, 1);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function fmtInt(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
  }

  function pickFirst(items) {
    return Array.isArray(items) && items.length ? items[0] : null;
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
    if (document.getElementById("mbl-logistics-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-logistics-style";
    const primary = readPrimary();
    const rgb = parseColorToRgb(primary) || { r: 14, g: 165, b: 233 };
    const rgbDark = { r: Math.round(rgb.r * 0.72), g: Math.round(rgb.g * 0.72), b: Math.round(rgb.b * 0.72) };
    const p14 = rgba(rgb, 0.14);
    const p10 = rgba(rgb, 0.1);
    const p12 = rgba(rgb, 0.12);
    const p55 = rgba(rgb, 0.55);
    const p18 = rgba(rgb, 0.18);
    const p92 = rgba(rgb, 0.92);
    st.textContent = `
      html[data-page="admin-logistics"] .lg-shell,
      html[data-page="admin-logistics"] .lg-shell * { box-sizing: border-box; }

      html[data-page="admin-logistics"] .lg-shell {
        --lg-primary: ${primary};
        --lg-ink: rgba(2, 6, 23, 0.92);
        --lg-muted: rgba(2, 6, 23, 0.62);
        --lg-border: rgba(15, 23, 42, 0.10);
        --lg-surface: rgba(255,255,255,0.86);
        --lg-surface2: rgba(255,255,255,0.92);
        --lg-shadow: 0 20px 60px rgba(2,6,23,0.10);
        --lg-radius: 18px;
        font-family: inherit;
        color: var(--lg-ink);
        width: min(1180px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: var(--lg-radius);
        border: 1px solid var(--lg-border);
        background:
          radial-gradient(900px 480px at 20% 0%, ${p14}, transparent 60%),
          radial-gradient(900px 480px at 100% 0%, ${p10}, transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.94));
        box-shadow: var(--lg-shadow);
      }

      html[data-page="admin-logistics"] .lg-head {
        display:flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      html[data-page="admin-logistics"] .lg-title { margin:0; font-size: 20px; font-weight: 1000; letter-spacing: -0.02em; }
      html[data-page="admin-logistics"] .lg-subtitle { margin: 4px 0 0; color: var(--lg-muted); font-weight: 800; }

      html[data-page="admin-logistics"] .lg-actions { display:flex; gap:10px; flex-wrap: wrap; justify-content:flex-end; }
      html[data-page="admin-logistics"] .lg-btn {
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        font-weight: 900;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
      }
      html[data-page="admin-logistics"] .lg-btn:hover { transform: translateY(-1px); border-color: rgba(14,165,233,0.55); box-shadow: 0 10px 22px rgba(2,6,23,0.10); }
      html[data-page="admin-logistics"] .lg-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
      html[data-page="admin-logistics"] .lg-btn--primary {
        border-color: transparent;
        background: linear-gradient(135deg, ${p92}, ${rgba(rgbDark, 1)});
        color: #fff;
      }

      html[data-page="admin-logistics"] .lg-tabs {
        display:flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px;
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 16px;
        background: rgba(255,255,255,0.64);
        margin-bottom: 10px;
      }
      html[data-page="admin-logistics"] .lg-tab {
        height: 36px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.85);
        font-weight: 950;
        color: rgba(2,6,23,0.76);
        cursor: pointer;
        transition: background .18s ease, transform .18s ease, border-color .18s ease;
      }
      html[data-page="admin-logistics"] .lg-tab[aria-selected="true"] {
        border-color: ${p55};
        background: ${p12};
        color: rgba(2,6,23,0.88);
      }

      html[data-page="admin-logistics"] .lg-topbar {
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      html[data-page="admin-logistics"] .lg-search {
        flex: 1;
        min-width: 200px;
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        outline: none;
      }
      html[data-page="admin-logistics"] .lg-search:focus { border-color: ${p55}; box-shadow: 0 0 0 4px ${p12}; }

      html[data-page="admin-logistics"] .lg-select {
        height: 42px;
        padding: 0 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        font-weight: 900;
        color: rgba(2,6,23,0.76);
        outline: none;
      }
      html[data-page="admin-logistics"] .lg-select:focus { border-color: ${p55}; box-shadow: 0 0 0 4px ${p12}; }

      html[data-page="admin-logistics"] .lg-alert {
        display:none;
        margin: 12px 0;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(241,245,249,0.9);
        color: rgba(2,6,23,0.82);
        font-weight: 800;
      }
      html[data-page="admin-logistics"] .lg-alert.is-error {
        border-color: rgba(239,68,68,0.30);
        background: rgba(254,242,242,0.92);
        color: rgba(153,27,27,0.92);
      }
      html[data-page="admin-logistics"] .lg-alert.is-ok {
        border-color: rgba(34,197,94,0.30);
        background: rgba(240,253,244,0.92);
        color: rgba(20,83,45,0.92);
      }

      html[data-page="admin-logistics"] .lg-grid { display:grid; grid-template-columns: 1fr; gap: 12px; }
      html[data-page="admin-logistics"] .lg-card {
        background: rgba(255,255,255,0.86);
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }
      html[data-page="admin-logistics"] .lg-row { display:flex; justify-content: space-between; align-items:flex-start; gap: 12px; }
      html[data-page="admin-logistics"] .lg-row h3 { margin:0; font-size: 15px; font-weight: 1000; letter-spacing: -0.01em; }
      html[data-page="admin-logistics"] .lg-meta { color: var(--lg-muted); font-size: 13px; line-height: 1.4; margin-top: 2px; }
      html[data-page="admin-logistics"] .lg-badges { display:flex; gap: 8px; flex-wrap: wrap; justify-content:flex-end; }
      html[data-page="admin-logistics"] .lg-badge {
        display:inline-flex; align-items:center; gap: 8px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.92);
        padding: 6px 10px;
        border-radius: 999px;
        font-weight: 1000;
        font-size: 12px;
        color: rgba(2,6,23,0.74);
        white-space: nowrap;
      }
      html[data-page="admin-logistics"] .lg-dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      html[data-page="admin-logistics"] .lg-badge.is-warn .lg-dot { background: rgba(234,179,8,0.92); }
      html[data-page="admin-logistics"] .lg-badge.is-danger .lg-dot { background: rgba(239,68,68,0.92); }
      html[data-page="admin-logistics"] .lg-badge.is-ok .lg-dot { background: rgba(34,197,94,0.92); }

      html[data-page="admin-logistics"] .lg-actions-inline { display:flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }

      /* Modal */
      html[data-page="admin-logistics"] .lg-modal { position: fixed; inset: 0; z-index: 2147483646; display:none; }
      html[data-page="admin-logistics"] .lg-modal.is-open { display:block; }
      html[data-page="admin-logistics"] .lg-modal__backdrop { position:absolute; inset:0; background: rgba(2,6,23,0.55); backdrop-filter: blur(8px); }
      html[data-page="admin-logistics"] .lg-modal__panel {
        position:absolute; left:50%; top: 6vh; transform: translateX(-50%);
        width: min(860px, calc(100% - 24px));
        max-height: 88vh;
        overflow:auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.96);
        box-shadow: 0 24px 80px rgba(0,0,0,0.22);
        padding: 14px;
      }
      html[data-page="admin-logistics"] .lg-modal__head { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      html[data-page="admin-logistics"] .lg-modal__title { margin:0; font-size: 16px; font-weight: 1000; }
      html[data-page="admin-logistics"] .lg-form { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
      html[data-page="admin-logistics"] .lg-form .lg-full { grid-column: 1 / -1; }
      html[data-page="admin-logistics"] .lg-label { display:block; font-weight: 950; font-size: 12px; color: rgba(2,6,23,0.72); margin: 0 0 6px; }
      html[data-page="admin-logistics"] .lg-input, html[data-page="admin-logistics"] .lg-textarea {
        width:100%;
        height: 42px;
        padding: 0 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        outline: none;
      }
      html[data-page="admin-logistics"] .lg-textarea { height:auto; min-height: 90px; resize: vertical; padding: 10px 12px; }
      html[data-page="admin-logistics"] .lg-input:focus, html[data-page="admin-logistics"] .lg-textarea:focus {
        border-color: ${p55};
        box-shadow: 0 0 0 4px ${p12};
      }
      html[data-page="admin-logistics"] .lg-modal__foot { display:flex; justify-content:flex-end; gap: 10px; margin-top: 14px; }

      html[data-page="admin-logistics"] .lg-empty { text-align:center; padding: 32px 14px; color: var(--lg-muted); }
      html[data-page="admin-logistics"] .lg-empty strong { display:block; color: rgba(2,6,23,0.84); margin-bottom: 6px; }

      @media (max-width: 760px) {
        html[data-page="admin-logistics"] .lg-form { grid-template-columns: 1fr; }
        html[data-page="admin-logistics"] .lg-head { flex-direction: column; }
        html[data-page="admin-logistics"] .lg-actions { width: 100%; }
        html[data-page="admin-logistics"] .lg-actions .lg-btn { flex: 1; }
      }
    `;
    document.head.appendChild(st);
  }

  function renderShell() {
    root.innerHTML = `
      <section class="lg-shell">
        <header class="lg-head">
          <div>
            <h1 class="lg-title">${escapeHTML(STR.title)}</h1>
            <p class="lg-subtitle">${escapeHTML(STR.subtitle)}</p>
          </div>
          <div class="lg-actions">
            <button type="button" class="lg-btn" data-action="ops">${escapeHTML(STR.btnOps)}</button>
            <button type="button" class="lg-btn lg-btn--primary" data-action="new">${escapeHTML(STR.btnNew)}</button>
          </div>
        </header>

        <div class="lg-tabs" role="tablist">
          <button type="button" class="lg-tab" data-tab="stock" role="tab" aria-selected="true">${escapeHTML(STR.tabStock)}</button>
          <button type="button" class="lg-tab" data-tab="moves" role="tab" aria-selected="false">${escapeHTML(STR.tabMoves)}</button>
          <button type="button" class="lg-tab" data-tab="warehouses" role="tab" aria-selected="false">${escapeHTML(STR.tabWarehouses)}</button>
          <button type="button" class="lg-tab" data-tab="locations" role="tab" aria-selected="false">${escapeHTML(STR.tabLocations)}</button>
          <button type="button" class="lg-tab" data-tab="reservations" role="tab" aria-selected="false">${escapeHTML(STR.tabReservations)}</button>
        </div>

        <div class="lg-topbar">
          <input class="lg-search" data-search placeholder="${escapeHTML(STR.searchPlaceholder)}" />
          <select class="lg-select" data-warehouse-filter>
            <option value="">Tous les entrepots</option>
          </select>
        </div>

        <div class="lg-alert" data-alert></div>
        <div class="lg-grid" data-body></div>
      </section>

      <div class="lg-modal" data-modal aria-hidden="true">
        <div class="lg-modal__backdrop" data-modal-backdrop></div>
        <div class="lg-modal__panel" role="dialog" aria-modal="true" aria-label="Edition">
          <div class="lg-modal__head">
            <h2 class="lg-modal__title" data-modal-title></h2>
            <button type="button" class="lg-btn" data-modal-close>${escapeHTML(STR.btnClose)}</button>
          </div>
          <div data-modal-body></div>
          <div class="lg-modal__foot" data-modal-foot></div>
        </div>
      </div>
    `;

    return {
      tabs: Array.from(root.querySelectorAll(".lg-tab[data-tab]")),
      newBtn: root.querySelector('[data-action="new"]'),
      opsBtn: root.querySelector('[data-action="ops"]'),
      search: root.querySelector("[data-search]"),
      whFilter: root.querySelector("[data-warehouse-filter]"),
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

  function renderBlocking(els, { title, body, cta }) {
    els.body.innerHTML = `
      <div class="lg-card">
        <div class="lg-row">
          <div>
            <h3>${escapeHTML(title)}</h3>
            <div class="lg-meta">${escapeHTML(body)}</div>
          </div>
        </div>
        <div class="lg-actions-inline">
          <a class="lg-btn lg-btn--primary" href="${escapeHTML(cta?.href || CONFIG.LOGIN_PATH)}" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
            ${escapeHTML(cta?.label || STR.loginCta)}
          </a>
        </div>
      </div>
    `;
  }

  function renderEmpty(els) {
    els.body.innerHTML = `<div class="lg-empty"><strong>${escapeHTML(STR.emptyTitle)}</strong>${escapeHTML(STR.emptyBody)}</div>`;
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
    modules: {},

    tab: "stock",
    search: "",
    warehouseFilter: "",

    warehouses: [],
    locations: [],
    products: [],
    stockLevels: [],
    reservations: [],
    reorderRules: [],
    movements: [],
  };

  // Wire events
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => setTab(String(btn.dataset.tab || "stock")));
  });

  els.search.addEventListener("input", () => {
    state.search = String(els.search.value || "");
    render();
  });

  els.whFilter.addEventListener("change", () => {
    state.warehouseFilter = String(els.whFilter.value || "");
    render();
  });

  els.newBtn.addEventListener("click", () => openNewForTab());
  els.opsBtn.addEventListener("click", () => openStockOperationModal());

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
        renderBlocking(els, { title: STR.loginTitle, body: STR.loginBody, cta: { label: STR.loginCta, href: CONFIG.LOGIN_PATH } });
        return;
      }

      await resolveOrgId();
      if (!state.organizationId) {
        renderBlocking(els, {
          title: STR.moduleMissingTitle,
          body: "Aucune organisation active pour ce compte.",
          cta: { label: STR.moduleCta, href: CONFIG.SUBSCRIPTIONS_PATH },
        });
        return;
      }

      const [isAdmin, mods] = await Promise.all([checkIsAdmin(), fetchModules()]);
      state.isAdmin = isAdmin;
      state.modules = mods;

      if (!mods?.logistics) {
        renderBlocking(els, {
          title: STR.moduleMissingTitle,
          body: STR.moduleMissingBody,
          cta: { label: STR.moduleCta, href: CONFIG.SUBSCRIPTIONS_PATH },
        });
        return;
      }

      if (!isAdmin) {
        renderBlocking(els, { title: STR.forbiddenTitle, body: STR.forbiddenBody, cta: { label: "Retour", href: `${APP_ROOT}/admin/dashboard` } });
        return;
      }

      await preloadBase();
      await loadTabData(state.tab);
      render();
    } catch (e) {
      console.error("[LOGISTICS] boot error:", e);
      renderBlocking(els, { title: "Erreur", body: STR.loadError, cta: { label: "Recharger", href: location.href } });
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

  async function fetchModules() {
    const ent = await supabase
      .from("organization_entitlements")
      .select("modules")
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    return ent?.data?.modules && typeof ent.data.modules === "object" ? ent.data.modules : {};
  }

  async function preloadBase() {
    await Promise.all([loadWarehouses(), loadLocations(), loadProducts(), loadReorderRules()]);
    hydrateWarehouseFilter();
  }

  async function loadTabData(tab) {
    const t = String(tab || "stock");
    if (t === "stock") return loadStockLevels();
    if (t === "moves") return loadMovements();
    if (t === "warehouses") return loadWarehouses();
    if (t === "locations") return loadLocations();
    if (t === "reservations") return loadReservations();
  }

  // =========================================================
  // Loaders
  // =========================================================

  async function loadWarehouses() {
    const res = await supabase
      .from(CONFIG.WAREHOUSES_TABLE)
      .select("id, code, name, address, city, postal_code, country, is_default, is_active, created_at, updated_at")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    state.warehouses = res.error ? [] : res.data || [];
  }

  async function loadLocations() {
    const res = await supabase
      .from(CONFIG.LOCATIONS_TABLE)
      .select("id, warehouse_id, code, name, location_type, zone, aisle, rack, level, bin, is_pickable, is_active, created_at, updated_at")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(2000);
    state.locations = res.error ? [] : res.data || [];
  }

  async function loadProducts() {
    const res = await supabase
      .from(CONFIG.PRODUCTS_TABLE)
      .select("id, name, sku, barcode, brand, is_active, stock_qty, created_at")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(2000);
    state.products = res.error ? [] : res.data || [];
  }

  async function loadStockLevels() {
    const res = await supabase
      .from(CONFIG.STOCK_LEVELS_TABLE)
      .select("id, warehouse_id, location_id, product_id, lot_code, expires_at, stock_state, qty_on_hand, qty_reserved, updated_at")
      .eq("organization_id", state.organizationId)
      .order("updated_at", { ascending: false })
      .limit(5000);
    state.stockLevels = res.error ? [] : res.data || [];
  }

  async function loadReservations() {
    const res = await supabase
      .from(CONFIG.RESERVATIONS_TABLE)
      .select("id, product_id, location_id, qty, status, reserved_for_type, reserved_for_id, notes, created_at, updated_at")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(2000);
    state.reservations = res.error ? [] : res.data || [];
  }

  async function loadReorderRules() {
    const res = await supabase
      .from(CONFIG.REORDER_TABLE)
      .select("id, warehouse_id, product_id, min_qty, target_qty, is_active, notes, created_at, updated_at")
      .eq("organization_id", state.organizationId)
      .order("updated_at", { ascending: false })
      .limit(4000);
    state.reorderRules = res.error ? [] : res.data || [];
  }

  async function loadMovements() {
    const res = await supabase
      .from(CONFIG.MOVEMENTS_TABLE)
      .select("id, movement_type, qty, warehouse_id, location_id, product_id, reason, move_group_id, created_at")
      .eq("organization_id", state.organizationId)
      .order("created_at", { ascending: false })
      .limit(600);
    state.movements = res.error ? [] : res.data || [];
  }

  // =========================================================
  // Rendering
  // =========================================================

  function hydrateWarehouseFilter() {
    const whs = state.warehouses || [];
    const opts = [
      `<option value="">Tous les entrepots</option>`,
      ...whs.map((w) => `<option value="${escapeHTML(w.id)}">${escapeHTML(w.code ? `${w.code} - ${w.name}` : w.name)}</option>`),
    ];
    els.whFilter.innerHTML = opts.join("");
    if (state.warehouseFilter) els.whFilter.value = state.warehouseFilter;
  }

  function matchesSearch(text) {
    const q = clean(state.search || "");
    if (!q) return true;
    return clean(text).includes(q);
  }

  function locationLabel(loc) {
    if (!loc) return "—";
    const parts = [loc.code, loc.name].filter(Boolean);
    const t = parts.join(" • ");
    return t || "—";
  }

  function warehouseLabel(wh) {
    if (!wh) return "—";
    const parts = [wh.code, wh.name].filter(Boolean);
    return parts.join(" • ") || "—";
  }

  function movementLabel(type) {
    const t = String(type || "");
    if (t === "in") return STR.moveIn;
    if (t === "out") return STR.moveOut;
    if (t === "return") return STR.moveReturn;
    return STR.moveAdj;
  }

  function setTab(tab) {
    const next = String(tab || "stock");
    state.tab = next;
    els.tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab) === next ? "true" : "false"));
    loadTabData(next).then(render).catch((e) => warn("loadTabData", e));
  }

  function render() {
    hydrateWarehouseFilter();
    if (state.tab === "warehouses") return renderWarehouses();
    if (state.tab === "locations") return renderLocations();
    if (state.tab === "moves") return renderMovements();
    if (state.tab === "reservations") return renderReservations();
    return renderStock();
  }

  function renderWarehouses() {
    const whs = (state.warehouses || []).filter((w) => matchesSearch([w.code, w.name, w.city, w.address].filter(Boolean).join(" ")));
    if (!whs.length) return renderEmpty(els);
    els.body.innerHTML = whs
      .map((w) => {
        const meta = [w.address, [w.postal_code, w.city].filter(Boolean).join(" "), w.country].filter(Boolean).join(" • ") || "—";
        const badges = [];
        if (w.is_default) badges.push(`<span class="lg-badge is-ok"><span class="lg-dot"></span>Defaut</span>`);
        badges.push(`<span class="lg-badge"><span class="lg-dot"></span>${w.is_active ? STR.statusActive : STR.statusInactive}</span>`);
        return `
          <article class="lg-card" data-id="${escapeHTML(w.id)}" data-entity="warehouse">
            <div class="lg-row">
              <div>
                <h3>${escapeHTML(w.code ? `${w.code} - ${w.name}` : w.name)}</h3>
                <div class="lg-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="lg-badges">${badges.join("")}</div>
            </div>
            <div class="lg-actions-inline">
              <button type="button" class="lg-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="lg-btn" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");
    els.body.querySelectorAll('[data-entity="warehouse"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openWarehouseModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteWarehouse(id));
    });
  }

  function renderLocations() {
    const whById = new Map((state.warehouses || []).map((w) => [String(w.id), w]));
    const locs = (state.locations || [])
      .filter((l) => (state.warehouseFilter ? String(l.warehouse_id) === String(state.warehouseFilter) : true))
      .filter((l) => matchesSearch([l.code, l.name, l.location_type, l.zone, l.aisle, l.rack, l.bin].filter(Boolean).join(" ")));
    if (!locs.length) return renderEmpty(els);
    els.body.innerHTML = locs
      .map((l) => {
        const wh = whById.get(String(l.warehouse_id)) || null;
        const meta = [warehouseLabel(wh), l.location_type, l.is_pickable ? "Pick" : "Non-pick"].filter(Boolean).join(" • ");
        const badges = [`<span class="lg-badge"><span class="lg-dot"></span>${l.is_active ? STR.statusActive : STR.statusInactive}</span>`];
        return `
          <article class="lg-card" data-id="${escapeHTML(l.id)}" data-entity="location">
            <div class="lg-row">
              <div>
                <h3>${escapeHTML(l.code)} ${l.name ? " - " + escapeHTML(l.name) : ""}</h3>
                <div class="lg-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="lg-badges">${badges.join("")}</div>
            </div>
            <div class="lg-actions-inline">
              <button type="button" class="lg-btn" data-action="edit">${escapeHTML(STR.btnSave)}</button>
              <button type="button" class="lg-btn" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");
    els.body.querySelectorAll('[data-entity="location"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="edit"]').addEventListener("click", () => openLocationModal(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteLocation(id));
    });
  }

  function renderMovements() {
    const whById = new Map((state.warehouses || []).map((w) => [String(w.id), w]));
    const locById = new Map((state.locations || []).map((l) => [String(l.id), l]));
    const prodById = new Map((state.products || []).map((p) => [String(p.id), p]));
    const moves = (state.movements || [])
      .filter((m) => (state.warehouseFilter ? String(m.warehouse_id) === String(state.warehouseFilter) : true))
      .filter((m) => {
        const p = prodById.get(String(m.product_id)) || null;
        const l = locById.get(String(m.location_id)) || null;
        const w = whById.get(String(m.warehouse_id)) || null;
        return matchesSearch([movementLabel(m.movement_type), p?.name, p?.sku, l?.code, w?.name, m.reason].filter(Boolean).join(" "));
      });
    if (!moves.length) return renderEmpty(els);

    els.body.innerHTML = moves
      .map((m) => {
        const wh = whById.get(String(m.warehouse_id)) || null;
        const loc = locById.get(String(m.location_id)) || null;
        const p = prodById.get(String(m.product_id)) || null;
        const qty = Number(m.qty || 0);
        const isOut = String(m.movement_type) === "out";
        const badgeCls = isOut ? "is-danger" : "is-ok";
        const badgeTxt = `${movementLabel(m.movement_type)} • ${isOut ? "-" : "+"}${fmtInt(Math.abs(qty))}`;
        const meta = [warehouseLabel(wh), locationLabel(loc), m.reason].filter(Boolean).join(" • ") || "—";
        return `
          <article class="lg-card">
            <div class="lg-row">
              <div>
                <h3>${escapeHTML(p?.name || "Produit")} ${p?.sku ? " • " + escapeHTML(p.sku) : ""}</h3>
                <div class="lg-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="lg-badges">
                <span class="lg-badge ${badgeCls}"><span class="lg-dot"></span>${escapeHTML(badgeTxt)}</span>
                <span class="lg-badge"><span class="lg-dot"></span>${escapeHTML(fmtDateTime(m.created_at))}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderReservations() {
    const locById = new Map((state.locations || []).map((l) => [String(l.id), l]));
    const prodById = new Map((state.products || []).map((p) => [String(p.id), p]));
    const list = (state.reservations || [])
      .filter((r) => (state.warehouseFilter ? String(locById.get(String(r.location_id))?.warehouse_id || "") === String(state.warehouseFilter) : true))
      .filter((r) => matchesSearch([prodById.get(String(r.product_id))?.name, locById.get(String(r.location_id))?.code, r.status, r.notes].filter(Boolean).join(" ")));
    if (!list.length) return renderEmpty(els);

    els.body.innerHTML = list
      .map((r) => {
        const p = prodById.get(String(r.product_id)) || null;
        const loc = locById.get(String(r.location_id)) || null;
        const active = String(r.status || "") === "active";
        const badgeCls = active ? "is-warn" : "";
        const badgeTxt = active ? "Reserve" : r.status;
        const meta = [locationLabel(loc), r.reserved_for_type ? `${r.reserved_for_type}` : "", r.notes].filter(Boolean).join(" • ") || "—";
        return `
          <article class="lg-card" data-id="${escapeHTML(r.id)}" data-entity="reservation">
            <div class="lg-row">
              <div>
                <h3>${escapeHTML(p?.name || "Produit")} • ${escapeHTML(fmtInt(r.qty))}</h3>
                <div class="lg-meta">${escapeHTML(meta)}</div>
              </div>
              <div class="lg-badges">
                <span class="lg-badge ${badgeCls}"><span class="lg-dot"></span>${escapeHTML(badgeTxt)}</span>
                <span class="lg-badge"><span class="lg-dot"></span>${escapeHTML(fmtDateTime(r.created_at))}</span>
              </div>
            </div>
            <div class="lg-actions-inline">
              ${active ? `<button type="button" class="lg-btn" data-action="release">${escapeHTML(STR.btnRelease)}</button>` : ""}
              <button type="button" class="lg-btn" data-action="delete">${escapeHTML(STR.btnDelete)}</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.body.querySelectorAll('[data-entity="reservation"]').forEach((card) => {
      const id = String(card.getAttribute("data-id") || "");
      const rel = card.querySelector('[data-action="release"]');
      if (rel) rel.addEventListener("click", () => releaseReservation(id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => cancelReservation(id));
    });
  }

  function renderStock() {
    const whById = new Map((state.warehouses || []).map((w) => [String(w.id), w]));
    const locById = new Map((state.locations || []).map((l) => [String(l.id), l]));
    const prodById = new Map((state.products || []).map((p) => [String(p.id), p]));

    // Aggregate per product in filter scope.
    const agg = new Map(); // productId => { onHand, reserved, available, locations:Set, updatedAt }
    (state.stockLevels || [])
      .filter((l) => (state.warehouseFilter ? String(l.warehouse_id) === String(state.warehouseFilter) : true))
      .forEach((l) => {
        const pid = String(l.product_id || "");
        if (!pid) return;
        const cur = agg.get(pid) || { onHand: 0, reserved: 0, available: 0, locations: new Set(), updatedAt: 0 };
        const onHand = Number(l.qty_on_hand || 0);
        const reserved = Number(l.qty_reserved || 0);
        cur.onHand += onHand;
        cur.reserved += reserved;
        cur.available += Math.max(0, onHand - reserved);
        cur.locations.add(String(l.location_id || ""));
        const ts = l.updated_at ? Date.parse(l.updated_at) : 0;
        if (Number.isFinite(ts) && ts > cur.updatedAt) cur.updatedAt = ts;
        agg.set(pid, cur);
      });

    // Reorder rules in scope.
    const ruleKey = (warehouseId, productId) => `${warehouseId || ""}:${productId || ""}`;
    const rules = new Map();
    (state.reorderRules || [])
      .filter((r) => (state.warehouseFilter ? String(r.warehouse_id) === String(state.warehouseFilter) : true))
      .forEach((r) => rules.set(ruleKey(r.warehouse_id, r.product_id), r));

    const items = Array.from(agg.entries())
      .map(([pid, a]) => {
        const p = prodById.get(pid) || {};
        const name = String(p.name || "").trim() || "Produit";
        const sku = String(p.sku || "").trim();
        const label = `${name} ${sku ? " " + sku : ""}`.trim();
        const match = matchesSearch([label, p.brand, p.barcode].filter(Boolean).join(" "));
        return match
          ? {
              product_id: pid,
              name,
              sku,
              brand: p.brand,
              barcode: p.barcode,
              onHand: a.onHand,
              reserved: a.reserved,
              available: a.available,
              locationsCount: a.locations.size,
              updatedAt: a.updatedAt,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.available || 0) - (a.available || 0));

    if (!items.length) return renderEmpty(els);

    const defaultWhId =
      state.warehouseFilter ||
      String((state.warehouses || []).find((w) => w.is_default)?.id || "") ||
      String(pickFirst(state.warehouses)?.id || "");

    const lowStock = items.filter((it) => {
      const r = rules.get(ruleKey(defaultWhId, it.product_id));
      const min = Number(r?.min_qty ?? 0);
      return Number.isFinite(min) && min > 0 && Number(it.available || 0) <= min;
    });

    const insights = `
      <div class="lg-card">
        <div class="lg-row">
          <div>
            <h3>Vue stock</h3>
            <div class="lg-meta">Produits: ${escapeHTML(fmtInt(items.length))} • Alertes: ${escapeHTML(fmtInt(lowStock.length))}</div>
          </div>
          <div class="lg-badges">
            <span class="lg-badge ${lowStock.length ? "is-warn" : "is-ok"}"><span class="lg-dot"></span>${escapeHTML(lowStock.length ? "Stock faible" : "OK")}</span>
          </div>
        </div>
      </div>
    `;

    els.body.innerHTML =
      insights +
      items
        .map((it) => {
          const r = rules.get(ruleKey(defaultWhId, it.product_id));
          const min = Number(r?.min_qty ?? 0);
          const warn = Number.isFinite(min) && min > 0 && Number(it.available || 0) <= min;
          const badge = warn
            ? `<span class="lg-badge is-warn"><span class="lg-dot"></span>Min: ${escapeHTML(fmtInt(min))}</span>`
            : `<span class="lg-badge is-ok"><span class="lg-dot"></span>Disponible</span>`;
          const meta = [it.sku ? `SKU: ${it.sku}` : "", it.brand ? `Marque: ${it.brand}` : "", it.barcode ? `Code-barres: ${it.barcode}` : ""]
            .filter(Boolean)
            .join(" • ");
          return `
            <article class="lg-card" data-id="${escapeHTML(it.product_id)}" data-entity="stock">
              <div class="lg-row">
                <div>
                  <h3>${escapeHTML(it.name)} ${it.sku ? " • " + escapeHTML(it.sku) : ""}</h3>
                  <div class="lg-meta">${escapeHTML(meta || "—")}</div>
                </div>
                <div class="lg-badges">
                  ${badge}
                  <span class="lg-badge"><span class="lg-dot"></span>Stock: ${escapeHTML(fmtInt(it.onHand))}</span>
                  <span class="lg-badge"><span class="lg-dot"></span>Reserve: ${escapeHTML(fmtInt(it.reserved))}</span>
                  <span class="lg-badge"><span class="lg-dot"></span>Dispo: ${escapeHTML(fmtInt(it.available))}</span>
                </div>
              </div>
              <div class="lg-actions-inline">
                <button type="button" class="lg-btn" data-action="reserve">Reserver</button>
                <button type="button" class="lg-btn" data-action="reorder">Seuils</button>
              </div>
            </article>
          `;
        })
        .join("");

    els.body.querySelectorAll('[data-entity="stock"]').forEach((card) => {
      const pid = String(card.getAttribute("data-id") || "");
      card.querySelector('[data-action="reserve"]').addEventListener("click", () => openReservationModal({ productId: pid }));
      card.querySelector('[data-action="reorder"]').addEventListener("click", () => openReorderRuleModal({ productId: pid, warehouseId: defaultWhId }));
    });
  }

  // =========================================================
  // Actions / Modals
  // =========================================================

  function openNewForTab() {
    if (state.tab === "warehouses") return openWarehouseModal("");
    if (state.tab === "locations") return openLocationModal("");
    if (state.tab === "reservations") return openReservationModal({});
    // Default: stock operations
    return openStockOperationModal();
  }

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

  function warehouseOptions(selected) {
    const whs = (state.warehouses || []).filter((w) => w.is_active !== false);
    return optionList(whs, (w) => (w.code ? `${w.code} - ${w.name}` : w.name), selected);
  }

  function locationOptions(warehouseId, selected) {
    const whId = String(warehouseId || "");
    const locs = (state.locations || [])
      .filter((l) => l.is_active !== false)
      .filter((l) => (whId ? String(l.warehouse_id) === whId : true))
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
    return optionList(locs, (l) => `${l.code}${l.name ? " - " + l.name : ""} (${l.location_type})`, selected);
  }

  function productOptions(selected) {
    const items = (state.products || [])
      .filter((p) => p.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return optionList(items, (p) => `${p.name}${p.sku ? " (" + p.sku + ")" : ""}`, selected);
  }

  function openStockOperationModal(preset) {
    const ps = preset && typeof preset === "object" ? preset : {};
    const defaultWh =
      String(ps.warehouseId || state.warehouseFilter || (state.warehouses || []).find((w) => w.is_default)?.id || pickFirst(state.warehouses)?.id || "");
    const defaultLoc = String(ps.locationId || "");
    const defaultProd = String(ps.productId || "");
    const defaultType = String(ps.opType || "receipt");

    openModal(els, {
      title: "Operation stock",
      bodyHtml: `
        <form class="lg-form" data-form="op">
          <div class="lg-full">
            <label class="lg-label">Type</label>
            <select class="lg-select" name="op_type">
              <option value="receipt"${defaultType === "receipt" ? " selected" : ""}>${escapeHTML(STR.opReceipt)}</option>
              <option value="ship"${defaultType === "ship" ? " selected" : ""}>${escapeHTML(STR.opShip)}</option>
              <option value="transfer"${defaultType === "transfer" ? " selected" : ""}>${escapeHTML(STR.opTransfer)}</option>
              <option value="adjust"${defaultType === "adjust" ? " selected" : ""}>${escapeHTML(STR.opAdjust)}</option>
            </select>
          </div>

          <div>
            <label class="lg-label">Entrepot (source)</label>
            <select class="lg-select" name="warehouse_from">${warehouseOptions(defaultWh)}</select>
          </div>
          <div>
            <label class="lg-label">Emplacement (source)</label>
            <select class="lg-select" name="location_from">${locationOptions(defaultWh, defaultLoc)}</select>
          </div>

          <div data-transfer-only style="display:none">
            <label class="lg-label">Entrepot (destination)</label>
            <select class="lg-select" name="warehouse_to">${warehouseOptions(defaultWh)}</select>
          </div>
          <div data-transfer-only style="display:none">
            <label class="lg-label">Emplacement (destination)</label>
            <select class="lg-select" name="location_to">${locationOptions(defaultWh, "")}</select>
          </div>

          <div class="lg-full">
            <label class="lg-label">Produit</label>
            <select class="lg-select" name="product_id">${productOptions(defaultProd)}</select>
          </div>

          <div>
            <label class="lg-label">Quantite</label>
            <input class="lg-input" name="qty" type="number" step="1" value="${escapeHTML(String(ps.qty ?? 1))}" />
          </div>
          <div>
            <label class="lg-label">Lot (optionnel)</label>
            <input class="lg-input" name="lot_code" value="${escapeHTML(String(ps.lot_code || ""))}" />
          </div>
          <div>
            <label class="lg-label">Expiration (optionnel)</label>
            <input class="lg-input" name="expires_at" type="date" value="${escapeHTML(String(ps.expires_at || "").slice(0, 10))}" />
          </div>
          <div>
            <label class="lg-label">Motif / Reference</label>
            <input class="lg-input" name="reason" value="${escapeHTML(String(ps.reason || ""))}" placeholder="Ex: reception BL123, expedition CMD-42..." />
          </div>

          <div class="lg-full">
            <div class="lg-meta">
              Astuce: pour un ajustement, utilise une quantite negative pour diminuer le stock.
            </div>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="lg-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="lg-btn lg-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    const form = els.modalBody.querySelector('[data-form="op"]');
    const transferEls = Array.from(els.modalBody.querySelectorAll("[data-transfer-only]"));

    function syncTransferVisibility() {
      const isTransfer = String(form.op_type.value || "") === "transfer";
      transferEls.forEach((n) => (n.style.display = isTransfer ? "" : "none"));
    }
    syncTransferVisibility();

    form.op_type.addEventListener("change", syncTransferVisibility);
    form.warehouse_from.addEventListener("change", () => {
      form.location_from.innerHTML = locationOptions(form.warehouse_from.value, "");
      if (String(form.op_type.value || "") === "transfer") {
        form.location_to.innerHTML = locationOptions(form.warehouse_to.value || form.warehouse_from.value, "");
      }
    });
    form.warehouse_to.addEventListener("change", () => {
      form.location_to.innerHTML = locationOptions(form.warehouse_to.value, "");
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const opType = String(form.op_type.value || "receipt");
      const warehouseFrom = asUuid(form.warehouse_from.value);
      const locationFrom = asUuid(form.location_from.value);
      const warehouseTo = asUuid(form.warehouse_to.value);
      const locationTo = asUuid(form.location_to.value);
      const productId = asUuid(form.product_id.value);
      const qty = Number(form.qty.value || 0);
      const lotCode = String(form.lot_code.value || "").trim() || null;
      const expiresAt = form.expires_at.value ? String(form.expires_at.value) : null;
      const reason = String(form.reason.value || "").trim() || null;

      if (!productId) return showAlert(els, "Produit requis.", "error");
      if (!warehouseFrom || !locationFrom) return showAlert(els, "Entrepot et emplacement requis.", "error");
      if (!Number.isFinite(qty) || qty === 0) return showAlert(els, "Quantite invalide.", "error");

      showAlert(els, STR.saving, "");
      const groupId = (window.crypto?.randomUUID ? window.crypto.randomUUID() : null) || null;

      try {
        if (opType === "transfer") {
          if (!warehouseTo || !locationTo) return showAlert(els, "Destination requise pour un transfert.", "error");
          const rows = [
            {
              organization_id: state.organizationId,
              movement_type: "out",
              qty: Math.abs(Math.trunc(qty)),
              product_id: productId,
              warehouse_id: warehouseFrom,
              location_id: locationFrom,
              reason: reason || "transfer",
              move_group_id: groupId,
              lot_code: lotCode,
              expires_at: expiresAt,
              created_by: state.userId,
              metadata: { kind: "transfer", direction: "out" },
            },
            {
              organization_id: state.organizationId,
              movement_type: "in",
              qty: Math.abs(Math.trunc(qty)),
              product_id: productId,
              warehouse_id: warehouseTo,
              location_id: locationTo,
              reason: reason || "transfer",
              move_group_id: groupId,
              lot_code: lotCode,
              expires_at: expiresAt,
              created_by: state.userId,
              metadata: { kind: "transfer", direction: "in" },
            },
          ];
          const ins = await supabase.from(CONFIG.MOVEMENTS_TABLE).insert(rows);
          if (ins.error) return showAlert(els, ins.error.message, "error");
        } else if (opType === "ship") {
          const ins = await supabase.from(CONFIG.MOVEMENTS_TABLE).insert({
            organization_id: state.organizationId,
            movement_type: "out",
            qty: Math.abs(Math.trunc(qty)),
            product_id: productId,
            warehouse_id: warehouseFrom,
            location_id: locationFrom,
            reason: reason || "expedition",
            move_group_id: groupId,
            lot_code: lotCode,
            expires_at: expiresAt,
            created_by: state.userId,
            metadata: { kind: "ship" },
          });
          if (ins.error) return showAlert(els, ins.error.message, "error");
        } else if (opType === "adjust") {
          const ins = await supabase.from(CONFIG.MOVEMENTS_TABLE).insert({
            organization_id: state.organizationId,
            movement_type: "adjustment",
            qty: Math.trunc(qty),
            product_id: productId,
            warehouse_id: warehouseFrom,
            location_id: locationFrom,
            reason: reason || "ajustement",
            move_group_id: groupId,
            lot_code: lotCode,
            expires_at: expiresAt,
            created_by: state.userId,
            metadata: { kind: "adjust" },
          });
          if (ins.error) return showAlert(els, ins.error.message, "error");
        } else {
          // receipt
          const ins = await supabase.from(CONFIG.MOVEMENTS_TABLE).insert({
            organization_id: state.organizationId,
            movement_type: "in",
            qty: Math.abs(Math.trunc(qty)),
            product_id: productId,
            warehouse_id: warehouseFrom,
            location_id: locationFrom,
            reason: reason || "reception",
            move_group_id: groupId,
            lot_code: lotCode,
            expires_at: expiresAt,
            created_by: state.userId,
            metadata: { kind: "receipt" },
          });
          if (ins.error) return showAlert(els, ins.error.message, "error");
        }

        await Promise.all([loadStockLevels(), loadMovements()]);
        closeModal(els);
        showAlert(els, STR.saved, "ok");
        render();
      } catch (e) {
        showAlert(els, e?.message || String(e), "error");
      }
    });
  }

  function openWarehouseModal(id) {
    const w = (state.warehouses || []).find((x) => String(x.id) === String(id)) || null;
    openModal(els, {
      title: w ? "Modifier entrepot" : "Nouvel entrepot",
      bodyHtml: `
        <form class="lg-form" data-form="warehouse">
          <div>
            <label class="lg-label">Code (optionnel)</label>
            <input class="lg-input" name="code" value="${escapeHTML(w?.code || "")}" placeholder="EX: WH-1" />
          </div>
          <div>
            <label class="lg-label">Nom</label>
            <input class="lg-input" name="name" required value="${escapeHTML(w?.name || "")}" placeholder="Entrepot principal" />
          </div>
          <div class="lg-full">
            <label class="lg-label">Adresse</label>
            <input class="lg-input" name="address" value="${escapeHTML(w?.address || "")}" />
          </div>
          <div>
            <label class="lg-label">Ville</label>
            <input class="lg-input" name="city" value="${escapeHTML(w?.city || "")}" />
          </div>
          <div>
            <label class="lg-label">Code postal</label>
            <input class="lg-input" name="postal_code" value="${escapeHTML(w?.postal_code || "")}" />
          </div>
          <div>
            <label class="lg-label">Pays</label>
            <input class="lg-input" name="country" value="${escapeHTML(w?.country || "FR")}" />
          </div>
          <div class="lg-full">
            <label class="lg-label"><input type="checkbox" name="is_default" ${w?.is_default ? "checked" : ""} /> Entrepot par defaut</label>
            <label class="lg-label" style="margin-top:8px"><input type="checkbox" name="is_active" ${w?.is_active === false ? "" : "checked"} /> Actif</label>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="lg-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="lg-btn lg-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="warehouse"]');
      const payload = {
        organization_id: state.organizationId,
        code: String(form.code.value || "").trim() || null,
        name: String(form.name.value || "").trim(),
        address: String(form.address.value || "").trim() || null,
        city: String(form.city.value || "").trim() || null,
        postal_code: String(form.postal_code.value || "").trim() || null,
        country: String(form.country.value || "").trim() || "FR",
        is_default: Boolean(form.is_default.checked),
        is_active: Boolean(form.is_active.checked),
      };
      if (!payload.name) return showAlert(els, "Nom requis.", "error");

      showAlert(els, STR.saving, "");

      // If set default, clear previous default first (best-effort).
      if (payload.is_default) {
        await supabase.from(CONFIG.WAREHOUSES_TABLE).update({ is_default: false }).eq("organization_id", state.organizationId);
      }

      const res = w ? await supabase.from(CONFIG.WAREHOUSES_TABLE).update(payload).eq("id", w.id) : await supabase.from(CONFIG.WAREHOUSES_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");
      await Promise.all([loadWarehouses(), loadLocations()]);
      hydrateWarehouseFilter();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openLocationModal(id) {
    const l = (state.locations || []).find((x) => String(x.id) === String(id)) || null;
    const defaultWh = String(l?.warehouse_id || state.warehouseFilter || (state.warehouses || []).find((w) => w.is_default)?.id || pickFirst(state.warehouses)?.id || "");

    openModal(els, {
      title: l ? "Modifier emplacement" : "Nouvel emplacement",
      bodyHtml: `
        <form class="lg-form" data-form="location">
          <div class="lg-full">
            <label class="lg-label">Entrepot</label>
            <select class="lg-select" name="warehouse_id">${warehouseOptions(defaultWh)}</select>
          </div>
          <div>
            <label class="lg-label">Code</label>
            <input class="lg-input" name="code" required value="${escapeHTML(l?.code || "")}" placeholder="EX: A-01-01" />
          </div>
          <div>
            <label class="lg-label">Nom (optionnel)</label>
            <input class="lg-input" name="name" value="${escapeHTML(l?.name || "")}" />
          </div>
          <div>
            <label class="lg-label">Type</label>
            <select class="lg-select" name="location_type">
              ${["receiving", "shipping", "storage", "packing", "quarantine", "damaged"]
                .map((t) => `<option value="${t}"${String(l?.location_type || "storage") === t ? " selected" : ""}>${t}</option>`)
                .join("")}
            </select>
          </div>
          <div>
            <label class="lg-label">Zone (optionnel)</label>
            <input class="lg-input" name="zone" value="${escapeHTML(l?.zone || "")}" />
          </div>
          <div>
            <label class="lg-label">Pickable</label>
            <select class="lg-select" name="is_pickable">
              <option value="1"${l?.is_pickable === false ? "" : " selected"}>Oui</option>
              <option value="0"${l?.is_pickable === false ? " selected" : ""}>Non</option>
            </select>
          </div>
          <div>
            <label class="lg-label">Actif</label>
            <select class="lg-select" name="is_active">
              <option value="1"${l?.is_active === false ? "" : " selected"}>Oui</option>
              <option value="0"${l?.is_active === false ? " selected" : ""}>Non</option>
            </select>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="lg-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="lg-btn lg-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    const form = els.modalBody.querySelector('[data-form="location"]');
    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const payload = {
        organization_id: state.organizationId,
        warehouse_id: asUuid(form.warehouse_id.value),
        code: String(form.code.value || "").trim(),
        name: String(form.name.value || "").trim() || null,
        location_type: String(form.location_type.value || "storage"),
        zone: String(form.zone.value || "").trim() || null,
        is_pickable: String(form.is_pickable.value || "1") === "1",
        is_active: String(form.is_active.value || "1") === "1",
      };
      if (!payload.warehouse_id) return showAlert(els, "Entrepot requis.", "error");
      if (!payload.code) return showAlert(els, "Code requis.", "error");

      showAlert(els, STR.saving, "");
      const res = l ? await supabase.from(CONFIG.LOCATIONS_TABLE).update(payload).eq("id", l.id) : await supabase.from(CONFIG.LOCATIONS_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");
      await Promise.all([loadLocations(), loadStockLevels()]);
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openReservationModal({ productId } = {}) {
    const defaultWh =
      String(state.warehouseFilter || (state.warehouses || []).find((w) => w.is_default)?.id || pickFirst(state.warehouses)?.id || "");
    openModal(els, {
      title: "Reserver du stock",
      bodyHtml: `
        <form class="lg-form" data-form="reserve">
          <div class="lg-full">
            <label class="lg-label">Entrepot</label>
            <select class="lg-select" name="warehouse_id">${warehouseOptions(defaultWh)}</select>
          </div>
          <div class="lg-full">
            <label class="lg-label">Emplacement</label>
            <select class="lg-select" name="location_id">${locationOptions(defaultWh, "")}</select>
          </div>
          <div class="lg-full">
            <label class="lg-label">Produit</label>
            <select class="lg-select" name="product_id">${productOptions(productId || "")}</select>
          </div>
          <div>
            <label class="lg-label">Quantite</label>
            <input class="lg-input" name="qty" type="number" min="1" step="1" value="1" />
          </div>
          <div>
            <label class="lg-label">Type reference (optionnel)</label>
            <input class="lg-input" name="reserved_for_type" placeholder="sales_order_line, devis, ..." />
          </div>
          <div class="lg-full">
            <label class="lg-label">Notes (optionnel)</label>
            <textarea class="lg-textarea" name="notes" placeholder="Pourquoi cette reservation ?"></textarea>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="lg-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="lg-btn lg-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    const form = els.modalBody.querySelector('[data-form="reserve"]');
    form.warehouse_id.addEventListener("change", () => {
      form.location_id.innerHTML = locationOptions(form.warehouse_id.value, "");
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const payload = {
        organization_id: state.organizationId,
        warehouse_id: asUuid(form.warehouse_id.value) || null,
        location_id: asUuid(form.location_id.value) || null,
        product_id: asUuid(form.product_id.value),
        qty: Math.max(1, Math.trunc(Number(form.qty.value || 0))),
        status: "active",
        reserved_for_type: String(form.reserved_for_type.value || "").trim() || null,
        reserved_for_id: null,
        notes: String(form.notes.value || "").trim() || null,
        created_by: state.userId,
      };
      if (!payload.product_id) return showAlert(els, "Produit requis.", "error");
      if (!payload.location_id) return showAlert(els, "Emplacement requis.", "error");

      showAlert(els, STR.saving, "");
      const res = await supabase.from(CONFIG.RESERVATIONS_TABLE).insert(payload);
      if (res.error) return showAlert(els, res.error.message, "error");
      await Promise.all([loadReservations(), loadStockLevels()]);
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  function openReorderRuleModal({ productId, warehouseId }) {
    const pid = asUuid(productId);
    const wid = asUuid(warehouseId);
    if (!pid || !wid) return showAlert(els, "Entrepot / produit manquant.", "error");
    const existing = (state.reorderRules || []).find((r) => String(r.product_id) === pid && String(r.warehouse_id) === wid) || null;

    openModal(els, {
      title: "Seuils de stock",
      bodyHtml: `
        <form class="lg-form" data-form="reorder">
          <div class="lg-full">
            <div class="lg-meta">
              Seuils par entrepot: alerte si disponible <= min.
            </div>
          </div>
          <div>
            <label class="lg-label">Min (alerte)</label>
            <input class="lg-input" name="min_qty" type="number" min="0" step="1" value="${escapeHTML(String(existing?.min_qty ?? 0))}" />
          </div>
          <div>
            <label class="lg-label">Cible (optionnel)</label>
            <input class="lg-input" name="target_qty" type="number" min="0" step="1" value="${escapeHTML(String(existing?.target_qty ?? ""))}" />
          </div>
          <div class="lg-full">
            <label class="lg-label">Notes</label>
            <input class="lg-input" name="notes" value="${escapeHTML(String(existing?.notes || ""))}" />
          </div>
          <div class="lg-full">
            <label class="lg-label"><input type="checkbox" name="is_active" ${existing?.is_active === false ? "" : "checked"} /> Actif</label>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="lg-btn" data-action="cancel">${escapeHTML(STR.btnCancel)}</button>
        <button type="button" class="lg-btn lg-btn--primary" data-action="save">${escapeHTML(STR.btnSave)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="reorder"]');
      const minQty = Math.max(0, Math.trunc(Number(form.min_qty.value || 0)));
      const targetQtyRaw = String(form.target_qty.value || "").trim();
      const targetQty = targetQtyRaw ? Math.max(0, Math.trunc(Number(targetQtyRaw))) : null;
      const payload = {
        organization_id: state.organizationId,
        warehouse_id: wid,
        product_id: pid,
        min_qty: minQty,
        target_qty: Number.isFinite(Number(targetQty)) ? targetQty : null,
        is_active: Boolean(form.is_active.checked),
        notes: String(form.notes.value || "").trim() || null,
      };

      showAlert(els, STR.saving, "");
      let res = null;
      if (existing) {
        res = await supabase.from(CONFIG.REORDER_TABLE).update(payload).eq("id", existing.id);
      } else {
        res = await supabase.from(CONFIG.REORDER_TABLE).insert(payload);
      }
      if (res.error) return showAlert(els, res.error.message, "error");
      await loadReorderRules();
      closeModal(els);
      showAlert(els, STR.saved, "ok");
      render();
    });
  }

  async function releaseReservation(id) {
    const rid = asUuid(id);
    if (!rid) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.RESERVATIONS_TABLE).update({ status: "released" }).eq("id", rid);
    if (res.error) return showAlert(els, res.error.message, "error");
    await Promise.all([loadReservations(), loadStockLevels()]);
    showAlert(els, STR.saved, "ok");
    render();
  }

  async function cancelReservation(id) {
    const rid = asUuid(id);
    if (!rid) return;
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.RESERVATIONS_TABLE).update({ status: "canceled" }).eq("id", rid);
    if (res.error) return showAlert(els, res.error.message, "error");
    await Promise.all([loadReservations(), loadStockLevels()]);
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteWarehouse(id) {
    const wid = asUuid(id);
    if (!wid) return;
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.WAREHOUSES_TABLE).delete().eq("id", wid);
    if (res.error) return showAlert(els, res.error.message, "error");
    await Promise.all([loadWarehouses(), loadLocations(), loadStockLevels()]);
    hydrateWarehouseFilter();
    showAlert(els, STR.deleted, "ok");
    render();
  }

  async function deleteLocation(id) {
    const lid = asUuid(id);
    if (!lid) return;
    if (!confirm(STR.confirmDelete)) return;
    showAlert(els, STR.saving, "");
    const res = await supabase.from(CONFIG.LOCATIONS_TABLE).delete().eq("id", lid);
    if (res.error) return showAlert(els, res.error.message, "error");
    await Promise.all([loadLocations(), loadStockLevels()]);
    showAlert(els, STR.deleted, "ok");
    render();
  }
});
