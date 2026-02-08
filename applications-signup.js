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
