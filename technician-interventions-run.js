(() => {
  if (window.__techInterventionsRunLoaded) return;
  window.__techInterventionsRunLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

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
    title: "Intervention",
    subtitle: "Réalisation",
    countLabel: "intervention",
    emptyTitle: "Aucune intervention",
    emptyBody: "Intervention introuvable.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer l'intervention. Reessaye plus tard.",
    callCTA: "Appeler",
    mapCTA: "Itineraire",
    pvCTA: "PV vierge",
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
    toastReportMissing: "Rapport non enregistre (table manquante)",
    toastExpensesMissing: "Produits non enregistres (table manquante)",
    toastProductsInvalid: "Produits incomplets. Verifie les quantites et prix.",
    toastNeedDiagnostic: "Renseigne le diagnostic",
    toastNeedResolution: "Renseigne la resolution",
    toastNeedPhotos: "Ajoute au moins une photo",
    toastNeedSignature: "Signature obligatoire",
    toastNeedChecklist: "Checklist incomplete"
  };

  const root = findRoot();
  if (!root) return;

  if (!window.supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  injectStyles();

  const els = renderShell(root);
  const state = {
    item: null,
    files: [],
    previews: [],
    checklist: [],
    signatures: { canvas: null, hasSignature: false },
    signedPv: null,
    diagnostic: "",
    resolution: "",
    observations: "",
    products: [],
    productsLoaded: false,
    catalog: [],
    catalogLoaded: false,
    userId: null,
    step: 1
  };

  init();

  async function init() {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return renderEmpty(els.list);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return renderError(els.list);

    state.userId = authData.user.id;

    const { data, error } = await supabase
      .from("intervention_assignees")
      .select("id, intervention_id, interventions:intervention_id(*)")
      .eq("user_id", state.userId)
      .eq("intervention_id", id)
      .single();

    if (error || !data?.interventions) return renderError(els.list);

    state.item = data.interventions;

    renderSingle();
  }

  function renderSingle() {
    els.list.innerHTML = "";
    els.count.textContent = "1";
    const card = buildRunCard(state.item);
    els.list.appendChild(card);
  }

  function buildRunCard(row) {
    const card = document.createElement("article");
    card.className = "ti-card is-flow-open";

    const dateLabel = formatDateFR(row.start_at) || "Date a definir";
    const clientTitle = `${row.client_name || "Client"} - ${row.title || "Intervention"}`;

    const phoneNormalized = normalizePhone(row.support_phone);
    const address = row.address ? String(row.address).trim() : "";
    const pvUrl = getPvUrl(row);

    card.innerHTML = `
      <div class="ti-card-head">
        <div class="ti-card-main">
          <div class="ti-title">${escapeHTML(clientTitle)}</div>
          <div class="ti-meta">
            <span class="ti-meta-item">${escapeHTML(dateLabel)}</span>
            ${address ? `<span class="ti-meta-item">${escapeHTML(address)}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="ti-actions">
        <a class="ti-btn ti-btn--ghost ${phoneNormalized ? "" : "is-disabled"}" ${phoneNormalized ? `href="tel:${phoneNormalized}"` : ""}>${STR.callCTA}</a>
        ${address ? `<a class="ti-btn ti-btn--ghost" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}" target="_blank">${STR.mapCTA}</a>` : ""}
        ${pvUrl ? `<a class="ti-btn ti-btn--ghost" href="${pvUrl}" target="_blank" rel="noopener" download>${STR.pvCTA}</a>` : ""}
      </div>

      <div class="ti-flow"></div>
    `;

    const flow = card.querySelector(".ti-flow");
    renderFlow(flow, row);
    return card;
  }

  function renderFlow(container, row) {
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);

    state.checklist = getChecklist(row).map(() => false);

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
        </div>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--primary" data-action="arrive">${STR.arriveCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="diagnostic">
        <div class="ti-flow-title">${STR.diagnosticLabel}</div>
        <textarea class="ti-textarea" data-field="diagnostic" rows="4"></textarea>
        <div class="ti-flow-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev-step">${STR.backCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-diagnostic">${STR.nextCTA}</button>
        </div>
      </div>

      <div class="ti-flow-section" data-flow-step="resolution">
        <div class="ti-flow-title">${STR.resolutionLabel}</div>
        <textarea class="ti-textarea" data-field="resolution" rows="4"></textarea>
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
        <textarea class="ti-textarea" data-field="observations" rows="4"></textarea>
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
      state.step = idx;
      showFlowStep(container, steps, idx);
    };
    const goNext = () => goTo(state.step + 1);
    const goPrev = () => goTo(state.step - 1);

    showFlowStep(container, steps, state.step);

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
        <input type="checkbox" data-check-index="${idx}" />
        <span>${escapeHTML(label)}</span>
      `;
      checklistWrap.appendChild(item);
    });

    checklistWrap.addEventListener("change", (e) => {
      const el = e.target;
      if (el && el.matches("input[type='checkbox']")) {
        const i = Number(el.dataset.checkIndex);
        state.checklist[i] = el.checked;
      }
    });

    const previews = container.querySelector("[data-previews]");
    renderPreviews(previews, state.files);

    const cameraInput = container.querySelector("[data-camera]");
    const galleryInput = container.querySelector("[data-gallery]");
    const btnCamera = container.querySelector("[data-action='photo-camera']");
    const btnGallery = container.querySelector("[data-action='photo-gallery']");

    btnCamera.addEventListener("click", () => cameraInput.click());
    btnGallery.addEventListener("click", () => galleryInput.click());

    cameraInput.addEventListener("change", () => {
      state.files = state.files.concat(Array.from(cameraInput.files || []));
      renderPreviews(previews, state.files);
      cameraInput.value = "";
    });

    galleryInput.addEventListener("change", () => {
      state.files = state.files.concat(Array.from(galleryInput.files || []));
      renderPreviews(previews, state.files);
      galleryInput.value = "";
    });

    const productsWrap = container.querySelector("[data-products]");
    const addProductBtn = container.querySelector('[data-action="add-product"]');
    renderProducts(productsWrap);

    addProductBtn.addEventListener("click", () => {
      state.products.push(createEmptyProduct());
      renderProducts(productsWrap);
    });

    const diag = container.querySelector("[data-field='diagnostic']");
    const reso = container.querySelector("[data-field='resolution']");
    const obs = container.querySelector("[data-field='observations']");
    diag.addEventListener("input", () => (state.diagnostic = diag.value));
    reso.addEventListener("input", () => (state.resolution = reso.value));
    obs.addEventListener("input", () => (state.observations = obs.value));

    const arriveBtn = container.querySelector("[data-action='arrive']");
    arriveBtn.addEventListener("click", () => goNext());

    const nextDiag = container.querySelector("[data-action='next-diagnostic']");
    nextDiag.addEventListener("click", () => {
      if (!state.diagnostic.trim()) return showToast("warn", STR.toastNeedDiagnostic);
      goNext();
    });

    const nextRes = container.querySelector("[data-action='next-resolution']");
    nextRes.addEventListener("click", () => {
      if (!state.resolution.trim()) return showToast("warn", STR.toastNeedResolution);
      goNext();
    });

    const nextPhotos = container.querySelector("[data-action='next-photos']");
    nextPhotos.addEventListener("click", () => {
      if (requiresPhotos && (!state.files || state.files.length === 0)) {
        return showToast("warn", STR.toastNeedPhotos);
      }
      goNext();
    });

    const nextProducts = container.querySelector("[data-action='next-products']");
    nextProducts.addEventListener("click", () => {
      if (!validateProducts().ok) return showToast("warn", STR.toastProductsInvalid);
      goNext();
    });

    if (requiresSignature) {
      const canvas = container.querySelector(".ti-signature-canvas");
      const clearBtn = container.querySelector('[data-action="sig-clear"]');
      setupSignatureCanvas(canvas);
      clearBtn.addEventListener("click", () => clearSignature(canvas));
      const nextSig = container.querySelector("[data-action='next-signature']");
      nextSig.addEventListener("click", () => {
        if (!state.signatures.hasSignature) return showToast("warn", STR.toastNeedSignature);
        goNext();
      });
    }

    const signedPvInput = container.querySelector("[data-signed-pv]");
    signedPvInput.addEventListener("change", () => {
      state.signedPv = signedPvInput.files?.[0] || null;
    });

    const nextObs = container.querySelector("[data-action='next-observations']");
    nextObs.addEventListener("click", () => goNext());

    const confirmBtn = container.querySelector('[data-action="confirm-validate"]');
    confirmBtn.addEventListener("click", async () => {
      if (!confirm(STR.confirmValidate)) return;
      await validateIntervention(row);
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

  async function validateIntervention(row) {
    const requiresChecklist = getFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);

    const checklistOk = !requiresChecklist || state.checklist.every(Boolean);
    const photosOk = !requiresPhotos || (state.files && state.files.length > 0);
    const signatureOk = !requiresSignature || state.signatures.hasSignature;

    if (!checklistOk) return showToast("warn", STR.toastNeedChecklist);
    if (!photosOk) return showToast("warn", STR.toastNeedPhotos);
    if (!signatureOk) return showToast("warn", STR.toastNeedSignature);

    const productsValidation = validateProducts();
    if (!productsValidation.ok) return showToast("warn", STR.toastProductsInvalid);

    try {
      const completedAt = new Date().toISOString();
      const photoUploads = await uploadPhotos(row.id, state.files || []);
      const signedPvUpload = await uploadSignedPv(row.id, state.signedPv);

      const reportPayload = {
        intervention_id: row.id,
        user_id: state.userId,
        checklist: state.checklist,
        diagnostic: state.diagnostic || "",
        resolution: state.resolution || "",
        observations: buildObservations(row, {
          diagnostic: state.diagnostic,
          resolution: state.resolution,
          products: cleanProducts(state.products),
          photos: photoUploads,
          signedPv: signedPvUpload,
          notes: state.observations
        }),
        notes: state.observations || "",
        photos: photoUploads,
        products: cleanProducts(state.products),
        signed_pv: signedPvUpload,
        completed_at: completedAt
      };

      const reportOk = await saveReport(reportPayload);
      const expensesOk = await saveExpenses(row.id);

      let statusUpdated = true;
      if (CONFIG.ENABLE_STATUS_UPDATE) {
        statusUpdated = await updateIntervention(row.id, completedAt, row, reportPayload.observations, signedPvUpload);
      }

      if (statusUpdated) showToast("success", STR.toastSaved);
      else showToast("warn", STR.toastSavedPartial);

      if (!reportOk) showToast("warn", STR.toastReportMissing);
      if (!expensesOk) showToast("warn", STR.toastExpensesMissing);
    } catch (e) {
      console.error(e);
      showToast("error", STR.toastError);
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

  function renderPreviews(container, files) {
    if (!container) return;

    const prev = state.previews || [];
    prev.forEach((u) => URL.revokeObjectURL(u));
    state.previews = [];

    container.innerHTML = "";
    if (!files || !files.length) return;

    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      state.previews.push(url);

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
          state.files.splice(idx, 1);
          renderPreviews(container, state.files);
          return;
        }
        const img = e.target.closest("img[data-preview-index]");
        if (img) window.open(img.src, "_blank");
      });
    }
  }

  function renderProducts(container) {
    if (!container) return;
    if (!state.products.length) {
      container.innerHTML = `<div class="ti-products-empty">Aucun produit ajoute</div>`;
    } else {
      container.innerHTML = state.products.map((item, idx) => productRowTemplate(item, idx)).join("");
    }
  }

  function productRowTemplate(item, idx) {
    const total = computeLineTotal(item);
    return `
      <div class="ti-product-row" data-product-row data-index="${idx}">
        <input class="ti-input" data-field="name" placeholder="Produit / piece" value="${escapeHTML(item.name || "")}" />
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

  function validateProducts() {
    const items = state.products || [];
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

  async function updateIntervention(id, completedAt, row, observationsText, signedPv) {
    const payload = { status: CONFIG.STATUS_DONE, completed_at: completedAt };

    let { error } = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", id);

    if (error && isStatusConstraintError(error)) {
      const fallback = ["done", "completed", "complete"];
      for (const s of fallback) {
        const retry = await supabase.from("interventions").update({ ...payload, status: s }).eq("id", id);
        if (!retry.error) return true;
      }
    }

    return !error;
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
      const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { path, url: data?.publicUrl || null };
    }));
    return uploads;
  }

  async function uploadSignedPv(interventionId, file) {
    if (!file) return null;
    const bucket = CONFIG.STORAGE_BUCKET;
    const ext = getFileExtension(file.name);
    const name = `pv_signed_${Date.now()}_${randomId()}.${ext || "pdf"}`;
    const path = `interventions/${interventionId}/${name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, url: data?.publicUrl || null };
  }

  async function saveReport(payload) {
    const { error } = await supabase
      .from(CONFIG.REPORTS_TABLE)
      .upsert(payload, { onConflict: "intervention_id,user_id" });
    return !error;
  }

  async function saveExpenses(interventionId) {
    const rows = cleanProducts(state.products || []);
    if (!rows.length) return true;

    await supabase.from(CONFIG.EXPENSES_TABLE).delete().eq("intervention_id", interventionId).eq("user_id", state.userId);

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
    return !ins.error;
  }

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `ti-toast ti-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <div class="ti-shell">
        <div class="ti-header">
          <div>
            <div class="ti-eyebrow">${STR.subtitle}</div>
            <div class="ti-h1">${STR.title}</div>
          </div>
        </div>
        <div class="ti-list" data-ti-list></div>
        <div class="ti-toasts" data-ti-toasts></div>
      </div>
    `;
    const list = rootEl.querySelector("[data-ti-list]");
    const toasts = rootEl.querySelector("[data-ti-toasts]");
    return { list, toasts };
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

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: CONFIG.CURRENCY }).format(num);
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

  function toNumber(v) {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function randomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10);
  }

  function getFileExtension(name) {
    const parts = String(name || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  }

  function setupSignatureCanvas(canvas) {
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
      state.signatures.hasSignature = true;
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

    state.signatures.canvas = canvas;
  }

  function clearSignature(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signatures.hasSignature = false;
  }

  function injectStyles() {
    if (document.getElementById("ti-styles")) return;
    const style = document.createElement("style");
    style.id = "ti-styles";
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');
.ti-shell{font-family:"Manrope",sans-serif;background:radial-gradient(1200px 600px at 10% -10%, #e3f2ff 0%, #f6f7fb 55%, #f6f7fb 100%);color:#0f172a;padding:20px;border-radius:18px}
.ti-card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
.ti-flow-section{display:none}
.ti-flow-section.is-active{display:grid}
.ti-preview-media{position:relative}
.ti-preview-remove{position:absolute;top:8px;right:8px;background:#0f172a;color:#fff;border:none;border-radius:999px;padding:4px 8px;font-size:11px;cursor:pointer}
.ti-actions{display:flex;gap:8px;flex-wrap:wrap}
.ti-btn{border:none;padding:8px 12px;border-radius:10px;font-size:13px;cursor:pointer;text-decoration:none}
.ti-btn--primary{background:#0ea5e9;color:#fff}
.ti-btn--ghost{background:#f1f5f9;color:#0f172a}
.ti-step.is-done{background:#22c55e;color:#fff}
.ti-step.is-active{background:#0ea5e9;color:#fff}
.ti-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;font-size:12px;background:#eef2ff;padding:6px;border-radius:12px}
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
