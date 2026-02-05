(() => {
  if (window.__techInterventionsLoaded) return;
  window.__techInterventionsLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    DETAIL_PAGE_PATH: "/extranet/intervention",
    STORAGE_BUCKET: "interventions-files",
    REPORTS_TABLE: "intervention_reports",

    STATUS_DONE: "done",
    STATUS_IN_PROGRESS: "in_progress",
    ENABLE_STATUS_UPDATE: true,

    REQUIRE_CHECKLIST_DEFAULT: true,
    REQUIRE_PHOTOS_DEFAULT: false,
    REQUIRE_SIGNATURE_DEFAULT: false,

    DEFAULT_CHECKLIST: [
      "Arrive sur site et confirme le contact",
      "Realise l'intervention",
      "Teste le fonctionnement",
      "Nettoie la zone",
      "Explique au client les consignes"
    ]
  };

  const supabase =
    window.__MBL_SUPABASE__ ||
    window.__techSupabase ||
    window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth"
      }
    });

  window.__techSupabase = supabase;

  const STR = {
    title: "Mes interventions",
    subtitle: "Suivi terrain et validation rapide",
    countLabel: "assignees",
    searchPlaceholder: "Rechercher client, titre, adresse",
    emptyTitle: "Aucune intervention",
    emptyBody: "Tu n'as pas d'interventions assignees pour le moment.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer les interventions. Reessaye plus tard.",
    validateTitle: "Validation de l'intervention",
    validateCTA: "Valider l'intervention",
    detailsCTA: "Details",
    sheetCTA: "Fiche",
    callCTA: "Appeler",
    mapCTA: "Itineraire",
    notesLabel: "Notes de fin",
    photosLabel: "Photos",
    photosHint: "Ajoute 1 ou plusieurs photos",
    checklistLabel: "Checklist",
    signatureLabel: "Signature client",
    signatureHint: "Signe dans la zone ci-dessous",
    signatureClear: "Effacer",
    confirmValidate: "Confirmer la validation ?",
    toastSaved: "Intervention validee",
    toastSavedPartial: "Validation enregistree mais statut non mis a jour",
    toastError: "Une erreur est survenue"
  };

  const root = findRoot();
  if (!root) {
    console.error("❌ Root introuvable");
    return;
  }

  if (!window.supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  applyConfigOverrides(root);


  injectStyles();

  const els = renderShell(root);
  const state = {
    items: [],
    filter: "all",
    search: "",
    files: {},
    previews: {},
    checklist: {},
    notes: {},
    signatures: {},
    userId: null
  };

  init();

  async function init() {

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      els.list.innerHTML = `
        <div class="ti-empty">
          <div class="ti-empty-title">Session expirée</div>
          <div class="ti-empty-body">Merci de vous reconnecter.</div>
        </div>
      `;
      return;
    }

    showSkeleton(els.list);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) throw authError || new Error("Non connecte");

      state.userId = authData.user.id;

      const data = await fetchAssignments(state.userId);
      state.items = normalizeAssignments(data);

      renderList();
    } catch (e) {
      renderError(els.list);
    }
  }

  async function fetchAssignments(userId) {
    const baseSelect = `
      id,
      interventions:intervention_id (
        id,
        client_name,
        title,
        status,
        start_at,
        support_phone,
        address
      )
    `;

    const extendedSelect = `
      id,
      interventions:intervention_id (
        id,
        client_name,
        title,
        status,
        start_at,
        support_phone,
        address,
        checklist,
        requires_signature,
        requires_photos,
        requires_checklist,
        completed_at
      )
    `;

    let res = await supabase
      .from("intervention_assignees")
      .select(extendedSelect)
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from("intervention_assignees")
        .select(baseSelect)
        .eq("user_id", userId)
        .order("id", { ascending: false });
    }

    if (res.error) throw res.error;
    return res.data || [];
  }

  function normalizeAssignments(data) {
    const rows = [];
    data.forEach((item) => {
      if (!item?.interventions) return;
      rows.push({ ...item.interventions, assignment_id: item.id });
    });
    return rows;
  }

  function renderList() {
    const filtered = filterItems(state.items);
    els.count.textContent = String(filtered.length);

    if (!filtered.length) {
      renderEmpty(els.list);
      return;
    }

    els.list.innerHTML = "";
    filtered.forEach((row) => {
      const card = buildCard(row);
      els.list.appendChild(card);
    });
  }

  function buildCard(row) {
    const card = document.createElement("article");
    card.className = "ti-card";
    card.dataset.id = row.id;

    const statusLabel = getStatusLabel(row.status);
    const statusTone = getStatusTone(row.status);
    const dateLabel = formatDateFR(row.start_at) || "Date a definir";
    const clientTitle = `${row.client_name || "Client"} - ${row.title || "Intervention"}`;

    const phoneNormalized = normalizePhone(row.support_phone);
    const phoneReadable = formatPhoneReadable(row.support_phone);
    const address = row.address ? String(row.address).trim() : "";

    const detailsUrl = `${CONFIG.DETAIL_PAGE_PATH}?id=${encodeURIComponent(row.id)}`;
    const mapUrl = address ? buildDirectionsUrl(address) : "";

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
        <a class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="map" ${address ? `href="${mapUrl}" target="_blank" rel="noopener"` : ""}>${STR.mapCTA}</a>
        <button class="ti-btn ti-btn--ghost" data-action="toggle-details">${STR.detailsCTA}</button>
        <a class="ti-btn ti-btn--ghost" href="${detailsUrl}">${STR.sheetCTA}</a>
        <button class="ti-btn ti-btn--primary" data-action="toggle-validate">${STR.validateCTA}</button>
      </div>

      <div class="ti-details" hidden>
        <div class="ti-grid">
          <div class="ti-info">
            <div class="ti-label">Telephone</div>
            <div class="ti-value">${phoneReadable || "Non renseigne"}</div>
          </div>
          <div class="ti-info">
            <div class="ti-label">Adresse</div>
            <div class="ti-value">${address || "Non renseignee"}</div>
          </div>
          <div class="ti-info">
            <div class="ti-label">Statut</div>
            <div class="ti-value">${escapeHTML(statusLabel)}</div>
          </div>
          <div class="ti-info">
            <div class="ti-label">Date</div>
            <div class="ti-value">${escapeHTML(dateLabel)}</div>
          </div>
        </div>
      </div>

      <div class="ti-validate" hidden></div>
    `;

    const detailsBtn = card.querySelector('[data-action="toggle-details"]');
    const validateBtn = card.querySelector('[data-action="toggle-validate"]');
    const detailsPanel = card.querySelector(".ti-details");
    const validatePanel = card.querySelector(".ti-validate");

    detailsBtn.addEventListener("click", () => {
      detailsPanel.hidden = !detailsPanel.hidden;
    });

    validateBtn.addEventListener("click", () => {
      if (!validatePanel.dataset.ready) {
        renderValidation(validatePanel, row);
        validatePanel.dataset.ready = "1";
      }
      validatePanel.hidden = !validatePanel.hidden;
      if (!validatePanel.hidden) {
        validatePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    return card;
  }

  function renderValidation(container, row) {
    const id = row.id;
    const checklist = getChecklist(row);
    const requiresChecklist = getFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);

    state.checklist[id] = state.checklist[id] || checklist.map(() => false);
    state.notes[id] = state.notes[id] || "";
    state.files[id] = state.files[id] || [];
    state.previews[id] = state.previews[id] || [];
    state.signatures[id] = state.signatures[id] || { canvas: null, hasSignature: false };

    container.innerHTML = `
      <div class="ti-validate-head">
        <div>
          <div class="ti-validate-title">${STR.validateTitle}</div>
          <div class="ti-validate-sub">${escapeHTML(row.title || "Intervention")}</div>
        </div>
      </div>

      ${requiresChecklist ? `
        <div class="ti-block">
          <div class="ti-label">${STR.checklistLabel}</div>
          <div class="ti-checklist" data-checklist></div>
        </div>
      ` : ""}

      <div class="ti-block">
        <div class="ti-label">${STR.photosLabel}${requiresPhotos ? " *" : ""}</div>
        <div class="ti-hint">${STR.photosHint}</div>
        <input type="file" class="ti-file" accept="image/*" multiple />
        <div class="ti-previews" data-previews></div>
      </div>

      <div class="ti-block">
        <div class="ti-label">${STR.notesLabel}</div>
        <textarea class="ti-textarea" rows="3" placeholder="Ajouter un commentaire..."></textarea>
      </div>

      ${requiresSignature ? `
        <div class="ti-block">
          <div class="ti-label">${STR.signatureLabel} *</div>
          <div class="ti-hint">${STR.signatureHint}</div>
          <div class="ti-signature">
            <canvas class="ti-signature-canvas"></canvas>
            <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="sig-clear">${STR.signatureClear}</button>
          </div>
        </div>
      ` : ""}

      <div class="ti-validate-actions">
        <button class="ti-btn ti-btn--primary" data-action="confirm-validate">${STR.validateCTA}</button>
      </div>
    `;

    const checklistWrap = container.querySelector("[data-checklist]");
    if (checklistWrap) {
      checklist.forEach((label, idx) => {
        const item = document.createElement("label");
        item.className = "ti-check";
        item.innerHTML = `
          <input type="checkbox" data-check-index="${idx}" ${state.checklist[id][idx] ? "checked" : ""} />
          <span>${escapeHTML(label)}</span>
        `;
        checklistWrap.appendChild(item);
      });
      checklistWrap.addEventListener("change", (e) => {
        const el = e.target;
        if (el && el.matches("input[type='checkbox']")) {
          const i = Number(el.dataset.checkIndex);
          state.checklist[id][i] = el.checked;
          updateValidateButton(container, row);
        }
      });
    }

    const fileInput = container.querySelector(".ti-file");
    const previews = container.querySelector("[data-previews]");
    fileInput.addEventListener("change", () => {
      clearPreviews(id, previews);
      const files = Array.from(fileInput.files || []);
      state.files[id] = files;
      renderPreviews(id, previews, files);
      updateValidateButton(container, row);
    });

    const textarea = container.querySelector(".ti-textarea");
    textarea.value = state.notes[id] || "";
    textarea.addEventListener("input", () => {
      state.notes[id] = textarea.value;
    });

    if (requiresSignature) {
      const canvas = container.querySelector(".ti-signature-canvas");
      const clearBtn = container.querySelector('[data-action="sig-clear"]');
      setupSignatureCanvas(canvas, id);
      clearBtn.addEventListener("click", () => {
        clearSignature(canvas, id);
        updateValidateButton(container, row);
      });
    }

    const confirmBtn = container.querySelector('[data-action="confirm-validate"]');
    confirmBtn.addEventListener("click", async () => {
      if (!confirm(STR.confirmValidate)) return;
      await validateIntervention(container, row);
    });

    updateValidateButton(container, row);
  }

  async function validateIntervention(container, row) {
    const id = row.id;
    const requiresChecklist = getFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);

    const checklistOk = !requiresChecklist || state.checklist[id].every(Boolean);
    const photosOk = !requiresPhotos || (state.files[id] && state.files[id].length > 0);
    const signatureOk = !requiresSignature || state.signatures[id].hasSignature;

    if (!checklistOk || !photosOk || !signatureOk) return;

    const btn = container.querySelector('[data-action="confirm-validate"]');
    btn.disabled = true;
    btn.textContent = "Validation...";

    try {
      const completedAt = new Date().toISOString();

      const photoUploads = await uploadPhotos(id, state.files[id] || []);
      const signatureUpload = requiresSignature ? await uploadSignature(id) : null;

      const reportPayload = {
        intervention_id: id,
        user_id: state.userId,
        checklist: state.checklist[id],
        notes: state.notes[id] || "",
        photos: photoUploads,
        signature: signatureUpload,
        completed_at: completedAt
      };

      const reportOk = await saveReport(reportPayload);
      if (!reportOk) throw new Error("Report not saved");

      let statusUpdated = true;
      if (CONFIG.ENABLE_STATUS_UPDATE) {
        statusUpdated = await updateIntervention(id, completedAt);
      }

      const idx = state.items.findIndex((x) => x.id === id);
      if (idx > -1) {
        state.items[idx].status = CONFIG.STATUS_DONE;
        state.items[idx].completed_at = completedAt;
      }

      if (statusUpdated) {
        showToast("success", STR.toastSaved);
      } else {
        showToast("warn", STR.toastSavedPartial);
      }

      renderList();
    } catch (e) {
      console.error(e);
      showToast("error", STR.toastError);
    } finally {
      btn.disabled = false;
      btn.textContent = STR.validateCTA;
    }
  }

  async function uploadPhotos(interventionId, files) {
    if (!files || !files.length) return [];

    const bucket = CONFIG.STORAGE_BUCKET;
    const uploads = await Promise.all(files.map(async (file) => {
      const ext = getFileExtension(file.name);
      const name = `${Date.now()}_${randomId()}.${ext || "jpg"}`;
      const path = `interventions/${interventionId}/${name}`;

      const { error } = await supabase
        .storage
        .from(bucket)
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) throw error;

      const { data } = supabase
        .storage
        .from(bucket)
        .getPublicUrl(path);

      return {
        path,
        url: data?.publicUrl || null,
        name: file.name,
        size: file.size,
        type: file.type || null
      };
    }));

    return uploads;
  }

  async function uploadSignature(interventionId) {
    const sig = state.signatures[interventionId];
    if (!sig || !sig.canvas || !sig.hasSignature) return null;

    const blob = await new Promise((resolve) => sig.canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;

    const bucket = CONFIG.STORAGE_BUCKET;
    const name = `signature_${Date.now()}_${randomId()}.png`;
    const path = `interventions/${interventionId}/${name}`;

    const { error } = await supabase
      .storage
      .from(bucket)
      .upload(path, blob, { cacheControl: "3600", upsert: false });

    if (error) throw error;

    const { data } = supabase
      .storage
      .from(bucket)
      .getPublicUrl(path);

    return { path, url: data?.publicUrl || null };
  }

  async function saveReport(payload) {
    const { error } = await supabase
      .from(CONFIG.REPORTS_TABLE)
      .upsert(payload, { onConflict: "intervention_id,user_id" });

    if (error) {
      console.error("Report error", error);
      return false;
    }
    return true;
  }

  async function updateIntervention(id, completedAt) {
    const { error } = await supabase
      .from("interventions")
      .update({ status: CONFIG.STATUS_DONE, completed_at: completedAt })
      .eq("id", id);

    if (error) {
      console.error("Update error", error);
      return false;
    }
    return true;
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
      </div>
    `;

    const list = rootEl.querySelector("[data-ti-list]");
    const count = rootEl.querySelector("[data-ti-count]");
    const search = rootEl.querySelector("[data-ti-search]");
    const filters = Array.from(rootEl.querySelectorAll("[data-ti-filter]"));
    const toasts = rootEl.querySelector("[data-ti-toasts]");

    filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        filters.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filter = btn.dataset.tiFilter;
        renderList();
      });
    });

    search.addEventListener("input", () => {
      state.search = search.value || "";
      renderList();
    });

    return { list, count, toasts };
  }

  function filterItems(items) {
    const q = state.search.trim().toLowerCase();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return items.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      const isDone = isDoneStatus(status);

      const date = row.start_at ? new Date(row.start_at) : null;
      const isToday = date && date >= startOfDay && date <= endOfDay;
      const isUpcoming = date && date > endOfDay;

      if (state.filter === "today" && !isToday) return false;
      if (state.filter === "upcoming" && (!isUpcoming || isDone)) return false;
      if (state.filter === "done" && !isDone) return false;

      if (!q) return true;

      const hay = [
        row.client_name,
        row.title,
        row.address,
        row.support_phone
      ].join(" ").toLowerCase();

      return hay.includes(q);
    });
  }

  function showSkeleton(listEl) {
    listEl.innerHTML = `
      <div class="ti-skeleton"></div>
      <div class="ti-skeleton"></div>
      <div class="ti-skeleton"></div>
    `;
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

  function updateValidateButton(container, row) {
    const id = row.id;
    const requiresChecklist = getFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);

    const checklistOk = !requiresChecklist || state.checklist[id].every(Boolean);
    const photosOk = !requiresPhotos || (state.files[id] && state.files[id].length > 0);
    const signatureOk = !requiresSignature || state.signatures[id].hasSignature;

    const btn = container.querySelector('[data-action="confirm-validate"]');
    if (!btn) return;
    btn.disabled = !(checklistOk && photosOk && signatureOk);
  }

  function renderPreviews(id, container, files) {
    if (!files || !files.length) return;
    const urls = [];
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      urls.push(url);

      const item = document.createElement("div");
      item.className = "ti-preview";
      item.innerHTML = `
        <img src="${url}" alt="photo" />
        <div class="ti-preview-meta">${escapeHTML(file.name)} (${formatBytes(file.size)})</div>
      `;
      container.appendChild(item);
    });
    state.previews[id] = urls;
  }

  function clearPreviews(id, container) {
    const urls = state.previews[id] || [];
    urls.forEach((u) => URL.revokeObjectURL(u));
    state.previews[id] = [];
    container.innerHTML = "";
  }

  function setupSignatureCanvas(canvas, id) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(160 * ratio));
    canvas.style.height = "160px";
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2 * ratio;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";

    let drawing = false;

    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * ratio,
        y: (e.clientY - r.top) * ratio
      };
    };

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      state.signatures[id].hasSignature = true;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });

    const end = () => (drawing = false);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);

    state.signatures[id].canvas = canvas;
  }

  function clearSignature(canvas, id) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signatures[id].hasSignature = false;
  }

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `ti-toast ti-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function getChecklist(row) {
    if (Array.isArray(row.checklist) && row.checklist.length) return row.checklist;
    return CONFIG.DEFAULT_CHECKLIST;
  }

  function getFlag(value, fallback) {
    if (typeof value === "boolean") return value;
    return !!fallback;
  }

  function getStatusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "planned") return "Planifiee";
    if (s === "pending") return "En attente";
    if (s === "in_progress") return "En cours";
    if (s === "confirmed") return "Confirmee";
    if (s === "done") return "Terminee";
    if (s === "canceled") return "Annulee";
    return status ? capitalize(status) : "A faire";
  }

  function getStatusTone(status) {
    const s = String(status || "").toLowerCase();
    if (s === "done") return "success";
    if (s === "in_progress") return "warning";
    if (s === "confirmed") return "info";
    if (s === "canceled") return "danger";
    return "neutral";
  }

  function isDoneStatus(status) {
    return status === "done";
  }

  function formatDateFR(value) {
    if (!value) return "";
    let s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(" ", "T");
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(value);

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  }

  function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("00")) p = "+" + p.slice(2);
    if (/^0\d{9}$/.test(p)) p = "+33" + p.slice(1);
    return p || null;
  }

  function formatPhoneReadable(phone) {
    if (!phone) return "";
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("00")) p = "+" + p.slice(2);

    if (p.startsWith("+33")) {
      const rest = p.slice(3);
      const grouped = rest.replace(/(\d)(?=(\d{2})+$)/g, "$1 ").trim();
      return `+33 ${grouped}`;
    }

    if (/^0\d{9}$/.test(p)) {
      return p.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    }

    return p.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }

  function buildDirectionsUrl(address) {
    const q = encodeURIComponent(String(address).trim());
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isAppleMobile) return `https://maps.apple.com/?daddr=${q}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  }

  function capitalize(str) {
    const s = String(str || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function randomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10);
  }

  function getFileExtension(name) {
    const parts = String(name || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function isMissingColumnError(error) {
    const msg = String(error?.message || "");
    return msg.includes("column") && msg.includes("does not exist");
  }

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset;
    if (d.detailPath) CONFIG.DETAIL_PAGE_PATH = d.detailPath;
    if (d.storageBucket) CONFIG.STORAGE_BUCKET = d.storageBucket;
    if (d.reportsTable) CONFIG.REPORTS_TABLE = d.reportsTable;
    if (d.statusDone) CONFIG.STATUS_DONE = d.statusDone;
    if (d.statusInProgress) CONFIG.STATUS_IN_PROGRESS = d.statusInProgress;
    if (d.requireChecklist) CONFIG.REQUIRE_CHECKLIST_DEFAULT = d.requireChecklist === "true";
    if (d.requirePhotos) CONFIG.REQUIRE_PHOTOS_DEFAULT = d.requirePhotos === "true";
    if (d.requireSignature) CONFIG.REQUIRE_SIGNATURE_DEFAULT = d.requireSignature === "true";
    if (d.checklist) {
      try {
        const parsed = JSON.parse(d.checklist);
        if (Array.isArray(parsed)) CONFIG.DEFAULT_CHECKLIST = parsed;
      } catch (_) {}
    }
  }

  function injectStyles() {
    if (document.getElementById("ti-styles")) return;
    const style = document.createElement("style");
    style.id = "ti-styles";
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

.ti-shell {
  font-family: "Manrope", sans-serif;
  background: radial-gradient(1200px 600px at 10% -10%, #e3f2ff 0%, #f6f7fb 55%, #f6f7fb 100%);
  color: #0f172a;
  padding: 20px;
  border-radius: 18px;
}

.ti-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
}

.ti-eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 6px;
}

.ti-h1 {
  font-family: "Space Grotesk", sans-serif;
  font-size: 26px;
  font-weight: 700;
}

.ti-stat {
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 14px;
  border-radius: 14px;
  text-align: center;
}

.ti-stat-value {
  font-size: 20px;
  font-weight: 700;
}

.ti-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.8;
  letter-spacing: 0.08em;
}

