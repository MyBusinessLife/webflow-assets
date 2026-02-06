(() => {
  if (window.__techInterventionsListLoaded) return;
  window.__techInterventionsListLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    RUN_PAGE_PATH: "/extranet/technician/intervention-realisation",
    STORAGE_BUCKET: "interventions-files",

    STATUS_DONE: "done",
    STATUS_IN_PROGRESS: "in_progress"
  };

  let supabase = window.__MBL_SUPABASE__ || window.__techSupabase;
  if (!supabase) {
    supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth"
      }
    });
    window.__techSupabase = supabase;
  }

  const STR = {
    title: "Mes interventions",
    subtitle: "Suivi terrain et validation rapide",
    countLabel: "assignees",
    searchPlaceholder: "Rechercher client, titre, adresse",
    emptyTitle: "Aucune intervention",
    emptyBody: "Tu n'as pas d'interventions assignees pour le moment.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer les interventions. Reessaye plus tard.",
    detailsCTA: "Fiche",
    callCTA: "Appeler",
    mapCTA: "Itineraire",
    pvCTA: "PV vierge",
    startCTA: "Demarrer",
    flowCTA: "Parcours",
    mapChooseTitle: "Choisir une app",
    mapPlans: "Plans",
    mapGoogle: "Google Maps",
    mapWaze: "Waze",
    mapCancel: "Annuler",
    focusTitle: "Intervention en cours",
    focusBody: "Termine l'intervention en cours pour acceder aux autres."
  };

  const root = findRoot();
  if (!root) return;

  if (!window.supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  injectStyles();

  let mapAddress = "";

  const els = renderShell(root);
  const state = {
    items: [],
    filter: "all",
    search: "",
    userId: null,
    activeId: loadActiveId()
  };

  init();

  async function init() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return;

    showSkeleton(els.list);

    try {
      state.userId = authData.user.id;
      const data = await fetchAssignments(state.userId);
      state.items = normalizeAssignments(data);
      syncActiveId();
      renderList();
    } catch (e) {
      renderError(els.list);
    }
  }

  async function fetchAssignments(userId) {
    const res = await supabase
      .from("intervention_assignees")
      .select("id, intervention_id, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (res.error) throw res.error;
    return res.data || [];
  }

  function normalizeAssignments(data) {
    return (data || []).map((i) => i.interventions).filter(Boolean);
  }

  function renderList() {
    syncActiveId();

    const activeRow = state.activeId
      ? state.items.find(
          (r) =>
            String(r.id) === String(state.activeId) &&
            String(r.status || "").toLowerCase() === CONFIG.STATUS_IN_PROGRESS
        )
      : null;

    const focus = !!activeRow;
    root.classList.toggle("ti-focus-mode", focus);
    els.focus.hidden = !focus;
    if (focus) {
      els.focusTitle.textContent = STR.focusTitle;
      els.focusBody.textContent = STR.focusBody;
    }
    setControlsDisabled(focus);

    const listData = focus ? [activeRow] : filterItems(state.items);
    els.count.textContent = String(listData.length);

    if (!listData.length) {
      renderEmpty(els.list);
      return;
    }

    els.list.innerHTML = "";
    listData.forEach((row) => {
      const card = buildCard(row);
      els.list.appendChild(card);
    });

    renderStickyBar(listData[0]);
  }

  function buildCard(row) {
    const card = document.createElement("article");
    card.className = "ti-card";
    card.dataset.id = row.id;
  
    const status = String(row.status || "").toLowerCase();
    const isDone = isDoneStatus(status);
    const isCanceled = status === "canceled";
    const isStarted = isStartedStatus(status) || !!row.started_at;
  
    const statusLabel = getStatusLabel(row.status);
    const statusTone = getStatusTone(row.status);
    const dateLabel = formatDateFR(row.start_at) || "Date a definir";
    const clientTitle = `${row.client_name || "Client"} - ${row.title || "Intervention"}`;
  
    const phoneNormalized = normalizePhone(row.support_phone);
    const phoneReadable = formatPhoneReadable(row.support_phone);
    const address = row.address ? String(row.address).trim() : "";
  
    const pvUrl = getPvUrl(row);
    const remuneration = formatMoney(getFieldValue(row, CONFIG.REMUNERATION_FIELD));
    const description = getFirstText(row, ["description", "notes_tech", "tech_notes", "notes", "problem", "issue"]);
    const startedAt = row.started_at ? formatDateFR(row.started_at) : "";
    const completedAt = row.completed_at ? formatDateFR(row.completed_at) : "";
  
    const showStart = !isStarted && !isDone && !isCanceled;
    const showFlow = isStarted && !isDone && !isCanceled;
  
    card.innerHTML = `
      <div class="ti-card-head">
        <div class="ti-card-main">
          <div class="ti-title">${escapeHTML(clientTitle)}</div>
          <div class="ti-meta">
            <span class="ti-meta-item">${escapeHTML(dateLabel)}</span>
            ${address ? `<span class="ti-meta-item">${escapeHTML(address)}</span>` : ""}
          </div>
        </div>
        <div class="ti-badge ti-badge--${statusTone}">${escapeHTML(statusLabel)}</div>
      </div>
  
      <div class="ti-actions">
        <a class="ti-btn ti-btn--ghost ${phoneNormalized ? "" : "is-disabled"}" data-action="call" ${phoneNormalized ? `href="tel:${phoneNormalized}"` : ""}>${STR.callCTA}</a>
        <button class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="map" ${address ? "" : "disabled"}>${STR.mapCTA}</button>
        ${pvUrl ? `<a class="ti-btn ti-btn--ghost" href="${pvUrl}" target="_blank" rel="noopener" download>${STR.pvCTA}</a>` : ""}
        <button class="ti-btn ti-btn--ghost" data-action="toggle-details">${STR.detailsCTA}</button>
        ${showStart ? `<button class="ti-btn ti-btn--start" data-action="start">${STR.startCTA}</button>` : ""}
        ${showFlow ? `<a class="ti-btn ti-btn--primary" href="${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(row.id)}">${STR.flowCTA}</a>` : ""}
      </div>
  
      <div class="ti-details" hidden>
        <div class="ti-grid">
          ${infoRow("Client", row.client_name)}
          ${infoRow("Intervention", row.title)}
          ${infoRow("Statut", statusLabel)}
          ${infoRow("Date", dateLabel)}
          ${infoRow("Adresse", address)}
          ${infoRow("Telephone", phoneReadable)}
          ${infoRow("Remuneration", remuneration)}
          ${infoRow("Demarree", startedAt)}
          ${infoRow("Terminee", completedAt)}
          ${infoRow("Contact", pickFirst(row, ["contact_name", "client_contact", "contact"]))}
          ${infoRow("Telephone contact", pickFirst(row, ["contact_phone", "client_phone", "phone_contact"]))}
          ${infoRow("Email contact", pickFirst(row, ["contact_email", "client_email", "email_contact"]))}
          ${infoRow("Consignes", description)}
          ${infoRow("Acces", buildAccessInfo(row))}
          ${infoRow("Materiel", buildEquipmentInfo(row))}
          ${pvUrl ? infoRow("PV vierge", `<a class="ti-link" href="${pvUrl}" target="_blank" rel="noopener">${STR.pvCTA}</a>`, true) : ""}
        </div>
      </div>
    `;
  
    const detailsBtn = card.querySelector('[data-action="toggle-details"]');
    const startBtn = card.querySelector('[data-action="start"]');
    const mapBtn = card.querySelector('[data-action="map"]');
    const detailsPanel = card.querySelector(".ti-details");
  
    if (detailsBtn) {
      detailsBtn.addEventListener("click", () => {
        detailsPanel.hidden = !detailsPanel.hidden;
      });
    }
  
    if (startBtn) {
      startBtn.addEventListener("click", () => startIntervention(row, startBtn));
    }
  
    if (mapBtn && !mapBtn.disabled) {
      mapBtn.addEventListener("click", () => openMapSheet(address));
    }
  
    return card;
  }


  async function startIntervention(row, btn) {
    btn.disabled = true;
    btn.textContent = "Demarrage...";
  
    const startedAt = new Date().toISOString();
    const payload = { status: CONFIG.STATUS_IN_PROGRESS };
    if (hasField(row, "started_at")) payload.started_at = startedAt;
  
    const res = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", row.id);
  
    if (res.error) {
      showToast("error", res.error.message || STR.toastStartError);
      btn.disabled = false;
      btn.textContent = STR.startCTA;
      return;
    }
  
    setActiveId(row.id);
    setStep(row.id, 1);
  
    const idx = state.items.findIndex((x) => x.id === row.id);
    if (idx > -1) {
      state.items[idx].status = CONFIG.STATUS_IN_PROGRESS;
      if (hasField(row, "started_at")) state.items[idx].started_at = startedAt;
    }
  
    showToast("success", STR.toastStart);
  
    // redirection vers la page de réalisation
    window.location.href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(row.id)}`;
  }


  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <div class="ti-shell">
        <div class="ti-header">
          <div>
            <div class="ti-eyebrow">${STR.subtitle}</div>
            <div class="ti-h1">${STR.title}</div>
          </div>
          <div class="ti-stat">
            <div class="ti-stat-value" data-ti-count>0</div>
            <div class="ti-stat-label">${STR.countLabel}</div>
          </div>
        </div>

        <div class="ti-focus" data-ti-focus hidden>
          <div class="ti-focus-title" data-ti-focus-title>${STR.focusTitle}</div>
          <div class="ti-focus-body" data-ti-focus-body>${STR.focusBody}</div>
        </div>

        <div class="ti-controls">
          <div class="ti-filters">
            <button class="ti-chip is-active" data-ti-filter="all">Toutes</button>
            <button class="ti-chip" data-ti-filter="today">Aujourdhui</button>
            <button class="ti-chip" data-ti-filter="upcoming">A venir</button>
            <button class="ti-chip" data-ti-filter="done">Terminees</button>
          </div>
          <div class="ti-search">
            <input type="search" data-ti-search placeholder="${STR.searchPlaceholder}" />
          </div>
        </div>

        <div class="ti-list" data-ti-list></div>
        <div class="ti-toasts" data-ti-toasts></div>

        <div class="ti-sticky" data-ti-sticky></div>

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
      </div>
    `;

    const list = rootEl.querySelector("[data-ti-list]");
    const count = rootEl.querySelector("[data-ti-count]");
    const search = rootEl.querySelector("[data-ti-search]");
    const filters = Array.from(rootEl.querySelectorAll("[data-ti-filter]"));
    const sheet = rootEl.querySelector("[data-ti-sheet]");
    const sheetClose = Array.from(rootEl.querySelectorAll("[data-ti-sheet-close]"));
    const focus = rootEl.querySelector("[data-ti-focus]");
    const focusTitle = rootEl.querySelector("[data-ti-focus-title]");
    const focusBody = rootEl.querySelector("[data-ti-focus-body]");
    const sticky = rootEl.querySelector("[data-ti-sticky]");
    const toasts = rootEl.querySelector("[data-ti-toasts]");

    filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        filters.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filter = btn.dataset.tiFilter;
        renderList();
      });
    });

    search.addEventListener("input", () => {
      if (search.disabled) return;
      state.search = search.value || "";
      renderList();
    });

    sheet.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-map]");
      if (!btn) return;
      openMapProvider(btn.dataset.map);
    });

    sheetClose.forEach((el) => el.addEventListener("click", closeMapSheet));

    return { list, count, search, filters, sheet, focus, focusTitle, focusBody, sticky, toasts };
  }

  function filterItems(items) {
    const q = state.search.trim().toLowerCase();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return items.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      const isDone = status === "done";
      const isCanceled = status === "canceled";
      const isOpen = !isDone && !isCanceled;

      const date = row.start_at ? new Date(row.start_at) : null;
      const isToday = date && date >= startOfDay && date <= endOfDay;
      const isUpcoming = date && date > endOfDay;
      const isOverdue = date && date <= now && isOpen;

      if (state.filter === "done") return isDone;
      if (state.filter === "today") return isToday || isOverdue || (isOpen && !date);
      if (state.filter === "upcoming") return isUpcoming && isOpen;

      if (!q) return true;

      const hay = [row.client_name, row.title, row.address, row.support_phone].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function renderStickyBar(row) {
    if (!row || !state.activeId) {
      els.sticky.innerHTML = "";
      els.sticky.hidden = true;
      return;
    }

    const phone = normalizePhone(row.support_phone);
    const address = row.address ? String(row.address).trim() : "";

    els.sticky.hidden = false;
    els.sticky.innerHTML = `
      <div class="ti-sticky-inner">
        <a class="ti-btn ti-btn--primary ${phone ? "" : "is-disabled"}" ${phone ? `href="tel:${phone}"` : ""}>${STR.callCTA}</a>
        <button class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="map-sticky">${STR.mapCTA}</button>
      </div>
    `;

    const mapBtn = els.sticky.querySelector("[data-action='map-sticky']");
    if (mapBtn && address) mapBtn.addEventListener("click", () => openMapSheet(address));
  }

  function syncActiveId() {
    const inProgress = state.items.find(
      (r) => String(r.status || "").toLowerCase() === CONFIG.STATUS_IN_PROGRESS
    );
    if (inProgress) {
      setActiveId(inProgress.id);
      return;
    }
    setActiveId(null);
  }

  function showSkeleton(listEl) {
    listEl.innerHTML = `<div class="ti-skeleton"></div><div class="ti-skeleton"></div><div class="ti-skeleton"></div>`;
  }

  function renderEmpty(listEl) {
    listEl.innerHTML = `
      <div class="ti-empty">
        <div class="ti-empty-title">${STR.emptyTitle}</div>
        <div class="ti-empty-body">${STR.emptyBody}</div>
      </div>
    `;
  }

  function renderError(listEl) {
    listEl.innerHTML = `
      <div class="ti-empty">
        <div class="ti-empty-title">${STR.errorTitle}</div>
        <div class="ti-empty-body">${STR.errorBody}</div>
      </div>
    `;
  }

  function setControlsDisabled(disabled) {
    els.search.disabled = disabled;
    els.filters.forEach((f) => {
      f.disabled = disabled;
      f.classList.toggle("is-disabled", disabled);
    });
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
    const q = encodeURIComponent(String(mapAddress).trim());
    let url = "";
    if (provider === "apple") url = `https://maps.apple.com/?daddr=${q}`;
    if (provider === "google") url = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    if (provider === "waze") url = `https://waze.com/ul?q=${q}&navigate=yes`;
    if (url) window.open(url, "_blank");
    closeMapSheet();
  }

  function getPvUrl(row) {
    const keys = ["pv_blank_url", "pv_url", "pv", "pv_file", "pv_blank", "pv_blank_path", "pv_path"];
    for (const k of keys) {
      const v = row?.[k];
      if (!v) continue;
      if (typeof v === "string") {
        if (/^https?:\/\//i.test(v)) return v;
        const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(String(v));
        return data?.publicUrl || "";
      }
      if (typeof v === "object") {
        if (v.url) return v.url;
        if (v.path) {
          const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(String(v.path));
          return data?.publicUrl || "";
        }
      }
    }
    return "";
  }

  function loadActiveId() {
    try { return localStorage.getItem(CONFIG.ACTIVE_STORAGE_KEY) || null; }
    catch (_) { return null; }
  }

  function setActiveId(id) {
    state.activeId = id || null;
    try {
      if (id) localStorage.setItem(CONFIG.ACTIVE_STORAGE_KEY, String(id));
      else localStorage.removeItem(CONFIG.ACTIVE_STORAGE_KEY);
    } catch (_) {}
  }

  function formatDateFR(value) {
    if (!value) return "";
    let s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(" ", "T");
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(d);
  }

  function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("00")) p = "+" + p.slice(2);
    if (/^0\d{9}$/.test(p)) p = "+33" + p.slice(1);
    return p || null;
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function infoRow(label, value, isHtml = false) {
    if (!value) return "";
    const safeLabel = escapeHTML(label);
    const safeValue = isHtml ? value : escapeHTML(value);
    return `<div class="ti-info"><div class="ti-label">${safeLabel}</div><div class="ti-value">${safeValue}</div></div>`;
  }

  function injectStyles() {
    if (document.getElementById("ti-styles")) return;
    const style = document.createElement("style");
    style.id = "ti-styles";
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');
.ti-shell{font-family:"Manrope",sans-serif;background:radial-gradient(1200px 600px at 10% -10%, #e3f2ff 0%, #f6f7fb 55%, #f6f7fb 100%);color:#0f172a;padding:20px;border-radius:18px}
.ti-header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px}
.ti-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.ti-h1{font-family:"Space Grotesk",sans-serif;font-size:26px;font-weight:700}
.ti-stat{background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:14px;text-align:center}
.ti-stat-value{font-size:20px;font-weight:700}
.ti-stat-label{font-size:11px;text-transform:uppercase;opacity:.8;letter-spacing:.08em}
.ti-focus{background:#fff7ed;border:1px solid #fed7aa;padding:12px 14px;border-radius:12px;margin-bottom:14px}
.ti-focus-title{font-weight:700}
.ti-focus-body{font-size:13px;color:#9a3412}
.ti-controls{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:16px}
.ti-filters{display:flex;flex-wrap:wrap;gap:8px}
.ti-chip{border:1px solid #cbd5f5;background:#fff;color:#1e293b;padding:8px 12px;border-radius:999px;font-size:13px;cursor:pointer}
.ti-chip.is-active{background:#0ea5e9;border-color:#0ea5e9;color:#fff}
.ti-chip.is-disabled{opacity:.5;cursor:not-allowed}
.ti-search input{width:100%;border:1px solid #cbd5f5;border-radius:12px;padding:10px 12px;font-size:14px}
.ti-list{display:grid;gap:14px}
.ti-card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);display:grid;gap:12px}
.ti-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.ti-title{font-size:16px;font-weight:600}
.ti-meta{margin-top:6px;display:grid;gap:4px;font-size:12px;color:#64748b}
.ti-meta-item{display:block}
.ti-badge{font-size:11px;padding:6px 10px;border-radius:999px;font-weight:600;white-space:nowrap}
.ti-badge--success{background:#dcfce7;color:#166534}
.ti-badge--warning{background:#fef9c3;color:#854d0e}
.ti-badge--danger{background:#fee2e2;color:#991b1b}
.ti-badge--info{background:#e0f2fe;color:#075985}
.ti-badge--neutral{background:#e2e8f0;color:#1e293b}
.ti-actions{display:flex;flex-wrap:wrap;gap:8px}
.ti-btn{border:none;padding:8px 12px;border-radius:10px;font-size:13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ti-btn--ghost{background:#f1f5f9;color:#0f172a}
.ti-btn--primary{background:#0ea5e9;color:#fff}
.ti-btn--start{background:#0f766e;color:#fff}
.ti-btn.is-disabled{opacity:.4;pointer-events:none}
.ti-details{background:#f8fafc;border-radius:12px;padding:12px}
.ti-grid{display:grid;gap:8px}
.ti-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
.ti-value{font-size:14px}
.ti-toasts{position:sticky;bottom:16px;display:grid;gap:8px;margin-top:16px}
.ti-sheet{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center}
.ti-sheet[hidden]{display:none}
.ti-sheet-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45)}
.ti-sheet-panel{position:relative;width:min(480px,92vw);background:#fff;border-radius:16px;padding:16px;margin:0 12px 12px;display:grid;gap:10px;box-shadow:0 20px 60px rgba(15,23,42,.2)}
.ti-sheet-title{font-weight:700;font-size:14px;color:#0f172a}
.ti-sheet-btn{width:100%;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;font-size:14px;cursor:pointer}
.ti-sheet-cancel{background:#0f172a;color:#fff;border-color:#0f172a;text-align:center}
body.ti-sheet-open{overflow:hidden}
.ti-sticky{position:sticky;bottom:12px;z-index:5}
.ti-sticky-inner{display:flex;gap:8px;justify-content:center;background:#0f172a;color:#fff;padding:10px;border-radius:14px}
.ti-empty{background:#fff;padding:20px;border-radius:16px;text-align:center;color:#475569}
.ti-empty-title{font-weight:600}
.ti-skeleton{height:140px;border-radius:16px;background:linear-gradient(90deg,#edf2f7 0%,#f8fafc 50%,#edf2f7 100%);animation:shimmer 1.4s infinite}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
@media (min-width:768px){.ti-controls{grid-template-columns:1fr 280px;align-items:center}}
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".interventions-list");
  }

  function getStatusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "planned") return "Planifiée";
    if (s === "pending") return "En attente";
    if (s === "in_progress") return "En cours";
    if (s === "confirmed") return "Confirmée";
    if (s === "done") return "Terminée";
    if (s === "canceled") return "Annulee";
    return status ? capitalize(status) : "À faire";
  }
  
  function getStatusTone(status) {
    const s = String(status || "").toLowerCase();
    if (s === "done") return "success";
    if (s === "in_progress") return "warning";
    if (s === "confirmed") return "info";
    if (s === "canceled") return "danger";
    return "neutral";
  }

})();
