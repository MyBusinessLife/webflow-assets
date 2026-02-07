(() => {
  if (window.__techInterventionRunLoaded) return;
  window.__techInterventionRunLoaded = true;
  window.__techInterventionsLoaded = true;

  const GLOBAL_CFG = window.__MBL_CFG__ || {};

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    STORAGE_BUCKET: GLOBAL_CFG.BUCKET || "interventions-files",
    REPORTS_TABLE: "intervention_reports",
    EXPENSES_TABLE: "intervention_expenses",
    PRODUCTS_TABLE: "products",
    FILES_TABLE: "intervention_files",
    PV_TABLE: "intervention_pv",

    LIST_PAGE_PATH: "/extranet/technician/interventions",

    STATUS_IN_PROGRESS: "in_progress",
    STATUS_DONE: "done",

    REQUIRE_CHECKLIST_DEFAULT: true,
    REQUIRE_PHOTOS_DEFAULT: false,
    REQUIRE_SIGNATURE_DEFAULT: false,

    ACTIVE_STORAGE_KEY: "mbl-active-intervention",
    DRAFT_STORAGE_PREFIX: "mbl-tech-run-draft",

    TECH_RUN_NOTE_PREFIX: "[TECH-RUN]",
    CURRENCY: "EUR",
    SIGNED_URL_TTL: 3600,
  };

  const STR = {
    title: "Intervention en cours",
    subtitle: "Parcours technicien guide",

    btnCall: "Appeler",
    btnMap: "Itineraire",
    btnPvBlank: "PV vierge",
    btnBackList: "Retour liste",

    msgLoading: "Chargement de l'intervention...",
    msgNoSession: "Session expiree. Merci de vous reconnecter.",
    msgNoId: "ID intervention manquant dans l'URL.",
    msgNotFound: "Intervention introuvable ou non assignee.",

    stepArrive: "Arrivee",
    stepDiagnostic: "Diagnostic",
    stepResolution: "Resolution",
    stepPhotos: "Photos",
    stepProducts: "Produits",
    stepSignature: "Signature",
    stepObservations: "Observations",
    stepValidate: "Validation",

    hintArrive: "Marque ton arrivee pour demarrer le parcours.",
    hintDiagnostic: "Explique clairement le probleme constate.",
    hintResolution: "Decris ce que tu as fait pour resoudre.",
    hintPhotos: "Ajoute des photos avant/apres (obligatoire selon l'intervention).",
    hintProducts: "Ajoute les produits ou frais engages pendant l'intervention.",
    hintSignature: "La signature client est requise sur cette intervention.",
    hintObservations: "Ajoute tout contexte utile pour le back-office.",
    hintValidate: "Valide uniquement quand tout est complet.",

    btnArrived: "Je suis arrive sur place",
    btnPrev: "Retour",
    btnNext: "Continuer",
    btnSaveDraft: "Enregistrer brouillon",
    btnValidate: "Valider l'intervention",
    btnClearSignature: "Effacer",
    btnAddProduct: "Ajouter un produit",

    labelChecklist: "Checklist de cloture",
    labelSignedPv: "PV signe (optionnel)",
    labelPhotos: "Photos",
    labelProductsTotal: "Total produits",
    labelRefundTotal: "Dont a rembourser",

    toastDraftSaved: "Brouillon enregistre.",
    toastStepSaved: "Progression enregistree.",
    toastArrived: "Arrivee enregistree.",
    toastArriveWarn: "Arrivee enregistree localement, mais non ecrite en base.",
    toastNeedDiagnostic: "Diagnostic requis pour continuer.",
    toastNeedResolution: "Resolution requise pour continuer.",
    toastNeedPhotos: "Ajoute au moins une photo pour continuer.",
    toastNeedSignature: "Signature requise pour continuer.",
    toastInvalidProducts: "Verifie les produits: nom, quantite et prix doivent etre valides.",
    toastNeedChecklist: "Toutes les cases checklist doivent etre cochees pour valider.",
    toastValidationRunning: "Validation en cours...",
    toastValidationOk: "Intervention validee avec succes.",
    toastValidationPartial: "Validation partielle: intervention enregistree mais statut non finalise.",
    toastValidationError: "Echec de validation. Verifie les messages d'erreur.",

    mapChooseTitle: "Choisir une application de navigation",
    mapPlans: "Plans",
    mapGoogle: "Google Maps",
    mapWaze: "Waze",
    mapCancel: "Annuler",
  };

  function findRoot() {
    return (
      document.querySelector("[data-tech-interventions]") ||
      document.querySelector("#technician-interventions-root") ||
      document.querySelector(".technician-interventions") ||
      document.querySelector(".intervention-run")
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
    console.error("[TECH RUN] Root introuvable.");
    return;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  applyConfigOverrides(root);
  injectStyles();

  const state = {
    userId: "",
    intervention: null,
    steps: [],
    currentStepIndex: 0,
    requirements: {
      checklist: CONFIG.REQUIRE_CHECKLIST_DEFAULT,
      photos: CONFIG.REQUIRE_PHOTOS_DEFAULT,
      signature: CONFIG.REQUIRE_SIGNATURE_DEFAULT,
    },
    draft: null,
    files: {
      photos: [],
      signedPv: null,
    },
    signature: {
      hasSignature: false,
      canvas: null,
      dataUrl: "",
    },
    previews: {
      photos: [],
    },
    existing: {
      fileRows: [],
      photoCount: 0,
      signatureCount: 0,
      pvDraftPath: "",
      pvSignedPath: "",
      pvDraftUrl: "",
    },
    catalog: [],
    catalogByName: new Map(),
    catalogById: new Map(),
    saving: false,
  };

  let resolvedStorageBucket = "";

  const els = renderShell(root);

  init();

  async function init() {
    wireStaticEvents();
    setStatus("info", STR.msgLoading);

    try {
      const user = await getCurrentUser();
      if (!user) {
        setStatus("error", STR.msgNoSession);
        disableWholeFlow();
        return;
      }
      state.userId = user.id;

      const interventionId = getInterventionId();
      if (!interventionId) {
        setStatus("error", STR.msgNoId);
        disableWholeFlow();
        return;
      }

      const [row, fileRows, pvInfo] = await Promise.all([
        fetchIntervention(state.userId, interventionId),
        fetchInterventionFiles(interventionId),
        fetchPvInfo(interventionId),
      ]);

      if (!row) {
        setStatus("error", STR.msgNotFound);
        disableWholeFlow();
        return;
      }

      state.intervention = row;
      state.existing.fileRows = fileRows;
      state.existing.photoCount = fileRows.filter((r) => String(r.type || "").toLowerCase() === "photo").length;
      state.existing.signatureCount = fileRows.filter((r) => String(r.type || "").toLowerCase() === "signature").length;
      state.existing.pvDraftPath =
        pvInfo?.pv_draft_path ||
        String(row.pv_blank_path || row.pv_draft_path || row.pv_path || "");
      state.existing.pvSignedPath = pvInfo?.pv_signed_path || "";

      state.requirements = {
        checklist: resolveFlag(row.requires_checklist, CONFIG.REQUIRE_CHECKLIST_DEFAULT),
        photos: resolveFlag(row.requires_photos, CONFIG.REQUIRE_PHOTOS_DEFAULT),
        signature: resolveFlag(row.requires_signature, CONFIG.REQUIRE_SIGNATURE_DEFAULT),
      };

      state.steps = buildSteps(state.requirements);

      const catalog = await loadCatalog();
      hydrateCatalog(catalog);
      const existingProducts = await loadExistingProducts(interventionId);
      hydrateDraft(interventionId, existingProducts);

      renderAll();
      setStatus("", "");

      saveActiveInterventionId(interventionId);
    } catch (error) {
      console.error("[TECH RUN] init error:", error);
      setStatus("error", `${STR.toastValidationError} ${error?.message || ""}`.trim());
      disableWholeFlow();
    }
  }

  function disableWholeFlow() {
    els.progress.hidden = true;
    els.content.innerHTML = "";
    els.footer.hidden = true;
  }

  async function getCurrentUser() {
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  function getInterventionId() {
    const params = new URLSearchParams(location.search);
    return params.get("id") || root.dataset.interventionId || "";
  }

  async function fetchIntervention(userId, interventionId) {
    const fromAssign = await supabase
      .from("intervention_assignees")
      .select("intervention_id, interventions:intervention_id(*)")
      .eq("user_id", userId)
      .eq("intervention_id", interventionId)
      .maybeSingle();

    if (fromAssign?.data?.interventions) return fromAssign.data.interventions;

    const direct = await supabase
      .from("interventions")
      .select("*")
      .eq("id", interventionId)
      .maybeSingle();

    return direct?.data || null;
  }

  async function fetchInterventionFiles(interventionId) {
    const res = await supabase
      .from(CONFIG.FILES_TABLE)
      .select("id, intervention_id, type, file_path, created_at")
      .eq("intervention_id", interventionId)
      .order("created_at", { ascending: false });

    if (res.error) {
      console.warn("[TECH RUN] files read warning:", res.error.message);
      return [];
    }

    return res.data || [];
  }

  async function fetchPvInfo(interventionId) {
    const res = await supabase
      .from(CONFIG.PV_TABLE)
      .select("intervention_id, pv_draft_path, pv_signed_path")
      .eq("intervention_id", interventionId)
      .maybeSingle();

    if (res.error) {
      if (!isTableMissing(res.error)) {
        console.warn("[TECH RUN] pv table warning:", res.error.message);
      }
      return null;
    }

    return res.data || null;
  }

  async function loadCatalog() {
    try {
      const activeRes = await supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name, price_cents, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1000);

      if (!activeRes.error && (activeRes.data || []).length) {
        return activeRes.data || [];
      }

      if (activeRes.error) {
        console.warn("[TECH RUN] catalog(active) warning:", activeRes.error.message);
      }

      const relaxedRes = await supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name, price_cents, is_active")
        .order("name", { ascending: true })
        .limit(1000);

      if (!relaxedRes.error) {
        return (relaxedRes.data || []).filter((row) => String(row?.name || "").trim());
      }

      console.warn("[TECH RUN] catalog(relaxed) warning:", relaxedRes.error.message);

      const minimalRes = await supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name, price_cents")
        .order("name", { ascending: true })
        .limit(1000);

      if (minimalRes.error) {
        console.warn("[TECH RUN] catalog(minimal) warning:", minimalRes.error.message);
        return [];
      }

      return (minimalRes.data || []).filter((row) => String(row?.name || "").trim());
    } catch (error) {
      console.warn("[TECH RUN] catalog runtime warning:", error?.message || error);
      return [];
    }
  }

  function hydrateCatalog(rows) {
    state.catalog = rows.map((r) => ({
      id: r.id,
      name: String(r.name || "").trim(),
      priceCents: Number.isFinite(r.price_cents) ? r.price_cents : null,
    }));

    state.catalogByName = new Map();
    state.catalogById = new Map();

    state.catalog.forEach((p) => {
      const key = norm(p.name);
      if (key && !state.catalogByName.has(key)) state.catalogByName.set(key, p);
      state.catalogById.set(String(p.id), p);
    });

    els.catalog.innerHTML = state.catalog
      .filter((p) => p.name)
      .map((p) => `<option value="${escapeHTML(p.name)}"></option>`)
      .join("");
  }

  async function loadExistingProducts(interventionId) {
    const res = await supabase
      .from(CONFIG.EXPENSES_TABLE)
      .select("id, intervention_id, type, product_id, qty, unit_cost_cents, amount_cents, note")
      .eq("intervention_id", interventionId)
      .eq("type", "material")
      .order("created_at", { ascending: true });

    if (res.error) {
      if (!isTableMissing(res.error)) {
        console.warn("[TECH RUN] existing products warning:", res.error.message);
      }
      return [];
    }

    return (res.data || []).map((r) => {
      const catalog = r.product_id ? state.catalogById.get(String(r.product_id)) : null;
      const parsedNote = parseTechRunNote(r.note || "");

      return {
        productId: r.product_id || "",
        name: catalog?.name || parsedNote.name || "",
        qty: Math.max(1, Number(r.qty || 1)),
        unitCents: Number.isFinite(r.unit_cost_cents) ? r.unit_cost_cents : 0,
        paidByTech: parsedNote.paidByTech,
        note: parsedNote.note,
      };
    });
  }

  function parseTechRunNote(raw) {
    const text = String(raw || "");
    const hasPrefix = text.startsWith(CONFIG.TECH_RUN_NOTE_PREFIX);
    if (!hasPrefix) return { paidByTech: false, note: "", name: "" };

    const body = text.replace(CONFIG.TECH_RUN_NOTE_PREFIX, "").trim();
    const paidByTech = body.startsWith("paid_by_tech");
    const cleaned = paidByTech ? body.replace(/^paid_by_tech\s*/i, "") : body;

    return {
      paidByTech,
      note: cleaned,
      name: "",
    };
  }

  function hydrateDraft(interventionId, existingProducts) {
    const saved = loadDraft(interventionId);

    const defaultChecklist = getChecklist(state.intervention).map(() => false);

    state.draft = {
      arrivedAt:
        saved?.arrivedAt ||
        String(
          state.intervention.arrived_at ||
            (canonicalStatus(state.intervention.status) === "in_progress" ? state.intervention.start_at || "" : "") ||
            ""
        ),
      diagnostic: saved?.diagnostic || "",
      resolution: saved?.resolution || "",
      observations: saved?.observations || "",
      checklist:
        Array.isArray(saved?.checklist) && saved.checklist.length === defaultChecklist.length
          ? saved.checklist.map(Boolean)
          : defaultChecklist,
      products:
        Array.isArray(saved?.products) && saved.products.length
          ? saved.products.map(normalizeProductDraftRow)
          : existingProducts.length
          ? existingProducts.map(normalizeProductDraftRow)
          : [],
      stepIndex:
        Number.isFinite(saved?.stepIndex) && saved.stepIndex >= 0 && saved.stepIndex < state.steps.length
          ? saved.stepIndex
          : 0,
    };

    state.currentStepIndex = state.draft.stepIndex;
  }

  function normalizeProductDraftRow(row) {
    const productId = row?.productId ? String(row.productId) : "";
    const catalog = productId ? state.catalogById.get(productId) : null;

    const qty = Math.max(1, parseInt(row?.qty || "1", 10) || 1);
    const parsedUnit = parseInt(row?.unitCents || "0", 10);
    let unitCents = Math.max(0, Number.isFinite(parsedUnit) ? parsedUnit : 0);
    if (unitCents === 0 && Number.isFinite(catalog?.priceCents)) {
      unitCents = Math.max(0, catalog.priceCents);
    }

    return {
      productId,
      name: String(row?.name || catalog?.name || "").trim(),
      qty,
      unitCents,
      paidByTech: Boolean(row?.paidByTech),
      note: String(row?.note || "").trim(),
    };
  }

  function renderAll() {
    renderHeader();
    renderRequirementChips();
    renderStepper();
    renderCurrentStep();
    renderFooter();
    refreshSummaryFooter();
  }

  function renderHeader() {
    const row = state.intervention;
    setText(els.title, STR.title);
    setText(els.subtitle, STR.subtitle);
    setText(els.ref, row.internal_ref || "Sans reference");
    setText(els.client, row.client_name || "Client");
    setText(els.subject, row.title || "Intervention");
    setText(els.date, formatDateFR(row.start_at) || "Date a definir");
    setText(els.address, row.address || "Adresse non renseignee");
    setText(els.status, statusLabel(canonicalStatus(row.status)));

    const statusTone = statusClass(canonicalStatus(row.status));
    els.status.className = `tr-status ${statusTone}`;

    const phone = normalizePhone(row.support_phone);
    if (phone) {
      els.call.href = `tel:${phone}`;
      els.call.classList.remove("is-disabled");
    } else {
      els.call.removeAttribute("href");
      els.call.classList.add("is-disabled");
    }

    const address = String(row.address || "").trim();
    if (address) {
      els.map.disabled = false;
      els.map.classList.remove("is-disabled");
    } else {
      els.map.disabled = true;
      els.map.classList.add("is-disabled");
    }

    const hasPv = Boolean(state.existing.pvDraftPath);
    els.pv.hidden = !hasPv;
    if (hasPv) {
      els.pv.onclick = async (e) => {
        e.preventDefault();
        await openDraftPv();
      };
    }
  }

  function renderRequirementChips() {
    const chips = [];
    chips.push(`<span class="tr-chip">Checklist: ${state.requirements.checklist ? "obligatoire" : "optionnelle"}</span>`);
    chips.push(`<span class="tr-chip">Photos: ${state.requirements.photos ? "obligatoires" : "optionnelles"}</span>`);
    chips.push(`<span class="tr-chip">Signature: ${state.requirements.signature ? "obligatoire" : "optionnelle"}</span>`);

    chips.push(
      `<span class="tr-chip">Photos deja en base: ${state.existing.photoCount}</span>`
    );

    els.requirements.innerHTML = chips.join("");
  }

  function renderStepper() {
    const total = state.steps.length;
    const current = state.currentStepIndex;

    els.steps.innerHTML = state.steps
      .map((step, idx) => {
        const cls = idx < current ? "is-done" : idx === current ? "is-active" : "";
        return `<button type="button" class="tr-step ${cls}" data-step-index="${idx}">${idx + 1}. ${escapeHTML(step.label)}</button>`;
      })
      .join("");

    const pct = total <= 1 ? 100 : ((current + 1) / total) * 100;
    els.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;

    els.steps.querySelectorAll("[data-step-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.stepIndex);
        if (target < state.currentStepIndex) {
          goToStep(target);
          return;
        }

        if (target === state.currentStepIndex) return;

        if (!validateStep(state.currentStepIndex, { silent: false })) return;
        goToStep(target);
      });
    });
  }

  function renderCurrentStep() {
    const step = state.steps[state.currentStepIndex];
    if (!step) return;

    switch (step.key) {
      case "arrive":
        renderStepArrive();
        break;
      case "diagnostic":
        renderStepDiagnostic();
        break;
      case "resolution":
        renderStepResolution();
        break;
      case "photos":
        renderStepPhotos();
        break;
      case "products":
        renderStepProducts();
        break;
      case "signature":
        renderStepSignature();
        break;
      case "observations":
        renderStepObservations();
        break;
      case "validate":
        renderStepValidate();
        break;
      default:
        els.content.innerHTML = "";
    }

    renderFooter();
    refreshSummaryFooter();
  }

  function renderStepArrive() {
    const arrived = Boolean(state.draft.arrivedAt);
    const arrivedText = arrived ? formatDateFR(state.draft.arrivedAt) : "Non renseignee";

    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepArrive}</h3>
        <p class="tr-hint">${STR.hintArrive}</p>

        <div class="tr-card">
          <div class="tr-label">Arrivee</div>
          <div class="tr-value">${escapeHTML(arrivedText)}</div>
        </div>

        <button type="button" class="tr-btn tr-btn--primary" data-action="mark-arrived">
          ${arrived ? "Arrivee deja marquee" : STR.btnArrived}
        </button>
      </section>
    `;

    const btn = els.content.querySelector('[data-action="mark-arrived"]');
    if (arrived) btn.disabled = true;

    btn?.addEventListener("click", async () => {
      await markArrived();
    });
  }

  async function markArrived() {
    if (!state.intervention) return;

    const nowIso = new Date().toISOString();
    state.draft.arrivedAt = nowIso;
    persistDraft();

    const payload = {};
    if (hasField(state.intervention, "arrived_at")) payload.arrived_at = nowIso;

    const currentStatus = canonicalStatus(state.intervention.status);
    if (currentStatus !== CONFIG.STATUS_IN_PROGRESS && currentStatus !== CONFIG.STATUS_DONE) {
      payload.status = CONFIG.STATUS_IN_PROGRESS;
    }

    if (!Object.keys(payload).length) {
      showToast("success", STR.toastArrived);
      renderCurrentStep();
      return;
    }

    const res = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", state.intervention.id);

    if (res.error) {
      console.warn("[TECH RUN] markArrived warning:", res.error.message);
      showToast("warning", `${STR.toastArriveWarn} (${res.error.message})`);
    } else {
      if (payload.status) state.intervention.status = payload.status;
      showToast("success", STR.toastArrived);
    }

    renderHeader();
    renderCurrentStep();
  }

  function renderStepDiagnostic() {
    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepDiagnostic}</h3>
        <p class="tr-hint">${STR.hintDiagnostic}</p>
        <textarea class="tr-textarea" data-field="diagnostic" placeholder="Ex: carte mere KO suite surtension...">${escapeHTML(state.draft.diagnostic)}</textarea>
      </section>
    `;

    els.content.querySelector('[data-field="diagnostic"]').addEventListener("input", (e) => {
      state.draft.diagnostic = e.target.value;
      persistDraftDebounced();
      refreshSummaryFooter();
    });
  }

  function renderStepResolution() {
    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepResolution}</h3>
        <p class="tr-hint">${STR.hintResolution}</p>
        <textarea class="tr-textarea" data-field="resolution" placeholder="Ex: remplacement carte + test complet OK...">${escapeHTML(state.draft.resolution)}</textarea>
      </section>
    `;

    els.content.querySelector('[data-field="resolution"]').addEventListener("input", (e) => {
      state.draft.resolution = e.target.value;
      persistDraftDebounced();
      refreshSummaryFooter();
    });
  }

  function renderStepPhotos() {
    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepPhotos}</h3>
        <p class="tr-hint">${STR.hintPhotos}</p>

        <div class="tr-photo-actions">
          <button type="button" class="tr-btn tr-btn--ghost" data-action="camera">Prendre une photo</button>
          <button type="button" class="tr-btn tr-btn--ghost" data-action="gallery">Ajouter depuis la galerie</button>
          <input type="file" accept="image/*" capture="environment" data-input="camera" hidden />
          <input type="file" accept="image/*" multiple data-input="gallery" hidden />
        </div>

        <div class="tr-inline-note">Photos en base: ${state.existing.photoCount}</div>
        <div class="tr-previews" data-previews></div>
      </section>
    `;

    const cameraBtn = els.content.querySelector('[data-action="camera"]');
    const galleryBtn = els.content.querySelector('[data-action="gallery"]');
    const cameraInput = els.content.querySelector('[data-input="camera"]');
    const galleryInput = els.content.querySelector('[data-input="gallery"]');

    cameraBtn?.addEventListener("click", () => cameraInput.click());
    galleryBtn?.addEventListener("click", () => galleryInput.click());

    cameraInput?.addEventListener("change", () => {
      appendPhotoFiles(cameraInput.files);
      cameraInput.value = "";
    });

    galleryInput?.addEventListener("change", () => {
      appendPhotoFiles(galleryInput.files);
      galleryInput.value = "";
    });

    renderPhotoPreviews();
  }

  function appendPhotoFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f && String(f.type || "").startsWith("image/"));
    if (!files.length) return;

    state.files.photos = state.files.photos.concat(files);
    persistDraftDebounced();
    renderPhotoPreviews();
    refreshSummaryFooter();
  }

  function renderPhotoPreviews() {
    const wrap = els.content.querySelector('[data-previews]');
    if (!wrap) return;

    clearPreviewUrls();

    if (!state.files.photos.length) {
      wrap.innerHTML = `<div class="tr-empty-small">Aucune photo ajoutee pour le moment.</div>`;
      return;
    }

    wrap.innerHTML = "";

    state.files.photos.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      state.previews.photos.push(url);

      const item = document.createElement("article");
      item.className = "tr-preview";
      item.innerHTML = `
        <img src="${url}" alt="Photo intervention" />
        <div class="tr-preview-meta">
          <span>${escapeHTML(file.name)}</span>
          <span>${escapeHTML(formatBytes(file.size))}</span>
        </div>
        <button type="button" class="tr-btn tr-btn--ghost tr-btn--xs" data-remove-photo="${idx}">Supprimer</button>
      `;

      item.querySelector("img").addEventListener("click", () => window.open(url, "_blank", "noopener"));
      item.querySelector("[data-remove-photo]").addEventListener("click", () => {
        state.files.photos.splice(idx, 1);
        persistDraftDebounced();
        renderPhotoPreviews();
        refreshSummaryFooter();
      });

      wrap.appendChild(item);
    });
  }

  function renderStepProducts() {
    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepProducts}</h3>
        <p class="tr-hint">${STR.hintProducts}</p>

        <div class="tr-products" data-products></div>

        <div class="tr-products-actions">
          <button type="button" class="tr-btn tr-btn--ghost" data-action="add-product">${STR.btnAddProduct}</button>
        </div>

        <div class="tr-products-summary">
          <div>${STR.labelProductsTotal}: <strong data-products-total>0</strong></div>
          <div>${STR.labelRefundTotal}: <strong data-products-refund>0</strong></div>
        </div>
      </section>
    `;

    const addBtn = els.content.querySelector('[data-action="add-product"]');
    addBtn?.addEventListener("click", () => {
      state.draft.products.push(createEmptyProduct());
      persistDraftDebounced();
      renderProductRows();
      refreshSummaryFooter();
    });

    renderProductRows();
  }

  function renderProductRows() {
    const wrap = els.content.querySelector('[data-products]');
    if (!wrap) return;

    if (!state.draft.products.length) {
      wrap.innerHTML = `<div class="tr-empty-small">Aucun produit ajoute.</div>`;
      updateProductsSummary();
      return;
    }

    wrap.innerHTML = "";

    state.draft.products.forEach((row, idx) => {
      const line = document.createElement("article");
      line.className = "tr-product-row";

      const unitEuro = centsToEuroInput(row.unitCents);
      const totalCents = computeLineTotalCents(row);
      const selectedCatalogId = row.productId && state.catalogById.has(String(row.productId)) ? String(row.productId) : "";

      line.innerHTML = `
        <select class="tr-input" data-field="catalog" data-index="${idx}">
          ${buildCatalogOptionsHtml(selectedCatalogId)}
        </select>
        <input class="tr-input" data-field="name" data-index="${idx}" list="tr-products-catalog" placeholder="Nom affiche au client" value="${escapeHTML(row.name)}" />
        <input class="tr-input tr-input--small" data-field="qty" data-index="${idx}" type="number" min="1" step="1" value="${row.qty}" />
        <input class="tr-input tr-input--small" data-field="unit" data-index="${idx}" type="text" placeholder="Prix EUR" value="${escapeHTML(unitEuro)}" />
        <div class="tr-product-total">${escapeHTML(formatCents(totalCents))}</div>
        <label class="tr-check-inline">
          <input type="checkbox" data-field="paidByTech" data-index="${idx}" ${row.paidByTech ? "checked" : ""} />
          Paye par technicien
        </label>
        <input class="tr-input" data-field="note" data-index="${idx}" placeholder="Note" value="${escapeHTML(row.note)}" />
        <button type="button" class="tr-btn tr-btn--ghost tr-btn--xs" data-remove-index="${idx}">Supprimer</button>
      `;

      line.querySelectorAll("[data-field]").forEach((input) => {
        const field = input.dataset.field;
        const index = Number(input.dataset.index);
        const eventName = field === "catalog" || field === "paidByTech" ? "change" : "input";

        input.addEventListener(eventName, () => {
          onProductFieldChange(index, field, input);
          if (field !== "note") {
            renderProductRows();
          } else {
            updateProductsSummary();
          }
          refreshSummaryFooter();
        });

        if (field === "unit") {
          input.addEventListener("focusout", () => {
            const cents = parseEuroInputToCents(input.value);
            if (cents !== null) input.value = centsToEuroInput(cents);
          });
        }
      });

      line.querySelector("[data-remove-index]")?.addEventListener("click", () => {
        const index = Number(line.querySelector("[data-remove-index]").dataset.removeIndex);
        state.draft.products.splice(index, 1);
        persistDraftDebounced();
        renderProductRows();
        refreshSummaryFooter();
      });

      wrap.appendChild(line);
    });

    updateProductsSummary();
  }

  function buildCatalogOptionsHtml(selectedId) {
    const selected = String(selectedId || "");
    const options = ['<option value="">Produit libre</option>'];

    state.catalog.forEach((p) => {
      const id = String(p?.id || "").trim();
      const name = String(p?.name || "").trim();
      if (!id || !name) return;

      options.push(
        `<option value="${escapeHTML(id)}" ${id === selected ? "selected" : ""}>${escapeHTML(name)}</option>`
      );
    });

    return options.join("");
  }

  function onProductFieldChange(index, field, el) {
    const row = state.draft.products[index];
    if (!row) return;

    if (field === "catalog") {
      const productId = String(el.value || "").trim();
      const matched = productId ? state.catalogById.get(productId) : null;
      row.productId = productId;

      if (matched) {
        row.name = matched.name || row.name;
        if (Number.isFinite(matched.priceCents)) {
          row.unitCents = Math.max(0, matched.priceCents);
        }
      }
    }

    if (field === "name") {
      row.name = String(el.value || "").trim();
      const matched = state.catalogByName.get(norm(row.name));
      if (matched) {
        row.productId = matched.id;
        if (!row.unitCents && Number.isFinite(matched.priceCents)) {
          row.unitCents = matched.priceCents;
        }
      } else {
        row.productId = "";
      }
    }

    if (field === "qty") {
      row.qty = Math.max(1, parseInt(el.value || "1", 10) || 1);
    }

    if (field === "unit") {
      const cents = parseEuroInputToCents(el.value);
      row.unitCents = Math.max(0, cents === null ? 0 : cents);
    }

    if (field === "paidByTech") {
      row.paidByTech = Boolean(el.checked);
    }

    if (field === "note") {
      row.note = String(el.value || "").trim();
    }

    persistDraftDebounced();
  }

  function updateProductsSummary() {
    const totalEl = els.content.querySelector("[data-products-total]");
    const refundEl = els.content.querySelector("[data-products-refund]");
    if (!totalEl || !refundEl) return;

    const totalCents = computeProductsTotalCents(state.draft.products);
    const refundCents = computeProductsTotalCents(state.draft.products, true);

    totalEl.textContent = formatCents(totalCents);
    refundEl.textContent = formatCents(refundCents);
  }

  function renderStepSignature() {
    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepSignature}</h3>
        <p class="tr-hint">${STR.hintSignature}</p>

        <div class="tr-signature-wrap">
          <canvas class="tr-signature-canvas" data-signature-canvas></canvas>
          <div class="tr-signature-actions">
            <button type="button" class="tr-btn tr-btn--ghost tr-btn--xs" data-action="clear-signature">${STR.btnClearSignature}</button>
            <span class="tr-inline-note" data-signature-state>${state.signature.hasSignature ? "Signature capturee" : "Aucune signature"}</span>
          </div>
        </div>
      </section>
    `;

    const canvas = els.content.querySelector("[data-signature-canvas]");
    setupSignatureCanvas(canvas);

    els.content.querySelector('[data-action="clear-signature"]').addEventListener("click", () => {
      clearSignatureCanvas();
      refreshSummaryFooter();
    });
  }

  function setupSignatureCanvas(canvas) {
    if (!canvas) return;

    state.signature.canvas = canvas;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    const height = 180;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.height = `${height}px`;
    canvas.style.touchAction = "none";

    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2 * ratio;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";

    let drawing = false;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * ratio,
        y: (e.clientY - rect.top) * ratio,
      };
    };

    const onDown = (e) => {
      drawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      state.signature.hasSignature = true;
      updateSignatureStateLabel();
    };

    const onMove = (e) => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };

    const onUp = () => {
      drawing = false;
      if (state.signature.hasSignature) {
        state.signature.dataUrl = canvas.toDataURL("image/png");
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    if (state.signature.dataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        state.signature.hasSignature = true;
        updateSignatureStateLabel();
      };
      img.src = state.signature.dataUrl;
    } else {
      state.signature.hasSignature = false;
      updateSignatureStateLabel();
    }
  }

  function clearSignatureCanvas() {
    const canvas = state.signature.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signature.hasSignature = false;
    state.signature.dataUrl = "";
    updateSignatureStateLabel();
  }

  function updateSignatureStateLabel() {
    const label = els.content.querySelector("[data-signature-state]");
    if (!label) return;
    label.textContent = state.signature.hasSignature ? "Signature capturee" : "Aucune signature";
  }

  function renderStepObservations() {
    const signedName = state.files.signedPv?.name || "Aucun fichier choisi";

    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepObservations}</h3>
        <p class="tr-hint">${STR.hintObservations}</p>

        <textarea class="tr-textarea" data-field="observations" placeholder="Infos utiles pour l'equipe admin...">${escapeHTML(state.draft.observations)}</textarea>

        <div class="tr-card">
          <div class="tr-label">${STR.labelSignedPv}</div>
          <input type="file" accept="application/pdf,image/*" data-input="signed-pv" class="tr-input-file" />
          <div class="tr-inline-note" data-signed-pv-label>${escapeHTML(signedName)}</div>
          ${state.existing.pvSignedPath ? `<div class="tr-inline-note">PV signe deja present en base.</div>` : ""}
        </div>
      </section>
    `;

    els.content.querySelector('[data-field="observations"]').addEventListener("input", (e) => {
      state.draft.observations = e.target.value;
      persistDraftDebounced();
      refreshSummaryFooter();
    });

    els.content.querySelector('[data-input="signed-pv"]').addEventListener("change", (e) => {
      state.files.signedPv = e.target.files?.[0] || null;
      const label = els.content.querySelector("[data-signed-pv-label]");
      if (label) label.textContent = state.files.signedPv?.name || "Aucun fichier choisi";
      refreshSummaryFooter();
    });
  }

  function renderStepValidate() {
    const checklistItems = getChecklist(state.intervention);
    const checks = state.draft.checklist;

    els.content.innerHTML = `
      <section class="tr-section is-active">
        <h3 class="tr-title">${STR.stepValidate}</h3>
        <p class="tr-hint">${STR.hintValidate}</p>

        <div class="tr-card">
          <div class="tr-label">${STR.labelChecklist}</div>
          <div class="tr-checklist" data-checklist>
            ${checklistItems
              .map((label, idx) => {
                const checked = checks[idx] ? "checked" : "";
                return `
                  <label class="tr-check-item">
                    <input type="checkbox" data-check-index="${idx}" ${checked} />
                    <span>${escapeHTML(label)}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>

        <div class="tr-card tr-summary" data-summary></div>

        <div class="tr-card tr-warning">
          Assure-toi que toutes les informations sont correctes avant validation definitive.
        </div>
      </section>
    `;

    els.content.querySelector("[data-checklist]").addEventListener("change", (e) => {
      const input = e.target;
      if (!input.matches("input[type='checkbox']")) return;

      const idx = Number(input.dataset.checkIndex);
      state.draft.checklist[idx] = Boolean(input.checked);
      persistDraftDebounced();
      refreshSummaryFooter();
      renderValidationSummary();
    });

    renderValidationSummary();
  }

  function renderValidationSummary() {
    const summary = els.content.querySelector("[data-summary]");
    if (!summary) return;

    const photosCount = state.existing.photoCount + state.files.photos.length;
    const products = cleanProducts(state.draft.products);
    const productsTotal = computeProductsTotalCents(products);

    const lines = [
      [`Diagnostic`, shortState(state.draft.diagnostic, 60)],
      [`Resolution`, shortState(state.draft.resolution, 60)],
      [`Photos`, `${photosCount} fichier(s)`],
      [`Produits`, `${products.length} ligne(s), total ${formatCents(productsTotal)}`],
      [`Signature`, state.signature.hasSignature ? "Capturee" : state.requirements.signature ? "Manquante" : "Optionnelle"],
      [`Observations`, shortState(state.draft.observations, 60)],
    ];

    summary.innerHTML = lines
      .map(([label, value]) => {
        return `<div class="tr-summary-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
      })
      .join("");
  }

  function renderFooter() {
    const isFirst = state.currentStepIndex === 0;
    const isLast = state.currentStepIndex === state.steps.length - 1;

    els.prev.disabled = isFirst || state.saving;
    els.next.hidden = isLast;
    els.validate.hidden = !isLast;

    els.next.disabled = state.saving;
    els.validate.disabled = state.saving;
    els.saveDraft.disabled = state.saving;

    const currentStep = state.steps[state.currentStepIndex];
    els.footerStep.textContent = `Etape ${state.currentStepIndex + 1}/${state.steps.length} - ${currentStep.label}`;

    els.next.textContent = STR.btnNext;
  }

  function refreshSummaryFooter() {
    const photosCount = state.existing.photoCount + state.files.photos.length;
    const productsTotal = computeProductsTotalCents(cleanProducts(state.draft.products));
    const signatureOk = state.signature.hasSignature || !state.requirements.signature;

    els.footerSummary.innerHTML = `
      <span>Photos: <strong>${photosCount}</strong></span>
      <span>Produits: <strong>${formatCents(productsTotal)}</strong></span>
      <span>Signature: <strong>${signatureOk ? "OK" : "A faire"}</strong></span>
    `;
  }

  function wireStaticEvents() {
    els.map.addEventListener("click", () => {
      const address = String(state.intervention?.address || "").trim();
      if (!address) return;
      openMapSheet(address);
    });

    els.sheet.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-map]");
      if (!btn) return;
      openMapProvider(btn.dataset.map || "google");
    });

    els.sheetClose.forEach((el) => el.addEventListener("click", closeMapSheet));

    els.prev.addEventListener("click", () => {
      goToStep(state.currentStepIndex - 1);
    });

    els.next.addEventListener("click", () => {
      if (!validateStep(state.currentStepIndex, { silent: false })) return;
      goToStep(state.currentStepIndex + 1);
      showToast("success", STR.toastStepSaved);
    });

    els.saveDraft.addEventListener("click", () => {
      persistDraft();
      showToast("success", STR.toastDraftSaved);
    });

    els.validate.addEventListener("click", async () => {
      await submitValidation();
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        persistDraft();
        showToast("success", STR.toastDraftSaved);
      }
    });
  }

  function goToStep(index) {
    const next = Math.max(0, Math.min(index, state.steps.length - 1));
    state.currentStepIndex = next;
    state.draft.stepIndex = next;
    persistDraftDebounced();

    renderStepper();
    renderCurrentStep();
  }

  function validateStep(index, opts = { silent: true }) {
    const silent = Boolean(opts?.silent);
    const key = state.steps[index]?.key;

    if (!key) return true;

    if (key === "arrive") {
      if (!state.draft.arrivedAt) {
        if (!silent) showToast("warning", "Marque ton arrivee avant de continuer.");
        return false;
      }
      return true;
    }

    if (key === "diagnostic") {
      if (!String(state.draft.diagnostic || "").trim()) {
        if (!silent) showToast("warning", STR.toastNeedDiagnostic);
        return false;
      }
      return true;
    }

    if (key === "resolution") {
      if (!String(state.draft.resolution || "").trim()) {
        if (!silent) showToast("warning", STR.toastNeedResolution);
        return false;
      }
      return true;
    }

    if (key === "photos") {
      const totalPhotos = state.existing.photoCount + state.files.photos.length;
      if (state.requirements.photos && totalPhotos <= 0) {
        if (!silent) showToast("warning", STR.toastNeedPhotos);
        return false;
      }
      return true;
    }

    if (key === "products") {
      const check = validateProducts(state.draft.products);
      if (!check.ok) {
        if (!silent) showToast("warning", `${STR.toastInvalidProducts} ${check.message || ""}`.trim());
        return false;
      }
      return true;
    }

    if (key === "signature") {
      if (state.requirements.signature && !state.signature.hasSignature) {
        if (!silent) showToast("warning", STR.toastNeedSignature);
        return false;
      }
      return true;
    }

    if (key === "validate") {
      if (state.requirements.checklist && !state.draft.checklist.every(Boolean)) {
        if (!silent) showToast("warning", STR.toastNeedChecklist);
        return false;
      }
      return true;
    }

    return true;
  }

  function validateAllStepsBeforeSubmit() {
    for (let i = 0; i < state.steps.length; i += 1) {
      if (!validateStep(i, { silent: true })) {
        goToStep(i);
        validateStep(i, { silent: false });
        return false;
      }
    }
    return true;
  }

  async function submitValidation() {
    if (state.saving) return;

    if (!validateAllStepsBeforeSubmit()) return;

    const ok = window.confirm("Confirmer la validation finale de l'intervention ?");
    if (!ok) return;

    state.saving = true;
    renderFooter();

    showToast("success", STR.toastValidationRunning);
    setStatus("info", "Validation en cours: envoi des fichiers et enregistrement des donnees...");

    try {
      const id = state.intervention.id;
      const nowIso = new Date().toISOString();

      const uploadedPhotos = await uploadPhotoFiles(id, state.files.photos);
      const uploadedSignature = await uploadSignatureIfAny(id);
      const uploadedSignedPv = await uploadSignedPvIfAny(id, state.files.signedPv);

      await syncInterventionFilesRows(id, uploadedPhotos, uploadedSignature);
      await syncSignedPv(id, uploadedSignedPv);
      await syncProductsExpenses(id, cleanProducts(state.draft.products));

      const reportText = buildObservationsText({
        intervention: state.intervention,
        diagnostic: state.draft.diagnostic,
        resolution: state.draft.resolution,
        observations: state.draft.observations,
        checklist: state.draft.checklist,
        products: cleanProducts(state.draft.products),
        photosCount: state.existing.photoCount + state.files.photos.length,
        signedPv: uploadedSignedPv,
      });

      const reportSaved = await saveReportOptional({
        intervention_id: id,
        user_id: state.userId,
        diagnostic: state.draft.diagnostic,
        resolution: state.draft.resolution,
        observations: reportText,
        notes: state.draft.observations,
        checklist: state.draft.checklist,
        completed_at: nowIso,
        products: cleanProducts(state.draft.products),
      });

      const interventionUpdated = await updateInterventionRecord(id, nowIso, reportText, uploadedSignedPv);

      if (interventionUpdated) {
        showToast("success", STR.toastValidationOk);
      } else {
        showToast("warning", STR.toastValidationPartial);
      }

      if (!reportSaved) {
        showToast("warning", "Table rapport absente: le resume est conserve dans les observations intervention.");
      }

      clearDraft(state.intervention.id);
      clearActiveInterventionId();
      clearTransientFiles();

      setStatus("success", "Intervention finalisee. Redirection vers la liste...");
      setTimeout(() => {
        window.location.href = CONFIG.LIST_PAGE_PATH;
      }, 850);
    } catch (error) {
      console.error("[TECH RUN] submitValidation error:", error);
      showToast("error", `${STR.toastValidationError} ${error?.message || ""}`.trim());
      setStatus("error", `Erreur: ${error?.message || "validation interrompue"}`);
    } finally {
      state.saving = false;
      renderFooter();
    }
  }

  async function uploadPhotoFiles(interventionId, files) {
    if (!files?.length) return [];

    const uploads = [];

    for (const file of files) {
      const defaultExt = getFileExtension(file.name) || "jpg";
      let ext = defaultExt;
      let uploadPayload = file;
      let uploadMime = file.type || "image/jpeg";
      let path = `interventions/${interventionId}/photos/${Date.now()}_${randomId()}.${ext}`;

      try {
        await uploadWithBucketFallback(path, uploadPayload, {
          cacheControl: "3600",
          upsert: false,
          contentType: uploadMime,
        });
      } catch (error) {
        const canRetryAsPng =
          isMimeNotSupportedError(error) &&
          String(file.type || "").toLowerCase().includes("jpeg");

        if (!canRetryAsPng) {
          throw new Error(`Upload photo impossible (${file.name}): ${error?.message || "erreur inconnue"}`);
        }

        const pngBlob = await convertImageFileToPng(file);
        ext = "png";
        uploadPayload = pngBlob;
        uploadMime = "image/png";
        path = `interventions/${interventionId}/photos/${Date.now()}_${randomId()}.${ext}`;

        try {
          await uploadWithBucketFallback(path, uploadPayload, {
            cacheControl: "3600",
            upsert: false,
            contentType: uploadMime,
          });
        } catch (pngError) {
          throw new Error(`Upload photo impossible (${file.name}): ${pngError?.message || "erreur inconnue"}`);
        }
      }

      uploads.push({
        type: "photo",
        path,
      });
    }

    return uploads;
  }

  async function uploadSignatureIfAny(interventionId) {
    if (!state.signature.hasSignature || !state.signature.canvas) return null;

    const blob = await canvasToBlob(state.signature.canvas);
    if (!blob) return null;

    const path = `interventions/${interventionId}/signature/${Date.now()}_${randomId()}.png`;
    try {
      await uploadWithBucketFallback(path, blob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/png",
      });
    } catch (error) {
      throw new Error(`Upload signature impossible: ${error?.message || "erreur inconnue"}`);
    }

    return { type: "signature", path };
  }

  async function uploadSignedPvIfAny(interventionId, file) {
    if (!file) return null;

    const ext = getFileExtension(file.name) || "pdf";
    const path = `interventions/${interventionId}/pv/signed_${Date.now()}_${randomId()}.${ext}`;
    try {
      await uploadWithBucketFallback(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "application/pdf",
      });
    } catch (error) {
      throw new Error(`Upload PV signe impossible: ${error?.message || "erreur inconnue"}`);
    }

    return { path, name: file.name, type: file.type || "application/octet-stream" };
  }

  async function syncInterventionFilesRows(interventionId, photos, signature) {
    const payload = [];

    (photos || []).forEach((p) => {
      payload.push({ intervention_id: interventionId, type: "photo", file_path: p.path });
    });

    if (signature?.path) {
      payload.push({ intervention_id: interventionId, type: "signature", file_path: signature.path });
    }

    if (!payload.length) return true;

    const ins = await supabase.from(CONFIG.FILES_TABLE).insert(payload);
    if (ins.error) throw new Error(`Enregistrement fichiers impossible: ${ins.error.message}`);

    return true;
  }

  async function syncSignedPv(interventionId, signedPvUpload) {
    if (!signedPvUpload?.path) return true;

    const payload = {
      intervention_id: interventionId,
      pv_signed_path: signedPvUpload.path,
      signed_origin: "tech",
      signed_uploaded_at: new Date().toISOString(),
    };

    const existing = await supabase
      .from(CONFIG.PV_TABLE)
      .select("intervention_id")
      .eq("intervention_id", interventionId)
      .maybeSingle();

    if (existing.error && !isTableMissing(existing.error)) {
      throw new Error(`Lecture PV impossible: ${existing.error.message}`);
    }

    if (isTableMissing(existing.error)) {
      return false;
    }

    if (existing.data?.intervention_id) {
      const up = await supabase
        .from(CONFIG.PV_TABLE)
        .update(payload)
        .eq("intervention_id", interventionId);
      if (up.error) throw new Error(`Mise a jour PV impossible: ${up.error.message}`);
      return true;
    }

    const ins = await supabase.from(CONFIG.PV_TABLE).insert(payload);
    if (ins.error) throw new Error(`Insertion PV impossible: ${ins.error.message}`);

    return true;
  }

  async function syncProductsExpenses(interventionId, products) {
    const rows = products || [];

    const existing = await supabase
      .from(CONFIG.EXPENSES_TABLE)
      .select("id, note")
      .eq("intervention_id", interventionId)
      .eq("type", "material");

    if (existing.error && !isTableMissing(existing.error)) {
      throw new Error(`Lecture depenses impossible: ${existing.error.message}`);
    }

    if (isTableMissing(existing.error)) return false;

    const existingRows = existing.data || [];
    const idsToDelete = existingRows
      .filter((r) => String(r.note || "").startsWith(CONFIG.TECH_RUN_NOTE_PREFIX))
      .map((r) => r.id);

    if (idsToDelete.length) {
      const del = await supabase
        .from(CONFIG.EXPENSES_TABLE)
        .delete()
        .in("id", idsToDelete);

      if (del.error) throw new Error(`Suppression depenses existantes impossible: ${del.error.message}`);
    }

    if (!rows.length) return true;

    const payload = rows.map((r) => {
      const noteParts = [];
      noteParts.push(CONFIG.TECH_RUN_NOTE_PREFIX);
      if (r.paidByTech) noteParts.push("paid_by_tech");
      if (r.note) noteParts.push(r.note);

      return {
        intervention_id: interventionId,
        type: "material",
        product_id: r.productId || null,
        qty: r.qty,
        unit_cost_cents: r.unitCents,
        amount_cents: computeLineTotalCents(r),
        note: noteParts.join(" ").trim(),
      };
    });

    const ins = await supabase.from(CONFIG.EXPENSES_TABLE).insert(payload);
    if (ins.error) throw new Error(`Insertion depenses impossible: ${ins.error.message}`);

    return true;
  }

  async function saveReportOptional(payload) {
    const res = await supabase
      .from(CONFIG.REPORTS_TABLE)
      .upsert(payload, { onConflict: "intervention_id,user_id" });

    if (res.error) {
      if (isTableMissing(res.error)) return false;
      console.warn("[TECH RUN] report warning:", res.error.message);
      return false;
    }

    return true;
  }

  async function updateInterventionRecord(interventionId, completedAtIso, observationsText, signedPvUpload) {
    const row = state.intervention;

    const payload = {
      status: CONFIG.STATUS_DONE,
    };

    if (hasField(row, "end_at")) payload.end_at = completedAtIso;

    const observationsField = findExistingField(row, ["observations", "infos", "notes", "report_notes"]);
    if (observationsField) payload[observationsField] = observationsText;

    if (signedPvUpload?.path) {
      if (hasField(row, "pv_source")) payload.pv_source = "tech";
      if (hasField(row, "pv_status")) payload.pv_status = "signed";
    }

    const up = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", interventionId);

    if (!up.error) return true;

    if (String(up.error.code || "") === "23514") {
      const fallback = { ...payload };
      delete fallback.status;
      const fallbackUp = await supabase
        .from("interventions")
        .update(fallback)
        .eq("id", interventionId);
      return !fallbackUp.error;
    }

    throw new Error(`Mise a jour intervention impossible: ${up.error.message}`);
  }

  function buildObservationsText(parts) {
    const lines = [];

    lines.push(`Intervention: ${parts.intervention?.internal_ref || ""} - ${parts.intervention?.title || ""}`.trim());
    if (parts.intervention?.client_name) lines.push(`Client: ${parts.intervention.client_name}`);

    if (parts.diagnostic) lines.push(`\n[Diagnostic]\n${parts.diagnostic}`);
    if (parts.resolution) lines.push(`\n[Resolution]\n${parts.resolution}`);

    if (parts.products?.length) {
      lines.push("\n[Produits]");
      parts.products.forEach((p) => {
        const refund = p.paidByTech ? " (paye par tech)" : "";
        lines.push(`- ${p.name} x${p.qty} @ ${formatCents(p.unitCents)} = ${formatCents(computeLineTotalCents(p))}${refund}`);
      });
    }

    lines.push(`\n[Photos] ${parts.photosCount} photo(s)`);

    if (state.signature.hasSignature) {
      lines.push("\n[Signature] Capturee par le technicien");
    }

    if (parts.signedPv?.path) {
      lines.push(`\n[PV signe] ${parts.signedPv.path}`);
    }

    if (parts.observations) {
      lines.push(`\n[Observations]\n${parts.observations}`);
    }

    lines.push("\n[Checklist]");
    getChecklist(state.intervention).forEach((label, idx) => {
      lines.push(`- ${parts.checklist[idx] ? "OK" : "A verifier"}: ${label}`);
    });

    return lines.join("\n");
  }

  async function openDraftPv() {
    if (!state.existing.pvDraftPath) return;

    const signedUrl = await createSignedUrlWithBucketFallback(state.existing.pvDraftPath, CONFIG.SIGNED_URL_TTL);

    if (!signedUrl) {
      showToast("warning", `Impossible d'ouvrir le PV vierge: bucket ou fichier introuvable.`);
      return;
    }

    window.open(signedUrl, "_blank", "noopener");
  }

  function openMapSheet(address) {
    const normalized = String(address || "").trim();
    if (!normalized) return;

    els.sheet.dataset.address = normalized;
    els.sheet.hidden = false;
    document.body.classList.add("tr-sheet-open");
  }

  function closeMapSheet() {
    els.sheet.hidden = true;
    document.body.classList.remove("tr-sheet-open");
  }

  function openMapProvider(provider) {
    const address = els.sheet.dataset.address || "";
    const url = buildMapUrl(provider, address);
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

  function getBucketCandidates() {
    const candidates = [
      root?.dataset?.storageBucket || "",
      window.__MBL_CFG__?.BUCKET || "",
      resolvedStorageBucket || "",
      CONFIG.STORAGE_BUCKET || "",
      "interventions-files",
      "intervention-files",
      "interventions",
      "intervention",
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    return Array.from(new Set(candidates));
  }

  function isBucketNotFoundError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("bucket not found") || msg.includes("bucket does not exist");
  }

  function isObjectNotFoundError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("object not found") || msg.includes("resource was not found");
  }

  function isMimeNotSupportedError(error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("type mime non autorise")) return true;
    if (msg.includes("mime non autorise")) return true;
    return msg.includes("mime type") && (msg.includes("not supported") || msg.includes("unsupported"));
  }

  function buildUploadOptionsVariants(options, file) {
    const base = { ...(options || {}) };
    const providedType = String(base.contentType || "").trim();
    const fileType = String(file?.type || "").trim();
    const firstType = providedType || fileType;
    if (!firstType) return [base];

    const variants = [];
    const seen = new Set();
    const pushVariant = (mime) => {
      const key = String(mime || "__none__");
      if (seen.has(key)) return;
      seen.add(key);

      const next = { ...base };
      if (mime) next.contentType = mime;
      else delete next.contentType;
      variants.push(next);
    };

    pushVariant(firstType);
    pushVariant("");

    if (firstType.startsWith("image/")) {
      pushVariant("image/jpg");
      pushVariant("image/jpeg");
      pushVariant("application/octet-stream");
    }

    return variants.length ? variants : [base];
  }

  function setResolvedStorageBucket(bucket) {
    if (!bucket) return;
    resolvedStorageBucket = bucket;
    CONFIG.STORAGE_BUCKET = bucket;
  }

  async function uploadWithBucketFallback(path, file, options) {
    const candidates = getBucketCandidates();
    const optionVariants = buildUploadOptionsVariants(options, file);
    let lastError = null;

    for (const bucket of candidates) {
      let shouldTryNextBucket = false;

      for (const variant of optionVariants) {
        const res = await supabase.storage.from(bucket).upload(path, file, variant);
        if (!res.error) {
          setResolvedStorageBucket(bucket);
          return { bucket, path };
        }

        lastError = res.error;
        if (isBucketNotFoundError(res.error)) {
          shouldTryNextBucket = true;
          break;
        }

        if (isMimeNotSupportedError(res.error)) {
          continue;
        }

        throw new Error(`[${bucket}] ${res.error.message}`);
      }

      if (shouldTryNextBucket || isMimeNotSupportedError(lastError)) {
        continue;
      }
    }

    if (isMimeNotSupportedError(lastError)) {
      throw new Error(
        `Type MIME non autorise par les buckets testes (${candidates.join(", ")}). Verifie les types autorises du bucket Storage.`
      );
    }

    throw new Error(
      `Bucket introuvable. Configure data-storage-bucket sur la page (testes: ${candidates.join(", ")}). ${lastError?.message || ""}`.trim()
    );
  }

  async function createSignedUrlWithBucketFallback(path, ttl) {
    const candidates = getBucketCandidates();

    for (const bucket of candidates) {
      const res = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
      if (!res.error && res.data?.signedUrl) {
        setResolvedStorageBucket(bucket);
        return res.data.signedUrl;
      }

      if (isBucketNotFoundError(res.error) || isObjectNotFoundError(res.error)) continue;
    }

    return "";
  }

  function buildSteps(requirements) {
    const steps = [
      { key: "arrive", label: STR.stepArrive },
      { key: "diagnostic", label: STR.stepDiagnostic },
      { key: "resolution", label: STR.stepResolution },
      { key: "photos", label: STR.stepPhotos },
      { key: "products", label: STR.stepProducts },
    ];

    if (requirements.signature) {
      steps.push({ key: "signature", label: STR.stepSignature });
    }

    steps.push({ key: "observations", label: STR.stepObservations });
    steps.push({ key: "validate", label: STR.stepValidate });

    return steps;
  }

  function getChecklist(row) {
    if (Array.isArray(row?.checklist) && row.checklist.length) return row.checklist;

    return [
      "Contact client confirme",
      "Zone securisee",
      "Diagnostic realise",
      "Intervention terminee",
      "Tests fonctionnels OK",
      "Compte-rendu explique au client",
      "Photos ou preuves completees",
      "Site propre et remis en etat",
    ];
  }

  function validateProducts(rows) {
    const normalized = rows || [];

    for (let i = 0; i < normalized.length; i += 1) {
      const row = normalized[i];
      const hasAny = Boolean(row.name || row.note || row.qty || row.unitCents || row.productId || row.paidByTech);
      if (!hasAny) continue;

      const catalog = row.productId ? state.catalogById.get(String(row.productId)) : null;
      const label = String(row.name || catalog?.name || "").trim();
      if (!label) {
        return { ok: false, message: `Ligne ${i + 1}: nom manquant.` };
      }

      if (!Number.isFinite(row.qty) || row.qty <= 0) {
        return { ok: false, message: `Ligne ${i + 1}: quantite invalide.` };
      }

      if (!Number.isFinite(row.unitCents) || row.unitCents < 0) {
        return { ok: false, message: `Ligne ${i + 1}: prix invalide.` };
      }
    }

    return { ok: true };
  }

  function cleanProducts(rows) {
    return (rows || [])
      .map(normalizeProductDraftRow)
      .filter((r) => String(r.name || "").trim());
  }

  function createEmptyProduct() {
    return {
      productId: "",
      name: "",
      qty: 1,
      unitCents: 0,
      paidByTech: false,
      note: "",
    };
  }

  function computeLineTotalCents(row) {
    const qty = Math.max(0, parseInt(row?.qty || "0", 10) || 0);
    const unit = Math.max(0, parseInt(row?.unitCents || "0", 10) || 0);
    return qty * unit;
  }

  function computeProductsTotalCents(rows, paidByTechOnly = false) {
    return (rows || []).reduce((sum, row) => {
      if (paidByTechOnly && !row.paidByTech) return sum;
      return sum + computeLineTotalCents(row);
    }, 0);
  }

  async function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), "image/png", 0.92);
    });
  }

  async function convertImageFileToPng(file) {
    const bitmap = await readImageBitmap(file);
    const width = Math.max(1, Math.floor(bitmap.width || 1));
    const height = Math.max(1, Math.floor(bitmap.height || 1));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible pour convertir la photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    if (typeof bitmap.close === "function") {
      try {
        bitmap.close();
      } catch (_) {
        // ignore close errors
      }
    }

    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result || null), "image/png", 0.92);
    });

    if (!blob) throw new Error("Conversion PNG impossible.");
    return blob;
  }

  async function readImageBitmap(file) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(file);
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        resolve(img);
        URL.revokeObjectURL(url);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Lecture image impossible."));
      };

      img.src = url;
    });
  }

  function clearPreviewUrls() {
    (state.previews.photos || []).forEach((url) => URL.revokeObjectURL(url));
    state.previews.photos = [];
  }

  function clearTransientFiles() {
    clearPreviewUrls();
    state.files.photos = [];
    state.files.signedPv = null;
    state.signature.hasSignature = false;
    state.signature.canvas = null;
    state.signature.dataUrl = "";
  }

  function persistDraft() {
    if (!state.intervention?.id) return;

    const payload = {
      stepIndex: state.currentStepIndex,
      arrivedAt: state.draft.arrivedAt,
      diagnostic: state.draft.diagnostic,
      resolution: state.draft.resolution,
      observations: state.draft.observations,
      checklist: state.draft.checklist,
      products: state.draft.products,
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(getDraftKey(state.intervention.id), JSON.stringify(payload));
    } catch (_) {
      // ignore localStorage quota errors
    }
  }

  const persistDraftDebounced = debounce(persistDraft, 180);

  function loadDraft(interventionId) {
    try {
      const raw = localStorage.getItem(getDraftKey(interventionId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearDraft(interventionId) {
    try {
      localStorage.removeItem(getDraftKey(interventionId));
    } catch (_) {
      // noop
    }
  }

  function getDraftKey(interventionId) {
    return `${CONFIG.DRAFT_STORAGE_PREFIX}:${interventionId}`;
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

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset || {};
    if (d.storageBucket) CONFIG.STORAGE_BUCKET = d.storageBucket;
    if (d.reportsTable) CONFIG.REPORTS_TABLE = d.reportsTable;
    if (d.expensesTable) CONFIG.EXPENSES_TABLE = d.expensesTable;
    if (d.productsTable) CONFIG.PRODUCTS_TABLE = d.productsTable;
    if (d.filesTable) CONFIG.FILES_TABLE = d.filesTable;
    if (d.pvTable) CONFIG.PV_TABLE = d.pvTable;
    if (d.requireChecklist) CONFIG.REQUIRE_CHECKLIST_DEFAULT = d.requireChecklist === "true";
    if (d.requirePhotos) CONFIG.REQUIRE_PHOTOS_DEFAULT = d.requirePhotos === "true";
    if (d.requireSignature) CONFIG.REQUIRE_SIGNATURE_DEFAULT = d.requireSignature === "true";
    if (d.listPath) CONFIG.LIST_PAGE_PATH = d.listPath;
    if (d.currency) CONFIG.CURRENCY = d.currency;
  }

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <datalist id="tr-products-catalog"></datalist>

      <section class="tr-shell">
        <header class="tr-header">
          <div>
            <div class="tr-eyebrow" data-subtitle></div>
            <h1 class="tr-h1" data-title></h1>
          </div>
          <a class="tr-btn tr-btn--ghost" href="${CONFIG.LIST_PAGE_PATH}">${STR.btnBackList}</a>
        </header>

        <section class="tr-card tr-main-card">
          <div class="tr-main-top">
            <div>
              <div class="tr-ref" data-ref>—</div>
              <div class="tr-client" data-client>—</div>
              <div class="tr-subject" data-subject>—</div>
              <div class="tr-meta">
                <span data-date>—</span>
                <span data-address>—</span>
              </div>
            </div>
            <div class="tr-status" data-status>—</div>
          </div>

          <div class="tr-actions">
            <a class="tr-btn tr-btn--primary" data-call>${STR.btnCall}</a>
            <button type="button" class="tr-btn tr-btn--ghost" data-map>${STR.btnMap}</button>
            <button type="button" class="tr-btn tr-btn--ghost" data-pv hidden>${STR.btnPvBlank}</button>
          </div>

          <div class="tr-requirements" data-requirements></div>
        </section>

        <div class="tr-status-box" data-status-box></div>

        <section class="tr-progress" data-progress>
          <div class="tr-progress-top">
            <div class="tr-progress-label" data-footer-step></div>
            <div class="tr-progress-bar-wrap"><div class="tr-progress-bar" data-progress-bar></div></div>
          </div>
          <div class="tr-steps" data-steps></div>
        </section>

        <section class="tr-content" data-content></section>

        <footer class="tr-footer" data-footer>
          <div class="tr-footer-summary" data-footer-summary></div>
          <div class="tr-footer-actions">
            <button type="button" class="tr-btn tr-btn--ghost" data-prev>${STR.btnPrev}</button>
            <button type="button" class="tr-btn tr-btn--ghost" data-save-draft>${STR.btnSaveDraft}</button>
            <button type="button" class="tr-btn tr-btn--primary" data-next>${STR.btnNext}</button>
            <button type="button" class="tr-btn tr-btn--primary" data-validate hidden>${STR.btnValidate}</button>
          </div>
        </footer>

        <div class="tr-toasts" data-toasts></div>

        <div class="tr-sheet" data-sheet hidden>
          <div class="tr-sheet-backdrop" data-sheet-close></div>
          <div class="tr-sheet-panel">
            <div class="tr-sheet-title">${STR.mapChooseTitle}</div>
            <button class="tr-sheet-btn" data-map="apple">${STR.mapPlans}</button>
            <button class="tr-sheet-btn" data-map="google">${STR.mapGoogle}</button>
            <button class="tr-sheet-btn" data-map="waze">${STR.mapWaze}</button>
            <button class="tr-sheet-btn tr-sheet-cancel" data-sheet-close>${STR.mapCancel}</button>
          </div>
        </div>
      </section>
    `;

    return {
      catalog: rootEl.querySelector("#tr-products-catalog"),
      title: rootEl.querySelector("[data-title]"),
      subtitle: rootEl.querySelector("[data-subtitle]"),
      ref: rootEl.querySelector("[data-ref]"),
      client: rootEl.querySelector("[data-client]"),
      subject: rootEl.querySelector("[data-subject]"),
      date: rootEl.querySelector("[data-date]"),
      address: rootEl.querySelector("[data-address]"),
      status: rootEl.querySelector("[data-status]"),
      call: rootEl.querySelector("[data-call]"),
      map: rootEl.querySelector("[data-map]:not(.tr-sheet-btn)"),
      pv: rootEl.querySelector("[data-pv]"),
      requirements: rootEl.querySelector("[data-requirements]"),
      statusBox: rootEl.querySelector("[data-status-box]"),
      progress: rootEl.querySelector("[data-progress]"),
      progressBar: rootEl.querySelector("[data-progress-bar]"),
      steps: rootEl.querySelector("[data-steps]"),
      content: rootEl.querySelector("[data-content]"),
      footer: rootEl.querySelector("[data-footer]"),
      footerStep: rootEl.querySelector("[data-footer-step]"),
      footerSummary: rootEl.querySelector("[data-footer-summary]"),
      prev: rootEl.querySelector("[data-prev]"),
      next: rootEl.querySelector("[data-next]"),
      saveDraft: rootEl.querySelector("[data-save-draft]"),
      validate: rootEl.querySelector("[data-validate]"),
      toasts: rootEl.querySelector("[data-toasts]"),
      sheet: rootEl.querySelector("[data-sheet]"),
      sheetClose: Array.from(rootEl.querySelectorAll("[data-sheet-close]")),
    };
  }

  function setStatus(type, message) {
    if (!message) {
      els.statusBox.hidden = true;
      els.statusBox.textContent = "";
      els.statusBox.className = "tr-status-box";
      return;
    }

    els.statusBox.hidden = false;
    els.statusBox.className = `tr-status-box is-${type || "info"}`;
    els.statusBox.textContent = message;
  }

  function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `tr-toast tr-toast--${type}`;
    toast.textContent = message;
    els.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
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

  function statusClass(status) {
    if (["planned", "pending"].includes(status)) return "is-pending";
    if (status === "in_progress") return "is-progress";
    if (status === "confirmed") return "is-confirmed";
    if (status === "done") return "is-done";
    if (status === "canceled") return "is-canceled";
    return "is-unknown";
  }

  function canonicalStatus(value) {
    const s = norm(String(value || "")).replace(/\s+/g, "_");
    if (s === "in_progress" || s === "inprogress" || s === "en_cours") return "in_progress";
    if (s === "done" || s === "terminee" || s === "completed") return "done";
    if (s === "confirmed" || s === "confirmee") return "confirmed";
    if (s === "planned" || s === "planifiee") return "planned";
    if (s === "pending" || s === "en_attente") return "pending";
    if (s === "canceled" || s === "cancelled" || s === "annulee") return "canceled";
    return s || "unknown";
  }

  function resolveFlag(value, fallback) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const s = norm(value);
      if (["true", "1", "yes", "oui"].includes(s)) return true;
      if (["false", "0", "no", "non"].includes(s)) return false;
    }
    return Boolean(fallback);
  }

  function findExistingField(row, fields) {
    for (const field of fields) {
      if (hasField(row, field)) return field;
    }
    return "";
  }

  function hasField(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key);
  }

  function parseEuroInputToCents(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const normalized = raw.replace(/\s/g, "").replace(/€/g, "").replace(/,/g, ".");
    if (!/^[-+]?\d*(?:\.\d+)?$/.test(normalized)) return null;

    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function centsToEuroInput(cents) {
    const n = Number(cents || 0);
    return (n / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatCents(cents) {
    const n = Number(cents || 0);
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: CONFIG.CURRENCY }).format(n / 100);
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

  function normalizePhone(phone) {
    if (!phone) return "";
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("00")) p = `+${p.slice(2)}`;
    if (/^0\d{9}$/.test(p)) p = `+33${p.slice(1)}`;
    return p;
  }

  function shortState(value, maxLen) {
    const s = String(value || "").trim();
    if (!s) return "Non renseigne";
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}...`;
  }

  function isTableMissing(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return code === "PGRST205" || message.includes("could not find the table") || message.includes("does not exist");
  }

  function getFileExtension(filename) {
    const parts = String(filename || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function randomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value || "";
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyles() {
    if (document.getElementById("tr-run-styles-v2")) return;

    const style = document.createElement("style");
    style.id = "tr-run-styles-v2";
    style.textContent = `
      .tr-shell {
        font-family: "Manrope", sans-serif;
        color: #10233f;
        background:
          radial-gradient(920px 430px at 6% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
          radial-gradient(860px 470px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
          linear-gradient(180deg, #f4f8fc, #edf4fb);
        border: 1px solid #d6e2ee;
        border-radius: 18px;
        padding: 16px;
      }

      .tr-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 12px;
      }

      .tr-eyebrow {
        color: #55708c;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .08em;
        margin-bottom: 6px;
      }

      .tr-h1 {
        margin: 0;
        color: #143a61;
        font-size: 25px;
        line-height: 1.1;
        font-weight: 800;
      }

      .tr-card {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #fff;
        padding: 12px;
      }

      .tr-main-card {
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
      }

      .tr-main-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      .tr-ref {
        color: #0c4a6e;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 4px;
      }

      .tr-client { color: #143a61; font-size: 18px; font-weight: 800; }
      .tr-subject { color: #1e3a5f; font-size: 14px; margin-top: 4px; }

      .tr-meta {
        margin-top: 7px;
        color: #5b7490;
        font-size: 12px;
        display: grid;
        gap: 3px;
      }

      .tr-status {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
        align-self: flex-start;
      }

      .tr-status.is-pending { background: #eef2ff; color: #3730a3; }
      .tr-status.is-progress { background: #fff7d6; color: #92400e; }
      .tr-status.is-confirmed { background: #e0f2fe; color: #075985; }
      .tr-status.is-done { background: #dcfce7; color: #166534; }
      .tr-status.is-canceled { background: #fee2e2; color: #991b1b; }
      .tr-status.is-unknown { background: #e2e8f0; color: #1f2937; }

      .tr-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .tr-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        background: #fff;
        color: #123b60;
      }

      .tr-btn--primary {
        border-color: #0ea5e9;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        color: #fff;
      }

      .tr-btn--ghost {
        background: #f8fbff;
      }

      .tr-btn--xs {
        padding: 6px 9px;
        font-size: 11px;
      }

      .tr-btn.is-disabled {
        opacity: .45;
        pointer-events: none;
      }

      .tr-requirements {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tr-chip {
        border: 1px solid #c9dbe9;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
        color: #245279;
        background: #fff;
      }

      .tr-status-box {
        display: none;
        margin-top: 10px;
        border: 1px solid #dbeafe;
        background: #eff6ff;
        color: #1e3a8a;
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .tr-status-box.is-info,
      .tr-status-box.is-success,
      .tr-status-box.is-error {
        display: block;
      }

      .tr-status-box.is-success {
        border-color: #86efac;
        background: #f0fdf4;
        color: #166534;
      }

      .tr-status-box.is-error {
        border-color: #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tr-progress {
        margin-top: 12px;
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: linear-gradient(180deg, #fff, #f7fbff);
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        padding: 12px;
      }

      .tr-progress-top {
        margin-bottom: 8px;
      }

      .tr-progress-label {
        color: #4f6b86;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .tr-progress-bar-wrap {
        width: 100%;
        height: 7px;
        border-radius: 999px;
        background: #dbe7f3;
        overflow: hidden;
      }

      .tr-progress-bar {
        height: 100%;
        width: 0;
        border-radius: 999px;
        background: linear-gradient(90deg, #0ea5e9, #0f766e);
      }

      .tr-steps {
        display: grid;
        gap: 6px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .tr-step {
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        background: #fff;
        color: #2e5378;
        font-size: 11px;
        font-weight: 700;
        padding: 7px 8px;
        text-align: left;
        cursor: pointer;
      }

      .tr-step.is-done {
        border-color: #86efac;
        background: #f0fdf4;
        color: #166534;
      }

      .tr-step.is-active {
        border-color: #38bdf8;
        background: #f0f9ff;
        color: #075985;
      }

      .tr-content {
        margin-top: 12px;
      }

      .tr-section {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #fff;
        padding: 14px;
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        display: grid;
        gap: 10px;
      }

      .tr-title {
        margin: 0;
        color: #143a61;
        font-size: 18px;
        font-weight: 800;
      }

      .tr-hint {
        margin: 0;
        color: #5a7490;
        font-size: 13px;
      }

      .tr-label {
        color: #4f6b86;
        font-size: 12px;
        font-weight: 700;
      }

      .tr-value {
        color: #10233f;
        font-size: 14px;
        font-weight: 800;
        margin-top: 3px;
      }

      .tr-textarea,
      .tr-input,
      .tr-input-file {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 10px 11px;
        background: #fff;
        color: #10233f;
        outline: none;
      }

      .tr-textarea {
        min-height: 130px;
        resize: vertical;
      }

      .tr-textarea:focus,
      .tr-input:focus,
      .tr-input-file:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .tr-inline-note {
        color: #6d86a0;
        font-size: 12px;
      }

      .tr-photo-actions,
      .tr-products-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tr-previews {
        display: grid;
        gap: 8px;
      }

      .tr-preview {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fbfdff;
        padding: 8px;
        display: grid;
        grid-template-columns: 86px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
      }

      .tr-preview img {
        width: 86px;
        height: 64px;
        max-height: none;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid #d6e2ee;
        cursor: zoom-in;
      }

      .tr-preview-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        color: #5a7490;
        font-size: 11px;
        font-weight: 700;
        min-width: 0;
      }

      .tr-preview-meta span {
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tr-products {
        display: grid;
        gap: 8px;
      }

      .tr-product-row {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fbfdff;
        padding: 8px;
        display: grid;
        grid-template-columns: 1.15fr 1.2fr .55fr .7fr .75fr .95fr 1.1fr auto;
        gap: 6px;
        align-items: center;
      }

      .tr-input--small {
        text-align: right;
      }

      .tr-product-total {
        color: #143a61;
        font-size: 12px;
        font-weight: 800;
        text-align: right;
      }

      .tr-check-inline {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #294f74;
        font-weight: 700;
      }

      .tr-products-summary {
        color: #294f74;
        font-size: 12px;
        font-weight: 700;
        display: grid;
        gap: 4px;
      }

      .tr-signature-wrap {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fbfdff;
        padding: 10px;
      }

      .tr-signature-canvas {
        width: 100%;
        height: 180px;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        background: #fff;
      }

      .tr-signature-actions {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .tr-checklist {
        display: grid;
        gap: 8px;
      }

      .tr-check-item {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        color: #294f74;
        font-size: 13px;
        font-weight: 700;
      }

      .tr-summary {
        display: grid;
        gap: 6px;
      }

      .tr-summary-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
      }

      .tr-warning {
        border-style: dashed;
        border-color: #f59e0b;
        background: #fffbeb;
        color: #92400e;
        font-size: 12px;
        font-weight: 700;
      }

      .tr-empty-small {
        border: 1px dashed #d6e2ee;
        border-radius: 10px;
        background: #fbfdff;
        color: #6d86a0;
        font-size: 12px;
        font-weight: 700;
        padding: 10px;
      }

      .tr-footer {
        margin-top: 12px;
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        padding: 12px;
      }

      .tr-footer-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: #4f6b86;
        font-size: 12px;
        font-weight: 700;
      }

      .tr-footer-actions {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .tr-toasts {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 100001;
        display: grid;
        gap: 8px;
      }

      .tr-toast {
        border-radius: 10px;
        padding: 10px 12px;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 12px 30px rgba(12, 37, 66, 0.30);
      }

      .tr-toast--success { background: #16a34a; }
      .tr-toast--warning { background: #d97706; }
      .tr-toast--error { background: #dc2626; }

      .tr-sheet {
        position: fixed;
        inset: 0;
        z-index: 100005;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .tr-sheet[hidden] { display: none; }

      .tr-sheet-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 31, 53, 0.42);
      }

      .tr-sheet-panel {
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

      .tr-sheet-title {
        color: #143a61;
        font-size: 14px;
        font-weight: 800;
      }

      .tr-sheet-btn {
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

      .tr-sheet-cancel {
        background: #0f172a;
        border-color: #0f172a;
        color: #fff;
        text-align: center;
      }

      body.tr-sheet-open { overflow: hidden; }

      @media (max-width: 1080px) {
        .tr-steps {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .tr-product-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .tr-product-total,
        .tr-check-inline,
        .tr-product-row .tr-btn {
          grid-column: 1 / -1;
          justify-self: start;
          text-align: left;
        }
      }

      @media (max-width: 760px) {
        .tr-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .tr-main-top {
          flex-direction: column;
        }

        .tr-steps {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .tr-footer-actions {
          justify-content: stretch;
        }

        .tr-footer-actions .tr-btn {
          flex: 1 1 auto;
        }

        .tr-preview {
          grid-template-columns: 74px minmax(0, 1fr);
          align-items: start;
        }

        .tr-preview img {
          width: 74px;
          height: 56px;
        }

        .tr-preview .tr-btn {
          grid-column: 1 / -1;
          justify-self: end;
        }
      }
    `;

    document.head.appendChild(style);
  }
})();
