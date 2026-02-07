document.documentElement.setAttribute("data-page", "factures-list");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblFacturesListLoaded) return;
  window.__mblFacturesListLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[FACTURES-LIST] Root introuvable.");
    return;
  }

  const GLOBAL_CFG = window.__MBL_CFG__ || {};
  const CONFIG = {
    SUPABASE_URL: GLOBAL_CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      GLOBAL_CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    BUCKET: root.dataset.bucket || "factures-files",
    INVOICES_TABLE: root.dataset.invoicesTable || root.dataset.facturesTable || "factures",
    ORGANIZATION_ID:
      root.dataset.organizationId ||
      GLOBAL_CFG.ORGANIZATION_ID ||
      window.__MBL_ORG_ID__ ||
      "",
    CURRENCY: root.dataset.currency || "EUR",
    ADD_URL: root.dataset.addUrl || root.dataset.editUrl || "/extranet/facturation/invoice",
    EDIT_URL: root.dataset.editUrl || root.dataset.invoiceUrl || root.dataset.factureUrl || "/extranet/facturation/invoice",
    PDF_SIGNED_URL_TTL: Number(root.dataset.pdfSignedUrlTtl || 300),
    MAX_ROWS: Number(root.dataset.maxRows || 300),
  };

  const STR = {
    title: "Liste des factures",
    subtitle: "Emission, suivi et previsualisation PDF",
    searchPlaceholder: "Rechercher numero, client, email...",

    statusAll: "Tous",
    statusDraft: "Brouillons",
    statusIssued: "Emises",
    statusSent: "Envoyees",
    statusPartiallyPaid: "Paiement partiel",
    statusPaid: "Payees",
    statusVoided: "Void",
    statusCanceled: "Annulees",

    emptyTitle: "Aucune facture",
    emptyBody: "Aucune facture ne correspond aux filtres actuels.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer les factures.",
    loading: "Chargement des factures...",
    orgMissing: "Organisation introuvable (RLS). Ajoute data-organization-id ou verifie organization_members.",

    invoice: "Facture",
    issueDate: "Date facture",
    dueDate: "Echeance",
    createdAt: "Cree le",
    updatedAt: "Maj",
    client: "Client",
    total: "Total",
    newInvoice: "Nouvelle facture",

    preview: "Previsualiser",
    openPdf: "Ouvrir PDF",
    downloadPdf: "Telecharger PDF",
    openInvoice: "Ouvrir",
    saveStatus: "Mettre a jour",
    deleteInvoice: "Supprimer",
    close: "Fermer",

    overdue: "En retard",

    noPdf: "Aucun PDF enregistre pour cette facture.",
    noItems: "Aucune ligne",

    statusUpdated: "Etat de la facture mis a jour.",
    statusUpdateError: "Impossible de mettre a jour l'etat.",
    deleteConfirm: "Supprimer cette facture ?",
    deleteSuccess: "Facture supprimee.",
    deleteError: "Impossible de supprimer la facture.",
  };

  const supabase = resolveSupabaseClient(CONFIG);
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  injectStyles();
  const els = renderShell(root, STR);

  const state = {
    currentUserId: "",
    organizationId: asUuid(CONFIG.ORGANIZATION_ID),
    statusField: "",
    filter: "all",
    search: "",
    invoices: [],
    selected: null,
  };

  wireUI();
  await boot();

  async function boot() {
    setStatus(STR.loading);
    try {
      await resolveAuthContext();
      if (!state.organizationId) {
        setStatus(STR.orgMissing);
      }
      state.statusField = await detectStatusField();
      await loadInvoices();
      render();
      if (state.organizationId) setStatus("");
    } catch (e) {
      console.error(e);
      renderError();
      setStatus("");
    }
  }

  function wireUI() {
    els.btnNewInvoice.addEventListener("click", () => {
      const target = String(CONFIG.ADD_URL || "").trim() || String(CONFIG.EDIT_URL || "").trim();
      if (!target) return;
      window.location.href = target;
    });

    els.search.addEventListener("input", () => {
      state.search = String(els.search.value || "").trim().toLowerCase();
      render();
    });

    els.filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.filters.forEach((x) => x.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filter = btn.dataset.filter || "all";
        render();
      });
    });

    els.modalBackdrop.addEventListener("click", closePreview);
    els.modalClose.addEventListener("click", closePreview);
  }

  async function resolveAuthContext() {
    const auth = await supabase.auth.getUser();
    state.currentUserId = auth?.data?.user?.id || "";

    if (state.organizationId || !state.currentUserId) return;

    let membership = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", state.currentUserId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (membership.error && isMissingColumnError(membership.error)) {
      membership = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", state.currentUserId)
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
      .eq("id", state.currentUserId)
      .maybeSingle();

    if (!profile.error && profile.data?.organization_id) {
      state.organizationId = asUuid(profile.data.organization_id);
    }
  }

  async function detectStatusField() {
    const tests = ["status", "invoice_status", "state"];
    for (const field of tests) {
      const res = await supabase.from(CONFIG.INVOICES_TABLE).select(`id,${field}`).limit(1);
      if (!res.error) return field;
      if (!isMissingColumnError(res.error)) break;
    }
    return "";
  }

  async function loadInvoices() {
    let query = supabase
      .from(CONFIG.INVOICES_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(CONFIG.MAX_ROWS);

    if (state.organizationId) query = query.eq("organization_id", state.organizationId);

    let res = await query;

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from(CONFIG.INVOICES_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(CONFIG.MAX_ROWS);
    }

    if (res.error) throw res.error;

    state.invoices = (res.data || []).map((inv) => enrichInvoice(inv));
  }

  function render() {
    const rows = filterInvoices(state.invoices);
    els.count.textContent = String(rows.length);

    const totalAmount = rows.reduce((acc, inv) => acc + Number(inv.total_cents || 0), 0);
    const overdueCount = rows.filter((inv) => !!inv.isOverdue).length;

    els.kpiCount.textContent = String(rows.length);
    els.kpiTotal.textContent = formatMoney(totalAmount, CONFIG.CURRENCY);
    els.kpiOverdue.textContent = String(overdueCount);

    if (!rows.length) {
      els.list.innerHTML = `
        <div class="dl-empty">
          <div class="dl-empty-title">${STR.emptyTitle}</div>
          <div class="dl-empty-body">${STR.emptyBody}</div>
        </div>
      `;
      return;
    }

    els.list.innerHTML = "";
    rows.forEach((invoice) => {
      const card = document.createElement("article");
      card.className = "dl-card";

      const clientLabel = resolveClientLabel(invoice) || "Client non renseigne";
      const refLabel = invoice.reference || "Brouillon";

      card.innerHTML = `
        <div class="dl-card-top">
          <div>
            <div class="dl-ref">${escapeHTML(refLabel)}</div>
            <div class="dl-client">${escapeHTML(clientLabel)}</div>
          </div>
          <div class="dl-badges">
            <span class="dl-badge dl-badge--${invoice.status.tone}">${invoice.status.label}</span>
            ${invoice.isOverdue ? `<span class="dl-badge dl-badge--danger">${STR.overdue}</span>` : ""}
          </div>
        </div>

        <div class="dl-meta">
          <span>${STR.issueDate}: ${escapeHTML(formatDateFR(invoice.issue_date) || "—")}</span>
          <span>${STR.dueDate}: ${escapeHTML(formatDateFR(invoice.due_date) || "—")}</span>
          <span>${STR.createdAt}: ${escapeHTML(formatDateTimeFR(invoice.created_at) || "—")}</span>
          <span>${STR.updatedAt}: ${escapeHTML(formatDateTimeFR(invoice.updated_at) || "—")}</span>
        </div>

        <div class="dl-total">${STR.total}: <strong>${formatMoney(Number(invoice.total_cents || 0), CONFIG.CURRENCY)}</strong></div>

        <div class="dl-actions">
          <button type="button" class="dl-btn dl-btn--primary" data-action="preview">${STR.preview}</button>
          ${invoice.pdfAvailable ? `<button type="button" class="dl-btn dl-btn--ghost" data-action="open-pdf">${STR.openPdf}</button>` : ""}
          <button type="button" class="dl-btn dl-btn--ghost" data-action="open">${STR.openInvoice}</button>
          <select class="dl-status-select" data-action="status-select">
            ${renderStatusOptions(invoice.status.key)}
          </select>
          <button type="button" class="dl-btn dl-btn--ghost" data-action="save-status">${STR.saveStatus}</button>
          <button type="button" class="dl-btn dl-btn--danger" data-action="delete">${STR.deleteInvoice}</button>
        </div>
      `;

      card.querySelector('[data-action="preview"]').addEventListener("click", () => {
        openPreview(invoice.id);
      });

      const openPdfBtn = card.querySelector('[data-action="open-pdf"]');
      if (openPdfBtn) {
        openPdfBtn.addEventListener("click", async () => {
          const url = await resolveInvoicePdfUrl(invoice);
          if (url) window.open(url, "_blank", "noopener");
        });
      }

      const openBtn = card.querySelector('[data-action="open"]');
      openBtn.addEventListener("click", () => openInvoice(invoice.id));

      const saveStatusBtn = card.querySelector('[data-action="save-status"]');
      const statusSelect = card.querySelector('[data-action="status-select"]');
      if (saveStatusBtn && statusSelect) {
        saveStatusBtn.addEventListener("click", async () => {
          const nextStatus = statusSelect.value;
          const ok = await updateInvoiceStatus(invoice.id, nextStatus);
          if (!ok) return;
          await loadInvoices();
          render();
          showToast("success", STR.statusUpdated);
        });
      }

      const deleteBtn = card.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
          if (!window.confirm(STR.deleteConfirm)) return;
          const ok = await deleteInvoice(invoice);
          if (!ok) return;
          await loadInvoices();
          render();
          showToast("success", STR.deleteSuccess);
        });
      }

      els.list.appendChild(card);
    });
  }

  function renderError() {
    els.list.innerHTML = `
      <div class="dl-empty">
        <div class="dl-empty-title">${STR.errorTitle}</div>
        <div class="dl-empty-body">${STR.errorBody}</div>
      </div>
    `;
  }

  function filterInvoices(items) {
    return (items || []).filter((inv) => {
      if (state.filter !== "all" && inv.status.key !== state.filter) return false;
      if (!state.search) return true;
      const hay = [inv.reference, inv.client_name, inv.client_email, inv.client_phone]
        .concat(inv.buyer?.name || "", inv.buyer?.email || "")
        .join(" ")
        .toLowerCase();
      return hay.includes(state.search);
    });
  }

  async function openPreview(id) {
    const invoice = state.invoices.find((x) => String(x.id) === String(id));
    if (!invoice) return;

    state.selected = invoice;
    els.modal.hidden = false;
    document.body.classList.add("dl-modal-open");

    els.modalTitle.textContent = `${STR.invoice} • ${invoice.reference || "Brouillon"}`;
    els.modalMeta.textContent = `${resolveClientLabel(invoice) || STR.client} • ${formatMoney(
      Number(invoice.total_cents || 0),
      CONFIG.CURRENCY
    )}`;

    els.modalOpenInvoice.hidden = false;
    els.modalOpenInvoice.onclick = () => openInvoice(invoice.id);

    const pdfUrl = await resolveInvoicePdfUrl(invoice);

    if (pdfUrl) {
      els.modalPdfWrap.hidden = false;
      els.modalPdf.src = pdfUrl;
      els.modalNoPdf.hidden = true;
      els.modalOpenPdf.onclick = () => window.open(pdfUrl, "_blank", "noopener");
      els.modalDownloadPdf.onclick = () => {
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = `${invoice.reference || "facture"}.pdf`;
        a.click();
      };
    } else {
      els.modalPdfWrap.hidden = true;
      els.modalPdf.removeAttribute("src");
      els.modalNoPdf.hidden = false;
      els.modalNoPdf.innerHTML = `
        <div class="dl-no-pdf">${STR.noPdf}</div>
        ${renderFallbackPreview(invoice)}
      `;
      els.modalOpenPdf.onclick = null;
      els.modalDownloadPdf.onclick = null;
    }
  }

  function closePreview() {
    els.modal.hidden = true;
    document.body.classList.remove("dl-modal-open");
    els.modalPdf.removeAttribute("src");

    if (els.modalOpenInvoice) {
      els.modalOpenInvoice.hidden = true;
      els.modalOpenInvoice.onclick = null;
    }
  }

  async function resolveInvoicePdfUrl(invoice) {
    if (!invoice) return "";

    const path = String(invoice.pdf_path || "").trim();
    if (path) {
      const signed = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(path, CONFIG.PDF_SIGNED_URL_TTL);
      if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;

      const pub = supabase.storage.from(CONFIG.BUCKET).getPublicUrl(path);
      const pubUrl = pub?.data?.publicUrl || "";
      if (pubUrl) return pubUrl;
    }

    if (invoice.pdf_url && /^https?:\/\//i.test(invoice.pdf_url)) {
      return invoice.pdf_url;
    }
    return "";
  }

  function openInvoice(invoiceId) {
    const base = String(CONFIG.EDIT_URL || "").trim() || "/extranet/facturation/invoice";
    const sep = base.includes("?") ? "&" : "?";
    window.location.href = `${base}${sep}id=${encodeURIComponent(String(invoiceId || "").trim())}`;
  }

  function renderStatusOptions(currentKey) {
    const current = normalizeStatusKey(currentKey);
    const options = [
      { value: "draft", label: "Brouillon" },
      { value: "issued", label: "Emise" },
      { value: "sent", label: "Envoyee" },
      { value: "partially_paid", label: "Paiement partiel" },
      { value: "paid", label: "Payee" },
      { value: "void", label: "Void" },
      { value: "canceled", label: "Annulee" },
    ];
    return options
      .map((opt) => `<option value="${opt.value}" ${opt.value === current ? "selected" : ""}>${opt.label}</option>`)
      .join("");
  }

  async function updateInvoiceStatus(invoiceId, nextStatus) {
    const status = normalizeStatusKey(nextStatus);
    const candidates = state.statusField
      ? [{ [state.statusField]: status }]
      : [{ status }, { invoice_status: status }, { state: status }];

    let lastError = null;
    for (const payload of candidates) {
      const res = await supabase.from(CONFIG.INVOICES_TABLE).update(payload).eq("id", invoiceId);
      if (!res.error) {
        if (payload.status !== undefined) state.statusField = "status";
        if (payload.invoice_status !== undefined) state.statusField = "invoice_status";
        if (payload.state !== undefined) state.statusField = "state";
        return true;
      }
      lastError = res.error;
      if (isMissingColumnError(res.error) || isConstraintViolation(res.error)) continue;
      break;
    }

    console.error(lastError);
    showToast("error", STR.statusUpdateError);
    return false;
  }

  async function deleteInvoice(invoice) {
    const del = await supabase.from(CONFIG.INVOICES_TABLE).delete().eq("id", invoice.id);
    if (del.error) {
      console.error(del.error);
      showToast("error", STR.deleteError);
      return false;
    }

    if (invoice?.pdf_path) {
      await supabase.storage.from(CONFIG.BUCKET).remove([invoice.pdf_path]);
    }
    return true;
  }

  function renderFallbackPreview(invoice) {
    const items = parseItems(invoice.items);
    const lines = items.length
      ? items
          .map((it) => {
            const qty = Number(it.qty || 1);
            const cents = Number(it.unit_cents || it.unit_price_cents || 0);
            const total = Math.round(qty * cents);
            return `
              <tr>
                <td>${escapeHTML(it.name || "—")}</td>
                <td class="dl-num">${qty}</td>
                <td class="dl-num">${formatMoney(cents, CONFIG.CURRENCY)}</td>
                <td class="dl-num">${formatMoney(total, CONFIG.CURRENCY)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="4">${STR.noItems}</td></tr>`;

    return `
      <div class="dl-fallback">
        <div class="dl-fb-head">
          <div><strong>${escapeHTML(invoice.reference || STR.invoice)}</strong></div>
          <div>${escapeHTML(formatDateFR(invoice.issue_date) || formatDateFR(invoice.created_at) || "")}</div>
        </div>
        <table class="dl-fb-table">
          <thead>
            <tr>
              <th>Libelle</th>
              <th>Qt</th>
              <th>PU</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>
        <div class="dl-fb-total">Total: <strong>${formatMoney(Number(invoice.total_cents || 0), CONFIG.CURRENCY)}</strong></div>
      </div>
    `;
  }

  function enrichInvoice(inv) {
    const status = inferStatus(inv);
    const pdfAvailable = !!(inv.pdf_url || inv.pdf_path);
    const isOverdue = computeIsOverdue(inv, status.key);
    return { ...inv, status, pdfAvailable, isOverdue };
  }

  function computeIsOverdue(row, statusKey) {
    const key = normalizeStatusKey(statusKey || row.status || row.invoice_status || row.state || "");
    if (["draft", "paid", "canceled", "void"].includes(key)) return false;

    const d = parseISODate(row.due_date);
    if (!d) return false;

    return d < startOfToday();
  }

  function inferStatus(row) {
    const raw = normalize(row.status || row.invoice_status || row.state || "");

    if (["paid", "payee", "payee_integral", "reglee", "reglee_integral"].includes(raw)) {
      return { key: "paid", label: "Payee", tone: "success" };
    }
    if (["partially_paid", "partial", "partiel", "paiement_partiel"].includes(raw)) {
      return { key: "partially_paid", label: "Paiement partiel", tone: "info" };
    }
    if (["canceled", "cancelled", "annule", "annulee"].includes(raw)) {
      return { key: "canceled", label: "Annulee", tone: "danger" };
    }
    if (["void", "avoir", "credit_note"].includes(raw)) {
      return { key: "void", label: "Void", tone: "neutral" };
    }
    if (["sent", "envoye", "envoyee"].includes(raw)) {
      return { key: "sent", label: "Envoyee", tone: "info" };
    }
    if (["issued", "emise", "emitted", "finalized", "finalise", "finalisee"].includes(raw)) {
      return { key: "issued", label: "Emise", tone: "info" };
    }
    if (["draft", "brouillon", "pending"].includes(raw)) {
      return { key: "draft", label: "Brouillon", tone: "neutral" };
    }

    if (row.reference) return { key: "issued", label: "Emise", tone: "info" };
    return { key: "draft", label: "Brouillon", tone: "neutral" };
  }

  function normalizeStatusKey(value) {
    const raw = normalize(value);
    if (["paid", "payee", "reglee"].includes(raw)) return "paid";
    if (["partially_paid", "partial", "partiel", "paiement_partiel"].includes(raw)) return "partially_paid";
    if (["canceled", "cancelled", "annule", "annulee"].includes(raw)) return "canceled";
    if (["void", "avoir", "credit_note"].includes(raw)) return "void";
    if (["sent", "envoye", "envoyee"].includes(raw)) return "sent";
    if (["issued", "emise", "emitted", "finalized", "finalise", "finalisee"].includes(raw)) return "issued";
    return "draft";
  }

  function resolveClientLabel(invoice) {
    const name = String(invoice.client_name || "").trim();
    if (name) return name;
    const buyerName = String(invoice?.buyer?.name || "").trim();
    if (buyerName) return buyerName;
    const email = String(invoice.client_email || invoice?.buyer?.email || "").trim();
    if (email) return email;
    return "";
  }

  function parseItems(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const p = JSON.parse(value);
        return Array.isArray(p) ? p : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  function parseISODate(value) {
    if (!value) return null;
    const s = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function startOfToday() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function setStatus(text) {
    els.status.textContent = text || "";
  }

  function showToast(type, message) {
    if (!els.toasts) return;
    const el = document.createElement("div");
    el.className = `dl-toast dl-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function formatMoney(cents, currency) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency });
  }

  function formatDateFR(value) {
    if (!value) return "";
    const d = parseISODate(value) || new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  }

  function formatDateTimeFR(value) {
    if (!value) return "";
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

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
  }

  function isConstraintViolation(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "23514" || msg.includes("violates check constraint");
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function resolveSupabaseClient(config) {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (window.__adminSupabase) return window.__adminSupabase;
    if (window.__techSupabase) return window.__techSupabase;
    if (!window.supabase?.createClient) return null;

    const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
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

  function renderShell(rootEl, copy) {
    rootEl.innerHTML = `
      <section class="dl-shell">
        <header class="dl-header">
          <div>
            <div class="dl-eyebrow">${copy.subtitle}</div>
            <div class="dl-title">${copy.title}</div>
          </div>
          <div class="dl-header-actions">
            <button class="dl-btn dl-btn--primary dl-btn--new" data-new-invoice>${copy.newInvoice}</button>
            <div class="dl-count" data-count>0</div>
          </div>
        </header>

        <div class="dl-status" data-status></div>

        <div class="dl-controls">
          <div class="dl-filters">
            <button class="dl-chip is-active" data-filter="all">${copy.statusAll}</button>
            <button class="dl-chip" data-filter="draft">${copy.statusDraft}</button>
            <button class="dl-chip" data-filter="issued">${copy.statusIssued}</button>
            <button class="dl-chip" data-filter="sent">${copy.statusSent}</button>
            <button class="dl-chip" data-filter="partially_paid">${copy.statusPartiallyPaid}</button>
            <button class="dl-chip" data-filter="paid">${copy.statusPaid}</button>
            <button class="dl-chip" data-filter="void">${copy.statusVoided}</button>
            <button class="dl-chip" data-filter="canceled">${copy.statusCanceled}</button>
          </div>
          <input class="dl-search" type="search" placeholder="${copy.searchPlaceholder}" data-search />
        </div>

        <div class="dl-kpis">
          <div class="dl-kpi">
            <div class="dl-kpi-label">Nombre</div>
            <div class="dl-kpi-value" data-kpi-count>0</div>
          </div>
          <div class="dl-kpi">
            <div class="dl-kpi-label">Montant total</div>
            <div class="dl-kpi-value" data-kpi-total>0,00 €</div>
          </div>
          <div class="dl-kpi">
            <div class="dl-kpi-label">${copy.overdue}</div>
            <div class="dl-kpi-value" data-kpi-overdue>0</div>
          </div>
        </div>

        <div class="dl-list" data-list></div>

        <div class="dl-toasts" data-toasts></div>

        <div class="dl-modal" data-modal hidden>
          <div class="dl-modal-backdrop" data-modal-backdrop></div>
          <div class="dl-modal-panel">
            <div class="dl-modal-head">
              <div>
                <div class="dl-modal-title" data-modal-title>${copy.invoice}</div>
                <div class="dl-modal-meta" data-modal-meta></div>
              </div>
              <button class="dl-btn dl-btn--ghost" data-modal-close>${copy.close}</button>
            </div>

            <div class="dl-modal-actions">
              <button class="dl-btn dl-btn--ghost" data-open-pdf>${copy.openPdf}</button>
              <button class="dl-btn dl-btn--primary" data-download-pdf>${copy.downloadPdf}</button>
              <button class="dl-btn dl-btn--ghost" data-open-invoice hidden>${copy.openInvoice}</button>
            </div>

            <div class="dl-modal-body">
              <div class="dl-pdf-wrap" data-pdf-wrap>
                <iframe class="dl-pdf" data-pdf title="PDF facture"></iframe>
              </div>
              <div class="dl-no-pdf-wrap" data-no-pdf hidden></div>
            </div>
          </div>
        </div>
      </section>
    `;

    return {
      list: rootEl.querySelector("[data-list]"),
      status: rootEl.querySelector("[data-status]"),
      count: rootEl.querySelector("[data-count]"),
      kpiCount: rootEl.querySelector("[data-kpi-count]"),
      kpiTotal: rootEl.querySelector("[data-kpi-total]"),
      kpiOverdue: rootEl.querySelector("[data-kpi-overdue]"),
      btnNewInvoice: rootEl.querySelector("[data-new-invoice]"),
      search: rootEl.querySelector("[data-search]"),
      filters: Array.from(rootEl.querySelectorAll("[data-filter]")),
      toasts: rootEl.querySelector("[data-toasts]"),
      modal: rootEl.querySelector("[data-modal]"),
      modalBackdrop: rootEl.querySelector("[data-modal-backdrop]"),
      modalClose: rootEl.querySelector("[data-modal-close]"),
      modalTitle: rootEl.querySelector("[data-modal-title]"),
      modalMeta: rootEl.querySelector("[data-modal-meta]"),
      modalOpenPdf: rootEl.querySelector("[data-open-pdf]"),
      modalDownloadPdf: rootEl.querySelector("[data-download-pdf]"),
      modalOpenInvoice: rootEl.querySelector("[data-open-invoice]"),
      modalPdfWrap: rootEl.querySelector("[data-pdf-wrap]"),
      modalPdf: rootEl.querySelector("[data-pdf]"),
      modalNoPdf: rootEl.querySelector("[data-no-pdf]"),
    };
  }

  function injectStyles() {
    if (document.getElementById("dl-styles")) return;
    const style = document.createElement("style");
    style.id = "dl-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      .dl-shell {
        font-family: "Manrope", sans-serif;
        --dl-ink: #0f172a;
        --dl-soft: #5b708a;
        --dl-primary: #0ea5e9;
        --dl-border: #d9e7ff;
        background:
          radial-gradient(1000px 480px at -5% -15%, rgba(14, 165, 233, 0.18), transparent 60%),
          radial-gradient(900px 460px at 105% 0, rgba(59, 130, 246, 0.12), transparent 62%),
          linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
        border: 1px solid #d3e2ff;
        border-radius: 18px;
        padding: 18px;
        color: var(--dl-ink);
      }
      .dl-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        margin-bottom: 10px;
      }
      .dl-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .dl-eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--dl-soft);
      }
      .dl-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 28px;
        font-weight: 700;
      }
      .dl-count {
        min-width: 52px;
        height: 52px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #fff;
        font-weight: 800;
        font-size: 18px;
      }
      .dl-status {
        min-height: 18px;
        font-size: 13px;
        color: var(--dl-soft);
        margin-bottom: 10px;
      }
      .dl-controls {
        display: grid;
        gap: 10px;
        margin-bottom: 14px;
      }
      .dl-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }
      .dl-kpi {
        background: rgba(255, 255, 255, 0.75);
        border: 1px solid #d9e7ff;
        border-radius: 16px;
        padding: 12px;
        backdrop-filter: blur(10px);
      }
      .dl-kpi-label {
        font-size: 12px;
        color: var(--dl-soft);
        margin-bottom: 4px;
      }
      .dl-kpi-value {
        font-family: "Space Grotesk", sans-serif;
        font-size: 22px;
        font-weight: 700;
      }
      .dl-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dl-chip {
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.65);
        color: #0f172a;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
      }
      .dl-chip:hover {
        transform: translateY(-1px);
        background: #fff;
      }
      .dl-chip.is-active {
        background: #0f172a;
        border-color: #0f172a;
        color: #fff;
      }
      .dl-search {
        width: 100%;
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.75);
        border-radius: 14px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }
      .dl-search:focus {
        box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.14);
        border-color: rgba(14, 165, 233, 0.55);
      }
      .dl-list {
        display: grid;
        gap: 12px;
      }
      .dl-card {
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid #d9e7ff;
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
      }
      .dl-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }
      .dl-ref {
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 18px;
      }
      .dl-client {
        color: var(--dl-soft);
        font-size: 14px;
        margin-top: 2px;
      }
      .dl-badges {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .dl-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .dl-badge--success { background: #dcfce7; color: #166534; }
      .dl-badge--info { background: #e0f2fe; color: #075985; }
      .dl-badge--danger { background: #fee2e2; color: #991b1b; }
      .dl-badge--neutral { background: #e2e8f0; color: #334155; }

      .dl-meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 10px;
        font-size: 12px;
        color: var(--dl-soft);
      }
      .dl-total {
        margin-top: 10px;
        font-size: 14px;
      }
      .dl-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
        align-items: center;
      }
      .dl-btn {
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.9);
        color: #0f172a;
        padding: 9px 12px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }
      .dl-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08); }
      .dl-btn--primary {
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
        border-color: transparent;
        color: #fff;
      }
      .dl-btn--danger {
        background: #fee2e2;
        border-color: #fecaca;
        color: #991b1b;
      }
      .dl-btn--ghost {
        background: rgba(255, 255, 255, 0.55);
      }
      .dl-status-select {
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.85);
        border-radius: 14px;
        padding: 9px 10px;
        font-weight: 700;
        font-size: 13px;
      }

      .dl-empty {
        border: 1px dashed #cfe0ff;
        border-radius: 16px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.6);
      }
      .dl-empty-title {
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 16px;
      }
      .dl-empty-body {
        color: var(--dl-soft);
        margin-top: 6px;
        font-size: 13px;
      }

      .dl-toasts {
        position: fixed;
        right: 16px;
        bottom: 16px;
        display: grid;
        gap: 10px;
        z-index: 9999;
      }
      .dl-toast {
        border-radius: 14px;
        padding: 12px 14px;
        font-weight: 700;
        font-size: 13px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.9);
      }
      .dl-toast--success { border-color: rgba(22, 163, 74, 0.22); }
      .dl-toast--error { border-color: rgba(220, 38, 38, 0.22); }
      .dl-toast--warning { border-color: rgba(234, 179, 8, 0.22); }

      .dl-modal {
        position: fixed;
        inset: 0;
        z-index: 9998;
      }
      .dl-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.46);
        backdrop-filter: blur(6px);
      }
      .dl-modal-panel {
        position: relative;
        width: min(980px, calc(100% - 24px));
        max-height: calc(100% - 24px);
        margin: 12px auto;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 22px;
        overflow: hidden;
        display: grid;
        grid-template-rows: auto auto 1fr;
      }
      .dl-modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 14px 10px;
      }
      .dl-modal-title {
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 18px;
      }
      .dl-modal-meta {
        color: var(--dl-soft);
        font-size: 13px;
        margin-top: 2px;
      }
      .dl-modal-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding: 0 14px 12px;
      }
      .dl-modal-body {
        padding: 0 14px 14px;
      }
      .dl-pdf-wrap {
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 16px;
        overflow: hidden;
        background: #fff;
        height: min(72vh, 720px);
      }
      .dl-pdf {
        width: 100%;
        height: 100%;
        border: 0;
      }
      .dl-no-pdf-wrap {
        border: 1px dashed rgba(15, 23, 42, 0.18);
        border-radius: 16px;
        padding: 16px;
        background: rgba(248, 250, 252, 0.8);
      }
      .dl-no-pdf {
        font-weight: 800;
        margin-bottom: 10px;
      }

      .dl-fallback {
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: #fff;
      }
      .dl-fb-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(241, 245, 249, 0.9);
        font-size: 13px;
      }
      .dl-fb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .dl-fb-table th,
      .dl-fb-table td {
        padding: 10px 12px;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
      }
      .dl-num { text-align: right; }
      .dl-fb-total {
        padding: 10px 12px;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
        text-align: right;
        font-size: 14px;
      }

      body.dl-modal-open { overflow: hidden; }

      @media (max-width: 720px) {
        .dl-title { font-size: 22px; }
        .dl-kpis { grid-template-columns: 1fr; }
        .dl-count { height: 44px; min-width: 44px; }
        .dl-actions { gap: 6px; }
        .dl-btn { width: 100%; }
        .dl-status-select { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return (
      document.querySelector("[data-factures-list]") ||
      document.querySelector("#factures-list-root") ||
      document.querySelector(".factures-list-root")
    );
  }
});
