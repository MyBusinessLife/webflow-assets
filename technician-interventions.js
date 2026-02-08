document.documentElement.setAttribute("data-page", "technician-interventions");

(() => {
  if (window.__techInterventionsLoaded) return;
  window.__techInterventionsLoaded = true;

  const APP_ROOT = (String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/) || [])[0] || "/applications";

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    DETAIL_PAGE_PATH: `${APP_ROOT}/intervention`,
    STORAGE_BUCKET: "interventions-files",
    REPORTS_TABLE: "",
    EXPENSES_TABLE: "intervention_expenses",
    PRODUCTS_TABLE: "products",
    ORGANIZATION_ID: (window.__MBL_CFG__?.ORGANIZATION_ID || window.__MBL_ORG_ID__ || ""),

    STATUS_DONE: "done",
    STATUS_IN_PROGRESS: "in_progress",
    ENABLE_STATUS_UPDATE: true,

    REQUIRE_CHECKLIST_DEFAULT: false,
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
    nextCTA: "Continuer",
    backCTA: "Retour",
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
    toastNeedChecklist: "Checklist incomplete",
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
    organizationId: "",
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
      state.organizationId = resolveOrganizationId(state.items[0] || {});
      syncActiveId();
      renderList();
    } catch (e) {
      renderError(els.list);
    }
  }

  async function fetchAssignments(userId) {
    const res = await supabase
      .from("intervention_assignees")
      .select(
        "id, user_id, intervention_id, interventions:intervention_id(*, intervention_type:intervention_type_id(id, key, name, metadata, default_billing_mode))"
      )
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
    setControlsDisabled(false);

    const listData = filterItems(state.items);

    els.count.textContent = String(listData.length);

    if (!listData.length) {
      renderEmpty(els.list);
      return;
    }

    els.list.innerHTML = "";
    listData.forEach((row) => {
      const card = buildCard(row, focus, activeRow?.id || "");
      els.list.appendChild(card);
    });

    renderStickyBar(focus ? activeRow : listData[0]);
  }

  function buildCard(row, hasGlobalActive = false, activeInterventionId = "") {
    const card = document.createElement("article");
    card.className = "ti-card";
    card.dataset.id = row.id;

    const status = String(row.status || "").toLowerCase();
    const isDone = isDoneStatus(status);
    const isCanceled = status === "canceled";
    const isStarted = isStartedStatus(status) || !!row.started_at;
    const isActiveCard = Boolean(activeInterventionId) && String(activeInterventionId) === String(row.id);
    const isLockedByOther = hasGlobalActive && !isActiveCard && !isDone && !isCanceled;

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

    const showStart = !isStarted && !isDone && !isCanceled && !isLockedByOther;
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

      ${isLockedByOther ? `<div class="ti-lock">Cette intervention est verrouillee tant que l'intervention en cours n'est pas terminee.</div>` : ""}

      <div class="ti-actions">
        <a class="ti-btn ti-btn--ghost ${phoneNormalized ? "" : "is-disabled"}" data-action="call" ${phoneNormalized ? `href="tel:${phoneNormalized}"` : ""}>${STR.callCTA}</a>
        <button class="ti-btn ti-btn--ghost ${address ? "" : "is-disabled"}" data-action="map" ${address ? "" : "disabled"}>${STR.mapCTA}</button>
        ${pvUrl ? `<a class="ti-btn ti-btn--ghost" href="${pvUrl}" target="_blank" rel="noopener" download>${STR.pvCTA}</a>` : ""}
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

      <div class="ti-flow" hidden></div>
    `;

    const detailsBtn = card.querySelector('[data-action="toggle-details"]');
    const flowBtn = card.querySelector('[data-action="toggle-flow"]');
    const startBtn = card.querySelector('[data-action="start"]');
    const mapBtn = card.querySelector('[data-action="map"]');
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
        card.classList.toggle("is-flow-open", !flowPanel.hidden);
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

    return card;
  }

  function renderFlow(container, row) {
    const id = row.id;
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const typeRow = row?.intervention_type || null;
    const typeKey = String(typeRow?.key || "").toLowerCase().trim();
    const typeMeta = typeRow?.metadata && typeof typeRow.metadata === "object" ? typeRow.metadata : {};

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

    const pickArray = (v) => (Array.isArray(v) ? v : null);
    const allowed = new Set([
      "arrive",
      "diagnostic",
      "resolution",
      "photos",
      "products",
      "signature",
      "observations",
      "validate",
    ]);

    const metaSteps =
      pickArray(typeMeta?.flow_steps) || pickArray(typeMeta?.flowSteps) || pickArray(typeMeta?.steps) || null;

    let stepKeys = null;
    if (metaSteps?.length) {
      stepKeys = metaSteps.map((s) => String(s || "").toLowerCase().trim()).filter(Boolean);
    } else if (typeKey === "formation") {
      stepKeys = ["arrive", "photos", "products", "observations", "validate"];
    } else {
      stepKeys = ["arrive", "diagnostic", "resolution", "photos", "products", "observations", "validate"];
    }

    stepKeys = stepKeys.filter((k) => allowed.has(k));
    if (!stepKeys.includes("arrive")) stepKeys.unshift("arrive");
    if (!stepKeys.includes("observations")) {
      const idx = stepKeys.indexOf("validate");
      if (idx >= 0) stepKeys.splice(idx, 0, "observations");
      else stepKeys.push("observations");
    }
    if (!stepKeys.includes("validate")) stepKeys.push("validate");

    // Enforce required artifacts to keep the flow valid.
    if (requiresPhotos && !stepKeys.includes("photos")) {
      const idx = stepKeys.includes("resolution") ? stepKeys.indexOf("resolution") + 1 : 1;
      stepKeys.splice(Math.min(Math.max(idx, 1), stepKeys.length), 0, "photos");
    }

    // Signature step: display only when required.
    stepKeys = stepKeys.filter((k) => k !== "signature");
    if (requiresSignature) {
      const idx = stepKeys.includes("observations") ? stepKeys.indexOf("observations") : stepKeys.length - 1;
      stepKeys.splice(Math.max(1, idx), 0, "signature");
    }

    const labelMap = {
      arrive: "Arrivee",
      diagnostic: "Diagnostic",
      resolution: "Resolution",
      photos: "Photos",
      products: "Produits",
      signature: "Signature",
      observations: "Observations",
      validate: "Validation",
    };

    const steps = stepKeys.map((k) => ({ key: k, label: labelMap[k] || k }));

    const step = getStep(id, steps.length);
    const pvUrl = getPvUrl(row);

    container.innerHTML = `
      <div class="ti-steps">
        ${steps.map((s, i) => `<div class="ti-step" data-step-index="${i+1}">${i+1}. ${s.label}</div>`).join("")}
      </div>

      <div class="ti-flow-section" data-flow-step="arrive">
        <div class="ti-flow-title">Informations & PV</div>
        <div class="ti-flow-info">
          ${infoRow("Adresse", row.address || "")}
          ${infoRow("Date", formatDateFR(row.start_at) || "")}
          ${infoRow("Telephone", formatPhoneReadable(row.support_phone || "") || "")}
          ${pvUrl ? infoRow("PV vierge", `<a class="ti-link" href="${pvUrl}" target="_blank" rel="noopener">${STR.pvCTA}</a>`, true) : ""}
        </div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--primary" data-action="arrive">${STR.arriveCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="diagnostic">
        <div class="ti-flow-title">${STR.diagnosticLabel}</div>
        <textarea class="ti-textarea" data-field="diagnostic" rows="4" placeholder="Decris le diagnostic...">${escapeHTML(state.diagnostic[id])}</textarea>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-diagnostic">${STR.nextCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="resolution">
        <div class="ti-flow-title">${STR.resolutionLabel}</div>
        <textarea class="ti-textarea" data-field="resolution" rows="4" placeholder="Decris la resolution...">${escapeHTML(state.resolution[id])}</textarea>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-resolution">${STR.nextCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="photos">
        <div class="ti-flow-title">${STR.photosLabel}</div>
        <div class="ti-hint">${STR.photosHint}</div>
        <div class="ti-photo-actions">
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-camera">Prendre une photo</button>
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-gallery">Ajouter depuis galerie</button>
          <input type="file" class="ti-file" data-camera accept="image/*" capture="environment" />
          <input type="file" class="ti-file" data-gallery accept="image/*" multiple />
        </div>
        <div class="ti-previews" data-previews></div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-photos">${STR.nextCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="products">
        <div class="ti-flow-title">Produits / Depenses</div>
        <div class="ti-products" data-products></div>
        <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="add-product">Ajouter un produit</button>
        <div class="ti-products-total" data-products-total></div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-products">${STR.nextCTA}</button>
        </div>
      </div>

      ${requiresSignature ? `
        <div class="ti-flow-section" data-flow-step="signature">
          <div class="ti-flow-title">${STR.signatureLabel}</div>
          <div class="ti-hint">${STR.signatureHint}</div>
          <div class="ti-signature">
            <canvas class="ti-signature-canvas"></canvas>
            <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="sig-clear">${STR.signatureClear}</button>
          </div>
          <div class="ti-flow-actions">
            <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
            <button class="ti-btn ti-btn--primary" data-action="next-signature">${STR.nextCTA}</button>
          </div>
        </div>
      ` : ""}

      <div class="ti-flow-section" data-flow-step="observations">
        <div class="ti-flow-title">${STR.notesLabel}</div>
        <textarea class="ti-textarea" data-field="observations" rows="4" placeholder="Observations libres...">${escapeHTML(state.observations[id])}</textarea>
        <div class="ti-block">
          <div class="ti-label">${STR.signedPvLabel}</div>
          <div class="ti-hint">${STR.signedPvHint}</div>
          <input type="file" class="ti-file" data-signed-pv accept="application/pdf,image/*" />
        </div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-observations">${STR.nextCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="validate">
        <div class="ti-flow-title">Validation</div>
        <div class="ti-block">
          <div class="ti-label">${STR.checklistLabel}</div>
          <div class="ti-checklist" data-checklist></div>
        </div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="confirm-validate">${STR.validateCTA}</button>
        </div>
      </div>
    `;

    const goTo = (next) => {
      const idx = Math.max(1, Math.min(next, steps.length));
      setStep(id, idx);
      showFlowStep(container, steps, idx);
    };
    const goNext = () => goTo(getStep(id, steps.length) + 1);
    const goPrev = () => goTo(getStep(id, steps.length) - 1);

    showFlowStep(container, steps, step);

    container.querySelectorAll("[data-action='prev-step']").forEach((btn) => {
      btn.addEventListener("click", () => goPrev());
    });

    const checklistWrap = container.querySelector("[data-checklist]");
    const list = getChecklist(row);
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

    const previews = container.querySelector("[data-previews]");
    renderPreviews(id, previews, state.files[id]);

    const cameraInput = container.querySelector("[data-camera]");
    const galleryInput = container.querySelector("[data-gallery]");
    const btnCamera = container.querySelector("[data-action='photo-camera']");
    const btnGallery = container.querySelector("[data-action='photo-gallery']");

    btnCamera.addEventListener("click", () => cameraInput.click());
    btnGallery.addEventListener("click", () => galleryInput.click());

    cameraInput.addEventListener("change", () => {
      appendFiles(id, cameraInput.files, previews);
      cameraInput.value = "";
    });

    galleryInput.addEventListener("change", () => {
      appendFiles(id, galleryInput.files, previews);
      galleryInput.value = "";
    });

    const productsWrap = container.querySelector("[data-products]");
    const addProductBtn = container.querySelector('[data-action="add-product"]');
    ensureProductsLoaded(id).then(() => {
      renderProducts(productsWrap, id);
    });

    addProductBtn.addEventListener("click", () => {
      state.products[id].push(createEmptyProduct());
      renderProducts(productsWrap, id);
    });

    const diag = container.querySelector("[data-field='diagnostic']");
    const reso = container.querySelector("[data-field='resolution']");
    const obs = container.querySelector("[data-field='observations']");
    diag.addEventListener("input", () => state.diagnostic[id] = diag.value);
    reso.addEventListener("input", () => state.resolution[id] = reso.value);
    obs.addEventListener("input", () => state.observations[id] = obs.value);

    const arriveBtn = container.querySelector("[data-action='arrive']");
    arriveBtn.addEventListener("click", () => {
      markArrived(row);
      goNext();
    });

    const nextDiag = container.querySelector("[data-action='next-diagnostic']");
    nextDiag.addEventListener("click", () => {
      if (!state.diagnostic[id].trim()) return showToast("warn", STR.toastNeedDiagnostic);
      goNext();
    });

    const nextRes = container.querySelector("[data-action='next-resolution']");
    nextRes.addEventListener("click", () => {
      if (!state.resolution[id].trim()) return showToast("warn", STR.toastNeedResolution);
      goNext();
    });

    const nextPhotos = container.querySelector("[data-action='next-photos']");
    nextPhotos.addEventListener("click", () => {
      if (requiresPhotos && (!state.files[id] || state.files[id].length === 0)) {
        return showToast("warn", STR.toastNeedPhotos);
      }
      goNext();
    });

    const nextProducts = container.querySelector("[data-action='next-products']");
    nextProducts.addEventListener("click", () => {
      if (!validateProducts(id).ok) return showToast("warn", STR.toastProductsInvalid);
      goNext();
    });

    if (requiresSignature) {
      const canvas = container.querySelector(".ti-signature-canvas");
      const clearBtn = container.querySelector('[data-action="sig-clear"]');
      setupSignatureCanvas(canvas, id);
      clearBtn.addEventListener("click", () => clearSignature(canvas, id));

      const nextSig = container.querySelector("[data-action='next-signature']");
      nextSig.addEventListener("click", () => {
        if (!state.signatures[id].hasSignature) return showToast("warn", STR.toastNeedSignature);
        goNext();
      });
    }

    const signedPvInput = container.querySelector("[data-signed-pv]");
    signedPvInput.addEventListener("change", () => {
      state.signedPv[id] = signedPvInput.files?.[0] || null;
    });

    const nextObs = container.querySelector("[data-action='next-observations']");
    nextObs.addEventListener("click", () => goNext());

    const confirmBtn = container.querySelector('[data-action="confirm-validate"]');
    confirmBtn.addEventListener("click", async () => {
      if (!confirm(STR.confirmValidate)) return;
      await validateIntervention(container, row);
    });
  }

  function showFlowStep(container, steps, step) {
    const key = steps[step - 1]?.key || steps[0].key;
    container.querySelectorAll("[data-flow-step]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.flowStep === key);
    });
    container.querySelectorAll("[data-step-index]").forEach((el) => {
      const s = Number(el.dataset.stepIndex);
      el.classList.toggle("is-done", s < step);
      el.classList.toggle("is-active", s === step);
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

    const checklist = state.checklist[id] || [];
    const checklistOk = !requiresChecklist || checklist.every(Boolean);
    const photosOk = !requiresPhotos || (state.files[id] && state.files[id].length > 0);
    const signatureOk = !requiresSignature || (state.signatures[id] && state.signatures[id].hasSignature);

    if (!checklistOk) return showToast("warn", STR.toastNeedChecklist);
    if (!photosOk) return showToast("warn", STR.toastNeedPhotos);
    if (!signatureOk) return showToast("warn", STR.toastNeedSignature);

    const productsValidation = validateProducts(id);
    if (!productsValidation.ok) {
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

      const idx = state.items.findIndex((x) => x.id === id);
      if (idx > -1) {
        state.items[idx].status = CONFIG.STATUS_DONE;
        if (hasField(row, "completed_at")) state.items[idx].completed_at = completedAt;
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

    let { error } = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", id);

    if (error && isStatusConstraintError(error)) {
      const fallback = ["done", "completed", "complete"];
      for (const s of fallback) {
        if (s === payload.status) continue;
        const retry = await supabase
          .from("interventions")
          .update({ ...payload, status: s })
          .eq("id", id);
        if (!retry.error) return true;
      }

      const noStatus = { ...payload };
      delete noStatus.status;
      const retryNoStatus = await supabase
        .from("interventions")
        .update(noStatus)
        .eq("id", id);

      if (!retryNoStatus.error) return false;
    }

    if (error) {
      console.error("Update error", error);
      return false;
    }
    return true;
  }

  function isStatusConstraintError(err) {
    const msg = String(err?.message || "");
    return String(err?.code || "") === "23514" || msg.includes("status_check");
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
    if (!CONFIG.REPORTS_TABLE) return true;

    const orgId = getOrganizationIdForIntervention(payload?.intervention_id);
    const { error } = await upsertWithOrgFallback(
      CONFIG.REPORTS_TABLE,
      payload,
      { onConflict: "intervention_id,user_id" },
      orgId
    );

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

    const orgId = getOrganizationIdForIntervention(interventionId);
    const ins = await insertWithOrgFallback(CONFIG.EXPENSES_TABLE, payload, orgId);
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
      container.innerHTML = items.map((item, idx) => productRowTemplate(item, idx)).join("");
    }

    updateProductsTotals(container, interventionId);

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

      const totalEl = rowEl.querySelector("[data-total]");
      if (totalEl) totalEl.textContent = formatMoney(computeLineTotal(arr[index]));
      updateProductsTotals(container, id);
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

  function updateProductsTotals(container, id) {
    const items = state.products[id] || [];
    const total = computeProductsTotal(items);
    const totalPaidByTech = computeProductsTotal(items, true);

    const totalEl = container.closest(".ti-block")?.querySelector("[data-products-total]");
    if (totalEl) {
      totalEl.textContent = `Total: ${formatMoney(total)} | A rembourser: ${formatMoney(totalPaidByTech)}`;
    }
  }

  function productRowTemplate(item, idx) {
    const total = computeLineTotal(item);
    return `
      <div class="ti-product-row" data-product-row data-index="${idx}">
        <input class="ti-input" list="ti-products-list" data-field="name" placeholder="Produit / piece" value="${escapeHTML(item.name || "")}" />
        <input class="ti-input ti-input--xs" data-field="qty" type="number" min="1" step="1" placeholder="Qté" value="${item.qty || ""}" />
        <input class="ti-input ti-input--xs" data-field="unitPrice" type="number" min="0" step="0.01" placeholder="Prix" value="${item.unitPrice || ""}" />
        <div class="ti-product-total" data-total>${formatMoney(total)}</div>
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

  function appendFiles(id, fileList, previews) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    state.files[id] = (state.files[id] || []).concat(files);
    renderPreviews(id, previews, state.files[id]);
  }

  function renderPreviews(id, container, files) {
    if (!container) return;

    const prev = state.previews[id] || [];
    prev.forEach((u) => URL.revokeObjectURL(u));
    state.previews[id] = [];

    container.innerHTML = "";
    if (!files || !files.length) return;

    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      state.previews[id].push(url);

      const item = document.createElement("div");
      item.className = "ti-preview";
      item.innerHTML = `
        <div class="ti-preview-media">
          <img src="${url}" alt="photo" data-preview-index="${index}" />
          <button type="button" class="ti-preview-remove" data-remove-index="${index}">Supprimer</button>
        </div>
        <div class="ti-preview-meta">${escapeHTML(file.name)} (${formatBytes(file.size)})</div>
      `;
      container.appendChild(item);
    });

    if (container.dataset.bound !== "1") {
      container.dataset.bound = "1";
      container.addEventListener("click", (e) => {
        const removeBtn = e.target.closest("[data-remove-index]");
        if (removeBtn) {
          const idx = Number(removeBtn.dataset.removeIndex);
          state.files[id].splice(idx, 1);
          renderPreviews(id, container, state.files[id]);
          return;
        }
        const img = e.target.closest("img[data-preview-index]");
        if (img) window.open(img.src, "_blank");
      });
    }
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

  function getPvUrl(row) {
    const keys = [
      CONFIG.PV_URL_FIELD,
      "pv_url",
      "pv",
      "pv_file",
      "pv_blank",
      CONFIG.PV_PATH_FIELD,
      "pv_path"
    ];

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

  function getFirstText(row, keys) {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
    }
    return "";
  }

  function pickFirst(row, keys) {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
    }
    return "";
  }

  function buildAccessInfo(row) {
    const parts = [];
    const pairs = [
      ["access_instructions", "Consignes acces"],
      ["access_code", "Code acces"],
      ["digicode", "Digicode"],
      ["door_code", "Code porte"],
      ["intercom", "Interphone"],
      ["floor", "Etage"],
      ["building", "Batiment"],
      ["parking", "Parking"]
    ];

    pairs.forEach(([key, label]) => {
      const val = row?.[key];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        parts.push(`${label}: ${String(val).trim()}`);
      }
    });

    return parts.join(" | ");
  }

  function buildEquipmentInfo(row) {
    const parts = [];
    const pairs = [
      ["equipment", "Materiel"],
      ["device", "Appareil"],
      ["brand", "Marque"],
      ["model", "Modele"],
      ["serial", "Serie"],
      ["serial_number", "Serie"]
    ];

    pairs.forEach(([key, label]) => {
      const val = row?.[key];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        parts.push(`${label}: ${String(val).trim()}`);
      }
    });

    return parts.join(" | ");
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

  function resolveOrganizationId(source) {
    if (!source) return "";
    return String(source.organization_id || source.organizationId || "").trim();
  }

  function getOrganizationIdForIntervention(interventionId) {
    const row = state.items.find((item) => String(item.id) === String(interventionId));
    return (
      resolveOrganizationId(row || {}) ||
      String(state.organizationId || "").trim() ||
      String(CONFIG.ORGANIZATION_ID || "").trim()
    );
  }

  function attachOrganization(payload, organizationId) {
    const orgId = String(organizationId || "").trim();
    if (!orgId) return payload;

    if (Array.isArray(payload)) {
      return payload.map((row) => {
        const item = { ...(row || {}) };
        if (!item.organization_id) item.organization_id = orgId;
        return item;
      });
    }

    const item = { ...(payload || {}) };
    if (!item.organization_id) item.organization_id = orgId;
    return item;
  }

  function stripOrganization(payload) {
    if (Array.isArray(payload)) {
      return payload.map((row) => {
        const item = { ...(row || {}) };
        delete item.organization_id;
        return item;
      });
    }
    const item = { ...(payload || {}) };
    delete item.organization_id;
    return item;
  }

  function isOrganizationColumnMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return (
      (code === "42703" || code === "PGRST204" || code === "PGRST205") &&
      msg.includes("organization_id")
    );
  }

  async function insertWithOrgFallback(table, payload, organizationId) {
    const orgPayload = attachOrganization(payload, organizationId);
    let res = await supabase.from(table).insert(orgPayload);
    if (res.error && isOrganizationColumnMissing(res.error)) {
      res = await supabase.from(table).insert(stripOrganization(payload));
    }
    return res;
  }

  async function upsertWithOrgFallback(table, payload, options, organizationId) {
    const orgPayload = attachOrganization(payload, organizationId);
    let res = await supabase.from(table).upsert(orgPayload, options || {});
    if (res.error && isOrganizationColumnMissing(res.error)) {
      res = await supabase.from(table).upsert(stripOrganization(payload), options || {});
    }
    return res;
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

  function getStep(id, max = 1) {
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

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `ti-toast ti-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset;
    if (d.detailPath) CONFIG.DETAIL_PAGE_PATH = d.detailPath;
    if (d.storageBucket) CONFIG.STORAGE_BUCKET = d.storageBucket;
    if (Object.prototype.hasOwnProperty.call(d, "reportsTable")) {
      CONFIG.REPORTS_TABLE = normalizeOptionalRelationName(d.reportsTable);
    }
    if (d.expensesTable) CONFIG.EXPENSES_TABLE = d.expensesTable;
    if (d.productsTable) CONFIG.PRODUCTS_TABLE = d.productsTable;
    if (d.organizationId) CONFIG.ORGANIZATION_ID = d.organizationId;
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

  function normalizeOptionalRelationName(value) {
    const raw = String(value || "").trim();
    const s = norm(raw);
    if (!raw) return "";
    if (["none", "null", "off", "false", "0"].includes(s)) return "";
    return raw;
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
.ti-card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);display:grid;gap:12px;position:relative}
.ti-card.is-flow-open{border:1px solid #bae6fd;box-shadow:0 16px 40px rgba(2,132,199,.18)}
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
.ti-lock{border:1px dashed #f59e0b;background:#fffbeb;color:#92400e;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700}
.ti-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ti-btn{border:none;padding:8px 12px;border-radius:10px;font-size:13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ti-btn--ghost{background:#f1f5f9;color:#0f172a}
.ti-btn--primary{background:#0ea5e9;color:#fff}
.ti-btn--start{background:#0f766e;color:#fff}
.ti-btn--xs{padding:6px 10px;font-size:12px}
.ti-btn.is-disabled{opacity:.4;pointer-events:none}
.ti-details{background:#f8fafc;border-radius:12px;padding:12px}
.ti-grid{display:grid;gap:8px}
.ti-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
.ti-value{font-size:14px}
.ti-link{color:#0ea5e9;text-decoration:none;font-weight:600}
.ti-flow{border-top:1px dashed #e2e8f0;padding-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:14px}
.ti-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;font-size:12px;background:#eef2ff;padding:6px;border-radius:12px}
.ti-step{background:#fff;border:1px solid #e2e8f0;padding:8px;border-radius:10px;text-align:center}
.ti-step.is-done{background:#22c55e;color:#fff;border-color:#16a34a;font-weight:600}
.ti-step.is-active{background:#0ea5e9;color:#fff;border-color:#0284c7;font-weight:600}
.ti-flow-section{display:none;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;animation:tiFade .2s ease}
.ti-flow-section.is-active{display:grid}
.ti-flow-title{font-weight:700;font-size:15px}
.ti-flow-info{display:grid;gap:8px}
.ti-flow-actions{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap}
.ti-block{margin-top:12px;display:grid;gap:8px}
.ti-checklist{display:grid;gap:6px}
.ti-check{display:flex;gap:8px;align-items:center;font-size:14px}
.ti-file{width:100%}
.ti-previews{display:grid;gap:10px}
.ti-preview{display:grid;gap:6px}
.ti-preview-media{position:relative}
.ti-preview img{width:100%;border-radius:12px;object-fit:cover}
.ti-preview-remove{position:absolute;top:8px;right:8px;background:#0f172a;color:#fff;border:none;border-radius:999px;padding:4px 8px;font-size:11px;cursor:pointer}
.ti-preview-meta{font-size:11px;color:#64748b}
.ti-textarea{width:100%;border:1px solid #cbd5f5;border-radius:12px;padding:10px;font-size:14px}
.ti-signature{border:1px solid #cbd5f5;border-radius:12px;padding:10px;display:grid;gap:8px}
.ti-signature-canvas{width:100%;height:160px;background:#fff;border-radius:10px}
.ti-products{display:grid;gap:8px}
.ti-products-empty{font-size:12px;color:#64748b}
.ti-product-row{display:grid;grid-template-columns:1.6fr .6fr .8fr .7fr 1fr 1.2fr auto;gap:6px;align-items:center}
.ti-input{border:1px solid #cbd5f5;border-radius:10px;padding:8px;font-size:13px}
.ti-input--xs{width:100%}
.ti-product-total{font-weight:600;font-size:13px}
.ti-check-inline{display:flex;align-items:center;gap:6px;font-size:12px}
.ti-products-total{font-size:12px;color:#475569;margin-top:4px}
.ti-photo-actions{display:flex;gap:8px;flex-wrap:wrap}
.ti-skeleton{height:140px;border-radius:16px;background:linear-gradient(90deg,#edf2f7 0%,#f8fafc 50%,#edf2f7 100%);animation:shimmer 1.4s infinite}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
@keyframes tiFade{from{opacity:.6;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.ti-empty{background:#fff;padding:20px;border-radius:16px;text-align:center;color:#475569}
.ti-empty-title{font-weight:600}
.ti-toasts{position:sticky;bottom:16px;display:grid;gap:8px;margin-top:16px}
.ti-toast{background:#0f172a;color:#fff;padding:10px 14px;border-radius:12px;font-size:13px;box-shadow:0 10px 30px rgba(15,23,42,.2)}
.ti-toast--success{background:#16a34a}
.ti-toast--warn{background:#f59e0b}
.ti-toast--error{background:#dc2626}
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
@media (max-width:820px){.ti-product-row{grid-template-columns:1fr 1fr}.ti-product-total,.ti-check-inline,.ti-btn--xs{grid-column:span 2}}
@media (min-width:768px){.ti-controls{grid-template-columns:1fr 280px;align-items:center}}
    `;
    document.head.appendChild(style);
  }

  function setupSignatureCanvas(canvas, id) {
    if (!canvas) return;
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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signatures[id].hasSignature = false;
  }

  function findRoot() {
    return document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".interventions-list");
  }
})();
