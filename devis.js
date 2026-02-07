document.documentElement.setAttribute("data-page", "devis");

window.Webflow ||= [];
window.Webflow.push(async function () {
  const root = findRoot();
  if (!root) {
    console.error("[DEVIS] Root introuvable.");
    return;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  const GLOBAL_CFG = window.__MBL_CFG__ || {};

  const CONFIG = {
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
    msgPdfReady: "PDF genere.",
    msgPdfFail: "Impossible de generer le PDF.",
  };

  injectStyles();

  const els = renderShell(root, STR);
  wireActions();
  const state = {
    items: [],
    clients: [],
    interventions: [],
    products: [],
    productByName: new Map(),
    quoteId: null,
    pdf: { url: "", path: "" },
    draft: loadDraft(),
  };

  await boot();

  async function boot() {
    setStatus(STR.msgLoading);
    await Promise.all([loadClients(), loadInterventions(), loadProducts()]);
    hydrateDraft();
    renderItems();
    updateTotals();
    updatePreview();
    setStatus("");
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
    els.vatRate.value = d.vat_rate ?? CONFIG.VAT_RATE;
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
        <input class="dv-input dv-input--xs" data-field="vat" type="number" min="0" step="0.1" inputmode="decimal" value="${item.vat_rate}" />
        <div class="dv-line-total">${formatMoney(calcLineTotal(item), CONFIG.CURRENCY)}</div>
        <button type="button" class="dv-btn dv-btn--ghost dv-btn--xs" data-action="remove">Supprimer</button>
      `;
      row.addEventListener("input", onItemInput);
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
        item.vat_rate = Number.isFinite(hit.vat) ? hit.vat : CONFIG.VAT_RATE;
        row.querySelector('[data-field="price"]').value = centsToInput(item.unit_cents);
        row.querySelector('[data-field="vat"]').value = item.vat_rate;
      }
    } else if (field === "qty") {
      item.qty = Math.max(1, Number(e.target.value || 1));
    } else if (field === "price") {
      item.unit_cents = eurosToCents(Number(e.target.value || 0));
    } else if (field === "vat") {
      item.vat_rate = Math.max(0, Number(e.target.value || 0));
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
    const taxable = Math.max(0, subtotal - discount);
    const vat = Math.round(taxable * (Number(state.draft.vat_rate || CONFIG.VAT_RATE) / 100));
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
    const itemsHtml = state.draft.items
      .map((item) => {
        const lineTotal = calcLineTotal(item);
        return `
          <tr>
            <td>${escapeHTML(item.name || "—")}</td>
            <td>${item.qty}</td>
            <td>${formatMoney(item.unit_cents, CONFIG.CURRENCY)}</td>
            <td>${item.vat_rate}%</td>
            <td>${formatMoney(lineTotal, CONFIG.CURRENCY)}</td>
          </tr>
        `;
      })
      .join("");

    els.preview.innerHTML = `
      <div class="dv-preview-header">
        <div>
          <div class="dv-preview-title">${escapeHTML(COMPANY.name)}</div>
          <div class="dv-preview-sub">${escapeHTML(COMPANY.address)}</div>
          <div class="dv-preview-sub">${escapeHTML(COMPANY.email)} ${COMPANY.phone ? `• ${escapeHTML(COMPANY.phone)}` : ""}</div>
          ${COMPANY.siret ? `<div class="dv-preview-sub">SIRET: ${escapeHTML(COMPANY.siret)}</div>` : ""}
          ${COMPANY.tva ? `<div class="dv-preview-sub">TVA: ${escapeHTML(COMPANY.tva)}</div>` : ""}
        </div>
        <div class="dv-preview-meta">
          <div class="dv-preview-doc">DEVIS</div>
          <div>Ref: ${escapeHTML(state.draft.reference || "—")}</div>
          <div>Date: ${escapeHTML(todayFR())}</div>
          <div>Validite: ${escapeHTML(state.draft.valid_until || "—")}</div>
        </div>
      </div>

      <div class="dv-preview-client">
        <strong>${escapeHTML(state.draft.client_name || "Client")}</strong><br/>
        ${escapeHTML(state.draft.client_address || "")}<br/>
        ${escapeHTML(state.draft.client_email || "")}<br/>
        ${escapeHTML(state.draft.client_phone || "")}
      </div>

      <table class="dv-preview-table">
        <thead>
          <tr>
            <th>Libelle</th>
            <th>Qt</th>
            <th>PU</th>
            <th>TVA</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div class="dv-preview-totals">
        <div><span>Sous-total</span><strong>${formatMoney(state.draft.subtotal_cents, CONFIG.CURRENCY)}</strong></div>
        <div><span>Remise</span><strong>${formatMoney(state.draft.discount_cents, CONFIG.CURRENCY)}</strong></div>
        <div><span>TVA</span><strong>${formatMoney(state.draft.vat_cents, CONFIG.CURRENCY)}</strong></div>
        <div class="dv-preview-total"><span>Total</span><strong>${formatMoney(state.draft.total_cents, CONFIG.CURRENCY)}</strong></div>
      </div>

      <div class="dv-preview-notes">
        ${state.draft.notes ? `<div><strong>Notes:</strong> ${escapeHTML(state.draft.notes)}</div>` : ""}
        ${state.draft.terms ? `<div><strong>Conditions:</strong> ${escapeHTML(state.draft.terms)}</div>` : ""}
      </div>
    `;
  }

  async function generatePdfBlob() {
    await ensurePdfLibs();
    const target = els.preview;
    const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new window.jspdf.jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output("blob");
  }

  async function downloadPdf() {
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(state.draft.reference || "devis")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast("success", STR.msgPdfReady);
    } catch (e) {
      console.error(e);
      showToast("error", STR.msgPdfFail);
    }
  }

  async function saveQuote() {
    const payload = {
      organization_id: CONFIG.ORGANIZATION_ID || null,
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
      created_at: new Date().toISOString(),
    };

    if (!CONFIG.QUOTES_TABLE) {
      showToast("warning", STR.msgSavedPartial);
      return;
    }

    const res = await supabase.from(CONFIG.QUOTES_TABLE).insert(payload).select("id").maybeSingle();
    if (res.error) {
      if (isTableMissing(res.error) || isMissingColumnError(res.error)) {
        showToast("warning", STR.msgSavedPartial);
        return;
      }
      throw res.error;
    }
    state.quoteId = res.data?.id || null;
    showToast("success", STR.msgSaved);
  }

  async function uploadPdfToStorage(blob) {
    const path = `devis/${state.quoteId || "draft"}/${Date.now()}_${randomId()}.pdf`;
    const up = await supabase.storage.from(CONFIG.BUCKET).upload(path, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });
    if (up.error) return null;
    const { data } = supabase.storage.from(CONFIG.BUCKET).getPublicUrl(path);
    return { path, url: data?.publicUrl || "" };
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
      renderItems();
      updateTotals();
      updatePreview();
      persistDraft();
    });

    els.btnDownload.addEventListener("click", downloadPdf);

    els.btnSave.addEventListener("click", async () => {
      try {
        await saveQuote();
        const blob = await generatePdfBlob();
        const uploaded = await uploadPdfToStorage(blob);
        if (uploaded?.url) {
          state.pdf = uploaded;
          els.previewLink.href = uploaded.url;
          els.previewLink.hidden = false;
        }
      } catch (e) {
        console.error(e);
        showToast("error", STR.msgPdfFail);
      }
    });

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
    els.vatRate.addEventListener("input", onHeaderInput);

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
    state.draft.vat_rate = Number(els.vatRate.value || CONFIG.VAT_RATE);
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

  function createItem() {
    return {
      name: "",
      qty: 1,
      unit_cents: 0,
      vat_rate: CONFIG.VAT_RATE,
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
      vat_rate: CONFIG.VAT_RATE,
    };
  }

  function persistDraft() {
    localStorage.setItem("mbl-devis-draft", JSON.stringify(state.draft));
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem("mbl-devis-draft");
      return raw ? JSON.parse(raw) : defaultDraft();
    } catch (_) {
      return defaultDraft();
    }
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
    if (CONFIG.ORGANIZATION_ID) query = query.eq("organization_id", CONFIG.ORGANIZATION_ID);
    if (opts.order) query = query.order(opts.order, { ascending: !opts.desc });
    if (opts.limit) query = query.limit(opts.limit);
    let res = await query;
    if (res.error && isMissingColumnError(res.error)) {
      let q2 = supabase.from(table).select(select);
      if (opts.order) q2 = q2.order(opts.order, { ascending: !opts.desc });
      if (opts.limit) q2 = q2.limit(opts.limit);
      res = await q2;
    }
    return res;
  }

  function setStatus(text) {
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

  function formatDateFR(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  }

  function isTableMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "PGRST205" || msg.includes("could not find the table") || msg.includes("does not exist");
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "42703" || msg.includes("column") && msg.includes("does not exist");
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
            <button class="dv-btn dv-btn--primary" data-save>${copy.btnSave}</button>
          </div>
        </header>

        <div class="dv-status" data-status></div>

        <div class="dv-grid">
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
                <input class="dv-input" data-vat-rate />
              </div>
              <div class="dv-total-row"><span>${copy.labelSubtotal}</span><strong data-subtotal>—</strong></div>
              <div class="dv-total-row"><span>${copy.labelDiscount}</span><strong data-discount>—</strong></div>
              <div class="dv-total-row"><span>${copy.labelVat}</span><strong data-vat>—</strong></div>
              <div class="dv-total-row dv-total"><span>${copy.labelTotal}</span><strong data-total>—</strong></div>
            </div>
          </div>

          <div class="dv-panel dv-preview-panel">
            <div class="dv-preview-toolbar">
              <a class="dv-link" data-preview-link hidden target="_blank" rel="noopener">Voir le PDF</a>
            </div>
            <div class="dv-preview" data-preview></div>
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
        background: radial-gradient(1000px 500px at 10% -10%, #e0f2fe 0%, #f8fafc 60%, #f8fafc 100%);
        padding: 20px;
        border-radius: 18px;
      }
      .dv-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 16px;
      }
      .dv-eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 6px;
      }
      .dv-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 26px;
        font-weight: 700;
      }
      .dv-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dv-btn {
        border: none;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 13px;
        cursor: pointer;
        background: #0ea5e9;
        color: #fff;
      }
      .dv-btn--ghost {
        background: #f1f5f9;
        color: #0f172a;
      }
      .dv-btn--xs {
        padding: 6px 10px;
        font-size: 12px;
      }
      .dv-status {
        color: #64748b;
        font-size: 13px;
        margin-bottom: 12px;
      }
      .dv-grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 16px;
      }
      .dv-panel {
        display: grid;
        gap: 16px;
      }
      .dv-card {
        background: #fff;
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        display: grid;
        gap: 10px;
      }
      .dv-card-title {
        font-weight: 700;
      }
      .dv-field label {
        font-size: 11px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.06em;
        display: block;
        margin-bottom: 6px;
      }
      .dv-input, .dv-textarea, select.dv-input {
        width: 100%;
        border: 1px solid #cbd5f5;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
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
        top: 12px;
      }
      .dv-preview-toolbar {
        display: flex;
        justify-content: flex-end;
      }
      .dv-link {
        color: #0ea5e9;
        text-decoration: none;
        font-weight: 600;
        font-size: 13px;
      }
      .dv-preview {
        background: #fff;
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        min-height: 480px;
      }
      .dv-preview-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }
      .dv-preview-title {
        font-size: 16px;
        font-weight: 700;
      }
      .dv-preview-sub {
        font-size: 12px;
        color: #64748b;
      }
      .dv-preview-meta {
        text-align: right;
        font-size: 12px;
        color: #64748b;
      }
      .dv-preview-doc {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
      }
      .dv-preview-client {
        background: #f8fafc;
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 12px;
        margin-bottom: 12px;
      }
      .dv-preview-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .dv-preview-table th,
      .dv-preview-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 6px 4px;
        text-align: left;
      }
      .dv-preview-totals {
        margin-top: 12px;
        display: grid;
        gap: 6px;
        font-size: 12px;
      }
      .dv-preview-total {
        font-size: 14px;
      }
      .dv-preview-notes {
        margin-top: 12px;
        font-size: 12px;
        color: #475569;
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
      }
      @media (max-width: 720px) {
        .dv-row { grid-template-columns: 1fr 1fr; }
        .dv-line-total { grid-column: span 2; }
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
