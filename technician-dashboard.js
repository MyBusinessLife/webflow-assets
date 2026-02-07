(() => {
  if (window.__techDashboardLoaded) return;
  window.__techDashboardLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    ASSIGNEES_TABLE: "intervention_assignees",
    INTERVENTIONS_TABLE: "interventions",
    REPORTS_TABLE: "",
    PV_TABLE: "intervention_pv",
    EXPENSES_TABLE: "intervention_expenses",
    FILES_TABLE: "intervention_files",
    COMPENSATIONS_TABLE: "intervention_compensations",
    PROFILES_TABLE: "profiles",
    STORAGE_BUCKET: "interventions-files",

    RUN_PAGE_PATH: "/extranet/technician/intervention-realisation",
    LIST_PAGE_PATH: "/extranet/technician/interventions",
    ACTIVE_STORAGE_KEY: "mbl-active-intervention",

    REQUIRE_CHECKLIST_DEFAULT: false,
    REQUIRE_PHOTOS_DEFAULT: false,
    REQUIRE_SIGNATURE_DEFAULT: false,
    CURRENCY: "EUR",
    OVERDUE_GRACE_HOURS: 1,
    MAP_DEFAULT_PROVIDER: "google",
  };

  const STR = {
    title: "Technician command center",
    subtitle: "Pilotage en temps reel des interventions",
    greeting: "Bonjour",
    refresh: "Actualiser",
    visibleCountLabel: "missions visibles",

    filterAll: "Toutes",
    filterToday: "Aujourd'hui",
    filterProgress: "En cours",
    filterUrgent: "Urgentes",
    filterOverdue: "En retard",
    filterDone: "Terminees",

    sortSmart: "Tri intelligent",
    sortDateAsc: "Date croissante",
    sortDateDesc: "Date decroissante",
    sortClient: "Client A-Z",
    sortStatus: "Statut",
    sortHealth: "Sante intervention",

    searchPlaceholder: "Rechercher client, reference, adresse, telephone...",

    panelInsights: "Insights terrain",
    panelTimeline: "Timeline du jour",
    panelBoard: "Vue pipeline",
    panelMissions: "Missions detaillees",

    missionStart: "Demarrer",
    missionContinue: "Continuer",
    missionCall: "Appeler",
    missionMap: "Itineraire",
    missionPv: "PV vierge",
    missionDetails: "Details",
    missionHide: "Masquer",
    missionDone: "Terminee",

    statusPlanned: "Planifiee",
    statusPending: "En attente",
    statusProgress: "En cours",
    statusConfirmed: "Confirmee",
    statusDone: "Terminee",
    statusCanceled: "Annulee",
    statusUnknown: "Statut inconnu",

    kpiTotal: "Total assigne",
    kpiToday: "Aujourd'hui",
    kpiProgress: "En cours",
    kpiDone: "Terminees",
    kpiOverdue: "En retard",
    kpiHealth: "Sante moyenne",
    kpiCosts: "Frais engages",
    kpiRefund: "Remboursement estimatif",

    focusTitle: "Focus mission",
    focusEmptyTitle: "Aucune mission active",
    focusEmptyBody: "Demarre une intervention pour lancer le parcours guide.",
    nextTitle: "Prochaine mission",

    insightGood: "Rythme solide",
    insightWarning: "Action prioritaire",
    insightInfo: "Optimisation possible",

    timelineEmpty: "Aucune mission sur la plage du jour.",
    listEmptyTitle: "Aucune mission a afficher",
    listEmptyBody: "Ajuste les filtres ou recharge les donnees.",

    sessionExpiredTitle: "Session expiree",
    sessionExpiredBody: "Reconnecte-toi pour afficher ton dashboard.",
    loadingTitle: "Chargement du dashboard...",
    loadingBody: "Analyse des missions, frais et progression en cours.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer les donnees maintenant.",

    mapChooseTitle: "Choisir une application de navigation",
    mapPlans: "Plans",
    mapGoogle: "Google Maps",
    mapWaze: "Waze",
    mapCancel: "Annuler",

    toastReloaded: "Dashboard actualise.",
    toastSessionExpired: "Session expiree. Merci de te reconnecter.",
    toastStartOk: "Mission demarree. Redirection vers le parcours.",
    toastStartError: "Impossible de demarrer la mission.",
    toastReducedMode: "Mode reduit: certaines tables ne sont pas accessibles.",
  };

  function findRoot() {
    return (
      document.querySelector("[data-technician-dashboard]") ||
      document.querySelector("#technician-dashboard-root") ||
      document.querySelector(".technician-dashboard") ||
      document.querySelector("[data-tech-dashboard]")
    );
  }

  function resolveSupabaseClient() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (window.__techSupabase) return window.__techSupabase;
    if (!window.supabase?.createClient) return null;

    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth",
      },
    });

    window.__techSupabase = client;
    return client;
  }

  const root = findRoot();
  if (!root) {
    console.error("[TECH DASHBOARD] Root introuvable.");
    return;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  applyConfigOverrides(root);
  injectStyles();
  const els = renderShell(root);

  const state = {
    user: null,
    profile: null,
    items: [],
    filteredItems: [],
    filter: "all",
    sort: "smart",
    search: "",
    activeId: loadActiveInterventionId(),
    loading: false,
    lastSyncAt: 0,
    mapAddress: "",
    summaryAll: null,
    summaryVisible: null,
    tableAvailability: {
      reports: true,
      pv: true,
      expenses: true,
      files: true,
      compensations: true,
    },
  };

  init();

  async function init() {
    wireEvents();
    renderLoadingState();
    await refreshAll("initial");
  }

  function wireEvents() {
    els.refresh.addEventListener("click", async () => {
      await refreshAll("manual");
      showToast("success", STR.toastReloaded);
    });

    els.search.addEventListener(
      "input",
      debounce(() => {
        state.search = norm(els.search.value || "");
        updateDashboard();
      }, 120)
    );

    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        els.search.value = "";
        state.search = "";
        updateDashboard();
      }
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value || "smart";
      updateDashboard();
    });

    els.filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        state.filter = btn.dataset.filter || "all";
        els.filters.forEach((el) => el.classList.toggle("is-active", el === btn));
        updateDashboard();
      });
    });

    els.missions.addEventListener("click", async (e) => {
      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action || "";
      const missionId = actionEl.dataset.id || "";
      const mission = state.items.find((item) => String(item.id) === String(missionId));
      if (!mission) return;

      if (action === "details") {
        toggleMissionDetails(missionId, actionEl);
        return;
      }

      if (action === "map") {
        if (mission.address) openMapSheet(mission.address);
        return;
      }

      if (action === "start") {
        await startIntervention(mission, actionEl);
      }
    });

    els.focus.addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-action='map']");
      if (!actionEl) return;
      const missionId = actionEl.dataset.id || "";
      const mission = state.items.find((item) => String(item.id) === String(missionId));
      if (!mission?.address && !mission?._address) return;
      openMapSheet(mission._address || mission.address);
    });

    els.timeline.addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-action='jump']");
      if (!actionEl) return;
      const id = actionEl.dataset.id;
      if (!id) return;
      const card = root.querySelector(`.tdb-mission-card[data-id="${cssEscape(id)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("is-pulse");
      setTimeout(() => card.classList.remove("is-pulse"), 1200);
    });

    els.board.addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-action='filter']");
      if (!actionEl) return;
      const filter = actionEl.dataset.filter;
      if (!filter) return;
      const btn = els.filters.find((f) => f.dataset.filter === filter);
      if (!btn) return;
      btn.click();
    });

    els.sheet.addEventListener("click", (e) => {
      const providerEl = e.target.closest("[data-map]");
      if (providerEl) {
        openMapProvider(providerEl.dataset.map || CONFIG.MAP_DEFAULT_PROVIDER);
        return;
      }
      if (e.target.closest("[data-tdb-sheet-close]")) closeMapSheet();
    });
  }

  async function refreshAll(mode) {
    setLoading(true);
    showBanner("", "");

    try {
      const user = await getCurrentUser();
      if (!user) {
        renderSessionExpired();
        showToast("error", STR.toastSessionExpired);
        return;
      }

      state.user = user;
      state.profile = await fetchProfile(user.id);

      const assignments = await fetchAssignments(user.id);
      const baseItems = normalizeAssignments(assignments);

      const interventionIds = baseItems.map((row) => row.id).filter(Boolean);
      const [reportsRes, pvRes, expensesRes, filesRes, compensationsRes] = await Promise.all([
        fetchOptionalRowsByInterventionIds(CONFIG.REPORTS_TABLE, interventionIds),
        fetchOptionalRowsByInterventionIds(CONFIG.PV_TABLE, interventionIds),
        fetchOptionalRowsByInterventionIds(CONFIG.EXPENSES_TABLE, interventionIds),
        fetchOptionalRowsByInterventionIds(CONFIG.FILES_TABLE, interventionIds),
        fetchOptionalRowsByInterventionIds(CONFIG.COMPENSATIONS_TABLE, interventionIds),
      ]);

      state.tableAvailability.reports = reportsRes.available;
      state.tableAvailability.pv = pvRes.available;
      state.tableAvailability.expenses = expensesRes.available;
      state.tableAvailability.files = filesRes.available;
      state.tableAvailability.compensations = compensationsRes.available;

      state.items = enrichItems(baseItems, {
        reports: reportsRes.rows,
        pv: pvRes.rows,
        expenses: expensesRes.rows,
        files: filesRes.rows,
        compensations: compensationsRes.rows,
      });

      syncActiveIntervention();

      state.lastSyncAt = Date.now();
      updateDashboard();
      updateSyncLabel();
      renderHeaderBannerIfNeeded();

      const reducedMode = Object.values(state.tableAvailability).some((available) => !available);
      if (reducedMode && mode !== "initial") {
        showToast("warning", STR.toastReducedMode);
      }
    } catch (error) {
      console.error("[TECH DASHBOARD] refreshAll error:", error);
      renderErrorState(error);
    } finally {
      setLoading(false);
    }
  }

  async function getCurrentUser() {
    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userError) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function fetchProfile(userId) {
    if (!userId) return null;
    const response = await supabase
      .from(CONFIG.PROFILES_TABLE)
      .select("id,name,first_name,last_name,email,role,user_type")
      .eq("id", userId)
      .maybeSingle();

    if (response.error) {
      console.warn("[TECH DASHBOARD] profile warning:", response.error.message);
      return null;
    }
    return response.data || null;
  }

  async function fetchAssignments(userId) {
    const response = await supabase
      .from(CONFIG.ASSIGNEES_TABLE)
      .select("id, user_id, intervention_id, created_at, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (response.error) throw response.error;
    return response.data || [];
  }

  async function fetchOptionalRowsByInterventionIds(table, interventionIds) {
    if (!table) return { rows: [], available: true };
    if (!interventionIds.length) return { rows: [], available: true };

    const rows = [];
    const chunks = chunk(interventionIds, 800);

    for (const idsChunk of chunks) {
      const response = await supabase.from(table).select("*").in("intervention_id", idsChunk);
      if (response.error) {
        if (isTableMissing(response.error) || isPermissionIssue(response.error)) {
          console.warn(`[TECH DASHBOARD] table unavailable (${table}):`, response.error.message);
          return { rows: [], available: false };
        }
        console.warn(`[TECH DASHBOARD] optional fetch warning (${table}):`, response.error.message);
        return { rows: [], available: false };
      }
      rows.push(...(response.data || []));
    }

    return { rows, available: true };
  }

  function normalizeAssignments(rows) {
    return rows
      .map((entry) => {
        const raw = entry?.interventions;
        if (!raw) return null;

        const status = canonicalStatus(raw.status);
        const startTs = toTimestamp(raw.start_at || raw.scheduled_at || raw.date || raw.created_at);
        const endTs = toTimestamp(raw.end_at);
        const address = String(raw.address || "").trim();
        const phone = normalizePhone(raw.support_phone || raw.phone || raw.client_phone || "");
        const priority = inferPriority(raw, status, startTs);

        return {
          ...raw,
          assignment_id: entry.id,
          _status: status,
          _startTs: startTs,
          _endTs: endTs,
          _priority: priority,
          _search: norm(
            [
              raw.internal_ref,
              raw.client_name,
              raw.client_ref,
              raw.title,
              raw.address,
              raw.support_phone,
              raw.phone,
            ]
              .filter(Boolean)
              .join(" ")
          ),
          _address: address,
          _phone: phone,
          _requiresChecklist: resolveFlag(raw.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT),
          _requiresPhotos: resolveFlag(raw.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT),
          _requiresSignature: resolveFlag(raw.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT),
          _pvUrl: getPvUrl(raw),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aScore = missionSortPriority(a);
        const bScore = missionSortPriority(b);
        if (aScore !== bScore) return bScore - aScore;
        return (a._startTs || 0) - (b._startTs || 0);
      });
  }

  function enrichItems(baseItems, payload) {
    const reportsByIntervention = new Map();
    const pvByIntervention = new Map();
    const filesByIntervention = new Map();
    const expensesByIntervention = new Map();
    const compensationsByIntervention = new Map();

    (payload.reports || []).forEach((row) => {
      const id = row?.intervention_id;
      if (!id) return;
      const prev = reportsByIntervention.get(id);
      const rowTs = toTimestamp(row.updated_at || row.created_at || row.date || row.id);
      const prevTs = prev ? toTimestamp(prev.updated_at || prev.created_at || prev.date || prev.id) : 0;
      if (!prev || rowTs >= prevTs) reportsByIntervention.set(id, row);
    });

    (payload.pv || []).forEach((row) => {
      const id = row?.intervention_id;
      if (!id) return;
      const prev = pvByIntervention.get(id);
      const rowTs = toTimestamp(row.updated_at || row.created_at || row.signed_uploaded_at || row.draft_uploaded_at);
      const prevTs = prev
        ? toTimestamp(prev.updated_at || prev.created_at || prev.signed_uploaded_at || prev.draft_uploaded_at)
        : 0;
      if (!prev || rowTs >= prevTs) pvByIntervention.set(id, row);
    });

    (payload.files || []).forEach((row) => {
      const id = row?.intervention_id;
      if (!id) return;
      const item = filesByIntervention.get(id) || {
        photos: 0,
        signatures: 0,
        signedPv: 0,
        total: 0,
      };
      item.total += 1;

      const type = norm(row.type || row.file_type || "");
      if (type.includes("photo")) item.photos += 1;
      if (type.includes("sign")) item.signatures += 1;
      if (type.includes("pv")) item.signedPv += 1;

      filesByIntervention.set(id, item);
    });

    (payload.expenses || []).forEach((row) => {
      const id = row?.intervention_id;
      if (!id) return;
      const item = expensesByIntervention.get(id) || {
        amountCents: 0,
        refundCents: 0,
        rows: 0,
      };

      const amountCents =
        toNumber(row.amount_cents) ||
        toNumber(row.unit_cost_cents) * Math.max(1, toNumber(row.qty) || 1);
      item.amountCents += amountCents;
      item.rows += 1;

      if (isTechPaidExpense(row)) item.refundCents += amountCents;
      expensesByIntervention.set(id, item);
    });

    (payload.compensations || []).forEach((row) => {
      const id = row?.intervention_id;
      if (!id) return;

      const status = norm(row.status || "");
      if (["canceled", "cancelled", "rejected", "annulee"].includes(status)) return;

      const techId = row.tech_id || row.user_id || "";
      if (techId && state.user?.id && String(techId) !== String(state.user.id)) return;

      const amountCents = toNumber(row.amount_cents);
      const current = compensationsByIntervention.get(id) || 0;
      compensationsByIntervention.set(id, current + amountCents);
    });

    return baseItems.map((row) => {
      const report = reportsByIntervention.get(row.id) || null;
      const pv = pvByIntervention.get(row.id) || null;
      const files = filesByIntervention.get(row.id) || { photos: 0, signatures: 0, signedPv: 0, total: 0 };
      const expenses = expensesByIntervention.get(row.id) || { amountCents: 0, refundCents: 0, rows: 0 };
      const compensationCents = compensationsByIntervention.get(row.id) || 0;

      const pvDraftPath = firstNonEmpty(
        pv?.pv_draft_path,
        row?.pv_blank_path,
        row?.pv_draft_path,
        row?.pv_path
      );
      const pvSignedPath = firstNonEmpty(pv?.pv_signed_path, row?.pv_signed_path);
      const pvDraftUrl = row._pvUrl || resolveStoragePublicUrl(pvDraftPath);
      const pvSignedUrl = resolveStoragePublicUrl(pvSignedPath);

      const diagnostic = firstNonEmpty(
        report?.diagnostic,
        report?.problem,
        report?.summary,
        row?.diagnostic,
        row?.problem
      );
      const resolution = firstNonEmpty(
        report?.resolution,
        report?.solution,
        report?.actions,
        row?.resolution,
        row?.solution
      );
      const observations = firstNonEmpty(
        report?.notes,
        report?.observation,
        row?.observations,
        row?.infos,
        row?.notes
      );

      const arrived =
        Boolean(row.arrived_at) ||
        Boolean(row.started_at) ||
        row._status === "in_progress" ||
        row._status === "done";

      const checklistComplete = resolveChecklistComplete(report, row);

      const checks = [
        { key: "arrivee", label: "Arrivee", ok: arrived },
        { key: "diagnostic", label: "Diagnostic", ok: Boolean(diagnostic) },
        { key: "resolution", label: "Resolution", ok: Boolean(resolution) },
        { key: "photos", label: "Photos", ok: !row._requiresPhotos || files.photos > 0 },
        {
          key: "signature",
          label: "Signature",
          ok: !row._requiresSignature || files.signatures > 0 || Boolean(pvSignedPath || pvSignedUrl),
        },
        { key: "checklist", label: "Checklist", ok: !row._requiresChecklist || checklistComplete },
      ];

      const doneChecks = checks.filter((c) => c.ok).length;
      const healthScore = checks.length ? Math.round((doneChecks / checks.length) * 100) : 0;
      const missing = checks.filter((c) => !c.ok).map((c) => c.label);

      const overdue =
        isOpenStatus(row._status) &&
        row._startTs &&
        row._startTs < Date.now() - CONFIG.OVERDUE_GRACE_HOURS * 60 * 60 * 1000;

      const urgencyScore = computeUrgencyScore(row, { overdue, missing, healthScore });

      return {
        ...row,
        _report: report,
        _pv: pv,
        _pvDraftPath: pvDraftPath,
        _pvSignedPath: pvSignedPath,
        _pvUrl: pvDraftUrl,
        _pvSignedUrl: pvSignedUrl,
        _files: files,
        _expenses: expenses,
        _compensationCents: compensationCents,
        _diagnostic: diagnostic,
        _resolution: resolution,
        _observations: observations,
        _checklistComplete: checklistComplete,
        _checks: checks,
        _healthScore: healthScore,
        _missing: missing,
        _isOverdue: overdue,
        _urgencyScore: urgencyScore,
      };
    });
  }

  function updateDashboard() {
    const filtered = applyFiltersAndSearch(state.items);
    const sorted = sortMissions(filtered, state.sort);
    state.filteredItems = sorted;
    state.summaryAll = buildSummary(state.items);
    state.summaryVisible = buildSummary(sorted);

    renderHeader();
    renderFocusBlock();
    renderKpis();
    renderInsights();
    renderTimeline();
    renderBoard();
    renderMissions();
  }

  function applyFiltersAndSearch(items) {
    return items.filter((item) => {
      if (state.search && !(item._search || "").includes(state.search)) return false;

      if (state.filter === "today") return isToday(item._startTs) && isOpenStatus(item._status);
      if (state.filter === "progress") return item._status === "in_progress";
      if (state.filter === "urgent") return isOpenStatus(item._status) && item._urgencyScore >= 8;
      if (state.filter === "overdue") return isOpenStatus(item._status) && item._isOverdue;
      if (state.filter === "done") return item._status === "done";
      return true;
    });
  }

  function sortMissions(items, mode) {
    const rows = items.slice();
    rows.sort((a, b) => {
      if (mode === "date_asc") return (a._startTs || 0) - (b._startTs || 0);
      if (mode === "date_desc") return (b._startTs || 0) - (a._startTs || 0);
      if (mode === "client") {
        return String(a.client_name || "").localeCompare(String(b.client_name || ""), "fr");
      }
      if (mode === "status") {
        const sa = statusOrder(a._status);
        const sb = statusOrder(b._status);
        if (sa !== sb) return sa - sb;
        return (a._startTs || 0) - (b._startTs || 0);
      }
      if (mode === "health") {
        if (a._healthScore !== b._healthScore) return b._healthScore - a._healthScore;
        return (a._startTs || 0) - (b._startTs || 0);
      }

      const aSmart = missionSortPriority(a) + a._urgencyScore;
      const bSmart = missionSortPriority(b) + b._urgencyScore;
      if (aSmart !== bSmart) return bSmart - aSmart;
      return (a._startTs || 0) - (b._startTs || 0);
    });
    return rows;
  }

  function buildSummary(items) {
    const total = items.length;
    const done = items.filter((i) => i._status === "done").length;
    const inProgress = items.filter((i) => i._status === "in_progress").length;
    const today = items.filter((i) => isToday(i._startTs)).length;
    const overdue = items.filter((i) => i._isOverdue).length;
    const urgent = items.filter((i) => i._urgencyScore >= 8 && isOpenStatus(i._status)).length;

    const healthAvg = total
      ? Math.round(items.reduce((sum, i) => sum + (toNumber(i._healthScore) || 0), 0) / total)
      : 0;

    const totalCostsCents = items.reduce((sum, i) => sum + toNumber(i._expenses?.amountCents), 0);
    const totalRefundCents = items.reduce((sum, i) => sum + toNumber(i._expenses?.refundCents), 0);
    const totalCompensationCents = items.reduce((sum, i) => sum + toNumber(i._compensationCents), 0);
    const completionRate = total ? Math.round((done / total) * 100) : 0;

    const active = items.find((row) => row._status === "in_progress") || null;

    const nextMission = items
      .filter((row) => isOpenStatus(row._status) && row._startTs)
      .sort((a, b) => (a._startTs || 0) - (b._startTs || 0))[0] || null;

    const timelineRows = items
      .filter((row) => row._status === "in_progress" || isToday(row._startTs))
      .sort((a, b) => {
        if (a._status === "in_progress" && b._status !== "in_progress") return -1;
        if (b._status === "in_progress" && a._status !== "in_progress") return 1;
        return (a._startTs || 0) - (b._startTs || 0);
      });

    return {
      total,
      done,
      inProgress,
      today,
      overdue,
      urgent,
      healthAvg,
      completionRate,
      totalCostsCents,
      totalRefundCents,
      totalCompensationCents,
      active,
      nextMission,
      timelineRows,
    };
  }

  function renderHeader() {
    const visible = state.summaryVisible?.total || 0;
    els.visibleCount.textContent = String(visible);
    els.userLabel.textContent = buildUserLabel();
    els.modeBadge.textContent = buildModeBadge();
  }

  function renderFocusBlock() {
    const focus = state.summaryAll?.active || null;
    const next = state.summaryAll?.nextMission || null;

    if (!focus && !next) {
      els.focus.innerHTML = `
        <div class="tdb-focus-empty-title">${STR.focusEmptyTitle}</div>
        <div class="tdb-focus-empty-body">${STR.focusEmptyBody}</div>
      `;
      return;
    }

    const focusBlock = focus
      ? `
        <div class="tdb-focus-item">
          <div class="tdb-focus-head">
            <span class="tdb-pill is-focus">${STR.focusTitle}</span>
            <span class="tdb-status tdb-status--${statusTone(focus._status)}">${escapeHTML(statusLabel(focus._status))}</span>
          </div>
          <div class="tdb-focus-title">${escapeHTML(missionTitle(focus))}</div>
          <div class="tdb-focus-meta">
            <span>${escapeHTML(formatDateFR(focus.start_at) || "Date non definie")}</span>
            ${focus._address ? `<span>${escapeHTML(focus._address)}</span>` : ""}
          </div>
          <div class="tdb-focus-actions">
            <a class="tdb-btn tdb-btn--primary" href="${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(focus.id)}">${STR.missionContinue}</a>
            <a class="tdb-btn tdb-btn--ghost ${focus._phone ? "" : "is-disabled"}" ${focus._phone ? `href="tel:${focus._phone}"` : ""}>${STR.missionCall}</a>
            <button class="tdb-btn tdb-btn--ghost ${focus._address ? "" : "is-disabled"}" data-action="map" data-id="${escapeHTML(String(focus.id))}" ${focus._address ? "" : "disabled"}>${STR.missionMap}</button>
          </div>
        </div>
      `
      : "";

    const nextBlock = next
      ? `
        <div class="tdb-next-item">
          <div class="tdb-focus-head">
            <span class="tdb-pill">${STR.nextTitle}</span>
            <span class="tdb-status tdb-status--${statusTone(next._status)}">${escapeHTML(statusLabel(next._status))}</span>
          </div>
          <div class="tdb-next-title">${escapeHTML(missionTitle(next))}</div>
          <div class="tdb-next-meta">
            <span>${escapeHTML(formatDateFR(next.start_at) || "Date non definie")}</span>
            ${next._address ? `<span>${escapeHTML(shortText(next._address, 64))}</span>` : ""}
          </div>
        </div>
      `
      : "";

    els.focus.innerHTML = `${focusBlock}${nextBlock}`;
  }

  function renderKpis() {
    const all = state.summaryAll || buildSummary([]);
    const visible = state.summaryVisible || buildSummary([]);

    const dayScore = clamp(Math.round((all.completionRate * 0.55 + all.healthAvg * 0.45) || 0), 0, 100);

    els.scoreValue.textContent = `${dayScore}%`;
    els.scoreLabel.textContent = `Score terrain (${all.total} missions)`;
    els.scoreArc.style.setProperty("--tdb-score", `${dayScore}%`);

    els.kpis.innerHTML = `
      ${renderKpiCard(STR.kpiTotal, `${visible.total} / ${all.total}`, "is-indigo")}
      ${renderKpiCard(STR.kpiToday, String(all.today), "is-cyan")}
      ${renderKpiCard(STR.kpiProgress, String(all.inProgress), "is-amber")}
      ${renderKpiCard(STR.kpiDone, String(all.done), "is-green")}
      ${renderKpiCard(STR.kpiOverdue, String(all.overdue), all.overdue ? "is-red" : "is-neutral")}
      ${renderKpiCard(STR.kpiHealth, `${all.healthAvg}%`, toneByPercent(all.healthAvg))}
      ${renderKpiCard(STR.kpiCosts, formatCurrency(all.totalCostsCents / 100), "is-neutral")}
      ${renderKpiCard(STR.kpiRefund, formatCurrency(all.totalRefundCents / 100), "is-neutral")}
    `;

    els.finance.textContent =
      `Compensation estimee: ${formatCurrency(all.totalCompensationCents / 100)} - ` +
      `Completion: ${all.completionRate}%`;
  }

  function renderInsights() {
    const s = state.summaryAll || buildSummary([]);
    const items = [];

    if (s.overdue > 0) {
      items.push({
        tone: "warning",
        title: STR.insightWarning,
        body: `${s.overdue} mission(s) en retard. Priorise les dossiers critiques pour reduire la pression du jour.`,
      });
    }

    if (s.urgent > 0) {
      items.push({
        tone: "warning",
        title: "Pic de priorite",
        body: `${s.urgent} mission(s) urgentes detectees. Utilise le filtre "Urgentes" pour traiter en premier.`,
      });
    }

    if (s.totalRefundCents > 0) {
      items.push({
        tone: "info",
        title: STR.insightInfo,
        body: `Remboursement potentiel: ${formatCurrency(s.totalRefundCents / 100)}. Pense a verifier les justificatifs.`,
      });
    }

    if (!items.length) {
      items.push({
        tone: "success",
        title: STR.insightGood,
        body: "Aucune alerte bloquante. Continue le flux normal et maintiens la qualite des rapports.",
      });
    }

    els.insights.innerHTML = items
      .slice(0, 3)
      .map(
        (item) => `
        <article class="tdb-insight tdb-insight--${item.tone}">
          <div class="tdb-insight-title">${escapeHTML(item.title)}</div>
          <div class="tdb-insight-body">${escapeHTML(item.body)}</div>
        </article>
      `
      )
      .join("");
  }

  function renderTimeline() {
    const rows = (state.summaryAll?.timelineRows || []).slice(0, 8);
    if (!rows.length) {
      els.timeline.innerHTML = `<div class="tdb-empty-inline">${STR.timelineEmpty}</div>`;
      return;
    }

    els.timeline.innerHTML = rows
      .map((row) => {
        const time = row._startTs
          ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(row._startTs))
          : "--:--";
        return `
          <article class="tdb-time-item">
            <div class="tdb-time-left">
              <div class="tdb-time-hour">${escapeHTML(time)}</div>
              <div class="tdb-time-status tdb-status--${statusTone(row._status)}">${escapeHTML(statusLabel(row._status))}</div>
            </div>
            <div class="tdb-time-main">
              <div class="tdb-time-title">${escapeHTML(missionTitle(row))}</div>
              <div class="tdb-time-meta">${escapeHTML(shortText(row._address || "Adresse non renseignee", 66))}</div>
            </div>
            <button class="tdb-link-btn" data-action="jump" data-id="${escapeHTML(String(row.id))}">Voir</button>
          </article>
        `;
      })
      .join("");
  }

  function renderBoard() {
    const rows = state.filteredItems || [];

    const groups = {
      progress: rows.filter((r) => r._status === "in_progress"),
      pending: rows.filter((r) => ["planned", "pending", "confirmed"].includes(r._status)),
      done: rows.filter((r) => r._status === "done"),
    };

    const block = (title, key, filter) => `
      <section class="tdb-board-col">
        <header class="tdb-board-head">
          <h4>${escapeHTML(title)}</h4>
          <button class="tdb-chip-link" data-action="filter" data-filter="${escapeHTML(filter)}">${groups[key].length}</button>
        </header>
        <div class="tdb-board-list">
          ${
            groups[key].length
              ? groups[key]
                  .slice(0, 5)
                  .map(
                    (row) => `
                    <article class="tdb-board-item">
                      <div class="tdb-board-title">${escapeHTML(shortText(missionTitle(row), 44))}</div>
                      <div class="tdb-board-meta">${escapeHTML(formatDateFR(row.start_at) || "Sans date")}</div>
                    </article>
                  `
                  )
                  .join("")
              : `<div class="tdb-empty-inline">Aucune mission</div>`
          }
        </div>
      </section>
    `;

    els.board.innerHTML =
      block("En cours", "progress", "progress") +
      block("A traiter", "pending", "all") +
      block("Terminees", "done", "done");
  }

  function renderMissions() {
    const rows = state.filteredItems || [];
    if (!rows.length) {
      els.missions.innerHTML = `
        <div class="tdb-empty">
          <div class="tdb-empty-title">${STR.listEmptyTitle}</div>
          <div class="tdb-empty-body">${STR.listEmptyBody}</div>
        </div>
      `;
      return;
    }

    const activeRow =
      state.summaryAll?.active ||
      (state.activeId ? state.items.find((r) => String(r.id) === String(state.activeId)) : null) ||
      null;
    const hasGlobalActive = Boolean(activeRow && activeRow._status !== "done" && activeRow._status !== "canceled");

    els.missions.innerHTML = rows
      .map((row, index) => renderMissionCard(row, index, hasGlobalActive, activeRow))
      .join("");
  }

  function renderMissionCard(row, index, hasGlobalActive, activeRow) {
    const isDone = row._status === "done";
    const isCanceled = row._status === "canceled";
    const isInProgress = row._status === "in_progress";
    const isActiveCard = activeRow && String(activeRow.id) === String(row.id);
    const isLockedByOther = hasGlobalActive && !isActiveCard;
    const canStart = !isDone && !isCanceled && !isInProgress && !isLockedByOther;
    const canContinue = isInProgress;

    const healthTone = toneByPercent(row._healthScore);
    const progress = clamp(toNumber(row._healthScore), 0, 100);

    const checkList = row._checks
      .map(
        (check) => `
        <span class="tdb-check ${check.ok ? "is-ok" : "is-miss"}">${check.ok ? "OK" : "KO"} ${escapeHTML(check.label)}</span>
      `
      )
      .join("");

    return `
      <article class="tdb-mission-card" data-id="${escapeHTML(String(row.id))}" style="animation-delay:${Math.min(index * 24, 280)}ms">
        <div class="tdb-mission-head">
          <div>
            <div class="tdb-mission-ref">${escapeHTML(row.internal_ref || "Sans reference")}</div>
            <h4 class="tdb-mission-title">${escapeHTML(missionTitle(row))}</h4>
            <div class="tdb-mission-meta">
              <span>${escapeHTML(formatDateFR(row.start_at) || "Date non definie")}</span>
              ${row._address ? `<span>${escapeHTML(shortText(row._address, 78))}</span>` : ""}
            </div>
          </div>
          <div class="tdb-mission-side">
            <span class="tdb-status tdb-status--${statusTone(row._status)}">${escapeHTML(statusLabel(row._status))}</span>
            <span class="tdb-priority tdb-priority--${escapeHTML(row._priority)}">${escapeHTML(priorityLabel(row._priority))}</span>
          </div>
        </div>

        <div class="tdb-health-row">
          <div class="tdb-health-top">
            <span class="tdb-health-label">Sante mission</span>
            <span class="tdb-health-value ${healthTone}">${progress}%</span>
          </div>
          <div class="tdb-health-bar"><span style="width:${progress}%"></span></div>
          <div class="tdb-checks">${checkList}</div>
        </div>

        ${
          row._isOverdue
            ? `<div class="tdb-alert-inline is-red">Intervention en retard: priorite haute recommandee.</div>`
            : ""
        }
        ${
          isLockedByOther
            ? `<div class="tdb-alert-inline is-amber">Une autre mission est active. Termine-la avant d'en demarrer une nouvelle.</div>`
            : ""
        }

        <div class="tdb-mission-actions">
          <a class="tdb-btn tdb-btn--ghost ${row._phone ? "" : "is-disabled"}" ${row._phone ? `href="tel:${row._phone}"` : ""}>${STR.missionCall}</a>
          <button class="tdb-btn tdb-btn--ghost ${row._address ? "" : "is-disabled"}" data-action="map" data-id="${escapeHTML(String(row.id))}" ${row._address ? "" : "disabled"}>${STR.missionMap}</button>
          ${row._pvUrl ? `<a class="tdb-btn tdb-btn--ghost" href="${row._pvUrl}" target="_blank" rel="noopener" download>${STR.missionPv}</a>` : ""}
          <button class="tdb-btn tdb-btn--ghost" data-action="details" data-id="${escapeHTML(String(row.id))}">${STR.missionDetails}</button>
          ${canStart ? `<button class="tdb-btn tdb-btn--start" data-action="start" data-id="${escapeHTML(String(row.id))}">${STR.missionStart}</button>` : ""}
          ${canContinue ? `<a class="tdb-btn tdb-btn--primary" href="${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(row.id)}">${STR.missionContinue}</a>` : ""}
          ${isDone ? `<span class="tdb-btn tdb-btn--done">${STR.missionDone}</span>` : ""}
        </div>

        <section class="tdb-details" data-details="${escapeHTML(String(row.id))}" hidden>
          <div class="tdb-details-grid">
            ${infoCell("Client", row.client_name)}
            ${infoCell("Intervention", row.title)}
            ${infoCell("Telephone", formatPhoneReadable(row._phone))}
            ${infoCell("Adresse", row._address)}
            ${infoCell("Diagnostic", shortText(row._diagnostic || "Non renseigne", 180))}
            ${infoCell("Resolution", shortText(row._resolution || "Non renseignee", 180))}
            ${infoCell("Observations", shortText(row._observations || "Aucune", 180))}
            ${infoCell("Frais", formatCurrency((row._expenses?.amountCents || 0) / 100))}
            ${infoCell("Remboursement", formatCurrency((row._expenses?.refundCents || 0) / 100))}
            ${infoCell("Compensation", formatCurrency((row._compensationCents || 0) / 100))}
            ${infoCell("Photos", String(row._files?.photos || 0))}
            ${infoCell("Signatures", String(row._files?.signatures || 0))}
          </div>
        </section>
      </article>
    `;
  }

  function toggleMissionDetails(missionId, button) {
    const details = root.querySelector(`[data-details="${cssEscape(missionId)}"]`);
    if (!details) return;
    const hidden = details.hasAttribute("hidden");
    if (hidden) details.removeAttribute("hidden");
    else details.setAttribute("hidden", "");
    button.textContent = hidden ? STR.missionHide : STR.missionDetails;
  }

  async function startIntervention(row, button) {
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = "Demarrage...";

    try {
      const payload = { status: "in_progress" };
      if (hasField(row, "started_at")) payload.started_at = new Date().toISOString();
      if (hasField(row, "arrived_at") && !row.arrived_at) payload.arrived_at = new Date().toISOString();

      const response = await supabase.from(CONFIG.INTERVENTIONS_TABLE).update(payload).eq("id", row.id);
      if (response.error) throw response.error;

      state.activeId = String(row.id);
      saveActiveInterventionId(row.id);
      showToast("success", STR.toastStartOk);

      setTimeout(() => {
        window.location.href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(row.id)}`;
      }, 220);
    } catch (error) {
      console.error("[TECH DASHBOARD] startIntervention error:", error);
      showToast("error", `${STR.toastStartError} ${error?.message || ""}`.trim());
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function renderLoadingState() {
    els.missions.innerHTML = `
      <div class="tdb-skeleton"></div>
      <div class="tdb-skeleton"></div>
      <div class="tdb-skeleton"></div>
    `;
    els.timeline.innerHTML = `<div class="tdb-skeleton tdb-skeleton--sm"></div>`;
    els.insights.innerHTML = `<div class="tdb-skeleton tdb-skeleton--sm"></div>`;
    els.board.innerHTML = `<div class="tdb-skeleton tdb-skeleton--sm"></div>`;
  }

  function renderSessionExpired() {
    showBanner("error", `${STR.sessionExpiredTitle} - ${STR.sessionExpiredBody}`);
    els.missions.innerHTML = `
      <div class="tdb-empty">
        <div class="tdb-empty-title">${STR.sessionExpiredTitle}</div>
        <div class="tdb-empty-body">${STR.sessionExpiredBody}</div>
      </div>
    `;
    disableControls(true);
  }

  function renderErrorState(error) {
    showBanner("error", `${STR.errorTitle} ${error?.message ? `(${error.message})` : ""}`.trim());
    els.missions.innerHTML = `
      <div class="tdb-empty">
        <div class="tdb-empty-title">${STR.errorTitle}</div>
        <div class="tdb-empty-body">${STR.errorBody}</div>
      </div>
    `;
  }

  function renderHeaderBannerIfNeeded() {
    const unavailable = Object.entries(state.tableAvailability)
      .filter(([, available]) => !available)
      .map(([name]) => name);

    if (!unavailable.length) {
      showBanner("", "");
      return;
    }

    showBanner(
      "warning",
      `Mode reduit: ${unavailable.join(", ")} indisponible(s). Le dashboard reste utilisable avec les donnees principales.`
    );
  }

  function setLoading(flag) {
    state.loading = flag;
    els.refresh.disabled = flag;
    disableControls(flag);
    if (flag) {
      renderLoadingState();
      showBanner("info", `${STR.loadingTitle} ${STR.loadingBody}`);
    }
  }

  function disableControls(disabled) {
    els.search.disabled = disabled;
    els.sort.disabled = disabled;
    els.filters.forEach((btn) => {
      btn.disabled = disabled;
      btn.classList.toggle("is-disabled", disabled);
    });
  }

  function showBanner(type, message) {
    els.banner.className = "tdb-banner";
    if (!message) {
      els.banner.hidden = true;
      els.banner.textContent = "";
      return;
    }
    els.banner.hidden = false;
    els.banner.classList.add(`is-${type || "info"}`);
    els.banner.textContent = message;
  }

  function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `tdb-toast tdb-toast--${type || "info"}`;
    toast.textContent = message;
    els.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function buildUserLabel() {
    const p = state.profile;
    const fallback = state.user?.email ? state.user.email.split("@")[0] : "Technicien";
    if (!p) return `${STR.greeting}, ${fallback}`;
    const fullName = firstNonEmpty(
      p.name,
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      p.email ? p.email.split("@")[0] : ""
    );
    return `${STR.greeting}, ${fullName || fallback}`;
  }

  function buildModeBadge() {
    const allAvailable = Object.values(state.tableAvailability).every(Boolean);
    return allAvailable ? "Mode complet" : "Mode reduit";
  }

  function updateSyncLabel() {
    if (!state.lastSyncAt) {
      els.sync.textContent = "Derniere sync: --";
      return;
    }
    els.sync.textContent = `Derniere sync: ${formatDateFR(new Date(state.lastSyncAt).toISOString())}`;
  }

  function openMapSheet(address) {
    if (!address) return;
    state.mapAddress = address;
    els.sheet.hidden = false;
    document.body.classList.add("tdb-sheet-open");
  }

  function closeMapSheet() {
    els.sheet.hidden = true;
    document.body.classList.remove("tdb-sheet-open");
  }

  function openMapProvider(provider) {
    const url = buildMapUrl(provider, state.mapAddress);
    if (url) window.open(url, "_blank", "noopener");
    closeMapSheet();
  }

  function buildMapUrl(provider, address) {
    const q = encodeURIComponent(String(address || "").trim());
    if (!q) return "";
    if (provider === "apple") return `https://maps.apple.com/?daddr=${q}`;
    if (provider === "waze") return `https://waze.com/ul?q=${q}&navigate=yes`;
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }

  function syncActiveIntervention() {
    const inProgress = state.items.find((item) => item._status === "in_progress");
    if (inProgress) {
      state.activeId = String(inProgress.id);
      saveActiveInterventionId(inProgress.id);
      return;
    }

    if (state.activeId) {
      state.activeId = "";
      clearActiveInterventionId();
    }
  }

  function getPvUrl(row) {
    const candidateKeys = [
      "pv_blank_url",
      "pv_url",
      "pv",
      "pv_file",
      "pv_blank",
      "pv_blank_path",
      "pv_draft_path",
      "pv_path",
    ];

    for (const key of candidateKeys) {
      const raw = row?.[key];
      if (!raw) continue;

      if (typeof raw === "string") {
        if (/^https?:\/\//i.test(raw)) return raw;
        const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(raw);
        if (data?.publicUrl) return data.publicUrl;
      }

      if (typeof raw === "object") {
        if (raw.url) return raw.url;
        if (raw.path) {
          const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(raw.path);
          if (data?.publicUrl) return data.publicUrl;
        }
      }
    }

    return "";
  }

  function resolveStoragePublicUrl(path) {
    const raw = String(path || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || "";
  }

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <section class="tdb-shell">
        <header class="tdb-header">
          <div class="tdb-header-left">
            <div class="tdb-eyebrow">${STR.subtitle}</div>
            <h1 class="tdb-h1">${STR.title}</h1>
            <div class="tdb-user-row">
              <span class="tdb-user" data-tdb-user>${STR.greeting}, Technicien</span>
              <span class="tdb-badge" data-tdb-mode>Mode complet</span>
            </div>
            <div class="tdb-sync" data-tdb-sync>Derniere sync: --</div>
          </div>
          <div class="tdb-header-right">
            <div class="tdb-stat">
              <div class="tdb-stat-value" data-tdb-visible-count>0</div>
              <div class="tdb-stat-label">${STR.visibleCountLabel}</div>
            </div>
            <button type="button" class="tdb-refresh" data-tdb-refresh>${STR.refresh}</button>
          </div>
        </header>

        <div class="tdb-banner" data-tdb-banner hidden></div>

        <section class="tdb-top-grid">
          <article class="tdb-panel tdb-panel--focus">
            <div class="tdb-panel-title">${STR.focusTitle}</div>
            <div class="tdb-focus-wrap" data-tdb-focus></div>
          </article>
          <article class="tdb-panel tdb-panel--score">
            <div class="tdb-score-shell">
              <div class="tdb-score-arc" data-tdb-score-arc>
                <div class="tdb-score-center">
                  <div class="tdb-score-value" data-tdb-score-value>0%</div>
                  <div class="tdb-score-label" data-tdb-score-label>Score terrain</div>
                </div>
              </div>
              <div class="tdb-finance-line" data-tdb-finance></div>
            </div>
            <div class="tdb-kpis" data-tdb-kpis></div>
          </article>
        </section>

        <section class="tdb-toolbar">
          <div class="tdb-filters">
            <button class="tdb-chip is-active" data-filter="all">${STR.filterAll}</button>
            <button class="tdb-chip" data-filter="today">${STR.filterToday}</button>
            <button class="tdb-chip" data-filter="progress">${STR.filterProgress}</button>
            <button class="tdb-chip" data-filter="urgent">${STR.filterUrgent}</button>
            <button class="tdb-chip" data-filter="overdue">${STR.filterOverdue}</button>
            <button class="tdb-chip" data-filter="done">${STR.filterDone}</button>
          </div>
          <div class="tdb-search-row">
            <input type="search" data-tdb-search placeholder="${STR.searchPlaceholder}" />
            <select data-tdb-sort>
              <option value="smart">${STR.sortSmart}</option>
              <option value="date_asc">${STR.sortDateAsc}</option>
              <option value="date_desc">${STR.sortDateDesc}</option>
              <option value="client">${STR.sortClient}</option>
              <option value="status">${STR.sortStatus}</option>
              <option value="health">${STR.sortHealth}</option>
            </select>
          </div>
        </section>

        <section class="tdb-middle-grid">
          <article class="tdb-panel">
            <h3 class="tdb-panel-h3">${STR.panelInsights}</h3>
            <div class="tdb-insights" data-tdb-insights></div>
          </article>
          <article class="tdb-panel">
            <h3 class="tdb-panel-h3">${STR.panelTimeline}</h3>
            <div class="tdb-timeline" data-tdb-timeline></div>
          </article>
        </section>

        <section class="tdb-panel">
          <h3 class="tdb-panel-h3">${STR.panelBoard}</h3>
          <div class="tdb-board" data-tdb-board></div>
        </section>

        <section class="tdb-panel">
          <h3 class="tdb-panel-h3">${STR.panelMissions}</h3>
          <div class="tdb-missions" data-tdb-missions></div>
        </section>

        <div class="tdb-toasts" data-tdb-toasts></div>

        <div class="tdb-sheet" data-tdb-sheet hidden>
          <div class="tdb-sheet-backdrop" data-tdb-sheet-close></div>
          <div class="tdb-sheet-panel">
            <div class="tdb-sheet-title">${STR.mapChooseTitle}</div>
            <button class="tdb-sheet-btn" data-map="apple">${STR.mapPlans}</button>
            <button class="tdb-sheet-btn" data-map="google">${STR.mapGoogle}</button>
            <button class="tdb-sheet-btn" data-map="waze">${STR.mapWaze}</button>
            <button class="tdb-sheet-btn tdb-sheet-cancel" data-tdb-sheet-close>${STR.mapCancel}</button>
          </div>
        </div>
      </section>
    `;

    return {
      userLabel: rootEl.querySelector("[data-tdb-user]"),
      modeBadge: rootEl.querySelector("[data-tdb-mode]"),
      sync: rootEl.querySelector("[data-tdb-sync]"),
      visibleCount: rootEl.querySelector("[data-tdb-visible-count]"),
      refresh: rootEl.querySelector("[data-tdb-refresh]"),
      banner: rootEl.querySelector("[data-tdb-banner]"),

      focus: rootEl.querySelector("[data-tdb-focus]"),
      scoreArc: rootEl.querySelector("[data-tdb-score-arc]"),
      scoreValue: rootEl.querySelector("[data-tdb-score-value]"),
      scoreLabel: rootEl.querySelector("[data-tdb-score-label]"),
      finance: rootEl.querySelector("[data-tdb-finance]"),
      kpis: rootEl.querySelector("[data-tdb-kpis]"),

      search: rootEl.querySelector("[data-tdb-search]"),
      sort: rootEl.querySelector("[data-tdb-sort]"),
      filters: Array.from(rootEl.querySelectorAll("[data-filter]")),

      insights: rootEl.querySelector("[data-tdb-insights]"),
      timeline: rootEl.querySelector("[data-tdb-timeline]"),
      board: rootEl.querySelector("[data-tdb-board]"),
      missions: rootEl.querySelector("[data-tdb-missions]"),

      toasts: rootEl.querySelector("[data-tdb-toasts]"),
      sheet: rootEl.querySelector("[data-tdb-sheet]"),
    };
  }

  function renderKpiCard(label, value, tone) {
    return `
      <article class="tdb-kpi ${tone || "is-neutral"}">
        <div class="tdb-kpi-label">${escapeHTML(label)}</div>
        <div class="tdb-kpi-value">${escapeHTML(value)}</div>
      </article>
    `;
  }

  function infoCell(label, value) {
    if (!value && value !== 0) return "";
    return `
      <div class="tdb-info-cell">
        <div class="tdb-info-label">${escapeHTML(label)}</div>
        <div class="tdb-info-value">${escapeHTML(String(value))}</div>
      </div>
    `;
  }

  function missionTitle(row) {
    const client = row.client_name || row.client_ref || "Client";
    const title = row.title || "Intervention";
    return `${client} - ${title}`;
  }

  function inferPriority(row, status, startTs) {
    const explicit = norm(row.priority || row.urgence || row.urgency || "");
    if (["high", "haute", "urgent", "critique", "critical"].includes(explicit)) return "high";
    if (["low", "basse", "faible"].includes(explicit)) return "low";
    if (row.is_urgent === true) return "high";
    if (status === "in_progress") return "high";
    if (isOpenStatus(status) && startTs && startTs < Date.now()) return "high";
    return "medium";
  }

  function missionSortPriority(row) {
    let score = 0;
    if (row._status === "in_progress") score += 120;
    if (row._isOverdue) score += 80;
    if (row._priority === "high") score += 50;
    if (row._status === "done") score -= 60;
    if (row._status === "canceled") score -= 80;
    score += Math.max(0, 100 - (toNumber(row._healthScore) || 0)) * 0.25;
    return score;
  }

  function computeUrgencyScore(row, context) {
    let score = 0;
    if (row._priority === "high") score += 4;
    if (row._status === "in_progress") score += 3;
    if (context.overdue) score += 4;
    if (isToday(row._startTs) && isOpenStatus(row._status)) score += 2;
    if (context.missing.length >= 3) score += 2;
    if (context.healthScore <= 45) score += 2;
    return clamp(score, 0, 10);
  }

  function resolveChecklistComplete(report, intervention) {
    const directCandidates = [
      report?.checklist_complete,
      report?.checklist_done,
      report?.is_checklist_complete,
      intervention?.checklist_complete,
      intervention?.checklist_done,
      intervention?.is_checklist_complete,
    ];
    for (const candidate of directCandidates) {
      if (typeof candidate === "boolean") return candidate;
    }

    const checklist = report?.checklist || intervention?.checklist;
    if (Array.isArray(checklist) && checklist.length) return checklist.every(Boolean);
    return false;
  }

  function isTechPaidExpense(row) {
    if (row?.paid_by_tech === true) return true;
    const note = String(row?.note || "");
    return note.startsWith("[TECH-RUN]") && /\bpaid_by_tech\b/i.test(note);
  }

  function statusLabel(status) {
    if (status === "planned") return STR.statusPlanned;
    if (status === "pending") return STR.statusPending;
    if (status === "in_progress") return STR.statusProgress;
    if (status === "confirmed") return STR.statusConfirmed;
    if (status === "done") return STR.statusDone;
    if (status === "canceled") return STR.statusCanceled;
    return STR.statusUnknown;
  }

  function priorityLabel(priority) {
    if (priority === "high") return "Priorite haute";
    if (priority === "low") return "Priorite basse";
    return "Priorite standard";
  }

  function statusTone(status) {
    if (["planned", "pending"].includes(status)) return "pending";
    if (status === "in_progress") return "progress";
    if (status === "confirmed") return "confirmed";
    if (status === "done") return "done";
    if (status === "canceled") return "canceled";
    return "unknown";
  }

  function statusOrder(status) {
    if (status === "in_progress") return 1;
    if (status === "confirmed") return 2;
    if (status === "planned") return 3;
    if (status === "pending") return 4;
    if (status === "done") return 5;
    if (status === "canceled") return 6;
    return 99;
  }

  function toneByPercent(value) {
    if (value >= 80) return "is-green";
    if (value >= 60) return "is-cyan";
    if (value >= 40) return "is-amber";
    return "is-red";
  }

  function canonicalStatus(value) {
    const s = norm(String(value || "")).replace(/\s+/g, "_");
    if (s === "in_progress" || s === "inprogress" || s === "en_cours") return "in_progress";
    if (s === "done" || s === "completed" || s === "terminee") return "done";
    if (s === "planned" || s === "planifiee") return "planned";
    if (s === "pending" || s === "en_attente") return "pending";
    if (s === "confirmed" || s === "confirmee") return "confirmed";
    if (s === "canceled" || s === "cancelled" || s === "annulee") return "canceled";
    return s || "unknown";
  }

  function isOpenStatus(status) {
    return status !== "done" && status !== "canceled";
  }

  function isToday(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function formatDateFR(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function toTimestamp(value) {
    if (!value) return 0;
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function formatCurrency(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: CONFIG.CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  }

  function normalizePhone(phone) {
    if (!phone) return "";
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("00")) p = `+${p.slice(2)}`;
    if (/^0\d{9}$/.test(p)) p = `+33${p.slice(1)}`;
    return p;
  }

  function formatPhoneReadable(phone) {
    const p = normalizePhone(phone);
    if (!p) return "";
    if (p.startsWith("+33")) {
      const rest = p.slice(3);
      return `+33 ${rest.replace(/(\d)(?=(\d{2})+$)/g, "$1 ").trim()}`;
    }
    return p.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }

  function resolveFlag(value, fallback) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const s = norm(value);
      if (["true", "1", "yes", "oui"].includes(s)) return true;
      if (["false", "0", "no", "non"].includes(s)) return false;
    }
    return Boolean(fallback);
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      const s = String(value || "").trim();
      if (s) return s;
    }
    return "";
  }

  function shortText(value, maxLen) {
    const s = String(value || "").trim();
    if (!s) return "";
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}...`;
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function chunk(input, size) {
    const output = [];
    for (let i = 0; i < input.length; i += size) output.push(input.slice(i, i + size));
    return output;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function hasField(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key);
  }

  function isTableMissing(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return code === "PGRST205" || message.includes("could not find the table") || message.includes("does not exist");
  }

  function isPermissionIssue(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return (
      code === "42501" ||
      code === "PGRST301" ||
      message.includes("permission denied") ||
      message.includes("not allowed")
    );
  }

  function loadActiveInterventionId() {
    try {
      return localStorage.getItem(CONFIG.ACTIVE_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveActiveInterventionId(id) {
    try {
      localStorage.setItem(CONFIG.ACTIVE_STORAGE_KEY, String(id));
    } catch (_) {
      // noop
    }
  }

  function clearActiveInterventionId() {
    try {
      localStorage.removeItem(CONFIG.ACTIVE_STORAGE_KEY);
    } catch (_) {
      // noop
    }
  }

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset || {};
    const pick = (value) => String(value || "").trim();
    const pickRelation = (value) => normalizeRelationName(pick(value));

    if (d.storageBucket) CONFIG.STORAGE_BUCKET = pick(d.storageBucket);
    if (d.assigneesTable) CONFIG.ASSIGNEES_TABLE = pickRelation(d.assigneesTable);
    if (d.interventionsTable) CONFIG.INTERVENTIONS_TABLE = pickRelation(d.interventionsTable);
    if (Object.prototype.hasOwnProperty.call(d, "reportsTable")) {
      CONFIG.REPORTS_TABLE = normalizeOptionalRelationName(d.reportsTable);
    }
    if (Object.prototype.hasOwnProperty.call(d, "pvTable")) {
      CONFIG.PV_TABLE = normalizeOptionalRelationName(d.pvTable);
    }
    if (d.expensesTable) CONFIG.EXPENSES_TABLE = pickRelation(d.expensesTable);
    if (d.filesTable) CONFIG.FILES_TABLE = pickRelation(d.filesTable);
    if (d.compensationsTable) CONFIG.COMPENSATIONS_TABLE = pickRelation(d.compensationsTable);
    if (d.profilesTable) CONFIG.PROFILES_TABLE = pickRelation(d.profilesTable);

    if (d.runPath) CONFIG.RUN_PAGE_PATH = pick(d.runPath);
    if (d.listPath) CONFIG.LIST_PAGE_PATH = pick(d.listPath);
    if (d.currency) CONFIG.CURRENCY = pick(d.currency);
    if (d.requireChecklist) CONFIG.REQUIRE_CHECKLIST_DEFAULT = d.requireChecklist === "true";
    if (d.requirePhotos) CONFIG.REQUIRE_PHOTOS_DEFAULT = d.requirePhotos === "true";
    if (d.requireSignature) CONFIG.REQUIRE_SIGNATURE_DEFAULT = d.requireSignature === "true";
  }

  function normalizeRelationName(value) {
    let relation = String(value || "").trim();
    while (relation.toLowerCase().startsWith("public.")) {
      relation = relation.slice("public.".length).trim();
    }
    return relation;
  }

  function normalizeOptionalRelationName(value) {
    const raw = String(value || "").trim();
    const s = norm(raw);
    if (!raw) return "";
    if (["none", "null", "off", "false", "0"].includes(s)) return "";
    return normalizeRelationName(raw);
  }

  function injectStyles() {
    if (document.getElementById("tdb-styles-v1")) return;

    const style = document.createElement("style");
    style.id = "tdb-styles-v1";
    style.textContent = `
      .tdb-shell {
        --tdb-bg-1: #f6fbff;
        --tdb-bg-2: #eaf3fb;
        --tdb-surface: #ffffff;
        --tdb-border: #d2e3f2;
        --tdb-text: #13233a;
        --tdb-muted: #59718a;
        --tdb-cyan: #0ea5e9;
        --tdb-teal: #0f766e;
        --tdb-indigo: #2563eb;
        --tdb-amber: #d97706;
        --tdb-green: #16a34a;
        --tdb-red: #dc2626;
        --tdb-shadow: 0 18px 40px rgba(8, 28, 53, 0.10);
        --tdb-score: 0%;

        font-family: "Sora", "Manrope", sans-serif;
        color: var(--tdb-text);
        border: 1px solid var(--tdb-border);
        border-radius: 22px;
        padding: 16px;
        background:
          radial-gradient(1000px 520px at 4% -10%, rgba(15, 118, 110, 0.16), transparent 64%),
          radial-gradient(920px 520px at 100% -6%, rgba(14, 165, 233, 0.18), transparent 67%),
          linear-gradient(180deg, var(--tdb-bg-1), var(--tdb-bg-2));
      }

      .tdb-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 12px;
      }

      .tdb-eyebrow {
        color: #4c6985;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .09em;
        text-transform: uppercase;
        margin-bottom: 7px;
      }

      .tdb-h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.05;
        letter-spacing: -0.02em;
        color: #0d2947;
      }

      .tdb-user-row {
        margin-top: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tdb-user {
        font-size: 13px;
        font-weight: 700;
        color: #1f3f63;
      }

      .tdb-badge {
        border-radius: 999px;
        border: 1px solid #bfdbfe;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 11px;
        font-weight: 800;
        padding: 4px 9px;
      }

      .tdb-sync {
        margin-top: 8px;
        color: #5c7894;
        font-size: 12px;
      }

      .tdb-header-right {
        display: flex;
        gap: 9px;
        align-items: center;
      }

      .tdb-stat {
        min-width: 95px;
        border-radius: 14px;
        border: 1px solid var(--tdb-teal);
        background: linear-gradient(180deg, #0f766e, #0a5d56);
        color: #fff;
        text-align: center;
        padding: 9px 12px;
      }

      .tdb-stat-value {
        font-size: 20px;
        line-height: 1;
        font-weight: 800;
      }

      .tdb-stat-label {
        margin-top: 5px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        opacity: .9;
      }

      .tdb-refresh {
        border: 1px solid var(--tdb-border);
        border-radius: 12px;
        padding: 11px 14px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        background: #fff;
        color: #0f2945;
      }

      .tdb-refresh:disabled {
        opacity: .6;
        cursor: default;
      }

      .tdb-banner {
        margin-bottom: 12px;
        border-radius: 12px;
        border: 1px solid #dbeafe;
        background: #eff6ff;
        color: #1e3a8a;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .tdb-banner.is-warning {
        border-color: #fde68a;
        background: #fffbeb;
        color: #92400e;
      }

      .tdb-banner.is-error {
        border-color: #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tdb-top-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }

      .tdb-panel {
        border: 1px solid var(--tdb-border);
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff, #f7fbff);
        box-shadow: var(--tdb-shadow);
        padding: 12px;
      }

      .tdb-panel--focus {
        background:
          radial-gradient(680px 220px at 8% 0%, rgba(14, 165, 233, 0.10), transparent 62%),
          linear-gradient(180deg, #ffffff, #f7fbff);
      }

      .tdb-panel-title {
        color: #52708c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .tdb-focus-wrap {
        display: grid;
        gap: 10px;
      }

      .tdb-focus-item,
      .tdb-next-item {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 10px;
      }

      .tdb-focus-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 7px;
      }

      .tdb-pill {
        border-radius: 999px;
        padding: 4px 9px;
        background: #ecfeff;
        border: 1px solid #99f6e4;
        color: #0f766e;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .tdb-pill.is-focus {
        background: #eff6ff;
        border-color: #bfdbfe;
        color: #1d4ed8;
      }

      .tdb-focus-title,
      .tdb-next-title {
        color: #113154;
        font-size: 16px;
        font-weight: 800;
      }

      .tdb-focus-meta,
      .tdb-next-meta {
        margin-top: 5px;
        display: grid;
        gap: 3px;
        color: #5d7892;
        font-size: 12px;
      }

      .tdb-focus-actions {
        margin-top: 9px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tdb-focus-empty-title {
        color: #133354;
        font-size: 15px;
        font-weight: 800;
      }

      .tdb-focus-empty-body {
        margin-top: 5px;
        color: #607b96;
        font-size: 13px;
      }

      .tdb-score-shell {
        display: grid;
        gap: 10px;
        margin-bottom: 10px;
      }

      .tdb-score-arc {
        --size: 160px;
        width: var(--size);
        height: var(--size);
        margin: 0 auto;
        border-radius: 50%;
        background:
          conic-gradient(from -90deg, #0f766e var(--tdb-score), #dbeafe 0),
          radial-gradient(circle at center, #fff 63%, transparent 64%);
        display: grid;
        place-items: center;
      }

      .tdb-score-center {
        width: 112px;
        height: 112px;
        border-radius: 50%;
        background: #fff;
        border: 1px solid #dbe7f4;
        display: grid;
        place-content: center;
        text-align: center;
        box-shadow: inset 0 0 0 1px #eef4fa;
      }

      .tdb-score-value {
        font-size: 30px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: -0.03em;
        color: #0f2948;
      }

      .tdb-score-label {
        margin-top: 6px;
        font-size: 10px;
        color: #5c7691;
        font-weight: 700;
      }

      .tdb-finance-line {
        text-align: center;
        color: #1e4064;
        font-size: 12px;
        font-weight: 700;
      }

      .tdb-kpis {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .tdb-kpi {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 9px;
      }

      .tdb-kpi-label {
        color: #607992;
        font-size: 11px;
        font-weight: 700;
      }

      .tdb-kpi-value {
        margin-top: 4px;
        font-size: 15px;
        font-weight: 800;
        color: #102c4b;
      }

      .tdb-kpi.is-indigo { border-color: #bfdbfe; background: #eff6ff; }
      .tdb-kpi.is-cyan { border-color: #a5f3fc; background: #ecfeff; }
      .tdb-kpi.is-amber { border-color: #fde68a; background: #fffbeb; }
      .tdb-kpi.is-green { border-color: #86efac; background: #f0fdf4; }
      .tdb-kpi.is-red { border-color: #fecaca; background: #fff1f2; }
      .tdb-kpi.is-neutral { border-color: #dbe7f4; background: #fff; }

      .tdb-toolbar {
        border: 1px solid var(--tdb-border);
        border-radius: 16px;
        background: #fff;
        box-shadow: var(--tdb-shadow);
        padding: 11px;
        margin-bottom: 12px;
      }

      .tdb-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tdb-chip {
        border: 1px solid #d2e3f2;
        border-radius: 999px;
        background: #fff;
        color: #1f4061;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .tdb-chip.is-active {
        border-color: #0ea5e9;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        color: #fff;
      }

      .tdb-chip.is-disabled {
        opacity: .55;
        cursor: default;
      }

      .tdb-search-row {
        margin-top: 10px;
        display: grid;
        gap: 8px;
        grid-template-columns: 1fr 240px;
      }

      .tdb-search-row input,
      .tdb-search-row select {
        width: 100%;
        border: 1px solid #d2e3f2;
        border-radius: 11px;
        padding: 10px 11px;
        background: #fff;
        color: #122f50;
        outline: none;
      }

      .tdb-search-row input:focus,
      .tdb-search-row select:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
      }

      .tdb-middle-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }

      .tdb-panel-h3 {
        margin: 0 0 9px;
        color: #123456;
        font-size: 17px;
        font-weight: 800;
      }

      .tdb-insights {
        display: grid;
        gap: 9px;
      }

      .tdb-insight {
        border-radius: 12px;
        border: 1px solid #dbe7f4;
        background: #fff;
        padding: 9px 10px;
      }

      .tdb-insight--warning {
        border-color: #fde68a;
        background: #fffbeb;
      }

      .tdb-insight--info {
        border-color: #bae6fd;
        background: #f0f9ff;
      }

      .tdb-insight--success {
        border-color: #bbf7d0;
        background: #f0fdf4;
      }

      .tdb-insight-title {
        color: #18385b;
        font-size: 13px;
        font-weight: 800;
      }

      .tdb-insight-body {
        margin-top: 4px;
        color: #5c7691;
        font-size: 12px;
      }

      .tdb-timeline {
        display: grid;
        gap: 8px;
      }

      .tdb-time-item {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 8px;
        display: grid;
        gap: 8px;
        grid-template-columns: 84px 1fr auto;
        align-items: center;
      }

      .tdb-time-hour {
        color: #12395f;
        font-size: 16px;
        font-weight: 900;
      }

      .tdb-time-status {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 800;
        color: #4b6784;
      }

      .tdb-time-title {
        color: #163e63;
        font-size: 13px;
        font-weight: 800;
      }

      .tdb-time-meta {
        margin-top: 3px;
        color: #5f7893;
        font-size: 12px;
      }

      .tdb-link-btn {
        border: 1px solid #d2e3f2;
        border-radius: 9px;
        padding: 6px 9px;
        background: #fff;
        color: #1e466b;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .tdb-board {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .tdb-board-col {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 9px;
      }

      .tdb-board-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .tdb-board-head h4 {
        margin: 0;
        color: #1a4064;
        font-size: 13px;
        font-weight: 800;
      }

      .tdb-chip-link {
        border: 1px solid #bfdbfe;
        border-radius: 999px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 12px;
        font-weight: 800;
        padding: 3px 8px;
        cursor: pointer;
      }

      .tdb-board-list {
        display: grid;
        gap: 7px;
      }

      .tdb-board-item {
        border: 1px solid #e6eef7;
        border-radius: 10px;
        background: #f9fcff;
        padding: 8px;
      }

      .tdb-board-title {
        color: #173e62;
        font-size: 12px;
        font-weight: 800;
      }

      .tdb-board-meta {
        margin-top: 3px;
        color: #5e7892;
        font-size: 11px;
      }

      .tdb-missions {
        display: grid;
        gap: 11px;
      }

      .tdb-mission-card {
        border: 1px solid #dbe7f4;
        border-radius: 14px;
        background: #fff;
        padding: 12px;
        box-shadow: 0 12px 30px rgba(11, 33, 58, 0.08);
        animation: tdb-fade-up .36s ease both;
      }

      .tdb-mission-card.is-pulse {
        animation: tdb-pulse 1s ease;
      }

      .tdb-mission-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .tdb-mission-ref {
        color: #0b4a6e;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .06em;
      }

      .tdb-mission-title {
        margin: 4px 0 0;
        color: #113659;
        font-size: 17px;
        line-height: 1.2;
        font-weight: 800;
      }

      .tdb-mission-meta {
        margin-top: 7px;
        display: grid;
        gap: 3px;
        color: #5c7690;
        font-size: 12px;
      }

      .tdb-mission-side {
        display: grid;
        gap: 6px;
        justify-items: end;
      }

      .tdb-status {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 800;
      }

      .tdb-status--pending { background: #eef2ff; color: #3730a3; }
      .tdb-status--progress { background: #fff7d6; color: #92400e; }
      .tdb-status--confirmed { background: #e0f2fe; color: #075985; }
      .tdb-status--done { background: #dcfce7; color: #166534; }
      .tdb-status--canceled { background: #fee2e2; color: #991b1b; }
      .tdb-status--unknown { background: #e2e8f0; color: #1f2937; }

      .tdb-priority {
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 800;
      }

      .tdb-priority--high { background: #fff1f2; color: #b91c1c; }
      .tdb-priority--medium { background: #ecfeff; color: #0f766e; }
      .tdb-priority--low { background: #f8fafc; color: #475569; }

      .tdb-health-row {
        margin-top: 10px;
      }

      .tdb-health-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .tdb-health-label {
        color: #5b7690;
        font-size: 12px;
        font-weight: 700;
      }

      .tdb-health-value {
        font-size: 13px;
        font-weight: 800;
      }

      .tdb-health-value.is-green { color: #15803d; }
      .tdb-health-value.is-cyan { color: #0369a1; }
      .tdb-health-value.is-amber { color: #b45309; }
      .tdb-health-value.is-red { color: #b91c1c; }

      .tdb-health-bar {
        margin-top: 6px;
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: #dbe7f4;
        overflow: hidden;
      }

      .tdb-health-bar span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #0ea5e9, #0f766e);
        border-radius: inherit;
      }

      .tdb-checks {
        margin-top: 7px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .tdb-check {
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 700;
      }

      .tdb-check.is-ok {
        border: 1px solid #86efac;
        background: #f0fdf4;
        color: #166534;
      }

      .tdb-check.is-miss {
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tdb-alert-inline {
        margin-top: 9px;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 700;
      }

      .tdb-alert-inline.is-red {
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tdb-alert-inline.is-amber {
        border: 1px solid #fde68a;
        background: #fffbeb;
        color: #92400e;
      }

      .tdb-mission-actions {
        margin-top: 10px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tdb-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border-radius: 10px;
        border: 1px solid #d2e3f2;
        padding: 8px 11px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .tdb-btn--ghost {
        background: #f8fbff;
        color: #163f63;
      }

      .tdb-btn--primary {
        border-color: #0284c7;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        color: #fff;
      }

      .tdb-btn--start {
        border-color: #0f766e;
        background: linear-gradient(180deg, #0f766e, #0b5f59);
        color: #fff;
      }

      .tdb-btn--done {
        border-color: #86efac;
        background: #f0fdf4;
        color: #166534;
        cursor: default;
      }

      .tdb-btn.is-disabled {
        opacity: .45;
        pointer-events: none;
      }

      .tdb-details {
        margin-top: 10px;
        border: 1px solid #e4edf7;
        border-radius: 10px;
        background: #f9fcff;
        padding: 10px;
      }

      .tdb-details-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tdb-info-cell {
        border: 1px solid #e4edf7;
        border-radius: 9px;
        background: #fff;
        padding: 8px;
      }

      .tdb-info-label {
        color: #5f7892;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .tdb-info-value {
        margin-top: 3px;
        color: #12375a;
        font-size: 12px;
      }

      .tdb-empty {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 18px;
        text-align: center;
      }

      .tdb-empty-title {
        color: #143a5e;
        font-size: 16px;
        font-weight: 800;
      }

      .tdb-empty-body {
        margin-top: 6px;
        color: #617b96;
      }

      .tdb-empty-inline {
        color: #607b96;
        font-size: 12px;
      }

      .tdb-skeleton {
        height: 160px;
        border-radius: 12px;
        border: 1px solid #dbe7f4;
        background: linear-gradient(90deg, #edf4fb 0%, #f7fbff 45%, #edf4fb 100%);
        background-size: 260px 100%;
        animation: tdb-shimmer 1.4s linear infinite;
      }

      .tdb-skeleton--sm {
        height: 94px;
      }

      .tdb-toasts {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 100001;
        display: grid;
        gap: 8px;
      }

      .tdb-toast {
        border-radius: 10px;
        padding: 10px 12px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 14px 30px rgba(11, 32, 54, 0.26);
      }

      .tdb-toast--success { background: #16a34a; }
      .tdb-toast--error { background: #dc2626; }
      .tdb-toast--warning { background: #d97706; }
      .tdb-toast--info { background: #2563eb; }

      .tdb-sheet {
        position: fixed;
        inset: 0;
        z-index: 100005;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .tdb-sheet[hidden] {
        display: none;
      }

      .tdb-sheet-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(9, 29, 48, 0.42);
      }

      .tdb-sheet-panel {
        position: relative;
        width: min(480px, calc(100vw - 20px));
        border: 1px solid #d2e3f2;
        border-radius: 14px;
        background: linear-gradient(180deg, #fff, #f7fbff);
        margin: 0 0 10px;
        padding: 12px;
        display: grid;
        gap: 8px;
        box-shadow: 0 16px 44px rgba(8, 29, 54, 0.26);
      }

      .tdb-sheet-title {
        color: #17395d;
        font-size: 14px;
        font-weight: 800;
      }

      .tdb-sheet-btn {
        width: 100%;
        border: 1px solid #d2e3f2;
        border-radius: 10px;
        background: #fff;
        text-align: left;
        padding: 10px;
        font-size: 13px;
        font-weight: 700;
        color: #15395d;
        cursor: pointer;
      }

      .tdb-sheet-cancel {
        background: #0f172a;
        border-color: #0f172a;
        color: #fff;
        text-align: center;
      }

      body.tdb-sheet-open {
        overflow: hidden;
      }

      @keyframes tdb-shimmer {
        from { background-position: -260px 0; }
        to { background-position: 260px 0; }
      }

      @keyframes tdb-fade-up {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes tdb-pulse {
        0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.35); }
        100% { box-shadow: 0 0 0 14px rgba(14, 165, 233, 0); }
      }

      @media (max-width: 1180px) {
        .tdb-top-grid {
          grid-template-columns: 1fr;
        }

        .tdb-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .tdb-middle-grid {
          grid-template-columns: 1fr;
        }

        .tdb-board {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 760px) {
        .tdb-shell {
          padding: 12px;
          border-radius: 18px;
        }

        .tdb-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .tdb-header-right {
          width: 100%;
          justify-content: space-between;
        }

        .tdb-search-row {
          grid-template-columns: 1fr;
        }

        .tdb-time-item {
          grid-template-columns: 1fr;
        }

        .tdb-time-left {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .tdb-mission-head {
          flex-direction: column;
        }

        .tdb-mission-side {
          justify-items: start;
          grid-auto-flow: column;
        }

        .tdb-details-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }
})();
