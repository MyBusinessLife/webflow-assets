document.documentElement.setAttribute("data-page", "admin-settings");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminSettingsLoaded) return;
  window.__mblAdminSettingsLoaded = true;

  const root = findRoot();
  if (!root) {
    console.error("[SETTINGS] Root introuvable. Ajoute <div data-mbl-settings></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[SETTINGS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[SETTINGS]", ...a);

  const CFG = window.__MBL_CFG__ || {};

  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  function sanitizePath(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (v.startsWith("/") && !v.startsWith("//")) return v;
    try {
      const u = new URL(v, location.origin);
      if (u.origin === location.origin) return u.pathname + u.search + u.hash;
    } catch (_) {}
    return "";
  }

  function sanitizeLoginPath(value) {
    const v = sanitizePath(value);
    if (!v) return "";
    return /\/login\/?$/.test(v) ? v : "";
  }

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
    LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`,
    SUBSCRIBE_PATH: sanitizePath(CFG.SUBSCRIBE_PATH) || "/subscriptions",
    PROFILE_TABLE: "organization_profiles",
  };

  const STR = {
    title: "Settings",
    subtitle: "Paramètres de ton organisation et de la facturation",
    loadError: "Impossible de charger les paramètres.",
    loginRequired: "Connexion requise.",
    notAdmin: "Accès réservé aux administrateurs.",
    saving: "Enregistrement…",
    saved: "Paramètres enregistrés.",
    saveError: "Impossible d'enregistrer.",
    sectionOrg: "Entreprise",
    sectionBilling: "Facturation",
    sectionSub: "Abonnement",
    save: "Enregistrer",
  };

  function findRoot() {
    return (
      document.querySelector("[data-mbl-settings]") ||
      document.querySelector("#mbl-settings") ||
      document.querySelector(".mbl-settings") ||
      null
    );
  }

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clamp255(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function parseColorToRgb(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
    }

    const m = s.match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
    if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };

    return null;
  }

  function resolvePrimary() {
    try {
      const v = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary") || "").trim();
      if (v) return v;
    } catch (_) {}
    return String(CFG.THEME_PRIMARY || "").trim() || "#0ea5e9";
  }

  function ensurePrimaryRgbCssVar() {
    try {
      const existing = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary-rgb") || "").trim();
      if (existing) return;
    } catch (_) {}
    const rgb = parseColorToRgb(resolvePrimary());
    if (!rgb) return;
    try {
      document.documentElement.style.setProperty("--mbl-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("mbl-settings-style")) return;
    ensurePrimaryRgbCssVar();
    const st = document.createElement("style");
    st.id = "mbl-settings-style";
    st.textContent = `
      html[data-page="admin-settings"] {
        --set-text: rgba(2,6,23,0.90);
        --set-muted: rgba(2,6,23,0.62);
        --set-border: rgba(15,23,42,0.12);
        --set-card: rgba(255,255,255,0.86);
        --set-bg: #f6fbff;
        --set-shadow: 0 22px 60px rgba(2,6,23,0.10);
      }

      .mbl-settings {
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        background:
          radial-gradient(1000px 520px at 12% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.10), transparent 55%),
          radial-gradient(920px 520px at 92% 8%, rgba(2, 6, 23, 0.08), transparent 60%),
          var(--set-bg);
        box-shadow: var(--set-shadow);
        overflow: hidden;
        color: var(--set-text);
      }

      .mbl-settings__top {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.70));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .mbl-settings__title { margin: 0; font-size: 18px; font-weight: 950; }
      .mbl-settings__subtitle { margin: 4px 0 0; font-size: 13px; color: var(--set-muted); font-weight: 750; }

      .set-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 42px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(var(--mbl-primary-rgb, 14, 165, 233),0.35);
        background: linear-gradient(180deg, rgba(var(--mbl-primary-rgb, 14, 165, 233),0.95), rgba(var(--mbl-primary-rgb, 14, 165, 233),0.72));
        color: #fff;
        font-weight: 950;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease;
      }
      .set-btn:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.18); }
      .set-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; }

      .mbl-settings__banner {
        display: none;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 800;
        font-size: 13px;
      }
      .mbl-settings__banner.is-ok { display:block; background:#ecfdf5; color:#065f46; }
      .mbl-settings__banner.is-err { display:block; background:#fef2f2; color:#991b1b; }

      .mbl-settings__body { padding: 14px; }

      .set-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .set-card {
        border: 1px solid var(--set-border);
        background: var(--set-card);
        border-radius: 16px;
        overflow: hidden;
      }
      .set-card__head {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        background: rgba(255,255,255,0.85);
        font-weight: 950;
      }
      .set-card__body { padding: 14px; }

      .set-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .set-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
      .set-field.is-full { grid-column: 1 / -1; }
      .set-label { font-size: 12px; font-weight: 900; color: rgba(2,6,23,0.70); }
      .set-input, .set-textarea {
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255,255,255,0.96);
        padding: 10px 12px;
        font-weight: 800;
        outline: none;
        color: rgba(2, 6, 23, 0.88);
      }
      .set-input { height: 42px; }
      .set-textarea { min-height: 92px; resize: vertical; }
      .set-input:focus, .set-textarea:focus {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.45);
        box-shadow: 0 0 0 4px rgba(var(--mbl-primary-rgb, 14, 165, 233),0.14);
      }

      .set-kv {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px 12px;
        align-items: center;
        font-weight: 850;
        color: rgba(2,6,23,0.78);
      }
      .set-kv__k { color: rgba(2,6,23,0.60); font-weight: 850; }
      .set-kv__v { font-weight: 950; }
      .set-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 900;
        text-decoration: none;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      .set-link:hover { transform: translateY(-1px); border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233),0.30); box-shadow: 0 16px 34px rgba(2,6,23,0.12); }

      @media (max-width: 860px) {
        .mbl-settings__top { align-items: flex-start; flex-direction: column; }
        .set-grid { grid-template-columns: 1fr; }
        .set-form { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 7000);
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
      return;
    }
    const s = document.createElement("script");
    s.src = CONFIG.SUPABASE_CDN;
    s.async = true;
    s.dataset.mblLib = "supabase";
    document.head.appendChild(s);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 7000);
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

  async function getSupabase() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    await ensureSupabaseJs();
    if (!window.supabase?.createClient) throw new Error("Supabase non charge.");
    const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: CONFIG.AUTH_STORAGE_KEY },
    });
    window.__MBL_SUPABASE__ = client;
    return client;
  }

  async function getCurrentUser(supabase) {
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgMember(supabase, userId) {
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return null;
    return data?.[0] || null;
  }

  function showBanner(els, text, mode) {
    els.banner.className = "mbl-settings__banner";
    if (mode === "ok") els.banner.classList.add("is-ok");
    if (mode === "err") els.banner.classList.add("is-err");
    els.banner.textContent = text || "";
  }

  function numOrNull(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function centsOrNull(v) {
    const n = numOrNull(v);
    if (n === null) return null;
    return Math.round(n);
  }

  function renderShell() {
    root.classList.add("mbl-settings");
    root.innerHTML = `
      <div class="mbl-settings__top">
        <div>
          <h2 class="mbl-settings__title">${escapeHTML(STR.title)}</h2>
          <p class="mbl-settings__subtitle">${escapeHTML(STR.subtitle)}</p>
        </div>
        <button type="button" class="set-btn" data-save>${escapeHTML(STR.save)}</button>
      </div>
      <div class="mbl-settings__banner" data-banner></div>
      <div class="mbl-settings__body">
        <div class="set-grid">
          <section class="set-card">
            <div class="set-card__head">${escapeHTML(STR.sectionOrg)}</div>
            <div class="set-card__body">
              <div class="set-form" data-org-form></div>
            </div>
          </section>

          <section class="set-card">
            <div class="set-card__head">${escapeHTML(STR.sectionBilling)}</div>
            <div class="set-card__body">
              <div class="set-form" data-billing-form></div>
            </div>
          </section>

          <section class="set-card">
            <div class="set-card__head">${escapeHTML(STR.sectionSub)}</div>
            <div class="set-card__body">
              <div class="set-kv" data-sub-kv></div>
              <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                <a class="set-link" href="${escapeHTML(CONFIG.SUBSCRIBE_PATH)}">Gérer mon abonnement</a>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    return {
      btnSave: root.querySelector("[data-save]"),
      banner: root.querySelector("[data-banner]"),
      orgForm: root.querySelector("[data-org-form]"),
      billingForm: root.querySelector("[data-billing-form]"),
      subKv: root.querySelector("[data-sub-kv]"),
    };
  }

  function fieldHtml({ key, label, value, type = "text", full = false, placeholder = "" }) {
    const cls = full ? "set-field is-full" : "set-field";
    return `
      <div class="${cls}">
        <div class="set-label">${escapeHTML(label)}</div>
        <input class="set-input" data-k="${escapeHTML(key)}" type="${escapeHTML(type)}" value="${escapeHTML(
          value ?? ""
        )}" placeholder="${escapeHTML(placeholder)}"/>
      </div>
    `;
  }

  function textareaHtml({ key, label, value, placeholder = "" }) {
    return `
      <div class="set-field is-full">
        <div class="set-label">${escapeHTML(label)}</div>
        <textarea class="set-textarea" data-k="${escapeHTML(key)}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(
          value ?? ""
        )}</textarea>
      </div>
    `;
  }

  function kvHtml(k, v) {
    return `<div class="set-kv__k">${escapeHTML(k)}</div><div class="set-kv__v">${escapeHTML(v)}</div>`;
  }

  function getFormValue(container, key) {
    const el = container.querySelector(`[data-k="${CSS.escape(String(key))}"]`);
    if (!el) return "";
    return String(el.value ?? "").trim();
  }

  // ===== boot =====
  injectStyles();
  const els = renderShell();

  try {
    const supabase = await getSupabase();
    const user = await getCurrentUser(supabase);
    if (!user) {
      showBanner(els, STR.loginRequired, "err");
      return;
    }

    const member = await resolveOrgMember(supabase, user.id);
    const orgId = String(member?.organization_id || "").trim();
    const orgRole = String(member?.role || "").trim().toLowerCase();
    const isAdmin = ["owner", "admin", "manager"].includes(orgRole);
    if (!orgId) {
      showBanner(els, STR.loadError, "err");
      return;
    }
    if (!isAdmin) {
      showBanner(els, STR.notAdmin, "err");
      return;
    }

    const [profileRes, subRes, entRes] = await Promise.all([
      supabase.from(CONFIG.PROFILE_TABLE).select("*").eq("organization_id", orgId).maybeSingle(),
      supabase
        .from("organization_subscriptions")
        .select("status, starts_at, ends_at, trial_ends_at, plan:plan_id(code, name)")
        .eq("organization_id", orgId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("organization_entitlements").select("modules, limits").eq("organization_id", orgId).maybeSingle(),
    ]);

    if (profileRes.error) throw profileRes.error;

    const p = profileRes.data || { organization_id: orgId };
    const sub = subRes?.data || null;
    const planName = String(sub?.plan?.name || "").trim() || "—";
    const status = String(sub?.status || "").trim() || "—";
    const modules = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
    const limits = entRes?.data?.limits && typeof entRes.data.limits === "object" ? entRes.data.limits : {};
    const maxUsers = limits?.max_users != null ? String(limits.max_users) : "—";

    // Org form
    els.orgForm.innerHTML =
      fieldHtml({ key: "trade_name", label: "Nom commercial", value: p.trade_name, full: true, placeholder: "Ex: My Business Life" }) +
      fieldHtml({ key: "legal_name", label: "Raison sociale", value: p.legal_name, full: true }) +
      fieldHtml({ key: "legal_form", label: "Forme juridique", value: p.legal_form, placeholder: "Ex: SARL" }) +
      fieldHtml({ key: "share_capital_cents", label: "Capital social (centimes)", value: p.share_capital_cents, type: "number" }) +
      fieldHtml({ key: "siret", label: "SIRET", value: p.siret }) +
      fieldHtml({ key: "vat_number", label: "TVA intracom", value: p.vat_number }) +
      fieldHtml({ key: "rcs_city", label: "RCS (ville)", value: p.rcs_city }) +
      fieldHtml({ key: "rcs_number", label: "RCS (numéro)", value: p.rcs_number }) +
      fieldHtml({ key: "naf_code", label: "Code NAF", value: p.naf_code }) +
      fieldHtml({ key: "email", label: "Email", value: p.email }) +
      fieldHtml({ key: "phone", label: "Téléphone", value: p.phone }) +
      fieldHtml({ key: "address", label: "Adresse", value: p.address, full: true }) +
      fieldHtml({ key: "postal_code", label: "Code postal", value: p.postal_code }) +
      fieldHtml({ key: "city", label: "Ville", value: p.city }) +
      fieldHtml({ key: "country", label: "Pays", value: p.country });

    // Billing form
    els.billingForm.innerHTML =
      fieldHtml({ key: "invoice_prefix", label: "Préfixe facture", value: p.invoice_prefix }) +
      fieldHtml({ key: "invoice_padding", label: "Padding facture", value: p.invoice_padding, type: "number" }) +
      fieldHtml({ key: "quote_prefix", label: "Préfixe devis", value: p.quote_prefix }) +
      fieldHtml({ key: "quote_padding", label: "Padding devis", value: p.quote_padding, type: "number" }) +
      fieldHtml({ key: "payment_terms_days", label: "Délais de paiement (jours)", value: p.payment_terms_days, type: "number" }) +
      fieldHtml({ key: "late_fee_rate", label: "Taux pénalité retard (%)", value: p.late_fee_rate, type: "number" }) +
      fieldHtml({ key: "recovery_fee_cents", label: "Indemnité recouvrement (centimes)", value: p.recovery_fee_cents, type: "number" }) +
      fieldHtml({
        key: "vat_exemption_text",
        label: "Mention TVA (optionnel)",
        value: p.vat_exemption_text,
        full: true,
        placeholder: "Ex: TVA non applicable, art. 293 B du CGI",
      }) +
      textareaHtml({ key: "footer_notes", label: "Notes bas de page (optionnel)", value: p.footer_notes });

    // Subscription kv
    els.subKv.innerHTML =
      kvHtml("Plan", planName) +
      kvHtml("Statut", status) +
      kvHtml("Max utilisateurs", maxUsers);

    els.btnSave.addEventListener("click", async () => {
      showBanner(els, "", "");
      els.btnSave.disabled = true;
      const prev = els.btnSave.textContent;
      els.btnSave.textContent = STR.saving;

      try {
        const payload = {
          trade_name: getFormValue(els.orgForm, "trade_name") || null,
          legal_name: getFormValue(els.orgForm, "legal_name") || null,
          legal_form: getFormValue(els.orgForm, "legal_form") || null,
          share_capital_cents: centsOrNull(getFormValue(els.orgForm, "share_capital_cents")),
          siret: getFormValue(els.orgForm, "siret") || null,
          vat_number: getFormValue(els.orgForm, "vat_number") || null,
          rcs_city: getFormValue(els.orgForm, "rcs_city") || null,
          rcs_number: getFormValue(els.orgForm, "rcs_number") || null,
          naf_code: getFormValue(els.orgForm, "naf_code") || null,
          email: getFormValue(els.orgForm, "email") || null,
          phone: getFormValue(els.orgForm, "phone") || null,
          address: getFormValue(els.orgForm, "address") || null,
          postal_code: getFormValue(els.orgForm, "postal_code") || null,
          city: getFormValue(els.orgForm, "city") || null,
          country: getFormValue(els.orgForm, "country") || null,

          invoice_prefix: getFormValue(els.billingForm, "invoice_prefix") || "FA",
          invoice_padding: Math.max(2, Math.min(8, Number(getFormValue(els.billingForm, "invoice_padding") || 4) || 4)),
          quote_prefix: getFormValue(els.billingForm, "quote_prefix") || "DV",
          quote_padding: Math.max(2, Math.min(8, Number(getFormValue(els.billingForm, "quote_padding") || 4) || 4)),
          payment_terms_days: Math.max(0, Number(getFormValue(els.billingForm, "payment_terms_days") || 30) || 30),
          late_fee_rate: Number(getFormValue(els.billingForm, "late_fee_rate") || 10) || 10,
          recovery_fee_cents: Math.max(0, Number(getFormValue(els.billingForm, "recovery_fee_cents") || 4000) || 4000),
          vat_exemption_text: getFormValue(els.billingForm, "vat_exemption_text") || null,
          footer_notes: String(els.billingForm.querySelector('[data-k="footer_notes"]')?.value || "").trim() || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from(CONFIG.PROFILE_TABLE).update(payload).eq("organization_id", orgId);
        if (error) throw error;
        showBanner(els, STR.saved, "ok");
      } catch (e) {
        warn("save error", e);
        showBanner(els, STR.saveError, "err");
      } finally {
        els.btnSave.disabled = false;
        els.btnSave.textContent = prev;
      }
    });

    log("ready", { orgId });
  } catch (e) {
    warn("boot error", e);
    showBanner(els, STR.loadError, "err");
  }
});

