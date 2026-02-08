(() => {
  if (window.__mblApplicationsGateLoaded) return;
  window.__mblApplicationsGateLoaded = true;

  const CFG = window.__MBL_CFG__ || {};

  function inferAppRoot() {
    const p = String(location.pathname || "");
    const m = p.match(/^\/(applications|application)(?=\/|$)/);
    if (m?.[1]) return `/${m[1]}`;
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
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    // In this project the login is typically under /applications/login (but we also support /application/login).
    LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`,
    SUBSCRIBE_PATH: CFG.SUBSCRIBE_PATH || "/subscriptions",
    OVERLAY_DELAY_MS: 40,
    MAX_WAIT_MS: 8000,
  };

  const PAGE_REQUIRED_MODULES = {
    // Common
    "admin-dashboard": [],

    // CRM (currently bundled with billing)
    "admin-crm": ["billing"],

    // Transport
    // Fleet is available for all plans except Starter. Transport itself remains a separate module.
    "admin-transport": ["fleet"],

    // Settings
    "admin-settings": [],

    // Billing
    clients: ["billing"],
    devis: ["billing"],
    "devis-list": ["billing"],
    facture: ["billing"],
    "factures-list": ["billing"],

    // Payments (billing)
    "admin-paiements": ["billing"],

    // Inventory (shared for billing/interventions in the future, for now attach to billing)
    "admin-products": ["billing"],
    "admin-categories": ["billing"],

    // Interventions
    "admin-interventions": ["interventions"],
    "technician-dashboard": ["interventions"],
    "technician-interventions": ["interventions"],
    "technician-interventions-list": ["interventions"],
    "technician-interventions-run": ["interventions"],
    "technician-earn": ["interventions"],
    "technician-profile": ["interventions"],
  };

  function isExcludedPage() {
    const page = String(document.documentElement.dataset.page || "").trim();
    if (page === "login" || page === "signup" || page === "abonnement") return true;

    const path = String(location.pathname || "");
    if (path === CONFIG.LOGIN_PATH) return true;
    if (path === CONFIG.SUBSCRIBE_PATH) return true;
    if (/^\/(applications|application)\/login\/?$/.test(path)) return true;
    if (/^\/(applications|application)\/signup\/?$/.test(path)) return true;

    // Allow manual opt-out on any page (Webflow custom attribute).
    if (document.documentElement.hasAttribute("data-no-gate")) return true;
    if (document.querySelector("[data-no-gate]")) return true;

    return false;
  }

  function shouldGatePage() {
    if (isExcludedPage()) return false;
    const page = String(document.documentElement.dataset.page || "").trim();
    if (page && PAGE_REQUIRED_MODULES[page]) return true;
    // Backstop: if you later move your app under /application(s)/, it will be gated automatically.
    return /^\/applications?(\/|$)/.test(location.pathname || "");
  }

  if (!shouldGatePage()) return;

  let overlay = null;

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.className = "mbl-app-gate";
    overlay.innerHTML = `
      <style>
        .mbl-app-gate {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(10, 31, 53, 0.55);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          font-family: inherit;
        }
        .mbl-app-gate__card {
          width: min(520px, 100%);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.22);
          background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(245,250,255,0.96));
          box-shadow: 0 24px 80px rgba(0,0,0,0.22);
          padding: 18px 18px 16px;
          color: #0b2240;
        }
        .mbl-app-gate__title {
          font-size: 18px;
          font-weight: 900;
          margin: 0 0 6px;
          color: #143a61;
        }
        .mbl-app-gate__body {
          margin: 0;
          color: #4f6b87;
          line-height: 1.5;
        }
        .mbl-app-gate__row {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 14px;
        }
        .mbl-app-gate__spinner {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid rgba(20,58,97,0.25);
          border-top-color: rgba(20,58,97,0.95);
          animation: mblspin .9s linear infinite;
        }
        @keyframes mblspin { to { transform: rotate(360deg); } }
        .mbl-app-gate__btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 800;
          text-decoration: none;
          border: 1px solid #cfdeeb;
          background: #ffffff;
          color: #0c4a6e;
          transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .mbl-app-gate__btn:hover {
          transform: translateY(-1px);
          border-color: #9cccf5;
          box-shadow: 0 10px 20px rgba(12, 37, 66, 0.12);
        }
      </style>
      <div class="mbl-app-gate__card">
        <div class="mbl-app-gate__title" data-title>Vérification de l’abonnement…</div>
        <p class="mbl-app-gate__body" data-body>Merci de patienter une seconde.</p>
        <div class="mbl-app-gate__row">
          <div class="mbl-app-gate__spinner" data-spinner></div>
          <a class="mbl-app-gate__btn" data-cta href="${CONFIG.SUBSCRIBE_PATH}">Gérer mon abonnement</a>
        </div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function setOverlayState({ title, body, spinning }) {
    const el = ensureOverlay();
    const t = el.querySelector("[data-title]");
    const b = el.querySelector("[data-body]");
    const s = el.querySelector("[data-spinner]");
    if (t) t.textContent = title || "";
    if (b) b.textContent = body || "";
    if (s) s.style.display = spinning ? "" : "none";
  }

  function normModulesFromDataset() {
    const raw =
      document.documentElement.dataset.requiredModules ||
      document.querySelector("[data-required-modules]")?.getAttribute("data-required-modules") ||
      "";
    const list = String(raw || "")
      .split(",")
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    return list.length ? list : null;
  }

  function requiredModulesForPage() {
    const override = normModulesFromDataset();
    if (override) return override;

    const page = String(document.documentElement.dataset.page || "").trim();
    if (page && PAGE_REQUIRED_MODULES[page]) return PAGE_REQUIRED_MODULES[page];

    // If unknown page under /applications, require an active subscription (no module check).
    return [];
  }

  function isActiveSubscription(sub) {
    const status = String(sub?.status || "");
    if (!["trialing", "active", "past_due"].includes(status)) return false;

    const now = Date.now();
    const ends = sub?.ends_at ? Date.parse(sub.ends_at) : null;
    if (ends && Number.isFinite(ends) && ends <= now) return false;

    if (status === "trialing" && sub?.trial_ends_at) {
      const trialEnds = Date.parse(sub.trial_ends_at);
      if (Number.isFinite(trialEnds) && trialEnds <= now) return false;
    }

    return true;
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
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
    (document.head || document.documentElement).appendChild(s);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
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

  async function getOrCreateSupabase() {
    // Prefer the singleton created by applications-protect.js when available.
    const start = Date.now();
    while (!window.__MBL_SUPABASE__ && Date.now() - start < Math.min(CONFIG.MAX_WAIT_MS, 600)) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 80));
    }
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;

    try {
      await ensureSupabaseJs();
    } catch (_) {
      // ignore, handled below
    }

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

  async function getCurrentUser(supabase) {
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgId(supabase, userId) {
    const explicit = String(CFG.ORGANIZATION_ID || window.__MBL_ORG_ID__ || "").trim();
    if (explicit) return explicit;

    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) return "";
    return String(data?.[0]?.organization_id || "").trim();
  }

  function redirectTo(path) {
    try {
      window.location.href = path;
    } catch {
      window.location.assign(path);
    }
  }

  function withNextParam(base) {
    const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    if (String(base || "").includes("?")) return `${base}&next=${next}`;
    return `${base}?next=${next}`;
  }

  async function gate() {
    // Let the page mount a little, then show overlay to avoid a hard flash.
    setTimeout(() => ensureOverlay(), CONFIG.OVERLAY_DELAY_MS);

    const supabase = await getOrCreateSupabase();
    if (!supabase) {
      setOverlayState({
        title: "Erreur de chargement",
        body: "Supabase n’est pas chargé. Vérifie le script global (protect) ou le chargement Supabase v2.",
        spinning: false,
      });
      return;
    }

    const user = await getCurrentUser(supabase);
    if (!user) {
      setOverlayState({ title: "Connexion requise", body: "Redirection vers la page de connexion…", spinning: false });
      redirectTo(withNextParam(CONFIG.LOGIN_PATH));
      return;
    }

    const orgId = await resolveOrgId(supabase, user.id);
    if (!orgId) {
      setOverlayState({
        title: "Organisation introuvable",
        body: "Ton compte n’est rattaché à aucune organisation.",
        spinning: false,
      });
      redirectTo(withNextParam(CONFIG.SUBSCRIBE_PATH));
      return;
    }

    const [subRes, entRes] = await Promise.all([
      supabase
        .from("organization_subscriptions")
        .select("status, ends_at, trial_ends_at, plan:plan_id(code, name, modules)")
        .eq("organization_id", orgId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("organization_entitlements").select("modules").eq("organization_id", orgId).maybeSingle(),
    ]);

    const sub = subRes?.data || null;
    if (subRes?.error) {
      console.warn("[APP GATE] organization_subscriptions read warning:", subRes.error.message);
    }

    const entMods = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
    const planMods = sub?.plan?.modules && typeof sub.plan.modules === "object" ? sub.plan.modules : {};

    if (!isActiveSubscription(sub)) {
      setOverlayState({
        title: "Abonnement requis",
        body: "Ton organisation n’a pas d’abonnement actif pour accéder à cette application.",
        spinning: false,
      });
      redirectTo(withNextParam(CONFIG.SUBSCRIBE_PATH));
      return;
    }

    const required = requiredModulesForPage();
    const missing = required.filter((m) => !Boolean(entMods?.[m] ?? planMods?.[m]));

    if (missing.length) {
      setOverlayState({
        title: "Module non inclus",
        body: `Ton abonnement ne contient pas: ${missing.join(", ")}.`,
        spinning: false,
      });
      redirectTo(withNextParam(CONFIG.SUBSCRIBE_PATH));
      return;
    }

    if (overlay && overlay.isConnected) overlay.remove();
  }

  gate().catch((e) => {
    console.error("[APP GATE] runtime error:", e);
    setOverlayState({
      title: "Erreur",
      body: "Impossible de vérifier l’abonnement. Réessaie ou contacte le support.",
      spinning: false,
    });
  });
})();
