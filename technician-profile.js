(() => {
  if (window.__techProfileLoaded) return;
  window.__techProfileLoaded = true;

  const CONFIG = {
    SUPABASE_URL: "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqcmpkaGRlY2hjZGx5Z3BnYW9lcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY3Nzc3MzM0LCJleHAiOjIwODMzNTMzMzR9.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",

    PROFILES_TABLE: "profiles",
    ASSIGNEES_TABLE: "intervention_assignees",
    ORGANIZATION_ID: (window.__MBL_CFG__?.ORGANIZATION_ID || window.__MBL_ORG_ID__ || ""),

    LIST_PAGE_PATH: "/extranet/technician/interventions",
    RUN_PAGE_PATH: "/extranet/technician/intervention-realisation",
    LOGIN_PAGE_PATH: "/extranet/login",

    MIN_PASSWORD_LEN: 8,
  };

  const STR = {
    title: "Mon profil technicien",
    subtitle: "Compte, securite et pilotage personnel",

    refresh: "Actualiser",
    saveProfile: "Enregistrer le profil",
    savePassword: "Mettre a jour le mot de passe",
    logout: "Se deconnecter",
    openList: "Voir ma liste",

    sectionIdentity: "Identite",
    sectionCompany: "Entreprise",
    sectionSecurity: "Securite",
    sectionActivity: "Activite recente",

    labelEmail: "Email (verrouille)",
    labelFirstName: "Prenom",
    labelLastName: "Nom",
    labelDisplayName: "Nom affiche",
    labelPhone: "Telephone",
    labelCompany: "Societe",
    labelSiret: "SIRET",
    labelNotes: "Notes profil",
    labelPassword: "Nouveau mot de passe",
    labelPasswordConfirm: "Confirmer le mot de passe",

    readOnlyEmailHint: "L'email n'est pas modifiable depuis cette page.",
    securityHint: "Choisis un mot de passe robuste (minimum 8 caracteres).",

    statTotal: "Interventions assignees",
    statProgress: "En cours",
    statDone: "Terminees",
    statToday: "Aujourd'hui",
    statCompletion: "Taux de completion",

    emptyActivity: "Aucune intervention recente a afficher.",
    currentMission: "Mission en cours",
    continueCTA: "Continuer",

    modeReady: "Profil a jour",
    modeDirty: "Modifications non enregistrees",

    loadingTitle: "Chargement du profil...",
    loadingBody: "Synchronisation du compte et des interventions en cours.",
    sessionExpiredTitle: "Session expiree",
    sessionExpiredBody: "Reconnecte-toi pour acceder a ton profil.",
    errorTitle: "Erreur",
    errorBody: "Impossible de recuperer les informations du profil.",

    toastReloaded: "Profil actualise.",
    toastSaved: "Profil enregistre.",
    toastPasswordSaved: "Mot de passe mis a jour.",
    toastPasswordMismatch: "Les mots de passe ne correspondent pas.",
    toastPasswordLength: "Le mot de passe est trop court.",
    toastInvalidPhone: "Telephone invalide.",
    toastInvalidSiret: "SIRET invalide (14 chiffres attendus).",
    toastSaveError: "Impossible d'enregistrer le profil.",
    toastPasswordError: "Impossible de mettre a jour le mot de passe.",
    toastSessionExpired: "Session expiree. Reconnexion requise.",
  };

  function findRoot() {
    return (
      document.querySelector("[data-technician-profile]") ||
      document.querySelector("#technician-profile-root") ||
      document.querySelector(".technician-profile") ||
      document.querySelector("[data-tech-profile]")
    );
  }

  function resolveSupabaseClient() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (window.__techSupabase) return window.__techSupabase;
    if (!window.supabase?.createClient) return null;

    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "mbl-extranet-auth",
      },
    });
    window.__techSupabase = client;
    return client;
  }

  const root = findRoot();
  if (!root) {
    console.error("[TECH PROFILE] Root introuvable.");
    return;
  }

  const supabase = resolveSupabaseClient();
  if (!supabase) {
    root.textContent = "Supabase non charge.";
    return;
  }

  applyConfigOverrides(root);
  injectStyles();
  const els = renderShell(root);

  const state = {
    loading: false,
    dirty: false,
    user: null,
    profile: null,
    organizationId: String(CONFIG.ORGANIZATION_ID || "").trim(),
    interventions: [],
    stats: {
      total: 0,
      inProgress: 0,
      done: 0,
      today: 0,
      completion: 0,
    },
  };

  init();

  async function init() {
    wireEvents();
    setLoading(true);
    showBanner("info", `${STR.loadingTitle} ${STR.loadingBody}`);
    await loadAll("initial");
    setLoading(false);
  }

  function wireEvents() {
    els.refresh.addEventListener("click", async () => {
      await loadAll("manual");
      showToast("success", STR.toastReloaded);
    });

    els.logout.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = CONFIG.LOGIN_PAGE_PATH;
    });

    els.profileForm.addEventListener("input", () => {
      setDirty(true);
      clearFormError();
    });

    els.passwordForm.addEventListener("input", () => {
      clearPasswordError();
    });

    els.profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveProfile();
    });

    els.passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await savePassword();
    });

    els.activity.addEventListener("click", (e) => {
      const continueEl = e.target.closest("[data-action='continue']");
      if (!continueEl) return;
      const id = continueEl.dataset.id || "";
      if (!id) return;
      window.location.href = `${CONFIG.RUN_PAGE_PATH}?id=${encodeURIComponent(id)}`;
    });
  }

  async function loadAll(mode) {
    setLoading(true);
    clearFormError();
    clearPasswordError();
    showBanner("", "");

    try {
      const user = await getCurrentUser();
      if (!user) {
        renderSessionExpired();
        showToast("error", STR.toastSessionExpired);
        return;
      }

      state.user = user;
      const [profile, assignments] = await Promise.all([fetchProfile(user.id), fetchAssignments(user.id)]);
      state.profile = profile || null;
      state.organizationId = resolveOrganizationId(profile || {}) || state.organizationId;
      state.interventions = normalizeAssignments(assignments);
      state.stats = computeStats(state.interventions);

      hydrateForms();
      renderStats();
      renderActivity();
      setDirty(false);
      setModeBadge();
      updateSyncLabel();

      if (mode === "manual") showBanner("", "");
    } catch (error) {
      console.error("[TECH PROFILE] loadAll error:", error);
      showBanner("error", `${STR.errorTitle}: ${error?.message || STR.errorBody}`);
      renderErrorFallback();
    } finally {
      setLoading(false);
    }
  }

  async function getCurrentUser() {
    const [{ data: sessionData }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userError) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function fetchProfile(userId) {
    const fullSelect =
      "id,organization_id,email,name,first_name,last_name,phone,role,user_type,company_name,siret,notes,is_active,created_at,updated_at";
    const fallbackSelect =
      "id,email,name,first_name,last_name,phone,role,user_type,company_name,siret,notes,is_active,created_at,updated_at";

    let response = await supabase.from(CONFIG.PROFILES_TABLE).select(fullSelect).eq("id", userId).maybeSingle();

    if (response.error && isOrganizationColumnMissing(response.error)) {
      response = await supabase.from(CONFIG.PROFILES_TABLE).select(fallbackSelect).eq("id", userId).maybeSingle();
    }

    if (response.error) {
      console.warn("[TECH PROFILE] profile warning:", response.error.message);
      return null;
    }

    return response.data || null;
  }

  async function fetchAssignments(userId) {
    const response = await supabase
      .from(CONFIG.ASSIGNEES_TABLE)
      .select(
        "id,user_id,intervention_id,created_at,interventions:intervention_id(id,organization_id,internal_ref,title,client_name,address,status,start_at,end_at,updated_at)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (response.error) {
      console.warn("[TECH PROFILE] assignments warning:", response.error.message);
      return [];
    }

    return response.data || [];
  }

  function normalizeAssignments(rows) {
    return rows
      .map((entry) => {
        const itv = entry?.interventions;
        if (!itv) return null;
        return {
          ...itv,
          assignment_id: entry.id,
          _status: canonicalStatus(itv.status),
          _startTs: toTimestamp(itv.start_at),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a._status === "in_progress" && b._status !== "in_progress") return -1;
        if (b._status === "in_progress" && a._status !== "in_progress") return 1;
        return (b._startTs || 0) - (a._startTs || 0);
      });
  }

  function computeStats(items) {
    const total = items.length;
    const inProgress = items.filter((itv) => itv._status === "in_progress").length;
    const done = items.filter((itv) => itv._status === "done").length;
    const today = items.filter((itv) => isToday(itv._startTs)).length;
    const completion = total ? Math.round((done / total) * 100) : 0;

    return { total, inProgress, done, today, completion };
  }

  function hydrateForms() {
    const p = state.profile || {};
    const userEmail = String(state.user?.email || "").trim();

    els.email.value = String(p.email || userEmail || "");
    els.firstName.value = String(p.first_name || "");
    els.lastName.value = String(p.last_name || "");
    els.displayName.value = String(p.name || buildNameFromParts(p.first_name, p.last_name));
    els.phone.value = formatPhoneReadable(String(p.phone || ""));
    els.company.value = String(p.company_name || "");
    els.siret.value = String(p.siret || "");
    els.notes.value = String(p.notes || "");

    els.role.textContent = String(p.role || state.user?.user_metadata?.role || "tech");
    els.userType.textContent = String(p.user_type || "technician");
    els.createdAt.textContent = p.created_at ? formatDateFR(p.created_at) : "—";
    els.updatedAt.textContent = p.updated_at ? formatDateFR(p.updated_at) : "—";
  }

  function renderStats() {
    const s = state.stats;
    els.kpis.innerHTML = `
      ${kpiCard(STR.statTotal, String(s.total), "is-indigo")}
      ${kpiCard(STR.statProgress, String(s.inProgress), "is-amber")}
      ${kpiCard(STR.statDone, String(s.done), "is-green")}
      ${kpiCard(STR.statToday, String(s.today), "is-cyan")}
      ${kpiCard(STR.statCompletion, `${s.completion}%`, toneByPercent(s.completion))}
    `;
  }

  function renderActivity() {
    const rows = state.interventions.slice(0, 8);
    if (!rows.length) {
      els.activity.innerHTML = `<div class="tp-empty-inline">${STR.emptyActivity}</div>`;
      return;
    }

    els.activity.innerHTML = rows
      .map((row) => {
        const isProgress = row._status === "in_progress";
        return `
          <article class="tp-activity-item">
            <div class="tp-activity-head">
              <div class="tp-activity-ref">${escapeHTML(row.internal_ref || "Sans reference")}</div>
              <span class="tp-status tp-status--${statusTone(row._status)}">${escapeHTML(statusLabel(row._status))}</span>
            </div>
            <div class="tp-activity-title">${escapeHTML((row.client_name || "Client") + " - " + (row.title || "Intervention"))}</div>
            <div class="tp-activity-meta">
              <span>${escapeHTML(formatDateFR(row.start_at) || "Date non definie")}</span>
              ${row.address ? `<span>${escapeHTML(shortText(row.address, 76))}</span>` : ""}
            </div>
            <div class="tp-activity-actions">
              ${
                isProgress
                  ? `<button class="tp-btn tp-btn--primary" data-action="continue" data-id="${escapeHTML(String(row.id))}">${STR.continueCTA}</button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function saveProfile() {
    if (!state.user?.id) return;

    const rawPhone = String(els.phone.value || "").trim();
    const phone = normalizePhone(rawPhone);
    if (rawPhone && !phone) {
      showFormError(STR.toastInvalidPhone);
      showToast("warning", STR.toastInvalidPhone);
      return;
    }

    const siretRaw = String(els.siret.value || "").trim();
    const siret = sanitizeSiret(siretRaw);
    if (siretRaw && !siret) {
      showFormError(STR.toastInvalidSiret);
      showToast("warning", STR.toastInvalidSiret);
      return;
    }

    const firstName = cleanText(els.firstName.value, 80);
    const lastName = cleanText(els.lastName.value, 80);
    let displayName = cleanText(els.displayName.value, 120);
    if (!displayName) displayName = buildNameFromParts(firstName, lastName);
    if (!displayName) displayName = cleanText((state.user.email || "").split("@")[0], 120);

    const payload = {
      id: state.user.id,
      email: String(state.profile?.email || state.user?.email || "").trim() || null,
      first_name: firstName || null,
      last_name: lastName || null,
      name: displayName || null,
      phone: phone || null,
      company_name: cleanText(els.company.value, 120) || null,
      siret: siret || null,
      notes: cleanText(els.notes.value, 1200) || null,
      updated_at: new Date().toISOString(),
    };

    const orgId = resolveOrganizationId(state.profile || {}) || state.organizationId || CONFIG.ORGANIZATION_ID;

    els.saveProfileBtn.disabled = true;
    const prevLabel = els.saveProfileBtn.textContent;
    els.saveProfileBtn.textContent = "Enregistrement...";

    try {
      const res = await upsertWithOrgFallback(CONFIG.PROFILES_TABLE, payload, { onConflict: "id" }, orgId);
      if (res.error) throw res.error;

      state.profile = {
        ...(state.profile || {}),
        ...payload,
        organization_id: orgId || state.profile?.organization_id || null,
      };

      hydrateForms();
      setDirty(false);
      setModeBadge();
      showToast("success", STR.toastSaved);
      showBanner("", "");
    } catch (error) {
      console.error("[TECH PROFILE] saveProfile error:", error);
      showFormError(`${STR.toastSaveError} ${error?.message || ""}`.trim());
      showToast("error", STR.toastSaveError);
    } finally {
      els.saveProfileBtn.disabled = false;
      els.saveProfileBtn.textContent = prevLabel || STR.saveProfile;
    }
  }

  async function savePassword() {
    const password = String(els.password.value || "");
    const confirm = String(els.passwordConfirm.value || "");

    if (password.length < CONFIG.MIN_PASSWORD_LEN) {
      showPasswordError(STR.toastPasswordLength);
      showToast("warning", STR.toastPasswordLength);
      return;
    }

    if (password !== confirm) {
      showPasswordError(STR.toastPasswordMismatch);
      showToast("warning", STR.toastPasswordMismatch);
      return;
    }

    els.savePasswordBtn.disabled = true;
    const prevLabel = els.savePasswordBtn.textContent;
    els.savePasswordBtn.textContent = "Mise a jour...";

    try {
      const response = await supabase.auth.updateUser({ password });
      if (response.error) throw response.error;

      els.password.value = "";
      els.passwordConfirm.value = "";
      clearPasswordError();
      showToast("success", STR.toastPasswordSaved);
    } catch (error) {
      console.error("[TECH PROFILE] savePassword error:", error);
      showPasswordError(`${STR.toastPasswordError} ${error?.message || ""}`.trim());
      showToast("error", STR.toastPasswordError);
    } finally {
      els.savePasswordBtn.disabled = false;
      els.savePasswordBtn.textContent = prevLabel || STR.savePassword;
    }
  }

  function setLoading(flag) {
    state.loading = flag;
    els.refresh.disabled = flag;
    els.saveProfileBtn.disabled = flag;
    els.savePasswordBtn.disabled = flag;
  }

  function setDirty(flag) {
    state.dirty = !!flag;
    setModeBadge();
  }

  function setModeBadge() {
    if (state.dirty) {
      els.mode.className = "tp-mode is-dirty";
      els.mode.textContent = STR.modeDirty;
      return;
    }
    els.mode.className = "tp-mode";
    els.mode.textContent = STR.modeReady;
  }

  function updateSyncLabel() {
    const now = new Date();
    els.sync.textContent = `Derniere sync: ${formatDateFR(now.toISOString())}`;
  }

  function renderSessionExpired() {
    showBanner("error", `${STR.sessionExpiredTitle} - ${STR.sessionExpiredBody}`);
    els.profileForm.querySelectorAll("input, textarea, button").forEach((el) => (el.disabled = true));
    els.passwordForm.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
  }

  function renderErrorFallback() {
    els.activity.innerHTML = `<div class="tp-empty-inline">${STR.errorBody}</div>`;
  }

  function showBanner(type, message) {
    els.banner.className = "tp-banner";
    if (!message) {
      els.banner.hidden = true;
      els.banner.textContent = "";
      return;
    }
    els.banner.hidden = false;
    els.banner.classList.add(`is-${type || "info"}`);
    els.banner.textContent = message;
  }

  function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `tp-toast tp-toast--${type || "info"}`;
    toast.textContent = message;
    els.toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function showFormError(message) {
    els.formError.hidden = !message;
    els.formError.textContent = message || "";
  }

  function clearFormError() {
    showFormError("");
  }

  function showPasswordError(message) {
    els.passwordError.hidden = !message;
    els.passwordError.textContent = message || "";
  }

  function clearPasswordError() {
    showPasswordError("");
  }

  function renderShell(rootEl) {
    rootEl.innerHTML = `
      <section class="tp-shell">
        <header class="tp-header">
          <div>
            <div class="tp-eyebrow">${STR.subtitle}</div>
            <h1 class="tp-h1">${STR.title}</h1>
            <div class="tp-sync" data-tp-sync>Derniere sync: --</div>
          </div>
          <div class="tp-header-right">
            <span class="tp-mode" data-tp-mode>${STR.modeReady}</span>
            <button class="tp-btn tp-btn--ghost" type="button" data-tp-refresh>${STR.refresh}</button>
            <a class="tp-btn tp-btn--ghost" href="${CONFIG.LIST_PAGE_PATH}">${STR.openList}</a>
            <button class="tp-btn tp-btn--danger" type="button" data-tp-logout>${STR.logout}</button>
          </div>
        </header>

        <div class="tp-banner" data-tp-banner hidden></div>

        <section class="tp-grid-top">
          <article class="tp-panel">
            <h3 class="tp-panel-title">${STR.sectionIdentity}</h3>
            <form class="tp-form" data-tp-form>
              <div class="tp-form-grid">
                <label class="tp-field">
                  <span>${STR.labelEmail}</span>
                  <input type="email" data-field="email" readonly />
                  <small>${STR.readOnlyEmailHint}</small>
                </label>

                <label class="tp-field">
                  <span>${STR.labelFirstName}</span>
                  <input type="text" data-field="firstName" maxlength="80" />
                </label>

                <label class="tp-field">
                  <span>${STR.labelLastName}</span>
                  <input type="text" data-field="lastName" maxlength="80" />
                </label>

                <label class="tp-field">
                  <span>${STR.labelDisplayName}</span>
                  <input type="text" data-field="displayName" maxlength="120" />
                </label>

                <label class="tp-field">
                  <span>${STR.labelPhone}</span>
                  <input type="tel" data-field="phone" maxlength="24" />
                </label>
              </div>

              <div class="tp-divider"></div>

              <h4 class="tp-subtitle">${STR.sectionCompany}</h4>
              <div class="tp-form-grid">
                <label class="tp-field">
                  <span>${STR.labelCompany}</span>
                  <input type="text" data-field="company" maxlength="120" />
                </label>

                <label class="tp-field">
                  <span>${STR.labelSiret}</span>
                  <input type="text" data-field="siret" maxlength="20" />
                </label>

                <label class="tp-field tp-field--full">
                  <span>${STR.labelNotes}</span>
                  <textarea data-field="notes" rows="4" maxlength="1200"></textarea>
                </label>
              </div>

              <div class="tp-meta-grid">
                <div><span class="tp-meta-label">Role</span><span class="tp-meta-value" data-tp-role>—</span></div>
                <div><span class="tp-meta-label">Type</span><span class="tp-meta-value" data-tp-user-type>—</span></div>
                <div><span class="tp-meta-label">Cree le</span><span class="tp-meta-value" data-tp-created>—</span></div>
                <div><span class="tp-meta-label">Maj le</span><span class="tp-meta-value" data-tp-updated>—</span></div>
              </div>

              <div class="tp-error" data-tp-form-error hidden></div>
              <div class="tp-actions">
                <button class="tp-btn tp-btn--primary" type="submit" data-tp-save-profile>${STR.saveProfile}</button>
              </div>
            </form>
          </article>

          <article class="tp-panel">
            <h3 class="tp-panel-title">${STR.sectionSecurity}</h3>
            <form class="tp-form" data-tp-password-form>
              <label class="tp-field">
                <span>${STR.labelPassword}</span>
                <input type="password" data-field="password" autocomplete="new-password" />
              </label>
              <label class="tp-field">
                <span>${STR.labelPasswordConfirm}</span>
                <input type="password" data-field="passwordConfirm" autocomplete="new-password" />
                <small>${STR.securityHint}</small>
              </label>
              <div class="tp-error" data-tp-password-error hidden></div>
              <div class="tp-actions">
                <button class="tp-btn tp-btn--primary" type="submit" data-tp-save-password>${STR.savePassword}</button>
              </div>
            </form>
          </article>
        </section>

        <section class="tp-panel">
          <h3 class="tp-panel-title">${STR.sectionActivity}</h3>
          <div class="tp-kpis" data-tp-kpis></div>
          <div class="tp-activity" data-tp-activity></div>
        </section>

        <div class="tp-toasts" data-tp-toasts></div>
      </section>
    `;

    return {
      refresh: rootEl.querySelector("[data-tp-refresh]"),
      logout: rootEl.querySelector("[data-tp-logout]"),
      mode: rootEl.querySelector("[data-tp-mode]"),
      sync: rootEl.querySelector("[data-tp-sync]"),
      banner: rootEl.querySelector("[data-tp-banner]"),

      profileForm: rootEl.querySelector("[data-tp-form]"),
      passwordForm: rootEl.querySelector("[data-tp-password-form]"),

      email: rootEl.querySelector("[data-field='email']"),
      firstName: rootEl.querySelector("[data-field='firstName']"),
      lastName: rootEl.querySelector("[data-field='lastName']"),
      displayName: rootEl.querySelector("[data-field='displayName']"),
      phone: rootEl.querySelector("[data-field='phone']"),
      company: rootEl.querySelector("[data-field='company']"),
      siret: rootEl.querySelector("[data-field='siret']"),
      notes: rootEl.querySelector("[data-field='notes']"),
      password: rootEl.querySelector("[data-field='password']"),
      passwordConfirm: rootEl.querySelector("[data-field='passwordConfirm']"),

      role: rootEl.querySelector("[data-tp-role]"),
      userType: rootEl.querySelector("[data-tp-user-type]"),
      createdAt: rootEl.querySelector("[data-tp-created]"),
      updatedAt: rootEl.querySelector("[data-tp-updated]"),

      formError: rootEl.querySelector("[data-tp-form-error]"),
      passwordError: rootEl.querySelector("[data-tp-password-error]"),
      saveProfileBtn: rootEl.querySelector("[data-tp-save-profile]"),
      savePasswordBtn: rootEl.querySelector("[data-tp-save-password]"),

      kpis: rootEl.querySelector("[data-tp-kpis]"),
      activity: rootEl.querySelector("[data-tp-activity]"),
      toasts: rootEl.querySelector("[data-tp-toasts]"),
    };
  }

  function kpiCard(label, value, tone) {
    return `
      <article class="tp-kpi ${tone || "is-neutral"}">
        <div class="tp-kpi-label">${escapeHTML(label)}</div>
        <div class="tp-kpi-value">${escapeHTML(value)}</div>
      </article>
    `;
  }

  function toneByPercent(value) {
    if (value >= 80) return "is-green";
    if (value >= 60) return "is-cyan";
    if (value >= 40) return "is-amber";
    return "is-red";
  }

  function statusLabel(status) {
    if (status === "planned") return "Planifiee";
    if (status === "pending") return "En attente";
    if (status === "in_progress") return "En cours";
    if (status === "confirmed") return "Confirmee";
    if (status === "done") return "Terminee";
    if (status === "canceled") return "Annulee";
    return "Statut inconnu";
  }

  function statusTone(status) {
    if (["planned", "pending"].includes(status)) return "pending";
    if (status === "in_progress") return "progress";
    if (status === "confirmed") return "confirmed";
    if (status === "done") return "done";
    if (status === "canceled") return "canceled";
    return "unknown";
  }

  function canonicalStatus(value) {
    const s = norm(String(value || "")).replace(/\s+/g, "_");
    if (s === "in_progress" || s === "inprogress" || s === "en_cours") return "in_progress";
    if (s === "done" || s === "completed" || s === "terminee") return "done";
    if (s === "planned" || s === "planifiee") return "planned";
    if (s === "pending" || s === "en_attente") return "pending";
    if (s === "confirmed" || s === "confirmee") return "confirmed";
    if (s === "canceled" || s === "cancelled" || s === "annulee") return "canceled";
    return s || "unknown";
  }

  function resolveOrganizationId(source) {
    if (!source) return "";
    return String(source.organization_id || source.organizationId || "").trim();
  }

  function attachOrganization(payload, organizationId) {
    const orgId = String(organizationId || "").trim();
    if (!orgId) return payload;

    if (Array.isArray(payload)) {
      return payload.map((row) => {
        const item = { ...(row || {}) };
        if (!item.organization_id) item.organization_id = orgId;
        return item;
      });
    }

    const item = { ...(payload || {}) };
    if (!item.organization_id) item.organization_id = orgId;
    return item;
  }

  function stripOrganization(payload) {
    if (Array.isArray(payload)) {
      return payload.map((row) => {
        const item = { ...(row || {}) };
        delete item.organization_id;
        return item;
      });
    }

    const item = { ...(payload || {}) };
    delete item.organization_id;
    return item;
  }

  async function upsertWithOrgFallback(table, payload, options, organizationId) {
    const orgPayload = attachOrganization(payload, organizationId);
    let res = await supabase.from(table).upsert(orgPayload, options || {});
    if (res.error && isOrganizationColumnMissing(res.error)) {
      res = await supabase.from(table).upsert(stripOrganization(payload), options || {});
    }
    return res;
  }

  function isOrganizationColumnMissing(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return (
      (code === "42703" || code === "PGRST204" || code === "PGRST205") &&
      message.includes("organization_id")
    );
  }

  function normalizePhone(phone) {
    const raw = String(phone || "").replace(/[^\d+]/g, "");
    if (!raw) return "";
    let p = raw;
    if (p.startsWith("00")) p = `+${p.slice(2)}`;
    if (/^0\d{9}$/.test(p)) p = `+33${p.slice(1)}`;
    if (/^\+?\d{8,15}$/.test(p)) return p;
    return "";
  }

  function formatPhoneReadable(phone) {
    const p = normalizePhone(phone);
    if (!p) return String(phone || "");
    if (p.startsWith("+33")) {
      const rest = p.slice(3);
      return `+33 ${rest.replace(/(\d)(?=(\d{2})+$)/g, "$1 ").trim()}`;
    }
    return p;
  }

  function sanitizeSiret(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length !== 14) return "";
    return digits;
  }

  function cleanText(value, maxLen) {
    const out = String(value || "").trim();
    if (!out) return "";
    return out.slice(0, maxLen);
  }

  function buildNameFromParts(firstName, lastName) {
    return [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();
  }

  function formatDateFR(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function toTimestamp(value) {
    if (!value) return 0;
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function isToday(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function shortText(value, maxLen) {
    const s = String(value || "").trim();
    if (!s) return "";
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}...`;
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applyConfigOverrides(rootEl) {
    const d = rootEl.dataset || {};
    const pick = (value) => String(value || "").trim();
    const pickRelation = (value) => normalizeRelationName(pick(value));

    if (d.profilesTable) CONFIG.PROFILES_TABLE = pickRelation(d.profilesTable);
    if (d.assigneesTable) CONFIG.ASSIGNEES_TABLE = pickRelation(d.assigneesTable);
    if (d.listPath) CONFIG.LIST_PAGE_PATH = pick(d.listPath);
    if (d.runPath) CONFIG.RUN_PAGE_PATH = pick(d.runPath);
    if (d.loginPath) CONFIG.LOGIN_PAGE_PATH = pick(d.loginPath);
    if (d.organizationId) CONFIG.ORGANIZATION_ID = pick(d.organizationId);
  }

  function normalizeRelationName(value) {
    let relation = String(value || "").trim();
    while (relation.toLowerCase().startsWith("public.")) {
      relation = relation.slice("public.".length).trim();
    }
    return relation;
  }

  function injectStyles() {
    if (document.getElementById("tp-profile-styles-v1")) return;

    const style = document.createElement("style");
    style.id = "tp-profile-styles-v1";
    style.textContent = `
      .tp-shell {
        font-family: "Sora", "Manrope", sans-serif;
        color: #10233f;
        background:
          radial-gradient(920px 430px at 6% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
          radial-gradient(860px 470px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
          linear-gradient(180deg, #f4f8fc, #edf4fb);
        border: 1px solid #d6e2ee;
        border-radius: 18px;
        padding: 16px;
      }

      .tp-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .tp-eyebrow {
        color: #55708c;
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .tp-h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.1;
        color: #123a61;
        font-weight: 800;
      }

      .tp-sync {
        margin-top: 7px;
        color: #5f7993;
        font-size: 12px;
      }

      .tp-header-right {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .tp-mode {
        border: 1px solid #86efac;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 800;
        color: #166534;
        background: #f0fdf4;
      }

      .tp-mode.is-dirty {
        border-color: #facc15;
        color: #92400e;
        background: #fffbeb;
      }

      .tp-banner {
        margin-bottom: 12px;
        border-radius: 12px;
        border: 1px solid #dbeafe;
        background: #eff6ff;
        color: #1e3a8a;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .tp-banner.is-error {
        border-color: #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tp-grid-top {
        display: grid;
        gap: 12px;
        grid-template-columns: 1.3fr 1fr;
        margin-bottom: 12px;
      }

      .tp-panel {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffffff, #f7fbff);
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        padding: 12px;
      }

      .tp-panel-title {
        margin: 0 0 10px;
        color: #13385f;
        font-size: 18px;
        font-weight: 800;
      }

      .tp-subtitle {
        margin: 2px 0 10px;
        color: #1f4a70;
        font-size: 13px;
        font-weight: 800;
      }

      .tp-form {
        display: grid;
        gap: 10px;
      }

      .tp-form-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tp-field {
        display: grid;
        gap: 5px;
      }

      .tp-field--full {
        grid-column: 1 / -1;
      }

      .tp-field > span {
        color: #55708c;
        font-size: 12px;
        font-weight: 700;
      }

      .tp-field > small {
        color: #6f87a0;
        font-size: 11px;
      }

      .tp-field input,
      .tp-field textarea {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        background: #fff;
        color: #10233f;
        outline: none;
        padding: 10px 11px;
      }

      .tp-field textarea {
        resize: vertical;
        min-height: 108px;
      }

      .tp-field input[readonly] {
        background: #f8fbff;
        border-style: dashed;
        color: #355679;
      }

      .tp-field input:focus,
      .tp-field textarea:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .tp-divider {
        border-top: 1px dashed #d6e2ee;
      }

      .tp-meta-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tp-meta-label {
        display: block;
        color: #5f7993;
        font-size: 11px;
        font-weight: 700;
        margin-bottom: 2px;
        text-transform: uppercase;
      }

      .tp-meta-value {
        color: #163d62;
        font-weight: 700;
        font-size: 13px;
      }

      .tp-error {
        border: 1px solid #fecaca;
        border-radius: 10px;
        background: #fff1f2;
        color: #b91c1c;
        font-size: 12px;
        font-weight: 700;
        padding: 8px 10px;
      }

      .tp-actions {
        display: flex;
        justify-content: flex-end;
      }

      .tp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        background: #fff;
        color: #123b60;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      .tp-btn--primary {
        border-color: #0ea5e9;
        background: linear-gradient(180deg, #0ea5e9, #0284c7);
        color: #fff;
      }

      .tp-btn--ghost {
        background: #f8fbff;
      }

      .tp-btn--danger {
        border-color: #fecaca;
        background: #fff1f2;
        color: #b91c1c;
      }

      .tp-btn:disabled {
        opacity: .55;
        cursor: default;
      }

      .tp-kpis {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        margin-bottom: 10px;
      }

      .tp-kpi {
        border: 1px solid #dbe7f4;
        border-radius: 10px;
        background: #fff;
        padding: 8px;
      }

      .tp-kpi-label {
        color: #5f7993;
        font-size: 11px;
        font-weight: 700;
      }

      .tp-kpi-value {
        margin-top: 4px;
        color: #123a61;
        font-size: 16px;
        font-weight: 800;
      }

      .tp-kpi.is-indigo { border-color: #bfdbfe; background: #eff6ff; }
      .tp-kpi.is-cyan { border-color: #a5f3fc; background: #ecfeff; }
      .tp-kpi.is-amber { border-color: #fde68a; background: #fffbeb; }
      .tp-kpi.is-green { border-color: #86efac; background: #f0fdf4; }
      .tp-kpi.is-red { border-color: #fecaca; background: #fff1f2; }

      .tp-activity {
        display: grid;
        gap: 8px;
      }

      .tp-activity-item {
        border: 1px solid #dbe7f4;
        border-radius: 12px;
        background: #fff;
        padding: 9px;
      }

      .tp-activity-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .tp-activity-ref {
        color: #0c4a6e;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .tp-status {
        border-radius: 999px;
        padding: 5px 8px;
        font-size: 10px;
        font-weight: 800;
      }

      .tp-status--pending { background: #eef2ff; color: #3730a3; }
      .tp-status--progress { background: #fff7d6; color: #92400e; }
      .tp-status--confirmed { background: #e0f2fe; color: #075985; }
      .tp-status--done { background: #dcfce7; color: #166534; }
      .tp-status--canceled { background: #fee2e2; color: #991b1b; }
      .tp-status--unknown { background: #e2e8f0; color: #1f2937; }

      .tp-activity-title {
        margin-top: 4px;
        color: #143a61;
        font-size: 14px;
        font-weight: 800;
      }

      .tp-activity-meta {
        margin-top: 4px;
        color: #5c7691;
        font-size: 12px;
        display: grid;
        gap: 3px;
      }

      .tp-activity-actions {
        margin-top: 7px;
        display: flex;
        gap: 8px;
      }

      .tp-empty-inline {
        color: #607b96;
        font-size: 13px;
      }

      .tp-toasts {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 100001;
        display: grid;
        gap: 8px;
      }

      .tp-toast {
        border-radius: 10px;
        padding: 10px 12px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 12px 30px rgba(12, 37, 66, 0.30);
      }

      .tp-toast--success { background: #16a34a; }
      .tp-toast--error { background: #dc2626; }
      .tp-toast--warning { background: #d97706; }
      .tp-toast--info { background: #2563eb; }

      @media (max-width: 1100px) {
        .tp-grid-top {
          grid-template-columns: 1fr;
        }

        .tp-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 740px) {
        .tp-header {
          flex-direction: column;
        }

        .tp-header-right {
          width: 100%;
          justify-content: flex-start;
        }

        .tp-form-grid,
        .tp-meta-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }
})();
