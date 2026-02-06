document.documentElement.setAttribute("data-page","admin-interventions");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const supabase = window.__MBL_SUPABASE__;
  if (!supabase) {
    console.error("❌ [ADMIN INTERVENTIONS] Supabase global introuvable. Vérifie que le protect global est bien chargé.");
    return;
  }

  const USER_CFG = window.__MBL_CFG__ || {};
  const CONFIG = {
    BUCKET: USER_CFG.BUCKET || "interventions-files",
    SIGNED_URL_TTL: USER_CFG.SIGNED_URL_TTL || 3600,
    PRODUCTS_TABLE: USER_CFG.PRODUCTS_TABLE || "products",
  };

  const PAGE_INTERVENTION = "/intervention";

  const STATUS_OPTIONS = [
    "Planifiée",
    "En attente",
    "En cours",
    "Confirmée",
    "Terminée",
    "Annulée"
  ];

  const STATUS_CANONICAL_DB = {
    planned: "planned",
    planifiee: "planned",
    "planifiée": "planned",
    pending: "pending",
    en_attente: "pending",
    "en attente": "pending",
    in_progress: "in_progress",
    inprogress: "in_progress",
    "in progress": "in_progress",
    encours: "in_progress",
    confirmed: "confirmed",
    done: "done",
    completed: "done",
    terminee: "done",
    "terminée": "done",
    canceled: "canceled",
    cancelled: "canceled",
    annulee: "canceled",
    "annulée": "canceled",
  };

  const STATUS_MAP = {
    planned:     { label: "Planifiée",  cls: "is-planned" },
    planifiee:   { label: "Planifiée",  cls: "is-planned" },
    "planifiée": { label: "Planifiée",  cls: "is-planned" },
    pending:      { label: "En attente", cls: "is-pending" },
    en_attente:   { label: "En attente", cls: "is-pending" },
    "en attente": { label: "En attente", cls: "is-pending" },
    in_progress:   { label: "En cours",   cls: "is-progress" },
    inprogress:    { label: "En cours",   cls: "is-progress" },
    "in progress": { label: "En cours",   cls: "is-progress" },
    encours:       { label: "En cours",   cls: "is-progress" },
    confirmed:   { label: "Confirmée",  cls: "is-progress" },
    done:        { label: "Terminée",   cls: "is-done" },
    completed:   { label: "Terminée",   cls: "is-done" },
    terminee:    { label: "Terminée",   cls: "is-done" },
    "terminée":  { label: "Terminée",   cls: "is-done" },
    canceled:    { label: "Annulée",    cls: "is-canceled" },
    cancelled:   { label: "Annulée",    cls: "is-canceled" },
    annulee:     { label: "Annulée",    cls: "is-canceled" },
    "annulée":   { label: "Annulée",    cls: "is-canceled" },
  };

  const COMP_STATUS_SUGGESTIONS = [
    "earned",
    "approved",
    "invoiced",
    "paid",
    "canceled"
  ];

  const EXPENSE_TYPES = [
    { value: "material", label: "Produit", usesProduct: true },
    { value: "travel", label: "Frais déplacement", usesProduct: false },
    { value: "subcontract", label: "Sous-traitance", usesProduct: false },
    { value: "other", label: "Autre frais", usesProduct: false },
  ];

  const PV_ORIGIN_DEFAULT = "admin";
  const STEPS = ["infos","techs","comps","expenses","files","pv","summary"];
  let currentStep = 0;

  // =========================
  // HELPERS
  // =========================
  function pad(n){ return String(n).padStart(2,"0"); }

  function formatFRDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatCents(cents) {
    if (cents === null || cents === undefined) return "—";
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function centsToEurosInput(cents) {
    if (cents === null || cents === undefined) return "";
    return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const eurosToCents = (typeof window.eurosToCents === "function")
    ? window.eurosToCents
    : function eurosToCentsLocal(value) {
        const s = String(value || "").replace(/\s/g, "").replace("€", "").replace(",", ".");
        if (!s) return null;
        const n = Number(s);
        if (Number.isNaN(n)) return null;
        return Math.round(n * 100);
      };

  function toLocalInputValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function safeFileName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
  }

  function parseQty(value) {
    const n = Number(String(value || "").replace(",", "."));
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.round(n));
  }

  function parseEurosToCents(value) {
    const cents = eurosToCents(value);
    return cents === null ? 0 : cents;
  }

  function cleanNullableText(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    if (lower === "none" || lower === "null" || lower === "undefined" || lower === "n/a") return null;
    return s;
  }

  function normalizeStatus(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[-]/g, "_")
      .replace(/\s+/g, " ");
  }

  function statusLabel(value) {
    const key = normalizeStatus(value);
    const conf = STATUS_MAP[key] || STATUS_MAP[key.replace(/\s/g, "_")];
    return conf ? conf.label : (value || "—");
  }

  function toDbStatus(value) {
    const v = cleanNullableText(value) || "Planifiée";
    const key = normalizeStatus(v);
    return STATUS_CANONICAL_DB[key] || "planned";
  }

  function isProductType(type) {
    return type === "material";
  }

  function techInitials(name) {
    const parts = String(name || "").trim().split(/\s+/);
    if (!parts.length) return "T";
    const first = parts[0][0] || "";
    const last = parts.length > 1 ? parts[parts.length-1][0] : "";
    return (first + last).toUpperCase();
  }

  function injectAdminThemeStyles() {
    if (document.getElementById("mbl-admin-interventions-theme")) return;

    const style = document.createElement("style");
    style.id = "mbl-admin-interventions-theme";
    style.textContent = `
      html[data-page="admin-interventions"] body {
        background:
          radial-gradient(900px 420px at 8% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
          radial-gradient(880px 480px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
          linear-gradient(180deg, #f4f8fc, #edf4fb);
      }

      html[data-page="admin-interventions"] .intervention-search {
        width: min(380px, 100%);
        border: 1px solid #cfdeeb;
        border-radius: 12px;
        background: #ffffff;
        color: #10233f;
        outline: none;
        padding: 10px 12px;
        transition: border-color .2s ease, box-shadow .2s ease;
      }
      html[data-page="admin-interventions"] .intervention-search:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      html[data-page="admin-interventions"] .intervention-row {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 8px 20px rgba(12, 37, 66, 0.06);
        transition: transform .16s ease, box-shadow .22s ease, border-color .22s ease;
      }
      html[data-page="admin-interventions"] .intervention-row:hover {
        transform: translateY(-1px);
        border-color: #b8d1e5;
        box-shadow: 0 14px 26px rgba(12, 37, 66, 0.1);
      }

      html[data-page="admin-interventions"] .ref-intervention { color: #0c4a6e; font-weight: 800; }
      html[data-page="admin-interventions"] .client-intervention { color: #143a61; font-weight: 700; }
      html[data-page="admin-interventions"] .address-intervention { color: #6f87a0; }
      html[data-page="admin-interventions"] .technician-intervention { color: #294f74; }
      html[data-page="admin-interventions"] .date-intervention { color: #55708c; }
      html[data-page="admin-interventions"] .ca-intervention {
        color: #0f766e;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      html[data-page="admin-interventions"] .status-intervention {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 700;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      html[data-page="admin-interventions"] .status-intervention.is-planned {
        background: #f1f5f9; border-color: #d5dfea; color: #5f7187;
      }
      html[data-page="admin-interventions"] .status-intervention.is-pending {
        background: #fff6e8; border-color: #f9d39b; color: #b76a00;
      }
      html[data-page="admin-interventions"] .status-intervention.is-progress {
        background: #e9f5ff; border-color: #a9d6ff; color: #0c4a6e;
      }
      html[data-page="admin-interventions"] .status-intervention.is-done {
        background: #e8f9f4; border-color: #9ddfc8; color: #0f766e;
      }
      html[data-page="admin-interventions"] .status-intervention.is-canceled {
        background: #ffeef1; border-color: #ffc3cc; color: #be123c;
      }

      html[data-page="admin-interventions"] .show-intervention,
      html[data-page="admin-interventions"] .update-intervention,
      html[data-page="admin-interventions"] .upgrade-intervention,
      html[data-page="admin-interventions"] .delete-intervention {
        border-radius: 10px !important;
        border: 1px solid #cfdeeb !important;
        background: #ffffff !important;
        color: #0c4a6e !important;
        font-weight: 700 !important;
        transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
      }
      html[data-page="admin-interventions"] .show-intervention:hover,
      html[data-page="admin-interventions"] .update-intervention:hover,
      html[data-page="admin-interventions"] .upgrade-intervention:hover,
      html[data-page="admin-interventions"] .delete-intervention:hover {
        transform: translateY(-1px);
        border-color: #0ea5e9 !important;
        box-shadow: 0 6px 16px rgba(12, 74, 110, 0.12);
      }

      html[data-page="admin-interventions"] .mbl-ai-board {
        margin: 14px 0 12px;
        border: 1px solid #d6e2ee;
        border-radius: 16px;
        background:
          radial-gradient(720px 220px at 8% -12%, rgba(15, 118, 110, 0.1), transparent 68%),
          radial-gradient(740px 260px at 100% 0%, rgba(14, 165, 233, 0.1), transparent 72%),
          linear-gradient(180deg, #ffffff, #f5faff);
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        overflow: hidden;
      }

      html[data-page="admin-interventions"] .mbl-ai-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        padding: 12px;
      }

      html[data-page="admin-interventions"] .mbl-ai-kpi {
        position: relative;
        border: 1px solid #d6e2ee;
        border-radius: 12px;
        background: #fff;
        padding: 10px 12px;
        overflow: hidden;
      }
      html[data-page="admin-interventions"] .mbl-ai-kpi::after {
        content: "";
        position: absolute;
        width: 84px;
        height: 84px;
        border-radius: 999px;
        right: -22px;
        bottom: -40px;
        opacity: .12;
        background: radial-gradient(circle at center, #0c4a6e, transparent 70%);
      }
      html[data-page="admin-interventions"] .mbl-ai-kpi-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #58728d;
        font-weight: 700;
      }
      html[data-page="admin-interventions"] .mbl-ai-kpi-value {
        margin-top: 5px;
        color: #12375b;
        font-size: 20px;
        line-height: 1.1;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      html[data-page="admin-interventions"] .mbl-ai-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 0 12px 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      html[data-page="admin-interventions"] .mbl-ai-statuses {
        display: flex;
        gap: 7px;
        flex-wrap: wrap;
      }

      html[data-page="admin-interventions"] .mbl-ai-status {
        border: 1px solid #d2e0ec;
        background: #fff;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        color: #4e6882;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        transition: all .2s ease;
      }
      html[data-page="admin-interventions"] .mbl-ai-status:hover {
        border-color: #0ea5e9;
        color: #0c4a6e;
      }
      html[data-page="admin-interventions"] .mbl-ai-status.is-active {
        background: linear-gradient(120deg, #0f766e, #0c4a6e);
        border-color: #0c4a6e;
        color: #fff;
        box-shadow: 0 7px 16px rgba(12, 74, 110, 0.2);
      }
      html[data-page="admin-interventions"] .mbl-ai-status-count {
        display: inline-flex;
        min-width: 18px;
        justify-content: center;
        align-items: center;
        height: 18px;
        padding: 0 6px;
        border-radius: 999px;
        border: 1px solid rgba(12, 74, 110, 0.22);
        background: rgba(255,255,255,.72);
        color: #0c4a6e;
        font-size: 11px;
        font-weight: 800;
      }
      html[data-page="admin-interventions"] .mbl-ai-status.is-active .mbl-ai-status-count {
        border-color: rgba(255,255,255,.38);
        background: rgba(255,255,255,.16);
        color: #fff;
      }

      html[data-page="admin-interventions"] .mbl-ai-tools {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-left: auto;
      }
      html[data-page="admin-interventions"] .mbl-ai-tools label {
        font-size: 12px;
        color: #55708c;
        font-weight: 700;
      }
      html[data-page="admin-interventions"] .mbl-ai-sort {
        border: 1px solid #cfdeeb;
        background: #fff;
        color: #12375b;
        border-radius: 10px;
        padding: 8px 10px;
        outline: none;
      }
      html[data-page="admin-interventions"] .mbl-ai-count {
        font-size: 12px;
        color: #5c7590;
        font-weight: 700;
      }

      html[data-page="admin-interventions"] .intervention-row.is-appear {
        animation: mblRowIn .26s ease both;
      }
      @keyframes mblRowIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 980px) {
        html[data-page="admin-interventions"] .mbl-ai-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 680px) {
        html[data-page="admin-interventions"] .mbl-ai-kpis {
          grid-template-columns: 1fr;
        }
        html[data-page="admin-interventions"] .mbl-ai-tools {
          width: 100%;
          margin-left: 0;
          justify-content: space-between;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // =========================
  // LISTING
  // =========================
  injectAdminThemeStyles();

  const firstRow = document.querySelector(".intervention-row");
  if (!firstRow) {
    console.error("[ADMIN INTERVENTIONS] .intervention-row introuvable (template).");
    return;
  }

  function applyStatus(statusEl, statusValue) {
    if (!statusEl) return;
    statusEl.classList.remove("is-planned","is-pending","is-progress","is-done","is-canceled");
    const key = normalizeStatus(statusValue);
    const conf = STATUS_MAP[key] || STATUS_MAP[key.replace(/\s/g, "_")] || null;
    if (!conf) { statusEl.textContent = statusValue || "—"; return; }
    statusEl.textContent = conf.label;
    statusEl.classList.add(conf.cls);
  }

  const searchInput = document.querySelector(".intervention-search");
  const rowsContainer = firstRow.parentElement;

  const LIST_STATUS_META = [
    { key: "all", label: "Tous" },
    { key: "planned", label: "Planifiées" },
    { key: "pending", label: "En attente" },
    { key: "in_progress", label: "En cours" },
    { key: "done", label: "Terminées" },
    { key: "canceled", label: "Annulées" },
  ];

  const listState = {
    items: [],
    filtered: [],
    search: "",
    status: "all",
    sort: "date_desc",
  };

  const refSequenceState = {
    maxSeen: 0,
    initialized: false,
  };

  let listUi = null;

  function extractReferenceNumber(ref) {
    const match = String(ref || "").trim().match(/^MBL-(\d+)$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  function refreshReferenceSequenceFromItems(items) {
    const list = Array.isArray(items) ? items : [];
    let maxRef = refSequenceState.maxSeen || 0;
    list.forEach((itv) => {
      const n = extractReferenceNumber(itv?.internal_ref);
      if (n && n > maxRef) maxRef = n;
    });
    refSequenceState.maxSeen = maxRef;
    refSequenceState.initialized = true;
  }

  function getNextReferenceCandidate() {
    if (!refSequenceState.initialized) {
      refreshReferenceSequenceFromItems(listState.items || []);
    }
    return `MBL-${Math.max(0, refSequenceState.maxSeen) + 1}`;
  }

  function markReferenceUsed(ref) {
    const n = extractReferenceNumber(ref);
    if (!n) return;
    refSequenceState.maxSeen = Math.max(refSequenceState.maxSeen || 0, n);
    refSequenceState.initialized = true;
  }

  function canonicalStatusForList(value) {
    const key = normalizeStatus(value).replace(/\s+/g, "_");
    const canonical = STATUS_CANONICAL_DB[key] || key || "";
    if (canonical === "confirmed") return "in_progress";
    if (
      canonical === "planned" ||
      canonical === "pending" ||
      canonical === "in_progress" ||
      canonical === "done" ||
      canonical === "canceled"
    ) {
      return canonical;
    }
    return "other";
  }

  function parseTarifToCentsLoose(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return 0;
      if (Number.isInteger(value)) {
        return Math.abs(value) >= 1000 ? value : Math.round(value * 100);
      }
      return Math.round(value * 100);
    }

    let s = String(value)
      .trim()
      .replace(/\s+/g, "")
      .replace(/\u00A0/g, "")
      .replace(/€/g, "")
      .replace(/eur/gi, "");
    if (!s) return 0;

    if (/^-?\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n)
        ? (Math.abs(n) >= 1000 ? n : Math.round(n * 100))
        : 0;
    }

    if (s.includes(",") && s.includes(".")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(",")) {
      const p = s.split(",");
      if (p.length === 2 && p[1].length <= 2) {
        s = p[0].replace(/\./g, "") + "." + p[1];
      } else {
        s = s.replace(/,/g, "");
      }
    }

    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function buildSearchTextFromItem(itv) {
    return norm([
      itv.internal_ref || "",
      itv.client_name || "",
      itv.address || "",
      itv.technician_name || "",
      statusLabel(itv.status || ""),
      formatFRDateTime(itv.start_at),
    ].join(" "));
  }

  function ensureListingUi() {
    if (listUi?.host && listUi.host.isConnected) return listUi;
    if (!rowsContainer || !rowsContainer.parentElement) return null;

    const host = document.createElement("section");
    host.className = "mbl-ai-board";
    host.innerHTML = `
      <div class="mbl-ai-kpis"></div>
      <div class="mbl-ai-toolbar">
        <div class="mbl-ai-statuses"></div>
        <div class="mbl-ai-tools">
          <label for="mbl-ai-sort">Tri</label>
          <select id="mbl-ai-sort" class="mbl-ai-sort">
            <option value="date_desc">Date la plus recente</option>
            <option value="date_asc">Date la plus ancienne</option>
            <option value="ca_desc">CA le plus eleve</option>
            <option value="ca_asc">CA le plus faible</option>
            <option value="client_asc">Client A -> Z</option>
            <option value="ref_asc">Reference A -> Z</option>
          </select>
          <span class="mbl-ai-count">0 / 0</span>
        </div>
      </div>
    `;
    rowsContainer.parentElement.insertBefore(host, rowsContainer);

    const statusesEl = host.querySelector(".mbl-ai-statuses");
    const sortEl = host.querySelector(".mbl-ai-sort");
    const kpisEl = host.querySelector(".mbl-ai-kpis");
    const countEl = host.querySelector(".mbl-ai-count");

    statusesEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".mbl-ai-status");
      if (!btn) return;
      const status = btn.dataset.status || "all";
      if (listState.status === status) return;
      listState.status = status;
      refreshListingView();
    });

    sortEl.addEventListener("change", () => {
      listState.sort = sortEl.value || "date_desc";
      refreshListingView();
    });

    listUi = { host, statusesEl, sortEl, kpisEl, countEl };
    return listUi;
  }

  function renderListingStatusButtons() {
    const ui = ensureListingUi();
    if (!ui) return;

    const counts = {
      all: listState.items.length,
      planned: 0,
      pending: 0,
      in_progress: 0,
      done: 0,
      canceled: 0,
    };

    listState.items.forEach((itv) => {
      const key = canonicalStatusForList(itv.status);
      if (counts[key] !== undefined) counts[key] += 1;
    });

    ui.statusesEl.innerHTML = LIST_STATUS_META.map((meta) => {
      const active = listState.status === meta.key ? " is-active" : "";
      const count = counts[meta.key] || 0;
      return `
        <button type="button" class="mbl-ai-status${active}" data-status="${meta.key}">
          <span>${meta.label}</span>
          <span class="mbl-ai-status-count">${count}</span>
        </button>
      `;
    }).join("");
  }

  function renderListingKpis() {
    const ui = ensureListingUi();
    if (!ui) return;

    const filtered = listState.filtered || [];
    const total = listState.items || [];
    const caTotal = filtered.reduce((sum, itv) => sum + (itv._tarifCents || 0), 0);
    const done = filtered.filter((itv) => canonicalStatusForList(itv.status) === "done").length;
    const inProgress = filtered.filter((itv) => canonicalStatusForList(itv.status) === "in_progress").length;
    const avg = filtered.length ? Math.round(caTotal / filtered.length) : 0;

    ui.kpisEl.innerHTML = `
      <article class="mbl-ai-kpi">
        <div class="mbl-ai-kpi-label">Interventions</div>
        <div class="mbl-ai-kpi-value">${filtered.length} / ${total.length}</div>
      </article>
      <article class="mbl-ai-kpi">
        <div class="mbl-ai-kpi-label">CA Filtre</div>
        <div class="mbl-ai-kpi-value">${formatCents(caTotal)}</div>
      </article>
      <article class="mbl-ai-kpi">
        <div class="mbl-ai-kpi-label">En Cours</div>
        <div class="mbl-ai-kpi-value">${inProgress}</div>
      </article>
      <article class="mbl-ai-kpi">
        <div class="mbl-ai-kpi-label">Ticket Moyen</div>
        <div class="mbl-ai-kpi-value">${formatCents(avg)}</div>
      </article>
    `;

    ui.countEl.textContent = `${filtered.length} / ${total.length} affichees`;
    ui.sortEl.value = listState.sort;
  }

  function fillRow(rowEl, itv) {
    const refEl = rowEl.querySelector(".ref-intervention");
    const clientEl = rowEl.querySelector(".client-intervention");
    const addressEl = rowEl.querySelector(".address-intervention");
    const techEl = rowEl.querySelector(".technician-intervention");
    const dateEl = rowEl.querySelector(".date-intervention");
    const caEl = rowEl.querySelector(".ca-intervention");
    const statusEl = rowEl.querySelector(".status-intervention");

    if (refEl) refEl.textContent = itv.internal_ref ?? "—";
    if (clientEl) clientEl.textContent = itv.client_name ?? "—";
    if (addressEl) addressEl.textContent = itv.address ?? "—";
    if (techEl) techEl.textContent = itv.technician_name ?? "—";
    if (dateEl) dateEl.textContent = formatFRDateTime(itv.start_at);
    if (caEl) caEl.textContent = formatCents(itv.tarif);
    applyStatus(statusEl, itv.status);

    rowEl.dataset.interventionId = itv.id || "";
    rowEl.dataset.reference = itv.internal_ref || "";
    rowEl.dataset.client = itv.client_name || "";
    rowEl.dataset.tech = itv.technician_name ?? "";
    rowEl.dataset.status = statusLabel(itv.status || "");
    rowEl.dataset.datefr = formatFRDateTime(itv.start_at);

    const href = `${PAGE_INTERVENTION}?id=${encodeURIComponent(itv.id || "")}`;
    const showA = rowEl.querySelector("a.show-intervention");
    const updateA = rowEl.querySelector("a.update-intervention");
    const upgradeA = rowEl.querySelector("a.upgrade-intervention");
    if (showA) showA.href = href;
    if (updateA) updateA.href = href;
    if (upgradeA) upgradeA.href = href;
  }

  function setRowActionsEnabled(rowEl, enabled) {
    rowEl
      .querySelectorAll("a.show-intervention, a.update-intervention, a.upgrade-intervention, a.delete-intervention")
      .forEach((a) => {
        a.style.pointerEvents = enabled ? "" : "none";
        a.style.opacity = enabled ? "" : "0.45";
      });
  }

  function renderInterventionRows(rows) {
    if (!rowsContainer) return;
    rowsContainer.querySelectorAll(".intervention-row").forEach((row, idx) => {
      if (idx > 0) row.remove();
    });

    if (!rows.length) {
      const hasData = (listState.items || []).length > 0;
      fillRow(firstRow, {
        id: "",
        internal_ref: hasData ? "Aucun resultat" : "Aucune intervention",
        client_name: "—",
        address: "—",
        technician_name: "—",
        status: "—",
        start_at: null,
        tarif: null,
      });
      setRowActionsEnabled(firstRow, false);
      return;
    }

    fillRow(firstRow, rows[0]);
    firstRow.classList.add("is-appear");
    firstRow.style.animationDelay = "0ms";
    setRowActionsEnabled(firstRow, true);

    for (let i = 1; i < rows.length; i++) {
      const clone = firstRow.cloneNode(true);
      fillRow(clone, rows[i]);
      clone.classList.add("is-appear");
      clone.style.animationDelay = `${Math.min(i * 25, 260)}ms`;
      setRowActionsEnabled(clone, true);
      rowsContainer.appendChild(clone);
    }
  }

  function sortInterventions(rows) {
    const list = rows.slice();
    list.sort((a, b) => {
      switch (listState.sort) {
        case "date_asc":
          return (a._startTs || 0) - (b._startTs || 0);
        case "ca_desc":
          return (b._tarifCents || 0) - (a._tarifCents || 0);
        case "ca_asc":
          return (a._tarifCents || 0) - (b._tarifCents || 0);
        case "client_asc":
          return String(a.client_name || "").localeCompare(String(b.client_name || ""), "fr", { sensitivity: "base" });
        case "ref_asc":
          return String(a.internal_ref || "").localeCompare(String(b.internal_ref || ""), "fr", { sensitivity: "base" });
        case "date_desc":
        default:
          return (b._startTs || 0) - (a._startTs || 0);
      }
    });
    return list;
  }

  function refreshListingView() {
    const query = listState.search;
    const status = listState.status;
    const filtered = (listState.items || []).filter((itv) => {
      if (status !== "all" && canonicalStatusForList(itv.status) !== status) return false;
      if (query && !(itv._search || "").includes(query)) return false;
      return true;
    });

    listState.filtered = sortInterventions(filtered);
    renderInterventionRows(listState.filtered);
    renderListingStatusButtons();
    renderListingKpis();
  }

  async function loadInterventions() {
    const { data: interventions, error } = await supabase
      .from("interventions")
      .select("id, internal_ref, client_name, address, start_at, status, tarif")
      .order("start_at", { ascending: false });

    if (error) {
      console.error("[INTERVENTIONS] load error:", error);
      fillRow(firstRow, { id:"", internal_ref:"Erreur chargement", client_name:"—", address:"—", status:"—", tarif:null });
      setRowActionsEnabled(firstRow, false);
      listState.items = [];
      listState.filtered = [];
      renderListingStatusButtons();
      renderListingKpis();
      return;
    }

    const list = interventions || [];
    if (!list.length) {
      fillRow(firstRow, { id:"", internal_ref:"Aucune intervention", client_name:"—", address:"—", status:"—", tarif:null });
      setRowActionsEnabled(firstRow, false);
      listState.items = [];
      listState.filtered = [];
      renderListingStatusButtons();
      renderListingKpis();
      return;
    }

    const ids = list.map((i) => i.id).filter(Boolean);
    const { data: assigns } = await supabase
      .from("intervention_assignees")
      .select("intervention_id, user_id")
      .in("intervention_id", ids);

    const userIdsByInterv = new Map();
    (assigns || []).forEach((a) => {
      if (!a?.intervention_id || !a?.user_id) return;
      if (!userIdsByInterv.has(a.intervention_id)) userIdsByInterv.set(a.intervention_id, []);
      userIdsByInterv.get(a.intervention_id).push(a.user_id);
    });

    const allUserIds = Array.from(new Set((assigns || []).map(a => a.user_id).filter(Boolean)));
    const nameById = new Map();

    if (allUserIds.length) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email")
        .in("id", allUserIds);

      (users || []).forEach((u) => {
        const first = String(u.first_name || "").trim();
        const last  = String(u.last_name || "").trim();
        const full1 = [first, last ? last.toUpperCase() : ""].filter(Boolean).join(" ").trim();
        const full = full1 || String(u.name || "").trim() || String(u.email || "").trim() || "—";
        nameById.set(u.id, full);
      });
    }

    const enriched = list.map((itv) => {
      const uids = userIdsByInterv.get(itv.id) || [];
      const names = uids.map((id) => nameById.get(id)).filter((n) => n && n !== "—");
      const technician_name = names.length ? Array.from(new Set(names)).join(", ") : "—";
      const startTs = itv.start_at ? new Date(itv.start_at).getTime() : 0;
      return {
        ...itv,
        technician_name,
        _startTs: Number.isFinite(startTs) ? startTs : 0,
        _tarifCents: parseTarifToCentsLoose(itv.tarif),
        _search: buildSearchTextFromItem({ ...itv, technician_name }),
      };
    });

    ensureListingUi();
    listState.items = enriched;
    refreshReferenceSequenceFromItems(enriched);
    listState.search = norm(searchInput?.value || "");
    refreshListingView();
  }

  // =========================
  // SEARCH
  // =========================
  function applyFilter(qRaw) {
    listState.search = norm(qRaw || "");
    refreshListingView();
  }

  const applyFilterDebounced = debounce(applyFilter, 120);

  if (searchInput) {
    searchInput.addEventListener("input", () => applyFilterDebounced(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyFilter(searchInput.value); }
      if (e.key === "Escape") { searchInput.value = ""; applyFilter(""); }
    });
  }

  // =========================
  // TECHS + PRODUCTS CACHE
  // =========================
  let techsCache = null;
  let productsCache = null;
  let productPriceById = new Map();

  async function loadTechs() {
    if (techsCache) return techsCache;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, role, is_active")
      .eq("role", "tech")
      .eq("is_active", true)
      .order("last_name", { ascending: true });

    if (error) { techsCache = []; return techsCache; }
    techsCache = data || [];
    return techsCache;
  }

  function techFullName(t) {
    const first = String(t?.first_name || "").trim();
    const last  = String(t?.last_name || "").trim();
    return [first, last ? last.toUpperCase() : ""].filter(Boolean).join(" ").trim() || "—";
  }

  function techNameById(id) {
    const t = (techsCache || []).find(x => x.id === id);
    return t ? techFullName(t) : id;
  }

  async function loadProducts() {
    if (productsCache) return productsCache;

    let data = null;
    let error = null;

    ({ data, error } = await supabase
      .from(CONFIG.PRODUCTS_TABLE)
      .select("id, name, price_cents")
      .order("name", { ascending: true })
    );

    if (error) {
      ({ data, error } = await supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name")
        .order("name", { ascending: true })
      );
    }

    productsCache = data || [];
    productPriceById = new Map();
    productsCache.forEach((p) => {
      const price = p.price_cents ?? null;
      if (price !== null && price !== undefined) productPriceById.set(p.id, price);
    });

    return productsCache;
  }

  async function populateTechSelect(selectEl) {
    if (!selectEl) return;
    const techs = await loadTechs();
    selectEl.innerHTML = "";
    if (!techs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Aucun technicien —";
      selectEl.appendChild(opt);
      return;
    }
    techs.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = techFullName(t);
      selectEl.appendChild(opt);
    });
  }

  function productsOptionsHtml() {
    const list = productsCache || [];
    if (!list.length) return `<option value="">— Aucun produit —</option>`;
    return list.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  // =========================
  // LOAD FULL INTERVENTION
  // =========================
  async function loadInterventionBundle(id) {
    const [
      itvRes,
      assignsRes,
      compsRes,
      expRes,
      filesRes,
      pvRes
    ] = await Promise.all([
      supabase.from("interventions")
        .select("id, internal_ref, monday_item_id, title, client_name, client_ref, address, support_phone, status, start_at, end_at, equipment_needed, infos, observations, tarif, pv_status, pv_source, created_at, updated_at")
        .eq("id", id)
        .single(),
      supabase.from("intervention_assignees").select("intervention_id, user_id").eq("intervention_id", id),
      supabase.from("intervention_compensations").select("id, tech_id, amount_cents, currency, status, notes").eq("intervention_id", id),
      supabase.from("intervention_expenses").select("id, type, product_id, qty, unit_cost_cents, amount_cents, note").eq("intervention_id", id),
      supabase.from("intervention_files").select("id, type, file_path, created_at").eq("intervention_id", id).order("created_at", { ascending: false }),
      supabase.from("intervention_pv").select("intervention_id, pv_draft_path, pv_signed_path, draft_origin, signed_origin, draft_uploaded_at, signed_uploaded_at").eq("intervention_id", id).maybeSingle()
    ]);

    if (itvRes.error) throw new Error(itvRes.error.message);

    return {
      intervention: itvRes.data,
      assigns: assignsRes.data || [],
      compensations: compsRes.data || [],
      expenses: expRes.data || [],
      files: filesRes.data || [],
      pv: pvRes.data || null
    };
  }

  // =========================
  // MODAL STATE
  // =========================
  let modalState = {
    mode: "view",
    id: null,
    pendingFiles: [],
    pendingPvDraft: null,
    pendingPvSigned: null,
    dirty: false,
    initialSignature: "",
    saving: false
  };

  function getDraftStorageKey() {
    return modalState.mode === "edit" ? `itvDraft:${modalState.id}` : "itvDraft:new";
  }

  function normalizeEuroInput(value) {
    const cents = parseEurosToCents(value);
    return centsToEurosInput(cents || 0);
  }

  function getModalSnapshotSignature() {
    const modal = ensureModalExists();
    const base = {
      ref: modal.querySelector(".f-ref")?.value || "",
      status: modal.querySelector(".f-status")?.value || "",
      title: modal.querySelector(".f-title")?.value || "",
      monday: modal.querySelector(".f-monday")?.value || "",
      client: modal.querySelector(".f-client")?.value || "",
      client_ref: modal.querySelector(".f-client-ref")?.value || "",
      phone: modal.querySelector(".f-phone")?.value || "",
      tarif: modal.querySelector(".f-tarif")?.value || "",
      address: modal.querySelector(".f-address")?.value || "",
      start: modal.querySelector(".f-start")?.value || "",
      end: modal.querySelector(".f-end")?.value || "",
      equipment: modal.querySelector(".f-equipment")?.value || "",
      infos: modal.querySelector(".f-infos")?.value || "",
      observations: modal.querySelector(".f-observations")?.value || "",
      techIds: getSelectedTechs().map((t) => t.id).sort(),
      compRows: Array.from(modal.querySelectorAll(".comp-row")).map((row) => ({
        tech_id: row.dataset.techId || "",
        amount: row.querySelector(".c-amount")?.value || "",
        status: row.querySelector(".c-status")?.value || "",
        currency: row.querySelector(".c-currency")?.value || "",
        notes: row.querySelector(".c-notes")?.value || "",
      })),
      expRows: Array.from(modal.querySelectorAll(".exp-row")).map((row) => ({
        type: row.querySelector(".e-type")?.value || "",
        product: row.querySelector(".e-product")?.value || "",
        label: row.querySelector(".e-label")?.value || "",
        qty: row.querySelector(".e-qty")?.value || "",
        unit: row.querySelector(".e-unit")?.value || "",
      })),
      pendingFiles: modalState.pendingFiles.map((f) => `${f.type || ""}|${f.file?.name || ""}`),
      pendingPvDraft: modalState.pendingPvDraft?.name || "",
      pendingPvSigned: modalState.pendingPvSigned?.name || "",
    };
    return JSON.stringify(base);
  }

  function setDirtyFlag(flag) {
    modalState.dirty = Boolean(flag);
    const modal = ensureModalExists();
    const badge = modal.querySelector(".itv-dirty-badge");
    if (badge) badge.classList.toggle("is-visible", modalState.dirty && modalState.mode !== "view");
  }

  function refreshDirtyFlag() {
    if (modalState.mode === "view") {
      setDirtyFlag(false);
      return;
    }
    const current = getModalSnapshotSignature();
    setDirtyFlag(current !== modalState.initialSignature);
  }

  function resetDirtyBaseline() {
    modalState.initialSignature = getModalSnapshotSignature();
    setDirtyFlag(false);
  }

  function syncModalMeta() {
    const modal = ensureModalExists();
    const chip = modal.querySelector(".itv-mode-chip");
    if (chip) {
      chip.textContent =
        modalState.mode === "view"
          ? "Mode: consultation"
          : modalState.mode === "edit"
          ? "Mode: edition"
          : "Mode: creation";
    }
  }

  function tryCloseModal() {
    if (modalState.saving) return;
    if (modalState.mode !== "view" && modalState.dirty) {
      const ok = window.confirm("Vous avez des modifications non sauvegardees. Fermer quand meme ?");
      if (!ok) return;
    }
    closeModal();
  }

  function clearFieldErrors() {
    const modal = ensureModalExists();
    modal.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  }

  function markInvalid(selectors) {
    const modal = ensureModalExists();
    selectors.forEach((sel) => {
      const el = modal.querySelector(sel);
      if (el) el.classList.add("is-invalid");
    });
  }

  function lockReferenceField() {
    const modal = ensureModalExists();
    const refInput = modal.querySelector(".f-ref");
    if (!refInput) return;
    refInput.readOnly = true;
    refInput.classList.add("is-locked");
    refInput.setAttribute("aria-readonly", "true");
    refInput.setAttribute("title", "Reference auto-generee");
  }

  function assignNextReferenceCandidate(force) {
    const modal = ensureModalExists();
    const refInput = modal.querySelector(".f-ref");
    if (!refInput) return;
    if (!force && String(refInput.value || "").trim()) return;
    refInput.value = getNextReferenceCandidate();
  }

  async function resolveAvailableReference(candidate) {
    const parsed = extractReferenceNumber(candidate);
    let start = parsed || (Math.max(0, refSequenceState.maxSeen) + 1);

    for (let offset = 0; offset < 200; offset += 1) {
      const ref = `MBL-${start + offset}`;
      const { data, error } = await supabase
        .from("interventions")
        .select("id")
        .eq("internal_ref", ref)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return ref;
    }

    throw new Error("Impossible de trouver une reference libre.");
  }

  function goStep(idx) {
    const modal = ensureModalExists();
    currentStep = Math.max(0, Math.min(STEPS.length - 1, idx));
    switchTab(STEPS[currentStep]);

    modal.querySelectorAll(".itv-step").forEach((b, i) => {
      b.classList.toggle("is-active", i === currentStep);
      b.classList.toggle("is-done", i < currentStep);
    });

    const progress = modal.querySelector(".itv-progress__bar");
    if (progress) {
      const pct = ((currentStep + 1) / STEPS.length) * 100;
      progress.style.width = `${pct}%`;
    }

    const nextBtn = modal.querySelector(".itv-next");
    nextBtn.textContent = currentStep === STEPS.length - 1 ? (modalState.mode === "view" ? "Fermer" : "Enregistrer") : "Suivant";

    updateSummaryView();
  }

  function ensureModalExists() {
    let modal = document.querySelector(".itv-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "itv-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100002; display:none; font-family:inherit;";

    modal.innerHTML = `
      <style>
        .itv-modal * { box-sizing: border-box; }
        .itv-modal__overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 31, 53, 0.42);
          backdrop-filter: blur(3px);
        }
        .itv-modal__panel {
          position: relative;
          width: min(1020px, calc(100vw - 28px));
          max-height: calc(100vh - 30px);
          overflow: auto;
          background:
            radial-gradient(720px 220px at 8% -5%, rgba(15, 118, 110, 0.1), transparent 65%),
            radial-gradient(680px 280px at 100% 0%, rgba(14, 165, 233, 0.1), transparent 72%),
            linear-gradient(180deg, #f7fbff, #eff6fd);
          border: 1px solid #d6e2ee;
          border-radius: 18px;
          padding: 16px;
          margin: 14px auto;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 25px 60px rgba(12, 37, 66, 0.24);
          color: #10233f;
        }
        .itv-modal__panel::-webkit-scrollbar { width: 10px; height: 10px; }
        .itv-modal__panel::-webkit-scrollbar-thumb { background: #c9d8e6; border-radius: 10px; }
        .itv-modal__panel::-webkit-scrollbar-track { background: #edf3fa; border-radius: 10px; }
        .itv-modal__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          background: linear-gradient(120deg, #0f766e, #0c4a6e);
          color: #fff;
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 8px 20px rgba(12, 74, 110, 0.24);
          position: sticky;
          top: 0;
          z-index: 5;
        }
        .itv-modal__title { font-size: 20px; font-weight: 800; }
        .itv-modal__subtitle { opacity: .9; }
        .itv-modal__meta { display: inline-flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
        .itv-mode-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 11px;
          font-weight: 800;
          background: rgba(255,255,255,.18);
          border: 1px solid rgba(255,255,255,.28);
        }
        .itv-dirty-badge {
          display: none;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 11px;
          font-weight: 800;
          background: rgba(255,255,255,.14);
          border: 1px solid rgba(255,255,255,.3);
        }
        .itv-dirty-badge.is-visible { display: inline-flex; }
        .itv-btn {
          border: none;
          background: linear-gradient(120deg, #0f766e, #0c4a6e);
          color: #fff;
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 800;
          transition: transform .16s ease, box-shadow .2s ease;
        }
        .itv-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(12, 74, 110, 0.2); }
        .itv-btn:active { transform: translateY(0); }
        .itv-btn.secondary {
          border: 1px solid #cfdeeb;
          background: #fff;
          color: #0c4a6e;
          font-weight: 700;
        }
        .itv-btn.danger {
          background: linear-gradient(120deg, #ef4444, #be123c);
          color: #fff;
        }
        .itv-stepper { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .itv-step {
          border:1px solid #d7e4f0;
          background:#ffffff;
          color:#4f6b87;
          padding:6px 12px;
          border-radius:999px;
          cursor:pointer;
          font-weight:700;
          font-size:12px;
        }
        .itv-step.is-active {
          background:#0c4a6e;
          color:#fff;
          border-color:#0c4a6e;
          box-shadow: 0 8px 16px rgba(12, 74, 110, 0.18);
        }
        .itv-step.is-done {
          border-color: #0f766e;
          background: #e8f9f4;
          color: #0f766e;
        }
        .itv-progress {
          margin-top: 10px;
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: #dce8f3;
          overflow: hidden;
        }
        .itv-progress__bar {
          height: 100%;
          width: 14.2857%;
          background: linear-gradient(120deg, #0f766e, #0ea5e9);
          transition: width .24s ease;
        }
        .itv-runtime {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .itv-metric {
          border: 1px solid #d6e2ee;
          border-radius: 10px;
          background: #fff;
          padding: 8px 10px;
          min-width: 0;
        }
        .itv-metric-k {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .07em;
          color: #5a7490;
          font-weight: 700;
        }
        .itv-metric-v {
          margin-top: 4px;
          font-weight: 800;
          font-size: 16px;
          color: #12375b;
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .itv-metric-v.is-positive { color: #0f766e; }
        .itv-metric-v.is-negative { color: #be123c; }
        .itv-tab { display:none; margin-top:14px; }
        .itv-tab.is-active { display:block; }
        .itv-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .itv-field label {
          font-size:12px;
          color:#55708c;
          display:block;
          margin-bottom:6px;
          font-weight: 600;
        }
        .itv-field input, .itv-field textarea, .itv-field select {
          width:100%;
          padding:11px 12px;
          border:1px solid #cfdeeb;
          border-radius:12px;
          font-family:inherit;
          background:#fff;
          color:#10233f;
          outline: none;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .itv-field input:focus, .itv-field textarea:focus, .itv-field select:focus {
          border-color:#0ea5e9;
          box-shadow:0 0 0 3px rgba(14, 165, 233, 0.16);
        }
        .itv-field input.is-locked {
          background: #eef4fb;
          color: #4f6b87;
          border-color: #d2deea;
          cursor: not-allowed;
        }
        .itv-field input.is-invalid, .itv-field textarea.is-invalid, .itv-field select.is-invalid {
          border-color: #ef4444 !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.14) !important;
          background: #fff8f8;
        }
        .itv-card {
          padding:12px;
          border:1px solid #d6e2ee;
          border-radius:12px;
          background:#ffffff;
          box-shadow: 0 4px 10px rgba(12, 37, 66, 0.04);
        }
        .itv-card .k { font-size:12px; color:#5a7490; }
        .itv-card .v { font-weight:800; color:#143a61; }
        .itv-row { display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 40px; gap:8px; align-items:center; }
        .itv-row input, .itv-row select { padding:8px 10px; }
        .itv-row .amount { font-weight:800; text-align:right; color:#0f766e; }
        .itv-section-title { font-weight:800; margin:8px 0; color:#143a61; }
        .itv-table-head {
          display:grid;
          grid-template-columns:1.4fr 1fr 1fr 1fr 40px;
          gap:8px;
          font-size:12px;
          color:#5a7490;
          margin:8px 0;
          font-weight: 700;
        }
        .itv-file-row, .itv-pv-row {
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:center;
          padding:10px 12px;
          border:1px solid #d6e2ee;
          background: #fff;
          border-radius:10px;
          margin-top:8px;
        }
        .itv-chip {
          display:inline-flex;
          align-items:center;
          padding:4px 8px;
          background:#e9f5ff;
          color:#0c4a6e;
          border: 1px solid #afd7fb;
          border-radius:999px;
          font-size:12px;
          font-weight:700;
        }
        .itv-modal__error {
          display:none;
          margin-top:10px;
          background:#fff1f4;
          border:1px solid #ffc9d2;
          color:#9f1733;
          border-radius:10px;
          padding:10px 12px;
          font-weight:600;
        }
        .itv-actions {
          display:flex;
          justify-content:space-between;
          margin-top:14px;
          gap: 8px;
          position: sticky;
          bottom: 0;
          z-index: 4;
          padding: 10px 2px 2px;
          background: linear-gradient(180deg, rgba(247,251,255,0), rgba(247,251,255,.94) 40%, rgba(247,251,255,1));
        }
        .itv-muted { color:#5a7490; font-size:12px; }

        .tech-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .tech-grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(210px,1fr)); gap:10px; margin-top:10px; }
        .tech-card {
          border:1px solid #d6e2ee;
          background:#fff;
          padding:10px;
          border-radius:12px;
          display:flex;
          gap:10px;
          align-items:center;
          cursor:pointer;
          transition: border-color .18s ease, box-shadow .18s ease, transform .16s ease;
        }
        .tech-card:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(12, 37, 66, 0.08); }
        .tech-card.is-selected {
          border-color:#0ea5e9;
          box-shadow:0 0 0 3px rgba(14,165,233,.14);
          background:#f5fbff;
        }
        .tech-avatar {
          width:36px;
          height:36px;
          border-radius:10px;
          background:#e7f5ff;
          color:#0c4a6e;
          font-weight:800;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .tech-meta { font-size:12px; color:#55708c; }

        .exp-row {
          display:grid;
          grid-template-columns: 1.5fr .6fr .7fr .7fr 40px;
          gap:8px;
          align-items:center;
          padding:8px;
          border:1px dashed #c9d8e6;
          border-radius:12px;
          margin-bottom:8px;
          background:#fff;
        }
        .exp-row .exp-main { display:flex; flex-direction:column; gap:6px; }
        .exp-total-box { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap: wrap; margin-top:8px; }
        .exp-total { font-weight:800; color:#0f766e; }

        .itv-modal.is-readonly .itv-next,
        .itv-modal.is-readonly .add-exp-product,
        .itv-modal.is-readonly .add-exp-extra,
        .itv-modal.is-readonly .e-del,
        .itv-modal.is-readonly .f-del,
        .itv-modal.is-readonly .f-file-input,
        .itv-modal.is-readonly .pv-draft-input,
        .itv-modal.is-readonly .pv-signed-input {
          display: none !important;
        }
        .itv-modal.is-readonly input,
        .itv-modal.is-readonly textarea,
        .itv-modal.is-readonly select {
          background: #f7fbff;
        }

        @media (max-width: 860px) {
          .itv-modal__panel {
            width: calc(100vw - 18px);
            max-height: calc(100vh - 18px);
            margin: 9px auto;
            padding: 12px;
          }
          .itv-grid { grid-template-columns: 1fr; }
          .itv-runtime { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .itv-actions { flex-direction: column-reverse; align-items: stretch; }
          .itv-actions > * { width: 100%; }
          .itv-actions button { width: 100%; }
          .itv-table-head, .itv-row { grid-template-columns: 1fr; }
          .exp-row { grid-template-columns: 1fr; }
        }
      </style>

      <div class="itv-modal__overlay"></div>
      <div class="itv-modal__panel">
        <div class="itv-modal__header">
          <div>
            <div class="itv-modal__title">Intervention</div>
            <div class="itv-modal__subtitle">Parcours guidé</div>
            <div class="itv-modal__meta">
              <span class="itv-mode-chip">Mode: consultation</span>
              <span class="itv-dirty-badge">Brouillon non sauvegarde</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="itv-btn secondary itv-close">Fermer</button>
          </div>
        </div>

        <div class="itv-stepper">
          <button class="itv-step is-active" data-step="0">1. Infos</button>
          <button class="itv-step" data-step="1">2. Techniciens</button>
          <button class="itv-step" data-step="2">3. Compensations</button>
          <button class="itv-step" data-step="3">4. Dépenses</button>
          <button class="itv-step" data-step="4">5. Fichiers</button>
          <button class="itv-step" data-step="5">6. PV</button>
          <button class="itv-step" data-step="6">7. Résumé</button>
        </div>
        <div class="itv-progress"><div class="itv-progress__bar"></div></div>
        <div class="itv-runtime">
          <div class="itv-metric">
            <div class="itv-metric-k">Tarif</div>
            <div class="itv-metric-v m-tarif">—</div>
          </div>
          <div class="itv-metric">
            <div class="itv-metric-k">Depenses</div>
            <div class="itv-metric-v m-expenses">—</div>
          </div>
          <div class="itv-metric">
            <div class="itv-metric-k">Compensations</div>
            <div class="itv-metric-v m-comps">—</div>
          </div>
          <div class="itv-metric">
            <div class="itv-metric-k">Benefice estime</div>
            <div class="itv-metric-v m-profit">—</div>
          </div>
        </div>

        <div class="itv-modal__error"></div>

        <div class="itv-tab" data-tab="infos">
          <div class="itv-grid">
            <div class="itv-field">
              <label>Référence auto *</label>
              <input class="f-ref" type="text" />
              <div class="itv-muted">Format auto: MBL-123</div>
            </div>
            <div class="itv-field">
              <label>Statut</label>
              <input class="f-status" type="text" list="status-list" />
              <datalist id="status-list">${STATUS_OPTIONS.map(s => `<option value="${s}"></option>`).join("")}</datalist>
            </div>

            <div class="itv-field">
              <label>Titre</label>
              <input class="f-title" type="text" />
            </div>
            <div class="itv-field">
              <label>Monday item id</label>
              <input class="f-monday" type="text" />
            </div>

            <div class="itv-field">
              <label>Client</label>
              <input class="f-client" type="text" />
            </div>
            <div class="itv-field">
              <label>Référence client</label>
              <input class="f-client-ref" type="text" />
            </div>

            <div class="itv-field">
              <label>Support téléphone</label>
              <input class="f-phone" type="text" />
            </div>
            <div class="itv-field">
              <label>Tarif (EUR)</label>
              <input class="f-tarif" type="text" placeholder="ex: 120,00" />
            </div>

            <div class="itv-field" style="grid-column:1/-1;">
              <label>Adresse</label>
              <input class="f-address" type="text" />
            </div>

            <div class="itv-field">
              <label>Début</label>
              <input class="f-start" type="datetime-local" />
            </div>
            <div class="itv-field">
              <label>Fin</label>
              <input class="f-end" type="datetime-local" />
            </div>

            <div class="itv-field" style="grid-column:1/-1;">
              <label>Équipement nécessaire</label>
              <textarea class="f-equipment" rows="2"></textarea>
            </div>
            <div class="itv-field" style="grid-column:1/-1;">
              <label>Infos</label>
              <textarea class="f-infos" rows="3"></textarea>
            </div>
            <div class="itv-field" style="grid-column:1/-1;">
              <label>Observations</label>
              <textarea class="f-observations" rows="3"></textarea>
            </div>
          </div>
        </div>

        <div class="itv-tab" data-tab="techs">
          <div class="tech-toolbar">
            <input class="tech-search" type="text" placeholder="Rechercher un technicien..." />
            <div class="tech-count itv-chip">0 sélectionné</div>
          </div>
          <div class="tech-list tech-grid"></div>
          <select class="f-techs" multiple style="display:none;"></select>
        </div>

        <div class="itv-tab" data-tab="comps">
          <div class="itv-section-title">Compensations par technicien</div>
          <div class="itv-table-head">
            <div>Technicien</div><div>Montant</div><div>Statut</div><div>Devise</div><div></div>
          </div>
          <div class="comp-rows"></div>
          <div class="itv-muted">Total compensations: <strong class="comp-total">—</strong></div>
        </div>

        <div class="itv-tab" data-tab="expenses">
          <div class="itv-section-title">Dépenses</div>
          <div class="exp-rows"></div>
          <div class="exp-total-box">
            <div class="itv-muted">Total dépenses: <span class="exp-total">—</span></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="itv-btn secondary add-exp-product">Ajouter un produit</button>
              <button type="button" class="itv-btn secondary add-exp-extra">Ajouter un frais</button>
            </div>
          </div>
        </div>

        <div class="itv-tab" data-tab="files">
          <div class="itv-section-title">Fichiers</div>
          <div class="files-list"></div>

          <div style="margin-top:10px;">
            <div class="itv-field">
              <label>Type de fichier</label>
              <input class="f-file-type" type="text" placeholder="ex: devis, photo, rapport" />
            </div>
            <div class="itv-field">
              <label>Ajouter fichier(s)</label>
              <input class="f-file-input" type="file" accept="application/pdf" multiple />
              <div class="itv-muted">PDF uniquement (bucket). Upload lors de l’enregistrement.</div>
              <div class="pending-files"></div>
            </div>
          </div>
        </div>

        <div class="itv-tab" data-tab="pv">
          <div class="itv-section-title">PV Draft</div>
          <div class="pv-draft"></div>
          <div class="itv-field">
            <label>Uploader un PV draft</label>
            <input class="pv-draft-input" type="file" accept="application/pdf" />
          </div>

          <div class="itv-section-title" style="margin-top:14px;">PV Signé</div>
          <div class="pv-signed"></div>
          <div class="itv-field">
            <label>Uploader un PV signé</label>
            <input class="pv-signed-input" type="file" accept="application/pdf" />
          </div>
        </div>

        <div class="itv-tab" data-tab="summary">
          <div class="itv-grid">
            <div class="itv-card"><div class="k">Référence</div><div class="v s-ref">—</div></div>
            <div class="itv-card"><div class="k">Statut</div><div class="v s-status">—</div></div>
            <div class="itv-card"><div class="k">Client</div><div class="v s-client">—</div></div>
            <div class="itv-card"><div class="k">Adresse</div><div class="v s-address">—</div></div>
            <div class="itv-card"><div class="k">Date</div><div class="v s-date">—</div></div>
            <div class="itv-card"><div class="k">Techniciens</div><div class="v s-techs">—</div></div>
            <div class="itv-card"><div class="k">Tarif</div><div class="v s-tarif">—</div></div>
            <div class="itv-card"><div class="k">Total dépenses</div><div class="v s-expenses">—</div></div>
            <div class="itv-card"><div class="k">Total compensations</div><div class="v s-comps">—</div></div>
            <div class="itv-card"><div class="k">Benefice estimé</div><div class="v s-profit">—</div></div>
          </div>
        </div>

        <div class="itv-actions">
          <button type="button" class="itv-btn secondary itv-prev">Précédent</button>
          <div style="display:flex; gap:10px;">
            <button type="button" class="itv-btn secondary itv-close">Annuler</button>
            <button type="button" class="itv-btn itv-next">Suivant</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => tryCloseModal();
    modal.querySelectorAll(".itv-close").forEach(btn => btn.addEventListener("click", close));
    modal.querySelector(".itv-modal__overlay").addEventListener("click", close);

    if (!document.__itvModalEscBound) {
      document.__itvModalEscBound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
      });
    }

    modal.querySelectorAll(".itv-step").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.step);
        if (modalState.mode === "view" || target <= currentStep) {
          goStep(target);
          return;
        }
        for (let i = currentStep; i < target; i++) {
          const err = validateStep(i);
          if (err) {
            showError(err);
            goStep(i);
            return;
          }
        }
        showError("");
        goStep(target);
      });
    });

    modal.querySelector(".itv-prev").addEventListener("click", () => goStep(currentStep - 1));

    modal.querySelector(".itv-next").addEventListener("click", () => {
      if (modalState.mode === "view") {
        if (currentStep === STEPS.length - 1) tryCloseModal();
        else goStep(currentStep + 1);
        return;
      }
      const err = validateStep(currentStep);
      if (err) { showError(err); return; }
      showError("");
      if (currentStep === STEPS.length - 1) submitModal();
      else goStep(currentStep + 1);
    });

    modal.querySelector(".add-exp-product").addEventListener("click", () => addExpenseRow({ type:"material" }));
    modal.querySelector(".add-exp-extra").addEventListener("click", () => addExpenseRow({ type:"other" }));

    modal.querySelector(".f-file-input").addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const type = modal.querySelector(".f-file-type").value.trim() || "document";
      modalState.pendingFiles.push(...files.map(f => ({ file: f, type })));
      renderPendingFiles();
      refreshDirtyFlag();
    });

    modal.querySelector(".pv-draft-input").addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      modalState.pendingPvDraft = file;
      renderPvSection();
      refreshDirtyFlag();
    });

    modal.querySelector(".pv-signed-input").addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      modalState.pendingPvSigned = file;
      renderPvSection();
      refreshDirtyFlag();
    });

    modal.querySelector(".tech-search").addEventListener("input", (e) => {
      renderTechChecklist(e.target.value);
    });

    modal.querySelectorAll(".f-tarif, .c-amount, .e-unit").forEach((el) => {
      el.addEventListener("blur", () => {
        const v = String(el.value || "").trim();
        if (!v) return;
        el.value = normalizeEuroInput(v);
      });
    });

    modal.querySelector(".itv-modal__panel").addEventListener("input", debounce(() => {
      clearFieldErrors();
      updateSummaryView();
      saveDraft();
      refreshDirtyFlag();
    }, 250));

    modal.querySelector(".itv-modal__panel").addEventListener("focusout", (e) => {
      const target = e.target;
      if (!target?.classList) return;
      if (
        target.classList.contains("f-tarif") ||
        target.classList.contains("c-amount") ||
        target.classList.contains("e-unit")
      ) {
        const v = String(target.value || "").trim();
        if (v) target.value = normalizeEuroInput(v);
        updateSummaryView();
        saveDraft();
        refreshDirtyFlag();
      }
    });

    modal.querySelector(".itv-modal__panel").addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (modalState.mode !== "view" && !modalState.saving) submitModal();
      }
    });

    return modal;
  }

  function switchTab(name) {
    const modal = ensureModalExists();
    modal.querySelectorAll(".itv-tab").forEach(tab => {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
  }

  function openModal() {
    const modal = ensureModalExists();
    syncModalMeta();
    modalState.saving = false;
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = document.querySelector(".itv-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
    const err = modal.querySelector(".itv-modal__error");
    if (err) { err.textContent = ""; err.style.display = "none"; }
    clearFieldErrors();
    modalState.saving = false;
    modalState.dirty = false;
  }

  function setMode(mode) {
    const modal = ensureModalExists();
    modalState.mode = mode;
    syncModalMeta();

    const isView = mode === "view";
    modal.classList.toggle("is-readonly", isView);
    modal.querySelectorAll("input, textarea, select").forEach(el => {
      el.disabled = isView;
    });
    lockReferenceField();
    setDirtyFlag(false);
  }

  function showError(msg) {
    const modal = ensureModalExists();
    const err = modal.querySelector(".itv-modal__error");
    err.textContent = msg;
    err.style.display = msg ? "block" : "none";
  }

  function updateSummaryView() {
    const modal = ensureModalExists();
    const ref = modal.querySelector(".f-ref").value || "—";
    const status = statusLabel(modal.querySelector(".f-status").value);
    const client = modal.querySelector(".f-client").value || "—";
    const address = modal.querySelector(".f-address").value || "—";
    const date = modal.querySelector(".f-start").value ? formatFRDateTime(new Date(modal.querySelector(".f-start").value).toISOString()) : "—";
    const tarif = parseEurosToCents(modal.querySelector(".f-tarif").value);

    const techSelect = modal.querySelector(".f-techs");
    const techNames = Array.from(techSelect.selectedOptions || []).map(o => o.textContent).join(", ") || "—";

    const expTotal = computeExpenseTotalCents();
    const compTotal = computeCompTotalCents();
    const profit = tarif - expTotal - compTotal;

    modal.querySelector(".s-ref").textContent = ref;
    modal.querySelector(".s-status").textContent = status;
    modal.querySelector(".s-client").textContent = client;
    modal.querySelector(".s-address").textContent = address;
    modal.querySelector(".s-date").textContent = date;
    modal.querySelector(".s-techs").textContent = techNames;
    modal.querySelector(".s-tarif").textContent = formatCents(tarif);
    modal.querySelector(".s-expenses").textContent = formatCents(expTotal);
    modal.querySelector(".s-comps").textContent = formatCents(compTotal);
    const profitSummaryEl = modal.querySelector(".s-profit");
    if (profitSummaryEl) {
      profitSummaryEl.textContent = formatCents(profit);
      profitSummaryEl.style.color = profit >= 0 ? "#0f766e" : "#be123c";
    }

    const expEl = modal.querySelector(".exp-total");
    const compEl = modal.querySelector(".comp-total");
    if (expEl) expEl.textContent = formatCents(expTotal);
    if (compEl) compEl.textContent = formatCents(compTotal);

    const mTarif = modal.querySelector(".m-tarif");
    const mExp = modal.querySelector(".m-expenses");
    const mComps = modal.querySelector(".m-comps");
    const mProfit = modal.querySelector(".m-profit");
    if (mTarif) mTarif.textContent = formatCents(tarif);
    if (mExp) mExp.textContent = formatCents(expTotal);
    if (mComps) mComps.textContent = formatCents(compTotal);
    if (mProfit) {
      mProfit.textContent = formatCents(profit);
      mProfit.classList.toggle("is-positive", profit >= 0);
      mProfit.classList.toggle("is-negative", profit < 0);
    }

    updateTechCount();
  }

  function updateTechCount() {
    const modal = ensureModalExists();
    const techSelect = modal.querySelector(".f-techs");
    const count = Array.from(techSelect.selectedOptions || []).length;
    const el = modal.querySelector(".tech-count");
    if (el) el.textContent = `${count} sélectionné${count > 1 ? "s" : ""}`;
  }

  function validateStep(step) {
    const modal = ensureModalExists();
    clearFieldErrors();

    if (step === 0) {
      const refInput = modal.querySelector(".f-ref");
      let ref = refInput.value.trim();
      const client = modal.querySelector(".f-client").value.trim();
      const tarif = parseEurosToCents(modal.querySelector(".f-tarif").value);
      const start = modal.querySelector(".f-start").value;
      const end = modal.querySelector(".f-end").value;

      if (!ref) {
        assignNextReferenceCandidate(true);
        ref = refInput.value.trim();
      }
      if (!/^MBL-\d+$/i.test(ref)) {
        markInvalid([".f-ref"]);
        return "La reference auto doit etre au format MBL-123.";
      }
      if (!client) {
        markInvalid([".f-client"]);
        return "Le client est obligatoire.";
      }
      if (tarif < 0) {
        markInvalid([".f-tarif"]);
        return "Le tarif doit etre positif.";
      }
      if (start && end) {
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && e < s) {
          markInvalid([".f-start", ".f-end"]);
          return "La date de fin doit etre apres la date de debut.";
        }
      }
    }

    if (step === 1) {
      const selected = getSelectedTechs();
      if (!selected.length) {
        return "Selectionne au moins un technicien.";
      }
    }

    if (step === 2) {
      const rows = modal.querySelectorAll(".comp-row");
      for (const row of rows) {
        const v = row.querySelector(".c-amount").value.trim();
        if (v && parseEurosToCents(v) === 0) {
          row.querySelector(".c-amount")?.classList.add("is-invalid");
          return "Montant compensation invalide.";
        }
      }
    }

    if (step === 3) {
      const rows = Array.from(modal.querySelectorAll(".exp-row"));
      for (const row of rows) {
        const type = row.querySelector(".e-type")?.value;
        const qty = parseQty(row.querySelector(".e-qty")?.value);
        const unit = parseEurosToCents(row.querySelector(".e-unit")?.value);
        const product = row.querySelector(".e-product")?.value || "";

        if (qty < 0 || unit < 0) {
          row.querySelector(".e-qty")?.classList.add("is-invalid");
          row.querySelector(".e-unit")?.classList.add("is-invalid");
          return "Les depenses doivent etre positives.";
        }
        if (qty > 0 && unit === 0) {
          row.querySelector(".e-unit")?.classList.add("is-invalid");
          return "Renseigne un cout unitaire valide.";
        }
        if (isProductType(type) && qty > 0 && !product) {
          row.querySelector(".e-product")?.classList.add("is-invalid");
          return "Selectionne un produit pour chaque depense de type produit.";
        }
      }
    }

    return null;
  }

  function validateBeforeSubmit() {
    // Validate only editable logical steps.
    const stepsToCheck = [0, 1, 2, 3];
    for (const s of stepsToCheck) {
      const err = validateStep(s);
      if (err) {
        goStep(s);
        return err;
      }
    }
    return null;
  }

  // =========================
  // DRAFT
  // =========================
  function saveDraft() {
    if (modalState.mode === "view") return;
    const modal = ensureModalExists();
    const key = getDraftStorageKey();
    const data = {
      status: modal.querySelector(".f-status").value,
      title: modal.querySelector(".f-title").value,
      monday: modal.querySelector(".f-monday").value,
      client: modal.querySelector(".f-client").value,
      client_ref: modal.querySelector(".f-client-ref").value,
      phone: modal.querySelector(".f-phone").value,
      tarif: modal.querySelector(".f-tarif").value,
      address: modal.querySelector(".f-address").value,
      start: modal.querySelector(".f-start").value,
      end: modal.querySelector(".f-end").value,
      equipment: modal.querySelector(".f-equipment").value,
      infos: modal.querySelector(".f-infos").value,
      observations: modal.querySelector(".f-observations").value,
    };
    localStorage.setItem(key, JSON.stringify(data));
  }

  function restoreDraft() {
    const modal = ensureModalExists();
    const key = getDraftStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      modal.querySelector(".f-status").value = d.status || "";
      modal.querySelector(".f-title").value = d.title || "";
      modal.querySelector(".f-monday").value = d.monday || "";
      modal.querySelector(".f-client").value = d.client || "";
      modal.querySelector(".f-client-ref").value = d.client_ref || "";
      modal.querySelector(".f-phone").value = d.phone || "";
      modal.querySelector(".f-tarif").value = d.tarif || "";
      modal.querySelector(".f-address").value = d.address || "";
      modal.querySelector(".f-start").value = d.start || "";
      modal.querySelector(".f-end").value = d.end || "";
      modal.querySelector(".f-equipment").value = d.equipment || "";
      modal.querySelector(".f-infos").value = d.infos || "";
      modal.querySelector(".f-observations").value = d.observations || "";
    } catch {}
  }

  function clearDraft() {
    const key = getDraftStorageKey();
    localStorage.removeItem(key);
  }

  // =========================
  // MODAL DATA
  // =========================
  function clearModalFields() {
    const modal = ensureModalExists();
    clearFieldErrors();
    modal.querySelector(".f-ref").value = "";
    modal.querySelector(".f-status").value = "Planifiée";
    modal.querySelector(".f-title").value = "";
    modal.querySelector(".f-monday").value = "";
    modal.querySelector(".f-client").value = "";
    modal.querySelector(".f-client-ref").value = "";
    modal.querySelector(".f-phone").value = "";
    modal.querySelector(".f-tarif").value = "";
    modal.querySelector(".f-address").value = "";
    modal.querySelector(".f-start").value = "";
    modal.querySelector(".f-end").value = "";
    modal.querySelector(".f-equipment").value = "";
    modal.querySelector(".f-infos").value = "";
    modal.querySelector(".f-observations").value = "";
    modal.querySelector(".f-file-type").value = "";

    const techSelect = modal.querySelector(".f-techs");
    Array.from(techSelect.options || []).forEach(o => (o.selected = false));

    modalState.pendingFiles = [];
    modalState.pendingPvDraft = null;
    modalState.pendingPvSigned = null;

    modal.querySelector(".files-list").innerHTML = "";
    modal.querySelector(".exp-rows").innerHTML = "";
    modal.querySelector(".comp-rows").innerHTML = "";
    modal.querySelector(".pending-files").innerHTML = "";
    modal.querySelector(".pv-draft").innerHTML = "";
    modal.querySelector(".pv-signed").innerHTML = "";

    renderTechChecklist();
    updateSummaryView();
    syncModalMeta();
    lockReferenceField();
  }

  function fillModal(intervention, assigns, compensations, expenses, files, pv) {
    const modal = ensureModalExists();
    modal.querySelector(".f-ref").value = intervention.internal_ref || "";
    modal.querySelector(".f-status").value = statusLabel(intervention.status);
    modal.querySelector(".f-title").value = intervention.title || "";
    modal.querySelector(".f-monday").value = intervention.monday_item_id || "";
    modal.querySelector(".f-client").value = intervention.client_name || "";
    modal.querySelector(".f-client-ref").value = intervention.client_ref || "";
    modal.querySelector(".f-phone").value = intervention.support_phone || "";
    modal.querySelector(".f-tarif").value = centsToEurosInput(intervention.tarif);
    modal.querySelector(".f-address").value = intervention.address || "";
    modal.querySelector(".f-start").value = toLocalInputValue(intervention.start_at);
    modal.querySelector(".f-end").value = toLocalInputValue(intervention.end_at);
    modal.querySelector(".f-equipment").value = intervention.equipment_needed || "";
    modal.querySelector(".f-infos").value = intervention.infos || "";
    modal.querySelector(".f-observations").value = intervention.observations || "";

    const techSelect = modal.querySelector(".f-techs");
    const assignIds = (assigns || []).map(a => a.user_id);
    const compTechIds = (compensations || []).map(c => c.tech_id).filter(Boolean);
    const mergedIds = Array.from(new Set([...assignIds, ...compTechIds]));
    Array.from(techSelect.options || []).forEach(o => {
      o.selected = mergedIds.includes(o.value);
    });

    renderTechChecklist();
    renderCompRows(compensations || []);
    renderExpenseRows(expenses || []);
    renderFilesList(files || []);
    renderPvSection(pv || null);

    updateSummaryView();
  }

  // =========================
  // TECH UI
  // =========================
  function getSelectedTechs() {
    const modal = ensureModalExists();
    const select = modal.querySelector(".f-techs");
    return Array.from(select.selectedOptions || []).map(o => ({ id: o.value, name: o.textContent }));
  }

  function setTechSelected(id, selected) {
    const modal = ensureModalExists();
    const select = modal.querySelector(".f-techs");
    const opt = Array.from(select.options).find(o => o.value === id);
    if (opt) opt.selected = selected;
  }

  function renderTechChecklist(filter = "") {
    const modal = ensureModalExists();
    const list = modal.querySelector(".tech-list");
    if (!list) return;

    const q = norm(filter);
    const techs = (techsCache || []).filter(t => {
      if (!q) return true;
      return norm(techFullName(t)).includes(q);
    });

    list.innerHTML = "";
    if (!techs.length) {
      list.innerHTML = `<div class="itv-muted">Aucun technicien</div>`;
      updateTechCount();
      return;
    }

    const selectedSet = new Set(getSelectedTechs().map(t => t.id));

    techs.forEach((t) => {
      const name = techFullName(t);
      const card = document.createElement("label");
      card.className = "tech-card";
      if (selectedSet.has(t.id)) card.classList.add("is-selected");

      card.innerHTML = `
        <input type="checkbox" class="tech-check" ${selectedSet.has(t.id) ? "checked" : ""} />
        <div class="tech-avatar">${techInitials(name)}</div>
        <div>
          <div style="font-weight:800;">${name}</div>
          <div class="tech-meta">${t.id}</div>
        </div>
      `;

      const chk = card.querySelector(".tech-check");
      chk.disabled = modalState.mode === "view";
      chk.addEventListener("change", () => {
        setTechSelected(t.id, chk.checked);
        card.classList.toggle("is-selected", chk.checked);
        renderCompRows();
        updateSummaryView();
        saveDraft();
        refreshDirtyFlag();
      });

      list.appendChild(card);
    });

    updateTechCount();
  }

  // =========================
  // COMPENSATIONS
  // =========================
  function snapshotCompRows() {
    const modal = ensureModalExists();
    const rows = Array.from(modal.querySelectorAll(".comp-row"));
    return rows.map(row => ({
      tech_id: row.dataset.techId,
      amount_cents: parseEurosToCents(row.querySelector(".c-amount").value),
      status: cleanNullableText(row.querySelector(".c-status").value),
      currency: row.querySelector(".c-currency").value.trim() || "EUR",
      notes: row.querySelector(".c-notes").value.trim() || null
    })).filter(c => c.tech_id);
  }

  function renderCompRows(existing = null) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".comp-rows");

    if (!existing) existing = snapshotCompRows();
    const byTech = new Map();
    (existing || []).forEach(c => {
      if (c.tech_id) byTech.set(c.tech_id, c);
    });

    let selected = getSelectedTechs();
    if (!selected.length && existing?.length) {
      selected = existing.map(c => ({ id: c.tech_id, name: techNameById(c.tech_id) }));
    }

    wrap.innerHTML = "";
    selected.forEach((t) => {
      const comp = byTech.get(t.id) || {};
      const row = document.createElement("div");
      row.className = "itv-row comp-row";
      row.dataset.techId = t.id;
      row.innerHTML = `
        <div>
          <div style="font-weight:700;">${t.name}</div>
          <small>${t.id}</small>
        </div>
        <div><input class="c-amount" type="text" placeholder="ex: 50,00" value="${centsToEurosInput(comp.amount_cents)}" /></div>
        <div><input class="c-status" type="text" list="comp-status-list" value="${comp.status || ""}" /></div>
        <div><input class="c-currency" type="text" placeholder="EUR" value="${comp.currency || "EUR"}" /></div>
        <div></div>
        <div style="grid-column:1/-1;">
          <input class="c-notes" type="text" placeholder="Notes" value="${comp.notes || ""}" />
        </div>
      `;
      wrap.appendChild(row);
    });

    const datalist = document.getElementById("comp-status-list");
    if (!datalist) {
      const dl = document.createElement("datalist");
      dl.id = "comp-status-list";
      dl.innerHTML = COMP_STATUS_SUGGESTIONS.map(s => `<option value="${s}"></option>`).join("");
      document.body.appendChild(dl);
    }
  }

  function computeCompTotalCents() {
    const modal = ensureModalExists();
    const rows = Array.from(modal.querySelectorAll(".comp-row"));
    return rows.reduce((sum, row) => {
      const amount = parseEurosToCents(row.querySelector(".c-amount")?.value);
      return sum + (amount || 0);
    }, 0);
  }

  // =========================
  // EXPENSES
  // =========================
  function renderExpenseRows(existing = []) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".exp-rows");
    wrap.innerHTML = "";
    (existing || []).forEach(exp => addExpenseRow(exp));
  }

  function addExpenseRow(exp = {}) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".exp-rows");

    const type = exp.type || "material";
    const row = document.createElement("div");
    row.className = "exp-row";
    row.dataset.expenseId = exp.id || "";
    row.innerHTML = `
      <div class="exp-main">
        <select class="e-type">
          ${EXPENSE_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
        </select>
        <select class="e-product" style="display:none;">${productsOptionsHtml()}</select>
        <input class="e-label" type="text" placeholder="Libellé (ex: déplacement 18 km)" style="display:none;" />
      </div>
      <div><input class="e-qty" type="number" min="0" step="1" /></div>
      <div><input class="e-unit" type="text" placeholder="ex: 12,00" /></div>
      <div class="amount">—</div>
      <div><button type="button" class="itv-btn secondary e-del">✕</button></div>
    `;
    wrap.appendChild(row);

    const typeEl = row.querySelector(".e-type");
    const productEl = row.querySelector(".e-product");
    const labelEl = row.querySelector(".e-label");
    const qtyEl = row.querySelector(".e-qty");
    const unitEl = row.querySelector(".e-unit");
    const amountEl = row.querySelector(".amount");

    typeEl.value = type;
    productEl.value = exp.product_id || "";
    labelEl.value = exp.note || "";
    qtyEl.value = exp.qty ?? "";
    unitEl.value = centsToEurosInput(exp.unit_cost_cents);

    function refresh() {
      const t = typeEl.value;
      if (isProductType(t)) {
        productEl.style.display = "";
        labelEl.style.display = "none";
      } else {
        productEl.style.display = "none";
        labelEl.style.display = "";
      }

      if (isProductType(t)) {
        const pid = productEl.value;
        if (pid && !unitEl.value) {
          const price = productPriceById.get(pid);
          if (price !== undefined) unitEl.value = centsToEurosInput(price);
        }
      }

      const qty = parseQty(qtyEl.value);
      const unit = parseEurosToCents(unitEl.value);
      const amount = qty * unit;
      amountEl.textContent = formatCents(amount || 0);
      updateSummaryView();
    }

    typeEl.addEventListener("change", refresh);
    productEl.addEventListener("change", refresh);
    qtyEl.addEventListener("input", refresh);
    unitEl.addEventListener("input", refresh);
    row.querySelector(".e-del").addEventListener("click", () => {
      row.remove();
      updateSummaryView();
      saveDraft();
      refreshDirtyFlag();
    });

    refresh();
    saveDraft();
    refreshDirtyFlag();
  }

  function computeExpenseTotalCents() {
    const modal = ensureModalExists();
    const rows = Array.from(modal.querySelectorAll(".exp-row"));
    return rows.reduce((sum, row) => {
      const qty = parseQty(row.querySelector(".e-qty")?.value);
      const unit = parseEurosToCents(row.querySelector(".e-unit")?.value);
      return sum + (qty * unit || 0);
    }, 0);
  }

  // =========================
  // FILES
  // =========================
  function renderFilesList(files = []) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".files-list");
    wrap.innerHTML = "";

    if (!files.length) {
      wrap.innerHTML = `<div class="itv-muted">Aucun fichier</div>`;
      return;
    }

    files.forEach((f) => {
      const row = document.createElement("div");
      row.className = "itv-file-row";
      row.dataset.fileId = f.id;
      row.dataset.filePath = f.file_path;
      row.innerHTML = `
        <div>
          <div style="font-weight:700;">${f.type || "Document"}</div>
          <div class="itv-muted">${f.file_path}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="itv-btn secondary f-open">Ouvrir</button>
          <button type="button" class="itv-btn danger f-del">Supprimer</button>
        </div>
      `;
      wrap.appendChild(row);

      row.querySelector(".f-open").addEventListener("click", async () => {
        const { data, error } = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(f.file_path, CONFIG.SIGNED_URL_TTL);
        if (error) return alert("Erreur lien: " + error.message);
        window.open(data.signedUrl, "_blank");
      });

      row.querySelector(".f-del").addEventListener("click", async () => {
        if (!confirm("Supprimer ce fichier ?")) return;
        const { error: storErr } = await supabase.storage.from(CONFIG.BUCKET).remove([f.file_path]);
        if (storErr) return alert(storErr.message);
        const { error: dbErr } = await supabase.from("intervention_files").delete().eq("id", f.id);
        if (dbErr) return alert(dbErr.message);
        row.remove();
      });
    });
  }

  function renderPendingFiles() {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".pending-files");
    wrap.innerHTML = "";
    if (!modalState.pendingFiles.length) return;

    modalState.pendingFiles.forEach((pf, idx) => {
      const div = document.createElement("div");
      div.className = "itv-chip";
      div.textContent = pf.file.name;
      div.style.marginRight = "6px";
      div.style.marginTop = "6px";
      div.addEventListener("click", () => {
        modalState.pendingFiles.splice(idx, 1);
        renderPendingFiles();
        saveDraft();
        refreshDirtyFlag();
      });
      wrap.appendChild(div);
    });
  }

  // =========================
  // PV
  // =========================
  function renderPvSection(pv = null) {
    const modal = ensureModalExists();
    const draftWrap = modal.querySelector(".pv-draft");
    const signedWrap = modal.querySelector(".pv-signed");

    draftWrap.innerHTML = pv?.pv_draft_path
      ? `<div class="itv-pv-row"><div>${pv.pv_draft_path}</div><button type="button" class="itv-btn secondary pv-open-draft">Ouvrir</button></div>`
      : `<div class="itv-muted">Aucun PV draft</div>`;

    signedWrap.innerHTML = pv?.pv_signed_path
      ? `<div class="itv-pv-row"><div>${pv.pv_signed_path}</div><button type="button" class="itv-btn secondary pv-open-signed">Ouvrir</button></div>`
      : `<div class="itv-muted">Aucun PV signé</div>`;

    const draftBtn = draftWrap.querySelector(".pv-open-draft");
    if (draftBtn && pv?.pv_draft_path) {
      draftBtn.addEventListener("click", async () => {
        const { data, error } = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(pv.pv_draft_path, CONFIG.SIGNED_URL_TTL);
        if (error) return alert("Erreur lien: " + error.message);
        window.open(data.signedUrl, "_blank");
      });
    }

    const signedBtn = signedWrap.querySelector(".pv-open-signed");
    if (signedBtn && pv?.pv_signed_path) {
      signedBtn.addEventListener("click", async () => {
        const { data, error } = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(pv.pv_signed_path, CONFIG.SIGNED_URL_TTL);
        if (error) return alert("Erreur lien: " + error.message);
        window.open(data.signedUrl, "_blank");
      });
    }

    if (modalState.pendingPvDraft) {
      const chip = document.createElement("div");
      chip.className = "itv-chip";
      chip.textContent = "Draft à uploader: " + modalState.pendingPvDraft.name;
      draftWrap.appendChild(chip);
    }
    if (modalState.pendingPvSigned) {
      const chip = document.createElement("div");
      chip.className = "itv-chip";
      chip.textContent = "Signé à uploader: " + modalState.pendingPvSigned.name;
      signedWrap.appendChild(chip);
    }
  }

  // =========================
  // SUBMIT
  // =========================
  async function submitModal() {
    const modal = ensureModalExists();
    if (modalState.saving) return;
    showError("");
    clearFieldErrors();

    const preErr = validateBeforeSubmit();
    if (preErr) {
      showError(preErr);
      return;
    }

    modalState.saving = true;
    const nextBtn = modal.querySelector(".itv-next");
    const prevText = nextBtn ? nextBtn.textContent : "";
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Enregistrement...";
    }

    const payload = {
      internal_ref: modal.querySelector(".f-ref").value.trim(),
      status: toDbStatus(modal.querySelector(".f-status").value),

      title: modal.querySelector(".f-title").value.trim() || null,
      monday_item_id: modal.querySelector(".f-monday").value.trim() || null,
      client_name: modal.querySelector(".f-client").value.trim() || null,
      client_ref: modal.querySelector(".f-client-ref").value.trim() || null,
      support_phone: modal.querySelector(".f-phone").value.trim() || null,
      address: modal.querySelector(".f-address").value.trim() || null,
      start_at: modal.querySelector(".f-start").value ? new Date(modal.querySelector(".f-start").value).toISOString() : null,
      end_at: modal.querySelector(".f-end").value ? new Date(modal.querySelector(".f-end").value).toISOString() : null,
      equipment_needed: modal.querySelector(".f-equipment").value.trim() || null,
      infos: modal.querySelector(".f-infos").value.trim() || null,
      observations: modal.querySelector(".f-observations").value.trim() || null,
      tarif: parseEurosToCents(modal.querySelector(".f-tarif").value),
    };

    try {
      if (modalState.mode === "add") {
        payload.internal_ref = await resolveAvailableReference(payload.internal_ref || getNextReferenceCandidate());
        const refInput = modal.querySelector(".f-ref");
        if (refInput) refInput.value = payload.internal_ref;
      } else if (!payload.internal_ref) {
        throw new Error("La reference est obligatoire.");
      }

      const techIds = getSelectedTechs().map(t => t.id);

      const compRows = Array.from(modal.querySelectorAll(".comp-row")).map(row => ({
        tech_id: row.dataset.techId,
        amount_cents: parseEurosToCents(row.querySelector(".c-amount").value),
        status: cleanNullableText(row.querySelector(".c-status").value),
        currency: row.querySelector(".c-currency").value.trim() || "EUR",
        notes: row.querySelector(".c-notes").value.trim() || null
      })).filter(c => c.tech_id);

      const expRows = Array.from(modal.querySelectorAll(".exp-row")).map(row => {
        const type = row.querySelector(".e-type").value;
        const product_id = row.querySelector(".e-product").value || null;
        const note = row.querySelector(".e-label").value.trim() || null;
        const qty = parseQty(row.querySelector(".e-qty").value);
        const unit_cost_cents = parseEurosToCents(row.querySelector(".e-unit").value);
        const amount_cents = qty * unit_cost_cents;
        return { type, product_id, note, qty, unit_cost_cents, amount_cents };
      }).filter(r => r.qty > 0 || r.amount_cents > 0);

      let interventionId = modalState.id;

      if (modalState.mode === "add") {
        payload.pv_status = "none";
        payload.pv_source = null;

        const { data, error } = await supabase
          .from("interventions")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        interventionId = data.id;
        modalState.id = interventionId;
        markReferenceUsed(payload.internal_ref);
      } else {
        const { error } = await supabase
          .from("interventions")
          .update(payload)
          .eq("id", interventionId);
        if (error) throw new Error(error.message);
      }

      await supabase.from("intervention_assignees").delete().eq("intervention_id", interventionId);
      if (techIds.length) {
        const rows = techIds.map(uid => ({ intervention_id: interventionId, user_id: uid }));
        const { error } = await supabase.from("intervention_assignees").insert(rows);
        if (error) throw new Error("Assignations: " + error.message);
      }

      await supabase.from("intervention_compensations").delete().eq("intervention_id", interventionId);
      if (compRows.length) {
        const rows = compRows.map(c => ({ ...c, intervention_id: interventionId }));
        const { error } = await supabase.from("intervention_compensations").insert(rows);
        if (error) throw new Error("Compensations: " + error.message);
      }

      await supabase.from("intervention_expenses").delete().eq("intervention_id", interventionId);
      if (expRows.length) {
        const rows = expRows.map(e => ({ ...e, intervention_id: interventionId }));
        const { error } = await supabase.from("intervention_expenses").insert(rows);
        if (error) throw new Error("Dépenses: " + error.message);
      }

      if (modalState.pendingFiles.length) {
        for (const pf of modalState.pendingFiles) {
          const path = `interventions/${interventionId}/${Date.now()}_${safeFileName(pf.file.name)}`;
          const { error: upErr } = await supabase.storage.from(CONFIG.BUCKET).upload(path, pf.file);
          if (upErr) throw new Error("Upload fichier: " + upErr.message);

          const { error: insErr } = await supabase.from("intervention_files").insert({
            intervention_id: interventionId,
            type: pf.type || "document",
            file_path: path
          });
          if (insErr) throw new Error("Enregistrement fichier: " + insErr.message);
        }
        modalState.pendingFiles = [];
      }

      if (modalState.pendingPvDraft || modalState.pendingPvSigned) {
        const pvPayload = { intervention_id: interventionId };
        if (modalState.pendingPvDraft) {
          const path = `interventions/${interventionId}/pv/draft_${Date.now()}_${safeFileName(modalState.pendingPvDraft.name)}`;
          const { error: upErr } = await supabase.storage.from(CONFIG.BUCKET).upload(path, modalState.pendingPvDraft);
          if (upErr) throw new Error("Upload PV draft: " + upErr.message);
          pvPayload.pv_draft_path = path;
          pvPayload.draft_origin = PV_ORIGIN_DEFAULT;
          pvPayload.draft_uploaded_at = new Date().toISOString();
        }
        if (modalState.pendingPvSigned) {
          const path = `interventions/${interventionId}/pv/signed_${Date.now()}_${safeFileName(modalState.pendingPvSigned.name)}`;
          const { error: upErr } = await supabase.storage.from(CONFIG.BUCKET).upload(path, modalState.pendingPvSigned);
          if (upErr) throw new Error("Upload PV signé: " + upErr.message);
          pvPayload.pv_signed_path = path;
          pvPayload.signed_origin = PV_ORIGIN_DEFAULT;
          pvPayload.signed_uploaded_at = new Date().toISOString();
        }

        const { data: pvExists } = await supabase
          .from("intervention_pv")
          .select("intervention_id")
          .eq("intervention_id", interventionId)
          .maybeSingle();

        if (pvExists) {
          const { error } = await supabase
            .from("intervention_pv")
            .update(pvPayload)
            .eq("intervention_id", interventionId);
          if (error) throw new Error("PV: " + error.message);
        } else {
          const { error } = await supabase
            .from("intervention_pv")
            .insert(pvPayload);
          if (error) throw new Error("PV: " + error.message);
        }

        modalState.pendingPvDraft = null;
        modalState.pendingPvSigned = null;
      }

      clearDraft();
      resetDirtyBaseline();
      closeModal();
      await loadInterventions();
    } catch (e) {
      console.error(e);
      showError(e?.message || "Erreur lors de l’enregistrement");
    } finally {
      modalState.saving = false;
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = prevText || "Enregistrer";
      }
    }
  }

  // =========================
  // DELETE MODAL
  // =========================
  function ensureDeleteModalExists() {
    let modal = document.querySelector(".delete-itv-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "delete-itv-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100000; display:none; font-family:inherit;";

    modal.innerHTML = `
      <style>
        .delete-itv-modal__overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 31, 53, 0.42);
          backdrop-filter: blur(2px);
        }
        .delete-itv-modal__content {
          position: relative;
          width: min(520px, calc(100vw - 24px));
          background: linear-gradient(180deg, #ffffff, #f6faff);
          border: 1px solid #d6e2ee;
          border-radius: 14px;
          padding: 18px 18px 16px;
          margin: 12px auto;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 20px 60px rgba(12, 37, 66, 0.24);
          color: #10233f;
        }
        .delete-itv-modal__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .delete-itv-modal__title {
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 6px;
          color: #143a61;
        }
        .delete-itv-modal__subtitle {
          color: #55708c;
          line-height: 1.4;
        }
        .delete-itv-modal__close {
          border: 1px solid #cfdeeb;
          background: #ffffff;
          color: #0c4a6e;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 800;
        }
        .delete-itv-modal__target {
          margin-top: 14px;
          padding: 12px;
          border: 1px solid #d6e2ee;
          border-radius: 12px;
          background: #fff;
        }
        .delete-itv-modal__target-label {
          color: #5a7490;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .delete-itv-modal__label { font-weight: 800; color: #143a61; }
        .delete-itv-modal__actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 14px;
        }
        .delete-itv-modal__confirm-wrap {
          margin-top: 12px;
          padding: 10px;
          border: 1px dashed #d8e4ef;
          border-radius: 10px;
          background: #fbfdff;
        }
        .delete-itv-modal__confirm-wrap-label {
          font-size: 12px;
          color: #5a7490;
          margin-bottom: 6px;
          font-weight: 600;
        }
        .delete-itv-modal__confirm-input {
          width: 100%;
          border: 1px solid #cfdeeb;
          border-radius: 10px;
          padding: 9px 10px;
          outline: none;
          color: #10233f;
          background: #fff;
        }
        .delete-itv-modal__confirm-input:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
        }
        .delete-itv-modal__cancel {
          border: 1px solid #cfdeeb;
          background: #fff;
          color: #0c4a6e;
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
        }
        .delete-itv-modal__confirm {
          border: none;
          background: linear-gradient(120deg, #ef4444, #be123c);
          color: #fff;
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 800;
        }
        .delete-itv-modal__confirm:disabled {
          opacity: .5;
          cursor: not-allowed;
          filter: grayscale(.15);
        }
        .delete-itv-modal__error {
          display: none;
          margin-top: 10px;
          color: #9f1733;
          font-weight: 600;
          background: #fff1f4;
          border: 1px solid #ffc9d2;
          border-radius: 10px;
          padding: 9px 10px;
        }
      </style>

      <div class="delete-itv-modal__overlay"></div>
      <div class="delete-itv-modal__content">
        <div class="delete-itv-modal__header">
          <div>
            <div class="delete-itv-modal__title">Confirmer la suppression</div>
            <div class="delete-itv-modal__subtitle">Voulez-vous vraiment supprimer cette intervention ?</div>
          </div>
          <button type="button" class="delete-itv-modal__close">✕</button>
        </div>

        <div class="delete-itv-modal__target">
          <div class="delete-itv-modal__target-label">Intervention</div>
          <div class="delete-itv-modal__label">—</div>
        </div>

        <div class="delete-itv-modal__confirm-wrap">
          <div class="delete-itv-modal__confirm-wrap-label">Saisis la reference pour confirmer</div>
          <input class="delete-itv-modal__confirm-input" type="text" placeholder="Reference exacte" />
        </div>

        <div class="delete-itv-modal__actions">
          <button type="button" class="delete-itv-modal__cancel">Annuler</button>
          <button type="button" class="delete-itv-modal__confirm">Supprimer</button>
        </div>

        <div class="delete-itv-modal__error"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeDeleteModal();
    modal.querySelector(".delete-itv-modal__overlay").addEventListener("click", close);
    modal.querySelector(".delete-itv-modal__close").addEventListener("click", close);
    modal.querySelector(".delete-itv-modal__cancel").addEventListener("click", close);

    return modal;
  }

  function closeDeleteModal() {
    const modal = document.querySelector(".delete-itv-modal");
    if (!modal) return;
    modal.style.display = "none";
  }

  function openDeleteModal({ interventionId, label }) {
    const modal = ensureDeleteModalExists();
    modal.style.display = "block";
    modal.dataset.interventionId = interventionId || "";

    const labelEl = modal.querySelector(".delete-itv-modal__label");
    const errEl = modal.querySelector(".delete-itv-modal__error");
    const confirmBtn = modal.querySelector(".delete-itv-modal__confirm");
    const confirmInput = modal.querySelector(".delete-itv-modal__confirm-input");

    if (labelEl) labelEl.textContent = label || "—";
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    if (confirmInput) confirmInput.value = "";
    if (confirmBtn) confirmBtn.disabled = true;

    const expected = String(label || "").trim();
    const refreshDeleteGate = () => {
      if (!confirmBtn) return;
      const typed = String(confirmInput?.value || "").trim();
      confirmBtn.disabled = !expected || typed !== expected;
    };
    if (confirmInput) confirmInput.oninput = refreshDeleteGate;
    refreshDeleteGate();

    confirmBtn.onclick = async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Suppression...";

        await supabase.from("intervention_compensations").delete().eq("intervention_id", interventionId);
        await supabase.from("intervention_assignees").delete().eq("intervention_id", interventionId);
        await supabase.from("intervention_expenses").delete().eq("intervention_id", interventionId);
        await supabase.from("intervention_files").delete().eq("intervention_id", interventionId);
        await supabase.from("intervention_pv").delete().eq("intervention_id", interventionId);

        const { error: itvErr } = await supabase.from("interventions").delete().eq("id", interventionId);
        if (itvErr) throw new Error(itvErr.message);

        closeDeleteModal();
        await loadInterventions();
      } catch (e) {
        console.error(e);
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = e?.message || "Erreur lors de la suppression";
        }
      } finally {
        refreshDeleteGate();
        confirmBtn.textContent = "Supprimer";
      }
    };
  }

  // =========================
  // OPEN MODAL
  // =========================
  async function openInterventionModal(mode, id = null) {
    const modal = ensureModalExists();
    showError("");
    modalState.id = id;
    setMode(mode);

    await loadTechs();
    await loadProducts();
    await populateTechSelect(modal.querySelector(".f-techs"));

    clearModalFields();

    openModal();

    if (mode === "add") {
      restoreDraft();
      assignNextReferenceCandidate(true);
      renderCompRows([]);
      renderExpenseRows([]);
      renderFilesList([]);
      renderPvSection(null);
      goStep(0);
      resetDirtyBaseline();
      return;
    }

    try {
      const bundle = await loadInterventionBundle(id);
      fillModal(bundle.intervention, bundle.assigns, bundle.compensations, bundle.expenses, bundle.files, bundle.pv);
      goStep(mode === "view" ? STEPS.length - 1 : 0);
      resetDirtyBaseline();
    } catch (e) {
      console.error(e);
      showError("Erreur chargement intervention: " + e.message);
    }
  }

  // =========================
  // CLICK HANDLERS
  // =========================
  document.addEventListener("click", async (e) => {
    const withModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

    const addBtn = e.target.closest("a.add-intervention, .add-intervention");
    if (addBtn) {
      e.preventDefault?.();
      await openInterventionModal("add");
      return;
    }

    const showBtn = e.target.closest("a.show-intervention, .show-intervention");
    if (showBtn) {
      if (!(withModifier && showBtn.tagName === "A")) {
        e.preventDefault?.();
        const row = showBtn.closest(".intervention-row");
        const id = row?.dataset?.interventionId;
        if (id) await openInterventionModal("view", id);
        return;
      }
    }

    const editBtn = e.target.closest("a.update-intervention, .update-intervention");
    if (editBtn) {
      if (!(withModifier && editBtn.tagName === "A")) {
        e.preventDefault?.();
        const row = editBtn.closest(".intervention-row");
        const id = row?.dataset?.interventionId;
        if (id) await openInterventionModal("edit", id);
        return;
      }
    }

    const delBtn = e.target.closest("a.delete-intervention, .delete-intervention");
    if (delBtn) {
      e.preventDefault();
      const row = delBtn.closest(".intervention-row");
      const id = row?.dataset?.interventionId;
      const ref = row?.querySelector(".ref-intervention")?.textContent?.trim()
        || row?.dataset?.reference
        || "—";
      if (!id) return;
      openDeleteModal({ interventionId: id, label: ref });
      return;
    }
  }, true);

  // =========================
  // INIT
  // =========================
  await loadInterventions();
  applyFilter(searchInput?.value || "");
});
