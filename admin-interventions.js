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

  const STATUS_OPTIONS = [
    "Planifiée",
    "En attente",
    "En cours",
    "Confirmée",
    "Terminée",
    "Annulée"
  ];

  const COMP_STATUS_SUGGESTIONS = [
    "earned",
    "approved",
    "invoiced",
    "paid",
    "canceled"
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

  // =========================
  // LISTING
  // =========================
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
    rowEl.dataset.status = itv.status || "";
    rowEl.dataset.datefr = formatFRDateTime(itv.start_at);
  }

  async function loadInterventions() {
    document.querySelectorAll(".intervention-row").forEach((row, idx) => {
      if (idx > 0) row.remove();
    });

    const { data: interventions, error } = await supabase
      .from("interventions")
      .select("id, internal_ref, client_name, address, start_at, status, tarif")
      .order("start_at", { ascending: false });

    if (error) {
      console.error("[INTERVENTIONS] load error:", error);
      fillRow(firstRow, { id:"", internal_ref:"Erreur chargement", client_name:"—", address:"—", status:"—", tarif:null });
      return;
    }

    const list = interventions || [];
    if (!list.length) {
      fillRow(firstRow, { id:"", internal_ref:"Aucune intervention", client_name:"—", address:"—", status:"—", tarif:null });
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
      return { ...itv, technician_name: names.length ? Array.from(new Set(names)).join(", ") : "—" };
    });

    fillRow(firstRow, enriched[0]);
    for (let i = 1; i < enriched.length; i++) {
      const clone = firstRow.cloneNode(true);
      fillRow(clone, enriched[i]);
      firstRow.parentElement.appendChild(clone);
    }

    if (searchInput) applyFilter(searchInput.value);
  }

  // =========================
  // SEARCH
  // =========================
  function rowSearchText(row) {
    const ref = row.dataset.reference || row.querySelector(".ref-intervention")?.textContent || "";
    const client = row.dataset.client || row.querySelector(".client-intervention")?.textContent || "";
    const tech = row.dataset.tech || row.querySelector(".technician-intervention")?.textContent || "";
    const status = row.dataset.status || row.querySelector(".status-intervention")?.textContent || "";
    const datefr = row.dataset.datefr || row.querySelector(".date-intervention")?.textContent || "";
    return norm(`${ref} ${client} ${tech} ${status} ${datefr}`);
  }

  function applyFilter(qRaw) {
    const q = norm(qRaw);
    const rows = Array.from(document.querySelectorAll(".intervention-row"));
    if (!rows.length) return;

    rows.forEach((row) => {
      const hay = rowSearchText(row);
      row.style.display = (!q || hay.includes(q)) ? "" : "none";
    });
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
  // MODAL (WIZARD)
  // =========================
  let modalState = {
    mode: "view",
    id: null,
    pendingFiles: [],
    pendingPvDraft: null,
    pendingPvSigned: null
  };

  function goStep(idx) {
    const modal = ensureModalExists();
    currentStep = Math.max(0, Math.min(STEPS.length - 1, idx));
    switchTab(STEPS[currentStep]);

    modal.querySelectorAll(".itv-step").forEach((b, i) => {
      b.classList.toggle("is-active", i === currentStep);
    });

    modal.querySelector(".itv-prev").disabled = currentStep === 0;
    modal.querySelector(".itv-next").textContent = currentStep === STEPS.length - 1 ? "Enregistrer" : "Suivant";

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
        .itv-modal__overlay { position:absolute; inset:0; background:rgba(9,24,30,.65); backdrop-filter: blur(3px); }
        .itv-modal__panel {
          position:relative; width:min(1000px, calc(100vw - 32px));
          max-height:calc(100vh - 32px); overflow:auto;
          background:#fff; border-radius:18px; padding:18px;
          margin:16px auto; top:50%; transform:translateY(-50%);
          box-shadow:0 25px 80px rgba(0,0,0,.35);
        }
        .itv-modal__header {
          display:flex; justify-content:space-between; align-items:center; gap:12px;
          background:linear-gradient(120deg,#0f766e,#0c4a6e);
          color:#fff; border-radius:14px; padding:14px 16px;
        }
        .itv-modal__title { font-size:20px; font-weight:800; }
        .itv-modal__subtitle { opacity:.85; }
        .itv-btn { border:none; background:#0f766e; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800; }
        .itv-btn.secondary { border:1px solid #e5e7eb; background:#fff; color:#111827; font-weight:700; }
        .itv-btn.danger { background:#ef4444; }
        .itv-stepper { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .itv-step { border:1px solid #e5e7eb; background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-weight:700; font-size:12px; }
        .itv-step.is-active { background:#0f766e; color:#fff; border-color:#0f766e; }
        .itv-tab { display:none; margin-top:14px; }
        .itv-tab.is-active { display:block; }
        .itv-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .itv-field label { font-size:12px; opacity:.7; display:block; margin-bottom:6px; }
        .itv-field input, .itv-field textarea, .itv-field select {
          width:100%; padding:11px 12px; border:1px solid #e5e7eb; border-radius:12px;
          font-family:inherit; background:#fcfcfd;
        }
        .itv-card { padding:12px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc; }
        .itv-card .k { font-size:12px; opacity:.6; }
        .itv-card .v { font-weight:800; }
        .itv-row { display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 40px; gap:8px; align-items:center; }
        .itv-row input, .itv-row select { padding:8px 10px; }
        .itv-row .amount { font-weight:800; text-align:right; }
        .itv-section-title { font-weight:800; margin:8px 0; }
        .itv-table-head { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr 40px; gap:8px; font-size:12px; opacity:.6; margin:8px 0; }
        .itv-file-row, .itv-pv-row { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; margin-top:8px; }
        .itv-chip { display:inline-flex; align-items:center; padding:4px 8px; background:#f3f4f6; border-radius:999px; font-size:12px; font-weight:700; }
        .itv-modal__error { display:none; margin-top:10px; color:#b91c1c; font-weight:600; }
        .itv-actions { display:flex; justify-content:space-between; margin-top:14px; }
        .itv-muted { opacity:.7; font-size:12px; }
        .itv-draft { font-size:12px; opacity:.7; }
      </style>

      <div class="itv-modal__overlay"></div>
      <div class="itv-modal__panel">
        <div class="itv-modal__header">
          <div>
            <div class="itv-modal__title">Intervention</div>
            <div class="itv-modal__subtitle">Parcours guidé</div>
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

        <div class="itv-modal__error"></div>
        <div class="itv-draft"></div>

        <div class="itv-tab" data-tab="infos"> ... </div>
        <div class="itv-tab" data-tab="techs"> ... </div>
        <div class="itv-tab" data-tab="comps"> ... </div>
        <div class="itv-tab" data-tab="expenses"> ... </div>
        <div class="itv-tab" data-tab="files"> ... </div>
        <div class="itv-tab" data-tab="pv"> ... </div>

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

    const close = () => closeModal();
    modal.querySelectorAll(".itv-close").forEach(btn => btn.addEventListener("click", close));
    modal.querySelector(".itv-modal__overlay").addEventListener("click", close);

    modal.querySelectorAll(".itv-step").forEach(btn => {
      btn.addEventListener("click", () => goStep(Number(btn.dataset.step)));
    });

    modal.querySelector(".itv-prev").addEventListener("click", () => goStep(currentStep - 1));

    modal.querySelector(".itv-next").addEventListener("click", () => {
      const err = validateStep(currentStep);
      if (err) { showError(err); return; }
      showError("");
      if (currentStep === STEPS.length - 1) submitModal();
      else goStep(currentStep + 1);
    });

    modal.querySelector(".itv-modal__panel").addEventListener("input", debounce(saveDraft, 400));

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
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = document.querySelector(".itv-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
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

    modal.querySelector(".s-ref").textContent = ref;
    modal.querySelector(".s-status").textContent = status;
    modal.querySelector(".s-client").textContent = client;
    modal.querySelector(".s-address").textContent = address;
    modal.querySelector(".s-date").textContent = date;
    modal.querySelector(".s-techs").textContent = techNames;
    modal.querySelector(".s-tarif").textContent = formatCents(tarif);
    modal.querySelector(".s-expenses").textContent = formatCents(computeExpenseTotalCents());
    modal.querySelector(".s-comps").textContent = formatCents(computeCompTotalCents());
  }

  function validateStep(step) {
    const modal = ensureModalExists();
    if (step === 0) {
      const ref = modal.querySelector(".f-ref").value.trim();
      if (!ref) return "La référence est obligatoire.";
    }
    if (step === 2) {
      const rows = modal.querySelectorAll(".comp-row");
      for (const row of rows) {
        const v = row.querySelector(".c-amount").value.trim();
        if (v && parseEurosToCents(v) === 0) return "Montant compensation invalide.";
      }
    }
    return null;
  }

  function saveDraft() {
    const modal = ensureModalExists();
    const key = modalState.mode === "edit" ? `itvDraft:${modalState.id}` : "itvDraft:new";
    const data = {
      ref: modal.querySelector(".f-ref").value,
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
    modal.querySelector(".itv-draft").textContent = "Brouillon sauvegardé";
  }

  function restoreDraft() {
    const modal = ensureModalExists();
    const key = modalState.mode === "edit" ? `itvDraft:${modalState.id}` : "itvDraft:new";
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      modal.querySelector(".f-ref").value = d.ref || "";
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
      modal.querySelector(".itv-draft").textContent = "Brouillon restauré";
    } catch {}
  }

  // =========================
  // SUBMIT
  // =========================
  async function submitModal() {
    const modal = ensureModalExists();
    const rawStatus = cleanNullableText(modal.querySelector(".f-status").value);
    const safeStatus = rawStatus || "Planifiée";

    const payload = {
      internal_ref: modal.querySelector(".f-ref").value.trim(),
      status: safeStatus,
      pv_status: "none",
      pv_source: null,

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

    if (!payload.internal_ref) {
      showError("La référence est obligatoire.");
      return;
    }

    try {
      let interventionId = modalState.id;

      if (modalState.mode === "add") {
        const { data, error } = await supabase
          .from("interventions")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        interventionId = data.id;
        modalState.id = interventionId;
      } else {
        const { error } = await supabase
          .from("interventions")
          .update(payload)
          .eq("id", interventionId);
        if (error) throw new Error(error.message);
      }

      localStorage.removeItem(modalState.mode === "edit" ? `itvDraft:${interventionId}` : "itvDraft:new");
      closeModal();
      await loadInterventions();
    } catch (e) {
      console.error(e);
      showError(e?.message || "Erreur lors de l’enregistrement");
    }
  }

  // =========================
  // OPEN MODAL
  // =========================
  async function openInterventionModal(mode, id = null) {
    const modal = ensureModalExists();
    showError("");
    modalState.id = id;
    modalState.mode = mode;

    await loadTechs();
    await loadProducts();

    clearModalFields();
    restoreDraft();
    goStep(0);
    openModal();
  }

  // =========================
  // INIT
  // =========================
  await loadInterventions();
});
