document.documentElement.setAttribute("data-page", "technician-planning");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblTechnicianPlanningLoaded) return;
  window.__mblTechnicianPlanningLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-tech-planning]";
  const root =
    document.querySelector(ROOT_SELECTOR) ||
    document.querySelector("#mbl-tech-planning") ||
    document.querySelector(".mbl-tech-planning") ||
    null;

  if (!root) {
    console.error("[TECH PLANNING] Root introuvable. Ajoute <div data-mbl-tech-planning></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[TECH PLANNING]", ...a);
  const warn = (...a) => DEBUG && console.warn("[TECH PLANNING]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),
    SUBSCRIBE_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",

    ASSIGNEES_TABLE: "intervention_assignees",
    INTERVENTIONS_TABLE: "interventions",
    AVAILABILITY_TABLE: "user_availability_blocks",
    PROFILES_TABLE: "profiles",

    RUN_PAGE_PATH: `${APP_ROOT}/technician/intervention-realisation`,
  };

  const STR = {
    title: "Planning",
    subtitle: "Interventions assignees + indisponibilites",
    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour afficher ton planning.",
    loginCta: "Se connecter",
    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module Interventions.",
    moduleCta: "Gerer mon abonnement",
    accessDenied: "Acces refuse",
    accessDeniedBody: "Ton organisation a limite l'acces a ce module pour ton compte.",
    loading: "Chargement du planning…",
    refresh: "Actualiser",
    weekPrev: "Semaine precedente",
    weekNext: "Semaine suivante",
    blockDates: "Bloquer des dates",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    confirmDelete: "Supprimer ce blocage ?",
    noItems: "Aucun element cette semaine.",
    opSaved: "Enregistre",
    opError: "Une erreur est survenue.",
  };

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
    const m = s.match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
    if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };
    return null;
  }

  function resolvePrimary() {
    try {
      const v = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary") || "").trim();
      if (v) return v;
    } catch (_) {}
    return String(CFG.THEME_PRIMARY || "").trim() || "#0ea5e9";
  }

  function ensurePrimaryRgbCssVar() {
    try {
      const existing = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary-rgb") || "").trim();
      if (existing) return;
    } catch (_) {}
    const rgb = parseColorToRgb(resolvePrimary());
    if (!rgb) return;
    try {
      document.documentElement.style.setProperty("--mbl-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("mbl-tech-planning-style")) return;
    ensurePrimaryRgbCssVar();
    const st = document.createElement("style");
    st.id = "mbl-tech-planning-style";
    st.textContent = `
      html[data-page="technician-planning"] {
        --tp-ink: rgba(2,6,23,0.92);
        --tp-muted: rgba(2,6,23,0.62);
        --tp-border: rgba(15,23,42,0.12);
        --tp-card: rgba(255,255,255,0.88);
        --tp-shadow: 0 22px 60px rgba(2,6,23,0.10);
      }

      html[data-page="technician-planning"] .tp-shell,
      html[data-page="technician-planning"] .tp-shell * { box-sizing: border-box; }

      html[data-page="technician-planning"] .tp-shell {
        border-radius: 18px;
        border: 1px solid rgba(15,23,42,0.10);
        background:
          radial-gradient(1000px 520px at 12% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.10), transparent 55%),
          radial-gradient(920px 520px at 92% 8%, rgba(2, 6, 23, 0.08), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.96));
        box-shadow: var(--tp-shadow);
        overflow: hidden;
        color: var(--tp-ink);
      }

      html[data-page="technician-planning"] .tp-top {
        display:flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.70));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      html[data-page="technician-planning"] .tp-title { margin:0; font-size: 18px; font-weight: 950; }
      html[data-page="technician-planning"] .tp-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--tp-muted); font-weight: 750; }
      html[data-page="technician-planning"] .tp-actions { display:flex; gap:10px; flex-wrap: wrap; justify-content:flex-end; }

      html[data-page="technician-planning"] .tp-btn {
        height: 42px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        font-weight: 950;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      html[data-page="technician-planning"] .tp-btn:hover { transform: translateY(-1px); border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.35); box-shadow: 0 18px 44px rgba(2,6,23,0.10); }
      html[data-page="technician-planning"] .tp-btn:disabled { opacity: 0.65; cursor:not-allowed; transform:none; box-shadow:none; }
      html[data-page="technician-planning"] .tp-btn--primary {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.35);
        background: linear-gradient(180deg, rgba(var(--mbl-primary-rgb, 14, 165, 233),0.95), rgba(var(--mbl-primary-rgb, 14, 165, 233),0.72));
        color: #fff;
      }

      html[data-page="technician-planning"] .tp-banner {
        display:none;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 800;
        font-size: 13px;
      }
      html[data-page="technician-planning"] .tp-banner.is-ok { display:block; background:#ecfdf5; color:#065f46; }
      html[data-page="technician-planning"] .tp-banner.is-err { display:block; background:#fef2f2; color:#991b1b; }

      html[data-page="technician-planning"] .tp-body { padding: 14px; }

      html[data-page="technician-planning"] .tp-weekbar {
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      html[data-page="technician-planning"] .tp-range {
        font-weight: 950;
        color: rgba(2,6,23,0.78);
      }

      html[data-page="technician-planning"] .tp-grid {
        display:grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 12px;
      }
      html[data-page="technician-planning"] .tp-day {
        border: 1px solid var(--tp-border);
        background: var(--tp-card);
        border-radius: 16px;
        overflow:hidden;
        min-height: 160px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }
      html[data-page="technician-planning"] .tp-day__head {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        background: rgba(255,255,255,0.86);
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="technician-planning"] .tp-day__dow { font-weight: 950; letter-spacing: -0.01em; }
      html[data-page="technician-planning"] .tp-day__date { font-weight: 900; color: rgba(2,6,23,0.62); font-size: 12px; }
      html[data-page="technician-planning"] .tp-day__body { padding: 10px 12px 12px; display:flex; flex-direction: column; gap: 10px; }

      html[data-page="technician-planning"] .tp-chip {
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 10px 10px;
        background: rgba(248,250,252,0.92);
      }

      html[data-page="technician-planning"] .tp-block {
        border-color: rgba(245,158,11,0.35);
        background: rgba(255,247,237,0.92);
      }
      html[data-page="technician-planning"] .tp-block__top {
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="technician-planning"] .tp-block__title { font-weight: 950; color: rgba(146,64,14,0.95); }
      html[data-page="technician-planning"] .tp-block__meta { margin-top: 6px; color: rgba(146,64,14,0.78); font-weight: 800; font-size: 12px; }
      html[data-page="technician-planning"] .tp-mini {
        height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        font-weight: 900;
        cursor:pointer;
      }

      html[data-page="technician-planning"] .tp-itv__title { font-weight: 950; margin:0; }
      html[data-page="technician-planning"] .tp-itv__meta { margin-top: 6px; color: var(--tp-muted); font-weight: 800; font-size: 12px; line-height: 1.3; }
      html[data-page="technician-planning"] .tp-itv__row { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      html[data-page="technician-planning"] .tp-badge {
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.86);
        font-weight: 950;
        font-size: 12px;
        color: rgba(2,6,23,0.74);
        white-space: nowrap;
      }
      html[data-page="technician-planning"] .tp-dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      html[data-page="technician-planning"] .is-planned .tp-dot { background:#0ea5e9; }
      html[data-page="technician-planning"] .is-pending .tp-dot { background:#f59e0b; }
      html[data-page="technician-planning"] .is-progress .tp-dot { background:#7c3aed; }
      html[data-page="technician-planning"] .is-done .tp-dot { background:#22c55e; }
      html[data-page="technician-planning"] .is-canceled .tp-dot { background:#ef4444; }

      /* Modal */
      html[data-page="technician-planning"] .tp-modal { position: fixed; inset: 0; z-index: 2147483646; display:none; }
      html[data-page="technician-planning"] .tp-modal.is-open { display:block; }
      html[data-page="technician-planning"] .tp-modal__backdrop { position:absolute; inset:0; background: rgba(2,6,23,0.55); backdrop-filter: blur(8px); }
      html[data-page="technician-planning"] .tp-modal__panel {
        position:absolute; left:50%; top: 6vh; transform: translateX(-50%);
        width: min(780px, calc(100% - 24px));
        max-height: 88vh;
        overflow:auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.96);
        box-shadow: 0 24px 80px rgba(0,0,0,0.22);
        padding: 14px;
      }
      html[data-page="technician-planning"] .tp-modal__head { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      html[data-page="technician-planning"] .tp-modal__title { margin:0; font-size: 16px; font-weight: 1000; }
      html[data-page="technician-planning"] .tp-form { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
      html[data-page="technician-planning"] .tp-form .tp-full { grid-column: 1 / -1; }
      html[data-page="technician-planning"] .tp-label { display:block; font-weight: 950; font-size: 12px; color: rgba(2,6,23,0.72); margin: 0 0 6px; }
      html[data-page="technician-planning"] .tp-input, html[data-page="technician-planning"] .tp-select, html[data-page="technician-planning"] .tp-textarea {
        width:100%;
        height: 42px;
        padding: 0 12px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.92);
        outline: none;
        font-weight: 850;
      }
      html[data-page="technician-planning"] .tp-textarea { height:auto; min-height: 90px; resize: vertical; padding: 10px 12px; }
      html[data-page="technician-planning"] .tp-input:focus, html[data-page="technician-planning"] .tp-select:focus, html[data-page="technician-planning"] .tp-textarea:focus {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.45);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }
      html[data-page="technician-planning"] .tp-modal__foot { display:flex; justify-content:flex-end; gap: 10px; margin-top: 14px; }

      @media (max-width: 980px) {
        html[data-page="technician-planning"] .tp-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 640px) {
        html[data-page="technician-planning"] .tp-grid { grid-template-columns: 1fr; }
        html[data-page="technician-planning"] .tp-top { flex-direction: column; align-items: flex-start; }
        html[data-page="technician-planning"] .tp-actions { width: 100%; }
        html[data-page="technician-planning"] .tp-actions .tp-btn { flex: 1; }
        html[data-page="technician-planning"] .tp-form { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  async function ensureSupabaseJs() {
    if (window.supabase?.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
        existing.addEventListener("load", () => (clearTimeout(t), resolve()), { once: true });
        existing.addEventListener("error", () => (clearTimeout(t), reject(new Error("Echec chargement supabase-js"))), {
          once: true,
        });
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
      s.addEventListener("load", () => (clearTimeout(t), resolve()), { once: true });
      s.addEventListener("error", () => (clearTimeout(t), reject(new Error("Echec chargement supabase-js"))), { once: true });
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

  function showBanner(els, msg, kind) {
    els.banner.textContent = msg || "";
    els.banner.classList.toggle("is-ok", kind === "ok");
    els.banner.classList.toggle("is-err", kind === "err");
    els.banner.style.display = msg ? "block" : "none";
  }

  function renderShell() {
    root.classList.add("tp-shell");
    root.innerHTML = `
      <div class="tp-top">
        <div>
          <h2 class="tp-title">${escapeHTML(STR.title)}</h2>
          <p class="tp-subtitle">${escapeHTML(STR.subtitle)}</p>
        </div>
        <div class="tp-actions">
          <button type="button" class="tp-btn" data-action="refresh">${escapeHTML(STR.refresh)}</button>
          <button type="button" class="tp-btn tp-btn--primary" data-action="block">${escapeHTML(STR.blockDates)}</button>
        </div>
      </div>
      <div class="tp-banner" data-banner></div>
      <div class="tp-body">
        <div class="tp-weekbar">
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="tp-btn" data-action="prev">${escapeHTML(STR.weekPrev)}</button>
            <button type="button" class="tp-btn" data-action="next">${escapeHTML(STR.weekNext)}</button>
          </div>
          <div class="tp-range" data-range></div>
        </div>
        <div class="tp-grid" data-grid></div>
      </div>

      <div class="tp-modal" data-modal aria-hidden="true">
        <div class="tp-modal__backdrop" data-modal-backdrop></div>
        <div class="tp-modal__panel" role="dialog" aria-modal="true" aria-label="Blocage">
          <div class="tp-modal__head">
            <h3 class="tp-modal__title" data-modal-title></h3>
            <button type="button" class="tp-btn" data-modal-close>Fermer</button>
          </div>
          <div data-modal-body></div>
          <div class="tp-modal__foot" data-modal-foot></div>
        </div>
      </div>
    `;

    return {
      btnRefresh: root.querySelector('[data-action="refresh"]'),
      btnBlock: root.querySelector('[data-action="block"]'),
      btnPrev: root.querySelector('[data-action="prev"]'),
      btnNext: root.querySelector('[data-action="next"]'),
      banner: root.querySelector("[data-banner]"),
      range: root.querySelector("[data-range]"),
      grid: root.querySelector("[data-grid]"),
      modal: root.querySelector("[data-modal]"),
      modalBackdrop: root.querySelector("[data-modal-backdrop]"),
      modalClose: root.querySelector("[data-modal-close]"),
      modalTitle: root.querySelector("[data-modal-title]"),
      modalBody: root.querySelector("[data-modal-body]"),
      modalFoot: root.querySelector("[data-modal-foot]"),
    };
  }

  function openModal(els, { title, bodyHtml, footHtml }) {
    els.modalTitle.textContent = title || "";
    els.modalBody.innerHTML = bodyHtml || "";
    els.modalFoot.innerHTML = footHtml || "";
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(els) {
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
    els.modalTitle.textContent = "";
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
  }

  function fmtDate(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function fmtTime(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function startOfIsoWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Monday as first day
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(n || 0));
    return d;
  }

  function asIso(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "planned") return "is-planned";
    if (s === "pending") return "is-pending";
    if (s === "in_progress") return "is-progress";
    if (s === "done") return "is-done";
    if (s === "canceled") return "is-canceled";
    return "";
  }

  function statusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "planned") return "Planifiee";
    if (s === "pending") return "En attente";
    if (s === "in_progress") return "En cours";
    if (s === "done") return "Terminee";
    if (s === "canceled") return "Annulee";
    return s || "—";
  }

  injectStyles();
  const els = renderShell();
  showBanner(els, STR.loading, "");

  let supabase = null;

  const state = {
    userId: "",
    orgId: "",
    orgRole: "",
    modules: {},
    userType: "",

    weekOffset: 0,
    assignments: [],
    blocks: [],
  };

  wireBaseEvents();

  try {
    await ensureSupabaseJs();
    supabase = getSupabase();
    if (!supabase) throw new Error("Supabase non charge.");

    const user = (await supabase.auth.getUser())?.data?.user || null;
    state.userId = String(user?.id || "");
    if (!state.userId) {
      showBanner(els, `${STR.loginTitle} ${STR.loginBody}`, "err");
      renderBlockingCard(els, STR.loginTitle, STR.loginBody, STR.loginCta, CONFIG.LOGIN_PATH);
      return;
    }

    const member = await resolveMember();
    state.orgId = String(member?.organization_id || "");
    state.orgRole = String(member?.role || "").toLowerCase();

    if (!state.orgId) {
      showBanner(els, STR.opError, "err");
      renderBlockingCard(els, STR.moduleMissingTitle, "Aucune organisation active pour ce compte.", STR.moduleCta, CONFIG.SUBSCRIBE_PATH);
      return;
    }

    const [entRes, profRes] = await Promise.all([
      supabase.from("organization_entitlements").select("modules").eq("organization_id", state.orgId).maybeSingle(),
      supabase.from(CONFIG.PROFILES_TABLE).select("user_type").eq("id", state.userId).maybeSingle(),
    ]);
    state.modules = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
    state.userType = String(profRes?.data?.user_type || "").trim().toLowerCase();

    if (!state.modules?.interventions) {
      renderBlockingCard(els, STR.moduleMissingTitle, STR.moduleMissingBody, STR.moduleCta, CONFIG.SUBSCRIBE_PATH);
      return;
    }

    await refreshAll();
    showBanner(els, "", "");
  } catch (e) {
    console.error("[TECH PLANNING] boot error:", e);
    renderBlockingCard(els, "Erreur", STR.opError, "Recharger", location.href);
  }

  function wireBaseEvents() {
    els.btnRefresh.addEventListener("click", async () => {
      await refreshAll();
      showBanner(els, STR.opSaved, "ok");
      setTimeout(() => showBanner(els, "", ""), 1400);
    });

    els.btnPrev.addEventListener("click", async () => {
      state.weekOffset -= 1;
      render();
    });
    els.btnNext.addEventListener("click", async () => {
      state.weekOffset += 1;
      render();
    });

    els.btnBlock.addEventListener("click", () => openBlockModal());

    els.modalBackdrop.addEventListener("click", () => closeModal(els));
    els.modalClose.addEventListener("click", () => closeModal(els));
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (els.modal.classList.contains("is-open")) closeModal(els);
    });
  }

  async function resolveMember() {
    const baseSel = "organization_id, role, is_default, created_at";
    const fullSel = baseSel + ", permissions_mode, permissions";

    let res = await supabase
      .from("organization_members")
      .select(fullSel)
      .eq("user_id", state.userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (res.error && String(res.error.message || "").toLowerCase().includes("does not exist")) {
      res = await supabase
        .from("organization_members")
        .select(baseSel)
        .eq("user_id", state.userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
    }

    return res.error ? null : res.data?.[0] || null;
  }

  async function refreshAll() {
    showBanner(els, STR.loading, "");
    await Promise.all([loadAssignments(), loadBlocks()]);
    render();
    showBanner(els, "", "");
  }

  async function loadAssignments() {
    // Load assignments + embed interventions, then filter client-side to keep it robust.
    const res = await supabase
      .from(CONFIG.ASSIGNEES_TABLE)
      .select(
        "id, user_id, intervention_id, interventions:intervention_id(id, internal_ref, title, start_at, end_at, status, client_name, client_ref, address, support_phone)"
      )
      .eq("organization_id", state.orgId)
      .eq("user_id", state.userId)
      .order("id", { ascending: false })
      .limit(5000);

    if (res.error) throw res.error;
    const rows = (res.data || [])
      .map((r) => (r?.interventions ? { ...r.interventions, assignment_id: r.id } : null))
      .filter(Boolean);

    state.assignments = rows;
  }

  async function loadBlocks() {
    const res = await supabase
      .from(CONFIG.AVAILABILITY_TABLE)
      .select("id, starts_at, ends_at, kind, reason, created_at")
      .eq("organization_id", state.orgId)
      .eq("user_id", state.userId)
      .order("starts_at", { ascending: false })
      .limit(2000);
    state.blocks = res.error ? [] : res.data || [];
  }

  function render() {
    const base = startOfIsoWeek(new Date());
    const weekStart = addDays(base, state.weekOffset * 7);
    const weekEnd = addDays(weekStart, 7);
    els.range.textContent = `${fmtDate(weekStart)} → ${fmtDate(addDays(weekEnd, -1))}`;

    const dayBuckets = [];
    for (let i = 0; i < 7; i++) {
      const d0 = addDays(weekStart, i);
      const d1 = addDays(weekStart, i + 1);
      dayBuckets.push({ d0, d1, interventions: [], blocks: [] });
    }

    // Interventions within week (by start_at).
    (state.assignments || []).forEach((itv) => {
      const s = itv?.start_at ? new Date(itv.start_at) : null;
      if (!s || !Number.isFinite(s.getTime())) return;
      for (const b of dayBuckets) {
        if (s >= b.d0 && s < b.d1) {
          b.interventions.push(itv);
          break;
        }
      }
    });

    // Blocks overlapping week days.
    (state.blocks || []).forEach((blk) => {
      const s = blk?.starts_at ? new Date(blk.starts_at) : null;
      const e = blk?.ends_at ? new Date(blk.ends_at) : null;
      if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;
      for (const b of dayBuckets) {
        const overlap = e > b.d0 && s < b.d1;
        if (overlap) b.blocks.push(blk);
      }
    });

    els.grid.innerHTML = dayBuckets
      .map((b) => {
        const dow = b.d0.toLocaleDateString("fr-FR", { weekday: "long" });
        const dd = b.d0.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

        const blocksHtml = (b.blocks || [])
          .slice()
          .sort((a, z) => String(a.starts_at || "").localeCompare(String(z.starts_at || "")))
          .map((blk) => {
            const s = new Date(blk.starts_at);
            const e = new Date(blk.ends_at);
            const title = blk.kind === "vacation" ? "Conges" : blk.kind === "sick" ? "Arret" : "Indisponible";
            const meta = `${fmtTime(s)} → ${fmtTime(e)}${blk.reason ? " • " + String(blk.reason) : ""}`;
            return `
              <div class="tp-chip tp-block" data-block="${escapeHTML(blk.id)}">
                <div class="tp-block__top">
                  <div class="tp-block__title">${escapeHTML(title)}</div>
                  <button type="button" class="tp-mini" data-action="del-block" data-id="${escapeHTML(blk.id)}">${escapeHTML(STR.delete)}</button>
                </div>
                <div class="tp-block__meta">${escapeHTML(meta)}</div>
              </div>
            `;
          })
          .join("");

        const itvHtml = (b.interventions || [])
          .slice()
          .sort((a, z) => String(a.start_at || "").localeCompare(String(z.start_at || "")))
          .map((itv) => {
            const s = itv.start_at ? new Date(itv.start_at) : null;
            const time = s && Number.isFinite(s.getTime()) ? fmtTime(s) : "—";
            const meta = [itv.client_name || itv.client_ref || "", itv.address || ""].filter(Boolean).join(" • ");
            const href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(String(itv.id))}`;
            const cls = statusClass(itv.status);
            return `
              <a class="tp-chip tp-itv ${escapeHTML(cls)}" href="${escapeHTML(href)}" style="text-decoration:none; color:inherit;">
                <div class="tp-itv__row">
                  <div class="tp-itv__title">${escapeHTML(time)} • ${escapeHTML(itv.internal_ref || itv.title || "Intervention")}</div>
                  <span class="tp-badge"><span class="tp-dot"></span>${escapeHTML(statusLabel(itv.status))}</span>
                </div>
                <div class="tp-itv__meta">${escapeHTML(meta || "—")}</div>
              </a>
            `;
          })
          .join("");

        const empty = !blocksHtml && !itvHtml ? `<div class="tp-chip"><div class="tp-itv__meta">${escapeHTML(STR.noItems)}</div></div>` : "";

        return `
          <div class="tp-day">
            <div class="tp-day__head">
              <div class="tp-day__dow">${escapeHTML(dow.charAt(0).toUpperCase() + dow.slice(1))}</div>
              <div class="tp-day__date">${escapeHTML(dd)}</div>
            </div>
            <div class="tp-day__body">
              ${blocksHtml || ""}
              ${itvHtml || ""}
              ${empty}
            </div>
          </div>
        `;
      })
      .join("");

    els.grid.querySelectorAll('[data-action="del-block"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = String(btn.getAttribute("data-id") || "");
        await deleteBlock(id);
      });
    });
  }

  function renderBlockingCard(els, title, body, ctaLabel, ctaHref) {
    els.grid.innerHTML = `
      <div style="grid-column: 1 / -1;">
        <div style="border:1px solid rgba(15,23,42,0.12); background: rgba(255,255,255,0.92); border-radius: 16px; padding: 14px;">
          <div style="font-weight: 1000; font-size: 15px;">${escapeHTML(title)}</div>
          <div style="margin-top:6px; color: rgba(2,6,23,0.62); font-weight: 800;">${escapeHTML(body)}</div>
          <div style="margin-top:12px;">
            <a class="tp-btn tp-btn--primary" href="${escapeHTML(ctaHref)}" style="display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">
              ${escapeHTML(ctaLabel)}
            </a>
          </div>
        </div>
      </div>
    `;
  }

  function openBlockModal() {
    const base = startOfIsoWeek(new Date());
    const weekStart = addDays(base, state.weekOffset * 7);
    const d = weekStart;
    const dateStr = d.toISOString().slice(0, 10);
    openModal(els, {
      title: "Bloquer une disponibilite",
      bodyHtml: `
        <form class="tp-form" data-form="block">
          <div class="tp-full">
            <div style="color: rgba(2,6,23,0.62); font-weight: 800; font-size: 13px;">
              Astuce: utile pour les sous-traitants (external) afin d'eviter les assignations sur certaines dates.
            </div>
          </div>
          <div>
            <label class="tp-label">Type</label>
            <select class="tp-select" name="kind">
              <option value="unavailable">Indisponible</option>
              <option value="vacation">Conges</option>
              <option value="sick">Arret</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div>
            <label class="tp-label">Date</label>
            <input class="tp-input" name="date" type="date" value="${escapeHTML(dateStr)}" />
          </div>
          <div>
            <label class="tp-label">Heure debut</label>
            <input class="tp-input" name="start_time" type="time" value="08:00" />
          </div>
          <div>
            <label class="tp-label">Heure fin</label>
            <input class="tp-input" name="end_time" type="time" value="18:00" />
          </div>
          <div class="tp-full">
            <label class="tp-label">Raison (optionnel)</label>
            <textarea class="tp-textarea" name="reason" placeholder="Ex: indisponible, conges, ..."></textarea>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="tp-btn" data-action="cancel">${escapeHTML(STR.cancel)}</button>
        <button type="button" class="tp-btn tp-btn--primary" data-action="save">${escapeHTML(STR.save)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const form = els.modalBody.querySelector('[data-form="block"]');
      const kind = String(form.kind.value || "unavailable");
      const date = String(form.date.value || "").trim();
      const st = String(form.start_time.value || "").trim();
      const et = String(form.end_time.value || "").trim();
      const reason = String(form.reason.value || "").trim() || null;

      if (!date || !st || !et) {
        showBanner(els, "Champs incomplets.", "err");
        return;
      }

      const startsAt = new Date(`${date}T${st}:00`);
      const endsAt = new Date(`${date}T${et}:00`);
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
        showBanner(els, "Plage horaire invalide.", "err");
        return;
      }

      showBanner(els, STR.loading, "");
      const res = await supabase.from(CONFIG.AVAILABILITY_TABLE).insert({
        organization_id: state.orgId,
        user_id: state.userId,
        kind,
        starts_at: asIso(startsAt),
        ends_at: asIso(endsAt),
        reason,
        created_by: state.userId,
      });
      if (res.error) {
        showBanner(els, res.error.message || STR.opError, "err");
        return;
      }

      await loadBlocks();
      closeModal(els);
      showBanner(els, STR.opSaved, "ok");
      render();
      setTimeout(() => showBanner(els, "", ""), 1400);
    });
  }

  async function deleteBlock(id) {
    const bid = String(id || "").trim();
    if (!bid) return;
    if (!confirm(STR.confirmDelete)) return;
    showBanner(els, STR.loading, "");
    const res = await supabase.from(CONFIG.AVAILABILITY_TABLE).delete().eq("id", bid);
    if (res.error) {
      showBanner(els, res.error.message || STR.opError, "err");
      return;
    }
    await loadBlocks();
    showBanner(els, STR.opSaved, "ok");
    render();
    setTimeout(() => showBanner(els, "", ""), 1200);
  }

  log("mounted", state.userType);
});

