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

    const APP_ROOT = String(CFG.APP_ROOT || inferAppRoot()).trim() || "/applications";

    function sanitizeLoginPath(value) {
      const v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("/") && /\/login\/?$/.test(v)) return v;
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
    };

    const STR = {
      missingSupabase: "Supabase non charge.",
      missingForm: "Formulaire d'inscription introuvable (email + mot de passe).",
      missingEmail: "Renseigne ton email.",
      missingPassword: "Choisis un mot de passe.",
      passwordTooShort: "Mot de passe trop court (8 caracteres minimum).",
      passwordMismatch: "Les mots de passe ne correspondent pas.",
      signingUp: "Creation du compte…",
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

    function setButtonLoading(btn, loading) {
      if (!btn) return;
      if (!btn.dataset.prevText) btn.dataset.prevText = btn.textContent || "";
      btn.disabled = loading;
      btn.textContent = loading ? STR.signingUp : btn.dataset.prevText || "S'inscrire";
    }

    async function oauthGoogle(redirectNext) {
      const supabase = await getSupabase();
      if (!supabase) throw new Error(STR.missingSupabase);

      const loginUrl = new URL(CONFIG.LOGIN_PATH, location.origin);
      if (redirectNext) loginUrl.searchParams.set("next", redirectNext);

      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: loginUrl.href,
        },
      });
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

    injectAuthMessageStyles();

    const emailEl = findEmailInput(form);
    const { pwd: pwdEl, confirm: confirmEl } = findPasswordInputs(form);
    const companyEl = findCompanyInput(form);
    const nameEl = findNameInput(form);
    const submitBtn = findSubmitButton(form);

    const googleBtn = document.querySelector("[data-auth-google], #btnGoogle, .btnGoogle");
    if (googleBtn) {
      try {
        if (googleBtn.tagName === "BUTTON" && !googleBtn.getAttribute("type")) googleBtn.setAttribute("type", "button");
      } catch (_) {}
      enhanceGoogleButton(googleBtn);
      googleBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const next = getNextParam();
          await oauthGoogle(next);
        } catch (err) {
          showWebflowError(form, err?.message || "Connexion Google impossible.");
        }
      });
    }

    async function doSignup(event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = String(emailEl?.value || "").trim();
      const password = String(pwdEl?.value || "");
      const confirm = String(confirmEl?.value || "");

      if (!email) return showWebflowError(form, STR.missingEmail);
      if (!password) return showWebflowError(form, STR.missingPassword);
      if (password.length < 8) return showWebflowError(form, STR.passwordTooShort);
      if (confirmEl && confirm && confirm !== password) return showWebflowError(form, STR.passwordMismatch);

      setButtonLoading(submitBtn, true);

      try {
        const companyName = String(companyEl?.value || "").trim();
        const fullName = String(nameEl?.value || "").trim();

        const next = getNextParam();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(CONFIG.LOGIN_PATH, location.origin).href,
            data: {
              company_name: companyName || undefined,
              full_name: fullName || undefined,
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
        if (next) {
          location.href = next;
          return;
        }
        location.href = CONFIG.AFTER_SIGNUP_PATH;
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
  });
})();
