(() => {
  "use strict";

  if (window.__mblApplicationsProtectLoaded) return;
  window.__mblApplicationsProtectLoaded = true;

  const p = String(location.pathname || "");
  const match = p.match(/^\/(applications|application)(?=\/|$)/);
  if (!match) return;

  const APP_ROOT = `/${match[1]}`;
  const isLogin = new RegExp(`^\\/${match[1]}\\/login\\/?$`).test(p);
  const isSignup = new RegExp(`^\\/${match[1]}\\/signup\\/?$`).test(p);
  const isPublicAuthPage = isLogin || isSignup;

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");

  const CFG = (window.__MBL_CFG__ = window.__MBL_CFG__ || {});

  function sanitizeLoginPath(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (v.startsWith("/") && /\/login\/?$/.test(v)) return v;
    try {
      const u = new URL(v, location.origin);
      if (u.origin === location.origin && /\/login\/?$/.test(u.pathname)) return u.pathname;
    } catch (_) {}
    return "";
  }

  const LOGIN_URL = sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`;

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    PROFILES_TABLE: CFG.PROFILES_TABLE || "profiles",

    APP_ROOT,
    LOGIN_URL,
    ADMIN_DASH: CFG.ADMIN_DASH || `${APP_ROOT}/admin/dashboard`,
    TECH_DASH: CFG.TECH_DASH || `${APP_ROOT}/technician/dashboard`,
    DRIVER_DASH: CFG.DRIVER_DASH || `${APP_ROOT}/driver/dashboard`,

    MAX_BOOT_MS: 6000,
  };

  // Publish inferred paths for other scripts (gate/login/etc.).
  CFG.APP_ROOT ||= CONFIG.APP_ROOT;
  CFG.LOGIN_PATH ||= CONFIG.LOGIN_URL;
  CFG.ADMIN_DASH ||= CONFIG.ADMIN_DASH;
  CFG.TECH_DASH ||= CONFIG.TECH_DASH;
  CFG.DRIVER_DASH ||= CONFIG.DRIVER_DASH;
  CFG.AUTH_STORAGE_KEY ||= CONFIG.AUTH_STORAGE_KEY;
  CFG.SUPABASE_URL ||= CONFIG.SUPABASE_URL;
  CFG.SUPABASE_ANON_KEY ||= CONFIG.SUPABASE_ANON_KEY;

  // Cache a couple of paths so non-app pages (e.g. /subscriptions) can still infer the right routes.
  try {
    localStorage.setItem("mbl-app-root", CONFIG.APP_ROOT);
    localStorage.setItem("mbl-app-login-path", CONFIG.LOGIN_URL);
  } catch (_) {}

  // Anti-flash guard (safe: auto-unhide after MAX_BOOT_MS).
  try {
    document.documentElement.setAttribute("data-mbl-app", "1");
    if (isLogin) document.documentElement.setAttribute("data-mbl-login", "1");
    if (isPublicAuthPage) document.documentElement.setAttribute("data-mbl-public", "1");

    if (!document.getElementById("mbl-app-protect-style")) {
      const st = document.createElement("style");
      st.id = "mbl-app-protect-style";
      st.textContent = `
        html[data-mbl-app="1"] body { visibility: hidden !important; }
        html[data-mbl-app="1"].mbl-auth-ready body { visibility: visible !important; }
        html[data-mbl-app="1"][data-mbl-login="1"] body { visibility: visible !important; }
        html[data-mbl-app="1"][data-mbl-public="1"] body { visibility: visible !important; }
      `;
      document.head.appendChild(st);
    }

    document.documentElement.classList.remove("mbl-auth-ready");
    setTimeout(() => {
      document.documentElement.classList.add("mbl-auth-ready");
    }, CONFIG.MAX_BOOT_MS);
  } catch (_) {}

  function log(...a) {
    if (!DEBUG) return;
    console.log("[MBL PROTECT]", ...a);
  }

  function warn(...a) {
    if (!DEBUG) return;
    console.warn("[MBL PROTECT]", ...a);
  }

  function ready() {
    try {
      document.documentElement.classList.add("mbl-auth-ready");
    } catch (_) {}
  }

  function sameTarget(path) {
    try {
      const u = new URL(path, location.origin);
      return u.pathname === location.pathname && u.search === location.search;
    } catch {
      return false;
    }
  }

  function safeReplace(path, reason) {
    if (DEBUG) {
      log("redirect blocked (debug)", { reason, to: path });
      ready();
      return;
    }
    if (sameTarget(path)) {
      ready();
      return;
    }
    try {
      location.replace(new URL(path, location.origin).href);
    } catch {
      location.href = path;
    }
  }

  function getNextParam() {
    try {
      const sp = new URLSearchParams(location.search);
      const next = String(sp.get("next") || "").trim();
      if (!next) return "";
      // same-origin path only (avoid open redirects)
      if (next.startsWith("/") && !next.startsWith("//")) return next;
      return "";
    } catch {
      return "";
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
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase non charge.");
    }

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

  function isAdminRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return ["owner", "admin", "manager"].includes(r);
  }

  async function getRole(supabase, userId) {
    // Prefer org membership role (per org) then fallback to profiles.role (legacy).
    try {
      const mem = await supabase
        .from("organization_members")
        .select("role, is_default, created_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const r = String(mem?.data?.role || "").trim().toLowerCase();
      if (!mem.error && r) return r;
    } catch (_) {}

    try {
      const { data, error } = await supabase.from(CONFIG.PROFILES_TABLE).select("role").eq("id", userId).single();
      if (error) return "unknown";
      return String(data?.role || "").trim().toLowerCase() || "unknown";
    } catch (e) {
      warn("role fetch failed", e);
      return "unknown";
    }
  }

  // Global logout.
  let logoutLock = false;
  async function doLogout() {
    if (logoutLock) return;
    logoutLock = true;
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      warn("logout failed", e);
    }
    try {
      localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
    } catch (_) {}

    // Cleanup legacy supabase auth tokens from previous implementations.
    try {
      Object.keys(localStorage || {}).forEach((k) => {
        if (k.startsWith("sb-") && k.includes("-auth-token")) localStorage.removeItem(k);
      });
    } catch (_) {}

    safeReplace(CONFIG.LOGIN_URL + "?logout=1", "logout");
  }

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(".btnLogout, #btnLogout, a.btnLogout");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      doLogout();
    },
    true
  );

  let runLock = false;
  async function run(reason) {
    if (runLock) return;
    runLock = true;

    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getSession();
      if (error) warn("getSession error", error.message);

      const session = data?.session || null;
      const userId = session?.user?.id || "";

      log("run", {
        reason,
        path: p,
        isLogin,
        isSignup,
        hasSession: Boolean(session),
        userId: userId ? userId.slice(0, 8) + "..." : "",
      });

      // --- LOGIN ---
      if (isLogin) {
        if (url.searchParams.get("logout") === "1") {
          ready();
          return;
        }
        if (!session?.user) {
          ready();
          return;
        }

        const next = getNextParam();
        if (next) return safeReplace(next, "login_next");

        const role = await getRole(supabase, session.user.id);
        if (isAdminRole(role) || role === "admin") return safeReplace(CONFIG.ADMIN_DASH, "login_admin");
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "login_tech");
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "login_driver");

        ready();
        return;
      }

      // --- SIGNUP (public) ---
      if (isSignup) {
        if (!session?.user) {
          ready();
          return;
        }

        const next = getNextParam();
        if (next) return safeReplace(next, "signup_next");

        const role = await getRole(supabase, session.user.id);
        if (isAdminRole(role) || role === "admin") return safeReplace(CONFIG.ADMIN_DASH, "signup_admin");
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "signup_tech");
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "signup_driver");
        return safeReplace(CONFIG.APP_ROOT, "signup_default");
      }

      // --- PROTECTED ---
      if (!session?.user) {
        const next = encodeURIComponent(location.pathname + location.search);
        return safeReplace(CONFIG.LOGIN_URL + "?next=" + next, "no_session");
      }

      const role = await getRole(supabase, session.user.id);
      if (role === "unknown") return safeReplace(CONFIG.LOGIN_URL, "role_unknown");

      if (p.startsWith(`${APP_ROOT}/admin`) && !(isAdminRole(role) || role === "admin")) {
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "admin_page_as_tech");
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "admin_page_as_driver");
        return safeReplace(CONFIG.LOGIN_URL, "admin_forbidden");
      }

      if (p.startsWith(`${APP_ROOT}/technician`) && !(isAdminRole(role) || role === "admin" || role === "tech" || role === "technician")) {
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "tech_page_as_driver");
        return safeReplace(CONFIG.LOGIN_URL, "tech_forbidden");
      }

      if (p.startsWith(`${APP_ROOT}/driver`) && !(isAdminRole(role) || role === "admin" || role === "driver")) {
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "driver_page_as_tech");
        return safeReplace(CONFIG.LOGIN_URL, "driver_forbidden");
      }

      ready();
    } catch (e) {
      warn("fatal", e);
      ready(); // avoid blank page if protect fails
    } finally {
      runLock = false;
    }
  }

  run("boot");

  // Re-check on auth changes.
  (async () => {
    try {
      const supabase = await getSupabase();
      supabase.auth.onAuthStateChange((evt) => {
        log("auth change", evt);
        setTimeout(() => run("auth:" + evt), 0);
      });
    } catch (e) {
      warn("auth hook failed", e);
      ready();
    }
  })();
})();
