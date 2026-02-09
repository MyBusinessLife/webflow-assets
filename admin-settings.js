document.documentElement.setAttribute("data-page", "admin-settings");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminSettingsLoaded) return;
  window.__mblAdminSettingsLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[SETTINGS] Root introuvable. Ajoute <div data-mbl-settings></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[SETTINGS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[SETTINGS]", ...a);

  const CFG = window.__MBL_CFG__ || {};

  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  function sanitizePath(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (v.startsWith("/") && !v.startsWith("//")) return v;
    try {
      const u = new URL(v, location.origin);
      if (u.origin === location.origin) return u.pathname + u.search + u.hash;
    } catch (_) {}
    return "";
  }

  function sanitizeLoginPath(value) {
    const v = sanitizePath(value);
    if (!v) return "";
    return /\/login\/?$/.test(v) ? v : "";
  }

  function sanitizeSignupPath(value) {
    const v = sanitizePath(value);
    if (!v) return "";
    return /\/signup\/?$/.test(v) ? v : "";
  }

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`,
    SIGNUP_PATH: sanitizeSignupPath(CFG.SIGNUP_PATH) || `${APP_ROOT}/signup`,
    SUBSCRIBE_PATH: sanitizePath(CFG.SUBSCRIBE_PATH) || "/subscriptions",
    PROFILE_TABLE: "organization_profiles",
  };

  const STR = {
    title: "Settings",
    subtitle: "Paramètres de ton organisation et de la facturation",
    loadError: "Impossible de charger les paramètres.",
    loginRequired: "Connexion requise.",
    notAdmin: "Accès réservé aux administrateurs.",
    saving: "Enregistrement…",
    saved: "Paramètres enregistrés.",
    saveError: "Impossible d'enregistrer.",
    sectionOrg: "Entreprise",
    sectionBilling: "Facturation",
    sectionBranding: "Branding & interface",
    sectionSub: "Abonnement",
    sectionUsers: "Utilisateurs & accès",
    tabGeneral: "Paramètres",
    tabUsers: "Utilisateurs",
    usersEmpty: "Aucun utilisateur pour cette organisation.",
    usersEdit: "Accès",
    usersSave: "Enregistrer",
    usersClose: "Fermer",
    usersModeInherit: "Accès automatique (selon rôle)",
    usersModeCustom: "Accès personnalisé (cases à cocher)",
    inviteTitle: "Inviter un employe / sous-traitant",
    inviteEmail: "Email",
    inviteRole: "Role",
    inviteType: "Type utilisateur",
    inviteSend: "Envoyer l'invitation",
    invitePending: "Invitations en attente",
    inviteEmpty: "Aucune invitation en attente.",
    inviteLink: "Copier le lien",
    inviteRevoke: "Revoquer",
    inviteSent: "Invitation enregistree.",
    inviteRevoked: "Invitation revoquee.",
    inviteError: "Impossible de gerer l'invitation.",
    inviteSchemaMissing: "Migration 026 manquante: systeme d'invitations indisponible.",
    brandingSchemaMissing: "Migration 027 manquante: personnalisation visuelle indisponible.",
    save: "Enregistrer",
  };

  const BRAND_DEFAULTS = {
    theme_primary: "#0ea5e9",
    theme_secondary: "#0c4a6e",
    theme_surface: "#f6fbff",
    theme_text: "#020617",
    theme_nav_bg: "#f1f5f9",
  };

  function findRoot() {
    return (
      document.querySelector("[data-mbl-settings]") ||
      document.querySelector("#mbl-settings") ||
      document.querySelector(".mbl-settings") ||
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

    const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };

    return null;
  }

  function rgbToHex(rgb) {
    if (!rgb) return "";
    const toHex = (n) => clamp255(n).toString(16).padStart(2, "0");
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  function normalizeColor(value, fallback = "") {
    const v = String(value || "").trim();
    if (!v) return fallback || "";
    const rgb = parseColorToRgb(v);
    if (!rgb) return fallback || "";
    return rgbToHex(rgb);
  }

  function sanitizeLogoUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    try {
      const u = new URL(raw, location.origin);
      if (!["http:", "https:"].includes(u.protocol)) return null;
      return u.toString();
    } catch (_) {
      return null;
    }
  }

  function applyBrandingThemeVars(branding) {
    const primary = normalizeColor(branding?.theme_primary, BRAND_DEFAULTS.theme_primary);
    const secondary = normalizeColor(branding?.theme_secondary, BRAND_DEFAULTS.theme_secondary);
    const surface = normalizeColor(branding?.theme_surface, BRAND_DEFAULTS.theme_surface);
    const text = normalizeColor(branding?.theme_text, BRAND_DEFAULTS.theme_text);
    const navBg = normalizeColor(branding?.theme_nav_bg, BRAND_DEFAULTS.theme_nav_bg);
    const primaryRgb = parseColorToRgb(primary) || parseColorToRgb(BRAND_DEFAULTS.theme_primary);

    if (primary) document.documentElement.style.setProperty("--mbl-primary", primary);
    if (primaryRgb) document.documentElement.style.setProperty("--mbl-primary-rgb", `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
    if (secondary) document.documentElement.style.setProperty("--mbl-secondary", secondary);
    if (surface) document.documentElement.style.setProperty("--mbl-surface", surface);
    if (text) document.documentElement.style.setProperty("--mbl-text", text);
    if (navBg) document.documentElement.style.setProperty("--mbl-shell-bg-custom", navBg);
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
    if (document.getElementById("mbl-settings-style")) return;
    ensurePrimaryRgbCssVar();
    const st = document.createElement("style");
    st.id = "mbl-settings-style";
    st.textContent = `
      html[data-page="admin-settings"] {
        --set-text: rgba(2,6,23,0.90);
        --set-muted: rgba(2,6,23,0.62);
        --set-border: rgba(15,23,42,0.12);
        --set-card: rgba(255,255,255,0.86);
        --set-bg: #f6fbff;
        --set-shadow: 0 22px 60px rgba(2,6,23,0.10);
      }

      .mbl-settings {
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        background:
          radial-gradient(1000px 520px at 12% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.10), transparent 55%),
          radial-gradient(920px 520px at 92% 8%, rgba(2, 6, 23, 0.08), transparent 60%),
          var(--set-bg);
        box-shadow: var(--set-shadow);
        overflow: hidden;
        color: var(--set-text);
      }

      .mbl-settings__top {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.70));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .mbl-settings__title { margin: 0; font-size: 18px; font-weight: 950; }
      .mbl-settings__subtitle { margin: 4px 0 0; font-size: 13px; color: var(--set-muted); font-weight: 750; }

      .mbl-settings__tabs {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .set-tab {
        height: 36px;
        padding: 0 12px;
        border-radius: 10px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.86);
        color: rgba(2,6,23,0.82);
        font-weight: 900;
        cursor: pointer;
        transition: transform 160ms ease, border-color 180ms ease, box-shadow 180ms ease;
      }
      .set-tab:hover {
        transform: translateY(-1px);
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.30);
        box-shadow: 0 14px 28px rgba(2,6,23,0.10);
      }
      .set-tab.is-active {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.38);
        color: rgba(2,6,23,0.92);
        background: linear-gradient(
          180deg,
          rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14),
          rgba(255,255,255,0.94)
        );
        box-shadow: 0 14px 30px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }

      .set-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 42px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(var(--mbl-primary-rgb, 14, 165, 233),0.35);
        background: linear-gradient(180deg, rgba(var(--mbl-primary-rgb, 14, 165, 233),0.95), rgba(var(--mbl-primary-rgb, 14, 165, 233),0.72));
        color: #fff;
        font-weight: 950;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease;
      }
      .set-btn:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.18); }
      .set-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; }

      .mbl-settings__banner {
        display: none;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 800;
        font-size: 13px;
      }
      .mbl-settings__banner.is-ok { display:block; background:#ecfdf5; color:#065f46; }
      .mbl-settings__banner.is-err { display:block; background:#fef2f2; color:#991b1b; }

      .mbl-settings__body { padding: 14px; }
      .set-pane { display: block; }
      .set-pane[hidden] { display: none !important; }

      .set-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .set-card {
        border: 1px solid var(--set-border);
        background: var(--set-card);
        border-radius: 16px;
        overflow: hidden;
      }
      .set-card__head {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        background: rgba(255,255,255,0.85);
        font-weight: 950;
      }
      .set-card__body { padding: 14px; }

      .set-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .set-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
      .set-field.is-full { grid-column: 1 / -1; }
      .set-label { font-size: 12px; font-weight: 900; color: rgba(2,6,23,0.70); }
      .set-input, .set-textarea {
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.96);
        padding: 10px 12px;
        font-weight: 800;
        outline: none;
        color: rgba(2, 6, 23, 0.88);
      }
      .set-input { height: 42px; }
      .set-textarea { min-height: 92px; resize: vertical; }
      .set-input:focus, .set-textarea:focus {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.45);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }

      .set-kv {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px 12px;
        align-items: center;
        font-weight: 850;
        color: rgba(2,6,23,0.78);
      }
      .set-kv__k { color: rgba(2,6,23,0.60); font-weight: 850; }
      .set-kv__v { font-weight: 950; }
      .set-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 900;
        text-decoration: none;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      .set-link:hover { transform: translateY(-1px); border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.30); box-shadow: 0 16px 34px rgba(2,6,23,0.12); }

      .set-brand-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: 12px;
        align-items: start;
      }
      .set-brand-preview {
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 14px;
        overflow: hidden;
        background: rgba(255,255,255,0.94);
      }
      .set-brand-preview__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.9);
      }
      .set-brand-preview__title {
        margin: 0;
        font-size: 12px;
        font-weight: 900;
        color: rgba(2,6,23,0.72);
      }
      .set-brand-preview__logo {
        width: 30px;
        height: 30px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid rgba(15,23,42,0.12);
        display: grid;
        place-items: center;
        color: #fff;
        font-size: 11px;
        font-weight: 950;
        background: linear-gradient(
          180deg,
          rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.92),
          rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.72)
        );
      }
      .set-brand-preview__logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .set-brand-preview__body {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .set-brand-preview__menu {
        border-radius: 10px;
        border: 1px solid rgba(15,23,42,0.10);
        background: linear-gradient(
          180deg,
          rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.08),
          rgba(255,255,255,0.92)
        );
        padding: 8px;
        display: grid;
        gap: 7px;
      }
      .set-brand-preview__menu-item {
        border-radius: 8px;
        border: 1px solid rgba(15,23,42,0.10);
        background: #fff;
        color: rgba(2,6,23,0.82);
        font-size: 11px;
        font-weight: 900;
        padding: 7px 8px;
      }
      .set-brand-preview__menu-item.is-active {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.38);
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }
      .set-brand-preview__chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .set-brand-preview__chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 999px;
        font-size: 11px;
        font-weight: 900;
        color: rgba(2,6,23,0.74);
        background: rgba(255,255,255,0.92);
      }
      .set-brand-preview__chip-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        display: inline-block;
      }
      .set-color-input-wrap {
        display: grid;
        grid-template-columns: 48px 1fr;
        gap: 8px;
      }
      .set-color-picker {
        width: 48px;
        height: 42px;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: #fff;
        padding: 4px;
        cursor: pointer;
      }

      .set-users { display:flex; flex-direction: column; gap: 10px; }
      .set-users__group {
        display:flex;
        flex-direction: column;
        gap: 10px;
      }
      .set-users__title {
        font-weight: 950;
        color: rgba(2,6,23,0.78);
        font-size: 13px;
      }
      .set-invite {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.90);
        border-radius: 14px;
        padding: 12px 12px;
      }
      .set-inline-form {
        display:grid;
        grid-template-columns: 1.35fr 1fr 1fr auto;
        gap: 10px;
        align-items:end;
      }
      .set-btn--mini {
        height: 40px;
        padding: 0 12px;
        border-radius: 10px;
      }
      .set-inv-list { display:flex; flex-direction: column; gap: 10px; }
      .set-inv {
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.86);
        border-radius: 14px;
        padding: 12px 12px;
      }
      .set-inv__name { font-weight: 950; color: rgba(2,6,23,0.84); }
      .set-inv__meta { margin-top: 4px; color: rgba(2,6,23,0.62); font-weight: 800; font-size: 12px; }
      .set-inv__actions { display:flex; gap: 8px; flex-wrap: wrap; justify-content:flex-end; }
      .set-user {
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.86);
        border-radius: 14px;
        padding: 12px 12px;
      }
      .set-user__name { font-weight: 950; color: rgba(2,6,23,0.86); }
      .set-user__meta { margin-top: 4px; color: rgba(2,6,23,0.62); font-weight: 800; font-size: 12px; }
      .set-pills { display:flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .set-pill {
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.92);
        font-weight: 950;
        font-size: 12px;
        color: rgba(2,6,23,0.74);
        white-space: nowrap;
      }
      .set-pill .dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      .set-pill.is-ok .dot { background:#22c55e; }
      .set-pill.is-warn .dot { background:#f59e0b; }
      .set-pill.is-muted .dot { background:#94a3b8; }

      /* Modal (users) */
      .set-modal { position: fixed; inset: 0; z-index: 2147483646; display:none; }
      .set-modal.is-open { display:block; }
      .set-modal__backdrop { position:absolute; inset:0; background: rgba(2,6,23,0.55); backdrop-filter: blur(8px); }
      .set-modal__panel {
        position:absolute; left:50%; top: 6vh; transform: translateX(-50%);
        width: min(900px, calc(100% - 24px));
        max-height: 88vh;
        overflow:auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.96);
        box-shadow: 0 24px 80px rgba(0,0,0,0.22);
        padding: 14px;
      }
      .set-modal__head { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
      .set-modal__title { margin:0; font-size: 16px; font-weight: 1000; }
      .set-modal__foot { display:flex; justify-content:flex-end; gap: 10px; margin-top: 14px; }
      .set-checks {
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 14px;
        margin-top: 10px;
      }
      .set-check {
        display:flex;
        align-items:flex-start;
        gap: 10px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.70);
        border-radius: 14px;
        padding: 10px 10px;
      }
      .set-check input { margin-top: 3px; }
      .set-check__txt { font-weight: 900; color: rgba(2,6,23,0.84); }
      .set-check__hint { margin-top: 4px; font-weight: 800; font-size: 12px; color: rgba(2,6,23,0.62); }
      .set-check.is-disabled { opacity: 0.55; }

      @media (max-width: 860px) {
        .mbl-settings__top { align-items: flex-start; flex-direction: column; }
        .mbl-settings__tabs { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
        .set-tab { width: 100%; }
        .set-grid { grid-template-columns: 1fr; }
        .set-form { grid-template-columns: 1fr; }
        .set-brand-layout { grid-template-columns: 1fr; }
        .set-checks { grid-template-columns: 1fr; }
        .set-inline-form { grid-template-columns: 1fr; }
        .set-inv, .set-user { flex-direction: column; }
        .set-inv__actions { justify-content:flex-start; }
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

  async function resolveOrgMember(supabase, userId) {
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return null;
    return data?.[0] || null;
  }

  function showBanner(els, text, mode) {
    els.banner.className = "mbl-settings__banner";
    if (mode === "ok") els.banner.classList.add("is-ok");
    if (mode === "err") els.banner.classList.add("is-err");
    els.banner.textContent = text || "";
  }

  function numOrNull(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function centsOrNull(v) {
    const n = numOrNull(v);
    if (n === null) return null;
    return Math.round(n);
  }

  function renderShell() {
    root.classList.add("mbl-settings");
    root.innerHTML = `
      <div class="mbl-settings__top">
        <div>
          <h2 class="mbl-settings__title">${escapeHTML(STR.title)}</h2>
          <p class="mbl-settings__subtitle">${escapeHTML(STR.subtitle)}</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="mbl-settings__tabs" data-tabs>
            <button type="button" class="set-tab is-active" data-tab="general">${escapeHTML(STR.tabGeneral)}</button>
            <button type="button" class="set-tab" data-tab="users">${escapeHTML(STR.tabUsers)}</button>
          </div>
          <button type="button" class="set-btn" data-save>${escapeHTML(STR.save)}</button>
        </div>
      </div>
      <div class="mbl-settings__banner" data-banner></div>
      <div class="mbl-settings__body">
        <section class="set-pane" data-pane="general">
          <div class="set-grid">
            <section class="set-card">
              <div class="set-card__head">${escapeHTML(STR.sectionOrg)}</div>
              <div class="set-card__body">
                <div class="set-form" data-org-form></div>
              </div>
            </section>

            <section class="set-card">
              <div class="set-card__head">${escapeHTML(STR.sectionBilling)}</div>
              <div class="set-card__body">
                <div class="set-form" data-billing-form></div>
              </div>
            </section>

            <section class="set-card">
              <div class="set-card__head">${escapeHTML(STR.sectionBranding)}</div>
              <div class="set-card__body">
                <div class="set-brand-layout">
                  <div class="set-form" data-branding-form></div>
                  <div class="set-brand-preview" data-branding-preview></div>
                </div>
              </div>
            </section>

            <section class="set-card">
              <div class="set-card__head">${escapeHTML(STR.sectionSub)}</div>
              <div class="set-card__body">
                <div class="set-kv" data-sub-kv></div>
                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                  <a class="set-link" href="${escapeHTML(CONFIG.SUBSCRIBE_PATH)}">Gérer mon abonnement</a>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="set-pane" data-pane="users" hidden>
          <section class="set-card">
            <div class="set-card__head">${escapeHTML(STR.sectionUsers)}</div>
            <div class="set-card__body">
              <div class="set-users" data-users></div>
            </div>
          </section>
        </section>
      </div>

      <div class="set-modal" data-modal aria-hidden="true">
        <div class="set-modal__backdrop" data-modal-backdrop></div>
        <div class="set-modal__panel" role="dialog" aria-modal="true" aria-label="Accès utilisateur">
          <div class="set-modal__head">
            <h3 class="set-modal__title" data-modal-title></h3>
            <button type="button" class="set-link" data-modal-close>${escapeHTML(STR.usersClose)}</button>
          </div>
          <div data-modal-body></div>
          <div class="set-modal__foot" data-modal-foot></div>
        </div>
      </div>
    `;

    return {
      btnSave: root.querySelector("[data-save]"),
      tabs: Array.from(root.querySelectorAll("[data-tab]")),
      banner: root.querySelector("[data-banner]"),
      orgForm: root.querySelector("[data-org-form]"),
      billingForm: root.querySelector("[data-billing-form]"),
      brandingForm: root.querySelector("[data-branding-form]"),
      brandingPreview: root.querySelector("[data-branding-preview]"),
      subKv: root.querySelector("[data-sub-kv]"),
      users: root.querySelector("[data-users]"),
      paneGeneral: root.querySelector('[data-pane="general"]'),
      paneUsers: root.querySelector('[data-pane="users"]'),
      modal: root.querySelector("[data-modal]"),
      modalBackdrop: root.querySelector("[data-modal-backdrop]"),
      modalClose: root.querySelector("[data-modal-close]"),
      modalTitle: root.querySelector("[data-modal-title]"),
      modalBody: root.querySelector("[data-modal-body]"),
      modalFoot: root.querySelector("[data-modal-foot]"),
    };
  }

  function fieldHtml({ key, label, value, type = "text", full = false, placeholder = "" }) {
    const cls = full ? "set-field is-full" : "set-field";
    return `
      <div class="${cls}">
        <div class="set-label">${escapeHTML(label)}</div>
        <input class="set-input" data-k="${escapeHTML(key)}" type="${escapeHTML(type)}" value="${escapeHTML(
          value ?? ""
        )}" placeholder="${escapeHTML(placeholder)}"/>
      </div>
    `;
  }

  function textareaHtml({ key, label, value, placeholder = "" }) {
    return `
      <div class="set-field is-full">
        <div class="set-label">${escapeHTML(label)}</div>
        <textarea class="set-textarea" data-k="${escapeHTML(key)}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(
          value ?? ""
        )}</textarea>
      </div>
    `;
  }

  function colorFieldHtml({ key, label, value, full = false }) {
    const normalized = normalizeColor(value, BRAND_DEFAULTS[key] || BRAND_DEFAULTS.theme_primary);
    const cls = full ? "set-field is-full" : "set-field";
    return `
      <label class="${cls}">
        <div class="set-label">${escapeHTML(label)}</div>
        <div class="set-color-input-wrap">
          <input class="set-color-picker" type="color" data-color-k="${escapeHTML(key)}" value="${escapeHTML(normalized)}" />
          <input class="set-input" data-k="${escapeHTML(key)}" value="${escapeHTML(normalized)}" placeholder="#000000" />
        </div>
      </label>
    `;
  }

  function kvHtml(k, v) {
    return `<div class="set-kv__k">${escapeHTML(k)}</div><div class="set-kv__v">${escapeHTML(v)}</div>`;
  }

  function getFormValue(container, key) {
    const el = container.querySelector(`[data-k="${CSS.escape(String(key))}"]`);
    if (!el) return "";
    return String(el.value ?? "").trim();
  }

  function pickInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const a = parts[0]?.[0] || "M";
    const b = parts[1]?.[0] || parts[0]?.[1] || "B";
    return (a + b).toUpperCase();
  }

  function readBrandingFormValues(els) {
    return {
      brand_logo_url: getFormValue(els.brandingForm, "brand_logo_url"),
      theme_primary: getFormValue(els.brandingForm, "theme_primary") || BRAND_DEFAULTS.theme_primary,
      theme_secondary: getFormValue(els.brandingForm, "theme_secondary") || BRAND_DEFAULTS.theme_secondary,
      theme_surface: getFormValue(els.brandingForm, "theme_surface") || BRAND_DEFAULTS.theme_surface,
      theme_text: getFormValue(els.brandingForm, "theme_text") || BRAND_DEFAULTS.theme_text,
      theme_nav_bg: getFormValue(els.brandingForm, "theme_nav_bg") || BRAND_DEFAULTS.theme_nav_bg,
    };
  }

  function renderBrandingPreview(els, profile) {
    if (!els?.brandingPreview) return;
    const values = readBrandingFormValues(els);
    const orgName =
      String(getFormValue(els.orgForm, "trade_name") || getFormValue(els.orgForm, "legal_name") || profile?.trade_name || profile?.legal_name || "")
        .trim() || "Mon organisation";

    const primary = normalizeColor(values.theme_primary, BRAND_DEFAULTS.theme_primary);
    const secondary = normalizeColor(values.theme_secondary, BRAND_DEFAULTS.theme_secondary);
    const surface = normalizeColor(values.theme_surface, BRAND_DEFAULTS.theme_surface);
    const text = normalizeColor(values.theme_text, BRAND_DEFAULTS.theme_text);
    const navBg = normalizeColor(values.theme_nav_bg, BRAND_DEFAULTS.theme_nav_bg);
    const rgb = parseColorToRgb(primary) || parseColorToRgb(BRAND_DEFAULTS.theme_primary);
    const primaryRgbCss = rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : "14, 165, 233";
    const logoUrl = sanitizeLogoUrl(values.brand_logo_url);
    const initials = pickInitials(orgName);

    applyBrandingThemeVars(values);

    const logoInner = logoUrl
      ? `<img src="${escapeHTML(logoUrl)}" alt="Logo" loading="lazy" />`
      : `<span>${escapeHTML(initials)}</span>`;

    els.brandingPreview.innerHTML = `
      <div class="set-brand-preview__head" style="background:${escapeHTML(surface)};">
        <p class="set-brand-preview__title">Aperçu menu & widgets</p>
        <div class="set-brand-preview__logo" style="--mbl-primary-rgb:${escapeHTML(primaryRgbCss)}; background:linear-gradient(180deg, ${escapeHTML(primary)}, ${escapeHTML(secondary)});">
          ${logoInner}
        </div>
      </div>
      <div class="set-brand-preview__body" style="background:${escapeHTML(navBg)}; color:${escapeHTML(text)};">
        <div class="set-brand-preview__menu" style="--mbl-primary-rgb:${escapeHTML(primaryRgbCss)};">
          <div class="set-brand-preview__menu-item is-active">${escapeHTML(orgName)}</div>
          <div class="set-brand-preview__menu-item">Facturation</div>
          <div class="set-brand-preview__menu-item">Interventions</div>
        </div>
        <div class="set-brand-preview__chips">
          <span class="set-brand-preview__chip"><span class="set-brand-preview__chip-dot" style="background:${escapeHTML(primary)};"></span>Primaire</span>
          <span class="set-brand-preview__chip"><span class="set-brand-preview__chip-dot" style="background:${escapeHTML(secondary)};"></span>Secondaire</span>
          <span class="set-brand-preview__chip"><span class="set-brand-preview__chip-dot" style="background:${escapeHTML(surface)}; border:1px solid rgba(15,23,42,.18);"></span>Surface</span>
        </div>
      </div>
    `;
  }

  function wireBrandingControls(els, profile) {
    if (!els?.brandingForm) return;

    const syncTextFromPicker = (key) => {
      const picker = els.brandingForm.querySelector(`[data-color-k="${CSS.escape(String(key))}"]`);
      const input = els.brandingForm.querySelector(`[data-k="${CSS.escape(String(key))}"]`);
      if (!picker || !input) return;
      input.value = normalizeColor(picker.value, BRAND_DEFAULTS[key] || BRAND_DEFAULTS.theme_primary);
      renderBrandingPreview(els, profile);
    };

    const syncPickerFromText = (key) => {
      const picker = els.brandingForm.querySelector(`[data-color-k="${CSS.escape(String(key))}"]`);
      const input = els.brandingForm.querySelector(`[data-k="${CSS.escape(String(key))}"]`);
      if (!picker || !input) return;
      const next = normalizeColor(input.value, "");
      if (next) {
        picker.value = next;
        input.value = next;
      }
      renderBrandingPreview(els, profile);
    };

    ["theme_primary", "theme_secondary", "theme_surface", "theme_text", "theme_nav_bg"].forEach((key) => {
      const picker = els.brandingForm.querySelector(`[data-color-k="${CSS.escape(String(key))}"]`);
      const input = els.brandingForm.querySelector(`[data-k="${CSS.escape(String(key))}"]`);
      picker?.addEventListener("input", () => syncTextFromPicker(key));
      input?.addEventListener("input", () => syncPickerFromText(key));
    });

    const logoInput = els.brandingForm.querySelector('[data-k="brand_logo_url"]');
    logoInput?.addEventListener("input", () => renderBrandingPreview(els, profile));
  }

  function setActiveTab(els, tab) {
    const next = String(tab || "").trim().toLowerCase() === "users" ? "users" : "general";
    const isUsers = next === "users";
    if (els?.paneGeneral) els.paneGeneral.hidden = isUsers;
    if (els?.paneUsers) els.paneUsers.hidden = !isUsers;
    if (els?.btnSave) els.btnSave.style.display = isUsers ? "none" : "";
    if (Array.isArray(els?.tabs)) {
      els.tabs.forEach((btn) => {
        const key = String(btn.getAttribute("data-tab") || "").trim().toLowerCase();
        btn.classList.toggle("is-active", key === next);
      });
    }
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isEmailValid(value) {
    const v = normalizeEmail(value);
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function formatDateTimeFR(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function inviteLinkForToken(token) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return "";
    const signupPath = String(CONFIG.SIGNUP_PATH || "").trim() || "/applications/signup";
    const base = new URL(signupPath, location.origin);
    base.searchParams.set("invite", safeToken);
    return base.toString();
  }

  function isMissingColumnError(err) {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("column") || msg.includes("missing");
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

  function modulesAllow(mods, required, requiredAny) {
    const req = Array.isArray(required) ? required.filter(Boolean) : [];
    const any = Array.isArray(requiredAny) ? requiredAny.filter(Boolean) : [];
    const allOk = !req.length || req.every((m) => Boolean(mods?.[m]));
    const anyOk = !any.length || any.some((m) => Boolean(mods?.[m]));
    return allOk && anyOk;
  }

  const PERM_ITEMS = [
    { group: "Général", key: "admin_dashboard", label: "Dashboard", requires: [] },
    { group: "Général", key: "settings", label: "Paramètres", requires: [] },
    { group: "CRM", key: "crm", label: "CRM", requires: ["billing"] },

    { group: "Facturation", key: "billing_clients", label: "Clients", requires: ["billing"] },
    { group: "Facturation", key: "billing_quotes", label: "Devis", requires: ["billing"] },
    { group: "Facturation", key: "billing_invoices", label: "Factures", requires: ["billing"] },
    { group: "Facturation", key: "billing_payments", label: "Paiements", requires: ["billing"] },

    { group: "Stock", key: "inventory_products", label: "Produits", requires: ["billing"] },
    { group: "Stock", key: "inventory_categories", label: "Catégories", requires: ["billing"] },

    { group: "Restauration", key: "restaurant_admin", label: "Gestion restaurant", requires: ["restaurant"] },
    { group: "Restauration", key: "pos", label: "POS", requiresAny: ["billing", "restaurant"] },

    { group: "Interventions", key: "interventions_admin", label: "Gestion interventions", requires: ["interventions"] },
    { group: "Interventions", key: "interventions_tech", label: "Espace technicien", requires: ["interventions"] },

    { group: "Transport", key: "fleet", label: "Véhicules / Chauffeurs", requires: ["fleet"] },
    { group: "Transport", key: "transport_driver", label: "Espace chauffeur", requires: ["transport"] },

    { group: "Logistique", key: "logistics", label: "Logistique", requires: ["logistics"] },
  ];

  function groupBy(items, keyFn) {
    const map = new Map();
    items.forEach((it) => {
      const k = String(keyFn(it) || "");
      const arr = map.get(k) || [];
      arr.push(it);
      map.set(k, arr);
    });
    return map;
  }

  function pickDisplayName(profile, userId) {
    const fn = String(profile?.first_name || "").trim();
    const ln = String(profile?.last_name || "").trim();
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    if (full) return full;
    const email = String(profile?.email || "").trim();
    if (email) return email;
    const id = String(userId || "").trim();
    return id ? id.slice(0, 8) + "…" : "Utilisateur";
  }

  function cleanRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return r || "viewer";
  }

  function cleanMode(mode) {
    const m = String(mode || "").trim().toLowerCase();
    return m === "custom" ? "custom" : "inherit";
  }

  async function loadOrgMembers(supabase, orgId) {
    const baseSel = "id, user_id, role, is_active, created_at";
    const fullSel = baseSel + ", permissions_mode, permissions";
    let res = await supabase
      .from("organization_members")
      .select(fullSel)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from("organization_members")
        .select(baseSel)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .limit(2000);
    }

    if (res.error) throw res.error;
    return res.data || [];
  }

  async function loadProfilesById(supabase, userIds) {
    const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
    if (!ids.length) return new Map();
    const res = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, user_type")
      .in("id", ids)
      .limit(2000);
    if (res.error) return new Map();
    return new Map((res.data || []).map((p) => [String(p.id), p]));
  }

  async function loadOrgInvites(supabase, orgId) {
    const res = await supabase
      .from("organization_invitations")
      .select("id, organization_id, email, role, user_type, permissions_mode, status, token, invited_at, expires_at, accepted_at, revoked_at")
      .eq("organization_id", orgId)
      .order("invited_at", { ascending: false })
      .limit(400);

    if (res.error) {
      if (isMissingColumnError(res.error) || String(res.error.message || "").toLowerCase().includes("relation")) {
        return { available: false, rows: [] };
      }
      throw res.error;
    }
    return { available: true, rows: res.data || [] };
  }

  async function refreshUsers(ctx, els) {
    if (!ctx?.supabase || !ctx?.orgId) return;
    const [members, invitesPack] = await Promise.all([
      loadOrgMembers(ctx.supabase, ctx.orgId),
      loadOrgInvites(ctx.supabase, ctx.orgId),
    ]);
    const profilesById = await loadProfilesById(ctx.supabase, members.map((m) => m.user_id));
    ctx.members = members;
    ctx.profilesById = profilesById;
    ctx.invitesAvailable = Boolean(invitesPack?.available);
    ctx.invites = invitesPack?.rows || [];
    renderUsersList(els, {
      members,
      profilesById,
      modules: ctx.modules,
      invites: ctx.invites,
      invitesAvailable: ctx.invitesAvailable,
      ctx,
    });
  }

  function renderUsersList(els, { members, profilesById, modules, invites, invitesAvailable, ctx }) {
    const pendingInvites = (invites || []).filter((i) => String(i.status || "") === "pending");

    const roleOptions = ["viewer", "tech", "driver", "manager", "admin"]
      .map((r) => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`)
      .join("");

    const pendingHtml = invitesAvailable
      ? pendingInvites.length
        ? pendingInvites
            .map((inv) => {
              const email = String(inv.email || "").trim();
              const role = cleanRole(inv.role);
              const userType = String(inv.user_type || "internal").trim().toLowerCase() || "internal";
              const invitedAt = formatDateTimeFR(inv.invited_at);
              const expiresAt = formatDateTimeFR(inv.expires_at);
              return `
                <div class="set-inv" data-invite-id="${escapeHTML(inv.id)}">
                  <div style="min-width:0;">
                    <div class="set-inv__name">${escapeHTML(email || "Invitation")}</div>
                    <div class="set-inv__meta">${escapeHTML(`Rôle: ${role} • Type: ${userType}`)}</div>
                    <div class="set-inv__meta">${escapeHTML(`Envoyée: ${invitedAt} • Expire: ${expiresAt}`)}</div>
                  </div>
                  <div class="set-inv__actions">
                    <button type="button" class="set-link" data-action="copy-invite">${escapeHTML(STR.inviteLink)}</button>
                    <button type="button" class="set-link" data-action="revoke-invite">${escapeHTML(STR.inviteRevoke)}</button>
                  </div>
                </div>
              `;
            })
            .join("")
        : `<div class="set-inv"><div class="set-inv__name">${escapeHTML(STR.inviteEmpty)}</div></div>`
      : `<div class="set-inv"><div class="set-inv__name">${escapeHTML(STR.inviteSchemaMissing)}</div></div>`;

    const membersHtml = members.length
      ? members
          .map((m) => {
            const prof = profilesById.get(String(m.user_id)) || null;
            const name = pickDisplayName(prof, m.user_id);
            const email = String(prof?.email || "").trim();
            const userType = String(prof?.user_type || "").trim().toLowerCase() || "—";
            const role = cleanRole(m.role);
            const mode = cleanMode(m.permissions_mode);
            const active = m.is_active !== false;

            const pills = [
              `<span class="set-pill ${active ? "is-ok" : "is-muted"}"><span class="dot"></span>${escapeHTML(
                active ? "Actif" : "Inactif"
              )}</span>`,
              `<span class="set-pill"><span class="dot"></span>${escapeHTML("Rôle: " + role)}</span>`,
              `<span class="set-pill ${mode === "custom" ? "is-warn" : ""}"><span class="dot"></span>${escapeHTML(
                mode === "custom" ? "Accès: personnalisé" : "Accès: auto"
              )}</span>`,
              `<span class="set-pill"><span class="dot"></span>${escapeHTML("Type: " + userType)}</span>`,
            ];

            const metaBits = [];
            if (email) metaBits.push(email);
            if (String(m.user_id || "").trim()) metaBits.push(String(m.user_id).slice(0, 8) + "…");
            return `
              <div class="set-user" data-member-id="${escapeHTML(m.id)}">
                <div style="min-width:0;">
                  <div class="set-user__name">${escapeHTML(name)}</div>
                  <div class="set-user__meta">${escapeHTML(metaBits.join(" • ") || "—")}</div>
                  <div class="set-pills">${pills.join("")}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
                  <button type="button" class="set-link" data-action="edit-user">${escapeHTML(STR.usersEdit)}</button>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="set-user"><div><div class="set-user__name">${escapeHTML(STR.usersEmpty)}</div></div></div>`;

    els.users.innerHTML = `
      <div class="set-users__group">
        <div class="set-users__title">${escapeHTML(STR.inviteTitle)}</div>
        <div class="set-invite">
          <form class="set-inline-form" data-invite-form>
            <label class="set-field">
              <div class="set-label">${escapeHTML(STR.inviteEmail)}</div>
              <input class="set-input" name="email" type="email" placeholder="prenom.nom@entreprise.fr" />
            </label>
            <label class="set-field">
              <div class="set-label">${escapeHTML(STR.inviteRole)}</div>
              <select class="set-input" name="role">${roleOptions}</select>
            </label>
            <label class="set-field">
              <div class="set-label">${escapeHTML(STR.inviteType)}</div>
              <select class="set-input" name="user_type">
                <option value="internal">internal</option>
                <option value="external">external</option>
              </select>
            </label>
            <button type="submit" class="set-btn set-btn--mini" ${invitesAvailable ? "" : "disabled"}>${escapeHTML(
          STR.inviteSend
        )}</button>
          </form>
        </div>
      </div>

      <div class="set-users__group">
        <div class="set-users__title">${escapeHTML(STR.invitePending)}</div>
        <div class="set-inv-list">${pendingHtml}</div>
      </div>

      <div class="set-users__group">
        <div class="set-users__title">Comptes de l'organisation</div>
        <div class="set-users__members">${membersHtml}</div>
      </div>
    `;

    els.users.querySelectorAll('[data-action="edit-user"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest("[data-member-id]");
        if (!card) return;
        const memberId = String(card.getAttribute("data-member-id") || "");
        const member = members.find((x) => String(x.id) === memberId) || null;
        if (!member) return;
        const prof = profilesById.get(String(member.user_id)) || null;
        openUserModal(els, { member, profile: prof, modules, ctx });
      });
    });

    const inviteForm = els.users.querySelector("[data-invite-form]");
    if (inviteForm) {
      inviteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!ctx?.supabase || !ctx?.orgId || !invitesAvailable) return;

        const emailInput = inviteForm.querySelector('[name="email"]');
        const roleInput = inviteForm.querySelector('[name="role"]');
        const typeInput = inviteForm.querySelector('[name="user_type"]');

        const email = normalizeEmail(emailInput?.value || "");
        const role = cleanRole(roleInput?.value || "viewer");
        const userType = String(typeInput?.value || "internal").trim().toLowerCase() === "external" ? "external" : "internal";
        if (!isEmailValid(email)) {
          showBanner(els, "Email invalide.", "err");
          return;
        }

        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        showBanner(els, STR.saving, "");
        try {
          const findRes = await ctx.supabase
            .from("organization_invitations")
            .select("id")
            .eq("organization_id", ctx.orgId)
            .eq("status", "pending")
            .ilike("email", email)
            .limit(1)
            .maybeSingle();
          if (findRes.error) throw findRes.error;

          if (findRes.data?.id) {
            const upd = await ctx.supabase
              .from("organization_invitations")
              .update({
                role,
                user_type: userType,
                permissions_mode: "inherit",
                permissions: {},
                expires_at: expiresAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", findRes.data.id);
            if (upd.error) throw upd.error;
          } else {
            const ins = await ctx.supabase.from("organization_invitations").insert({
              organization_id: ctx.orgId,
              email,
              role,
              user_type: userType,
              permissions_mode: "inherit",
              permissions: {},
              status: "pending",
              invited_by: ctx.userId || null,
              invited_at: new Date().toISOString(),
              expires_at: expiresAt,
            });
            if (ins.error) throw ins.error;
          }

          inviteForm.reset();
          if (roleInput) roleInput.value = "viewer";
          if (typeInput) typeInput.value = "internal";
          await refreshUsers(ctx, els);
          showBanner(els, STR.inviteSent, "ok");
          setTimeout(() => showBanner(els, "", ""), 1400);
        } catch (err) {
          warn("invite failed", err);
          showBanner(els, err?.message || STR.inviteError, "err");
        }
      });
    }

    els.users.querySelectorAll('[data-action="copy-invite"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const card = e.target.closest("[data-invite-id]");
        if (!card) return;
        const id = String(card.getAttribute("data-invite-id") || "");
        const invite = pendingInvites.find((x) => String(x.id) === id);
        if (!invite) return;
        const link = inviteLinkForToken(invite.token);
        if (!link) return;
        try {
          await navigator.clipboard.writeText(link);
          showBanner(els, "Lien d'invitation copié.", "ok");
        } catch (_) {
          showBanner(els, link, "ok");
        }
        setTimeout(() => showBanner(els, "", ""), 1800);
      });
    });

    els.users.querySelectorAll('[data-action="revoke-invite"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const card = e.target.closest("[data-invite-id]");
        if (!card || !ctx?.supabase) return;
        const id = String(card.getAttribute("data-invite-id") || "");
        if (!id) return;
        showBanner(els, STR.saving, "");
        try {
          const res = await ctx.supabase
            .from("organization_invitations")
            .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("status", "pending");
          if (res.error) throw res.error;
          await refreshUsers(ctx, els);
          showBanner(els, STR.inviteRevoked, "ok");
          setTimeout(() => showBanner(els, "", ""), 1400);
        } catch (err) {
          warn("revoke invite failed", err);
          showBanner(els, err?.message || STR.inviteError, "err");
        }
      });
    });
  }

  function openUserModal(els, { member, profile, modules, ctx }) {
    const name = pickDisplayName(profile, member.user_id);
    const role = cleanRole(member.role);
    const mode = cleanMode(member.permissions_mode);
    const perms = member.permissions && typeof member.permissions === "object" ? member.permissions : {};
    const active = member.is_active !== false;

    const roleOptions = ["owner", "admin", "manager", "tech", "driver", "viewer"]
      .map((r) => `<option value="${escapeHTML(r)}"${r === role ? " selected" : ""}>${escapeHTML(r)}</option>`)
      .join("");

    const grouped = groupBy(PERM_ITEMS, (x) => x.group);
    const blocks = Array.from(grouped.entries())
      .map(([group, items]) => {
        const checks = items
          .map((it) => {
            const enabledBySub = modulesAllow(modules, it.requires, it.requiresAny);
            const checked = perms?.[it.key] === true;
            const disabled = !enabledBySub;
            const hint = disabled ? "Abonnement requis" : it.requires?.length ? `Nécessite: ${it.requires.join(", ")}` : "";
            const cls = disabled ? "set-check is-disabled" : "set-check";
            return `
              <label class="${cls}">
                <input type="checkbox" data-perm="${escapeHTML(it.key)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""} />
                <div>
                  <div class="set-check__txt">${escapeHTML(it.label)}</div>
                  ${hint ? `<div class="set-check__hint">${escapeHTML(hint)}</div>` : ""}
                </div>
              </label>
            `;
          })
          .join("");
        return `
          <div class="set-card" style="margin-top:12px;">
            <div class="set-card__head">${escapeHTML(group)}</div>
            <div class="set-card__body">
              <div class="set-checks">${checks}</div>
            </div>
          </div>
        `;
      })
      .join("");

    openModal(els, {
      title: `Accès utilisateur • ${name}`,
      bodyHtml: `
        <form class="set-form" data-user-form>
          <div class="set-field">
            <div class="set-label">Rôle</div>
            <select class="set-input" name="role">${roleOptions}</select>
          </div>
          <div class="set-field">
            <div class="set-label">Statut</div>
            <label style="display:flex; align-items:center; gap:10px; font-weight: 900; color: rgba(2,6,23,0.78);">
              <input type="checkbox" name="is_active" ${active ? "checked" : ""} />
              Actif
            </label>
          </div>
          <div class="set-field is-full">
            <div class="set-label">Mode d'accès</div>
            <select class="set-input" name="permissions_mode">
              <option value="inherit"${mode === "inherit" ? " selected" : ""}>${escapeHTML(STR.usersModeInherit)}</option>
              <option value="custom"${mode === "custom" ? " selected" : ""}>${escapeHTML(STR.usersModeCustom)}</option>
            </select>
          </div>
        </form>
        <div data-perms-wrap ${mode === "custom" ? "" : 'style="display:none"'}>${blocks}</div>
      `,
      footHtml: `
        <button type="button" class="set-link" data-action="cancel">${escapeHTML(STR.usersClose)}</button>
        <button type="button" class="set-btn" data-action="save">${escapeHTML(STR.usersSave)}</button>
      `,
    });

    const permsWrap = els.modalBody.querySelector("[data-perms-wrap]");
    const form = els.modalBody.querySelector("[data-user-form]");
    form.permissions_mode.addEventListener("change", () => {
      const v = String(form.permissions_mode.value || "inherit");
      if (permsWrap) permsWrap.style.display = v === "custom" ? "" : "none";
    });

    els.modalFoot.querySelector('[data-action="cancel"]').addEventListener("click", () => closeModal(els));
    els.modalFoot.querySelector('[data-action="save"]').addEventListener("click", async () => {
      if (!ctx?.supabase) return;
      const nextRole = String(form.role.value || "").trim().toLowerCase() || "viewer";
      const nextActive = Boolean(form.is_active.checked);
      const nextMode = cleanMode(form.permissions_mode.value);

      const nextPerms = {};
      if (nextMode === "custom" && permsWrap) {
        permsWrap.querySelectorAll("input[type='checkbox'][data-perm]").forEach((cb) => {
          if (cb.disabled) return;
          if (cb.checked) nextPerms[String(cb.getAttribute("data-perm") || "")] = true;
        });
      }

      showBanner(els, STR.saving, "");
      try {
        const payload = {
          role: nextRole,
          is_active: nextActive,
          permissions_mode: nextMode,
          permissions: nextPerms,
          updated_at: new Date().toISOString(),
        };
        const res = await ctx.supabase.from("organization_members").update(payload).eq("id", member.id);
        if (res.error) throw res.error;

        closeModal(els);
        await refreshUsers(ctx, els);
        showBanner(els, "Accès utilisateur mis à jour.", "ok");
        setTimeout(() => showBanner(els, "", ""), 1400);
      } catch (e) {
        warn("user update failed", e);
        showBanner(els, e?.message || STR.saveError, "err");
      }
    });
  }

  // ===== boot =====
  injectStyles();
  const els = renderShell();
  const initialTab = String(url.searchParams.get("tab") || "").trim().toLowerCase() === "users" ? "users" : "general";
  setActiveTab(els, initialTab);
  els.tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = String(btn.getAttribute("data-tab") || "").trim().toLowerCase();
      setActiveTab(els, tab);
      try {
        const u = new URL(location.href);
        if (tab === "users") u.searchParams.set("tab", "users");
        else u.searchParams.delete("tab");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (_) {}
    });
  });
  const ctx = {
    supabase: null,
    userId: "",
    orgId: "",
    modules: {},
    members: [],
    invites: [],
    invitesAvailable: false,
    profilesById: new Map(),
  };

  els.modalBackdrop.addEventListener("click", () => closeModal(els));
  els.modalClose.addEventListener("click", () => closeModal(els));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (els.modal.classList.contains("is-open")) closeModal(els);
  });

  try {
    const supabase = await getSupabase();
    const user = await getCurrentUser(supabase);
    if (!user) {
      showBanner(els, STR.loginRequired, "err");
      return;
    }

    const member = await resolveOrgMember(supabase, user.id);
    const orgId = String(member?.organization_id || "").trim();
    const orgRole = String(member?.role || "").trim().toLowerCase();
    const isAdmin = ["owner", "admin", "manager"].includes(orgRole);
    if (!orgId) {
      showBanner(els, STR.loadError, "err");
      return;
    }
    if (!isAdmin) {
      showBanner(els, STR.notAdmin, "err");
      return;
    }

    const [profileRes, subRes, entRes] = await Promise.all([
      supabase.from(CONFIG.PROFILE_TABLE).select("*").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("organization_subscriptions")
        .select("status, starts_at, ends_at, trial_ends_at, plan:plan_id(code, name)")
        .eq("organization_id", orgId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("organization_entitlements").select("modules, limits").eq("organization_id", orgId).maybeSingle(),
    ]);

    if (profileRes.error) throw profileRes.error;

    const p = profileRes.data || { organization_id: orgId };
    const sub = subRes?.data || null;
    const planName = String(sub?.plan?.name || "").trim() || "—";
    const status = String(sub?.status || "").trim() || "—";
    const modules = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
    const limits = entRes?.data?.limits && typeof entRes.data.limits === "object" ? entRes.data.limits : {};
    const maxUsers = limits?.max_users != null ? String(limits.max_users) : "—";

    ctx.supabase = supabase;
    ctx.userId = String(user.id || "");
    ctx.orgId = orgId;
    ctx.modules = modules;

    // Org form
    els.orgForm.innerHTML =
      fieldHtml({ key: "trade_name", label: "Nom commercial", value: p.trade_name, full: true, placeholder: "Ex: My Business Life" }) +
      fieldHtml({ key: "legal_name", label: "Raison sociale", value: p.legal_name, full: true }) +
      fieldHtml({ key: "legal_form", label: "Forme juridique", value: p.legal_form, placeholder: "Ex: SARL" }) +
      fieldHtml({ key: "share_capital_cents", label: "Capital social (centimes)", value: p.share_capital_cents, type: "number" }) +
      fieldHtml({ key: "siret", label: "SIRET", value: p.siret }) +
      fieldHtml({ key: "vat_number", label: "TVA intracom", value: p.vat_number }) +
      fieldHtml({ key: "rcs_city", label: "RCS (ville)", value: p.rcs_city }) +
      fieldHtml({ key: "rcs_number", label: "RCS (numéro)", value: p.rcs_number }) +
      fieldHtml({ key: "naf_code", label: "Code NAF", value: p.naf_code }) +
      fieldHtml({ key: "email", label: "Email", value: p.email }) +
      fieldHtml({ key: "phone", label: "Téléphone", value: p.phone }) +
      fieldHtml({ key: "address", label: "Adresse", value: p.address, full: true }) +
      fieldHtml({ key: "postal_code", label: "Code postal", value: p.postal_code }) +
      fieldHtml({ key: "city", label: "Ville", value: p.city }) +
      fieldHtml({ key: "country", label: "Pays", value: p.country });

    // Billing form
    els.billingForm.innerHTML =
      fieldHtml({ key: "invoice_prefix", label: "Préfixe facture", value: p.invoice_prefix }) +
      fieldHtml({ key: "invoice_padding", label: "Padding facture", value: p.invoice_padding, type: "number" }) +
      fieldHtml({ key: "quote_prefix", label: "Préfixe devis", value: p.quote_prefix }) +
      fieldHtml({ key: "quote_padding", label: "Padding devis", value: p.quote_padding, type: "number" }) +
      fieldHtml({ key: "payment_terms_days", label: "Délais de paiement (jours)", value: p.payment_terms_days, type: "number" }) +
      fieldHtml({ key: "late_fee_rate", label: "Taux pénalité retard (%)", value: p.late_fee_rate, type: "number" }) +
      fieldHtml({ key: "recovery_fee_cents", label: "Indemnité recouvrement (centimes)", value: p.recovery_fee_cents, type: "number" }) +
      fieldHtml({
        key: "vat_exemption_text",
        label: "Mention TVA (optionnel)",
        value: p.vat_exemption_text,
        full: true,
        placeholder: "Ex: TVA non applicable, art. 293 B du CGI",
      }) +
      textareaHtml({ key: "footer_notes", label: "Notes bas de page (optionnel)", value: p.footer_notes });

    // Branding form
    els.brandingForm.innerHTML =
      fieldHtml({
        key: "brand_logo_url",
        label: "Logo (URL)",
        value: p.brand_logo_url,
        full: true,
        placeholder: "https://.../logo.png",
      }) +
      colorFieldHtml({ key: "theme_primary", label: "Couleur principale", value: p.theme_primary }) +
      colorFieldHtml({ key: "theme_secondary", label: "Couleur secondaire", value: p.theme_secondary }) +
      colorFieldHtml({ key: "theme_surface", label: "Couleur surface", value: p.theme_surface }) +
      colorFieldHtml({ key: "theme_text", label: "Couleur texte", value: p.theme_text }) +
      colorFieldHtml({ key: "theme_nav_bg", label: "Fond menu lateral", value: p.theme_nav_bg, full: true });

    wireBrandingControls(els, p);
    renderBrandingPreview(els, p);

    ["trade_name", "legal_name"].forEach((k) => {
      const input = els.orgForm.querySelector(`[data-k="${CSS.escape(String(k))}"]`);
      input?.addEventListener("input", () => renderBrandingPreview(els, p));
    });

    // Subscription kv
    els.subKv.innerHTML =
      kvHtml("Plan", planName) +
      kvHtml("Statut", status) +
      kvHtml("Max utilisateurs", maxUsers);

    // Users / access
    try {
      await refreshUsers(ctx, els);
    } catch (e) {
      warn("users load failed", e);
      els.users.innerHTML = `<div class="set-user"><div><div class="set-user__name">Erreur chargement utilisateurs</div><div class="set-user__meta">Vérifie les migrations 025/026 et les droits RLS.</div></div></div>`;
    }

    els.btnSave.addEventListener("click", async () => {
      showBanner(els, "", "");
      els.btnSave.disabled = true;
      const prev = els.btnSave.textContent;
      els.btnSave.textContent = STR.saving;

      try {
        const corePayload = {
          trade_name: getFormValue(els.orgForm, "trade_name") || null,
          legal_name: getFormValue(els.orgForm, "legal_name") || null,
          legal_form: getFormValue(els.orgForm, "legal_form") || null,
          share_capital_cents: centsOrNull(getFormValue(els.orgForm, "share_capital_cents")),
          siret: getFormValue(els.orgForm, "siret") || null,
          vat_number: getFormValue(els.orgForm, "vat_number") || null,
          rcs_city: getFormValue(els.orgForm, "rcs_city") || null,
          rcs_number: getFormValue(els.orgForm, "rcs_number") || null,
          naf_code: getFormValue(els.orgForm, "naf_code") || null,
          email: getFormValue(els.orgForm, "email") || null,
          phone: getFormValue(els.orgForm, "phone") || null,
          address: getFormValue(els.orgForm, "address") || null,
          postal_code: getFormValue(els.orgForm, "postal_code") || null,
          city: getFormValue(els.orgForm, "city") || null,
          country: getFormValue(els.orgForm, "country") || null,

          invoice_prefix: getFormValue(els.billingForm, "invoice_prefix") || "FA",
          invoice_padding: Math.max(2, Math.min(8, Number(getFormValue(els.billingForm, "invoice_padding") || 4) || 4)),
          quote_prefix: getFormValue(els.billingForm, "quote_prefix") || "DV",
          quote_padding: Math.max(2, Math.min(8, Number(getFormValue(els.billingForm, "quote_padding") || 4) || 4)),
          payment_terms_days: Math.max(0, Number(getFormValue(els.billingForm, "payment_terms_days") || 30) || 30),
          late_fee_rate: Number(getFormValue(els.billingForm, "late_fee_rate") || 10) || 10,
          recovery_fee_cents: Math.max(0, Number(getFormValue(els.billingForm, "recovery_fee_cents") || 4000) || 4000),
          vat_exemption_text: getFormValue(els.billingForm, "vat_exemption_text") || null,
          footer_notes: String(els.billingForm.querySelector('[data-k="footer_notes"]')?.value || "").trim() || null,
          updated_at: new Date().toISOString(),
        };

        const brandingPayload = {
          brand_logo_url: sanitizeLogoUrl(getFormValue(els.brandingForm, "brand_logo_url")),
          theme_primary: normalizeColor(getFormValue(els.brandingForm, "theme_primary"), BRAND_DEFAULTS.theme_primary),
          theme_secondary: normalizeColor(getFormValue(els.brandingForm, "theme_secondary"), BRAND_DEFAULTS.theme_secondary),
          theme_surface: normalizeColor(getFormValue(els.brandingForm, "theme_surface"), BRAND_DEFAULTS.theme_surface),
          theme_text: normalizeColor(getFormValue(els.brandingForm, "theme_text"), BRAND_DEFAULTS.theme_text),
          theme_nav_bg: normalizeColor(getFormValue(els.brandingForm, "theme_nav_bg"), BRAND_DEFAULTS.theme_nav_bg),
        };

        applyBrandingThemeVars(brandingPayload);

        const payload = { ...corePayload, ...brandingPayload };
        const firstSave = await supabase.from(CONFIG.PROFILE_TABLE).update(payload).eq("organization_id", orgId);

        if (firstSave.error && isMissingColumnError(firstSave.error)) {
          const fallbackSave = await supabase.from(CONFIG.PROFILE_TABLE).update(corePayload).eq("organization_id", orgId);
          if (fallbackSave.error) throw fallbackSave.error;
          showBanner(els, STR.brandingSchemaMissing, "err");
        } else if (firstSave.error) {
          throw firstSave.error;
        } else {
          showBanner(els, STR.saved, "ok");
        }
      } catch (e) {
        warn("save error", e);
        showBanner(els, STR.saveError, "err");
      } finally {
        els.btnSave.disabled = false;
        els.btnSave.textContent = prev;
      }
    });

    log("ready", { orgId });
  } catch (e) {
    warn("boot error", e);
    showBanner(els, STR.loadError, "err");
  }
});
