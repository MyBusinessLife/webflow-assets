(() => {
  const p = String(location.pathname || "");
  const isSignup = /^\/(applications|application)\/signup\/?$/.test(p);
  if (!isSignup) return;

  document.documentElement.setAttribute("data-page", "signup");

  window.Webflow ||= [];
  window.Webflow.push(async function () {
    if (window.__mblSignupLoaded) return;
    window.__mblSignupLoaded = true;

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
      AFTER_SIGNUP_PATH: CFG.AFTER_SIGNUP_PATH || "/subscriptions",
      PROFILES_TABLE: CFG.PROFILES_TABLE || "profiles",
      ADMIN_DASH: CFG.ADMIN_DASH || `${APP_ROOT}/admin/dashboard`,
      TECH_DASH: CFG.TECH_DASH || `${APP_ROOT}/technician/dashboard`,
      DRIVER_DASH: CFG.DRIVER_DASH || `${APP_ROOT}/driver/dashboard`,
      POS_DASH: CFG.POS_DASH || `${APP_ROOT}/pos`,
    };

    const OAUTH_NEXT_KEY = String(CFG.OAUTH_NEXT_KEY || "mbl-oauth-next").trim() || "mbl-oauth-next";
    const OAUTH_NEXT_TTL_MS = Number(CFG.OAUTH_NEXT_TTL_MS || 15 * 60 * 1000);

    const SIGNUP_DRAFT_KEY = String(CFG.SIGNUP_DRAFT_KEY || "mbl-signup-draft").trim() || "mbl-signup-draft";
    const SIGNUP_DRAFT_TTL_MS = Number(CFG.SIGNUP_DRAFT_TTL_MS || 24 * 60 * 60 * 1000);

    const STR = {
      missingSupabase: "Supabase non charge.",
      missingForm: "Formulaire d'inscription introuvable (email + mot de passe).",
      missingEmail: "Renseigne ton email.",
      missingPassword: "Choisis un mot de passe.",
      missingCompany: "Renseigne le nom de l'entreprise.",
      passwordTooShort: "Mot de passe trop court (8 caracteres minimum).",
      passwordMismatch: "Les mots de passe ne correspondent pas.",
      signingUp: "Creation du compte…",
      signingGoogle: "Redirection Google…",
      checkEmail: "Compte cree. Verifie tes emails pour confirmer, puis connecte-toi.",
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
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 22px;
          box-shadow:
            0 26px 80px rgba(2, 6, 23, 0.14),
            0 1px 0 rgba(255, 255, 255, 0.70) inset;
          padding: 18px 18px 16px;
          backdrop-filter: blur(8px);
        }
        .mbl-auth-card__top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .mbl-auth-card__title {
          font-size: 18px;
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
        .mbl-auth-card form { margin: 0; }

        .mbl-auth-card input[type="email"],
        .mbl-auth-card input[type="password"],
        .mbl-auth-card input[type="text"],
        .mbl-auth-card input[type="tel"],
        .mbl-auth-card input[type="number"],
        .mbl-auth-card select,
        .mbl-auth-card textarea {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.14);
          background: rgba(255, 255, 255, 0.96);
          padding: 13px 14px;
          min-height: 48px;
          font-size: 15px;
          line-height: 1.2;
          color: rgba(2, 6, 23, 0.88);
          box-shadow: 0 10px 24px rgba(2, 6, 23, 0.06);
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
            0 18px 40px rgba(2, 6, 23, 0.10),
            0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14);
          transform: translateY(-1px);
        }

        .mbl-auth-card button[type="submit"],
        .mbl-auth-card input[type="submit"] {
          width: 100%;
          border-radius: 14px;
          min-height: 50px;
          border: 1px solid rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.22);
          background: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.98);
          color: #fff;
          font-weight: 950;
          letter-spacing: 0.01em;
          box-shadow: 0 20px 52px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.22);
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
          cursor: pointer;
        }

        .mbl-auth-card button[type="submit"]:hover,
        .mbl-auth-card input[type="submit"]:hover {
          transform: translateY(-1px);
          filter: saturate(1.02);
          box-shadow: 0 26px 68px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.26);
        }

        .mbl-auth-card button[type="submit"]:disabled,
        .mbl-auth-card input[type="submit"]:disabled {
          opacity: 0.7;
          transform: none;
          cursor: not-allowed;
          box-shadow: 0 18px 40px rgba(2, 6, 23, 0.10);
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
          }
          .mbl-auth-hero { order: 2; }
          .mbl-auth-card { order: 1; }
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
              Cree ton espace et commence a gerer ton activite (devis, factures, POS, interventions) avec des droits par equipe.
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

    async function getSupabase() {
      if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
      await ensureSupabaseJs();
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

    function findSignupForm() {
      const forms = Array.from(document.querySelectorAll("form"));
      for (const f of forms) {
        const pwdCount = f.querySelectorAll('input[type="password"]').length;
        const hasEmail = Boolean(
          f.querySelector('input[type="email"]') ||
            f.querySelector('input[name*="email" i]') ||
            f.querySelector('input[autocomplete="email" i]')
        );
        if (pwdCount >= 1 && hasEmail) return f;
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

    function findPasswordInputs(form) {
      const list = Array.from(form.querySelectorAll('input[type="password"]'));
      if (!list.length) return { pwd: null, confirm: null };
      if (list.length === 1) return { pwd: list[0], confirm: null };
      // If multiple password inputs, assume first is password, second is confirmation.
      return { pwd: list[0], confirm: list[1] };
    }

    function findCompanyInput(form) {
      return (
        form.querySelector('input[name*="company" i]') ||
        form.querySelector('input[name*="organisation" i]') ||
        form.querySelector('input[name*="organization" i]') ||
        form.querySelector('input[id*="company" i]') ||
        form.querySelector('input[id*="organisation" i]') ||
        form.querySelector('input[id*="organization" i]') ||
        null
      );
    }

    function findNameInput(form) {
      return (
        form.querySelector('input[name*="name" i]:not([name*="company" i]):not([name*="organisation" i])') ||
        form.querySelector('input[id*="name" i]:not([id*="company" i]):not([id*="organisation" i])') ||
        null
      );
    }

    function findPhoneInput(form) {
      return (
        form.querySelector('input[type="tel"]') ||
        form.querySelector('input[name*="phone" i]') ||
        form.querySelector('input[name*="tel" i]') ||
        form.querySelector('input[autocomplete="tel" i]') ||
        null
      );
    }

    function findCityInput(form) {
      return (
        form.querySelector('input[name="city" i]') ||
        form.querySelector('input[name*="ville" i]') ||
        form.querySelector('input[autocomplete="address-level2" i]') ||
        null
      );
    }

    function findSubmitButton(form) {
      return (
        form.querySelector('button[type="submit"]') ||
        form.querySelector('input[type="submit"]') ||
        form.querySelector("button") ||
        null
      );
    }

    function getNextParam() {
      const sp = new URLSearchParams(location.search);
      const next = String(sp.get("next") || "").trim();
      if (!next) return "";
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

      const fallback = document.querySelector("#signupMsg,[data-signup-msg]") || null;
      if (fallback) {
        fallback.textContent = message || "";
        return;
      }

      alert(message || "");
    }

    function showWebflowDone(form, message) {
      const wrap = form.closest(".w-form") || document;
      const done = wrap.querySelector(".w-form-done");
      const fail = wrap.querySelector(".w-form-fail");
      if (fail) fail.style.display = "none";
      if (done) {
        done.style.display = "block";
        const p = done.querySelector("div, p, span") || done;
        p.textContent = message || "";
        return;
      }
      const fallback = document.querySelector("#signupMsg,[data-signup-msg]") || null;
      if (fallback) {
        fallback.textContent = message || "";
        return;
      }
      alert(message || "");
    }

    function storeSignupDraft({ email, data }) {
      const safeEmail = String(email || "").trim().toLowerCase();
      const safeData = data && typeof data === "object" ? data : {};
      if (!safeEmail) return;
      try {
        localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({ t: Date.now(), email: safeEmail, data: safeData }));
      } catch (_) {}
    }

    function randomId() {
      try {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      } catch (_) {}
      return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    }

    function storeSignupDraftById(draftId, data) {
      const id = String(draftId || "").trim();
      const safeData = data && typeof data === "object" ? data : {};
      if (!id) return;
      try {
        localStorage.setItem(`${SIGNUP_DRAFT_KEY}:${id}`, JSON.stringify({ t: Date.now(), data: safeData }));
      } catch (_) {}
    }

    function ensureInput({
      form,
      name,
      type = "text",
      placeholder = "",
      autocomplete = "",
      inputMode = "",
      required = false,
      afterEl = null,
    }) {
      if (!form || !name) return null;

      const existing =
        form.querySelector(`input[name="${CSS.escape(name)}"]`) ||
        form.querySelector(`input#${CSS.escape(name)}`) ||
        null;
      if (existing) {
        try {
          if (placeholder && !existing.getAttribute("placeholder")) existing.setAttribute("placeholder", placeholder);
          if (autocomplete && !existing.getAttribute("autocomplete")) existing.setAttribute("autocomplete", autocomplete);
          if (inputMode && !existing.getAttribute("inputmode")) existing.setAttribute("inputmode", inputMode);
          existing.setAttribute("data-mbl-auth-field", name);
          if (required) existing.setAttribute("required", "");
        } catch (_) {}
        return existing;
      }

      const input = document.createElement("input");
      input.type = type;
      input.name = name;
      input.id = name;
      input.placeholder = placeholder || "";
      input.autocomplete = autocomplete || "";
      if (inputMode) input.inputMode = inputMode;
      input.setAttribute("data-mbl-auth-field", name);
      if (required) input.required = true;

      // Insert near the top, but keep email/password order sane.
      try {
        if (afterEl && afterEl.parentElement) {
          afterEl.insertAdjacentElement("afterend", input);
        } else {
          const first = form.querySelector("input, select, textarea, button") || null;
          if (first) form.insertBefore(input, first);
          else form.appendChild(input);
        }
      } catch (_) {
        form.appendChild(input);
      }

      return input;
    }

    function setButtonLoading(btn, loading) {
      if (!btn) return;
      if (!btn.dataset.prevText) btn.dataset.prevText = btn.textContent || "";
      btn.disabled = loading;
      btn.textContent = loading ? STR.signingUp : btn.dataset.prevText || "S'inscrire";
    }

    function setGoogleLoading(btn, loading) {
      if (!btn) return;
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

    async function getRole(supabase, userId) {
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
        const res = await supabase.from(CONFIG.PROFILES_TABLE).select("role").eq("id", userId).single();
        if (res.error) return "";
        return String(res.data?.role || "").trim().toLowerCase();
      } catch (_) {
        return "";
      }
    }

    let authRedirectLock = false;
    async function redirectAfterAuth(supabase, userId, fallbackPath, { fromOAuth = false } = {}) {
      if (!userId || authRedirectLock) return false;
      authRedirectLock = true;
      try {
        const next = getNextParam() || (fromOAuth ? consumeOauthNext() : "");
        if (next && navigateTo(next)) return true;

        const role = await getRole(supabase, userId);
        if (isAdminRole(role) && navigateTo(CONFIG.ADMIN_DASH)) return true;
        if (isTechRole(role) && navigateTo(CONFIG.TECH_DASH)) return true;
        if (isDriverRole(role) && navigateTo(CONFIG.DRIVER_DASH)) return true;
        if (isRestaurantEmployeeRole(role) && navigateTo(CONFIG.POS_DASH)) return true;
        if (fallbackPath && navigateTo(fallbackPath)) return true;
        return false;
      } finally {
        authRedirectLock = false;
      }
    }

    async function oauthGoogle(redirectNext) {
      const supabase = await getSupabase();
      if (!supabase) throw new Error(STR.missingSupabase);

      const loginUrl = new URL(CONFIG.LOGIN_PATH, location.origin);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: String(redirectNext || "") || loginUrl.href,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("URL OAuth Google indisponible.");
      location.assign(data.url);
    }

    const supabase = await getSupabase();
    if (!supabase) {
      console.error("[SIGNUP]", STR.missingSupabase);
      return;
    }

    const form = findSignupForm();
    if (!form) {
      console.error("[SIGNUP]", STR.missingForm);
      return;
    }

    mountAuthShell({ mode: "signup", form });

    try {
      const { data } = await supabase.auth.getSession();
      const existingUserId = data?.session?.user?.id || "";
      if (existingUserId) {
        await redirectAfterAuth(supabase, existingUserId, CONFIG.AFTER_SIGNUP_PATH);
        return;
      }
    } catch (_) {}

    injectAuthMessageStyles();

    const emailEl = findEmailInput(form);
    const { pwd: pwdEl, confirm: confirmEl } = findPasswordInputs(form);
    const companyEl =
      findCompanyInput(form) ||
      ensureInput({
        form,
        name: "company_name",
        type: "text",
        placeholder: "Nom de l'entreprise",
        autocomplete: "organization",
        required: true,
      });

    const nameEl =
      findNameInput(form) ||
      ensureInput({
        form,
        name: "full_name",
        type: "text",
        placeholder: "Nom et prenom",
        autocomplete: "name",
        required: true,
      });

    const phoneEl =
      findPhoneInput(form) ||
      ensureInput({
        form,
        name: "phone",
        type: "tel",
        placeholder: "Telephone (optionnel)",
        autocomplete: "tel",
        inputMode: "tel",
        afterEl: emailEl || nameEl || null,
      });

    const cityEl =
      findCityInput(form) ||
      ensureInput({
        form,
        name: "city",
        type: "text",
        placeholder: "Ville (optionnel)",
        autocomplete: "address-level2",
        afterEl: phoneEl || emailEl || null,
      });

    let confirmField = confirmEl;
    if (pwdEl && !confirmField) {
      confirmField = ensureInput({
        form,
        name: "password_confirm",
        type: "password",
        placeholder: "Confirmer le mot de passe",
        autocomplete: "new-password",
        required: true,
        afterEl: pwdEl,
      });
    }

    const submitBtn = findSubmitButton(form);

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
          const companyName = String(companyEl?.value || "").trim();
          if (!companyName) {
            showWebflowError(form, STR.missingCompany);
            setGoogleLoading(googleBtn, false);
            return;
          }

          const fullName = String(nameEl?.value || "").trim();
          const draftId = randomId();
          storeSignupDraftById(draftId, {
            company_name: companyName || undefined,
            full_name: fullName || undefined,
            phone: String(phoneEl?.value || "").trim() || undefined,
            city: String(cityEl?.value || "").trim() || undefined,
          });

          const next = getNextParam();
          if (next) storeOauthNext(next);
          const redirectTo = new URL(CONFIG.LOGIN_PATH, location.origin);
          redirectTo.searchParams.set("mbl_draft", draftId);
          await oauthGoogle(redirectTo.href);
        } catch (err) {
          showWebflowError(form, err?.message || "Connexion Google impossible.");
          setGoogleLoading(googleBtn, false);
        }
      }, true);
    } else if (authDivider) {
      authDivider.remove();
    }

    async function doSignup(event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = String(emailEl?.value || "").trim();
      const password = String(pwdEl?.value || "");
      const confirm = String(confirmField?.value || "");

      if (!email) return showWebflowError(form, STR.missingEmail);
      if (!password) return showWebflowError(form, STR.missingPassword);
      const companyName = String(companyEl?.value || "").trim();
      if (!companyName) return showWebflowError(form, STR.missingCompany);
      if (password.length < 8) return showWebflowError(form, STR.passwordTooShort);
      if (confirmField && confirm && confirm !== password) return showWebflowError(form, STR.passwordMismatch);

      setButtonLoading(submitBtn, true);

      try {
        const fullName = String(nameEl?.value || "").trim();
        const phone = String(phoneEl?.value || "").trim();
        const city = String(cityEl?.value || "").trim();

        const next = getNextParam();

        storeSignupDraft({
          email,
          data: {
            company_name: companyName || undefined,
            full_name: fullName || undefined,
            phone: phone || undefined,
            city: city || undefined,
          },
        });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(CONFIG.LOGIN_PATH, location.origin).href,
            data: {
              company_name: companyName || undefined,
              full_name: fullName || undefined,
              phone: phone || undefined,
              city: city || undefined,
            },
          },
        });

        if (error) throw error;

        // If email confirmation is enabled, session will be null.
        if (!data?.session) {
          showWebflowDone(form, STR.checkEmail);
          return;
        }

        // Success (session exists): redirect.
        const userId = data?.session?.user?.id || data?.user?.id || "";
        await redirectAfterAuth(supabase, userId, CONFIG.AFTER_SIGNUP_PATH);
      } catch (err) {
        console.error("[SIGNUP] signUp error:", err);
        showWebflowError(form, err?.message || "Inscription impossible.");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    }

    // Intercept Webflow form submit/click in capture phase to avoid the native Webflow password restriction.
    document.addEventListener(
      "submit",
      (event) => {
        if (event.target === form) doSignup(event);
      },
      true
    );
    document.addEventListener(
      "click",
      (event) => {
        const trigger = event.target?.closest?.('button[type="submit"], input[type="submit"]');
        if (!trigger) return;
        if (trigger.closest("form") !== form) return;
        doSignup(event);
      },
      true
    );

    supabase.auth.onAuthStateChange((evt, session) => {
      if (evt !== "SIGNED_IN") return;
      const userId = session?.user?.id || "";
      if (!userId) return;
      setTimeout(() => {
        const fromOAuth = Boolean(peekOauthNext());
        redirectAfterAuth(supabase, userId, CONFIG.AFTER_SIGNUP_PATH, { fromOAuth }).catch(() => {});
      }, 0);
    });
  });
})();
