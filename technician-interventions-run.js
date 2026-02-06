(() => {
  if (window.__techInterventionRunLoaded) return;
  window.__techInterventionRunLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    STORAGE_BUCKET: "interventions-files",
    REPORTS_TABLE: "intervention_reports",
    EXPENSES_TABLE: "intervention_expenses",
    PRODUCTS_TABLE: "products",

    STATUS_DONE: "done",
    STATUS_IN_PROGRESS: "in_progress",

    REQUIRE_CHECKLIST_DEFAULT: true,
    REQUIRE_PHOTOS_DEFAULT: false,
    REQUIRE_SIGNATURE_DEFAULT: false,

    PV_URL_FIELD: "pv_blank_url",
    PV_PATH_FIELD: "pv_blank_path",
    SIGNED_PV_URL_FIELD: "pv_signed_url",
    SIGNED_PV_PATH_FIELD: "pv_signed_path",
    REMUNERATION_FIELD: "tech_fee",
    CURRENCY: "EUR",

    STEPS_STORAGE_KEY: "mbl-intervention-steps"
  };

  const STR = {
    title: "Intervention en cours",
    subtitle: "Parcours terrain et validation",
    stepArrive: "Arrivee",
    stepDiagnostic: "Diagnostic",
    stepResolution: "Resolution",
    stepPhotos: "Photos",
    stepProducts: "Produits",
    stepSignature: "Signature",
    stepObservations: "Observations",
    stepValidate: "Validation",
    callCTA: "Appeler",
    mapCTA: "Itineraire",
    pvCTA: "PV vierge",
    arriveCTA: "Arrive sur place",
    nextCTA: "Continuer",
    prevCTA: "Retour",
    validateCTA: "Valider l'intervention",
    photosLabel: "Photos",
    photosHint: "Ajoute 1 ou plusieurs photos",
    checklistLabel: "Checklist",
    signatureLabel: "Signature client",
    signatureHint: "Signe dans la zone ci-dessous",
    signatureClear: "Effacer",
    signedPvLabel: "PV signe",
    signedPvHint: "Ajoute un PV signe (PDF ou photo)",
    notesLabel: "Observations",
    diagnosticLabel: "Diagnostic",
    resolutionLabel: "Resolution",
    confirmValidate: "Confirmer la validation ?",
    toastSaved: "Intervention validee",
    toastSavedPartial: "Validation enregistree mais statut non mis a jour",
    toastError: "Une erreur est survenue",
    toastNeedDiagnostic: "Renseigne le diagnostic",
    toastNeedResolution: "Renseigne la resolution",
    toastNeedPhotos: "Ajoute au moins une photo",
    toastNeedSignature: "Signature obligatoire",
    toastProductsInvalid: "Produits incomplets. Verifie les quantites et prix.",
    toastReportMissing: "Rapport non enregistre (table manquante)",
    toastExpensesMissing: "Produits non enregistres (table manquante)"
  };

  let supabase =
    window.__MBL_SUPABASE__ ||
    window.__techSupabase ||
    window.supabase?.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth"
      }
    });

  window.__techSupabase = supabase;

  let root = null;
  let mapAddress = "";
  let els = null;

  const state = {
    userId: null,
    row: null,
    files: {},
    previews: {},
    checklist: {},
    signatures: {},
    signedPv: {},
    diagnostic: {},
    resolution: {},
    observations: {},
    products: {},
    productsLoaded: {},
    catalog: [],
    catalogLoaded: false,
    steps: loadSteps()
  };

  waitForRoot();

  function waitForRoot() {
    let tries = 0;
    const timer = setInterval(() => {
      root = findRoot();
      if (root) {
        clearInterval(timer);
        start(root);
      } else if (++tries > 40) {
        clearInterval(timer);
      }
    }, 100);
  }

  function start(rootEl) {
    if (!window.supabase) {
      rootEl.textContent = "Supabase non charge.";
      return;
    }
    applyConfigOverrides(rootEl);
    injectStyles();
    els = renderShell(rootEl);
    init();
  }

  async function init() {
    setStatus("Chargement...");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.user) {
      setStatus("Session expiree. Merci de vous reconnecter.");
      return;
    }
    state.userId = session.user.id;

    const interventionId = getInterventionId();
    if (!interventionId) {
      setStatus("ID intervention manquant dans l'URL.");
      return;
    }

    loadCatalog();

    const row = await fetchIntervention(state.userId, interventionId);
    if (!row) {
      setStatus("Intervention introuvable.");
      return;
    }

    state.row = row;
    mapAddress = row.address || "";

    hydrateState(row.id);
    setStatus("");
    renderIntervention(row);
  }

  async function fetchIntervention(userId, interventionId) {
    let res = await supabase
      .from("intervention_assignees")
      .select("id, intervention_id, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .eq("intervention_id", interventionId)
      .maybeSingle();

    if (res?.data?.interventions) return res.data.interventions;

    const res2 = await supabase
      .from("interventions")
      .select("*")
      .eq("id", interventionId)
      .maybeSingle();

    return res2.data || null;
  }

  function hydrateState(id) {
    state.checklist[id] = state.checklist[id] || getChecklist(state.row).map(() => false);
    state.files[id] = state.files[id] || [];
    state.previews[id] = state.previews[id] || [];
    state.signatures[id] = state.signatures[id] || { canvas: null, hasSignature: false };
    state.signedPv[id] = state.signedPv[id] || null;
    state.products[id] = state.products[id] || [];
    state.diagnostic[id] = state.diagnostic[id] || "";
    state.resolution[id] = state.resolution[id] || "";
    state.observations[id] = state.observations[id] || "";
  }

  function renderIntervention(row) {
    const id = row.id;
    const pvUrl = getPvUrl(row);
    const steps = buildSteps(row);
    const currentStep = getStep(id, steps.length);

    setText(els.title, STR.title);
    setText(els.subtitle, STR.subtitle);
    setText(els.client, row.client_name || "Client");
    setText(els.title2, row.title || "Intervention");
    setText(els.date, formatDateFR(row.start_at) || "Date a definir");
    setText(els.address, row.address || "");
    setText(els.status, getStatusLabel(row.status));

    const phone = normalizePhone(row.support_phone);
    if (phone) {
      els.callBtn.href = `tel:${phone}`;
      els.callBtn.classList.remove("is-disabled");
    } else {
      els.callBtn.removeAttribute("href");
      els.callBtn.classList.add("is-disabled");
    }

    if (row.address) {
      els.mapBtn.classList.remove("is-disabled");
      els.mapBtn.onclick = () => openMapSheet(row.address);
    } else {
      els.mapBtn.classList.add("is-disabled");
      els.mapBtn.onclick = null;
    }

    if (pvUrl) {
      els.pvBtn.href = pvUrl;
      els.pvBtn.hidden = false;
    } else {
      els.pvBtn.hidden = true;
    }

    renderStepper(steps, currentStep);
    renderFlow(row, steps, currentStep);
  }

  function renderStepper(steps, currentStep) {
    if (!els.steps) return;
    els.steps.innerHTML = steps.map((s, i) => {
      const n = i + 1;
      const cls = n < currentStep ? "is-done" : n === currentStep ? "is-active" : "";
      return `<div class="ti-step ${cls}">${n}. ${s.label}</div>`;
    }).join("");
  }

  function renderFlow(row, steps, currentStep) {
    const id = row.id;
    const flow = els.flow;
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);

    flow.innerHTML = `
      ${stepSection("arrive", `
        <div class="ti-flow-title">Informations & PV</div>
        <div class="ti-flow-info">
          ${infoRow("Adresse", row.address || "")}
          ${infoRow("Date", formatDateFR(row.start_at) || "")}
          ${infoRow("Telephone", formatPhoneReadable(row.support_phone || "") || "")}
          ${getPvUrl(row) ? infoRow("PV vierge", `<a class="ti-link" href="${getPvUrl(row)}" target="_blank" rel="noopener">${STR.pvCTA}</a>`, true) : ""}
        </div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--primary" data-action="arrive">${STR.arriveCTA}</button>
        </div>
      `)}

      ${stepSection("diagnostic", `
        <div class="ti-flow-title">${STR.diagnosticLabel}</div>
        <textarea class="ti-textarea" data-field="diagnostic" rows="4" placeholder="Decris le diagnostic...">${escapeHTML(state.diagnostic[id])}</textarea>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-diagnostic">${STR.nextCTA}</button>
        </div>
      `)}

      ${stepSection("resolution", `
        <div class="ti-flow-title">${STR.resolutionLabel}</div>
        <textarea class="ti-textarea" data-field="resolution" rows="4" placeholder="Decris la resolution...">${escapeHTML(state.resolution[id])}</textarea>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-resolution">${STR.nextCTA}</button>
        </div>
      `)}

      ${stepSection("photos", `
        <div class="ti-flow-title">${STR.photosLabel}</div>
        <div class="ti-hint">${STR.photosHint}</div>
        <div class="ti-photo-actions">
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-camera">Prendre une photo</button>
          <button class="ti-btn ti-btn--ghost ti-btn--xs" data-action="photo-gallery">Ajouter depuis galerie</button>
          <input type="file" class="ti-file" data-camera accept="image/*" capture="environment" />
          <input type="file" class="ti-file" data-gallery accept="image/*" multiple />
        </div>
        <div class="ti-previews" data-previews></div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-photos">${STR.nextCTA}</button>
        </div>
      `)}

      ${stepSection("products", `
        <div class="ti-flow-title">Produits / Depenses</div>
        <div class="ti-products" data-products></div>
        <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="add-product">Ajouter un produit</button>
        <div class="ti-products-total" data-products-total></div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-products">${STR.nextCTA}</button>
        </div>
      `)}

      ${requiresSignature ? stepSection("signature", `
        <div class="ti-flow-title">${STR.signatureLabel}</div>
        <div class="ti-hint">${STR.signatureHint}</div>
        <div class="ti-signature">
          <canvas class="ti-signature-canvas"></canvas>
          <button type="button" class="ti-btn ti-btn--ghost ti-btn--xs" data-action="sig-clear">${STR.signatureClear}</button>
        </div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-signature">${STR.nextCTA}</button>
        </div>
      `) : ""}

      ${stepSection("observations", `
        <div class="ti-flow-title">${STR.notesLabel}</div>
        <textarea class="ti-textarea" data-field="observations" rows="4" placeholder="Observations libres...">${escapeHTML(state.observations[id])}</textarea>
        <div class="ti-block">
          <div class="ti-label">${STR.signedPvLabel}</div>
          <div class="ti-hint">${STR.signedPvHint}</div>
          <input type="file" class="ti-file" data-signed-pv accept="application/pdf,image/*" />
        </div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="next-observations">${STR.nextCTA}</button>
        </div>
      `)}

      ${stepSection("validate", `
        <div class="ti-flow-title">Validation</div>
        <div class="ti-block">
          <div class="ti-label">${STR.checklistLabel}</div>
          <div class="ti-checklist" data-checklist></div>
        </div>
        <div class="ti-step-actions">
          <button class="ti-btn ti-btn--ghost" data-action="prev">${STR.prevCTA}</button>
          <button class="ti-btn ti-btn--primary" data-action="confirm-validate">${STR.validateCTA}</button>
        </div>
      `)}
    `;

    bindFlowEvents(row, steps, currentStep, requiresPhotos, requiresSignature);
  }

  function bindFlowEvents(row, steps, currentStep, requiresPhotos, requiresSignature) {
    const id = row.id;
    const flow = els.flow;

    showFlowStep(steps[currentStep - 1].key);
    renderStepper(steps, currentStep);

    flow.querySelector("[data-action='arrive']")?.addEventListener("click", () => {
      markArrived(row);
      goNext(steps);
    });

    const diag = flow.querySelector("[data-field='diagnostic']");
    diag?.addEventListener("input", () => (state.diagnostic[id] = diag.value));
    flow.querySelector("[data-action='next-diagnostic']")?.addEventListener("click", () => {
      if (!state.diagnostic[id].trim()) return showToast("warn", STR.toastNeedDiagnostic);
      goNext(steps);
    });

    const reso = flow.querySelector("[data-field='resolution']");
    reso?.addEventListener("input", () => (state.resolution[id] = reso.value));
    flow.querySelector("[data-action='next-resolution']")?.addEventListener("click", () => {
      if (!state.resolution[id].trim()) return showToast("warn", STR.toastNeedResolution);
      goNext(steps);
    });

    const previews = flow.querySelector("[data-previews]");
    renderPreviews(id, previews, state.files[id]);

    const cameraInput = flow.querySelector("[data-camera]");
    const galleryInput = flow.querySelector("[data-gallery]");
    flow.querySelector("[data-action='photo-camera']")?.addEventListener("click", () => cameraInput.click());
    flow.querySelector("[data-action='photo-gallery']")?.addEventListener("click", () => galleryInput.click());

    cameraInput?.addEventListener("change", () => {
      appendFiles(id, cameraInput.files, previews);
      cameraInput.value = "";
    });

    galleryInput?.addEventListener("change", () => {
      appendFiles(id, galleryInput.files, previews);
      galleryInput.value = "";
    });

    flow.querySelector("[data-action='next-photos']")?.addEventListener("click", () => {
      if (requiresPhotos && (!state.files[id] || state.files[id].length === 0)) {
        return showToast("warn", STR.toastNeedPhotos);
      }
      goNext(steps);
    });

    const productsWrap = flow.querySelector("[data-products]");
    const addProductBtn = flow.querySelector("[data-action='add-product']");
    ensureProductsLoaded(id).then(() => renderProducts(productsWrap, id));
    addProductBtn?.addEventListener("click", () => {
      state.products[id].push(createEmptyProduct());
      renderProducts(productsWrap, id);
    });

    flow.querySelector("[data-action='next-products']")?.addEventListener("click", () => {
      if (!validateProducts(id).ok) return showToast("warn", STR.toastProductsInvalid);
      goNext(steps);
    });

    if (requiresSignature) {
      const canvas = flow.querySelector(".ti-signature-canvas");
      const clearBtn = flow.querySelector("[data-action='sig-clear']");
      setupSignatureCanvas(canvas, id);
      clearBtn?.addEventListener("click", () => clearSignature(canvas, id));

      flow.querySelector("[data-action='next-signature']")?.addEventListener("click", () => {
        if (!state.signatures[id].hasSignature) return showToast("warn", STR.toastNeedSignature);
        goNext(steps);
      });
    }

    const obs = flow.querySelector("[data-field='observations']");
    obs?.addEventListener("input", () => (state.observations[id] = obs.value));
    const signedPvInput = flow.querySelector("[data-signed-pv]");
    signedPvInput?.addEventListener("change", () => {
      state.signedPv[id] = signedPvInput.files?.[0] || null;
    });

    flow.querySelector("[data-action='next-observations']")?.addEventListener("click", () => {
      goNext(steps);
    });

    const checklistWrap = flow.querySelector("[data-checklist]");
    if (checklistWrap) {
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
    }

    flow.querySelector("[data-action='confirm-validate']")?.addEventListener("click", async () => {
      if (!confirm(STR.confirmValidate)) return;
      await validateIntervention(row);
    });

    flow.querySelectorAll("[data-action='prev']").forEach((btn) => {
      btn.addEventListener("click", () => goPrev(steps));
    });
  }

  function goNext(steps) {
    const id = state.row.id;
    const next = Math.min(getStep(id, steps.length) + 1, steps.length);
    setStep(id, next);
    showFlowStep(steps[next - 1].key);
    renderStepper(steps, next);
  }

  function goPrev(steps) {
    const id = state.row.id;
    const prev = Math.max(getStep(id, steps.length) - 1, 1);
    setStep(id, prev);
    showFlowStep(steps[prev - 1].key);
    renderStepper(steps, prev);
  }

  function showFlowStep(key) {
    els.flow.querySelectorAll("[data-flow]").forEach((el) => {
      el.hidden = el.dataset.flow !== key;
    });
  }

  async function validateIntervention(row) {
    const id = row.id;

    const requiresChecklist = getFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT);
    const requiresPhotos = getFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT);
    const requiresSignature = getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT);

    const checklistOk = !requiresChecklist || state.checklist[id].every(Boolean);
    const photosOk = !requiresPhotos || (state.files[id] && state.files[id].length > 0);
    const signatureOk = !requiresSignature || state.signatures[id].hasSignature;

    if (!checklistOk || !photosOk || !signatureOk) return;
    if (!validateProducts(id).ok) return showToast("warn", STR.toastProductsInvalid);

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

      const statusUpdated = await updateIntervention(id, completedAt, row, observationsText, signedPvUpload);

      if (statusUpdated) showToast("success", STR.toastSaved);
      else showToast("warn", STR.toastSavedPartial);

      if (!reportOk) showToast("warn", STR.toastReportMissing);
      if (!expensesOk) showToast("warn", STR.toastExpensesMissing);

    } catch (e) {
      console.error(e);
      showToast("error", STR.toastError);
    }
  }

  // -------- helpers --------
  function stepSection(key, content) {
    return `<div class="ti-flow-section" data-flow="${key}">${content}</div>`;
  }

  function setStatus(msg) {
    if (els?.statusBox) els.statusBox.textContent = msg || "";
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value ?? "";
  }

  function getInterventionId() {
    const params = new URLSearchParams(location.search);
    return params.get("id") || root?.dataset?.interventionId || "";
  }

  function buildSteps(row) {
    const steps = [
      { key: "arrive", label: STR.stepArrive },
      { key: "diagnostic", label: STR.stepDiagnostic },
      { key: "resolution", label: STR.stepResolution },
      { key: "photos", label: STR.stepPhotos },
      { key: "products", label: STR.stepProducts }
    ];
    if (getFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT)) steps.push({ key: "signature", label: STR.stepSignature });
    steps.push({ key: "observations", label: STR.stepObservations });
    steps.push({ key: "validate", label: STR.stepValidate });
    return steps;
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

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: CONFIG.CURRENCY }).format(num);
  }

  function toNumber(v) {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
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

  function isTableMissing(error) {
    const msg = String(error?.message || "");
    return msg.includes("Could not find the table") || String(error?.code || "") === "PGRST205";
  }

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `ti-toast ti-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function loadSteps() {
    try {
      const raw = localStorage.getItem(CONFIG.STEPS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function saveSteps() {
    try { localStorage.setItem(CONFIG.STEPS_STORAGE_KEY, JSON.stringify(state.steps)); }
    catch (_) {}
  }

  function getStep(id, max = 999) {
    const v = Number(state.steps[id] || 1);
    return Math.max(1, Math.min(v, max));
  }

  function setStep(id, step) {
    state.steps[id] = step;
    saveSteps();
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
    return "";
  }

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset;
    if (d.storageBucket) CONFIG.STORAGE_BUCKET = d.storageBucket;
    if (d.reportsTable) CONFIG.REPORTS_TABLE = d.reportsTable;
    if (d.expensesTable) CONFIG.EXPENSES_TABLE = d.expensesTable;
    if (d.productsTable) CONFIG.PRODUCTS_TABLE = d.productsTable;
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

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <datalist id="ti-products-list"></datalist>
      <div class="ti-shell">
        <div class="ti-header">
          <div>
            <div class="ti-eyebrow" data-ti-subtitle></div>
            <div class="ti-h1" data-ti-title></div>
          </div>
        </div>

        <div class="ti-run-card">
          <div class="ti-run-top">
            <div class="ti-run-main">
              <div class="ti-run-client" data-ti-client></div>
              <div class="ti-run-title" data-ti-title2></div>
              <div class="ti-run-meta">
                <span data-ti-date></span>
                <span data-ti-address></span>
              </div>
            </div>
            <div class="ti-run-status" data-ti-status></div>
          </div>

          <div class="ti-run-actions">
            <a class="ti-btn ti-btn--primary" data-action="call">${STR.callCTA}</a>
            <button class="ti-btn ti-btn--ghost" data-action="map">${STR.mapCTA}</button>
            <a class="ti-btn ti-btn--ghost" data-action="pv" hidden>${STR.pvCTA}</a>
          </div>
        </div>

        <div class="ti-status-box" data-ti-status-box></div>

        <div class="ti-steps" data-ti-steps></div>
        <div class="ti-flow" data-ti-flow></div>

        <div class="ti-toasts" data-ti-toasts></div>

        <div class="ti-sheet" data-ti-sheet hidden>
          <div class="ti-sheet-backdrop" data-ti-sheet-close></div>
          <div class="ti-sheet-panel">
            <div class="ti-sheet-title">Choisir une app</div>
            <button class="ti-sheet-btn" data-map="apple">Plans</button>
            <button class="ti-sheet-btn" data-map="google">Google Maps</button>
            <button class="ti-sheet-btn" data-map="waze">Waze</button>
            <button class="ti-sheet-btn ti-sheet-cancel" data-ti-sheet-close>Annuler</button>
          </div>
        </div>
      </div>
    `;

    const sheet = rootEl.querySelector("[data-ti-sheet]");
    sheet.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-map]");
      if (!btn) return;
      openMapProvider(btn.dataset.map);
    });

    rootEl.querySelectorAll("[data-ti-sheet-close]").forEach((el) => {
      el.addEventListener("click", closeMapSheet);
    });

    return {
      title: rootEl.querySelector("[data-ti-title]"),
      subtitle: rootEl.querySelector("[data-ti-subtitle]"),
      client: rootEl.querySelector("[data-ti-client]"),
      title2: rootEl.querySelector("[data-ti-title2]"),
      date: rootEl.querySelector("[data-ti-date]"),
      address: rootEl.querySelector("[data-ti-address]"),
      status: rootEl.querySelector("[data-ti-status]"),
      callBtn: rootEl.querySelector("[data-action='call']"),
      mapBtn: rootEl.querySelector("[data-action='map']"),
      pvBtn: rootEl.querySelector("[data-action='pv']"),
      statusBox: rootEl.querySelector("[data-ti-status-box]"),
      steps: rootEl.querySelector("[data-ti-steps]"),
      flow: rootEl.querySelector("[data-ti-flow]"),
      toasts: rootEl.querySelector("[data-ti-toasts]"),
      sheet
    };
  }

  function injectStyles() {
    if (document.getElementById("ti-styles")) return;
    const style = document.createElement("style");
    style.id = "ti-styles";
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

.ti-shell{font-family:"Manrope",sans-serif;background:radial-gradient(1200px 600px at 10% -10%, #e3f2ff 0%, #f6f7fb 55%, #f6f7fb 100%);color:#0f172a;padding:20px;border-radius:18px}
.ti-header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:12px}
.ti-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px}
.ti-h1{font-family:"Space Grotesk",sans-serif;font-size:24px;font-weight:700}
.ti-run-card{background:#fff;border-radius:16px;padding:14px;box-shadow:0 10px 30px rgba(15,23,42,.08);display:grid;gap:12px}
.ti-run-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.ti-run-client{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
.ti-run-title{font-size:16px;font-weight:600}
.ti-run-meta{font-size:12px;color:#64748b;display:grid;gap:4px;margin-top:6px}
.ti-run-status{font-size:11px;padding:6px 10px;border-radius:999px;background:#e0f2fe;color:#075985;font-weight:600;white-space:nowrap}
.ti-run-actions{display:flex;gap:8px;flex-wrap:wrap}
.ti-btn{border:none;padding:8px 12px;border-radius:10px;font-size:13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ti-btn--ghost{background:#f1f5f9;color:#0f172a}
.ti-btn--primary{background:#0ea5e9;color:#fff}
.ti-btn--xs{padding:6px 10px;font-size:12px}
.ti-btn.is-disabled{opacity:.4;pointer-events:none}
.ti-status-box{margin:10px 0;font-size:13px;color:#475569}
.ti-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0;font-size:12px}
.ti-step{background:#f1f5f9;padding:6px 8px;border-radius:8px;text-align:center}
.ti-step.is-done{background:#dcfce7;color:#166534;font-weight:600}
.ti-step.is-active{background:#e0f2fe;color:#075985;font-weight:600}
.ti-flow{border-top:1px dashed #e2e8f0;padding-top:12px}
.ti-flow-section{display:grid;gap:10px}
.ti-flow-title{font-weight:700}
.ti-flow-info{display:grid;gap:6px}
.ti-step-actions{display:flex;gap:8px;flex-wrap:wrap}
.ti-block{margin-top:12px;display:grid;gap:8px}
.ti-checklist{display:grid;gap:6px}
.ti-check{display:flex;gap:8px;align-items:center;font-size:14px}
.ti-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
.ti-value{font-size:14px}
.ti-link{color:#0ea5e9;text-decoration:none;font-weight:600}
.ti-textarea{width:100%;border:1px solid #cbd5f5;border-radius:12px;padding:10px;font-size:14px}
.ti-file{width:100%}
.ti-previews{display:grid;gap:10px}
.ti-preview{display:grid;gap:6px}
.ti-preview img{width:100%;border-radius:12px;object-fit:cover}
.ti-preview-meta{font-size:11px;color:#64748b}
.ti-preview-remove{border:none;background:#fee2e2;color:#991b1b;padding:6px 10px;border-radius:8px;font-size:12px;justify-self:start}
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
@media (max-width:820px){.ti-product-row{grid-template-columns:1fr 1fr}.ti-product-total,.ti-check-inline,.ti-btn--xs{grid-column:span 2}}
@media (min-width:768px){.ti-steps{grid-template-columns:repeat(6,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions");
  }
})();
