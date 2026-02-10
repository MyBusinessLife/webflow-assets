document.documentElement.setAttribute("data-page", "admin-loyalty");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminLoyaltyLoaded) return;
  window.__mblAdminLoyaltyLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-loyalty]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-loyalty") || null;
  if (!root) {
    console.error('[LOYALTY] Root introuvable. Ajoute <div data-mbl-loyalty></div> sur la page.');
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[LOYALTY]", ...a);
  const warn = (...a) => DEBUG && console.warn("[LOYALTY]", ...a);

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

    PROGRAMS_TABLE: "loyalty_programs",
    MEMBERS_TABLE: "loyalty_members",
    EVENTS_TABLE: "loyalty_events",
    CLIENTS_TABLE: "clients",
  };

  const STR = {
    title: "Fidélité",
    subtitle: "Programme, clients membres et points (automatiques sur factures payées si activé).",

    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour accéder au module Fidélité.",
    loginCta: "Se connecter",

    forbiddenTitle: "Accès refusé",
    forbiddenBody: "Tu n'as pas l'autorisation d'accéder au module Fidélité.",

    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas la Fidélité.",
    moduleCta: "Gérer mon abonnement",

    programTitle: "Programme",
    programName: "Nom",
    programActive: "Actif",
    programAuto: "Points auto (facture payée)",
    programRate: "Points / euro TTC",
    programMin: "Minimum facture (TTC)",
    programRounding: "Arrondi",
    programTerms: "Conditions",
    roundingFloor: "Arrondi inférieur",
    roundingRound: "Arrondi classique",
    roundingCeil: "Arrondi supérieur",
    save: "Enregistrer",

    membersTitle: "Membres",
    searchPlaceholder: "Rechercher client (nom, email, tel...)",
    addMember: "Ajouter un membre",

    colClient: "Client",
    colPoints: "Points",
    colStatus: "Statut",
    colActions: "Actions",
    view: "Voir",

    modalMemberTitle: "Compte fidélité",
    adjustTitle: "Ajuster les points",
    adjustPlaceholder: "Note (optionnel)",
    adjustPoints: "Points (+/-)",
    add: "Ajouter",
    close: "Fermer",

    emptyTitle: "Aucun membre",
    emptyBody: "Les membres apparaîtront automatiquement lorsque des factures seront payées (si activé), ou via ajout manuel.",

    toastSaved: "Enregistré.",
    toastError: "Une erreur est survenue.",
  };

  const state = {
    supabase: null,
    ctx: null,
    program: null,
    members: [],
    clients: [],
    search: "",
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

  if (!state.ctx.modules?.billing || !state.ctx.modules?.loyalty) {
    renderGate({ title: STR.moduleMissingTitle, body: STR.moduleMissingBody, cta: STR.moduleCta, href: CONFIG.SUBSCRIBE_PATH });
    return;
  }

  if (!state.ctx.permOk) {
    renderGate({ title: STR.forbiddenTitle, body: STR.forbiddenBody, cta: STR.close, href: "" });
    return;
  }

  const els = renderShell();
  wireUI(els);

  await loadAll();
  render();

  async function loadAll() {
    await Promise.all([loadProgram(), loadMembers()]);
    if (state.ctx.isAdmin) await loadClients();
  }

  async function loadProgram() {
    const res = await state.supabase
      .from(CONFIG.PROGRAMS_TABLE)
      .select("id, name, is_active, apply_on_invoice_paid, points_per_euro, rounding, min_invoice_total_cents, terms, is_default, created_at")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (res.error) {
      if (isMissingRelationError(res.error)) {
        state.program = null;
        return;
      }
      throw res.error;
    }
    state.program = res.data || null;
  }

  async function loadMembers() {
    const res = await state.supabase
      .from(CONFIG.MEMBERS_TABLE)
      .select("id, client_id, status, points_balance, client:clients(name, email, phone)")
      .order("points_balance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000);
    if (res.error) {
      if (isMissingRelationError(res.error)) {
        state.members = [];
        return;
      }
      throw res.error;
    }
    state.members = Array.isArray(res.data) ? res.data : [];
  }

  async function loadClients() {
    const res = await state.supabase
      .from(CONFIG.CLIENTS_TABLE)
      .select("id, name, email, phone, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(4000);
    if (res.error) {
      if (isMissingRelationError(res.error)) {
        state.clients = [];
        return;
      }
      throw res.error;
    }
    state.clients = Array.isArray(res.data) ? res.data : [];
  }

  function wireUI(els) {
    els.search.addEventListener("input", () => {
      state.search = String(els.search.value || "").trim().toLowerCase();
      renderMembers(els);
    });

    els.program.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-save-program]");
      if (!btn) return;
      if (!state.ctx.isAdmin) return;
      try {
        btn.disabled = true;
        const payload = readProgramForm(els);
        await saveProgram(payload);
        await loadProgram();
        renderProgram(els);
        toast(STR.toastSaved, "ok");
      } catch (err) {
        warn(err);
        toast(STR.toastError, "error");
      } finally {
        btn.disabled = false;
      }
    });

    els.btnAddMember?.addEventListener("click", () => {
      if (!state.ctx.isAdmin) return;
      openAddMemberModal(els);
    });

    els.members.addEventListener("click", (e) => {
      const row = e.target.closest("[data-member-id]");
      if (!row) return;
      const id = String(row.dataset.memberId || "");
      openMemberModal(els, id);
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
    renderProgram(els);
    renderMembers(els);
  }

  function renderProgram(els) {
    const p = state.program;
    const disabled = !state.ctx.isAdmin;

    if (!p) {
      els.program.innerHTML = `
        <div class="loy-emptycard">
          <div class="loy-emptycard__title">Programme indisponible</div>
          <div class="loy-emptycard__body">Vérifie la migration SQL (041_loyalty_core.sql).</div>
        </div>
      `;
      return;
    }

    const roundOptions = [
      { v: "floor", l: STR.roundingFloor },
      { v: "round", l: STR.roundingRound },
      { v: "ceil", l: STR.roundingCeil },
    ]
      .map((o) => `<option value="${escapeHTML(o.v)}" ${clean(p.rounding) === o.v ? "selected" : ""}>${escapeHTML(o.l)}</option>`)
      .join("");

    els.program.innerHTML = `
      <div class="loy-card">
        <div class="loy-card__head">
          <div>
            <div class="loy-card__title">${escapeHTML(STR.programTitle)}</div>
            <div class="loy-card__sub">${escapeHTML(p.name || "")}</div>
          </div>
          ${state.ctx.isAdmin ? `<button type="button" class="loy-btn" data-save-program>${escapeHTML(STR.save)}</button>` : `<span class="loy-badge">Lecture seule</span>`}
        </div>

        <div class="loy-grid">
          ${fieldText("program-name", STR.programName, p.name, disabled)}
          ${fieldSwitch("program-active", STR.programActive, Boolean(p.is_active), disabled)}
          ${fieldSwitch("program-auto", STR.programAuto, Boolean(p.apply_on_invoice_paid), disabled)}
          ${fieldNumber("program-rate", STR.programRate, p.points_per_euro ?? 1, 0, 100, 0.1, disabled)}
          ${fieldMoney("program-min", STR.programMin, p.min_invoice_total_cents ?? 0, disabled)}
          <div class="loy-field">
            <label class="loy-label">${escapeHTML(STR.programRounding)}</label>
            <select class="loy-input" data-program-rounding ${disabled ? "disabled" : ""}>${roundOptions}</select>
          </div>
        </div>

        <div class="loy-field">
          <label class="loy-label">${escapeHTML(STR.programTerms)}</label>
          <textarea class="loy-input loy-input--area" data-program-terms rows="3" ${disabled ? "disabled" : ""}>${escapeHTML(p.terms || "")}</textarea>
        </div>
      </div>
    `;
  }

  function renderMembers(els) {
    const q = state.search;
    const rows = (state.members || [])
      .filter((m) => {
        if (!q) return true;
        const c = m.client || {};
        const hay = [c.name, c.email, c.phone, m.status].map((x) => String(x || "").toLowerCase()).join(" ");
        return hay.includes(q);
      })
      .slice(0, 4000);

    if (!rows.length) {
      els.members.innerHTML = `
        <div class="loy-empty">
          <div class="loy-empty__title">${escapeHTML(STR.emptyTitle)}</div>
          <div class="loy-empty__body">${escapeHTML(STR.emptyBody)}</div>
        </div>
      `;
      return;
    }

    els.members.innerHTML = `
      <div class="loy-table">
        <div class="loy-tr loy-tr--head">
          <div>${escapeHTML(STR.colClient)}</div>
          <div class="is-right">${escapeHTML(STR.colPoints)}</div>
          <div>${escapeHTML(STR.colStatus)}</div>
          <div class="is-right">${escapeHTML(STR.colActions)}</div>
        </div>
        ${rows
          .map((m) => {
            const c = m.client || {};
            return `
              <div class="loy-tr" data-member-id="${escapeHTML(m.id)}">
                <div class="loy-client">
                  <div class="loy-client__name">${escapeHTML(c.name || "—")}</div>
                  <div class="loy-client__meta">${escapeHTML([c.email, c.phone].filter(Boolean).join(" · "))}</div>
                </div>
                <div class="is-right"><span class="loy-points">${escapeHTML(fmtInt(m.points_balance || 0))}</span></div>
                <div>${escapeHTML(String(m.status || "active"))}</div>
                <div class="is-right"><button type="button" class="loy-btn loy-btn--ghost">${escapeHTML(STR.view)}</button></div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  async function saveProgram(payload) {
    if (!state.program?.id) throw new Error("program_missing");
    const data = {
      id: state.program.id,
      name: payload.name,
      is_active: payload.is_active,
      apply_on_invoice_paid: payload.apply_on_invoice_paid,
      points_per_euro: payload.points_per_euro,
      rounding: payload.rounding,
      min_invoice_total_cents: payload.min_invoice_total_cents,
      terms: payload.terms,
    };
    const res = await state.supabase.from(CONFIG.PROGRAMS_TABLE).update(data).eq("id", state.program.id);
    if (res.error) throw res.error;
  }

  function readProgramForm(els) {
    const name = String(els.program.querySelector("[data-program-name]")?.value || "").trim();
    const is_active = Boolean(els.program.querySelector("[data-program-active]")?.checked);
    const apply_on_invoice_paid = Boolean(els.program.querySelector("[data-program-auto]")?.checked);
    const points_per_euro = clampNum(els.program.querySelector("[data-program-rate]")?.value, 0, 100);
    const rounding = String(els.program.querySelector("[data-program-rounding]")?.value || "floor").trim();
    const minEur = Number(els.program.querySelector("[data-program-min]")?.value || 0);
    const min_invoice_total_cents = clampInt(Math.round((Number.isFinite(minEur) ? minEur : 0) * 100), 0, 999999999999);
    const terms = String(els.program.querySelector("[data-program-terms]")?.value || "").trim();
    return { name, is_active, apply_on_invoice_paid, points_per_euro, rounding, min_invoice_total_cents, terms };
  }

  function openAddMemberModal(els) {
    const options = state.clients
      .map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML([c.name, c.email ? `(${c.email})` : ""].filter(Boolean).join(" "))}</option>`)
      .join("");

    openModal(els, {
      title: STR.addMember,
      body: `
        <div class="loy-form">
          <div class="loy-field">
            <label class="loy-label">Client</label>
            <select class="loy-input" data-client>${options}</select>
          </div>
        </div>
      `,
      foot: `
        <div class="loy-foot">
          <button type="button" class="loy-btn loy-btn--ghost" data-close>${escapeHTML(STR.close)}</button>
          <button type="button" class="loy-btn" data-primary>${escapeHTML(STR.add)}</button>
        </div>
      `,
      onPrimary: async () => {
        const clientId = asUuid(els.modalBody.querySelector("[data-client]")?.value || "");
        if (!clientId) return;
        await ensureMember(clientId);
        await loadMembers();
        closeModal(els);
        renderMembers(els);
        toast(STR.toastSaved, "ok");
      },
    });
  }

  async function ensureMember(clientId) {
    const programId = state.program?.id;
    if (!programId) throw new Error("program_missing");
    const res = await state.supabase.from(CONFIG.MEMBERS_TABLE).upsert({ program_id: programId, client_id: clientId, status: "active" }).select("id").maybeSingle();
    if (res.error) throw res.error;
  }

  async function openMemberModal(els, memberId) {
    const safe = asUuid(memberId);
    if (!safe) return;
    const member = state.members.find((m) => m.id === safe);
    if (!member) return;

    const eventsRes = await state.supabase
      .from(CONFIG.EVENTS_TABLE)
      .select("id, source_type, source_id, points, amount_cents, note, created_at")
      .eq("member_id", safe)
      .order("created_at", { ascending: false })
      .limit(400);
    if (eventsRes.error) throw eventsRes.error;

    const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];

    openModal(els, {
      title: STR.modalMemberTitle,
      body: renderMemberModalBody(member, events),
      foot: `
        <div class="loy-foot">
          <button type="button" class="loy-btn loy-btn--ghost" data-close>${escapeHTML(STR.close)}</button>
          ${state.ctx.isAdmin ? `<button type="button" class="loy-btn" data-primary>${escapeHTML(STR.add)}</button>` : ""}
        </div>
      `,
      onPrimary: state.ctx.isAdmin
        ? async () => {
            const pts = clampInt(els.modalBody.querySelector("[data-adjust-points]")?.value, -1000000, 1000000);
            const note = String(els.modalBody.querySelector("[data-adjust-note]")?.value || "").trim();
            if (!pts) return;
            const res = await state.supabase.from(CONFIG.EVENTS_TABLE).insert({
              member_id: safe,
              source_type: "adjustment",
              points: pts,
              amount_cents: 0,
              note: note || "Ajustement manuel",
            });
            if (res.error) throw res.error;
            await loadMembers();
            closeModal(els);
            renderMembers(els);
            toast(STR.toastSaved, "ok");
          }
        : null,
    });
  }

  function renderMemberModalBody(member, events) {
    const c = member.client || {};
    const lines = events
      .map((e) => {
        const pts = Number(e.points || 0);
        const sign = pts > 0 ? "+" : "";
        return `
          <div class="loy-ev">
            <div class="loy-ev__left">
              <div class="loy-ev__title">${escapeHTML(String(e.source_type || "manual"))}</div>
              <div class="loy-ev__meta">${escapeHTML(fmtDateTime(e.created_at))}${e.note ? ` · ${escapeHTML(e.note)}` : ""}</div>
            </div>
            <div class="loy-ev__pts ${pts < 0 ? "is-neg" : "is-pos"}">${escapeHTML(sign + fmtInt(pts))}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="loy-member">
        <div class="loy-member__top">
          <div>
            <div class="loy-member__name">${escapeHTML(c.name || "—")}</div>
            <div class="loy-member__meta">${escapeHTML([c.email, c.phone].filter(Boolean).join(" · "))}</div>
          </div>
          <div class="loy-member__points">${escapeHTML(fmtInt(member.points_balance || 0))} pts</div>
        </div>

        ${state.ctx.isAdmin ? `
          <div class="loy-adjust">
            <div class="loy-adjust__title">${escapeHTML(STR.adjustTitle)}</div>
            <div class="loy-adjust__grid">
              <input class="loy-input" type="number" inputmode="numeric" step="1" data-adjust-points placeholder="${escapeHTML(STR.adjustPoints)}" />
              <input class="loy-input" type="text" data-adjust-note placeholder="${escapeHTML(STR.adjustPlaceholder)}" />
            </div>
          </div>
        ` : ""}

        <div class="loy-events">
          ${lines || `<div class="loy-muted">Aucun événement.</div>`}
        </div>
      </div>
    `;
  }

  function renderShell() {
    root.innerHTML = `
      <div class="loy-shell">
        <div class="loy-head">
          <div>
            <div class="loy-eyebrow">MBL · Fidélité</div>
            <div class="loy-title">${escapeHTML(STR.title)}</div>
            <div class="loy-sub">${escapeHTML(STR.subtitle)}</div>
          </div>
          <div class="loy-actions">
            ${state.ctx.isAdmin ? `<button type="button" class="loy-btn" data-add-member>${escapeHTML(STR.addMember)}</button>` : ""}
          </div>
        </div>

        <div class="loy-grid2">
          <div data-program></div>
          <div class="loy-card">
            <div class="loy-card__head">
              <div class="loy-card__title">${escapeHTML(STR.membersTitle)}</div>
              <input class="loy-search" type="search" placeholder="${escapeHTML(STR.searchPlaceholder)}" data-search />
            </div>
            <div data-members></div>
          </div>
        </div>
      </div>

      <div class="loy-modal" aria-hidden="true" data-modal>
        <div class="loy-modal__backdrop" data-modal-backdrop></div>
        <div class="loy-modal__card" role="dialog" aria-modal="true">
          <div class="loy-modal__head">
            <div class="loy-modal__title" data-modal-title></div>
            <button type="button" class="loy-btn loy-btn--ghost" data-close>×</button>
          </div>
          <div class="loy-modal__body" data-modal-body></div>
          <div class="loy-modal__foot" data-modal-foot></div>
        </div>
      </div>

      <div class="loy-toast" data-toast hidden></div>
    `;

    const els = {
      program: root.querySelector("[data-program]"),
      members: root.querySelector("[data-members]"),
      search: root.querySelector("[data-search]"),
      btnAddMember: root.querySelector("[data-add-member]"),
      btnSaveProgram: null,

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

  function openModal(els, { title, body, foot, onPrimary }) {
    els.modalTitle.textContent = title || "";
    els.modalBody.innerHTML = body || "";
    els.modalFoot.innerHTML = foot || "";
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");

    els.modalFoot.querySelector("[data-primary]")?.addEventListener("click", async () => {
      try {
        await (onPrimary ? onPrimary() : null);
      } catch (e) {
        warn(e);
        toast(STR.toastError, "error");
      }
    });
  }

  function closeModal(els) {
    els.modal?.classList.remove("is-open");
    els.modal?.setAttribute("aria-hidden", "true");
    if (els.modalTitle) els.modalTitle.textContent = "";
    if (els.modalBody) els.modalBody.innerHTML = "";
    if (els.modalFoot) els.modalFoot.innerHTML = "";
  }

  function renderGate({ title, body, cta, href }) {
    root.innerHTML = `
      <div class="loy-shell">
        <div class="loy-gate">
          <div class="loy-gate__title">${escapeHTML(title || "")}</div>
          <div class="loy-gate__body">${escapeHTML(body || "")}</div>
          ${href ? `<a class="loy-btn" href="${escapeHTML(href)}">${escapeHTML(cta || "OK")}</a>` : `<button type="button" class="loy-btn" onclick="history.back()">${escapeHTML(cta || "OK")}</button>`}
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
    els.toast.className = "loy-toast is-" + String(kind || "ok");
    els.toast.textContent = t;
    clearTimeout(state.__toastTimer);
    state.__toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  function fieldText(key, label, value, disabled) {
    return `
      <div class="loy-field">
        <label class="loy-label">${escapeHTML(label)}</label>
        <input class="loy-input" type="text" data-${escapeHTML(key)} value="${escapeHTML(value || "")}" ${disabled ? "disabled" : ""}/>
      </div>
    `;
  }

  function fieldSwitch(key, label, checked, disabled) {
    return `
      <div class="loy-field">
        <label class="loy-label">${escapeHTML(label)}</label>
        <label class="loy-switch">
          <input type="checkbox" data-${escapeHTML(key)} ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/>
          <span></span>
        </label>
      </div>
    `;
  }

  function fieldNumber(key, label, value, min, max, step, disabled) {
    return `
      <div class="loy-field">
        <label class="loy-label">${escapeHTML(label)}</label>
        <input class="loy-input" type="number" inputmode="decimal" data-${escapeHTML(key)} value="${escapeHTML(value ?? "")}" min="${escapeHTML(min)}" max="${escapeHTML(max)}" step="${escapeHTML(step)}" ${disabled ? "disabled" : ""}/>
      </div>
    `;
  }

  function fieldMoney(key, label, cents, disabled) {
    const v = Number(cents || 0) / 100;
    return `
      <div class="loy-field">
        <label class="loy-label">${escapeHTML(label)}</label>
        <input class="loy-input" type="number" inputmode="decimal" data-${escapeHTML(key)} value="${escapeHTML(v)}" min="0" step="0.01" ${disabled ? "disabled" : ""}/>
      </div>
    `;
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

  function fmtInt(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

    // inherit defaults (strict)
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

    const permOk = permissionAllow({ isAdmin, orgRole, permMode, permMap }, "loyalty");

    return { userId, orgId, orgRole, isAdmin, permOk, permMode, permMap, modules: mergedModules, subscriptionActive };
  }

  function injectStyles() {
    if (document.getElementById("loy-styles")) return;
    const st = document.createElement("style");
    st.id = "loy-styles";
    st.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap');

      .loy-shell, .loy-shell * { box-sizing: border-box; }
      .loy-shell {
        font-family: "Manrope", sans-serif;
        --loy-ink: #0f172a;
        --loy-soft: #55708c;
        --loy-border: #d6e1ed;
        --loy-card: rgba(255,255,255,0.86);
        --loy-shadow: 0 18px 44px rgba(12, 37, 66, 0.10);
        --loy-primary: var(--mbl-primary, #0ea5e9);
        color: var(--loy-ink);
        background:
          radial-gradient(900px 520px at 6% -10%, rgba(14, 165, 233, 0.18), transparent 62%),
          radial-gradient(820px 520px at 100% 0%, rgba(37, 99, 235, 0.12), transparent 65%),
          linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
        border: 1px solid var(--loy-border);
        border-radius: 18px;
        padding: 16px;
        box-shadow: var(--loy-shadow);
      }

      .loy-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--loy-soft); }
      .loy-title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 28px; margin-top: 2px; }
      .loy-sub { color: var(--loy-soft); margin-top: 2px; }

      .loy-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .loy-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      .loy-btn {
        appearance: none;
        border: 1px solid rgba(12, 74, 110, 0.18);
        background: linear-gradient(180deg, color-mix(in srgb, var(--loy-primary) 14%, #ffffff), #ffffff);
        color: #0b2240;
        font-weight: 800;
        border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
        transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease;
        box-shadow: 0 12px 20px rgba(12, 37, 66, 0.10);
      }
      .loy-btn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--loy-primary) 36%, #ffffff); }
      .loy-btn--ghost { background: rgba(255,255,255,0.82); box-shadow: none; }

      .loy-grid2 { display: grid; grid-template-columns: 1fr 1.2fr; gap: 12px; margin-top: 12px; }
      @media (max-width: 980px) { .loy-grid2 { grid-template-columns: 1fr; } }

      .loy-card { border: 1px solid rgba(12,37,66,0.12); background: var(--loy-card); border-radius: 18px; overflow: hidden; }
      .loy-card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(12,37,66,0.10); }
      .loy-card__title { font-weight: 900; }
      .loy-card__sub { color: var(--loy-soft); font-size: 13px; margin-top: 2px; }

      .loy-search { width: min(420px, 100%); border-radius: 14px; padding: 11px 12px; border: 1px solid rgba(12,37,66,0.14); background: rgba(255,255,255,0.84); outline: none; }
      .loy-search:focus { border-color: color-mix(in srgb, var(--loy-primary) 40%, #ffffff); box-shadow: 0 0 0 4px rgba(14,165,233,0.14); }

      .loy-grid { padding: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      @media (max-width: 820px) { .loy-grid { grid-template-columns: 1fr; } }

      .loy-field { display: grid; gap: 6px; }
      .loy-label { font-size: 12.5px; font-weight: 900; color: rgba(11,34,64,0.76); }
      .loy-input { width: 100%; border-radius: 12px; padding: 10px 11px; border: 1px solid rgba(12,37,66,0.14); background: rgba(255,255,255,0.90); outline: none; }
      .loy-input:focus { border-color: color-mix(in srgb, var(--loy-primary) 40%, #ffffff); box-shadow: 0 0 0 4px rgba(14,165,233,0.14); }
      .loy-input--area { resize: vertical; min-height: 86px; }

      .loy-switch { display: inline-flex; align-items: center; gap: 10px; user-select: none; }
      .loy-switch input { display:none; }
      .loy-switch span {
        width: 46px; height: 28px; border-radius: 999px; position: relative;
        background: rgba(51,65,85,0.18);
        border: 1px solid rgba(12,37,66,0.14);
        transition: background .18s ease;
      }
      .loy-switch span::after {
        content:""; position: absolute; top: 50%; left: 4px; transform: translateY(-50%);
        width: 22px; height: 22px; border-radius: 999px; background: white;
        box-shadow: 0 10px 20px rgba(12, 37, 66, 0.14);
        transition: left .18s ease;
      }
      .loy-switch input:checked + span { background: color-mix(in srgb, var(--loy-primary) 70%, #ffffff); }
      .loy-switch input:checked + span::after { left: 20px; }

      .loy-table { padding: 10px 12px 14px; }
      .loy-tr { display: grid; grid-template-columns: 1fr 120px 140px 110px; gap: 10px; align-items: center; padding: 10px 10px; border-radius: 14px; cursor: pointer; }
      .loy-tr:hover { background: rgba(255,255,255,0.72); }
      .loy-tr--head { cursor: default; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: rgba(11,34,64,0.58); }
      .loy-tr--head:hover { background: transparent; }
      .is-right { text-align: right; }
      .loy-client__name { font-weight: 900; }
      .loy-client__meta { font-size: 12px; color: var(--loy-soft); margin-top: 2px; }
      .loy-points { font-weight: 900; }

      .loy-empty { padding: 22px; text-align: center; border: 1px dashed rgba(12,37,66,0.18); border-radius: 16px; background: rgba(255,255,255,0.65); margin: 12px; }
      .loy-empty__title { font-weight: 900; }
      .loy-empty__body { color: var(--loy-soft); margin-top: 4px; }

      .loy-badge { display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px; font-weight: 900; font-size: 12px; border: 1px solid rgba(12,37,66,0.12); background: rgba(255,255,255,0.85); color: rgba(11,34,64,0.78); white-space: nowrap; }

      /* Member modal */
      .loy-modal { position: fixed; inset: 0; display: none; z-index: 2147483646; }
      .loy-modal.is-open { display: block; }
      .loy-modal__backdrop { position: absolute; inset: 0; background: rgba(10, 31, 53, 0.55); backdrop-filter: blur(2px); }
      .loy-modal__card {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: min(820px, calc(100% - 26px));
        max-height: calc(100% - 26px);
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.20);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(245,250,255,0.96));
        box-shadow: 0 24px 80px rgba(0,0,0,0.22);
      }
      .loy-modal__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(12,37,66,0.10); }
      .loy-modal__title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 18px; }
      .loy-modal__body { padding: 14px; }
      .loy-modal__foot { padding: 12px 14px; border-top: 1px solid rgba(12,37,66,0.10); }

      .loy-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }

      .loy-member__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid rgba(12,37,66,0.10); border-radius: 16px; background: rgba(255,255,255,0.78); }
      .loy-member__name { font-weight: 900; font-size: 16px; }
      .loy-member__meta { font-size: 12px; color: var(--loy-soft); margin-top: 2px; }
      .loy-member__points { font-weight: 900; font-size: 18px; }

      .loy-adjust { margin-top: 12px; border: 1px solid rgba(12,37,66,0.10); border-radius: 16px; background: rgba(255,255,255,0.78); padding: 12px; }
      .loy-adjust__title { font-weight: 900; }
      .loy-adjust__grid { display: grid; grid-template-columns: 140px 1fr; gap: 10px; margin-top: 10px; }
      @media (max-width: 680px) { .loy-adjust__grid { grid-template-columns: 1fr; } }

      .loy-events { margin-top: 12px; display: grid; gap: 10px; }
      .loy-ev { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid rgba(12,37,66,0.10); border-radius: 16px; background: rgba(255,255,255,0.82); }
      .loy-ev__title { font-weight: 900; text-transform: uppercase; letter-spacing: .06em; font-size: 11px; color: rgba(11,34,64,0.70); }
      .loy-ev__meta { font-size: 12px; color: var(--loy-soft); margin-top: 2px; }
      .loy-ev__pts { font-weight: 900; }
      .loy-ev__pts.is-pos { color: #166534; }
      .loy-ev__pts.is-neg { color: #991b1b; }
      .loy-muted { color: var(--loy-soft); text-align: center; padding: 10px; }

      .loy-toast {
        position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
        padding: 10px 12px; border-radius: 12px;
        border: 1px solid rgba(12,37,66,0.18);
        background: rgba(255,255,255,0.92);
        box-shadow: 0 18px 50px rgba(0,0,0,0.18);
        font-weight: 900;
        z-index: 2147483647;
      }
      .loy-toast.is-ok { border-color: rgba(22,101,52,0.22); background: rgba(220,252,231,0.96); color: #166534; }
      .loy-toast.is-error { border-color: rgba(153,27,27,0.22); background: rgba(254,226,226,0.96); color: #991b1b; }

      .loy-gate { padding: 22px; border-radius: 16px; border: 1px solid rgba(12,37,66,0.14); background: rgba(255,255,255,0.78); display: grid; gap: 10px; text-align: center; margin-top: 10px; }
      .loy-gate__title { font-weight: 900; font-size: 18px; }
      .loy-gate__body { color: var(--loy-soft); }
    `;
    document.head.appendChild(st);
  }
});
