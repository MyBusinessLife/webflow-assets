document.documentElement.setAttribute("data-page", "devis");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const root = findRoot();
  if (!root) {
    console.error("[DEVIS] Root introuvable.");
    return;
  }

  const GLOBAL_CFG = window.__MBL_CFG__ || {};

  const CONFIG = {
    SUPABASE_URL: GLOBAL_CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      GLOBAL_CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    BUCKET: GLOBAL_CFG.BUCKET || root.dataset.bucket || "interventions-files",
    QUOTES_TABLE: root.dataset.quotesTable || "devis",
    PRODUCTS_TABLE: root.dataset.productsTable || GLOBAL_CFG.PRODUCTS_TABLE || "products",
    CLIENTS_TABLE: root.dataset.clientsTable || "clients",
    INTERVENTIONS_TABLE: root.dataset.interventionsTable || "interventions",
    ORGANIZATION_ID:
      root.dataset.organizationId ||
      GLOBAL_CFG.ORGANIZATION_ID ||
      window.__MBL_ORG_ID__ ||
      "",
    VAT_RATE: Number(root.dataset.vatRate || GLOBAL_CFG.VAT_RATE || 20),
    VALIDITY_DAYS: Number(root.dataset.validityDays || 30),
    CURRENCY: root.dataset.currency || "EUR",
    PDF_TTL: Number(root.dataset.pdfTtl || 3600),
  };

  function resolveSupabaseClient() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (window.__adminSupabase) return window.__adminSupabase;
    if (window.__techSupabase) return window.__techSupabase;
    if (!window.supabase?.createClient) return null;

    const client = window.supabase.createClient(CONFIG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co", CONFIG.SUPABASE_ANON_KEY || "", {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth",
      },
    });

    window.__adminSupabase = client;
    return client;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  const COMPANY = {
    name: root.dataset.companyName || GLOBAL_CFG.COMPANY_NAME || "My Business Life",
    address: root.dataset.companyAddress || GLOBAL_CFG.COMPANY_ADDRESS || "",
    email: root.dataset.companyEmail || GLOBAL_CFG.COMPANY_EMAIL || "",
    phone: root.dataset.companyPhone || GLOBAL_CFG.COMPANY_PHONE || "",
    siret: root.dataset.companySiret || GLOBAL_CFG.COMPANY_SIRET || "",
    tva: root.dataset.companyTva || GLOBAL_CFG.COMPANY_TVA || "",
  };

  const STR = {
    title: "Devis",
    subtitle: "Creation rapide et export PDF",
    btnAddItem: "Ajouter une ligne",
    btnSave: "Enregistrer",
    btnValidate: "Valider devis",
    btnDownload: "Telecharger PDF",
    btnPreview: "Apercu",
    btnReset: "Reinitialiser",
    labelClient: "Client",
    labelContact: "Contact",
    labelEmail: "Email",
    labelPhone: "Telephone",
    labelAddress: "Adresse",
    labelRef: "Reference devis",
    labelIntervention: "Intervention",
    labelValidity: "Validite",
    labelNotes: "Notes",
    labelTerms: "Conditions",
    labelItems: "Lignes",
    labelSubtotal: "Sous-total",
    labelDiscount: "Remise",
    labelVat: "TVA",
    labelTotal: "Total",
    msgLoading: "Chargement...",
    msgSaved: "Devis enregistre.",
    msgSavedPartial: "Devis genere mais non enregistre (table manquante).",
    msgSavedDenied: "Droits insuffisants pour enregistrer ce devis (RLS).",
    msgOrgMissing: "Organisation introuvable pour ton compte. Ajoute data-organization-id ou verifie organization_members.",
    msgSavedWithPdf: "Devis enregistre et PDF disponible.",
    msgSavedNoPdf: "Devis enregistre, mais impossible de publier le PDF.",
    msgPdfOnly: "PDF genere localement (devis non enregistre en base).",
    msgStorageDenied: "PDF genere, mais upload bloque par les droits du bucket.",
    msgValidated: "Devis valide avec succes.",
    msgPdfReady: "PDF genere.",
    msgPdfFail: "Impossible de generer le PDF.",
  };
  const VAT_OPTIONS = [0, 5.5, 10, 20];
  const STATUS_DRAFT = "draft";
  const STATUS_VALIDATED = "sent";

  injectStyles();

  const els = renderShell(root, STR);
  wireActions();
  const state = {
    currentUserId: "",
    organizationId: String(CONFIG.ORGANIZATION_ID || "").trim(),
    items: [],
    clients: [],
    interventions: [],
    products: [],
    productByName: new Map(),
    quoteId: null,
    statusField: "",
    nextReference: "",
    pdf: { url: "", path: "" },
    draft: defaultDraft(),
  };

  await boot();

  async function boot() {
    setStatus(STR.msgLoading);
    await resolveAuthContext();
    await Promise.all([loadClients(), loadInterventions(), loadProducts()]);
    state.statusField = await detectStatusField();
    state.nextReference = await loadNextReference();
    hydrateDraft();
    applyAutoPrefillFromContext();
    ensureReference();
    renderItems();
    updateTotals();
    updatePreview();
    persistDraft();
    setStatus(state.organizationId ? "" : STR.msgOrgMissing);
  }

  async function resolveAuthContext() {
    state.organizationId = asUuid(state.organizationId);
    const auth = await supabase.auth.getUser();
    const uid = auth?.data?.user?.id || "";
    state.currentUserId = uid;

    if (state.organizationId) return;
    if (!uid) return;

    // First try membership table, then profile fallback.
    let membership = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", uid)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (membership.error && isMissingColumnError(membership.error)) {
      membership = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
    }

    if (!membership.error && membership.data?.organization_id) {
      state.organizationId = asUuid(membership.data.organization_id);
      return;
    }

    const profile = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", uid)
      .maybeSingle();

    if (!profile.error && profile.data?.organization_id) {
      state.organizationId = asUuid(profile.data.organization_id);
    }
  }

  async function detectStatusField() {
    const tests = ["status", "quote_status", "state"];
    for (const field of tests) {
      const res = await supabase.from(CONFIG.QUOTES_TABLE).select(`id,${field}`).limit(1);
      if (!res.error) return field;
      if (!isMissingColumnError(res.error)) break;
    }
    return "";
  }

  async function loadNextReference() {
    const currentYear = new Date().getFullYear();
    const basePrefix = `DV-${currentYear}-`;
    const fallback = `${basePrefix}0001`;

    let query = supabase
      .from(CONFIG.QUOTES_TABLE)
      .select("reference,created_at")
      .limit(500);

    if (state.organizationId) query = query.eq("organization_id", state.organizationId);

    let res = await query;
    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from(CONFIG.QUOTES_TABLE)
        .select("reference,created_at")
        .limit(500);
    }
    if (res.error) return fallback;

    let max = 0;
    (res.data || []).forEach((row) => {
      const ref = String(row?.reference || "").trim();
      const m = ref.match(new RegExp(`^DV-${currentYear}-(\\\\d{1,})$`));
      if (m) {
        max = Math.max(max, Number(m[1] || 0));
      }
    });

    if (max <= 0) {
      (res.data || []).forEach((row) => {
        const ref = String(row?.reference || "").trim();
        const m = ref.match(/(\d+)(?!.*\d)/);
        if (m) max = Math.max(max, Number(m[1] || 0));
      });
    }

    const next = String(max + 1).padStart(4, "0");
    return `${basePrefix}${next}`;
  }

  function ensureReference() {
    if (String(state.draft.reference || "").trim()) return;
    state.draft.reference = state.nextReference || `DV-${new Date().getFullYear()}-0001`;
    els.ref.value = state.draft.reference;
  }

  function applyAutoPrefillFromContext() {
    const params = new URLSearchParams(window.location.search || "");
    const interventionId = params.get("intervention_id") || params.get("interventionId") || "";
    const clientId = params.get("client_id") || params.get("clientId") || "";

    if (interventionId) {
      const foundIntervention = state.interventions.find((i) => String(i.id) === String(interventionId));
      if (foundIntervention) {
        els.intervention.value = String(foundIntervention.id);
        onInterventionSelect();
        return;
      }
    }

    if (clientId) {
      const foundClient = state.clients.find((c) => String(c.id) === String(clientId));
      if (foundClient) {
        els.clientSelect.value = String(foundClient.id);
        onClientSelect();
        return;
      }
    }

    const noClientInfo = !state.draft.client_name && !state.draft.client_email && !state.draft.client_phone;
    if (noClientInfo && state.interventions.length === 1) {
      els.intervention.value = String(state.interventions[0].id);
      onInterventionSelect();
    }
  }

  async function loadClients() {
    const res = await readTable(CONFIG.CLIENTS_TABLE, "*", { limit: 300 });
    if (res.error) return;
    state.clients = res.data || [];
    renderClientOptions();
  }

  async function loadInterventions() {
    const res = await readTable(
      CONFIG.INTERVENTIONS_TABLE,
      "id,title,client_name,client_ref,client_email,client_phone,address,start_at,organization_id",
      { order: "start_at", desc: true, limit: 200 }
    );
    if (res.error) return;
    state.interventions = res.data || [];
    renderInterventionOptions();
  }

  async function loadProducts() {
    const res = await readTable(CONFIG.PRODUCTS_TABLE, "*", { limit: 500 });
    if (res.error) return;
    state.products = (res.data || [])
      .map((p) => ({
        id: p.id,
        name: p.name || p.title || p.label,
        price: Number(p.price ?? p.unit_price ?? p.cost ?? 0),
        vat: Number(p.vat_rate ?? CONFIG.VAT_RATE),
      }))
      .filter((p) => p.name);
    state.productByName = new Map(state.products.map((p) => [normalize(p.name), p]));
    renderProductDatalist();
  }

  function hydrateDraft() {
    const d = state.draft;
    if (!d.items || !d.items.length) {
      d.items = [createItem()];
    }
    d.items = d.items.map((it) => ({
      ...it,
      qty: Math.max(1, Number(it.qty || 1)),
      unit_cents: Math.max(0, Number(it.unit_cents || 0)),
      vat_rate: sanitizeVatRate(it.vat_rate),
    }));
    els.client.value = d.client_name || "";
    els.contact.value = d.contact_name || "";
    els.email.value = d.client_email || "";
    els.phone.value = d.client_phone || "";
    els.address.value = d.client_address || "";
    els.ref.value = d.reference || "";
    els.validity.value = d.valid_until || defaultValidityDate();
    els.notes.value = d.notes || "";
    els.terms.value = d.terms || "";
    els.discountType.value = d.discount_type || "none";
    els.discountValue.value = d.discount_value || "";
    d.vat_rate = sanitizeVatRate(d.vat_rate ?? CONFIG.VAT_RATE);
    els.vatRate.value = d.vat_rate;
  }

  function renderItems() {
    els.items.innerHTML = "";
    state.draft.items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "dv-row";
      row.dataset.index = String(idx);
      row.innerHTML = `
        <input class="dv-input" list="dv-products" data-field="name" placeholder="Produit / Service" value="${escapeHTML(item.name)}" />
        <input class="dv-input dv-input--xs" data-field="qty" type="number" min="1" step="1" inputmode="numeric" value="${item.qty}" />
        <input class="dv-input dv-input--xs" data-field="price" type="number" min="0" step="0.01" inputmode="decimal" value="${centsToInput(item.unit_cents)}" />
        <select class="dv-input dv-input--xs" data-field="vat">${renderVatOptions(item.vat_rate)}</select>
        <div class="dv-line-total">${formatMoney(calcLineTotal(item), CONFIG.CURRENCY)}</div>
        <button type="button" class="dv-btn dv-btn--ghost dv-btn--xs" data-action="remove">Supprimer</button>
      `;
      row.addEventListener("input", onItemInput);
      row.addEventListener("change", onItemInput);
      row.querySelector("[data-action='remove']").addEventListener("click", () => removeItem(idx));
      els.items.appendChild(row);
    });
  }

  function onItemInput(e) {
    const row = e.target.closest(".dv-row");
    if (!row) return;
    const idx = Number(row.dataset.index);
    const item = state.draft.items[idx];
    if (!item) return;

    const field = e.target.dataset.field;
    if (field === "name") {
      item.name = e.target.value;
      const hit = state.productByName.get(normalize(item.name));
      if (hit) {
        item.unit_cents = eurosToCents(hit.price);
        item.vat_rate = sanitizeVatRate(Number.isFinite(hit.vat) ? hit.vat : CONFIG.VAT_RATE);
        row.querySelector('[data-field="price"]').value = centsToInput(item.unit_cents);
        row.querySelector('[data-field="vat"]').value = item.vat_rate;
      }
    } else if (field === "qty") {
      item.qty = Math.max(1, Number(e.target.value || 1));
    } else if (field === "price") {
      item.unit_cents = eurosToCents(Number(e.target.value || 0));
    } else if (field === "vat") {
      item.vat_rate = sanitizeVatRate(e.target.value);
    }

    row.querySelector(".dv-line-total").textContent = formatMoney(calcLineTotal(item), CONFIG.CURRENCY);
    updateTotals();
    persistDraft();
    updatePreview();
  }

  function removeItem(idx) {
    state.draft.items.splice(idx, 1);
    if (!state.draft.items.length) state.draft.items.push(createItem());
    renderItems();
    updateTotals();
    persistDraft();
    updatePreview();
  }

  function updateTotals() {
    const subtotal = state.draft.items.reduce((acc, item) => acc + calcLineTotal(item), 0);
    const discount = calcDiscount(subtotal);
    const vat = calcVatCents(state.draft.items, subtotal, discount, state.draft.vat_rate);
    const taxable = Math.max(0, subtotal - discount);
    const total = taxable + vat;

    state.draft.subtotal_cents = subtotal;
    state.draft.discount_cents = discount;
    state.draft.vat_cents = vat;
    state.draft.total_cents = total;

    els.subtotal.textContent = formatMoney(subtotal, CONFIG.CURRENCY);
    els.discount.textContent = formatMoney(discount, CONFIG.CURRENCY);
    els.vat.textContent = formatMoney(vat, CONFIG.CURRENCY);
    els.total.textContent = formatMoney(total, CONFIG.CURRENCY);
  }

  function updatePreview() {
    const itemsHtml = (state.draft.items || [])
      .map((item) => {
        const lineTotal = calcLineTotal(item);
        return `
          <tr>
            <td class="dv-col-label">${escapeHTML(item.name || "—")}</td>
            <td class="dv-col-num">${item.qty}</td>
            <td class="dv-col-num">${formatMoney(item.unit_cents, CONFIG.CURRENCY)}</td>
            <td class="dv-col-num">${item.vat_rate}%</td>
            <td class="dv-col-num">${formatMoney(lineTotal, CONFIG.CURRENCY)}</td>
          </tr>
        `;
      })
      .join("");

    const safeItemsHtml = itemsHtml || `<tr><td colspan="5" class="dv-preview-empty">Aucune ligne.</td></tr>`;
    const clientName = escapeHTML(state.draft.client_name || "Client");
    const contactName = escapeHTML(state.draft.contact_name || "");
    const clientAddress = escapeHTML(state.draft.client_address || "");
    const clientEmail = escapeHTML(state.draft.client_email || "");
    const clientPhone = escapeHTML(state.draft.client_phone || "");
    const ref = escapeHTML(state.draft.reference || "—");
    const validity = escapeHTML(formatDateFR(state.draft.valid_until) || "—");
    const notes = escapeHTML(state.draft.notes || "");
    const terms = escapeHTML(state.draft.terms || "");
    const generatedAt = new Date();
    const generatedAtFR = escapeHTML(formatDateTimeFR(generatedAt));
    const generatedIso = escapeHTML(generatedAt.toISOString());
    const electronicId = escapeHTML(buildElectronicDocumentId());

    els.preview.innerHTML = `
      <article class="dv-paper">
        <div class="dv-edoc-banner">
          <span>Format electronique</span>
          <strong>Document numerique clair et structure pour la transition 2026</strong>
        </div>

        <header class="dv-paper-top">
          <div class="dv-company">
            <div class="dv-preview-title">${escapeHTML(COMPANY.name)}</div>
            <div class="dv-preview-sub">${escapeHTML(COMPANY.address)}</div>
            <div class="dv-preview-sub">${escapeHTML(COMPANY.email)} ${COMPANY.phone ? `• ${escapeHTML(COMPANY.phone)}` : ""}</div>
            ${COMPANY.siret ? `<div class="dv-preview-sub">SIRET: ${escapeHTML(COMPANY.siret)}</div>` : ""}
            ${COMPANY.tva ? `<div class="dv-preview-sub">TVA: ${escapeHTML(COMPANY.tva)}</div>` : ""}
          </div>
          <div class="dv-doc">
            <div class="dv-doc-pill">DEVIS</div>
            <div class="dv-doc-row"><span>Reference</span><strong>${ref}</strong></div>
            <div class="dv-doc-row"><span>Date</span><strong>${escapeHTML(todayFR())}</strong></div>
            <div class="dv-doc-row"><span>Validite</span><strong>${validity}</strong></div>
          </div>
        </header>

        <section class="dv-edoc-meta">
          <div class="dv-edoc-item"><span>ID document</span><strong>${electronicId}</strong></div>
          <div class="dv-edoc-item"><span>Emission</span><strong>Electronique</strong></div>
          <div class="dv-edoc-item"><span>Horodatage</span><strong>${generatedAtFR}</strong></div>
          <div class="dv-edoc-item"><span>Timestamp ISO</span><strong>${generatedIso}</strong></div>
        </section>

        <section class="dv-paper-meta">
          <div class="dv-meta-card">
            <div class="dv-meta-title">Client</div>
            <div class="dv-meta-line"><strong>${clientName}</strong></div>
            ${contactName ? `<div class="dv-meta-line">${contactName}</div>` : ""}
            ${clientAddress ? `<div class="dv-meta-line">${clientAddress}</div>` : ""}
            ${clientEmail ? `<div class="dv-meta-line">${clientEmail}</div>` : ""}
            ${clientPhone ? `<div class="dv-meta-line">${clientPhone}</div>` : ""}
          </div>
          <div class="dv-meta-card">
            <div class="dv-meta-title">Recapitulatif</div>
            <div class="dv-doc-row"><span>Sous-total</span><strong>${formatMoney(state.draft.subtotal_cents, CONFIG.CURRENCY)}</strong></div>
            <div class="dv-doc-row"><span>Remise</span><strong>${formatMoney(state.draft.discount_cents, CONFIG.CURRENCY)}</strong></div>
            <div class="dv-doc-row"><span>TVA</span><strong>${formatMoney(state.draft.vat_cents, CONFIG.CURRENCY)}</strong></div>
            <div class="dv-doc-row dv-doc-row--total"><span>Total TTC</span><strong>${formatMoney(state.draft.total_cents, CONFIG.CURRENCY)}</strong></div>
          </div>
        </section>

        <section class="dv-paper-lines">
          <table class="dv-preview-table">
            <thead>
              <tr>
                <th>Libelle</th>
                <th class="dv-col-num">Qt</th>
                <th class="dv-col-num">PU</th>
                <th class="dv-col-num">TVA</th>
                <th class="dv-col-num">Total</th>
              </tr>
            </thead>
            <tbody>${safeItemsHtml}</tbody>
          </table>
        </section>

        <section class="dv-paper-notes">
          ${notes ? `
            <div class="dv-note-block">
              <div class="dv-note-title">Notes</div>
              <div class="dv-note-text">${notes}</div>
            </div>
          ` : ""}
          ${terms ? `
            <div class="dv-note-block">
              <div class="dv-note-title">Conditions</div>
              <div class="dv-note-text">${terms}</div>
            </div>
          ` : ""}
        </section>
      </article>
    `;
  }

  async function generatePdfBlob() {
    await ensurePdfLibs();
    const target = els.preview.querySelector(".dv-paper") || els.preview;
    const canvas = await window.html2canvas(target, {
      scale: 2.2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: target.scrollWidth,
      scrollX: 0,
      scrollY: -window.scrollY,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new window.jspdf.jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * printableWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, printableWidth, imgHeight);
    heightLeft -= printableHeight;

    while (heightLeft > 0) {
      position -= printableHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, printableWidth, imgHeight);
      heightLeft -= printableHeight;
    }

    return pdf.output("blob");
  }

  async function downloadPdf() {
    try {
      const blob = await generatePdfBlob();
      await triggerDownloadFromBlob(blob);
      showToast("success", STR.msgPdfReady);
    } catch (e) {
      console.error(e);
      showToast("error", STR.msgPdfFail);
    }
  }

  async function triggerDownloadFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.draft.reference || "devis")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveQuote(mode = STATUS_DRAFT) {
    if (!state.organizationId) {
      return { ok: false, denied: true, reason: "org_missing" };
    }

    const payload = {
      organization_id: state.organizationId,
      reference: state.draft.reference || null,
      client_name: state.draft.client_name || null,
      client_email: state.draft.client_email || null,
      client_phone: state.draft.client_phone || null,
      client_address: state.draft.client_address || null,
      validity_until: state.draft.valid_until || null,
      notes: state.draft.notes || null,
      terms: state.draft.terms || null,
      items: state.draft.items,
      subtotal_cents: state.draft.subtotal_cents || 0,
      discount_cents: state.draft.discount_cents || 0,
      vat_cents: state.draft.vat_cents || 0,
      total_cents: state.draft.total_cents || 0,
      currency: CONFIG.CURRENCY,
      created_by: state.currentUserId || null,
      created_at: new Date().toISOString()
    };

    if (!CONFIG.QUOTES_TABLE) {
      return { ok: false, reason: "missing_table_name" };
    }

    const statusValues = mode === STATUS_VALIDATED
      ? [STATUS_VALIDATED, "accepted", "validated", "confirmed"]
      : [STATUS_DRAFT, "pending"];
    const payloadVariants = [];

    if (state.statusField) {
      statusValues.forEach((v) => payloadVariants.push({ ...payload, [state.statusField]: v }));
    } else {
      statusValues.forEach((v) => {
        payloadVariants.push({ ...payload, status: v });
        payloadVariants.push({ ...payload, quote_status: v });
        payloadVariants.push({ ...payload, state: v });
      });
    }
    payloadVariants.push(payload);

    let lastError = null;
    const seen = new Set();
    for (const candidate of payloadVariants) {
      const uniqueKey = Object.keys(candidate).sort().join("|");
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      const res = await upsertQuoteRow(candidate);
      if (!res.error) {
        state.quoteId = res.data?.id || state.quoteId || null;
        if (candidate.status !== undefined) state.statusField = "status";
        if (candidate.quote_status !== undefined) state.statusField = "quote_status";
        if (candidate.state !== undefined) state.statusField = "state";
        state.draft.quote_status = String(
          candidate.status ?? candidate.quote_status ?? candidate.state ?? mode
        );
        return { ok: true, mode: state.draft.quote_status };
      }
      lastError = res.error;
      if (isPermissionDenied(res.error)) {
        return { ok: false, denied: true, reason: "rls" };
      }
      if (isConstraintViolation(res.error)) {
        continue;
      }
      if (isMissingColumnError(res.error)) {
        continue;
      }
      if (isTableMissing(res.error)) {
        return { ok: false, reason: "missing_table" };
      }
      break;
    }

    if (lastError) throw lastError;
    return { ok: false };
  }

  async function upsertQuoteRow(payload) {
    if (state.quoteId) {
      const updatePayload = { ...payload, updated_at: new Date().toISOString() };
      delete updatePayload.created_at;
      delete updatePayload.created_by;
      const upd = await supabase
        .from(CONFIG.QUOTES_TABLE)
        .update(updatePayload)
        .eq("id", state.quoteId)
        .select("id")
        .maybeSingle();
      return upd;
    }
    return supabase.from(CONFIG.QUOTES_TABLE).insert(payload).select("id").maybeSingle();
  }

  async function updateQuotePdfReference(uploaded) {
    if (!state.quoteId || !uploaded?.url) return;
    const variants = [
      { pdf_path: uploaded.path, pdf_url: uploaded.url, updated_at: new Date().toISOString() },
      { pdf_path: uploaded.path, pdf_url: uploaded.url },
    ];

    for (const payload of variants) {
      const res = await supabase.from(CONFIG.QUOTES_TABLE).update(payload).eq("id", state.quoteId);
      if (!res.error) return;
      if (!isMissingColumnError(res.error)) return;
    }
  }

  async function uploadPdfToStorage(blob) {
    const quotePart = state.quoteId || randomId();
    const fileName = `${Date.now()}_${randomId()}.pdf`;
    const orgPart = asUuid(state.organizationId);
    const candidates = orgPart
      ? [`devis/${orgPart}/${quotePart}/${fileName}`]
      : [`devis/${quotePart}/${fileName}`];

    let denied = false;
    for (const path of candidates) {
      const up = await supabase.storage.from(CONFIG.BUCKET).upload(path, blob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      });
      if (!up.error) {
        const { data } = supabase.storage.from(CONFIG.BUCKET).getPublicUrl(path);
        return { path, url: data?.publicUrl || "" };
      }
      if (isPermissionDenied(up.error)) denied = true;
    }

    if (denied) return { denied: true };
    return null;
  }

  function wireActions() {
    els.btnAddItem.addEventListener("click", () => {
      state.draft.items.push(createItem());
      renderItems();
      updateTotals();
      persistDraft();
      updatePreview();
    });

    els.btnReset.addEventListener("click", () => {
      state.draft = defaultDraft();
      hydrateDraft();
      ensureReference();
      renderItems();
      updateTotals();
      updatePreview();
      persistDraft();
    });

    els.btnDownload.addEventListener("click", downloadPdf);

    async function runSaveFlow(mode, button, busyLabel) {
      const oldSaveLabel = els.btnSave.textContent;
      const oldValidateLabel = els.btnValidate.textContent;
      els.btnSave.disabled = true;
      els.btnValidate.disabled = true;
      if (button) button.textContent = busyLabel;
      try {
        const saved = await saveQuote(mode);
        const blob = await generatePdfBlob();
        const uploaded = await uploadPdfToStorage(blob);

        if (uploaded?.url) {
          state.pdf = uploaded;
          els.previewLink.href = uploaded.url;
          els.previewLink.hidden = false;
          await updateQuotePdfReference(uploaded);
        }

        if (saved?.ok && uploaded?.url && mode === STATUS_VALIDATED) {
          showToast("success", STR.msgValidated);
        } else if (saved?.ok && uploaded?.url) {
          showToast("success", STR.msgSavedWithPdf);
        } else if (saved?.ok && uploaded?.denied) {
          showToast("warning", STR.msgStorageDenied);
        } else if (saved?.ok && !uploaded?.url) {
          showToast("warning", STR.msgSavedNoPdf);
        } else if (saved?.denied || !saved?.ok) {
          if (saved?.reason === "rls" || saved?.denied) {
            showToast("warning", STR.msgSavedDenied);
          } else if (saved?.reason === "missing_table" || saved?.reason === "missing_table_name") {
            showToast("warning", STR.msgSavedPartial);
          } else {
            showToast("warning", STR.msgOrgMissing);
          }
          await triggerDownloadFromBlob(blob);
          showToast("success", STR.msgPdfOnly);
        }

        if (saved?.ok) {
          state.nextReference = bumpReference(state.draft.reference) || (await loadNextReference());
        }
      } catch (e) {
        console.error(e);
        if (isPermissionDenied(e)) {
          showToast("warning", STR.msgStorageDenied);
          return;
        }
        showToast("error", STR.msgPdfFail);
      } finally {
        els.btnSave.disabled = false;
        els.btnValidate.disabled = false;
        els.btnSave.textContent = oldSaveLabel;
        els.btnValidate.textContent = oldValidateLabel;
      }
    }

    els.btnSave.addEventListener("click", () => runSaveFlow(STATUS_DRAFT, els.btnSave, "Enregistrement..."));
    els.btnValidate.addEventListener("click", () => runSaveFlow(STATUS_VALIDATED, els.btnValidate, "Validation..."));

    els.client.addEventListener("input", onHeaderInput);
    els.contact.addEventListener("input", onHeaderInput);
    els.email.addEventListener("input", onHeaderInput);
    els.phone.addEventListener("input", onHeaderInput);
    els.address.addEventListener("input", onHeaderInput);
    els.ref.addEventListener("input", onHeaderInput);
    els.validity.addEventListener("input", onHeaderInput);
    els.notes.addEventListener("input", onHeaderInput);
    els.terms.addEventListener("input", onHeaderInput);
    els.discountType.addEventListener("change", onHeaderInput);
    els.discountValue.addEventListener("input", onHeaderInput);
    els.vatRate.addEventListener("change", () => {
      state.draft.vat_rate = sanitizeVatRate(els.vatRate.value);
      applyVatToAllItems(state.draft.vat_rate);
      renderItems();
      onHeaderInput();
    });

    els.intervention.addEventListener("change", onInterventionSelect);
    els.clientSelect.addEventListener("change", onClientSelect);
  }

  function onHeaderInput() {
    state.draft.client_name = els.client.value;
    state.draft.contact_name = els.contact.value;
    state.draft.client_email = els.email.value;
    state.draft.client_phone = els.phone.value;
    state.draft.client_address = els.address.value;
    state.draft.reference = els.ref.value;
    state.draft.valid_until = els.validity.value;
    state.draft.notes = els.notes.value;
    state.draft.terms = els.terms.value;
    state.draft.discount_type = els.discountType.value;
    state.draft.discount_value = Number(els.discountValue.value || 0);
    state.draft.vat_rate = sanitizeVatRate(els.vatRate.value || CONFIG.VAT_RATE);
    els.vatRate.value = state.draft.vat_rate;
    updateTotals();
    updatePreview();
    persistDraft();
  }

  function onInterventionSelect() {
    const id = els.intervention.value;
    if (!id) return;
    const found = state.interventions.find((it) => String(it.id) === String(id));
    if (!found) return;
    els.client.value = found.client_name || "";
    els.address.value = found.address || "";
    els.ref.value = found.client_ref || "";
    els.email.value = found.client_email || "";
    els.phone.value = found.client_phone || "";
    onHeaderInput();
  }

  function onClientSelect() {
    const id = els.clientSelect.value;
    if (!id) return;
    const found = state.clients.find((c) => String(c.id) === String(id));
    if (!found) return;
    els.client.value = found.name || "";
    els.email.value = found.email || "";
    els.phone.value = found.phone || "";
    els.address.value = found.address || found.billing_address || "";
    onHeaderInput();
  }

  function renderClientOptions() {
    els.clientSelect.innerHTML = `<option value="">Selectionner</option>` + state.clients
      .map((c) => `<option value="${c.id}">${escapeHTML(c.name || c.external_ref || "Client")}</option>`)
      .join("");
  }

  function renderInterventionOptions() {
    els.intervention.innerHTML = `<option value="">Selectionner</option>` + state.interventions
      .map((i) => {
        const label = `${i.title || "Intervention"} • ${formatDateFR(i.start_at) || "—"}`;
        return `<option value="${i.id}">${escapeHTML(label)}</option>`;
      })
      .join("");
  }

  function renderProductDatalist() {
    els.productList.innerHTML = state.products
      .map((p) => `<option value="${escapeHTML(p.name)}"></option>`)
      .join("");
  }

  function renderVatOptions(currentValue) {
    const current = sanitizeVatRate(currentValue);
    return VAT_OPTIONS.map((v) => {
      const selected = Number(v) === Number(current) ? "selected" : "";
      const label = String(v).replace(".", ",");
      return `<option value="${v}" ${selected}>${label}%</option>`;
    }).join("");
  }

  function applyVatToAllItems(rate) {
    const safeRate = sanitizeVatRate(rate);
    state.draft.items = (state.draft.items || []).map((item) => ({
      ...item,
      vat_rate: safeRate,
    }));
  }

  function calcLineTotal(item) {
    const qty = Math.max(1, Number(item.qty || 1));
    return Math.round(qty * (item.unit_cents || 0));
  }

  function calcDiscount(subtotal) {
    const type = state.draft.discount_type || "none";
    const val = Number(state.draft.discount_value || 0);
    if (type === "percent") return Math.round(subtotal * (val / 100));
    if (type === "amount") return Math.round(val * 100);
    return 0;
  }

  function calcVatCents(items, subtotal, discount, fallbackRate) {
    const safeSubtotal = Math.max(0, Number(subtotal || 0));
    if (safeSubtotal === 0) return 0;

    const rawVat = (items || []).reduce((acc, item) => {
      const rate = sanitizeVatRate(item?.vat_rate ?? fallbackRate);
      return acc + Math.round(calcLineTotal(item) * (rate / 100));
    }, 0);

    const taxable = Math.max(0, safeSubtotal - Math.max(0, Number(discount || 0)));
    const ratio = taxable / safeSubtotal;
    return Math.round(rawVat * ratio);
  }

  function createItem() {
    return {
      name: "",
      qty: 1,
      unit_cents: 0,
      vat_rate: sanitizeVatRate(CONFIG.VAT_RATE),
    };
  }

  function defaultDraft() {
    return {
      client_name: "",
      contact_name: "",
      client_email: "",
      client_phone: "",
      client_address: "",
      reference: "",
      valid_until: defaultValidityDate(),
      notes: "",
      terms: "",
      items: [createItem()],
      discount_type: "none",
      discount_value: 0,
      vat_rate: sanitizeVatRate(CONFIG.VAT_RATE),
      quote_status: STATUS_DRAFT,
    };
  }

  function persistDraft() {
    // Intentionally no cross-page persistence:
    // each new quote page starts clean except business context prefill.
  }

  function loadDraft() {
    return defaultDraft();
  }

  function todayFR() {
    return new Date().toLocaleDateString("fr-FR");
  }

  function defaultValidityDate() {
    const d = new Date();
    d.setDate(d.getDate() + CONFIG.VALIDITY_DAYS);
    return d.toISOString().slice(0, 10);
  }

  async function ensurePdfLibs() {
    if (window.jspdf?.jsPDF && window.html2canvas) return;
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function readTable(table, select, opts = {}) {
    let query = supabase.from(table).select(select);
    if (state.organizationId) query = query.eq("organization_id", state.organizationId);
    if (opts.order) query = query.order(opts.order, { ascending: !opts.desc });
    if (opts.limit) query = query.limit(opts.limit);
    let res = await query;
    if (res.error && (isMissingColumnError(res.error) || isOrderParseError(res.error))) {
      let q2 = supabase.from(table).select(select);
      if (opts.order && !isOrderParseError(res.error)) q2 = q2.order(opts.order, { ascending: !opts.desc });
      if (opts.limit) q2 = q2.limit(opts.limit);
      res = await q2;
    }
    return res;
  }

  function setStatus(text) {
    if (!els.status) return;
    els.status.textContent = text || "";
  }

  function showToast(type, message) {
    const el = document.createElement("div");
    el.className = `dv-toast dv-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function formatMoney(cents, currency) {
    if (!Number.isFinite(cents)) return "—";
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency });
  }

  function eurosToCents(val) {
    return Math.round(Number(val || 0) * 100);
  }

  function centsToInput(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeVatRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return VAT_OPTIONS[VAT_OPTIONS.length - 1];
    const matched = VAT_OPTIONS.find((v) => Number(v) === Number(n));
    if (matched !== undefined) return matched;
    // fallback to nearest allowed rate
    return VAT_OPTIONS.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), VAT_OPTIONS[0]);
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
      ? v
      : "";
  }

  function formatDateFR(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  }

  function formatDateTimeFR(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function buildElectronicDocumentId() {
    const ref = String(state.draft.reference || "").trim();
    const seed = ref || `DV-${todayCompact()}`;
    const suffix = randomId().slice(0, 8).toUpperCase();
    return `${seed}-${suffix}`;
  }

  function todayCompact() {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  }

  function bumpReference(ref) {
    const raw = String(ref || "").trim();
    const m = raw.match(/^(.*?)(\d+)\s*$/);
    if (!m) return "";
    const prefix = m[1];
    const digits = m[2];
    const next = String(Number(digits) + 1).padStart(digits.length, "0");
    return `${prefix}${next}`;
  }

  function isTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "PGRST205" || msg.includes("could not find the table") || msg.includes("does not exist");
  }

  function isPermissionDenied(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "42501" || msg.includes("row-level security") || msg.includes("permission denied");
  }

  function isConstraintViolation(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "23514" || msg.includes("violates check constraint");
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "42703" || msg.includes("column") && msg.includes("does not exist");
  }

  function isOrderParseError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("failed to parse order") || msg.includes("order");
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function randomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10);
  }

  function renderShell(rootEl, copy) {
    rootEl.innerHTML = `
      <datalist id="dv-products"></datalist>
      <section class="dv-shell">
        <header class="dv-header">
          <div>
            <div class="dv-eyebrow">${copy.subtitle}</div>
            <div class="dv-title">${copy.title}</div>
          </div>
          <div class="dv-actions">
            <button class="dv-btn dv-btn--ghost" data-reset>${copy.btnReset}</button>
            <button class="dv-btn dv-btn--ghost" data-download>${copy.btnDownload}</button>
            <button class="dv-btn dv-btn--ghost" data-save>${copy.btnSave}</button>
            <button class="dv-btn dv-btn--primary" data-validate>${copy.btnValidate}</button>
          </div>
        </header>

        <div class="dv-status" data-status></div>

        <div class="dv-grid">
          <div class="dv-panel dv-preview-panel">
            <div class="dv-preview-toolbar">
              <div class="dv-preview-live">Apercu en direct</div>
              <a class="dv-link" data-preview-link hidden target="_blank" rel="noopener">Voir le PDF</a>
            </div>
            <div class="dv-preview" data-preview></div>
          </div>

          <div class="dv-panel">
            <div class="dv-card">
              <div class="dv-card-title">Client</div>
              <div class="dv-field">
                <label>Client existant</label>
                <select class="dv-input" data-client-select></select>
              </div>
              <div class="dv-field">
                <label>Intervention</label>
                <select class="dv-input" data-intervention></select>
              </div>
              <div class="dv-field"><label>${copy.labelClient}</label><input class="dv-input" data-client /></div>
              <div class="dv-field"><label>${copy.labelContact}</label><input class="dv-input" data-contact /></div>
              <div class="dv-field"><label>${copy.labelEmail}</label><input class="dv-input" data-email /></div>
              <div class="dv-field"><label>${copy.labelPhone}</label><input class="dv-input" data-phone /></div>
              <div class="dv-field"><label>${copy.labelAddress}</label><input class="dv-input" data-address /></div>
            </div>

            <div class="dv-card">
              <div class="dv-card-title">Devis</div>
              <div class="dv-field"><label>${copy.labelRef}</label><input class="dv-input" data-ref /></div>
              <div class="dv-field"><label>${copy.labelValidity}</label><input class="dv-input" type="date" data-validity /></div>
              <div class="dv-field"><label>${copy.labelNotes}</label><textarea class="dv-textarea" data-notes rows="3"></textarea></div>
              <div class="dv-field"><label>${copy.labelTerms}</label><textarea class="dv-textarea" data-terms rows="3"></textarea></div>
            </div>

            <div class="dv-card">
              <div class="dv-card-title">${copy.labelItems}</div>
              <div class="dv-items" data-items></div>
              <button class="dv-btn dv-btn--ghost dv-btn--xs" data-add-item>${copy.btnAddItem}</button>
            </div>

            <div class="dv-card dv-summary">
              <div class="dv-field">
                <label>Remise</label>
                <div class="dv-discount">
                  <select class="dv-input" data-discount-type>
                    <option value="none">Aucune</option>
                    <option value="percent">%</option>
                    <option value="amount">Montant</option>
                  </select>
                  <input class="dv-input" data-discount-value />
                </div>
              </div>
              <div class="dv-field">
                <label>TVA (%)</label>
                <select class="dv-input" data-vat-rate>${renderVatOptions(CONFIG.VAT_RATE)}</select>
              </div>
              <div class="dv-total-row"><span>${copy.labelSubtotal}</span><strong data-subtotal>—</strong></div>
              <div class="dv-total-row"><span>${copy.labelDiscount}</span><strong data-discount>—</strong></div>
              <div class="dv-total-row"><span>${copy.labelVat}</span><strong data-vat>—</strong></div>
              <div class="dv-total-row dv-total"><span>${copy.labelTotal}</span><strong data-total>—</strong></div>
            </div>
          </div>
        </div>

        <div class="dv-toasts" data-toasts></div>
      </section>
    `;

    const out = {
      productList: rootEl.querySelector("#dv-products"),
      clientSelect: rootEl.querySelector("[data-client-select]"),
      intervention: rootEl.querySelector("[data-intervention]"),
      client: rootEl.querySelector("[data-client]"),
      contact: rootEl.querySelector("[data-contact]"),
      email: rootEl.querySelector("[data-email]"),
      phone: rootEl.querySelector("[data-phone]"),
      address: rootEl.querySelector("[data-address]"),
      ref: rootEl.querySelector("[data-ref]"),
      validity: rootEl.querySelector("[data-validity]"),
      notes: rootEl.querySelector("[data-notes]"),
      terms: rootEl.querySelector("[data-terms]"),
      items: rootEl.querySelector("[data-items]"),
      discountType: rootEl.querySelector("[data-discount-type]"),
      discountValue: rootEl.querySelector("[data-discount-value]"),
      vatRate: rootEl.querySelector("[data-vat-rate]"),
      subtotal: rootEl.querySelector("[data-subtotal]"),
      discount: rootEl.querySelector("[data-discount]"),
      vat: rootEl.querySelector("[data-vat]"),
      total: rootEl.querySelector("[data-total]"),
      preview: rootEl.querySelector("[data-preview]"),
      previewLink: rootEl.querySelector("[data-preview-link]"),
      status: rootEl.querySelector("[data-status]"),
      toasts: rootEl.querySelector("[data-toasts]"),
      btnAddItem: rootEl.querySelector("[data-add-item]"),
      btnSave: rootEl.querySelector("[data-save]"),
      btnValidate: rootEl.querySelector("[data-validate]"),
      btnDownload: rootEl.querySelector("[data-download]"),
      btnReset: rootEl.querySelector("[data-reset]"),
    };

    return out;
  }

  function injectStyles() {
    if (document.getElementById("dv-styles")) return;
    const style = document.createElement("style");
    style.id = "dv-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      .dv-shell {
        font-family: "Manrope", sans-serif;
        color: #0f172a;
        --dv-bg-1: #f4f8ff;
        --dv-bg-2: #ebf2ff;
        --dv-ink-soft: #64748b;
        --dv-primary: #0ea5e9;
        --dv-primary-dark: #0284c7;
        --dv-border: #d7e3ff;
        background:
          radial-gradient(1200px 520px at -10% -20%, #dff5ff 0%, transparent 55%),
          radial-gradient(1000px 460px at 110% 0%, #e9f0ff 0%, transparent 56%),
          linear-gradient(180deg, var(--dv-bg-1) 0%, var(--dv-bg-2) 100%);
        padding: 24px;
        border-radius: 20px;
        border: 1px solid #d9e8ff;
      }
      .dv-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 18px;
        margin-bottom: 14px;
      }
      .dv-eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--dv-ink-soft);
        margin-bottom: 6px;
      }
      .dv-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 30px;
        font-weight: 700;
        line-height: 1.1;
      }
      .dv-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .dv-btn {
        border: none;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        background: var(--dv-primary);
        color: #fff;
        box-shadow: 0 8px 20px rgba(14, 165, 233, 0.25);
        transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .dv-btn:hover {
        transform: translateY(-1px);
      }
      .dv-btn--ghost {
        background: #e8effb;
        color: #0f172a;
        box-shadow: none;
      }
      .dv-btn--xs {
        padding: 7px 10px;
        font-size: 12px;
      }
      .dv-btn--primary {
        background: linear-gradient(135deg, var(--dv-primary) 0%, var(--dv-primary-dark) 100%);
      }
      .dv-status {
        color: var(--dv-ink-soft);
        font-size: 13px;
        min-height: 18px;
        margin-bottom: 14px;
      }
      .dv-grid {
        display: grid;
        grid-template-columns: minmax(420px, 1.1fr) minmax(500px, 0.9fr);
        gap: 22px;
        align-items: start;
      }
      .dv-panel {
        display: grid;
        gap: 14px;
      }
      .dv-card {
        background: #fff;
        border-radius: 16px;
        padding: 16px;
        border: 1px solid #e2ebff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
        display: grid;
        gap: 11px;
      }
      .dv-card-title {
        font-weight: 700;
        font-size: 15px;
      }
      .dv-field label {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--dv-ink-soft);
        letter-spacing: 0.06em;
        display: block;
        margin-bottom: 6px;
      }
      .dv-input, .dv-textarea, select.dv-input {
        width: 100%;
        border: 1px solid var(--dv-border);
        border-radius: 12px;
        padding: 9px 11px;
        font-size: 13px;
        background: #fdfefe;
        color: #0f172a;
      }
      .dv-input:focus, .dv-textarea:focus {
        outline: none;
        border-color: #8ccaf5;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
      }
      .dv-textarea {
        resize: vertical;
      }
      .dv-items {
        display: grid;
        gap: 10px;
      }
      .dv-row {
        display: grid;
        grid-template-columns: 1.5fr 0.5fr 0.6fr 0.6fr 0.7fr auto;
        gap: 8px;
        align-items: center;
        padding: 8px;
        border: 1px solid #e7edfc;
        border-radius: 12px;
        background: #fdfefe;
      }
      .dv-line-total {
        font-weight: 600;
        font-size: 13px;
      }
      .dv-summary {
        gap: 12px;
      }
      .dv-total-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
      }
      .dv-total {
        font-size: 16px;
      }
      .dv-discount {
        display: grid;
        grid-template-columns: 0.6fr 1fr;
        gap: 6px;
      }
      .dv-preview-panel {
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .dv-preview-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 4px 0;
      }
      .dv-preview-live {
        font-size: 12px;
        font-weight: 700;
        color: #0369a1;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .dv-link {
        color: #0284c7;
        text-decoration: none;
        font-weight: 600;
        font-size: 13px;
      }
      .dv-preview {
        background: #f5f9ff;
        border-radius: 16px;
        padding: 14px;
        border: 1px solid #e2ebff;
        box-shadow: inset 0 1px 0 #ffffff;
        min-height: 460px;
      }
      .dv-paper {
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        background: #fff;
        border: 1px solid #dce7ff;
        border-radius: 14px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
        padding: 18px;
        display: grid;
        gap: 14px;
      }
      .dv-edoc-banner {
        display: grid;
        gap: 2px;
        padding: 10px 12px;
        border-radius: 10px;
        background: linear-gradient(135deg, #ecfeff 0%, #eef2ff 100%);
        border: 1px solid #c7ddff;
      }
      .dv-edoc-banner span {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #0369a1;
        font-weight: 700;
      }
      .dv-edoc-banner strong {
        font-size: 12px;
        color: #0f172a;
        line-height: 1.4;
      }
      .dv-paper-top {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding-bottom: 12px;
        border-bottom: 1px solid #e6eefc;
      }
      .dv-company {
        display: grid;
        gap: 4px;
      }
      .dv-preview-title {
        font-size: 17px;
        font-weight: 700;
      }
      .dv-preview-sub {
        font-size: 11px;
        color: var(--dv-ink-soft);
        line-height: 1.4;
        word-break: break-word;
      }
      .dv-doc {
        min-width: 230px;
        display: grid;
        gap: 8px;
      }
      .dv-doc-pill {
        justify-self: end;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #075985;
        background: #e0f2fe;
        border: 1px solid #bae6fd;
        border-radius: 999px;
        padding: 5px 10px;
      }
      .dv-doc-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        color: var(--dv-ink-soft);
      }
      .dv-doc-row strong {
        color: #0f172a;
        font-weight: 700;
      }
      .dv-doc-row--total {
        margin-top: 2px;
        padding-top: 8px;
        border-top: 1px dashed #c9daff;
      }
      .dv-edoc-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .dv-edoc-item {
        background: #f8fbff;
        border: 1px solid #deebff;
        border-radius: 10px;
        padding: 8px 10px;
        display: grid;
        gap: 3px;
      }
      .dv-edoc-item span {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
      }
      .dv-edoc-item strong {
        font-size: 12px;
        color: #0f172a;
        line-height: 1.35;
        word-break: break-word;
      }
      .dv-paper-meta {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 12px;
      }
      .dv-meta-card {
        background: #f8fbff;
        border: 1px solid #deebff;
        border-radius: 12px;
        padding: 12px;
        display: grid;
        gap: 6px;
      }
      .dv-meta-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 2px;
      }
      .dv-meta-line {
        font-size: 12px;
        color: #0f172a;
        line-height: 1.45;
        word-break: break-word;
      }
      .dv-paper-lines {
        border-top: 1px solid #e6eefc;
        padding-top: 10px;
      }
      .dv-preview-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        table-layout: fixed;
      }
      .dv-preview-table th,
      .dv-preview-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 9px 8px;
        text-align: left;
        vertical-align: top;
      }
      .dv-preview-table th {
        font-weight: 700;
        color: #0f172a;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        background: #f8fbff;
      }
      .dv-col-label {
        width: 44%;
        word-break: break-word;
      }
      .dv-col-num {
        text-align: right !important;
        white-space: nowrap;
      }
      .dv-preview-empty {
        text-align: center !important;
        color: #64748b;
        padding: 16px 8px !important;
      }
      .dv-paper-notes {
        margin-top: 12px;
        display: grid;
        gap: 10px;
      }
      .dv-note-block {
        border: 1px solid #deebff;
        border-radius: 12px;
        padding: 10px 12px;
        background: #fbfdff;
      }
      .dv-note-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      .dv-note-text {
        font-size: 12px;
        color: #334155;
        line-height: 1.55;
        white-space: pre-line;
        word-break: break-word;
      }
      .dv-toasts {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      .dv-toast {
        background: #0f172a;
        color: #fff;
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 12px;
      }
      .dv-toast--success { background: #16a34a; }
      .dv-toast--error { background: #dc2626; }
      .dv-toast--warning { background: #f59e0b; }

      @media (max-width: 980px) {
        .dv-grid { grid-template-columns: 1fr; }
        .dv-preview-panel { position: static; }
        .dv-edoc-meta { grid-template-columns: 1fr; }
        .dv-paper-meta { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        .dv-shell { padding: 16px; }
        .dv-title { font-size: 26px; }
        .dv-header { align-items: flex-start; }
        .dv-row { grid-template-columns: 1fr 1fr; }
        .dv-line-total { grid-column: span 2; }
        .dv-paper { padding: 14px; }
        .dv-paper-top { flex-direction: column; }
        .dv-doc { min-width: 0; width: 100%; }
        .dv-doc-pill { justify-self: start; }
      }
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return (
      document.querySelector("[data-devis]") ||
      document.querySelector("#devis-root") ||
      document.querySelector(".devis-root")
    );
  }
});
