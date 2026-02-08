document.documentElement.setAttribute("data-page", "clients");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblClientsLoaded) return;
  window.__mblClientsLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[CLIENTS] Root introuvable.");
    return;
  }

  const url = new URL(window.location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || window.location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[CLIENTS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[CLIENTS]", ...a);

  const GLOBAL_CFG = window.__MBL_CFG__ || {};

  const normalizeInvoiceUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    // Backward compatibility: "/facture" slug used to be used; prefer "/invoice".
    return raw.replace(/\/facture(?=([/?#]|$))/i, "/invoice");
  };

  const CONFIG = {
    SUPABASE_URL: GLOBAL_CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      GLOBAL_CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    CLIENTS_TABLE: root.dataset.clientsTable || GLOBAL_CFG.CLIENTS_TABLE || "clients",
    SITES_TABLE: root.dataset.sitesTable || "client_sites",
    ORGANIZATION_ID:
      root.dataset.organizationId ||
      GLOBAL_CFG.ORGANIZATION_ID ||
      window.__MBL_ORG_ID__ ||
      "",
    CURRENCY: root.dataset.currency || "EUR",
    INVOICE_URL: normalizeInvoiceUrl(root.dataset.invoiceUrl || root.dataset.factureUrl || "/facturation/invoice"),
    QUOTE_URL: root.dataset.quoteUrl || root.dataset.devisUrl || "/facturation/devis-add",
    MAX_ROWS: Number(root.dataset.maxRows || 800),
    THEME_PRIMARY: String(root.dataset.themePrimary || GLOBAL_CFG.THEME_PRIMARY || "#0ea5e9").trim() || "#0ea5e9",
  };

  const STR = {
    title: "Clients",
    subtitle: "Gestion et suivi des clients",
    searchPlaceholder: "Rechercher nom, ref, email, tel, SIRET...",
    statusAll: "Tous",
    statusActive: "Actifs",
    statusArchived: "Archives",
    btnNew: "Nouveau client",
    btnEdit: "Modifier",
    btnCancel: "Annuler",
    btnSave: "Enregistrer",
    btnArchive: "Archiver",
    btnRestore: "Restaurer",
    btnDelete: "Supprimer",
    btnNewInvoice: "Nouvelle facture",
    btnNewQuote: "Nouveau devis",
    emptyTitle: "Aucun client",
    emptyBody: "Ajoute ton premier client pour commencer.",
    emptySelect: "Selectionne un client a gauche, ou cree-en un nouveau.",
    loading: "Chargement des clients...",
    saving: "Enregistrement...",
    deleting: "Suppression...",
    orgMissing: "Organisation introuvable (RLS). Ajoute data-organization-id ou verifie organization_members.",
    notLogged: "Non connecte. Connecte-toi a l'extranet.",
    saveOk: "Client enregistre.",
    saveErr: "Impossible d'enregistrer le client.",
    deleteOk: "Client supprime.",
    deleteErr: "Impossible de supprimer le client.",
    deleteConfirmTitle: "Supprimer ce client ?",
    deleteConfirmBody: "Cette action est definitive. Les interventions/factures resteront, mais le client sera detache (client_id -> null).",
    deleteConfirmInput: "Tape SUPPRIMER pour confirmer",
    deleteConfirmBtn: "Confirmer la suppression",
    deleteConfirmCancel: "Annuler",
    sitesTitle: "Sites",
    sitesEmpty: "Aucun site. Ajoute une adresse pour faciliter les interventions.",
    siteNew: "Ajouter un site",
    siteEdit: "Modifier",
    siteSave: "Enregistrer",
    siteCancel: "Annuler",
    siteDelete: "Supprimer",
    siteSaved: "Site enregistre.",
    siteDeleted: "Site supprime.",
    siteSaveErr: "Impossible d'enregistrer le site.",
    siteDeleteErr: "Impossible de supprimer le site.",
  };

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

  const supabase = resolveSupabaseClient(CONFIG);
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  injectStyles();
  const els = renderShell(root, STR, CONFIG);

  const state = {
    currentUserId: "",
    organizationId: asUuid(CONFIG.ORGANIZATION_ID),
    filter: "active",
    search: "",
    clients: [],
    selectedId: "",
    mode: "view", // view | edit | create
    form: blankClientForm(),
    sites: [],
    siteMode: "idle", // idle | new | edit
    siteForm: blankSiteForm(),
    siteEditingId: "",
    dirtyClient: false,
    dirtySite: false,
    busy: false,
  };

  wireUI();
  await boot();

  async function boot() {
    setStatus(STR.loading);
    try {
      await resolveAuthContext();
      if (!state.currentUserId) {
        setStatus(STR.notLogged);
      } else if (!state.organizationId) {
        setStatus(STR.orgMissing);
      }
      await loadClients();
      renderList();

      const preselectId = resolveClientIdFromUrl();
      if (preselectId) openClientModal(preselectId, "view");

      if (state.currentUserId && state.organizationId) setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("");
      renderListError();
    }
  }

  function wireUI() {
    els.btnNew.addEventListener("click", () => startCreate());

    els.search.addEventListener("input", () => {
      state.search = String(els.search.value || "").trim().toLowerCase();
      renderList();
    });

    els.filters.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.filters.forEach((x) => x.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filter = btn.dataset.filter || "active";
        renderList();
      });
    });

    els.list.addEventListener("click", (e) => {
      const action = e.target.closest("[data-list-action]")?.dataset?.listAction || "";
      const card = e.target.closest("[data-client-id]");
      if (!card) return;
      const id = card.dataset.clientId || "";

      if (action === "edit") return openClientModal(id, "edit");
      if (action === "invoice") return openInvoiceUrlForId(id);
      if (action === "quote") return openQuoteUrlForId(id);

      // Default: view
      openClientModal(id, "view");
    });

    els.clientModalBackdrop.addEventListener("click", () => closeClientModal());
    els.clientModalInner.addEventListener("click", onDetailClick);
    els.clientModalInner.addEventListener("input", onDetailInput);
    els.clientModalInner.addEventListener("change", onDetailInput);

    els.modalBackdrop.addEventListener("click", closeDeleteModal);
    els.modalCancel.addEventListener("click", closeDeleteModal);
    els.modalConfirm.addEventListener("click", confirmDeleteClient);
    els.modalInput.addEventListener("input", () => {
      const ok = normalize(String(els.modalInput.value || "")) === "supprimer";
      els.modalConfirm.disabled = !ok;
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!els.modal.hidden) return closeDeleteModal();
      if (!els.clientModal.hidden) return closeClientModal();
    });
  }

  async function resolveAuthContext() {
    state.organizationId = asUuid(state.organizationId);
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

  function resolveClientIdFromUrl() {
    const params = new URLSearchParams(window.location.search || "");
    const raw = params.get("id") || params.get("client_id") || params.get("clientId") || "";
    return asUuid(raw);
  }

  async function loadClients() {
    const table = String(CONFIG.CLIENTS_TABLE || "").trim();
    if (!table) return;

    let q = supabase.from(table).select("*").order("name", { ascending: true }).limit(CONFIG.MAX_ROWS);
    if (state.organizationId) q = q.eq("organization_id", state.organizationId);

    let res = await q;
    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase.from(table).select("*").order("name", { ascending: true }).limit(CONFIG.MAX_ROWS);
    }

    if (res.error) throw res.error;

    state.clients = (res.data || []).map((c) => ({
      ...c,
      _norm: normalize(
        [
          c.name,
          c.legal_name,
          c.external_ref,
          c.email,
          c.phone,
          c.siret,
          c.vat_number,
        ].join(" ")
      ),
    }));
  }

  function renderListError() {
    els.list.innerHTML = `
      <div class="cl-empty">
        <div class="cl-empty-title">Erreur de chargement</div>
        <div class="cl-empty-body">Impossible de recuperer les clients.</div>
      </div>
    `;
  }

  function renderList() {
    const rows = filterClients(state.clients);
    els.count.textContent = String(rows.length);
    els.kpiCount.textContent = String(rows.length);
    els.kpiActive.textContent = String(rows.filter((c) => c.is_active !== false).length);
    els.kpiArchived.textContent = String(rows.filter((c) => c.is_active === false).length);

    if (!rows.length) {
      els.list.innerHTML = `
        <div class="cl-empty">
          <div class="cl-empty-title">${STR.emptyTitle}</div>
          <div class="cl-empty-body">${STR.emptyBody}</div>
        </div>
      `;
      return;
    }

    els.list.innerHTML = rows
      .map((c) => {
        const selected = String(c.id) === String(state.selectedId) ? "is-selected" : "";
        const active = c.is_active !== false;
        const badge = active ? `<span class="cl-pill cl-pill--ok">Actif</span>` : `<span class="cl-pill cl-pill--muted">Archive</span>`;
        const name = escapeHTML(c.name || "Client");
        const legal = escapeHTML(String(c.legal_name || "").trim());
        const ref = escapeHTML(String(c.external_ref || "").trim());
        const email = escapeHTML(String(c.email || "").trim());
        const phone = escapeHTML(String(c.phone || "").trim());
        const siret = escapeHTML(String(c.siret || "").trim());
        const metaBits = [ref ? `Ref: ${ref}` : "", email, phone, siret ? `SIRET: ${siret}` : ""].filter(Boolean);
        const meta = metaBits.length ? metaBits.join(" • ") : "—";
        return `
          <article class="cl-card ${selected}" data-client-id="${escapeHTML(c.id)}">
            <div class="cl-card-top">
              <div>
                <div class="cl-card-name">${name}</div>
                ${legal ? `<div class="cl-card-legal">${legal}</div>` : ""}
              </div>
              ${badge}
            </div>
            <div class="cl-card-meta">${escapeHTML(meta)}</div>
            <div class="cl-card-actions">
              <button type="button" class="cl-btn cl-btn--primary cl-btn--sm" data-list-action="view">Voir</button>
              <button type="button" class="cl-btn cl-btn--ghost cl-btn--sm" data-list-action="edit">Editer</button>
              <button type="button" class="cl-btn cl-btn--ghost cl-btn--sm" data-list-action="quote">Devis</button>
              <button type="button" class="cl-btn cl-btn--ghost cl-btn--sm" data-list-action="invoice">Facture</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function filterClients(items) {
    return (items || []).filter((c) => {
      const active = c.is_active !== false;
      if (state.filter === "active" && !active) return false;
      if (state.filter === "archived" && active) return false;
      if (state.search && !String(c._norm || "").includes(state.search)) return false;
      return true;
    });
  }

  function startCreate() {
    if (!confirmDiscardIfNeeded()) return;
    resetDirtyFlags();
    state.selectedId = "";
    state.mode = "create";
    state.form = blankClientForm();
    state.sites = [];
    state.siteMode = "idle";
    state.siteEditingId = "";
    state.siteForm = blankSiteForm();
    setClientModalOpen(true);
    renderList();
    renderDetail();
  }

  function syncBodyModalOpen() {
    const anyOpen = !els.modal.hidden || !els.clientModal.hidden;
    document.body.classList.toggle("cl-modal-open", anyOpen);
  }

  function setClientModalOpen(open) {
    els.clientModal.hidden = !open;
    syncBodyModalOpen();
  }

  function closeClientModal(force) {
    if (!force && !confirmDiscardIfNeeded()) return;
    setClientModalOpen(false);

    // Reset transient edit state.
    if (state.mode === "create") {
      state.selectedId = "";
      state.form = blankClientForm();
      state.sites = [];
    } else if (state.selectedId) {
      const found = state.clients.find((c) => String(c.id) === String(state.selectedId));
      if (found) state.form = clientToForm(found);
    }

    state.mode = "view";
    state.siteMode = "idle";
    state.siteEditingId = "";
    state.siteForm = blankSiteForm();
    resetDirtyFlags();
    renderList();
  }

  function openClientModal(id, mode) {
    const safe = asUuid(id);
    if (!safe) return;
    const requestedMode = mode === "edit" ? "edit" : "view";
    if (safe === state.selectedId && state.mode === requestedMode && !els.clientModal.hidden) return;
    if (!confirmDiscardIfNeeded()) return;
    resetDirtyFlags();

    const found = state.clients.find((c) => String(c.id) === String(safe));
    if (!found) return;

    state.selectedId = safe;
    state.mode = requestedMode;
    state.form = clientToForm(found);
    state.sites = [];
    state.siteMode = "idle";
    state.siteEditingId = "";
    state.siteForm = blankSiteForm();
    state.dirtyClient = false;
    state.dirtySite = false;

    setClientModalOpen(true);
    renderList();
    renderDetail();

    loadSitesForClient(safe).catch((e) => {
      console.error(e);
      showToast("warning", "Impossible de charger les sites.");
    });
  }

  function renderDetail() {
    if (els.clientModal.hidden) return;

    if (state.mode === "create") {
      els.clientModalInner.innerHTML = renderDetailHtml({
        title: "Nouveau client",
        subtitle: "Creation",
        pill: `<span class="cl-pill cl-pill--info">Nouveau</span>`,
      });
      return;
    }

    if (!state.selectedId) {
      els.clientModalInner.innerHTML = "";
      return;
    }

    const active = state.form.is_active !== false;
    const title = escapeHTML(state.form.name || "Client");
    const subtitleBits = [];
    if (state.form.external_ref) subtitleBits.push(`Ref: ${state.form.external_ref}`);
    if (state.form.email) subtitleBits.push(state.form.email);
    if (state.form.phone) subtitleBits.push(state.form.phone);
    const subtitle = escapeHTML(subtitleBits.join(" • ") || "—");
    const pill = active ? `<span class="cl-pill cl-pill--ok">Actif</span>` : `<span class="cl-pill cl-pill--muted">Archive</span>`;
    els.clientModalInner.innerHTML = renderDetailHtml({ title, subtitle, pill });
  }

  function renderDetailHtml({ title, subtitle, pill }) {
    const editing = state.mode === "edit" || state.mode === "create";
    const isExisting = !!asUuid(state.form.id);
    const canArchive = isExisting && state.mode === "view";
    const canDelete = isExisting && state.mode === "view";

    const headerActions = editing
      ? `
        <button class="cl-btn cl-btn--ghost" data-action="cancel">${STR.btnCancel}</button>
        <button class="cl-btn cl-btn--primary" data-action="save">${STR.btnSave}</button>
        <button class="cl-iconbtn" type="button" data-action="close" aria-label="Fermer">&times;</button>
      `
      : `
        <button class="cl-btn cl-btn--ghost" data-action="edit">${STR.btnEdit}</button>
        <button class="cl-btn cl-btn--ghost" data-action="new-quote" ${isExisting ? "" : "disabled"}>${STR.btnNewQuote}</button>
        <button class="cl-btn cl-btn--ghost" data-action="new-invoice" ${isExisting ? "" : "disabled"}>${STR.btnNewInvoice}</button>
        <div class="cl-split"></div>
        <button class="cl-btn cl-btn--ghost" data-action="toggle-active" ${canArchive ? "" : "disabled"}>${state.form.is_active === false ? STR.btnRestore : STR.btnArchive}</button>
        <button class="cl-btn cl-btn--danger" data-action="delete" ${canDelete ? "" : "disabled"}>${STR.btnDelete}</button>
        <button class="cl-iconbtn" type="button" data-action="close" aria-label="Fermer">&times;</button>
      `;

    const vatPresetId = vatExemptionPresetIdFromText(state.form.vat_exemption_text);

    const sitesHtml = renderSitesSection();

    return `
      <section class="cl-detail">
        <header class="cl-detail-head">
          <div>
            <div class="cl-detail-title-row">
              <div class="cl-detail-title">${title}</div>
              ${pill || ""}
            </div>
            <div class="cl-detail-sub">${subtitle || ""}</div>
          </div>
          <div class="cl-detail-actions">
            ${headerActions}
          </div>
        </header>

        <div class="cl-detail-grid">
            <div class="cl-box">
            <div class="cl-box-title">Identite</div>
            <div class="cl-field">
              <label>Nom (affichage)</label>
              <input class="cl-input" data-field="name" value="${escapeHTML(state.form.name)}" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>Raison sociale</label>
              <input class="cl-input" data-field="legal_name" value="${escapeHTML(state.form.legal_name)}" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>Reference client</label>
              <input class="cl-input" data-field="external_ref" value="${escapeHTML(state.form.external_ref)}" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>SIRET</label>
              <input class="cl-input" data-field="siret" value="${escapeHTML(state.form.siret)}" placeholder="Ex: 123 456 789 00012" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>TVA intracommunautaire</label>
              <input class="cl-input" data-field="vat_number" value="${escapeHTML(state.form.vat_number)}" placeholder="Ex: FR.." ${editing ? "" : "readonly"} />
            </div>
          </div>

          <div class="cl-box">
            <div class="cl-box-title">Contact</div>
            <div class="cl-field">
              <label>Email</label>
              <input class="cl-input" data-field="email" value="${escapeHTML(state.form.email)}" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>Telephone</label>
              <input class="cl-input" data-field="phone" value="${escapeHTML(state.form.phone)}" ${editing ? "" : "readonly"} />
            </div>
            <div class="cl-field">
              <label>Notes internes</label>
              <textarea class="cl-textarea" data-field="notes" rows="5" ${editing ? "" : "readonly"}>${escapeHTML(state.form.notes)}</textarea>
            </div>
          </div>

          <div class="cl-box cl-box--wide">
            <div class="cl-box-title">Facturation</div>
            <div class="cl-two">
              <div class="cl-field">
                <label>Adresse de facturation</label>
                <textarea class="cl-textarea" data-field="billing_address" rows="4" placeholder="Rue + CP Ville + Pays (1 ligne par ligne)" ${editing ? "" : "readonly"}>${escapeHTML(state.form.billing_address)}</textarea>
              </div>
              <div class="cl-field">
                <label>Paiement (jours)</label>
                <input class="cl-input" data-field="payment_terms_days" inputmode="numeric" value="${escapeHTML(state.form.payment_terms_days)}" placeholder="Ex: 30" ${editing ? "" : "readonly"} />
                <div class="cl-help">Optionnel. Sinon, les valeurs de l'organisation s'appliquent.</div>
              </div>
            </div>

            <div class="cl-three">
              <div class="cl-field">
                <label>Taux penalites (% annuel)</label>
                <input class="cl-input" data-field="late_fee_rate" inputmode="decimal" value="${escapeHTML(state.form.late_fee_rate)}" placeholder="Ex: 10" ${editing ? "" : "readonly"} />
              </div>
              <div class="cl-field">
                <label>Indemnite recouvrement (EUR)</label>
                <input class="cl-input" data-field="recovery_fee_eur" inputmode="decimal" value="${escapeHTML(state.form.recovery_fee_eur)}" placeholder="Ex: 40,00" ${editing ? "" : "readonly"} />
              </div>
              <div class="cl-field">
                <label>Factures sans TVA</label>
                <label class="cl-switch">
                  <input type="checkbox" data-field="is_vat_exempt" ${state.form.is_vat_exempt ? "checked" : ""} ${editing ? "" : "disabled"} />
                  <span>Exoneration / mention TVA</span>
                </label>
              </div>
            </div>

            <div class="cl-two">
              <div class="cl-field">
                <label>Mention TVA (si TVA = 0)</label>
                <select class="cl-input" data-field="vat_exemption_preset" ${editing ? "" : "disabled"}>
                  <option value="">Aucune</option>
                  ${VAT_EXEMPTION_PRESETS.map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === vatPresetId ? "selected" : ""}>${escapeHTML(p.label)}</option>`).join("")}
                  <option value="__custom__" ${vatPresetId === "__custom__" ? "selected" : ""}>Autre (personnalisee)</option>
                </select>
                <textarea class="cl-textarea" data-field="vat_exemption_text" rows="2" ${editing ? "" : "readonly"}>${escapeHTML(
                  state.form.vat_exemption_text
                )}</textarea>
                <div class="cl-help">Utilise sur la facture si la TVA calculee est a 0.</div>
              </div>
              <div class="cl-field">
                <label>Etat</label>
                <select class="cl-input" data-field="is_active" ${editing ? "" : "disabled"}>
                  <option value="1" ${state.form.is_active !== false ? "selected" : ""}>Actif</option>
                  <option value="0" ${state.form.is_active === false ? "selected" : ""}>Archive</option>
                </select>
                <div class="cl-help">Conseil: privilegie "Archive" plutot que la suppression.</div>
              </div>
            </div>
          </div>
        </div>

        ${sitesHtml}
      </section>
    `;
  }

  function renderSitesSection() {
    if (!asUuid(state.form.id)) return "";

    const editing = state.mode === "edit" || state.mode === "create";
    const sites = Array.isArray(state.sites) ? state.sites : [];
    const canManageSites = !editing;

    const listHtml = sites.length
      ? `
        <div class="cl-sites-list">
          ${sites
            .map((s) => {
              const active = s.is_active !== false;
              const pill = active ? `<span class="cl-pill cl-pill--ok">Actif</span>` : `<span class="cl-pill cl-pill--muted">Archive</span>`;
              const isEditing = state.siteMode === "edit" && String(state.siteEditingId) === String(s.id);
              const name = escapeHTML(s.name || "Site");
              const addr = escapeHTML([s.address, s.postal_code, s.city, s.country].filter(Boolean).join(" "));
              const phone = escapeHTML(String(s.support_phone || "").trim());

              if (isEditing) {
                return `
                  <div class="cl-site cl-site--edit" data-site-id="${escapeHTML(s.id)}">
                    <div class="cl-site-head">
                      <div class="cl-site-title">Edition site</div>
                      ${pill}
                    </div>
                    <div class="cl-site-grid">
                      <div class="cl-field"><label>Nom</label><input class="cl-input" data-site-field="name" value="${escapeHTML(state.siteForm.name)}" /></div>
                      <div class="cl-field"><label>Telephone support</label><input class="cl-input" data-site-field="support_phone" value="${escapeHTML(state.siteForm.support_phone)}" /></div>
                      <div class="cl-field cl-field--wide"><label>Adresse</label><input class="cl-input" data-site-field="address" value="${escapeHTML(state.siteForm.address)}" /></div>
                      <div class="cl-field"><label>CP</label><input class="cl-input" data-site-field="postal_code" value="${escapeHTML(state.siteForm.postal_code)}" /></div>
                      <div class="cl-field"><label>Ville</label><input class="cl-input" data-site-field="city" value="${escapeHTML(state.siteForm.city)}" /></div>
                      <div class="cl-field"><label>Pays</label><input class="cl-input" data-site-field="country" value="${escapeHTML(state.siteForm.country)}" /></div>
                      <div class="cl-field cl-field--wide"><label>Notes acces</label><textarea class="cl-textarea" data-site-field="access_notes" rows="2">${escapeHTML(
                        state.siteForm.access_notes
                      )}</textarea></div>
                      <div class="cl-field cl-field--wide">
                        <label class="cl-switch">
                          <input type="checkbox" data-site-field="is_active" ${state.siteForm.is_active ? "checked" : ""} />
                          <span>Site actif</span>
                        </label>
                      </div>
                    </div>
                    <div class="cl-site-actions">
                      <button class="cl-btn cl-btn--ghost" data-site-action="cancel">Annuler</button>
                      <button class="cl-btn cl-btn--primary" data-site-action="save">Enregistrer</button>
                    </div>
                  </div>
                `;
              }

              return `
                <div class="cl-site" data-site-id="${escapeHTML(s.id)}">
                  <div class="cl-site-head">
                    <div>
                      <div class="cl-site-title">${name}</div>
                      <div class="cl-site-meta">${addr || "—"}${phone ? ` • ${phone}` : ""}</div>
                    </div>
                    ${pill}
                  </div>
                  <div class="cl-site-actions">
                    <button class="cl-btn cl-btn--ghost" data-site-action="edit" ${canManageSites ? "" : "disabled"}>${STR.siteEdit}</button>
                    <button class="cl-btn cl-btn--danger" data-site-action="delete" ${canManageSites ? "" : "disabled"}>${STR.siteDelete}</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `
      : `<div class="cl-sites-empty">${STR.sitesEmpty}</div>`;

    const newHtml =
      state.siteMode === "new"
        ? `
          <div class="cl-site cl-site--edit" data-site-id="__new__">
            <div class="cl-site-head">
              <div class="cl-site-title">Nouveau site</div>
              <span class="cl-pill cl-pill--info">Nouveau</span>
            </div>
            <div class="cl-site-grid">
              <div class="cl-field"><label>Nom</label><input class="cl-input" data-site-field="name" value="${escapeHTML(state.siteForm.name)}" /></div>
              <div class="cl-field"><label>Telephone support</label><input class="cl-input" data-site-field="support_phone" value="${escapeHTML(state.siteForm.support_phone)}" /></div>
              <div class="cl-field cl-field--wide"><label>Adresse</label><input class="cl-input" data-site-field="address" value="${escapeHTML(state.siteForm.address)}" /></div>
              <div class="cl-field"><label>CP</label><input class="cl-input" data-site-field="postal_code" value="${escapeHTML(state.siteForm.postal_code)}" /></div>
              <div class="cl-field"><label>Ville</label><input class="cl-input" data-site-field="city" value="${escapeHTML(state.siteForm.city)}" /></div>
              <div class="cl-field"><label>Pays</label><input class="cl-input" data-site-field="country" value="${escapeHTML(state.siteForm.country)}" /></div>
              <div class="cl-field cl-field--wide"><label>Notes acces</label><textarea class="cl-textarea" data-site-field="access_notes" rows="2">${escapeHTML(
                state.siteForm.access_notes
              )}</textarea></div>
              <div class="cl-field cl-field--wide">
                <label class="cl-switch">
                  <input type="checkbox" data-site-field="is_active" ${state.siteForm.is_active ? "checked" : ""} />
                  <span>Site actif</span>
                </label>
              </div>
            </div>
            <div class="cl-site-actions">
              <button class="cl-btn cl-btn--ghost" data-site-action="cancel">Annuler</button>
              <button class="cl-btn cl-btn--primary" data-site-action="save">Enregistrer</button>
            </div>
          </div>
        `
        : "";

    return `
      <section class="cl-sites">
        <div class="cl-sites-head">
          <div class="cl-sites-title">${STR.sitesTitle}</div>
          <button class="cl-btn cl-btn--primary cl-btn--sm" data-site-action="new" ${canManageSites ? "" : "disabled"}>${STR.siteNew}</button>
        </div>
        ${newHtml}
        ${listHtml}
      </section>
    `;
  }

  function onDetailClick(e) {
    const action = e.target.closest("[data-action]")?.dataset?.action || "";
    if (action === "new") return startCreate();
    if (action === "edit") return startEdit();
    if (action === "cancel") return cancelEdit();
    if (action === "save") return saveClient();
    if (action === "close") return closeClientModal();
    if (action === "toggle-active") return toggleClientActive();
    if (action === "delete") return openDeleteModal();
    if (action === "new-invoice") return openInvoiceForClient();
    if (action === "new-quote") return openQuoteForClient();

    const siteAction = e.target.closest("[data-site-action]")?.dataset?.siteAction || "";
    if (siteAction) return handleSiteAction(siteAction, e.target.closest("[data-site-id]")?.dataset?.siteId || "");
  }

  function onDetailInput(e) {
    const field = e.target?.dataset?.field;
    if (field) {
      if (state.mode !== "edit" && state.mode !== "create") return;
      if (field === "is_vat_exempt") {
        state.form.is_vat_exempt = !!e.target.checked;
        if (!state.form.is_vat_exempt) state.form.vat_exemption_text = "";
      } else if (field === "is_active") {
        state.form.is_active = String(e.target.value || "1") !== "0";
      } else if (field === "vat_exemption_preset") {
        const id = String(e.target.value || "").trim();
        if (!id) {
          state.form.vat_exemption_text = "";
          state.form.is_vat_exempt = false;
        } else if (id !== "__custom__") {
          const hit = VAT_EXEMPTION_PRESETS.find((p) => p.id === id);
          if (hit) {
            state.form.vat_exemption_text = hit.text;
            state.form.is_vat_exempt = true;
          }
        }
      } else if (field === "vat_exemption_text") {
        state.form.vat_exemption_text = String(e.target.value || "").trim();
        if (state.form.vat_exemption_text) state.form.is_vat_exempt = true;
      } else {
        state.form[field] = String(e.target.value || "");
      }
      state.dirtyClient = true;
      return;
    }

    const siteField = e.target?.dataset?.siteField;
    if (siteField) {
      if (state.siteMode !== "new" && state.siteMode !== "edit") return;
      if (siteField === "is_active") state.siteForm.is_active = !!e.target.checked;
      else state.siteForm[siteField] = String(e.target.value || "");
      state.dirtySite = true;
    }
  }

  function startEdit() {
    if (!state.selectedId) return;
    if (!confirmDiscardIfNeeded()) return;
    // Switching client mode should close any site edit form to avoid inconsistent UX.
    state.siteMode = "idle";
    state.siteEditingId = "";
    state.siteForm = blankSiteForm();
    state.dirtySite = false;
    const found = state.clients.find((c) => String(c.id) === String(state.selectedId));
    if (!found) return;
    state.mode = "edit";
    state.form = clientToForm(found);
    state.dirtyClient = false;
    renderDetail();
  }

  function cancelEdit() {
    if (state.mode === "create") {
      closeClientModal(true);
      return;
    }
    if (!state.selectedId) return;
    const found = state.clients.find((c) => String(c.id) === String(state.selectedId));
    state.mode = "view";
    state.form = found ? clientToForm(found) : blankClientForm();
    state.dirtyClient = false;
    renderDetail();
  }

  async function saveClient() {
    if (state.busy) return;
    if (!String(state.form.name || "").trim()) {
      showToast("warning", "Le nom client est obligatoire.");
      return;
    }
    if (!state.organizationId) {
      showToast("warning", STR.orgMissing);
      return;
    }

    state.busy = true;
    setStatus(STR.saving);
    try {
      const payload = clientFormToPayload(state.form);
      payload.organization_id = state.organizationId;

      const table = String(CONFIG.CLIENTS_TABLE || "").trim();
      let res;

      if (asUuid(state.form.id)) {
        res = await supabase
          .from(table)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", state.form.id)
          .select("*")
          .maybeSingle();
      } else {
        res = await supabase
          .from(table)
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select("*")
          .maybeSingle();
      }

      if (res.error) {
        console.error(res.error);
        showToast("error", STR.saveErr);
        return;
      }

      const saved = res.data || {};
      const id = saved.id || state.form.id;
      await loadClients();
      state.selectedId = String(id || "");
      state.mode = "view";
      const fresh = state.clients.find((c) => String(c.id) === String(state.selectedId));
      state.form = fresh ? clientToForm(fresh) : clientToForm(saved);
      resetDirtyFlags();
      renderList();
      renderDetail();
      showToast("success", STR.saveOk);
    } catch (e) {
      console.error(e);
      showToast("error", STR.saveErr);
    } finally {
      state.busy = false;
      setStatus(state.organizationId ? "" : STR.orgMissing);
    }
  }

  function openInvoiceUrlForId(id) {
    if (!confirmDiscardIfNeeded()) return;
    const safe = asUuid(id);
    if (!safe) return;
    const base = String(CONFIG.INVOICE_URL || "").trim() || "/facturation/invoice";
    const sep = base.includes("?") ? "&" : "?";
    window.location.href = `${base}${sep}client_id=${encodeURIComponent(safe)}`;
  }

  function openQuoteUrlForId(id) {
    if (!confirmDiscardIfNeeded()) return;
    const safe = asUuid(id);
    if (!safe) return;
    const base = String(CONFIG.QUOTE_URL || "").trim() || "/facturation/devis-add";
    const sep = base.includes("?") ? "&" : "?";
    window.location.href = `${base}${sep}client_id=${encodeURIComponent(safe)}`;
  }

  function openInvoiceForClient() {
    openInvoiceUrlForId(state.form.id);
  }

  function openQuoteForClient() {
    openQuoteUrlForId(state.form.id);
  }

  async function toggleClientActive() {
    if (state.busy) return;
    if (!asUuid(state.form.id)) return;
    const table = String(CONFIG.CLIENTS_TABLE || "").trim();
    const next = state.form.is_active === false;
    state.busy = true;
    try {
      const res = await supabase
        .from(table)
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq("id", state.form.id);
      if (res.error) {
        console.error(res.error);
        showToast("error", "Impossible de mettre a jour l'etat.");
        return;
      }
      await loadClients();
      const fresh = state.clients.find((c) => String(c.id) === String(state.form.id));
      state.form = fresh ? clientToForm(fresh) : { ...state.form, is_active: next };
      renderList();
      renderDetail();
    } finally {
      state.busy = false;
    }
  }

  function openDeleteModal() {
    if (!asUuid(state.form.id)) return;
    els.modal.hidden = false;
    syncBodyModalOpen();
    els.modalTitle.textContent = STR.deleteConfirmTitle;
    els.modalBody.textContent = STR.deleteConfirmBody;
    els.modalInput.value = "";
    els.modalConfirm.disabled = true;
  }

  function closeDeleteModal() {
    els.modal.hidden = true;
    syncBodyModalOpen();
  }

  async function confirmDeleteClient() {
    if (state.busy) return;
    const ok = normalize(String(els.modalInput.value || "")) === "supprimer";
    if (!ok) return;
    if (!asUuid(state.form.id)) return;

    state.busy = true;
    setStatus(STR.deleting);
    try {
      const table = String(CONFIG.CLIENTS_TABLE || "").trim();
      const res = await supabase.from(table).delete().eq("id", state.form.id);
      if (res.error) {
        console.error(res.error);
        showToast("error", STR.deleteErr);
        return;
      }

      closeDeleteModal();
      await loadClients();
      state.selectedId = "";
      state.mode = "view";
      state.form = blankClientForm();
      state.sites = [];
      resetDirtyFlags();
      closeClientModal(true);
      showToast("success", STR.deleteOk);
    } catch (e) {
      console.error(e);
      showToast("error", STR.deleteErr);
    } finally {
      state.busy = false;
      setStatus(state.organizationId ? "" : STR.orgMissing);
    }
  }

  async function loadSitesForClient(clientId) {
    const cid = asUuid(clientId);
    if (!cid) return;
    const table = String(CONFIG.SITES_TABLE || "").trim();
    if (!table) return;

    let q = supabase.from(table).select("*").eq("client_id", cid).order("created_at", { ascending: false }).limit(200);
    if (state.organizationId) q = q.eq("organization_id", state.organizationId);
    let res = await q;
    if (res.error && isMissingColumnError(res.error)) {
      res = await supabase.from(table).select("*").eq("client_id", cid).order("created_at", { ascending: false }).limit(200);
    }
    if (res.error) throw res.error;

    state.sites = res.data || [];
    renderDetail();
  }

  function handleSiteAction(action, siteId) {
    if (!asUuid(state.form.id)) return;
    if (state.mode !== "view") return;
    if ((action === "new" || action === "edit") && !confirmDiscardIfNeeded()) return;

    if (action === "new") {
      state.siteMode = "new";
      state.siteEditingId = "";
      state.siteForm = blankSiteForm();
      state.dirtySite = false;
      renderDetail();
      return;
    }

    if (action === "edit") {
      const found = state.sites.find((s) => String(s.id) === String(siteId));
      if (!found) return;
      state.siteMode = "edit";
      state.siteEditingId = String(found.id);
      state.siteForm = siteToForm(found);
      state.dirtySite = false;
      renderDetail();
      return;
    }

    if (action === "cancel") {
      state.siteMode = "idle";
      state.siteEditingId = "";
      state.siteForm = blankSiteForm();
      state.dirtySite = false;
      renderDetail();
      return;
    }

    if (action === "save") {
      saveSite(siteId);
      return;
    }

    if (action === "delete") {
      if (!window.confirm("Supprimer ce site ?")) return;
      deleteSite(siteId);
    }
  }

  async function saveSite(siteId) {
    if (state.busy) return;
    const clientId = asUuid(state.form.id);
    if (!clientId) return;
    if (!String(state.siteForm.address || "").trim() && !String(state.siteForm.name || "").trim()) {
      showToast("warning", "Renseigne au moins un nom ou une adresse.");
      return;
    }

    const table = String(CONFIG.SITES_TABLE || "").trim();
    const payload = siteFormToPayload(state.siteForm);
    payload.client_id = clientId;
    payload.organization_id = state.organizationId;

    state.busy = true;
    try {
      let res;
      if (state.siteMode === "edit" && asUuid(siteId)) {
        res = await supabase.from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq("id", siteId).select("*").maybeSingle();
      } else {
        res = await supabase.from(table).insert({ ...payload, created_at: new Date().toISOString() }).select("*").maybeSingle();
      }
      if (res.error) {
        console.error(res.error);
        showToast("error", STR.siteSaveErr);
        return;
      }
      showToast("success", STR.siteSaved);
      state.siteMode = "idle";
      state.siteEditingId = "";
      state.siteForm = blankSiteForm();
      state.dirtySite = false;
      await loadSitesForClient(clientId);
    } catch (e) {
      console.error(e);
      showToast("error", STR.siteSaveErr);
    } finally {
      state.busy = false;
    }
  }

  async function deleteSite(siteId) {
    if (state.busy) return;
    const clientId = asUuid(state.form.id);
    if (!clientId) return;
    if (!asUuid(siteId)) return;
    const table = String(CONFIG.SITES_TABLE || "").trim();

    state.busy = true;
    try {
      const res = await supabase.from(table).delete().eq("id", siteId);
      if (res.error) {
        console.error(res.error);
        showToast("error", STR.siteDeleteErr);
        return;
      }
      showToast("success", STR.siteDeleted);
      await loadSitesForClient(clientId);
    } catch (e) {
      console.error(e);
      showToast("error", STR.siteDeleteErr);
    } finally {
      state.busy = false;
    }
  }

  function blankClientForm() {
    return {
      id: "",
      name: "",
      legal_name: "",
      external_ref: "",
      email: "",
      phone: "",
      billing_address: "",
      payment_terms_days: "",
      late_fee_rate: "",
      recovery_fee_eur: "",
      siret: "",
      vat_number: "",
      is_active: true,
      is_vat_exempt: false,
      vat_exemption_text: "",
      notes: "",
      _metadata: {},
    };
  }

  function clientToForm(row) {
    const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const notes = String(meta.notes || "").trim();
    return {
      ...blankClientForm(),
      id: String(row.id || ""),
      name: String(row.name || ""),
      legal_name: String(row.legal_name || ""),
      external_ref: String(row.external_ref || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      billing_address: String(row.billing_address || ""),
      payment_terms_days: row.payment_terms_days === null || row.payment_terms_days === undefined ? "" : String(row.payment_terms_days),
      late_fee_rate: row.late_fee_rate === null || row.late_fee_rate === undefined ? "" : String(row.late_fee_rate),
      recovery_fee_eur: centsToInputEuros(row.recovery_fee_cents),
      siret: String(row.siret || ""),
      vat_number: String(row.vat_number || ""),
      is_active: row.is_active !== false,
      is_vat_exempt: !!row.is_vat_exempt,
      vat_exemption_text: String(row.vat_exemption_text || ""),
      notes,
      _metadata: meta,
    };
  }

  function clientFormToPayload(form) {
    const meta = { ...(form?._metadata && typeof form._metadata === "object" ? form._metadata : {}) };
    const notes = String(form.notes || "").trim();
    if (notes) meta.notes = notes;
    else delete meta.notes;

    const recoveryFeeCents = eurosToCents(form.recovery_fee_eur);

    return {
      name: String(form.name || "").trim(),
      legal_name: normalizeNull(form.legal_name),
      external_ref: normalizeNull(form.external_ref),
      email: normalizeNull(form.email),
      phone: normalizeNull(form.phone),
      siret: normalizeNull(form.siret),
      vat_number: normalizeNull(form.vat_number),
      billing_address: normalizeNull(form.billing_address),
      payment_terms_days: parseIntOrNull(form.payment_terms_days),
      late_fee_rate: parseNumberOrNull(form.late_fee_rate),
      recovery_fee_cents: recoveryFeeCents === null ? null : recoveryFeeCents,
      is_vat_exempt: !!form.is_vat_exempt,
      vat_exemption_text: normalizeNull(form.vat_exemption_text),
      is_active: form.is_active !== false,
      metadata: meta,
      updated_at: new Date().toISOString(),
    };
  }

  function blankSiteForm() {
    return {
      name: "",
      address: "",
      city: "",
      postal_code: "",
      country: "",
      support_phone: "",
      access_notes: "",
      is_active: true,
    };
  }

  function siteToForm(row) {
    return {
      ...blankSiteForm(),
      name: String(row.name || ""),
      address: String(row.address || ""),
      city: String(row.city || ""),
      postal_code: String(row.postal_code || ""),
      country: String(row.country || ""),
      support_phone: String(row.support_phone || ""),
      access_notes: String(row.access_notes || ""),
      is_active: row.is_active !== false,
    };
  }

  function siteFormToPayload(form) {
    return {
      name: normalizeNull(form.name),
      address: normalizeNull(form.address),
      city: normalizeNull(form.city),
      postal_code: normalizeNull(form.postal_code),
      country: normalizeNull(form.country),
      support_phone: normalizeNull(form.support_phone),
      access_notes: normalizeNull(form.access_notes),
      is_active: form.is_active !== false,
    };
  }

  function normalizeNull(value) {
    const v = String(value || "").trim();
    return v ? v : null;
  }

  function parseIntOrNull(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function parseNumberOrNull(value) {
    const raw = String(value || "").trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function eurosToCents(val) {
    if (val === null || val === undefined) return null;
    const raw = String(val).trim();
    if (!raw) return null;
    const sanitized = raw.replace(/\s/g, "").replace(/€/g, "").replace(/,/g, ".");
    if (!/^[-+]?\d*(?:\.\d+)?$/.test(sanitized)) return null;
    const n = Number(sanitized);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function centsToInputEuros(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return "";
    return (n / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function hasUnsavedChanges() {
    const clientDirty = (state.mode === "edit" || state.mode === "create") && state.dirtyClient;
    const siteDirty = (state.siteMode === "new" || state.siteMode === "edit") && state.dirtySite;
    return clientDirty || siteDirty;
  }

  function confirmDiscardIfNeeded() {
    if (!hasUnsavedChanges()) return true;
    return window.confirm("Des modifications non enregistrees vont etre perdues. Continuer ?");
  }

  function resetDirtyFlags() {
    state.dirtyClient = false;
    state.dirtySite = false;
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

  function setStatus(text) {
    els.status.textContent = text || "";
  }

  function showToast(type, message) {
    if (!els.toasts) return;
    const el = document.createElement("div");
    el.className = `cl-toast cl-toast--${type}`;
    el.textContent = message;
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
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

  function renderShell(rootEl, copy, config) {
    rootEl.innerHTML = `
      <section class="cl-shell" style="--cl-primary:${escapeHTML(config.THEME_PRIMARY)}">
        <header class="cl-header">
          <div>
            <div class="cl-eyebrow">${copy.subtitle}</div>
            <div class="cl-title">${copy.title}</div>
          </div>
          <div class="cl-header-actions">
            <button class="cl-btn cl-btn--primary" data-new>${copy.btnNew}</button>
            <div class="cl-count" data-count>0</div>
          </div>
        </header>

        <div class="cl-status" data-status></div>

        <div class="cl-controls">
          <div class="cl-filters">
            <button class="cl-chip is-active" data-filter="active">${copy.statusActive}</button>
            <button class="cl-chip" data-filter="archived">${copy.statusArchived}</button>
            <button class="cl-chip" data-filter="all">${copy.statusAll}</button>
          </div>
          <input class="cl-search" type="search" placeholder="${copy.searchPlaceholder}" data-search />
        </div>

        <div class="cl-kpis">
          <div class="cl-kpi">
            <div class="cl-kpi-label">Affiches</div>
            <div class="cl-kpi-value" data-kpi-count>0</div>
          </div>
          <div class="cl-kpi">
            <div class="cl-kpi-label">Actifs</div>
            <div class="cl-kpi-value" data-kpi-active>0</div>
          </div>
          <div class="cl-kpi">
            <div class="cl-kpi-label">Archives</div>
            <div class="cl-kpi-value" data-kpi-archived>0</div>
          </div>
        </div>

        <div class="cl-list" data-list></div>

        <div class="cl-toasts" data-toasts></div>

        <div class="cl-cmodal" data-client-modal hidden>
          <div class="cl-modal-backdrop" data-client-modal-backdrop></div>
          <div class="cl-cmodal-panel">
            <div class="cl-cmodal-inner" data-client-modal-inner></div>
          </div>
        </div>

        <div class="cl-modal" data-modal hidden>
          <div class="cl-modal-backdrop" data-modal-backdrop></div>
          <div class="cl-modal-panel">
            <div class="cl-modal-title" data-modal-title></div>
            <div class="cl-modal-body" data-modal-body></div>
            <input class="cl-input" data-modal-input placeholder="${copy.deleteConfirmInput}" />
            <div class="cl-modal-actions">
              <button class="cl-btn cl-btn--ghost" data-modal-cancel>${copy.deleteConfirmCancel}</button>
              <button class="cl-btn cl-btn--danger" data-modal-confirm disabled>${copy.deleteConfirmBtn}</button>
            </div>
          </div>
        </div>
      </section>
    `;

    return {
      btnNew: rootEl.querySelector("[data-new]"),
      count: rootEl.querySelector("[data-count]"),
      status: rootEl.querySelector("[data-status]"),
      search: rootEl.querySelector("[data-search]"),
      filters: Array.from(rootEl.querySelectorAll("[data-filter]")),
      kpiCount: rootEl.querySelector("[data-kpi-count]"),
      kpiActive: rootEl.querySelector("[data-kpi-active]"),
      kpiArchived: rootEl.querySelector("[data-kpi-archived]"),
      list: rootEl.querySelector("[data-list]"),
      toasts: rootEl.querySelector("[data-toasts]"),
      clientModal: rootEl.querySelector("[data-client-modal]"),
      clientModalBackdrop: rootEl.querySelector("[data-client-modal-backdrop]"),
      clientModalInner: rootEl.querySelector("[data-client-modal-inner]"),
      modal: rootEl.querySelector("[data-modal]"),
      modalBackdrop: rootEl.querySelector("[data-modal-backdrop]"),
      modalTitle: rootEl.querySelector("[data-modal-title]"),
      modalBody: rootEl.querySelector("[data-modal-body]"),
      modalInput: rootEl.querySelector("[data-modal-input]"),
      modalCancel: rootEl.querySelector("[data-modal-cancel]"),
      modalConfirm: rootEl.querySelector("[data-modal-confirm]"),
    };
  }

  function injectStyles() {
    if (document.getElementById("cl-styles")) return;
    const style = document.createElement("style");
    style.id = "cl-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      .cl-shell, .cl-shell * { box-sizing: border-box; }

      .cl-shell {
        font-family: "Manrope", sans-serif;
        --cl-ink: #0f172a;
        --cl-soft: #5b708a;
        --cl-border: #d9e7ff;
        --cl-surface: rgba(255,255,255,0.82);
        --cl-surface-2: rgba(255,255,255,0.92);
        --cl-shadow: 0 14px 30px rgba(15, 23, 42, 0.07);
        color: var(--cl-ink);
        background:
          radial-gradient(1100px 520px at -5% -18%, rgba(14, 165, 233, 0.18), transparent 60%),
          radial-gradient(980px 520px at 105% 0, rgba(37, 99, 235, 0.12), transparent 62%),
          linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
        border: 1px solid #d3e2ff;
        border-radius: 18px;
        padding: 18px;
      }

      .cl-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        margin-bottom: 10px;
      }
      .cl-eyebrow {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--cl-soft);
      }
      .cl-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 28px;
        font-weight: 700;
      }
      .cl-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .cl-count {
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

      .cl-status {
        min-height: 18px;
        font-size: 13px;
        color: var(--cl-soft);
        margin-bottom: 12px;
      }

      .cl-controls {
        display: grid;
        grid-template-columns: 1fr minmax(260px, 360px);
        gap: 10px;
        align-items: center;
        margin-bottom: 12px;
      }
      .cl-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .cl-chip {
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.65);
        color: #0f172a;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
        user-select: none;
      }
      .cl-chip:hover { transform: translateY(-1px); background: #fff; }
      .cl-chip.is-active {
        background: var(--cl-primary);
        border-color: var(--cl-primary);
        color: #fff;
      }
      .cl-search {
        width: 100%;
        border: 1px solid #cfe0ff;
        background: rgba(255, 255, 255, 0.78);
        border-radius: 14px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }
      .cl-search:focus {
        box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.14);
        border-color: rgba(14, 165, 233, 0.55);
      }

      .cl-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }
      .cl-kpi {
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid #d9e7ff;
        border-radius: 16px;
        padding: 10px 12px;
        backdrop-filter: blur(10px);
      }
      .cl-kpi-label {
        font-size: 12px;
        color: var(--cl-soft);
        margin-bottom: 4px;
      }
      .cl-kpi-value {
        font-family: "Space Grotesk", sans-serif;
        font-size: 20px;
        font-weight: 700;
      }

      .cl-list {
        background: var(--cl-surface);
        border: 1px solid var(--cl-border);
        border-radius: 18px;
        box-shadow: var(--cl-shadow);
        padding: 12px;
        display: grid;
        gap: 10px;
        max-height: min(72vh, 760px);
        overflow: auto;
      }
      .cl-card {
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid #d9e7ff;
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      .cl-card:hover {
        transform: translateY(-1px);
        border-color: #bcd6ff;
        box-shadow: 0 14px 26px rgba(15, 23, 42, 0.09);
      }
      .cl-card.is-selected {
        border-color: rgba(14, 165, 233, 0.85);
        box-shadow: 0 14px 28px rgba(14, 165, 233, 0.15);
      }
      .cl-card-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }
      .cl-card-name {
        font-weight: 900;
        color: #0f172a;
        font-size: 15px;
      }
      .cl-card-legal {
        margin-top: 2px;
        font-size: 12px;
        color: var(--cl-soft);
      }
      .cl-card-meta {
        margin-top: 10px;
        font-size: 12px;
        color: var(--cl-soft);
      }
      .cl-card-actions {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .cl-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      .cl-pill--ok {
        color: #166534;
        background: rgba(22, 163, 74, 0.12);
        border-color: rgba(22, 163, 74, 0.22);
      }
      .cl-pill--muted {
        color: #334155;
        background: rgba(100, 116, 139, 0.14);
        border-color: rgba(100, 116, 139, 0.20);
      }
      .cl-pill--info {
        color: #075985;
        background: rgba(14, 165, 233, 0.12);
        border-color: rgba(14, 165, 233, 0.22);
      }

      .cl-detail {
        padding: 14px;
      }
      .cl-detail-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(203, 213, 225, 0.7);
        margin-bottom: 14px;
      }
      .cl-detail-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .cl-detail-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 22px;
        font-weight: 700;
      }
      .cl-detail-sub {
        margin-top: 4px;
        font-size: 13px;
        color: var(--cl-soft);
      }
      .cl-detail-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .cl-split {
        width: 1px;
        height: 22px;
        background: rgba(148, 163, 184, 0.55);
        margin: 0 2px;
      }

      .cl-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .cl-box {
        background: var(--cl-surface-2);
        border: 1px solid rgba(203, 213, 225, 0.7);
        border-radius: 16px;
        padding: 12px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
        display: grid;
        gap: 10px;
      }
      .cl-box--wide { grid-column: 1 / -1; }
      .cl-box-title {
        font-weight: 900;
        color: #0f172a;
        letter-spacing: 0.02em;
      }
      .cl-field label {
        display: block;
        font-size: 11px;
        color: var(--cl-soft);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
        font-weight: 800;
      }
      .cl-input, .cl-textarea, select.cl-input {
        width: 100%;
        border: 1px solid rgba(203, 213, 225, 0.9);
        background: rgba(255, 255, 255, 0.96);
        color: #0f172a;
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        transition: box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
      }
      .cl-textarea { resize: vertical; }
      .cl-input:focus, .cl-textarea:focus {
        border-color: rgba(14, 165, 233, 0.8);
        box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.14);
      }
      .cl-input:disabled, .cl-textarea:disabled {
        background: rgba(241, 245, 249, 0.8);
        color: rgba(15, 23, 42, 0.65);
      }
      .cl-input[readonly], .cl-textarea[readonly] {
        background: rgba(255, 255, 255, 0.78);
        color: #0f172a;
        border-color: rgba(203, 213, 225, 0.65);
      }
      .cl-help {
        margin-top: 6px;
        font-size: 12px;
        color: var(--cl-soft);
        line-height: 1.35;
      }

      .cl-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .cl-three {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .cl-switch {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #0f172a;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
      }
      .cl-switch input { width: 18px; height: 18px; }

      .cl-btn {
        border: 1px solid rgba(203, 213, 225, 0.95);
        background: rgba(255, 255, 255, 0.92);
        color: #0f172a;
        padding: 9px 12px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        user-select: none;
      }
      .cl-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08); border-color: rgba(148, 163, 184, 0.9); }
      .cl-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }
      .cl-btn--primary {
        background: linear-gradient(135deg, var(--cl-primary), #2563eb);
        border-color: transparent;
        color: #fff;
      }
      .cl-btn--danger {
        background: #fee2e2;
        border-color: #fecaca;
        color: #991b1b;
      }
      .cl-btn--ghost { background: rgba(255, 255, 255, 0.55); }
      .cl-btn--sm { padding: 7px 10px; font-size: 12px; border-radius: 12px; }

      .cl-iconbtn {
        width: 40px;
        height: 40px;
        border-radius: 14px;
        border: 1px solid rgba(203, 213, 225, 0.95);
        background: rgba(255, 255, 255, 0.72);
        color: #0f172a;
        font-size: 22px;
        line-height: 1;
        font-weight: 900;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
      }
      .cl-iconbtn:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08); border-color: rgba(148, 163, 184, 0.9); }

      .cl-empty {
        border: 1px dashed rgba(203, 213, 225, 0.9);
        border-radius: 16px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.65);
      }
      .cl-empty-title {
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 16px;
      }
      .cl-empty-body {
        color: var(--cl-soft);
        margin-top: 6px;
        font-size: 13px;
      }

      .cl-detail-empty {
        padding: 22px;
        display: grid;
        gap: 12px;
      }
      .cl-detail-empty-title {
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        font-size: 18px;
      }
      .cl-detail-empty-body { color: var(--cl-soft); }

      .cl-sites {
        margin-top: 14px;
        background: var(--cl-surface-2);
        border: 1px solid rgba(203, 213, 225, 0.7);
        border-radius: 16px;
        padding: 12px;
        display: grid;
        gap: 12px;
      }
      .cl-sites-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .cl-sites-title { font-weight: 900; }
      .cl-sites-empty { color: var(--cl-soft); font-size: 13px; }
      .cl-sites-list { display: grid; gap: 10px; }
      .cl-site {
        border: 1px solid rgba(203, 213, 225, 0.75);
        border-radius: 14px;
        background: rgba(255,255,255,0.9);
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .cl-site--edit {
        background:
          radial-gradient(680px 140px at 10% 0, rgba(14,165,233,0.10), transparent 70%),
          rgba(255,255,255,0.9);
      }
      .cl-site-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }
      .cl-site-title { font-weight: 900; }
      .cl-site-meta { color: var(--cl-soft); font-size: 13px; margin-top: 2px; }
      .cl-site-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .cl-site-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: start;
      }
      .cl-field--wide { grid-column: 1 / -1; }

      .cl-toasts {
        position: fixed;
        right: 16px;
        bottom: 16px;
        display: grid;
        gap: 10px;
        z-index: 100010;
      }
      .cl-toast {
        border-radius: 14px;
        padding: 12px 14px;
        font-weight: 800;
        font-size: 13px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.92);
      }
      .cl-toast--success { border-color: rgba(22, 163, 74, 0.22); }
      .cl-toast--error { border-color: rgba(220, 38, 38, 0.22); }
      .cl-toast--warning { border-color: rgba(234, 179, 8, 0.22); }

      .cl-cmodal {
        position: fixed;
        inset: 0;
        z-index: 100020;
      }
      .cl-cmodal-panel {
        position: relative;
        width: min(1040px, calc(100% - 24px));
        margin: 6vh auto 0;
        height: min(86vh, 860px);
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 22px;
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.26);
        overflow: auto;
      }
      .cl-cmodal-inner { min-height: 100%; }

      .cl-modal {
        position: fixed;
        inset: 0;
        z-index: 100030;
      }
      .cl-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.46);
        backdrop-filter: blur(6px);
      }
      .cl-modal-panel {
        position: relative;
        width: min(560px, calc(100% - 24px));
        margin: 12vh auto 0;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
        display: grid;
        gap: 10px;
      }
      .cl-modal-title {
        font-family: "Space Grotesk", sans-serif;
        font-size: 18px;
        font-weight: 700;
      }
      .cl-modal-body { color: var(--cl-soft); font-size: 13px; line-height: 1.35; }
      .cl-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 4px;
      }

      body.cl-modal-open { overflow: hidden; }

      /* Theme-color overrides when supported by the browser (keeps focus ring consistent with the site). */
      @supports (color: color-mix(in srgb, black, white)) {
        .cl-search:focus {
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--cl-primary) 18%, transparent);
          border-color: color-mix(in srgb, var(--cl-primary) 55%, transparent);
        }
        .cl-input:focus, .cl-textarea:focus {
          border-color: color-mix(in srgb, var(--cl-primary) 72%, transparent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--cl-primary) 18%, transparent);
        }
        .cl-card.is-selected {
          border-color: color-mix(in srgb, var(--cl-primary) 85%, transparent);
          box-shadow: 0 14px 28px color-mix(in srgb, var(--cl-primary) 18%, transparent);
        }
      }

      @media (max-width: 980px) {
        .cl-controls { grid-template-columns: 1fr; }
        .cl-list { max-height: none; }
        .cl-cmodal-panel { width: calc(100% - 18px); margin: 4vh auto 0; }
      }
      @media (max-width: 720px) {
        .cl-shell { padding: 14px; }
        .cl-title { font-size: 24px; }
        .cl-count { display: none; }
        .cl-cmodal-panel { width: 100%; height: 100%; margin: 0; border-radius: 0; }
        .cl-detail-grid { grid-template-columns: 1fr; }
        .cl-two { grid-template-columns: 1fr; }
        .cl-three { grid-template-columns: 1fr; }
        .cl-site-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function findRoot() {
    return (
      document.querySelector("[data-clients]") ||
      document.querySelector("#clients-root") ||
      document.querySelector(".clients-root")
    );
  }
});
