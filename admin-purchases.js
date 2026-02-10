document.documentElement.setAttribute("data-page", "admin-purchases");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminPurchasesLoaded) return;
  window.__mblAdminPurchasesLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-purchases]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-purchases") || null;
  if (!root) {
    console.error('[PURCHASES] Root introuvable. Ajoute <div data-mbl-purchases></div> sur la page.');
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[PURCHASES]", ...a);
  const warn = (...a) => DEBUG && console.warn("[PURCHASES]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    APP_ROOT: String(CFG.APP_ROOT || APP_ROOT).trim() || "/applications",
    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),
    SUBSCRIBE_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",

    SUPPLIERS_TABLE: "purchase_suppliers",
    ORDERS_TABLE: "purchase_orders",
    LINES_TABLE: "purchase_order_lines",
    RECEIPTS_TABLE: "purchase_receipts",
    RECEIPT_LINES_TABLE: "purchase_receipt_lines",
    PRODUCTS_TABLE: "products",
    WAREHOUSES_TABLE: "logistics_warehouses",
    LOCATIONS_TABLE: "logistics_locations",
  };

  const STR = {
    title: "Achats",
    subtitle: "Fournisseurs, bons de commande et réceptions.",

    tabOrders: "Bons de commande",
    tabSuppliers: "Fournisseurs",

    filterAll: "Tous",
    filterDraft: "Brouillons",
    filterSent: "Envoyés",
    filterReceived: "Réceptionnés",
    filterCanceled: "Annulés",

    btnNewOrder: "Nouveau bon de commande",
    btnNewSupplier: "Nouveau fournisseur",
    btnSave: "Enregistrer",
    btnCancel: "Annuler",
    btnDelete: "Supprimer",
    btnClose: "Fermer",
    btnReceive: "Réceptionner",
    btnPostReceipt: "Valider la réception",

    searchPlaceholder: "Rechercher (BC, fournisseur, produit...)",

    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour accéder au module Achats.",
    loginCta: "Se connecter",

    forbiddenTitle: "Accès refusé",
    forbiddenBody: "Tu n'as pas l'autorisation d'accéder au module Achats.",

    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module Achats.",
    moduleCta: "Gérer mon abonnement",

    emptyTitle: "Aucun résultat",
    emptyBody: "Aucun élément ne correspond aux filtres actuels.",

    supplierModalTitleNew: "Nouveau fournisseur",
    supplierModalTitleEdit: "Modifier fournisseur",

    orderModalTitleNew: "Nouveau bon de commande",
    orderModalTitleEdit: "Bon de commande",

    receiptModalTitle: "Réception",
    receiptHint: "Indique les quantités reçues. La validation créera automatiquement des mouvements de stock (si un produit est renseigné).",

    fieldName: "Nom",
    fieldEmail: "Email",
    fieldPhone: "Téléphone",
    fieldAddress: "Adresse",
    fieldPostal: "Code postal",
    fieldCity: "Ville",
    fieldCountry: "Pays",
    fieldNotes: "Notes",

    fieldSupplier: "Fournisseur",
    fieldReference: "Référence",
    fieldStatus: "Statut",
    fieldIssueDate: "Date",
    fieldExpectedDate: "Livraison prévue",
    fieldTerms: "Conditions",

    statusDraft: "Brouillon",
    statusSent: "Envoyé",
    statusConfirmed: "Confirmé",
    statusPartReceived: "Réception partielle",
    statusReceived: "Réceptionné",
    statusCanceled: "Annulé",

    lineProduct: "Produit",
    lineDescription: "Désignation",
    lineQty: "Qté",
    lineUnit: "Unité",
    lineUnitCost: "PU HT",
    lineVat: "TVA",
    lineTotal: "Total HT",
    lineAdd: "Ajouter une ligne",

    confirmDelete: "Supprimer définitivement ?",

    toastSaved: "Enregistré.",
    toastDeleted: "Supprimé.",
    toastError: "Une erreur est survenue.",
    toastReceived: "Réception validée.",
  };

  const state = {
    supabase: null,
    ctx: null,
    tab: "orders", // orders | suppliers
    filter: "all",
    search: "",
    suppliers: [],
    orders: [],
    products: [],
    warehouses: [],
    receivingLocationByWarehouseId: new Map(),
    busy: false,
  };

  injectStyles();

  state.supabase = await getSupabaseClient();
  state.ctx = await resolveContext(state.supabase);

  if (!state.ctx.userId) {
    renderGate({ title: STR.loginTitle, body: STR.loginBody, cta: STR.loginCta, href: CONFIG.LOGIN_PATH });
    return;
  }

  if (!state.ctx.subscriptionActive) {
    renderGate({ title: STR.moduleMissingTitle, body: "Aucun abonnement actif.", cta: STR.moduleCta, href: CONFIG.SUBSCRIBE_PATH });
    return;
  }

  if (!state.ctx.modules?.purchases) {
    renderGate({ title: STR.moduleMissingTitle, body: STR.moduleMissingBody, cta: STR.moduleCta, href: CONFIG.SUBSCRIBE_PATH });
    return;
  }

  if (!state.ctx.permOk) {
    renderGate({ title: STR.forbiddenTitle, body: STR.forbiddenBody, cta: STR.btnClose, href: "" });
    return;
  }

  const els = renderShell();
  wireUI(els);

  await loadAll();
  render();

  async function loadAll() {
    await Promise.all([loadSuppliers(), loadOrders(), loadProducts()]);
    if (state.ctx.modules?.logistics) {
      await loadWarehousesAndReceiving();
    }
  }

  async function loadSuppliers() {
    const res = await state.supabase
      .from(CONFIG.SUPPLIERS_TABLE)
      .select("id, code, name, email, phone, address, postal_code, city, country, notes, is_active, updated_at, created_at")
      .order("name", { ascending: true });
    if (res.error) throw res.error;
    state.suppliers = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOrders() {
    const res = await state.supabase
      .from(CONFIG.ORDERS_TABLE)
      .select("id, reference, status, issue_date, expected_date, total_cents, supplier_id, created_at, updated_at, supplier:purchase_suppliers(name)")
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    state.orders = Array.isArray(res.data) ? res.data : [];
  }

  async function loadProducts() {
    const res = await state.supabase
      .from(CONFIG.PRODUCTS_TABLE)
      .select("id, sku, name, cost_cents, price_cents, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(2000);
    if (res.error) {
      if (isMissingRelationError(res.error)) {
        state.products = [];
        return;
      }
      throw res.error;
    }
    state.products = Array.isArray(res.data) ? res.data : [];
  }

  async function loadWarehousesAndReceiving() {
    const [wRes, lRes] = await Promise.all([
      state.supabase.from(CONFIG.WAREHOUSES_TABLE).select("id, name, is_default, is_active, created_at").eq("is_active", true).order("is_default", { ascending: false }).order("created_at", { ascending: true }),
      state.supabase.from(CONFIG.LOCATIONS_TABLE).select("id, warehouse_id, code, name").eq("code", "RECEIVING"),
    ]);

    if (wRes.error) {
      if (isMissingRelationError(wRes.error)) return;
      throw wRes.error;
    }
    if (lRes.error) {
      if (isMissingRelationError(lRes.error)) return;
      throw lRes.error;
    }

    state.warehouses = Array.isArray(wRes.data) ? wRes.data : [];
    state.receivingLocationByWarehouseId = new Map();
    (Array.isArray(lRes.data) ? lRes.data : []).forEach((l) => {
      if (l?.warehouse_id && l?.id) state.receivingLocationByWarehouseId.set(l.warehouse_id, l.id);
    });
  }

  function wireUI(els) {
    els.tabOrders.addEventListener("click", () => {
      state.tab = "orders";
      render();
    });
    els.tabSuppliers.addEventListener("click", () => {
      state.tab = "suppliers";
      render();
    });

    els.search.addEventListener("input", () => {
      state.search = String(els.search.value || "").trim().toLowerCase();
      render();
    });

    els.filters.forEach((b) => {
      b.addEventListener("click", () => {
        els.filters.forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        state.filter = String(b.dataset.filter || "all");
        render();
      });
    });

    els.btnNewOrder.addEventListener("click", () => openOrderModal(els, { mode: "create" }));
    els.btnNewSupplier.addEventListener("click", () => openSupplierModal(els, { mode: "create" }));

    els.list.addEventListener("click", (e) => {
      const row = e.target.closest("[data-row-id]");
      if (!row) return;
      const id = String(row.dataset.rowId || "");
      const action = String(e.target.closest("[data-action]")?.dataset?.action || "");

      if (state.tab === "suppliers") {
        if (action === "edit" || !action) openSupplierModal(els, { mode: "edit", id });
        return;
      }

      if (action === "receive") return openReceiptModal(els, { orderId: id });
      if (action === "edit" || !action) return openOrderModal(els, { mode: "edit", id });
    });

    els.modalBackdrop.addEventListener("click", () => closeModal(els));
    els.modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeModal(els);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal(els);
    });
  }

  function render() {
    const els = state.__els;
    if (!els) return;

    els.tabOrders.classList.toggle("is-active", state.tab === "orders");
    els.tabSuppliers.classList.toggle("is-active", state.tab === "suppliers");

    els.filtersWrap.hidden = state.tab !== "orders";
    els.btnNewOrder.hidden = state.tab !== "orders";
    els.btnNewSupplier.hidden = state.tab !== "suppliers";

    const rows = state.tab === "suppliers" ? filterSuppliers() : filterOrders();
    renderList(els, rows);
  }

  function filterSuppliers() {
    const q = state.search;
    const suppliers = state.suppliers || [];
    return suppliers
      .filter((s) => {
        if (!q) return true;
        const hay = [s.name, s.code, s.email, s.phone, s.city].map((x) => String(x || "").toLowerCase()).join(" ");
        return hay.includes(q);
      })
      .map((s) => ({
        kind: "supplier",
        id: s.id,
        title: s.name || "—",
        subtitle: [s.email, s.phone, s.city].filter(Boolean).join(" · "),
        meta: s.code ? `Code: ${s.code}` : "",
        badge: s.is_active ? "Actif" : "Inactif",
        badgeKind: s.is_active ? "ok" : "muted",
        actions: [{ key: "edit", label: "Modifier" }],
      }));
  }

  function filterOrders() {
    const q = state.search;
    const f = state.filter;
    const orders = state.orders || [];
    return orders
      .filter((o) => {
        const st = clean(o.status);
        const statusOk =
          f === "all" ||
          (f === "draft" && st === "draft") ||
          (f === "sent" && (st === "sent" || st === "confirmed")) ||
          (f === "received" && (st === "received" || st === "partially_received")) ||
          (f === "canceled" && st === "canceled");
        if (!statusOk) return false;
        if (!q) return true;
        const supplierName = String(o?.supplier?.name || "");
        const hay = [o.reference, supplierName, o.status].map((x) => String(x || "").toLowerCase()).join(" ");
        return hay.includes(q);
      })
      .map((o) => {
        const supplierName = String(o?.supplier?.name || "").trim() || "—";
        const badge = formatOrderStatusLabel(o.status);
        const badgeKind = formatOrderStatusKind(o.status);
        const total = fmtMoney(o.total_cents);
        const date = o.issue_date ? fmtDate(o.issue_date) : o.created_at ? fmtDate(o.created_at) : "";
        return {
          kind: "order",
          id: o.id,
          title: o.reference ? String(o.reference) : "Bon de commande (brouillon)",
          subtitle: supplierName,
          meta: [date, total].filter(Boolean).join(" · "),
          badge,
          badgeKind,
          actions: [
            { key: "edit", label: "Ouvrir" },
            ...(clean(o.status) !== "canceled" ? [{ key: "receive", label: "Réceptionner" }] : []),
          ],
        };
      });
  }

  function renderList(els, rows) {
    els.list.innerHTML = "";

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "pur-empty";
      empty.innerHTML = `<div class="pur-empty__title">${escapeHTML(STR.emptyTitle)}</div><div class="pur-empty__body">${escapeHTML(STR.emptyBody)}</div>`;
      els.list.appendChild(empty);
      return;
    }

    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "pur-row";
      row.dataset.rowId = r.id;
      row.innerHTML = `
        <div class="pur-row__main">
          <div class="pur-row__top">
            <div class="pur-row__title">${escapeHTML(r.title)}</div>
            ${r.badge ? `<span class="pur-badge is-${escapeHTML(r.badgeKind)}">${escapeHTML(r.badge)}</span>` : ""}
          </div>
          <div class="pur-row__sub">${escapeHTML(r.subtitle || "")}</div>
          ${r.meta ? `<div class="pur-row__meta">${escapeHTML(r.meta)}</div>` : ""}
        </div>
        <div class="pur-row__actions">
          ${(r.actions || [])
            .map(
              (a) =>
                `<button type="button" class="pur-btn pur-btn--ghost" data-action="${escapeHTML(a.key)}">${escapeHTML(a.label)}</button>`
            )
            .join("")}
        </div>
      `;
      els.list.appendChild(row);
    });
  }

  async function openSupplierModal(els, { mode, id }) {
    const isEdit = mode === "edit";
    const supplier = isEdit ? state.suppliers.find((s) => s.id === id) : null;

    const form = {
      id: supplier?.id || "",
      name: supplier?.name || "",
      code: supplier?.code || "",
      email: supplier?.email || "",
      phone: supplier?.phone || "",
      address: supplier?.address || "",
      postal_code: supplier?.postal_code || "",
      city: supplier?.city || "",
      country: supplier?.country || "FR",
      notes: supplier?.notes || "",
      is_active: supplier?.is_active ?? true,
    };

    openModal(els, {
      title: isEdit ? STR.supplierModalTitleEdit : STR.supplierModalTitleNew,
      body: renderSupplierForm(form),
      foot: renderModalFooter({
        showDelete: isEdit && state.ctx.isAdmin,
        primary: STR.btnSave,
        secondary: STR.btnCancel,
      }),
      onPrimary: async () => {
        const payload = readSupplierForm(els.modalBody);
        if (!payload.name) return toast("Nom requis.", "error");
        await saveSupplier(payload);
        closeModal(els);
        await loadSuppliers();
        render();
        toast(STR.toastSaved, "ok");
      },
      onDelete: async () => {
        if (!confirm(STR.confirmDelete)) return;
        await deleteSupplier(form.id);
        closeModal(els);
        await loadSuppliers();
        render();
        toast(STR.toastDeleted, "ok");
      },
    });
  }

  async function saveSupplier(payload) {
    const data = {
      id: payload.id || undefined,
      code: payload.code || null,
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      address: payload.address || null,
      postal_code: payload.postal_code || null,
      city: payload.city || null,
      country: payload.country || "FR",
      notes: payload.notes || null,
      is_active: payload.is_active === true,
    };

    const res = await state.supabase.from(CONFIG.SUPPLIERS_TABLE).upsert(data).select("id").maybeSingle();
    if (res.error) throw res.error;
  }

  async function deleteSupplier(id) {
    const safe = asUuid(id);
    if (!safe) return;
    const res = await state.supabase.from(CONFIG.SUPPLIERS_TABLE).delete().eq("id", safe);
    if (res.error) throw res.error;
  }

  async function openOrderModal(els, { mode, id }) {
    const isEdit = mode === "edit";

    let order = null;
    let lines = [];
    if (isEdit) {
      const oRes = await state.supabase
        .from(CONFIG.ORDERS_TABLE)
        .select("id, supplier_id, reference, status, issue_date, expected_date, notes, terms, subtotal_cents, vat_cents, total_cents")
        .eq("id", id)
        .maybeSingle();
      if (oRes.error) throw oRes.error;
      order = oRes.data || null;

      const lRes = await state.supabase
        .from(CONFIG.LINES_TABLE)
        .select("id, product_id, description, unit, qty_ordered, qty_received, unit_cost_cents, vat_rate, sort_order")
        .eq("purchase_order_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (lRes.error) throw lRes.error;
      lines = Array.isArray(lRes.data) ? lRes.data : [];
    }

    const form = {
      id: order?.id || "",
      supplier_id: order?.supplier_id || "",
      reference: order?.reference || "",
      status: order?.status || "draft",
      issue_date: order?.issue_date || "",
      expected_date: order?.expected_date || "",
      notes: order?.notes || "",
      terms: order?.terms || "",
      lines: lines.length ? lines : [blankLine()],
    };

    openModal(els, {
      title: isEdit ? STR.orderModalTitleEdit : STR.orderModalTitleNew,
      body: renderOrderForm(form),
      foot: renderModalFooter({
        showDelete: isEdit && state.ctx.isAdmin,
        showReceive: isEdit,
        primary: STR.btnSave,
        secondary: STR.btnCancel,
      }),
      onPrimary: async () => {
        const payload = readOrderForm(els.modalBody);
        if (!payload.supplier_id) return toast("Sélectionne un fournisseur.", "error");
        await saveOrder(payload);
        await loadOrders();
        closeModal(els);
        render();
        toast(STR.toastSaved, "ok");
      },
      onReceive: async () => {
        if (!form.id) return;
        closeModal(els);
        await openReceiptModal(els, { orderId: form.id });
      },
      onDelete: async () => {
        if (!confirm(STR.confirmDelete)) return;
        await deleteOrder(form.id);
        await loadOrders();
        closeModal(els);
        render();
        toast(STR.toastDeleted, "ok");
      },
      onAfterRender: () => {
        // Wire line events
        const body = els.modalBody;
        body.addEventListener("click", (e) => {
          const addBtn = e.target.closest("[data-add-line]");
          if (addBtn) {
            e.preventDefault();
            const wrap = body.querySelector("[data-lines]");
            if (!wrap) return;
            const node = document.createElement("div");
            node.innerHTML = renderLineRow(blankLine(), { products: state.products });
            wrap.appendChild(node.firstElementChild);
            updateOrderTotalsUI(body);
            return;
          }

          const delBtn = e.target.closest("[data-del-line]");
          if (delBtn) {
            e.preventDefault();
            const row = delBtn.closest("[data-line-row]");
            if (row) row.remove();
            updateOrderTotalsUI(body);
          }
        });

        body.addEventListener("change", (e) => {
          if (e.target && e.target.matches('select[name="product_id"]')) {
            const row = e.target.closest("[data-line-row]");
            if (!row) return;
            const productId = String(e.target.value || "");
            const p = state.products.find((x) => x.id === productId);
            if (!p) return;
            const descEl = row.querySelector('input[name="description"]');
            if (descEl && !String(descEl.value || "").trim()) descEl.value = String(p.name || "").trim();
            const costEl = row.querySelector('input[name="unit_cost_cents"]');
            if (costEl && (String(costEl.value || "").trim() === "" || Number(costEl.value) === 0)) {
              costEl.value = String(Number(p.cost_cents || 0));
            }
            updateOrderTotalsUI(body);
          }
        });

        body.addEventListener("input", (e) => {
          if (!e.target) return;
          const name = String(e.target.getAttribute("name") || "");
          if (["qty_ordered", "unit_cost_cents", "vat_rate"].includes(name)) updateOrderTotalsUI(body);
        });

        updateOrderTotalsUI(body);
      },
    });
  }

  async function saveOrder(payload) {
    const header = {
      id: payload.id || undefined,
      supplier_id: payload.supplier_id,
      reference: payload.reference || null,
      status: payload.status || "draft",
      issue_date: payload.issue_date || null,
      expected_date: payload.expected_date || null,
      notes: payload.notes || null,
      terms: payload.terms || null,
      currency: "EUR",
    };

    const oRes = await state.supabase.from(CONFIG.ORDERS_TABLE).upsert(header).select("id").maybeSingle();
    if (oRes.error) throw oRes.error;
    const orderId = oRes.data?.id;
    if (!orderId) throw new Error("order_save_failed");

    const existingRes = await state.supabase.from(CONFIG.LINES_TABLE).select("id").eq("purchase_order_id", orderId);
    if (existingRes.error) throw existingRes.error;
    const existingIds = new Set((existingRes.data || []).map((x) => x.id));

    const nextLines = (payload.lines || []).filter((l) => l && (l.description || l.product_id));
    const keepIds = new Set();

    for (let i = 0; i < nextLines.length; i++) {
      const l = nextLines[i];
      const linePayload = {
        id: l.id || undefined,
        purchase_order_id: orderId,
        sort_order: i * 10,
        product_id: l.product_id || null,
        description: l.description || "—",
        unit: l.unit || "u",
        qty_ordered: clampInt(l.qty_ordered, 1, 1000000),
        unit_cost_cents: clampInt(l.unit_cost_cents, 0, 999999999),
        vat_rate: clampNum(l.vat_rate, 0, 100),
      };
      const res = await state.supabase.from(CONFIG.LINES_TABLE).upsert(linePayload).select("id").maybeSingle();
      if (res.error) throw res.error;
      if (res.data?.id) keepIds.add(res.data.id);
    }

    // Delete removed lines (draft use-case).
    const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));
    if (toDelete.length) {
      const delRes = await state.supabase.from(CONFIG.LINES_TABLE).delete().in("id", toDelete);
      if (delRes.error) throw delRes.error;
    }
  }

  async function deleteOrder(id) {
    const safe = asUuid(id);
    if (!safe) return;
    const res = await state.supabase.from(CONFIG.ORDERS_TABLE).delete().eq("id", safe);
    if (res.error) throw res.error;
  }

  async function openReceiptModal(els, { orderId }) {
    const safeId = asUuid(orderId);
    if (!safeId) return;

    const [oRes, lRes] = await Promise.all([
      state.supabase
        .from(CONFIG.ORDERS_TABLE)
        .select("id, reference, status, supplier_id, supplier:purchase_suppliers(name)")
        .eq("id", safeId)
        .maybeSingle(),
      state.supabase
        .from(CONFIG.LINES_TABLE)
        .select("id, product_id, description, unit, qty_ordered, qty_received, unit_cost_cents, vat_rate, sort_order")
        .eq("purchase_order_id", safeId)
        .order("sort_order", { ascending: true }),
    ]);
    if (oRes.error) throw oRes.error;
    if (lRes.error) throw lRes.error;

    const order = oRes.data;
    const lines = Array.isArray(lRes.data) ? lRes.data : [];

    const remain = lines
      .map((l) => ({
        id: l.id,
        product_id: l.product_id || "",
        description: l.description || "",
        unit: l.unit || "u",
        qty_ordered: Number(l.qty_ordered || 0),
        qty_received: Number(l.qty_received || 0),
        qty_to_receive: Math.max(0, Number(l.qty_ordered || 0) - Number(l.qty_received || 0)),
        unit_cost_cents: Number(l.unit_cost_cents || 0),
        vat_rate: Number(l.vat_rate || 0),
      }))
      .filter((l) => l.qty_to_receive > 0 || (lines.length === 1 && l.qty_ordered > 0));

    const remainById = new Map(remain.map((l) => [l.id, l]));

    const body = `
      <div class="pur-receipt">
        <div class="pur-hint">
          <div class="pur-hint__title">${escapeHTML(STR.receiptModalTitle)} · ${escapeHTML(order?.reference || "BC")}</div>
          <div class="pur-hint__body">${escapeHTML(STR.receiptHint)}</div>
        </div>

        ${state.ctx.modules?.logistics && state.warehouses.length ? renderWarehousePick() : ""}

        <div class="pur-lines">
          ${remain.map((l) => renderReceiptLine(l)).join("")}
        </div>
      </div>
    `;

    openModal(els, {
      title: STR.receiptModalTitle,
      body,
      foot: renderModalFooter({ primary: STR.btnPostReceipt, secondary: STR.btnCancel, showDelete: false }),
      onPrimary: async () => {
        const picked = readReceiptLines(els.modalBody);
        const rows = picked
          .map((x) => {
            const base = remainById.get(x.id);
            if (!base) return null;
            return { ...base, qty_to_receive: x.qty_to_receive };
          })
          .filter(Boolean)
          .filter((x) => x.qty_to_receive > 0);
        if (!rows.length) return toast("Aucune quantité.", "error");

        // 1) Create receipt
        const rRes = await state.supabase
          .from(CONFIG.RECEIPTS_TABLE)
          .insert({ purchase_order_id: safeId, status: "draft", received_at: new Date().toISOString().slice(0, 10) })
          .select("id")
          .maybeSingle();
        if (rRes.error) throw rRes.error;
        const receiptId = rRes.data?.id;
        if (!receiptId) throw new Error("receipt_create_failed");

        // 2) Insert receipt lines
        const whId = readWarehouseId(els.modalBody);
        const locId = whId ? state.receivingLocationByWarehouseId.get(whId) || null : null;

        const ins = rows.map((l) => ({
          receipt_id: receiptId,
          purchase_order_line_id: l.id,
          product_id: l.product_id || null,
          description: l.description || null,
          unit: l.unit || "u",
          qty_received: clampInt(l.qty_to_receive, 1, 1000000),
          unit_cost_cents: clampInt(l.unit_cost_cents, 0, 999999999),
          vat_rate: clampNum(l.vat_rate, 0, 100),
          warehouse_id: whId || null,
          location_id: locId,
        }));

        const lInsRes = await state.supabase.from(CONFIG.RECEIPT_LINES_TABLE).insert(ins);
        if (lInsRes.error) throw lInsRes.error;

        // 3) Post receipt (creates stock movements + updates PO qty/status)
        const postRes = await state.supabase.rpc("post_purchase_receipt", { p_receipt: receiptId });
        if (postRes.error) throw postRes.error;

        closeModal(els);
        await loadOrders();
        render();
        toast(STR.toastReceived, "ok");
      },
    });
  }

  function renderWarehousePick() {
    const options = state.warehouses
      .map((w) => `<option value="${escapeHTML(w.id)}">${escapeHTML(w.name || "Entrepôt")}</option>`)
      .join("");
    return `
      <div class="pur-field">
        <label class="pur-label">Entrepôt (réception)</label>
        <select class="pur-input" data-warehouse>
          <option value="">Automatique</option>
          ${options}
        </select>
      </div>
    `;
  }

  function readWarehouseId(container) {
    const el = container.querySelector("[data-warehouse]");
    const v = String(el?.value || "").trim();
    return asUuid(v);
  }

  function renderReceiptLine(l) {
    const remainingTxt = `${fmtInt(l.qty_received)} / ${fmtInt(l.qty_ordered)} ${escapeHTML(l.unit || "")}`.trim();
    return `
      <div class="pur-recline" data-recline data-id="${escapeHTML(l.id)}">
        <div class="pur-recline__left">
          <div class="pur-recline__title">${escapeHTML(l.description || "—")}</div>
          <div class="pur-recline__meta">${escapeHTML(remainingTxt)}</div>
        </div>
        <div class="pur-recline__right">
          <input class="pur-input pur-input--qty" type="number" inputmode="numeric" min="0" step="1" data-qty value="${escapeHTML(l.qty_to_receive)}" />
        </div>
      </div>
    `;
  }

  function readReceiptLines(container) {
    return Array.from(container.querySelectorAll("[data-recline]")).map((row) => {
      const id = asUuid(row.getAttribute("data-id") || "");
      const qty = Number(row.querySelector("[data-qty]")?.value || 0);
      return {
        id,
        qty_to_receive: clampInt(qty, 0, 1000000),
      };
    });
  }

  function renderSupplierForm(form) {
    return `
      <div class="pur-form">
        <input type="hidden" name="id" value="${escapeHTML(form.id || "")}" />
        <div class="pur-grid2">
          ${fieldText("name", STR.fieldName, form.name)}
          ${fieldText("code", "Code", form.code)}
          ${fieldText("email", STR.fieldEmail, form.email, "email")}
          ${fieldText("phone", STR.fieldPhone, form.phone, "tel")}
          ${fieldText("address", STR.fieldAddress, form.address)}
          ${fieldText("postal_code", STR.fieldPostal, form.postal_code)}
          ${fieldText("city", STR.fieldCity, form.city)}
          ${fieldText("country", STR.fieldCountry, form.country)}
        </div>
        ${fieldArea("notes", STR.fieldNotes, form.notes)}
        <div class="pur-field">
          <label class="pur-check">
            <input type="checkbox" name="is_active" ${form.is_active ? "checked" : ""}/>
            <span>Actif</span>
          </label>
        </div>
      </div>
    `;
  }

  function readSupplierForm(container) {
    return {
      id: asUuid(container.querySelector('input[name="id"]')?.value || "") || "",
      name: String(container.querySelector('input[name="name"]')?.value || "").trim(),
      code: String(container.querySelector('input[name="code"]')?.value || "").trim(),
      email: String(container.querySelector('input[name="email"]')?.value || "").trim(),
      phone: String(container.querySelector('input[name="phone"]')?.value || "").trim(),
      address: String(container.querySelector('input[name="address"]')?.value || "").trim(),
      postal_code: String(container.querySelector('input[name="postal_code"]')?.value || "").trim(),
      city: String(container.querySelector('input[name="city"]')?.value || "").trim(),
      country: String(container.querySelector('input[name="country"]')?.value || "").trim() || "FR",
      notes: String(container.querySelector('textarea[name="notes"]')?.value || "").trim(),
      is_active: Boolean(container.querySelector('input[name="is_active"]')?.checked),
    };
  }

  function renderOrderForm(form) {
    const supplierOptions = state.suppliers
      .filter((s) => s.is_active !== false)
      .map((s) => `<option value="${escapeHTML(s.id)}" ${s.id === form.supplier_id ? "selected" : ""}>${escapeHTML(s.name || "—")}</option>`)
      .join("");

    const statusOptions = [
      { v: "draft", l: STR.statusDraft },
      { v: "sent", l: STR.statusSent },
      { v: "confirmed", l: STR.statusConfirmed },
      { v: "partially_received", l: STR.statusPartReceived },
      { v: "received", l: STR.statusReceived },
      { v: "canceled", l: STR.statusCanceled },
    ]
      .map((o) => `<option value="${escapeHTML(o.v)}" ${o.v === clean(form.status) ? "selected" : ""}>${escapeHTML(o.l)}</option>`)
      .join("");

    const linesHtml = form.lines.map((l) => renderLineRow(l, { products: state.products })).join("");

    return `
      <div class="pur-form">
        <input type="hidden" name="id" value="${escapeHTML(form.id)}" />

        <div class="pur-grid2">
          <div class="pur-field">
            <label class="pur-label">${escapeHTML(STR.fieldSupplier)}</label>
            <select class="pur-input" name="supplier_id">
              <option value="">Sélectionner…</option>
              ${supplierOptions}
            </select>
          </div>

          <div class="pur-field">
            <label class="pur-label">${escapeHTML(STR.fieldStatus)}</label>
            <select class="pur-input" name="status">${statusOptions}</select>
          </div>

          ${fieldText("reference", STR.fieldReference, form.reference, "text", { placeholder: "Auto quand tu sors du brouillon" })}
          ${fieldText("issue_date", STR.fieldIssueDate, form.issue_date, "date")}
          ${fieldText("expected_date", STR.fieldExpectedDate, form.expected_date, "date")}
        </div>

        <div class="pur-lines" data-lines>
          <div class="pur-lines__head">
            <div>${escapeHTML(STR.lineProduct)}</div>
            <div>${escapeHTML(STR.lineDescription)}</div>
            <div>${escapeHTML(STR.lineQty)}</div>
            <div>${escapeHTML(STR.lineUnitCost)}</div>
            <div>${escapeHTML(STR.lineVat)}</div>
            <div></div>
          </div>
          ${linesHtml}
          <div class="pur-lines__add">
            <button type="button" class="pur-btn pur-btn--ghost" data-add-line>${escapeHTML(STR.lineAdd)}</button>
          </div>
        </div>

        <div class="pur-totals" data-totals>
          <div class="pur-totals__row"><span>Total HT</span><strong data-sub>0,00 €</strong></div>
          <div class="pur-totals__row"><span>TVA</span><strong data-vat>0,00 €</strong></div>
          <div class="pur-totals__row is-big"><span>Total TTC</span><strong data-ttc>0,00 €</strong></div>
        </div>

        ${fieldArea("notes", STR.fieldNotes, form.notes)}
        ${fieldArea("terms", STR.fieldTerms, form.terms)}
      </div>
    `;
  }

  function renderLineRow(line, { products }) {
    const productOptions = [
      `<option value="">—</option>`,
      ...(products || []).map((p) => {
        const label = [p.sku ? `[${p.sku}]` : "", p.name].filter(Boolean).join(" ");
        return `<option value="${escapeHTML(p.id)}" ${p.id === line.product_id ? "selected" : ""}>${escapeHTML(label)}</option>`;
      }),
    ].join("");

    const l = {
      id: line.id || "",
      product_id: line.product_id || "",
      description: line.description || "",
      qty_ordered: Number(line.qty_ordered || 1),
      unit_cost_cents: Number(line.unit_cost_cents || 0),
      vat_rate: Number(line.vat_rate || 0),
    };

    return `
      <div class="pur-line" data-line-row data-line-id="${escapeHTML(l.id)}">
        <select class="pur-input pur-input--select" name="product_id">${productOptions}</select>
        <input class="pur-input" name="description" placeholder="Désignation" value="${escapeHTML(l.description)}"/>
        <input class="pur-input pur-input--qty" type="number" inputmode="numeric" min="1" step="1" name="qty_ordered" value="${escapeHTML(l.qty_ordered)}"/>
        <input class="pur-input pur-input--money" type="number" inputmode="numeric" min="0" step="1" name="unit_cost_cents" value="${escapeHTML(l.unit_cost_cents)}"/>
        <input class="pur-input pur-input--vat" type="number" inputmode="decimal" min="0" step="0.1" name="vat_rate" value="${escapeHTML(l.vat_rate)}"/>
        <button type="button" class="pur-btn pur-btn--dangerghost" data-del-line>×</button>
        <input type="hidden" name="id" value="${escapeHTML(l.id)}"/>
        <input type="hidden" name="unit" value="${escapeHTML(line.unit || "u")}"/>
      </div>
    `;
  }

  function blankLine() {
    return { id: "", product_id: "", description: "", unit: "u", qty_ordered: 1, unit_cost_cents: 0, vat_rate: 0 };
  }

  function readOrderForm(container) {
    const id = asUuid(container.querySelector('input[name="id"]')?.value || "") || "";
    const supplier_id = asUuid(container.querySelector('select[name="supplier_id"]')?.value || "") || "";
    const reference = String(container.querySelector('input[name="reference"]')?.value || "").trim();
    const status = String(container.querySelector('select[name="status"]')?.value || "draft").trim();
    const issue_date = String(container.querySelector('input[name="issue_date"]')?.value || "").trim();
    const expected_date = String(container.querySelector('input[name="expected_date"]')?.value || "").trim();
    const notes = String(container.querySelector('textarea[name="notes"]')?.value || "").trim();
    const terms = String(container.querySelector('textarea[name="terms"]')?.value || "").trim();

    const lines = Array.from(container.querySelectorAll("[data-line-row]")).map((row) => {
      const lid = asUuid(row.querySelector('input[name="id"]')?.value || "") || "";
      const product_id = asUuid(row.querySelector('select[name="product_id"]')?.value || "") || "";
      const description = String(row.querySelector('input[name="description"]')?.value || "").trim();
      const unit = String(row.querySelector('input[name="unit"]')?.value || "u").trim() || "u";
      const qty_ordered = Number(row.querySelector('input[name="qty_ordered"]')?.value || 0);
      const unit_cost_cents = Number(row.querySelector('input[name="unit_cost_cents"]')?.value || 0);
      const vat_rate = Number(row.querySelector('input[name="vat_rate"]')?.value || 0);
      return { id: lid, product_id, description, unit, qty_ordered, unit_cost_cents, vat_rate };
    });

    return { id, supplier_id, reference, status, issue_date, expected_date, notes, terms, lines };
  }

  function updateOrderTotalsUI(container) {
    const payload = readOrderForm(container);
    const subtotal = (payload.lines || []).reduce((sum, l) => sum + clampInt(l.qty_ordered, 0, 1e9) * clampInt(l.unit_cost_cents, 0, 1e12), 0);
    const vat = (payload.lines || []).reduce((sum, l) => {
      const ht = clampInt(l.qty_ordered, 0, 1e9) * clampInt(l.unit_cost_cents, 0, 1e12);
      const r = clampNum(l.vat_rate, 0, 100);
      return sum + Math.round(ht * (r / 100));
    }, 0);
    const ttc = Math.max(0, subtotal + vat);

    const subEl = container.querySelector("[data-sub]");
    const vatEl = container.querySelector("[data-vat]");
    const ttcEl = container.querySelector("[data-ttc]");
    if (subEl) subEl.textContent = fmtMoney(subtotal);
    if (vatEl) vatEl.textContent = fmtMoney(vat);
    if (ttcEl) ttcEl.textContent = fmtMoney(ttc);
  }

  function renderShell() {
    root.innerHTML = `
      <div class="pur-shell">
        <div class="pur-head">
          <div>
            <div class="pur-eyebrow">MBL · Achats</div>
            <div class="pur-title">${escapeHTML(STR.title)}</div>
            <div class="pur-subtitle">${escapeHTML(STR.subtitle)}</div>
          </div>
          <div class="pur-head__actions">
            <button type="button" class="pur-btn" data-btn-new-order>${escapeHTML(STR.btnNewOrder)}</button>
            <button type="button" class="pur-btn" data-btn-new-supplier hidden>${escapeHTML(STR.btnNewSupplier)}</button>
          </div>
        </div>

        <div class="pur-bar">
          <div class="pur-tabs">
            <button type="button" class="pur-tab is-active" data-tab-orders>${escapeHTML(STR.tabOrders)}</button>
            <button type="button" class="pur-tab" data-tab-suppliers>${escapeHTML(STR.tabSuppliers)}</button>
          </div>
          <input class="pur-search" type="search" placeholder="${escapeHTML(STR.searchPlaceholder)}" data-search />
        </div>

        <div class="pur-filters" data-filters-wrap>
          <button type="button" class="pur-pill is-active" data-filter="all">${escapeHTML(STR.filterAll)}</button>
          <button type="button" class="pur-pill" data-filter="draft">${escapeHTML(STR.filterDraft)}</button>
          <button type="button" class="pur-pill" data-filter="sent">${escapeHTML(STR.filterSent)}</button>
          <button type="button" class="pur-pill" data-filter="received">${escapeHTML(STR.filterReceived)}</button>
          <button type="button" class="pur-pill" data-filter="canceled">${escapeHTML(STR.filterCanceled)}</button>
        </div>

        <div class="pur-list" data-list></div>
      </div>

      <div class="pur-modal" aria-hidden="true" data-modal>
        <div class="pur-modal__backdrop" data-modal-backdrop></div>
        <div class="pur-modal__card" role="dialog" aria-modal="true">
          <div class="pur-modal__head">
            <div class="pur-modal__title" data-modal-title></div>
            <button type="button" class="pur-btn pur-btn--ghost" data-close>×</button>
          </div>
          <div class="pur-modal__body" data-modal-body></div>
          <div class="pur-modal__foot" data-modal-foot></div>
        </div>
      </div>

      <div class="pur-toast" data-toast hidden></div>
    `;

    const els = {
      tabOrders: root.querySelector("[data-tab-orders]"),
      tabSuppliers: root.querySelector("[data-tab-suppliers]"),
      btnNewOrder: root.querySelector("[data-btn-new-order]"),
      btnNewSupplier: root.querySelector("[data-btn-new-supplier]"),
      search: root.querySelector("[data-search]"),
      filtersWrap: root.querySelector("[data-filters-wrap]"),
      filters: Array.from(root.querySelectorAll("[data-filter]")),
      list: root.querySelector("[data-list]"),

      modal: root.querySelector("[data-modal]"),
      modalBackdrop: root.querySelector("[data-modal-backdrop]"),
      modalTitle: root.querySelector("[data-modal-title]"),
      modalBody: root.querySelector("[data-modal-body]"),
      modalFoot: root.querySelector("[data-modal-foot]"),

      toast: root.querySelector("[data-toast]"),
    };

    state.__els = els;
    return els;
  }

  function renderModalFooter({ primary, secondary, showDelete, showReceive }) {
    return `
      <div class="pur-foot">
        <div class="pur-foot__left">
          ${showDelete ? `<button type="button" class="pur-btn pur-btn--danger" data-foot-delete>${escapeHTML(STR.btnDelete)}</button>` : ""}
        </div>
        <div class="pur-foot__right">
          ${showReceive ? `<button type="button" class="pur-btn pur-btn--ghost" data-foot-receive>${escapeHTML(STR.btnReceive)}</button>` : ""}
          <button type="button" class="pur-btn pur-btn--ghost" data-foot-secondary>${escapeHTML(secondary || STR.btnCancel)}</button>
          <button type="button" class="pur-btn" data-foot-primary>${escapeHTML(primary || STR.btnSave)}</button>
        </div>
      </div>
    `;
  }

  function openModal(els, { title, body, foot, onPrimary, onDelete, onReceive, onAfterRender }) {
    els.modalTitle.textContent = title || "";
    els.modalBody.innerHTML = body || "";
    els.modalFoot.innerHTML = foot || "";
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");

    const btnP = els.modalFoot.querySelector("[data-foot-primary]");
    const btnS = els.modalFoot.querySelector("[data-foot-secondary]");
    const btnD = els.modalFoot.querySelector("[data-foot-delete]");
    const btnR = els.modalFoot.querySelector("[data-foot-receive]");

    btnP?.addEventListener("click", async () => {
      try {
        btnP.disabled = true;
        await (onPrimary ? onPrimary() : null);
      } catch (e) {
        warn(e);
        toast(STR.toastError, "error");
      } finally {
        btnP.disabled = false;
      }
    });
    btnS?.addEventListener("click", () => closeModal(els));
    btnD?.addEventListener("click", async () => {
      try {
        btnD.disabled = true;
        await (onDelete ? onDelete() : null);
      } catch (e) {
        warn(e);
        toast(STR.toastError, "error");
      } finally {
        btnD.disabled = false;
      }
    });
    btnR?.addEventListener("click", async () => {
      try {
        btnR.disabled = true;
        await (onReceive ? onReceive() : null);
      } catch (e) {
        warn(e);
        toast(STR.toastError, "error");
      } finally {
        btnR.disabled = false;
      }
    });

    if (typeof onAfterRender === "function") onAfterRender();
  }

  function closeModal(els) {
    els.modal?.classList.remove("is-open");
    els.modal?.setAttribute("aria-hidden", "true");
    if (els.modalTitle) els.modalTitle.textContent = "";
    if (els.modalBody) els.modalBody.innerHTML = "";
    if (els.modalFoot) els.modalFoot.innerHTML = "";
  }

  function fieldText(name, label, value, type = "text", opts = {}) {
    const placeholder = String(opts?.placeholder || "");
    return `
      <div class="pur-field">
        <label class="pur-label">${escapeHTML(label)}</label>
        <input class="pur-input" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value || "")}" ${placeholder ? `placeholder="${escapeHTML(placeholder)}"` : ""}/>
      </div>
    `;
  }

  function fieldArea(name, label, value) {
    return `
      <div class="pur-field">
        <label class="pur-label">${escapeHTML(label)}</label>
        <textarea class="pur-input pur-input--area" name="${escapeHTML(name)}" rows="3">${escapeHTML(value || "")}</textarea>
      </div>
    `;
  }

  function renderGate({ title, body, cta, href }) {
    root.innerHTML = `
      <div class="pur-shell">
        <div class="pur-gate">
          <div class="pur-gate__title">${escapeHTML(title || "")}</div>
          <div class="pur-gate__body">${escapeHTML(body || "")}</div>
          ${href ? `<a class="pur-btn" href="${escapeHTML(href)}">${escapeHTML(cta || "OK")}</a>` : `<button type="button" class="pur-btn" onclick="history.back()">${escapeHTML(cta || "OK")}</button>`}
        </div>
      </div>
    `;
  }

  function toast(text, kind) {
    const els = state.__els;
    if (!els?.toast) return;
    const t = String(text || "").trim();
    if (!t) return;
    els.toast.hidden = false;
    els.toast.className = "pur-toast is-" + String(kind || "ok");
    els.toast.textContent = t;
    clearTimeout(state.__toastTimer);
    state.__toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clean(v) {
    return String(v || "").trim().toLowerCase();
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function fmtDate(input) {
    if (!input) return "";
    const d = new Date(String(input));
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function fmtInt(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
  }

  function fmtMoney(cents) {
    const v = Number(cents || 0);
    const amount = Number.isFinite(v) ? v / 100 : 0;
    try {
      return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    } catch (_) {
      return `${amount.toFixed(2)} €`;
    }
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.round(x)));
  }

  function clampNum(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function isMissingRelationError(err) {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("does not exist") || msg.includes("relation") || msg.includes("column");
  }

  function formatOrderStatusLabel(status) {
    const s = clean(status);
    if (s === "draft") return STR.statusDraft;
    if (s === "sent") return STR.statusSent;
    if (s === "confirmed") return STR.statusConfirmed;
    if (s === "partially_received") return STR.statusPartReceived;
    if (s === "received") return STR.statusReceived;
    if (s === "canceled") return STR.statusCanceled;
    return String(status || "—");
  }

  function formatOrderStatusKind(status) {
    const s = clean(status);
    if (s === "received") return "ok";
    if (s === "partially_received") return "warn";
    if (s === "sent" || s === "confirmed") return "info";
    if (s === "canceled") return "danger";
    return "muted";
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
        existing.addEventListener("load", () => (clearTimeout(t), resolve()), { once: true });
        existing.addEventListener("error", () => (clearTimeout(t), reject(new Error("Echec chargement supabase-js"))), { once: true });
      });
      return;
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = CONFIG.SUPABASE_CDN;
      s.async = true;
      s.dataset.mblLib = "supabase";
      s.addEventListener("load", resolve, { once: true });
      s.addEventListener("error", () => reject(new Error("Echec chargement supabase-js")), { once: true });
      document.head.appendChild(s);
      setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
    });
  }

  async function getSupabaseClient() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    await ensureSupabaseJs();
    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: CONFIG.AUTH_STORAGE_KEY,
      },
    });
    window.__MBL_SUPABASE__ = client;
    return client;
  }

  function boolFromAny(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === "number") return value === 1;
    const s = String(value || "").trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  }

  function normalizeModulesMap(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    Object.keys(input).forEach((k) => (out[k] = boolFromAny(input[k])));
    return out;
  }

  function isSubscriptionRowActive(sub) {
    if (!sub) return false;
    const status = String(sub.status || "").trim().toLowerCase();
    if (!["trialing", "active", "past_due"].includes(status)) return false;
    const now = Date.now();
    if (sub.ends_at) {
      const endsAt = Date.parse(sub.ends_at);
      if (Number.isFinite(endsAt) && endsAt <= now) return false;
    }
    if (status === "trialing" && sub.trial_ends_at) {
      const trialEndsAt = Date.parse(sub.trial_ends_at);
      if (Number.isFinite(trialEndsAt) && trialEndsAt <= now) return false;
    }
    return true;
  }

  function isAdminRole(role) {
    const r = clean(role);
    return ["owner", "admin", "manager"].includes(r);
  }

  function isRestaurantEmployeeRole(role) {
    const r = clean(role);
    return ["restaurant_employee", "restaurant_staff", "resto_employee", "cashier"].includes(r);
  }

  function permissionAllow({ isAdmin, orgRole, permMode, permMap }, permKey) {
    const key = String(permKey || "").trim();
    if (!key) return true;
    if (isAdmin) return true;

    if (permMode === "custom") return permMap?.[key] === true;

    // inherit defaults: strict (admin only for this module)
    if (orgRole === "tech") return false;
    if (orgRole === "driver") return false;
    if (isRestaurantEmployeeRole(orgRole)) return false;
    return false;
  }

  async function resolveContext(supabase) {
    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    const user = userError ? sessionData?.session?.user : userData?.user || sessionData?.session?.user;
    const userId = String(user?.id || "").trim();
    if (!userId) {
      return { userId: "", orgId: "", orgRole: "", isAdmin: false, permOk: false, permMode: "inherit", permMap: {}, modules: {}, subscriptionActive: false };
    }

    const memberRes = await supabase
      .from("organization_members")
      .select("organization_id, role, permissions_mode, permissions, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (memberRes.error) throw memberRes.error;

    const member = memberRes.data || null;
    const orgId = String(member?.organization_id || "").trim();
    const orgRole = clean(member?.role || "");
    const isAdmin = isAdminRole(orgRole);

    const permMode = clean(member?.permissions_mode || "inherit") === "custom" ? "custom" : "inherit";
    const permMap = member?.permissions && typeof member.permissions === "object" ? member.permissions : {};

    if (!orgId) {
      return { userId, orgId: "", orgRole, isAdmin, permOk: isAdmin, permMode, permMap, modules: {}, subscriptionActive: false };
    }

    const [entRes, subRes] = await Promise.all([
      supabase.from("organization_entitlements").select("modules").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("organization_subscriptions")
        .select("plan_id, status, starts_at, ends_at, trial_ends_at")
        .eq("organization_id", orgId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (entRes.error && !isMissingRelationError(entRes.error)) throw entRes.error;
    if (subRes.error && !isMissingRelationError(subRes.error)) throw subRes.error;

    const subscription = subRes.error ? null : subRes.data || null;
    const subscriptionActive = isSubscriptionRowActive(subscription);

    let planModules = {};
    const planId = String(subscription?.plan_id || "").trim();
    if (planId) {
      const planRes = await supabase.from("billing_plans").select("modules").eq("id", planId).maybeSingle();
      if (planRes.error && !isMissingRelationError(planRes.error)) throw planRes.error;
      if (!planRes.error && planRes.data) planModules = normalizeModulesMap(planRes.data.modules);
    }

    const entModules = normalizeModulesMap(entRes.error ? {} : entRes.data?.modules);
    const mergedModules = subscriptionActive ? { ...planModules, ...entModules } : {};

    const permOk = permissionAllow({ isAdmin, orgRole, permMode, permMap }, "purchases");

    return { userId, orgId, orgRole, isAdmin, permOk, permMode, permMap, modules: mergedModules, subscriptionActive };
  }

  function injectStyles() {
    if (document.getElementById("pur-styles")) return;
    const st = document.createElement("style");
    st.id = "pur-styles";
    st.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      .pur-shell, .pur-shell * { box-sizing: border-box; }
      .pur-shell {
        font-family: "Manrope", sans-serif;
        --pur-ink: #0f172a;
        --pur-soft: #55708c;
        --pur-border: #d6e1ed;
        --pur-card: rgba(255,255,255,0.86);
        --pur-card2: rgba(255,255,255,0.94);
        --pur-shadow: 0 18px 44px rgba(12, 37, 66, 0.10);
        --pur-primary: var(--mbl-primary, #0ea5e9);
        color: var(--pur-ink);
        background:
          radial-gradient(900px 520px at 6% -10%, rgba(14, 165, 233, 0.18), transparent 62%),
          radial-gradient(820px 520px at 100% 0%, rgba(37, 99, 235, 0.12), transparent 65%),
          linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
        border: 1px solid var(--pur-border);
        border-radius: 18px;
        padding: 16px;
        box-shadow: var(--pur-shadow);
      }

      .pur-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--pur-soft); }
      .pur-title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 28px; margin-top: 2px; }
      .pur-subtitle { color: var(--pur-soft); margin-top: 2px; }

      .pur-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .pur-head__actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      .pur-btn {
        appearance: none;
        border: 1px solid rgba(12, 74, 110, 0.18);
        background: linear-gradient(180deg, color-mix(in srgb, var(--pur-primary) 14%, #ffffff), #ffffff);
        color: #0b2240;
        font-weight: 800;
        border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
        box-shadow: 0 12px 20px rgba(12, 37, 66, 0.10);
      }
      .pur-btn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--pur-primary) 36%, #ffffff); }
      .pur-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }

      .pur-btn--ghost {
        background: rgba(255,255,255,0.82);
        box-shadow: none;
      }

      .pur-btn--danger {
        border-color: rgba(239, 68, 68, 0.28);
        background: linear-gradient(180deg, rgba(254,242,242,0.95), rgba(255,255,255,0.95));
        color: #991b1b;
        box-shadow: none;
      }
      .pur-btn--dangerghost {
        border-color: rgba(239, 68, 68, 0.18);
        background: transparent;
        color: rgba(153, 27, 27, 0.9);
        font-weight: 900;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        padding: 0;
        box-shadow: none;
      }

      .pur-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
      .pur-tabs { display: inline-flex; gap: 8px; padding: 6px; border: 1px solid rgba(12,37,66,0.14); border-radius: 14px; background: rgba(255,255,255,0.7); }
      .pur-tab {
        appearance: none; border: 0; cursor: pointer;
        padding: 9px 12px;
        border-radius: 12px;
        background: transparent;
        color: rgba(11,34,64,0.72);
        font-weight: 900;
      }
      .pur-tab.is-active {
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.86));
        color: rgba(11,34,64,0.98);
        box-shadow: 0 12px 24px rgba(12, 37, 66, 0.10);
        border: 1px solid rgba(12,37,66,0.10);
      }

      .pur-search {
        width: min(420px, 100%);
        border-radius: 14px;
        padding: 11px 12px;
        border: 1px solid rgba(12,37,66,0.14);
        background: rgba(255,255,255,0.84);
        outline: none;
      }
      .pur-search:focus { border-color: color-mix(in srgb, var(--pur-primary) 40%, #ffffff); box-shadow: 0 0 0 4px rgba(14,165,233,0.14); }

      .pur-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .pur-pill {
        appearance: none;
        border: 1px solid rgba(12,37,66,0.14);
        background: rgba(255,255,255,0.78);
        border-radius: 999px;
        padding: 8px 10px;
        font-weight: 900;
        cursor: pointer;
        color: rgba(11,34,64,0.74);
      }
      .pur-pill.is-active { border-color: rgba(14,165,233,0.38); color: rgba(11,34,64,0.98); box-shadow: 0 10px 22px rgba(12, 37, 66, 0.10); }

      .pur-list { margin-top: 12px; display: grid; gap: 10px; }
      .pur-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(12,37,66,0.12);
        background: var(--pur-card);
      }
      .pur-row__title { font-weight: 900; font-size: 15px; }
      .pur-row__sub { color: rgba(11,34,64,0.70); margin-top: 2px; }
      .pur-row__meta { color: var(--pur-soft); font-size: 12.5px; margin-top: 4px; }
      .pur-row__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .pur-row__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

      .pur-badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-weight: 900;
        font-size: 12px;
        border: 1px solid rgba(12,37,66,0.12);
        background: rgba(255,255,255,0.85);
        color: rgba(11,34,64,0.78);
        white-space: nowrap;
      }
      .pur-badge.is-ok { background: rgba(220,252,231,0.9); border-color: rgba(22,101,52,0.20); color: #166534; }
      .pur-badge.is-warn { background: rgba(254,243,199,0.9); border-color: rgba(146,64,14,0.22); color: #92400e; }
      .pur-badge.is-info { background: rgba(224,242,254,0.9); border-color: rgba(7,89,133,0.20); color: #075985; }
      .pur-badge.is-danger { background: rgba(254,226,226,0.92); border-color: rgba(153,27,27,0.20); color: #991b1b; }
      .pur-badge.is-muted { background: rgba(241,245,249,0.95); border-color: rgba(51,65,85,0.14); color: rgba(51,65,85,0.86); }

      .pur-empty { padding: 22px; text-align: center; border: 1px dashed rgba(12,37,66,0.18); border-radius: 16px; background: rgba(255,255,255,0.65); }
      .pur-empty__title { font-weight: 900; }
      .pur-empty__body { color: var(--pur-soft); margin-top: 4px; }

      /* Modal */
      .pur-modal { position: fixed; inset: 0; display: none; z-index: 2147483646; }
      .pur-modal.is-open { display: block; }
      .pur-modal__backdrop { position: absolute; inset: 0; background: rgba(10, 31, 53, 0.55); backdrop-filter: blur(2px); }
      .pur-modal__card {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(980px, calc(100% - 26px));
        max-height: calc(100% - 26px);
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.20);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(245,250,255,0.96));
        box-shadow: 0 24px 80px rgba(0,0,0,0.22);
      }
      .pur-modal__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(12,37,66,0.10); }
      .pur-modal__title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 18px; }
      .pur-modal__body { padding: 14px; }
      .pur-modal__foot { padding: 12px 14px; border-top: 1px solid rgba(12,37,66,0.10); }

      .pur-form { display: grid; gap: 12px; }
      .pur-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      @media (max-width: 820px) { .pur-grid2 { grid-template-columns: 1fr; } .pur-bar { flex-direction: column; align-items: stretch; } .pur-search { width: 100%; } }

      .pur-field { display: grid; gap: 6px; }
      .pur-label { font-size: 12.5px; font-weight: 900; color: rgba(11,34,64,0.76); }
      .pur-input {
        width: 100%;
        border-radius: 12px;
        padding: 10px 11px;
        border: 1px solid rgba(12,37,66,0.14);
        background: rgba(255,255,255,0.90);
        outline: none;
      }
      .pur-input:focus { border-color: color-mix(in srgb, var(--pur-primary) 40%, #ffffff); box-shadow: 0 0 0 4px rgba(14,165,233,0.14); }
      .pur-input--area { resize: vertical; min-height: 86px; }
      .pur-check { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; color: rgba(11,34,64,0.78); }
      .pur-check input { width: 16px; height: 16px; }

      .pur-lines { border: 1px solid rgba(12,37,66,0.12); border-radius: 16px; background: rgba(255,255,255,0.74); overflow: hidden; }
      .pur-lines__head, .pur-line {
        display: grid;
        grid-template-columns: 220px 1fr 88px 110px 74px 42px;
        gap: 8px;
        align-items: center;
        padding: 10px;
      }
      .pur-lines__head { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: rgba(11,34,64,0.62); background: rgba(241,245,249,0.78); border-bottom: 1px solid rgba(12,37,66,0.10); }
      .pur-line { border-bottom: 1px solid rgba(12,37,66,0.08); }
      .pur-line:last-child { border-bottom: 0; }
      .pur-input--qty, .pur-input--money, .pur-input--vat { text-align: right; }
      .pur-lines__add { padding: 10px; }
      @media (max-width: 980px) {
        .pur-lines__head { display: none; }
        .pur-line {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .pur-btn--dangerghost { justify-self: end; }
      }

      .pur-totals { display: grid; gap: 8px; border: 1px solid rgba(12,37,66,0.12); border-radius: 16px; background: rgba(255,255,255,0.80); padding: 12px; }
      .pur-totals__row { display: flex; justify-content: space-between; gap: 10px; color: rgba(11,34,64,0.74); font-weight: 800; }
      .pur-totals__row strong { color: rgba(11,34,64,0.98); }
      .pur-totals__row.is-big { font-size: 16px; }

      .pur-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .pur-foot__right { display: inline-flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      .pur-toast {
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(12,37,66,0.18);
        background: rgba(255,255,255,0.92);
        box-shadow: 0 18px 50px rgba(0,0,0,0.18);
        font-weight: 900;
        z-index: 2147483647;
      }
      .pur-toast.is-ok { border-color: rgba(22,101,52,0.22); background: rgba(220,252,231,0.96); color: #166534; }
      .pur-toast.is-error { border-color: rgba(153,27,27,0.22); background: rgba(254,226,226,0.96); color: #991b1b; }

      .pur-gate { padding: 22px; border-radius: 16px; border: 1px solid rgba(12,37,66,0.14); background: rgba(255,255,255,0.78); display: grid; gap: 10px; text-align: center; }
      .pur-gate__title { font-weight: 900; font-size: 18px; }
      .pur-gate__body { color: var(--pur-soft); }

      .pur-hint { border: 1px solid rgba(12,37,66,0.12); background: rgba(255,255,255,0.80); border-radius: 16px; padding: 12px; }
      .pur-hint__title { font-weight: 900; }
      .pur-hint__body { color: var(--pur-soft); margin-top: 4px; }
      .pur-recline { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(12,37,66,0.10); background: rgba(255,255,255,0.82); border-radius: 16px; padding: 10px 12px; margin-top: 10px; }
      .pur-recline__title { font-weight: 900; }
      .pur-recline__meta { font-size: 12px; color: var(--pur-soft); margin-top: 2px; }
      .pur-input--qty { width: 120px; }
    `;
    document.head.appendChild(st);
  }
});
