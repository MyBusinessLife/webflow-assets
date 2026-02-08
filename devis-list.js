document.documentElement.setAttribute("data-page", "devis-list");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblDevisListLoaded) return;
  window.__mblDevisListLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[DEVIS-LIST] Root introuvable.");
    return;
  }

  const GLOBAL_CFG = window.__MBL_CFG__ || {};
  const CONFIG = {
    SUPABASE_URL: GLOBAL_CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      GLOBAL_CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    // Quotes must not inherit the global bucket (used by other modules like interventions).
    BUCKET: root.dataset.bucket || "devis-files",
    QUOTES_TABLE: root.dataset.quotesTable || "devis",
    INVOICES_TABLE: root.dataset.invoicesTable || root.dataset.facturesTable || "factures",
    ORGANIZATION_ID:
      root.dataset.organizationId ||
      GLOBAL_CFG.ORGANIZATION_ID ||
      window.__MBL_ORG_ID__ ||
      "",
    CURRENCY: root.dataset.currency || "EUR",
    ADD_URL: root.dataset.addUrl || "/facturation/devis-add",
    INVOICE_URL: root.dataset.invoiceUrl || root.dataset.factureUrl || "/facturation/invoice",
    PDF_SIGNED_URL_TTL: Number(root.dataset.pdfSignedUrlTtl || 300),
    MAX_ROWS: Number(root.dataset.maxRows || 300),
  };

  const STR = {
    title: "Liste des devis",
    subtitle: "Suivi commercial et previsualisation rapide",
    searchPlaceholder: "Rechercher ref, client, email...",
    statusAll: "Tous",
    statusDraft: "Brouillons",
    statusSent: "Envoyes",
    statusAccepted: "Acceptes",
    statusRejected: "Refuses",
    statusCanceled: "Annules",
    statusExpired: "Expires",
    emptyTitle: "Aucun devis",
    emptyBody: "Aucun devis ne correspond aux filtres actuels.",
    errorTitle: "Erreur de chargement",
    errorBody: "Impossible de recuperer les devis.",
    loading: "Chargement des devis...",
    orgMissing: "Organisation introuvable (RLS). Ajoute data-organization-id ou verifie organization_members.",
    quote: "Devis",
    validUntil: "Validite",
    createdAt: "Cree le",
    updatedAt: "Maj",
    client: "Client",
    total: "Total",
    newQuote: "Nouveau devis",
    preview: "Previsualiser",
    openPdf: "Ouvrir PDF",
    downloadPdf: "Telecharger PDF",
    convertInvoice: "Transformer en facture",
    openInvoice: "Ouvrir facture",
    convertOk: "Facture creee depuis le devis.",
    convertErr: "Impossible de transformer ce devis en facture.",
    convertMissing: "Module factures non installe (table manquante).",
    saveStatus: "Mettre a jour",
    deleteQuote: "Supprimer",
    close: "Fermer",
    noPdf: "Aucun PDF enregistre pour ce devis.",
    noItems: "Aucune ligne",
    statusUpdated: "Etat du devis mis a jour.",
    statusUpdateError: "Impossible de mettre a jour l'etat.",
    deleteConfirm: "Supprimer ce devis ?",
    deleteSuccess: "Devis supprime.",
    deleteError: "Impossible de supprimer le devis.",
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
    quotes: [],
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
      await loadQuotes();
      render();
      if (state.selected) openPreview(state.selected.id);
      if (state.organizationId) setStatus("");
    } catch (e) {
      console.error(e);
      renderError();
      setStatus("");
    }
  }

  function wireUI() {
    els.btnNewQuote.addEventListener("click", () => {
      const target = String(CONFIG.ADD_URL || "").trim();
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
    const tests = ["status", "quote_status", "state"];
    for (const field of tests) {
      const res = await supabase.from(CONFIG.QUOTES_TABLE).select(`id,${field}`).limit(1);
      if (!res.error) return field;
      if (!isMissingColumnError(res.error)) break;
    }
    return "";
  }

  async function loadQuotes() {
    let query = supabase
      .from(CONFIG.QUOTES_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(CONFIG.MAX_ROWS);

    if (state.organizationId) query = query.eq("organization_id", state.organizationId);

    let res = await query;

    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase
        .from(CONFIG.QUOTES_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(CONFIG.MAX_ROWS);
    }

    if (res.error) throw res.error;

    state.quotes = (res.data || []).map((q) => enrichQuote(q));
  }

  function render() {
    const rows = filterQuotes(state.quotes);
    els.count.textContent = String(rows.length);
    const totalAmount = rows.reduce((acc, q) => acc + Number(q.total_cents || 0), 0);
    const acceptedCount = rows.filter((q) => q.status.key === "accepted").length;
    els.kpiCount.textContent = String(rows.length);
    els.kpiTotal.textContent = formatMoney(totalAmount, CONFIG.CURRENCY);
    els.kpiAccepted.textContent = String(acceptedCount);

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
    rows.forEach((quote) => {
      const card = document.createElement("article");
      card.className = "dl-card";
      card.innerHTML = `
        <div class="dl-card-top">
          <div>
            <div class="dl-ref">${escapeHTML(quote.reference || "Sans reference")}</div>
            <div class="dl-client">${escapeHTML(quote.client_name || "Client non renseigne")}</div>
          </div>
          <span class="dl-badge dl-badge--${quote.status.tone}">${quote.status.label}</span>
        </div>

        <div class="dl-meta">
          <span>${STR.createdAt}: ${escapeHTML(formatDateTimeFR(quote.created_at) || "—")}</span>
          <span>${STR.validUntil}: ${escapeHTML(formatDateFR(quote.validity_until) || "—")}</span>
          <span>${STR.updatedAt}: ${escapeHTML(formatDateTimeFR(quote.updated_at) || "—")}</span>
        </div>

        <div class="dl-total">${STR.total}: <strong>${formatMoney(Number(quote.total_cents || 0), CONFIG.CURRENCY)}</strong></div>

        <div class="dl-actions">
          <button type="button" class="dl-btn dl-btn--primary" data-action="preview">${STR.preview}</button>
          ${quote.pdfAvailable ? `<button type="button" class="dl-btn dl-btn--ghost" data-action="open-pdf">${STR.openPdf}</button>` : ""}
          <select class="dl-status-select" data-action="status-select">
            ${renderStatusOptions(quote.status.key)}
          </select>
          <button type="button" class="dl-btn dl-btn--ghost" data-action="save-status">${STR.saveStatus}</button>
          <button type="button" class="dl-btn dl-btn--danger" data-action="delete">${STR.deleteQuote}</button>
        </div>
      `;

      card.querySelector('[data-action="preview"]').addEventListener("click", () => {
        openPreview(quote.id);
      });

      const openPdfBtn = card.querySelector('[data-action="open-pdf"]');
      if (openPdfBtn) {
        openPdfBtn.addEventListener("click", async () => {
          const url = await resolveQuotePdfUrl(quote);
          if (url) window.open(url, "_blank", "noopener");
        });
      }

      const saveStatusBtn = card.querySelector('[data-action="save-status"]');
      const statusSelect = card.querySelector('[data-action="status-select"]');
      if (saveStatusBtn && statusSelect) {
        saveStatusBtn.addEventListener("click", async () => {
          const nextStatus = statusSelect.value;
          const ok = await updateQuoteStatus(quote.id, nextStatus);
          if (!ok) return;
          await loadQuotes();
          render();
          showToast("success", STR.statusUpdated);
        });
      }

      const deleteBtn = card.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
          if (!window.confirm(STR.deleteConfirm)) return;
          const ok = await deleteQuote(quote);
          if (!ok) return;
          await loadQuotes();
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

  function filterQuotes(items) {
    return (items || []).filter((q) => {
      if (state.filter !== "all" && q.status.key !== state.filter) return false;
      if (!state.search) return true;
      const hay = [q.reference, q.client_name, q.client_email, q.client_phone].join(" ").toLowerCase();
      return hay.includes(state.search);
    });
  }

  async function openPreview(id) {
    const quote = state.quotes.find((x) => String(x.id) === String(id));
    if (!quote) return;

    state.selected = quote;
    els.modal.hidden = false;
    document.body.classList.add("dl-modal-open");

    els.modalTitle.textContent = `${STR.quote} • ${quote.reference || "Sans reference"}`;
    els.modalMeta.textContent = `${quote.client_name || "Client"} • ${formatMoney(Number(quote.total_cents || 0), CONFIG.CURRENCY)}`;

    const linkedInvoiceId = String(quote.converted_facture_id || "").trim();
    const canConvert = quote.status?.key === "accepted" && !linkedInvoiceId;
    els.modalConvertInvoice.hidden = !canConvert;
    els.modalOpenInvoice.hidden = !linkedInvoiceId;
    els.modalConvertInvoice.onclick = canConvert ? () => convertQuoteToInvoice(quote) : null;
    els.modalOpenInvoice.onclick = linkedInvoiceId ? () => openInvoice(linkedInvoiceId) : null;

    const pdfUrl = await resolveQuotePdfUrl(quote);

    if (pdfUrl) {
      els.modalPdfWrap.hidden = false;
      els.modalPdf.src = pdfUrl;
      els.modalNoPdf.hidden = true;
      els.modalOpenPdf.onclick = () => window.open(pdfUrl, "_blank", "noopener");
      els.modalDownloadPdf.onclick = () => {
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = `${quote.reference || "devis"}.pdf`;
        a.click();
      };
    } else {
      els.modalPdfWrap.hidden = true;
      els.modalPdf.removeAttribute("src");
      els.modalNoPdf.hidden = false;
      els.modalNoPdf.innerHTML = `
        <div class="dl-no-pdf">${STR.noPdf}</div>
        ${renderFallbackPreview(quote)}
      `;
      els.modalOpenPdf.onclick = null;
      els.modalDownloadPdf.onclick = null;
    }
  }

  function closePreview() {
    els.modal.hidden = true;
    document.body.classList.remove("dl-modal-open");
    els.modalPdf.removeAttribute("src");
    if (els.modalConvertInvoice) {
      els.modalConvertInvoice.hidden = true;
      els.modalConvertInvoice.onclick = null;
    }
    if (els.modalOpenInvoice) {
      els.modalOpenInvoice.hidden = true;
      els.modalOpenInvoice.onclick = null;
    }
  }

  async function resolveQuotePdfUrl(quote) {
    if (!quote) return "";

    const path = String(quote.pdf_path || "").trim();
    if (path) {
      const signed = await supabase.storage.from(CONFIG.BUCKET).createSignedUrl(path, CONFIG.PDF_SIGNED_URL_TTL);
      if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;

      const pub = supabase.storage.from(CONFIG.BUCKET).getPublicUrl(path);
      const pubUrl = pub?.data?.publicUrl || "";
      if (pubUrl) return pubUrl;
    }

    if (quote.pdf_url && /^https?:\/\//i.test(quote.pdf_url)) {
      return quote.pdf_url;
    }
    return "";
  }

  function openInvoice(invoiceId) {
    const base = String(CONFIG.INVOICE_URL || "").trim() || "/facturation/invoice";
    const sep = base.includes("?") ? "&" : "?";
    window.location.href = `${base}${sep}id=${encodeURIComponent(String(invoiceId || "").trim())}`;
  }

  async function convertQuoteToInvoice(quote) {
    if (!quote?.id) return;

    const existing = String(quote.converted_facture_id || "").trim();
    if (existing) {
      openInvoice(existing);
      return;
    }

    const orgId = String(quote.organization_id || state.organizationId || "").trim();
    if (!orgId) {
      showToast("error", STR.orgMissing);
      return;
    }

    const payload = {
      organization_id: orgId,
      devis_id: quote.id,
      status: "draft",
      client_id: quote.client_id || null,
      site_id: quote.site_id || null,
      intervention_id: quote.intervention_id || null,
      client_name: quote.client_name || null,
      client_email: quote.client_email || null,
      client_phone: quote.client_phone || null,
      client_address: quote.client_address || null,
      items: quote.items || [],
      subtotal_cents: Number(quote.subtotal_cents || 0),
      discount_cents: Number(quote.discount_cents || 0),
      vat_cents: Number(quote.vat_cents || 0),
      total_cents: Number(quote.total_cents || 0),
      currency: quote.currency || CONFIG.CURRENCY,
      created_by: state.currentUserId || null,
      created_at: new Date().toISOString(),
    };

    try {
      const ins = await supabase.from(CONFIG.INVOICES_TABLE).insert(payload).select("id").maybeSingle();
      if (ins.error) {
        if (isTableMissing(ins.error)) {
          showToast("error", STR.convertMissing);
          return;
        }
        if (isPermissionDenied(ins.error)) {
          showToast("error", STR.convertErr);
          return;
        }
        console.warn("[DEVIS-LIST] convert invoice error:", ins.error);
        showToast("error", STR.convertErr);
        return;
      }

      const invoiceId = ins.data?.id || "";
      if (!invoiceId) {
        showToast("error", STR.convertErr);
        return;
      }

      // Best-effort link back to the quote (ignore if column missing).
      const upd = await supabase.from(CONFIG.QUOTES_TABLE).update({ converted_facture_id: invoiceId }).eq("id", quote.id);
      if (upd.error && !isMissingColumnError(upd.error)) {
        console.warn("[DEVIS-LIST] quote link update warning:", upd.error);
      }

      // Update local state for UX.
      quote.converted_facture_id = invoiceId;
      showToast("success", STR.convertOk);
      openInvoice(invoiceId);
    } catch (e) {
      console.error(e);
      showToast("error", STR.convertErr);
    }
  }

  function renderStatusOptions(currentKey) {
    const current = normalizeStatusKey(currentKey);
    const options = [
      { value: "draft", label: "Brouillon" },
      { value: "sent", label: "Envoye" },
      { value: "accepted", label: "Accepte" },
      { value: "rejected", label: "Refuse" },
      { value: "canceled", label: "Annule" },
      { value: "expired", label: "Expire" },
    ];
    return options
      .map((opt) => `<option value="${opt.value}" ${opt.value === current ? "selected" : ""}>${opt.label}</option>`)
      .join("");
  }

  async function updateQuoteStatus(quoteId, nextStatus) {
    const status = normalizeStatusKey(nextStatus);
    const candidates = state.statusField
      ? [{ [state.statusField]: status }]
      : [{ status }, { quote_status: status }, { state: status }];

    let lastError = null;
    for (const payload of candidates) {
      const res = await supabase
        .from(CONFIG.QUOTES_TABLE)
        .update(payload)
        .eq("id", quoteId);
      if (!res.error) {
        if (payload.status !== undefined) state.statusField = "status";
        if (payload.quote_status !== undefined) state.statusField = "quote_status";
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

  async function deleteQuote(quote) {
    const del = await supabase
      .from(CONFIG.QUOTES_TABLE)
      .delete()
      .eq("id", quote.id);
    if (del.error) {
      console.error(del.error);
      showToast("error", STR.deleteError);
      return false;
    }

    if (quote?.pdf_path) {
      await supabase.storage.from(CONFIG.BUCKET).remove([quote.pdf_path]);
    }
    return true;
  }

  function renderFallbackPreview(quote) {
    const items = parseItems(quote.items);
    const lines = items.length
      ? items
          .map((it) => {
            const qty = Number(it.qty || 1);
            const cents = Number(it.unit_cents || 0);
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
          <div><strong>${escapeHTML(quote.reference || "Devis")}</strong></div>
          <div>${formatDateFR(quote.created_at) || ""}</div>
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
        <div class="dl-fb-total">Total: <strong>${formatMoney(Number(quote.total_cents || 0), CONFIG.CURRENCY)}</strong></div>
      </div>
    `;
  }

  function enrichQuote(q) {
    const status = inferStatus(q);
    const pdfAvailable = !!(q.pdf_url || q.pdf_path);
    return { ...q, status, pdfAvailable };
  }

  function inferStatus(row) {
    const raw = normalize(row.status || row.quote_status || row.state || "");

    if (["accepted", "accepte", "acceptee", "signed", "valide", "validated", "validee"].includes(raw)) {
      return { key: "accepted", label: "Accepte", tone: "success" };
    }
    if (["rejected", "refuse", "refusee", "declined"].includes(raw)) {
      return { key: "rejected", label: "Refuse", tone: "danger" };
    }
    if (["canceled", "cancelled", "annule", "annulee"].includes(raw)) {
      return { key: "canceled", label: "Annule", tone: "danger" };
    }
    if (["sent", "envoye", "envoyee", "issued", "finalized", "finalise"].includes(raw)) {
      return { key: "sent", label: "Envoye", tone: "info" };
    }
    if (["draft", "brouillon", "pending"].includes(raw)) {
      return { key: "draft", label: "Brouillon", tone: "neutral" };
    }

    const validity = row.validity_until ? new Date(row.validity_until) : null;
    const isExpired = validity && validity < startOfToday();
    if (isExpired) return { key: "expired", label: "Expire", tone: "danger" };

    if (row.pdf_url || row.pdf_path) return { key: "sent", label: "Pret", tone: "info" };
    return { key: "draft", label: "Brouillon", tone: "neutral" };
  }

  function normalizeStatusKey(value) {
    const raw = normalize(value);
    if (["accepted", "accepte", "acceptee", "signed", "valide", "validated", "validee"].includes(raw)) return "accepted";
    if (["rejected", "refuse", "refusee", "declined"].includes(raw)) return "rejected";
    if (["canceled", "cancelled", "annule", "annulee"].includes(raw)) return "canceled";
    if (["expired", "expire"].includes(raw)) return "expired";
    if (["sent", "envoye", "envoyee", "issued", "finalized", "finalise"].includes(raw)) return "sent";
    return "draft";
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
    setTimeout(() => el.remove(), 3000);
  }

  function formatMoney(cents, currency) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency });
  }

  function formatDateFR(value) {
    if (!value) return "";
    const d = new Date(value);
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
            <button class="dl-btn dl-btn--primary dl-btn--new" data-new-quote>${copy.newQuote}</button>
            <div class="dl-count" data-count>0</div>
          </div>
        </header>

        <div class="dl-status" data-status></div>

        <div class="dl-controls">
          <div class="dl-filters">
            <button class="dl-chip is-active" data-filter="all">${copy.statusAll}</button>
            <button class="dl-chip" data-filter="draft">${copy.statusDraft}</button>
            <button class="dl-chip" data-filter="sent">${copy.statusSent}</button>
            <button class="dl-chip" data-filter="accepted">${copy.statusAccepted}</button>
            <button class="dl-chip" data-filter="rejected">${copy.statusRejected}</button>
            <button class="dl-chip" data-filter="canceled">${copy.statusCanceled}</button>
            <button class="dl-chip" data-filter="expired">${copy.statusExpired}</button>
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
            <div class="dl-kpi-label">Acceptes</div>
            <div class="dl-kpi-value" data-kpi-accepted>0</div>
          </div>
        </div>

        <div class="dl-list" data-list></div>

        <div class="dl-toasts" data-toasts></div>

        <div class="dl-modal" data-modal hidden>
          <div class="dl-modal-backdrop" data-modal-backdrop></div>
          <div class="dl-modal-panel">
            <div class="dl-modal-head">
              <div>
                <div class="dl-modal-title" data-modal-title>Devis</div>
                <div class="dl-modal-meta" data-modal-meta></div>
              </div>
              <button class="dl-btn dl-btn--ghost" data-modal-close>${copy.close}</button>
            </div>

            <div class="dl-modal-actions">
              <button class="dl-btn dl-btn--ghost" data-open-pdf>${copy.openPdf}</button>
              <button class="dl-btn dl-btn--primary" data-download-pdf>${copy.downloadPdf}</button>
              <button class="dl-btn dl-btn--primary" data-convert-invoice hidden>${copy.convertInvoice}</button>
              <button class="dl-btn dl-btn--ghost" data-open-invoice hidden>${copy.openInvoice}</button>
            </div>

            <div class="dl-modal-body">
              <div class="dl-pdf-wrap" data-pdf-wrap>
                <iframe class="dl-pdf" data-pdf title="PDF devis"></iframe>
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
      kpiAccepted: rootEl.querySelector("[data-kpi-accepted]"),
      btnNewQuote: rootEl.querySelector("[data-new-quote]"),
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
      modalConvertInvoice: rootEl.querySelector("[data-convert-invoice]"),
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
        gap: 10px;
        margin-bottom: 14px;
      }
      .dl-kpi {
        background: #ffffff;
        border: 1px solid #dbe7fd;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
      }
      .dl-kpi-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 4px;
      }
      .dl-kpi-value {
        font-weight: 800;
        font-size: 18px;
        color: #0f172a;
      }
      .dl-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dl-chip {
        border: 1px solid #bfd3f8;
        background: #f6f9ff;
        color: #1e293b;
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      .dl-chip.is-active {
        background: var(--dl-primary);
        color: #fff;
        border-color: var(--dl-primary);
      }
      .dl-search {
        width: 100%;
        border: 1px solid #bfd3f8;
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
        font-size: 14px;
      }
      .dl-list {
        display: grid;
        gap: 12px;
      }
      .dl-card {
        background: #fff;
        border: 1px solid var(--dl-border);
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
        display: grid;
        gap: 10px;
      }
      .dl-card-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
      .dl-ref {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .dl-client {
        font-size: 13px;
        color: var(--dl-soft);
        margin-top: 2px;
      }
      .dl-meta {
        display: grid;
        gap: 4px;
        font-size: 12px;
        color: #64748b;
        border-top: 1px dashed #dbe5f5;
        border-bottom: 1px dashed #dbe5f5;
        padding: 8px 0;
      }
      .dl-total {
        font-size: 14px;
      }
      .dl-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dl-status-select {
        border: 1px solid #bfd3f8;
        background: #f8fbff;
        color: #0f172a;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        min-height: 36px;
      }
      .dl-btn {
        border: none;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      .dl-btn--primary {
        background: var(--dl-primary);
        color: #fff;
      }
      .dl-btn--new {
        font-weight: 700;
        box-shadow: 0 8px 20px rgba(14, 165, 233, 0.25);
      }
      .dl-btn--ghost {
        background: #e9f0fb;
        color: #0f172a;
      }
      .dl-btn--danger {
        background: #fee2e2;
        color: #991b1b;
      }
      .dl-badge {
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .dl-badge--success { background: #dcfce7; color: #166534; }
      .dl-badge--info { background: #e0f2fe; color: #075985; }
      .dl-badge--danger { background: #fee2e2; color: #991b1b; }
      .dl-badge--neutral { background: #e2e8f0; color: #334155; }
      .dl-empty {
        background: #fff;
        border: 1px dashed #cbd5e1;
        border-radius: 14px;
        padding: 24px;
        text-align: center;
      }
      .dl-empty-title {
        font-weight: 700;
        margin-bottom: 6px;
      }
      .dl-empty-body {
        color: #64748b;
      }
      .dl-toasts {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      .dl-toast {
        border-radius: 10px;
        padding: 9px 11px;
        font-size: 12px;
        color: #fff;
        background: #0f172a;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
      }
      .dl-toast--success { background: #16a34a; }
      .dl-toast--error { background: #dc2626; }

      .dl-modal {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dl-modal[hidden] { display: none; }
      .dl-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.56);
      }
      .dl-modal-panel {
        position: relative;
        width: min(1100px, 94vw);
        max-height: 92vh;
        background: #f5f9ff;
        border-radius: 16px;
        border: 1px solid #cfe0ff;
        padding: 14px;
        display: grid;
        gap: 10px;
        box-shadow: 0 20px 70px rgba(15, 23, 42, 0.35);
      }
      .dl-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }
      .dl-modal-title {
        font-size: 18px;
        font-weight: 700;
      }
      .dl-modal-meta {
        font-size: 13px;
        color: #64748b;
      }
      .dl-modal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dl-modal-body {
        min-height: min(72vh, 760px);
        background: #fff;
        border-radius: 12px;
        border: 1px solid #dce8ff;
        overflow: hidden;
      }
      .dl-pdf-wrap {
        width: 100%;
        height: 100%;
      }
      .dl-pdf {
        width: 100%;
        min-height: min(72vh, 760px);
        border: none;
        background: #f8fafc;
      }
      .dl-no-pdf-wrap {
        padding: 14px;
        height: 100%;
        overflow: auto;
      }
      .dl-no-pdf {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #fed7aa;
        background: #fff7ed;
        color: #9a3412;
        margin-bottom: 10px;
        font-size: 13px;
      }
      .dl-fallback {
        border: 1px solid #d8e3f9;
        border-radius: 12px;
        background: #fff;
        padding: 12px;
      }
      .dl-fb-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        color: #475569;
      }
      .dl-fb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .dl-fb-table th,
      .dl-fb-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 6px 4px;
        text-align: left;
      }
      .dl-fb-table .dl-num {
        text-align: right;
      }
      .dl-fb-total {
        margin-top: 10px;
        text-align: right;
        font-size: 13px;
      }

      body.dl-modal-open { overflow: hidden; }

      @media (max-width: 760px) {
        .dl-title { font-size: 24px; }
        .dl-kpis { grid-template-columns: 1fr; }
        .dl-header-actions { width: 100%; justify-content: space-between; }
        .dl-btn--new { padding: 8px 10px; font-size: 12px; }
        .dl-modal-panel {
          width: 96vw;
          max-height: 95vh;
          padding: 10px;
        }
        .dl-modal-body,
        .dl-pdf { min-height: 66vh; }
      }
    `;

    document.head.appendChild(style);
  }

  function findRoot() {
    return (
      document.querySelector("[data-devis-list]") ||
      document.querySelector("#devis-list-root") ||
      document.querySelector(".devis-list-root")
    );
  }
});
