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
  const isPublicRestaurantOrder = new RegExp(`^\\/${match[1]}\\/restaurant-order\\/?$`).test(p);
  const isPublicAuthPage = isLogin || isSignup;
  const isPublicPage = isPublicAuthPage || isPublicRestaurantOrder;

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
    POS_DASH: CFG.POS_DASH || `${APP_ROOT}/pos`,

    MAX_BOOT_MS: 6000,
  };

  // Publish inferred paths for other scripts (gate/login/etc.).
  CFG.APP_ROOT ||= CONFIG.APP_ROOT;
  CFG.LOGIN_PATH ||= CONFIG.LOGIN_URL;
  CFG.ADMIN_DASH ||= CONFIG.ADMIN_DASH;
  CFG.TECH_DASH ||= CONFIG.TECH_DASH;
  CFG.DRIVER_DASH ||= CONFIG.DRIVER_DASH;
  CFG.POS_DASH ||= CONFIG.POS_DASH;
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
    if (isPublicPage) document.documentElement.setAttribute("data-mbl-public", "1");

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

  const OAUTH_NEXT_KEY = String(CFG.OAUTH_NEXT_KEY || "mbl-oauth-next").trim() || "mbl-oauth-next";
  const OAUTH_NEXT_TTL_MS = Number(CFG.OAUTH_NEXT_TTL_MS || 15 * 60 * 1000);

  const SIGNUP_DRAFT_KEY = String(CFG.SIGNUP_DRAFT_KEY || "mbl-signup-draft").trim() || "mbl-signup-draft";
  const SIGNUP_DRAFT_TTL_MS = Number(CFG.SIGNUP_DRAFT_TTL_MS || 24 * 60 * 60 * 1000);
  const SIGNUP_DRAFT_ID_PARAM = String(CFG.SIGNUP_DRAFT_ID_PARAM || "mbl_draft").trim() || "mbl_draft";

  function consumeOauthNext() {
    try {
      const raw = localStorage.getItem(OAUTH_NEXT_KEY);
      if (!raw) return "";
      localStorage.removeItem(OAUTH_NEXT_KEY);
      const obj = JSON.parse(raw);
      const next = String(obj?.next || "").trim();
      const t = Number(obj?.t || 0);
      if (!next || !(next.startsWith("/") && !next.startsWith("//"))) return "";
      if (!Number.isFinite(t) || Date.now() - t > OAUTH_NEXT_TTL_MS) return "";
      return next;
    } catch (_) {
      try {
        localStorage.removeItem(OAUTH_NEXT_KEY);
      } catch (_) {}
      return "";
    }
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function isRecent(ts) {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return false;
    return Date.now() - t <= SIGNUP_DRAFT_TTL_MS;
  }

  function cleanDraftData(input) {
    const src = input && typeof input === "object" ? input : {};
    const out = {};

    const keys = ["company_name", "full_name", "phone", "city"];
    keys.forEach((k) => {
      const v = String(src[k] ?? "").trim();
      if (v) out[k] = v;
    });

    return out;
  }

  function consumeSignupDraftById(id) {
    const draftId = String(id || "").trim();
    if (!draftId) return null;
    const key = `${SIGNUP_DRAFT_KEY}:${draftId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      localStorage.removeItem(key);
      const obj = safeJsonParse(raw);
      if (!obj || !isRecent(obj.t)) return null;
      const data = cleanDraftData(obj.data);
      if (!Object.keys(data).length) return null;
      return { data, _key: key };
    } catch (_) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
      return null;
    }
  }

  function consumeSignupDraftByEmail(email) {
    const safeEmail = String(email || "").trim().toLowerCase();
    if (!safeEmail) return null;
    try {
      const raw = localStorage.getItem(SIGNUP_DRAFT_KEY);
      if (!raw) return null;
      const obj = safeJsonParse(raw);
      if (!obj || !isRecent(obj.t)) {
        localStorage.removeItem(SIGNUP_DRAFT_KEY);
        return null;
      }
      const draftEmail = String(obj.email || "").trim().toLowerCase();
      if (!draftEmail || draftEmail !== safeEmail) return null;
      localStorage.removeItem(SIGNUP_DRAFT_KEY);
      const data = cleanDraftData(obj.data);
      if (!Object.keys(data).length) return null;
      return { data, _key: SIGNUP_DRAFT_KEY };
    } catch (_) {
      try {
        localStorage.removeItem(SIGNUP_DRAFT_KEY);
      } catch (_) {}
      return null;
    }
  }

  let draftApplyLock = false;
  let lastDraftAttemptAt = 0;

  async function applySignupDraftIfAny(supabase, session) {
    if (draftApplyLock) return;
    const now = Date.now();
    if (now - lastDraftAttemptAt < 3000) return;
    lastDraftAttemptAt = now;

    const userId = session?.user?.id || "";
    const userEmail = String(session?.user?.email || "").trim().toLowerCase();
    if (!userId) return;

    let draft = null;
    let usedIdParam = false;

    try {
      const sp = new URLSearchParams(location.search);
      const draftId = String(sp.get(SIGNUP_DRAFT_ID_PARAM) || "").trim();
      if (draftId) {
        draft = consumeSignupDraftById(draftId);
        usedIdParam = true;
      }
    } catch (_) {}

    if (!draft) {
      draft = consumeSignupDraftByEmail(userEmail);
    }
    if (!draft) return;

    draftApplyLock = true;
    try {
      // 1) Persist user metadata (useful for the auth bootstrap trigger + later UX).
      const patch = cleanDraftData(draft.data);
      if (Object.keys(patch).length) {
        const res = await supabase.auth.updateUser({ data: patch });
        if (res?.error) warn("signup draft: updateUser failed", res.error.message);
      }

      // 2) Persist to organization profile (best effort).
      try {
        const mem = await supabase
          .from("organization_members")
          .select("organization_id, role, is_default, created_at")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const orgId = String(mem?.data?.organization_id || "").trim();
        if (orgId) {
          const profSel = await supabase
            .from("organization_profiles")
            .select("organization_id, legal_name, trade_name, phone, city, email")
            .eq("organization_id", orgId)
            .maybeSingle();

          // Missing table / RLS not ready: ignore.
          if (!profSel?.error) {
            const existing = profSel?.data || {};
            const company = String(patch.company_name || "").trim();
            const phone = String(patch.phone || "").trim();
            const city = String(patch.city || "").trim();

            const up = { organization_id: orgId };
            if (company && !String(existing.legal_name || "").trim()) up.legal_name = company;
            if (company && !String(existing.trade_name || "").trim()) up.trade_name = company;
            if (userEmail && !String(existing.email || "").trim()) up.email = userEmail;
            if (phone && !String(existing.phone || "").trim()) up.phone = phone;
            if (city && !String(existing.city || "").trim()) up.city = city;

            if (Object.keys(up).length > 1) {
              const upRes = await supabase.from("organization_profiles").upsert(up, { onConflict: "organization_id" });
              if (upRes?.error) warn("signup draft: org profile upsert failed", upRes.error.message);
            }
          }
        }
      } catch (e) {
        warn("signup draft: org profile write failed", e);
      }

      // 3) Clean URL param if we used the id-based draft (OAuth signup path).
      if (usedIdParam) {
        try {
          const u = new URL(location.href);
          u.searchParams.delete(SIGNUP_DRAFT_ID_PARAM);
          history.replaceState({}, "", u.pathname + u.search);
        } catch (_) {}
      }
    } finally {
      draftApplyLock = false;
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

  function isRestaurantEmployeeRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return ["restaurant_employee", "restaurant_staff", "resto_employee", "cashier"].includes(r);
  }

  function isPosPath(pathname) {
    const v = String(pathname || "").replace(/\/+$/, "");
    const posA = `${APP_ROOT}/pos`;
    const posB = `${APP_ROOT}/admin/pos`;
    return v === posA || v === posB;
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

  async function claimPendingInvitations(supabase) {
    try {
      const res = await supabase.rpc("claim_pending_org_invitations");
      if (res?.error) {
        const msg = String(res.error?.message || "").toLowerCase();
        // Function not installed yet on some envs: keep legacy flow.
        if (msg.includes("does not exist") || msg.includes("function")) return 0;
        warn("claim_pending_org_invitations warning", res.error.message);
        return 0;
      }
      const n = Number(res?.data || 0);
      if (Number.isFinite(n) && n > 0) log("invites claimed", n);
      return Number.isFinite(n) ? n : 0;
    } catch (e) {
      warn("claim_pending_org_invitations failed", e);
      return 0;
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

      if (session?.user) {
        await claimPendingInvitations(supabase);
        await applySignupDraftIfAny(supabase, session);
      }

      log("run", {
        reason,
        path: p,
        isLogin,
        isSignup,
        isPublicRestaurantOrder,
        hasSession: Boolean(session),
        userId: userId ? userId.slice(0, 8) + "..." : "",
      });

      // --- PUBLIC RESTAURANT ORDER PAGE ---
      if (isPublicRestaurantOrder) {
        ready();
        return;
      }

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

        const next = getNextParam() || consumeOauthNext();
        if (next) return safeReplace(next, "login_next");

        const role = await getRole(supabase, session.user.id);
        if (isAdminRole(role) || role === "admin") return safeReplace(CONFIG.ADMIN_DASH, "login_admin");
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "login_tech");
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "login_driver");
        if (isRestaurantEmployeeRole(role)) return safeReplace(CONFIG.POS_DASH, "login_restaurant_employee");

        ready();
        return;
      }

      // --- SIGNUP (public) ---
      if (isSignup) {
        if (!session?.user) {
          ready();
          return;
        }

        const next = getNextParam() || consumeOauthNext();
        if (next) return safeReplace(next, "signup_next");

        const role = await getRole(supabase, session.user.id);
        if (isAdminRole(role) || role === "admin") return safeReplace(CONFIG.ADMIN_DASH, "signup_admin");
        if (role === "tech" || role === "technician") return safeReplace(CONFIG.TECH_DASH, "signup_tech");
        if (role === "driver") return safeReplace(CONFIG.DRIVER_DASH, "signup_driver");
        if (isRestaurantEmployeeRole(role)) return safeReplace(CONFIG.POS_DASH, "signup_restaurant_employee");
        return safeReplace(CONFIG.APP_ROOT, "signup_default");
      }

      // --- PROTECTED ---
      if (!session?.user) {
        const next = encodeURIComponent(location.pathname + location.search);
        return safeReplace(CONFIG.LOGIN_URL + "?next=" + next, "no_session");
      }

      const role = await getRole(supabase, session.user.id);
      if (role === "unknown") return safeReplace(CONFIG.LOGIN_URL, "role_unknown");

      if (isRestaurantEmployeeRole(role) && !isPosPath(p)) {
        return safeReplace(CONFIG.POS_DASH, "restaurant_employee_pos_only");
      }

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
