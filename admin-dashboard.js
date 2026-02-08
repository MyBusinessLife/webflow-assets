document.documentElement.setAttribute("data-page", "admin-dashboard");

(() => {
  "use strict";

  if (window.__mblAdminDashboardLoaded) return;
  window.__mblAdminDashboardLoaded = true;

  document.documentElement.setAttribute("data-page", "admin-dashboard");

  const DEFAULT_CONFIG = {
    container: "[data-mbl-admin-dashboard],#mbl-admin-dashboard,.mbl-admin-dashboard",
    supabaseUrl: "",
    supabaseAnonKey: "",
    locale: "fr-FR",
    currency: "EUR",
    maxRows: 10000,
    injectCss: true,
    echartsCdn: "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
    supabaseCdn: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    dateField: "start_at",
    defaultPreset: "all",
    tarifUnit: "auto", // "auto" | "euro" | "cent"
    statusBuckets: {
      done: [
        "done",
        "completed",
        "terminee",
        "termine",
        "cloturee",
        "closed",
        "resolu",
      ],
      inProgress: [
        "in_progress",
        "en cours",
        "ongoing",
        "started",
        "assigned",
        "confirmed",
      ],
      pending: [
        "todo",
        "a_planifier",
        "scheduled",
        "pending",
        "new",
        "draft",
        "planned",
        "planifiee",
        "planifie",
      ],
      canceled: ["cancel", "cancelled", "annulee", "annule", "rejected"],
    },
    labels: {
      title: "Dashboard Admin",
      subtitle: "Pilotage business, performance terrain et rentabilite",
    },
    statusColors: {
      done: "#1ec98a",
      inprogress: "#4ea2ff",
      pending: "#ffb954",
      canceled: "#ff6b6b",
      other: "#9da7b5",
    },
  };

  const state = {
    config: null,
    supabase: null,
    charts: {
      trend: null,
      status: null,
      clients: null,
      tech: null,
    },
    data: {
      interventions: [],
      expenses: [],
      compensations: [],
      assignees: [],
      profiles: [],
    },
    indices: {
      costByIntervention: new Map(),
      assigneesByIntervention: new Map(),
      profileById: new Map(),
    },
    filteredRows: [],
    sort: {
      key: "effective_date",
      direction: "desc",
    },
    filters: {
      preset: "all",
      startDate: "",
      endDate: "",
      userId: "all",
      client: "all",
      status: "all",
      search: "",
    },
    loading: false,
  };

  const SELECTORS = {
    shell: ".mbl-shell",
    tableBody: ".mbl-table-body",
    lastSync: ".mbl-last-sync",
    filtersForm: ".mbl-filters",
    kpiArea: ".mbl-kpi-grid",
    errorBox: ".mbl-error",
    refreshButton: ".mbl-refresh",
    exportButton: ".mbl-export",
    trendChart: ".mbl-chart-trend",
    statusChart: ".mbl-chart-status",
    clientsChart: ".mbl-chart-clients",
    techChart: ".mbl-chart-tech",
  };

  const DASHBOARD_CSS = `
    [data-mbl-admin-dashboard], #mbl-admin-dashboard, .mbl-admin-dashboard {
      position: relative;
      min-height: 100%;
    }

    .mbl-shell {
      --brand-teal: #0f766e;
      --brand-blue: #0c4a6e;
      --brand-sky: #0ea5e9;
      --bg-0: #f4f8fc;
      --bg-1: #edf4fb;
      --stroke: #d6e1ed;
      --text-main: #10233f;
      --text-soft: #55708c;
      --card-bg: #ffffff;
      position: relative;
      overflow: hidden;
      padding: clamp(14px, 1.9vw, 28px);
      color: var(--text-main);
      font-family: inherit;
      background:
        radial-gradient(900px 420px at 8% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
        radial-gradient(880px 480px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
        linear-gradient(180deg, var(--bg-0), var(--bg-1));
      border-radius: 20px;
      border: 1px solid var(--stroke);
      isolation: isolate;
      box-shadow: 0 16px 34px rgba(12, 37, 66, 0.08);
    }

    .mbl-shell::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background-image:
        linear-gradient(rgba(12, 74, 110, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(12, 74, 110, 0.04) 1px, transparent 1px);
      background-size: 30px 30px;
      opacity: 0.45;
      pointer-events: none;
    }

    .mbl-bg-glow {
      position: absolute;
      width: clamp(180px, 26vw, 420px);
      aspect-ratio: 1;
      border-radius: 999px;
      filter: blur(55px);
      opacity: 0.35;
      pointer-events: none;
      z-index: -1;
    }

    .mbl-bg-glow-a {
      top: -18%;
      left: -6%;
      background: radial-gradient(circle at center, rgba(15, 118, 110, 0.52), transparent 72%);
      animation: mblFloatA 12s ease-in-out infinite;
    }

    .mbl-bg-glow-b {
      right: -7%;
      bottom: -30%;
      background: radial-gradient(circle at center, rgba(14, 165, 233, 0.44), transparent 70%);
      animation: mblFloatB 14s ease-in-out infinite;
    }

    @keyframes mblFloatA {
      0% { transform: translate3d(0, 0, 0); }
      50% { transform: translate3d(16px, -10px, 0); }
      100% { transform: translate3d(0, 0, 0); }
    }

    @keyframes mblFloatB {
      0% { transform: translate3d(0, 0, 0); }
      50% { transform: translate3d(-14px, 8px, 0); }
      100% { transform: translate3d(0, 0, 0); }
    }

    .mbl-shell.is-loading::after {
      content: "Chargement des donnees...";
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(245, 250, 255, 0.72);
      backdrop-filter: blur(2px);
      color: #294f74;
      letter-spacing: 0.02em;
      font-weight: 700;
      z-index: 9;
    }

    .mbl-card {
      background: var(--card-bg);
      border: 1px solid var(--stroke);
      border-radius: 16px;
      box-shadow: 0 10px 20px rgba(12, 37, 66, 0.06);
    }

    .mbl-header {
      padding: clamp(14px, 1.8vw, 24px);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
      background: linear-gradient(
        130deg,
        rgba(15, 118, 110, 0.08),
        rgba(14, 165, 233, 0.05) 45%,
        rgba(255, 255, 255, 0.9) 78%
      );
    }

    .mbl-header-title-wrap {
      min-width: min(460px, 100%);
    }

    .mbl-overline {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #0f766e;
      font-size: 10px;
      font-weight: 700;
    }

    .mbl-title {
      margin: 0;
      font-size: clamp(23px, 3.2vw, 36px);
      line-height: 1.05;
      letter-spacing: -0.02em;
      color: #0c3154;
      font-weight: 800;
    }

    .mbl-subtitle {
      margin: 8px 0 0;
      color: var(--text-soft);
      max-width: 700px;
    }

    .mbl-header-actions {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: max-content;
      gap: 8px;
      align-items: center;
      justify-content: end;
      width: fit-content;
    }

    .mbl-btn {
      border: 0;
      cursor: pointer;
      border-radius: 11px;
      padding: 10px 14px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
      transition: transform 0.18s ease, opacity 0.2s ease, box-shadow 0.25s ease;
    }

    .mbl-btn:hover { transform: translateY(-1px); }
    .mbl-btn:active { transform: translateY(0); }

    .mbl-btn-solid {
      color: #ffffff;
      background: linear-gradient(120deg, #0f766e, #0c4a6e);
      box-shadow: 0 8px 20px rgba(12, 74, 110, 0.23);
    }

    .mbl-btn-ghost {
      color: #0c4a6e;
      border: 1px solid rgba(12, 74, 110, 0.22);
      background: #ffffff;
    }

    .mbl-last-sync {
      display: block;
      font-size: 11px;
      color: var(--text-soft);
      margin-left: 4px;
    }

    .mbl-filters {
      margin-top: 14px;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 10px;
    }

    .mbl-filter {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .mbl-filter-search {
      grid-column: span 2;
    }

    .mbl-filter label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #5c7590;
      font-weight: 700;
    }

    .mbl-filter input,
    .mbl-filter select {
      border: 1px solid #cfdeeb;
      outline: none;
      border-radius: 10px;
      padding: 10px 11px;
      font-size: 13px;
      line-height: 1;
      background: #ffffff;
      color: #10233f;
      min-width: 0;
    }

    .mbl-filter input::placeholder { color: #8095ad; }
    .mbl-filter input:focus,
    .mbl-filter select:focus {
      border-color: #0ea5e9;
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
    }

    .mbl-error {
      margin-top: 12px;
      background: #fff1f4;
      border: 1px solid #ffc9d2;
      color: #9f1733;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 600;
    }

    .mbl-kpi-grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .mbl-kpi {
      padding: 14px;
      position: relative;
      overflow: hidden;
      animation: mblStagger 0.35s ease both;
      animation-delay: calc(var(--idx, 0) * 50ms);
      background: linear-gradient(180deg, #ffffff, #f8fbff);
    }

    .mbl-kpi::before {
      content: "";
      position: absolute;
      inset: auto -28% -58% auto;
      width: 130px;
      aspect-ratio: 1;
      border-radius: 999px;
      opacity: 0.21;
      pointer-events: none;
    }

    .mbl-kpi-label {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #5d7590;
      font-weight: 700;
    }

    .mbl-kpi-value {
      margin: 8px 0 0;
      font-size: clamp(19px, 2.1vw, 27px);
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.02em;
      color: #0e2c4b;
    }

    .tone-blue::before { background: radial-gradient(circle at center, #0ea5e9, transparent 70%); }
    .tone-green::before { background: radial-gradient(circle at center, #0f766e, transparent 70%); }
    .tone-amber::before { background: radial-gradient(circle at center, #f59e0b, transparent 70%); }
    .tone-red::before { background: radial-gradient(circle at center, #ef4444, transparent 70%); }
    .tone-slate::before { background: radial-gradient(circle at center, #94a3b8, transparent 70%); }
    .tone-violet::before { background: radial-gradient(circle at center, #6366f1, transparent 70%); }

    .mbl-analytics-grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .mbl-chart-card {
      padding: 12px;
      min-height: 300px;
    }

    .mbl-chart-card h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      color: #143a61;
      letter-spacing: 0.01em;
    }

    .mbl-chart {
      height: 250px;
      width: 100%;
    }

    .mbl-table-card {
      margin-top: 14px;
      padding: 12px;
    }

    .mbl-table-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mbl-table-head h2 {
      margin: 0;
      font-size: 15px;
      color: #143a61;
      font-weight: 700;
    }

    .mbl-table-count {
      font-size: 12px;
      color: #5c7590;
      font-weight: 700;
    }

    .mbl-table-wrap {
      overflow: auto;
      border-radius: 12px;
      border: 1px solid #d6e2ee;
      background: #ffffff;
    }

    .mbl-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1100px;
    }

    .mbl-table thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: linear-gradient(180deg, #f3f8fe, #edf4fc);
      color: #55708c;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.06em;
      font-weight: 700;
      padding: 10px 8px;
      white-space: nowrap;
      border-bottom: 1px solid #d6e2ee;
      cursor: pointer;
      text-align: left;
    }

    .mbl-table tbody td {
      font-size: 13px;
      color: #203a57;
      border-top: 1px solid #e2ebf3;
      padding: 10px 8px;
      vertical-align: top;
    }

    .mbl-table tbody tr:hover td {
      background: #f6fbff;
    }

    .mbl-main {
      margin: 0;
      font-weight: 700;
      color: #143a61;
    }

    .mbl-sub {
      margin: 4px 0 0;
      color: #6f87a0;
      font-size: 12px;
    }

    .mbl-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .mbl-chip-done {
      background: #e8f9f4;
      border-color: #9ddfc8;
      color: #0f766e;
    }
    .mbl-chip-progress {
      background: #e9f5ff;
      border-color: #a9d6ff;
      color: #0c4a6e;
    }
    .mbl-chip-pending {
      background: #fff6e8;
      border-color: #f9d39b;
      color: #b76a00;
    }
    .mbl-chip-cancel {
      background: #ffeef1;
      border-color: #ffc3cc;
      color: #be123c;
    }
    .mbl-chip-other {
      background: #f1f5f9;
      border-color: #d5dfea;
      color: #5f7187;
    }

    .ta-right {
      text-align: right;
      white-space: nowrap;
      font-feature-settings: "tnum" 1, "lnum" 1;
    }

    .is-positive { color: #0f766e; font-weight: 700; }
    .is-negative { color: #be123c; font-weight: 700; }

    .mbl-empty {
      text-align: center;
      color: #72889f;
      padding: 28px 10px;
      font-weight: 600;
    }

    @keyframes mblStagger {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 1180px) {
      .mbl-filters { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .mbl-filter-search { grid-column: span 2; }
      .mbl-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .mbl-analytics-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .mbl-shell { padding: 10px; border-radius: 14px; }
      .mbl-header { padding: 12px; }
      .mbl-header-actions {
        width: 100%;
        grid-auto-flow: row;
        grid-auto-columns: 1fr;
        justify-items: stretch;
      }
      .mbl-btn { width: 100%; }
      .mbl-last-sync { margin: 0; font-size: 10px; }
      .mbl-filters { grid-template-columns: 1fr 1fr; }
      .mbl-filter-search { grid-column: span 2; }
      .mbl-kpi-grid { grid-template-columns: 1fr; }
      .mbl-chart-card { min-height: 265px; }
      .mbl-chart { height: 230px; }
    }
  `;

  function init(userConfig) {
    const globalConfig = getGlobalConfig();
    const config = Object.assign({}, DEFAULT_CONFIG, globalConfig, userConfig || {});
    config.labels = Object.assign(
      {},
      DEFAULT_CONFIG.labels,
      globalConfig.labels || {},
      (userConfig && userConfig.labels) || {}
    );
    config.statusBuckets = Object.assign(
      {},
      DEFAULT_CONFIG.statusBuckets,
      globalConfig.statusBuckets || {},
      (userConfig && userConfig.statusBuckets) || {}
    );
    state.config = config;
    return bootstrap(config);
  }

  async function bootstrap(baseConfig) {
    const root = getRoot(baseConfig.container);
    if (!root) {
      throw new Error(
        "MBLAdminDashboard: container introuvable. Verifie le selecteur container."
      );
    }

    const rootConfig = readRootConfig(root);
    const config = Object.assign({}, baseConfig, rootConfig);
    config.container = root;
    state.config = config;

    if (root.dataset.mblDashboardMounted === "1") {
      return {
        refresh: refreshAll,
        destroy: () => destroy(root),
      };
    }
    root.dataset.mblDashboardMounted = "1";

    ensureCss(config);
    renderShell(root, config.labels);
    setLoading(true);
    bindGlobalEvents(root);

    try {
      if (!window.__MBL_SUPABASE__ && !(window.supabase && window.supabase.createClient)) {
        await ensureScript("supabase", config.supabaseCdn, function () {
          return Boolean(window.supabase && window.supabase.createClient);
        });
      }

      if (!window.echarts) {
        try {
          await ensureScript("echarts", config.echartsCdn, function () {
            return Boolean(window.echarts);
          });
        } catch (chartError) {
          console.warn("[MBL DASHBOARD] ECharts indisponible:", chartError);
        }
      }

      initSupabase(config);
      primeDefaultDates();
      applyDatePreset(config.defaultPreset || "all", true);
      await refreshAll();
      return {
        refresh: refreshAll,
        destroy: () => destroy(root),
      };
    } catch (error) {
      renderError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  function destroy(root) {
    if (state.charts.trend) state.charts.trend.dispose();
    if (state.charts.status) state.charts.status.dispose();
    if (state.charts.clients) state.charts.clients.dispose();
    if (state.charts.tech) state.charts.tech.dispose();
    state.charts.trend = null;
    state.charts.status = null;
    state.charts.clients = null;
    state.charts.tech = null;
    root.dataset.mblDashboardMounted = "0";
    root.innerHTML = "";
  }

  function getRoot(selector) {
    if (!selector) return null;
    if (typeof selector === "string") return document.querySelector(selector);
    if (selector instanceof HTMLElement) return selector;
    return null;
  }

  function ensureCss(config) {
    if (!config.injectCss) return;
    if (document.getElementById("mbl-admin-dashboard-styles")) return;

    const style = document.createElement("style");
    style.id = "mbl-admin-dashboard-styles";
    style.textContent = DASHBOARD_CSS;
    document.head.appendChild(style);
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

  function initSupabase(config) {
    if (window.__MBL_SUPABASE__) {
      state.supabase = window.__MBL_SUPABASE__;
      return;
    }
    if (window.__techSupabase) {
      state.supabase = window.__techSupabase;
      return;
    }
    if (window.__mblDashboardSupabase) {
      state.supabase = window.__mblDashboardSupabase;
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("MBLAdminDashboard: client Supabase indisponible.");
    }

    const supabaseUrl = config.supabaseUrl || "";
    const supabaseAnonKey = config.supabaseAnonKey || "";
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "MBLAdminDashboard: renseigne __MBL_SUPABASE__ ou supabaseUrl/supabaseAnonKey."
      );
    }

    state.supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    window.__mblDashboardSupabase = state.supabase;
  }

  function getGlobalConfig() {
    const cfg = window.__MBL_DASHBOARD_CFG__ || {};
    const base = window.__MBL_CFG__ || {};
    return {
      container: cfg.container || base.ADMIN_DASHBOARD_SELECTOR || DEFAULT_CONFIG.container,
      supabaseUrl:
        cfg.supabaseUrl ||
        cfg.SUPABASE_URL ||
        base.supabaseUrl ||
        base.SUPABASE_URL ||
        "",
      supabaseAnonKey:
        cfg.supabaseAnonKey ||
        cfg.SUPABASE_ANON_KEY ||
        base.supabaseAnonKey ||
        base.SUPABASE_ANON_KEY ||
        "",
      locale: cfg.locale || base.locale || DEFAULT_CONFIG.locale,
      currency: cfg.currency || base.currency || DEFAULT_CONFIG.currency,
      maxRows: toNumber(cfg.maxRows || base.maxRows) || DEFAULT_CONFIG.maxRows,
      labels: cfg.labels || null,
      statusBuckets: cfg.statusBuckets || null,
    };
  }

  function readRootConfig(root) {
    const ds = root.dataset || {};
    const out = {};
    if (ds.supabaseUrl) out.supabaseUrl = ds.supabaseUrl;
    if (ds.supabaseAnonKey) out.supabaseAnonKey = ds.supabaseAnonKey;
    if (ds.locale) out.locale = ds.locale;
    if (ds.currency) out.currency = ds.currency;
    if (toNumber(ds.maxRows) > 0) out.maxRows = toNumber(ds.maxRows);
    if (ds.tarifUnit) out.tarifUnit = ds.tarifUnit;
    return out;
  }

  function primeDefaultDates() {
    const now = new Date();
    state.filters.endDate = toInputDate(now);
    const d30 = new Date(now);
    d30.setDate(now.getDate() - 30);
    state.filters.startDate = toInputDate(d30);
  }

  function toInputDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function renderShell(root, labels) {
    root.innerHTML = `
      <section class="mbl-shell is-loading">
        <div class="mbl-bg-glow mbl-bg-glow-a"></div>
        <div class="mbl-bg-glow mbl-bg-glow-b"></div>

        <header class="mbl-header mbl-card">
          <div class="mbl-header-title-wrap">
            <p class="mbl-overline">Admin analytics</p>
            <h1 class="mbl-title">${escapeHtml(labels.title || "")}</h1>
            <p class="mbl-subtitle">${escapeHtml(labels.subtitle || "")}</p>
          </div>
          <div class="mbl-header-actions">
            <button class="mbl-btn mbl-btn-ghost mbl-export" type="button">Exporter CSV</button>
            <button class="mbl-btn mbl-btn-solid mbl-refresh" type="button">Rafraichir</button>
            <span class="mbl-last-sync">Derniere synchro: --</span>
          </div>
        </header>

        <section class="mbl-filters mbl-card">
          <div class="mbl-filter">
            <label for="mbl-preset">Periode</label>
            <select id="mbl-preset" name="preset">
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="90d">90 derniers jours</option>
              <option value="ytd">Depuis debut annee</option>
              <option value="all">Tout</option>
              <option value="custom">Personnalisee</option>
            </select>
          </div>
          <div class="mbl-filter">
            <label for="mbl-start-date">Date debut</label>
            <input id="mbl-start-date" name="startDate" type="date" />
          </div>
          <div class="mbl-filter">
            <label for="mbl-end-date">Date fin</label>
            <input id="mbl-end-date" name="endDate" type="date" />
          </div>
          <div class="mbl-filter">
            <label for="mbl-user">Technicien</label>
            <select id="mbl-user" name="userId">
              <option value="all">Tous</option>
            </select>
          </div>
          <div class="mbl-filter">
            <label for="mbl-client">Client</label>
            <select id="mbl-client" name="client">
              <option value="all">Tous</option>
            </select>
          </div>
          <div class="mbl-filter">
            <label for="mbl-status">Statut</label>
            <select id="mbl-status" name="status">
              <option value="all">Tous</option>
            </select>
          </div>
          <div class="mbl-filter mbl-filter-search">
            <label for="mbl-search">Recherche</label>
            <input id="mbl-search" name="search" type="search" placeholder="Ref, titre, client, adresse..." />
          </div>
        </section>

        <section class="mbl-error" hidden></section>

        <section class="mbl-kpi-grid"></section>

        <section class="mbl-analytics-grid">
          <article class="mbl-card mbl-chart-card">
            <h2>CA / Couts / Benefice</h2>
            <div class="mbl-chart mbl-chart-trend"></div>
          </article>
          <article class="mbl-card mbl-chart-card">
            <h2>Repartition statuts</h2>
            <div class="mbl-chart mbl-chart-status"></div>
          </article>
          <article class="mbl-card mbl-chart-card">
            <h2>Top clients par CA</h2>
            <div class="mbl-chart mbl-chart-clients"></div>
          </article>
          <article class="mbl-card mbl-chart-card">
            <h2>Top techniciens par CA</h2>
            <div class="mbl-chart mbl-chart-tech"></div>
          </article>
        </section>

        <section class="mbl-card mbl-table-card">
          <div class="mbl-table-head">
            <h2>Interventions detaillees</h2>
            <span class="mbl-table-count">0 ligne</span>
          </div>
          <div class="mbl-table-wrap">
            <table class="mbl-table">
              <thead>
                <tr>
                  <th data-sort="internal_ref">Ref</th>
                  <th data-sort="title">Intervention</th>
                  <th data-sort="client_name">Client</th>
                  <th data-sort="status">Statut</th>
                  <th data-sort="assignees">Techniciens</th>
                  <th data-sort="effective_date">Debut</th>
                  <th data-sort="end_at">Fin</th>
                  <th data-sort="revenue">CA</th>
                  <th data-sort="cost">Couts</th>
                  <th data-sort="profit">Benefice</th>
                  <th data-sort="margin">Marge</th>
                </tr>
              </thead>
              <tbody class="mbl-table-body"></tbody>
            </table>
          </div>
        </section>
      </section>
    `;

    const form = root.querySelector(SELECTORS.filtersForm);
    if (form) {
      const presetInput = form.querySelector("#mbl-preset");
      const startInput = form.querySelector("#mbl-start-date");
      const endInput = form.querySelector("#mbl-end-date");
      if (presetInput) presetInput.value = state.filters.preset || "all";
      startInput.value = state.filters.startDate;
      endInput.value = state.filters.endDate;
    }
  }

  function bindGlobalEvents(root) {
    root.addEventListener("click", function (event) {
      const th = event.target.closest("th[data-sort]");
      if (th) {
        const key = th.getAttribute("data-sort");
        if (state.sort.key === key) {
          state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
        } else {
          state.sort.key = key;
          state.sort.direction = "asc";
        }
        updateDashboard();
      }
    });

    const filters = root.querySelector(SELECTORS.filtersForm);
    if (filters) {
      filters.addEventListener("change", function (event) {
        const target = event.target;
        if (!target || !target.name) return;

        if (target.name === "preset") {
          applyDatePreset(target.value, false);
        } else if (target.name === "startDate" || target.name === "endDate") {
          state.filters.preset = "custom";
          const presetInput = filters.querySelector("#mbl-preset");
          if (presetInput) presetInput.value = "custom";
          state.filters[target.name] = target.value;
          updateDashboard();
        } else {
          state.filters[target.name] = target.value;
          updateDashboard();
        }
      });

      const search = filters.querySelector("#mbl-search");
      if (search) {
        search.addEventListener("input", debounce(function () {
          state.filters.search = search.value || "";
          updateDashboard();
        }, 180));
      }
    }

    const refreshButton = root.querySelector(SELECTORS.refreshButton);
    if (refreshButton) {
      refreshButton.addEventListener("click", async function () {
        await refreshAll();
      });
    }

    const exportButton = root.querySelector(SELECTORS.exportButton);
    if (exportButton) {
      exportButton.addEventListener("click", function () {
        exportCsv(state.filteredRows);
      });
    }

    window.addEventListener("resize", debounce(resizeCharts, 120));
  }

  function resizeCharts() {
    if (state.charts.trend) state.charts.trend.resize();
    if (state.charts.status) state.charts.status.resize();
    if (state.charts.clients) state.charts.clients.resize();
    if (state.charts.tech) state.charts.tech.resize();
  }

  function applyDatePreset(preset, silent) {
    state.filters.preset = preset;
    const now = new Date();
    let start = null;
    let end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (preset === "7d") {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
    } else if (preset === "30d") {
      start = new Date(now);
      start.setDate(now.getDate() - 30);
    } else if (preset === "90d") {
      start = new Date(now);
      start.setDate(now.getDate() - 90);
    } else if (preset === "ytd") {
      start = new Date(now.getFullYear(), 0, 1);
    }

    state.filters.startDate = start ? toInputDate(start) : "";
    state.filters.endDate = preset === "all" ? "" : toInputDate(end);

    const root = getRoot(state.config.container);
    if (root) {
      const startInput = root.querySelector("#mbl-start-date");
      const endInput = root.querySelector("#mbl-end-date");
      if (startInput) startInput.value = state.filters.startDate;
      if (endInput) endInput.value = state.filters.endDate;
    }

    if (!silent) updateDashboard();
  }

  async function refreshAll() {
    setLoading(true);
    clearError();

    try {
      const payload = await fetchDashboardPayload();
      state.data = payload;
      state.indices = buildIndices(payload);
      hydrateFilterOptions();
      updateDashboard();
      updateLastSync();
    } catch (error) {
      renderError(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDashboardPayload() {
    let query = state.supabase
      .from("interventions")
      .select(
        "id,internal_ref,title,client_name,client_ref,address,status,start_at,end_at,tarif,created_at,updated_at,pv_status"
      )
      .order(state.config.dateField || "start_at", { ascending: false, nullsFirst: false })
      .limit(state.config.maxRows);

    const interventionsResult = await query;
    if (interventionsResult.error) throw interventionsResult.error;
    const interventions = interventionsResult.data || [];

    if (!interventions.length) {
      return {
        interventions: [],
        expenses: [],
        compensations: [],
        assignees: [],
        profiles: [],
      };
    }

    const interventionIds = interventions.map((row) => row.id).filter(Boolean);
    const [expenses, compensations, assignees] = await Promise.all([
      fetchRowsByInterventionIds(
        "intervention_expenses",
        "intervention_id,amount_cents,qty,unit_cost_cents,type,created_at",
        interventionIds
      ),
      fetchRowsByInterventionIds(
        "intervention_compensations",
        "intervention_id,tech_id,amount_cents,status,created_at",
        interventionIds
      ),
      fetchRowsByInterventionIds(
        "intervention_assignees",
        "intervention_id,user_id,created_at",
        interventionIds
      ),
    ]);

    const profileIds = Array.from(
      new Set(
        []
          .concat(assignees.map((a) => a.user_id))
          .concat(compensations.map((c) => c.tech_id))
          .filter(Boolean)
      )
    );
    const profiles = await fetchProfiles(profileIds);

    return {
      interventions,
      expenses,
      compensations,
      assignees,
      profiles,
    };
  }

  async function fetchProfiles(ids) {
    if (!ids || !ids.length) return [];

    const chunks = chunk(ids, 700);
    const out = [];
    for (const idsChunk of chunks) {
      const response = await state.supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,role,user_type,is_active")
        .in("id", idsChunk);

      if (response.error) {
        console.warn("MBLAdminDashboard profiles error:", response.error);
        continue;
      }
      out.push.apply(out, response.data || []);
    }
    return out;
  }

  async function fetchRowsByInterventionIds(table, selectColumns, ids) {
    if (!ids || !ids.length) return [];
    const chunks = chunk(ids, 800);
    const out = [];

    for (const idsChunk of chunks) {
      const response = await state.supabase
        .from(table)
        .select(selectColumns)
        .in("intervention_id", idsChunk);

      if (response.error) {
        console.warn("MBLAdminDashboard " + table + " error:", response.error);
        continue;
      }
      out.push.apply(out, response.data || []);
    }
    return out;
  }

  function chunk(input, size) {
    const arr = [];
    for (let i = 0; i < input.length; i += size) {
      arr.push(input.slice(i, i + size));
    }
    return arr;
  }

  function buildIndices(payload) {
    const profileById = new Map();
    (payload.profiles || []).forEach((p) => profileById.set(p.id, p));

    const assigneesByIntervention = new Map();
    (payload.assignees || []).forEach((item) => {
      if (!item.intervention_id) return;
      if (!assigneesByIntervention.has(item.intervention_id)) {
        assigneesByIntervention.set(item.intervention_id, []);
      }
      assigneesByIntervention.get(item.intervention_id).push(item.user_id);
    });

    const costsByIntervention = new Map();

    (payload.expenses || []).forEach((row) => {
      const amountCents =
        toNumber(row.amount_cents) ||
        toNumber(row.unit_cost_cents) * Math.max(1, toNumber(row.qty) || 1);
      addMapValue(costsByIntervention, row.intervention_id, amountCents / 100);
    });

    (payload.compensations || []).forEach((row) => {
      const status = normalizeStatus(row.status);
      if (status === "canceled" || status === "cancelled" || status === "rejected") {
        return;
      }
      const amountCents = toNumber(row.amount_cents);
      addMapValue(costsByIntervention, row.intervention_id, amountCents / 100);

       if (row.intervention_id && row.tech_id) {
        if (!assigneesByIntervention.has(row.intervention_id)) {
          assigneesByIntervention.set(row.intervention_id, []);
        }
        const arr = assigneesByIntervention.get(row.intervention_id);
        if (!arr.includes(row.tech_id)) arr.push(row.tech_id);
      }
    });

    return {
      costByIntervention: costsByIntervention,
      assigneesByIntervention,
      profileById,
    };
  }

  function addMapValue(map, key, value) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + (toNumber(value) || 0));
  }

  function hydrateFilterOptions() {
    const root = getRoot(state.config.container);
    if (!root) return;

    const userSelect = root.querySelector("#mbl-user");
    const clientSelect = root.querySelector("#mbl-client");
    const statusSelect = root.querySelector("#mbl-status");

    const userIds = new Set();
    state.data.assignees.forEach((a) => {
      if (a.user_id) userIds.add(a.user_id);
    });
    state.data.compensations.forEach((c) => {
      if (c.tech_id) userIds.add(c.tech_id);
    });

    const users = [];
    userIds.forEach((id) => {
      const profile = state.indices.profileById.get(id);
      users.push({
        id,
        label: profile ? profileLabel(profile) : "User " + id.slice(0, 8),
      });
    });
    users.sort((a, b) => a.label.localeCompare(b.label));

    const clientsSet = new Set();
    state.data.interventions.forEach((row) => {
      const client = (row.client_name || row.client_ref || "").trim();
      if (client) clientsSet.add(client);
    });
    const clients = Array.from(clientsSet).sort();

    const statusMap = new Map();
    state.data.interventions.forEach((row) => {
      const statusLabel = String(row.status || "").trim();
      const statusKey = normalizeStatus(statusLabel);
      if (!statusKey) return;
      if (!statusMap.has(statusKey)) statusMap.set(statusKey, statusLabel || statusKey);
    });
    const statuses = Array.from(statusMap.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, state.config.locale));

    fillSelect(userSelect, users, state.filters.userId, "id", "label");
    fillSelect(clientSelect, clients.map((label) => ({ id: label, label })), state.filters.client);
    fillSelect(statusSelect, statuses, state.filters.status);
  }

  function fillSelect(select, options, selected, valueKey, labelKey) {
    if (!select) return;
    const vKey = valueKey || "id";
    const lKey = labelKey || "label";
    const allOption = '<option value="all">Tous</option>';
    const dynamic = options
      .map((opt) => {
        const value = opt[vKey];
        const label = opt[lKey];
        const isSelected = selected === value ? " selected" : "";
        return (
          '<option value="' +
          escapeHtml(String(value)) +
          '"' +
          isSelected +
          ">" +
          escapeHtml(String(label)) +
          "</option>"
        );
      })
      .join("");
    select.innerHTML = allOption + dynamic;
  }

  function updateDashboard() {
    const rows = createEnrichedRows();
    const filtered = applyFilters(rows);
    const sorted = sortRows(filtered);
    state.filteredRows = sorted;

    renderKpis(sorted);
    renderTable(sorted);
    renderCharts(sorted);
  }

  function createEnrichedRows() {
    return (state.data.interventions || []).map((row) => {
      const revenue = parseTarifToEuros(row.tarif, state.config.tarifUnit);
      const cost = state.indices.costByIntervention.get(row.id) || 0;
      const profit = revenue - cost;
      const margin = revenue ? (profit / revenue) * 100 : 0;
      const userIds = state.indices.assigneesByIntervention.get(row.id) || [];
      const assignees = userIds.map((id) => {
        const profile = state.indices.profileById.get(id);
        return profile ? profileLabel(profile) : "User " + id.slice(0, 8);
      });

      const effectiveDate = row.start_at || row.created_at || row.updated_at || null;
      return {
        id: row.id,
        internal_ref: row.internal_ref || "",
        title: row.title || "",
        client_name: row.client_name || row.client_ref || "",
        address: row.address || "",
        status: row.status || "",
        status_bucket: classifyStatus(row.status),
        start_at: row.start_at,
        end_at: row.end_at,
        effective_date: effectiveDate,
        revenue,
        cost,
        profit,
        margin,
        assignees,
        assigneeIds: userIds,
      };
    });
  }

  function applyFilters(rows) {
    const startTs = state.filters.startDate
      ? new Date(state.filters.startDate + "T00:00:00").getTime()
      : null;
    const endTs = state.filters.endDate
      ? new Date(state.filters.endDate + "T23:59:59").getTime()
      : null;
    const userFilter = state.filters.userId;
    const clientFilter = state.filters.client;
    const statusFilter = normalizeStatus(state.filters.status);
    const searchFilter = normalizeStatus(state.filters.search).trim();

    return rows.filter((row) => {
      if (startTs || endTs) {
        const rowTs = row.effective_date ? new Date(row.effective_date).getTime() : null;
        if (!rowTs) return false;
        if (startTs && rowTs < startTs) return false;
        if (endTs && rowTs > endTs) return false;
      }

      if (userFilter !== "all" && !row.assigneeIds.includes(userFilter)) return false;
      if (clientFilter !== "all" && row.client_name !== clientFilter) return false;
      if (statusFilter !== "all" && normalizeStatus(row.status) !== statusFilter) return false;

      if (searchFilter) {
        const haystack = normalizeStatus(
          [row.internal_ref, row.title, row.client_name, row.address, row.status, row.assignees.join(" ")]
            .filter(Boolean)
            .join(" ")
        );
        if (!haystack.includes(searchFilter)) return false;
      }
      return true;
    });
  }

  function sortRows(rows) {
    const key = state.sort.key;
    const dir = state.sort.direction === "asc" ? 1 : -1;
    const sorted = rows.slice();

    sorted.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "assignees") {
        av = (a.assignees || []).join(", ");
        bv = (b.assignees || []).join(", ");
      }
      if (key === "effective_date" || key === "end_at") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      }
      if (["revenue", "cost", "profit", "margin"].includes(key)) {
        av = toNumber(av);
        bv = toNumber(bv);
      }

      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    return sorted;
  }

  function renderKpis(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const mount = root.querySelector(SELECTORS.kpiArea);
    if (!mount) return;

    const stats = computeStats(rows);
    const kpis = [
      { label: "CA", value: money(stats.revenue), tone: "blue" },
      { label: "Couts directs", value: money(stats.costs), tone: "amber" },
      { label: "Benefice net", value: money(stats.profit), tone: stats.profit >= 0 ? "green" : "red" },
      { label: "Marge", value: percent(stats.margin), tone: stats.margin >= 0 ? "green" : "red" },
      { label: "Interventions", value: String(stats.count), tone: "slate" },
      { label: "Terminees", value: String(stats.done), tone: "green" },
      { label: "En cours", value: String(stats.inProgress), tone: "blue" },
      { label: "Ticket moyen", value: money(stats.avgTicket), tone: "violet" },
    ];

    mount.innerHTML = kpis
      .map((kpi, index) => {
        return `
          <article class="mbl-card mbl-kpi tone-${kpi.tone}" style="--idx:${index}">
            <p class="mbl-kpi-label">${escapeHtml(kpi.label)}</p>
            <p class="mbl-kpi-value">${escapeHtml(kpi.value)}</p>
          </article>
        `;
      })
      .join("");
  }

  function computeStats(rows) {
    const revenue = sum(rows, "revenue");
    const costs = sum(rows, "cost");
    const profit = revenue - costs;
    const done = rows.filter((r) => r.status_bucket === "done").length;
    const inProgress = rows.filter((r) => r.status_bucket === "inProgress").length;

    return {
      count: rows.length,
      revenue,
      costs,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      done,
      inProgress,
      avgTicket: rows.length ? revenue / rows.length : 0,
    };
  }

  function sum(rows, key) {
    return rows.reduce((acc, row) => acc + toNumber(row[key]), 0);
  }

  function renderTable(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const tbody = root.querySelector(SELECTORS.tableBody);
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="mbl-empty">Aucune intervention pour ces filtres.</td>
        </tr>
      `;
      updateTableCount(0);
      return;
    }

    tbody.innerHTML = rows
      .map((row) => {
        return `
          <tr>
            <td>${escapeHtml(row.internal_ref || "-")}</td>
            <td>
              <p class="mbl-main">${escapeHtml(row.title || "Sans titre")}</p>
              <p class="mbl-sub">${escapeHtml(row.address || "")}</p>
            </td>
            <td>${escapeHtml(row.client_name || "-")}</td>
            <td>${statusChip(row.status)}</td>
            <td>${escapeHtml(row.assignees.join(", ") || "-")}</td>
            <td>${escapeHtml(formatDate(row.effective_date))}</td>
            <td>${escapeHtml(formatDate(row.end_at))}</td>
            <td class="ta-right">${escapeHtml(money(row.revenue))}</td>
            <td class="ta-right">${escapeHtml(money(row.cost))}</td>
            <td class="ta-right ${row.profit < 0 ? "is-negative" : "is-positive"}">${escapeHtml(
          money(row.profit)
        )}</td>
            <td class="ta-right ${row.margin < 0 ? "is-negative" : "is-positive"}">${escapeHtml(
          percent(row.margin)
        )}</td>
          </tr>
        `;
      })
      .join("");

    updateTableCount(rows.length);
  }

  function statusChip(status) {
    const bucket = classifyStatus(status);
    const colorClass =
      bucket === "done"
        ? "done"
        : bucket === "inProgress"
        ? "progress"
        : bucket === "pending"
        ? "pending"
        : bucket === "canceled"
        ? "cancel"
        : "other";

    return (
      '<span class="mbl-chip mbl-chip-' +
      colorClass +
      '">' +
      escapeHtml(status || "n/a") +
      "</span>"
    );
  }

  function updateTableCount(count) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const counter = root.querySelector(".mbl-table-count");
    if (counter) {
      counter.textContent = count + (count > 1 ? " lignes" : " ligne");
    }
  }

  function renderCharts(rows) {
    if (!window.echarts) return;

    renderTrendChart(rows);
    renderStatusChart(rows);
    renderClientsChart(rows);
    renderTechChart(rows);
  }

  function renderTrendChart(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const el = root.querySelector(SELECTORS.trendChart);
    if (!el) return;
    if (!state.charts.trend) state.charts.trend = window.echarts.init(el);

    const grouped = new Map();
    rows.forEach((row) => {
      if (!row.effective_date) return;
      const d = new Date(row.effective_date);
      const month = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      if (!grouped.has(month)) {
        grouped.set(month, { revenue: 0, cost: 0, profit: 0 });
      }
      const item = grouped.get(month);
      item.revenue += row.revenue;
      item.cost += row.cost;
      item.profit += row.profit;
    });

    const labels = Array.from(grouped.keys()).sort();
    const revenueSeries = labels.map((k) => round2(grouped.get(k).revenue));
    const costSeries = labels.map((k) => round2(grouped.get(k).cost));
    const profitSeries = labels.map((k) => round2(grouped.get(k).profit));

    state.charts.trend.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          valueFormatter: (value) => money(value),
        },
        legend: {
          data: ["CA", "Couts", "Benefice"],
          textStyle: { color: "#55708c", fontSize: 11 },
        },
        grid: {
          top: 36,
          left: 8,
          right: 8,
          bottom: 8,
          containLabel: true,
        },
        xAxis: {
          type: "category",
          data: labels.length ? labels : ["--"],
          boundaryGap: false,
          axisLabel: { color: "#5c7590" },
          axisLine: { lineStyle: { color: "#d5e3ef" } },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            color: "#5c7590",
            formatter: function (v) {
              return compactCurrency(v, state.config.locale, state.config.currency);
            },
          },
          splitLine: { lineStyle: { color: "#e5edf6", opacity: 1 } },
        },
        series: [
          {
            name: "CA",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#0c4a6e" },
            areaStyle: { opacity: 0.1, color: "#0c4a6e" },
            data: revenueSeries.length ? revenueSeries : [0],
          },
          {
            name: "Couts",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#f59e0b" },
            areaStyle: { opacity: 0.08, color: "#f59e0b" },
            data: costSeries.length ? costSeries : [0],
          },
          {
            name: "Benefice",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2.4, color: "#0f766e" },
            areaStyle: { opacity: 0.1, color: "#0f766e" },
            data: profitSeries.length ? profitSeries : [0],
          },
        ],
      },
      true
    );
  }

  function renderStatusChart(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const el = root.querySelector(SELECTORS.statusChart);
    if (!el) return;
    if (!state.charts.status) state.charts.status = window.echarts.init(el);

    const groups = {
      done: 0,
      inProgress: 0,
      pending: 0,
      canceled: 0,
      other: 0,
    };

    rows.forEach((row) => {
      const bucket = classifyStatus(row.status);
      groups[bucket] = (groups[bucket] || 0) + 1;
    });

    const data = [
      { name: "Terminees", value: groups.done, itemStyle: { color: "#0f766e" } },
      { name: "En cours", value: groups.inProgress, itemStyle: { color: "#0c4a6e" } },
      { name: "Pending", value: groups.pending, itemStyle: { color: "#f59e0b" } },
      { name: "Annulees", value: groups.canceled, itemStyle: { color: "#be123c" } },
      { name: "Autres", value: groups.other, itemStyle: { color: "#94a3b8" } },
    ].filter((i) => i.value > 0);

    state.charts.status.setOption(
      {
        tooltip: {
          trigger: "item",
          formatter: "{b}: {c} ({d}%)",
        },
        legend: {
          bottom: 0,
          textStyle: { color: "#55708c", fontSize: 11 },
        },
        series: [
          {
            name: "Statuts",
            type: "pie",
            radius: ["48%", "72%"],
            center: ["50%", "44%"],
            avoidLabelOverlap: false,
            label: { show: false },
            itemStyle: {
              borderColor: "#ffffff",
              borderWidth: 2,
            },
            data: data.length ? data : [{ name: "Aucune data", value: 1, itemStyle: { color: "#c6d3df" } }],
          },
        ],
      },
      true
    );
  }

  function renderClientsChart(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const el = root.querySelector(SELECTORS.clientsChart);
    if (!el) return;
    if (!state.charts.clients) state.charts.clients = window.echarts.init(el);

    const clients = new Map();
    rows.forEach((row) => {
      const key = row.client_name || "Client non renseigne";
      if (!clients.has(key)) clients.set(key, 0);
      clients.set(key, clients.get(key) + row.revenue);
    });

    const top = Array.from(clients.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .reverse();

    const names = top.map((item) => item[0]);
    const values = top.map((item) => round2(item[1]));

    state.charts.clients.setOption(
      {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => money(value),
        },
        grid: {
          top: 8,
          left: 8,
          right: 8,
          bottom: 8,
          containLabel: true,
        },
        xAxis: {
          type: "value",
          axisLabel: {
            color: "#5c7590",
            formatter: function (v) {
              return compactCurrency(v, state.config.locale, state.config.currency);
            },
          },
          splitLine: { lineStyle: { color: "#e5edf6", opacity: 1 } },
        },
        yAxis: {
          type: "category",
          data: names.length ? names : ["Aucune data"],
          axisLabel: { color: "#4d6882" },
          axisLine: { lineStyle: { color: "#d5e3ef" } },
        },
        series: [
          {
            type: "bar",
            data: values.length ? values : [0],
            barWidth: 18,
            itemStyle: {
              borderRadius: [0, 8, 8, 0],
              color: new window.echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: "#0f766e" },
                { offset: 1, color: "#0ea5e9" },
              ]),
            },
          },
        ],
      },
      true
    );
  }

  function renderTechChart(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const el = root.querySelector(SELECTORS.techChart);
    if (!el) return;
    if (!state.charts.tech) state.charts.tech = window.echarts.init(el);

    const techMap = new Map();
    rows.forEach((row) => {
      const names = row.assignees && row.assignees.length ? row.assignees : ["Non assigne"];
      const split = names.length || 1;
      names.forEach((name) => {
        if (!techMap.has(name)) techMap.set(name, { revenue: 0, profit: 0, count: 0 });
        const item = techMap.get(name);
        item.revenue += row.revenue / split;
        item.profit += row.profit / split;
        item.count += 1;
      });
    });

    const top = Array.from(techMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8)
      .reverse();

    const labels = top.map((item) => item[0]);
    const revenues = top.map((item) => round2(item[1].revenue));
    const profits = top.map((item) => round2(item[1].profit));

    state.charts.tech.setOption(
      {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => money(value),
        },
        legend: {
          top: 0,
          textStyle: { color: "#55708c", fontSize: 11 },
          data: ["CA", "Benefice"],
        },
        grid: {
          top: 30,
          left: 8,
          right: 8,
          bottom: 8,
          containLabel: true,
        },
        xAxis: {
          type: "value",
          axisLabel: {
            color: "#5c7590",
            formatter: function (v) {
              return compactCurrency(v, state.config.locale, state.config.currency);
            },
          },
          splitLine: { lineStyle: { color: "#e5edf6", opacity: 1 } },
        },
        yAxis: {
          type: "category",
          data: labels.length ? labels : ["Aucune data"],
          axisLabel: { color: "#4d6882" },
          axisLine: { lineStyle: { color: "#d5e3ef" } },
        },
        series: [
          {
            name: "CA",
            type: "bar",
            data: revenues.length ? revenues : [0],
            barMaxWidth: 12,
            itemStyle: { color: "#0c4a6e", borderRadius: [0, 6, 6, 0] },
          },
          {
            name: "Benefice",
            type: "bar",
            data: profits.length ? profits : [0],
            barMaxWidth: 12,
            itemStyle: { color: "#0f766e", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true
    );
  }

  function updateLastSync() {
    const root = getRoot(state.config.container);
    if (!root) return;
    const target = root.querySelector(SELECTORS.lastSync);
    if (!target) return;
    target.textContent = "Derniere synchro: " + formatDateTime(new Date());
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);
    const root = getRoot(state.config.container);
    if (!root) return;
    const shell = root.querySelector(SELECTORS.shell);
    if (!shell) return;
    shell.classList.toggle("is-loading", state.loading);
  }

  function renderError(error) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const box = root.querySelector(SELECTORS.errorBox);
    if (!box) return;
    const message =
      (error && (error.message || error.error_description || error.details)) ||
      "Une erreur inconnue est survenue.";

    box.hidden = false;
    box.innerHTML = `<strong>Erreur:</strong> ${escapeHtml(String(message))}`;
  }

  function clearError() {
    const root = getRoot(state.config.container);
    if (!root) return;
    const box = root.querySelector(SELECTORS.errorBox);
    if (!box) return;
    box.hidden = true;
    box.innerHTML = "";
  }

  function classifyStatus(status) {
    const normalized = normalizeStatus(status);
    const buckets = state.config.statusBuckets || {};

    if (matchBucket(normalized, buckets.done)) return "done";
    if (matchBucket(normalized, buckets.inProgress)) return "inProgress";
    if (matchBucket(normalized, buckets.pending)) return "pending";
    if (matchBucket(normalized, buckets.canceled)) return "canceled";
    return "other";
  }

  function matchBucket(value, list) {
    if (!value || !Array.isArray(list) || !list.length) return false;
    for (let i = 0; i < list.length; i += 1) {
      const item = normalizeStatus(list[i]);
      if (item && value.includes(item)) return true;
    }
    return false;
  }

  function parseTarifToEuros(value, unit) {
    const amount = parseLooseNumber(value);
    if (!Number.isFinite(amount) || amount === 0) return 0;

    if (unit === "cent") return amount / 100;
    if (unit === "euro") return amount;

    // Auto mode:
    // - decimal values are treated as euros (ex: "120,50")
    // - large integer values are usually stored in cents (ex: 12000 => 120 EUR)
    const raw = String(value == null ? "" : value).trim();
    const hasExplicitDecimal =
      /,\d{1,2}$/.test(raw) ||
      /\.\d{1,2}$/.test(raw) ||
      (typeof value === "number" && !Number.isInteger(value));

    if (hasExplicitDecimal) return amount;
    if (Math.abs(amount) >= 1000 && Number.isInteger(amount)) return amount / 100;
    return amount;
  }

  function profileLabel(profile) {
    const fullName =
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      profile.name ||
      "";
    return fullName || profile.email || profile.id || "Unknown";
  }

  function exportCsv(rows) {
    if (!rows || !rows.length) return;

    const lines = [];
    lines.push(
      [
        "ref",
        "intervention",
        "client",
        "statut",
        "techniciens",
        "debut",
        "fin",
        "ca_eur",
        "couts_eur",
        "benefice_eur",
        "marge_pct",
      ].join(";")
    );

    rows.forEach((row) => {
      const values = [
        row.internal_ref,
        row.title,
        row.client_name,
        row.status,
        row.assignees.join(", "),
        formatDate(row.effective_date),
        formatDate(row.end_at),
        round2(row.revenue),
        round2(row.cost),
        round2(row.profit),
        round2(row.margin),
      ].map(csvCell);
      lines.push(values.join(";"));
    });

    const csv = "\ufeff" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dashboard_interventions_" + toInputDate(new Date()) + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value).replace(/"/g, '""');
    return '"' + text + '"';
  }

  function money(value) {
    return new Intl.NumberFormat(state.config.locale, {
      style: "currency",
      currency: state.config.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(toNumber(value));
  }

  function compactCurrency(value, locale, currency) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(toNumber(value));
  }

  function percent(value) {
    return (
      new Intl.NumberFormat(state.config.locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(toNumber(value)) + "%"
    );
  }

  function formatDate(input) {
    if (!input) return "-";
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat(state.config.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  function formatDateTime(input) {
    if (!input) return "-";
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat(state.config.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function parseLooseNumber(value) {
    if (value == null) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    let s = String(value).trim();
    if (!s) return 0;

    s = s
      .replace(/\s+/g, "")
      .replace(/\u00A0/g, "")
      .replace(/€/g, "")
      .replace(/eur/gi, "");

    if (!s) return 0;
    if (/^-?\d+$/.test(s)) return Number(s);

    if (s.includes(",") && s.includes(".")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(",")) {
      const parts = s.split(",");
      if (parts.length === 2 && parts[1].length <= 2) {
        s = parts[0].replace(/\./g, "") + "." + parts[1];
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(".")) {
      const parts = s.split(".");
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        s = s.replace(/\./g, "");
      }
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round(toNumber(value) * 100) / 100;
  }

  function normalizeStatus(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function autoInit() {
    const cfg = window.__MBL_DASHBOARD_CFG__ || {};
    if (cfg.autoInit === false) return;
    if (window.__mblAdminDashboardBooted) return;

    const rootSelector =
      cfg.container ||
      (window.__MBL_CFG__ && window.__MBL_CFG__.ADMIN_DASHBOARD_SELECTOR) ||
      DEFAULT_CONFIG.container;
    const root = getRoot(rootSelector);
    if (!root) return;

    window.__mblAdminDashboardBooted = true;
    init(cfg).catch((error) => {
      console.error("[MBL DASHBOARD] init error:", error);
      window.__mblAdminDashboardBooted = false;
    });
  }

  window.MBLAdminDashboard = {
    init,
  };

  window.Webflow ||= [];
  window.Webflow.push(function () {
    autoInit();
  });
})();