.ti-controls {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.ti-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ti-chip {
  border: 1px solid #cbd5f5;
  background: #fff;
  color: #1e293b;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
}

.ti-chip.is-active {
  background: #0ea5e9;
  border-color: #0ea5e9;
  color: #fff;
}

.ti-search input {
  width: 100%;
  border: 1px solid #cbd5f5;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
}

.ti-list {
  display: grid;
  gap: 14px;
}

.ti-card {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 12px;
}

.ti-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ti-title {
  font-size: 16px;
  font-weight: 600;
}

.ti-meta {
  margin-top: 6px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}

.ti-meta-item {
  display: block;
}

.ti-badge {
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
}

.ti-badge--success { background: #dcfce7; color: #166534; }
.ti-badge--warning { background: #fef9c3; color: #854d0e; }
.ti-badge--danger { background: #fee2e2; color: #991b1b; }
.ti-badge--info { background: #e0f2fe; color: #075985; }
.ti-badge--neutral { background: #e2e8f0; color: #1e293b; }

.ti-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ti-btn {
  border: none;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ti-btn--ghost {
  background: #f1f5f9;
  color: #0f172a;
}

.ti-btn--primary {
  background: #0ea5e9;
  color: #fff;
}

.ti-btn.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.ti-details {
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
}

.ti-grid {
  display: grid;
  gap: 8px;
}

.ti-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  margin-bottom: 6px;
}

.ti-value {
  font-size: 14px;
}

.ti-validate {
  border-top: 1px dashed #e2e8f0;
  padding-top: 12px;
}

.ti-validate-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.ti-validate-sub {
  font-size: 12px;
  color: #64748b;
}

.ti-block {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.ti-checklist {
  display: grid;
  gap: 6px;
}

.ti-check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.ti-file {
  width: 100%;
}

.ti-previews {
  display: grid;
  gap: 10px;
}

.ti-preview {
  display: grid;
  gap: 6px;
}

.ti-preview img {
  width: 100%;
  border-radius: 12px;
  object-fit: cover;
}

.ti-preview-meta {
  font-size: 11px;
  color: #64748b;
}

.ti-textarea {
  width: 100%;
  border: 1px solid #cbd5f5;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
}

.ti-signature {
  border: 1px solid #cbd5f5;
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.ti-signature-canvas {
  width: 100%;
  height: 160px;
  background: #fff;
  border-radius: 10px;
}

.ti-btn--xs {
  padding: 6px 10px;
  font-size: 12px;
  justify-self: start;
}

.ti-validate-actions {
  margin-top: 10px;
}

.ti-skeleton {
  height: 140px;
  border-radius: 16px;
  background: linear-gradient(90deg, #edf2f7 0%, #f8fafc 50%, #edf2f7 100%);
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}

.ti-empty {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  text-align: center;
  color: #475569;
}

.ti-empty-title {
  font-weight: 600;
}

.ti-toasts {
  position: sticky;
  bottom: 16px;
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.ti-toast {
  background: #0f172a;
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
}

.ti-toast--success { background: #16a34a; }
.ti-toast--warn { background: #f59e0b; }
.ti-toast--error { background: #dc2626; }

@media (min-width: 768px) {
  .ti-controls {
    grid-template-columns: 1fr 280px;
    align-items: center;
  }
}
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".interventions-list");
  }
})();
