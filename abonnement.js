document.documentElement.setAttribute("data-page", "abonnement");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const supabase = window.__MBL_SUPABASE__;
  const CFG = window.__MBL_CFG__ || {};

  if (!supabase) {
    console.error("[ABONNEMENT] Supabase global introuvable. Vérifie que le protect global est bien chargé.");
    return;
  }

  const CONFIG = {
    ROOT_SELECTOR: "[data-abonnement]",
    LOGIN_PATH: CFG.LOGIN_PATH || "/login",
    AFTER_CHECKOUT_PATH: CFG.AFTER_CHECKOUT_PATH || "/applications",
    EDGE_FN_CHECKOUT: CFG.EDGE_FN_CHECKOUT || "stripe-create-checkout-session",
  };

  const STR = {
    title: "Abonnement",
    subtitle: "Active les modules dont ton entreprise a besoin",
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
  };

  function findRoot() {
    return document.querySelector(CONFIG.ROOT_SELECTOR) || document.querySelector("#abonnement-root") || document.body;
  }

  function formatCents(cents) {
    const n = Number(cents || 0);
    return (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
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
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgId(userId) {
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

  async function loadPlans() {
    const { data, error } = await supabase
      .from("billing_plans")
      .select("id, code, name, description, monthly_price_cents, annual_price_cents, modules, is_active")
      .eq("is_active", true)
      .order("monthly_price_cents", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function loadCurrentSubscription(orgId) {
    const { data, error } = await supabase
      .from("organization_subscriptions")
      .select("id, organization_id, status, starts_at, ends_at, trial_ends_at, plan:plan_id(id, code, name, modules)")
      .eq("organization_id", orgId)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  function modulesList(modules) {
    const m = modules && typeof modules === "object" ? modules : {};
    const rows = [];
    if (m.billing) rows.push("Facturation (devis, factures, clients)");
    if (m.interventions) rows.push("Interventions (terrain, techniciens)");
    return rows.length ? rows : ["Modules personnalisables"];
  }

  function buildSuccessUrl() {
    const base = location.origin + String(CONFIG.AFTER_CHECKOUT_PATH || "/applications");
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
      html[data-page="abonnement"] .mbl-sub-shell { font-family: inherit; color:#0b2240; }
      html[data-page="abonnement"] .mbl-sub-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:14px; }
      html[data-page="abonnement"] .mbl-sub-h1 { margin:0; font-size:24px; font-weight:900; color:#143a61; }
      html[data-page="abonnement"] .mbl-sub-sub { color:#55708c; margin-top:4px; }
      html[data-page="abonnement"] .mbl-sub-toggle { display:flex; gap:8px; align-items:center; }
      html[data-page="abonnement"] .mbl-chip {
        border:1px solid #cfe0ef;
        background:#ffffff;
        color:#0c4a6e;
        padding:8px 10px;
        border-radius:999px;
        font-weight:800;
        cursor:pointer;
      }
      html[data-page="abonnement"] .mbl-chip.is-active { background:#0ea5e9; border-color:#0ea5e9; color:#fff; }
      html[data-page="abonnement"] .mbl-banner { display:none; margin: 10px 0 14px; border-radius:12px; padding:10px 12px; border:1px solid #d6e2ee; background:#f7fbff; color:#0c4a6e; font-weight:700; }
      html[data-page="abonnement"] .mbl-banner.is-error { border-color:#ffc9d2; background:#fff1f4; color:#9f1733; }
      html[data-page="abonnement"] .mbl-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px; }
      html[data-page="abonnement"] .mbl-card {
        border:1px solid #d6e2ee;
        border-radius:16px;
        background: linear-gradient(180deg, #ffffff, #f6faff);
        box-shadow: 0 12px 30px rgba(12, 37, 66, 0.08);
        padding: 14px 14px 12px;
      }
      html[data-page="abonnement"] .mbl-card h3 { margin:0; font-size:16px; font-weight:900; color:#143a61; }
      html[data-page="abonnement"] .mbl-card .desc { color:#55708c; margin-top:6px; min-height: 38px; }
      html[data-page="abonnement"] .mbl-card .price { margin-top:10px; font-size:22px; font-weight:900; color:#0c4a6e; }
      html[data-page="abonnement"] .mbl-card ul { margin:10px 0 0; padding-left: 18px; color:#294f74; }
      html[data-page="abonnement"] .mbl-btn {
        margin-top: 12px;
        width: 100%;
        border:1px solid #0ea5e9;
        background:#0ea5e9;
        color:#fff;
        border-radius:12px;
        padding:10px 12px;
        font-weight:900;
        cursor:pointer;
      }
      html[data-page="abonnement"] .mbl-btn:disabled { opacity:.55; cursor:not-allowed; }
      html[data-page="abonnement"] .mbl-k { font-size:12px; color:#5a7490; font-weight:700; }
      html[data-page="abonnement"] .mbl-v { font-weight:900; color:#143a61; }
      html[data-page="abonnement"] .mbl-current { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:10px; }
      @media (max-width: 980px) { html[data-page="abonnement"] .mbl-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function renderShell(root) {
    root.innerHTML = `
      <section class="mbl-sub-shell">
        <div class="mbl-sub-head">
          <div>
            <h1 class="mbl-sub-h1">${STR.title}</h1>
            <div class="mbl-sub-sub">${STR.subtitle}</div>
            <div class="mbl-current" data-current></div>
          </div>
          <div class="mbl-sub-toggle">
            <button type="button" class="mbl-chip is-active" data-interval="monthly">${STR.billingMonthly}</button>
            <button type="button" class="mbl-chip" data-interval="annual">${STR.billingAnnual}</button>
          </div>
        </div>
        <div class="mbl-banner" data-banner></div>
        <div class="mbl-grid" data-grid></div>
      </section>
    `;

    return {
      current: root.querySelector("[data-current]"),
      banner: root.querySelector("[data-banner]"),
      grid: root.querySelector("[data-grid]"),
      intervalBtns: Array.from(root.querySelectorAll("[data-interval]")),
    };
  }

  function showBanner(els, msg, kind) {
    if (!els.banner) return;
    els.banner.textContent = msg || "";
    els.banner.style.display = msg ? "block" : "none";
    els.banner.classList.toggle("is-error", kind === "error");
  }

  function renderCurrent(els, sub) {
    if (!els.current) return;
    if (!sub) {
      els.current.innerHTML = `<div class="mbl-k">${STR.currentPlan}:</div><div class="mbl-v">—</div>`;
      return;
    }

    const planName = sub?.plan?.name || "—";
    const label = subscriptionLabel(sub);
    els.current.innerHTML = `
      <div class="mbl-k">${STR.currentPlan}:</div><div class="mbl-v">${planName}</div>
      <div class="mbl-k">Statut:</div><div class="mbl-v">${label}</div>
    `;
  }

  function renderPlans(els, plans, interval, currentSub, onSubscribe) {
    els.grid.innerHTML = "";
    const activeCode = currentSub?.plan?.code || "";
    plans.forEach((p) => {
      const card = document.createElement("article");
      card.className = "mbl-card";

      const price =
        interval === "annual" ? formatCents(p.annual_price_cents) : formatCents(p.monthly_price_cents);
      const li = modulesList(p.modules).map((x) => `<li>${x}</li>`).join("");
      const isCurrent = activeCode && String(activeCode) === String(p.code) && isActiveSubscription(currentSub);

      card.innerHTML = `
        <h3>${p.name || p.code}</h3>
        <div class="desc">${p.description || ""}</div>
        <div class="price">${price}<span style="font-size:12px; font-weight:800; color:#5a7490;"> / ${interval === "annual" ? "an" : "mois"}</span></div>
        <ul>${li}</ul>
        <button type="button" class="mbl-btn" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? "Actif" : STR.subscribeCta}
        </button>
      `;

      const btn = card.querySelector(".mbl-btn");
      btn.addEventListener("click", () => onSubscribe(p, btn));
      els.grid.appendChild(card);
    });
  }

  const root = findRoot();
  if (!root) return;

  injectStyles();
  const els = renderShell(root);

  const state = {
    interval: "monthly",
    orgId: "",
    userId: "",
    plans: [],
    subscription: null,
    loading: true,
  };

  els.intervalBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.interval || "monthly";
      state.interval = next;
      els.intervalBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCurrent(els, state.subscription);
      renderPlans(els, state.plans, state.interval, state.subscription);
    });
  });

  try {
    showBanner(els, STR.loading, "");

    const user = await getCurrentUser();
    if (!user) {
      showBanner(els, STR.sessionExpired, "error");
      return;
    }
    state.userId = user.id;

    state.orgId = await resolveOrgId(user.id);
    if (!state.orgId) {
      showBanner(els, STR.orgMissing, "error");
      return;
    }

    const [plans, sub] = await Promise.all([loadPlans(), loadCurrentSubscription(state.orgId)]);
    state.plans = plans;
    state.subscription = sub;

    showBanner(els, "", "");
    renderCurrent(els, state.subscription);
    renderPlans(els, state.plans, state.interval, state.subscription, async (plan, btn) => {
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
    });
  } catch (e) {
    console.error("[ABONNEMENT] init error:", e);
    showBanner(els, STR.plansError, "error");
  }
});

