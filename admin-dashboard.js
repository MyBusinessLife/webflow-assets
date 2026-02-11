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
    context: {
      userId: "",
      orgId: "",
      orgName: "",
      role: "",
      modules: {},
      planName: "",
      subscriptionStatus: "",
      subscriptionActive: false,
    },
    moduleStats: {},
    charts: {
      trend: null,
      status: null,
      clients: null,
      tech: null,
      dynamic: new Map(),
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
    view: {
      business: "all", // all | billing | interventions | crm | transport | fleet | logistics | purchases | restaurant | pos | loyalty | rental
    },
    loading: false,
  };

  const SELECTORS = {
    shell: ".mbl-shell",
    tableBody: ".mbl-table-body",
    lastSync: ".mbl-last-sync",
    filtersForm: ".mbl-filters",
    kpiArea: ".mbl-kpi-grid",
    contextStrip: ".mbl-context-strip",
    moduleNote: ".mbl-module-note",
    errorBox: ".mbl-error",
    refreshButton: ".mbl-refresh",
    exportButton: ".mbl-export",
    trendChart: ".mbl-chart-trend",
    statusChart: ".mbl-chart-status",
    clientsChart: ".mbl-chart-clients",
    techChart: ".mbl-chart-tech",
    viewBar: ".mbl-viewbar",
    viewChips: "[data-view-chips]",
    viewHint: "[data-view-hint]",
    actionsArea: "[data-actions]",
    alertsArea: "[data-alerts]",
    insightsArea: ".mbl-insights",
  };

  const VIEW_STORAGE_KEY = "mbl-admin-dashboard:view";

  const VIEW_ICON = {
    all:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    billing:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h10v18l-2-1-3 1-3-1-2 1V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8h6M9 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    interventions:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 7l3 3-7 7H7v-3l7-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 8l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    crm:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    transport:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7h12v10H3V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 10h3l3 3v4h-6v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm12 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="currentColor"/></svg>',
    fleet:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 16l1-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2l1 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 16h10v4H7v-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor"/></svg>',
    logistics:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 3v18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    purchases:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6h15l-2 9H8L6 6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 6L5 3H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 20a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="currentColor"/></svg>',
    restaurant:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v7M10 3v7M7 10h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3v9a3 3 0 0 0 3 3h0v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    pos:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 2h12v20H6V2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 6h6M9 10h6M10 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    loyalty:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 17l-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L12 6l2.1 4.5 4.7.7-3.4 3.3.8 4.7L12 17Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    rental:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11l8-8 8 8v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    lock:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 11h12v10H6V11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    arrow:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 7h7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const VIEW_DEFS = [
    {
      key: "all",
      label: "Tout",
      hint: "Vue globale. Filtre les KPIs, actions et alertes par module.",
      enabled: () => true,
      icon: VIEW_ICON.all,
    },
    {
      key: "billing",
      label: "Facturation",
      hint: "Devis, factures, paiements et clients.",
      enabled: (m) => Boolean(m.billing),
      icon: VIEW_ICON.billing,
    },
    {
      key: "interventions",
      label: "Interventions",
      hint: "Rentabilite, planning, statuts et details des interventions.",
      enabled: (m) => Boolean(m.interventions),
      icon: VIEW_ICON.interventions,
    },
    {
      key: "crm",
      label: "CRM",
      hint: "Pipeline, opportunites, relances et valeur en cours.",
      enabled: (m) => Boolean(m.crm),
      icon: VIEW_ICON.crm,
    },
    {
      key: "transport",
      label: "Transport",
      hint: "Tournees, courses, distances et suivi chauffeur.",
      enabled: (m) => Boolean(m.transport),
      icon: VIEW_ICON.transport,
    },
    {
      key: "fleet",
      label: "Vehicules",
      hint: "Parc, conformite (CT) et alertes de renouvellement.",
      enabled: (m) => Boolean(m.fleet || m.transport),
      icon: VIEW_ICON.fleet,
    },
    {
      key: "logistics",
      label: "Logistique",
      hint: "Stocks, entrepots, mouvements et reappro.",
      enabled: (m) => Boolean(m.logistics),
      icon: VIEW_ICON.logistics,
    },
    {
      key: "purchases",
      label: "Achats",
      hint: "Bons de commande, receptions et depenses fournisseur.",
      enabled: (m) => Boolean(m.purchases),
      icon: VIEW_ICON.purchases,
    },
    {
      key: "restaurant",
      label: "Restauration",
      hint: "Menus, commandes (QR) et production.",
      enabled: (m) => Boolean(m.restaurant),
      icon: VIEW_ICON.restaurant,
    },
    {
      key: "pos",
      label: "Caisse (POS)",
      hint: "Encaissements et tickets de caisse.",
      enabled: (m) => Boolean(m.pos),
      icon: VIEW_ICON.pos,
    },
    {
      key: "loyalty",
      label: "Fidelite",
      hint: "Programme, membres, points et activite.",
      enabled: (m) => Boolean(m.loyalty),
      icon: VIEW_ICON.loyalty,
    },
    {
      key: "rental",
      label: "Location",
      hint: "Biens, reservations et revenus.",
      enabled: (m) => Boolean(m.rental),
      icon: VIEW_ICON.rental,
    },
  ];

  const DASHBOARD_CSS = `
    [data-mbl-admin-dashboard], #mbl-admin-dashboard, .mbl-admin-dashboard {
      position: relative;
      min-height: 100%;
    }

	    .mbl-shell {
	      --accent: var(--mbl-primary, #0ea5e9);
	      --accent-rgb: var(--mbl-primary-rgb, 14, 165, 233);
	      --accent-2: var(--mbl-secondary, #0c4a6e);
	      --bg-0: rgba(250, 252, 255, 0.96);
	      --bg-1: rgba(241, 245, 249, 0.86);
	      --stroke: rgba(15, 23, 42, 0.12);
	      --text-main: var(--mbl-text, #020617);
	      --text-soft: rgba(2, 6, 23, 0.62);
	      --card-bg: var(--mbl-surface, rgba(255, 255, 255, 0.88));
	      position: relative;
	      overflow: hidden;
	      padding: clamp(14px, 1.9vw, 28px);
	      color: var(--text-main);
	      font-family: inherit;
	      background:
	        radial-gradient(920px 440px at 8% -8%, rgba(var(--accent-rgb), 0.16), transparent 68%),
	        radial-gradient(860px 520px at 100% 0%, rgba(var(--accent-rgb), 0.12), transparent 70%),
	        linear-gradient(180deg, var(--bg-0), var(--bg-1));
	      border-radius: 20px;
	      border: 1px solid var(--stroke);
	      isolation: isolate;
	      box-shadow: 0 16px 34px rgba(2, 6, 23, 0.08);
	    }

	    .mbl-shell::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
	      background-image:
	        linear-gradient(rgba(var(--accent-rgb), 0.05) 1px, transparent 1px),
	        linear-gradient(90deg, rgba(var(--accent-rgb), 0.05) 1px, transparent 1px);
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
	      background: radial-gradient(circle at center, rgba(var(--accent-rgb), 0.52), transparent 72%);
	      animation: mblFloatA 12s ease-in-out infinite;
	    }

	    .mbl-bg-glow-b {
      right: -7%;
      bottom: -30%;
	      background: radial-gradient(circle at center, rgba(var(--accent-rgb), 0.44), transparent 70%);
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
	      background: rgba(255, 255, 255, 0.72);
	      backdrop-filter: blur(2px);
	      color: rgba(2, 6, 23, 0.82);
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
	        rgba(var(--accent-rgb), 0.10),
	        rgba(var(--accent-rgb), 0.06) 45%,
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
	      color: rgba(var(--accent-rgb), 0.95);
	      font-size: 10px;
	      font-weight: 700;
	    }

	    .mbl-title {
      margin: 0;
      font-size: clamp(23px, 3.2vw, 36px);
      line-height: 1.05;
      letter-spacing: -0.02em;
	      color: var(--text-main);
	      font-weight: 800;
	    }

    .mbl-subtitle {
      margin: 8px 0 0;
      color: var(--text-soft);
      max-width: 700px;
    }

    .mbl-context-strip {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

	    .mbl-context-pill {
	      display: inline-flex;
	      align-items: center;
	      gap: 6px;
		      border: 1px solid var(--stroke);
		      background: rgba(255, 255, 255, 0.95);
		      color: rgba(2, 6, 23, 0.78);
		      border-radius: 999px;
		      padding: 5px 10px;
		      font-size: 11px;
	      font-weight: 700;
	      letter-spacing: 0.01em;
	      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
	    }

	    button.mbl-context-pill {
	      cursor: pointer;
	      font-family: inherit;
	    }

	    .mbl-context-btn {
	      border-color: rgba(var(--accent-rgb), 0.22);
	      background: rgba(var(--accent-rgb), 0.08);
	      color: rgba(2, 6, 23, 0.86);
	    }

	    .mbl-context-btn:hover {
	      transform: translateY(-1px);
	      box-shadow: 0 12px 26px rgba(var(--accent-rgb), 0.14);
	    }

	    .mbl-context-btn:active {
	      transform: translateY(0px);
	    }

	    .mbl-context-btn:focus-visible {
	      outline: none;
	      box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.20), 0 10px 22px rgba(var(--accent-rgb), 0.12);
	    }

	    .mbl-context-pill.is-warn {
	      border-color: #f7c788;
	      background: #fff7ec;
	      color: #9a5a00;
	    }

    .mbl-context-pill.is-ok {
      border-color: #9edcc7;
      background: #eefcf6;
      color: #0f766e;
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
	      background: linear-gradient(120deg, var(--accent), var(--accent-2));
	      box-shadow: 0 8px 20px rgba(var(--accent-rgb), 0.23);
	    }

	    .mbl-btn-ghost {
	      color: rgba(2, 6, 23, 0.84);
	      border: 1px solid rgba(var(--accent-rgb), 0.25);
	      background: rgba(255, 255, 255, 0.9);
	    }

	    .mbl-last-sync {
	      display: block;
	      font-size: 11px;
	      color: var(--text-soft);
	      margin-left: 4px;
	    }

	    .mbl-viewbar {
	      margin-top: 14px;
	      padding: 14px;
	      display: flex;
	      align-items: flex-start;
	      justify-content: space-between;
	      gap: 12px;
	      flex-wrap: wrap;
	      background: linear-gradient(
	        135deg,
	        rgba(var(--accent-rgb), 0.06),
	        rgba(255, 255, 255, 0.90) 55%,
	        rgba(var(--accent-rgb), 0.04)
	      );
	    }

	    .mbl-viewbar h2 {
	      margin: 0;
	      font-size: 15px;
	      letter-spacing: -0.01em;
	    }

	    .mbl-viewhint {
	      margin: 6px 0 0;
	      color: var(--text-soft);
	      font-size: 12px;
	      max-width: 640px;
	    }

	    .mbl-viewchips {
	      display: flex;
	      align-items: center;
	      gap: 8px;
	      flex-wrap: wrap;
	      justify-content: flex-end;
	    }

	    .mbl-viewchip {
	      appearance: none;
	      border: 1px solid rgba(var(--accent-rgb), 0.18);
	      background: rgba(255, 255, 255, 0.92);
	      color: rgba(2, 6, 23, 0.78);
	      border-radius: 999px;
	      padding: 8px 12px;
	      font-size: 12px;
	      font-weight: 750;
	      letter-spacing: 0.01em;
	      display: inline-flex;
	      align-items: center;
	      gap: 8px;
	      cursor: pointer;
	      transition: transform 0.16s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
	      user-select: none;
	      white-space: nowrap;
	    }

	    .mbl-viewchip:hover {
	      transform: translateY(-1px);
	      border-color: rgba(var(--accent-rgb), 0.32);
	      box-shadow: 0 10px 22px rgba(var(--accent-rgb), 0.14);
	    }

	    .mbl-viewchip:active { transform: translateY(0); }

	    .mbl-viewchip:focus-visible {
	      outline: none;
	      box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.18);
	    }

	    .mbl-viewchip.is-active {
	      background: linear-gradient(120deg, var(--accent), var(--accent-2));
	      border-color: rgba(var(--accent-rgb), 0.42);
	      color: #ffffff;
	      box-shadow: 0 12px 26px rgba(var(--accent-rgb), 0.22);
	    }

	    .mbl-viewchip.is-locked {
	      opacity: 0.62;
	    }

	    .mbl-viewchip .mbl-chip-ico {
	      display: inline-grid;
	      place-items: center;
	      width: 18px;
	      height: 18px;
	    }

	    .mbl-panels {
	      margin-top: 14px;
	      display: grid;
	      grid-template-columns: 1.2fr 0.8fr;
	      gap: 12px;
	    }

	    .mbl-insights {
	      margin-top: 14px;
	    }

	    .mbl-insights-grid {
	      display: grid;
	      grid-template-columns: repeat(2, minmax(0, 1fr));
	      gap: 10px;
	    }

	    .mbl-insight-card {
	      padding: 12px;
	      min-height: 300px;
	      position: relative;
	      overflow: hidden;
	      animation: mblStagger 0.35s ease both;
	      animation-delay: calc(var(--idx, 0) * 55ms);
	      transition: transform 0.18s ease, box-shadow 0.18s ease;
	      will-change: transform;
	    }

	    .mbl-insight-card:hover {
	      transform: translateY(-1px);
	      box-shadow: 0 18px 44px rgba(12, 37, 66, 0.10);
	    }

	    .mbl-insight-head {
	      display: flex;
	      align-items: flex-start;
	      justify-content: space-between;
	      gap: 10px;
	      margin-bottom: 10px;
	    }

	    .mbl-insight-head h2 {
	      margin: 0;
	      font-size: 14px;
	      font-weight: 800;
	      letter-spacing: -0.01em;
	      color: rgba(2, 6, 23, 0.88);
	    }

	    .mbl-insight-sub {
	      margin: 4px 0 0;
	      font-size: 12px;
	      color: var(--text-soft);
	      line-height: 1.35;
	      max-width: 55ch;
	    }

	    .mbl-insight-meta {
	      display: inline-flex;
	      align-items: center;
	      gap: 6px;
	      border-radius: 999px;
	      padding: 6px 10px;
	      border: 1px solid rgba(15, 23, 42, 0.12);
	      background: rgba(255, 255, 255, 0.92);
	      color: rgba(2, 6, 23, 0.72);
	      font-size: 12px;
	      font-weight: 750;
	      white-space: nowrap;
	    }

	    .mbl-insight-card .mbl-chart {
	      height: 240px;
	    }

	    .mbl-panel {
	      padding: 14px;
	      position: relative;
	      overflow: hidden;
	    }

	    .mbl-panel h3 {
	      margin: 0;
	      font-size: 14px;
	      letter-spacing: -0.01em;
	    }

	    .mbl-panel p {
	      margin: 8px 0 0;
	      color: var(--text-soft);
	      font-size: 12px;
	    }

	    .mbl-actions-grid {
	      margin-top: 12px;
	      display: grid;
	      grid-template-columns: repeat(2, minmax(0, 1fr));
	      gap: 10px;
	    }

	    .mbl-action {
	      appearance: none;
	      cursor: pointer;
	      display: flex;
	      align-items: center;
	      justify-content: space-between;
	      gap: 10px;
	      padding: 10px 12px;
	      border-radius: 14px;
	      border: 1px solid rgba(15, 23, 42, 0.12);
	      background: rgba(255, 255, 255, 0.92);
	      color: rgba(2, 6, 23, 0.84);
	      text-decoration: none;
	      width: 100%;
	      text-align: left;
	      font-family: inherit;
	      font-weight: 750;
	      font-size: 13px;
	      letter-spacing: -0.01em;
	      transition: transform 0.16s ease, box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
	    }

	    .mbl-action:hover {
	      transform: translateY(-1px);
	      border-color: rgba(var(--accent-rgb), 0.30);
	      box-shadow: 0 14px 30px rgba(2, 6, 23, 0.10);
	    }

	    .mbl-action:active { transform: translateY(0); }

	    .mbl-action.is-locked {
	      opacity: 0.62;
	      cursor: pointer;
	    }

	    .mbl-action.is-cta {
	      background: linear-gradient(120deg, var(--accent), var(--accent-2));
	      border-color: rgba(var(--accent-rgb), 0.42);
	      color: #ffffff;
	      box-shadow: 0 14px 30px rgba(var(--accent-rgb), 0.22);
	    }

	    .mbl-action.is-cta .mbl-action-meta {
	      color: rgba(255, 255, 255, 0.92);
	    }

	    .mbl-action .mbl-action-meta {
	      color: rgba(2, 6, 23, 0.60);
	      font-size: 12px;
	      font-weight: 650;
	      letter-spacing: 0.01em;
	      white-space: nowrap;
	    }

	    .mbl-alert-list {
	      margin-top: 12px;
	      display: grid;
	      gap: 10px;
	    }

	    .mbl-alert {
	      border-radius: 14px;
	      padding: 10px 12px;
	      border: 1px solid rgba(15, 23, 42, 0.12);
	      background: rgba(255, 255, 255, 0.92);
	    }

	    .mbl-alert strong {
	      display: block;
	      font-size: 13px;
	      letter-spacing: -0.01em;
	    }

	    .mbl-alert span {
	      display: block;
	      margin-top: 4px;
	      color: var(--text-soft);
	      font-size: 12px;
	    }

	    .mbl-alert.is-good { border-color: rgba(34, 197, 94, 0.25); background: rgba(34, 197, 94, 0.06); }
	    .mbl-alert.is-warn { border-color: rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.07); }
	    .mbl-alert.is-bad { border-color: rgba(239, 68, 68, 0.26); background: rgba(239, 68, 68, 0.06); }

	    .mbl-kpi-grid,
	    .mbl-panels,
	    .mbl-insights,
	    .mbl-analytics-grid,
	    .mbl-table-card,
	    .mbl-filters {
	      transition: opacity 0.18s ease, transform 0.18s ease;
	    }

	    .mbl-shell.is-switching .mbl-kpi-grid,
	    .mbl-shell.is-switching .mbl-panels,
	    .mbl-shell.is-switching .mbl-insights,
	    .mbl-shell.is-switching .mbl-analytics-grid,
	    .mbl-shell.is-switching .mbl-table-card,
	    .mbl-shell.is-switching .mbl-filters {
	      opacity: 0.35;
	      transform: translateY(2px);
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
	      color: rgba(2, 6, 23, 0.62);
	      font-weight: 700;
	    }

	    .mbl-filter input,
	    .mbl-filter select {
	      border: 1px solid rgba(15, 23, 42, 0.14);
	      outline: none;
	      border-radius: 10px;
	      padding: 10px 11px;
	      font-size: 13px;
	      line-height: 1;
	      background: rgba(255, 255, 255, 0.92);
	      color: var(--text-main);
	      min-width: 0;
	    }

    .mbl-filter input::placeholder { color: #8095ad; }
	    .mbl-filter input:focus,
	    .mbl-filter select:focus {
	      border-color: rgba(var(--accent-rgb), 0.85);
	      box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.16);
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

    .mbl-module-note {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid #d6e2ee;
      background: #f8fbff;
      color: #375676;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.45;
    }

	    .mbl-kpi {
	      padding: 14px;
	      position: relative;
	      overflow: hidden;
	      animation: mblStagger 0.35s ease both;
	      animation-delay: calc(var(--idx, 0) * 50ms);
	      background: linear-gradient(180deg, #ffffff, #f8fbff);
	      transition: transform 0.18s ease, box-shadow 0.18s ease;
	      will-change: transform;
	    }

	    .mbl-kpi:hover {
	      transform: translateY(-1px);
	      box-shadow: 0 18px 44px rgba(12, 37, 66, 0.10);
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
	      color: rgba(2, 6, 23, 0.62);
	      font-weight: 700;
	    }

	    .mbl-kpi-value {
      margin: 8px 0 0;
      font-size: clamp(19px, 2.1vw, 27px);
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.02em;
	      color: var(--text-main);
	    }

	    .tone-blue::before { background: radial-gradient(circle at center, rgba(var(--accent-rgb), 1), transparent 70%); }
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
	      .mbl-panels { grid-template-columns: 1fr; }
	      .mbl-insights-grid { grid-template-columns: 1fr; }
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
	      .mbl-viewbar { padding: 12px; }
	      .mbl-viewchips {
	        width: 100%;
	        flex-wrap: nowrap;
	        overflow-x: auto;
	        justify-content: flex-start;
	        padding-bottom: 6px;
	        -webkit-overflow-scrolling: touch;
	      }
	      .mbl-viewchips::-webkit-scrollbar { height: 6px; }
	      .mbl-viewchips::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, 0.14); border-radius: 999px; }
	      .mbl-viewchip { padding: 7px 11px; }
	      .mbl-panels { grid-template-columns: 1fr; }
	      .mbl-insight-card { min-height: 280px; }
	      .mbl-insight-card .mbl-chart { height: 220px; }
	      .mbl-actions-grid { grid-template-columns: 1fr; }
	      .mbl-filters { grid-template-columns: 1fr 1fr; }
	      .mbl-filter-search { grid-column: span 2; }
	      .mbl-kpi-grid { grid-template-columns: 1fr; }
	      .mbl-chart-card { min-height: 265px; }
	      .mbl-chart { height: 230px; }
	    }

	    @media (prefers-reduced-motion: reduce) {
	      .mbl-bg-glow-a,
	      .mbl-bg-glow-b {
	        animation: none !important;
	      }
	      .mbl-btn,
	      .mbl-viewchip,
	      .mbl-action {
	        transition: none !important;
	      }
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
	      // View selection can be overridden by ?view=...; otherwise keep last choice.
	      const urlView = readViewFromUrl();
	      state.view.business = urlView !== "all" ? urlView : loadSavedViewKey();
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
    if (state.charts.dynamic && state.charts.dynamic.size) {
      state.charts.dynamic.forEach((chart) => {
        try {
          chart && chart.dispose && chart.dispose();
        } catch (_) {}
      });
      state.charts.dynamic.clear();
    }
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

  function boolFromAny(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === "number") return value === 1;
    const s = String(value || "").trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  }

  function normalizeModulesMap(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    Object.keys(input).forEach((k) => {
      out[k] = boolFromAny(input[k]);
    });
    return out;
  }

  function normalizeViewKey(input) {
    const key = String(input || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!key) return "all";
    if (VIEW_DEFS.some((v) => v.key === key)) return key;
    return "all";
  }

  function viewKeyLabel(key) {
    const k = normalizeViewKey(key);
    const def = VIEW_DEFS.find((v) => v.key === k);
    return def ? def.label : "Tout";
  }

  function viewStorageKey() {
    const orgId = String(state.context?.orgId || "").trim();
    return orgId ? `${VIEW_STORAGE_KEY}:${orgId}` : VIEW_STORAGE_KEY;
  }

  function loadSavedViewKey() {
    try {
      const raw = localStorage.getItem(viewStorageKey());
      return normalizeViewKey(raw);
    } catch (_) {
      return "all";
    }
  }

  function saveViewKey(key) {
    try {
      localStorage.setItem(viewStorageKey(), normalizeViewKey(key));
    } catch (_) {}
  }

  function readViewFromUrl() {
    try {
      const url = new URL(location.href);
      const q = url.searchParams.get("view") || url.searchParams.get("business") || "";
      return normalizeViewKey(q);
    } catch (_) {
      return "all";
    }
  }

  function getAppRoot() {
    const p = String(location.pathname || "");
    const m = p.match(/^\/(applications|application)(?=\/|$)/);
    return m ? "/" + m[1] : "/applications";
  }

  function isViewEnabled(viewKey, modules) {
    const m = modules && typeof modules === "object" ? modules : {};
    const key = normalizeViewKey(viewKey);
    const def = VIEW_DEFS.find((v) => v.key === key);
    if (!def) return key === "all";
    try {
      return Boolean(def.enabled ? def.enabled(m) : false);
    } catch (_) {
      return key === "all";
    }
  }

  function ensureValidViewSelection(modules) {
    const current = normalizeViewKey(state.view?.business);
    if (current === "all") return "all";
    if (isViewEnabled(current, modules)) return current;
    return "all";
  }

  function setViewSelection(nextKey, opts = {}) {
    const key = normalizeViewKey(nextKey);
    const modules = state.context?.modules || {};

    // locked views never apply, they open the subscriptions modal instead.
    if (key !== "all" && !isViewEnabled(key, modules)) {
      if (opts?.openSubscriptions !== false) {
        try {
          window.MBL?.openSubscriptionsModal?.({ source: `dashboard:view:${key}` });
        } catch (_) {}
      }
      return;
    }

    state.view.business = key;
    saveViewKey(key);
  }

  function isSubscriptionRowActive(sub) {
    if (!sub) return false;
    const status = String(sub.status || "").trim().toLowerCase();
    if (!["trialing", "active", "past_due"].includes(status)) return false;
    const now = Date.now();
    if (sub.ends_at) {
      const endsAt = Date.parse(sub.ends_at);
      if (Number.isFinite(endsAt) && endsAt <= now) return false;
    }
    if (status === "trialing" && sub.trial_ends_at) {
      const trialEndsAt = Date.parse(sub.trial_ends_at);
      if (Number.isFinite(trialEndsAt) && trialEndsAt <= now) return false;
    }
    return true;
  }

  async function resolveDashboardContext() {
    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      state.supabase.auth.getSession(),
      state.supabase.auth.getUser(),
    ]);
    const user = userError ? sessionData?.session?.user : userData?.user || sessionData?.session?.user;
    const userId = String(user?.id || "").trim();
    if (!userId) {
      return {
        userId: "",
        orgId: "",
        orgName: "",
        role: "",
        modules: {},
        planName: "",
        subscriptionStatus: "",
        subscriptionActive: false,
      };
    }

    const memberRes = await state.supabase
      .from("organization_members")
      .select("organization_id, role, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (memberRes.error) throw memberRes.error;

    const member = memberRes.data?.[0] || null;
    const orgId = String(member?.organization_id || "").trim();
    if (!orgId) {
      return {
        userId,
        orgId: "",
        orgName: "",
        role: String(member?.role || "").trim(),
        modules: {},
        planName: "",
        subscriptionStatus: "",
        subscriptionActive: false,
      };
    }

    const [orgRes, entRes, subRes] = await Promise.all([
      state.supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      state.supabase
        .from("organization_entitlements")
        .select("modules")
        .eq("organization_id", orgId)
        .maybeSingle(),
      state.supabase
        .from("organization_subscriptions")
        .select("plan_id, status, starts_at, ends_at, trial_ends_at")
        .eq("organization_id", orgId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (orgRes.error && !isMissingRelationError(orgRes.error)) throw orgRes.error;
    if (entRes.error && !isMissingRelationError(entRes.error)) throw entRes.error;
    if (subRes.error && !isMissingRelationError(subRes.error)) throw subRes.error;

    const subscription = subRes.error ? null : subRes.data || null;
    const subscriptionActive = isSubscriptionRowActive(subscription);
    const subscriptionStatus = String(subscription?.status || "").trim().toLowerCase();

    let planName = "";
    let planModules = {};
    const planId = String(subscription?.plan_id || "").trim();
    if (planId) {
      const planRes = await state.supabase.from("billing_plans").select("name, modules").eq("id", planId).maybeSingle();
      if (planRes.error && !isMissingRelationError(planRes.error)) throw planRes.error;
      if (!planRes.error && planRes.data) {
        planName = String(planRes.data.name || "").trim();
        planModules = normalizeModulesMap(planRes.data.modules);
      }
    }

    const entModules = normalizeModulesMap(entRes.error ? {} : entRes.data?.modules);
    const mergedModules = subscriptionActive ? { ...planModules, ...entModules } : {};

    return {
      userId,
      orgId,
      orgName: String(orgRes.data?.name || "").trim(),
      role: String(member?.role || "").trim().toLowerCase(),
      modules: mergedModules,
      planName,
      subscriptionStatus,
      subscriptionActive,
    };
  }

  function isMissingRelationError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("relation") || msg.includes("column");
  }

  async function safeTableRows(table, selectColumns, mutator) {
    let query = state.supabase.from(table).select(selectColumns);
    if (typeof mutator === "function") query = mutator(query) || query;
    const res = await query;
    if (res.error) {
      if (isMissingRelationError(res.error)) return [];
      throw res.error;
    }
    return res.data || [];
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isSameOrAfter(dateInput, threshold) {
    if (!dateInput) return false;
    const ts = Date.parse(dateInput);
    return Number.isFinite(ts) && ts >= threshold.getTime();
  }

  function isBeforeToday(dateInput) {
    if (!dateInput) return false;
    const ts = Date.parse(`${dateInput}T00:00:00`);
    if (!Number.isFinite(ts)) return false;
    return ts < startOfToday().getTime();
  }

  function isWithinDays(dateInput, days) {
    if (!dateInput) return false;
    const ts = Date.parse(`${dateInput}T00:00:00`);
    if (!Number.isFinite(ts)) return false;
    const now = startOfToday().getTime();
    const delta = ts - now;
    return delta >= 0 && delta <= days * 86400000;
  }

  function parseDateSafe(input) {
    if (!input) return null;
    const ts = Date.parse(input);
    if (!Number.isFinite(ts)) return null;
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function shortDayLabelFromKey(key) {
    // key: YYYY-MM-DD
    try {
      const parts = String(key || "").split("-");
      if (parts.length !== 3) return String(key || "");
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const d = Number(parts[2]);
      const dt = new Date(y, m, d);
      return dt.toLocaleDateString(state.config?.locale || "fr-FR", { day: "2-digit", month: "2-digit" });
    } catch (_) {
      return String(key || "");
    }
  }

  function monthKeyFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function shortMonthLabelFromKey(key) {
    // key: YYYY-MM
    try {
      const parts = String(key || "").split("-");
      if (parts.length !== 2) return String(key || "");
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const dt = new Date(y, m, 1);
      return dt.toLocaleDateString(state.config?.locale || "fr-FR", { month: "short", year: "2-digit" });
    } catch (_) {
      return String(key || "");
    }
  }

  function buildDailySeries(items, getDateValue, getNumericValue, days) {
    const n = Math.max(3, toNumber(days) || 30);
    const end = startOfToday();
    const start = new Date(end);
    start.setDate(end.getDate() - (n - 1));
    const keys = [];
    const map = new Map();

    for (let i = 0; i < n; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = toInputDate(d);
      keys.push(k);
      map.set(k, 0);
    }

    (items || []).forEach((it) => {
      const raw = typeof getDateValue === "function" ? getDateValue(it) : null;
      const dt = raw instanceof Date ? raw : parseDateSafe(raw);
      if (!dt) return;
      dt.setHours(0, 0, 0, 0);
      if (dt < start || dt > end) return;
      const k = toInputDate(dt);
      if (!map.has(k)) return;
      const v = typeof getNumericValue === "function" ? toNumber(getNumericValue(it)) : 0;
      map.set(k, (map.get(k) || 0) + v);
    });

    return {
      keys,
      labels: keys.map(shortDayLabelFromKey),
      values: keys.map((k) => round2(map.get(k) || 0)),
    };
  }

  function buildForwardDailySeries(items, getDateValue, getNumericValue, days) {
    const n = Math.max(3, toNumber(days) || 7);
    const start = startOfToday();
    const end = new Date(start);
    end.setDate(start.getDate() + (n - 1));
    const keys = [];
    const map = new Map();

    for (let i = 0; i < n; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = toInputDate(d);
      keys.push(k);
      map.set(k, 0);
    }

    (items || []).forEach((it) => {
      const raw = typeof getDateValue === "function" ? getDateValue(it) : null;
      const dt = raw instanceof Date ? raw : parseDateSafe(raw);
      if (!dt) return;
      dt.setHours(0, 0, 0, 0);
      if (dt < start || dt > end) return;
      const k = toInputDate(dt);
      if (!map.has(k)) return;
      const v = typeof getNumericValue === "function" ? toNumber(getNumericValue(it)) : 0;
      map.set(k, (map.get(k) || 0) + v);
    });

    return {
      keys,
      labels: keys.map(shortDayLabelFromKey),
      values: keys.map((k) => round2(map.get(k) || 0)),
    };
  }

  function buildMonthlySeries(items, getDateValue, getNumericValue, months) {
    const n = Math.max(3, Math.min(24, toNumber(months) || 6));
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    const keys = [];
    const map = new Map();

    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setMonth(now.getMonth() - i);
      const k = monthKeyFromDate(d);
      keys.push(k);
      map.set(k, 0);
    }

    (items || []).forEach((it) => {
      const raw = typeof getDateValue === "function" ? getDateValue(it) : null;
      const dt = raw instanceof Date ? raw : parseDateSafe(raw);
      if (!dt) return;
      const k = monthKeyFromDate(dt);
      if (!map.has(k)) return;
      const v = typeof getNumericValue === "function" ? toNumber(getNumericValue(it)) : 0;
      map.set(k, (map.get(k) || 0) + v);
    });

    return {
      keys,
      labels: keys.map(shortMonthLabelFromKey),
      values: keys.map((k) => round2(map.get(k) || 0)),
    };
  }

  async function fetchModuleStats(context) {
    const modules = context?.modules || {};
    const stats = {
      billing: null,
      crm: null,
      transport: null,
      fleet: null,
      logistics: null,
      purchases: null,
      loyalty: null,
      rental: null,
      restaurant: null,
      pos: null,
    };

	    if (modules.billing) {
	      const [factures, devis, clients] = await Promise.all([
	        safeTableRows("factures", "status,total_cents,due_date,paid_at,created_at", (q) =>
	          q.order("created_at", { ascending: false }).limit(6000)
	        ),
	        safeTableRows("devis", "status,total_cents,created_at", (q) => q.order("created_at", { ascending: false }).limit(6000)),
	        safeTableRows("clients", "id,is_active,created_at", (q) => q.limit(6000)),
	      ]);

	      const monthStart = startOfMonth();
	      let paidMonth = 0;
	      let openInvoices = 0;
	      let overdueInvoices = 0;
	      let openAmount = 0;
	      let overdueAmount = 0;

	      let paidCount = 0;
	      let onTimeCount = 0;
	      let delaySumDays = 0;
	      let delayCount = 0;

	      const invoiceBuckets = { paid: 0, open: 0, overdue: 0, other: 0 };
	      const quoteBuckets = { draft: 0, sent: 0, accepted: 0, declined: 0, other: 0 };

	      factures.forEach((f) => {
	        const status = normalizeStatus(f.status);
	        const total = toNumber(f.total_cents) / 100;
	        const isPaid = status === "paid";
	        const isOpen = ["issued", "sent", "partially_paid"].includes(status);

	        if (isPaid) {
	          invoiceBuckets.paid += 1;
	        } else if (isOpen && isBeforeToday(f.due_date)) {
	          invoiceBuckets.overdue += 1;
	        } else if (isOpen) {
	          invoiceBuckets.open += 1;
	        } else {
	          invoiceBuckets.other += 1;
	        }

	        if (isOpen) {
	          openInvoices += 1;
	          openAmount += total;
	          if (isBeforeToday(f.due_date)) {
	            overdueInvoices += 1;
	            overdueAmount += total;
	          }
	        }

	        if (isPaid) {
	          if (isSameOrAfter(f.paid_at || f.created_at, monthStart)) paidMonth += total;
	          if (f.paid_at) {
	            paidCount += 1;
	            if (f.due_date) {
	              const dueTs = Date.parse(`${f.due_date}T23:59:59`);
	              const paidTs = Date.parse(f.paid_at);
	              if (Number.isFinite(dueTs) && Number.isFinite(paidTs) && paidTs <= dueTs) onTimeCount += 1;
	            }
	            if (f.created_at) {
	              const createdTs = Date.parse(f.created_at);
	              const paidTs = Date.parse(f.paid_at);
	              if (Number.isFinite(createdTs) && Number.isFinite(paidTs) && paidTs >= createdTs) {
	                delaySumDays += (paidTs - createdTs) / 86400000;
	                delayCount += 1;
	              }
	            }
	          }
	        }
	      });

	      devis.forEach((d) => {
	        const st = normalizeStatus(d.status);
	        if (st === "draft") quoteBuckets.draft += 1;
	        else if (st === "sent") quoteBuckets.sent += 1;
	        else if (st === "accepted") quoteBuckets.accepted += 1;
	        else if (["declined", "rejected", "refused"].includes(st)) quoteBuckets.declined += 1;
	        else quoteBuckets.other += 1;
	      });

	      const openQuotes = devis.filter((d) => ["draft", "sent", "accepted"].includes(normalizeStatus(d.status))).length;
	      const activeClients = clients.filter((c) => c.is_active !== false).length;
	      const cashIn30 = buildDailySeries(
	        factures.filter((f) => normalizeStatus(f.status) === "paid"),
	        (f) => f.paid_at || f.created_at,
	        (f) => toNumber(f.total_cents) / 100,
	        30
	      );
	      const invoicesIssued30 = buildDailySeries(
	        factures,
	        (f) => f.created_at,
	        () => 1,
	        30
	      );
	      const quotesAccepted6m = buildMonthlySeries(
	        devis.filter((d) => normalizeStatus(d.status) === "accepted"),
	        (d) => d.created_at,
	        (d) => toNumber(d.total_cents) / 100,
	        6
	      );

	      stats.billing = {
	        paidMonth,
	        openInvoices,
	        overdueInvoices,
	        openQuotes,
	        activeClients,
	        openAmount,
	        overdueAmount,
	        avgPaymentDelayDays: delayCount ? round2(delaySumDays / delayCount) : 0,
	        onTimeRate: paidCount ? round2((onTimeCount / paidCount) * 100) : 0,
	        series: {
	          cashIn30,
	          invoicesIssued30,
	          quotesAccepted6m,
	        },
	        breakdown: {
	          invoiceBuckets,
	          quoteBuckets,
	        },
	      };
	    }

	    if (modules.crm) {
	      const deals = await safeTableRows("crm_deals", "status,amount_cents,updated_at,closed_at", (q) =>
	        q.order("updated_at", { ascending: false }).limit(6000)
	      );
	      let pipelineValue = 0;
	      let openDeals = 0;
	      let openAmount = 0;
	      let wonMonth = 0;
	      let wonMonthCount = 0;
	      let lostMonthCount = 0;
	      const monthStart = startOfMonth();

	      const statusCounts = { open: 0, won: 0, lost: 0, other: 0 };
	      const statusValues = { open: 0, won: 0, lost: 0, other: 0 };

	      deals.forEach((d) => {
	        const status = normalizeStatus(d.status);
	        const amount = toNumber(d.amount_cents) / 100;

	        if (statusCounts[status] == null) statusCounts.other += 1;
	        else statusCounts[status] += 1;

	        if (statusValues[status] == null) statusValues.other += amount;
	        else statusValues[status] += amount;

	        if (status === "open") {
	          pipelineValue += amount;
	          openDeals += 1;
	          openAmount += amount;
	        }

	        if (status === "won" && isSameOrAfter(d.closed_at || d.updated_at, monthStart)) {
	          wonMonth += amount;
	          wonMonthCount += 1;
	        }

	        if (status === "lost" && isSameOrAfter(d.closed_at || d.updated_at, monthStart)) {
	          lostMonthCount += 1;
	        }
	      });

	      const won6m = buildMonthlySeries(
	        deals.filter((d) => normalizeStatus(d.status) === "won"),
	        (d) => d.closed_at || d.updated_at,
	        (d) => toNumber(d.amount_cents) / 100,
	        6
	      );

	      const winRate = wonMonthCount + lostMonthCount ? round2((wonMonthCount / (wonMonthCount + lostMonthCount)) * 100) : 0;
	      stats.crm = {
	        openDeals,
	        pipelineValue,
	        wonMonth,
	        wonMonthCount,
	        lostMonthCount,
	        winRate,
	        avgOpenDeal: openDeals ? round2(openAmount / openDeals) : 0,
	        series: {
	          won6m,
	        },
	        breakdown: {
	          statusCounts,
	          statusValues,
	        },
	      };
	    }

	    if (modules.transport) {
	      const [shipments, tours] = await Promise.all([
	        safeTableRows("transport_shipments", "status,price_cents,distance_m,created_at", (q) =>
	          q.order("created_at", { ascending: false }).limit(6000)
	        ),
	        safeTableRows("transport_tours", "status,tour_date,created_at", (q) =>
	          q.order("created_at", { ascending: false }).limit(4000)
	        ),
	      ]);
	      const monthStart = startOfMonth();
	      let monthRevenue = 0;
	      let distanceKm = 0;
	      let doneMonth = 0;
	      const shipmentStatusCounts = {};
	      shipments.forEach((s) => {
	        const st = normalizeStatus(s.status);
	        shipmentStatusCounts[st] = (shipmentStatusCounts[st] || 0) + 1;
	        const price = toNumber(s.price_cents) / 100;
	        if (isSameOrAfter(s.created_at, monthStart)) monthRevenue += price;
	        const dist = toNumber(s.distance_m) / 1000;
	        if (["planned", "in_progress"].includes(st)) distanceKm += dist;
	        if (["done", "completed", "delivered"].includes(st) && isSameOrAfter(s.created_at, monthStart)) doneMonth += 1;
	      });

	      const tourStatusCounts = {};
	      tours.forEach((t) => {
	        const st = normalizeStatus(t.status);
	        tourStatusCounts[st] = (tourStatusCounts[st] || 0) + 1;
	      });

	      const revenue30 = buildDailySeries(
	        shipments.filter((s) => normalizeStatus(s.status) !== "canceled"),
	        (s) => s.created_at,
	        (s) => toNumber(s.price_cents) / 100,
	        30
	      );
	      const shipments30 = buildDailySeries(
	        shipments.filter((s) => normalizeStatus(s.status) !== "canceled"),
	        (s) => s.created_at,
	        () => 1,
	        30
	      );
	      const distance30 = buildDailySeries(
	        shipments.filter((s) => normalizeStatus(s.status) !== "canceled"),
	        (s) => s.created_at,
	        (s) => toNumber(s.distance_m) / 1000,
	        30
	      );
	      stats.transport = {
	        activeShipments: shipments.filter((s) => ["planned", "in_progress"].includes(normalizeStatus(s.status))).length,
	        monthRevenue,
	        distanceKm,
	        revPerKm: distanceKm > 0 ? round2(monthRevenue / distanceKm) : 0,
	        doneMonth,
	        openTours: tours.filter((t) => ["planned", "in_progress"].includes(normalizeStatus(t.status))).length,
	        series: {
	          revenue30,
	          shipments30,
	          distance30,
	        },
	        breakdown: {
	          shipmentStatusCounts,
	          tourStatusCounts,
	        },
	      };
	    }

	    if (modules.fleet || modules.transport) {
	      const [vehicles, drivers] = await Promise.all([
	        safeTableRows(
	          "transport_vehicles",
	          "is_active,technical_inspection_due_at,insurance_expires_at,next_service_due_at",
	          (q) => q.limit(6000)
	        ),
	        safeTableRows("transport_drivers", "is_active,license_expiry,medical_visit_expires_at", (q) => q.limit(6000)),
	      ]);
	      const vehiclesActive = vehicles.filter((v) => v.is_active !== false).length;
	      const driversActive = drivers.filter((d) => d.is_active !== false).length;

	      let alerts30 = 0;
	      let vehiclesAlerted30 = 0;
	      let driversAlerted30 = 0;

	      let ctDue30 = 0;
	      let insuranceDue30 = 0;
	      let serviceDue30 = 0;
	      let licenseDue30 = 0;
	      let medicalDue30 = 0;

	      vehicles.forEach((v) => {
	        if (v.is_active === false) return;
	        let has = false;
	        if (isWithinDays(v.technical_inspection_due_at, 30)) {
	          alerts30 += 1;
	          ctDue30 += 1;
	          has = true;
	        }
	        if (isWithinDays(v.insurance_expires_at, 30)) {
	          alerts30 += 1;
	          insuranceDue30 += 1;
	          has = true;
	        }
	        if (isWithinDays(v.next_service_due_at, 30)) {
	          alerts30 += 1;
	          serviceDue30 += 1;
	          has = true;
	        }
	        if (has) vehiclesAlerted30 += 1;
	      });

	      drivers.forEach((d) => {
	        if (d.is_active === false) return;
	        let has = false;
	        if (isWithinDays(d.license_expiry, 30)) {
	          alerts30 += 1;
	          licenseDue30 += 1;
	          has = true;
	        }
	        if (isWithinDays(d.medical_visit_expires_at, 30)) {
	          alerts30 += 1;
	          medicalDue30 += 1;
	          has = true;
	        }
	        if (has) driversAlerted30 += 1;
	      });

	      const totalEntities = vehiclesActive + driversActive;
	      const alertedEntities30 = vehiclesAlerted30 + driversAlerted30;
	      const complianceRate30 = totalEntities
	        ? round2(((totalEntities - alertedEntities30) / totalEntities) * 100)
	        : 100;

	      stats.fleet = {
	        vehiclesActive,
	        driversActive,
	        alerts30,
	        vehiclesAlerted30,
	        driversAlerted30,
	        alertedEntities30,
	        complianceRate30,
	        breakdown: {
	          ctDue30,
	          insuranceDue30,
	          serviceDue30,
	          licenseDue30,
	          medicalDue30,
	        },
	      };
	    }

	    if (modules.logistics) {
	      const [levels, rules, warehouses] = await Promise.all([
	        safeTableRows("logistics_stock_levels", "warehouse_id,product_id,qty_on_hand,qty_reserved,stock_state", (q) => q.limit(10000)),
	        safeTableRows("logistics_reorder_rules", "warehouse_id,product_id,min_qty,is_active", (q) => q.eq("is_active", true).limit(6000)),
	        safeTableRows("logistics_warehouses", "id,is_active", (q) => q.limit(1000)),
	      ]);

	      const stockKeyQty = new Map();
	      let availableQty = 0;
	      let onHandQty = 0;
	      let reservedQty = 0;
	      let outOfStock = 0;
	      const stockStateCounts = {};
	      levels.forEach((l) => {
	        const stateKey = normalizeStatus(l.stock_state || "available");
	        stockStateCounts[stateKey] = (stockStateCounts[stateKey] || 0) + 1;
	        const onHand = toNumber(l.qty_on_hand);
	        const reserved = toNumber(l.qty_reserved);
	        onHandQty += onHand;
	        reservedQty += reserved;
	        if (onHand <= 0) outOfStock += 1;

	        const freeQty = Math.max(0, onHand - reserved);
	        if (stateKey === "available") availableQty += freeQty;
	        const k = `${l.warehouse_id || ""}:${l.product_id || ""}`;
	        stockKeyQty.set(k, (stockKeyQty.get(k) || 0) + freeQty);
	      });

      let lowStockAlerts = 0;
      rules.forEach((r) => {
        const k = `${r.warehouse_id || ""}:${r.product_id || ""}`;
        const qty = stockKeyQty.get(k) || 0;
        if (qty <= toNumber(r.min_qty)) lowStockAlerts += 1;
      });

	      stats.logistics = {
	        activeWarehouses: warehouses.filter((w) => w.is_active !== false).length,
	        availableQty,
	        lowStockAlerts,
	        outOfStock,
	        reserveRatio: onHandQty > 0 ? round2((reservedQty / onHandQty) * 100) : 0,
	        breakdown: {
	          stockStateCounts,
	        },
	      };
	    }

	    if (modules.purchases) {
	      const [orders, suppliers] = await Promise.all([
	        safeTableRows("purchase_orders", "status,total_cents,issue_date,created_at", (q) =>
	          q.order("created_at", { ascending: false }).limit(8000)
	        ),
	        safeTableRows("purchase_suppliers", "is_active,created_at", (q) => q.limit(8000)),
	      ]);
	      const monthStart = startOfMonth();
	      let openOrders = 0;
	      let openAmount = 0;
	      let spendMonth = 0;
	      const statusCounts = {};
	      orders.forEach((o) => {
	        const st = normalizeStatus(o.status);
	        statusCounts[st] = (statusCounts[st] || 0) + 1;
	        const total = toNumber(o.total_cents) / 100;
	        if (["draft", "sent", "confirmed", "partially_received"].includes(st)) {
	          openOrders += 1;
	          openAmount += total;
	        }
	        if (st === "received" && isSameOrAfter(o.issue_date || o.created_at, monthStart)) spendMonth += total;
	      });
	      const spend6m = buildMonthlySeries(
	        orders.filter((o) => normalizeStatus(o.status) === "received"),
	        (o) => o.issue_date || o.created_at,
	        (o) => toNumber(o.total_cents) / 100,
	        6
	      );
	      stats.purchases = {
	        openOrders,
	        openAmount,
	        spendMonth,
	        activeSuppliers: suppliers.filter((s) => s.is_active !== false).length,
	        series: {
	          spend6m,
	        },
	        breakdown: {
	          statusCounts,
	        },
	      };
	    }

	    if (modules.loyalty) {
	      const [members, events] = await Promise.all([
	        safeTableRows("loyalty_members", "status,points_balance,created_at", (q) => q.order("created_at", { ascending: false }).limit(8000)),
	        safeTableRows("loyalty_events", "points,created_at", (q) => q.order("created_at", { ascending: false }).limit(8000)),
	      ]);
	      const monthStart = startOfMonth();
	      let pointsIssuedMonth = 0;
	      let pointsRedeemedMonth = 0;
	      events.forEach((e) => {
	        const pts = toNumber(e.points);
	        if (!isSameOrAfter(e.created_at, monthStart)) return;
	        if (pts > 0) pointsIssuedMonth += pts;
	        if (pts < 0) pointsRedeemedMonth += Math.abs(pts);
	      });
	      const issued6m = buildMonthlySeries(
	        events.filter((e) => toNumber(e.points) > 0),
	        (e) => e.created_at,
	        (e) => Math.max(0, toNumber(e.points)),
	        6
	      );
	      const redeemed6m = buildMonthlySeries(
	        events.filter((e) => toNumber(e.points) < 0),
	        (e) => e.created_at,
	        (e) => Math.abs(toNumber(e.points)),
	        6
	      );
	      stats.loyalty = {
	        activeMembers: members.filter((m) => normalizeStatus(m.status) === "active").length,
	        pointsIssuedMonth,
	        pointsRedeemedMonth,
	        series: {
	          issued6m,
	          redeemed6m,
	        },
	      };
	    }

	    if (modules.rental) {
	      const reservations = await safeTableRows("rental_reservations", "status,check_in,total_cents,created_at", (q) =>
	        q.order("created_at", { ascending: false }).limit(8000)
	      );
	      const monthStart = startOfMonth();
	      let openReservations = 0;
	      let arrivals7 = 0;
	      let revenueMonth = 0;
	      const statusCounts = {};
	      reservations.forEach((r) => {
	        const st = normalizeStatus(r.status);
	        statusCounts[st] = (statusCounts[st] || 0) + 1;
	        if (["pending", "confirmed", "blocked"].includes(st)) openReservations += 1;
	        if (["pending", "confirmed"].includes(st) && isWithinDays(r.check_in, 7)) arrivals7 += 1;
	        if (st === "confirmed" && isSameOrAfter(r.check_in || r.created_at, monthStart)) revenueMonth += toNumber(r.total_cents) / 100;
	      });
	      const revenue6m = buildMonthlySeries(
	        reservations.filter((r) => normalizeStatus(r.status) === "confirmed"),
	        (r) => r.check_in || r.created_at,
	        (r) => toNumber(r.total_cents) / 100,
	        6
	      );
	      const arrivalsNext7 = buildForwardDailySeries(
	        reservations.filter((r) => ["pending", "confirmed"].includes(normalizeStatus(r.status))),
	        (r) => r.check_in,
	        () => 1,
	        7
	      );
	      stats.rental = {
	        openReservations,
	        arrivals7,
	        revenueMonth,
	        series: {
	          revenue6m,
	          arrivalsNext7,
	        },
	        breakdown: {
	          statusCounts,
	        },
	      };
	    }

	    if (modules.restaurant || modules.billing || modules.pos) {
	      const orders = await safeTableRows("restaurant_orders", "source,status,total_cents,created_at,payment_status", (q) =>
	        q.order("created_at", { ascending: false }).limit(8000)
	      );
	      const today = startOfToday();
	      const monthStart = startOfMonth();
	      const todayOrders = orders.filter((o) => isSameOrAfter(o.created_at, today));
	      const monthOrders = orders.filter((o) => isSameOrAfter(o.created_at, monthStart));
	      const todayRevenue = todayOrders
	        .filter((o) => normalizeStatus(o.status) !== "canceled")
	        .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0);
	      const monthRevenueAll = monthOrders
	        .filter((o) => normalizeStatus(o.status) !== "canceled")
	        .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0);

	      const statusCounts = {};
	      const sourceCounts = {};
	      const paymentStatusCounts = {};
	      orders.forEach((o) => {
	        const st = normalizeStatus(o.status);
	        statusCounts[st] = (statusCounts[st] || 0) + 1;
	        const src = normalizeStatus(o.source || "unknown");
	        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
	        const pay = normalizeStatus(o.payment_status || "");
	        if (pay) paymentStatusCounts[pay] = (paymentStatusCounts[pay] || 0) + 1;
	      });

	      const posOrders = orders.filter((o) => normalizeStatus(o.source) === "pos");
	      const posStatusCounts = {};
	      const posPaymentStatusCounts = {};
	      posOrders.forEach((o) => {
	        const st = normalizeStatus(o.status);
	        posStatusCounts[st] = (posStatusCounts[st] || 0) + 1;
	        const pay = normalizeStatus(o.payment_status || "");
	        if (pay) posPaymentStatusCounts[pay] = (posPaymentStatusCounts[pay] || 0) + 1;
	      });

	      const hourlyLabels = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0") + ":00");
	      const hourlyCounts = Array.from({ length: 24 }, () => 0);
	      todayOrders.forEach((o) => {
	        const dt = parseDateSafe(o.created_at);
	        if (!dt) return;
	        const h = dt.getHours();
	        if (h >= 0 && h <= 23) hourlyCounts[h] = (hourlyCounts[h] || 0) + 1;
	      });
	      const ordersTodayHourly = { labels: hourlyLabels, values: hourlyCounts.map((n) => toNumber(n)) };

	      const revenue30All = buildDailySeries(
	        orders.filter((o) => normalizeStatus(o.status) !== "canceled"),
	        (o) => o.created_at,
	        (o) => toNumber(o.total_cents) / 100,
	        30
	      );
	      const orders30All = buildDailySeries(
	        orders,
	        (o) => o.created_at,
	        () => 1,
	        30
	      );
	      const posRevenue30 = buildDailySeries(
	        posOrders.filter((o) => normalizeStatus(o.status) !== "canceled"),
	        (o) => o.created_at,
	        (o) => toNumber(o.total_cents) / 100,
	        30
	      );
	      const posTickets30 = buildDailySeries(
	        posOrders,
	        (o) => o.created_at,
	        () => 1,
	        30
	      );

	      if (modules.restaurant) {
	        const [items, locations] = await Promise.all([
	          safeTableRows("restaurant_menu_items", "is_active,available_for_qr,available_for_pos", (q) => q.limit(6000)),
	          safeTableRows("restaurant_locations", "id,is_active,public_is_open", (q) => q.limit(2000)),
	        ]);

	        const canceledToday = todayOrders.filter((o) => normalizeStatus(o.status) === "canceled").length;
	        const avgTicketToday = todayOrders.length ? todayRevenue / Math.max(1, todayOrders.length - canceledToday) : 0;
	        stats.restaurant = {
	          todayOrders: todayOrders.length,
	          openOrders: orders.filter((o) => ["new", "confirmed", "preparing", "ready"].includes(normalizeStatus(o.status))).length,
	          todayRevenue,
	          monthOrders: monthOrders.length,
	          monthRevenue: monthRevenueAll,
	          avgTicketToday: round2(avgTicketToday),
	          cancelRateToday: todayOrders.length ? round2((canceledToday / todayOrders.length) * 100) : 0,
	          activeMenus: items.filter((i) => i.is_active !== false).length,
	          activeLocations: locations.filter((l) => l.is_active !== false).length,
	          series: {
	            revenue30All,
	            orders30All,
	            ordersTodayHourly,
	          },
	          breakdown: {
	            statusCounts,
	            sourceCounts,
	            paymentStatusCounts,
	          },
	        };
	      }

	      const posTicketsToday = todayOrders.filter((o) => normalizeStatus(o.source) === "pos").length;
	      const posRevenueToday = todayOrders
	        .filter((o) => normalizeStatus(o.source) === "pos" && normalizeStatus(o.status) !== "canceled")
	        .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0);
	      const posTicketsMonth = monthOrders.filter((o) => normalizeStatus(o.source) === "pos").length;
	      const posRevenueMonth = monthOrders
	        .filter((o) => normalizeStatus(o.source) === "pos" && normalizeStatus(o.status) !== "canceled")
	        .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0);

	      stats.pos = {
	        posTicketsToday,
	        posRevenueToday,
	        avgTicketToday: posTicketsToday ? round2(posRevenueToday / Math.max(1, posTicketsToday)) : 0,
	        posTicketsMonth,
	        posRevenueMonth,
	        series: {
	          posRevenue30,
	          posTickets30,
	        },
	        breakdown: {
	          posStatusCounts,
	          posPaymentStatusCounts,
	        },
	      };
	    }

    return stats;
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
	            <div class="mbl-context-strip"></div>
	          </div>
	          <div class="mbl-header-actions">
	            <button class="mbl-btn mbl-btn-ghost mbl-export" type="button">Exporter CSV</button>
	            <button class="mbl-btn mbl-btn-solid mbl-refresh" type="button">Rafraichir</button>
	            <span class="mbl-last-sync">Derniere synchro: --</span>
	          </div>
	        </header>

	        <section class="mbl-viewbar mbl-card">
	          <div>
	            <h2>Vue</h2>
	            <p class="mbl-viewhint" data-view-hint>Chargement des modules...</p>
	          </div>
	          <div class="mbl-viewchips" data-view-chips></div>
	        </section>

	        <section class="mbl-module-note" hidden></section>

	        <section class="mbl-filters mbl-card mbl-interventions-only">
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

	        <section class="mbl-panels">
	          <article class="mbl-card mbl-panel" data-actions></article>
	          <article class="mbl-card mbl-panel" data-alerts></article>
	        </section>

	        <section class="mbl-insights"></section>

	        <section class="mbl-analytics-grid mbl-interventions-only">
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

        <section class="mbl-card mbl-table-card mbl-interventions-only">
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
      const openSub = event.target.closest("[data-open-subscriptions]");
      if (openSub) {
        event.preventDefault();
        event.stopPropagation();
        try {
          window.MBL?.openSubscriptionsModal?.({ source: "dashboard:cta" });
        } catch (_) {}
        return;
      }

      const chip = event.target.closest(".mbl-viewchip[data-business]");
      if (chip) {
        event.preventDefault();
        const next = normalizeViewKey(chip.getAttribute("data-business"));
        if (next !== normalizeViewKey(state.view?.business)) {
          setViewSelection(next, { openSubscriptions: true });
          const shell = root.querySelector(SELECTORS.shell);
          if (shell) {
            shell.classList.add("is-switching");
            setTimeout(() => shell.classList.remove("is-switching"), 220);
          }
          updateDashboard();
          setTimeout(resizeCharts, 0);
        }
        return;
      }

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
    if (state.charts.dynamic && state.charts.dynamic.size) {
      state.charts.dynamic.forEach((chart) => {
        try {
          chart && chart.resize && chart.resize();
        } catch (_) {}
      });
    }
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
	      state.context = await resolveDashboardContext();
	      // Re-apply view selection once org/modules are known (org-scoped localStorage).
	      {
	        const urlView = readViewFromUrl();
	        const savedView = loadSavedViewKey();
	        state.view.business = urlView !== "all" ? urlView : savedView;
	        state.view.business = ensureValidViewSelection(state.context?.modules || {});
	        saveViewKey(state.view.business);
	      }
	      const payload = await fetchDashboardPayload(state.context);
	      state.data = payload;
	      state.moduleStats = payload.moduleStats || {};
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

  async function fetchDashboardPayload(context) {
    const moduleStats = await fetchModuleStats(context || {});
    const hasInterventions = Boolean(context?.modules?.interventions);
    if (!hasInterventions) {
      return {
        interventions: [],
        expenses: [],
        compensations: [],
        assignees: [],
        profiles: [],
        moduleStats,
      };
    }

    let query = state.supabase
      .from("interventions")
      .select(
        "id,internal_ref,title,client_name,client_ref,address,status,start_at,end_at,tarif,created_at,updated_at,pv_status"
      )
      .order(state.config.dateField || "start_at", { ascending: false, nullsFirst: false })
      .limit(state.config.maxRows);

    const interventionsResult = await query;
    if (interventionsResult.error) {
      if (isMissingRelationError(interventionsResult.error)) {
        return {
          interventions: [],
          expenses: [],
          compensations: [],
          assignees: [],
          profiles: [],
          moduleStats,
        };
      }
      throw interventionsResult.error;
    }
    const interventions = interventionsResult.data || [];

    if (!interventions.length) {
      return {
        interventions: [],
        expenses: [],
        compensations: [],
        assignees: [],
        profiles: [],
        moduleStats,
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
      moduleStats,
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
    renderContextSummary();
    const viewKey = normalizeViewKey(state.view?.business);

    // Interventions filters/table are meaningful only in the Interventions view.
    const allRows = createEnrichedRows();
    const effectiveRows = viewKey === "interventions" ? sortRows(applyFilters(allRows)) : allRows;
    state.filteredRows = viewKey === "interventions" ? effectiveRows : [];

    renderViewBar();
    renderKpis(effectiveRows);
    renderActions(effectiveRows);
    renderAlerts(effectiveRows);
    renderInsights(effectiveRows);

    if (Boolean(state.context?.modules?.interventions) && viewKey === "interventions") {
      renderTable(effectiveRows);
      renderCharts(effectiveRows);
    } else {
      updateTableCount(0);
    }
  }

  function renderViewBar() {
    const root = getRoot(state.config.container);
    if (!root) return;
    const chipsMount = root.querySelector(SELECTORS.viewChips);
    const hintEl = root.querySelector(SELECTORS.viewHint);
    if (!chipsMount) return;

    const modules = state.context?.modules || {};
    const viewKey = normalizeViewKey(state.view?.business);
    const subActive = Boolean(state.context?.subscriptionActive);

    const effectiveModules = subActive ? modules : {};
    const currentDef = VIEW_DEFS.find((v) => v.key === viewKey) || VIEW_DEFS[0];
    if (hintEl) {
      const parts = [];
      parts.push(`${currentDef.label}: ${currentDef.hint}`);
      if (!subActive) parts.push("Abonnement requis pour activer les modules.");
      hintEl.textContent = parts.join(" ");
    }

    chipsMount.innerHTML = VIEW_DEFS.map((def) => {
      const enabled = def.key === "all" ? true : isViewEnabled(def.key, effectiveModules);
      const locked = def.key !== "all" && !enabled;
      const active = def.key === viewKey;

      const icon = def.icon || "";
      const lockIcon = locked ? `<span class="mbl-chip-ico">${VIEW_ICON.lock}</span>` : "";
      const cls = ["mbl-viewchip", active ? "is-active" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
      return `
        <button
          type="button"
          class="${cls}"
          data-business="${escapeHtml(def.key)}"
          ${locked ? 'data-open-subscriptions="1"' : ""}
          aria-pressed="${active ? "true" : "false"}"
          aria-disabled="${locked ? "true" : "false"}"
          title="${escapeHtml(def.label + (locked ? " (verrouille)" : ""))}"
        >
          <span class="mbl-chip-ico">${icon}</span>
          <span>${escapeHtml(def.label)}</span>
          ${lockIcon}
        </button>
      `;
    }).join("");
  }

  function renderActions(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const mount = root.querySelector(SELECTORS.actionsArea);
    if (!mount) return;

    const modules = state.context?.modules || {};
    const viewKey = normalizeViewKey(state.view?.business);
    const appRoot = getAppRoot();

    const routes = {
      subscriptions: "/subscriptions",
      settings: `${appRoot}/settings`,
      crm: `${appRoot}/crm/crm`,
      transport: `${appRoot}/transport`,
      logistics: `${appRoot}/logistics`,
      purchases: `${appRoot}/purchases`,
      loyalty: `${appRoot}/loyalty`,
      restaurant: `${appRoot}/restaurant`,
      pos: `${appRoot}/pos`,
      rental: `${appRoot}/rental`,
      interventions: `${appRoot}/admin/interventions`,
      products: `${appRoot}/admin/products`,
      categories: `${appRoot}/admin/categories`,
      invoiceNew: `${appRoot}/facturation/invoice`,
      invoicesList: `${appRoot}/facturation/invoices-list`,
      quoteNew: `${appRoot}/facturation/devis-add`,
      quotesList: `${appRoot}/facturation/devis-list`,
      clients: `${appRoot}/facturation/clients`,
    };

    const actions = [];

    const push = (a) => actions.push(a);
    const withMods = (key) => Boolean(modules[key]);

    if (viewKey === "billing") {
      push({ kind: "link", label: "Nouvelle facture", href: routes.invoiceNew });
      push({ kind: "link", label: "Factures", href: routes.invoicesList });
      push({ kind: "link", label: "Nouveau devis", href: routes.quoteNew });
      push({ kind: "link", label: "Devis", href: routes.quotesList });
      push({ kind: "link", label: "Clients", href: routes.clients });
      push({ kind: "link", label: "Produits", href: routes.products });
    } else if (viewKey === "interventions") {
      push({ kind: "link", label: "Interventions", href: routes.interventions });
      push({ kind: "link", label: "Produits", href: routes.products });
      push({ kind: "link", label: "Categories", href: routes.categories });
    } else if (viewKey === "crm") {
      push({ kind: "link", label: "Ouvrir CRM", href: routes.crm });
      if (withMods("billing")) push({ kind: "link", label: "Clients", href: routes.clients });
    } else if (viewKey === "transport") {
      push({ kind: "link", label: "Ouvrir Transport", href: routes.transport });
    } else if (viewKey === "fleet") {
      push({ kind: "link", label: "Parc & Chauffeurs", href: routes.transport });
    } else if (viewKey === "logistics") {
      push({ kind: "link", label: "Ouvrir Logistique", href: routes.logistics });
    } else if (viewKey === "purchases") {
      push({ kind: "link", label: "Ouvrir Achats", href: routes.purchases });
    } else if (viewKey === "restaurant") {
      push({ kind: "link", label: "Ouvrir Restauration", href: routes.restaurant });
      if (withMods("pos")) push({ kind: "link", label: "Caisse (POS)", href: routes.pos });
    } else if (viewKey === "pos") {
      push({ kind: "link", label: "Ouvrir Caisse (POS)", href: routes.pos });
    } else if (viewKey === "loyalty") {
      push({ kind: "link", label: "Ouvrir Fidelite", href: routes.loyalty });
    } else if (viewKey === "rental") {
      push({ kind: "link", label: "Ouvrir Location", href: routes.rental });
    } else {
      // all
      if (withMods("billing")) {
        push({ kind: "link", label: "Nouvelle facture", href: routes.invoiceNew });
        push({ kind: "link", label: "Clients", href: routes.clients });
      }
      if (withMods("interventions")) push({ kind: "link", label: "Interventions", href: routes.interventions });
      if (withMods("crm")) push({ kind: "link", label: "CRM", href: routes.crm });
      if (withMods("transport")) push({ kind: "link", label: "Transport", href: routes.transport });
      if (withMods("logistics")) push({ kind: "link", label: "Logistique", href: routes.logistics });
      if (withMods("purchases")) push({ kind: "link", label: "Achats", href: routes.purchases });
      if (withMods("restaurant")) push({ kind: "link", label: "Restauration", href: routes.restaurant });
      if (withMods("pos")) push({ kind: "link", label: "Caisse (POS)", href: routes.pos });
      if (withMods("loyalty")) push({ kind: "link", label: "Fidelite", href: routes.loyalty });
      if (withMods("rental")) push({ kind: "link", label: "Location", href: routes.rental });
      push({ kind: "link", label: "Parametres", href: routes.settings });
      push({ kind: "subscriptions", label: "Abonnements", href: routes.subscriptions });
    }

    const maxActions = viewKey === "all" ? 10 : 8;
    const visible = actions.slice(0, maxActions);

    mount.innerHTML = `
      <h3>Actions rapides</h3>
      <p>Raccourcis adaptes a la vue <strong>${escapeHtml(viewKeyLabel(viewKey))}</strong>.</p>
      <div class="mbl-actions-grid">
        ${visible
          .map((a) => {
            if (a.kind === "subscriptions") {
              return `
                <button type="button" class="mbl-action is-cta" data-open-subscriptions="1">
                  <span>${escapeHtml(a.label)}</span>
                  <span class="mbl-action-meta">${VIEW_ICON.arrow}</span>
                </button>
              `;
            }
            return `
              <a class="mbl-action" href="${escapeHtml(a.href)}">
                <span>${escapeHtml(a.label)}</span>
                <span class="mbl-action-meta">${VIEW_ICON.arrow}</span>
              </a>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAlerts(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const mount = root.querySelector(SELECTORS.alertsArea);
    if (!mount) return;

    const modules = state.context?.modules || {};
    const moduleStats = state.moduleStats || {};
    const viewKey = normalizeViewKey(state.view?.business);
    const stats = computeStats(rows || []);

    const alerts = [];
    const push = (a) => alerts.push(a);
    const inView = (keys) => keys.includes("all") || keys.includes(viewKey);

    if (modules.billing && moduleStats.billing && inView(["all", "billing"])) {
      const overdue = toNumber(moduleStats.billing.overdueInvoices);
      const open = toNumber(moduleStats.billing.openInvoices);
      if (overdue > 0) push({ tone: "bad", title: "Factures en retard", desc: `${overdue} a relancer / regler.` });
      else if (viewKey === "billing") push({ tone: "good", title: "Factures a jour", desc: "Aucune facture en retard." });
      if (open > 0 && overdue === 0) push({ tone: "warn", title: "Factures ouvertes", desc: `${open} en attente de paiement.` });
    }

    if (modules.interventions && inView(["all", "interventions"])) {
      if (stats.inProgress > 0) push({ tone: "warn", title: "Interventions en cours", desc: `${stats.inProgress} intervention(s) en execution.` });
      else if (viewKey === "interventions") push({ tone: "good", title: "Terrain stable", desc: "Aucune intervention en cours." });
    }

    if ((modules.fleet || modules.transport) && moduleStats.fleet && inView(["all", "fleet", "transport"])) {
      const a30 = toNumber(moduleStats.fleet.alerts30);
      if (a30 > 0) push({ tone: "bad", title: "Alertes conformite (30j)", desc: `${a30} element(s) a verifier (CT, assurance, etc).` });
      else if (viewKey === "fleet") push({ tone: "good", title: "Conformite OK", desc: "Aucune alerte sur 30 jours." });
    }

    if (modules.logistics && moduleStats.logistics && inView(["all", "logistics"])) {
      const low = toNumber(moduleStats.logistics.lowStockAlerts);
      if (low > 0) push({ tone: "warn", title: "Reapprovisionnement", desc: `${low} alerte(s) stock bas.` });
      else if (viewKey === "logistics") push({ tone: "good", title: "Stock OK", desc: "Aucune alerte stock bas." });
    }

    if (modules.restaurant && moduleStats.restaurant && inView(["all", "restaurant"])) {
      const openOrders = toNumber(moduleStats.restaurant.openOrders);
      if (openOrders > 0) push({ tone: "warn", title: "Commandes a traiter", desc: `${openOrders} commande(s) en attente.` });
      else if (viewKey === "restaurant") push({ tone: "good", title: "Cuisine fluide", desc: "Aucune commande en attente." });
    }

    if (modules.purchases && moduleStats.purchases && inView(["all", "purchases"])) {
      const openPO = toNumber(moduleStats.purchases.openOrders);
      if (openPO > 0) push({ tone: "warn", title: "Achats en cours", desc: `${openPO} bon(s) de commande non receptionnes.` });
      else if (viewKey === "purchases") push({ tone: "good", title: "Achats OK", desc: "Aucun bon de commande en attente." });
    }

    if (modules.loyalty && moduleStats.loyalty && inView(["all", "loyalty"])) {
      const members = toNumber(moduleStats.loyalty.activeMembers);
      if (viewKey === "loyalty") push({ tone: "good", title: "Membres actifs", desc: `${members} membre(s) fidelite.` });
    }

    if (modules.rental && moduleStats.rental && inView(["all", "rental"])) {
      const upcoming = toNumber(moduleStats.rental.arrivals7);
      if (upcoming > 0) push({ tone: "warn", title: "Arrivees (7j)", desc: `${upcoming} arrivee(s) a preparer.` });
      else if (viewKey === "rental") push({ tone: "good", title: "Aucune arrivee proche", desc: "Rien a preparer sur 7 jours." });
    }

    // In "Tout", keep only issues first (avoid noise).
    let visible = alerts.slice();
    if (viewKey === "all") {
      const issues = visible.filter((a) => a.tone === "bad" || a.tone === "warn");
      visible = issues.length ? issues : visible;
    }

    visible.sort((a, b) => {
      const prio = (t) => (t === "bad" ? 0 : t === "warn" ? 1 : 2);
      return prio(a.tone) - prio(b.tone);
    });
    visible = visible.slice(0, 4);

    if (!visible.length) {
      visible = [{ tone: "good", title: "Aucune alerte", desc: "Tout est OK pour le moment." }];
    }

    mount.innerHTML = `
      <h3>Alertes</h3>
      <p>Elements a surveiller (selon la vue).</p>
      <div class="mbl-alert-list">
        ${visible
          .map((a) => {
            const cls = a.tone === "bad" ? "is-bad" : a.tone === "warn" ? "is-warn" : "is-good";
            return `
              <div class="mbl-alert ${cls}">
                <strong>${escapeHtml(a.title)}</strong>
                <span>${escapeHtml(a.desc)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderInsights(rows) {
    const root = getRoot(state.config.container);
    if (!root) return;
    const mount = root.querySelector(SELECTORS.insightsArea);
    if (!mount) return;

    const modules = state.context?.modules || {};
    const moduleStats = state.moduleStats || {};
    const viewKey = normalizeViewKey(state.view?.business);
    const canChart = Boolean(window.echarts);

    const css = getComputedStyle(document.documentElement);
    const primary = String(css.getPropertyValue("--mbl-primary") || "").trim() || "#0ea5e9";
    const primaryRgb = String(css.getPropertyValue("--mbl-primary-rgb") || "").trim() || "14, 165, 233";

    const C = {
      primary,
      primaryRgb,
      good: "#22c55e",
      warn: "#f59e0b",
      bad: "#ef4444",
      slate: "#94a3b8",
      ink: "rgba(2, 6, 23, 0.84)",
      inkSoft: "rgba(2, 6, 23, 0.62)",
      line: "rgba(15, 23, 42, 0.12)",
      grid: "rgba(15, 23, 42, 0.08)",
    };

    function baseGrid() {
      return {
        top: 42,
        left: 10,
        right: 12,
        bottom: 10,
        containLabel: true,
      };
    }

    function baseAxisCategory(labels) {
      return {
        type: "category",
        data: Array.isArray(labels) && labels.length ? labels : ["--"],
        axisLabel: { color: C.inkSoft },
        axisLine: { lineStyle: { color: C.line } },
        axisTick: { show: false },
      };
    }

    function baseAxisValueMoney() {
      return {
        type: "value",
        axisLabel: {
          color: C.inkSoft,
          formatter: function (v) {
            return compactCurrency(v, state.config.locale, state.config.currency);
          },
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: C.grid } },
      };
    }

    function baseAxisValueCount() {
      return {
        type: "value",
        axisLabel: { color: C.inkSoft },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: C.grid } },
      };
    }

	    function optionLineMoney(labels, seriesDefs) {
	      return {
	        backgroundColor: "transparent",
	        animationDuration: 700,
	        animationDurationUpdate: 420,
	        animationEasing: "cubicOut",
	        tooltip: {
	          trigger: "axis",
	          valueFormatter: (value) => money(value),
	        },
	        legend: {
	          data: seriesDefs.map((s) => s.name),
	          textStyle: { color: C.inkSoft, fontSize: 11 },
	        },
	        grid: baseGrid(),
	        xAxis: baseAxisCategory(labels),
	        yAxis: baseAxisValueMoney(),
	        series: seriesDefs.map((s, idx) => {
	          const col = s.color || (idx === 0 ? C.primary : C.slate);
	          const colArea = s.areaColor || `rgba(${C.primaryRgb}, 0.12)`;
	          return {
	            name: s.name,
	            type: "line",
	            smooth: true,
	            symbol: "none",
	            lineStyle: { width: 2.4, color: col },
	            areaStyle: s.area ? { opacity: 1, color: colArea } : undefined,
	            data: Array.isArray(s.data) && s.data.length ? s.data : [0],
	          };
	        }),
	      };
	    }

	    function optionLineCounts(labels, seriesDefs) {
	      return {
	        backgroundColor: "transparent",
	        animationDuration: 700,
	        animationDurationUpdate: 420,
	        animationEasing: "cubicOut",
	        tooltip: { trigger: "axis" },
	        legend: {
	          data: seriesDefs.map((s) => s.name),
	          textStyle: { color: C.inkSoft, fontSize: 11 },
	        },
	        grid: baseGrid(),
	        xAxis: baseAxisCategory(labels),
	        yAxis: baseAxisValueCount(),
	        series: seriesDefs.map((s, idx) => {
	          const col = s.color || (idx === 0 ? C.primary : C.slate);
	          const colArea = s.areaColor || `rgba(${C.primaryRgb}, 0.10)`;
	          return {
	            name: s.name,
	            type: "line",
	            smooth: true,
	            symbol: "none",
	            lineStyle: { width: 2.4, color: col },
	            areaStyle: s.area ? { opacity: 1, color: colArea } : undefined,
	            data: Array.isArray(s.data) && s.data.length ? s.data : [0],
	          };
	        }),
	      };
	    }

    function optionLinePercent(labels, name, data) {
      return {
        backgroundColor: "transparent",
        animationDuration: 700,
        animationDurationUpdate: 420,
        animationEasing: "cubicOut",
        tooltip: {
          trigger: "axis",
          valueFormatter: (value) => percent(value),
        },
        grid: baseGrid(),
        xAxis: baseAxisCategory(labels),
        yAxis: {
          type: "value",
          axisLabel: { color: C.inkSoft, formatter: (v) => `${Math.round(toNumber(v))}%` },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: C.grid } },
        },
        series: [
          {
            name,
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2.4, color: C.primary },
            areaStyle: { opacity: 1, color: `rgba(${C.primaryRgb}, 0.10)` },
            data: Array.isArray(data) && data.length ? data : [0],
          },
        ],
      };
    }

	    function optionBarCounts(labels, name, data, color) {
	      return {
        backgroundColor: "transparent",
        animationDuration: 650,
        animationDurationUpdate: 400,
        animationEasing: "cubicOut",
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: baseGrid(),
        xAxis: baseAxisCategory(labels),
        yAxis: baseAxisValueCount(),
        series: [
          {
            name,
            type: "bar",
            data: Array.isArray(data) && data.length ? data : [0],
            barMaxWidth: 16,
            itemStyle: {
              color: color || `rgba(${C.primaryRgb}, 0.55)`,
              borderRadius: [8, 8, 0, 0],
            },
          },
        ],
      };
	    }

	    function optionBarHorizontalCounts(labels, name, data, color) {
	      return {
	        backgroundColor: "transparent",
	        animationDuration: 650,
	        animationDurationUpdate: 400,
	        animationEasing: "cubicOut",
	        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
	        grid: { top: 18, left: 10, right: 12, bottom: 10, containLabel: true },
	        xAxis: baseAxisValueCount(),
	        yAxis: {
	          type: "category",
	          data: Array.isArray(labels) && labels.length ? labels : ["--"],
	          axisLabel: { color: C.inkSoft },
	          axisLine: { lineStyle: { color: C.line } },
	          axisTick: { show: false },
	        },
	        series: [
	          {
	            name,
	            type: "bar",
	            data: Array.isArray(data) && data.length ? data : [0],
	            barMaxWidth: 14,
	            itemStyle: {
	              color: color || `rgba(${C.primaryRgb}, 0.55)`,
	              borderRadius: [0, 8, 8, 0],
	            },
	          },
	        ],
	      };
	    }

	    function optionBarHorizontalMoney(labels, name, data, color) {
	      return {
	        backgroundColor: "transparent",
	        animationDuration: 650,
	        animationDurationUpdate: 400,
	        animationEasing: "cubicOut",
	        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(v) },
	        grid: { top: 18, left: 10, right: 12, bottom: 10, containLabel: true },
	        xAxis: baseAxisValueMoney(),
	        yAxis: {
	          type: "category",
	          data: Array.isArray(labels) && labels.length ? labels : ["--"],
	          axisLabel: { color: C.inkSoft },
	          axisLine: { lineStyle: { color: C.line } },
	          axisTick: { show: false },
	        },
	        series: [
	          {
	            name,
	            type: "bar",
	            data: Array.isArray(data) && data.length ? data : [0],
	            barMaxWidth: 14,
	            itemStyle: {
	              color: color || `rgba(${C.primaryRgb}, 0.55)`,
	              borderRadius: [0, 8, 8, 0],
	            },
	          },
	        ],
	      };
	    }

    function optionPie(dataItems) {
      const data = Array.isArray(dataItems) && dataItems.length ? dataItems : [{ name: "Aucune donnée", value: 1, itemStyle: { color: C.slate } }];
      return {
        backgroundColor: "transparent",
        animationDuration: 700,
        animationDurationUpdate: 420,
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: { bottom: 0, textStyle: { color: C.inkSoft, fontSize: 11 } },
        series: [
          {
            type: "pie",
            radius: ["46%", "72%"],
            center: ["50%", "44%"],
            label: { show: false },
            itemStyle: { borderColor: "rgba(255,255,255,0.9)", borderWidth: 2 },
            data,
          },
        ],
      };
    }

    function optionGaugePercent(value, colorStops) {
      const v = Math.max(0, Math.min(100, toNumber(value)));
      const stops =
        Array.isArray(colorStops) && colorStops.length
          ? colorStops
          : [
              [0.5, C.warn],
              [1, C.good],
            ];
      return {
        backgroundColor: "transparent",
        animationDuration: 700,
        animationDurationUpdate: 420,
        animationEasing: "cubicOut",
        series: [
          {
            type: "gauge",
            startAngle: 210,
            endAngle: -30,
            radius: "92%",
            progress: { show: true, width: 12 },
            axisLine: { lineStyle: { width: 12, color: stops } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            pointer: { show: false },
            detail: {
              valueAnimation: true,
              formatter: "{value}%",
              color: C.ink,
              fontSize: 22,
              fontWeight: 800,
              offsetCenter: [0, "0%"],
            },
            data: [{ value: round2(v) }],
          },
        ],
      };
    }

    function topCounts(countObj, maxItems) {
      const entries = Object.entries(countObj || {})
        .filter(([, v]) => toNumber(v) > 0)
        .sort((a, b) => toNumber(b[1]) - toNumber(a[1]));
      const n = Math.max(3, toNumber(maxItems) || 6);
      const top = entries.slice(0, n);
      const rest = entries.slice(n).reduce((acc, [, v]) => acc + toNumber(v), 0);
      const out = top.map(([k, v]) => ({ name: k || "autre", value: toNumber(v) }));
      if (rest > 0) out.push({ name: "autres", value: rest });
      return out;
    }

    const defs = [];

    // ===== ALL =====
    if (viewKey === "all") {
      const series = [];
      const baseLabels =
        moduleStats.billing?.series?.cashIn30?.labels ||
        moduleStats.restaurant?.series?.revenue30All?.labels ||
        moduleStats.pos?.series?.posRevenue30?.labels ||
        moduleStats.transport?.series?.revenue30?.labels ||
        [];

      if (modules.billing && moduleStats.billing?.series?.cashIn30) {
        series.push({ name: "Encaissements", data: moduleStats.billing.series.cashIn30.values, color: C.primary, area: true });
      }
      if (modules.restaurant && moduleStats.restaurant?.series?.revenue30All) {
        series.push({ name: "CA Resto", data: moduleStats.restaurant.series.revenue30All.values, color: C.good, area: false });
      }
      if (modules.pos && moduleStats.pos?.series?.posRevenue30) {
        series.push({ name: "CA POS", data: moduleStats.pos.series.posRevenue30.values, color: C.warn, area: false });
      }
      if (modules.transport && moduleStats.transport?.series?.revenue30) {
        series.push({ name: "CA Transport", data: moduleStats.transport.series.revenue30.values, color: C.slate, area: false });
      }

	      if (series.length) {
	        defs.push({
	          key: "all_revenue30",
	          title: "Revenus (30 jours)",
	          subtitle: "Comparaison multi-modules.",
	          meta: "30j",
	          option: optionLineMoney(baseLabels, series.slice(0, 4)),
	        });
	      }

	      const volSeries = [];
	      const volLabels =
	        moduleStats.billing?.series?.invoicesIssued30?.labels ||
	        moduleStats.restaurant?.series?.orders30All?.labels ||
	        moduleStats.pos?.series?.posTickets30?.labels ||
	        moduleStats.transport?.series?.shipments30?.labels ||
	        [];

	      if (modules.billing && moduleStats.billing?.series?.invoicesIssued30) {
	        volSeries.push({
	          name: "Factures",
	          data: moduleStats.billing.series.invoicesIssued30.values,
	          color: C.primary,
	          area: true,
	          areaColor: `rgba(${C.primaryRgb}, 0.10)`,
	        });
	      }
	      if (modules.restaurant && moduleStats.restaurant?.series?.orders30All) {
	        volSeries.push({ name: "Cmd Resto", data: moduleStats.restaurant.series.orders30All.values, color: C.good, area: false });
	      }
	      if (modules.pos && moduleStats.pos?.series?.posTickets30) {
	        volSeries.push({ name: "Tickets POS", data: moduleStats.pos.series.posTickets30.values, color: C.warn, area: false });
	      }
	      if (modules.transport && moduleStats.transport?.series?.shipments30) {
	        volSeries.push({ name: "Courses", data: moduleStats.transport.series.shipments30.values, color: C.slate, area: false });
	      }

	      if (volSeries.length) {
	        defs.push({
	          key: "all_volume30",
	          title: "Volumes (30 jours)",
	          subtitle: "Activite (factures, commandes, tickets, courses).",
	          meta: "30j",
	          option: optionLineCounts(volLabels, volSeries.slice(0, 4)),
	        });
	      }

      const riskCats = [];
      const riskVals = [];
      const pushRisk = (label, v) => {
        riskCats.push(label);
        riskVals.push(toNumber(v));
      };
      if (modules.billing && moduleStats.billing) pushRisk("Factures en retard", moduleStats.billing.overdueInvoices);
      if ((modules.fleet || modules.transport) && moduleStats.fleet) pushRisk("Alertes vehicules", moduleStats.fleet.alerts30);
      if (modules.logistics && moduleStats.logistics) pushRisk("Stock bas", moduleStats.logistics.lowStockAlerts);
      if (modules.restaurant && moduleStats.restaurant) pushRisk("Cmd a traiter", moduleStats.restaurant.openOrders);
      if (modules.purchases && moduleStats.purchases) pushRisk("BC en cours", moduleStats.purchases.openOrders);
      if (modules.rental && moduleStats.rental) pushRisk("Arrivees (7j)", moduleStats.rental.arrivals7);

	      if (riskCats.length) {
	        defs.push({
	          key: "all_risks",
	          title: "Points de vigilance",
	          subtitle: "Indicateurs a traiter en priorite.",
	          meta: "Live",
	          option: optionBarCounts(riskCats, "Alertes", riskVals, `rgba(${C.primaryRgb}, 0.46)`),
	        });
	      }

	      const wl = [];
	      const pushWl = (label, v) => {
	        const n = toNumber(v);
	        if (n <= 0) return;
	        wl.push([label, n]);
	      };
	      if (modules.restaurant && moduleStats.restaurant) pushWl("Cmd resto a traiter", moduleStats.restaurant.openOrders);
	      if (modules.pos && moduleStats.pos) pushWl("Tickets POS (jour)", moduleStats.pos.posTicketsToday);
	      if (modules.billing && moduleStats.billing) pushWl("Factures en retard", moduleStats.billing.overdueInvoices);
	      if (modules.billing && moduleStats.billing) pushWl("Factures ouvertes", moduleStats.billing.openInvoices);
	      if (modules.billing && moduleStats.billing) pushWl("Devis ouverts", moduleStats.billing.openQuotes);
	      if (modules.crm && moduleStats.crm) pushWl("Deals ouverts", moduleStats.crm.openDeals);
	      if (modules.transport && moduleStats.transport) pushWl("Courses actives", moduleStats.transport.activeShipments);
	      if (modules.transport && moduleStats.transport) pushWl("Tournees ouvertes", moduleStats.transport.openTours);
	      if (modules.purchases && moduleStats.purchases) pushWl("BC en cours", moduleStats.purchases.openOrders);
	      if (modules.rental && moduleStats.rental) pushWl("Resa ouvertes", moduleStats.rental.openReservations);
	      if (modules.logistics && moduleStats.logistics) pushWl("Stock bas", moduleStats.logistics.lowStockAlerts);
	      if (modules.interventions) {
	        const inProg = (rows || []).filter((r) => r && r.status_bucket === "inProgress").length;
	        pushWl("Interv en cours", inProg);
	      }

	      wl.sort((a, b) => toNumber(b[1]) - toNumber(a[1]));
	      if (wl.length) {
	        defs.push({
	          key: "all_workload",
	          title: "Charge actuelle",
	          subtitle: "Ce qui est a traiter maintenant (open / en cours).",
	          meta: "Live",
	          option: optionBarHorizontalCounts(
	            wl.slice(0, 10).map((x) => x[0]),
	            "A traiter",
	            wl.slice(0, 10).map((x) => x[1]),
	            `rgba(${C.primaryRgb}, 0.46)`
	          ),
	        });
	      }

	      const revMix = [];
	      const pushRev = (label, v, color) => {
	        const n = toNumber(v);
	        if (n <= 0) return;
	        revMix.push({ name: label, value: round2(n), itemStyle: { color } });
	      };
	      if (modules.billing && moduleStats.billing) pushRev("Facturation", moduleStats.billing.paidMonth, C.primary);
	      if (modules.transport && moduleStats.transport) pushRev("Transport", moduleStats.transport.monthRevenue, C.slate);
	      if (modules.restaurant && moduleStats.restaurant) pushRev("Restaurant", moduleStats.restaurant.monthRevenue, C.good);
	      if (modules.pos && moduleStats.pos) pushRev("POS", moduleStats.pos.posRevenueMonth, C.warn);
	      if (modules.rental && moduleStats.rental) pushRev("Location", moduleStats.rental.revenueMonth, "#a855f7");
	      if (modules.crm && moduleStats.crm) pushRev("CRM (won)", moduleStats.crm.wonMonth, "#6366f1");

	      if (revMix.length) {
	        defs.push({
	          key: "all_mix_month",
	          title: "Repartition revenus (mois)",
	          subtitle: "Mix du mois par module (quand disponible).",
	          meta: "Mois",
	          option: optionPie(revMix),
	        });
	      }
	    }

    // ===== BILLING =====
    if (viewKey === "billing" && modules.billing && moduleStats.billing) {
      const cash = moduleStats.billing.series?.cashIn30 || { labels: [], values: [] };
      const issued = moduleStats.billing.series?.invoicesIssued30 || { labels: [], values: [] };
      defs.push({
        key: "billing_cash",
        title: "Encaissements & factures (30j)",
        subtitle: "Courbe des encaissements + volume de factures emises.",
        meta: "30j",
        option: {
          backgroundColor: "transparent",
          animationDuration: 700,
          animationDurationUpdate: 420,
          animationEasing: "cubicOut",
          tooltip: { trigger: "axis" },
          legend: { data: ["Encaissements", "Factures"], textStyle: { color: C.inkSoft, fontSize: 11 } },
          grid: baseGrid(),
          xAxis: baseAxisCategory(cash.labels),
          yAxis: [baseAxisValueMoney(), { ...baseAxisValueCount(), position: "right", splitLine: { show: false } }],
          series: [
            {
              name: "Encaissements",
              type: "line",
              smooth: true,
              symbol: "none",
              lineStyle: { width: 2.4, color: C.primary },
              areaStyle: { opacity: 1, color: `rgba(${C.primaryRgb}, 0.12)` },
              data: cash.values.length ? cash.values : [0],
              tooltip: { valueFormatter: (v) => money(v) },
            },
            {
              name: "Factures",
              type: "bar",
              yAxisIndex: 1,
              barMaxWidth: 12,
              itemStyle: { color: `rgba(${C.primaryRgb}, 0.32)`, borderRadius: [8, 8, 0, 0] },
              data: issued.values.length ? issued.values : [0],
            },
          ],
        },
      });

      const inv = moduleStats.billing.breakdown?.invoiceBuckets || {};
      defs.push({
        key: "billing_invoice_status",
        title: "Statuts factures",
        subtitle: "Repartition des factures (compte).",
        meta: "Global",
        option: optionPie([
          { name: "Payees", value: toNumber(inv.paid), itemStyle: { color: C.good } },
          { name: "Ouvertes", value: toNumber(inv.open), itemStyle: { color: C.warn } },
          { name: "En retard", value: toNumber(inv.overdue), itemStyle: { color: C.bad } },
          { name: "Autres", value: toNumber(inv.other), itemStyle: { color: C.slate } },
        ].filter((d) => d.value > 0)),
      });

      const qb = moduleStats.billing.breakdown?.quoteBuckets || {};
      defs.push({
        key: "billing_quote_status",
        title: "Statuts devis",
        subtitle: "Brouillons, envoyes, acceptes, refuses.",
        meta: "Global",
        option: optionBarCounts(
          ["Brouillons", "Envoyes", "Acceptes", "Refuses"],
          "Devis",
          [toNumber(qb.draft), toNumber(qb.sent), toNumber(qb.accepted), toNumber(qb.declined)],
          `rgba(${C.primaryRgb}, 0.50)`
        ),
      });

      const qa = moduleStats.billing.series?.quotesAccepted6m || { labels: [], values: [] };
	      defs.push({
	        key: "billing_quotes_6m",
	        title: "Devis acceptes (6 mois)",
	        subtitle: "Valeur (HT/TTC selon tes datas).",
	        meta: "6m",
	        option: optionLineMoney(qa.labels, [
	          { name: "Acceptes", data: qa.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.12)` },
	        ]),
	      });

	      defs.push({
	        key: "billing_amounts",
	        title: "Montants ouverts",
	        subtitle: "Ouvert vs en retard (montants).",
	        meta: "Live",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(v) },
	          grid: { top: 18, left: 10, right: 12, bottom: 10, containLabel: true },
	          xAxis: baseAxisValueMoney(),
	          yAxis: {
	            type: "category",
	            data: ["Ouvert", "En retard"],
	            axisLabel: { color: C.inkSoft },
	            axisLine: { lineStyle: { color: C.line } },
	            axisTick: { show: false },
	          },
	          series: [
	            {
	              name: "Montant",
	              type: "bar",
	              barMaxWidth: 14,
	              itemStyle: { borderRadius: [0, 8, 8, 0] },
	              data: [
	                { value: round2(toNumber(moduleStats.billing.openAmount)), itemStyle: { color: C.warn } },
	                { value: round2(toNumber(moduleStats.billing.overdueAmount)), itemStyle: { color: C.bad } },
	              ],
	            },
	          ],
	        },
	      });

	      defs.push({
	        key: "billing_ontime",
	        title: "Paiement a l'heure",
	        subtitle: "Sur les factures payees (avec date d'echeance).",
	        meta: "Live",
	        option: optionGaugePercent(moduleStats.billing.onTimeRate, [
	          [0.6, C.bad],
	          [0.85, C.warn],
	          [1, C.good],
	        ]),
	      });

	      defs.push({
	        key: "billing_delay",
	        title: "Delai moyen (jours)",
	        subtitle: "Delai entre emission et paiement (moyenne).",
	        meta: "Live",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          graphic: [
	            {
	              type: "text",
	              left: "center",
	              top: "38%",
	              style: { text: `${round2(moduleStats.billing.avgPaymentDelayDays)} j`, fill: C.ink, fontSize: 30, fontWeight: 900 },
	            },
	            {
	              type: "text",
	              left: "center",
	              top: "56%",
	              style: { text: "delai moyen", fill: C.inkSoft, fontSize: 12, fontWeight: 700 },
	            },
	          ],
	        },
	      });
	    }

    // ===== CRM =====
    if (viewKey === "crm" && modules.crm && moduleStats.crm) {
      const sc = moduleStats.crm.breakdown?.statusCounts || {};
      const sv = moduleStats.crm.breakdown?.statusValues || {};
      defs.push({
        key: "crm_pipeline",
        title: "Valeur par statut",
        subtitle: "Open / Won / Lost (valeur).",
        meta: "EUR",
        option: {
          backgroundColor: "transparent",
          animationDuration: 650,
          animationDurationUpdate: 400,
          animationEasing: "cubicOut",
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(v) },
          grid: baseGrid(),
          xAxis: baseAxisCategory(["Open", "Won", "Lost"]),
          yAxis: baseAxisValueMoney(),
          series: [
            {
              type: "bar",
              data: [round2(toNumber(sv.open)), round2(toNumber(sv.won)), round2(toNumber(sv.lost))],
              barMaxWidth: 18,
              itemStyle: {
                borderRadius: [8, 8, 0, 0],
                color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: `rgba(${C.primaryRgb}, 0.90)` },
                  { offset: 1, color: `rgba(${C.primaryRgb}, 0.30)` },
                ]),
              },
            },
          ],
        },
      });

      const won6m = moduleStats.crm.series?.won6m || { labels: [], values: [] };
      defs.push({
        key: "crm_won6m",
        title: "Gagne (6 mois)",
        subtitle: "Historique des montants gagnes.",
        meta: "6m",
        option: optionLineMoney(won6m.labels, [{ name: "Won", data: won6m.values, color: C.good, area: true, areaColor: "rgba(34, 197, 94, 0.14)" }]),
      });

      defs.push({
        key: "crm_status",
        title: "Repartition statuts",
        subtitle: "Volume d'opportunites par statut.",
        meta: "Global",
        option: optionPie([
          { name: "Open", value: toNumber(sc.open), itemStyle: { color: C.primary } },
          { name: "Won", value: toNumber(sc.won), itemStyle: { color: C.good } },
          { name: "Lost", value: toNumber(sc.lost), itemStyle: { color: C.bad } },
          { name: "Autres", value: toNumber(sc.other), itemStyle: { color: C.slate } },
        ].filter((d) => d.value > 0)),
      });

	      defs.push({
	        key: "crm_winrate",
	        title: "Taux de gain (mois)",
	        subtitle: "Won / (Won + Lost) sur le mois.",
	        meta: "Mois",
	        option: optionGaugePercent(moduleStats.crm.winRate),
	      });

	      defs.push({
	        key: "crm_status_counts",
	        title: "Opportunites par statut",
	        subtitle: "Repartition (volume) des opportunites.",
	        meta: "Global",
	        option: optionBarCounts(
	          ["Open", "Won", "Lost", "Autres"],
	          "Opportunites",
	          [toNumber(sc.open), toNumber(sc.won), toNumber(sc.lost), toNumber(sc.other)],
	          `rgba(${C.primaryRgb}, 0.46)`
	        ),
	      });

	      defs.push({
	        key: "crm_avg_open",
	        title: "Deal moyen (ouvert)",
	        subtitle: "Valeur moyenne sur les opportunites open.",
	        meta: "Live",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          graphic: [
	            {
	              type: "text",
	              left: "center",
	              top: "38%",
	              style: { text: money(moduleStats.crm.avgOpenDeal), fill: C.ink, fontSize: 26, fontWeight: 900 },
	            },
	            {
	              type: "text",
	              left: "center",
	              top: "56%",
	              style: { text: "deal moyen (open)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 },
	            },
	          ],
	        },
	      });
	    }

	    // ===== TRANSPORT =====
	    if (viewKey === "transport" && modules.transport && moduleStats.transport) {
	      const rev30 = moduleStats.transport.series?.revenue30 || { labels: [], values: [] };
	      defs.push({
	        key: "transport_rev30",
	        title: "CA transport (30 jours)",
	        subtitle: "Evolution du chiffre d'affaires transport.",
	        meta: "30j",
	        option: optionLineMoney(rev30.labels, [{ name: "CA", data: rev30.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.12)` }]),
	      });

	      const ship30 = moduleStats.transport.series?.shipments30 || { labels: [], values: [] };
	      defs.push({
	        key: "transport_ship30",
	        title: "Courses (30 jours)",
	        subtitle: "Volume de courses (hors annulees).",
	        meta: "30j",
	        option: optionLineCounts(ship30.labels, [
	          { name: "Courses", data: ship30.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.10)` },
	        ]),
	      });

	      const dist30 = moduleStats.transport.series?.distance30 || { labels: [], values: [] };
	      defs.push({
	        key: "transport_rev_dist",
	        title: "CA & distance (30j)",
	        subtitle: "Distance (km) vs CA sur 30 jours.",
	        meta: "30j",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 700,
	          animationDurationUpdate: 420,
	          animationEasing: "cubicOut",
	          tooltip: {
	            trigger: "axis",
	            formatter: function (params) {
	              const list = Array.isArray(params) ? params : [];
	              const title = list[0] ? String(list[0].axisValueLabel || "") : "";
	              const lines = list.map((p) => {
	                const raw = p && p.data != null ? p.data : 0;
	                const v = p.seriesName === "Distance (km)" ? `${round2(raw)} km` : money(raw);
	                return `${p.marker || ""}${escapeHtml(String(p.seriesName || ""))}: ${escapeHtml(String(v))}`;
	              });
	              return [escapeHtml(title)].concat(lines).join("<br/>");
	            },
	          },
	          legend: { data: ["CA", "Distance (km)"], textStyle: { color: C.inkSoft, fontSize: 11 } },
	          grid: baseGrid(),
	          xAxis: baseAxisCategory(rev30.labels),
	          yAxis: [
	            baseAxisValueMoney(),
	            {
	              ...baseAxisValueCount(),
	              position: "right",
	              axisLabel: { color: C.inkSoft, formatter: (v) => `${Math.round(toNumber(v))} km` },
	              splitLine: { show: false },
	            },
	          ],
	          series: [
	            {
	              name: "CA",
	              type: "line",
	              smooth: true,
	              symbol: "none",
	              lineStyle: { width: 2.4, color: C.primary },
	              areaStyle: { opacity: 1, color: `rgba(${C.primaryRgb}, 0.10)` },
	              data: rev30.values.length ? rev30.values : [0],
	            },
	            {
	              name: "Distance (km)",
	              type: "bar",
	              yAxisIndex: 1,
	              barMaxWidth: 12,
	              itemStyle: { color: "rgba(148, 163, 184, 0.40)", borderRadius: [8, 8, 0, 0] },
	              data: dist30.values.length ? dist30.values : [0],
	            },
	          ],
	        },
	      });

	      defs.push({
	        key: "transport_ship_status",
	        title: "Statuts courses",
        subtitle: "Repartition (volume).",
        meta: "Global",
        option: optionPie(topCounts(moduleStats.transport.breakdown?.shipmentStatusCounts || {}, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
        }))),
      });

      const tsc = moduleStats.transport.breakdown?.tourStatusCounts || {};
      const tLabels = Object.keys(tsc);
      const tVals = tLabels.map((k) => toNumber(tsc[k]));
      if (tLabels.length) {
        defs.push({
          key: "transport_tours",
          title: "Statuts tournees",
          subtitle: "Repartition des tournees (volume).",
          meta: "Global",
          option: optionBarCounts(tLabels, "Tournees", tVals, `rgba(${C.primaryRgb}, 0.44)`),
        });
      }

      defs.push({
        key: "transport_rpk",
        title: "Revenu / km",
        subtitle: "Ratio CA / distance planifiee.",
        meta: "Mois",
        option: {
          backgroundColor: "transparent",
          animationDuration: 650,
          animationDurationUpdate: 400,
          animationEasing: "cubicOut",
          grid: { top: 18, left: 10, right: 10, bottom: 0, containLabel: true },
          xAxis: { show: false, min: 0, max: 1 },
          yAxis: { show: false, min: 0, max: 1 },
          graphic: [
            {
              type: "text",
              left: "center",
              top: "38%",
              style: { text: money(moduleStats.transport.revPerKm), fill: C.ink, fontSize: 26, fontWeight: 900 },
            },
            {
              type: "text",
              left: "center",
              top: "56%",
              style: { text: "EUR / km (mois)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 },
            },
          ],
        },
      });
    }

    // ===== FLEET =====
	    if (viewKey === "fleet" && (modules.fleet || modules.transport) && moduleStats.fleet) {
	      const br = moduleStats.fleet.breakdown || {};
	      defs.push({
	        key: "fleet_alerts_type",
	        title: "Alertes (30j) par type",
	        subtitle: "CT, assurance, entretien, permis, visite medicale.",
	        meta: "30j",
	        option: optionBarCounts(
	          ["CT", "Assurance", "Entretien", "Permis", "Medical"],
	          "Alertes",
	          [toNumber(br.ctDue30), toNumber(br.insuranceDue30), toNumber(br.serviceDue30), toNumber(br.licenseDue30), toNumber(br.medicalDue30)],
	          `rgba(${C.primaryRgb}, 0.52)`
	        ),
	      });

	      defs.push({
	        key: "fleet_compliance",
	        title: "Conformite (30j)",
	        subtitle: "Part des vehicules/chauffeurs sans echeance proche.",
	        meta: "30j",
	        option: optionGaugePercent(moduleStats.fleet.complianceRate30, [
	          [0.6, C.bad],
	          [0.8, C.warn],
	          [1, C.good],
	        ]),
	      });

	      defs.push({
	        key: "fleet_alerts_total",
	        title: "Alertes (30j)",
	        subtitle: "Echeances a traiter (CT, assurance, etc.).",
	        meta: "30j",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          graphic: [
	            {
	              type: "text",
	              left: "center",
	              top: "38%",
	              style: { text: String(moduleStats.fleet.alerts30), fill: C.ink, fontSize: 34, fontWeight: 900 },
	            },
	            {
	              type: "text",
	              left: "center",
	              top: "56%",
	              style: { text: "echeances (30j)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 },
	            },
	          ],
	        },
	      });

	      defs.push({
	        key: "fleet_entities_alerted",
	        title: "A verifier (30j)",
	        subtitle: "Vehicules vs chauffeurs avec au moins une echeance.",
	        meta: "30j",
	        option: optionBarCounts(
	          ["Vehicules", "Chauffeurs"],
	          "A verifier",
	          [toNumber(moduleStats.fleet.vehiclesAlerted30), toNumber(moduleStats.fleet.driversAlerted30)],
	          `rgba(${C.primaryRgb}, 0.44)`
	        ),
	      });

	      defs.push({
	        key: "fleet_active",
	        title: "Actifs",
	        subtitle: "Vehicules et chauffeurs actifs.",
	        meta: "Global",
	        option: optionBarCounts(
	          ["Vehicules", "Chauffeurs"],
	          "Actifs",
	          [toNumber(moduleStats.fleet.vehiclesActive), toNumber(moduleStats.fleet.driversActive)],
	          `rgba(${C.primaryRgb}, 0.46)`
	        ),
	      });
	    }

    // ===== LOGISTICS =====
    if (viewKey === "logistics" && modules.logistics && moduleStats.logistics) {
      const ss = moduleStats.logistics.breakdown?.stockStateCounts || {};
      defs.push({
        key: "log_stock_states",
        title: "Etats de stock",
        subtitle: "Repartition par etat (available/reserved/etc).",
        meta: "Global",
        option: optionPie(topCounts(ss, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
        }))),
      });

      defs.push({
        key: "log_alerts",
        title: "Alertes",
        subtitle: "Stock bas, ruptures et ratio reserve.",
        meta: "Live",
        option: optionBarCounts(
          ["Stock bas", "Ruptures", "Reserve %"],
          "Valeur",
          [toNumber(moduleStats.logistics.lowStockAlerts), toNumber(moduleStats.logistics.outOfStock), round2(toNumber(moduleStats.logistics.reserveRatio))],
          `rgba(${C.primaryRgb}, 0.46)`
        ),
      });

      defs.push({
        key: "log_reserve",
        title: "Reserve (%)",
        subtitle: "Quantite reservee / quantite totale.",
        meta: "Live",
        option: optionGaugePercent(moduleStats.logistics.reserveRatio, [
          [0.5, C.good],
          [0.75, C.warn],
          [1, C.bad],
        ]),
      });
    }

    // ===== PURCHASES =====
    if (viewKey === "purchases" && modules.purchases && moduleStats.purchases) {
      const s6 = moduleStats.purchases.series?.spend6m || { labels: [], values: [] };
      defs.push({
        key: "pur_spend6m",
        title: "Depenses (6 mois)",
        subtitle: "Montants receptionnes (statut received).",
        meta: "6m",
        option: optionLineMoney(s6.labels, [{ name: "Depenses", data: s6.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.12)` }]),
      });

      defs.push({
        key: "pur_status",
        title: "Statuts BC",
        subtitle: "Repartition des bons de commande.",
        meta: "Global",
        option: optionPie(topCounts(moduleStats.purchases.breakdown?.statusCounts || {}, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.warn : C.slate },
        }))),
      });

      defs.push({
        key: "pur_open_amount",
        title: "Montant BC en cours",
        subtitle: "Total des BC non receptionnes.",
        meta: "Live",
        option: {
          backgroundColor: "transparent",
          animationDuration: 650,
          animationDurationUpdate: 400,
          animationEasing: "cubicOut",
          graphic: [
            {
              type: "text",
              left: "center",
              top: "38%",
              style: { text: money(moduleStats.purchases.openAmount), fill: C.ink, fontSize: 26, fontWeight: 900 },
            },
            {
              type: "text",
              left: "center",
              top: "56%",
              style: { text: "BC en cours (EUR)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 },
            },
          ],
        },
      });
    }

    // ===== RESTAURANT =====
	    if (viewKey === "restaurant" && modules.restaurant && moduleStats.restaurant) {
	      const hr = moduleStats.restaurant.series?.ordersTodayHourly || { labels: [], values: [] };
	      defs.push({
	        key: "res_hourly",
	        title: "Commandes (jour) par heure",
	        subtitle: "Charge operationnelle sur la journee.",
	        meta: "Jour",
	        option: optionBarCounts(hr.labels, "Commandes", hr.values, `rgba(${C.primaryRgb}, 0.46)`),
	      });

	      const rev30 = moduleStats.restaurant.series?.revenue30All || { labels: [], values: [] };
	      defs.push({
	        key: "res_rev30",
	        title: "CA (30 jours)",
	        subtitle: "Evolution du chiffre d'affaires resto.",
	        meta: "30j",
	        option: optionLineMoney(rev30.labels, [{ name: "CA", data: rev30.values, color: C.good, area: true, areaColor: "rgba(34, 197, 94, 0.14)" }]),
	      });

	      const o30 = moduleStats.restaurant.series?.orders30All || { labels: [], values: [] };
	      defs.push({
	        key: "res_orders30",
	        title: "Commandes (30 jours)",
	        subtitle: "Volume de commandes sur 30 jours.",
	        meta: "30j",
	        option: optionLineCounts(o30.labels, [
	          { name: "Commandes", data: o30.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.10)` },
	        ]),
	      });

	      defs.push({
	        key: "res_status",
	        title: "Statuts commandes",
	        subtitle: "Repartition (volume).",
        meta: "Global",
        option: optionPie(topCounts(moduleStats.restaurant.breakdown?.statusCounts || {}, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
        }))),
      });

      const sc = moduleStats.restaurant.breakdown?.sourceCounts || {};
      const sLabels = Object.keys(sc);
      const sVals = sLabels.map((k) => toNumber(sc[k]));
	      if (sLabels.length) {
	        defs.push({
	          key: "res_source",
	          title: "Sources",
	          subtitle: "QR / POS / autres (volume).",
	          meta: "Global",
	          option: optionBarCounts(sLabels, "Sources", sVals, `rgba(${C.primaryRgb}, 0.42)`),
	        });
	      }

	      const pay = moduleStats.restaurant.breakdown?.paymentStatusCounts || {};
	      const payKeys = Object.keys(pay);
	      if (payKeys.length) {
	        defs.push({
	          key: "res_payment",
	          title: "Paiements",
	          subtitle: "Statuts de paiement (volume).",
	          meta: "Global",
	          option: optionPie(topCounts(pay, 6).map((d, idx) => ({
	            name: d.name,
	            value: d.value,
	            itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
	          }))),
	        });
	      }
	    }

    // ===== POS =====
	    if (viewKey === "pos" && modules.pos && moduleStats.pos) {
	      const rev30 = moduleStats.pos.series?.posRevenue30 || { labels: [], values: [] };
	      defs.push({
	        key: "pos_rev30",
	        title: "CA POS (30 jours)",
	        subtitle: "Evolution du chiffre d'affaires POS.",
	        meta: "30j",
	        option: optionLineMoney(rev30.labels, [{ name: "CA POS", data: rev30.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.12)` }]),
	      });

	      const t30 = moduleStats.pos.series?.posTickets30 || { labels: [], values: [] };
	      defs.push({
	        key: "pos_tickets30",
	        title: "Tickets (30 jours)",
	        subtitle: "Volume de tickets POS sur 30 jours.",
	        meta: "30j",
	        option: optionLineCounts(t30.labels, [
	          { name: "Tickets", data: t30.values, color: C.warn, area: true, areaColor: "rgba(245, 158, 11, 0.12)" },
	        ]),
	      });

	      defs.push({
	        key: "pos_month",
	        title: "CA POS (mois)",
	        subtitle: "Cumul du mois (POS).",
	        meta: "Mois",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          graphic: [
	            { type: "text", left: "center", top: "38%", style: { text: money(moduleStats.pos.posRevenueMonth), fill: C.ink, fontSize: 26, fontWeight: 900 } },
	            { type: "text", left: "center", top: "56%", style: { text: "cumul (mois)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 } },
	          ],
	        },
	      });

	      defs.push({
	        key: "pos_status",
	        title: "Statuts tickets",
	        subtitle: "Repartition des statuts POS.",
        meta: "Global",
        option: optionPie(topCounts(moduleStats.pos.breakdown?.posStatusCounts || {}, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.warn : C.slate },
        }))),
      });

      const pay = moduleStats.pos.breakdown?.posPaymentStatusCounts || {};
      const pLabels = Object.keys(pay);
      const pVals = pLabels.map((k) => toNumber(pay[k]));
      if (pLabels.length) {
        defs.push({
          key: "pos_payment",
          title: "Paiement",
          subtitle: "Statuts de paiement (POS).",
          meta: "Global",
          option: optionBarCounts(pLabels, "Paiements", pVals, `rgba(${C.primaryRgb}, 0.42)`),
        });
      }

      defs.push({
        key: "pos_avg",
        title: "Ticket moyen (jour)",
        subtitle: "Moyenne du jour.",
        meta: "Jour",
        option: {
          backgroundColor: "transparent",
          animationDuration: 650,
          animationDurationUpdate: 400,
          animationEasing: "cubicOut",
          graphic: [
            { type: "text", left: "center", top: "38%", style: { text: money(moduleStats.pos.avgTicketToday), fill: C.ink, fontSize: 26, fontWeight: 900 } },
            { type: "text", left: "center", top: "56%", style: { text: "ticket moyen (POS)", fill: C.inkSoft, fontSize: 12, fontWeight: 700 } },
          ],
        },
      });
    }

    // ===== LOYALTY =====
    if (viewKey === "loyalty" && modules.loyalty && moduleStats.loyalty) {
      const issued = moduleStats.loyalty.series?.issued6m || { labels: [], values: [] };
      const redeemed = moduleStats.loyalty.series?.redeemed6m || { labels: [], values: [] };
      defs.push({
        key: "loy_points",
        title: "Points (6 mois)",
        subtitle: "Emis vs utilises.",
        meta: "6m",
        option: {
          backgroundColor: "transparent",
          animationDuration: 700,
          animationDurationUpdate: 420,
          animationEasing: "cubicOut",
          tooltip: { trigger: "axis" },
          legend: { data: ["Emis", "Utilises"], textStyle: { color: C.inkSoft, fontSize: 11 } },
          grid: baseGrid(),
          xAxis: baseAxisCategory(issued.labels),
          yAxis: baseAxisValueCount(),
          series: [
            { name: "Emis", type: "line", smooth: true, symbol: "none", lineStyle: { width: 2.4, color: C.good }, areaStyle: { opacity: 1, color: "rgba(34, 197, 94, 0.12)" }, data: issued.values },
            { name: "Utilises", type: "line", smooth: true, symbol: "none", lineStyle: { width: 2.4, color: C.warn }, areaStyle: { opacity: 1, color: "rgba(245, 158, 11, 0.12)" }, data: redeemed.values },
          ],
        },
      });

	      defs.push({
	        key: "loy_members",
	        title: "Membres actifs",
	        subtitle: "Volume total d'adherents actifs.",
	        meta: "Global",
	        option: {
	          backgroundColor: "transparent",
	          animationDuration: 650,
	          animationDurationUpdate: 400,
	          animationEasing: "cubicOut",
	          graphic: [
	            { type: "text", left: "center", top: "38%", style: { text: String(moduleStats.loyalty.activeMembers), fill: C.ink, fontSize: 32, fontWeight: 900 } },
	            { type: "text", left: "center", top: "56%", style: { text: "membres actifs", fill: C.inkSoft, fontSize: 12, fontWeight: 700 } },
	          ],
	        },
	      });

	      const issuedMonth = toNumber(moduleStats.loyalty.pointsIssuedMonth);
	      const redeemedMonth = toNumber(moduleStats.loyalty.pointsRedeemedMonth);
	      const usageRate = issuedMonth > 0 ? Math.min(100, round2((redeemedMonth / issuedMonth) * 100)) : 0;
	      defs.push({
	        key: "loy_usage",
	        title: "Taux d'utilisation (mois)",
	        subtitle: "Points utilises / points emis.",
	        meta: "Mois",
	        option: optionGaugePercent(usageRate, [
	          [0.35, C.bad],
	          [0.7, C.warn],
	          [1, C.good],
	        ]),
	      });
	    }

    // ===== RENTAL =====
    if (viewKey === "rental" && modules.rental && moduleStats.rental) {
      const rev6 = moduleStats.rental.series?.revenue6m || { labels: [], values: [] };
      defs.push({
        key: "rent_rev6m",
        title: "CA location (6 mois)",
        subtitle: "Evolution (reservations confirmees).",
        meta: "6m",
        option: optionLineMoney(rev6.labels, [{ name: "CA", data: rev6.values, color: C.primary, area: true, areaColor: `rgba(${C.primaryRgb}, 0.12)` }]),
      });

      const arr7 = moduleStats.rental.series?.arrivalsNext7 || { labels: [], values: [] };
      defs.push({
        key: "rent_arr7",
        title: "Arrivees (7 jours)",
        subtitle: "Planification court terme.",
        meta: "7j",
        option: optionBarCounts(arr7.labels, "Arrivees", arr7.values, `rgba(${C.primaryRgb}, 0.46)`),
      });

      defs.push({
        key: "rent_status",
        title: "Statuts reservations",
        subtitle: "Repartition (volume).",
        meta: "Global",
        option: optionPie(topCounts(moduleStats.rental.breakdown?.statusCounts || {}, 6).map((d, idx) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
        }))),
      });
    }

    // ===== INTERVENTIONS =====
    if (viewKey === "interventions" && modules.interventions) {
      // 1) Margin trend by month
      const byMonth = new Map();
      (rows || []).forEach((r) => {
        if (!r.effective_date) return;
        const d = new Date(r.effective_date);
        const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        if (!byMonth.has(k)) byMonth.set(k, { sum: 0, n: 0 });
        const it = byMonth.get(k);
        it.sum += toNumber(r.margin);
        it.n += 1;
      });
      const mKeys = Array.from(byMonth.keys()).sort();
      const mLabels = mKeys.map((k) => shortMonthLabelFromKey(k));
      const mVals = mKeys.map((k) => {
        const it = byMonth.get(k);
        return it && it.n ? round2(it.sum / it.n) : 0;
      });
      if (mKeys.length) {
        defs.push({
          key: "inter_margin",
          title: "Marge moyenne",
          subtitle: "Marge (%) moyenne par mois.",
          meta: " %",
          option: optionLinePercent(mLabels, "Marge", mVals),
        });
      }

      // 2) Profit by status bucket
      const bucketProfit = { done: 0, in_progress: 0, pending: 0, canceled: 0, other: 0 };
      (rows || []).forEach((r) => {
        const b = r.status_bucket === "inProgress" ? "in_progress" : r.status_bucket || "other";
        if (bucketProfit[b] == null) bucketProfit.other += toNumber(r.profit);
        else bucketProfit[b] += toNumber(r.profit);
      });
      defs.push({
        key: "inter_profit_bucket",
        title: "Benefice par statut",
        subtitle: "Benefice (EUR) par bucket.",
        meta: "EUR",
        option: {
          backgroundColor: "transparent",
          animationDuration: 650,
          animationDurationUpdate: 400,
          animationEasing: "cubicOut",
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(v) },
          grid: baseGrid(),
          xAxis: baseAxisCategory(["Done", "En cours", "Pending", "Annule", "Autres"]),
          yAxis: baseAxisValueMoney(),
          series: [
            {
              type: "bar",
              data: [
                round2(bucketProfit.done),
                round2(bucketProfit.in_progress),
                round2(bucketProfit.pending),
                round2(bucketProfit.canceled),
                round2(bucketProfit.other),
              ],
              barMaxWidth: 18,
              itemStyle: { color: `rgba(${C.primaryRgb}, 0.52)`, borderRadius: [8, 8, 0, 0] },
            },
          ],
        },
      });

      // 3) Top clients by profit
      const byClient = new Map();
      (rows || []).forEach((r) => {
        const key = (r.client_name || "Client non renseigne").trim() || "Client non renseigne";
        byClient.set(key, (byClient.get(key) || 0) + toNumber(r.profit));
      });
      const topClients = Array.from(byClient.entries())
        .sort((a, b) => toNumber(b[1]) - toNumber(a[1]))
        .slice(0, 8)
        .reverse();
      if (topClients.length) {
        defs.push({
          key: "inter_top_clients_profit",
          title: "Top clients (benefice)",
          subtitle: "Top 8 clients par benefice.",
          meta: "EUR",
          option: {
            backgroundColor: "transparent",
            animationDuration: 650,
            animationDurationUpdate: 400,
            animationEasing: "cubicOut",
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(v) },
            grid: baseGrid(),
            xAxis: {
              type: "value",
              axisLabel: { color: C.inkSoft, formatter: (v) => compactCurrency(v, state.config.locale, state.config.currency) },
              axisLine: { lineStyle: { color: C.line } },
              splitLine: { lineStyle: { color: C.grid } },
            },
            yAxis: {
              type: "category",
              data: topClients.map((x) => x[0]),
              axisLabel: { color: C.inkSoft },
              axisLine: { lineStyle: { color: C.line } },
            },
            series: [
              {
                type: "bar",
                data: topClients.map((x) => round2(x[1])),
                barMaxWidth: 16,
                itemStyle: {
                  borderRadius: [0, 8, 8, 0],
                  color: new window.echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: `rgba(${C.primaryRgb}, 0.30)` },
                    { offset: 1, color: `rgba(${C.primaryRgb}, 0.92)` },
                  ]),
                },
              },
            ],
          },
        });
      }

      // 4) PV status distribution (if available)
      const pvCounts = {};
      (state.data?.interventions || []).forEach((it) => {
        const st = normalizeStatus(it.pv_status || "unknown");
        pvCounts[st] = (pvCounts[st] || 0) + 1;
      });
      if (Object.keys(pvCounts).length) {
        defs.push({
          key: "inter_pv_status",
          title: "PV (statuts)",
          subtitle: "Repartition des PV.",
          meta: "Global",
          option: optionPie(topCounts(pvCounts, 6).map((d, idx) => ({
            name: d.name,
            value: d.value,
            itemStyle: { color: idx === 0 ? C.primary : idx === 1 ? C.good : idx === 2 ? C.warn : C.slate },
          }))),
        });
      }
    }

    const sig = defs.map((d) => d.key).join("|");
    const prevSig = String(mount.dataset.insightsSig || "");

    if (!defs.length) {
      // Dispose old charts and clear.
      if (canChart) {
        mount.querySelectorAll("[data-insight-chart]").forEach((el) => {
          try {
            const inst = window.echarts.getInstanceByDom(el);
            if (inst) inst.dispose();
          } catch (_) {}
        });
      }
      if (state.charts.dynamic) state.charts.dynamic.clear();
      mount.dataset.insightsSig = "";
      mount.innerHTML = "";
      return;
    }

    if (sig !== prevSig) {
      // Replace layout (with entry animation).
      if (canChart) {
        mount.querySelectorAll("[data-insight-chart]").forEach((el) => {
          try {
            const inst = window.echarts.getInstanceByDom(el);
            if (inst) inst.dispose();
          } catch (_) {}
        });
      }
      if (state.charts.dynamic) state.charts.dynamic.clear();

      mount.dataset.insightsSig = sig;
      mount.innerHTML = `
        <section class="mbl-insights-grid">
          ${defs
            .map((d, idx) => {
              return `
                <article class="mbl-card mbl-insight-card" style="--idx:${idx}">
                  <div class="mbl-insight-head">
                    <div>
                      <h2>${escapeHtml(d.title)}</h2>
                      <p class="mbl-insight-sub">${escapeHtml(d.subtitle || "")}</p>
                    </div>
                    <span class="mbl-insight-meta">${escapeHtml(d.meta || "")}</span>
                  </div>
                  <div class="mbl-chart" data-insight-chart="${escapeHtml(d.key)}">
                    ${!canChart ? "<div style=\"padding:10px;color:rgba(2,6,23,.62);font-weight:700;\">Charts indisponibles</div>" : ""}
                  </div>
                </article>
              `;
            })
            .join("")}
        </section>
      `;
    }

    if (!canChart) return;

    // Update charts options.
    defs.forEach((d) => {
      const safeKey = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(d.key) : String(d.key).replace(/"/g, '\\"');
      const el = mount.querySelector(`[data-insight-chart="${safeKey}"]`);
      if (!el) return;
      let chart = null;
      try {
        chart = window.echarts.getInstanceByDom(el) || window.echarts.init(el);
      } catch (_) {
        return;
      }
      try {
        chart.setOption(d.option || {}, true);
      } catch (_) {}
      try {
        state.charts.dynamic && state.charts.dynamic.set(d.key, chart);
      } catch (_) {}
    });
  }

  function renderContextSummary() {
    const root = getRoot(state.config.container);
    if (!root) return;
    const strip = root.querySelector(SELECTORS.contextStrip);
    const note = root.querySelector(SELECTORS.moduleNote);
    const modules = state.context?.modules || {};
    const viewKey = normalizeViewKey(state.view?.business);
    const showInterventions = Boolean(modules.interventions) && viewKey === "interventions";

    root.querySelectorAll(".mbl-interventions-only").forEach((el) => {
      el.style.display = showInterventions ? "" : "none";
    });

    const exportButton = root.querySelector(SELECTORS.exportButton);
    if (exportButton) {
      exportButton.disabled = !showInterventions;
      exportButton.style.opacity = showInterventions ? "" : "0.5";
      exportButton.style.pointerEvents = showInterventions ? "" : "none";
    }

    if (note) {
      const subOk = Boolean(state.context?.subscriptionActive);
      if (!subOk) {
        note.hidden = false;
        note.textContent =
          "Abonnement requis. Active un plan pour acceder aux modules et aux dashboards metier.";
      } else {
        note.hidden = true;
        note.textContent = "";
      }
    }

	    if (!strip) return;

	    const statusLabel = state.context?.subscriptionActive ? "Abonnement actif" : "Abonnement inactif";
	    const orgLabel = state.context?.orgName || "Organisation";
	    const viewLabel = viewKeyLabel(viewKey);
	    const planLabel = state.context?.planName || "Sans plan";
	    const subBtnLabel = state.context?.subscriptionActive ? "Abonnement" : "Activer un plan";

	    strip.innerHTML = `
	      <span class="mbl-context-pill ${state.context?.subscriptionActive ? "is-ok" : "is-warn"}">${escapeHtml(statusLabel)}</span>
	      <span class="mbl-context-pill">${escapeHtml(orgLabel)}</span>
	      <span class="mbl-context-pill">Vue: ${escapeHtml(viewLabel)}</span>
	      <button class="mbl-context-pill mbl-context-btn" type="button" data-open-subscriptions title="Plan: ${escapeHtml(planLabel)}">${escapeHtml(subBtnLabel)}</button>
	    `;
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

    const stats = computeStats(rows || []);
    const modules = state.context?.modules || {};
    const moduleStats = state.moduleStats || {};
    const viewKey = normalizeViewKey(state.view?.business);

	    const kpis = [];
	    const add = (label, value, tone) => kpis.push({ label, value, tone: tone || "slate" });

	    const addInterventions = (full) => {
	      add("CA interventions", money(stats.revenue), "blue");
	      add("Benefice net", money(stats.profit), stats.profit >= 0 ? "green" : "red");
	      add("Interventions", String(stats.count), "slate");
	      if (full) {
	        add("Marge moyenne", percent(stats.margin), stats.margin >= 0 ? "green" : "red");
	        add("Terminees", String(stats.done), "green");
	        add("En cours", String(stats.inProgress), "blue");
	        add("Ticket moyen", money(stats.avgTicket), "violet");
	      }
	    };

	    const addBilling = (full) => {
	      if (!moduleStats.billing) return;
	      add("Encaisse mois", money(moduleStats.billing.paidMonth), "green");
	      add(
	        "Montant ouvert",
	        money(moduleStats.billing.openAmount),
	        toNumber(moduleStats.billing.openAmount) > 0 ? "amber" : "green"
	      );
	      add(
	        "Montant en retard",
	        money(moduleStats.billing.overdueAmount),
	        toNumber(moduleStats.billing.overdueAmount) > 0 ? "red" : "green"
	      );
	      add("Factures ouvertes", String(moduleStats.billing.openInvoices), "amber");
	      add("Factures en retard", String(moduleStats.billing.overdueInvoices), "red");
	      add(
	        "Paiement a l'heure",
	        percent(moduleStats.billing.onTimeRate),
	        toNumber(moduleStats.billing.onTimeRate) >= 90 ? "green" : "amber"
	      );
	      add(
	        "Delai paiement",
	        `${round2(moduleStats.billing.avgPaymentDelayDays)} j`,
	        toNumber(moduleStats.billing.avgPaymentDelayDays) <= 15 ? "green" : "amber"
	      );
	      if (full) {
	        add("Devis ouverts", String(moduleStats.billing.openQuotes), "blue");
	        const accepted = toNumber(moduleStats.billing.breakdown?.quoteBuckets?.accepted);
	        if (accepted) add("Devis acceptes", String(accepted), "green");
	        add("Clients actifs", String(moduleStats.billing.activeClients), "slate");
	      }
	    };

	    const addCrm = () => {
	      if (!moduleStats.crm) return;
	      add("Opportunites ouvertes", String(moduleStats.crm.openDeals), "blue");
	      add("Pipeline CRM", money(moduleStats.crm.pipelineValue), "violet");
	      add("Gagne ce mois", money(moduleStats.crm.wonMonth), "green");
	      add("Gagne (nb)", String(moduleStats.crm.wonMonthCount), "green");
	      add("Perdu (nb)", String(moduleStats.crm.lostMonthCount), "red");
	      add(
	        "Taux de gain",
	        percent(moduleStats.crm.winRate),
	        toNumber(moduleStats.crm.winRate) >= 50 ? "green" : "amber"
	      );
	      add("Deal moyen (ouvert)", money(moduleStats.crm.avgOpenDeal), "slate");
	    };

	    const addTransport = (full) => {
	      if (!moduleStats.transport) return;
	      add("Courses actives", String(moduleStats.transport.activeShipments), "blue");
	      add("CA transport mois", money(moduleStats.transport.monthRevenue), "green");
	      add("Rev / km", money(moduleStats.transport.revPerKm), "violet");
	      add("Courses terminees (mois)", String(moduleStats.transport.doneMonth), "slate");
	      if (full) {
	        add("Distance planifiee", `${Math.round(toNumber(moduleStats.transport.distanceKm))} km`, "amber");
	        add("Tournees ouvertes", String(moduleStats.transport.openTours), "slate");
	      }
	    };

	    const addFleet = () => {
	      if (!moduleStats.fleet) return;
	      add("Vehicules actifs", String(moduleStats.fleet.vehiclesActive), "slate");
	      add("Chauffeurs actifs", String(moduleStats.fleet.driversActive), "slate");
	      add(
	        "Alertes conformite (30j)",
	        String(moduleStats.fleet.alerts30),
	        moduleStats.fleet.alerts30 > 0 ? "red" : "green"
	      );
	      add(
	        "Conformite (30j)",
	        percent(moduleStats.fleet.complianceRate30),
	        toNumber(moduleStats.fleet.complianceRate30) >= 90 ? "green" : toNumber(moduleStats.fleet.complianceRate30) >= 75 ? "amber" : "red"
	      );
	      const br = moduleStats.fleet.breakdown || {};
	      if (br.ctDue30 != null) add("CT (30j)", String(br.ctDue30), toNumber(br.ctDue30) > 0 ? "amber" : "green");
	      if (br.insuranceDue30 != null)
	        add("Assurance (30j)", String(br.insuranceDue30), toNumber(br.insuranceDue30) > 0 ? "amber" : "green");
	      if (br.serviceDue30 != null) add("Entretien (30j)", String(br.serviceDue30), toNumber(br.serviceDue30) > 0 ? "amber" : "green");
	      if (br.licenseDue30 != null) add("Permis (30j)", String(br.licenseDue30), toNumber(br.licenseDue30) > 0 ? "amber" : "green");
	      if (br.medicalDue30 != null) add("Visite med. (30j)", String(br.medicalDue30), toNumber(br.medicalDue30) > 0 ? "amber" : "green");
	    };

	    const addLogistics = (full) => {
	      if (!moduleStats.logistics) return;
	      add("Entrepots actifs", String(moduleStats.logistics.activeWarehouses), "slate");
	      add("Stock disponible", String(Math.round(toNumber(moduleStats.logistics.availableQty))), "blue");
	      add("Ruptures", String(moduleStats.logistics.outOfStock), toNumber(moduleStats.logistics.outOfStock) > 0 ? "red" : "green");
	      add("Reserve (%)", percent(moduleStats.logistics.reserveRatio), toNumber(moduleStats.logistics.reserveRatio) >= 50 ? "amber" : "slate");
	      if (full) {
	        add(
	          "Alertes reappro",
	          String(moduleStats.logistics.lowStockAlerts),
	          moduleStats.logistics.lowStockAlerts > 0 ? "amber" : "green"
	        );
	      }
	    };

	    const addRestaurant = (full) => {
	      if (!moduleStats.restaurant) return;
	      add("Commandes jour", String(moduleStats.restaurant.todayOrders), "blue");
	      add("CA resto jour", money(moduleStats.restaurant.todayRevenue), "green");
	      if (full) {
	        add("Commandes mois", String(moduleStats.restaurant.monthOrders), "slate");
	        add("CA resto mois", money(moduleStats.restaurant.monthRevenue), "green");
	        add("Ticket moyen jour", money(moduleStats.restaurant.avgTicketToday), "violet");
	        add("Commandes a traiter", String(moduleStats.restaurant.openOrders), "amber");
	        add(
	          "Annulations jour",
	          percent(moduleStats.restaurant.cancelRateToday),
	          toNumber(moduleStats.restaurant.cancelRateToday) > 5 ? "amber" : "green"
	        );
	        add("Menus actifs", String(moduleStats.restaurant.activeMenus), "slate");
	        add("Lieux actifs", String(moduleStats.restaurant.activeLocations), "slate");
	      }
	    };

	    const addPos = () => {
	      if (!moduleStats.pos) return;
	      add("Tickets POS jour", String(moduleStats.pos.posTicketsToday), "blue");
	      add("CA POS jour", money(moduleStats.pos.posRevenueToday), "green");
	      add("Ticket moyen POS", money(moduleStats.pos.avgTicketToday), "violet");
	      if (moduleStats.pos.posTicketsMonth != null) add("Tickets POS mois", String(moduleStats.pos.posTicketsMonth), "slate");
	      if (moduleStats.pos.posRevenueMonth != null) add("CA POS mois", money(moduleStats.pos.posRevenueMonth), "green");
	      const s30 = moduleStats.pos.series?.posRevenue30?.values;
	      if (Array.isArray(s30) && s30.length) {
	        const total30 = s30.reduce((acc, v) => acc + toNumber(v), 0);
	        add("CA POS (30j)", money(total30), "green");
	      }
	    };

	    const addPurchases = () => {
	      if (!moduleStats.purchases) return;
	      add("BC en cours", String(moduleStats.purchases.openOrders), "amber");
	      add(
	        "Montant BC",
	        money(moduleStats.purchases.openAmount),
	        toNumber(moduleStats.purchases.openAmount) > 0 ? "amber" : "green"
	      );
	      add("Depenses mois", money(moduleStats.purchases.spendMonth), "green");
	      add("Fournisseurs actifs", String(moduleStats.purchases.activeSuppliers), "slate");
	    };

	    const addLoyalty = () => {
	      if (!moduleStats.loyalty) return;
	      add("Membres actifs", String(moduleStats.loyalty.activeMembers), "blue");
	      add("Points emis (mois)", String(moduleStats.loyalty.pointsIssuedMonth), "violet");
	      add("Points utilises (mois)", String(moduleStats.loyalty.pointsRedeemedMonth), "amber");
	      add(
	        "Net points (mois)",
	        String(toNumber(moduleStats.loyalty.pointsIssuedMonth) - toNumber(moduleStats.loyalty.pointsRedeemedMonth)),
	        "slate"
	      );
	    };

	    const addRental = () => {
	      if (!moduleStats.rental) return;
	      add("Reservations ouvertes", String(moduleStats.rental.openReservations), "amber");
	      add("Arrivees (7j)", String(moduleStats.rental.arrivals7), "blue");
	      add("CA location mois", money(moduleStats.rental.revenueMonth), "green");
	      const s6 = moduleStats.rental.series?.revenue6m?.values;
	      if (Array.isArray(s6) && s6.length) {
	        const total6 = s6.reduce((acc, v) => acc + toNumber(v), 0);
	        add("CA location (6m)", money(total6), "green");
	      }
	    };

    if (viewKey === "billing") {
      if (modules.billing) addBilling(true);
      if (modules.pos) addPos();
    } else if (viewKey === "interventions") {
      if (modules.interventions) addInterventions(true);
    } else if (viewKey === "crm") {
      if (modules.crm) addCrm();
    } else if (viewKey === "transport") {
      if (modules.transport) addTransport(true);
      if (modules.fleet || modules.transport) addFleet();
    } else if (viewKey === "fleet") {
      if (modules.fleet || modules.transport) addFleet();
    } else if (viewKey === "logistics") {
      if (modules.logistics) addLogistics(true);
    } else if (viewKey === "purchases") {
      if (modules.purchases) addPurchases();
    } else if (viewKey === "restaurant") {
      if (modules.restaurant) addRestaurant(true);
      if (modules.pos) addPos();
    } else if (viewKey === "pos") {
      if (modules.pos) addPos();
    } else if (viewKey === "loyalty") {
      if (modules.loyalty) addLoyalty();
    } else if (viewKey === "rental") {
      if (modules.rental) addRental();
    } else {
      // all view
      if (modules.billing) addBilling(false);
      if (modules.interventions) addInterventions(false);
      if (modules.crm) addCrm();
      if (modules.transport) addTransport(false);
      if (modules.fleet || modules.transport) addFleet();
      if (modules.logistics) addLogistics(false);
      if (modules.purchases) addPurchases();
      if (modules.restaurant) addRestaurant(false);
      if (modules.pos) addPos();
      if (modules.loyalty) addLoyalty();
      if (modules.rental) addRental();
    }

    const maxCards = viewKey === "all" ? 20 : 24;
    const visibleKpis = kpis.slice(0, maxCards);

    mount.innerHTML = visibleKpis
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
