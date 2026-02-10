window.Webflow ||= [];
window.Webflow.push(async function () {
  "use strict";

  if (window.__mblRentalBookLoaded) return;
  window.__mblRentalBookLoaded = true;

  const ROOT_SELECTOR = "[data-rental-book]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#rental-book-root");
  if (!root) {
    console.error('[RENTAL BOOK] Root introuvable. Ajoute <div id="rental-book-root" data-rental-book></div> sur la page.');
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[RENTAL BOOK]", ...a);
  const warn = (...a) => DEBUG && console.warn("[RENTAL BOOK]", ...a);

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

    LISTING_PARAM: String(root.dataset.listingParam || "l").trim() || "l",
    LISTING_PUBLIC_ID: String(root.dataset.listingPublicId || url.searchParams.get(String(root.dataset.listingParam || "l")) || "").trim(),

    RPC_GET_LISTING: String(root.dataset.rpcGetListing || "get_public_rental_listing").trim() || "get_public_rental_listing",
    RPC_CREATE_BOOKING: String(root.dataset.rpcCreateBooking || "create_public_rental_booking").trim() || "create_public_rental_booking",
    RPC_GET_BOOKING: String(root.dataset.rpcGetBooking || "get_public_rental_booking").trim() || "get_public_rental_booking",

    RANGE_DAYS: Math.max(30, Number(root.dataset.rangeDays || 90) || 90),
    APP_ROOT,
    ADMIN_PATH: String(root.dataset.adminPath || `${APP_ROOT}/rental`).trim(),
  };

  const STR = {
    title: "Reservation",
    subtitle: "Choisissez vos dates, nous confirmons rapidement.",
    notFoundTitle: "Annonce introuvable",
    notFoundBody: "Le lien de reservation est invalide ou l'annonce n'est plus disponible.",
    datesLabel: "Dates",
    checkin: "Arrivee",
    checkout: "Depart",
    guests: "Voyageurs",
    name: "Nom",
    email: "Email",
    phone: "Telephone",
    note: "Message (optionnel)",
    book: "Demander la reservation",
    booking: "Envoi...",
    booked: "Certaines dates ne sont pas disponibles.",
    invalidDates: "Dates invalides.",
    minNights: "Duree minimale non respectee.",
    maxNights: "Duree maximale depassee.",
    maxGuests: "Nombre de voyageurs depasse.",
    required: "Merci de renseigner les champs obligatoires.",
    successTitle: "Demande envoyee",
    successBody: "Votre demande a ete enregistree. Vous recevrez une confirmation par email.",
    statusPending: "Statut: en attente",
    summary: "Recapitulatif",
    nights: "nuits",
    perNight: "/nuit",
    cleaning: "Frais menage",
    vat: "TVA",
    total: "Total",
    deposit: "Caution (non debitee)",
    back: "Retour",
    openAdmin: "Ouvrir l'admin",
    availability: "Indisponibilites",
  };

  const state = {
    supabase: null,
    listing: null,
    booked: [],
    rangeFrom: "",
    rangeTo: "",
    checkIn: "",
    checkOut: "",
    guests: 1,
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    note: "",
    submitting: false,
    booking: null,
  };

  injectStyles();
  const ui = renderShell();

  try {
    state.supabase = await resolveSupabaseClient(CONFIG);
  } catch (e) {
    ui.root.innerHTML = renderErrorCard("Supabase non charge.", "Verifie que supabase-js est charge.");
    return;
  }

  const listingPublicId = CONFIG.LISTING_PUBLIC_ID || String(url.searchParams.get(CONFIG.LISTING_PARAM) || "").trim();
  if (!listingPublicId) {
    ui.root.innerHTML = renderErrorCard(STR.notFoundTitle, STR.notFoundBody);
    return;
  }

  const now = new Date();
  state.rangeFrom = toISODate(now);
  state.rangeTo = toISODate(addDays(now, CONFIG.RANGE_DAYS));

  await loadListing(listingPublicId);

  async function loadListing(publicId) {
    setLoading(true);
    const res = await state.supabase.rpc(CONFIG.RPC_GET_LISTING, {
      p_public_id: publicId,
      p_from: state.rangeFrom,
      p_to: state.rangeTo,
    });
    setLoading(false);

    if (res.error) {
      warn("rpc get listing error", res.error);
      ui.root.innerHTML = renderErrorCard(STR.notFoundTitle, STR.notFoundBody);
      return;
    }

    if (!res.data) {
      ui.root.innerHTML = renderErrorCard(STR.notFoundTitle, STR.notFoundBody);
      return;
    }

    state.listing = res.data;
    state.booked = Array.isArray(res.data.booked) ? res.data.booked : [];
    initDefaults();
    render();
  }

  function initDefaults() {
    const l = state.listing;
    if (!l) return;

    state.guests = clampInt(1, Number(l.max_guests || 2), 1);

    // default: next weekend-like (tomorrow + 2 nights)
    const start = addDays(new Date(), 1);
    const end = addDays(start, Math.max(1, Number(l.min_nights || 1)));
    state.checkIn = toISODate(start);
    state.checkOut = toISODate(end);
  }

  function render() {
    const l = state.listing;
    if (!l) return;

    const currency = String(l.currency || "EUR").trim() || "EUR";
    const cover = String(l.cover_image_url || "").trim();
    const gallery = Array.isArray(l.gallery_urls) ? l.gallery_urls.filter(Boolean) : [];
    const images = [cover, ...gallery].filter(Boolean).slice(0, 8);

    ui.root.innerHTML = `
      <div class="rb-shell">
        <div class="rb-head">
          <div>
            <div class="rb-eyebrow">${escapeHtml(STR.subtitle)}</div>
            <h1 class="rb-h1">${escapeHtml(l.title || STR.title)}</h1>
            <div class="rb-meta">
              ${escapeHtml([l.city, l.country].filter(Boolean).join(", "))}
              ${l.max_guests ? `<span class="rb-dot"></span>${escapeHtml(String(l.max_guests))} pers.` : ""}
              ${l.bedrooms ? `<span class="rb-dot"></span>${escapeHtml(String(l.bedrooms))} ch.` : ""}
            </div>
          </div>
          <div class="rb-price">
            <div class="rb-price__val">${escapeHtml(centsToMoney(l.nightly_price_cents, currency))}</div>
            <div class="rb-price__unit">${escapeHtml(STR.perNight)}</div>
          </div>
        </div>

        <div class="rb-grid">
          <section class="rb-panel rb-panel--listing">
            <div class="rb-media">
              ${
                images.length
                  ? images
                      .map((src, idx) => {
                        const cls = idx === 0 ? "rb-media__hero" : "rb-media__thumb";
                        return `<button class="${cls}" type="button" data-action="open-image" data-src="${escapeAttr(src)}" aria-label="image">
                          <img src="${escapeAttr(src)}" alt="" loading="lazy" />
                        </button>`;
                      })
                      .join("")
                  : `<div class="rb-media__empty">Aucune photo</div>`
              }
            </div>

            ${l.summary ? `<div class="rb-summary">${escapeHtml(l.summary)}</div>` : ""}
            ${l.description ? `<div class="rb-desc">${escapeHtml(l.description)}</div>` : ""}

            <div class="rb-info">
              <div class="rb-info__row">
                <div class="rb-info__label">Check-in / Check-out</div>
                <div class="rb-info__val">${escapeHtml(l.checkin_time || "16:00")} / ${escapeHtml(l.checkout_time || "11:00")}</div>
              </div>
              <div class="rb-info__row">
                <div class="rb-info__label">Duree</div>
                <div class="rb-info__val">min ${escapeHtml(String(l.min_nights || 1))} nuit(s)${l.max_nights ? `, max ${escapeHtml(String(l.max_nights))}` : ""}</div>
              </div>
              ${
                Number(l.security_deposit_cents || 0) > 0
                  ? `<div class="rb-info__row">
                      <div class="rb-info__label">${escapeHtml(STR.deposit)}</div>
                      <div class="rb-info__val">${escapeHtml(centsToMoney(l.security_deposit_cents, currency))}</div>
                    </div>`
                  : ""
              }
            </div>

            ${renderAvailability()}
          </section>

          <aside class="rb-panel rb-panel--book">
            <div class="rb-card">
              <div class="rb-card__title">${escapeHtml(STR.summary)}</div>
              <div class="rb-form">
                <div class="rb-row rb-row--2">
                  ${fieldDate(STR.checkin, "checkIn", state.checkIn, state.rangeFrom)}
                  ${fieldDate(STR.checkout, "checkOut", state.checkOut, state.rangeFrom)}
                </div>
                <div class="rb-row">
                  ${fieldSelectGuests(STR.guests, "guests", state.guests, Number(l.max_guests || 2))}
                </div>
                <div class="rb-row rb-row--2">
                  ${fieldText(STR.name, "guestName", state.guestName, "Nom", true)}
                  ${fieldText(STR.email, "guestEmail", state.guestEmail, "email@domaine.com", true, "email")}
                </div>
                <div class="rb-row">
                  ${fieldText(STR.phone, "guestPhone", state.guestPhone, "+33...", false)}
                </div>
                <div class="rb-row">
                  ${fieldTextarea(STR.note, "note", state.note, 3, "")}
                </div>

                <div class="rb-breakdown" data-breakdown>
                  ${renderBreakdown()}
                </div>

                <button class="rb-btn rb-btn--primary" type="button" data-action="submit" ${state.submitting ? "disabled" : ""}>
                  ${escapeHtml(state.submitting ? STR.booking : STR.book)}
                </button>
              </div>
            </div>
          </aside>
        </div>

        <div class="rb-toasts" data-toasts></div>
        <div class="rb-lightbox" data-lightbox hidden>
          <div class="rb-lightbox__backdrop" data-action="close-lightbox"></div>
          <div class="rb-lightbox__panel">
            <button class="rb-lightbox__close" type="button" data-action="close-lightbox">Fermer</button>
            <img class="rb-lightbox__img" data-lightbox-img alt="" />
          </div>
        </div>
      </div>
    `;

    bind();
  }

  function renderAvailability() {
    if (!state.booked.length) return "";
    const rows = state.booked
      .slice(0, 8)
      .map((r) => `${escapeHtml(toFRDate(r.check_in))} → ${escapeHtml(toFRDate(r.check_out))}`)
      .join("<br/>");

    return `
      <div class="rb-availability">
        <div class="rb-availability__title">${escapeHtml(STR.availability)}</div>
        <div class="rb-availability__body">${rows}${state.booked.length > 8 ? "<br/>..." : ""}</div>
      </div>
    `;
  }

  function renderBreakdown() {
    const l = state.listing;
    if (!l) return "";
    const currency = String(l.currency || "EUR").trim() || "EUR";

    const calc = computeTotals();
    if (!calc.ok) {
      return `<div class="rb-breakdown__warn">${escapeHtml(calc.reason || STR.invalidDates)}</div>`;
    }

    const vatRate = Number(l.vat_rate || 0);
    const vat = vatRate > 0 ? Math.round((calc.subtotal + calc.cleaning) * (vatRate / 100)) : 0;
    const total = calc.subtotal + calc.cleaning + vat;

    return `
      <div class="rb-breakdown__row">
        <div>${escapeHtml(String(calc.nights))} ${escapeHtml(STR.nights)}</div>
        <div>${escapeHtml(centsToMoney(calc.subtotal, currency))}</div>
      </div>
      <div class="rb-breakdown__row">
        <div>${escapeHtml(STR.cleaning)}</div>
        <div>${escapeHtml(centsToMoney(calc.cleaning, currency))}</div>
      </div>
      <div class="rb-breakdown__row">
        <div>${escapeHtml(STR.vat)} ${vatRate ? `(${escapeHtml(String(vatRate))}%)` : ""}</div>
        <div>${escapeHtml(centsToMoney(vat, currency))}</div>
      </div>
      <div class="rb-breakdown__total">
        <div>${escapeHtml(STR.total)}</div>
        <div>${escapeHtml(centsToMoney(total, currency))}</div>
      </div>
    `;
  }

  function bind() {
    const shell = ui.root.querySelector(".rb-shell");
    if (!shell) return;

    shell.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "submit") {
        await submit();
        return;
      }

      if (action === "open-image") {
        openLightbox(btn.dataset.src);
        return;
      }

      if (action === "close-lightbox") {
        closeLightbox();
        return;
      }
    });

    shell.addEventListener("input", () => {
      // update breakdown live
      const breakdown = shell.querySelector("[data-breakdown]");
      if (breakdown) breakdown.innerHTML = renderBreakdown();
    });

    shell.addEventListener("change", (e) => {
      const field = e.target?.dataset?.field;
      if (!field) return;

      if (field === "checkIn") state.checkIn = e.target.value || "";
      if (field === "checkOut") state.checkOut = e.target.value || "";
      if (field === "guests") state.guests = Number(e.target.value || 1);
      if (field === "guestName") state.guestName = e.target.value || "";
      if (field === "guestEmail") state.guestEmail = e.target.value || "";
      if (field === "guestPhone") state.guestPhone = e.target.value || "";
      if (field === "note") state.note = e.target.value || "";

      // refresh breakdown on discrete changes (select/date)
      const breakdown = shell.querySelector("[data-breakdown]");
      if (breakdown) breakdown.innerHTML = renderBreakdown();
    });
  }

  async function submit() {
    if (state.submitting) return;
    const l = state.listing;
    if (!l) return;

    syncFormStateFromDom();

    const calc = computeTotals();
    if (!calc.ok) {
      showToast("warn", calc.reason || STR.invalidDates);
      return;
    }

    if (!String(state.guestName || "").trim() || !String(state.guestEmail || "").trim()) {
      showToast("warn", STR.required);
      return;
    }

    state.submitting = true;
    render(); // refresh button state

    try {
      const res = await state.supabase.rpc(CONFIG.RPC_CREATE_BOOKING, {
        p_listing_public_id: l.public_id,
        p_check_in: state.checkIn,
        p_check_out: state.checkOut,
        p_guest_name: state.guestName,
        p_guest_email: state.guestEmail,
        p_guest_phone: state.guestPhone,
        p_guests: Number(state.guests || 1),
        p_note: state.note,
      });

      if (res.error) {
        const msg = mapBookingError(res.error);
        showToast("error", msg);
        state.submitting = false;
        render();
        return;
      }

      state.booking = res.data || null;
      state.submitting = false;
      renderSuccess();
    } catch (e) {
      warn("submit booking error", e);
      state.submitting = false;
      render();
      showToast("error", "Impossible d'envoyer la demande.");
    }
  }

  function syncFormStateFromDom() {
    const shell = ui.root.querySelector(".rb-shell");
    if (!shell) return;

    const getVal = (field) => shell.querySelector(`[data-field="${field}"]`)?.value;
    const checkIn = String(getVal("checkIn") || "").trim();
    const checkOut = String(getVal("checkOut") || "").trim();
    const guests = Number(getVal("guests") || state.guests || 1);
    const guestName = String(getVal("guestName") || "");
    const guestEmail = String(getVal("guestEmail") || "");
    const guestPhone = String(getVal("guestPhone") || "");
    const note = String(getVal("note") || "");

    if (checkIn) state.checkIn = checkIn;
    if (checkOut) state.checkOut = checkOut;
    if (Number.isFinite(guests)) state.guests = guests;
    state.guestName = guestName;
    state.guestEmail = guestEmail;
    state.guestPhone = guestPhone;
    state.note = note;
  }

  function renderSuccess() {
    const l = state.listing;
    const b = state.booking;
    if (!l || !b) return render();

    const currency = String(b.currency || l.currency || "EUR").trim() || "EUR";
    ui.root.innerHTML = `
      <div class="rb-shell">
        <div class="rb-success">
          <div class="rb-success__badge">OK</div>
          <h1 class="rb-h1">${escapeHtml(STR.successTitle)}</h1>
          <div class="rb-success__body">${escapeHtml(STR.successBody)}</div>
          <div class="rb-success__meta">
            <div>${escapeHtml(STR.statusPending)}</div>
            <div>Reference: <span class="rb-mono">${escapeHtml(String(b.booking_public_id || ""))}</span></div>
          </div>
          <div class="rb-success__box">
            <div class="rb-breakdown__row">
              <div>${escapeHtml(String(b.nights || ""))} ${escapeHtml(STR.nights)}</div>
              <div>${escapeHtml(centsToMoney(b.subtotal_cents || 0, currency))}</div>
            </div>
            <div class="rb-breakdown__row">
              <div>${escapeHtml(STR.cleaning)}</div>
              <div>${escapeHtml(centsToMoney(b.cleaning_fee_cents || 0, currency))}</div>
            </div>
            <div class="rb-breakdown__total">
              <div>${escapeHtml(STR.total)}</div>
              <div>${escapeHtml(centsToMoney(b.total_cents || 0, currency))}</div>
            </div>
          </div>
          <div class="rb-success__actions">
            <button class="rb-btn rb-btn--ghost" type="button" data-action="back">${escapeHtml(STR.back)}</button>
            <a class="rb-btn rb-btn--ghost" href="${escapeAttr(CONFIG.ADMIN_PATH)}">${escapeHtml(STR.openAdmin)}</a>
          </div>
        </div>
      </div>
    `;

    const backBtn = ui.root.querySelector("[data-action='back']");
    if (backBtn) backBtn.addEventListener("click", () => render());
  }

  function computeTotals() {
    const l = state.listing;
    if (!l) return { ok: false, reason: STR.invalidDates };

    const ci = String(state.checkIn || "").trim();
    const co = String(state.checkOut || "").trim();
    if (!ci || !co || co <= ci) return { ok: false, reason: STR.invalidDates };

    const nights = Math.max(1, diffNights(ci, co));
    if (nights < Number(l.min_nights || 1)) return { ok: false, reason: STR.minNights };
    if (l.max_nights && nights > Number(l.max_nights)) return { ok: false, reason: STR.maxNights };

    const guests = Number(state.guests || 1);
    if (guests > Number(l.max_guests || 99)) return { ok: false, reason: STR.maxGuests };

    if (hasOverlap(ci, co, state.booked)) return { ok: false, reason: STR.booked };

    const nightly = Number(l.nightly_price_cents || 0);
    const cleaning = Number(l.cleaning_fee_cents || 0);
    const subtotal = nights * nightly;
    return { ok: true, nights, subtotal, cleaning };
  }

  function hasOverlap(ci, co, booked) {
    const start = String(ci);
    const end = String(co);
    return (booked || []).some((r) => {
      const a = String(r.check_in || "");
      const b = String(r.check_out || "");
      if (!a || !b) return false;
      return start < b && end > a;
    });
  }

  function mapBookingError(error) {
    const msg = String(error?.message || "").trim();
    // our RPC raises string exceptions; PostgREST wraps them.
    if (msg.includes("dates_unavailable")) return STR.booked;
    if (msg.includes("min_nights")) return STR.minNights;
    if (msg.includes("max_nights")) return STR.maxNights;
    if (msg.includes("max_guests")) return STR.maxGuests;
    if (msg.includes("guest_name_required") || msg.includes("guest_email_required")) return STR.required;
    if (msg.includes("invalid_dates")) return STR.invalidDates;
    return msg || "Erreur";
  }

  function setLoading(on) {
    ui.loading.hidden = !on;
  }

  function openLightbox(src) {
    const lb = ui.root.querySelector("[data-lightbox]");
    const img = ui.root.querySelector("[data-lightbox-img]");
    if (!lb || !img) return;
    img.src = src || "";
    lb.hidden = false;
    document.body.classList.add("rb-noscroll");
  }

  function closeLightbox() {
    const lb = ui.root.querySelector("[data-lightbox]");
    const img = ui.root.querySelector("[data-lightbox-img]");
    if (img) img.src = "";
    if (lb) lb.hidden = true;
    document.body.classList.remove("rb-noscroll");
  }

  function showToast(type, msg) {
    const box = ui.root.querySelector("[data-toasts]");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `rb-toast rb-toast--${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function renderShell() {
    root.innerHTML = `
      <div class="rb-shell">
        <div class="rb-loading" data-loading>
          <div class="rb-loading__spinner"></div>
          <div class="rb-loading__text">Chargement...</div>
        </div>
        <div class="rb-root" data-root></div>
      </div>
    `;
    const loading = root.querySelector("[data-loading]");
    const rootEl = root.querySelector("[data-root]");
    return { loading, root: rootEl };
  }

  function renderErrorCard(title, body) {
    return `
      <div class="rb-shell">
        <div class="rb-error">
          <div class="rb-error__title">${escapeHtml(title)}</div>
          <div class="rb-error__body">${escapeHtml(body)}</div>
        </div>
      </div>
    `;
  }

  function fieldDate(label, field, value, min) {
    return `
      <label class="rb-field">
        <div class="rb-label">${escapeHtml(label)}</div>
        <input class="rb-input" type="date" data-field="${escapeAttr(field)}" value="${escapeAttr(value || "")}" min="${escapeAttr(min || "")}" />
      </label>
    `;
  }

  function fieldSelectGuests(label, field, value, max) {
    const m = Math.max(1, Number(max || 1));
    const v = clampInt(1, m, Number(value || 1));
    const opts = Array.from({ length: m }).map((_, i) => {
      const n = i + 1;
      return `<option value="${n}" ${n === v ? "selected" : ""}>${n}</option>`;
    });
    return `
      <label class="rb-field">
        <div class="rb-label">${escapeHtml(label)}</div>
        <select class="rb-input" data-field="${escapeAttr(field)}">${opts.join("")}</select>
      </label>
    `;
  }

  function fieldText(label, field, value, placeholder, required, type) {
    const t = type || "text";
    return `
      <label class="rb-field">
        <div class="rb-label">${escapeHtml(label)}${required ? " *" : ""}</div>
        <input class="rb-input" type="${escapeAttr(t)}" data-field="${escapeAttr(field)}" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(
      placeholder || ""
    )}" ${required ? "required" : ""} />
      </label>
    `;
  }

  function fieldTextarea(label, field, value, rows, placeholder) {
    return `
      <label class="rb-field">
        <div class="rb-label">${escapeHtml(label)}</div>
        <textarea class="rb-input rb-textarea" data-field="${escapeAttr(field)}" rows="${Number(rows || 3)}" placeholder="${escapeAttr(placeholder || "")}">${escapeHtml(
      value || ""
    )}</textarea>
      </label>
    `;
  }

  function centsToMoney(cents, currency) {
    const c = toInt(cents);
    const cur = String(currency || "EUR").trim() || "EUR";
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format((c || 0) / 100);
    } catch (_) {
      return `${((c || 0) / 100).toFixed(2)} ${cur}`;
    }
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

  function diffNights(from, to) {
    const a = new Date(String(from) + "T00:00:00");
    const b = new Date(String(to) + "T00:00:00");
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  function toFRDate(iso) {
    if (!iso) return "";
    const d = new Date(String(iso) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }

  function clampInt(min, max, v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function toInt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
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
    if (document.getElementById("mbl-rental-book-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-rental-book-style";
    st.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Space+Grotesk:wght@600;700&display=swap');
      .rb-shell, .rb-shell * { box-sizing: border-box; }
      .rb-shell{
        --rb-primary: var(--mbl-primary, #0ea5e9);
        --rb-text: rgba(2,6,23,0.92);
        --rb-muted: rgba(2,6,23,0.62);
        --rb-line: rgba(148,163,184,0.30);
        --rb-card: rgba(255,255,255,0.92);
        font-family: "Manrope", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial;
        width: min(1200px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid rgba(15,23,42,0.10);
        background:
          radial-gradient(900px 560px at 10% 0%, rgba(14,165,233,0.16), transparent 58%),
          radial-gradient(920px 580px at 95% 10%, rgba(2,6,23,0.09), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.96));
        box-shadow: 0 22px 60px rgba(2,6,23,0.10);
        color: var(--rb-text);
      }
      .rb-eyebrow{
        font-size: 12px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: rgba(2,6,23,0.55);
      }
      .rb-h1{
        font-family: "Space Grotesk", "Manrope";
        font-size: 26px;
        font-weight: 800;
        margin: 6px 0 0;
        letter-spacing: -0.02em;
      }
      .rb-head{
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }
      .rb-meta{
        margin-top: 8px;
        display:flex;
        align-items:center;
        gap: 10px;
        flex-wrap: wrap;
        font-weight: 800;
        color: rgba(2,6,23,0.62);
        font-size: 13px;
      }
      .rb-dot{
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(148,163,184,0.95);
      }
      .rb-price{
        text-align: right;
        border: 1px solid rgba(148,163,184,0.26);
        background: rgba(255,255,255,0.70);
        border-radius: 16px;
        padding: 10px 12px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.06);
        min-width: 160px;
      }
      .rb-price__val{ font-weight: 900; font-size: 18px; }
      .rb-price__unit{ color: rgba(2,6,23,0.55); font-weight: 800; font-size: 12px; }

      .rb-grid{
        display:grid;
        grid-template-columns: 1.2fr .8fr;
        gap: 14px;
        align-items:start;
      }
      .rb-panel{
        border: 1px solid rgba(148,163,184,0.28);
        background: var(--rb-card);
        border-radius: 18px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.08);
        overflow:hidden;
      }
      .rb-panel--listing{ padding: 12px; }
      .rb-panel--book{ padding: 12px; }

      .rb-media{
        display:grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
      }
      .rb-media__hero{
        grid-column: span 3;
        border-radius: 16px;
        overflow:hidden;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.65);
        padding: 0;
        cursor: pointer;
      }
      .rb-media__thumb{
        border-radius: 16px;
        overflow:hidden;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.65);
        padding: 0;
        cursor: pointer;
      }
      .rb-media img{
        width:100%;
        height:100%;
        aspect-ratio: 16/10;
        object-fit: cover;
        display:block;
      }
      .rb-media__hero img{ aspect-ratio: 16/9; }
      .rb-media__empty{
        padding: 18px;
        border-radius: 16px;
        border: 1px dashed rgba(148,163,184,0.55);
        background: rgba(255,255,255,0.60);
        color: rgba(2,6,23,0.60);
        font-weight: 800;
      }

      .rb-summary{
        margin-top: 12px;
        font-weight: 900;
        color: rgba(2,6,23,0.78);
      }
      .rb-desc{
        margin-top: 10px;
        color: rgba(2,6,23,0.70);
        line-height: 1.65;
        white-space: pre-wrap;
      }
      .rb-info{
        margin-top: 12px;
        border-top: 1px solid rgba(148,163,184,0.22);
        padding-top: 12px;
        display:grid;
        gap: 10px;
      }
      .rb-info__row{
        display:flex;
        justify-content: space-between;
        gap: 12px;
        font-weight: 800;
        color: rgba(2,6,23,0.70);
      }
      .rb-info__label{ color: rgba(2,6,23,0.58); }

      .rb-availability{
        margin-top: 12px;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.70);
        padding: 12px;
      }
      .rb-availability__title{ font-weight: 900; margin-bottom: 8px; }
      .rb-availability__body{ color: rgba(2,6,23,0.66); font-weight: 800; line-height: 1.55; }

      .rb-card{
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.22);
        background: rgba(255,255,255,0.70);
        padding: 12px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.06);
      }
      .rb-card__title{
        font-family: "Space Grotesk", "Manrope";
        font-size: 16px;
        font-weight: 800;
      }
      .rb-form{ margin-top: 12px; display:grid; gap: 10px; }
      .rb-row{ display:grid; gap: 10px; }
      .rb-row--2{ grid-template-columns: 1fr 1fr; }
      .rb-field{ display:grid; gap: 6px; }
      .rb-label{ font-size: 12px; font-weight: 900; color: rgba(2,6,23,0.62); }
      .rb-input{
        width:100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,0.45);
        background: rgba(255,255,255,0.92);
        outline: none;
      }
      .rb-input:focus{
        border-color: rgba(14,165,233,0.65);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }
      .rb-textarea{ resize: vertical; }

      .rb-breakdown{
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.65);
        padding: 12px;
        display:grid;
        gap: 10px;
        margin-top: 2px;
      }
      .rb-breakdown__row{
        display:flex;
        justify-content: space-between;
        gap: 12px;
        color: rgba(2,6,23,0.70);
        font-weight: 900;
      }
      .rb-breakdown__total{
        display:flex;
        justify-content: space-between;
        gap: 12px;
        font-weight: 900;
        font-size: 16px;
        border-top: 1px solid rgba(148,163,184,0.22);
        padding-top: 10px;
      }
      .rb-breakdown__warn{
        color: rgba(124,45,18,0.95);
        font-weight: 900;
      }

      .rb-btn{
        appearance:none;
        border: 1px solid rgba(148,163,184,0.45);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        padding: 12px 12px;
        border-radius: 14px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
        text-decoration:none;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap: 8px;
      }
      .rb-btn:hover{
        transform: translateY(-1px);
        border-color: rgba(14,165,233,0.55);
        box-shadow: 0 12px 26px rgba(2,6,23,0.10);
      }
      .rb-btn:disabled{ opacity: .6; cursor:not-allowed; transform:none; box-shadow:none; }
      .rb-btn--primary{
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        border-color: rgba(14,165,233,0.65);
        color: white;
      }
      .rb-btn--ghost{
        background: rgba(255,255,255,0.70);
      }

      .rb-toasts{
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        display:grid;
        gap: 10px;
        max-width: min(360px, calc(100vw - 32px));
      }
      .rb-toast{
        padding: 12px 12px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.25);
        background: rgba(2,6,23,0.88);
        color: rgba(248,250,252,0.96);
        font-weight: 900;
        box-shadow: 0 18px 44px rgba(2,6,23,0.18);
      }
      .rb-toast--success{ background: rgba(22,163,74,0.95); }
      .rb-toast--warn{ background: rgba(245,158,11,0.95); }
      .rb-toast--error{ background: rgba(220,38,38,0.95); }

      .rb-loading{
        display:flex;
        align-items:center;
        gap: 10px;
        padding: 14px 12px;
        border-radius: 14px;
        border: 1px dashed rgba(148,163,184,0.55);
        background: rgba(255,255,255,0.55);
        margin-bottom: 14px;
      }
      .rb-loading__spinner{
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid rgba(14,165,233,0.25);
        border-top-color: rgba(14,165,233,0.95);
        animation: rbspin .9s linear infinite;
      }
      @keyframes rbspin { to { transform: rotate(360deg); } }
      .rb-loading__text{ color: rgba(2,6,23,0.62); font-weight: 800; }

      .rb-lightbox{
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display:flex;
        align-items:center;
        justify-content:center;
        padding: 18px;
      }
      .rb-lightbox__backdrop{ position:absolute; inset:0; background: rgba(2,6,23,0.72); }
      .rb-lightbox__panel{
        position: relative;
        width: min(920px, 92vw);
        max-height: 88vh;
        border-radius: 18px;
        overflow:hidden;
        border: 1px solid rgba(148,163,184,0.22);
        background: rgba(255,255,255,0.96);
        box-shadow: 0 24px 80px rgba(0,0,0,0.30);
      }
      .rb-lightbox__close{
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,0.35);
        background: rgba(255,255,255,0.82);
        padding: 10px 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .rb-lightbox__img{
        width: 100%;
        height: 88vh;
        object-fit: contain;
        background: rgba(2,6,23,0.96);
        display:block;
      }
      body.rb-noscroll{ overflow:hidden; }

      .rb-success{
        max-width: 720px;
        margin: 18px auto 0;
        text-align:center;
        border: 1px solid rgba(148,163,184,0.26);
        background: rgba(255,255,255,0.78);
        border-radius: 18px;
        padding: 18px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.10);
      }
      .rb-success__badge{
        width: 54px;
        height: 54px;
        border-radius: 18px;
        margin: 0 auto 10px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 900;
        background: rgba(22,163,74,0.14);
        color: rgba(20,83,45,0.95);
        border: 1px solid rgba(22,163,74,0.25);
      }
      .rb-success__body{
        margin-top: 8px;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
        line-height: 1.6;
      }
      .rb-success__meta{
        margin-top: 12px;
        color: rgba(2,6,23,0.70);
        font-weight: 900;
        display:grid;
        gap: 6px;
      }
      .rb-success__box{
        margin-top: 12px;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.24);
        background: rgba(255,255,255,0.65);
        padding: 12px;
        display:grid;
        gap: 10px;
        text-align:left;
      }
      .rb-success__actions{
        margin-top: 12px;
        display:flex;
        gap: 10px;
        justify-content:center;
        flex-wrap: wrap;
      }
      .rb-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 12px; }

      .rb-error{
        max-width: 720px;
        margin: 18px auto 0;
        border-radius: 18px;
        border: 1px solid rgba(239,68,68,0.28);
        background: rgba(255,255,255,0.78);
        padding: 18px;
        box-shadow: 0 14px 40px rgba(2,6,23,0.10);
      }
      .rb-error__title{ font-weight: 900; font-size: 16px; }
      .rb-error__body{ margin-top: 8px; color: rgba(2,6,23,0.62); font-weight: 800; line-height: 1.6; }

      @media (max-width: 980px){
        .rb-grid{ grid-template-columns: 1fr; }
        .rb-row--2{ grid-template-columns: 1fr; }
        .rb-head{ align-items:flex-start; flex-direction: column; }
        .rb-price{ text-align:left; width: fit-content; }
        .rb-media{ grid-template-columns: 1fr 1fr; }
        .rb-media__hero{ grid-column: span 2; }
      }
    `;
    document.head.appendChild(st);
  }
});
