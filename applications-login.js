(() => {
  const p = String(location.pathname || "");
  const isLogin = /^\/(applications|application|extranet)\/login\/?$/.test(p);
  if (!isLogin) return;

  document.documentElement.setAttribute("data-page", "login");

  window.Webflow ||= [];
  window.Webflow.push(async function () {
  if (window.__mblLoginLoaded) return;
  window.__mblLoginLoaded = true;

  const CFG = window.__MBL_CFG__ || {};

  function inferAppRoot() {
    const match = p.match(/^\/(applications|application|extranet)(?=\/|$)/);
    if (match?.[1]) return `/${match[1]}`;
    return "/applications";
  }

  const APP_ROOT = String(CFG.APP_ROOT || inferAppRoot()).trim() || "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    DEFAULT_AFTER_LOGIN: CFG.AFTER_LOGIN_PATH || APP_ROOT,

    PROFILES_TABLE: CFG.PROFILES_TABLE || "profiles",
    ADMIN_DASH: CFG.ADMIN_DASH || `${APP_ROOT}/admin/dashboard`,
    TECH_DASH: CFG.TECH_DASH || `${APP_ROOT}/technician/dashboard`,
  };

  const STR = {
    missingSupabase: "Supabase non chargé.",
    missingForm: "Formulaire de connexion introuvable (email + mot de passe).",
    missingEmail: "Renseigne ton email.",
    missingPassword: "Renseigne ton mot de passe.",
    signingIn: "Connexion…",
  };

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

  function getNextParam() {
    const p = new URLSearchParams(location.search);
    const next = String(p.get("next") || "").trim();
    if (!next) return "";
    // Only allow same-origin paths to avoid open-redirect issues.
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

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    console.error("[LOGIN]", STR.missingSupabase);
    return;
  }

  const form = findLoginForm();
  if (!form) {
    console.error("[LOGIN]", STR.missingForm);
    return;
  }

  const emailEl = findEmailInput(form);
  const pwdEl = findPasswordInput(form);
  const submitBtn = findSubmitButton(form);

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

      const next = getNextParam();
      if (next) {
        window.location.href = next;
        return;
      }

      const userId =
        data?.user?.id ||
        data?.session?.user?.id ||
        (await supabase.auth.getUser())?.data?.user?.id ||
        "";
      const role = userId ? await getRole(userId) : "";

      if (role === "admin") {
        window.location.href = CONFIG.ADMIN_DASH;
        return;
      }
      if (role === "tech" || role === "technician") {
        window.location.href = CONFIG.TECH_DASH;
        return;
      }

      window.location.href = CONFIG.DEFAULT_AFTER_LOGIN;
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
  });
})();
