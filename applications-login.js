(() => {
  const p = String(location.pathname || "");
  const isLogin = /^\/(applications|application)\/login\/?$/.test(p);
  if (!isLogin) return;

  document.documentElement.setAttribute("data-page", "login");

  window.Webflow ||= [];
  window.Webflow.push(async function () {
  if (window.__mblLoginLoaded) return;
  window.__mblLoginLoaded = true;

  const CFG = window.__MBL_CFG__ || {};

  function inferAppRoot() {
    const match = p.match(/^\/(applications|application)(?=\/|$)/);
    if (match?.[1]) return `/${match[1]}`;
    return "/applications";
  }

  function sanitizeAppRoot(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (/^\/(applications|application)$/.test(v)) return v;
    return "";
  }

  const INFERRED_APP_ROOT = inferAppRoot();
  const APP_ROOT = INFERRED_APP_ROOT || sanitizeAppRoot(CFG.APP_ROOT) || "/applications";

  function sanitizeLoginPath(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (v === `${APP_ROOT}/login` || v === `${APP_ROOT}/login/`) return `${APP_ROOT}/login`;
    return "";
  }

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",

    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`,
    DEFAULT_AFTER_LOGIN: CFG.AFTER_LOGIN_PATH || APP_ROOT,

    PROFILES_TABLE: CFG.PROFILES_TABLE || "profiles",
    ADMIN_DASH: CFG.ADMIN_DASH || `${APP_ROOT}/admin/dashboard`,
    TECH_DASH: CFG.TECH_DASH || `${APP_ROOT}/technician/dashboard`,
    DRIVER_DASH: CFG.DRIVER_DASH || `${APP_ROOT}/driver/dashboard`,
    POS_DASH: CFG.POS_DASH || `${APP_ROOT}/pos`,
  };

  const OAUTH_NEXT_KEY = String(CFG.OAUTH_NEXT_KEY || "mbl-oauth-next").trim() || "mbl-oauth-next";
  const OAUTH_NEXT_TTL_MS = Number(CFG.OAUTH_NEXT_TTL_MS || 15 * 60 * 1000);

  const STR = {
    missingSupabase: "Supabase non chargé.",
    missingForm: "Formulaire de connexion introuvable (email + mot de passe).",
    missingEmail: "Renseigne ton email.",
    missingPassword: "Renseigne ton mot de passe.",
    signingIn: "Connexion…",
    signingGoogle: "Redirection Google…",
  };

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readCssVar(name) {
    try {
      return String(getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
    } catch {
      return "";
    }
  }

  function parseRgb(color) {
    const s = String(color || "").trim();
    if (!s) return null;

    const rgb = s.match(/rgba?\(\s*([0-9]+)[, ]+([0-9]+)[, ]+([0-9]+)(?:[\/, ]+([0-9.]+))?\s*\)/i);
    if (rgb) {
      const r = Number(rgb[1]);
      const g = Number(rgb[2]);
      const b = Number(rgb[3]);
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
    }

    if (s[0] === "#") {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
      }
    }

    return null;
  }

  function ensureThemeRgbVars() {
    try {
      const existing = readCssVar("--mbl-primary-rgb");
      if (existing) return;

      const candidates = ["--mbl-primary", "--primary", "--brand", "--color-primary", "--color-brand"];
      let primary = "";
      for (const c of candidates) {
        const v = readCssVar(c);
        if (v) {
          primary = v;
          break;
        }
      }
      if (!primary) primary = "#0ea5e9";
      const rgb = parseRgb(primary) || { r: 14, g: 165, b: 233 };
      document.documentElement.style.setProperty("--mbl-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } catch (_) {}
  }

  function injectAuthMessageStyles() {
    if (document.getElementById("mbl-auth-msg-style")) return;
    ensureThemeRgbVars();
    const st = document.createElement("style");
    st.id = "mbl-auth-msg-style";
    st.textContent = `
      html[data-page="login"] .w-form-done,
      html[data-page="signup"] .w-form-done,
      html[data-page="login"] .w-form-fail,
      html[data-page="signup"] .w-form-fail {
        border-radius: 12px;
        padding: 12px 14px;
        margin-top: 12px;
        border: 1px solid;
        font-size: 14px;
        line-height: 1.5;
        font-weight: 650;
      }

      html[data-page="login"] .w-form-done,
      html[data-page="signup"] .w-form-done {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #065f46;
      }

      html[data-page="login"] .w-form-fail,
      html[data-page="signup"] .w-form-fail {
        background: #fef2f2;
        border-color: #fecaca;
        color: #991b1b;
      }

      html[data-page="login"] .w-form-done > *,
      html[data-page="signup"] .w-form-done > *,
      html[data-page="login"] .w-form-fail > *,
      html[data-page="signup"] .w-form-fail > * {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        font-weight: 650;
      }
    `;
    document.head.appendChild(st);
  }

  function injectGoogleStyles() {
    if (document.getElementById("mbl-google-btn-style")) return;
    ensureThemeRgbVars();
    const st = document.createElement("style");
    st.id = "mbl-google-btn-style";
    st.textContent = `
      @keyframes mblGSpin { to { transform: rotate(360deg); } }

      html[data-page="login"] .mbl-google-btn,
      html[data-page="signup"] .mbl-google-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 50px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(15, 23, 42, 0.14);
        background: rgba(255, 255, 255, 0.92);
        color: rgba(2, 6, 23, 0.88);
        font-weight: 850;
        letter-spacing: 0.01em;
        text-decoration: none;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        box-shadow:
          0 16px 36px rgba(2, 6, 23, 0.10),
          0 1px 0 rgba(255, 255, 255, 0.70) inset;
        transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
      }

      html[data-page="login"] .mbl-google-btn:hover,
      html[data-page="signup"] .mbl-google-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.40);
        background: rgba(255, 255, 255, 0.98);
        box-shadow:
          0 22px 52px rgba(2, 6, 23, 0.14),
          0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14);
      }

      html[data-page="login"] .mbl-google-btn:active,
      html[data-page="signup"] .mbl-google-btn:active {
        transform: translateY(0px) scale(0.996);
        box-shadow: 0 14px 34px rgba(2, 6, 23, 0.12);
      }

      html[data-page="login"] .mbl-google-btn:focus-visible,
      html[data-page="signup"] .mbl-google-btn:focus-visible {
        outline: none;
        box-shadow:
          0 22px 52px rgba(2, 6, 23, 0.14),
          0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.18);
      }

      html[data-page="login"] .mbl-google-btn[aria-disabled="true"],
      html[data-page="signup"] .mbl-google-btn[aria-disabled="true"],
      html[data-page="login"] .mbl-google-btn:disabled,
      html[data-page="signup"] .mbl-google-btn:disabled {
        opacity: 0.66;
        transform: none;
        cursor: not-allowed;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.10);
      }

      .mbl-google-btn__inner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .mbl-google-btn__icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      .mbl-google-btn__icon svg { width: 18px; height: 18px; display: block; }
      .mbl-google-btn__text { font-size: 15px; line-height: 1.1; }
      .mbl-google-btn__spinner {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid rgba(2, 6, 23, 0.18);
        border-top-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.92);
        animation: mblGSpin 900ms linear infinite;
        display: none;
      }
      .mbl-google-btn[data-loading="1"] .mbl-google-btn__icon { display: none; }
      .mbl-google-btn[data-loading="1"] .mbl-google-btn__spinner { display: inline-flex; }
    `;
    document.head.appendChild(st);
  }

  function injectAuthShellStyles() {
    if (document.getElementById("mbl-auth-shell-style")) return;
    ensureThemeRgbVars();
    const st = document.createElement("style");
    st.id = "mbl-auth-shell-style";
    st.textContent = `
      html[data-page="login"],
      html[data-page="signup"] {
        height: 100%;
      }

      html[data-page="login"] body,
      html[data-page="signup"] body {
        min-height: 100%;
        background:
          radial-gradient(1200px 800px at 15% -10%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.20), transparent 60%),
          radial-gradient(900px 700px at 115% 10%, rgba(2, 132, 199, 0.16), transparent 55%),
          linear-gradient(180deg, #f7fbff 0%, #f3f6fb 45%, #f3f6fb 100%);
      }

      html[data-page="login"] body.mbl-auth-mode > :not(.mbl-auth-shell):not(script):not(style),
      html[data-page="signup"] body.mbl-auth-mode > :not(.mbl-auth-shell):not(script):not(style) {
        display: none !important;
      }

      .mbl-auth-shell {
        position: relative;
        min-height: 100vh;
        display: flex;
        align-items: stretch;
        justify-content: center;
        overflow: hidden;
      }

      .mbl-auth-shell__bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .mbl-auth-shell__orb {
        position: absolute;
        width: 520px;
        height: 520px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 30% 30%,
            rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.20),
            rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.06) 45%,
            transparent 70%);
        filter: blur(18px);
        transform: translate3d(0,0,0);
        opacity: 0.9;
        animation: mblAuthFloat 12s ease-in-out infinite;
      }

      .mbl-auth-shell__orb--a { left: -180px; top: -210px; animation-delay: -2s; }
      .mbl-auth-shell__orb--b { right: -220px; bottom: -260px; animation-delay: -6s; }

      @keyframes mblAuthFloat {
        0%   { transform: translate3d(0,0,0) scale(1); }
        50%  { transform: translate3d(20px, 18px, 0) scale(1.03); }
        100% { transform: translate3d(0,0,0) scale(1); }
      }

      @keyframes mblAuthCardIn {
        from { opacity: 0; transform: translateY(10px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes mblAuthHeroIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .mbl-auth-shell__grid {
        position: relative;
        z-index: 1;
        width: min(1120px, 100%);
        margin: 0 auto;
        padding: clamp(18px, 4vw, 44px);
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: clamp(16px, 3vw, 34px);
        align-items: center;
      }

      .mbl-auth-hero {
        animation: mblAuthHeroIn 520ms ease both;
        color: rgba(2, 6, 23, 0.90);
      }
      .mbl-auth-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 950;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        font-size: 12px;
        color: rgba(2, 6, 23, 0.62);
      }
      .mbl-auth-brand__dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.95);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14);
      }
      .mbl-auth-h1 {
        margin: 10px 0 10px;
        font-size: clamp(30px, 4.2vw, 46px);
        line-height: 1.06;
        letter-spacing: -0.02em;
        font-weight: 950;
        color: rgba(2, 6, 23, 0.92);
      }
      .mbl-auth-lead {
        margin: 0;
        max-width: 56ch;
        font-size: 15px;
        line-height: 1.55;
        color: rgba(15, 23, 42, 0.72);
      }
      .mbl-auth-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .mbl-auth-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(15, 23, 42, 0.10);
        box-shadow: 0 12px 26px rgba(2, 6, 23, 0.08);
        font-size: 13px;
        font-weight: 800;
        color: rgba(2, 6, 23, 0.76);
      }
      .mbl-auth-badge__icon {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.95);
      }

      .mbl-auth-card {
        animation: mblAuthCardIn 540ms ease both;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 22px;
        box-shadow:
          0 28px 72px rgba(2, 6, 23, 0.12),
          0 1px 0 rgba(255, 255, 255, 0.80) inset;
        padding: 20px 20px 18px;
        backdrop-filter: blur(6px);
      }
      .mbl-auth-card__top {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .mbl-auth-card__title {
        font-size: 20px;
        font-weight: 950;
        color: rgba(2, 6, 23, 0.90);
        letter-spacing: -0.01em;
      }
      .mbl-auth-card__hint {
        font-size: 12px;
        line-height: 1.4;
        color: rgba(15, 23, 42, 0.62);
        font-weight: 700;
      }

      .mbl-auth-card .w-form { margin: 0; }
      .mbl-auth-card form {
        margin: 0;
        display: grid;
        gap: 12px;
      }

      .mbl-auth-form {
        display: grid;
        gap: 12px;
      }

      .mbl-auth-field {
        display: grid;
        gap: 6px;
      }

      .mbl-auth-label {
        margin: 0;
        font-size: 12px;
        line-height: 1.4;
        font-weight: 800;
        color: rgba(15, 23, 42, 0.78);
        letter-spacing: 0.01em;
      }

      .mbl-auth-submit-wrap {
        margin-top: 2px;
      }

      .mbl-auth-card label {
        color: rgba(15, 23, 42, 0.78);
      }

      .mbl-auth-card input[type="email"],
      .mbl-auth-card input[type="password"],
      .mbl-auth-card input[type="text"],
      .mbl-auth-card input[type="tel"],
      .mbl-auth-card input[type="number"],
      .mbl-auth-card select,
      .mbl-auth-card textarea {
        width: 100%;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.14);
        background: #fff;
        padding: 12px 13px;
        min-height: 46px;
        font-size: 15px;
        line-height: 1.2;
        color: rgba(2, 6, 23, 0.88);
        box-shadow: 0 6px 16px rgba(2, 6, 23, 0.06);
        transition: box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .mbl-auth-card input::placeholder,
      .mbl-auth-card textarea::placeholder {
        color: rgba(15, 23, 42, 0.46);
        font-weight: 650;
      }

      .mbl-auth-card input:focus,
      .mbl-auth-card select:focus,
      .mbl-auth-card textarea:focus {
        outline: none;
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.60);
        box-shadow:
          0 10px 28px rgba(2, 6, 23, 0.10),
          0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.15);
        transform: translateY(-0.5px);
      }

      .mbl-auth-card button[type="submit"],
      .mbl-auth-card input[type="submit"] {
        width: 100%;
        border-radius: 12px;
        min-height: 48px;
        border: 1px solid rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.22);
        background: linear-gradient(145deg, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.96), rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.88));
        color: #fff;
        font-weight: 950;
        letter-spacing: 0.01em;
        box-shadow: 0 14px 36px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.24);
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        cursor: pointer;
      }

      .mbl-auth-card button[type="submit"]:hover,
      .mbl-auth-card input[type="submit"]:hover {
        transform: translateY(-1px);
        filter: saturate(1.02);
        box-shadow: 0 20px 44px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.28);
      }

      .mbl-auth-card button[type="submit"]:disabled,
      .mbl-auth-card input[type="submit"]:disabled {
        opacity: 0.7;
        transform: none;
        cursor: not-allowed;
        box-shadow: 0 12px 28px rgba(2, 6, 23, 0.10);
      }

      .mbl-auth-divider {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 10px;
        margin: 14px 0;
        color: rgba(15, 23, 42, 0.52);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.10em;
        text-transform: uppercase;
      }
      .mbl-auth-divider:before,
      .mbl-auth-divider:after {
        content: "";
        height: 1px;
        background: rgba(15, 23, 42, 0.12);
      }

      .mbl-auth-foot {
        margin-top: 12px;
        font-size: 13px;
        color: rgba(15, 23, 42, 0.64);
        font-weight: 750;
      }
      .mbl-auth-foot a {
        color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.92);
        text-decoration: none;
        font-weight: 950;
      }
      .mbl-auth-foot a:hover { text-decoration: underline; }

      @media (max-width: 920px) {
        .mbl-auth-shell__grid {
          grid-template-columns: 1fr;
          align-items: start;
          padding: 16px;
        }
        .mbl-auth-hero { order: 2; }
        .mbl-auth-card { order: 1; }
        .mbl-auth-card {
          border-radius: 18px;
          padding: 16px;
        }
        .mbl-auth-card__title { font-size: 18px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .mbl-auth-shell__orb,
        .mbl-auth-hero,
        .mbl-auth-card {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(st);
  }

  function mountAuthShell({ mode, form }) {
    if (!form) return;
    if (document.querySelector(".mbl-auth-shell")) return;
    injectAuthShellStyles();

    const wForm = form.closest(".w-form") || form;

    const shell = document.createElement("div");
    shell.className = "mbl-auth-shell";

    const title = mode === "signup" ? "Creer un compte" : "Connexion";
    const ctaText = mode === "signup" ? "Deja un compte ? Se connecter" : "Nouveau ici ? Creer un compte";
    const ctaHref = mode === "signup" ? `${APP_ROOT}/login` : `${APP_ROOT}/signup`;

    shell.innerHTML = `
      <div class="mbl-auth-shell__bg" aria-hidden="true">
        <div class="mbl-auth-shell__orb mbl-auth-shell__orb--a"></div>
        <div class="mbl-auth-shell__orb mbl-auth-shell__orb--b"></div>
      </div>
      <div class="mbl-auth-shell__grid">
        <div class="mbl-auth-hero">
          <div class="mbl-auth-brand"><span class="mbl-auth-brand__dot"></span>My Business Life</div>
          <div class="mbl-auth-h1">${escapeHTML(title)}</div>
          <p class="mbl-auth-lead">
            Une interface simple pour gerer devis, factures, POS et interventions, avec des droits par equipe.
          </p>
          <div class="mbl-auth-badges" aria-hidden="true">
            <div class="mbl-auth-badge"><span class="mbl-auth-badge__icon"></span>Multi-etablissements</div>
            <div class="mbl-auth-badge"><span class="mbl-auth-badge__icon"></span>POS & restaurant</div>
            <div class="mbl-auth-badge"><span class="mbl-auth-badge__icon"></span>Devis & factures</div>
          </div>
        </div>
        <div class="mbl-auth-card">
          <div class="mbl-auth-card__top">
            <div class="mbl-auth-card__title">${escapeHTML(title)}</div>
            <div class="mbl-auth-card__hint">Securise et rapide</div>
          </div>
          <div class="mbl-auth-divider">ou</div>
          <div data-mbl-auth-slot="form"></div>
          <div class="mbl-auth-foot"><a href="${escapeHTML(ctaHref)}">${escapeHTML(ctaText)}</a></div>
        </div>
      </div>
    `;

    try {
      document.body.classList.add("mbl-auth-mode");
    } catch (_) {}
    document.body.prepend(shell);

    const slot = shell.querySelector('[data-mbl-auth-slot="form"]');
    if (slot) slot.appendChild(wForm);
  }

  function googleIconSvg() {
    // Compact multi-color Google "G" icon (inline SVG).
    return `
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.23 3.61l6.88-6.88C35.93 2.47 30.35 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.05 6.25C12.6 13.11 17.87 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9h12.7c-.55 2.98-2.2 5.5-4.68 7.2l7.19 5.58C43.79 37.29 46.5 31.4 46.5 24.5z"/>
        <path fill="#FBBC05" d="M10.61 28.47A14.5 14.5 0 0 1 9.5 24c0-1.55.25-3.05.71-4.47l-8.05-6.25A23.93 23.93 0 0 0 0 24c0 3.84.9 7.48 2.5 10.72l8.11-6.25z"/>
        <path fill="#34A853" d="M24 48c6.35 0 11.69-2.1 15.59-5.7l-7.19-5.58c-2 1.35-4.56 2.15-8.4 2.15-6.13 0-11.4-3.61-13.39-8.75l-8.11 6.25C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    `;
  }

  function enhanceGoogleButton(btn) {
    if (!btn) return;
    injectGoogleStyles();

    const label = String(btn.dataset.googleLabel || btn.textContent || "").trim() || "Continuer avec Google";
    btn.dataset.googleLabel = label;
    btn.classList.add("mbl-google-btn");
    btn.setAttribute("aria-label", label);

    if (!btn.querySelector(".mbl-google-btn__inner")) {
      btn.innerHTML = `
        <span class="mbl-google-btn__inner">
          <span class="mbl-google-btn__icon">${googleIconSvg()}</span>
          <span class="mbl-google-btn__text">${escapeHTML(label)}</span>
        </span>
        <span class="mbl-google-btn__spinner" aria-hidden="true"></span>
      `;
    }
  }

  function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();

    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 6000);
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
    }

    const s = document.createElement("script");
    s.src = CONFIG.SUPABASE_CDN;
    s.async = true;
    s.dataset.mblLib = "supabase";
    document.head.appendChild(s);

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 6000);
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

  function resolveSupabaseClient() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (window.__mblLoginSupabase) return window.__mblLoginSupabase;
    if (!window.supabase?.createClient) return null;

    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: CONFIG.AUTH_STORAGE_KEY,
      },
    });

    window.__mblLoginSupabase = client;
    return client;
  }

  function findLoginForm() {
    const forms = Array.from(document.querySelectorAll("form"));
    for (const f of forms) {
      const hasPwd = Boolean(f.querySelector('input[type="password"]'));
      const hasEmail = Boolean(
        f.querySelector('input[type="email"]') ||
          f.querySelector('input[name*="email" i]') ||
          f.querySelector('input[autocomplete="email" i]')
      );
      if (hasPwd && hasEmail) return f;
    }
    return null;
  }

  function findEmailInput(form) {
    return (
      form.querySelector('input[type="email"]') ||
      form.querySelector('input[name*="email" i]') ||
      form.querySelector('input[autocomplete="email" i]') ||
      form.querySelector("input")
    );
  }

  function findPasswordInput(form) {
    return form.querySelector('input[type="password"]');
  }

  function findSubmitButton(form) {
    return (
      form.querySelector('button[type="submit"]') ||
      form.querySelector('input[type="submit"]') ||
      form.querySelector("button") ||
      null
    );
  }

  function cssEscape(value) {
    const v = String(value || "");
    try {
      if (window.CSS?.escape) return window.CSS.escape(v);
    } catch (_) {}
    return v.replace(/([^\w-])/g, "\\$1");
  }

  function ensureControlId(control, seed = "field") {
    if (!control) return "";
    const existing = String(control.id || "").trim();
    if (existing) return existing;

    const base =
      String(seed || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "field";
    let next = `mbl-${base}`;
    let i = 2;
    while (document.getElementById(next)) {
      next = `mbl-${base}-${i++}`;
    }
    control.id = next;
    return next;
  }

  function isSubmitControl(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "button") return String(el.getAttribute("type") || "submit").toLowerCase() === "submit";
    if (tag === "input") return String(el.getAttribute("type") || "").toLowerCase() === "submit";
    return false;
  }

  function isVisibleControl(el) {
    if (!el || !(el instanceof Element)) return false;
    if (!el.matches("input, select, textarea, button")) return false;
    if (el.matches('input[type="hidden"]')) return false;
    if (el.closest(".mbl-google-btn, [data-auth-google], #btnGoogle, .btnGoogle")) return false;
    if (el.closest(".w-form-done, .w-form-fail")) return false;
    return true;
  }

  function getFieldBlock(form, control) {
    if (!form || !control || !(control instanceof Element)) return null;

    let node = control;
    while (node?.parentElement && node.parentElement !== form) {
      const parent = node.parentElement;
      const controlsCount = parent.querySelectorAll('input:not([type="hidden"]), select, textarea, button').length;
      if (controlsCount > 1) break;
      node = parent;
    }

    return node || control;
  }

  function ensureFieldLabel({ form, control, label = "" }) {
    if (!form || !control || !(control instanceof Element)) return;
    const block = getFieldBlock(form, control);
    if (!block || !(block instanceof Element)) return;

    const id = ensureControlId(control, control.getAttribute("name") || control.type || "field");
    if (!id) return;

    block.classList.add("mbl-auth-field");

    let localLabel = null;
    try {
      localLabel = block.querySelector(`label[for="${cssEscape(id)}"]`) || null;
    } catch (_) {}
    if (!localLabel) {
      const inBlock = Array.from(block.querySelectorAll("label")).find((lab) => {
        return String(lab.getAttribute("for") || "").trim() === id;
      });
      if (inBlock) localLabel = inBlock;
    }
    if (!localLabel) {
      try {
        const external = form.querySelector(`label[for="${cssEscape(id)}"]`);
        if (external) {
          localLabel = external;
          if (!block.contains(localLabel)) block.insertBefore(localLabel, control);
        }
      } catch (_) {}
    }
    if (!localLabel && label) {
      localLabel = document.createElement("label");
      localLabel.setAttribute("for", id);
      block.insertBefore(localLabel, control);
    }

    if (localLabel) {
      localLabel.classList.add("mbl-auth-label");
      localLabel.setAttribute("for", id);
      const text = String(label || localLabel.textContent || control.getAttribute("aria-label") || control.placeholder || "").trim();
      if (text) localLabel.textContent = text;
    }

    try {
      const duplicates = Array.from(form.querySelectorAll(`label[for="${cssEscape(id)}"]`));
      duplicates.forEach((lab) => {
        if (lab === localLabel) return;
        if (!block.contains(lab)) lab.style.display = "none";
      });
    } catch (_) {}
  }

  function normalizeAuthFormLayout({ form, submitBtn, fields = [] }) {
    if (!form) return;

    let layout = Array.from(form.children).find((node) => {
      return node instanceof Element && node.classList.contains("mbl-auth-form");
    });
    if (!layout) {
      layout = document.createElement("div");
      layout.className = "mbl-auth-form";
      const firstVisible = Array.from(form.children).find((node) => {
        return node instanceof Element && !node.matches('input[type="hidden"]');
      });
      if (firstVisible) form.insertBefore(layout, firstVisible);
      else form.appendChild(layout);
    }

    const moved = new Set();
    const preferredControls = new Set();

    const moveControlBlock = (control, { submit = false } = {}) => {
      if (!isVisibleControl(control)) return;
      const block = getFieldBlock(form, control);
      if (!block || !(block instanceof Element) || moved.has(block)) return;
      if (submit) block.classList.add("mbl-auth-submit-wrap");
      layout.appendChild(block);
      moved.add(block);
    };

    fields.forEach((field) => {
      const control = field?.control || null;
      if (!isVisibleControl(control)) return;
      ensureFieldLabel({ form, control, label: String(field?.label || "") });
      preferredControls.add(control);
      moveControlBlock(control);
    });

    const controls = Array.from(form.querySelectorAll("input, select, textarea, button")).filter((el) => isVisibleControl(el));
    controls.forEach((control) => {
      if (preferredControls.has(control)) return;
      if (isSubmitControl(control)) return;
      moveControlBlock(control);
    });

    if (isVisibleControl(submitBtn)) {
      moveControlBlock(submitBtn, { submit: true });
    } else {
      const fallbackSubmit = controls.find((control) => isSubmitControl(control));
      if (fallbackSubmit) moveControlBlock(fallbackSubmit, { submit: true });
    }
  }

  function getNextParam() {
    const p = new URLSearchParams(location.search);
    const next = String(p.get("next") || "").trim();
    if (!next) return "";
    // Only allow same-origin paths to avoid open-redirect issues.
    if (next.startsWith("/") && !next.startsWith("//")) return next;
    return "";
  }

  function storeOauthNext(path) {
    const next = String(path || "").trim();
    if (!next) return;
    if (!(next.startsWith("/") && !next.startsWith("//"))) return;
    try {
      localStorage.setItem(OAUTH_NEXT_KEY, JSON.stringify({ next, t: Date.now() }));
    } catch (_) {}
  }

  function peekOauthNext() {
    try {
      const raw = localStorage.getItem(OAUTH_NEXT_KEY);
      if (!raw) return "";
      const obj = JSON.parse(raw);
      const next = String(obj?.next || "").trim();
      const t = Number(obj?.t || 0);
      if (!next || !(next.startsWith("/") && !next.startsWith("//"))) return "";
      if (!Number.isFinite(t) || Date.now() - t > OAUTH_NEXT_TTL_MS) return "";
      return next;
    } catch (_) {
      return "";
    }
  }

  function consumeOauthNext() {
    const next = peekOauthNext();
    try {
      localStorage.removeItem(OAUTH_NEXT_KEY);
    } catch (_) {}
    return next;
  }

  async function maybeHandleOAuthCallback() {
    // OAuth errors can come back as query params on the redirect URL.
    try {
      const sp = new URLSearchParams(location.search);
      const err = String(sp.get("error") || "").trim();
      const errDesc = String(sp.get("error_description") || "").trim();
      if (err || errDesc) {
        return { ok: false, message: errDesc || err || "Connexion Google impossible." };
      }
    } catch (_) {}

    // For PKCE flow, we may receive ?code=...&state=... and must exchange it.
    try {
      const sp = new URLSearchParams(location.search);
      const code = String(sp.get("code") || "").trim();
      if (!code) return { ok: true, exchanged: false };

      if (typeof supabase?.auth?.exchangeCodeForSession !== "function") {
        return { ok: false, message: "OAuth callback: exchangeCodeForSession indisponible." };
      }

      // If the client already has a session, don't attempt a second exchange.
      try {
        const existing = await supabase.auth.getSession();
        const session = existing?.data?.session || null;
        if (session?.user) {
          try {
            const url = new URL(location.href);
            ["code", "state", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
            history.replaceState({}, "", url.pathname + url.search);
          } catch (_) {}
          return { ok: true, exchanged: false, session };
        }
      } catch (_) {}

      const res = await supabase.auth.exchangeCodeForSession(location.href);
      if (res?.error) return { ok: false, message: res.error.message || "OAuth callback: echec exchange." };

      // Clean URL (remove auth params, keep `next` if present).
      try {
        const url = new URL(location.href);
        ["code", "state", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
        history.replaceState({}, "", url.pathname + url.search);
      } catch (_) {}

      return { ok: true, exchanged: true, session: res?.data?.session || null };
    } catch (e) {
      return { ok: false, message: e?.message || "OAuth callback: erreur." };
    }
  }

  function buildOAuthRedirectUrl() {
    // Always route OAuth back to login so we only need to whitelist one redirect URL in Supabase.
    const login = new URL(CONFIG.LOGIN_PATH || `${APP_ROOT}/login`, location.origin);
    return login.href;
  }

  function isAdminRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return ["owner", "admin", "manager"].includes(r);
  }

  function isTechRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return r === "tech" || r === "technician";
  }

  function isDriverRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return r === "driver";
  }

  function isRestaurantEmployeeRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return ["restaurant_employee", "restaurant_staff", "resto_employee", "cashier"].includes(r);
  }

  function navigateTo(path) {
    try {
      const target = new URL(path, location.origin);
      if (target.pathname === location.pathname && target.search === location.search) return false;
      location.href = target.href;
      return true;
    } catch (_) {
      location.href = String(path || "");
      return true;
    }
  }

  function setGoogleLoading(btn, loading) {
    if (!btn) return;
    // Works for <button> and <a>.
    try {
      btn.setAttribute("aria-disabled", loading ? "true" : "false");
    } catch (_) {}
    if ("disabled" in btn) btn.disabled = loading;

    if (btn.classList.contains("mbl-google-btn")) {
      btn.dataset.loading = loading ? "1" : "";
      const textEl = btn.querySelector(".mbl-google-btn__text");
      if (textEl) textEl.textContent = loading ? STR.signingGoogle : String(btn.dataset.googleLabel || "Continuer avec Google");
      return;
    }

    if (!btn.dataset.prevText) btn.dataset.prevText = btn.textContent || "";
    btn.textContent = loading ? STR.signingGoogle : btn.dataset.prevText || "Continuer avec Google";
  }

  function showWebflowError(form, message) {
    const wrap = form.closest(".w-form") || document;
    const fail = wrap.querySelector(".w-form-fail");
    const done = wrap.querySelector(".w-form-done");
    if (done) done.style.display = "none";
    if (fail) {
      fail.style.display = "block";
      const p = fail.querySelector("div, p, span") || fail;
      p.textContent = message || "";
      return;
    }

    const fallback = document.querySelector("#loginMsg,[data-login-msg]") || null;
    if (fallback) {
      fallback.textContent = message || "";
      return;
    }

    alert(message || "");
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (!btn.dataset.prevText) btn.dataset.prevText = btn.textContent || "";
    btn.disabled = loading;
    btn.textContent = loading ? STR.signingIn : btn.dataset.prevText || "Connexion";
  }

  async function getRole(userId) {
    if (!userId) return "";
    try {
      const membership = await supabase
        .from("organization_members")
        .select("role, is_default, created_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const orgRole = String(membership?.data?.role || "").trim().toLowerCase();
      if (!membership?.error && orgRole) return orgRole;
    } catch (_) {}

    try {
      const { data, error } = await supabase
        .from(CONFIG.PROFILES_TABLE)
        .select("role")
        .eq("id", userId)
        .single();
      if (error) return "";
      return String(data?.role || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  let authRedirectLock = false;
  async function redirectAfterAuth(userId, { fromOAuth = false } = {}) {
    if (!userId || authRedirectLock) return false;
    authRedirectLock = true;
    try {
      const next = getNextParam() || (fromOAuth ? consumeOauthNext() : "");
      if (next && navigateTo(next)) return true;

      const role = await getRole(userId);
      if (isAdminRole(role) && navigateTo(CONFIG.ADMIN_DASH)) return true;
      if (isTechRole(role) && navigateTo(CONFIG.TECH_DASH)) return true;
      if (isDriverRole(role) && navigateTo(CONFIG.DRIVER_DASH)) return true;
      if (isRestaurantEmployeeRole(role) && navigateTo(CONFIG.POS_DASH)) return true;
      if (navigateTo(CONFIG.DEFAULT_AFTER_LOGIN)) return true;
      return false;
    } finally {
      authRedirectLock = false;
    }
  }

  await ensureSupabaseJs();
  const supabase = resolveSupabaseClient();
  if (!supabase) {
    console.error("[LOGIN]", STR.missingSupabase);
    return;
  }

  try {
    const cb = await maybeHandleOAuthCallback();
    if (!cb.ok) {
      // Delay until we locate the form so the message is visible.
      // We'll display it right after we find `form`.
      window.__mblOauthCallbackError = cb.message || "Connexion Google impossible.";
    } else if (cb.exchanged) {
      const userId = cb.session?.user?.id || "";
      if (userId) {
        await redirectAfterAuth(userId, { fromOAuth: true });
        return;
      }
    }
  } catch (_) {}

  try {
    const fromLogout = new URLSearchParams(location.search).get("logout") === "1";
    if (!fromLogout) {
      const { data } = await supabase.auth.getSession();
      const existingUserId = data?.session?.user?.id || "";
      if (existingUserId) {
        await redirectAfterAuth(existingUserId);
        return;
      }
    }
  } catch (_) {}

  const form = findLoginForm();
  if (!form) {
    console.error("[LOGIN]", STR.missingForm);
    return;
  }

  mountAuthShell({ mode: "login", form });
  injectAuthMessageStyles();

  // If OAuth callback returned an error, show it in the Webflow form error area.
  if (window.__mblOauthCallbackError) {
    showWebflowError(form, String(window.__mblOauthCallbackError || "Connexion Google impossible."));
    try {
      delete window.__mblOauthCallbackError;
    } catch (_) {}
  }

  // Optional Google OAuth button:
  // Add a button/link with [data-auth-google] (recommended) or #btnGoogle or .btnGoogle.
  const googleBtn = document.querySelector("[data-auth-google], #btnGoogle, .btnGoogle");
  const authDivider = document.querySelector(".mbl-auth-divider");
  if (googleBtn) {
    try {
      if (googleBtn.tagName === "BUTTON" && !googleBtn.getAttribute("type")) googleBtn.setAttribute("type", "button");
    } catch (_) {}
    // If the button is inside the Webflow form, pull it up above the divider for a cleaner layout.
    try {
      if (authDivider?.parentElement) authDivider.parentElement.insertBefore(googleBtn, authDivider);
    } catch (_) {}
    enhanceGoogleButton(googleBtn);
    googleBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      setGoogleLoading(googleBtn, true);
      try {
        const next = getNextParam();
        if (next) storeOauthNext(next);
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: buildOAuthRedirectUrl(),
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) throw error;
        if (!data?.url) throw new Error("URL OAuth Google indisponible.");
        location.assign(data.url);
      } catch (err) {
        console.error("[LOGIN] oauth error:", err);
        showWebflowError(form, err?.message || "Connexion Google impossible.");
        setGoogleLoading(googleBtn, false);
      }
    }, true);
  } else if (authDivider) {
    authDivider.remove();
  }

  const emailEl = findEmailInput(form);
  const pwdEl = findPasswordInput(form);
  const submitBtn = findSubmitButton(form);

  normalizeAuthFormLayout({
    form,
    submitBtn,
    fields: [
      { control: emailEl, label: "Email professionnel" },
      { control: pwdEl, label: "Mot de passe" },
    ],
  });

  // Prevent Webflow forms from blocking password inputs ("Passwords cannot be submitted.")
  // We intercept click + submit in capture phase before Webflow handlers.
  const handler = async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const email = String(emailEl?.value || "").trim();
    const password = String(pwdEl?.value || "");

    if (!email) return showWebflowError(form, STR.missingEmail);
    if (!password) return showWebflowError(form, STR.missingPassword);

    setButtonLoading(submitBtn, true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId =
        data?.user?.id ||
        data?.session?.user?.id ||
        (await supabase.auth.getUser())?.data?.user?.id ||
        "";
      await redirectAfterAuth(userId);
    } catch (e) {
      console.error("[LOGIN] signIn error:", e);
      showWebflowError(form, e?.message || "Connexion impossible.");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  };

  // Intercept at document level (capture) to run *before* Webflow's form handler
  // that triggers "Passwords cannot be submitted." on password fields.
  document.addEventListener(
    "submit",
    (event) => {
      if (event.target === form) handler(event);
    },
    true
  );
  document.addEventListener(
    "click",
    (event) => {
      const trigger = event.target?.closest?.('button[type="submit"], input[type="submit"]');
      if (!trigger) return;
      if (trigger.closest("form") !== form) return;
      handler(event);
    },
    true
  );

  supabase.auth.onAuthStateChange((evt, session) => {
    if (evt !== "SIGNED_IN") return;
    const userId = session?.user?.id || "";
    if (!userId) return;
    setTimeout(() => {
      const fromOAuth = Boolean(peekOauthNext());
      redirectAfterAuth(userId, { fromOAuth }).catch(() => {});
    }, 0);
  });
  });
})();
