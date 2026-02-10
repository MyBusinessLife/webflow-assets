document.documentElement.setAttribute("data-page", "admin-rental");

window.Webflow ||= [];
window.Webflow.push(async function () {
  "use strict";

  if (window.__mblAdminRentalLoaded) return;
  window.__mblAdminRentalLoaded = true;

  const ROOT_SELECTOR = "[data-rental-admin]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#rental-admin-root");
  if (!root) {
    console.error('[RENTAL] Root introuvable. Ajoute <div id="rental-admin-root" data-rental-admin></div> sur la page.');
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[RENTAL]", ...a);
  const warn = (...a) => DEBUG && console.warn("[RENTAL]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    LOGIN_PATH: String(CFG.LOGIN_PATH || `${APP_ROOT}/login`).trim(),
    SUBSCRIBE_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",
    BOOKING_PATH: String(root.dataset.bookingPath || `${APP_ROOT}/rental-book`).trim(),

    LISTINGS_TABLE: String(root.dataset.listingsTable || "rental_listings").trim() || "rental_listings",
    RESERVATIONS_TABLE: String(root.dataset.reservationsTable || "rental_reservations").trim() || "rental_reservations",
    MEMBERS_TABLE: String(root.dataset.membersTable || "organization_members").trim() || "organization_members",
    ENTITLEMENTS_TABLE: String(root.dataset.entitlementsTable || "organization_entitlements").trim() || "organization_entitlements",

    DEFAULT_CURRENCY: String(root.dataset.currency || "EUR").trim() || "EUR",
    DEFAULT_RANGE_DAYS: Math.max(14, Number(root.dataset.rangeDays || 90) || 90),
  };

  const STR = {
    title: "Locations",
    subtitle: "Annonces, reservations et calendrier",
    newListing: "Nouvelle annonce",
    refresh: "Rafraichir",
    searchPlaceholder: "Rechercher (titre, ville, adresse)",
    emptyListTitle: "Aucune annonce",
    emptyListBody: "Cree ta premiere annonce pour commencer a recevoir des reservations.",
    selectListing: "Selectionne une annonce a gauche.",
    save: "Enregistrer",
    saving: "Enregistrement...",
    saved: "Annonce enregistree",
    saveError: "Impossible d'enregistrer l'annonce.",
    publish: "Publier",
    unpublish: "Depublier",
    deactivate: "Desactiver",
    activate: "Activer",
    copyLink: "Copier le lien public",
    openLink: "Ouvrir",
    tabListing: "Annonce",
    tabBookings: "Reservations",
    bookingsTitle: "Reservations",
    blocksTitle: "Bloquer des dates",
    createBlock: "Bloquer",
    createManual: "Ajouter une reservation",
    create: "Creer",
    created: "Cree",
    actionConfirm: "Confirmer",
    actionDecline: "Refuser",
    actionCancel: "Annuler",
    actionUnblock: "Debloquer",
    statusPending: "En attente",
    statusConfirmed: "Confirmee",
    statusDeclined: "Refusee",
    statusCanceled: "Annulee",
    statusBlocked: "Bloquee",
    kindBooking: "Reservation",
    kindBlock: "Blocage",
    notAllowedTitle: "Acces refuse",
    notAllowedBody: "Ton compte n'a pas les droits admin pour modifier les annonces et reservations.",
    needLoginTitle: "Connexion requise",
    needLoginBody: "Connecte-toi pour acceder a la gestion hotellerie.",
    needLoginCta: "Se connecter",
    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "L'offre hotellerie n'est pas incluse dans ton abonnement.",
    moduleMissingCta: "Gerer mon abonnement",
    overlapError: "Ces dates ne sont pas disponibles (chevauchement).",
    validationError: "Verifie les champs obligatoires.",
  };

  const state = {
    supabase: null,
    user: null,
    orgId: "",
    orgRole: "",
    isAdmin: false,
    modules: {},

    listings: [],
    filteredListings: [],
    selectedListingId: "",
    activeTab: "listing",
    search: "",

    reservations: [],
    resRangeFrom: "",
    resRangeTo: "",
    resLoading: false,
    reservationsForListing: "",

    editing: null, // current listing draft
  };

  const dom = {
    list: null,
    detail: null,
    count: null,
    search: null,
  };

  injectStyles();
  const ui = renderShell();

  try {
    state.supabase = await resolveSupabaseClient(CONFIG);
  } catch (e) {
    ui.mount.innerHTML = renderErrorCard("Supabase non charge.", "Verifie que supabase-js est charge sur le site.");
    return;
  }

  await boot();

  async function boot() {
    setLoading(true);

    const sessionRes = await state.supabase.auth.getSession();
    const session = sessionRes?.data?.session || null;
    state.user = session?.user || null;

    if (!state.user) {
      setLoading(false);
      ui.mount.innerHTML = renderCtaCard(STR.needLoginTitle, STR.needLoginBody, STR.needLoginCta, CONFIG.LOGIN_PATH);
      return;
    }

    const member = await fetchDefaultMembership(state.user.id);
    state.orgId = member?.organization_id || "";
    state.orgRole = String(member?.role || "").trim().toLowerCase();
    state.isAdmin = isAdminRole(state.orgRole);

    if (!state.orgId) {
      setLoading(false);
      ui.mount.innerHTML = renderErrorCard("Organisation introuvable.", "Ton compte n'est rattache a aucune organisation.");
      return;
    }

    state.modules = await fetchModules(state.orgId);
    if (!state.modules?.rental) {
      setLoading(false);
      ui.mount.innerHTML = renderCtaCard(STR.moduleMissingTitle, STR.moduleMissingBody, STR.moduleMissingCta, CONFIG.SUBSCRIBE_PATH);
      return;
    }

    if (!state.isAdmin) {
      setLoading(false);
      ui.mount.innerHTML = renderErrorCard(STR.notAllowedTitle, STR.notAllowedBody);
      return;
    }

    bindGlobalEvents();

    // default reservations range
    const now = new Date();
    state.resRangeFrom = toISODate(now);
    state.resRangeTo = toISODate(addDays(now, CONFIG.DEFAULT_RANGE_DAYS));

    await loadListings();
    setLoading(false);
  }

  function setLoading(on) {
    ui.loading.hidden = !on;
  }

  async function loadListings() {
    const { data, error } = await state.supabase
      .from(CONFIG.LISTINGS_TABLE)
      .select("*")
      .eq("organization_id", state.orgId)
      .order("updated_at", { ascending: false });

    if (error) {
      warn("listings load error", error);
      showToast("error", "Impossible de charger les annonces.");
      state.listings = [];
      state.filteredListings = [];
      renderListings();
      renderDetail();
      return;
    }

    state.listings = Array.isArray(data) ? data : [];
    applySearch();

    if (!state.selectedListingId && state.filteredListings.length) {
      selectListing(state.filteredListings[0].id);
    } else {
      renderDetail();
    }
  }

  function applySearch() {
    const q = String(state.search || "").trim().toLowerCase();
    if (!q) {
      state.filteredListings = state.listings.slice();
      renderListings();
      return;
    }
    state.filteredListings = state.listings.filter((l) => {
      const hay = [l.title, l.city, l.address, l.summary].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    renderListings();
  }

  function selectListing(listingId) {
    const id = String(listingId || "").trim();
    if (!id) return;
    state.selectedListingId = id;
    state.activeTab = "listing";
    state.editing = cloneListingForEdit(findListingById(id));
    renderListings();
    renderDetail();
  }

  function findListingById(id) {
    return state.listings.find((l) => String(l.id) === String(id)) || null;
  }

  function newListing() {
    state.selectedListingId = "";
    state.activeTab = "listing";
    state.editing = {
      id: "",
      public_id: "",
      organization_id: state.orgId,
      title: "",
      summary: "",
      description: "",
      address: "",
      city: "",
      postal_code: "",
      country: "France",
      currency: CONFIG.DEFAULT_CURRENCY,
      nightly_price_cents: 0,
      cleaning_fee_cents: 0,
      security_deposit_cents: 0,
      vat_rate: 0,
      min_nights: 1,
      max_nights: null,
      checkin_time: "16:00",
      checkout_time: "11:00",
      max_guests: 2,
      bedrooms: null,
      beds: null,
      bathrooms: null,
      cover_image_url: "",
      gallery_urls: [],
      amenities: {},
      house_rules: "",
      cancellation_policy: "",
      is_published: false,
      is_active: true,
    };
    renderListings();
    renderDetail();
    // Focus first input (after paint)
    setTimeout(() => {
      const el = ui.mount.querySelector("[data-field='title']");
      if (el) el.focus();
    }, 50);
  }

  function renderShell() {
    root.innerHTML = `
      <div class="rent-shell" data-rent-shell>
        <div class="rent-head">
          <div>
            <div class="rent-eyebrow">${escapeHtml(STR.subtitle)}</div>
            <h1 class="rent-h1">${escapeHtml(STR.title)}</h1>
          </div>
          <div class="rent-head__actions">
            <button class="rent-btn rent-btn--ghost" type="button" data-action="refresh">${escapeHtml(STR.refresh)}</button>
            <button class="rent-btn rent-btn--primary" type="button" data-action="new">${escapeHtml(STR.newListing)}</button>
          </div>
        </div>

        <div class="rent-loading" data-loading>
          <div class="rent-loading__spinner"></div>
          <div class="rent-loading__text">Chargement...</div>
        </div>

        <div class="rent-mount" data-mount></div>
        <div class="rent-toasts" data-toasts></div>
      </div>
    `;

    const mount = root.querySelector("[data-mount]");
    const loading = root.querySelector("[data-loading]");
    const toasts = root.querySelector("[data-toasts]");

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "refresh") loadListings();
      if (action === "new") newListing();
    });

    return { mount, loading, toasts };
  }

  function ensureLayout() {
    if (dom.list && dom.detail && dom.count && dom.search) return;

    ui.mount.innerHTML = `
      <div class="rent-grid" data-rent-layout>
        <section class="rent-panel rent-panel--list">
          <div class="rent-panel__head">
            <div class="rent-panel__title">Annonces</div>
            <div class="rent-pill" data-count>0</div>
          </div>
          <div class="rent-search">
            <input class="rent-input" type="search" data-search placeholder="${escapeHtml(STR.searchPlaceholder)}" value="${escapeHtml(
              state.search
            )}" />
          </div>
          <div class="rent-list" data-list></div>
        </section>

        <section class="rent-panel rent-panel--detail">
          <div class="rent-detail" data-detail></div>
        </section>
      </div>
    `;

    dom.list = ui.mount.querySelector("[data-list]");
    dom.detail = ui.mount.querySelector("[data-detail]");
    dom.count = ui.mount.querySelector("[data-count]");
    dom.search = ui.mount.querySelector("[data-search]");

    if (dom.search) {
      dom.search.addEventListener("input", () => {
        state.search = dom.search.value || "";
        applySearch();
      });
    }

    if (dom.list) {
      dom.list.addEventListener("click", (e) => {
        const btn = e.target.closest('[data-action="select"]');
        if (!btn) return;
        selectListing(btn.dataset.id);
      });
    }
  }

  function renderListings() {
    ensureLayout();
    const list = state.filteredListings;
    const empty = !list.length;
    const selectedId = String(state.selectedListingId || "");

    if (dom.count) dom.count.textContent = String(list.length);
    if (dom.search && dom.search.value !== String(state.search || "")) dom.search.value = String(state.search || "");

    if (!dom.list) return;

    if (empty) {
      dom.list.innerHTML = `<div class="rent-empty">
          <div class="rent-empty__title">${escapeHtml(STR.emptyListTitle)}</div>
          <div class="rent-empty__body">${escapeHtml(STR.emptyListBody)}</div>
        </div>`;
      return;
    }

    dom.list.innerHTML = list
      .map((l) => {
        const isSelected = String(l.id) === selectedId;
        const badge = l.is_published ? "Publiee" : "Brouillon";
        const badgeTone = l.is_published ? "ok" : "muted";
        const price = centsToMoney(l.nightly_price_cents, l.currency || CONFIG.DEFAULT_CURRENCY);
        const cover = String(l.cover_image_url || "").trim();
        const coverStyle = cover ? `style="background-image:url('${escapeAttr(cover)}')"` : "";
        return `
          <button class="rent-item ${isSelected ? "is-selected" : ""}" type="button" data-action="select" data-id="${escapeAttr(l.id)}">
            <div class="rent-item__media" ${coverStyle} aria-hidden="true"></div>
            <div class="rent-item__body">
              <div class="rent-item__top">
                <div class="rent-item__title">${escapeHtml(l.title || "Sans titre")}</div>
                <div class="rent-badge rent-badge--${badgeTone}">${escapeHtml(badge)}</div>
              </div>
              <div class="rent-item__meta">
                <span>${escapeHtml(l.city || "")}</span>
                <span class="rent-dot"></span>
                <span>${escapeHtml(price)}/nuit</span>
              </div>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function renderDetail() {
    ensureLayout();
    const detail = dom.detail;
    if (!detail) return;

    const l = state.editing;
    if (!l) {
      detail.innerHTML = `<div class="rent-placeholder">${escapeHtml(STR.selectListing)}</div>`;
      return;
    }

    const isExisting = Boolean(l.id);
    const badge = l.is_published ? "Publiee" : "Brouillon";
    const badgeTone = l.is_published ? "ok" : "muted";
    const publicLink = l.public_id ? buildPublicLink(l.public_id) : "";

    detail.innerHTML = `
      <div class="rent-detail__head">
        <div>
          <div class="rent-detail__kicker">${escapeHtml(l.city || "Annonce")}</div>
          <div class="rent-detail__title">${escapeHtml(l.title || "Nouvelle annonce")}</div>
          <div class="rent-detail__badges">
            <span class="rent-badge rent-badge--${badgeTone}">${escapeHtml(badge)}</span>
            ${l.is_active ? "" : `<span class="rent-badge rent-badge--danger">Inactive</span>`}
          </div>
        </div>
        <div class="rent-detail__actions">
          ${
            publicLink
              ? `<button class="rent-btn rent-btn--ghost" type="button" data-action="copy-link">${escapeHtml(STR.copyLink)}</button>
                 <a class="rent-btn rent-btn--ghost" href="${escapeAttr(publicLink)}" target="_blank" rel="noopener">${escapeHtml(STR.openLink)}</a>`
              : ""
          }
          <button class="rent-btn rent-btn--ghost" type="button" data-action="toggle-publish" ${isExisting ? "" : "disabled"}>
            ${escapeHtml(l.is_published ? STR.unpublish : STR.publish)}
          </button>
          <button class="rent-btn rent-btn--ghost" type="button" data-action="toggle-active" ${isExisting ? "" : "disabled"}>
            ${escapeHtml(l.is_active ? STR.deactivate : STR.activate)}
          </button>
          <button class="rent-btn rent-btn--primary" type="button" data-action="save-listing">${escapeHtml(STR.save)}</button>
        </div>
      </div>

      <div class="rent-tabs">
        <button class="rent-tab ${state.activeTab === "listing" ? "is-active" : ""}" type="button" data-action="tab" data-tab="listing">${escapeHtml(STR.tabListing)}</button>
        <button class="rent-tab ${state.activeTab === "bookings" ? "is-active" : ""}" type="button" data-action="tab" data-tab="bookings" ${isExisting ? "" : "disabled"}>${escapeHtml(STR.tabBookings)}</button>
      </div>

      <div class="rent-tabpanes">
        <div class="rent-pane ${state.activeTab === "listing" ? "is-active" : ""}" data-pane="listing">
          ${renderListingForm(l)}
        </div>
        <div class="rent-pane ${state.activeTab === "bookings" ? "is-active" : ""}" data-pane="bookings">
          ${renderReservationsPane(l)}
        </div>
      </div>
    `;

    bindDetailEvents(detail);

    if (state.activeTab === "bookings" && l.id) {
      loadReservationsIfNeeded(l.id);
    }
  }

  function renderListingForm(l) {
    return `
      <div class="rent-form">
        <div class="rent-section">
          <div class="rent-section__title">General</div>
          <div class="rent-fields rent-fields--2">
            ${fieldText("Titre *", "title", l.title, "Ex: Studio cosy - Centre")}
            ${fieldText("Ville", "city", l.city, "Paris")}
          </div>
          <div class="rent-fields">
            ${fieldText("Resume", "summary", l.summary, "En 1 phrase")}
          </div>
          <div class="rent-fields">
            ${fieldTextarea("Description", "description", l.description, 5, "Details, equipements, etc.")}
          </div>
        </div>

        <div class="rent-section">
          <div class="rent-section__title">Adresse</div>
          <div class="rent-fields">
            ${fieldText("Adresse", "address", l.address, "10 Rue Exemple")}
          </div>
          <div class="rent-fields rent-fields--3">
            ${fieldText("Code postal", "postal_code", l.postal_code, "75000")}
            ${fieldText("Pays", "country", l.country, "France")}
            ${fieldText("Devise", "currency", l.currency || CONFIG.DEFAULT_CURRENCY, "EUR")}
          </div>
        </div>

        <div class="rent-section">
          <div class="rent-section__title">Tarifs</div>
          <div class="rent-fields rent-fields--3">
            ${fieldMoney("Prix / nuit", "nightly_price_cents", l.nightly_price_cents, l.currency)}
            ${fieldMoney("Frais menage", "cleaning_fee_cents", l.cleaning_fee_cents, l.currency)}
            ${fieldMoney("Caution", "security_deposit_cents", l.security_deposit_cents, l.currency)}
          </div>
          <div class="rent-fields rent-fields--3">
            ${fieldNumber("TVA (%)", "vat_rate", l.vat_rate, 0, 100, 0.1)}
            ${fieldNumber("Min nuits", "min_nights", l.min_nights, 1, 365, 1)}
            ${fieldNumber("Max nuits", "max_nights", l.max_nights, 1, 365, 1, true)}
          </div>
        </div>

        <div class="rent-section">
          <div class="rent-section__title">Capacite</div>
          <div class="rent-fields rent-fields--4">
            ${fieldNumber("Voyageurs max", "max_guests", l.max_guests, 1, 99, 1)}
            ${fieldNumber("Chambres", "bedrooms", l.bedrooms, 0, 50, 1, true)}
            ${fieldNumber("Lits", "beds", l.beds, 0, 99, 1, true)}
            ${fieldNumber("Sdb", "bathrooms", l.bathrooms, 0, 20, 0.5, true)}
          </div>
          <div class="rent-fields rent-fields--2">
            ${fieldText("Check-in", "checkin_time", l.checkin_time, "16:00")}
            ${fieldText("Check-out", "checkout_time", l.checkout_time, "11:00")}
          </div>
        </div>

        <div class="rent-section">
          <div class="rent-section__title">Photos</div>
          <div class="rent-fields">
            ${fieldText("Cover image URL", "cover_image_url", l.cover_image_url, "https://...")}
          </div>
          <div class="rent-fields">
            ${fieldTextarea(
              "Galerie (1 URL par ligne)",
              "gallery_urls_text",
              Array.isArray(l.gallery_urls) ? l.gallery_urls.join("\\n") : "",
              4,
              "https://...\\nhttps://..."
            )}
          </div>
        </div>

        <div class="rent-section">
          <div class="rent-section__title">Regles</div>
          <div class="rent-fields">
            ${fieldTextarea("Reglement interieur", "house_rules", l.house_rules, 4, "")}
          </div>
          <div class="rent-fields">
            ${fieldTextarea("Politique d'annulation", "cancellation_policy", l.cancellation_policy, 4, "")}
          </div>
        </div>

        <div class="rent-footnote">
          Les dates publiques sont accessibles via le lien de reservation (public_id) une fois l'annonce creee.
        </div>
      </div>
    `;
  }

  function renderReservationsPane(l) {
    const from = state.resRangeFrom || "";
    const to = state.resRangeTo || "";
    return `
      <div class="rent-bookings">
        <div class="rent-bookings__grid">
          <div class="rent-card">
            <div class="rent-card__title">${escapeHtml(STR.bookingsTitle)}</div>
            <div class="rent-range">
              <label class="rent-range__item">
                <div class="rent-label">Du</div>
                <input class="rent-input" type="date" data-action="range-from" value="${escapeAttr(from)}" />
              </label>
              <label class="rent-range__item">
                <div class="rent-label">Au</div>
                <input class="rent-input" type="date" data-action="range-to" value="${escapeAttr(to)}" />
              </label>
              <button class="rent-btn rent-btn--ghost" type="button" data-action="reload-res">${escapeHtml(STR.refresh)}</button>
            </div>
            <div class="rent-reslist" data-res-list>
              ${renderReservationsList()}
            </div>
          </div>

          <div class="rent-card">
            <div class="rent-card__title">${escapeHtml(STR.blocksTitle)}</div>
            <div class="rent-mini">
              <div class="rent-fields rent-fields--3">
                ${fieldDate("Debut", "block_from", "")}
                ${fieldDate("Fin", "block_to", "")}
                <div class="rent-field">
                  <div class="rent-label">&nbsp;</div>
                  <button class="rent-btn rent-btn--primary" type="button" data-action="create-block">${escapeHtml(STR.createBlock)}</button>
                </div>
              </div>
              <div class="rent-fields">
                ${fieldText("Note", "block_note", "", "Ex: travaux / maintenance")}
              </div>
              <div class="rent-divider"></div>
              <div class="rent-card__title">${escapeHtml(STR.createManual)}</div>
              <div class="rent-fields rent-fields--2">
                ${fieldDate("Check-in *", "manual_from", "")}
                ${fieldDate("Check-out *", "manual_to", "")}
              </div>
              <div class="rent-fields rent-fields--3">
                ${fieldText("Nom *", "guest_name", "", "Nom")}
                ${fieldText("Email *", "guest_email", "", "email@domaine.com")}
                ${fieldText("Telephone", "guest_phone", "", "+33...")}
              </div>
              <div class="rent-fields rent-fields--3">
                ${fieldNumber("Voyageurs", "guests_count", 1, 1, 99, 1)}
                ${fieldSelect("Statut", "manual_status", [
                  { v: "confirmed", l: STR.statusConfirmed },
                  { v: "pending", l: STR.statusPending },
                ])}
                <div class="rent-field">
                  <div class="rent-label">&nbsp;</div>
                  <button class="rent-btn rent-btn--primary" type="button" data-action="create-manual">${escapeHtml(STR.create)}</button>
                </div>
              </div>
              <div class="rent-fields">
                ${fieldText("Note", "manual_note", "", "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderReservationsList() {
    if (state.resLoading) {
      return `<div class="rent-muted">Chargement des reservations...</div>`;
    }
    if (!state.reservations.length) {
      return `<div class="rent-muted">Aucune reservation sur cette periode.</div>`;
    }

    return state.reservations
      .map((r) => {
        const isBlock = String(r.kind) === "block";
        const kind = isBlock ? STR.kindBlock : STR.kindBooking;
        const status = String(r.status || "").trim().toLowerCase();
        const tone = statusTone(status);
        const statusLabel = statusLabelFr(status);

        const date = `${escapeHtml(toFRDate(r.check_in))} → ${escapeHtml(toFRDate(r.check_out))}`;
        const total = centsToMoney(r.total_cents, r.currency || CONFIG.DEFAULT_CURRENCY);
        const guest = isBlock ? escapeHtml(r.note || "") : escapeHtml(r.guest_name || "");
        const meta = isBlock ? "" : `${escapeHtml(String(r.guests_count || 1))} pers.`;

        const actions = renderReservationActions(r);

        return `
          <div class="rent-res">
            <div class="rent-res__left">
              <div class="rent-res__top">
                <div class="rent-res__kind">${escapeHtml(kind)}</div>
                <div class="rent-badge rent-badge--${tone}">${escapeHtml(statusLabel)}</div>
              </div>
              <div class="rent-res__date">${date}</div>
              <div class="rent-res__guest">${guest}${meta ? ` <span class="rent-res__meta">(${meta})</span>` : ""}</div>
            </div>
            <div class="rent-res__right">
              ${!isBlock ? `<div class="rent-res__total">${escapeHtml(total)}</div>` : `<div class="rent-res__total rent-muted">-</div>`}
              <div class="rent-res__actions">${actions}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderReservationActions(r) {
    const status = String(r.status || "").trim().toLowerCase();
    const isBlock = String(r.kind) === "block";

    const btn = (action, label, tone = "ghost") =>
      `<button class="rent-btn rent-btn--${tone} rent-btn--xs" type="button" data-action="${action}" data-res-id="${escapeAttr(r.id)}">${escapeHtml(label)}</button>`;

    if (isBlock) {
      if (status === "blocked") return btn("unblock", STR.actionUnblock, "ghost");
      return "";
    }

    if (status === "pending") {
      return btn("confirm", STR.actionConfirm, "primary") + btn("decline", STR.actionDecline, "ghost");
    }
    if (status === "confirmed") {
      return btn("cancel", STR.actionCancel, "ghost");
    }
    return "";
  }

  function bindGlobalEvents() {
    ui.mount.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "tab") {
        state.activeTab = btn.dataset.tab || "listing";
        renderDetail();
        return;
      }

      if (action === "copy-link") {
        const l = state.editing;
        if (!l?.public_id) return;
        const link = buildPublicLink(l.public_id);
        try {
          await navigator.clipboard.writeText(link);
          showToast("success", "Lien copie.");
        } catch (_) {
          showToast("warn", link);
        }
        return;
      }

      if (action === "toggle-publish") {
        const l = state.editing;
        if (!l?.id) return;
        await patchListing(l.id, { is_published: !Boolean(l.is_published) });
        return;
      }

      if (action === "toggle-active") {
        const l = state.editing;
        if (!l?.id) return;
        await patchListing(l.id, { is_active: !Boolean(l.is_active) });
        return;
      }

      if (action === "save-listing") {
        await saveCurrentListing(btn);
        return;
      }

      if (action === "reload-res") {
        const l = state.editing;
        if (!l?.id) return;
        await loadReservations(l.id, true);
        return;
      }

      if (action === "create-block") {
        const l = state.editing;
        if (!l?.id) return;
        await createBlockFromUI(l);
        return;
      }

      if (action === "create-manual") {
        const l = state.editing;
        if (!l?.id) return;
        await createManualBookingFromUI(l);
        return;
      }

      if (action === "confirm" || action === "decline" || action === "cancel" || action === "unblock") {
        const l = state.editing;
        if (!l?.id) return;
        const resId = btn.dataset.resId;
        await updateReservationStatus(l.id, resId, action);
        return;
      }
    });

    ui.mount.addEventListener("input", (e) => {
      const field = e.target?.dataset?.field;
      if (!field) return;
      if (!state.editing) return;

      if (field === "gallery_urls_text") {
        state.editing.gallery_urls = String(e.target.value || "")
          .split(/\r?\n/)
          .map((s) => String(s || "").trim())
          .filter(Boolean);
        return;
      }

      // money inputs are stored as cents on blur (see change handler)
      if (field.endsWith("_money")) return;

      state.editing[field] = e.target.value;
    });

    ui.mount.addEventListener("change", (e) => {
      const action = e.target?.dataset?.action;
      if (action === "range-from") {
        state.resRangeFrom = e.target.value || "";
        if (state.editing?.id && state.activeTab === "bookings") loadReservations(state.editing.id, true);
        return;
      }
      if (action === "range-to") {
        state.resRangeTo = e.target.value || "";
        if (state.editing?.id && state.activeTab === "bookings") loadReservations(state.editing.id, true);
        return;
      }

      const field = e.target?.dataset?.field;
      if (!field) return;
      if (!state.editing) return;

      // Normalize numeric inputs (number/date/select)
      if (e.target.type === "number") {
        const val = e.target.value;
        state.editing[field] = val === "" ? null : Number(val);
        return;
      }

      // Money pseudo-field -> cents
      if (field.endsWith("_money")) {
        const centsField = field.replace(/_money$/, "_cents");
        state.editing[centsField] = moneyToCents(e.target.value);
        return;
      }

      state.editing[field] = e.target.value;
    });
  }

  function bindDetailEvents(detailEl) {
    // no-op for now (delegated handlers cover all)
    void detailEl;
  }

  async function saveCurrentListing(btnEl) {
    if (!state.editing) return;
    const draft = normalizeListingDraft(state.editing);
    if (!draft.title) {
      showToast("warn", STR.validationError);
      return;
    }

    const originalText = btnEl?.textContent || STR.save;
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = STR.saving;
    }

    try {
      if (draft.id) {
        const { error } = await state.supabase
          .from(CONFIG.LISTINGS_TABLE)
          .update(draft)
          .eq("id", draft.id)
          .eq("organization_id", state.orgId);
        if (error) throw error;
      } else {
        const payload = { ...draft };
        delete payload.id;
        const ins = await state.supabase.from(CONFIG.LISTINGS_TABLE).insert(payload).select("*").single();
        if (ins.error) throw ins.error;
        // load fresh from db (includes public_id)
        state.editing = cloneListingForEdit(ins.data);
        state.selectedListingId = String(ins.data.id);
      }

      showToast("success", STR.saved);
      await loadListings();
    } catch (e) {
      warn("save listing error", e);
      showToast("error", STR.saveError);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = originalText;
      }
    }
  }

  async function patchListing(listingId, patch) {
    const id = String(listingId || "").trim();
    if (!id) return;
    try {
      const { error } = await state.supabase
        .from(CONFIG.LISTINGS_TABLE)
        .update(patch)
        .eq("id", id)
        .eq("organization_id", state.orgId);
      if (error) throw error;

      await loadListings();
      const row = findListingById(id);
      if (row) state.editing = cloneListingForEdit(row);
      renderDetail();
    } catch (e) {
      warn("patch listing error", e);
      showToast("error", "Action impossible.");
    }
  }

  async function loadReservationsIfNeeded(listingId) {
    const id = String(listingId || "").trim();
    if (!id) return;
    if (state.reservationsForListing === id && state.reservations.length) return;
    await loadReservations(id, true);
  }

  async function loadReservations(listingId, force) {
    const id = String(listingId || "").trim();
    if (!id) return;
    if (!force && state.reservationsForListing === id && !state.resLoading) return;

    state.resLoading = true;
    state.reservationsForListing = id;
    state.reservations = [];
    renderDetail();

    const from = state.resRangeFrom || toISODate(new Date());
    const to = state.resRangeTo || toISODate(addDays(new Date(), CONFIG.DEFAULT_RANGE_DAYS));

    const { data, error } = await state.supabase
      .from(CONFIG.RESERVATIONS_TABLE)
      .select("*")
      .eq("listing_id", id)
      .eq("organization_id", state.orgId)
      .gt("check_out", from)
      .lt("check_in", to)
      .order("check_in", { ascending: true });

    state.resLoading = false;
    if (error) {
      warn("reservations load error", error);
      showToast("error", "Impossible de charger les reservations.");
      renderDetail();
      return;
    }

    state.reservations = Array.isArray(data) ? data : [];
    renderDetail();
  }

  async function createBlockFromUI(listing) {
    const wrap = ui.mount.querySelector("[data-pane='bookings']");
    if (!wrap) return;

    const from = wrap.querySelector("[data-field='block_from']")?.value || "";
    const to = wrap.querySelector("[data-field='block_to']")?.value || "";
    const note = wrap.querySelector("[data-field='block_note']")?.value || "";

    if (!from || !to || to <= from) {
      showToast("warn", STR.validationError);
      return;
    }

    try {
      const payload = {
        organization_id: state.orgId,
        listing_id: listing.id,
        kind: "block",
        source: "manual",
        status: "blocked",
        payment_status: "unpaid",
        check_in: from,
        check_out: to,
        nights: Math.max(1, diffNights(from, to)),
        guests_count: 1,
        note: String(note || "").trim() || null,
        currency: listing.currency || CONFIG.DEFAULT_CURRENCY,
        subtotal_cents: 0,
        cleaning_fee_cents: 0,
        taxes_cents: 0,
        total_cents: 0,
      };

      const { error } = await state.supabase.from(CONFIG.RESERVATIONS_TABLE).insert(payload);
      if (error) throw error;

      showToast("success", STR.created);
      await loadReservations(listing.id, true);
    } catch (e) {
      warn("create block error", e);
      if (isOverlapError(e)) showToast("warn", STR.overlapError);
      else showToast("error", "Impossible de creer le blocage.");
    }
  }

  async function createManualBookingFromUI(listing) {
    const wrap = ui.mount.querySelector("[data-pane='bookings']");
    if (!wrap) return;

    const from = wrap.querySelector("[data-field='manual_from']")?.value || "";
    const to = wrap.querySelector("[data-field='manual_to']")?.value || "";
    const guestName = wrap.querySelector("[data-field='guest_name']")?.value || "";
    const guestEmail = wrap.querySelector("[data-field='guest_email']")?.value || "";
    const guestPhone = wrap.querySelector("[data-field='guest_phone']")?.value || "";
    const guests = Number(wrap.querySelector("[data-field='guests_count']")?.value || 1);
    const status = wrap.querySelector("[data-field='manual_status']")?.value || "confirmed";
    const note = wrap.querySelector("[data-field='manual_note']")?.value || "";

    if (!from || !to || to <= from) return showToast("warn", STR.validationError);
    if (!String(guestName).trim() || !String(guestEmail).trim()) return showToast("warn", STR.validationError);

    const nights = Math.max(1, diffNights(from, to));
    if (nights < Number(listing.min_nights || 1)) return showToast("warn", `Min ${listing.min_nights || 1} nuit(s).`);
    if (listing.max_nights && nights > Number(listing.max_nights)) return showToast("warn", `Max ${listing.max_nights} nuit(s).`);
    if (guests > Number(listing.max_guests || 99)) return showToast("warn", `Max ${listing.max_guests} voyageurs.`);

    const subtotal = nights * Number(listing.nightly_price_cents || 0);
    const cleaning = Number(listing.cleaning_fee_cents || 0);
    const vatRate = Number(listing.vat_rate || 0);
    const taxes = vatRate > 0 ? Math.round((subtotal + cleaning) * (vatRate / 100)) : 0;
    const total = subtotal + cleaning + taxes;

    try {
      const payload = {
        organization_id: state.orgId,
        listing_id: listing.id,
        kind: "booking",
        source: "manual",
        status: status === "pending" ? "pending" : "confirmed",
        payment_status: "unpaid",
        check_in: from,
        check_out: to,
        nights,
        guests_count: Math.max(1, guests || 1),
        guest_name: String(guestName).trim(),
        guest_email: String(guestEmail).trim(),
        guest_phone: String(guestPhone).trim() || null,
        note: String(note).trim() || null,
        currency: listing.currency || CONFIG.DEFAULT_CURRENCY,
        subtotal_cents: subtotal,
        cleaning_fee_cents: cleaning,
        taxes_cents: taxes,
        total_cents: total,
      };

      const { error } = await state.supabase.from(CONFIG.RESERVATIONS_TABLE).insert(payload);
      if (error) throw error;

      showToast("success", STR.created);
      await loadReservations(listing.id, true);
    } catch (e) {
      warn("create manual booking error", e);
      if (isOverlapError(e)) showToast("warn", STR.overlapError);
      else showToast("error", "Impossible de creer la reservation.");
    }
  }

  async function updateReservationStatus(listingId, reservationId, action) {
    const listing = findListingById(listingId);
    if (!listing) return;

    const id = String(reservationId || "").trim();
    if (!id) return;

    let next = "";
    if (action === "confirm") next = "confirmed";
    if (action === "decline") next = "declined";
    if (action === "cancel") next = "canceled";
    if (action === "unblock") next = "canceled";
    if (!next) return;

    try {
      const { error } = await state.supabase
        .from(CONFIG.RESERVATIONS_TABLE)
        .update({ status: next })
        .eq("id", id)
        .eq("listing_id", listing.id)
        .eq("organization_id", state.orgId);
      if (error) throw error;

      await loadReservations(listing.id, true);
    } catch (e) {
      warn("reservation status error", e);
      showToast("error", "Action impossible.");
    }
  }

  function renderCtaCard(title, body, cta, href) {
    return `
      <div class="rent-card rent-card--center">
        <div class="rent-card__title">${escapeHtml(title)}</div>
        <div class="rent-card__body">${escapeHtml(body)}</div>
        <div class="rent-card__actions">
          <a class="rent-btn rent-btn--primary" href="${escapeAttr(href)}">${escapeHtml(cta)}</a>
        </div>
      </div>
    `;
  }

  function renderErrorCard(title, body) {
    return `
      <div class="rent-card rent-card--center">
        <div class="rent-card__title">${escapeHtml(title)}</div>
        <div class="rent-card__body">${escapeHtml(body)}</div>
      </div>
    `;
  }

  function fieldText(label, field, value, placeholder) {
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)}</div>
        <input class="rent-input" type="text" data-field="${escapeAttr(field)}" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(placeholder || "")}" />
      </label>
    `;
  }

  function fieldTextarea(label, field, value, rows, placeholder) {
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)}</div>
        <textarea class="rent-input rent-textarea" data-field="${escapeAttr(field)}" rows="${Number(rows || 4)}" placeholder="${escapeAttr(placeholder || "")}">${escapeHtml(value || "")}</textarea>
      </label>
    `;
  }

  function fieldNumber(label, field, value, min, max, step, allowEmpty) {
    const v = value === null || value === undefined ? "" : String(value);
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)}</div>
        <input class="rent-input" type="number" data-field="${escapeAttr(field)}" value="${escapeAttr(v)}" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(step)}" ${allowEmpty ? "" : "required"} />
      </label>
    `;
  }

  function fieldMoney(label, fieldCents, cents, currency) {
    const money = centsToMoneyRaw(cents);
    const sym = currencySymbol(currency || CONFIG.DEFAULT_CURRENCY);
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)} <span class="rent-muted">(${escapeHtml(sym)})</span></div>
        <input class="rent-input" inputmode="decimal" data-field="${escapeAttr(fieldCents.replace(/_cents$/, "_money"))}" value="${escapeAttr(money)}" placeholder="0.00" />
      </label>
    `;
  }

  function fieldDate(label, field, value) {
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)}</div>
        <input class="rent-input" type="date" data-field="${escapeAttr(field)}" value="${escapeAttr(value || "")}" />
      </label>
    `;
  }

  function fieldSelect(label, field, options) {
    const opts = Array.isArray(options) ? options : [];
    return `
      <label class="rent-field">
        <div class="rent-label">${escapeHtml(label)}</div>
        <select class="rent-input" data-field="${escapeAttr(field)}">
          ${opts.map((o) => `<option value="${escapeAttr(o.v)}">${escapeHtml(o.l)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function normalizeListingDraft(input) {
    const src = input && typeof input === "object" ? input : {};
    const out = {};
    const keys = [
      "id",
      "organization_id",
      "title",
      "summary",
      "description",
      "address",
      "city",
      "postal_code",
      "country",
      "currency",
      "nightly_price_cents",
      "cleaning_fee_cents",
      "security_deposit_cents",
      "vat_rate",
      "min_nights",
      "max_nights",
      "checkin_time",
      "checkout_time",
      "max_guests",
      "bedrooms",
      "beds",
      "bathrooms",
      "cover_image_url",
      "gallery_urls",
      "amenities",
      "house_rules",
      "cancellation_policy",
      "is_published",
      "is_active",
    ];
    keys.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    });

    out.organization_id = state.orgId;
    out.title = String(out.title || "").trim();
    out.summary = nullIfEmpty(out.summary);
    out.description = nullIfEmpty(out.description);
    out.address = nullIfEmpty(out.address);
    out.city = nullIfEmpty(out.city);
    out.postal_code = nullIfEmpty(out.postal_code);
    out.country = nullIfEmpty(out.country);
    out.currency = String(out.currency || CONFIG.DEFAULT_CURRENCY).trim() || CONFIG.DEFAULT_CURRENCY;

    out.nightly_price_cents = toInt(out.nightly_price_cents);
    out.cleaning_fee_cents = toInt(out.cleaning_fee_cents);
    out.security_deposit_cents = toInt(out.security_deposit_cents);
    out.vat_rate = toNumber(out.vat_rate);
    out.min_nights = Math.max(1, toInt(out.min_nights || 1));
    out.max_nights = out.max_nights === "" ? null : toNullableInt(out.max_nights);
    out.max_guests = Math.max(1, toInt(out.max_guests || 1));
    out.bedrooms = toNullableInt(out.bedrooms);
    out.beds = toNullableInt(out.beds);
    out.bathrooms = toNullableNumber(out.bathrooms);
    out.checkin_time = nullIfEmpty(out.checkin_time) || "16:00";
    out.checkout_time = nullIfEmpty(out.checkout_time) || "11:00";
    out.cover_image_url = nullIfEmpty(out.cover_image_url);

    out.gallery_urls = Array.isArray(out.gallery_urls) ? out.gallery_urls.filter(Boolean) : [];
    out.amenities = out.amenities && typeof out.amenities === "object" ? out.amenities : {};
    out.house_rules = nullIfEmpty(out.house_rules);
    out.cancellation_policy = nullIfEmpty(out.cancellation_policy);
    out.is_published = Boolean(out.is_published);
    out.is_active = Boolean(out.is_active);

    return out;
  }

  function cloneListingForEdit(row) {
    const src = row && typeof row === "object" ? row : {};
    return {
      id: src.id || "",
      public_id: src.public_id || "",
      organization_id: src.organization_id || state.orgId,
      title: src.title || "",
      summary: src.summary || "",
      description: src.description || "",
      address: src.address || "",
      city: src.city || "",
      postal_code: src.postal_code || "",
      country: src.country || "",
      currency: src.currency || CONFIG.DEFAULT_CURRENCY,
      nightly_price_cents: src.nightly_price_cents || 0,
      cleaning_fee_cents: src.cleaning_fee_cents || 0,
      security_deposit_cents: src.security_deposit_cents || 0,
      vat_rate: src.vat_rate || 0,
      min_nights: src.min_nights || 1,
      max_nights: src.max_nights ?? null,
      checkin_time: src.checkin_time || "16:00",
      checkout_time: src.checkout_time || "11:00",
      max_guests: src.max_guests || 2,
      bedrooms: src.bedrooms ?? null,
      beds: src.beds ?? null,
      bathrooms: src.bathrooms ?? null,
      cover_image_url: src.cover_image_url || "",
      gallery_urls: Array.isArray(src.gallery_urls) ? src.gallery_urls : [],
      amenities: src.amenities && typeof src.amenities === "object" ? src.amenities : {},
      house_rules: src.house_rules || "",
      cancellation_policy: src.cancellation_policy || "",
      is_published: Boolean(src.is_published),
      is_active: Boolean(src.is_active),
    };
  }

  async function fetchDefaultMembership(userId) {
    const { data, error } = await state.supabase
      .from(CONFIG.MEMBERS_TABLE)
      .select("organization_id, role, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      warn("membership error", error);
      return null;
    }
    return data || null;
  }

  async function fetchModules(orgId) {
    const { data, error } = await state.supabase
      .from(CONFIG.ENTITLEMENTS_TABLE)
      .select("modules")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) {
      warn("entitlements error", error);
      return {};
    }
    return data?.modules && typeof data.modules === "object" ? data.modules : {};
  }

  function buildPublicLink(publicId) {
    const base = String(CONFIG.BOOKING_PATH || "").trim() || `${APP_ROOT}/rental-book`;
    const u = new URL(base, location.origin);
    u.searchParams.set("l", publicId);
    return u.pathname + u.search;
  }

  function showToast(type, msg) {
    const el = document.createElement("div");
    el.className = `rent-toast rent-toast--${type}`;
    el.textContent = msg;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function statusLabelFr(status) {
    const s = String(status || "").trim().toLowerCase();
    if (s === "pending") return STR.statusPending;
    if (s === "confirmed") return STR.statusConfirmed;
    if (s === "declined") return STR.statusDeclined;
    if (s === "canceled") return STR.statusCanceled;
    if (s === "blocked") return STR.statusBlocked;
    return status || "";
  }

  function statusTone(status) {
    const s = String(status || "").trim().toLowerCase();
    if (s === "confirmed") return "ok";
    if (s === "pending") return "warn";
    if (s === "blocked") return "danger";
    if (s === "declined" || s === "canceled") return "muted";
    return "muted";
  }

  function isAdminRole(role) {
    const r = String(role || "").trim().toLowerCase();
    return ["owner", "admin", "manager"].includes(r);
  }

  function toISODate(d) {
    const dt = d instanceof Date ? d : new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(d, days) {
    const dt = d instanceof Date ? new Date(d) : new Date();
    dt.setDate(dt.getDate() + Number(days || 0));
    return dt;
  }

  function toFRDate(iso) {
    if (!iso) return "";
    const d = new Date(String(iso) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }

  function diffNights(from, to) {
    const a = new Date(String(from) + "T00:00:00");
    const b = new Date(String(to) + "T00:00:00");
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  function centsToMoney(cents, currency) {
    const c = toInt(cents);
    const cur = String(currency || CONFIG.DEFAULT_CURRENCY).trim() || CONFIG.DEFAULT_CURRENCY;
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format((c || 0) / 100);
    } catch (_) {
      return `${((c || 0) / 100).toFixed(2)} ${cur}`;
    }
  }

  function centsToMoneyRaw(cents) {
    const c = toInt(cents);
    return ((c || 0) / 100).toFixed(2);
  }

  function currencySymbol(currency) {
    const c = String(currency || "").trim().toUpperCase();
    if (c === "EUR") return "EUR";
    return c || "EUR";
  }

  function moneyToCents(input) {
    const s = String(input || "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function toInt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  }

  function toNullableInt(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  }

  function toNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return n;
  }

  function toNullableNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function nullIfEmpty(v) {
    const s = String(v ?? "").trim();
    return s ? s : null;
  }

  function isOverlapError(err) {
    const e = err && typeof err === "object" ? err : {};
    const code = String(e.code || "").trim();
    const msg = String(e.message || "").toLowerCase();
    return code === "23P01" || msg.includes("overlap") || msg.includes("exclude");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, "&#096;");
  }

  async function resolveSupabaseClient(config) {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    await ensureSupabaseJs(config);
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase non charge");
    const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: config.AUTH_STORAGE_KEY,
      },
    });
    window.__MBL_SUPABASE__ = client;
    return client;
  }

  function ensureSupabaseJs(config) {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();

    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
        existing.addEventListener(
          "load",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true }
        );
        existing.addEventListener(
          "error",
          () => {
            clearTimeout(t);
            reject(new Error("Echec chargement supabase-js"));
          },
          { once: true }
        );
      });
    }

    const s = document.createElement("script");
    s.src = config.SUPABASE_CDN;
    s.async = true;
    s.dataset.mblLib = "supabase";
    document.head.appendChild(s);

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
      s.addEventListener(
        "load",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
      s.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          reject(new Error("Echec chargement supabase-js"));
        },
        { once: true }
      );
    });
  }

  function injectStyles() {
    if (document.getElementById("mbl-rental-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-rental-style";
    st.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Space+Grotesk:wght@600;700&display=swap');

      html[data-page="admin-rental"] .rent-shell,
      html[data-page="admin-rental"] .rent-shell * { box-sizing: border-box; }

      html[data-page="admin-rental"] .rent-shell{
        --rent-primary: var(--mbl-primary, #0ea5e9);
        --rent-text: rgba(2,6,23,0.92);
        --rent-muted: rgba(2,6,23,0.62);
        --rent-line: rgba(15,23,42,0.12);
        --rent-card: rgba(255,255,255,0.92);
        font-family: "Manrope", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, "Apple Color Emoji","Segoe UI Emoji";
        width: min(1280px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid rgba(15,23,42,0.10);
        background:
          radial-gradient(900px 560px at 10% 0%, rgba(14,165,233,0.16), transparent 58%),
          radial-gradient(920px 580px at 95% 10%, rgba(2,6,23,0.09), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.96));
        box-shadow: 0 22px 60px rgba(2,6,23,0.10);
        color: var(--rent-text);
      }

      html[data-page="admin-rental"] .rent-eyebrow{
        font-size: 12px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: rgba(2,6,23,0.55);
      }
      html[data-page="admin-rental"] .rent-h1{
        font-family: "Space Grotesk", "Manrope", system-ui;
        font-size: 26px;
        letter-spacing: -0.02em;
        margin: 6px 0 0;
        font-weight: 700;
      }

      html[data-page="admin-rental"] .rent-head{
        display:flex;
        align-items:flex-end;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      html[data-page="admin-rental"] .rent-head__actions{
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      html[data-page="admin-rental"] .rent-btn{
        appearance: none;
        border: 1px solid rgba(148,163,184,0.45);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 800;
        font-size: 13px;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      html[data-page="admin-rental"] .rent-btn:hover{
        transform: translateY(-1px);
        border-color: rgba(14,165,233,0.55);
        box-shadow: 0 12px 26px rgba(2,6,23,0.10);
      }
      html[data-page="admin-rental"] .rent-btn:disabled{
        opacity: .55;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      html[data-page="admin-rental"] .rent-btn--primary{
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        border-color: rgba(14,165,233,0.65);
        color: white;
      }
      html[data-page="admin-rental"] .rent-btn--ghost{
        background: rgba(255,255,255,0.70);
      }
      html[data-page="admin-rental"] .rent-btn--xs{
        padding: 7px 10px;
        border-radius: 10px;
        font-size: 12px;
      }

      html[data-page="admin-rental"] .rent-loading{
        display:flex;
        align-items:center;
        gap: 10px;
        padding: 14px 12px;
        border-radius: 14px;
        border: 1px dashed rgba(148,163,184,0.55);
        background: rgba(255,255,255,0.55);
        margin-bottom: 14px;
      }
      html[data-page="admin-rental"] .rent-loading__spinner{
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid rgba(14,165,233,0.25);
        border-top-color: rgba(14,165,233,0.95);
        animation: rentspin .9s linear infinite;
      }
      @keyframes rentspin { to { transform: rotate(360deg); } }
      html[data-page="admin-rental"] .rent-loading__text{ color: var(--rent-muted); font-weight: 700; }

      html[data-page="admin-rental"] .rent-grid{
        display:grid;
        grid-template-columns: 420px 1fr;
        gap: 14px;
        align-items: start;
      }
      html[data-page="admin-rental"] .rent-panel{
        border: 1px solid rgba(148,163,184,0.30);
        background: var(--rent-card);
        border-radius: 16px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.08);
        overflow: hidden;
      }
      html[data-page="admin-rental"] .rent-panel__head{
        display:flex;
        align-items:center;
        justify-content: space-between;
        padding: 12px 12px 10px;
        border-bottom: 1px solid rgba(148,163,184,0.22);
        background: linear-gradient(180deg, rgba(248,250,252,0.92), rgba(241,245,249,0.78));
      }
      html[data-page="admin-rental"] .rent-panel__title{
        font-family: "Space Grotesk", "Manrope";
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      html[data-page="admin-rental"] .rent-pill{
        min-width: 34px;
        height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 900;
        font-size: 12px;
        border: 1px solid rgba(148,163,184,0.35);
        background: rgba(255,255,255,0.75);
        color: rgba(2,6,23,0.7);
      }

      html[data-page="admin-rental"] .rent-search{ padding: 10px 12px; }
      html[data-page="admin-rental"] .rent-input{
        width: 100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,0.45);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.9);
        outline: none;
      }
      html[data-page="admin-rental"] .rent-input:focus{
        border-color: rgba(14,165,233,0.65);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }
      html[data-page="admin-rental"] .rent-textarea{ resize: vertical; }

      html[data-page="admin-rental"] .rent-list{
        padding: 10px 10px 12px;
        display:grid;
        gap: 10px;
        max-height: 72vh;
        overflow: auto;
      }
      html[data-page="admin-rental"] .rent-item{
        display:flex;
        gap: 10px;
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.26);
        background: rgba(255,255,255,0.78);
        cursor: pointer;
        text-align: left;
      }
      html[data-page="admin-rental"] .rent-item:hover{
        border-color: rgba(14,165,233,0.45);
        box-shadow: 0 12px 28px rgba(2,6,23,0.08);
      }
      html[data-page="admin-rental"] .rent-item.is-selected{
        border-color: rgba(14,165,233,0.75);
        box-shadow: 0 14px 34px rgba(14,165,233,0.12);
      }
      html[data-page="admin-rental"] .rent-item__media{
        width: 54px;
        height: 54px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(14,165,233,0.18), rgba(2,132,199,0.10));
        background-size: cover;
        background-position: center;
        border: 1px solid rgba(148,163,184,0.25);
        flex: 0 0 auto;
      }
      html[data-page="admin-rental"] .rent-item__body{ flex: 1 1 auto; min-width: 0; }
      html[data-page="admin-rental"] .rent-item__top{
        display:flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      html[data-page="admin-rental"] .rent-item__title{
        font-weight: 900;
        font-size: 13px;
        line-height: 1.15;
        color: rgba(2,6,23,0.90);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      html[data-page="admin-rental"] .rent-item__meta{
        margin-top: 6px;
        display:flex;
        align-items:center;
        gap: 8px;
        font-size: 12px;
        color: rgba(2,6,23,0.58);
        font-weight: 700;
      }
      html[data-page="admin-rental"] .rent-dot{
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(148,163,184,0.9);
      }

      html[data-page="admin-rental"] .rent-detail{ padding: 12px; }
      html[data-page="admin-rental"] .rent-placeholder{
        padding: 18px 14px;
        border-radius: 14px;
        border: 1px dashed rgba(148,163,184,0.55);
        background: rgba(255,255,255,0.60);
        color: rgba(2,6,23,0.65);
        font-weight: 700;
      }
      html[data-page="admin-rental"] .rent-detail__head{
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      html[data-page="admin-rental"] .rent-detail__kicker{
        font-size: 12px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: rgba(2,6,23,0.55);
      }
      html[data-page="admin-rental"] .rent-detail__title{
        font-family: "Space Grotesk", "Manrope";
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-top: 2px;
      }
      html[data-page="admin-rental"] .rent-detail__badges{
        display:flex;
        gap: 8px;
        margin-top: 8px;
        flex-wrap: wrap;
      }
      html[data-page="admin-rental"] .rent-detail__actions{
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      html[data-page="admin-rental"] .rent-badge{
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 900;
        border: 1px solid rgba(148,163,184,0.28);
        background: rgba(255,255,255,0.75);
        color: rgba(2,6,23,0.70);
      }
      html[data-page="admin-rental"] .rent-badge--ok{
        background: rgba(34,197,94,0.14);
        border-color: rgba(34,197,94,0.25);
        color: rgba(20,83,45,0.95);
      }
      html[data-page="admin-rental"] .rent-badge--warn{
        background: rgba(245,158,11,0.14);
        border-color: rgba(245,158,11,0.25);
        color: rgba(124,45,18,0.95);
      }
      html[data-page="admin-rental"] .rent-badge--danger{
        background: rgba(239,68,68,0.14);
        border-color: rgba(239,68,68,0.25);
        color: rgba(127,29,29,0.95);
      }
      html[data-page="admin-rental"] .rent-badge--muted{
        background: rgba(148,163,184,0.14);
        border-color: rgba(148,163,184,0.25);
        color: rgba(2,6,23,0.55);
      }

      html[data-page="admin-rental"] .rent-tabs{
        display:flex;
        gap: 8px;
        padding: 4px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.62);
        margin-bottom: 12px;
        width: fit-content;
      }
      html[data-page="admin-rental"] .rent-tab{
        border: 1px solid transparent;
        background: transparent;
        padding: 9px 12px;
        border-radius: 12px;
        font-weight: 900;
        font-size: 13px;
        cursor: pointer;
        color: rgba(2,6,23,0.68);
      }
      html[data-page="admin-rental"] .rent-tab.is-active{
        background: rgba(14,165,233,0.16);
        border-color: rgba(14,165,233,0.25);
        color: rgba(2,132,199,0.95);
      }

      html[data-page="admin-rental"] .rent-pane{ display:none; }
      html[data-page="admin-rental"] .rent-pane.is-active{ display:block; }

      html[data-page="admin-rental"] .rent-section{
        border: 1px solid rgba(148,163,184,0.20);
        background: rgba(255,255,255,0.65);
        border-radius: 16px;
        padding: 12px;
        margin-bottom: 12px;
      }
      html[data-page="admin-rental"] .rent-section__title{
        font-weight: 900;
        margin-bottom: 10px;
        color: rgba(2,6,23,0.78);
      }
      html[data-page="admin-rental"] .rent-fields{ display:grid; gap: 10px; }
      html[data-page="admin-rental"] .rent-fields--2{ grid-template-columns: 1fr 1fr; }
      html[data-page="admin-rental"] .rent-fields--3{ grid-template-columns: 1fr 1fr 1fr; }
      html[data-page="admin-rental"] .rent-fields--4{ grid-template-columns: 1fr 1fr 1fr 1fr; }
      html[data-page="admin-rental"] .rent-field{ display:grid; gap: 6px; }
      html[data-page="admin-rental"] .rent-label{
        font-size: 12px;
        font-weight: 900;
        color: rgba(2,6,23,0.62);
      }
      html[data-page="admin-rental"] .rent-footnote{
        font-size: 12px;
        color: rgba(2,6,23,0.55);
        padding: 6px 2px 2px;
      }

      html[data-page="admin-rental"] .rent-bookings__grid{
        display:grid;
        grid-template-columns: 1.1fr .9fr;
        gap: 12px;
      }
      html[data-page="admin-rental"] .rent-card{
        border: 1px solid rgba(148,163,184,0.22);
        background: rgba(255,255,255,0.70);
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.06);
      }
      html[data-page="admin-rental"] .rent-card--center{
        max-width: 640px;
        margin: 28px auto 0;
        text-align:center;
      }
      html[data-page="admin-rental"] .rent-card__title{
        font-family: "Space Grotesk", "Manrope";
        font-size: 16px;
        font-weight: 800;
      }
      html[data-page="admin-rental"] .rent-card__body{
        margin-top: 6px;
        color: rgba(2,6,23,0.62);
        font-weight: 700;
        line-height: 1.5;
      }
      html[data-page="admin-rental"] .rent-card__actions{ margin-top: 14px; display:flex; justify-content:center; }

      html[data-page="admin-rental"] .rent-range{
        display:flex;
        gap: 10px;
        align-items: end;
        flex-wrap: wrap;
        margin-top: 10px;
        margin-bottom: 10px;
      }
      html[data-page="admin-rental"] .rent-range__item{ display:grid; gap: 6px; min-width: 180px; }

      html[data-page="admin-rental"] .rent-reslist{ display:grid; gap: 10px; }
      html[data-page="admin-rental"] .rent-res{
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 10px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.22);
        background: rgba(255,255,255,0.75);
      }
      html[data-page="admin-rental"] .rent-res__top{ display:flex; gap: 8px; align-items:center; flex-wrap: wrap; }
      html[data-page="admin-rental"] .rent-res__kind{ font-weight: 900; color: rgba(2,6,23,0.80); }
      html[data-page="admin-rental"] .rent-res__date{ margin-top: 6px; font-weight: 900; color: rgba(2,6,23,0.72); }
      html[data-page="admin-rental"] .rent-res__guest{ margin-top: 6px; color: rgba(2,6,23,0.70); font-weight: 700; }
      html[data-page="admin-rental"] .rent-res__meta{ color: rgba(2,6,23,0.52); font-weight: 800; }
      html[data-page="admin-rental"] .rent-res__right{ display:grid; gap: 8px; justify-items: end; }
      html[data-page="admin-rental"] .rent-res__total{ font-weight: 900; }
      html[data-page="admin-rental"] .rent-res__actions{ display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

      html[data-page="admin-rental"] .rent-divider{
        height: 1px;
        background: rgba(148,163,184,0.25);
        margin: 12px 0;
      }
      html[data-page="admin-rental"] .rent-mini .rent-card__title{ margin-top: 0; }

      html[data-page="admin-rental"] .rent-muted{ color: rgba(2,6,23,0.56); font-weight: 700; }

      html[data-page="admin-rental"] .rent-toasts{
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        display:grid;
        gap: 10px;
        max-width: min(360px, calc(100vw - 32px));
      }
      html[data-page="admin-rental"] .rent-toast{
        padding: 12px 12px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.25);
        background: rgba(2,6,23,0.88);
        color: rgba(248,250,252,0.96);
        font-weight: 800;
        box-shadow: 0 18px 44px rgba(2,6,23,0.18);
      }
      html[data-page="admin-rental"] .rent-toast--success{ background: rgba(22,163,74,0.95); }
      html[data-page="admin-rental"] .rent-toast--warn{ background: rgba(245,158,11,0.95); }
      html[data-page="admin-rental"] .rent-toast--error{ background: rgba(220,38,38,0.95); }

      @media (max-width: 980px) {
        html[data-page="admin-rental"] .rent-grid{ grid-template-columns: 1fr; }
        html[data-page="admin-rental"] .rent-list{ max-height: none; }
        html[data-page="admin-rental"] .rent-bookings__grid{ grid-template-columns: 1fr; }
        html[data-page="admin-rental"] .rent-fields--2,
        html[data-page="admin-rental"] .rent-fields--3,
        html[data-page="admin-rental"] .rent-fields--4{ grid-template-columns: 1fr; }
        html[data-page="admin-rental"] .rent-range__item{ min-width: 0; flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(st);
  }
});
