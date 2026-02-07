(() => {
  if (window.__techInterventionsLoaded) return;
  window.__techInterventionsLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    RUN_PAGE_PATH: "/extranet/technician/intervention-realisation",
    STORAGE_BUCKET: "interventions-files",
    ACTIVE_STORAGE_KEY: "mbl-active-intervention",
  };

  const STR = {
    title: "Mes interventions",
    subtitle: "Parcours terrain simplifie",
    countLabel: "interventions visibles",
    searchPlaceholder: "Rechercher client, reference, adresse...",
    filterAll: "Toutes",
    filterToday: "Aujourd'hui",
    filterUpcoming: "A venir",
    filterProgress: "En cours",
    filterDone: "Terminees",
    emptyTitle: "Aucune intervention a afficher",
    emptyBody: "Ajuste tes filtres ou reviens plus tard.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de charger les interventions. Recharge la page ou reessaie dans quelques minutes.",
    detailsCTA: "Details",
    callCTA: "Appeler",
    mapCTA: "Itineraire",
    pvCTA: "PV vierge",
    startCTA: "Demarrer",
    continueCTA: "Continuer",
    doneCTA: "Terminee",
    focusTitle: "Intervention en cours detectee",
    focusBody:
      "Tu dois terminer cette intervention avant d'en demarrer une autre. Utilise le bouton Continuer.",
    mapChooseTitle: "Choisir une application de navigation",
    mapPlans: "Plans",
    mapGoogle: "Google Maps",
    mapWaze: "Waze",
    mapCancel: "Annuler",
    toastStartOk: "Intervention demarree. Redirection vers le parcours.",
    toastStartError: "Impossible de demarrer l'intervention.",
    toastReloaded: "Liste actualisee.",
    toastSessionExpired: "Session expiree. Merci de te reconnecter.",
  };

  function findRoot() {
    return (
      document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".interventions-list")
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
    console.error("[TECH LIST] Root introuvable.");
    return;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  injectStyles();

  const els = renderShell(root);
  const state = {
    userId: null,
    items: [],
    search: "",
    filter: "all",
    activeId: loadActiveInterventionId(),
    isLoading: false,
  };

  let mapAddress = "";

  init();

  async function init() {
    wireBaseEvents();
    await loadAndRender("initial");
  }

  function wireBaseEvents() {
    els.search.addEventListener(
      "input",
      debounce(() => {
        state.search = norm(els.search.value || "");
        renderList();
      }, 120)
    );

    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        state.search = norm(els.search.value || "");
        renderList();
      }
      if (e.key === "Escape") {
        els.search.value = "";
        state.search = "";
        renderList();
      }
    });

    els.filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        state.filter = btn.dataset.filter || "all";
        els.filters.forEach((b) => b.classList.toggle("is-active", b === btn));
        renderList();
      });
    });

    els.refresh.addEventListener("click", async () => {
      await loadAndRender("manual");
      showToast("success", STR.toastReloaded);
    });

    els.sheet.addEventListener("click", (e) => {
      const target = e.target.closest("[data-map]");
      if (!target) return;
      openMapProvider(target.dataset.map || "google");
    });

    els.sheetClose.forEach((el) => {
      el.addEventListener("click", closeMapSheet);
    });
  }

  async function loadAndRender(mode) {
    setLoading(true);
    showBanner("", "");
    try {
      const user = await getCurrentUser();
      if (!user) {
        renderSessionExpired();
        showToast("error", STR.toastSessionExpired);
        return;
      }

      state.userId = user.id;
      const assignments = await fetchAssignments(user.id);
      state.items = normalizeAssignments(assignments);
      syncActiveIntervention();
      renderList();

      if (mode === "initial" && state.activeId) {
        showBanner("warning", `${STR.focusTitle} ${STR.focusBody}`);
      }
    } catch (error) {
      console.error("[TECH LIST] loadAndRender error:", error);
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

  async function fetchAssignments(userId) {
    const res = await supabase
      .from("intervention_assignees")
      .select("id, user_id, intervention_id, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (res.error) throw res.error;
    return res.data || [];
  }

  function normalizeAssignments(rows) {
    return rows
      .map((r) => {
        const itv = r?.interventions;
        if (!itv) return null;

        const ts = toTimestamp(itv.start_at);
        const status = canonicalStatus(itv.status);

        return {
          ...itv,
          assignment_id: r.id,
          _status: status,
          _startTs: ts,
          _search: norm([
            itv.internal_ref,
            itv.client_name,
            itv.title,
            itv.address,
            itv.support_phone,
          ].join(" ")),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aOpen = isOpenStatus(a._status) ? 0 : 1;
        const bOpen = isOpenStatus(b._status) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return (a._startTs || 0) - (b._startTs || 0);
      });
  }

  function renderList() {
    const activeItem = state.activeId
      ? state.items.find((i) => String(i.id) === String(state.activeId) && i._status === "in_progress")
      : null;

    const hasActive = Boolean(activeItem);
    setControlsDisabled(false);

    if (hasActive) {
      showBanner("warning", `${STR.focusTitle} ${STR.focusBody}`);
    } else {
      showBanner("", "");
    }

    const visibleItems = applyFilters(state.items);
    els.count.textContent = String(visibleItems.length);

    renderKpis(visibleItems, state.items);

    if (!visibleItems.length) {
      renderEmptyState();
      renderStickyBar(null);
      return;
    }

    els.list.innerHTML = "";
    visibleItems.forEach((item) => {
      els.list.appendChild(buildCard(item, hasActive, activeItem?.id || ""));
    });

    renderStickyBar(hasActive ? activeItem : null);
  }

  function renderKpis(filtered, allItems) {
    const today = filtered.filter((i) => isToday(i._startTs)).length;
    const inProgress = filtered.filter((i) => i._status === "in_progress").length;
    const done = filtered.filter((i) => i._status === "done").length;

    const overdue = filtered.filter((i) => {
      if (!isOpenStatus(i._status)) return false;
      if (!i._startTs) return false;
      return i._startTs < Date.now() && !isToday(i._startTs);
    }).length;

    els.kpis.innerHTML = `
      <article class="ti-kpi">
        <div class="ti-kpi-label">Total</div>
        <div class="ti-kpi-value">${filtered.length} / ${allItems.length}</div>
      </article>
      <article class="ti-kpi">
        <div class="ti-kpi-label">Aujourd'hui</div>
        <div class="ti-kpi-value">${today}</div>
      </article>
      <article class="ti-kpi">
        <div class="ti-kpi-label">En cours</div>
        <div class="ti-kpi-value">${inProgress}</div>
      </article>
      <article class="ti-kpi">
        <div class="ti-kpi-label">Terminees</div>
        <div class="ti-kpi-value">${done}</div>
      </article>
      <article class="ti-kpi">
        <div class="ti-kpi-label">En retard</div>
        <div class="ti-kpi-value">${overdue}</div>
      </article>
    `;
  }

  function buildCard(item, hasGlobalActive, activeInterventionId) {
    const card = document.createElement("article");
    card.className = "ti-card";
    card.dataset.id = item.id;

    const phone = normalizePhone(item.support_phone);
    const address = String(item.address || "").trim();
    const pvUrl = getPvUrl(item);

    const isDone = item._status === "done";
    const isCanceled = item._status === "canceled";
    const isInProgress = item._status === "in_progress";
    const isActiveCard = Boolean(activeInterventionId) && String(activeInterventionId) === String(item.id);
    const isLockedByOther = hasGlobalActive && !isActiveCard && !isDone && !isCanceled;

    const canStart = !isDone && !isCanceled && !isInProgress && !isLockedByOther;
    const canContinue = isInProgress;

    card.innerHTML = `
      <div class="ti-card-head">
        <div class="ti-card-main">
          <div class="ti-ref">${escapeHTML(item.internal_ref || "Sans reference")}</div>
          <div class="ti-title">${escapeHTML(item.client_name || "Client")} - ${escapeHTML(item.title || "Intervention")}</div>
          <div class="ti-meta">
            <span>${escapeHTML(formatDateFR(item.start_at) || "Date a definir")}</span>
            ${address ? `<span>${escapeHTML(address)}</span>` : ""}
          </div>
        </div>
        <div class="ti-badge ti-badge--${statusTone(item._status)}">${escapeHTML(statusLabel(item._status))}</div>
      </div>

      ${isLockedByOther ? `<div class="ti-lock">Cette intervention est verrouillee tant que l'intervention en cours n'est pas terminee.</div>` : ""}

      <div class="ti-actions">
        <a class="ti-btn ti-btn--ghost ${phone ? "" : "is-disabled"}" ${phone ? `href="tel:${phone}"` : ""}>${STR.callCTA}</a>
        <button class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="map" ${address ? "" : "disabled"}>${STR.mapCTA}</button>
        ${pvUrl ? `<a class="ti-btn ti-btn--ghost" href="${pvUrl}" target="_blank" rel="noopener" download>${STR.pvCTA}</a>` : ""}
        <button class="ti-btn ti-btn--ghost" data-action="details">${STR.detailsCTA}</button>
        ${canStart ? `<button class="ti-btn ti-btn--start" data-action="start">${STR.startCTA}</button>` : ""}
        ${canContinue ? `<a class="ti-btn ti-btn--primary" href="${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(item.id)}">${STR.continueCTA}</a>` : ""}
        ${isDone ? `<span class="ti-btn ti-btn--done">${STR.doneCTA}</span>` : ""}
      </div>

      <div class="ti-details" hidden>
        <div class="ti-grid">
          ${infoRow("Reference", item.internal_ref)}
          ${infoRow("Client", item.client_name)}
          ${infoRow("Intervention", item.title)}
          ${infoRow("Statut", statusLabel(item._status))}
          ${infoRow("Date", formatDateFR(item.start_at))}
          ${infoRow("Telephone", formatPhoneReadable(item.support_phone))}
          ${infoRow("Adresse", item.address)}
          ${infoRow("Infos", item.infos)}
        </div>
      </div>
    `;

    const detailsBtn = card.querySelector('[data-action="details"]');
    const detailsEl = card.querySelector(".ti-details");
    const startBtn = card.querySelector('[data-action="start"]');
    const mapBtn = card.querySelector('[data-action="map"]');

    detailsBtn?.addEventListener("click", () => {
      detailsEl.hidden = !detailsEl.hidden;
      detailsBtn.textContent = detailsEl.hidden ? STR.detailsCTA : "Masquer";
    });

    mapBtn?.addEventListener("click", () => {
      if (address) openMapSheet(address);
    });

    startBtn?.addEventListener("click", async () => {
      await startIntervention(item, startBtn);
    });

    return card;
  }

  async function startIntervention(item, btn) {
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "Demarrage...";

    try {
      const payload = { status: "in_progress" };
      if (hasField(item, "started_at")) payload.started_at = new Date().toISOString();

      const { error } = await supabase.from("interventions").update(payload).eq("id", item.id);
      if (error) throw error;

      saveActiveInterventionId(item.id);
      state.activeId = String(item.id);
      showToast("success", STR.toastStartOk);

      setTimeout(() => {
        window.location.href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(item.id)}`;
      }, 250);
    } catch (error) {
      console.error("[TECH LIST] startIntervention error:", error);
      showToast("error", `${STR.toastStartError} ${error?.message || ""}`.trim());
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  function applyFilters(items) {
    const q = state.search;

    return items
      .filter((item) => {
        if (q && !(item._search || "").includes(q)) return false;

        if (state.filter === "today") return isToday(item._startTs) && isOpenStatus(item._status);
        if (state.filter === "upcoming") return isUpcoming(item._startTs) && isOpenStatus(item._status);
        if (state.filter === "progress") return item._status === "in_progress";
        if (state.filter === "done") return item._status === "done";

        return true;
      })
      .sort((a, b) => {
        if (a._status === "done" && b._status !== "done") return 1;
        if (b._status === "done" && a._status !== "done") return -1;
        return (a._startTs || 0) - (b._startTs || 0);
      });
  }

  function renderStickyBar(activeItem) {
    if (!activeItem) {
      els.sticky.hidden = true;
      els.sticky.innerHTML = "";
      return;
    }

    const phone = normalizePhone(activeItem.support_phone);
    const address = String(activeItem.address || "").trim();

    els.sticky.hidden = false;
    els.sticky.innerHTML = `
      <div class="ti-sticky-inner">
        <a class="ti-btn ti-btn--primary" href="${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(activeItem.id)}">${STR.continueCTA}</a>
        <a class="ti-btn ti-btn--ghost ${phone ? "" : "is-disabled"}" ${phone ? `href="tel:${phone}"` : ""}>${STR.callCTA}</a>
        <button class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="sticky-map" ${address ? "" : "disabled"}>${STR.mapCTA}</button>
      </div>
    `;

    els.sticky.querySelector('[data-action="sticky-map"]')?.addEventListener("click", () => {
      if (address) openMapSheet(address);
    });
  }

  function setLoading(flag) {
    state.isLoading = flag;
    els.refresh.disabled = flag;

    if (flag) {
      els.list.innerHTML = `
        <div class="ti-skeleton"></div>
        <div class="ti-skeleton"></div>
        <div class="ti-skeleton"></div>
      `;
    }
  }

  function setControlsDisabled(disabled) {
    els.search.disabled = disabled;
    els.filters.forEach((f) => {
      f.disabled = disabled;
      f.classList.toggle("is-disabled", disabled);
    });
  }

  function renderEmptyState() {
    els.list.innerHTML = `
      <div class="ti-empty">
        <div class="ti-empty-title">${STR.emptyTitle}</div>
        <div class="ti-empty-body">${STR.emptyBody}</div>
      </div>
    `;
  }

  function renderSessionExpired() {
    showBanner("error", STR.toastSessionExpired);
    els.list.innerHTML = `
      <div class="ti-empty">
        <div class="ti-empty-title">Session expiree</div>
        <div class="ti-empty-body">Reconnecte-toi pour acceder a tes interventions.</div>
      </div>
    `;
    setControlsDisabled(true);
  }

  function renderErrorState(error) {
    showBanner("error", `${STR.errorTitle} ${error?.message ? `(${escapeHTML(error.message)})` : ""}`.trim());
    els.list.innerHTML = `
      <div class="ti-empty">
        <div class="ti-empty-title">${STR.errorTitle}</div>
        <div class="ti-empty-body">${STR.errorBody}</div>
      </div>
    `;
  }

  function showBanner(type, message) {
    els.banner.className = "ti-banner";
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
    toast.className = `ti-toast ti-toast--${type}`;
    toast.textContent = message;
    els.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function openMapSheet(address) {
    if (!address) return;
    mapAddress = address;
    els.sheet.hidden = false;
    document.body.classList.add("ti-sheet-open");
  }

  function closeMapSheet() {
    els.sheet.hidden = true;
    document.body.classList.remove("ti-sheet-open");
  }

  function openMapProvider(provider) {
    const url = buildMapUrl(provider, mapAddress);
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
    const inProgress = state.items.find((i) => i._status === "in_progress");
    if (inProgress) {
      state.activeId = String(inProgress.id);
      saveActiveInterventionId(inProgress.id);
      return;
    }

    if (state.activeId) {
      state.activeId = null;
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

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <section class="ti-shell">
        <header class="ti-header">
          <div>
            <div class="ti-eyebrow">${STR.subtitle}</div>
            <h1 class="ti-h1">${STR.title}</h1>
          </div>
          <div class="ti-head-right">
            <div class="ti-stat">
              <div class="ti-stat-value" data-ti-count>0</div>
              <div class="ti-stat-label">${STR.countLabel}</div>
            </div>
            <button type="button" class="ti-refresh" data-ti-refresh>Actualiser</button>
          </div>
        </header>

        <div class="ti-banner" data-ti-banner hidden></div>

        <section class="ti-toolbar">
          <div class="ti-filters">
            <button class="ti-chip is-active" data-filter="all">${STR.filterAll}</button>
            <button class="ti-chip" data-filter="today">${STR.filterToday}</button>
            <button class="ti-chip" data-filter="upcoming">${STR.filterUpcoming}</button>
            <button class="ti-chip" data-filter="progress">${STR.filterProgress}</button>
            <button class="ti-chip" data-filter="done">${STR.filterDone}</button>
          </div>
          <div class="ti-search-wrap">
            <input type="search" data-ti-search placeholder="${STR.searchPlaceholder}" />
          </div>
          <div class="ti-kpis" data-ti-kpis></div>
        </section>

        <div class="ti-list" data-ti-list></div>
        <div class="ti-toasts" data-ti-toasts></div>
        <div class="ti-sticky" data-ti-sticky hidden></div>

        <div class="ti-sheet" data-ti-sheet hidden>
          <div class="ti-sheet-backdrop" data-ti-sheet-close></div>
          <div class="ti-sheet-panel">
            <div class="ti-sheet-title">${STR.mapChooseTitle}</div>
            <button class="ti-sheet-btn" data-map="apple">${STR.mapPlans}</button>
            <button class="ti-sheet-btn" data-map="google">${STR.mapGoogle}</button>
            <button class="ti-sheet-btn" data-map="waze">${STR.mapWaze}</button>
            <button class="ti-sheet-btn ti-sheet-cancel" data-ti-sheet-close>${STR.mapCancel}</button>
          </div>
        </div>
      </section>
    `;

    return {
      list: rootEl.querySelector("[data-ti-list]"),
      count: rootEl.querySelector("[data-ti-count]"),
      search: rootEl.querySelector("[data-ti-search]"),
      filters: Array.from(rootEl.querySelectorAll("[data-filter]")),
      toasts: rootEl.querySelector("[data-ti-toasts]"),
      sticky: rootEl.querySelector("[data-ti-sticky]"),
      sheet: rootEl.querySelector("[data-ti-sheet]"),
      sheetClose: Array.from(rootEl.querySelectorAll("[data-ti-sheet-close]")),
      kpis: rootEl.querySelector("[data-ti-kpis]"),
      banner: rootEl.querySelector("[data-ti-banner]"),
      refresh: rootEl.querySelector("[data-ti-refresh]"),
    };
  }

  function injectStyles() {
    if (document.getElementById("ti-list-styles-v2")) return;

    const style = document.createElement("style");
    style.id = "ti-list-styles-v2";
    style.textContent = `
      .ti-shell {
        font-family: "Manrope", sans-serif;
        color: #10233f;
        background:
          radial-gradient(900px 420px at 8% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
          radial-gradient(860px 470px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
          linear-gradient(180deg, #f4f8fc, #edf4fb);
        border: 1px solid #d6e2ee;
        border-radius: 18px;
        padding: 16px;
      }

      .ti-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        margin-bottom: 12px;
      }

      .ti-eyebrow {
        color: #55708c;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .ti-h1 {
        margin: 0;
        color: #143a61;
        font-size: 25px;
        line-height: 1.1;
        font-weight: 800;
      }

      .ti-head-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .ti-stat {
        border: 1px solid #0f766e;
        border-radius: 12px;
        padding: 8px 12px;
        background: linear-gradient(180deg, #0f766e, #0c5f59);
        color: #fff;
        text-align: center;
        min-width: 90px;
      }

      .ti-stat-value { font-size: 19px; font-weight: 800; }
      .ti-stat-label { font-size: 10px; font-weight: 700; opacity: .86; text-transform: uppercase; letter-spacing: .06em; }

      .ti-refresh {
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 10px 12px;
        background: #fff;
        color: #0c4a6e;
        font-weight: 800;
        cursor: pointer;
      }

      .ti-banner {
        margin-bottom: 12px;
        border: 1px solid #dbeafe;
        background: #eff6ff;
        color: #1e3a8a;
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .ti-banner.is-warning {
        border-color: #fcd34d;
        background: #fffbeb;
        color: #92400e;
      }

      .ti-banner.is-error {
        border-color: #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .ti-toolbar {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffffff, #f7fbff);
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        padding: 12px;
        margin-bottom: 12px;
      }

      .ti-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .ti-chip {
        border: 1px solid #cfdeeb;
        border-radius: 999px;
        background: #fff;
        color: #1f3f62;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .ti-chip.is-active {
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        border-color: #0284c7;
        color: #fff;
      }

      .ti-chip.is-disabled { opacity: .55; cursor: not-allowed; }

      .ti-search-wrap {
        margin-top: 10px;
      }

      .ti-search-wrap input {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 12px;
        background: #fff;
        color: #10233f;
        outline: none;
        padding: 10px 12px;
      }

      .ti-search-wrap input:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .ti-kpis {
        margin-top: 10px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .ti-kpi {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fff;
        padding: 8px;
      }

      .ti-kpi-label { color: #55708c; font-size: 11px; font-weight: 700; margin-bottom: 4px; }
      .ti-kpi-value { color: #143a61; font-size: 15px; font-weight: 800; }

      .ti-list { display: grid; gap: 12px; }

      .ti-card {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #fff;
        padding: 14px;
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        display: grid;
        gap: 10px;
      }

      .ti-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      .ti-ref {
        color: #0c4a6e;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 4px;
      }

      .ti-title { color: #143a61; font-size: 16px; font-weight: 800; }

      .ti-meta {
        color: #5b7490;
        font-size: 12px;
        margin-top: 5px;
        display: grid;
        gap: 3px;
      }

      .ti-badge {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .ti-badge--planned,
      .ti-badge--pending { background: #eef2ff; color: #3730a3; }
      .ti-badge--in_progress { background: #fff7d6; color: #92400e; }
      .ti-badge--confirmed { background: #e0f2fe; color: #075985; }
      .ti-badge--done { background: #dcfce7; color: #166534; }
      .ti-badge--canceled { background: #fee2e2; color: #991b1b; }
      .ti-badge--unknown { background: #e2e8f0; color: #1f2937; }

      .ti-lock {
        border: 1px dashed #f59e0b;
        background: #fffbeb;
        color: #92400e;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 700;
      }

      .ti-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .ti-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .ti-btn--ghost { background: #f8fbff; color: #123b60; }
      .ti-btn--primary {
        border-color: #0ea5e9;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        color: #fff;
      }

      .ti-btn--start {
        border-color: #0f766e;
        background: linear-gradient(180deg, #0f766e, #0d5d57);
        color: #fff;
      }

      .ti-btn--done {
        border-color: #16a34a;
        background: #dcfce7;
        color: #166534;
      }

      .ti-btn.is-disabled { opacity: .45; pointer-events: none; }

      .ti-details {
        border: 1px solid #e3ecf5;
        border-radius: 10px;
        background: #f8fbff;
        padding: 10px;
      }

      .ti-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .ti-info-label { color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .ti-info-value { color: #0f2947; font-size: 13px; margin-top: 3px; }

      .ti-empty {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #fff;
        padding: 20px;
        text-align: center;
      }

      .ti-empty-title { color: #143a61; font-size: 16px; font-weight: 800; }
      .ti-empty-body { color: #5a7490; margin-top: 6px; }

      .ti-skeleton {
        height: 138px;
        border-radius: 14px;
        border: 1px solid #d6e2ee;
        background: linear-gradient(90deg, #eef3f9 0%, #f8fbff 50%, #eef3f9 100%);
        background-size: 240px 100%;
        animation: ti-shimmer 1.4s infinite linear;
      }

      @keyframes ti-shimmer {
        from { background-position: -240px 0; }
        to { background-position: 240px 0; }
      }

      .ti-toasts {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 100001;
        display: grid;
        gap: 8px;
      }

      .ti-toast {
        border-radius: 10px;
        padding: 10px 12px;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 12px 30px rgba(12, 37, 66, 0.30);
      }

      .ti-toast--success { background: #16a34a; }
      .ti-toast--error { background: #dc2626; }
      .ti-toast--warning { background: #d97706; }

      .ti-sticky {
        position: sticky;
        bottom: 10px;
        z-index: 7;
      }

      .ti-sticky-inner {
        margin-top: 6px;
        border: 1px solid #0f172a;
        border-radius: 12px;
        background: #0f172a;
        padding: 10px;
        display: flex;
        gap: 8px;
        justify-content: center;
      }

      .ti-sheet {
        position: fixed;
        inset: 0;
        z-index: 100005;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .ti-sheet[hidden] { display: none; }

      .ti-sheet-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 31, 53, 0.42);
      }

      .ti-sheet-panel {
        position: relative;
        width: min(460px, calc(100vw - 20px));
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: linear-gradient(180deg, #fff, #f7fbff);
        padding: 12px;
        margin: 0 0 10px;
        display: grid;
        gap: 8px;
        box-shadow: 0 16px 44px rgba(12, 37, 66, 0.24);
      }

      .ti-sheet-title {
        color: #143a61;
        font-size: 14px;
        font-weight: 800;
      }

      .ti-sheet-btn {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        background: #fff;
        padding: 10px;
        text-align: left;
        color: #10233f;
        font-weight: 700;
        cursor: pointer;
      }

      .ti-sheet-cancel {
        background: #0f172a;
        border-color: #0f172a;
        color: #fff;
        text-align: center;
      }

      body.ti-sheet-open { overflow: hidden; }

      @media (max-width: 980px) {
        .ti-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .ti-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .ti-head-right {
          width: 100%;
          justify-content: space-between;
        }

        .ti-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function infoRow(label, value) {
    if (!value) return "";
    return `
      <div class="ti-info">
        <div class="ti-info-label">${escapeHTML(label)}</div>
        <div class="ti-info-value">${escapeHTML(String(value))}</div>
      </div>
    `;
  }

  function statusLabel(status) {
    if (status === "planned") return "Planifiee";
    if (status === "pending") return "En attente";
    if (status === "in_progress") return "En cours";
    if (status === "confirmed") return "Confirmee";
    if (status === "done") return "Terminee";
    if (status === "canceled") return "Annulee";
    return "Statut inconnu";
  }

  function statusTone(status) {
    if (["planned", "pending"].includes(status)) return "pending";
    if (status === "in_progress") return "in_progress";
    if (status === "confirmed") return "confirmed";
    if (status === "done") return "done";
    if (status === "canceled") return "canceled";
    return "unknown";
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

  function isUpcoming(ts) {
    if (!ts) return false;
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    return ts > endOfToday;
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

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

  function hasField(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key);
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
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
})();
