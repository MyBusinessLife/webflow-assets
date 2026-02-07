document.documentElement.setAttribute("data-page", "facture");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const root = findRoot();
  if (!root) {
    console.error("[FACTURE] Root introuvable.");
    return;
  }

  const url = new URL(window.location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || window.location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[FACTURE]", ...a);
  const warn = (...a) => DEBUG && console.warn("[FACTURE]", ...a);

  const GLOBAL_CFG = window.__MBL_CFG__ || {};

  const CONFIG = {
    SUPABASE_URL: GLOBAL_CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      GLOBAL_CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    // Invoices must not inherit the global bucket (used by other modules like interventions).
    // Use per-page dataset override, otherwise default to factures-files.
    BUCKET: root.dataset.bucket || "factures-files",
    INVOICES_TABLE: root.dataset.invoicesTable || root.dataset.facturesTable || "factures",
    PRODUCTS_TABLE: root.dataset.productsTable || GLOBAL_CFG.PRODUCTS_TABLE || "products",
    CLIENTS_TABLE: root.dataset.clientsTable || "clients",
    INTERVENTIONS_TABLE: root.dataset.interventionsTable || "interventions",
    ORGANIZATION_ID:
      root.dataset.organizationId ||
      GLOBAL_CFG.ORGANIZATION_ID ||
      window.__MBL_ORG_ID__ ||
      "",
    VAT_RATE: Number(root.dataset.vatRate || GLOBAL_CFG.VAT_RATE || 20),
    PAYMENT_TERMS_DAYS: Number(root.dataset.paymentTermsDays || GLOBAL_CFG.PAYMENT_TERMS_DAYS || 30),
    PAYMENT_TERMS_LABEL: String(root.dataset.paymentTermsLabel || GLOBAL_CFG.PAYMENT_TERMS_LABEL || "").trim(),
    LATE_PAYMENT_TEXT: String(root.dataset.latePaymentText || GLOBAL_CFG.LATE_PAYMENT_TEXT || "").trim(),
    CURRENCY: root.dataset.currency || "EUR",
    PDF_TTL: Number(root.dataset.pdfTtl || 3600),
    DOC_ACCENT: String(root.dataset.docAccent || GLOBAL_CFG.DOC_ACCENT || "#306D89").trim() || "#306D89",
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
    vat_number: root.dataset.companyVatNumber || GLOBAL_CFG.COMPANY_VAT_NUMBER || "",
    legal_form: root.dataset.companyLegalForm || GLOBAL_CFG.COMPANY_LEGAL_FORM || "",
    rcs_city: root.dataset.companyRcsCity || GLOBAL_CFG.COMPANY_RCS_CITY || "",
    rcs_number: root.dataset.companyRcsNumber || GLOBAL_CFG.COMPANY_RCS_NUMBER || "",
    naf_code: root.dataset.companyNafCode || GLOBAL_CFG.COMPANY_NAF_CODE || "",
    share_capital_cents: Number(root.dataset.companyShareCapitalCents || GLOBAL_CFG.COMPANY_SHARE_CAPITAL_CENTS || 0),
    iban: root.dataset.companyIban || root.dataset.iban || GLOBAL_CFG.COMPANY_IBAN || "",
    bic: root.dataset.companyBic || root.dataset.bic || GLOBAL_CFG.COMPANY_BIC || "",
  };

  const STR = {
    title: "Facture",
    subtitle: "Emission et export PDF (legislation FR)",
    btnAddItem: "Ajouter une ligne",
    btnSave: "Enregistrer (brouillon)",
    btnValidate: "Emettre facture",
    btnDownload: "Telecharger PDF",
    btnPreview: "Apercu",
    btnReset: "Reinitialiser",
    labelClient: "Client",
    labelContact: "Contact",
    labelEmail: "Email",
    labelPhone: "Telephone",
    labelAddress: "Adresse",
    labelRef: "Numero facture (auto)",
    labelIntervention: "Intervention",
    labelIssueDate: "Date facture",
    labelServiceDate: "Date prestation",
    labelValidity: "Echeance",
    labelNotes: "Notes",
    labelTerms: "Conditions / mentions",
    labelItems: "Lignes",
    labelSubtotal: "Sous-total",
    labelDiscount: "Remise",
    labelVat: "TVA",
    labelTotal: "Total",
    msgLoading: "Chargement...",
    msgSaved: "Facture enregistree.",
    msgSavedPartial: "PDF genere mais facture non enregistree (table manquante).",
    msgSavedDenied: "Droits insuffisants pour enregistrer cette facture (RLS).",
    msgOrgMissing: "Organisation introuvable pour ton compte. Ajoute data-organization-id ou verifie organization_members.",
    msgSavedWithPdf: "Facture enregistree et PDF disponible.",
    msgSavedNoPdf: "Facture enregistree, mais impossible de publier le PDF.",
    msgPdfOnly: "PDF genere localement (facture non enregistree en base).",
    msgStorageDenied: "PDF genere, mais upload bloque par les droits du bucket.",
    msgValidated: "Facture emise avec succes.",
    msgPdfReady: "PDF genere.",
    msgPdfFail: "Impossible de generer le PDF.",
  };
  const VAT_OPTIONS = [0, 5.5, 10, 20];
  const VAT_EXEMPTION_PRESETS = [
    {
      id: "293b",
      label: "TVA non applicable (art. 293 B CGI)",
      text: "TVA non applicable, art. 293 B du code general des impots.",
    },
    {
      id: "262ter",
      label: "Exoneration TVA (art. 262 ter I CGI)",
      text: "Exoneration de la TVA : Article 262 ter I du CGI.",
    },
    {
      id: "autoliquidation",
      label: "Autoliquidation TVA (art. 283-2 CGI)",
      text: "Autoliquidation de la TVA : Article 283-2 du CGI.",
    },
  ];
  const STATUS_DRAFT = "draft";
  const STATUS_VALIDATED = "issued";

  injectStyles();

  const els = renderShell(root, STR);
  wireActions();
  const state = {
    currentUserId: "",
    organizationId: String(CONFIG.ORGANIZATION_ID || "").trim(),
    clients: [],
    interventions: [],
    products: [],
    productByName: new Map(),
    invoiceId: null,
    selectedClientId: "",
    selectedInterventionId: "",
    pdf: { url: "", path: "" },
    orgProfile: null,
    draft: defaultDraft(),
  };

  await boot();

  async function boot() {
    setStatus(STR.msgLoading);
    await resolveAuthContext();
    await loadOrganizationProfile();
    await Promise.all([loadClients(), loadInterventions(), loadProducts()]);

    const invoiceId = resolveInvoiceIdFromUrl();
    if (invoiceId) {
      state.invoiceId = invoiceId;
      await loadInvoice(invoiceId);
    } else {
      applyInvoiceDefaultsFromOrgProfile();
    }

    hydrateDraft();
    if (!state.invoiceId) {
      applyAutoPrefillFromContext();
    }
    renderItems();
    updateTotals();
    updatePreview();
    setStatus(state.organizationId ? "" : STR.msgOrgMissing);
  }

  async function resolveAuthContext() {
    state.organizationId = asUuid(state.organizationId);
    const auth = await supabase.auth.getUser();
    const uid = auth?.data?.user?.id || "";
    state.currentUserId = uid;

    if (!uid) return;

    // If an org id is already provided (dataset/global), verify membership. If it doesn't match, override.
    if (state.organizationId) {
      const check = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", uid)
        .eq("organization_id", state.organizationId)
        .limit(1)
        .maybeSingle();
      if (!check.error && check.data?.organization_id) return;
      warn("Provided organizationId not linked to current user; will auto-resolve.", {
        organizationId: state.organizationId,
        userId: uid,
        error: check.error || null,
      });
      state.organizationId = "";
    }

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

    log("Auth context resolved", { userId: uid, organizationId: state.organizationId });
  }

  function resolveInvoiceIdFromUrl() {
    const params = new URLSearchParams(window.location.search || "");
    const raw =
      params.get("id") ||
      params.get("facture_id") ||
      params.get("invoice_id") ||
      params.get("factureId") ||
      params.get("invoiceId") ||
      "";
    return asUuid(raw);
  }

  function applyInvoiceDefaultsFromOrgProfile() {
    const today = todayISODate();
    if (!String(state.draft.issue_date || "").trim()) state.draft.issue_date = today;
    if (!String(state.draft.service_date || "").trim()) state.draft.service_date = state.draft.issue_date;
    if (!String(state.draft.due_date || "").trim()) {
      state.draft.due_date = addDaysISO(state.draft.issue_date, resolvePaymentTermsDays());
    }
    if (!String(state.draft.terms || "").trim() && String(state.orgProfile?.footer_notes || "").trim()) {
      state.draft.terms = String(state.orgProfile.footer_notes || "");
    }
  }

  async function loadInvoice(invoiceId) {
    if (!invoiceId) return;

    const res = await supabase.from(CONFIG.INVOICES_TABLE).select("*").eq("id", invoiceId).maybeSingle();
    if (res.error || !res.data) {
      console.warn("[FACTURE] load invoice failed:", res.error || null);
      showToast("error", "Impossible de charger la facture.");
      return;
    }

    const row = res.data;
    const buyer = row.buyer && typeof row.buyer === "object" ? row.buyer : {};
    const issueDate = String(row.issue_date || todayISODate());
    const draft = defaultDraft();

    state.draft = {
      ...draft,
      client_name: row.client_name || buyer.name || "",
      contact_name: row.contact_name || "",
      client_email: row.client_email || buyer.email || "",
      client_phone: row.client_phone || buyer.phone || "",
      client_address: row.client_address || buyer.address || "",
      reference: row.reference || "",
      issue_date: issueDate,
      service_date: String(row.service_date || issueDate),
      due_date: String(row.due_date || addDaysISO(issueDate, resolvePaymentTermsDays())),
      notes: row.notes || "",
      terms: row.terms || "",
      vat_exemption_text: String(row.vat_exemption_text || "").trim(),
      items: parseJsonArray(row.items) || draft.items,
      discount_type: Number(row.discount_cents || 0) > 0 ? "amount" : "none",
      discount_value: Number(row.discount_cents || 0) / 100,
      vat_rate: sanitizeVatRate(CONFIG.VAT_RATE),
      status: String(row.status || STATUS_DRAFT),
    };

    state.selectedClientId = String(row.client_id || "");
    state.selectedInterventionId = String(row.intervention_id || "");

    if (state.selectedClientId) els.clientSelect.value = state.selectedClientId;
    if (state.selectedInterventionId) els.intervention.value = state.selectedInterventionId;

    // Wire existing PDF (best-effort signed URL).
    const pdfPath = String(row.pdf_path || "").trim();
    const pdfUrl = String(row.pdf_url || "").trim();
    state.pdf = { url: "", path: "" };

    if (pdfPath) {
      const url = await resolvePdfUrlFromPath(pdfPath);
      state.pdf = { path: pdfPath, url };
      if (url && els.previewLink) {
        els.previewLink.href = url;
        els.previewLink.hidden = false;
      }
    } else if (pdfUrl && /^https?:\/\//i.test(pdfUrl)) {
      state.pdf = { path: "", url: pdfUrl };
      if (els.previewLink) {
        els.previewLink.href = pdfUrl;
        els.previewLink.hidden = false;
      }
    }
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
    const selects = [
      // Try best-effort (may fail if legacy columns missing).
      "id,title,internal_ref,client_ref,client_name,client_email,client_phone,support_phone,address,start_at,tarif,organization_id",
      // Common minimal set in your interventions table.
      "id,title,client_ref,client_name,support_phone,address,start_at,tarif,organization_id",
      "id,title,client_name,support_phone,address,start_at,tarif,organization_id",
      "id,title,client_name,address,start_at,tarif,organization_id",
      "id,title,client_name,address,start_at,organization_id",
      "id,title,start_at,organization_id",
      "id,title,start_at",
      "id,title",
    ];

    let lastErr = null;
    for (const sel of selects) {
      let q = supabase
        .from(CONFIG.INTERVENTIONS_TABLE)
        .select(sel)
        .order("start_at", { ascending: false })
        .limit(200);
      if (state.organizationId) q = q.eq("organization_id", state.organizationId);
      let res = await q;

      if (res.error && isOrderParseError(res.error)) {
        let q2 = supabase.from(CONFIG.INTERVENTIONS_TABLE).select(sel).limit(200);
        if (state.organizationId) q2 = q2.eq("organization_id", state.organizationId);
        res = await q2;
      }

      if (!res.error) {
        state.interventions = res.data || [];
        renderInterventionOptions();
        return;
      }

      lastErr = res.error;
      if (isMissingColumnError(res.error)) continue;
      break;
    }

    if (lastErr) console.warn("[FACTURE] loadInterventions failed:", lastErr);
  }

  async function loadProducts() {
    const res = await readTable(CONFIG.PRODUCTS_TABLE, "*", { limit: 500 });
    if (res.error) return;
    state.products = (res.data || [])
      .map((p) => {
        const name = p.name || p.title || p.label;
        if (!name) return null;
        return {
          id: p.id,
          name,
          unit_cents: resolveProductUnitCents(p),
          vat_rate: sanitizeVatRate(p.vat_rate ?? p.vat ?? CONFIG.VAT_RATE),
        };
      })
      .filter(Boolean);
    state.productByName = new Map(state.products.map((p) => [normalize(p.name), p]));
    renderProductDatalist();
  }

  function resolveProductUnitCents(row) {
    const candidates = [
      row?.price_cents,
      row?.priceCents,
      row?.unit_cents,
      row?.unitCents,
      row?.unit_price_cents,
      row?.unitPriceCents,
    ];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }

    const eurosCandidates = [row?.price, row?.unit_price, row?.unitPrice];
    for (const v of eurosCandidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) return eurosToCents(n);
    }

    return 0;
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
    els.issueDate.value = d.issue_date || todayISODate();
    els.serviceDate.value = d.service_date || els.issueDate.value;
    els.dueDate.value = d.due_date || addDaysISO(els.issueDate.value, resolvePaymentTermsDays());
    els.notes.value = d.notes || "";
    els.terms.value = d.terms || "";
    if (els.vatExemptionText) els.vatExemptionText.value = String(d.vat_exemption_text || "");
    if (els.vatExemptionPreset) els.vatExemptionPreset.value = vatExemptionPresetIdFromText(d.vat_exemption_text);
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
        <input class="dv-input dv-input--xs" data-field="unit" type="text" placeholder="Unite" value="${escapeHTML(item.unit || "")}" />
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
        item.unit_cents = Math.max(0, Number(hit.unit_cents || 0));
        item.vat_rate = sanitizeVatRate(hit.vat_rate ?? CONFIG.VAT_RATE);
        row.querySelector('[data-field="price"]').value = centsToInput(item.unit_cents);
        row.querySelector('[data-field="vat"]').value = item.vat_rate;
      }
    } else if (field === "qty") {
      item.qty = Math.max(1, Number(e.target.value || 1));
    } else if (field === "unit") {
      item.unit = String(e.target.value || "").trim();
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
    const accent = String(CONFIG.DOC_ACCENT || "#306D89").trim() || "#306D89";

    const itemsHtml = (state.draft.items || [])
      .map((item) => {
        const rate = sanitizeVatRate(item.vat_rate ?? state.draft.vat_rate);
        const qty = Math.max(1, Number(item.qty || 1));
        const qtyTxt = Number.isFinite(qty)
          ? qty.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "1,00";
        const lineTotal = calcLineTotal(item);
        return `
          <tr>
            <td class="dv-col-label">${escapeHTML(item.name || "—")}</td>
            <td class="dv-col-num">${escapeHTML(qtyTxt)}</td>
            <td class="dv-col-unit">${escapeHTML(String(item.unit || ""))}</td>
            <td class="dv-col-num">${formatMoney(item.unit_cents, CONFIG.CURRENCY)}</td>
            <td class="dv-col-num">${escapeHTML(String(rate).replace(".", ","))}%</td>
            <td class="dv-col-num">${formatMoney(lineTotal, CONFIG.CURRENCY)}</td>
          </tr>
        `;
      })
      .join("");

    const safeItemsHtml = itemsHtml || `<tr><td colspan="6" class="dv-preview-empty">Aucune ligne.</td></tr>`;

    const sellerName = escapeHTML(
      [String(COMPANY.legal_form || "").trim(), String(COMPANY.name || "").trim()].filter(Boolean).join(" ") ||
        String(COMPANY.name || "").trim()
    );
    const sellerAddress = escapeHTML(String(COMPANY.address || "")).replace(/\\n/g, "<br>");

    const clientName = escapeHTML(state.draft.client_name || "Client");
    const contactName = escapeHTML(state.draft.contact_name || "");
    const clientAddress = escapeHTML(state.draft.client_address || "").replace(/\\n/g, "<br>");

    const ref = escapeHTML(state.draft.reference || "Brouillon");
    const issueDate = escapeHTML(formatDateFR(state.draft.issue_date) || "—");
    const serviceDate = escapeHTML(formatDateFR(state.draft.service_date) || "");
    const dueDate = escapeHTML(formatDateFR(state.draft.due_date) || "—");

    const paymentTermsLabel = escapeHTML(resolvePaymentTermsLabel());

    const subtotalCents = Number(state.draft.subtotal_cents || 0);
    const discountCents = Number(state.draft.discount_cents || 0);
    const totalHtCents = Math.max(0, subtotalCents - Math.max(0, discountCents));

    const vatBreakdown = computeVatBreakdown(state.draft.items, subtotalCents, discountCents, state.draft.vat_rate);
    const vatLinesHtml = vatBreakdown.length
      ? vatBreakdown
          .map((row) => {
            const rate = escapeHTML(String(row.rate).replace(".", ","));
            return `<div class="dv-total-line"><span>TVA ${rate} %</span><strong>${formatMoney(row.vat_cents, CONFIG.CURRENCY)}</strong></div>`;
          })
          .join("")
      : `<div class="dv-total-line"><span>TVA</span><strong>${formatMoney(state.draft.vat_cents, CONFIG.CURRENCY)}</strong></div>`;

    const discountLineHtml =
      discountCents > 0
        ? `<div class="dv-total-line dv-total-line--muted"><span>Remise</span><strong>-${escapeHTML(
            formatMoney(discountCents, CONFIG.CURRENCY)
          )}</strong></div>`
        : "";

    const iban = String(COMPANY.iban || "").trim();
    const bic = String(COMPANY.bic || "").trim();
    const bankHtml =
      iban || bic
        ? `
          <div class="dv-bank-lines">
            ${iban ? `<div><strong>IBAN :</strong> ${escapeHTML(iban)}</div>` : ""}
            ${bic ? `<div><strong>BIC :</strong> ${escapeHTML(bic)}</div>` : ""}
          </div>
        `
        : "";

    const legalNoteParts = [];
    const latePaymentText = String(resolveLatePaymentText() || "").trim();
    if (latePaymentText) legalNoteParts.push(latePaymentText);
    const vatEx = String(resolveVatExemptionText() || "").trim();
    if (vatEx && Number(state.draft.vat_cents || 0) === 0) legalNoteParts.push(vatEx);

    const legalNoteHtml = legalNoteParts.length
      ? `<div class="dv-legal-note">${escapeHTML(legalNoteParts.join(" "))}</div>`
      : "";

    const notes = String(state.draft.notes || "").trim();
    const terms = String(state.draft.terms || "").trim();
    const extraHtml = [
      notes ? `<div class="dv-extra"><strong>Notes :</strong> ${escapeHTML(notes)}</div>` : "",
      terms ? `<div class="dv-extra"><strong>Mentions :</strong> ${escapeHTML(terms)}</div>` : "",
    ]
      .filter(Boolean)
      .join("");

    const siren = String(COMPANY.siret || "").replace(/\\D/g, "").slice(0, 9);
    const footerParts = [];
    const capitalEuros = Number(COMPANY.share_capital_cents || 0) > 0 ? Math.round(Number(COMPANY.share_capital_cents || 0) / 100) : 0;
    if (sellerName && capitalEuros > 0) footerParts.push(`${sellerName} au capital de ${capitalEuros.toLocaleString("fr-FR")} euros`);
    else if (sellerName) footerParts.push(sellerName);
    const regParts = [];
    if (siren) regParts.push(`SIREN ${siren}`);
    if (COMPANY.rcs_city || COMPANY.rcs_number) regParts.push(`RCS ${String(COMPANY.rcs_city || "").trim()} ${String(COMPANY.rcs_number || "").trim()}`.trim());
    if (COMPANY.naf_code) regParts.push(`NAF ${String(COMPANY.naf_code).trim()}`);
    if (regParts.length) footerParts.push(regParts.join(" - "));
    const vatNumber = String(COMPANY.vat_number || COMPANY.tva || "").trim();
    if (vatNumber) footerParts.push(`TVA intracommunautaire : ${vatNumber}`);

    const interventionRef = (() => {
      const id = String(state.selectedInterventionId || "").trim();
      if (!id) return "";
      const itv = state.interventions.find((i) => String(i.id) === id);
      if (!itv) return "";
      const ref = String(itv.internal_ref || itv.client_ref || "").trim();
      return ref ? ref : String(itv.title || "").trim();
    })();

    els.preview.innerHTML = `
      <article class="dv-paper" style="--doc-accent:${escapeHTML(accent)}">
        <header class="dv-paper-top dv-paper-top--plain">
          <div class="dv-seller">
            <div class="dv-seller-name">${sellerName}</div>
            ${sellerAddress ? `<div class="dv-seller-line">${sellerAddress}</div>` : ""}
          </div>
          <div class="dv-buyer">
            <div class="dv-buyer-name">${clientName}</div>
            ${contactName ? `<div class="dv-buyer-line">${contactName}</div>` : ""}
            ${clientAddress ? `<div class="dv-buyer-line">${clientAddress}</div>` : ""}
          </div>
        </header>

        <section class="dv-doc-meta">
          <div class="dv-doc-meta-left">
            <div class="dv-doc-number">Facture N° ${ref}</div>
            ${interventionRef ? `<div class="dv-doc-line">${escapeHTML(interventionRef)}</div>` : ""}
            <div class="dv-doc-line">Date d'emission : ${issueDate}</div>
            ${serviceDate ? `<div class="dv-doc-line">Date de prestation : ${serviceDate}</div>` : ""}
          </div>
          <div class="dv-doc-meta-right">
            <div class="dv-doc-line">Reglement : ${paymentTermsLabel}</div>
            <div class="dv-doc-line">Echeance : ${dueDate}</div>
          </div>
        </section>

        <section class="dv-paper-lines dv-paper-lines--plain">
          <table class="dv-preview-table dv-preview-table--legal">
            <thead>
              <tr>
                <th>Designation</th>
                <th class="dv-col-num">Quantite</th>
                <th>Unite</th>
                <th class="dv-col-num">Prix unitaire</th>
                <th class="dv-col-num">TVA</th>
                <th class="dv-col-num">Montant HT</th>
              </tr>
            </thead>
            <tbody>${safeItemsHtml}</tbody>
          </table>
        </section>

        <section class="dv-totals">
          <div class="dv-totals-box">
            ${discountLineHtml}
            <div class="dv-total-line"><span>Total HT</span><strong>${formatMoney(totalHtCents, CONFIG.CURRENCY)}</strong></div>
            ${vatLinesHtml}
            <div class="dv-total-line dv-total-line--grand"><span>Total TTC</span><strong>${formatMoney(state.draft.total_cents, CONFIG.CURRENCY)}</strong></div>
          </div>
        </section>

        <section class="dv-bank">
          ${bankHtml}
          ${legalNoteHtml}
          ${extraHtml}
        </section>

        <footer class="dv-footer-legal">
          ${footerParts.map((p) => `<div>${escapeHTML(p)}</div>`).join("")}
        </footer>
      </article>
    `;
  }

  async function generatePdfBlob() {
    const documentId = buildElectronicDocumentId();
    try {
      await ensurePdfMake();
      if (window.pdfMake?.createPdf) {
        const dd = buildPdfDefinition(documentId);
        return await new Promise((resolve, reject) => {
          try {
            window.pdfMake.createPdf(dd).getBlob((blob) => resolve(blob));
          } catch (e) {
            reject(e);
          }
        });
      }
    } catch (e) {
      warn("pdfMake generation failed; falling back to canvas render.", e);
    }

    await ensurePdfLibs();
    return await generatePdfBlobFromCanvas(documentId);
  }

  function buildPdfDefinition(documentId) {
    const accent = String(CONFIG.DOC_ACCENT || "#306D89").trim() || "#306D89";
    const ink = "#111827";
    const muted = "#6b7280";
    const line = "#e5e7eb";

    const reference = String(state.draft.reference || "").trim() || "Brouillon";
    const issueDate = formatDateFR(state.draft.issue_date) || "—";
    const serviceDate = formatDateFR(state.draft.service_date) || "";
    const dueDate = formatDateFR(state.draft.due_date) || "—";
    const paymentTermsLabel = resolvePaymentTermsLabel();

    const splitLines = (value) =>
      String(value || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    const sellerName =
      [String(COMPANY.legal_form || "").trim(), String(COMPANY.name || "").trim()].filter(Boolean).join(" ") ||
      String(COMPANY.name || "").trim();
    const sellerLines = [];
    if (String(COMPANY.address || "").trim()) sellerLines.push(...splitLines(COMPANY.address));
    const sellerContact = [String(COMPANY.email || "").trim(), String(COMPANY.phone || "").trim()].filter(Boolean).join(" • ");
    if (sellerContact) sellerLines.push(sellerContact);

    const buyerName = String(state.draft.client_name || "").trim() || "Client";
    const buyerLines = [];
    if (String(state.draft.contact_name || "").trim()) buyerLines.push(String(state.draft.contact_name || "").trim());
    if (String(state.draft.client_address || "").trim()) buyerLines.push(...splitLines(state.draft.client_address));

    const interventionRef = (() => {
      const id = String(state.selectedInterventionId || "").trim();
      if (!id) return "";
      const itv = state.interventions.find((i) => String(i.id) === id);
      if (!itv) return "";
      const ref = String(itv.internal_ref || itv.client_ref || "").trim();
      return ref ? ref : String(itv.title || "").trim();
    })();

    const items = (state.draft.items || []).filter((it) => {
      if (!it) return false;
      const nameOk = String(it.name || "").trim().length > 0;
      const qtyOk = Number(it.qty || 0) > 0;
      const priceOk = Number(it.unit_cents || 0) > 0;
      return nameOk || qtyOk || priceOk;
    });
    if (!items.length) items.push(createItem());

    const tableBody = [
      [
        { text: "Designation", style: "th" },
        { text: "Quantite", style: "th", alignment: "right" },
        { text: "Unite", style: "th" },
        { text: "Prix unitaire", style: "th", alignment: "right" },
        { text: "TVA", style: "th", alignment: "right" },
        { text: "Montant HT", style: "th", alignment: "right" },
      ],
      ...items.map((item) => {
        const rate = sanitizeVatRate(item.vat_rate ?? state.draft.vat_rate);
        const qty = Math.max(1, Number(item.qty || 1));
        const qtyTxt = Number.isFinite(qty)
          ? qty.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "1,00";
        return [
          { text: String(item.name || "—"), style: "td" },
          { text: qtyTxt, style: "td", alignment: "right" },
          { text: String(item.unit || ""), style: "td" },
          { text: formatMoney(Number(item.unit_cents || 0), CONFIG.CURRENCY), style: "td", alignment: "right" },
          { text: `${String(rate).replace(".", ",")}%`, style: "td", alignment: "right" },
          { text: formatMoney(calcLineTotal(item), CONFIG.CURRENCY), style: "td", alignment: "right" },
        ];
      }),
    ];

    const subtotalCents = Number(state.draft.subtotal_cents || 0);
    const discountCents = Math.max(0, Number(state.draft.discount_cents || 0));
    const totalHtCents = Math.max(0, subtotalCents - discountCents);

    const vatBreakdown = computeVatBreakdown(state.draft.items, subtotalCents, discountCents, state.draft.vat_rate);
    const vatLines = vatBreakdown.length
      ? vatBreakdown.map((row) => ({
          label: `TVA ${String(row.rate).replace(".", ",")} %`,
          value: formatMoney(row.vat_cents, CONFIG.CURRENCY),
        }))
      : [{ label: "TVA", value: formatMoney(state.draft.vat_cents, CONFIG.CURRENCY) }];

    const totalsBody = [];
    if (discountCents > 0) {
      totalsBody.push([
        { text: "Remise", style: "totalKeyMuted" },
        { text: `-${formatMoney(discountCents, CONFIG.CURRENCY)}`, style: "totalValMuted", alignment: "right" },
      ]);
    }
    totalsBody.push([
      { text: "Total HT", style: "totalKey" },
      { text: formatMoney(totalHtCents, CONFIG.CURRENCY), style: "totalVal", alignment: "right" },
    ]);
    vatLines.forEach((l) => {
      totalsBody.push([
        { text: l.label, style: "totalKey" },
        { text: l.value, style: "totalVal", alignment: "right" },
      ]);
    });
    totalsBody.push([
      { text: "Total TTC", style: "totalKeyStrong" },
      { text: formatMoney(state.draft.total_cents, CONFIG.CURRENCY), style: "totalValStrong", alignment: "right" },
    ]);

    const bankStack = [];
    const iban = String(COMPANY.iban || "").trim();
    const bic = String(COMPANY.bic || "").trim();
    if (iban) bankStack.push({ text: `IBAN : ${iban}`, style: "note" });
    if (bic) bankStack.push({ text: `BIC : ${bic}`, style: "note" });

    const legalParts = [];
    const latePaymentText = String(resolveLatePaymentText() || "").trim();
    if (latePaymentText) legalParts.push(latePaymentText);
    const vatEx = String(resolveVatExemptionText() || "").trim();
    if (vatEx && Number(state.draft.vat_cents || 0) === 0) legalParts.push(vatEx);
    if (legalParts.length) bankStack.push({ text: legalParts.join(" "), style: "note", margin: [0, 6, 0, 0] });

    const notes = String(state.draft.notes || "").trim();
    if (notes) bankStack.push({ text: `Notes : ${notes}`, style: "note", margin: [0, 6, 0, 0] });
    const terms = String(state.draft.terms || "").trim();
    if (terms) bankStack.push({ text: `Mentions : ${terms}`, style: "note", margin: [0, 6, 0, 0] });

    const siren = String(COMPANY.siret || "").replace(/\D/g, "").slice(0, 9);
    const capitalEuros = Number(COMPANY.share_capital_cents || 0) > 0 ? Math.round(Number(COMPANY.share_capital_cents || 0) / 100) : 0;
    const footerLines = [];
    if (sellerName && capitalEuros > 0) footerLines.push(`${sellerName} au capital de ${capitalEuros.toLocaleString("fr-FR")} euros`);
    else if (sellerName) footerLines.push(sellerName);
    const regParts = [];
    if (siren) regParts.push(`SIREN ${siren}`);
    if (COMPANY.rcs_city || COMPANY.rcs_number) regParts.push(`RCS ${String(COMPANY.rcs_city || "").trim()} ${String(COMPANY.rcs_number || "").trim()}`.trim());
    if (COMPANY.naf_code) regParts.push(`NAF ${String(COMPANY.naf_code || "").trim()}`);
    if (regParts.length) footerLines.push(regParts.join(" - "));
    const vatNumber = String(COMPANY.vat_number || COMPANY.tva || "").trim();
    if (vatNumber) footerLines.push(`TVA intracommunautaire : ${vatNumber}`);

    const metaLeft = [
      { text: `Facture N° ${reference}`, style: "docNumber" },
      ...(interventionRef ? [{ text: interventionRef, style: "meta" }] : []),
      { text: `Date d'emission : ${issueDate}`, style: "meta" },
      ...(serviceDate ? [{ text: `Date de prestation : ${serviceDate}`, style: "meta" }] : []),
    ];
    const metaRight = [
      { text: `Reglement : ${paymentTermsLabel}`, style: "meta", alignment: "right" },
      { text: `Echeance : ${dueDate}`, style: "meta", alignment: "right" },
    ];

    const tableLayout = {
      hLineWidth: (i) => (i === 0 ? 0 : 0.6),
      vLineWidth: () => 0,
      hLineColor: () => line,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: (i) => (i === 0 ? 6 : 5),
      paddingBottom: (i) => (i === 0 ? 6 : 5),
      fillColor: (rowIndex) => (rowIndex === 0 ? accent : null),
    };

    const dd = {
      pageSize: "A4",
      pageMargins: [42, 42, 42, 86],
      info: {
        title: `Facture ${reference}`,
        author: COMPANY.name,
        subject: "Facture",
        keywords: `mbl,invoice,${documentId}`,
      },
      defaultStyle: { fontSize: 9, color: ink },
      styles: {
        sellerName: { fontSize: 9, bold: true, color: accent },
        partyLine: { fontSize: 9, color: muted },
        docNumber: { fontSize: 10, bold: true, color: accent, margin: [0, 0, 0, 2] },
        meta: { fontSize: 9, color: accent },
        th: { fontSize: 9, bold: true, color: "#ffffff" },
        td: { fontSize: 9, color: ink },
        note: { fontSize: 8, color: muted, lineHeight: 1.25 },
        totalKey: { fontSize: 9, bold: true, color: accent },
        totalVal: { fontSize: 9, bold: true, color: accent },
        totalKeyStrong: { fontSize: 10, bold: true, color: accent },
        totalValStrong: { fontSize: 10, bold: true, color: accent },
        totalKeyMuted: { fontSize: 9, color: muted, bold: true },
        totalValMuted: { fontSize: 9, color: muted, bold: true },
        footer: { fontSize: 8, color: accent },
      },
      content: [
        {
          columns: [
            {
              width: "*",
              stack: [{ text: sellerName, style: "sellerName" }, ...sellerLines.map((l) => ({ text: l, style: "partyLine" }))],
            },
            {
              width: 240,
              stack: [{ text: buyerName, style: "sellerName", alignment: "right" }, ...buyerLines.map((l) => ({ text: l, style: "partyLine", alignment: "right" }))],
            },
          ],
          columnGap: 18,
          margin: [0, 0, 0, 16],
        },
        {
          columns: [
            { width: "*", stack: metaLeft },
            { width: 240, stack: metaRight },
          ],
          columnGap: 18,
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", 48, 54, 76, 42, 86],
            body: tableBody,
          },
          layout: tableLayout,
          margin: [0, 0, 0, 10],
        },
        {
          columns: [
            { width: "*", stack: bankStack.length ? bankStack : [] },
            {
              width: 220,
              table: { widths: ["*", "auto"], body: totalsBody },
              layout: "noBorders",
            },
          ],
          columnGap: 18,
          margin: [0, 8, 0, 0],
        },
      ],
      footer: (currentPage, pageCount) => {
        const stack = footerLines.map((t) => ({ text: t, style: "footer", alignment: "center" }));
        stack.push({ text: `Page ${currentPage}/${pageCount}`, style: "footer", alignment: "center", margin: [0, 4, 0, 0] });
        return { margin: [42, 0, 42, 20], stack };
      },
    };

    return dd;
  }

  async function generatePdfBlobFromCanvas(documentId) {
    const target = els.preview.querySelector(".dv-paper") || els.preview;
    const stage = document.createElement("div");
    stage.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;";
    const clone = target.cloneNode(true);
    clone.style.width = "794px"; // A4 @ 96dpi
    clone.style.maxWidth = "794px";
    clone.style.margin = "0";
    stage.appendChild(clone);
    document.body.appendChild(stage);

    await new Promise((r) => requestAnimationFrame(() => r()));

    const canvas = await window.html2canvas(clone, {
      scale: 2.6,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
    });
    document.body.removeChild(stage);

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new window.jspdf.jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * printableWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "JPEG", margin, position, printableWidth, imgHeight);
    heightLeft -= printableHeight;

    while (heightLeft > 0) {
      position -= printableHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, position, printableWidth, imgHeight);
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
    a.download = `${(state.draft.reference || "facture")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveInvoice(nextStatus = STATUS_DRAFT) {
    if (!state.organizationId) {
      return { ok: false, denied: true, reason: "org_missing" };
    }

    if (!CONFIG.INVOICES_TABLE) {
      return { ok: false, reason: "missing_table_name" };
    }

    const payload = {
      organization_id: state.organizationId,
      status: String(nextStatus || STATUS_DRAFT),
      reference: state.draft.reference || null,

      client_id: state.selectedClientId || null,
      intervention_id: state.selectedInterventionId || null,

      client_name: state.draft.client_name || null,
      client_email: state.draft.client_email || null,
      client_phone: state.draft.client_phone || null,
      client_address: state.draft.client_address || null,

      issue_date: state.draft.issue_date || null,
      service_date: state.draft.service_date || null,
      due_date: state.draft.due_date || null,

      notes: state.draft.notes || null,
      terms: state.draft.terms || null,
      vat_exemption_text: String(state.draft.vat_exemption_text || "").trim() || null,
      items: state.draft.items,
      subtotal_cents: state.draft.subtotal_cents || 0,
      discount_cents: state.draft.discount_cents || 0,
      vat_cents: state.draft.vat_cents || 0,
      total_cents: state.draft.total_cents || 0,
      currency: CONFIG.CURRENCY,

      created_by: state.currentUserId || null,
      created_at: new Date().toISOString(),
    };

    const res = await upsertInvoiceRow(payload);
    if (!res.error) {
      const row = res.data || {};
      state.invoiceId = row.id || state.invoiceId || null;
      if (row.reference) state.draft.reference = String(row.reference || "");
      if (row.status) state.draft.status = String(row.status || "");
      if (row.issue_date) state.draft.issue_date = String(row.issue_date || "");
      if (row.service_date) state.draft.service_date = String(row.service_date || "");
      if (row.due_date) state.draft.due_date = String(row.due_date || "");
      return { ok: true, row };
    }

    if (isPermissionDenied(res.error)) return { ok: false, denied: true, reason: "rls" };
    if (isTableMissing(res.error)) return { ok: false, reason: "missing_table" };
    if (isConstraintViolation(res.error)) return { ok: false, reason: "constraint" };
    if (isMissingColumnError(res.error)) return { ok: false, reason: "missing_column" };

    throw res.error;
  }

  async function upsertInvoiceRow(payload) {
    if (state.invoiceId) {
      const updatePayload = { ...payload, updated_at: new Date().toISOString() };
      delete updatePayload.created_at;
      delete updatePayload.created_by;
      const upd = await supabase
        .from(CONFIG.INVOICES_TABLE)
        .update(updatePayload)
        .eq("id", state.invoiceId)
        .select("id,reference,status,issue_date,service_date,due_date,pdf_path,pdf_url,created_at,updated_at")
        .maybeSingle();
      return upd;
    }
    return supabase
      .from(CONFIG.INVOICES_TABLE)
      .insert(payload)
      .select("id,reference,status,issue_date,service_date,due_date,pdf_path,pdf_url,created_at,updated_at")
      .maybeSingle();
  }

  async function updateInvoicePdfReference(uploaded) {
    if (!state.invoiceId || !uploaded?.path) return;

    const nowIso = new Date().toISOString();
    const base = { pdf_path: uploaded.path };
    const withUrl = uploaded.url ? { ...base, pdf_url: uploaded.url } : null;
    const variants = [
      withUrl ? { ...withUrl, updated_at: nowIso } : null,
      withUrl ? withUrl : null,
      { ...base, updated_at: nowIso },
      base,
    ].filter(Boolean);

    for (const payload of variants) {
      const res = await supabase.from(CONFIG.INVOICES_TABLE).update(payload).eq("id", state.invoiceId);
      if (!res.error) return;
      if (!isMissingColumnError(res.error)) return;
    }
  }

  async function uploadPdfToStorage(blob) {
    const invoicePart = state.invoiceId || randomId();
    const fileName = `${Date.now()}_${randomId()}.pdf`;
    const orgPart = asUuid(state.organizationId);
    if (!orgPart) return { denied: true, error: { message: "organization_id missing" } };
    const candidates = [`factures/${orgPart}/${invoicePart}/${fileName}`];

    let denied = false;
    let lastError = null;
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
      lastError = up.error;
      warn("PDF upload failed", { bucket: CONFIG.BUCKET, path, error: up.error });
      if (isPermissionDenied(up.error)) denied = true;
    }

    if (denied) return { denied: true, error: lastError };
    return { error: lastError };
  }

  async function resolvePdfUrlFromPath(path) {
    const clean = String(path || "").trim();
    if (!clean) return "";

    const signed = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(clean, 300);
    if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;

    const pub = supabase.storage.from(CONFIG.BUCKET).getPublicUrl(clean);
    return pub?.data?.publicUrl || "";
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
      state.invoiceId = null;
      state.selectedClientId = "";
      state.selectedInterventionId = "";
      state.pdf = { url: "", path: "" };
      hydrateDraft();
      renderItems();
      updateTotals();
      updatePreview();
      persistDraft();
      if (els.previewLink) {
        els.previewLink.hidden = true;
        els.previewLink.removeAttribute("href");
      }
    });

    els.btnDownload.addEventListener("click", downloadPdf);

    async function runSaveFlow(mode, button, busyLabel) {
      const oldSaveLabel = els.btnSave.textContent;
      const oldValidateLabel = els.btnValidate.textContent;
      els.btnSave.disabled = true;
      els.btnValidate.disabled = true;
      if (button) button.textContent = busyLabel;
      try {
        const saved = await saveInvoice(mode);
        if (saved?.ok) {
          hydrateDraft();
          updatePreview();
        }
        const blob = await generatePdfBlob();
        const uploaded = await uploadPdfToStorage(blob);

        if (uploaded?.path) {
          const bestUrl = uploaded.url || (await resolvePdfUrlFromPath(uploaded.path));
          state.pdf = { ...uploaded, url: bestUrl || uploaded.url || "" };
          if (bestUrl) {
            els.previewLink.href = bestUrl;
            els.previewLink.hidden = false;
          }
          await updateInvoicePdfReference({ ...uploaded, url: uploaded.url || "" });
        }

        if (saved?.ok && uploaded?.path && mode === STATUS_VALIDATED) {
          showToast("success", STR.msgValidated);
        } else if (saved?.ok && uploaded?.path) {
          showToast("success", STR.msgSavedWithPdf);
        } else if (saved?.ok && uploaded?.denied) {
          showToast("warning", STR.msgStorageDenied);
          if (DEBUG && uploaded?.error) warn("Storage denied details:", uploaded.error);
        } else if (saved?.ok && uploaded?.error) {
          const msg = String(uploaded.error?.message || uploaded.error?.error || "").trim();
          showToast("warning", msg ? `Upload PDF impossible: ${msg}` : STR.msgSavedNoPdf);
          if (DEBUG) warn("Storage upload error details:", uploaded.error);
        } else if (saved?.ok && !uploaded?.path) {
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

        // Reference is assigned by DB when invoice is issued (status moves out of draft).
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
    els.btnValidate.addEventListener("click", () => runSaveFlow(STATUS_VALIDATED, els.btnValidate, "Emission..."));

    els.client.addEventListener("input", onHeaderInput);
    els.contact.addEventListener("input", onHeaderInput);
    els.email.addEventListener("input", onHeaderInput);
    els.phone.addEventListener("input", onHeaderInput);
    els.address.addEventListener("input", onHeaderInput);
    els.issueDate.addEventListener("input", () => {
      // Keep due date in sync when user edits invoice date and due date is empty.
      if (!String(els.dueDate.value || "").trim()) {
        els.dueDate.value = addDaysISO(els.issueDate.value, resolvePaymentTermsDays());
      }
      onHeaderInput();
    });
    els.serviceDate.addEventListener("input", onHeaderInput);
    els.dueDate.addEventListener("input", onHeaderInput);
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
    if (els.vatExemptionPreset) els.vatExemptionPreset.addEventListener("change", onVatExemptionPresetChange);
    if (els.vatExemptionText) els.vatExemptionText.addEventListener("input", onVatExemptionTextInput);

    els.intervention.addEventListener("change", onInterventionSelect);
    els.clientSelect.addEventListener("change", onClientSelect);
  }

  function onHeaderInput() {
    state.draft.client_name = els.client.value;
    state.draft.contact_name = els.contact.value;
    state.draft.client_email = els.email.value;
    state.draft.client_phone = els.phone.value;
    state.draft.client_address = els.address.value;
    state.draft.issue_date = els.issueDate.value;
    state.draft.service_date = els.serviceDate.value;
    state.draft.due_date = els.dueDate.value;
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

  function onVatExemptionPresetChange() {
    const id = String(els.vatExemptionPreset?.value || "").trim();
    if (!id) {
      state.draft.vat_exemption_text = "";
      if (els.vatExemptionText) els.vatExemptionText.value = "";
    } else if (id !== "__custom__") {
      const hit = VAT_EXEMPTION_PRESETS.find((p) => p.id === id);
      if (hit) {
        state.draft.vat_exemption_text = hit.text;
        if (els.vatExemptionText) els.vatExemptionText.value = hit.text;
        // Exemptions usually imply 0% VAT.
        if (sanitizeVatRate(state.draft.vat_rate) !== 0) {
          state.draft.vat_rate = 0;
          els.vatRate.value = "0";
          applyVatToAllItems(0);
          renderItems();
        }
      }
    }

    updateTotals();
    updatePreview();
    persistDraft();
  }

  function onVatExemptionTextInput() {
    state.draft.vat_exemption_text = String(els.vatExemptionText?.value || "").trim();
    if (els.vatExemptionPreset) {
      els.vatExemptionPreset.value = vatExemptionPresetIdFromText(state.draft.vat_exemption_text);
    }
    updateTotals();
    updatePreview();
    persistDraft();
  }

  function onInterventionSelect() {
    const id = String(els.intervention.value || "").trim();
    if (!id) {
      state.selectedInterventionId = "";
      removeInterventionLineItem();
      renderItems();
      updateTotals();
      updatePreview();
      persistDraft();
      return;
    }
    const found = state.interventions.find((it) => String(it.id) === String(id));
    if (!found) return;
    state.selectedInterventionId = String(found.id || "");
    els.client.value = found.client_name || "";
    els.address.value = found.address || "";
    els.email.value = found.client_email || "";
    els.phone.value = found.client_phone || found.support_phone || "";
    upsertInterventionLineItem(found);
    renderItems();
    onHeaderInput();
  }

  function isBlankItem(item) {
    if (!item) return true;
    const name = String(item.name || "").trim();
    const cents = Number(item.unit_cents || 0);
    return !name && (!Number.isFinite(cents) || cents <= 0);
  }

  function interventionTarifToCents(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const v = Math.round(n);
    // Heuristic: money fields are usually stored in cents in this project.
    // interventions.tarif has legacy naming, so accept both EUR and cents.
    if (v < 1000) return v * 100;
    return v;
  }

  function buildInterventionLineItem(itv) {
    const internal = String(itv.internal_ref || "").trim();
    const clientRef = String(itv.client_ref || "").trim();
    const title = String(itv.title || "Intervention").trim();
    const prefix = internal || clientRef;
    const name = prefix ? `${prefix} - ${title}` : title;
    const unitCents = interventionTarifToCents(itv.tarif);
    return {
      kind: "intervention",
      intervention_id: String(itv.id || ""),
      name,
      qty: 1,
      unit: "forfait",
      unit_cents: unitCents,
      vat_rate: sanitizeVatRate(state.draft.vat_rate ?? CONFIG.VAT_RATE),
    };
  }

  function upsertInterventionLineItem(itv) {
    const next = buildInterventionLineItem(itv);
    const items = Array.isArray(state.draft.items) ? state.draft.items : [];
    const existingIdx = items.findIndex((x) => String(x?.kind || "") === "intervention");
    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...next };
      state.draft.items = items;
      return;
    }
    if (items.length === 1 && isBlankItem(items[0])) {
      items[0] = next;
      state.draft.items = items;
      return;
    }
    items.unshift(next);
    state.draft.items = items;
  }

  function removeInterventionLineItem() {
    const items = (state.draft.items || []).filter((x) => String(x?.kind || "") !== "intervention");
    state.draft.items = items.length ? items : [createItem()];
  }

  function onClientSelect() {
    const id = els.clientSelect.value;
    if (!id) return;
    const found = state.clients.find((c) => String(c.id) === String(id));
    if (!found) return;
    state.selectedClientId = String(found.id || "");
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

  function computeVatBreakdown(items, subtotal, discount, fallbackRate) {
    const safeSubtotal = Math.max(0, Number(subtotal || 0));
    if (safeSubtotal === 0) return [];

    const safeDiscount = Math.max(0, Number(discount || 0));
    const taxable = Math.max(0, safeSubtotal - safeDiscount);
    const ratio = taxable / safeSubtotal;

    const baseByRate = new Map();
    const rawVatByRate = new Map();

    (items || []).forEach((item) => {
      const rate = sanitizeVatRate(item?.vat_rate ?? fallbackRate);
      const base = Math.max(0, Number(calcLineTotal(item) || 0));
      baseByRate.set(rate, (baseByRate.get(rate) || 0) + base);
      rawVatByRate.set(rate, (rawVatByRate.get(rate) || 0) + Math.round(base * (rate / 100)));
    });

    const rates = Array.from(baseByRate.keys()).sort((a, b) => Number(a) - Number(b));
    return rates
      .map((rate) => {
        const baseRaw = baseByRate.get(rate) || 0;
        const vatRaw = rawVatByRate.get(rate) || 0;
        const baseAdj = Math.round(baseRaw * ratio);
        const vatAdj = Math.round(vatRaw * ratio);
        return { rate, base_cents: baseAdj, vat_cents: vatAdj, total_cents: baseAdj + vatAdj };
      })
      .filter((row) => row.base_cents || row.vat_cents);
  }

  function createItem() {
    return {
      name: "",
      qty: 1,
      unit: "",
      unit_cents: 0,
      vat_rate: sanitizeVatRate(CONFIG.VAT_RATE),
    };
  }

  function defaultDraft() {
    const issue = todayISODate();
    const due = addDaysISO(issue, Math.max(0, Number(CONFIG.PAYMENT_TERMS_DAYS || 30)));
    return {
      client_name: "",
      contact_name: "",
      client_email: "",
      client_phone: "",
      client_address: "",
      reference: "",
      issue_date: issue,
      service_date: issue,
      due_date: due,
      notes: "",
      terms: "",
      vat_exemption_text: "",
      items: [createItem()],
      discount_type: "none",
      discount_value: 0,
      vat_rate: sanitizeVatRate(CONFIG.VAT_RATE),
      status: STATUS_DRAFT,
    };
  }

  function persistDraft() {
    // Intentionally no cross-page persistence:
    // each new invoice page starts clean except business context prefill.
  }

  function loadDraft() {
    return defaultDraft();
  }

  function todayFR() {
    return new Date().toLocaleDateString("fr-FR");
  }

  function todayISODate() {
    return toISODateLocal(new Date());
  }

  function toISODateLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function addDaysISO(isoDate, days) {
    const base = String(isoDate || "").trim();
    const d = new Date(base ? `${base}T00:00:00` : Date.now());
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Math.round(Number(days || 0)));
    return toISODateLocal(d);
  }

  function resolvePaymentTermsDays() {
    const org = Number(state.orgProfile?.payment_terms_days);
    if (Number.isFinite(org) && org >= 0) return Math.round(org);
    const cfg = Number(CONFIG.PAYMENT_TERMS_DAYS);
    if (Number.isFinite(cfg) && cfg >= 0) return Math.round(cfg);
    return 30;
  }

  function resolvePaymentTermsLabel() {
    const label = String(CONFIG.PAYMENT_TERMS_LABEL || "").trim();
    if (label) return label;
    return `${resolvePaymentTermsDays()} jours`;
  }

  function resolveLateFeeRate() {
    const org = Number(state.orgProfile?.late_fee_rate);
    if (Number.isFinite(org) && org >= 0) return org;
    return 10.0;
  }

  function resolveRecoveryFeeCents() {
    const org = Number(state.orgProfile?.recovery_fee_cents);
    if (Number.isFinite(org) && org >= 0) return Math.round(org);
    return 4000;
  }

  function resolveVatExemptionText() {
    const draft = String(state.draft?.vat_exemption_text || "").trim();
    if (draft) return draft;
    const txt = String(state.orgProfile?.vat_exemption_text || "").trim();
    return txt;
  }

  function normalizeSpaces(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function vatExemptionPresetIdFromText(text) {
    const safe = normalizeSpaces(text);
    if (!safe) return "";
    const hit = VAT_EXEMPTION_PRESETS.find((p) => normalizeSpaces(p.text) === safe);
    return hit ? hit.id : "__custom__";
  }

  function formatPercentFR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const rounded = Math.round(n * 100) / 100;
    const raw = String(rounded);
    return raw.replace(".", ",");
  }

  function renderLateFeeLine() {
    const rate = resolveLateFeeRate();
    if (!Number.isFinite(rate)) return "";
    return `<div>Penalites de retard: taux annuel ${escapeHTML(formatPercentFR(rate))}%.</div>`;
  }

  function renderRecoveryFeeLine() {
    const cents = resolveRecoveryFeeCents();
    if (!Number.isFinite(cents) || cents <= 0) return "";
    return `<div>Indemnite forfaitaire pour frais de recouvrement: ${escapeHTML(formatMoney(cents, CONFIG.CURRENCY))}.</div>`;
  }

  function renderVatExemptionLine() {
    const txt = resolveVatExemptionText();
    if (!txt) return "";
    if (Number(state.draft.vat_cents || 0) !== 0) return "";
    return `<div>${escapeHTML(txt)}</div>`;
  }

  function resolveLatePaymentText() {
    const custom = String(CONFIG.LATE_PAYMENT_TEXT || "").trim();
    if (custom) return custom;

    const recoveryFeeCents = resolveRecoveryFeeCents();
    const rate = resolveLateFeeRate();

    const penaltyPart = Number.isFinite(rate)
      ? `une penalite de taux annuel ${formatPercentFR(rate)}%`
      : "des penalites de retard";
    const recoveryPart =
      Number.isFinite(recoveryFeeCents) && recoveryFeeCents > 0
        ? `, a laquelle s'ajoute une indemnite forfaitaire pour frais de recouvrement de ${formatMoney(recoveryFeeCents, CONFIG.CURRENCY)}`
        : "";

    return `En cas de retard de paiement, ${penaltyPart} sera appliquee${recoveryPart}.`;
  }

  function defaultValidityDate() {
    const d = new Date();
    d.setDate(d.getDate() + CONFIG.PAYMENT_TERMS_DAYS);
    return d.toISOString().slice(0, 10);
  }

  async function ensurePdfLibs() {
    if (window.jspdf?.jsPDF && window.html2canvas) return;
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }

  async function ensurePdfMake() {
    if (window.pdfMake?.createPdf) return;
    await loadScript("https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js");
    // Must be loaded after pdfmake. Defines pdfMake.vfs for the default font.
    await loadScript("https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js");
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

  async function loadOrganizationProfile() {
    if (!state.organizationId) return;
    const res = await supabase
      .from("organization_profiles")
      .select(
        "organization_id,legal_name,trade_name,legal_form,share_capital_cents,siret,vat_number,rcs_city,rcs_number,naf_code,address,postal_code,city,country,email,phone,invoice_prefix,invoice_padding,payment_terms_days,late_fee_rate,recovery_fee_cents,vat_exemption_text,footer_notes"
      )
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (res.error || !res.data) return;

    const p = res.data;
    state.orgProfile = p;

    if (!String(COMPANY.name || "").trim()) COMPANY.name = String(p.trade_name || p.legal_name || "").trim();
    if (!String(COMPANY.address || "").trim()) COMPANY.address = String(p.address || "").trim();
    if (!String(COMPANY.email || "").trim()) COMPANY.email = String(p.email || "").trim();
    if (!String(COMPANY.phone || "").trim()) COMPANY.phone = String(p.phone || "").trim();
    if (!String(COMPANY.siret || "").trim()) COMPANY.siret = String(p.siret || "").trim();
    if (!String(COMPANY.vat_number || "").trim()) COMPANY.vat_number = String(p.vat_number || "").trim();
    if (!String(COMPANY.legal_form || "").trim()) COMPANY.legal_form = String(p.legal_form || "").trim();
    if (!String(COMPANY.rcs_city || "").trim()) COMPANY.rcs_city = String(p.rcs_city || "").trim();
    if (!String(COMPANY.rcs_number || "").trim()) COMPANY.rcs_number = String(p.rcs_number || "").trim();
    if (!String(COMPANY.naf_code || "").trim()) COMPANY.naf_code = String(p.naf_code || "").trim();
    if (!Number(COMPANY.share_capital_cents || 0)) COMPANY.share_capital_cents = Number(p.share_capital_cents || 0);

    // Backward compat: keep using COMPANY.tva in UI/PDF when set.
    if (!String(COMPANY.tva || "").trim() && String(COMPANY.vat_number || "").trim()) {
      COMPANY.tva = COMPANY.vat_number;
    }
  }

  async function detectColumns(table, cols) {
    const out = {};
    const list = Array.isArray(cols) ? cols : [];
    for (const c of list) {
      try {
        const r = await supabase.from(table).select(`id,${c}`).limit(1);
        if (!r.error) out[c] = true;
        else if (isMissingColumnError(r.error)) out[c] = false;
        else out[c] = false;
      } catch (_) {
        out[c] = false;
      }
    }
    return out;
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const seed = ref || `FA-${todayCompact()}`;
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

  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
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
              <div class="dv-card-title">Facture</div>
              <div class="dv-field"><label>${copy.labelRef}</label><input class="dv-input" data-ref readonly /></div>
              <div class="dv-field"><label>${copy.labelIssueDate}</label><input class="dv-input" type="date" data-issue-date /></div>
              <div class="dv-field"><label>${copy.labelServiceDate}</label><input class="dv-input" type="date" data-service-date /></div>
              <div class="dv-field"><label>${copy.labelValidity}</label><input class="dv-input" type="date" data-due-date /></div>
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
	              <div class="dv-field">
	                <label>Mention TVA (si exonération)</label>
	                <select class="dv-input" data-vat-exemption-preset>
	                  <option value="">Aucune</option>
	                  ${VAT_EXEMPTION_PRESETS.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.label)}</option>`).join("")}
	                  <option value="__custom__">Autre (personnalisee)</option>
	                </select>
	                <textarea class="dv-textarea" data-vat-exemption-text rows="2" placeholder="Ex: TVA non applicable, art. 293 B du CGI."></textarea>
	                <div class="dv-help">Affiche en bas de facture uniquement si TVA = 0.</div>
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
      issueDate: rootEl.querySelector("[data-issue-date]"),
      serviceDate: rootEl.querySelector("[data-service-date]"),
      dueDate: rootEl.querySelector("[data-due-date]"),
      notes: rootEl.querySelector("[data-notes]"),
      terms: rootEl.querySelector("[data-terms]"),
      items: rootEl.querySelector("[data-items]"),
      discountType: rootEl.querySelector("[data-discount-type]"),
      discountValue: rootEl.querySelector("[data-discount-value]"),
      vatRate: rootEl.querySelector("[data-vat-rate]"),
      vatExemptionPreset: rootEl.querySelector("[data-vat-exemption-preset]"),
      vatExemptionText: rootEl.querySelector("[data-vat-exemption-text]"),
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
      .dv-help {
        margin-top: 6px;
        font-size: 11px;
        color: var(--dv-ink-soft);
        line-height: 1.35;
      }
      .dv-items {
        display: grid;
        gap: 10px;
      }
      .dv-row {
        display: grid;
        grid-template-columns: 1.5fr 0.45fr 0.6fr 0.6fr 0.55fr 0.7fr auto;
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
        padding: 10px;
        border: 1px solid #e2ebff;
        box-shadow: inset 0 1px 0 #ffffff;
        min-height: 460px;
      }
      .dv-paper {
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 0;
        box-shadow: none;
        padding: 28px;
        box-sizing: border-box;
        min-height: 1123px; /* A4-ish at 96dpi for on-screen preview */
        display: flex;
        flex-direction: column;
        gap: 12px;
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
      .dv-paper-top--plain {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-bottom: 0;
        padding-bottom: 0;
        gap: 18px;
      }
      .dv-seller,
      .dv-buyer {
        display: grid;
        gap: 4px;
      }
      .dv-buyer {
        text-align: right;
      }
      .dv-seller-name,
      .dv-buyer-name {
        font-size: 12px;
        font-weight: 800;
        color: var(--doc-accent, #306D89);
      }
      .dv-seller-line,
      .dv-buyer-line {
        font-size: 11px;
        color: #6b7280;
        line-height: 1.35;
        word-break: break-word;
      }
      .dv-doc-meta {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        color: var(--doc-accent, #306D89);
        font-size: 11px;
        line-height: 1.35;
      }
      .dv-doc-number {
        font-weight: 900;
        font-size: 12px;
        margin-bottom: 3px;
      }
      .dv-doc-meta-right {
        text-align: right;
      }
      .dv-doc-line {
        word-break: break-word;
      }
      .dv-paper-lines--plain {
        border-top: 0;
        padding-top: 0;
      }
      .dv-preview-table--legal th,
      .dv-preview-table--legal td {
        border-bottom-color: #e5e7eb;
      }
      .dv-totals {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
      }
      .dv-totals-box {
        width: min(320px, 100%);
        display: grid;
        gap: 4px;
      }
      .dv-total-line {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: var(--doc-accent, #306D89);
        font-size: 11px;
        line-height: 1.35;
      }
      .dv-total-line strong {
        font-weight: 900;
      }
      .dv-total-line--grand {
        font-size: 12px;
      }
      .dv-total-line--muted {
        color: #6b7280;
      }
      .dv-bank {
        display: grid;
        gap: 8px;
        font-size: 10px;
        color: #6b7280;
        line-height: 1.4;
      }
      .dv-bank-lines {
        display: grid;
        gap: 4px;
      }
      .dv-bank strong,
      .dv-extra strong {
        color: #111827;
      }
      .dv-legal-note {
        font-size: 9px;
      }
      .dv-extra {
        font-size: 9px;
        color: #6b7280;
      }
      .dv-footer-legal {
        margin-top: auto;
        padding-top: 12px;
        text-align: center;
        font-size: 9px;
        color: var(--doc-accent, #306D89);
        line-height: 1.35;
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
      .dv-vat-wrap {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px dashed #c9daff;
      }
      .dv-vat-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
        font-weight: 800;
      }
      .dv-vat-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .dv-vat-table th,
      .dv-vat-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 6px 6px;
        text-align: left;
        vertical-align: top;
      }
      .dv-vat-table th {
        font-weight: 800;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #0f172a;
        background: #f8fbff;
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
        color: #ffffff;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        background: var(--doc-accent, #306D89);
      }
      .dv-col-label {
        width: 40%;
        word-break: break-word;
      }
      .dv-col-unit {
        width: 12%;
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
      .dv-paper-accept {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        align-items: start;
      }
      .dv-accept-card,
      .dv-legal-card {
        border: 1px solid #deebff;
        border-radius: 12px;
        padding: 12px;
        background: #fbfdff;
        display: grid;
        gap: 10px;
      }
      .dv-accept-title,
      .dv-legal-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        font-weight: 800;
      }
      .dv-accept-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .dv-accept-field {
        display: grid;
        gap: 6px;
        font-size: 12px;
        color: #0f172a;
      }
      .dv-accept-field span {
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 800;
      }
      .dv-accept-field--wide {
        grid-column: span 2;
      }
      .dv-accept-blank {
        height: 28px;
        border-radius: 10px;
        border: 1px dashed #c9daff;
        background: #ffffff;
      }
      .dv-accept-blank--tall {
        height: 70px;
      }
      .dv-legal-text {
        font-size: 12px;
        color: #334155;
        line-height: 1.55;
        display: grid;
        gap: 6px;
      }
      .dv-paper-footer {
        margin-top: 12px;
        border-top: 1px solid #e6eefc;
        padding-top: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        color: #475569;
      }
      .dv-paper-footer-left {
        display: grid;
        gap: 4px;
      }
      .dv-paper-footer-right {
        text-align: right;
        display: grid;
        gap: 4px;
      }
      .dv-paper-footer-brand {
        color: #0f172a;
        font-weight: 800;
      }
      .dv-paper-footer-sub {
        color: #64748b;
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
        .dv-paper-accept { grid-template-columns: 1fr; }
      }
	      @media (max-width: 720px) {
	        .dv-shell { padding: 16px; }
	        .dv-title { font-size: 26px; }
	        .dv-header { align-items: flex-start; }
	        .dv-row { grid-template-columns: 1fr 1fr; }
	        .dv-line-total { grid-column: span 2; }
	        .dv-paper { padding: 14px; min-height: 0; }
	        .dv-paper-top { flex-direction: column; }
	        .dv-paper-top--plain { grid-template-columns: 1fr; }
	        .dv-buyer { text-align: left; }
	        .dv-doc-meta { flex-direction: column; }
	        .dv-doc-meta-right { text-align: left; }
        .dv-doc { min-width: 0; width: 100%; }
        .dv-doc-pill { justify-self: start; }
      }
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return (
      document.querySelector("[data-facture]") ||
      document.querySelector("#facture-root") ||
      document.querySelector(".facture-root")
    );
  }
});
