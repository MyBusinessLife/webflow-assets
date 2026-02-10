document.documentElement.setAttribute("data-page", "admin-restaurant");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminRestaurantLoaded) return;
  window.__mblAdminRestaurantLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-restaurant]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-restaurant") || null;
  if (!root) {
    console.error("[RESTAURANT] Root introuvable. Ajoute <div data-mbl-restaurant></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[RESTAURANT]", ...a);
  const warn = (...a) => DEBUG && console.warn("[RESTAURANT]", ...a);

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
    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),
    SUBSCRIPTIONS_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",

    LOCATIONS_TABLE: "restaurant_locations",
    CATEGORIES_TABLE: "restaurant_menu_categories",
    ITEMS_TABLE: "restaurant_menu_items",
    RECIPES_TABLE: "restaurant_item_recipes",
    ORDERS_TABLE: "restaurant_orders",
    ORDER_LINES_TABLE: "restaurant_order_lines",
    PRODUCTS_TABLE: "products",
    MENU_IMAGE_BUCKET: String(root.dataset.menuImageBucket || "restaurant-media").trim() || "restaurant-media",
    MENU_IMAGE_PATH_PREFIX: String(root.dataset.menuImagePrefix || "menu-images").trim() || "menu-images",

    ORDER_PAGE_DEFAULT: String(root.dataset.orderPagePath || "/restaurant-order").trim() || "/restaurant-order",
    CURRENCY: String(root.dataset.currency || "EUR").trim() || "EUR",
  };

  const STR = {
    title: "Restauration",
    subtitle: "Lieux, menus, recettes, QR codes et reception des commandes",

    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour acceder au module restauration.",
    loginCta: "Se connecter",

    forbiddenTitle: "Acces refuse",
    forbiddenBody: "Ce module est reserve aux administrateurs.",

    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module restauration.",
    moduleCta: "Gerer mon abonnement",

    loading: "Chargement...",
    loadError: "Impossible de charger les donnees restauration.",
    saving: "Enregistrement...",
    saved: "Enregistre",
    deleted: "Supprime",
    copyOk: "Lien copie",
    qrDisabled: "QR supprime",
    qrEnabled: "QR active",

    tabCatalog: "Menus",
    tabOrders: "Commandes",
    tabQr: "QR & pages",

    emptyLocations: "Aucun lieu. Cree un premier lieu pour activer la prise de commande.",
    emptyCategories: "Aucune categorie pour ce lieu.",
    emptyItems: "Aucun item pour ce lieu.",
    emptyOrders: "Aucune commande.",

    addLocation: "Nouveau lieu",
    addCategory: "Nouvelle categorie",
    addItem: "Nouvel item",

    statusAll: "Tous",
    statusNew: "Nouvelles",
    statusConfirmed: "Confirmees",
    statusPreparing: "Preparation",
    statusReady: "Pretes",
    statusServed: "Servies",
    statusCompleted: "Terminees",
    statusCanceled: "Annulees",
  };

  const state = {
    supabase: null,
    user: null,
    orgId: "",
    isAdmin: false,
    modules: {},
    activeTab: "catalog",
    activeLocationId: "",
    search: "",
    orderFilter: "all",
    locations: [],
    categories: [],
    items: [],
    recipes: [],
    products: [],
    orders: [],
    orderLinesByOrder: new Map(),
    modal: { onSave: null, onDelete: null, onAfterOpen: null },
  };

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function asUuid(value) {
    const v = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
  }

  function clean(input) {
    return String(input || "").trim().toLowerCase();
  }

  function formatMoney(cents, currency = CONFIG.CURRENCY) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return CONFIG.ORDER_PAGE_DEFAULT;
    if (p.startsWith("http://") || p.startsWith("https://")) {
      try {
        const u = new URL(p);
        return u.pathname + u.search;
      } catch (_) {
        return CONFIG.ORDER_PAGE_DEFAULT;
      }
    }
    if (!p.startsWith("/")) return `/${p}`;
    return p;
  }

  function qrUrlForText(text) {
    const data = encodeURIComponent(String(text || ""));
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=16&data=${data}`;
  }

  function orderPublicUrl(loc) {
    const path = normalizePath(loc.public_page_path || CONFIG.ORDER_PAGE_DEFAULT);
    const key = String(loc.public_query_key || "loc").trim() || "loc";
    const token = String(loc.public_access_key || loc.slug || "").trim();
    const u = new URL(path, location.origin);
    if (token) u.searchParams.set(key, token);
    return u.toString();
  }

  function sanitizeFileName(name) {
    return String(name || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 64);
  }

  function isMissingColumnError(err) {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("column") && msg.includes("does not exist");
  }

  async function uploadMenuImage(file, itemId) {
    if (!file) return null;
    if (!state.supabase) throw new Error("Supabase non initialise.");
    if (!state.orgId) throw new Error("Organisation introuvable.");
    if (!itemId) throw new Error("Item invalide pour upload image.");
    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("Le fichier doit etre une image.");
    }
    if (Number(file.size || 0) > 10 * 1024 * 1024) {
      throw new Error("L'image depasse 10 Mo.");
    }

    const rawName = String(file.name || "image");
    const ext = (() => {
      const parts = rawName.split(".");
      if (parts.length > 1) return sanitizeFileName(parts.pop()) || "jpg";
      if (file.type.includes("/")) return sanitizeFileName(file.type.split("/")[1]) || "jpg";
      return "jpg";
    })();

    const base = sanitizeFileName(rawName.replace(/\.[^.]+$/, "")) || "menu";
    const filename = `${base}-${Date.now()}.${ext}`;
    const path = `${CONFIG.MENU_IMAGE_PATH_PREFIX}/${state.orgId}/${itemId}/${filename}`;

    const up = await state.supabase.storage.from(CONFIG.MENU_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (up.error) throw up.error;

    const pub = state.supabase.storage.from(CONFIG.MENU_IMAGE_BUCKET).getPublicUrl(path);
    const publicUrl = String(pub?.data?.publicUrl || "").trim();
    if (!publicUrl) throw new Error("URL publique image indisponible.");

    return { publicUrl, path };
  }

  async function ensureSupabaseJs() {
    if (window.supabase && window.supabase.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
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
      return;
    }

    const s = document.createElement("script");
    s.src = CONFIG.SUPABASE_CDN;
    s.async = true;
    s.dataset.mblLib = "supabase";
    document.head.appendChild(s);

    await new Promise((resolve, reject) => {
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

  function getSupabase() {
    if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
    if (!window.supabase?.createClient) return null;
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

  async function getCurrentUser() {
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      state.supabase.auth.getSession(),
      state.supabase.auth.getUser(),
    ]);
    if (userErr) return sessionData?.session?.user || null;
    return userData?.user || sessionData?.session?.user || null;
  }

  async function resolveOrgMember(userId) {
    const { data, error } = await state.supabase
      .from("organization_members")
      .select("organization_id, role, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      warn("organization_members read error", error);
      return null;
    }
    return data?.[0] || null;
  }

  async function fetchModules() {
    const { data, error } = await state.supabase
      .from("organization_entitlements")
      .select("modules")
      .eq("organization_id", state.orgId)
      .maybeSingle();

    if (error) {
      warn("organization_entitlements read error", error);
      return {};
    }
    return data?.modules && typeof data.modules === "object" ? data.modules : {};
  }

  function injectStyles() {
    if (document.getElementById("mbl-restaurant-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-restaurant-style";
    st.textContent = `
      html[data-page="admin-restaurant"] .rst-shell,
      html[data-page="admin-restaurant"] .rst-shell * { box-sizing: border-box; }

      html[data-page="admin-restaurant"] .rst-shell {
        --rst-primary: #0ea5e9;
        --rst-text: rgba(2,6,23,0.90);
        --rst-muted: rgba(2,6,23,0.62);
        --rst-border: rgba(15,23,42,0.10);
        --rst-surface: rgba(255,255,255,0.86);
        --rst-surface2: rgba(255,255,255,0.96);
        --rst-shadow: 0 20px 58px rgba(2,6,23,0.10);
        width: min(1240px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--rst-border);
        background:
          radial-gradient(940px 520px at 12% 0%, rgba(14,165,233,0.14), transparent 56%),
          radial-gradient(900px 500px at 96% 8%, rgba(2,6,23,0.08), transparent 58%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.94));
        box-shadow: var(--rst-shadow);
        color: var(--rst-text);
      }

      html[data-page="admin-restaurant"] .rst-head {
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 12px;
      }
      html[data-page="admin-restaurant"] .rst-title { margin:0; font-size: 23px; font-weight: 1000; letter-spacing: -0.02em; }
      html[data-page="admin-restaurant"] .rst-subtitle { margin: 4px 0 0; color: var(--rst-muted); font-weight: 800; }

      html[data-page="admin-restaurant"] .rst-tabs {
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 12px 0;
      }
      html[data-page="admin-restaurant"] .rst-tab {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.80);
        color: rgba(2,6,23,0.80);
        height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        font-weight: 900;
        cursor: pointer;
      }
      html[data-page="admin-restaurant"] .rst-tab[aria-selected="true"] {
        border-color: rgba(14,165,233,0.36);
        background: rgba(14,165,233,0.14);
        color: rgba(12,74,110,0.96);
      }

      html[data-page="admin-restaurant"] .rst-topbar {
        display:flex;
        justify-content: space-between;
        align-items:center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      html[data-page="admin-restaurant"] .rst-topbar__left,
      html[data-page="admin-restaurant"] .rst-topbar__right {
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items:center;
      }

      html[data-page="admin-restaurant"] .rst-select,
      html[data-page="admin-restaurant"] .rst-input,
      html[data-page="admin-restaurant"] .rst-textarea {
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.96);
        color: rgba(2,6,23,0.88);
        border-radius: 14px;
        padding: 10px 12px;
        outline: none;
      }
      html[data-page="admin-restaurant"] .rst-select,
      html[data-page="admin-restaurant"] .rst-input {
        height: 42px;
      }
      html[data-page="admin-restaurant"] .rst-textarea {
        min-height: 90px;
        resize: vertical;
      }
      html[data-page="admin-restaurant"] .rst-input:focus,
      html[data-page="admin-restaurant"] .rst-select:focus,
      html[data-page="admin-restaurant"] .rst-textarea:focus {
        border-color: rgba(14,165,233,0.48);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }

      html[data-page="admin-restaurant"] .rst-btn {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.9);
        color: rgba(2,6,23,0.88);
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .12s ease, border-color .18s ease, box-shadow .18s ease;
      }
      html[data-page="admin-restaurant"] .rst-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(14,165,233,0.48);
        box-shadow: 0 10px 22px rgba(2,6,23,0.10);
      }
      html[data-page="admin-restaurant"] .rst-btn:disabled { opacity: .6; cursor:not-allowed; transform:none; box-shadow:none; }
      html[data-page="admin-restaurant"] .rst-btn[aria-disabled="true"] {
        opacity: .6;
        pointer-events: none;
      }
      html[data-page="admin-restaurant"] .rst-btn--primary {
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        color: #fff;
        border-color: rgba(14,165,233,0.58);
      }
      html[data-page="admin-restaurant"] .rst-btn--danger {
        border-color: rgba(239,68,68,0.30);
        color: rgba(153,27,27,0.9);
      }

      html[data-page="admin-restaurant"] .rst-alert {
        display:none;
        margin-bottom: 10px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(241,245,249,0.92);
        color: rgba(2,6,23,0.86);
        padding: 10px 12px;
        font-weight: 800;
      }
      html[data-page="admin-restaurant"] .rst-alert.is-error {
        display:block;
        border-color: rgba(239,68,68,0.30);
        background: rgba(254,242,242,0.94);
        color: rgba(153,27,27,0.92);
      }
      html[data-page="admin-restaurant"] .rst-alert.is-ok {
        display:block;
        border-color: rgba(34,197,94,0.30);
        background: rgba(240,253,244,0.94);
        color: rgba(20,83,45,0.92);
      }

      html[data-page="admin-restaurant"] .rst-grid {
        display:grid;
        grid-template-columns: 320px 1fr;
        gap: 12px;
      }
      html[data-page="admin-restaurant"] .rst-card {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.90);
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }
      html[data-page="admin-restaurant"] .rst-card__title {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 1000;
      }

      html[data-page="admin-restaurant"] .rst-list {
        display:grid;
        gap: 10px;
      }
      html[data-page="admin-restaurant"] .rst-item {
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 14px;
        padding: 10px;
        background: rgba(255,255,255,0.92);
      }
      html[data-page="admin-restaurant"] .rst-item__row {
        display:flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }
      html[data-page="admin-restaurant"] .rst-item__title {
        margin: 0;
        font-size: 14px;
        font-weight: 950;
      }
      html[data-page="admin-restaurant"] .rst-item__meta {
        margin-top: 4px;
        font-size: 12px;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
      }

      html[data-page="admin-restaurant"] .rst-actions-inline {
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      html[data-page="admin-restaurant"] .rst-pill {
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 5px 9px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.12);
        font-size: 11px;
        font-weight: 900;
        background: rgba(248,250,252,0.92);
        color: rgba(2,6,23,0.74);
      }
      html[data-page="admin-restaurant"] .rst-dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      html[data-page="admin-restaurant"] .rst-pill.is-new .rst-dot { background: #3b82f6; }
      html[data-page="admin-restaurant"] .rst-pill.is-confirmed .rst-dot { background: #a855f7; }
      html[data-page="admin-restaurant"] .rst-pill.is-preparing .rst-dot { background: #f59e0b; }
      html[data-page="admin-restaurant"] .rst-pill.is-ready .rst-dot { background: #22c55e; }
      html[data-page="admin-restaurant"] .rst-pill.is-served .rst-dot { background: #0ea5e9; }
      html[data-page="admin-restaurant"] .rst-pill.is-completed .rst-dot { background: #16a34a; }
      html[data-page="admin-restaurant"] .rst-pill.is-canceled .rst-dot { background: #ef4444; }

      html[data-page="admin-restaurant"] .rst-empty {
        padding: 28px 14px;
        text-align:center;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
      }

      html[data-page="admin-restaurant"] .rst-qr-grid {
        display:grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 14px;
      }
      html[data-page="admin-restaurant"] .rst-qr {
        display:grid;
        gap: 12px;
        border: 1px solid rgba(14,165,233,0.16);
        border-radius: 14px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(240,249,255,0.82));
      }
      html[data-page="admin-restaurant"] .rst-qr__top {
        display:grid;
        grid-template-columns: 190px 1fr;
        gap: 10px;
        align-items: start;
      }
      html[data-page="admin-restaurant"] .rst-qr__img {
        width: 190px;
        height: 190px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: #fff;
        object-fit: cover;
      }
      html[data-page="admin-restaurant"] .rst-qr__url {
        word-break: break-all;
        font-size: 12px;
        color: rgba(2,6,23,0.70);
        margin-top: 4px;
      }
      html[data-page="admin-restaurant"] .rst-qr__muted {
        font-size: 12px;
        color: rgba(2,6,23,0.58);
        font-weight: 800;
      }
      html[data-page="admin-restaurant"] .rst-qr__placeholder {
        width: 190px;
        height: 190px;
        border-radius: 12px;
        border: 1px dashed rgba(15,23,42,0.24);
        background: rgba(241,245,249,0.88);
        color: rgba(15,23,42,0.55);
        font-size: 12px;
        font-weight: 900;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        padding: 10px;
      }
      html[data-page="admin-restaurant"] .rst-qr__fields {
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      html[data-page="admin-restaurant"] .rst-qr__fields .full {
        grid-column: 1 / -1;
      }
      html[data-page="admin-restaurant"] .rst-qr__actions {
        display:flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      html[data-page="admin-restaurant"] .rst-item__thumb {
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 10px;
        border: 1px solid rgba(15,23,42,0.10);
        object-fit: cover;
        background: rgba(241,245,249,0.92);
      }

      html[data-page="admin-restaurant"] .rst-image-preview {
        width: 100%;
        max-height: 220px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(248,250,252,0.92);
        object-fit: contain;
      }
      html[data-page="admin-restaurant"] .rst-image-preview.is-empty {
        min-height: 120px;
        display:flex;
        align-items:center;
        justify-content:center;
        color: rgba(2,6,23,0.58);
        font-size: 12px;
        font-weight: 800;
      }

      html[data-page="admin-restaurant"] .rst-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display:none;
      }
      html[data-page="admin-restaurant"] .rst-modal.is-open { display:block; }
      html[data-page="admin-restaurant"] .rst-modal__backdrop {
        position:absolute;
        inset:0;
        background: rgba(2,6,23,0.56);
        backdrop-filter: blur(8px);
      }
      html[data-page="admin-restaurant"] .rst-modal__panel {
        position:absolute;
        left:50%;
        top: 6vh;
        transform: translateX(-50%);
        width: min(760px, calc(100% - 24px));
        max-height: 88vh;
        overflow:auto;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.97);
        box-shadow: 0 24px 80px rgba(2,6,23,0.24);
        padding: 14px;
      }
      html[data-page="admin-restaurant"] .rst-modal__head {
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 8px;
        margin-bottom: 12px;
      }
      html[data-page="admin-restaurant"] .rst-modal__title {
        margin:0;
        font-size: 16px;
        font-weight: 1000;
      }
      html[data-page="admin-restaurant"] .rst-form {
        display:grid;
        gap: 10px;
        grid-template-columns: 1fr 1fr;
      }
      html[data-page="admin-restaurant"] .rst-form .full { grid-column: 1 / -1; }
      html[data-page="admin-restaurant"] .rst-label {
        display:block;
        margin: 0 0 6px;
        font-size: 12px;
        font-weight: 900;
        color: rgba(2,6,23,0.74);
      }
      html[data-page="admin-restaurant"] .rst-modal__foot {
        display:flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
      }

      @media (max-width: 980px) {
        html[data-page="admin-restaurant"] .rst-grid { grid-template-columns: 1fr; }
        html[data-page="admin-restaurant"] .rst-qr__top { grid-template-columns: 1fr; }
        html[data-page="admin-restaurant"] .rst-qr__img,
        html[data-page="admin-restaurant"] .rst-qr__placeholder { width: 100%; height: auto; aspect-ratio: 1 / 1; }
      }
      @media (max-width: 780px) {
        html[data-page="admin-restaurant"] .rst-form { grid-template-columns: 1fr; }
        html[data-page="admin-restaurant"] .rst-qr__fields { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  function renderBlocking({ title, body, cta }) {
    root.innerHTML = `
      <section class="rst-shell">
        <div class="rst-card">
          <h2 class="rst-title" style="font-size:20px;">${escapeHTML(title || "")}</h2>
          <p class="rst-subtitle" style="margin-top:8px;">${escapeHTML(body || "")}</p>
          ${
            cta
              ? `<div style="margin-top:14px;"><a class="rst-btn rst-btn--primary" href="${escapeHTML(
                  cta.href || CONFIG.LOGIN_PATH
                )}" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">${escapeHTML(
                  cta.label || "Continuer"
                )}</a></div>`
              : ""
          }
        </div>
      </section>
    `;
  }

  function renderShell() {
    root.innerHTML = `
      <section class="rst-shell">
        <header class="rst-head">
          <div>
            <h1 class="rst-title">${escapeHTML(STR.title)}</h1>
            <p class="rst-subtitle">${escapeHTML(STR.subtitle)}</p>
          </div>
          <div class="rst-topbar__right">
            <button class="rst-btn" type="button" data-action="add-location">${escapeHTML(STR.addLocation)}</button>
            <button class="rst-btn rst-btn--primary" type="button" data-action="refresh">Actualiser</button>
          </div>
        </header>

        <div class="rst-alert" data-alert></div>

        <nav class="rst-tabs" role="tablist">
          <button class="rst-tab" data-tab="catalog" aria-selected="true">${escapeHTML(STR.tabCatalog)}</button>
          <button class="rst-tab" data-tab="orders" aria-selected="false">${escapeHTML(STR.tabOrders)}</button>
          <button class="rst-tab" data-tab="qr" aria-selected="false">${escapeHTML(STR.tabQr)}</button>
        </nav>

        <div data-pane></div>
      </section>

      <div class="rst-modal" data-modal aria-hidden="true">
        <div class="rst-modal__backdrop" data-modal-close></div>
        <div class="rst-modal__panel" role="dialog" aria-modal="true">
          <div class="rst-modal__head">
            <h3 class="rst-modal__title" data-modal-title></h3>
            <button type="button" class="rst-btn" data-modal-close>Fermer</button>
          </div>
          <div data-modal-body></div>
          <div class="rst-modal__foot" data-modal-foot></div>
        </div>
      </div>
    `;

    return {
      alert: root.querySelector("[data-alert]"),
      pane: root.querySelector("[data-pane]"),
      tabs: Array.from(root.querySelectorAll("[data-tab]")),
      btnRefresh: root.querySelector('[data-action="refresh"]'),
      btnAddLocation: root.querySelector('[data-action="add-location"]'),
      modal: root.querySelector("[data-modal]"),
      modalTitle: root.querySelector("[data-modal-title]"),
      modalBody: root.querySelector("[data-modal-body]"),
      modalFoot: root.querySelector("[data-modal-foot]"),
      modalClosers: Array.from(root.querySelectorAll("[data-modal-close]")),
    };
  }

  function showAlert(els, text, type) {
    if (!els?.alert) return;
    const t = String(text || "").trim();
    if (!t) {
      els.alert.className = "rst-alert";
      els.alert.textContent = "";
      return;
    }
    els.alert.className = "rst-alert " + (type === "error" ? "is-error" : "is-ok");
    els.alert.textContent = t;
  }

  function closeModal(els) {
    state.modal.onSave = null;
    state.modal.onDelete = null;
    state.modal.onAfterOpen = null;
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
    els.modalTitle.textContent = "";
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
  }

  function openModal(els, { title, bodyHtml, saveLabel = "Enregistrer", dangerLabel = "Supprimer", canDelete = false, onSave, onDelete, onAfterOpen }) {
    state.modal.onSave = onSave || null;
    state.modal.onDelete = onDelete || null;
    state.modal.onAfterOpen = onAfterOpen || null;

    els.modalTitle.textContent = title || "";
    els.modalBody.innerHTML = bodyHtml || "";
    els.modalFoot.innerHTML = `
      ${canDelete ? `<button type="button" class="rst-btn rst-btn--danger" data-modal-action="delete">${escapeHTML(dangerLabel)}</button>` : ""}
      <button type="button" class="rst-btn" data-modal-close>Annuler</button>
      <button type="button" class="rst-btn rst-btn--primary" data-modal-action="save">${escapeHTML(saveLabel)}</button>
    `;

    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");

    els.modalFoot.querySelectorAll("[data-modal-close]").forEach((n) => n.addEventListener("click", () => closeModal(els)));

    const btnSave = els.modalFoot.querySelector('[data-modal-action="save"]');
    btnSave?.addEventListener("click", async () => {
      if (!state.modal.onSave) return;
      btnSave.disabled = true;
      const prev = btnSave.textContent;
      btnSave.textContent = STR.saving;
      try {
        const ok = await state.modal.onSave();
        if (ok !== false) closeModal(els);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = prev;
      }
    });

    const btnDelete = els.modalFoot.querySelector('[data-modal-action="delete"]');
    btnDelete?.addEventListener("click", async () => {
      if (!state.modal.onDelete) return;
      if (!confirm("Supprimer cet element ?")) return;
      btnDelete.disabled = true;
      try {
        const ok = await state.modal.onDelete();
        if (ok !== false) closeModal(els);
      } finally {
        btnDelete.disabled = false;
      }
    });

    if (typeof state.modal.onAfterOpen === "function") {
      try {
        state.modal.onAfterOpen();
      } catch (_) {}
    }
  }

  async function loadData() {
    const [locRes, catRes, itemRes, recRes, prodRes, ordRes] = await Promise.all([
      state.supabase
        .from(CONFIG.LOCATIONS_TABLE)
        .select("*")
        .eq("organization_id", state.orgId)
        .order("name", { ascending: true }),
      state.supabase
        .from(CONFIG.CATEGORIES_TABLE)
        .select("*")
        .eq("organization_id", state.orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      state.supabase
        .from(CONFIG.ITEMS_TABLE)
        .select("*")
        .eq("organization_id", state.orgId)
        .order("name", { ascending: true }),
      state.supabase
        .from(CONFIG.RECIPES_TABLE)
        .select("*")
        .eq("organization_id", state.orgId)
        .order("created_at", { ascending: true }),
      state.supabase
        .from(CONFIG.PRODUCTS_TABLE)
        .select("id, name, sku, price_cents, is_active")
        .eq("organization_id", state.orgId)
        .order("name", { ascending: true }),
      state.supabase
        .from(CONFIG.ORDERS_TABLE)
        .select("id, location_id, reference, source, status, payment_status, table_label, customer_name, note, subtotal_cents, vat_cents, total_cents, currency, stock_applied, created_at")
        .eq("organization_id", state.orgId)
        .order("created_at", { ascending: false })
        .limit(180),
    ]);

    if (locRes.error) throw locRes.error;
    if (catRes.error) throw catRes.error;
    if (itemRes.error) throw itemRes.error;
    if (recRes.error) throw recRes.error;
    if (prodRes.error) throw prodRes.error;
    if (ordRes.error) throw ordRes.error;

    state.locations = locRes.data || [];
    state.categories = catRes.data || [];
    state.items = itemRes.data || [];
    state.recipes = recRes.data || [];
    state.products = (prodRes.data || []).filter((p) => p && p.id);
    state.orders = ordRes.data || [];

    if (!asUuid(state.activeLocationId) && state.locations[0]?.id) {
      state.activeLocationId = state.locations[0].id;
    }

    const orderIds = state.orders.map((o) => o.id).filter(Boolean);
    state.orderLinesByOrder = new Map();

    if (orderIds.length) {
      const linesRes = await state.supabase
        .from(CONFIG.ORDER_LINES_TABLE)
        .select("order_id, line_type, label, qty, unit_price_cents, total_cents, menu_item_id, product_id")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true });

      if (linesRes.error) throw linesRes.error;
      (linesRes.data || []).forEach((l) => {
        const key = String(l.order_id || "");
        if (!state.orderLinesByOrder.has(key)) state.orderLinesByOrder.set(key, []);
        state.orderLinesByOrder.get(key).push(l);
      });
    }
  }

  function currentLocation() {
    const id = asUuid(state.activeLocationId);
    if (!id) return null;
    return state.locations.find((l) => l.id === id) || null;
  }

  function categoryNameById(id) {
    const c = state.categories.find((x) => x.id === id);
    return c?.name || "Sans categorie";
  }

  function menuItemsFiltered() {
    const locId = asUuid(state.activeLocationId);
    const q = clean(state.search);
    return (state.items || []).filter((it) => {
      if (locId && it.location_id !== locId) return false;
      if (!q) return true;
      return clean([it.name, it.description, it.id].filter(Boolean).join(" ")).includes(q);
    });
  }

  function categoriesFiltered() {
    const locId = asUuid(state.activeLocationId);
    return (state.categories || []).filter((c) => !locId || c.location_id === locId);
  }

  function renderCatalogPane(els) {
    const locId = asUuid(state.activeLocationId);
    const locOptions = state.locations
      .map((l) => `<option value="${escapeHTML(l.id)}"${l.id === locId ? " selected" : ""}>${escapeHTML(l.name)}</option>`)
      .join("");

    const categories = categoriesFiltered();
    const items = menuItemsFiltered();

    els.pane.innerHTML = `
      <div class="rst-topbar">
        <div class="rst-topbar__left">
          <select class="rst-select" data-catalog-location>
            ${locOptions || "<option value=''>Aucun lieu</option>"}
          </select>
          <input class="rst-input" data-catalog-search placeholder="Rechercher un item..." value="${escapeHTML(state.search)}" />
        </div>
        <div class="rst-topbar__right">
          <button class="rst-btn" type="button" data-action="add-category" ${locId ? "" : "disabled"}>${escapeHTML(STR.addCategory)}</button>
          <button class="rst-btn rst-btn--primary" type="button" data-action="add-item" ${locId ? "" : "disabled"}>${escapeHTML(STR.addItem)}</button>
        </div>
      </div>

      <div class="rst-grid">
        <section class="rst-card">
          <h3 class="rst-card__title">Categories</h3>
          <div class="rst-list" data-categories-list>
            ${
              categories.length
                ? categories
                    .map(
                      (c) => `
                  <article class="rst-item" data-category-id="${escapeHTML(c.id)}">
                    <div class="rst-item__row">
                      <h4 class="rst-item__title">${escapeHTML(c.name || "Categorie")}</h4>
                      <span class="rst-pill"><span class="rst-dot"></span>#${escapeHTML(c.sort_order)}</span>
                    </div>
                    ${c.description ? `<div class="rst-item__meta">${escapeHTML(c.description)}</div>` : ""}
                    <div class="rst-actions-inline">
                      <button class="rst-btn" type="button" data-action="edit-category">Modifier</button>
                      <button class="rst-btn rst-btn--danger" type="button" data-action="delete-category">Supprimer</button>
                    </div>
                  </article>
                `
                    )
                    .join("")
                : `<div class="rst-empty">${escapeHTML(STR.emptyCategories)}</div>`
            }
          </div>
        </section>

        <section class="rst-card">
          <h3 class="rst-card__title">Items de menu</h3>
          <div class="rst-list" data-items-list>
            ${
              items.length
                ? items
                    .map((it) => {
                      const recipeCount = state.recipes.filter((r) => r.menu_item_id === it.id).length;
                      return `
                        <article class="rst-item" data-item-id="${escapeHTML(it.id)}">
                          ${
                            it.image_url
                              ? `<img class="rst-item__thumb" src="${escapeHTML(it.image_url)}" alt="${escapeHTML(it.name || "Item")}" loading="lazy" />`
                              : ""
                          }
                          <div class="rst-item__row">
                            <div>
                              <h4 class="rst-item__title">${escapeHTML(it.name || "Item")}</h4>
                              <div class="rst-item__meta">${escapeHTML(categoryNameById(it.category_id))}</div>
                            </div>
                            <div style="text-align:right;">
                              <div class="rst-item__title">${escapeHTML(formatMoney(it.price_cents, CONFIG.CURRENCY))}</div>
                              <div class="rst-item__meta">TVA ${escapeHTML(String(it.vat_rate || 0))}%</div>
                            </div>
                          </div>
                          ${it.description ? `<div class="rst-item__meta" style="margin-top:8px;">${escapeHTML(it.description)}</div>` : ""}
                          <div class="rst-actions-inline">
                            <span class="rst-pill"><span class="rst-dot"></span>Recette: ${escapeHTML(String(recipeCount))} produits</span>
                            <span class="rst-pill"><span class="rst-dot"></span>${it.available_for_qr ? "QR" : "Pas QR"}</span>
                            <span class="rst-pill"><span class="rst-dot"></span>${it.available_for_pos ? "POS" : "Pas POS"}</span>
                          </div>
                          <div class="rst-actions-inline">
                            <button class="rst-btn" type="button" data-action="edit-item">Modifier</button>
                            <button class="rst-btn" type="button" data-action="edit-recipe">Recette</button>
                            <button class="rst-btn rst-btn--danger" type="button" data-action="delete-item">Supprimer</button>
                          </div>
                        </article>
                      `;
                    })
                    .join("")
                : `<div class="rst-empty">${escapeHTML(STR.emptyItems)}</div>`
            }
          </div>
        </section>
      </div>
    `;

    const selLocation = els.pane.querySelector("[data-catalog-location]");
    selLocation?.addEventListener("change", () => {
      state.activeLocationId = asUuid(selLocation.value);
      renderPane(els);
    });

    const inputSearch = els.pane.querySelector("[data-catalog-search]");
    inputSearch?.addEventListener("input", () => {
      state.search = inputSearch.value || "";
      renderPane(els);
    });

    els.pane.querySelector('[data-action="add-category"]')?.addEventListener("click", () => openCategoryModal(els, null));
    els.pane.querySelector('[data-action="add-item"]')?.addEventListener("click", () => openItemModal(els, null));

    els.pane.querySelectorAll("[data-category-id]").forEach((card) => {
      const id = card.getAttribute("data-category-id");
      const category = state.categories.find((c) => c.id === id);
      if (!category) return;

      card.querySelector('[data-action="edit-category"]')?.addEventListener("click", () => openCategoryModal(els, category));
      card.querySelector('[data-action="delete-category"]')?.addEventListener("click", async () => {
        if (!confirm("Supprimer cette categorie ?")) return;
        const { error } = await state.supabase.from(CONFIG.CATEGORIES_TABLE).delete().eq("id", category.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return;
        }
        await reloadAndRender(els, STR.deleted);
      });
    });

    els.pane.querySelectorAll("[data-item-id]").forEach((card) => {
      const id = card.getAttribute("data-item-id");
      const item = state.items.find((x) => x.id === id);
      if (!item) return;

      card.querySelector('[data-action="edit-item"]')?.addEventListener("click", () => openItemModal(els, item));
      card.querySelector('[data-action="edit-recipe"]')?.addEventListener("click", () => openRecipeModal(els, item));
      card.querySelector('[data-action="delete-item"]')?.addEventListener("click", async () => {
        if (!confirm("Supprimer cet item ?")) return;
        const { error } = await state.supabase.from(CONFIG.ITEMS_TABLE).delete().eq("id", item.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return;
        }
        await reloadAndRender(els, STR.deleted);
      });
    });
  }

  function statusLabel(status) {
    const s = clean(status);
    if (s === "new") return STR.statusNew;
    if (s === "confirmed") return STR.statusConfirmed;
    if (s === "preparing") return STR.statusPreparing;
    if (s === "ready") return STR.statusReady;
    if (s === "served") return STR.statusServed;
    if (s === "completed") return STR.statusCompleted;
    if (s === "canceled") return STR.statusCanceled;
    return status || "-";
  }

  function orderLocationName(locationId) {
    const loc = state.locations.find((l) => l.id === locationId);
    return loc?.name || "Ligne directe";
  }

  function renderOrdersPane(els) {
    const q = clean(state.search);
    const filter = clean(state.orderFilter || "all");
    const list = (state.orders || []).filter((o) => {
      if (filter !== "all" && clean(o.status) !== filter) return false;
      if (!q) return true;
      const lines = state.orderLinesByOrder.get(String(o.id || "")) || [];
      const lineText = lines.map((l) => `${l.label} ${l.qty}`).join(" ");
      return clean([o.reference, o.customer_name, o.table_label, o.note, o.source, lineText].filter(Boolean).join(" ")).includes(q);
    });

    els.pane.innerHTML = `
      <div class="rst-topbar">
        <div class="rst-topbar__left">
          <select class="rst-select" data-orders-filter>
            <option value="all"${filter === "all" ? " selected" : ""}>${escapeHTML(STR.statusAll)}</option>
            <option value="new"${filter === "new" ? " selected" : ""}>${escapeHTML(STR.statusNew)}</option>
            <option value="confirmed"${filter === "confirmed" ? " selected" : ""}>${escapeHTML(STR.statusConfirmed)}</option>
            <option value="preparing"${filter === "preparing" ? " selected" : ""}>${escapeHTML(STR.statusPreparing)}</option>
            <option value="ready"${filter === "ready" ? " selected" : ""}>${escapeHTML(STR.statusReady)}</option>
            <option value="served"${filter === "served" ? " selected" : ""}>${escapeHTML(STR.statusServed)}</option>
            <option value="completed"${filter === "completed" ? " selected" : ""}>${escapeHTML(STR.statusCompleted)}</option>
            <option value="canceled"${filter === "canceled" ? " selected" : ""}>${escapeHTML(STR.statusCanceled)}</option>
          </select>
          <input class="rst-input" data-orders-search placeholder="Rechercher une commande..." value="${escapeHTML(state.search)}" />
        </div>
      </div>

      <div class="rst-list">
        ${
          list.length
            ? list
                .map((o) => {
                  const lines = state.orderLinesByOrder.get(String(o.id || "")) || [];
                  const linesHtml = lines
                    .map((l) => `<li>${escapeHTML(l.label)} x ${escapeHTML(String(l.qty || 0))} (${escapeHTML(formatMoney(l.total_cents, o.currency || CONFIG.CURRENCY))})</li>`)
                    .join("");

                  return `
                    <article class="rst-item" data-order-id="${escapeHTML(o.id)}">
                      <div class="rst-item__row">
                        <div>
                          <h4 class="rst-item__title">${escapeHTML(o.reference || "Commande")}</h4>
                          <div class="rst-item__meta">${escapeHTML(orderLocationName(o.location_id))} • ${escapeHTML(fmtDateTime(o.created_at))}</div>
                          <div class="rst-item__meta">Source: ${escapeHTML(o.source || "-")} ${o.table_label ? `• Table: ${escapeHTML(o.table_label)}` : ""}</div>
                          ${o.customer_name ? `<div class="rst-item__meta">Client: ${escapeHTML(o.customer_name)}</div>` : ""}
                        </div>
                        <div style="text-align:right;">
                          <span class="rst-pill is-${escapeHTML(clean(o.status))}"><span class="rst-dot"></span>${escapeHTML(statusLabel(o.status))}</span>
                          <div class="rst-item__meta" style="margin-top:8px;">${escapeHTML(formatMoney(o.total_cents, o.currency || CONFIG.CURRENCY))}</div>
                        </div>
                      </div>

                      ${lines.length ? `<ul class="rst-item__meta" style="margin-top:10px; padding-left:18px;">${linesHtml}</ul>` : ""}

                      <div class="rst-actions-inline">
                        <button class="rst-btn" data-order-status="confirmed" type="button">Confirmer</button>
                        <button class="rst-btn" data-order-status="preparing" type="button">Preparation</button>
                        <button class="rst-btn" data-order-status="ready" type="button">Prete</button>
                        <button class="rst-btn" data-order-status="served" type="button">Servie</button>
                        <button class="rst-btn" data-order-status="completed" data-order-paid="1" type="button">Terminee + Payee</button>
                        <button class="rst-btn rst-btn--danger" data-order-status="canceled" type="button">Annuler</button>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : `<div class="rst-empty">${escapeHTML(STR.emptyOrders)}</div>`
        }
      </div>
    `;

    const sel = els.pane.querySelector("[data-orders-filter]");
    sel?.addEventListener("change", () => {
      state.orderFilter = sel.value;
      renderPane(els);
    });

    const input = els.pane.querySelector("[data-orders-search]");
    input?.addEventListener("input", () => {
      state.search = input.value || "";
      renderPane(els);
    });

    els.pane.querySelectorAll("[data-order-id]").forEach((card) => {
      const orderId = card.getAttribute("data-order-id");
      if (!orderId) return;
      card.querySelectorAll("[data-order-status]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const status = String(btn.getAttribute("data-order-status") || "").trim();
          const shouldPaid = btn.getAttribute("data-order-paid") === "1";
          const patch = {
            status,
            updated_at: new Date().toISOString(),
          };
          if (shouldPaid) patch.payment_status = "paid";

          const { error } = await state.supabase.from(CONFIG.ORDERS_TABLE).update(patch).eq("id", orderId);
          if (error) {
            showAlert(els, error.message || STR.loadError, "error");
            return;
          }
          await reloadAndRender(els, STR.saved);
        });
      });
    });
  }

  function renderQrPane(els) {
    const cards = state.locations
      .map((loc) => {
        const hasLinkData = Boolean(String(loc.public_query_key || "").trim()) && Boolean(String(loc.public_access_key || "").trim());
        const isPublished = Boolean(loc.public_is_open) && hasLinkData;
        const publicUrl = isPublished ? orderPublicUrl(loc) : "";
        const qrImg = isPublished ? qrUrlForText(publicUrl) : "";
        return `
          <article class="rst-card" data-qr-location="${escapeHTML(loc.id)}">
            <div class="rst-item__row">
              <div>
                <h3 class="rst-card__title" style="margin:0;">${escapeHTML(loc.name)}</h3>
                <div class="rst-item__meta">Slug interne: ${escapeHTML(loc.slug)}</div>
              </div>
              <span class="rst-pill"><span class="rst-dot"></span>${isPublished ? "QR actif" : "QR supprime"}</span>
            </div>

            <div class="rst-qr" style="margin-top:10px;">
              <div class="rst-qr__top">
                ${
                  hasLinkData && isPublished
                    ? `<img class="rst-qr__img" src="${escapeHTML(qrImg)}" alt="QR ${escapeHTML(loc.name)}" />`
                    : `<div class="rst-qr__placeholder">QR desactive.<br/>Tu peux le reactiver quand tu veux.</div>`
                }
                <div>
                  <div class="rst-qr__muted">URL publique</div>
                  <div class="rst-qr__url">${escapeHTML(publicUrl || "Aucune URL active.")}</div>
                </div>
              </div>

              <div class="rst-qr__fields">
                <label class="full">
                  <span class="rst-label">Page de commande (path)</span>
                  <input class="rst-input" data-k="public_page_path" value="${escapeHTML(loc.public_page_path || CONFIG.ORDER_PAGE_DEFAULT)}" />
                </label>
                <label>
                  <span class="rst-label">Query key (auto)</span>
                  <input class="rst-input" data-k="public_query_key" value="${escapeHTML(loc.public_query_key || "")}" readonly />
                </label>
                <label>
                  <span class="rst-label">Cle publique (auto)</span>
                  <input class="rst-input" data-k="public_access_key" value="${escapeHTML(loc.public_access_key || "")}" readonly />
                </label>
                <label class="full">
                  <span class="rst-label">Statut de commande publique</span>
                  <select class="rst-select" data-k="public_is_open">
                    <option value="1"${loc.public_is_open ? " selected" : ""}>Ouvert</option>
                    <option value="0"${!loc.public_is_open ? " selected" : ""}>Ferme</option>
                  </select>
                </label>
              </div>

              <div class="rst-qr__actions">
                <button class="rst-btn" type="button" data-action="copy-url" ${isPublished ? "" : "disabled"}>Copier URL</button>
                <a class="rst-btn" href="${escapeHTML(qrImg || "#")}" target="_blank" rel="noopener" ${isPublished ? "" : "aria-disabled=\"true\""}>Ouvrir QR</a>
                <button class="rst-btn rst-btn--primary" type="button" data-action="save-qr">Enregistrer</button>
                <button class="rst-btn" type="button" data-action="regen-link">Regenerer lien</button>
                <button class="rst-btn rst-btn--danger" type="button" data-action="toggle-qr">${isPublished ? "Supprimer QR" : "Activer QR"}</button>
                <button class="rst-btn" type="button" data-action="edit-location">Modifier lieu</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    els.pane.innerHTML = `
      <div class="rst-topbar">
        <div class="rst-topbar__left">
          <div class="rst-item__meta">Le QR est genere automatiquement pour chaque page de commande configuree.</div>
        </div>
        <div class="rst-topbar__right">
          <button class="rst-btn" type="button" data-action="add-location">${escapeHTML(STR.addLocation)}</button>
        </div>
      </div>
      <div class="rst-qr-grid">
        ${cards || `<div class="rst-empty">${escapeHTML(STR.emptyLocations)}</div>`}
      </div>
    `;

    els.pane.querySelector('[data-action="add-location"]')?.addEventListener("click", () => openLocationModal(els, null));

    els.pane.querySelectorAll("[data-qr-location]").forEach((card) => {
      const locId = card.getAttribute("data-qr-location");
      const loc = state.locations.find((l) => l.id === locId);
      if (!loc) return;

      card.querySelector('[data-action="copy-url"]')?.addEventListener("click", async () => {
        const rawPath = card.querySelector('[data-k="public_page_path"]')?.value || CONFIG.ORDER_PAGE_DEFAULT;
        const tmpLoc = { ...loc, public_page_path: rawPath };
        const u = orderPublicUrl(tmpLoc);
        try {
          await navigator.clipboard.writeText(u);
          showAlert(els, STR.copyOk, "ok");
          setTimeout(() => showAlert(els, "", ""), 1200);
        } catch (_) {
          showAlert(els, "Impossible de copier le lien.", "error");
        }
      });

      card.querySelector('[data-action="edit-location"]')?.addEventListener("click", () => openLocationModal(els, loc));

      card.querySelector('[data-action="save-qr"]')?.addEventListener("click", async () => {
        const payload = {
          public_page_path: normalizePath(card.querySelector('[data-k="public_page_path"]')?.value || CONFIG.ORDER_PAGE_DEFAULT),
          public_is_open: card.querySelector('[data-k="public_is_open"]')?.value === "1",
          updated_at: new Date().toISOString(),
        };

        const { error } = await state.supabase.from(CONFIG.LOCATIONS_TABLE).update(payload).eq("id", loc.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return;
        }
        await reloadAndRender(els, STR.saved);
      });

      card.querySelector('[data-action="regen-link"]')?.addEventListener("click", async () => {
        if (!confirm("Regenerer la query key et la cle publique de ce QR ?")) return;
        let { error } = await state.supabase
          .from(CONFIG.LOCATIONS_TABLE)
          .update({
            public_query_key: "",
            public_access_key: "",
            updated_at: new Date().toISOString(),
          })
          .eq("id", loc.id);
        if (error && isMissingColumnError(error)) {
          // Backward compatibility if migration 029 is not applied yet.
          error = null;
        }
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return;
        }
        await reloadAndRender(els, STR.saved);
      });

      card.querySelector('[data-action="toggle-qr"]')?.addEventListener("click", async () => {
        const isPublished = Boolean(loc.public_is_open) && Boolean(String(loc.public_query_key || "").trim()) && Boolean(String(loc.public_access_key || "").trim());
        const shouldEnable = !isPublished;
        if (!shouldEnable) {
          if (!confirm("Supprimer ce QR ? Les commandes publiques seront bloquees.")) return;
        }

        let patch = {
          public_is_open: shouldEnable,
          updated_at: new Date().toISOString(),
        };
        if (shouldEnable) {
          patch.public_query_key = "";
          patch.public_access_key = "";
        } else {
          patch.public_query_key = "";
          patch.public_access_key = "";
        }

        let { error } = await state.supabase.from(CONFIG.LOCATIONS_TABLE).update(patch).eq("id", loc.id);
        if (error && isMissingColumnError(error)) {
          const fallback = await state.supabase
            .from(CONFIG.LOCATIONS_TABLE)
            .update({ public_is_open: shouldEnable, updated_at: new Date().toISOString() })
            .eq("id", loc.id);
          error = fallback.error;
        }
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return;
        }
        await reloadAndRender(els, shouldEnable ? STR.qrEnabled : STR.qrDisabled);
      });
    });
  }

  function renderPane(els) {
    if (state.activeTab === "orders") {
      renderOrdersPane(els);
      return;
    }
    if (state.activeTab === "qr") {
      renderQrPane(els);
      return;
    }
    renderCatalogPane(els);
  }

  async function reloadAndRender(els, okMsg) {
    await loadData();
    renderPane(els);
    if (okMsg) {
      showAlert(els, okMsg, "ok");
      setTimeout(() => showAlert(els, "", ""), 1400);
    }
  }

  function openLocationModal(els, loc) {
    const isEdit = Boolean(loc?.id);

    openModal(els, {
      title: isEdit ? "Modifier le lieu" : "Nouveau lieu",
      saveLabel: isEdit ? "Enregistrer" : "Creer",
      canDelete: isEdit,
      bodyHtml: `
        <form class="rst-form" data-location-form>
          <label class="full">
            <span class="rst-label">Nom</span>
            <input class="rst-input" name="name" value="${escapeHTML(loc?.name || "")}" required />
          </label>
          <label>
            <span class="rst-label">Mode de service</span>
            <select class="rst-select" name="service_mode">
              <option value="mixed"${clean(loc?.service_mode) === "mixed" ? " selected" : ""}>Mixte</option>
              <option value="table"${clean(loc?.service_mode) === "table" ? " selected" : ""}>Table</option>
              <option value="counter"${clean(loc?.service_mode) === "counter" ? " selected" : ""}>Comptoir</option>
            </select>
          </label>
          <label>
            <span class="rst-label">Devise</span>
            <input class="rst-input" name="currency" value="${escapeHTML(loc?.currency || CONFIG.CURRENCY)}" maxlength="3" />
          </label>
          <label class="full">
            <span class="rst-label">Page commande (path)</span>
            <input class="rst-input" name="public_page_path" value="${escapeHTML(loc?.public_page_path || CONFIG.ORDER_PAGE_DEFAULT)}" />
          </label>
          <label>
            <span class="rst-label">Query key (auto)</span>
            <input class="rst-input" name="public_query_key" value="${escapeHTML(loc?.public_query_key || "auto")}" readonly />
          </label>
          <label>
            <span class="rst-label">Cle publique (auto)</span>
            <input class="rst-input" name="public_access_key" value="${escapeHTML(loc?.public_access_key || "auto")}" readonly />
          </label>
          <label>
            <span class="rst-label">Commande publique</span>
            <select class="rst-select" name="public_is_open">
              <option value="1"${loc?.public_is_open !== false ? " selected" : ""}>Ouverte</option>
              <option value="0"${loc?.public_is_open === false ? " selected" : ""}>Fermee</option>
            </select>
          </label>
        </form>
      `,
      onSave: async () => {
        const form = els.modalBody.querySelector("[data-location-form]");
        if (!form) return false;

        const payload = {
          organization_id: state.orgId,
          name: String(form.name.value || "").trim(),
          service_mode: String(form.service_mode.value || "mixed").trim(),
          currency: String(form.currency.value || CONFIG.CURRENCY).trim().toUpperCase() || CONFIG.CURRENCY,
          public_page_path: normalizePath(form.public_page_path.value || CONFIG.ORDER_PAGE_DEFAULT),
          public_is_open: form.public_is_open.value === "1",
          updated_at: new Date().toISOString(),
        };

        if (!payload.name) {
          showAlert(els, "Nom requis.", "error");
          return false;
        }

        let res;
        if (isEdit) res = await state.supabase.from(CONFIG.LOCATIONS_TABLE).update(payload).eq("id", loc.id);
        else res = await state.supabase.from(CONFIG.LOCATIONS_TABLE).insert(payload);

        if (res.error) {
          showAlert(els, res.error.message || STR.loadError, "error");
          return false;
        }

        await reloadAndRender(els, STR.saved);
        return true;
      },
      onDelete: async () => {
        if (!isEdit) return true;
        const { error } = await state.supabase.from(CONFIG.LOCATIONS_TABLE).delete().eq("id", loc.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return false;
        }
        if (state.activeLocationId === loc.id) state.activeLocationId = "";
        await reloadAndRender(els, STR.deleted);
        return true;
      },
    });
  }

  function openCategoryModal(els, category) {
    const isEdit = Boolean(category?.id);
    const locId = asUuid(state.activeLocationId);
    if (!locId) {
      showAlert(els, "Selectionne un lieu d'abord.", "error");
      return;
    }

    openModal(els, {
      title: isEdit ? "Modifier categorie" : "Nouvelle categorie",
      saveLabel: isEdit ? "Enregistrer" : "Creer",
      canDelete: isEdit,
      bodyHtml: `
        <form class="rst-form" data-category-form>
          <label class="full">
            <span class="rst-label">Nom</span>
            <input class="rst-input" name="name" value="${escapeHTML(category?.name || "")}" required />
          </label>
          <label class="full">
            <span class="rst-label">Description</span>
            <textarea class="rst-textarea" name="description">${escapeHTML(category?.description || "")}</textarea>
          </label>
          <label>
            <span class="rst-label">Ordre</span>
            <input class="rst-input" name="sort_order" type="number" value="${escapeHTML(String(category?.sort_order ?? 100))}" />
          </label>
          <label>
            <span class="rst-label">Statut</span>
            <select class="rst-select" name="is_active">
              <option value="1"${category?.is_active !== false ? " selected" : ""}>Actif</option>
              <option value="0"${category?.is_active === false ? " selected" : ""}>Inactif</option>
            </select>
          </label>
        </form>
      `,
      onSave: async () => {
        const form = els.modalBody.querySelector("[data-category-form]");
        if (!form) return false;

        const payload = {
          organization_id: state.orgId,
          location_id: locId,
          name: String(form.name.value || "").trim(),
          description: String(form.description.value || "").trim() || null,
          sort_order: Number(form.sort_order.value || 100) || 100,
          is_active: form.is_active.value === "1",
          updated_at: new Date().toISOString(),
        };

        if (!payload.name) {
          showAlert(els, "Nom requis.", "error");
          return false;
        }

        let res;
        if (isEdit) res = await state.supabase.from(CONFIG.CATEGORIES_TABLE).update(payload).eq("id", category.id);
        else res = await state.supabase.from(CONFIG.CATEGORIES_TABLE).insert(payload);

        if (res.error) {
          showAlert(els, res.error.message || STR.loadError, "error");
          return false;
        }
        await reloadAndRender(els, STR.saved);
        return true;
      },
      onDelete: async () => {
        if (!isEdit) return true;
        const { error } = await state.supabase.from(CONFIG.CATEGORIES_TABLE).delete().eq("id", category.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return false;
        }
        await reloadAndRender(els, STR.deleted);
        return true;
      },
    });
  }

  function openItemModal(els, item) {
    const isEdit = Boolean(item?.id);
    const locId = asUuid(state.activeLocationId);
    if (!locId) {
      showAlert(els, "Selectionne un lieu d'abord.", "error");
      return;
    }

    const categoryOptions = categoriesFiltered()
      .map((c) => `<option value="${escapeHTML(c.id)}"${item?.category_id === c.id ? " selected" : ""}>${escapeHTML(c.name)}</option>`)
      .join("");

    const productOptions = [`<option value="">Aucun lien produit</option>`]
      .concat(
        state.products.map((p) => `<option value="${escapeHTML(p.id)}"${item?.product_id === p.id ? " selected" : ""}>${escapeHTML(p.name)}</option>`)
      )
      .join("");

    openModal(els, {
      title: isEdit ? "Modifier item" : "Nouvel item",
      saveLabel: isEdit ? "Enregistrer" : "Creer",
      canDelete: isEdit,
      bodyHtml: `
        <form class="rst-form" data-item-form>
          <label class="full">
            <span class="rst-label">Nom</span>
            <input class="rst-input" name="name" value="${escapeHTML(item?.name || "")}" required />
          </label>
          <label class="full">
            <span class="rst-label">Description</span>
            <textarea class="rst-textarea" name="description">${escapeHTML(item?.description || "")}</textarea>
          </label>
          <label>
            <span class="rst-label">Categorie</span>
            <select class="rst-select" name="category_id">
              <option value="">Sans categorie</option>
              ${categoryOptions}
            </select>
          </label>
          <label>
            <span class="rst-label">Lien produit (optionnel)</span>
            <select class="rst-select" name="product_id">
              ${productOptions}
            </select>
          </label>
          <label>
            <span class="rst-label">Prix HT (EUR)</span>
            <input class="rst-input" name="price" type="number" step="0.01" value="${escapeHTML(String((Number(item?.price_cents || 0) / 100).toFixed(2)))}" />
          </label>
          <label>
            <span class="rst-label">TVA (%)</span>
            <input class="rst-input" name="vat_rate" type="number" step="0.1" value="${escapeHTML(String(item?.vat_rate ?? 10))}" />
          </label>
          <label>
            <span class="rst-label">Disponible QR</span>
            <select class="rst-select" name="available_for_qr">
              <option value="1"${item?.available_for_qr !== false ? " selected" : ""}>Oui</option>
              <option value="0"${item?.available_for_qr === false ? " selected" : ""}>Non</option>
            </select>
          </label>
          <label>
            <span class="rst-label">Disponible POS</span>
            <select class="rst-select" name="available_for_pos">
              <option value="1"${item?.available_for_pos !== false ? " selected" : ""}>Oui</option>
              <option value="0"${item?.available_for_pos === false ? " selected" : ""}>Non</option>
            </select>
          </label>
          <label class="full">
            <span class="rst-label">Image URL (optionnel)</span>
            <input class="rst-input" name="image_url" value="${escapeHTML(item?.image_url || "")}" />
          </label>
          <label class="full">
            <span class="rst-label">Uploader une image (stockage integre)</span>
            <input class="rst-input" name="image_file" type="file" accept="image/*" />
            <div class="rst-item__meta">Format image uniquement. Stockage: bucket ${escapeHTML(CONFIG.MENU_IMAGE_BUCKET)}.</div>
          </label>
          <div class="full" data-image-preview-wrap>
            ${
              item?.image_url
                ? `<img class="rst-image-preview" data-image-preview src="${escapeHTML(item.image_url)}" alt="${escapeHTML(item?.name || "Image menu")}" />`
                : `<div class="rst-image-preview is-empty" data-image-preview>Apercu image</div>`
            }
          </div>
          <div class="full rst-actions-inline">
            <button type="button" class="rst-btn" data-action="clear-image">Supprimer image</button>
          </div>
          <label>
            <span class="rst-label">Preparation (minutes)</span>
            <input class="rst-input" name="prep_minutes" type="number" value="${escapeHTML(String(item?.prep_minutes ?? ""))}" />
          </label>
          <label class="full">
            <span class="rst-label">Allergenes (separes par virgule)</span>
            <input class="rst-input" name="allergens" value="${escapeHTML(Array.isArray(item?.allergen_tags) ? item.allergen_tags.join(", ") : "")}" />
          </label>
          <label>
            <span class="rst-label">Statut</span>
            <select class="rst-select" name="is_active">
              <option value="1"${item?.is_active !== false ? " selected" : ""}>Actif</option>
              <option value="0"${item?.is_active === false ? " selected" : ""}>Inactif</option>
            </select>
          </label>
        </form>
      `,
      onAfterOpen: () => {
        const f = els.modalBody.querySelector("[data-item-form]");
        if (!f) return;
        const fileInput = f.querySelector('[name="image_file"]');
        const preview = f.querySelector("[data-image-preview]");
        const clearBtn = f.querySelector('[data-action="clear-image"]');

        const setPreview = (src) => {
          if (!preview) return;
          if (!src) {
            preview.className = "rst-image-preview is-empty";
            preview.removeAttribute("src");
            preview.textContent = "Apercu image";
            return;
          }
          preview.className = "rst-image-preview";
          preview.textContent = "";
          preview.setAttribute("src", src);
        };

        fileInput?.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) {
            setPreview(String(f.image_url.value || "").trim());
            return;
          }
          if (!String(file.type || "").startsWith("image/")) {
            showAlert(els, "Le fichier selectionne n'est pas une image.", "error");
            fileInput.value = "";
            return;
          }
          const localUrl = URL.createObjectURL(file);
          setPreview(localUrl);
        });

        f.image_url?.addEventListener("input", () => {
          if (fileInput?.files?.length) return;
          setPreview(String(f.image_url.value || "").trim());
        });

        clearBtn?.addEventListener("click", () => {
          f.image_url.value = "";
          if (fileInput) fileInput.value = "";
          setPreview("");
        });
      },
      onSave: async () => {
        const f = els.modalBody.querySelector("[data-item-form]");
        if (!f) return false;

        const price = Number(String(f.price.value || "0").replace(",", "."));
        const vat = Number(String(f.vat_rate.value || "10").replace(",", "."));
        const payload = {
          organization_id: state.orgId,
          location_id: locId,
          category_id: asUuid(f.category_id.value) || null,
          product_id: asUuid(f.product_id.value) || null,
          name: String(f.name.value || "").trim(),
          description: String(f.description.value || "").trim() || null,
          price_cents: Number.isFinite(price) ? Math.max(0, Math.round(price * 100)) : 0,
          vat_rate: Number.isFinite(vat) ? Math.max(0, vat) : 10,
          available_for_qr: f.available_for_qr.value === "1",
          available_for_pos: f.available_for_pos.value === "1",
          image_url: String(f.image_url.value || "").trim() || null,
          prep_minutes: Number.isFinite(Number(f.prep_minutes.value)) ? Number(f.prep_minutes.value) : null,
          allergen_tags: String(f.allergens.value || "")
            .split(",")
            .map((s) => String(s || "").trim())
            .filter(Boolean),
          is_active: f.is_active.value === "1",
          updated_at: new Date().toISOString(),
        };
        const imageFile = f.image_file?.files?.[0] || null;

        if (!payload.name) {
          showAlert(els, "Nom requis.", "error");
          return false;
        }

        let rowId = isEdit ? asUuid(item.id) : "";
        let saveWarn = "";

        if (isEdit) {
          const patch = { ...payload };
          if (imageFile) delete patch.image_url;
          const up = await state.supabase.from(CONFIG.ITEMS_TABLE).update(patch).eq("id", item.id);
          if (up.error) {
            showAlert(els, up.error.message || STR.loadError, "error");
            return false;
          }
        } else {
          const toInsert = { ...payload };
          if (imageFile) delete toInsert.image_url;
          const ins = await state.supabase.from(CONFIG.ITEMS_TABLE).insert(toInsert).select("id").single();
          if (ins.error) {
            showAlert(els, ins.error.message || STR.loadError, "error");
            return false;
          }
          rowId = asUuid(ins.data?.id);
        }

        if (imageFile && rowId) {
          try {
            const uploaded = await uploadMenuImage(imageFile, rowId);
            if (uploaded?.publicUrl) {
              const pic = await state.supabase
                .from(CONFIG.ITEMS_TABLE)
                .update({ image_url: uploaded.publicUrl, updated_at: new Date().toISOString() })
                .eq("id", rowId);
              if (pic.error) throw pic.error;
            }
          } catch (e) {
            const msg = String(e?.message || "").toLowerCase();
            if (msg.includes("bucket")) {
              saveWarn = "Element enregistre, mais upload image impossible. Verifie la migration SQL 030 (bucket restaurant-media).";
            } else {
              saveWarn = `Element enregistre, mais upload image impossible: ${String(e?.message || "erreur")}`;
            }
          }
        }

        await reloadAndRender(els, saveWarn || STR.saved);
        return true;
      },
      onDelete: async () => {
        if (!isEdit) return true;
        const { error } = await state.supabase.from(CONFIG.ITEMS_TABLE).delete().eq("id", item.id);
        if (error) {
          showAlert(els, error.message || STR.loadError, "error");
          return false;
        }
        await reloadAndRender(els, STR.deleted);
        return true;
      },
    });
  }

  function openRecipeModal(els, item) {
    if (!item?.id) return;
    const recipes = state.recipes.filter((r) => r.menu_item_id === item.id);

    function rowHtml(r) {
      const options = [`<option value="">Choisir un produit</option>`]
        .concat(state.products.map((p) => `<option value="${escapeHTML(p.id)}"${r?.product_id === p.id ? " selected" : ""}>${escapeHTML(p.name)}</option>`))
        .join("");
      return `
        <div class="rst-form full recipe-row" style="grid-template-columns: 1fr 120px 120px auto; border:1px solid rgba(15,23,42,0.10); border-radius:12px; padding:10px; align-items:end;">
          <label>
            <span class="rst-label">Produit</span>
            <select class="rst-select" data-k="product_id">${options}</select>
          </label>
          <label>
            <span class="rst-label">Quantite</span>
            <input class="rst-input" data-k="qty" type="number" step="0.001" value="${escapeHTML(String(r?.qty ?? "1"))}" />
          </label>
          <label>
            <span class="rst-label">Unite</span>
            <input class="rst-input" data-k="unit" value="${escapeHTML(r?.unit || "u")}" />
          </label>
          <button type="button" class="rst-btn rst-btn--danger" data-action="remove-row">Retirer</button>
        </div>
      `;
    }

    openModal(els, {
      title: `Recette • ${item.name}`,
      saveLabel: "Enregistrer recette",
      canDelete: false,
      bodyHtml: `
        <div class="rst-item__meta" style="margin-bottom:10px;">Associe cet item aux produits de stock pour decrementation automatique.</div>
        <div class="rst-list" data-recipe-rows>
          ${(recipes.length ? recipes : [null]).map((r) => rowHtml(r)).join("")}
        </div>
        <div class="rst-actions-inline">
          <button class="rst-btn" type="button" data-action="add-row">Ajouter un produit</button>
        </div>
      `,
      onAfterOpen: () => {
        const rowsWrap = els.modalBody.querySelector("[data-recipe-rows]");
        const addBtn = els.modalBody.querySelector('[data-action="add-row"]');

        function bindRowEvents(row) {
          row.querySelector('[data-action="remove-row"]')?.addEventListener("click", () => {
            const all = rowsWrap.querySelectorAll(".recipe-row");
            if (all.length <= 1) {
              row.querySelector('[data-k="product_id"]').value = "";
              row.querySelector('[data-k="qty"]').value = "1";
              row.querySelector('[data-k="unit"]').value = "u";
              return;
            }
            row.remove();
          });
        }

        rowsWrap.querySelectorAll(".recipe-row").forEach(bindRowEvents);

        addBtn?.addEventListener("click", () => {
          const holder = document.createElement("div");
          holder.innerHTML = rowHtml(null);
          const row = holder.firstElementChild;
          rowsWrap.appendChild(row);
          bindRowEvents(row);
        });
      },
      onSave: async () => {
        const rows = Array.from(els.modalBody.querySelectorAll(".recipe-row"));
        const payload = [];

        rows.forEach((row) => {
          const productId = asUuid(row.querySelector('[data-k="product_id"]')?.value || "");
          const qty = Number(row.querySelector('[data-k="qty"]')?.value || "0");
          const unit = String(row.querySelector('[data-k="unit"]')?.value || "u").trim() || "u";
          if (!productId || !Number.isFinite(qty) || qty <= 0) return;
          payload.push({
            organization_id: state.orgId,
            menu_item_id: item.id,
            product_id: productId,
            qty,
            unit,
          });
        });

        const delRes = await state.supabase.from(CONFIG.RECIPES_TABLE).delete().eq("menu_item_id", item.id);
        if (delRes.error) {
          showAlert(els, delRes.error.message || STR.loadError, "error");
          return false;
        }

        if (payload.length) {
          const insRes = await state.supabase.from(CONFIG.RECIPES_TABLE).insert(payload);
          if (insRes.error) {
            showAlert(els, insRes.error.message || STR.loadError, "error");
            return false;
          }
        }

        await reloadAndRender(els, STR.saved);
        return true;
      },
    });
  }

  function wireMainEvents(els) {
    els.tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = String(btn.getAttribute("data-tab") || "catalog").trim();
        state.activeTab = ["catalog", "orders", "qr"].includes(tab) ? tab : "catalog";
        state.search = "";
        state.orderFilter = "all";
        els.tabs.forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
        renderPane(els);
      });
    });

    els.btnRefresh?.addEventListener("click", async () => {
      showAlert(els, "", "");
      await reloadAndRender(els);
    });

    els.btnAddLocation?.addEventListener("click", () => openLocationModal(els, null));

    els.modalClosers.forEach((c) => c.addEventListener("click", () => closeModal(els)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.modal.classList.contains("is-open")) closeModal(els);
    });
  }

  injectStyles();

  try {
    await ensureSupabaseJs();
    state.supabase = getSupabase();
    if (!state.supabase) throw new Error("Supabase non initialise.");

    const user = await getCurrentUser();
    if (!user) {
      renderBlocking({ title: STR.loginTitle, body: STR.loginBody, cta: { label: STR.loginCta, href: CONFIG.LOGIN_PATH } });
      return;
    }

    state.user = user;
    const member = await resolveOrgMember(user.id);
    state.orgId = asUuid(member?.organization_id);
    const role = clean(member?.role);
    state.isAdmin = ["owner", "admin", "manager"].includes(role);

    if (!state.orgId) {
      renderBlocking({ title: STR.loadError, body: "Aucune organisation active." });
      return;
    }

    state.modules = await fetchModules();
    if (!state.isAdmin) {
      renderBlocking({ title: STR.forbiddenTitle, body: STR.forbiddenBody });
      return;
    }

    if (!state.modules || state.modules.restaurant !== true) {
      renderBlocking({
        title: STR.moduleMissingTitle,
        body: STR.moduleMissingBody,
        cta: { label: STR.moduleCta, href: CONFIG.SUBSCRIPTIONS_PATH },
      });
      return;
    }

    const els = renderShell();
    wireMainEvents(els);

    await loadData();
    renderPane(els);
    log("ready", { orgId: state.orgId });
  } catch (e) {
    warn("boot error", e);
    renderBlocking({ title: STR.loadError, body: e?.message || STR.loadError });
  }
});
