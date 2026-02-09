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
    subtitle: "Interventions assignées + indisponibilités",
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
    viewWeek: "Semaine",
    viewMonth: "Mois",
    viewAgenda: "Agenda",
    weekPrev: "Semaine précédente",
    weekNext: "Semaine suivante",
    monthPrev: "Mois précédent",
    monthNext: "Mois suivant",
    today: "Aujourd'hui",
    selectRange: "Sélection rapide",
    selectHint: "Touchez une date de début, puis une date de fin.",
    blockDates: "Bloquer une période",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    confirmDelete: "Supprimer ce blocage ?",
    noItems: "Aucun élément.",
    dayDetails: "Détails du jour",
    editBlock: "Modifier le blocage",
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

      html[data-page="technician-planning"] .tp-controls {
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      html[data-page="technician-planning"] .tp-controls__left,
      html[data-page="technician-planning"] .tp-controls__right {
        display:flex;
        align-items:center;
        gap: 10px;
        flex-wrap: wrap;
      }
      html[data-page="technician-planning"] .tp-controls__right { justify-content:flex-end; }
      html[data-page="technician-planning"] .tp-stage { min-height: 220px; }

      html[data-page="technician-planning"] .tp-seg {
        display:inline-flex;
        align-items:center;
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.72);
        box-shadow: 0 10px 22px rgba(2,6,23,0.06);
      }
      html[data-page="technician-planning"] .tp-seg__btn {
        height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 0;
        background: transparent;
        color: rgba(2,6,23,0.66);
        font-weight: 950;
        cursor: pointer;
        transition: transform 140ms ease, background 160ms ease, box-shadow 180ms ease, color 160ms ease;
      }
      html[data-page="technician-planning"] .tp-seg__btn:hover { transform: translateY(-1px); }
      html[data-page="technician-planning"] .tp-seg__btn.is-active {
        background: linear-gradient(180deg, rgba(var(--mbl-primary-rgb, 14, 165, 233),0.96), rgba(var(--mbl-primary-rgb, 14, 165, 233),0.72));
        color: #fff;
        box-shadow: 0 16px 44px rgba(2,6,23,0.14);
      }

      html[data-page="technician-planning"] .tp-btn.is-active {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.50);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }

      html[data-page="technician-planning"] .tp-hint {
        color: rgba(2,6,23,0.62);
        font-weight: 850;
        font-size: 12px;
      }

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
      html[data-page="technician-planning"] .tp-day__head[data-day] { cursor: pointer; }
      html[data-page="technician-planning"] .tp-day__head[data-day]:hover {
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.06);
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

      /* Selection highlight */
      html[data-page="technician-planning"] .tp-day.is-sel-range,
      html[data-page="technician-planning"] .tp-mday.is-sel-range,
      html[data-page="technician-planning"] .tp-agenda__day.is-sel-range {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.55);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14), 0 18px 44px rgba(2,6,23,0.10);
      }
      html[data-page="technician-planning"] .tp-day.is-sel-start,
      html[data-page="technician-planning"] .tp-day.is-sel-end,
      html[data-page="technician-planning"] .tp-mday.is-sel-start,
      html[data-page="technician-planning"] .tp-mday.is-sel-end,
      html[data-page="technician-planning"] .tp-agenda__day.is-sel-start,
      html[data-page="technician-planning"] .tp-agenda__day.is-sel-end {
        background:
          radial-gradient(900px 460px at 10% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14), transparent 60%),
          linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.86));
      }

      /* Month */
      html[data-page="technician-planning"] .tp-month__weekdays {
        display:grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 10px;
        margin-bottom: 10px;
        color: rgba(2,6,23,0.62);
        font-weight: 950;
        font-size: 12px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      html[data-page="technician-planning"] .tp-month__weekdays div { padding: 0 6px; }
      html[data-page="technician-planning"] .tp-month__grid {
        display:grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 10px;
      }
      html[data-page="technician-planning"] .tp-mday {
        text-align:left;
        width: 100%;
        display:flex;
        flex-direction: column;
        font: inherit;
        appearance: none;
        -webkit-appearance: none;
        border: 1px solid var(--tp-border);
        background: rgba(255,255,255,0.88);
        border-radius: 16px;
        padding: 10px;
        min-height: 120px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
        cursor:pointer;
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      html[data-page="technician-planning"] .tp-mday:hover { transform: translateY(-1px); border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.35); box-shadow: 0 18px 44px rgba(2,6,23,0.10); }
      html[data-page="technician-planning"] .tp-mday:disabled { cursor: default; opacity: 0.7; transform:none; }
      html[data-page="technician-planning"] .tp-mday.is-out { opacity: 0.55; background: rgba(248,250,252,0.65); }
      html[data-page="technician-planning"] .tp-mday.is-today { border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.55); }
      html[data-page="technician-planning"] .tp-mday__top { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      html[data-page="technician-planning"] .tp-mday__num { font-weight: 1000; }
      html[data-page="technician-planning"] .tp-pills { display:flex; gap: 6px; align-items:center; }
      html[data-page="technician-planning"] .tp-pill {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width: 26px;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.90);
        font-weight: 950;
        font-size: 12px;
        color: rgba(2,6,23,0.70);
      }
      html[data-page="technician-planning"] .tp-pill--itv { border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.32); }
      html[data-page="technician-planning"] .tp-pill--blk { border-color: rgba(245,158,11,0.40); color: rgba(146,64,14,0.92); background: rgba(255,247,237,0.90); }
      html[data-page="technician-planning"] .tp-mitems { margin-top: 8px; display:flex; flex-direction: column; gap: 6px; }
      html[data-page="technician-planning"] .tp-mitem {
        font-size: 12px;
        font-weight: 900;
        border-radius: 999px;
        padding: 6px 10px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(248,250,252,0.92);
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      html[data-page="technician-planning"] .tp-mitem--block {
        border-color: rgba(245,158,11,0.38);
        background: rgba(255,247,237,0.92);
        color: rgba(146,64,14,0.95);
      }
      html[data-page="technician-planning"] .tp-mitem--itv {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.28);
      }
      html[data-page="technician-planning"] .tp-mitem--more {
        background: rgba(2,6,23,0.06);
        color: rgba(2,6,23,0.62);
        border-color: transparent;
      }

      /* Agenda */
      html[data-page="technician-planning"] .tp-agenda { display:flex; flex-direction: column; gap: 12px; }
      html[data-page="technician-planning"] .tp-agenda__day {
        border: 1px solid var(--tp-border);
        background: var(--tp-card);
        border-radius: 16px;
        overflow:hidden;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }
      html[data-page="technician-planning"] .tp-agenda__head {
        padding: 10px 12px;
        width: 100%;
        text-align:left;
        border: 0;
        font: inherit;
        cursor:pointer;
        appearance: none;
        -webkit-appearance: none;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        background: rgba(255,255,255,0.86);
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="technician-planning"] .tp-agenda__head:hover {
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.06);
      }
      html[data-page="technician-planning"] .tp-agenda__date { font-weight: 1000; }
      html[data-page="technician-planning"] .tp-agenda__body { padding: 10px 12px 12px; display:flex; flex-direction: column; gap: 10px; }

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
        html[data-page="technician-planning"] .tp-month__weekdays { display:none; }
        html[data-page="technician-planning"] .tp-month__grid { gap: 8px; }
        html[data-page="technician-planning"] .tp-mday { min-height: 70px; padding: 10px 10px; }
        html[data-page="technician-planning"] .tp-mitems { display:none; }
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
        <div class="tp-controls">
          <div class="tp-controls__left">
            <div class="tp-seg" role="tablist" aria-label="Vue">
              <button type="button" class="tp-seg__btn is-active" data-action="view" data-view="week" role="tab" aria-selected="true">${escapeHTML(STR.viewWeek)}</button>
              <button type="button" class="tp-seg__btn" data-action="view" data-view="month" role="tab" aria-selected="false">${escapeHTML(STR.viewMonth)}</button>
              <button type="button" class="tp-seg__btn" data-action="view" data-view="agenda" role="tab" aria-selected="false">${escapeHTML(STR.viewAgenda)}</button>
            </div>
            <div class="tp-hint" data-hint style="display:none;"></div>
          </div>
          <div class="tp-controls__right">
            <button type="button" class="tp-btn" data-action="toggle-select">${escapeHTML(STR.selectRange)}</button>
            <button type="button" class="tp-btn" data-action="today">${escapeHTML(STR.today)}</button>
            <button type="button" class="tp-btn" data-action="prev">${escapeHTML(STR.weekPrev)}</button>
            <button type="button" class="tp-btn" data-action="next">${escapeHTML(STR.weekNext)}</button>
            <div class="tp-range" data-range></div>
          </div>
        </div>
        <div class="tp-stage" data-stage></div>
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
      btnToday: root.querySelector('[data-action="today"]'),
      btnToggleSelect: root.querySelector('[data-action="toggle-select"]'),
      viewBtns: Array.from(root.querySelectorAll('[data-action="view"]')),
      hint: root.querySelector("[data-hint]"),
      banner: root.querySelector("[data-banner]"),
      range: root.querySelector("[data-range]"),
      stage: root.querySelector("[data-stage]"),
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

    if (state?.pendingSelectionClear) {
      state.pendingSelectionClear = false;
      state.selectStart = "";
      state.selectEnd = "";
      render();
    }
  }

  function fmtDate(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function fmtTime(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function pad2(n) {
    return String(Number(n || 0)).padStart(2, "0");
  }

  function ymdLocal(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseYmdLocal(ymd) {
    const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function fmtTimeInput(d) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

    view: "week", // week|month|agenda
    weekOffset: 0,
    monthOffset: 0,

    selectMode: false,
    selectStart: "",
    selectEnd: "",
    pendingSelectionClear: false,

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

    function syncSelectionHint() {
      if (!els.hint) return;
      if (!state.selectMode) {
        els.hint.style.display = "none";
        els.hint.textContent = "";
        return;
      }
      els.hint.style.display = "block";
      els.hint.textContent = STR.selectHint;
    }

    function clearSelection() {
      state.selectStart = "";
      state.selectEnd = "";
    }

    function setView(next) {
      const v = String(next || "").trim().toLowerCase();
      state.view = v === "month" || v === "agenda" ? v : "week";
      clearSelection();
      syncSelectionHint();
      render();
    }

    els.viewBtns.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
    });

    els.btnToggleSelect.addEventListener("click", () => {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) clearSelection();
      syncSelectionHint();
      render();
    });

    els.btnToday.addEventListener("click", () => {
      if (state.view === "week") state.weekOffset = 0;
      else state.monthOffset = 0;
      clearSelection();
      render();
    });

    els.btnPrev.addEventListener("click", () => {
      if (state.view === "week") state.weekOffset -= 1;
      else state.monthOffset -= 1;
      clearSelection();
      render();
    });
    els.btnNext.addEventListener("click", () => {
      if (state.view === "week") state.weekOffset += 1;
      else state.monthOffset += 1;
      clearSelection();
      render();
    });

    els.btnBlock.addEventListener("click", () => openBlockModal({ source: "toolbar" }));

    // Dynamic area interactions (day click, block edit/delete, etc.)
    els.stage.addEventListener("click", async (e) => {
      const delBtn = e.target.closest('[data-action="del-block"]');
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = String(delBtn.getAttribute("data-id") || "");
        await deleteBlock(id);
        return;
      }

      const blockEl = e.target.closest("[data-block]");
      if (blockEl && !e.target.closest('[data-action="del-block"]')) {
        const id = String(blockEl.getAttribute("data-block") || "");
        if (id) openEditBlockModal(id);
        return;
      }

      const dayEl = e.target.closest("[data-day]");
      if (dayEl) {
        const ymd = String(dayEl.getAttribute("data-day") || "").trim();
        if (!ymd) return;
        if (state.selectMode) handlePickRangeDay(ymd);
        else openDayModal(ymd);
      }
    });

    els.modalBackdrop.addEventListener("click", () => closeModal(els));
    els.modalClose.addEventListener("click", () => closeModal(els));
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (els.modal.classList.contains("is-open")) closeModal(els);
    });

    syncSelectionHint();
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
    // Tabs
    els.viewBtns.forEach((btn) => {
      const v = String(btn.getAttribute("data-view") || "").trim().toLowerCase();
      const isActive = v === state.view;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    els.btnToggleSelect.classList.toggle("is-active", state.selectMode);

    // Prev/Next labels
    els.btnPrev.textContent = state.view === "week" ? STR.weekPrev : STR.monthPrev;
    els.btnNext.textContent = state.view === "week" ? STR.weekNext : STR.monthNext;

    // Render
    if (state.view === "week") {
      const base = startOfIsoWeek(new Date());
      const weekStart = addDays(base, state.weekOffset * 7);
      const weekEnd = addDays(weekStart, 7);
      els.range.textContent = `${fmtDate(weekStart)} → ${fmtDate(addDays(weekEnd, -1))}`;
      renderWeekView(weekStart);
      return;
    }

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth() + state.monthOffset, 1);
    monthStart.setHours(0, 0, 0, 0);
    const labelRaw = monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    els.range.textContent = labelRaw ? labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1) : "";
    if (state.view === "month") renderMonthView(monthStart);
    else renderAgendaView(monthStart);
  }

  function selectionClassesForYmd(ymd) {
    if (!state.selectMode) return "";
    const a = String(state.selectStart || "").trim();
    const b = String(state.selectEnd || "").trim();
    if (!a) return "";
    const start = b ? (a <= b ? a : b) : a;
    const end = b ? (a <= b ? b : a) : a;
    if (ymd < start || ymd > end) return "";
    const out = ["is-sel-range"];
    if (ymd === start) out.push("is-sel-start");
    if (ymd === end) out.push("is-sel-end");
    return out.join(" ");
  }

  function blockTitle(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "vacation") return "Congés";
    if (k === "sick") return "Arrêt";
    if (k === "other") return "Autre";
    return "Indisponible";
  }

  function renderWeekView(weekStart) {
    const weekEnd = addDays(weekStart, 7);

    const dayBuckets = [];
    for (let i = 0; i < 7; i++) {
      const d0 = addDays(weekStart, i);
      const d1 = addDays(weekStart, i + 1);
      dayBuckets.push({ d0, d1, interventions: [], blocks: [] });
    }

    // Interventions within week (by overlap).
    (state.assignments || []).forEach((itv) => {
      const s = itv?.start_at ? new Date(itv.start_at) : null;
      const e = itv?.end_at ? new Date(itv.end_at) : null;
      if (!s || !Number.isFinite(s.getTime())) return;
      const end = e && Number.isFinite(e.getTime()) ? e : s;
      for (const b of dayBuckets) {
        const overlap = end > b.d0 && s < b.d1;
        if (overlap) b.interventions.push(itv);
      }
    });

    // Blocks overlapping week days.
    (state.blocks || []).forEach((blk) => {
      const s = blk?.starts_at ? new Date(blk.starts_at) : null;
      const e = blk?.ends_at ? new Date(blk.ends_at) : null;
      if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;
      if (e <= weekStart || s >= weekEnd) return;
      for (const b of dayBuckets) {
        const overlap = e > b.d0 && s < b.d1;
        if (overlap) b.blocks.push(blk);
      }
    });

    els.stage.innerHTML = `
      <div class="tp-grid">
        ${dayBuckets
          .map((b) => {
            const dow = b.d0.toLocaleDateString("fr-FR", { weekday: "long" });
            const dd = b.d0.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
            const ymd = ymdLocal(b.d0);
            const selCls = selectionClassesForYmd(ymd);

            const blocksHtml = (b.blocks || [])
              .slice()
              .sort((a, z) => String(a.starts_at || "").localeCompare(String(z.starts_at || "")))
              .map((blk) => {
                const s0 = new Date(blk.starts_at);
                const e0 = new Date(blk.ends_at);
                const segStart = s0 > b.d0 ? s0 : b.d0;
                const segEnd = e0 < b.d1 ? e0 : b.d1;
                const isAllDay = segStart.getTime() === b.d0.getTime() && segEnd.getTime() === b.d1.getTime();
                const metaBase = isAllDay ? "Toute la journée" : `${fmtTime(segStart)} → ${fmtTime(segEnd)}`;
                const meta = metaBase + (blk.reason ? " • " + String(blk.reason) : "");
                return `
                  <div class="tp-chip tp-block" data-block="${escapeHTML(blk.id)}">
                    <div class="tp-block__top">
                      <div class="tp-block__title">${escapeHTML(blockTitle(blk.kind))}</div>
                      <button type="button" class="tp-mini" data-action="del-block" data-id="${escapeHTML(blk.id)}">${escapeHTML(
                  STR.delete
                )}</button>
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
                  <a class="tp-chip tp-itv ${escapeHTML(cls)}" href="${escapeHTML(
                  href
                )}" style="text-decoration:none; color:inherit;">
                    <div class="tp-itv__row">
                      <div class="tp-itv__title">${escapeHTML(time)} • ${escapeHTML(
                  itv.internal_ref || itv.title || "Intervention"
                )}</div>
                      <span class="tp-badge"><span class="tp-dot"></span>${escapeHTML(statusLabel(itv.status))}</span>
                    </div>
                    <div class="tp-itv__meta">${escapeHTML(meta || "—")}</div>
                  </a>
                `;
              })
              .join("");

            const empty =
              !blocksHtml && !itvHtml ? `<div class="tp-chip"><div class="tp-itv__meta">${escapeHTML(STR.noItems)}</div></div>` : "";

            return `
              <div class="tp-day ${escapeHTML(selCls)}">
                <div class="tp-day__head" data-day="${escapeHTML(ymd)}" title="${escapeHTML(
              state.selectMode ? STR.selectHint : STR.dayDetails
            )}">
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
          .join("")}
      </div>
    `;
  }

  function renderMonthView(monthStart) {
    const monthIndex = monthStart.getMonth();
    const gridStart = startOfIsoWeek(monthStart);
    const gridEnd = addDays(gridStart, 42);

    const itvByDay = new Map();
    (state.assignments || []).forEach((itv) => {
      const s = itv?.start_at ? new Date(itv.start_at) : null;
      if (!s || !Number.isFinite(s.getTime())) return;
      const key = ymdLocal(s);
      const arr = itvByDay.get(key) || [];
      arr.push(itv);
      itvByDay.set(key, arr);
    });

    const blkByDay = new Map();
    (state.blocks || []).forEach((blk) => {
      const s = blk?.starts_at ? new Date(blk.starts_at) : null;
      const e = blk?.ends_at ? new Date(blk.ends_at) : null;
      if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;
      if (e <= gridStart || s >= gridEnd) return;

      const start = s < gridStart ? gridStart : s;
      let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      cur.setHours(0, 0, 0, 0);
      while (cur < e && cur < gridEnd) {
        const key = ymdLocal(cur);
        const arr = blkByDay.get(key) || [];
        arr.push(blk);
        blkByDay.set(key, arr);
        cur = addDays(cur, 1);
        cur.setHours(0, 0, 0, 0);
      }
    });

    const now = new Date();
    const todayKey = ymdLocal(now);
    const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

    const daysHtml = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const ymd = ymdLocal(d);
      const isOut = d.getMonth() !== monthIndex;
      const isToday = ymd === todayKey;
      const selCls = selectionClassesForYmd(ymd);

      const itvs = (itvByDay.get(ymd) || []).slice().sort((a, z) => String(a.start_at || "").localeCompare(String(z.start_at || "")));
      const blks = (blkByDay.get(ymd) || []).slice().sort((a, z) => String(a.starts_at || "").localeCompare(String(z.starts_at || "")));

      const pills =
        (itvs.length || blks.length) &&
        `<div class="tp-pills">
          ${itvs.length ? `<span class="tp-pill tp-pill--itv" title="Interventions">${escapeHTML(itvs.length)}</span>` : ""}
          ${blks.length ? `<span class="tp-pill tp-pill--blk" title="Blocages">${escapeHTML(blks.length)}</span>` : ""}
        </div>`;

      const items = [];
      blks.slice(0, 1).forEach((blk) => items.push({ kind: "block", label: blockTitle(blk.kind) }));
      itvs.slice(0, 2).forEach((itv) => {
        const s = itv.start_at ? new Date(itv.start_at) : null;
        const time = s && Number.isFinite(s.getTime()) ? fmtTime(s) : "—";
        items.push({ kind: "itv", label: `${time} • ${itv.internal_ref || itv.title || "Intervention"}` });
      });

      const maxItems = 3;
      const clipped = items.slice(0, maxItems);
      const remaining = Math.max(0, blks.length + itvs.length - clipped.length);

      const itemsHtml =
        clipped.length || remaining
          ? `<div class="tp-mitems">
              ${clipped
                .map((it) => {
                  const cls = it.kind === "block" ? "tp-mitem tp-mitem--block" : "tp-mitem tp-mitem--itv";
                  return `<div class="${cls}">${escapeHTML(it.label)}</div>`;
                })
                .join("")}
              ${remaining ? `<div class="tp-mitem tp-mitem--more">+${escapeHTML(remaining)}</div>` : ""}
            </div>`
          : `<div class="tp-mitems"><div class="tp-mitem tp-mitem--more">${escapeHTML(STR.noItems)}</div></div>`;

      daysHtml.push(`
        <button type="button" class="tp-mday ${isOut ? "is-out" : ""} ${isToday ? "is-today" : ""} ${escapeHTML(
        selCls
      )}" data-day="${escapeHTML(ymd)}" aria-label="${escapeHTML(fmtDate(d))}">
          <div class="tp-mday__top">
            <div class="tp-mday__num">${escapeHTML(d.getDate())}</div>
            ${pills || ""}
          </div>
          ${itemsHtml}
        </button>
      `);
    }

    els.stage.innerHTML = `
      <div class="tp-month">
        <div class="tp-month__weekdays">${weekdays.map((w) => `<div>${escapeHTML(w)}</div>`).join("")}</div>
        <div class="tp-month__grid">${daysHtml.join("")}</div>
      </div>
    `;
  }

  function renderAgendaView(monthStart) {
    const start = new Date(monthStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    end.setHours(0, 0, 0, 0);

    const itvs = (state.assignments || [])
      .map((itv) => {
        const s = itv?.start_at ? new Date(itv.start_at) : null;
        const e = itv?.end_at ? new Date(itv.end_at) : null;
        if (!s || !Number.isFinite(s.getTime())) return null;
        return { ...itv, __s: s, __e: e && Number.isFinite(e.getTime()) ? e : s };
      })
      .filter(Boolean);

    const blks = (state.blocks || [])
      .map((blk) => {
        const s = blk?.starts_at ? new Date(blk.starts_at) : null;
        const e = blk?.ends_at ? new Date(blk.ends_at) : null;
        if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return null;
        return { ...blk, __s: s, __e: e };
      })
      .filter(Boolean);

    const days = [];
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      const d0 = new Date(d);
      d0.setHours(0, 0, 0, 0);
      const d1 = addDays(d0, 1);
      const ymd = ymdLocal(d0);
      const selCls = selectionClassesForYmd(ymd);

      const dayBlocks = blks
        .filter((b) => b.__e > d0 && b.__s < d1)
        .slice()
        .sort((a, z) => a.__s.getTime() - z.__s.getTime());

      const dayItvs = itvs
        .filter((i) => i.__e > d0 && i.__s < d1)
        .slice()
        .sort((a, z) => a.__s.getTime() - z.__s.getTime());

      const blocksHtml = dayBlocks
        .map((blk) => {
          const segStart = blk.__s > d0 ? blk.__s : d0;
          const segEnd = blk.__e < d1 ? blk.__e : d1;
          const isAllDay = segStart.getTime() === d0.getTime() && segEnd.getTime() === d1.getTime();
          const metaBase = isAllDay ? "Toute la journée" : `${fmtTime(segStart)} → ${fmtTime(segEnd)}`;
          const meta = metaBase + (blk.reason ? " • " + String(blk.reason) : "");
          return `
            <div class="tp-chip tp-block" data-block="${escapeHTML(blk.id)}">
              <div class="tp-block__top">
                <div class="tp-block__title">${escapeHTML(blockTitle(blk.kind))}</div>
                <button type="button" class="tp-mini" data-action="del-block" data-id="${escapeHTML(blk.id)}">${escapeHTML(
            STR.delete
          )}</button>
              </div>
              <div class="tp-block__meta">${escapeHTML(meta)}</div>
            </div>
          `;
        })
        .join("");

      const itvHtml = dayItvs
        .map((itv) => {
          const time = itv.__s && Number.isFinite(itv.__s.getTime()) ? fmtTime(itv.__s) : "—";
          const meta = [itv.client_name || itv.client_ref || "", itv.address || ""].filter(Boolean).join(" • ");
          const href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(String(itv.id))}`;
          const cls = statusClass(itv.status);
          return `
            <a class="tp-chip tp-itv ${escapeHTML(cls)}" href="${escapeHTML(
            href
          )}" style="text-decoration:none; color:inherit;">
              <div class="tp-itv__row">
                <div class="tp-itv__title">${escapeHTML(time)} • ${escapeHTML(
            itv.internal_ref || itv.title || "Intervention"
          )}</div>
                <span class="tp-badge"><span class="tp-dot"></span>${escapeHTML(statusLabel(itv.status))}</span>
              </div>
              <div class="tp-itv__meta">${escapeHTML(meta || "—")}</div>
            </a>
          `;
        })
        .join("");

      const empty =
        !blocksHtml && !itvHtml ? `<div class="tp-chip"><div class="tp-itv__meta">${escapeHTML(STR.noItems)}</div></div>` : "";

      const dow = d0.toLocaleDateString("fr-FR", { weekday: "long" });
      const dd = d0.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

      days.push(`
        <div class="tp-agenda__day ${escapeHTML(selCls)}">
          <button type="button" class="tp-agenda__head" data-day="${escapeHTML(ymd)}" title="${escapeHTML(
        state.selectMode ? STR.selectHint : STR.dayDetails
      )}">
            <div class="tp-agenda__date">${escapeHTML(dow.charAt(0).toUpperCase() + dow.slice(1))} • ${escapeHTML(dd)}</div>
            <div style="color: rgba(2,6,23,0.62); font-weight: 900; font-size: 12px;">${escapeHTML(ymd)}</div>
          </button>
          <div class="tp-agenda__body">
            ${blocksHtml || ""}
            ${itvHtml || ""}
            ${empty}
          </div>
        </div>
      `);
    }

    els.stage.innerHTML = `<div class="tp-agenda">${days.join("")}</div>`;
  }

  function renderBlockingCard(els, title, body, ctaLabel, ctaHref) {
    els.stage.innerHTML = `
      <div style="border:1px solid rgba(15,23,42,0.12); background: rgba(255,255,255,0.92); border-radius: 16px; padding: 14px;">
        <div style="font-weight: 1000; font-size: 15px;">${escapeHTML(title)}</div>
        <div style="margin-top:6px; color: rgba(2,6,23,0.62); font-weight: 800;">${escapeHTML(body)}</div>
        <div style="margin-top:12px;">
          <a class="tp-btn tp-btn--primary" href="${escapeHTML(ctaHref)}" style="display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">
            ${escapeHTML(ctaLabel)}
          </a>
        </div>
      </div>
    `;
  }

  function handlePickRangeDay(ymd) {
    const key = String(ymd || "").trim();
    if (!key) return;

    if (!state.selectStart) {
      state.selectStart = key;
      state.selectEnd = "";
      render();
      return;
    }

    if (!state.selectEnd) {
      state.selectEnd = key;
      render();

      const a = state.selectStart;
      const b = state.selectEnd;
      const startYmd = a <= b ? a : b;
      const endYmd = a <= b ? b : a;
      state.pendingSelectionClear = true;
      openBlockModal({ startYmd, endYmd, defaultAllDay: true, source: "range" });
      return;
    }

    // Restart selection
    state.selectStart = key;
    state.selectEnd = "";
    render();
  }

  function openDayModal(ymd) {
    const d0 = parseYmdLocal(ymd);
    if (!d0) return;
    const d1 = addDays(d0, 1);

    const dayBlocks = (state.blocks || [])
      .map((blk) => {
        const s = blk?.starts_at ? new Date(blk.starts_at) : null;
        const e = blk?.ends_at ? new Date(blk.ends_at) : null;
        if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return null;
        if (!(e > d0 && s < d1)) return null;
        const segStart = s > d0 ? s : d0;
        const segEnd = e < d1 ? e : d1;
        const isAllDay = segStart.getTime() === d0.getTime() && segEnd.getTime() === d1.getTime();
        const metaBase = isAllDay ? "Toute la journée" : `${fmtTime(segStart)} → ${fmtTime(segEnd)}`;
        const meta = metaBase + (blk.reason ? " • " + String(blk.reason) : "");
        return { ...blk, __meta: meta };
      })
      .filter(Boolean)
      .sort((a, z) => String(a.starts_at || "").localeCompare(String(z.starts_at || "")));

    const dayItvs = (state.assignments || [])
      .map((itv) => {
        const s = itv?.start_at ? new Date(itv.start_at) : null;
        const e = itv?.end_at ? new Date(itv.end_at) : null;
        if (!s || !Number.isFinite(s.getTime())) return null;
        const end = e && Number.isFinite(e.getTime()) ? e : s;
        if (!(end > d0 && s < d1)) return null;
        const time = fmtTime(s) || "—";
        const meta = [itv.client_name || itv.client_ref || "", itv.address || ""].filter(Boolean).join(" • ");
        return { ...itv, __time: time, __meta: meta };
      })
      .filter(Boolean)
      .sort((a, z) => String(a.start_at || "").localeCompare(String(z.start_at || "")));

    const blocksHtml = dayBlocks.length
      ? `
        <div class="tp-full" style="margin-top: 6px;">
          <div style="font-weight: 1000; margin-bottom: 8px;">Blocages</div>
          ${dayBlocks
            .map(
              (blk) => `
              <div class="tp-chip tp-block" style="margin-bottom:10px;">
                <div class="tp-block__top">
                  <div class="tp-block__title">${escapeHTML(blockTitle(blk.kind))}</div>
                  <div style="display:flex; gap:8px;">
                    <button type="button" class="tp-mini" data-action="edit-inline" data-id="${escapeHTML(blk.id)}">Modifier</button>
                    <button type="button" class="tp-mini" data-action="del-inline" data-id="${escapeHTML(blk.id)}">${escapeHTML(
                STR.delete
              )}</button>
                  </div>
                </div>
                <div class="tp-block__meta">${escapeHTML(blk.__meta)}</div>
              </div>
            `
            )
            .join("")}
        </div>
      `
      : `
        <div class="tp-full" style="margin-top: 6px;">
          <div style="font-weight: 1000; margin-bottom: 8px;">Blocages</div>
          <div class="tp-chip"><div class="tp-itv__meta">${escapeHTML(STR.noItems)}</div></div>
        </div>
      `;

    const itvHtml = dayItvs.length
      ? `
        <div class="tp-full" style="margin-top: 12px;">
          <div style="font-weight: 1000; margin-bottom: 8px;">Interventions</div>
          ${dayItvs
            .map((itv) => {
              const href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(String(itv.id))}`;
              const cls = statusClass(itv.status);
              return `
                <a class="tp-chip tp-itv ${escapeHTML(cls)}" href="${escapeHTML(
                href
              )}" style="text-decoration:none; color:inherit; margin-bottom:10px;">
                  <div class="tp-itv__row">
                    <div class="tp-itv__title">${escapeHTML(itv.__time)} • ${escapeHTML(
                itv.internal_ref || itv.title || "Intervention"
              )}</div>
                    <span class="tp-badge"><span class="tp-dot"></span>${escapeHTML(statusLabel(itv.status))}</span>
                  </div>
                  <div class="tp-itv__meta">${escapeHTML(itv.__meta || "—")}</div>
                </a>
              `;
            })
            .join("")}
        </div>
      `
      : `
        <div class="tp-full" style="margin-top: 12px;">
          <div style="font-weight: 1000; margin-bottom: 8px;">Interventions</div>
          <div class="tp-chip"><div class="tp-itv__meta">${escapeHTML(STR.noItems)}</div></div>
        </div>
      `;

    openModal(els, {
      title: `${STR.dayDetails} • ${fmtDate(d0)}`,
      bodyHtml: `<div class="tp-form">${blocksHtml}${itvHtml}</div>`,
      footHtml: `
        <button type="button" class="tp-btn" data-action="cancel">${escapeHTML(STR.cancel)}</button>
        <button type="button" class="tp-btn tp-btn--primary" data-action="block-day">${escapeHTML(STR.blockDates)}</button>
      `,
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="block-day"]').addEventListener("click", () => {
      closeModal(els);
      openBlockModal({ startYmd: ymdLocal(d0), endYmd: ymdLocal(d0), source: "day" });
    });

    els.modalBody.querySelectorAll('[data-action="edit-inline"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = String(btn.getAttribute("data-id") || "");
        if (!id) return;
        closeModal(els);
        openEditBlockModal(id);
      });
    });
    els.modalBody.querySelectorAll('[data-action="del-inline"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = String(btn.getAttribute("data-id") || "");
        if (!id) return;
        const ok = await deleteBlock(id);
        if (ok) closeModal(els);
      });
    });
  }

  function openEditBlockModal(id) {
    const bid = String(id || "").trim();
    if (!bid) return;
    const blk = (state.blocks || []).find((b) => String(b?.id || "") === bid) || null;
    if (!blk) return;

    const s = blk?.starts_at ? new Date(blk.starts_at) : null;
    const e = blk?.ends_at ? new Date(blk.ends_at) : null;
    if (!s || !e || !Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;

    const isAllDay = s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 0 && e.getMinutes() === 0;
    const startYmd = ymdLocal(s);
    const endYmd = isAllDay ? ymdLocal(addDays(e, -1)) : ymdLocal(e);
    openBlockModal({
      mode: "edit",
      blockId: bid,
      kind: String(blk.kind || "unavailable"),
      reason: String(blk.reason || ""),
      startYmd,
      endYmd,
      allDay: isAllDay,
      startTime: fmtTimeInput(s) || "08:00",
      endTime: fmtTimeInput(e) || "18:00",
      source: "edit",
    });
  }

  function openBlockModal(opts = {}) {
    const mode = String(opts.mode || "create").toLowerCase() === "edit" ? "edit" : "create";
    const blockId = String(opts.blockId || "").trim();

    const todayKey = ymdLocal(new Date());
    const startYmd = String(opts.startYmd || todayKey).trim() || todayKey;
    const endYmd = String(opts.endYmd || startYmd).trim() || startYmd;
    const kind = String(opts.kind || "unavailable");
    const reason = String(opts.reason || "").trim();

    const forceAllDay = startYmd !== endYmd;
    const allDayDefault = Boolean(opts.defaultAllDay) || forceAllDay || Boolean(opts.allDay);
    const startTime = String(opts.startTime || "08:00").trim() || "08:00";
    const endTime = String(opts.endTime || "18:00").trim() || "18:00";

    openModal(els, {
      title: mode === "edit" ? STR.editBlock : "Bloquer une période",
      bodyHtml: `
        <form class="tp-form" data-form="block">
          <div class="tp-full">
            <div style="color: rgba(2,6,23,0.62); font-weight: 800; font-size: 13px;">
              Utile pour bloquer des indisponibilités (congés, arrêt, …) et éviter les assignations.
            </div>
          </div>
          <div>
            <label class="tp-label">Type</label>
            <select class="tp-select" name="kind">
              <option value="unavailable" ${kind === "unavailable" ? "selected" : ""}>Indisponible</option>
              <option value="vacation" ${kind === "vacation" ? "selected" : ""}>Congés</option>
              <option value="sick" ${kind === "sick" ? "selected" : ""}>Arrêt</option>
              <option value="other" ${kind === "other" ? "selected" : ""}>Autre</option>
            </select>
          </div>
          <div class="tp-full" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label class="tp-label">Début</label>
              <input class="tp-input" name="start_date" type="date" value="${escapeHTML(startYmd)}" />
            </div>
            <div>
              <label class="tp-label">Fin</label>
              <input class="tp-input" name="end_date" type="date" value="${escapeHTML(endYmd)}" />
            </div>
          </div>
          <div class="tp-full" style="display:flex; align-items:center; gap: 10px;">
            <input id="tpAllDay" name="all_day" type="checkbox" ${allDayDefault ? "checked" : ""} />
            <label for="tpAllDay" style="font-weight: 950; color: rgba(2,6,23,0.74);">Toute la journée</label>
          </div>
          <div class="tp-full" data-time-wrap style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label class="tp-label">Heure début</label>
              <input class="tp-input" name="start_time" type="time" value="${escapeHTML(startTime)}" />
            </div>
            <div>
              <label class="tp-label">Heure fin</label>
              <input class="tp-input" name="end_time" type="time" value="${escapeHTML(endTime)}" />
            </div>
          </div>
          <div class="tp-full" data-time-note style="display:none; color: rgba(2,6,23,0.62); font-weight: 850; font-size: 12px;"></div>
          <div class="tp-full">
            <label class="tp-label">Raison (optionnel)</label>
            <textarea class="tp-textarea" name="reason" placeholder="Ex: indisponible, congés, …">${escapeHTML(reason)}</textarea>
          </div>
        </form>
      `,
      footHtml: `
        <button type="button" class="tp-btn" data-action="cancel">${escapeHTML(STR.cancel)}</button>
        ${mode === "edit" ? `<button type="button" class="tp-btn" data-action="delete">${escapeHTML(STR.delete)}</button>` : ""}
        <button type="button" class="tp-btn tp-btn--primary" data-action="save">${escapeHTML(STR.save)}</button>
      `,
    });

    const form = els.modalBody.querySelector('[data-form="block"]');
    const timeWrap = els.modalBody.querySelector("[data-time-wrap]");
    const timeNote = els.modalBody.querySelector("[data-time-note]");

    function syncTimeVisibility() {
      const sd = String(form.start_date.value || "").trim();
      const ed = String(form.end_date.value || "").trim();
      const sameDay = sd && ed && sd === ed;
      const allDay = Boolean(form.all_day.checked);

      if (!sameDay && !allDay) form.all_day.checked = true;

      const showTimes = sameDay && !form.all_day.checked;
      timeWrap.style.display = showTimes ? "grid" : "none";

      if (!sameDay) {
        timeNote.style.display = "block";
        timeNote.textContent = "Sur plusieurs jours, le blocage est enregistré en 'toute la journée'.";
      } else {
        timeNote.style.display = "none";
        timeNote.textContent = "";
      }
    }

    syncTimeVisibility();
    form.start_date.addEventListener("change", syncTimeVisibility);
    form.end_date.addEventListener("change", syncTimeVisibility);
    form.all_day.addEventListener("change", syncTimeVisibility);

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    const delBtn = els.modalFoot.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        const ok = await deleteBlock(blockId);
        if (ok) closeModal(els);
      });
    }

    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const kindVal = String(form.kind.value || "unavailable");
      const sd = String(form.start_date.value || "").trim();
      const ed = String(form.end_date.value || "").trim();
      const allDay = Boolean(form.all_day.checked);
      const st = String(form.start_time?.value || "").trim();
      const et = String(form.end_time?.value || "").trim();
      const reasonVal = String(form.reason.value || "").trim() || null;

      if (!sd || !ed) {
        showBanner(els, "Dates incomplètes.", "err");
        return;
      }

      const startDate = parseYmdLocal(sd);
      const endDate = parseYmdLocal(ed);
      if (!startDate || !endDate) {
        showBanner(els, "Dates invalides.", "err");
        return;
      }

      const startKey = ymdLocal(startDate);
      const endKey = ymdLocal(endDate);
      const startY = startKey <= endKey ? startKey : endKey;
      const endY = startKey <= endKey ? endKey : startKey;

      let startsAt = null;
      let endsAt = null;

      if (allDay || startY !== endY) {
        const s0 = parseYmdLocal(startY);
        const e0 = parseYmdLocal(endY);
        if (!s0 || !e0) {
          showBanner(els, "Dates invalides.", "err");
          return;
        }
        startsAt = new Date(s0);
        endsAt = addDays(e0, 1);
      } else {
        if (!st || !et) {
          showBanner(els, "Heures incomplètes.", "err");
          return;
        }
        startsAt = new Date(`${startY}T${st}:00`);
        endsAt = new Date(`${endY}T${et}:00`);
      }

      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
        showBanner(els, "Plage horaire invalide.", "err");
        return;
      }

      showBanner(els, STR.loading, "");

      if (mode === "edit") {
        if (!blockId) {
          showBanner(els, STR.opError, "err");
          return;
        }
        const res = await supabase
          .from(CONFIG.AVAILABILITY_TABLE)
          .update({ kind: kindVal, starts_at: asIso(startsAt), ends_at: asIso(endsAt), reason: reasonVal })
          .eq("id", blockId);
        if (res.error) {
          showBanner(els, res.error.message || STR.opError, "err");
          return;
        }
      } else {
        const res = await supabase.from(CONFIG.AVAILABILITY_TABLE).insert({
          organization_id: state.orgId,
          user_id: state.userId,
          kind: kindVal,
          starts_at: asIso(startsAt),
          ends_at: asIso(endsAt),
          reason: reasonVal,
          created_by: state.userId,
        });
        if (res.error) {
          showBanner(els, res.error.message || STR.opError, "err");
          return;
        }
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
    if (!bid) return false;
    if (!confirm(STR.confirmDelete)) return false;
    showBanner(els, STR.loading, "");
    const res = await supabase.from(CONFIG.AVAILABILITY_TABLE).delete().eq("id", bid);
    if (res.error) {
      showBanner(els, res.error.message || STR.opError, "err");
      return false;
    }
    await loadBlocks();
    showBanner(els, STR.opSaved, "ok");
    render();
    setTimeout(() => showBanner(els, "", ""), 1200);
    return true;
  }

  log("mounted", state.userType);
});
