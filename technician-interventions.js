<script>
(() => {
  if (window.__techInterventionsLoaded) return;
  window.__techInterventionsLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    DETAIL_PAGE_PATH: "/extranet/intervention",
    STORAGE_BUCKET: "interventions-files",
    REPORTS_TABLE: "intervention_reports",
    EXPENSES_TABLE: "intervention_expenses",
    PRODUCTS_TABLE: "products",

    STATUS_DONE: "done",
    STATUS_IN_PROGRESS: "in_progress",
    ENABLE_STATUS_UPDATE: true,

    REQUIRE_CHECKLIST_DEFAULT: true,
    REQUIRE_PHOTOS_DEFAULT: false,
    REQUIRE_SIGNATURE_DEFAULT: false,

    PV_URL_FIELD: "pv_blank_url",
    PV_PATH_FIELD: "pv_blank_path",
    SIGNED_PV_URL_FIELD: "pv_signed_url",
    SIGNED_PV_PATH_FIELD: "pv_signed_path",
    REMUNERATION_FIELD: "tech_fee",
    CURRENCY: "EUR",

    ACTIVE_STORAGE_KEY: "mbl-active-intervention",
    STEPS_STORAGE_KEY: "mbl-intervention-steps"
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
    arriveCTA: "Arrive sur place",
    continueCTA: "Continuer",
    validateCTA: "Valider l'intervention",
    notesLabel: "Observations",
    diagnosticLabel: "Diagnostic",
    resolutionLabel: "Resolution",
    photosLabel: "Photos",
    photosHint: "Ajoute 1 ou plusieurs photos",
    checklistLabel: "Checklist",
    signatureLabel: "Signature client",
    signatureHint: "Signe dans la zone ci-dessous",
    signatureClear: "Effacer",
    signedPvLabel: "PV signe",
    signedPvHint: "Ajoute un PV signe (PDF ou photo)",
    confirmValidate: "Confirmer la validation ?",
    toastSaved: "Intervention validee",
    toastSavedPartial: "Validation enregistree mais statut non mis a jour",
    toastError: "Une erreur est survenue",
    toastStart: "Intervention demarree",
    toastStartError: "Impossible de demarrer",
    toastReportMissing: "Rapport non enregistre (table manquante)",
    toastExpensesMissing: "Produits non enregistres (table manquante)",
    toastProductsInvalid: "Produits incomplets. Verifie les quantites et prix.",
    toastNeedDiagnostic: "Renseigne le diagnostic",
    toastNeedResolution: "Renseigne la resolution",
    toastNeedPhotos: "Ajoute au moins une photo",
    toastNeedSignature: "Signature obligatoire",
    mapChooseTitle: "Choisir une app",
    mapPlans: "Plans",
    mapGoogle: "Google Maps",
    mapWaze: "Waze",
    mapCancel: "Annuler",
    focusTitle: "Intervention en cours",
    focusBody: "Termine l'intervention en cours pour acceder aux autres."
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

  let mapAddress = "";

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
    signedPv: {},
    diagnostic: {},
    resolution: {},
    observations: {},
    userId: null,
    activeId: loadActiveId(),
    steps: loadSteps(),
    products: {},
    productsLoaded: {},
    catalog: [],
    catalogLoaded: false
  };

  init();

  async function init() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      els.list.innerHTML = `
        <div class="ti-empty">
          <div class="ti-empty-title">Session expiree</div>
          <div class="ti-empty-body">Merci de vous reconnecter.</div>
        </div>
      `;
      return;
    }

    showSkeleton(els.list);
    try {
      state.userId = authData.user.id;
      loadCatalog();
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
      .select("id, user_id, intervention_id, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .order("id", { ascending: false });

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
        ${pvUrl ? `<button class="ti-btn ti-btn--ghost" data-action="pv">${STR.pvCTA}</button>` : ""}
        <button class="ti-btn ti-btn--ghost" data-action="toggle-details">${STR.detailsCTA}</button>
        ${showStart ? `<button class="ti-btn ti-btn--start" data-action="start">${STR.startCTA}</button>` : ""}
        ${showFlow ? `<button class="ti-btn ti-btn--primary" data-action="toggle-flow">${STR.flowCTA}</button>` : ""}
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
          ${pvUrl ? infoRow("PV vierge", `<button class="ti-link" data-action="pv">${STR.pvCTA}</button>`, true) : ""}
        </div>
      </div>

      <div class="ti-flow" hidden></div>
    `;

    const detailsBtn = card.querySelector('[data-action="toggle-details"]');
    const flowBtn = card.querySelector('[data-action="toggle-flow"]');
    const startBtn = card.querySelector('[data-action="start"]');
    const mapBtn = card.querySelector('[data-action="map"]');
    const pvBtn = card.querySelector('[data-action="pv"]');
    const detailsPanel = card.querySelector(".ti-details");
    const flowPanel = card.querySelector(".ti-flow");

    if (detailsBtn) {
      detailsBtn.addEventListener("click", () => {
        detailsPanel.hidden = !detailsPanel.hidden;
      });
    }

    if (flowBtn) {
      flowBtn.addEventListener("click", () => {
        if (!flowPanel.dataset.ready) {
          renderFlow(flowPanel, row);
          flowPanel.dataset.ready = "1";
        }
        flowPanel.hidden = !flowPanel.hidden;
        if (!flowPanel.hidden) {
          flowPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => startIntervention(row, startBtn, flowPanel));
    }

    if (mapBtn && !mapBtn.disabled) {
      mapBtn.addEventListener("click", () => openMapSheet(address));
    }

    if (pvBtn) {
      pvBtn.addEventListener("click", () => openPv(row));
    }

    return card;
  }

  function renderFlow(container, row) {
    const id = row.id;
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);

    state.checklist[id] = state.checklist[id] || getChecklist(row).map(() => false);
    state.notes[id] = state.notes[id] || "";
    state.files[id] = state.files[id] || [];
    state.previews[id] = state.previews[id] || [];
    state.signatures[id] = state.signatures[id] || { canvas: null, hasSignature: false };
    state.signedPv[id] = state.signedPv[id] || null;
    state.products[id] = state.products[id] || [];
    state.diagnostic[id] = state.diagnostic[id] || "";
    state.resolution[id] = state.resolution[id] || "";
    state.observations[id] = state.observations[id] || "";

    const steps = getFlowSteps(requiresSignature);
    const current = getStep(id, steps.length);

    container.innerHTML = `
      <div class="ti-steps">
        ${steps.map((s, i) => `<div class="ti-step ${i+1 < current ? "is-done" : i+1 === current ? "is-active" : ""}">${i+1}. ${s.label}</div>`).join("")}
      </div>

      <div class="ti-flow-section" data-flow="arrive">
        <div class="ti-flow-title">Informations & PV</div>
        <div class="ti-flow-info">
          ${infoRow("Adresse", row.address || "")}
          ${infoRow("Date", formatDateFR(row.start_at) || "")}
          ${infoRow("Telephone", formatPhoneReadable(row.support_phone || "") || "")}
          ${getPvUrl(row) ? infoRow("PV vierge", `<button class="ti-link" data-action="pv">${STR.pvCTA}</button>`, true) : ""}
        </div>
        <button class="ti-btn ti-btn--primary" data-action="arrive">${STR.arriveCTA}</button>
      </div>

      <div class="ti-flow-section" data-flow="diagnostic">
        <div class="ti-flow-title">${STR.diagnosticLabel}</div>
        <textarea class="ti-textarea" data-field="diagnostic" rows="4" placeholder="Decris le diagnostic...">${escapeHTML(state.diagnostic[id])}</textarea>
        <button class="ti-btn ti-btn--primary" data-action="next-diagnostic">${STR.continueCTA}</button>
      </div>

      <div class="ti-flow-section" data-flow="resolution">
        <div class="ti-flow-title">${STR.resolutionLabel}</div>
        <textarea class="ti-textarea" data-field="resolution" rows="4" placeholder="Decris la resolution...">${escapeHTML(state.resolution[id])}</textarea>
        <button class="ti-btn ti-btn--primary" data-action="next-resolution">${STR.continueCTA}</button>
      </div>

      <div class="ti-flow-section" data-flow="photos">
        <div class="ti-flow-title">${STR.photosLabel}</div>
        <div class="ti-hint">${STR.photosHint}</div>
        <div class="ti-photo-actions">
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-camera">Prendre une photo</button>
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-gallery">Ajouter depuis galerie</button>
          <input type="file" class="ti-file" data-camera accept="image/*" capture="environment" />
          <input type="file" class="ti-file" data-gallery accept="image/*" multiple />
        </div>
        <div class="ti-previews" data-previews></div>
        <button class="ti-btn ti-btn--primary" data-action="next-photos">${STR.continueCTA}</button>
      </div>

      <div class="ti-flow-section" data-flow="products">
        <div class="ti-flow-title">Produits / Depenses</div>
        <div class="ti-products" data-products></div>
        <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="add-product">Ajouter un produit</button>
        <div class="ti-products-total" data-products-total></div>
        <button class="ti-btn ti-btn--primary" data-action="next-products">${STR.continueCTA}</button>
      </div>

      ${requiresSignature ? `
      <div class="ti-flow-section" data-flow="signature">
        <div class="ti-flow-title">${STR.signatureLabel}</div>
        <div class="ti-hint">${STR.signatureHint}</div>
        <div class="ti-signature">
          <canvas class="ti-signature-canvas"></canvas>
          <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="sig-clear">${STR.signatureClear}</button>
        </div>
        <button class="ti-btn ti-btn--primary" data-action="next-signature">${STR.continueCTA}</button>
      </div>
      ` : ""}

      <div class="ti-flow-section" data-flow="observations">
        <div class="ti-flow-title">${STR.notesLabel}</div>
        <textarea class="ti-textarea" data-field="observations" rows="4" placeholder="Observations libres...">${escapeHTML(state.observations[id])}</textarea>
        <div class="ti-block">
          <div class="ti-label">${STR.signedPvLabel}</div>
          <div class="ti-hint">${STR.signedPvHint}</div>
          <input type="file" class="ti-file" data-signed-pv accept="application/pdf,image/*" />
        </div>
        <button class="ti-btn ti-btn--primary" data-action="next-observations">${STR.continueCTA}</button>
      </div>

      <div class="ti-flow-section" data-flow="validate">
        <div class="ti-flow-title">Validation</div>
        <div class="ti-block">
          <div class="ti-label">${STR.checklistLabel}</div>
          <div class="ti-checklist" data-checklist></div>
        </div>
        <button class="ti-btn ti-btn--primary" data-action="confirm-validate">${STR.validateCTA}</button>
      </div>
    `;

    container.querySelectorAll("[data-flow]").forEach((el) => el.hidden = true);
    showFlowStep(container, steps[current - 1].key);

    container.querySelectorAll("[data-action='pv']").forEach((b) => b.addEventListener("click", () => openPv(row)));

    const diag = container.querySelector("[data-field='diagnostic']");
    const reso = container.querySelector("[data-field='resolution']");
    const obs = container.querySelector("[data-field='observations']");
    if (diag) diag.addEventListener("input", () => state.diagnostic[id] = diag.value);
    if (reso) reso.addEventListener("input", () => state.resolution[id] = reso.value);
    if (obs) obs.addEventListener("input", () => state.observations[id] = obs.value);

    const arriveBtn = container.querySelector("[data-action='arrive']");
    if (arriveBtn) arriveBtn.addEventListener("click", () => {
      markArrived(row);
      goNext(container, steps, id);
    });

    const nextDiag = container.querySelector("[data-action='next-diagnostic']");
    if (nextDiag) nextDiag.addEventListener("click", () => {
      if (!state.diagnostic[id].trim()) return showToast("warn", STR.toastNeedDiagnostic);
      goNext(container, steps, id);
    });

    const nextRes = container.querySelector("[data-action='next-resolution']");
    if (nextRes) nextRes.addEventListener("click", () => {
      if (!state.resolution[id].trim()) return showToast("warn", STR.toastNeedResolution);
      goNext(container, steps, id);
    });

    const previews = container.querySelector("[data-previews]");
    renderPreviews(id, previews, state.files[id]);

    const cameraInput = container.querySelector("[data-camera]");
    const galleryInput = container.querySelector("[data-gallery]");
    const btnCamera = container.querySelector("[data-action='photo-camera']");
    const btnGallery = container.querySelector("[data-action='photo-gallery']");

    if (btnCamera) btnCamera.addEventListener("click", () => cameraInput.click());
    if (btnGallery) btnGallery.addEventListener("click", () => galleryInput.click());

    if (cameraInput) cameraInput.addEventListener("change", () => {
      appendFiles(id, cameraInput.files, previews);
      cameraInput.value = "";
    });

    if (galleryInput) galleryInput.addEventListener("change", () => {
      appendFiles(id, galleryInput.files, previews);
      galleryInput.value = "";
    });

    const nextPhotos = container.querySelector("[data-action='next-photos']");
    if (nextPhotos) nextPhotos.addEventListener("click", () => {
      if (requiresPhotos && (!state.files[id] || state.files[id].length === 0)) {
        return showToast("warn", STR.toastNeedPhotos);
      }
      goNext(container, steps, id);
    });

    const productsWrap = container.querySelector("[data-products]");
    const addProductBtn = container.querySelector('[data-action="add-product"]');

    ensureProductsLoaded(id).then(() => {
      renderProducts(productsWrap, id);
    });

    if (addProductBtn) addProductBtn.addEventListener("click", () => {
      state.products[id].push(createEmptyProduct());
      renderProducts(productsWrap, id);
    });

    const nextProducts = container.querySelector("[data-action='next-products']");
    if (nextProducts) nextProducts.addEventListener("click", () => {
      if (!validateProducts(id).ok) return showToast("warn", STR.toastProductsInvalid);
      goNext(container, steps, id);
    });

    if (requiresSignature) {
      const canvas = container.querySelector(".ti-signature-canvas");
      const clearBtn = container.querySelector('[data-action="sig-clear"]');
      setupSignatureCanvas(canvas, id);
      if (clearBtn) clearBtn.addEventListener("click", () => clearSignature(canvas, id));

      const nextSig = container.querySelector("[data-action='next-signature']");
      if (nextSig) nextSig.addEventListener("click", () => {
        if (!state.signatures[id].hasSignature) return showToast("warn", STR.toastNeedSignature);
        goNext(container, steps, id);
      });
    }

    const signedPvInput = container.querySelector("[data-signed-pv]");
    if (signedPvInput) signedPvInput.addEventListener("change", () => {
      state.signedPv[id] = signedPvInput.files?.[0] || null;
    });

    const nextObs = container.querySelector("[data-action='next-observations']");
    if (nextObs) nextObs.addEventListener("click", () => {
      goNext(container, steps, id);
    });

    const checklistWrap = container.querySelector("[data-checklist]");
    const list = getChecklist(row);
    if (checklistWrap) {
      checklistWrap.innerHTML = "";
      list.forEach((label, idx) => {
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
        }
      });
    }

    const confirmBtn = container.querySelector('[data-action="confirm-validate"]');
    if (confirmBtn) confirmBtn.addEventListener("click", async () => {
      if (!confirm(STR.confirmValidate)) return;
      await validateIntervention(container, row);
    });
  }

  function getFlowSteps(requiresSignature) {
    const steps = [
      { key: "arrive", label: "Arrivee" },
      { key: "diagnostic", label: "Diagnostic" },
      { key: "resolution", label: "Resolution" },
      { key: "photos", label: "Photos" },
      { key: "products", label: "Produits" }
    ];
    if (requiresSignature) steps.push({ key: "signature", label: "Signature" });
    steps.push({ key: "observations", label: "Observations" });
    steps.push({ key: "validate", label: "Validation" });
    return steps;
  }

  function goNext(container, steps, id) {
    const current = getStep(id, steps.length);
    const next = Math.min(current + 1, steps.length);
    setStep(id, next);
    showFlowStep(container, steps[next - 1].key);
    container.querySelectorAll(".ti-step").forEach((el, idx) => {
      el.classList.toggle("is-done", idx + 1 < next);
      el.classList.toggle("is-active", idx + 1 === next);
    });
  }

  function showFlowStep(container, key) {
    container.querySelectorAll("[data-flow]").forEach((el) => {
      el.hidden = el.dataset.flow !== key;
    });
  }

  async function startIntervention(row, btn, flowPanel) {
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
    renderList();

    if (flowPanel) {
      flowPanel.hidden = false;
      if (!flowPanel.dataset.ready) {
        renderFlow(flowPanel, row);
        flowPanel.dataset.ready = "1";
      }
    }
  }

  async function markArrived(row) {
    const arrivedAt = new Date().toISOString();
    const payload = {};
    if (hasField(row, "arrived_at")) payload.arrived_at = arrivedAt;

    if (Object.keys(payload).length) {
      await supabase.from("interventions").update(payload).eq("id", row.id);
    }
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

    if (!validateProducts(id).ok) {
      showToast("warn", STR.toastProductsInvalid);
      return;
    }

    const btn = container.querySelector('[data-action="confirm-validate"]');
    btn.disabled = true;
    btn.textContent = "Validation...";

    try {
      const completedAt = new Date().toISOString();

      const photoUploads = await uploadPhotos(id, state.files[id] || []);
      const signedPvUpload = await uploadSignedPv(id, state.signedPv[id]);

      const observationsText = buildObservations(row, {
        diagnostic: state.diagnostic[id],
        resolution: state.resolution[id],
        products: cleanProducts(state.products[id] || []),
        photos: photoUploads,
        signedPv: signedPvUpload,
        notes: state.observations[id]
      });

      const reportPayload = {
        intervention_id: id,
        user_id: state.userId,
        checklist: state.checklist[id],
        diagnostic: state.diagnostic[id] || "",
        resolution: state.resolution[id] || "",
        observations: observationsText,
        notes: state.observations[id] || "",
        photos: photoUploads,
        products: cleanProducts(state.products[id] || []),
        signed_pv: signedPvUpload,
        completed_at: completedAt
      };

      const reportOk = await saveReport(reportPayload);
      const expensesOk = await saveExpenses(id);

      let statusUpdated = true;
      if (CONFIG.ENABLE_STATUS_UPDATE) {
        statusUpdated = await updateIntervention(id, completedAt, row, observationsText, signedPvUpload);
      }

      if (statusUpdated) showToast("success", STR.toastSaved);
      else showToast("warn", STR.toastSavedPartial);

      if (!reportOk) showToast("warn", STR.toastReportMissing);
      if (!expensesOk) showToast("warn", STR.toastExpensesMissing);

      setActiveId(null);
      setStep(id, 1);
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

  async function uploadSignedPv(interventionId, file) {
    if (!file) return null;

    const bucket = CONFIG.STORAGE_BUCKET;
    const ext = getFileExtension(file.name);
    const name = `pv_signed_${Date.now()}_${randomId()}.${ext || "pdf"}`;
    const path = `interventions/${interventionId}/${name}`;

    const { error } = await supabase
      .storage
      .from(bucket)
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (error) return null;

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
  }

  async function saveReport(payload) {
    const { error } = await supabase
      .from(CONFIG.REPORTS_TABLE)
      .upsert(payload, { onConflict: "intervention_id,user_id" });

    if (error) {
      if (isTableMissing(error)) return false;
      return false;
    }
    return true;
  }

  async function saveExpenses(interventionId) {
    const rows = cleanProducts(state.products[interventionId] || []);
    if (!rows.length) return true;

    const del = await supabase
      .from(CONFIG.EXPENSES_TABLE)
      .delete()
      .eq("intervention_id", interventionId)
      .eq("user_id", state.userId);

    if (del.error && isTableMissing(del.error)) return false;

    const payload = rows.map((r) => ({
      intervention_id: interventionId,
      user_id: state.userId,
      label: r.name,
      quantity: r.qty,
      unit_price: r.unitPrice,
      total: r.total,
      paid_by_tech: r.paidByTech,
      note: r.note || null
    }));

    const ins = await supabase.from(CONFIG.EXPENSES_TABLE).insert(payload);
    if (ins.error && isTableMissing(ins.error)) return false;
    return !ins.error;
  }

  async function ensureProductsLoaded(interventionId) {
    if (state.productsLoaded[interventionId]) return;
    state.productsLoaded[interventionId] = true;

    try {
      const res = await supabase
        .from(CONFIG.EXPENSES_TABLE)
        .select("*")
        .eq("intervention_id", interventionId)
        .eq("user_id", state.userId);

      if (res.error) return;

      if (Array.isArray(res.data) && res.data.length) {
        state.products[interventionId] = res.data.map((r) => ({
          name: r.label || r.name || "",
          qty: Number(r.quantity || 1),
          unitPrice: Number(r.unit_price || r.price || 0),
          paidByTech: !!r.paid_by_tech,
          note: r.note || ""
        }));
      }
    } catch (_) {}
  }

  async function loadCatalog() {
    if (state.catalogLoaded) return;
    state.catalogLoaded = true;

    const res = await supabase
      .from(CONFIG.PRODUCTS_TABLE)
      .select("*")
      .limit(500);

    if (res.error) return;

    const mapped = (res.data || [])
      .map((r) => ({
        name: r.name || r.title || r.label,
        price: r.price ?? r.unit_price ?? r.cost ?? null
      }))
      .filter((r) => r.name);

    state.catalog = mapped;
    renderCatalogList();
  }

  function renderCatalogList() {
    const list = root.querySelector("#ti-products-list");
    if (!list) return;
    list.innerHTML = state.catalog
      .map((p) => `<option value="${escapeHTML(p.name)}"></option>`)
      .join("");
  }

  function findCatalogItem(name) {
    if (!name) return null;
    const n = String(name).trim().toLowerCase();
    return state.catalog.find((p) => String(p.name).trim().toLowerCase() === n) || null;
  }

  function renderProducts(container, interventionId) {
    if (!container) return;
    container.dataset.interventionId = interventionId;
    const items = state.products[interventionId] || [];

    if (!items.length) {
      container.innerHTML = `<div class="ti-products-empty">Aucun produit ajoute</div>`;
    } else {
      container.innerHTML = items
        .map((item, idx) => productRowTemplate(item, idx))
        .join("");
    }

    const total = computeProductsTotal(items);
    const totalPaidByTech = computeProductsTotal(items, true);

    const totalEl = container.closest("[data-flow='products']")?.querySelector("[data-products-total]");
    if (totalEl) {
      totalEl.textContent = `Total: ${formatMoney(total)} | A rembourser: ${formatMoney(totalPaidByTech)}`;
    }

    if (container.dataset.bound === "1") return;
    container.dataset.bound = "1";

    container.addEventListener("input", (e) => {
      const rowEl = e.target.closest("[data-product-row]");
      if (!rowEl) return;

      const index = Number(rowEl.dataset.index);
      const field = e.target.dataset.field;
      const id = container.dataset.interventionId;
      const arr = state.products[id] || [];

      if (!arr[index]) return;

      if (field === "paidByTech") {
        arr[index].paidByTech = e.target.checked;
      } else if (field === "qty") {
        arr[index].qty = toNumber(e.target.value);
      } else if (field === "unitPrice") {
        arr[index].unitPrice = toNumber(e.target.value);
      } else if (field === "name") {
        arr[index].name = e.target.value;
        const catalog = findCatalogItem(arr[index].name);
        if (catalog && !arr[index].unitPrice) {
          arr[index].unitPrice = Number(catalog.price || 0);
          const priceInput = rowEl.querySelector('[data-field="unitPrice"]');
          if (priceInput) priceInput.value = arr[index].unitPrice || "";
        }
      } else if (field === "note") {
        arr[index].note = e.target.value;
      }

      renderProducts(container, id);
    });

    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='remove-product']");
      if (!btn) return;

      const index = Number(btn.dataset.index);
      const id = container.dataset.interventionId;
      const arr = state.products[id] || [];
      arr.splice(index, 1);
      renderProducts(container, id);
    });
  }

  function productRowTemplate(item, idx) {
    const total = computeLineTotal(item);
    return `
      <div class="ti-product-row" data-product-row data-index="${idx}">
        <input class="ti-input" list="ti-products-list" data-field="name" placeholder="Produit / piece" value="${escapeHTML(item.name || "")}" />
        <input class="ti-input ti-input--xs" data-field="qty" type="number" min="1" step="1" placeholder="Qté" value="${item.qty || ""}" />
        <input class="ti-input ti-input--xs" data-field="unitPrice" type="number" min="0" step="0.01" placeholder="Prix" value="${item.unitPrice || ""}" />
        <div class="ti-product-total">${formatMoney(total)}</div>
        <label class="ti-check-inline">
          <input type="checkbox" data-field="paidByTech" ${item.paidByTech ? "checked" : ""} />
          Paye par tech
        </label>
        <input class="ti-input" data-field="note" placeholder="Note" value="${escapeHTML(item.note || "")}" />
        <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="remove-product" data-index="${idx}">Supprimer</button>
      </div>
    `;
  }

  function createEmptyProduct() {
    return { name: "", qty: 1, unitPrice: 0, paidByTech: false, note: "" };
  }

  function computeLineTotal(item) {
    const qty = toNumber(item.qty);
    const price = toNumber(item.unitPrice);
    return qty * price;
  }

  function computeProductsTotal(items, onlyPaidByTech = false) {
    return (items || []).reduce((acc, it) => {
      if (onlyPaidByTech && !it.paidByTech) return acc;
      return acc + computeLineTotal(it);
    }, 0);
  }

  function validateProducts(interventionId) {
    const items = state.products[interventionId] || [];
    for (const it of items) {
      const hasAny = (it.name || it.qty || it.unitPrice || it.note);
      if (!hasAny) continue;
      if (!it.name || toNumber(it.qty) <= 0 || toNumber(it.unitPrice) < 0) {
        return { ok: false };
      }
    }
    return { ok: true };
  }

  function cleanProducts(items) {
    return (items || [])
      .filter((it) => it.name && toNumber(it.qty) > 0)
      .map((it) => ({
        name: it.name,
        qty: toNumber(it.qty),
        unitPrice: toNumber(it.unitPrice),
        total: computeLineTotal(it),
        paidByTech: !!it.paidByTech,
        note: it.note || ""
      }));
  }

  async function updateIntervention(id, completedAt, row, observationsText, signedPv) {
    const payload = { status: CONFIG.STATUS_DONE };
    if (hasField(row, "completed_at")) payload.completed_at = completedAt;

    const obsField = findExistingField(row, ["observations", "tech_observations", "report_notes", "notes_tech"]);
    if (obsField) payload[obsField] = observationsText;

    if (signedPv) {
      const pvField = findExistingField(row, [CONFIG.SIGNED_PV_URL_FIELD, "pv_signed_url"]);
      const pvPathField = findExistingField(row, [CONFIG.SIGNED_PV_PATH_FIELD, "pv_signed_path"]);
      if (pvField && signedPv.url) payload[pvField] = signedPv.url;
      if (pvPathField && signedPv.path) payload[pvPathField] = signedPv.path;
    }

    const { error } = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("Update error", error);
      return false;
    }
    return true;
  }

  async function openPv(row) {
    const src = getPvSource(row);
    if (!src) return;

    if (src.url) {
      window.open(src.url, "_blank");
      return;
    }

    if (src.path) {
      const signed = await supabase.storage.from(CONFIG.STORAGE_BUCKET).createSignedUrl(src.path, 300);
      if (!signed.error && signed.data?.signedUrl) {
        window.open(signed.data.signedUrl, "_blank");
        return;
      }
      const pub = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(src.path);
      if (pub?.data?.publicUrl) window.open(pub.data.publicUrl, "_blank");
    }
  }

  function getPvSource(row) {
    const keys = [
      CONFIG.PV_URL_FIELD,
      CONFIG.PV_PATH_FIELD,
      "pv_url",
      "pv",
      "pv_file",
      "pv_blank",
      "pv_path"
    ];

    for (const k of keys) {
      const v = row?.[k];
      if (!v) continue;
      if (typeof v === "string") {
        if (/^https?:\/\//i.test(v)) return { url: v };
        return { path: v };
      }
      if (typeof v === "object") {
        if (v.url) return { url: v.url };
        if (v.path) return { path: v.path };
      }
    }
    return null;
  }

  function getPvUrl(row) {
    const src = getPvSource(row);
    if (!src) return "";
    return src.url || src.path || "";
  }

  function buildObservations(row, parts) {
    const lines = [];
    lines.push(`Intervention: ${row.title || ""}`);
    if (row.client_name) lines.push(`Client: ${row.client_name}`);
    if (parts.diagnostic) lines.push(`\n[Diagnostic]\n${parts.diagnostic}`);
    if (parts.resolution) lines.push(`\n[Resolution]\n${parts.resolution}`);

    if (parts.products && parts.products.length) {
      lines.push("\n[Produits]");
      parts.products.forEach((p) => {
        const paid = p.paidByTech ? " (paye par tech)" : "";
        lines.push(`- ${p.name} x${p.qty} @ ${formatMoney(p.unitPrice)} = ${formatMoney(p.total)}${paid}`);
      });
    }

    if (parts.photos && parts.photos.length) {
      lines.push(`\n[Photos] ${parts.photos.length} photo(s) jointes`);
    }

    if (parts.signedPv) {
      lines.push(`\n[PV signe] ${parts.signedPv.url || parts.signedPv.path}`);
    }

    if (parts.notes) {
      lines.push(`\n[Observations]\n${parts.notes}`);
    }

    return lines.join("\n");
  }

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <datalist id="ti-products-list"></datalist>
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
    const toasts = rootEl.querySelector("[data-ti-toasts]");
    const sheet = rootEl.querySelector("[data-ti-sheet]");
    const sheetClose = Array.from(rootEl.querySelectorAll("[data-ti-sheet-close]"));
    const focus = rootEl.querySelector("[data-ti-focus]");
    const focusTitle = rootEl.querySelector("[data-ti-focus-title]");
    const focusBody = rootEl.querySelector("[data-ti-focus-body]");
    const sticky = rootEl.querySelector("[data-ti-sticky]");

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

    sheetClose.forEach((el) => {
      el.addEventListener("click", closeMapSheet);
    });

    return { list, count, toasts, sheet, search, filters, focus, focusTitle, focusBody, sticky };
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
    const url = buildMapUrl(provider, mapAddress);
    if (url) window.open(url, "_blank");
    closeMapSheet();
  }

  function buildMapUrl(provider, address) {
    const q = encodeURIComponent(String(address).trim());
    if (provider === "apple") return `https://maps.apple.com/?daddr=${q}`;
    if (provider === "google") return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    if (provider === "waze") return `https://waze.com/ul?q=${q}&navigate=yes`;
    return buildDirectionsUrl(address);
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
  
      if (q) {
        const hay = [
          row.client_name,
          row.title,
          row.address,
          row.support_phone
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
  
      return true;
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

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `ti-toast ti-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function appendFiles(id, fileList, previews) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    state.files[id] = (state.files[id] || []).concat(files);
    renderPreviews(id, previews, state.files[id]);
  }

  function renderPreviews(id, container, files) {
    container.innerHTML = "";
    if (!files || !files.length) return;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement("div");
      item.className = "ti-preview";
      item.innerHTML = `
        <img src="${url}" alt="photo" />
        <div class="ti-preview-meta">${escapeHTML(file.name)} (${formatBytes(file.size)})</div>
      `;
      container.appendChild(item);
    });
  }

  function getChecklist(row) {
    if (Array.isArray(row.checklist) && row.checklist.length) return row.checklist;
    return [
      "Confirmer le contact sur place",
      "Photos avant intervention",
      "Diagnostic / verification",
      "Realisation de l'intervention",
      "Tests de fonctionnement",
      "Explication au client",
      "Photos apres intervention",
      "Nettoyage de la zone"
    ];
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

  function isStartedStatus(status) {
    return status === "in_progress" || status === "done";
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

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: CONFIG.CURRENCY }).format(num);
  }

  function getFieldValue(row, key) {
    if (!row || !key) return "";
    const v = row[key];
    return (v === null || v === undefined) ? "" : v;
  }

  function infoRow(label, value, isHtml = false) {
    if (!value) return "";
    const safeLabel = escapeHTML(label);
    const safeValue = isHtml ? value : escapeHTML(value);
    return `
      <div class="ti-info">
        <div class="ti-label">${safeLabel}</div>
        <div class="ti-value">${safeValue}</div>
      </div>
    `;
  }

  function hasField(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key);
  }

  function findExistingField(row, keys) {
    for (const k of keys) {
      if (hasField(row, k)) return k;
    }
    return "";
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

  function toNumber(v) {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function isTableMissing(error) {
    const msg = String(error?.message || "");
    return msg.includes("Could not find the table") || String(error?.code || "") === "PGRST205";
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

  function loadSteps() {
    try {
      const raw = localStorage.getItem(CONFIG.STEPS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveSteps() {
    try { localStorage.setItem(CONFIG.STEPS_STORAGE_KEY, JSON.stringify(state.steps)); }
    catch (_) {}
  }

  function getStep(id, max) {
    const v = Number(state.steps[id] || 1);
    return Math.max(1, Math.min(v, max));
  }

  function setStep(id, step) {
    state.steps[id] = step;
    saveSteps();
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

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset;
    if (d.detailPath) CONFIG.DETAIL_PAGE_PATH = d.detailPath;
    if (d.storageBucket) CONFIG.STORAGE_BUCKET = d.storageBucket;
    if (d.reportsTable) CONFIG.REPORTS_TABLE = d.reportsTable;
    if (d.expensesTable) CONFIG.EXPENSES_TABLE = d.expensesTable;
    if (d.productsTable) CONFIG.PRODUCTS_TABLE = d.productsTable;
    if (d.statusDone) CONFIG.STATUS_DONE = d.statusDone;
    if (d.statusInProgress) CONFIG.STATUS_IN_PROGRESS = d.statusInProgress;
    if (d.requireChecklist) CONFIG.REQUIRE_CHECKLIST_DEFAULT = d.requireChecklist === "true";
    if (d.requirePhotos) CONFIG.REQUIRE_PHOTOS_DEFAULT = d.requirePhotos === "true";
    if (d.requireSignature) CONFIG.REQUIRE_SIGNATURE_DEFAULT = d.requireSignature === "true";
    if (d.pvUrlField) CONFIG.PV_URL_FIELD = d.pvUrlField;
    if (d.pvPathField) CONFIG.PV_PATH_FIELD = d.pvPathField;
    if (d.signedPvUrlField) CONFIG.SIGNED_PV_URL_FIELD = d.signedPvUrlField;
    if (d.signedPvPathField) CONFIG.SIGNED_PV_PATH_FIELD = d.signedPvPathField;
    if (d.remunerationField) CONFIG.REMUNERATION_FIELD = d.remunerationField;
    if (d.currency) CONFIG.CURRENCY = d.currency;
  }

  function injectStyles() {
    if (document.getElementById("ti-styles")) return;
    const style = document.createElement("style");
    style.id = "ti-styles";
    style.textContent = `/* styles inchangés */`;
    style.textContent = document.querySelector("#ti-styles")?.textContent || style.textContent;
    if (!document.querySelector("#ti-styles")) document.head.appendChild(style);
  }

  function findRoot() {
    return document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".interventions-list");
  }
})();
</script>
