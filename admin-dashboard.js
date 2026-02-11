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
	    .mbl-analytics-grid,
	    .mbl-table-card,
	    .mbl-filters {
	      transition: opacity 0.18s ease, transform 0.18s ease;
	    }

	    .mbl-shell.is-switching .mbl-kpi-grid,
	    .mbl-shell.is-switching .mbl-panels,
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
      factures.forEach((f) => {
        const status = normalizeStatus(f.status);
        const total = toNumber(f.total_cents) / 100;
        const isPaid = status === "paid";
        const isOpen = ["issued", "sent", "partially_paid"].includes(status);
        if (isOpen) openInvoices += 1;
        if (isOpen && isBeforeToday(f.due_date)) overdueInvoices += 1;
        if (isPaid && isSameOrAfter(f.paid_at || f.created_at, monthStart)) paidMonth += total;
      });

      const openQuotes = devis.filter((d) => ["draft", "sent", "accepted"].includes(normalizeStatus(d.status))).length;
      const activeClients = clients.filter((c) => c.is_active !== false).length;

      stats.billing = {
        paidMonth,
        openInvoices,
        overdueInvoices,
        openQuotes,
        activeClients,
      };
    }

    if (modules.crm) {
      const deals = await safeTableRows("crm_deals", "status,amount_cents,updated_at,closed_at", (q) =>
        q.order("updated_at", { ascending: false }).limit(6000)
      );
      let pipelineValue = 0;
      let wonMonth = 0;
      const monthStart = startOfMonth();
      deals.forEach((d) => {
        const status = normalizeStatus(d.status);
        const amount = toNumber(d.amount_cents) / 100;
        if (status === "open") pipelineValue += amount;
        if (status === "won" && isSameOrAfter(d.closed_at || d.updated_at, monthStart)) wonMonth += amount;
      });
      stats.crm = {
        openDeals: deals.filter((d) => normalizeStatus(d.status) === "open").length,
        pipelineValue,
        wonMonth,
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
      shipments.forEach((s) => {
        if (isSameOrAfter(s.created_at, monthStart)) monthRevenue += toNumber(s.price_cents) / 100;
        distanceKm += toNumber(s.distance_m) / 1000;
      });
      stats.transport = {
        activeShipments: shipments.filter((s) => ["planned", "in_progress"].includes(normalizeStatus(s.status))).length,
        monthRevenue,
        distanceKm,
        openTours: tours.filter((t) => ["planned", "in_progress"].includes(normalizeStatus(t.status))).length,
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
      let alerts30 = 0;
      vehicles.forEach((v) => {
        if (isWithinDays(v.technical_inspection_due_at, 30)) alerts30 += 1;
        if (isWithinDays(v.insurance_expires_at, 30)) alerts30 += 1;
        if (isWithinDays(v.next_service_due_at, 30)) alerts30 += 1;
      });
      drivers.forEach((d) => {
        if (isWithinDays(d.license_expiry, 30)) alerts30 += 1;
        if (isWithinDays(d.medical_visit_expires_at, 30)) alerts30 += 1;
      });
      stats.fleet = {
        vehiclesActive: vehicles.filter((v) => v.is_active !== false).length,
        driversActive: drivers.filter((d) => d.is_active !== false).length,
        alerts30,
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
      levels.forEach((l) => {
        const stateKey = normalizeStatus(l.stock_state || "available");
        const freeQty = Math.max(0, toNumber(l.qty_on_hand) - toNumber(l.qty_reserved));
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
	      let spendMonth = 0;
	      orders.forEach((o) => {
	        const st = normalizeStatus(o.status);
	        if (["draft", "sent", "confirmed", "partially_received"].includes(st)) openOrders += 1;
	        if (st === "received" && isSameOrAfter(o.issue_date || o.created_at, monthStart)) spendMonth += toNumber(o.total_cents) / 100;
	      });
	      stats.purchases = {
	        openOrders,
	        spendMonth,
	        activeSuppliers: suppliers.filter((s) => s.is_active !== false).length,
	      };
	    }

	    if (modules.loyalty) {
	      const [members, events] = await Promise.all([
	        safeTableRows("loyalty_members", "status,points_balance,created_at", (q) => q.order("created_at", { ascending: false }).limit(8000)),
	        safeTableRows("loyalty_events", "points,created_at", (q) => q.order("created_at", { ascending: false }).limit(8000)),
	      ]);
	      const monthStart = startOfMonth();
	      let pointsIssuedMonth = 0;
	      events.forEach((e) => {
	        const pts = toNumber(e.points);
	        if (pts > 0 && isSameOrAfter(e.created_at, monthStart)) pointsIssuedMonth += pts;
	      });
	      stats.loyalty = {
	        activeMembers: members.filter((m) => normalizeStatus(m.status) === "active").length,
	        pointsIssuedMonth,
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
	      reservations.forEach((r) => {
	        const st = normalizeStatus(r.status);
	        if (["pending", "confirmed", "blocked"].includes(st)) openReservations += 1;
	        if (["pending", "confirmed"].includes(st) && isWithinDays(r.check_in, 7)) arrivals7 += 1;
	        if (st === "confirmed" && isSameOrAfter(r.check_in || r.created_at, monthStart)) revenueMonth += toNumber(r.total_cents) / 100;
	      });
	      stats.rental = {
	        openReservations,
	        arrivals7,
	        revenueMonth,
	      };
	    }

	    if (modules.restaurant || modules.billing || modules.pos) {
	      const orders = await safeTableRows("restaurant_orders", "source,status,total_cents,created_at,payment_status", (q) =>
	        q.order("created_at", { ascending: false }).limit(8000)
	      );
      const today = startOfToday();
      const todayOrders = orders.filter((o) => isSameOrAfter(o.created_at, today));
      const todayRevenue = todayOrders
        .filter((o) => normalizeStatus(o.status) !== "canceled")
        .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0);

      if (modules.restaurant) {
        const [items, locations] = await Promise.all([
          safeTableRows("restaurant_menu_items", "is_active,available_for_qr,available_for_pos", (q) => q.limit(6000)),
          safeTableRows("restaurant_locations", "id,is_active,public_is_open", (q) => q.limit(2000)),
        ]);

        stats.restaurant = {
          todayOrders: todayOrders.length,
          openOrders: orders.filter((o) => ["new", "confirmed", "preparing", "ready"].includes(normalizeStatus(o.status))).length,
          todayRevenue,
          activeMenus: items.filter((i) => i.is_active !== false).length,
          activeLocations: locations.filter((l) => l.is_active !== false).length,
        };
      }

      stats.pos = {
        posTicketsToday: todayOrders.filter((o) => normalizeStatus(o.source) === "pos").length,
        posRevenueToday: todayOrders
          .filter((o) => normalizeStatus(o.source) === "pos" && normalizeStatus(o.status) !== "canceled")
          .reduce((acc, o) => acc + toNumber(o.total_cents) / 100, 0),
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
    const rows = createEnrichedRows();
    const filtered = applyFilters(rows);
    const sorted = sortRows(filtered);
    state.filteredRows = sorted;

    renderViewBar();
    renderKpis(sorted);
    renderActions(sorted);
    renderAlerts(sorted);
    const viewKey = normalizeViewKey(state.view?.business);
    if (Boolean(state.context?.modules?.interventions) && viewKey === "interventions") {
      renderTable(sorted);
      renderCharts(sorted);
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

    const moduleLabels = {
      billing: "Facturation",
      interventions: "Interventions",
      crm: "CRM",
      transport: "Transport",
      fleet: "Vehicules",
      logistics: "Logistique",
      restaurant: "Restauration",
      pos: "POS",
      purchases: "Achats",
      loyalty: "Fidelite",
      rental: "Location",
    };
    const activeModules = Object.keys(state.context?.modules || {}).filter((k) => state.context.modules[k]);
    const modulePreview = activeModules
      .map((m) => moduleLabels[m] || m)
      .slice(0, 4)
      .join(", ");
    const moduleSuffix = activeModules.length > 4 ? ` +${activeModules.length - 4}` : "";
    const planLabel = state.context?.planName || "Sans plan";
    const statusLabel = state.context?.subscriptionActive ? "Abonnement actif" : "Abonnement inactif";
    const orgLabel = state.context?.orgName || "Organisation";
    const viewLabel = viewKeyLabel(viewKey);

    strip.innerHTML = `
      <span class="mbl-context-pill ${state.context?.subscriptionActive ? "is-ok" : "is-warn"}">${escapeHtml(statusLabel)}</span>
      <span class="mbl-context-pill">Plan: ${escapeHtml(planLabel)}</span>
      <span class="mbl-context-pill">${escapeHtml(orgLabel)}</span>
      <span class="mbl-context-pill">Vue: ${escapeHtml(viewLabel)}</span>
      <span class="mbl-context-pill">${escapeHtml(activeModules.length)} module(s): ${escapeHtml(modulePreview || "Aucun")}${escapeHtml(moduleSuffix)}</span>
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

    const activeModuleCount = Object.keys(modules).filter((k) => modules[k]).length;
    add("Plan actif", state.context?.planName || "Sans plan", "slate");
    add("Modules actifs", String(activeModuleCount), "slate");

    const addInterventions = (full) => {
      add("CA interventions", money(stats.revenue), "blue");
      add("Benefice net", money(stats.profit), stats.profit >= 0 ? "green" : "red");
      add("Interventions", String(stats.count), "slate");
      if (full) {
        add("En cours", String(stats.inProgress), "blue");
        add("Ticket moyen", money(stats.avgTicket), "violet");
      }
    };

    const addBilling = (full) => {
      if (!moduleStats.billing) return;
      add("Encaisse mois", money(moduleStats.billing.paidMonth), "green");
      add("Factures en retard", String(moduleStats.billing.overdueInvoices), "red");
      add("Factures ouvertes", String(moduleStats.billing.openInvoices), "amber");
      if (full) {
        add("Devis ouverts", String(moduleStats.billing.openQuotes), "blue");
        add("Clients actifs", String(moduleStats.billing.activeClients), "slate");
      }
    };

    const addCrm = () => {
      if (!moduleStats.crm) return;
      add("Opportunites ouvertes", String(moduleStats.crm.openDeals), "blue");
      add("Pipeline CRM", money(moduleStats.crm.pipelineValue), "violet");
      add("Gagne ce mois", money(moduleStats.crm.wonMonth), "green");
    };

    const addTransport = (full) => {
      if (!moduleStats.transport) return;
      add("Courses actives", String(moduleStats.transport.activeShipments), "blue");
      add("CA transport mois", money(moduleStats.transport.monthRevenue), "green");
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
    };

    const addLogistics = (full) => {
      if (!moduleStats.logistics) return;
      add("Entrepots actifs", String(moduleStats.logistics.activeWarehouses), "slate");
      add("Stock disponible", String(Math.round(toNumber(moduleStats.logistics.availableQty))), "blue");
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
      const avgTicket = moduleStats.restaurant.todayOrders
        ? toNumber(moduleStats.restaurant.todayRevenue) / Math.max(1, toNumber(moduleStats.restaurant.todayOrders))
        : 0;
      add("Commandes jour", String(moduleStats.restaurant.todayOrders), "blue");
      add("CA resto jour", money(moduleStats.restaurant.todayRevenue), "green");
      if (full) {
        add("Ticket moyen jour", money(avgTicket), "violet");
        add("Commandes a traiter", String(moduleStats.restaurant.openOrders), "amber");
      }
    };

    const addPos = () => {
      if (!moduleStats.pos) return;
      add("Tickets POS jour", String(moduleStats.pos.posTicketsToday), "blue");
      add("CA POS jour", money(moduleStats.pos.posRevenueToday), "green");
    };

    const addPurchases = () => {
      if (!moduleStats.purchases) return;
      add("BC en cours", String(moduleStats.purchases.openOrders), "amber");
      add("Depenses mois", money(moduleStats.purchases.spendMonth), "green");
      add("Fournisseurs actifs", String(moduleStats.purchases.activeSuppliers), "slate");
    };

    const addLoyalty = () => {
      if (!moduleStats.loyalty) return;
      add("Membres actifs", String(moduleStats.loyalty.activeMembers), "blue");
      add("Points emis (mois)", String(moduleStats.loyalty.pointsIssuedMonth), "violet");
    };

    const addRental = () => {
      if (!moduleStats.rental) return;
      add("Reservations ouvertes", String(moduleStats.rental.openReservations), "amber");
      add("Arrivees (7j)", String(moduleStats.rental.arrivals7), "blue");
      add("CA location mois", money(moduleStats.rental.revenueMonth), "green");
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

    const maxCards = viewKey === "all" ? 16 : 18;
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
