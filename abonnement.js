document.documentElement.setAttribute("data-page", "abonnement");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const CFG = window.__MBL_CFG__ || {};
  let supabase = null;

  const CONFIG = {
    ROOT_SELECTOR: "[data-abonnement]",

    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    LOGIN_PATH: CFG.LOGIN_PATH || "",
    AFTER_CHECKOUT_PATH: CFG.AFTER_CHECKOUT_PATH || "",

    EDGE_FN_CHECKOUT: CFG.EDGE_FN_CHECKOUT || "stripe-create-checkout-session",
  };

  const STR = {
    title: "Abonnement",
    subtitle: "Active les modules dont ton entreprise a besoin",
    heroTitle: "Choisis ton offre. Active tes modules.",
    heroBody:
      "Facturation, interventions, et bien plus. Commence simple, puis fais evoluer ton entreprise au meme endroit.",
    sessionExpired: "Session expirée. Merci de te reconnecter.",
    orgMissing: "Aucune organisation trouvée pour ce compte.",
    plansError: "Impossible de charger les offres.",
    subscribeCta: "Souscrire",
    currentPlan: "Offre actuelle",
    statusActive: "Actif",
    statusTrial: "Essai",
    statusPastDue: "Paiement en attente",
    statusCanceled: "Inactif",
    billingMonthly: "Mensuel",
    billingAnnual: "Annuel",
    loading: "Chargement…",
    checkoutError: "Impossible de démarrer le paiement.",
    supabaseError: "Erreur: Supabase non initialisé. Vérifie la configuration.",
    loginCta: "Se connecter",
    trust1: "Paiement securise via Stripe",
    trust2: "Annulation simple",
    trust3: "Acces instantane aux modules",
    annualSave: "Economise avec l'annuel",
    recommended: "Le plus choisi",
    currentLabel: "Actif",
    missingPlans: "Aucune offre disponible.",
    pricingFootnote:
      "Les prix affiches sont indicatifs. Les taxes, mentions et facturation dependent de ton paramétrage et de ta situation.",
  };

  function getCached(key) {
    try {
      return String(localStorage.getItem(key) || "");
    } catch {
      return "";
    }
  }

  function resolveLoginPath() {
    const fromCfg = String(CONFIG.LOGIN_PATH || "").trim();
    if (fromCfg) return fromCfg;
    const cached = getCached("mbl-app-login-path").trim();
    if (cached) return cached;
    return "/application/login";
  }

  function resolveAfterCheckoutPath() {
    const fromCfg = String(CONFIG.AFTER_CHECKOUT_PATH || "").trim();
    if (fromCfg) return fromCfg;
    const cachedRoot = getCached("mbl-app-root").trim();
    if (cachedRoot) return cachedRoot;
    return "/application";
  }

  const PATHS = {
    login: resolveLoginPath(),
    afterCheckout: resolveAfterCheckoutPath(),
  };

  function findRoot() {
    return document.querySelector(CONFIG.ROOT_SELECTOR) || document.querySelector("#abonnement-root") || document.body;
  }

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

  function resolveThemePrimary(rootEl) {
    const ds = rootEl?.dataset || {};
    const fromDs = String(ds.themePrimary || ds.primary || "").trim();
    if (fromDs) return fromDs;
    const fromCfg = String(CFG.THEME_PRIMARY || CFG.themePrimary || "").trim();
    if (fromCfg) return fromCfg;

    const candidates = ["--mbl-primary", "--primary", "--brand", "--color-primary", "--color-brand"];
    for (const key of candidates) {
      const v = readCssVar(key);
      if (v) return v;
    }

    return "#0ea5e9";
  }

  function parseColorToRgb(color) {
    const c = String(color || "").trim();
    if (!c) return null;

    // #rgb or #rrggbb
    const hex3 = /^#([0-9a-f]{3})$/i.exec(c);
    const hex6 = /^#([0-9a-f]{6})$/i.exec(c);
    if (hex3) {
      const h = hex3[1];
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return { r, g, b };
    }
    if (hex6) {
      const h = hex6[1];
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return { r, g, b };
    }

    // rgb(...) / rgba(...)
    const m = c
      .replace(/\s+/g, "")
      .match(/^rgba?\((\d{1,3})[,/](\d{1,3})[,/](\d{1,3})(?:[,/][0-9.]+)?\)$/i);
    if (m) {
      const r = Math.max(0, Math.min(255, Number(m[1])));
      const g = Math.max(0, Math.min(255, Number(m[2])));
      const b = Math.max(0, Math.min(255, Number(m[3])));
      return { r, g, b };
    }

    return null;
  }

  function pickRecommendedPlan(plans) {
    const byCode = (code) => plans.find((p) => String(p?.code || "").toLowerCase() === code);
    return (
      byCode("growth") ||
      byCode("pro") ||
      plans.find((p) => p?.modules?.billing && p?.modules?.interventions) ||
      plans[Math.floor(plans.length / 2)] ||
      null
    );
  }

  async function ensureScript(id, src, readyCheck) {
    if (typeof readyCheck === "function" && readyCheck()) return;

    let script = document.querySelector('script[data-mbl-lib="' + id + '"]');
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.mblLib = id;
      document.head.appendChild(script);
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(new Error("Echec chargement script: " + src));
      };

      script.addEventListener("load", done, { once: true });
      script.addEventListener("error", fail, { once: true });
      setTimeout(() => {
        if (typeof readyCheck === "function" && readyCheck()) done();
      }, 500);
    });

    if (typeof readyCheck === "function" && !readyCheck()) {
      throw new Error("Script charge mais global indisponible: " + src);
    }
  }

  async function getSupabase() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (!window.supabase?.createClient) {
      await ensureScript("supabase", CONFIG.SUPABASE_CDN, function () {
        return Boolean(window.supabase && window.supabase.createClient);
      });
    }

    if (!window.supabase?.createClient) throw new Error("Supabase non charge.");

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

  async function getSupabaseClient() {
    if (supabase) return supabase;
    supabase = await getSupabase();
    return supabase;
  }

  function formatCents(cents) {
    const n = Number(cents || 0);
    return (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function formatCompactCents(cents) {
    const n = Number(cents || 0) / 100;
    // 0 => "0 €" is fine.
    return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
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

  function subscriptionLabel(sub) {
    const status = String(sub?.status || "");
    if (status === "active") return STR.statusActive;
    if (status === "trialing") return STR.statusTrial;
    if (status === "past_due") return STR.statusPastDue;
    return STR.statusCanceled;
  }

  async function getCurrentUser() {
    const client = await getSupabaseClient();
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      client.auth.getSession(),
      client.auth.getUser(),
    ]);
    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgId(userId) {
    const explicit = String(CFG.ORGANIZATION_ID || window.__MBL_ORG_ID__ || "").trim();
    if (explicit) return explicit;

    const client = await getSupabaseClient();
    const { data, error } = await client
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

  async function loadPlans() {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("billing_plans")
      .select("id, code, name, description, monthly_price_cents, annual_price_cents, modules, limits, is_active")
      .eq("is_active", true)
      .order("monthly_price_cents", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function loadCurrentSubscription(orgId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("organization_subscriptions")
      .select("id, organization_id, status, starts_at, ends_at, trial_ends_at, plan:plan_id(id, code, name, modules)")
      .eq("organization_id", orgId)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  function buildSuccessUrl() {
    const base = location.origin + String(PATHS.afterCheckout || "/application");
    return base;
  }

  function buildCancelUrl() {
    return location.href;
  }

  async function startCheckout(orgId, planCode, interval) {
    const payload = {
      organization_id: orgId,
      plan_code: planCode,
      interval,
      success_url: buildSuccessUrl(),
      cancel_url: buildCancelUrl(),
    };

    const supabase = await getSupabaseClient();
    const res = await supabase.functions.invoke(CONFIG.EDGE_FN_CHECKOUT, { body: payload });
    if (res.error) throw new Error(res.error.message);
    const url = res.data?.url || res.data?.checkout_url || "";
    if (!url) throw new Error("URL Checkout manquante.");
    window.location.href = url;
  }

  function injectStyles() {
    if (document.getElementById("mbl-abonnement-styles")) return;
    const style = document.createElement("style");
    style.id = "mbl-abonnement-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      html[data-page="abonnement"] .sb-shell,
      html[data-page="abonnement"] .sb-shell * { box-sizing: border-box; }

      html[data-page="abonnement"] .sb-shell {
        font-family: "Manrope", sans-serif;
        --sb-ink: #0f172a;
        --sb-soft: #5b708a;
        --sb-border: #d9e7ff;
        --sb-surface: rgba(255,255,255,0.78);
        --sb-surface-2: rgba(255,255,255,0.92);
        --sb-shadow: 0 16px 40px rgba(15, 23, 42, 0.10);
        --sb-shadow-soft: 0 10px 24px rgba(15, 23, 42, 0.06);
        --sb-radius: 18px;
        --sb-radius-sm: 14px;
        --sb-primary-rgb: 14, 165, 233;
        --sb-primary2-rgb: 37, 99, 235;
        --sb-primary3-rgb: 15, 118, 110;
        --sb-primary: #0ea5e9;
        --sb-primary-2: #2563eb;
        --sb-primary-3: #0f766e;
        color: var(--sb-ink);
        position: relative;
        overflow: hidden;
        border-radius: var(--sb-radius);
        border: 1px solid #d3e2ff;
        padding: 18px;
        background:
          radial-gradient(1100px 520px at -6% -18%, rgba(var(--sb-primary-rgb), 0.18), transparent 60%),
          radial-gradient(980px 520px at 106% 0, rgba(var(--sb-primary2-rgb), 0.12), transparent 62%),
          linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
      }

      html[data-page="abonnement"] .sb-bg {
        position: absolute;
        inset: -120px;
        pointer-events: none;
        z-index: 0;
      }

      html[data-page="abonnement"] .sb-orb {
        position: absolute;
        width: 520px;
        height: 520px;
        border-radius: 999px;
        filter: blur(30px);
        opacity: 0.55;
        transform: translate3d(0,0,0);
        animation: sbFloat 12s ease-in-out infinite;
      }

      html[data-page="abonnement"] .sb-orb--a {
        left: -120px;
        top: -140px;
        background: radial-gradient(circle at 30% 30%, rgba(var(--sb-primary-rgb), 0.62), transparent 62%);
      }
      html[data-page="abonnement"] .sb-orb--b {
        right: -180px;
        top: -80px;
        width: 620px;
        height: 620px;
        background: radial-gradient(circle at 35% 35%, rgba(var(--sb-primary2-rgb), 0.48), transparent 62%);
        animation-duration: 15s;
      }
      html[data-page="abonnement"] .sb-orb--c {
        left: 30%;
        bottom: -260px;
        width: 700px;
        height: 700px;
        opacity: 0.28;
        background: radial-gradient(circle at 40% 40%, rgba(var(--sb-primary3-rgb), 0.46), transparent 60%);
        animation-duration: 18s;
      }

      html[data-page="abonnement"] .sb-content { position: relative; z-index: 1; }

      html[data-page="abonnement"] .sb-hero {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 14px;
        align-items: start;
        margin-bottom: 14px;
      }

      html[data-page="abonnement"] .sb-eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: var(--sb-soft);
      }

      html[data-page="abonnement"] .sb-title {
        margin: 6px 0 0;
        font-family: "Space Grotesk", sans-serif;
        font-size: 34px;
        line-height: 1.05;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--sb-ink);
      }

      html[data-page="abonnement"] .sb-subtitle {
        margin: 10px 0 0;
        color: var(--sb-soft);
        line-height: 1.6;
        font-size: 14px;
      }

      html[data-page="abonnement"] .sb-trust {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      html[data-page="abonnement"] .sb-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(210,225,255,0.95);
        color: #1e293b;
        font-weight: 700;
        font-size: 12px;
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.04);
      }

      html[data-page="abonnement"] .sb-pill-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: linear-gradient(180deg, var(--sb-primary), var(--sb-primary-2));
        box-shadow: 0 0 0 3px rgba(var(--sb-primary-rgb), 0.18);
      }

      html[data-page="abonnement"] .sb-right {
        display: grid;
        gap: 10px;
        background: rgba(255,255,255,0.76);
        border: 1px solid rgba(210,225,255,0.95);
        border-radius: var(--sb-radius);
        padding: 12px;
        box-shadow: var(--sb-shadow-soft);
        backdrop-filter: blur(6px);
      }

      html[data-page="abonnement"] .sb-current {
        display: grid;
        gap: 10px;
      }
      html[data-page="abonnement"] .sb-current-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="abonnement"] .sb-current-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        color: var(--sb-soft);
        font-weight: 800;
      }
      html[data-page="abonnement"] .sb-status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid rgba(210,225,255,0.95);
        background: rgba(255,255,255,0.78);
      }
      html[data-page="abonnement"] .sb-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #94a3b8;
      }
      html[data-page="abonnement"] .sb-status.is-active .sb-status-dot { background: #22c55e; }
      html[data-page="abonnement"] .sb-status.is-trial .sb-status-dot { background: #f59e0b; }
      html[data-page="abonnement"] .sb-status.is-past_due .sb-status-dot { background: #ef4444; }

      html[data-page="abonnement"] .sb-current-name {
        font-family: "Space Grotesk", sans-serif;
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      html[data-page="abonnement"] .sb-current-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--sb-soft);
        font-size: 12px;
        line-height: 1.4;
      }
      html[data-page="abonnement"] .sb-current-meta strong { color: var(--sb-ink); }

      html[data-page="abonnement"] .sb-toggle {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        background: rgba(255,255,255,0.74);
        border: 1px solid rgba(210,225,255,0.95);
        border-radius: 999px;
        padding: 4px;
        overflow: hidden;
      }
      html[data-page="abonnement"] .sb-toggle-indicator {
        position: absolute;
        inset: 4px;
        width: calc(50% - 2px);
        border-radius: 999px;
        background: linear-gradient(180deg, var(--sb-primary), var(--sb-primary-2));
        box-shadow: 0 10px 30px rgba(var(--sb-primary-rgb), 0.28);
        transform: translateX(0);
        transition: transform .22s ease, filter .22s ease;
        filter: saturate(1.05);
      }
      html[data-page="abonnement"] .sb-toggle[data-interval="annual"] .sb-toggle-indicator {
        transform: translateX(100%);
      }
      html[data-page="abonnement"] .sb-toggle-btn {
        position: relative;
        z-index: 1;
        border: 0;
        background: transparent;
        border-radius: 999px;
        padding: 10px 10px;
        cursor: pointer;
        font-weight: 900;
        font-size: 13px;
        color: #0f172a;
        transition: opacity .18s ease;
      }
      html[data-page="abonnement"] .sb-toggle-btn.is-active { color: #fff; }
      html[data-page="abonnement"] .sb-toggle-sub {
        font-size: 12px;
        color: var(--sb-soft);
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="abonnement"] .sb-save {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(var(--sb-primary-rgb), 0.12);
        border: 1px solid rgba(var(--sb-primary-rgb), 0.22);
        color: #0c4a6e;
        font-weight: 900;
        white-space: nowrap;
      }

      html[data-page="abonnement"] .sb-banner {
        display: none;
        border-radius: 14px;
        padding: 10px 12px;
        border: 1px solid rgba(210,225,255,0.95);
        background: rgba(255,255,255,0.76);
        color: #0c4a6e;
        font-weight: 800;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        margin-bottom: 12px;
      }
      html[data-page="abonnement"] .sb-banner.is-error {
        border-color: rgba(255, 170, 182, 0.9);
        background: rgba(255, 241, 244, 0.92);
        color: #9f1733;
      }

      html[data-page="abonnement"] .sb-plans {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      html[data-page="abonnement"] .sb-card {
        position: relative;
        border: 1px solid rgba(210,225,255,0.95);
        border-radius: var(--sb-radius);
        background: rgba(255,255,255,0.86);
        box-shadow: var(--sb-shadow-soft);
        padding: 14px;
        backdrop-filter: blur(6px);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        min-height: 300px;
        display: grid;
        grid-template-rows: auto auto auto 1fr auto;
        gap: 10px;
      }

      html[data-page="abonnement"] .sb-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 22px 55px rgba(15, 23, 42, 0.12);
        border-color: rgba(var(--sb-primary-rgb), 0.35);
      }

      html[data-page="abonnement"] .sb-card[data-featured="1"] {
        border-color: rgba(var(--sb-primary-rgb), 0.55);
        box-shadow: 0 28px 80px rgba(var(--sb-primary-rgb), 0.14), 0 10px 24px rgba(15, 23, 42, 0.06);
      }
      html[data-page="abonnement"] .sb-card[data-featured="1"]::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: var(--sb-radius);
        pointer-events: none;
        background: linear-gradient(135deg, rgba(var(--sb-primary-rgb), 0.10), transparent 55%),
          linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.65));
        opacity: 0.65;
      }
      html[data-page="abonnement"] .sb-card[data-featured="1"] > * { position: relative; }

      html[data-page="abonnement"] .sb-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 900;
        color: #0c4a6e;
        background: rgba(var(--sb-primary-rgb), 0.14);
        border: 1px solid rgba(var(--sb-primary-rgb), 0.28);
      }

      html[data-page="abonnement"] .sb-plan-title {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 18px;
      }
      html[data-page="abonnement"] .sb-plan-desc {
        margin: 0;
        color: var(--sb-soft);
        line-height: 1.55;
        font-size: 13px;
        min-height: 44px;
      }

      html[data-page="abonnement"] .sb-price {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="abonnement"] .sb-price-main {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      html[data-page="abonnement"] .sb-price-value {
        font-size: 34px;
        font-weight: 900;
        letter-spacing: -0.02em;
        color: var(--sb-ink);
      }
      html[data-page="abonnement"] .sb-price-suffix {
        font-size: 13px;
        font-weight: 800;
        color: var(--sb-soft);
      }
      html[data-page="abonnement"] .sb-price-meta {
        margin-top: -4px;
        font-size: 12px;
        color: var(--sb-soft);
        line-height: 1.4;
      }

      html[data-page="abonnement"] .sb-feats {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }
      html[data-page="abonnement"] .sb-feats li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: #1f3a56;
        font-size: 13px;
        line-height: 1.35;
      }
      html[data-page="abonnement"] .sb-feats li::before {
        content: "";
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        border-radius: 8px;
        margin-top: 1px;
        background: linear-gradient(180deg, var(--sb-primary), var(--sb-primary-2));
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M20.285 6.709a1 1 0 0 1 0 1.414l-9.192 9.192a1 1 0 0 1-1.414 0L3.715 11.35a1 1 0 1 1 1.414-1.414l4.257 4.257 8.485-8.485a1 1 0 0 1 1.414 0Z'/%3E%3C/svg%3E");
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
        -webkit-mask-size: 14px 14px;
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M20.285 6.709a1 1 0 0 1 0 1.414l-9.192 9.192a1 1 0 0 1-1.414 0L3.715 11.35a1 1 0 1 1 1.414-1.414l4.257 4.257 8.485-8.485a1 1 0 0 1 1.414 0Z'/%3E%3C/svg%3E");
        mask-repeat: no-repeat;
        mask-position: center;
        mask-size: 14px 14px;
      }

      html[data-page="abonnement"] .sb-btn {
        width: 100%;
        border: 1px solid rgba(210,225,255,0.95);
        background: rgba(255,255,255,0.74);
        color: #0f172a;
        border-radius: 14px;
        padding: 11px 12px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
      }
      html[data-page="abonnement"] .sb-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 26px rgba(15, 23, 42, 0.12);
        border-color: rgba(var(--sb-primary-rgb), 0.35);
      }
      html[data-page="abonnement"] .sb-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }
      html[data-page="abonnement"] .sb-btn--primary {
        border-color: transparent;
        background: linear-gradient(180deg, var(--sb-primary), var(--sb-primary-2));
        color: #fff;
        box-shadow: 0 18px 45px rgba(var(--sb-primary-rgb), 0.22);
      }
      html[data-page="abonnement"] .sb-btn--primary:hover {
        box-shadow: 0 22px 60px rgba(var(--sb-primary-rgb), 0.30);
      }

      html[data-page="abonnement"] .sb-foot {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(210,225,255,0.95);
        color: var(--sb-soft);
        font-size: 12px;
        line-height: 1.5;
      }

      html[data-page="abonnement"] .sb-skel {
        position: relative;
        overflow: hidden;
      }
      html[data-page="abonnement"] .sb-skel::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
        transform: translateX(-60%);
        animation: sbShimmer 1.2s ease-in-out infinite;
      }

      html[data-page="abonnement"] .sb-anim { opacity: 0; transform: translateY(10px); }
      html[data-page="abonnement"] .sb-shell.is-ready .sb-anim {
        animation: sbEnter .68s cubic-bezier(.2,.9,.2,1) var(--sb-delay, 0ms) forwards;
      }

      @keyframes sbEnter { to { opacity: 1; transform: translateY(0); } }
      @keyframes sbShimmer { to { transform: translateX(60%); } }
      @keyframes sbFloat {
        0%, 100% { transform: translate3d(0,0,0) scale(1); }
        50% { transform: translate3d(0,12px,0) scale(1.03); }
      }

      @media (prefers-reduced-motion: reduce) {
        html[data-page="abonnement"] .sb-orb { animation: none !important; }
        html[data-page="abonnement"] .sb-shell.is-ready .sb-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
        html[data-page="abonnement"] .sb-toggle-indicator { transition: none !important; }
        html[data-page="abonnement"] .sb-card,
        html[data-page="abonnement"] .sb-btn { transition: none !important; }
      }

      @media (max-width: 980px) {
        html[data-page="abonnement"] .sb-hero { grid-template-columns: 1fr; }
        html[data-page="abonnement"] .sb-title { font-size: 30px; }
        html[data-page="abonnement"] .sb-plans { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderShell(root, themePrimary) {
    const rgb = parseColorToRgb(themePrimary) || { r: 14, g: 165, b: 233 };
    const styleVars = `--sb-primary:${escapeHTML(themePrimary)};--sb-primary-rgb:${rgb.r},${rgb.g},${rgb.b};`;
    root.innerHTML = `
      <section class="sb-shell" style="${styleVars}">
        <div class="sb-bg" aria-hidden="true">
          <div class="sb-orb sb-orb--a"></div>
          <div class="sb-orb sb-orb--b"></div>
          <div class="sb-orb sb-orb--c"></div>
        </div>
        <div class="sb-content">
          <header class="sb-hero sb-anim">
            <div>
              <div class="sb-eyebrow">${escapeHTML(STR.subtitle)}</div>
              <h1 class="sb-title">${escapeHTML(STR.heroTitle)}</h1>
              <p class="sb-subtitle">${escapeHTML(STR.heroBody)}</p>
              <div class="sb-trust">
                <div class="sb-pill"><span class="sb-pill-dot"></span>${escapeHTML(STR.trust1)}</div>
                <div class="sb-pill"><span class="sb-pill-dot"></span>${escapeHTML(STR.trust2)}</div>
                <div class="sb-pill"><span class="sb-pill-dot"></span>${escapeHTML(STR.trust3)}</div>
              </div>
            </div>
            <aside class="sb-right sb-anim" data-side>
              <div class="sb-current" data-current></div>
              <div>
                <div class="sb-toggle" data-toggle data-interval="monthly" role="tablist" aria-label="Choix de facturation">
                  <span class="sb-toggle-indicator" aria-hidden="true"></span>
                  <button type="button" class="sb-toggle-btn is-active" data-interval="monthly" role="tab" aria-selected="true">${escapeHTML(
                    STR.billingMonthly
                  )}</button>
                  <button type="button" class="sb-toggle-btn" data-interval="annual" role="tab" aria-selected="false">${escapeHTML(
                    STR.billingAnnual
                  )}</button>
                </div>
                <div class="sb-toggle-sub">
                  <span>${escapeHTML(STR.annualSave)}</span>
                  <span class="sb-save" data-save>—</span>
                </div>
              </div>
            </aside>
          </header>
          <div class="sb-banner" data-banner></div>
          <div class="sb-plans" data-grid></div>
          <footer class="sb-foot sb-anim">${escapeHTML(STR.pricingFootnote)}</footer>
        </div>
      </section>
    `;

    return {
      current: root.querySelector("[data-current]"),
      banner: root.querySelector("[data-banner]"),
      grid: root.querySelector("[data-grid]"),
      toggle: root.querySelector("[data-toggle]"),
      intervalBtns: Array.from(root.querySelectorAll(".sb-toggle-btn[data-interval]")),
      saveHint: root.querySelector("[data-save]"),
      shell: root.querySelector(".sb-shell"),
    };
  }

  function showBanner(els, msg, kind) {
    if (!els.banner) return;
    els.banner.textContent = msg || "";
    els.banner.style.display = msg ? "block" : "none";
    els.banner.classList.toggle("is-error", kind === "error");
  }

  function renderCurrent(els, sub, opts) {
    if (!els.current) return;
    const isLogged = Boolean(opts && opts.isLogged);
    if (!sub) {
      if (!isLogged) {
        els.current.innerHTML = `
          <div class="sb-current-head">
            <div class="sb-current-label">${escapeHTML(STR.currentPlan)}</div>
            <div class="sb-status"><span class="sb-status-dot"></span>—</div>
          </div>
          <p class="sb-current-name">—</p>
          <div class="sb-current-meta">
            <span>Connecte-toi pour gerer ton abonnement.</span>
          </div>
          <a class="sb-btn sb-btn--primary" href="${escapeHTML(
            PATHS.login
          )}" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">${escapeHTML(
            STR.loginCta
          )}</a>
        `;
      } else {
        els.current.innerHTML = `
          <div class="sb-current-head">
            <div class="sb-current-label">${escapeHTML(STR.currentPlan)}</div>
            <div class="sb-status"><span class="sb-status-dot"></span>${escapeHTML(STR.statusCanceled)}</div>
          </div>
          <p class="sb-current-name">Aucun abonnement actif</p>
          <div class="sb-current-meta">
            <span>Choisis une offre ci-dessous pour activer tes modules.</span>
          </div>
        `;
      }
      return;
    }

    const planName = sub?.plan?.name || "—";
    const label = subscriptionLabel(sub);

    const status = String(sub?.status || "").toLowerCase();
    const statusClass =
      status === "active"
        ? "is-active"
        : status === "trialing"
          ? "is-trial"
          : status === "past_due"
            ? "is-past_due"
            : "";

    els.current.innerHTML = `
      <div class="sb-current-head">
        <div class="sb-current-label">${escapeHTML(STR.currentPlan)}</div>
        <div class="sb-status ${statusClass}"><span class="sb-status-dot"></span>${escapeHTML(label)}</div>
      </div>
      <p class="sb-current-name">${escapeHTML(planName)}</p>
      <div class="sb-current-meta">
        <span><strong>Statut:</strong> ${escapeHTML(label)}</span>
        ${sub?.ends_at ? `<span><strong>Fin:</strong> ${escapeHTML(String(sub.ends_at).slice(0, 10))}</span>` : ""}
      </div>
    `;
  }

  function computeAnnualSavings(plans) {
    // If the plan data supports it, compute a reasonable savings label.
    // Otherwise return a neutral hint.
    if (!Array.isArray(plans) || !plans.length) return "—";
    let best = 0;
    for (const p of plans) {
      const m = Number(p?.monthly_price_cents || 0);
      const a = Number(p?.annual_price_cents || 0);
      if (m > 0 && a > 0) {
        const full = m * 12;
        const save = Math.max(0, full - a);
        const pct = full > 0 ? Math.round((save / full) * 100) : 0;
        if (pct > best) best = pct;
      }
    }
    if (best >= 5) return `Jusqu'a -${best}%`;
    return "—";
  }

  function modulesList(modules, limits) {
    const m = modules && typeof modules === "object" ? modules : {};
    const l = limits && typeof limits === "object" ? limits : {};
    const rows = [];

    if (m.billing) {
      rows.push("Devis & factures conformes (France)");
      rows.push("Clients, catalogue produits, TVA et mentions");
    }
    if (m.interventions) {
      rows.push("Gestion des interventions (planning, techniciens)");
      rows.push("PV, photos, signature et suivi terrain");
    }

    if (l && typeof l === "object") {
      if (Number.isFinite(Number(l.max_users)) && Number(l.max_users) > 0) {
        rows.push(`Jusqu'a ${Number(l.max_users)} utilisateurs`);
      }
    }

    // Always add a trust baseline.
    rows.push("Support et mises a jour incluses");

    return rows;
  }

  function renderSkeleton(els) {
    if (!els.grid) return;
    els.grid.innerHTML = `
      ${Array.from({ length: 3 })
        .map(
          (_, i) => `
          <article class="sb-card sb-skel">
            <div style="height:18px; width:${i === 1 ? "62%" : i === 2 ? "48%" : "55%"}; border-radius:10px; background:rgba(15,23,42,0.10);"></div>
            <div style="height:42px; width:100%; border-radius:12px; background:rgba(15,23,42,0.08);"></div>
            <div style="height:56px; width:100%; border-radius:12px; background:rgba(15,23,42,0.06);"></div>
            <div style="height:90px; width:100%; border-radius:12px; background:rgba(15,23,42,0.05);"></div>
            <div style="height:44px; width:100%; border-radius:14px; background:rgba(14,165,233,0.22);"></div>
          </article>
        `
        )
        .join("")}
    `;
  }

  function renderPlans(els, plans, interval, currentSub, onSubscribe, recommendedPlan) {
    els.grid.innerHTML = "";
    const activeCode = currentSub?.plan?.code || "";
    const recommendedCode = String(recommendedPlan?.code || "");

    plans.forEach((p, idx) => {
      const card = document.createElement("article");
      card.className = "sb-card sb-anim";
      card.style.setProperty("--sb-delay", Math.min(idx * 90, 450) + "ms");

      const isFeatured = recommendedCode && String(p?.code || "") === recommendedCode;
      card.dataset.featured = isFeatured ? "1" : "0";

      const monthly = Number(p.monthly_price_cents || 0);
      const annual = Number(p.annual_price_cents || 0);

      const pricePerMonthCents = interval === "annual" && annual > 0 ? Math.round(annual / 12) : monthly;
      const priceLabel = formatCompactCents(pricePerMonthCents);
      const suffix = "/mois";

      let meta = "";
      if (interval === "annual" && annual > 0) {
        const full = monthly > 0 ? monthly * 12 : 0;
        const save = full > 0 ? Math.max(0, full - annual) : 0;
        const pct = full > 0 ? Math.round((save / full) * 100) : 0;
        meta = `Facture ${formatCents(annual)} / an` + (pct >= 5 ? ` (economise ${pct}%)` : "");
      } else if (monthly > 0) {
        meta = "Sans engagement";
      }

      const li = modulesList(p.modules, p.limits).map((x) => `<li>${escapeHTML(x)}</li>`).join("");
      const isCurrent = activeCode && String(activeCode) === String(p.code) && isActiveSubscription(currentSub);

      card.innerHTML = `
        ${isFeatured ? `<div class="sb-badge"><span class="sb-pill-dot"></span>${escapeHTML(STR.recommended)}</div>` : ""}
        <div>
          <h3 class="sb-plan-title">${escapeHTML(p.name || p.code)}</h3>
          <p class="sb-plan-desc">${escapeHTML(p.description || "")}</p>
        </div>
        <div>
          <div class="sb-price">
            <div class="sb-price-main">
              <div class="sb-price-value">${escapeHTML(priceLabel)}</div>
              <div class="sb-price-suffix">${escapeHTML(suffix)}</div>
            </div>
          </div>
          <div class="sb-price-meta">${escapeHTML(meta)}</div>
        </div>
        <ul class="sb-feats">${li}</ul>
        <button type="button" class="sb-btn ${isFeatured ? "sb-btn--primary" : ""}" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? escapeHTML(STR.currentLabel) : escapeHTML(STR.subscribeCta)}
        </button>
      `;

      const btn = card.querySelector(".sb-btn");
      btn.addEventListener("click", () => onSubscribe(p, btn));
      els.grid.appendChild(card);
    });
  }

  function kickoffAnimations(els) {
    const shell = els?.shell;
    if (!shell) return;
    const nodes = Array.from(shell.querySelectorAll(".sb-anim"));
    nodes.forEach((n, idx) => n.style.setProperty("--sb-delay", Math.min(idx * 80, 560) + "ms"));
    requestAnimationFrame(() => shell.classList.add("is-ready"));
  }

  const root = findRoot();
  if (!root) return;

  injectStyles();
  const themePrimary = resolveThemePrimary(root);
  const els = renderShell(root, themePrimary);
  kickoffAnimations(els);
  renderSkeleton(els);

  const state = {
    interval: "monthly",
    orgId: "",
    userId: "",
    plans: [],
    subscription: null,
    loading: true,
    recommended: null,
    isLogged: false,
  };

  const handleSubscribe = async (plan, btn) => {
    if (!plan) return;
    if (!state.orgId) {
      showBanner(els, STR.orgMissing, "error");
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Redirection…";
    try {
      await startCheckout(state.orgId, plan.code, state.interval);
    } catch (e) {
      console.error(e);
      showBanner(els, `${STR.checkoutError} ${e?.message || ""}`.trim(), "error");
      btn.disabled = false;
      btn.textContent = prev || STR.subscribeCta;
    }
  };

  els.intervalBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.interval || "monthly";
      state.interval = next;
      els.intervalBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (els.toggle) els.toggle.setAttribute("data-interval", next);
      renderCurrent(els, state.subscription, { isLogged: state.isLogged });
      if (state.loading) return;
      if (els.saveHint) els.saveHint.textContent = computeAnnualSavings(state.plans);
      renderPlans(els, state.plans, state.interval, state.subscription, handleSubscribe, state.recommended);
    });
  });

  try {
    showBanner(els, STR.loading, "");

    try {
      await getSupabaseClient();
    } catch (e) {
      console.error("[ABONNEMENT] supabase init error:", e);
      showBanner(els, STR.supabaseError, "error");
      return;
    }

    const user = await getCurrentUser();
    if (!user) {
      showBanner(els, STR.sessionExpired, "error");
      state.isLogged = false;
      renderCurrent(els, null, { isLogged: false });
      return;
    }
    state.userId = user.id;
    state.isLogged = true;

    state.orgId = await resolveOrgId(user.id);
    if (!state.orgId) {
      showBanner(els, STR.orgMissing, "error");
      return;
    }

    const [plans, sub] = await Promise.all([loadPlans(), loadCurrentSubscription(state.orgId)]);
    state.plans = plans;
    state.subscription = sub;
    state.recommended = pickRecommendedPlan(plans);

    if (!plans || !plans.length) {
      showBanner(els, STR.missingPlans, "error");
      return;
    }

    showBanner(els, "", "");
    state.loading = false;
    renderCurrent(els, state.subscription, { isLogged: true });
    if (els.saveHint) els.saveHint.textContent = computeAnnualSavings(state.plans);
    renderPlans(els, state.plans, state.interval, state.subscription, handleSubscribe, state.recommended);

  } catch (e) {
    console.error("[ABONNEMENT] init error:", e);
    showBanner(els, STR.plansError, "error");
  }
});
