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

  const COMP_STATUS_SUGGESTIONS = [
    "earned",
    "approved",
    "invoiced",
    "paid",
    "canceled"
  ];

  const PV_ORIGIN_DEFAULT = "admin";

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
    return (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  const eurosToCents = (typeof window.eurosToCents === "function")
    ? window.eurosToCents
    : function eurosToCentsLocal(value) {
        const s = String(value || "")
          .replace(/\s/g, "")
          .replace("€", "")
          .replace(",", ".");
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

  function debounce(fn, wait = 120) {
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

  // =========================
  // LISTING
  // =========================
  const firstRow = document.querySelector(".intervention-row");
  if (!firstRow) {
    console.error("[ADMIN INTERVENTIONS] .intervention-row introuvable (template).");
    return;
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

  function applyStatus(statusEl, statusValue) {
    if (!statusEl) return;
    statusEl.classList.remove("is-planned","is-pending","is-progress","is-done","is-canceled");

    const key = normalizeStatus(statusValue);
    const conf = STATUS_MAP[key] || STATUS_MAP[key.replace(/\s/g, "_")] || null;

    if (!conf) {
      statusEl.textContent = statusValue || "—";
      return;
    }
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

    const href = `${PAGE_INTERVENTION}?id=${encodeURIComponent(itv.id || "")}`;

    const showA = rowEl.querySelector("a.show-intervention");
    const updateA = rowEl.querySelector("a.update-intervention");
    const upgradeA = rowEl.querySelector("a.upgrade-intervention");

    if (showA) showA.href = href;
    if (updateA) updateA.href = href;
    if (upgradeA) upgradeA.href = href;
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

    const { data: assigns, error: aErr } = await supabase
      .from("intervention_assignees")
      .select("intervention_id, user_id")
      .in("intervention_id", ids);

    if (aErr) console.warn("[ASSIGNEES] error:", aErr.message);

    const userIdsByInterv = new Map();
    (assigns || []).forEach((a) => {
      if (!a?.intervention_id || !a?.user_id) return;
      if (!userIdsByInterv.has(a.intervention_id)) userIdsByInterv.set(a.intervention_id, []);
      userIdsByInterv.get(a.intervention_id).push(a.user_id);
    });

    const allUserIds = Array.from(new Set((assigns || []).map(a => a.user_id).filter(Boolean)));

    const nameById = new Map();
    if (allUserIds.length) {
      const { data: users, error: uErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, name, email")
        .in("id", allUserIds);

      if (uErr) console.warn("[PROFILES] error:", uErr.message);

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
      const ok = !q || hay.includes(q);
      row.style.display = ok ? "" : "none";
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

    if (error) {
      console.warn("[TECHS] load error:", error.message);
      techsCache = [];
      return techsCache;
    }

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
      .select("id, name, price_cents, unit_cost_cents, is_active")
      .order("name", { ascending: true })
    );

    if (error) {
      console.warn("[PRODUCTS] fallback without price fields:", error.message);
      ({ data, error } = await supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name")
        .order("name", { ascending: true })
      );
    }

    if (error) {
      console.warn("[PRODUCTS] load error:", error.message);
      productsCache = [];
      return productsCache;
    }

    productsCache = data || [];
    productPriceById = new Map();
    productsCache.forEach((p) => {
      const price = p.price_cents ?? p.unit_cost_cents ?? null;
      if (price !== null && price !== undefined) {
        productPriceById.set(p.id, price);
      }
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

  function productNameById(id) {
    const p = (productsCache || []).find(x => x.id === id);
    return p?.name || "Produit";
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
  // MODAL (VIEW/EDIT/ADD)
  // =========================
  let modalState = {
    mode: "view",
    id: null,
    pendingFiles: [],
    pendingPvDraft: null,
    pendingPvSigned: null
  };

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
          position:absolute; inset:0; background:rgba(0,0,0,.55);
        }
        .itv-modal__panel {
          position:relative; width:min(980px, calc(100vw - 32px));
          max-height:calc(100vh - 32px); overflow:auto;
          background:#fff; border-radius:16px; padding:18px;
          margin:16px auto; top:50%; transform:translateY(-50%);
          box-shadow:0 20px 70px rgba(0,0,0,.35);
        }
        .itv-modal__header {
          display:flex; justify-content:space-between; align-items:center; gap:12px;
        }
        .itv-modal__title { font-size:20px; font-weight:800; }
        .itv-modal__subtitle { opacity:.7; }
        .itv-btn {
          border:none; background:#0f766e; color:#fff; padding:10px 14px;
          border-radius:10px; cursor:pointer; font-weight:800;
        }
        .itv-btn.secondary {
          border:1px solid #e5e7eb; background:#fff; color:#111827; font-weight:700;
        }
        .itv-btn.danger {
          background:#ef4444;
        }
        .itv-tabs {
          display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;
        }
        .itv-tab-btn {
          border:1px solid #e5e7eb; background:#f9fafb; padding:8px 12px;
          border-radius:10px; cursor:pointer; font-weight:700;
        }
        .itv-tab-btn.is-active {
          background:#0f766e; color:#fff; border-color:#0f766e;
        }
        .itv-tab {
          display:none; margin-top:14px;
        }
        .itv-tab.is-active { display:block; }
        .itv-grid {
          display:grid; grid-template-columns:1fr 1fr; gap:12px;
        }
        .itv-field label { font-size:12px; opacity:.7; display:block; margin-bottom:6px; }
        .itv-field input, .itv-field textarea, .itv-field select {
          width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;
          font-family:inherit;
        }
        .itv-card {
          padding:12px; border:1px solid #e5e7eb; border-radius:12px;
        }
        .itv-card .k { font-size:12px; opacity:.6; }
        .itv-card .v { font-weight:800; }
        .itv-row {
          display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 40px; gap:8px; align-items:center;
        }
        .itv-row small { opacity:.6; }
        .itv-row input, .itv-row select { padding:8px 10px; }
        .itv-row .amount { font-weight:800; text-align:right; }
        .itv-section-title { font-weight:800; margin:8px 0; }
        .itv-table-head {
          display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr 40px; gap:8px;
          font-size:12px; opacity:.6; margin:8px 0;
        }
        .itv-file-row, .itv-pv-row {
          display:flex; justify-content:space-between; gap:12px; align-items:center;
          padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; margin-top:8px;
        }
        .itv-chip {
          display:inline-flex; align-items:center; padding:4px 8px; background:#f3f4f6; border-radius:999px; font-size:12px; font-weight:700;
        }
        .itv-modal__error {
          display:none; margin-top:10px; color:#b91c1c; font-weight:600;
        }
        .itv-actions {
          display:flex; gap:10px; justify-content:flex-end; margin-top:14px;
        }
        .itv-muted { opacity:.7; font-size:12px; }
        .itv-modal.is-readonly .itv-save,
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
          background: #f9fafb;
        }
      </style>
      <div class="itv-modal__overlay"></div>
      <div class="itv-modal__panel">
        <div class="itv-modal__header">
          <div>
            <div class="itv-modal__title">Intervention</div>
            <div class="itv-modal__subtitle">Détails complets</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="itv-btn secondary itv-close">Fermer</button>
            <button type="button" class="itv-btn itv-save">Enregistrer</button>
          </div>
        </div>

        <div class="itv-tabs">
          <button class="itv-tab-btn is-active" data-tab="summary">Résumé</button>
          <button class="itv-tab-btn" data-tab="infos">Infos</button>
          <button class="itv-tab-btn" data-tab="techs">Techniciens</button>
          <button class="itv-tab-btn" data-tab="comps">Compensations</button>
          <button class="itv-tab-btn" data-tab="expenses">Dépenses</button>
          <button class="itv-tab-btn" data-tab="files">Fichiers</button>
          <button class="itv-tab-btn" data-tab="pv">PV</button>
        </div>

        <div class="itv-modal__error"></div>

        <div class="itv-tab is-active" data-tab="summary">
          <div class="itv-grid">
            <div class="itv-card"><div class="k">Référence</div><div class="v s-ref">—</div></div>
            <div class="itv-card"><div class="k">Statut</div><div class="v s-status">—</div></div>
            <div class="itv-card"><div class="k">Client</div><div class="v s-client">—</div></div>
            <div class="itv-card"><div class="k">Date</div><div class="v s-date">—</div></div>
            <div class="itv-card"><div class="k">Techniciens</div><div class="v s-techs">—</div></div>
            <div class="itv-card"><div class="k">Tarif</div><div class="v s-tarif">—</div></div>
            <div class="itv-card"><div class="k">Total dépenses</div><div class="v s-expenses">—</div></div>
            <div class="itv-card"><div class="k">Total compensations</div><div class="v s-comps">—</div></div>
          </div>
        </div>

        <div class="itv-tab" data-tab="infos">
          <div class="itv-grid">
            <div class="itv-field">
              <label>Référence *</label>
              <input class="f-ref" type="text" />
            </div>
            <div class="itv-field">
              <label>Statut</label>
              <input class="f-status" type="text" list="status-list" />
              <datalist id="status-list">
                ${STATUS_OPTIONS.map(s => `<option value="${s}"></option>`).join("")}
              </datalist>
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

            <div class="itv-field">
              <label>PV statut</label>
              <input class="f-pv-status" type="text" />
            </div>
            <div class="itv-field">
              <label>PV source</label>
              <input class="f-pv-source" type="text" />
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
          <div class="itv-field">
            <label>Technicien(s)</label>
            <select class="f-techs" multiple style="min-height:120px;"></select>
            <div class="itv-muted">Ctrl/Cmd + clic pour sélectionner plusieurs techniciens.</div>
          </div>
        </div>

        <div class="itv-tab" data-tab="comps">
          <div class="itv-section-title">Compensations par technicien</div>
          <div class="itv-table-head">
            <div>Technicien</div><div>Montant</div><div>Statut</div><div>Devise</div><div></div>
          </div>
          <div class="comp-rows"></div>
          <div class="itv-muted">Les compensations suivent la liste de techniciens sélectionnés.</div>
        </div>

        <div class="itv-tab" data-tab="expenses">
          <div class="itv-section-title">Produits utilisés</div>
          <div class="itv-table-head">
            <div>Produit/Libellé</div><div>Qté</div><div>PU</div><div>Total</div><div></div>
          </div>
          <div class="exp-rows"></div>

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button type="button" class="itv-btn secondary add-exp-product">Ajouter un produit</button>
            <button type="button" class="itv-btn secondary add-exp-extra">Ajouter un frais</button>
          </div>
          <div class="itv-muted">Pour les frais de déplacement, choisissez "Frais" et indiquez quantité (km) + tarif/km.</div>
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
              <div class="itv-muted">PDF uniquement (bucket). Les fichiers seront uploadés à l’enregistrement.</div>
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

        <div class="itv-actions">
          <button type="button" class="itv-btn secondary itv-close">Annuler</button>
          <button type="button" class="itv-btn itv-save">Enregistrer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeModal();
    modal.querySelectorAll(".itv-close").forEach(btn => btn.addEventListener("click", close));
    modal.querySelector(".itv-modal__overlay").addEventListener("click", close);

    if (!document.__itvModalEscBound) {
      document.__itvModalEscBound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
      });
    }

    modal.querySelectorAll(".itv-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    modal.querySelector(".add-exp-product").addEventListener("click", () => addExpenseRow({ type:"product" }));
    modal.querySelector(".add-exp-extra").addEventListener("click", () => addExpenseRow({ type:"extra" }));

    modal.querySelector(".f-techs").addEventListener("change", () => {
      renderCompRows();
      scheduleSummaryRefresh();
    });

    modal.querySelector(".f-file-input").addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const type = modal.querySelector(".f-file-type").value.trim() || "document";
      modalState.pendingFiles.push(...files.map(f => ({ file: f, type })));
      renderPendingFiles();
    });

    modal.querySelector(".pv-draft-input").addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      modalState.pendingPvDraft = file;
      renderPvSection();
    });

    modal.querySelector(".pv-signed-input").addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      modalState.pendingPvSigned = file;
      renderPvSection();
    });

    modal.querySelectorAll(".itv-save").forEach(btn => btn.addEventListener("click", () => submitModal()));

    modal.querySelector(".itv-modal__panel").addEventListener("input", scheduleSummaryRefresh);

    return modal;
  }

  function switchTab(name) {
    const modal = ensureModalExists();
    modal.querySelectorAll(".itv-tab").forEach(tab => {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
    modal.querySelectorAll(".itv-tab-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.tab === name);
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

  function setMode(mode) {
    const modal = ensureModalExists();
    modalState.mode = mode;

    const isView = mode === "view";
    modal.classList.toggle("is-readonly", isView);

    modal.querySelectorAll("input, textarea, select").forEach(el => {
      el.disabled = isView;
    });

    modal.querySelectorAll(".itv-save").forEach(btn => {
      btn.style.display = isView ? "none" : "";
    });

    const title = mode === "add" ? "Ajouter une intervention" : (mode === "edit" ? "Modifier l’intervention" : "Détails de l’intervention");
    modal.querySelector(".itv-modal__title").textContent = title;
    modal.querySelector(".itv-modal__subtitle").textContent = isView ? "Visualisation complète" : "Modifiable";
  }

  function showError(msg) {
    const modal = ensureModalExists();
    const err = modal.querySelector(".itv-modal__error");
    err.textContent = msg;
    err.style.display = msg ? "block" : "none";
  }

  let summaryRefreshTimer = null;
  function scheduleSummaryRefresh() {
    clearTimeout(summaryRefreshTimer);
    summaryRefreshTimer = setTimeout(refreshSummary, 120);
  }

  function refreshSummary() {
    const modal = ensureModalExists();
    const ref = modal.querySelector(".f-ref").value || "—";
    const status = modal.querySelector(".f-status").value || "—";
    const client = modal.querySelector(".f-client").value || "—";
    const date = modal.querySelector(".f-start").value ? formatFRDateTime(new Date(modal.querySelector(".f-start").value).toISOString()) : "—";
    const tarifCents = parseEurosToCents(modal.querySelector(".f-tarif").value);

    const techSelect = modal.querySelector(".f-techs");
    const techNames = Array.from(techSelect.selectedOptions || []).map(o => o.textContent).join(", ") || "—";

    const expTotal = computeExpenseTotalCents();
    const compTotal = computeCompTotalCents();

    modal.querySelector(".s-ref").textContent = ref;
    modal.querySelector(".s-status").textContent = status;
    modal.querySelector(".s-client").textContent = client;
    modal.querySelector(".s-date").textContent = date;
    modal.querySelector(".s-techs").textContent = techNames;
    modal.querySelector(".s-tarif").textContent = formatCents(tarifCents);
    modal.querySelector(".s-expenses").textContent = formatCents(expTotal);
    modal.querySelector(".s-comps").textContent = formatCents(compTotal);
  }

  function clearModalFields() {
    const modal = ensureModalExists();
    modal.querySelector(".f-ref").value = "";
    modal.querySelector(".f-status").value = "";
    modal.querySelector(".f-title").value = "";
    modal.querySelector(".f-monday").value = "";
    modal.querySelector(".f-client").value = "";
    modal.querySelector(".f-client-ref").value = "";
    modal.querySelector(".f-phone").value = "";
    modal.querySelector(".f-tarif").value = "";
    modal.querySelector(".f-address").value = "";
    modal.querySelector(".f-start").value = "";
    modal.querySelector(".f-end").value = "";
    modal.querySelector(".f-pv-status").value = "";
    modal.querySelector(".f-pv-source").value = "";
    modal.querySelector(".f-equipment").value = "";
    modal.querySelector(".f-infos").value = "";
    modal.querySelector(".f-observations").value = "";
    modal.querySelector(".f-file-type").value = "";
    modal.querySelector(".f-file-input").value = "";
    modal.querySelector(".pv-draft-input").value = "";
    modal.querySelector(".pv-signed-input").value = "";

    modalState.pendingFiles = [];
    modalState.pendingPvDraft = null;
    modalState.pendingPvSigned = null;

    modal.querySelector(".files-list").innerHTML = "";
    modal.querySelector(".exp-rows").innerHTML = "";
    modal.querySelector(".comp-rows").innerHTML = "";
    modal.querySelector(".pv-draft").innerHTML = "";
    modal.querySelector(".pv-signed").innerHTML = "";
    renderPendingFiles();
  }

  function fillModal(intervention, assigns, compensations, expenses, files, pv) {
    const modal = ensureModalExists();
    modal.querySelector(".f-ref").value = intervention.internal_ref || "";
    modal.querySelector(".f-status").value = intervention.status || "";
    modal.querySelector(".f-title").value = intervention.title || "";
    modal.querySelector(".f-monday").value = intervention.monday_item_id || "";
    modal.querySelector(".f-client").value = intervention.client_name || "";
    modal.querySelector(".f-client-ref").value = intervention.client_ref || "";
    modal.querySelector(".f-phone").value = intervention.support_phone || "";
    modal.querySelector(".f-tarif").value = centsToEurosInput(intervention.tarif);
    modal.querySelector(".f-address").value = intervention.address || "";
    modal.querySelector(".f-start").value = toLocalInputValue(intervention.start_at);
    modal.querySelector(".f-end").value = toLocalInputValue(intervention.end_at);
    modal.querySelector(".f-pv-status").value = intervention.pv_status || "";
    modal.querySelector(".f-pv-source").value = intervention.pv_source || "";
    modal.querySelector(".f-equipment").value = intervention.equipment_needed || "";
    modal.querySelector(".f-infos").value = intervention.infos || "";
    modal.querySelector(".f-observations").value = intervention.observations || "";

    const techSelect = modal.querySelector(".f-techs");
    const selectedIds = (assigns || []).map(a => a.user_id);
    Array.from(techSelect.options || []).forEach(o => {
      o.selected = selectedIds.includes(o.value);
    });

    renderCompRows(compensations || []);
    renderExpenseRows(expenses || []);
    renderFilesList(files || []);
    renderPvSection(pv || null);

    refreshSummary();
  }

  // =========================
  // COMPENSATIONS
  // =========================
  function getSelectedTechs() {
    const modal = ensureModalExists();
    const select = modal.querySelector(".f-techs");
    return Array.from(select.selectedOptions || []).map(o => ({ id: o.value, name: o.textContent }));
  }

  function renderCompRows(existing = null) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".comp-rows");
    const selected = getSelectedTechs();

    if (!existing) {
      const current = new Map();
      modal.querySelectorAll(".comp-row").forEach(row => {
        current.set(row.dataset.techId, {
          tech_id: row.dataset.techId,
          amount_cents: parseEurosToCents(row.querySelector(".c-amount").value),
          status: row.querySelector(".c-status").value.trim() || null,
          currency: row.querySelector(".c-currency").value.trim() || "EUR",
          notes: row.querySelector(".c-notes").value.trim() || null
        });
      });
      existing = Array.from(current.values());
    }

    const byTech = new Map();
    existing.forEach(c => {
      if (c.tech_id) byTech.set(c.tech_id, c);
    });

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
        <div>
          <input class="c-status" type="text" list="comp-status-list" value="${comp.status || ""}" />
        </div>
        <div>
          <input class="c-currency" type="text" placeholder="EUR" value="${comp.currency || "EUR"}" />
        </div>
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
    existing.forEach(exp => addExpenseRow(exp));
  }

  function addExpenseRow(exp = {}) {
    const modal = ensureModalExists();
    const wrap = modal.querySelector(".exp-rows");

    const type = exp.type || "product";
    const row = document.createElement("div");
    row.className = "itv-row exp-row";
    row.dataset.expenseId = exp.id || "";
    row.innerHTML = `
      <div>
        <select class="e-type">
          <option value="product">Produit</option>
          <option value="travel">Frais déplacement</option>
          <option value="extra">Frais</option>
        </select>
        <select class="e-product" style="margin-top:6px; display:none;">
          ${productsOptionsHtml()}
        </select>
        <input class="e-label" type="text" placeholder="Libellé (ex: déplacement 18 km)" style="margin-top:6px; display:none;" />
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
      if (t === "product") {
        productEl.style.display = "";
        labelEl.style.display = "none";
      } else {
        productEl.style.display = "none";
        labelEl.style.display = "";
      }

      if (t === "product") {
        const pid = productEl.value;
        if (pid && !unitEl.value) {
          const price = productPriceById.get(pid);
          if (price !== undefined) {
            unitEl.value = centsToEurosInput(price);
          }
        }
      }

      const qty = parseQty(qtyEl.value);
      const unit = parseEurosToCents(unitEl.value);
      const amount = qty * unit;
      amountEl.textContent = formatCents(amount || 0);
      scheduleSummaryRefresh();
    }

    typeEl.addEventListener("change", refresh);
    productEl.addEventListener("change", refresh);
    qtyEl.addEventListener("input", refresh);
    unitEl.addEventListener("input", refresh);
    row.querySelector(".e-del").addEventListener("click", () => {
      row.remove();
      scheduleSummaryRefresh();
    });

    refresh();
  }

  function computeExpenseTotalCents() {
    const modal = ensureModalExists();
    const rows = Array.from(modal.querySelectorAll(".exp-row"));
    return rows.reduce((sum, row) => {
      const qty = parseQty(row.querySelector(".e-qty")?.value);
      const unit = parseEurosToCents(row.querySelector(".e-unit")?.value);
      const amount = qty * unit;
      return sum + (amount || 0);
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
      ? `<div class="itv-pv-row">
          <div>${pv.pv_draft_path}</div>
          <button type="button" class="itv-btn secondary pv-open-draft">Ouvrir</button>
        </div>`
      : `<div class="itv-muted">Aucun PV draft</div>`;

    signedWrap.innerHTML = pv?.pv_signed_path
      ? `<div class="itv-pv-row">
          <div>${pv.pv_signed_path}</div>
          <button type="button" class="itv-btn secondary pv-open-signed">Ouvrir</button>
        </div>`
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
  // SUBMIT MODAL
  // =========================
  async function submitModal() {
    const modal = ensureModalExists();
    const saveBtn = modal.querySelector(".itv-save");
    showError("");

    const payload = {
      internal_ref: modal.querySelector(".f-ref").value.trim(),
      status: modal.querySelector(".f-status").value.trim() || null,
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
      pv_status: modal.querySelector(".f-pv-status").value.trim() || null,
      pv_source: modal.querySelector(".f-pv-source").value.trim() || null,
    };

    if (!payload.internal_ref) {
      showError("La référence est obligatoire.");
      return;
    }

    const techIds = getSelectedTechs().map(t => t.id);

    const compRows = Array.from(modal.querySelectorAll(".comp-row")).map(row => ({
      tech_id: row.dataset.techId,
      amount_cents: parseEurosToCents(row.querySelector(".c-amount").value),
      status: row.querySelector(".c-status").value.trim() || null,
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

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Enregistrement...";

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

      closeModal();
      await loadInterventions();
      if (searchInput) applyFilter(searchInput.value);

    } catch (e) {
      console.error(e);
      showError(e?.message || "Erreur lors de l’enregistrement");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Enregistrer";
    }
  }

  // =========================
  // OPEN MODAL (VIEW/EDIT/ADD)
  // =========================
  async function openInterventionModal(mode, id = null) {
    const modal = ensureModalExists();
    showError("");
    modalState.id = id;
    modalState.pendingFiles = [];
    modalState.pendingPvDraft = null;
    modalState.pendingPvSigned = null;

    await loadTechs();
    await loadProducts();

    await populateTechSelect(modal.querySelector(".f-techs"));

    clearModalFields();
    setMode(mode);
    switchTab(mode === "add" ? "infos" : "summary");
    openModal();

    if (mode === "add") {
      renderCompRows([]);
      renderExpenseRows([]);
      renderFilesList([]);
      renderPvSection(null);
      refreshSummary();
      return;
    }

    try {
      const bundle = await loadInterventionBundle(id);
      fillModal(bundle.intervention, bundle.assigns, bundle.compensations, bundle.expenses, bundle.files, bundle.pv);
    } catch (e) {
      console.error(e);
      showError("Erreur chargement intervention: " + e.message);
    }
  }

  // =========================
  // DELETE MODAL (simple)
  // =========================
  function ensureDeleteModalExists() {
    let modal = document.querySelector(".delete-itv-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "delete-itv-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100000; display:none; font-family:inherit;";

    modal.innerHTML = `
      <div class="delete-itv-modal__overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>
      <div class="delete-itv-modal__content" style="
        position:relative; width:min(520px, calc(100vw - 32px));
        background:#fff; border-radius:14px; padding:18px 18px 16px;
        margin:16px auto; top:50%; transform:translateY(-50%);
        box-shadow:0 20px 70px rgba(0,0,0,.35);
      ">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-size:18px; font-weight:800; margin-bottom:6px;">Confirmer la suppression</div>
            <div style="opacity:.75; line-height:1.4;">Voulez-vous vraiment supprimer cette intervention ?</div>
          </div>
          <button type="button" class="delete-itv-modal__close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
        </div>

        <div style="margin-top:14px; padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
          <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Intervention</div>
          <div class="delete-itv-modal__label" style="font-weight:800;">—</div>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="delete-itv-modal__cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
          <button type="button" class="delete-itv-modal__confirm" style="border:none; background:#ef4444; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Supprimer</button>
        </div>

        <div class="delete-itv-modal__error" style="display:none; margin-top:10px; color:#b91c1c; font-weight:600;"></div>
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

    if (labelEl) labelEl.textContent = label || "—";
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    confirmBtn.onclick = async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Suppression...";

        const { error: compErr } = await supabase
          .from("intervention_compensations")
          .delete()
          .eq("intervention_id", interventionId);
        if (compErr) console.warn("[DELETE] intervention_compensations:", compErr.message);

        const { error: linkErr } = await supabase
          .from("intervention_assignees")
          .delete()
          .eq("intervention_id", interventionId);
        if (linkErr) console.warn("[DELETE] intervention_assignees:", linkErr.message);

        const { error: expErr } = await supabase
          .from("intervention_expenses")
          .delete()
          .eq("intervention_id", interventionId);
        if (expErr) console.warn("[DELETE] intervention_expenses:", expErr.message);

        const { error: fileErr } = await supabase
          .from("intervention_files")
          .delete()
          .eq("intervention_id", interventionId);
        if (fileErr) console.warn("[DELETE] intervention_files:", fileErr.message);

        const { error: pvErr } = await supabase
          .from("intervention_pv")
          .delete()
          .eq("intervention_id", interventionId);
        if (pvErr) console.warn("[DELETE] intervention_pv:", pvErr.message);

        const { error: itvErr } = await supabase
          .from("interventions")
          .delete()
          .eq("id", interventionId);

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
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Supprimer";
      }
    };
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
