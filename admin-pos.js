document.documentElement.setAttribute("data-page", "admin-pos");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblAdminPosLoaded) return;
  window.__mblAdminPosLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-pos]";
  const root = document.querySelector(ROOT_SELECTOR) || document.querySelector("#mbl-pos") || null;
  if (!root) {
    console.error("[POS] Root introuvable. Ajoute <div data-mbl-pos></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[POS]", ...a);
  const warn = (...a) => DEBUG && console.warn("[POS]", ...a);

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

    RESTAURANT_PATH: String(root.dataset.restaurantPath || `${APP_ROOT}/restaurant`).trim(),
    FACTURE_PATH: String(root.dataset.facturePath || `${APP_ROOT}/facturation/invoice`).trim(),
    DEVIS_PATH: String(root.dataset.devisPath || `${APP_ROOT}/facturation/devis-add`).trim(),

    LOCATIONS_TABLE: String(root.dataset.locationsTable || "restaurant_locations"),
    MENU_ITEMS_TABLE: String(root.dataset.menuItemsTable || "restaurant_menu_items"),
    PRODUCTS_TABLE: String(root.dataset.productsTable || "products"),
    ORDERS_TABLE: String(root.dataset.ordersTable || "restaurant_orders"),
    ORDER_LINES_TABLE: String(root.dataset.orderLinesTable || "restaurant_order_lines"),
    PRODUCT_IMAGES_BUCKET: String(root.dataset.productImagesBucket || "product-images").trim() || "product-images",
    MENU_IMAGE_BUCKET: String(root.dataset.menuImageBucket || "restaurant-media").trim() || "restaurant-media",

    CURRENCY: String(root.dataset.currency || "EUR").trim() || "EUR",
    SCANNER_IDLE_MS: Math.max(40, Number(root.dataset.scannerIdleMs || 95) || 95),
    DISPLAY_MODE_STORAGE_KEY: String(root.dataset.displayModeStorageKey || "mbl-pos-display-mode"),
    HIDE_SHELL_IN_TABLET: String(root.dataset.hideShellInTablet || "true").trim().toLowerCase() !== "false",
  };

  const STR = {
    title: "POS",
    subtitle: "Point de vente connecte aux produits, menus et facturation",

    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour acceder au POS.",
    loginCta: "Se connecter",

    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Le POS requiert au moins la facturation ou la restauration dans l'abonnement.",
    moduleCta: "Gerer mon abonnement",

    emptyCatalog: "Aucun article disponible.",
    emptyCart: "Panier vide",

    tabAll: "Tous",
    tabMenus: "Menus",
    tabProducts: "Produits",
    tabCode: "Code",
    modeTabletOn: "Mode tablette: actif",
    modeTabletOff: "Mode tablette",

    save: "Enregistrer",
    createOrder: "Creer la commande",
    createInvoice: "Creer facture",
    createQuote: "Creer devis",
    creating: "Creation...",

    orderCreated: "Commande creee",
    orderFailed: "Impossible de creer la commande.",
    loadError: "Impossible de charger les donnees POS.",
    scannerHint: "Douchette USB: scanner puis Entree. Saisie manuelle possible.",
    scannerNotFound: "Aucun article trouve pour ce code-barres/SKU.",
    imageHint: "Touchez la carte pour ajouter",
    tabletVisibleItems: "Articles visibles",
    tabletMenusCount: "Menus",
    tabletProductsCount: "Produits",
    tabletCartTotal: "Total panier",
    tabletOrderDetails: "Detail commande",
  };

  const state = {
    supabase: null,
    user: null,
    memberRole: "",
    orgId: "",
    modules: {},

    hasBilling: false,
    hasRestaurant: false,

    locations: [],
    menuItems: [],
    products: [],

    activeLocationId: "",
    activeTab: "all",
    search: "",

    cart: [],
    checkout: {
      customer_name: "",
      table_label: "",
      note: "",
      status: "confirmed",
      payment_status: "paid",
    },

    lastOrder: null,
    scanner: {
      buffer: "",
      lastTs: 0,
      bound: false,
    },
    displayMode: loadDisplayMode(),
    imageUrlCache: new Map(),
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

  function clean(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatMoney(cents, currency = CONFIG.CURRENCY) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" });
  }

  function parsePriceToCents(value) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const n = Number(raw.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n * 100));
  }

  function parseQty(value) {
    const n = Number(String(value || "").replace(",", "."));
    if (!Number.isFinite(n)) return 1;
    return Math.max(0.001, n);
  }

  function formatQty(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "1";
    return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(3).replace(/\.?0+$/, "");
  }

  function normalizeCode(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-_.]+/g, "");
  }

  function normalizeStatus(status) {
    const s = clean(status);
    if (["new", "confirmed", "preparing", "ready", "served", "completed", "canceled"].includes(s)) return s;
    return "confirmed";
  }

  function normalizePaymentStatus(status) {
    const s = clean(status);
    if (["unpaid", "partially_paid", "paid", "refunded"].includes(s)) return s;
    return "paid";
  }

  function isMissingColumnError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("column") && msg.includes("does not exist");
  }

  function isAdminRole(role) {
    const r = clean(role);
    return ["owner", "admin", "manager"].includes(r);
  }

  function isRestaurantEmployeeRole(role) {
    const r = clean(role);
    return ["restaurant_employee", "restaurant_staff", "resto_employee", "cashier"].includes(r);
  }

  function normalizePath(path) {
    const p = String(path || "").trim();
    if (!p) return "/";
    if (p.startsWith("http://") || p.startsWith("https://")) {
      try {
        const u = new URL(p);
        return u.pathname + u.search + u.hash;
      } catch (_) {
        return "/";
      }
    }
    if (!p.startsWith("/")) return `/${p}`;
    return p;
  }

  function openPath(path) {
    const target = normalizePath(path);
    try {
      location.href = target;
    } catch (_) {
      location.assign(target);
    }
  }

  function detectTabletDevice() {
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const isIPad = /iPad/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
    const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
    const coarsePointer = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
    const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    const longSide = Math.max(window.innerWidth || 0, window.innerHeight || 0);
    const isTabletViewport = shortSide >= 700 && longSide >= 960;
    return Boolean(isIPad || isAndroidTablet || (coarsePointer && isTabletViewport));
  }

  function loadDisplayMode() {
    try {
      const raw = String(localStorage.getItem(CONFIG.DISPLAY_MODE_STORAGE_KEY) || "").trim().toLowerCase();
      if (raw === "tablet" || raw === "classic") return raw;
    } catch (_) {}
    return detectTabletDevice() ? "tablet" : "classic";
  }

  function saveDisplayMode(mode) {
    const safe = mode === "tablet" ? "tablet" : "classic";
    state.displayMode = safe;
    try {
      localStorage.setItem(CONFIG.DISPLAY_MODE_STORAGE_KEY, safe);
    } catch (_) {}
    applyShellVisibilityForTabletMode();
  }

  function isTabletMode() {
    return state.displayMode === "tablet";
  }

  function applyShellVisibilityForTabletMode() {
    const shouldHide = CONFIG.HIDE_SHELL_IN_TABLET && isTabletMode();
    if (shouldHide) document.documentElement.setAttribute("data-pos-tablet-shell", "1");
    else document.documentElement.removeAttribute("data-pos-tablet-shell");
  }

  async function tryEnterFullscreen() {
    const rootEl = document.documentElement;
    if (!rootEl || document.fullscreenElement) return;
    if (typeof rootEl.requestFullscreen !== "function") return;
    try {
      await rootEl.requestFullscreen();
    } catch (_) {
      // Browser can refuse without direct user gesture (expected on some devices).
    }
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
    const fullSel = "organization_id, role, permissions_mode, permissions, is_default, created_at";
    const baseSel = "organization_id, role, is_default, created_at";
    let res = await state.supabase
      .from("organization_members")
      .select(fullSel)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (res.error && isMissingColumnError(res.error)) {
      res = await state.supabase
        .from("organization_members")
        .select(baseSel)
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
    }

    if (res.error) {
      warn("organization_members read error", res.error);
      return null;
    }
    return res.data?.[0] || null;
  }

  function normalizeStoragePath(value, bucket) {
    const raw = String(value || "").trim().replace(/^\/+/, "");
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:image/")) return "";

    const publicMarker = `/object/public/${bucket}/`;
    const signedMarker = `/object/sign/${bucket}/`;

    if (raw.includes(publicMarker)) {
      return raw.split(publicMarker)[1] || "";
    }
    if (raw.includes(signedMarker)) {
      const after = raw.split(signedMarker)[1] || "";
      return after.split("?")[0] || "";
    }
    if (raw.startsWith(`${bucket}/`)) {
      return raw.slice(bucket.length + 1);
    }
    return raw;
  }

  function withCacheBust(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    return `${u}${u.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  async function resolveStorageImageUrl(bucket, pathLike) {
    const objectPath = normalizeStoragePath(pathLike, bucket);
    if (!objectPath) return "";
    const key = `${bucket}:${objectPath}`;
    if (state.imageUrlCache.has(key)) return state.imageUrlCache.get(key) || "";

    try {
      const signed = await state.supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
      const signedUrl = signed?.data?.signedUrl || "";
      if (!signed?.error && signedUrl) {
        const final = withCacheBust(signedUrl);
        state.imageUrlCache.set(key, final);
        return final;
      }
    } catch (_) {}

    try {
      const pub = state.supabase.storage.from(bucket).getPublicUrl(objectPath);
      const publicUrl = String(pub?.data?.publicUrl || "").trim();
      if (publicUrl) {
        const final = withCacheBust(publicUrl);
        state.imageUrlCache.set(key, final);
        return final;
      }
    } catch (_) {}

    state.imageUrlCache.set(key, "");
    return "";
  }

  async function resolveCatalogImageForProduct(row) {
    const direct = String(row?.image_url || row?.photo_url || row?.thumbnail_url || "").trim();
    if (/^https?:\/\//i.test(direct) || direct.startsWith("data:image/")) return withCacheBust(direct);
    if (direct) {
      const fromDirectPath = await resolveStorageImageUrl(CONFIG.PRODUCT_IMAGES_BUCKET, direct);
      if (fromDirectPath) return fromDirectPath;
    }
    const imagePath = String(row?.image_path || "").trim();
    if (imagePath) {
      const fromPath = await resolveStorageImageUrl(CONFIG.PRODUCT_IMAGES_BUCKET, imagePath);
      if (fromPath) return fromPath;
    }
    return "";
  }

  async function resolveCatalogImageForMenu(row) {
    const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const direct = String(row?.image_url || meta.image_url || meta.image || meta.photo_url || meta.cover_url || "").trim();
    if (/^https?:\/\//i.test(direct) || direct.startsWith("data:image/")) return withCacheBust(direct);
    if (direct) {
      const fromDirectPath = await resolveStorageImageUrl(CONFIG.MENU_IMAGE_BUCKET, direct);
      if (fromDirectPath) return fromDirectPath;
    }

    const pathLike = String(meta.image_path || meta.photo_path || "").trim();
    if (pathLike) {
      const fromPath = await resolveStorageImageUrl(CONFIG.MENU_IMAGE_BUCKET, pathLike);
      if (fromPath) return fromPath;
    }
    return "";
  }

  async function hydrateCatalogImageUrls() {
    if (state.products.length) {
      await Promise.all(
        state.products.map(async (row) => {
          row._display_image_url = await resolveCatalogImageForProduct(row);
        })
      );
    }

    if (state.menuItems.length) {
      await Promise.all(
        state.menuItems.map(async (row) => {
          row._display_image_url = await resolveCatalogImageForMenu(row);
        })
      );
    }
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

  function canAccessPos(member) {
    const role = clean(member?.role);
    if (isAdminRole(role) || isRestaurantEmployeeRole(role)) return true;
    const mode = clean(member?.permissions_mode);
    const perms = member?.permissions && typeof member.permissions === "object" ? member.permissions : {};
    if (mode === "custom" && perms.pos === true) return true;
    return false;
  }

  function injectStyles() {
    if (document.getElementById("mbl-pos-style")) return;
    const st = document.createElement("style");
    st.id = "mbl-pos-style";
    st.textContent = `
      html[data-page="admin-pos"] .pos-shell,
      html[data-page="admin-pos"] .pos-shell * { box-sizing: border-box; }
      html[data-page="admin-pos"][data-pos-tablet-shell="1"] body {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      html[data-page="admin-pos"][data-pos-tablet-shell="1"] .mbl-app-shell,
      html[data-page="admin-pos"][data-pos-tablet-shell="1"] .mbl-app-shell__overlay,
      html[data-page="admin-pos"][data-pos-tablet-shell="1"] .mbl-app-shell__burger {
        display: none !important;
      }

      html[data-page="admin-pos"] .pos-shell {
        --pos-primary: #0ea5e9;
        --pos-text: rgba(2,6,23,0.90);
        --pos-muted: rgba(2,6,23,0.62);
        --pos-border: rgba(15,23,42,0.11);
        --pos-card: rgba(255,255,255,0.90);
        width: min(1280px, 100%);
        margin: 0 auto;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--pos-border);
        background:
          radial-gradient(900px 520px at 8% 0%, rgba(14,165,233,0.14), transparent 55%),
          radial-gradient(920px 560px at 95% 8%, rgba(2,6,23,0.09), transparent 58%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.95));
        box-shadow: 0 22px 60px rgba(2,6,23,0.10);
        color: var(--pos-text);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] {
        --pos-primary: #ff8a00;
        --pos-text: rgba(241,245,249,0.96);
        --pos-muted: rgba(203,213,225,0.82);
        --pos-border: rgba(148,163,184,0.22);
        --pos-card: rgba(10,16,32,0.72);
        background:
          radial-gradient(900px 600px at -10% -20%, rgba(255,138,0,0.24), transparent 60%),
          radial-gradient(1000px 620px at 120% 0%, rgba(14,165,233,0.20), transparent 58%),
          linear-gradient(180deg, rgba(8,12,24,0.96), rgba(6,10,20,0.98));
        border-color: rgba(148,163,184,0.26);
        box-shadow: 0 30px 80px rgba(2,6,23,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      }

      html[data-page="admin-pos"] .pos-head {
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 12px;
      }
      html[data-page="admin-pos"] .pos-head__actions {
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      html[data-page="admin-pos"] .pos-title { margin:0; font-size: 24px; font-weight: 1000; letter-spacing: -0.02em; }
      html[data-page="admin-pos"] .pos-subtitle { margin: 4px 0 0; color: var(--pos-muted); font-weight: 800; }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-title {
        color: rgba(248,250,252,0.98);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-subtitle {
        color: rgba(203,213,225,0.80);
      }

      html[data-page="admin-pos"] .pos-alert {
        display:none;
        margin-top: 10px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 10px 12px;
        font-weight: 800;
      }
      html[data-page="admin-pos"] .pos-alert.is-error {
        display:block;
        border-color: rgba(239,68,68,0.30);
        background: rgba(254,242,242,0.95);
        color: rgba(153,27,27,0.92);
      }
      html[data-page="admin-pos"] .pos-alert.is-ok {
        display:block;
        border-color: rgba(34,197,94,0.30);
        background: rgba(240,253,244,0.95);
        color: rgba(20,83,45,0.92);
      }

      html[data-page="admin-pos"] .pos-grid {
        display:grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 12px;
        margin-top: 12px;
      }

      html[data-page="admin-pos"] .pos-card {
        border: 1px solid var(--pos-border);
        background: var(--pos-card);
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 14px 28px rgba(2,6,23,0.07);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-card {
        background: linear-gradient(180deg, rgba(15,23,42,0.72), rgba(15,23,42,0.62));
        border-color: rgba(148,163,184,0.22);
        box-shadow: 0 22px 34px rgba(2,6,23,0.36);
        backdrop-filter: blur(8px);
      }

      html[data-page="admin-pos"] .pos-card__title {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 1000;
      }

      html[data-page="admin-pos"] .pos-topbar,
      html[data-page="admin-pos"] .pos-topbar__left,
      html[data-page="admin-pos"] .pos-topbar__right {
        display:flex;
        gap: 8px;
        align-items:center;
        flex-wrap: wrap;
      }
      html[data-page="admin-pos"] .pos-topbar { justify-content: space-between; margin-bottom: 10px; }

      html[data-page="admin-pos"] .pos-scan {
        margin: 0 0 10px;
        border: 1px solid rgba(14,165,233,0.24);
        border-radius: 14px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(240,249,255,0.92), rgba(255,255,255,0.96));
        display: grid;
        gap: 8px;
      }
      html[data-page="admin-pos"] .pos-scan__row {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) 90px minmax(110px, auto);
        gap: 8px;
        align-items: end;
      }
      html[data-page="admin-pos"] .pos-scan__hint {
        font-size: 12px;
        font-weight: 800;
        color: rgba(2,6,23,0.64);
      }
      html[data-page="admin-pos"] .pos-scan__label {
        display: block;
        margin: 0 0 5px;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: rgba(2,6,23,0.62);
      }

      html[data-page="admin-pos"] .pos-input,
      html[data-page="admin-pos"] .pos-select,
      html[data-page="admin-pos"] .pos-textarea {
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.96);
        border-radius: 12px;
        padding: 10px 12px;
        outline: none;
        color: rgba(2,6,23,0.88);
        width: 100%;
        min-width: 0;
      }
      html[data-page="admin-pos"] .pos-input,
      html[data-page="admin-pos"] .pos-select { height: 40px; }
      html[data-page="admin-pos"] .pos-textarea { min-height: 76px; resize: vertical; }
      html[data-page="admin-pos"] .pos-input:focus,
      html[data-page="admin-pos"] .pos-select:focus,
      html[data-page="admin-pos"] .pos-textarea:focus {
        border-color: rgba(14,165,233,0.45);
        box-shadow: 0 0 0 4px rgba(14,165,233,0.12);
      }

      html[data-page="admin-pos"] .pos-btn {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.90);
        height: 40px;
        padding: 0 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        transition: transform .12s ease, border-color .16s ease, box-shadow .16s ease;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn {
        background: rgba(30,41,59,0.82);
        color: rgba(241,245,249,0.95);
        border-color: rgba(148,163,184,0.30);
      }
      html[data-page="admin-pos"] .pos-btn:hover {
        transform: translateY(-1px);
        border-color: rgba(14,165,233,0.40);
        box-shadow: 0 10px 22px rgba(2,6,23,0.10);
      }
      html[data-page="admin-pos"] .pos-btn:disabled {
        opacity: 0.62;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      html[data-page="admin-pos"] .pos-btn--primary {
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        color: #fff;
        border-color: rgba(14,165,233,0.58);
      }
      html[data-page="admin-pos"] .pos-btn--checkout {
        min-width: 180px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn--primary {
        background: linear-gradient(180deg, rgba(255,144,32,0.98), rgba(245,124,0,0.98));
        border-color: rgba(251,146,60,0.72);
        color: #fff;
        box-shadow: 0 16px 28px rgba(245,124,0,0.30);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn--checkout {
        min-height: 46px;
        font-size: 15px;
        letter-spacing: 0.02em;
      }
      html[data-page="admin-pos"] .pos-btn--ok {
        border-color: rgba(34,197,94,0.36);
        color: rgba(21,128,61,0.96);
      }
      html[data-page="admin-pos"] .pos-btn--tablet[aria-pressed="true"] {
        background: rgba(14,165,233,0.18);
        border-color: rgba(14,165,233,0.44);
        color: rgba(12,74,110,0.98);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn--tablet[aria-pressed="true"] {
        background: rgba(251,146,60,0.18);
        border-color: rgba(251,146,60,0.52);
        color: rgba(255,237,213,0.98);
      }

      html[data-page="admin-pos"] .pos-tabs { display:flex; gap: 8px; }
      html[data-page="admin-pos"] .pos-tab {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.85);
        color: rgba(2,6,23,0.82);
        height: 36px;
        border-radius: 999px;
        padding: 0 12px;
        font-weight: 900;
        cursor: pointer;
      }
      html[data-page="admin-pos"] .pos-tab[aria-selected="true"] {
        border-color: rgba(14,165,233,0.38);
        background: rgba(14,165,233,0.16);
        color: rgba(12,74,110,0.95);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tab {
        background: rgba(30,41,59,0.74);
        color: rgba(226,232,240,0.92);
        border-color: rgba(148,163,184,0.28);
        border-radius: 10px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tab[aria-selected="true"] {
        border-color: rgba(251,146,60,0.52);
        background: rgba(251,146,60,0.18);
        color: rgba(255,237,213,0.98);
      }

      html[data-page="admin-pos"] .pos-catalog {
        display:grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
      }
      html[data-page="admin-pos"] .pos-catalog.pos-catalog--tablet {
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 12px;
      }
      html[data-page="admin-pos"] .pos-item {
        border: 1px solid rgba(15,23,42,0.11);
        border-radius: 14px;
        background: rgba(255,255,255,0.93);
        padding: 10px;
        display:grid;
        gap: 8px;
      }
      html[data-page="admin-pos"] .pos-item--tablet {
        padding: 0;
        overflow: hidden;
        gap: 0;
        cursor: pointer;
      }
      html[data-page="admin-pos"] .pos-item--tablet:hover {
        border-color: rgba(251,146,60,0.38);
        box-shadow: 0 16px 28px rgba(2,6,23,0.24);
      }
      html[data-page="admin-pos"] .pos-item__media {
        position: relative;
        width: 100%;
        aspect-ratio: 4/3;
        overflow: hidden;
        background: linear-gradient(135deg, rgba(14,165,233,0.20), rgba(2,6,23,0.08));
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__media {
        aspect-ratio: 16/10;
        background: linear-gradient(135deg, rgba(59,130,246,0.22), rgba(251,146,60,0.16));
      }
      html[data-page="admin-pos"] .pos-item__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      html[data-page="admin-pos"] .pos-item__placeholder {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: rgba(12,74,110,0.96);
        font-weight: 1000;
        font-size: 22px;
        letter-spacing: -0.02em;
      }
      html[data-page="admin-pos"] .pos-item__overlay {
        position: absolute;
        inset: auto 0 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: linear-gradient(180deg, rgba(15,23,42,0), rgba(15,23,42,0.72));
        color: #fff;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__overlay {
        padding: 10px 10px;
      }
      html[data-page="admin-pos"] .pos-item__overlay strong {
        font-size: 13px;
        font-weight: 900;
      }
      html[data-page="admin-pos"] .pos-item__overlay span {
        font-size: 11px;
        font-weight: 800;
        opacity: 0.9;
      }
      html[data-page="admin-pos"] .pos-item__body {
        display: grid;
        gap: 8px;
        padding: 10px;
      }
      html[data-page="admin-pos"] .pos-item__body--tablet {
        padding: 10px 10px 12px;
        gap: 6px;
      }
      html[data-page="admin-pos"] .pos-item__name-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      html[data-page="admin-pos"] .pos-item__plus {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(15,23,42,0.64);
        color: #fff;
        font-weight: 1000;
        cursor: pointer;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__title {
        color: rgba(248,250,252,0.96);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__meta {
        color: rgba(203,213,225,0.78);
      }
      html[data-page="admin-pos"] .pos-item__cta {
        font-size: 11px;
        font-weight: 900;
        color: rgba(12,74,110,0.95);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__cta {
        color: rgba(251,191,36,0.92);
      }
      html[data-page="admin-pos"] .pos-item__title {
        margin:0;
        font-size: 14px;
        font-weight: 950;
      }
      html[data-page="admin-pos"] .pos-item__meta {
        font-size: 12px;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
      }
      html[data-page="admin-pos"] .pos-item__chips {
        display:flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      html[data-page="admin-pos"] .pos-chip {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(248,250,252,0.92);
        color: rgba(2,6,23,0.70);
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 900;
      }

      html[data-page="admin-pos"] .pos-cart-list {
        display:grid;
        gap: 8px;
        max-height: 42vh;
        overflow: auto;
      }
      html[data-page="admin-pos"] .pos-cart-item {
        border: 1px solid rgba(15,23,42,0.12);
        border-radius: 12px;
        background: rgba(255,255,255,0.94);
        padding: 9px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item {
        background: rgba(15,23,42,0.72);
        border-color: rgba(148,163,184,0.26);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item__name {
        color: rgba(248,250,252,0.96);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item__meta {
        color: rgba(203,213,225,0.80);
      }
      html[data-page="admin-pos"] .pos-cart-item__row {
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 8px;
      }
      html[data-page="admin-pos"] .pos-cart-item__name {
        margin:0;
        font-size: 13px;
        font-weight: 950;
      }
      html[data-page="admin-pos"] .pos-cart-item__meta {
        margin-top: 3px;
        font-size: 11px;
        color: rgba(2,6,23,0.60);
        font-weight: 800;
      }
      html[data-page="admin-pos"] .pos-qty {
        display:inline-flex;
        align-items:center;
        gap: 4px;
      }
      html[data-page="admin-pos"] .pos-qty button {
        width: 26px;
        height: 26px;
        border-radius: 8px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.96);
        cursor:pointer;
        font-weight: 900;
      }
      html[data-page="admin-pos"] .pos-qty input {
        width: 64px;
        height: 26px;
        border-radius: 8px;
        border: 1px solid rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.98);
        text-align: center;
        font-weight: 900;
        padding: 0 4px;
      }

      html[data-page="admin-pos"] .pos-summary {
        margin-top: 10px;
        border-top: 1px dashed rgba(15,23,42,0.16);
        padding-top: 10px;
        display:grid;
        gap: 6px;
      }
      html[data-page="admin-pos"] .pos-summary__line {
        display:flex;
        justify-content: space-between;
        align-items:center;
        font-weight: 900;
      }
      html[data-page="admin-pos"] .pos-summary__line.total {
        font-size: 18px;
        color: rgba(12,74,110,0.95);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-summary {
        margin-top: 12px;
      }

      html[data-page="admin-pos"] .pos-empty {
        border: 1px dashed rgba(15,23,42,0.22);
        border-radius: 12px;
        background: rgba(255,255,255,0.86);
        color: rgba(2,6,23,0.60);
        font-weight: 800;
        text-align: center;
        padding: 18px 10px;
      }

      html[data-page="admin-pos"] .pos-block {
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 14px;
        background: rgba(255,255,255,0.92);
        padding: 10px;
      }

      html[data-page="admin-pos"] .pos-tablet-overview {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
      }
      html[data-page="admin-pos"] .pos-kpi {
        border: 1px solid rgba(15,23,42,0.12);
        border-radius: 12px;
        background: rgba(255,255,255,0.92);
        padding: 10px 10px;
        display: grid;
        gap: 4px;
      }
      html[data-page="admin-pos"] .pos-kpi span {
        font-size: 11px;
        color: rgba(2,6,23,0.62);
        font-weight: 800;
      }
      html[data-page="admin-pos"] .pos-kpi strong {
        font-size: 16px;
        color: rgba(2,6,23,0.92);
        font-weight: 1000;
      }
      html[data-page="admin-pos"] .pos-order-head {
        border: 1px solid rgba(15,23,42,0.12);
        border-radius: 12px;
        background: rgba(255,255,255,0.92);
        padding: 10px;
        display: grid;
        gap: 6px;
        margin-bottom: 10px;
      }
      html[data-page="admin-pos"] .pos-order-head__line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 800;
      }
      html[data-page="admin-pos"] .pos-order-head__line.is-total {
        font-size: 15px;
        color: rgba(12,74,110,0.95);
      }

      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-grid {
        grid-template-columns: minmax(0, 1.32fr) minmax(320px, 0.68fr);
        gap: 14px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-card {
        padding: 14px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-topbar {
        margin-bottom: 8px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-topbar__left {
        width: 100%;
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr);
        gap: 8px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-scan {
        margin-bottom: 8px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-scan__hint {
        display: none;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tabs {
        overflow: auto;
        white-space: nowrap;
        padding-bottom: 2px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tab {
        border-radius: 10px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-catalog.pos-catalog--tablet {
        grid-template-columns: repeat(auto-fill, minmax(162px, 1fr));
        gap: 10px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item--tablet {
        border-radius: 12px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__media {
        aspect-ratio: 16/10;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__overlay {
        padding: 8px 10px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__chips {
        gap: 5px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-chip {
        font-size: 10px;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-list {
        max-height: 48vh;
      }

      /* Tablet architecture only: keep the same design palette as classic mode */
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] {
        --pos-primary: #0ea5e9;
        --pos-text: rgba(2,6,23,0.90);
        --pos-muted: rgba(2,6,23,0.62);
        --pos-border: rgba(15,23,42,0.11);
        --pos-card: rgba(255,255,255,0.90);
        background:
          radial-gradient(900px 520px at 8% 0%, rgba(14,165,233,0.14), transparent 55%),
          radial-gradient(920px 560px at 95% 8%, rgba(2,6,23,0.09), transparent 58%),
          linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.95));
        border-color: rgba(15,23,42,0.11);
        box-shadow: 0 22px 60px rgba(2,6,23,0.10);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-title,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-subtitle,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-card__title,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__title,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__meta,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item__name,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item__meta {
        color: inherit;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-card,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-block,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-cart-item,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-order-head,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-kpi {
        background: rgba(255,255,255,0.92);
        border-color: rgba(15,23,42,0.11);
        box-shadow: 0 14px 28px rgba(2,6,23,0.07);
        backdrop-filter: none;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn {
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.90);
        border-color: rgba(15,23,42,0.12);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn--primary {
        background: linear-gradient(180deg, rgba(14,165,233,0.98), rgba(2,132,199,0.98));
        border-color: rgba(14,165,233,0.58);
        color: #fff;
        box-shadow: none;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-btn--tablet[aria-pressed="true"] {
        background: rgba(14,165,233,0.18);
        border-color: rgba(14,165,233,0.44);
        color: rgba(12,74,110,0.98);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tab {
        background: rgba(255,255,255,0.85);
        color: rgba(2,6,23,0.82);
        border-color: rgba(15,23,42,0.12);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-tab[aria-selected="true"] {
        border-color: rgba(14,165,233,0.38);
        background: rgba(14,165,233,0.16);
        color: rgba(12,74,110,0.95);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__media {
        background: linear-gradient(135deg, rgba(14,165,233,0.20), rgba(2,6,23,0.08));
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-item__plus {
        border-color: rgba(15,23,42,0.14);
        background: rgba(255,255,255,0.96);
        color: rgba(2,6,23,0.9);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-summary__line.total,
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-order-head__line.is-total {
        color: rgba(12,74,110,0.95);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] {
        width: 100vw;
        max-width: none;
        min-height: 100dvh;
        border-radius: 0;
        margin-top: 0;
        margin-bottom: 0;
        margin-left: calc(50% - 50vw);
        margin-right: calc(50% - 50vw);
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-grid {
        min-height: calc(100dvh - 150px);
        align-items: stretch;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-card {
        height: 100%;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] [data-panel-catalog] {
        overflow: visible;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] [data-panel-cart] {
        overflow: auto;
      }

      html[data-page="admin-pos"] .pos-custom-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) 90px 120px 90px 120px;
        gap: 8px;
        align-items: end;
      }
      html[data-page="admin-pos"] .pos-custom-grid > * {
        min-width: 0;
      }
      html[data-page="admin-pos"] .pos-custom-grid label {
        display: block;
        min-width: 0;
      }
      html[data-page="admin-pos"] .pos-custom-grid .pos-btn {
        width: 100%;
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-custom-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-custom-grid [data-custom-wrap="name"],
      html[data-page="admin-pos"] .pos-shell[data-display-mode="tablet"] .pos-custom-grid [data-action="add-custom"] {
        grid-column: 1 / -1;
      }

      @media (max-width: 1080px) {
        html[data-page="admin-pos"] .pos-grid { grid-template-columns: 1fr; }
        html[data-page="admin-pos"] .pos-cart-list { max-height: none; }
        html[data-page="admin-pos"] .pos-custom-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        html[data-page="admin-pos"] .pos-custom-grid [data-custom-wrap="name"] {
          grid-column: 1 / -1;
        }
        html[data-page="admin-pos"] .pos-custom-grid [data-action="add-custom"] {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 760px) {
        html[data-page="admin-pos"] .pos-head {
          flex-direction: column;
          align-items: stretch;
        }
        html[data-page="admin-pos"] .pos-head__actions {
          justify-content: flex-start;
        }
        html[data-page="admin-pos"] .pos-scan__row { grid-template-columns: 1fr 88px; }
        html[data-page="admin-pos"] .pos-scan__row .pos-btn { grid-column: 1 / -1; }
        html[data-page="admin-pos"] .pos-custom-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(st);
  }

  function renderBlocking({ title, body, cta }) {
    root.innerHTML = `
      <section class="pos-shell">
        <div class="pos-card">
          <h2 class="pos-title" style="font-size:20px;">${escapeHTML(title || "")}</h2>
          <p class="pos-subtitle" style="margin-top:8px;">${escapeHTML(body || "")}</p>
          ${
            cta
              ? `<div style="margin-top:12px;"><a class="pos-btn pos-btn--primary" href="${escapeHTML(
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

  function showAlert(els, text, type) {
    if (!els?.alert) return;
    const t = String(text || "").trim();
    if (!t) {
      els.alert.className = "pos-alert";
      els.alert.textContent = "";
      return;
    }
    els.alert.className = "pos-alert " + (type === "error" ? "is-error" : "is-ok");
    els.alert.textContent = t;
  }

  function cartLineTotal(line) {
    const qty = Number(line?.qty || 0);
    const unit = Number(line?.unit_price_cents || 0);
    return Math.round(qty * unit);
  }

  function cartTotals() {
    const subtotal = state.cart.reduce((acc, line) => acc + cartLineTotal(line), 0);
    const vat = state.cart.reduce((acc, line) => {
      const rate = Number(line?.vat_rate || 0);
      return acc + Math.round(cartLineTotal(line) * rate / 100);
    }, 0);
    return {
      subtotal,
      vat,
      total: subtotal + vat,
    };
  }

  function locationNameById(id) {
    const loc = state.locations.find((l) => String(l.id) === String(id));
    return loc?.name || "Sans lieu";
  }

  function makeMenuRow(it) {
    const meta = it?.metadata && typeof it.metadata === "object" ? it.metadata : {};
    return {
      kind: "menu_item",
      id: String(it.id),
      location_id: String(it.location_id || ""),
      name: String(it.name || "Item menu"),
      description: String(it.description || ""),
      unit_price_cents: Number(it.price_cents || 0),
      vat_rate: Number(it.vat_rate || 10),
      badge: "Menu",
      barcode: String(meta.barcode || "").trim(),
      sku: String(meta.sku || "").trim(),
      image_url: String(it.image_url || meta.image_url || meta.image || meta.photo_url || meta.cover_url || "").trim(),
      image_path: String(meta.image_path || meta.photo_path || "").trim(),
      _display_image_url: String(it._display_image_url || "").trim(),
    };
  }

  function makeProductRow(p) {
    return {
      kind: "product",
      id: String(p.id),
      location_id: "",
      name: String(p.name || "Produit"),
      description: String(p.description || ""),
      unit_price_cents: Number(p.price_cents || 0),
      vat_rate: 20,
      badge: "Produit",
      barcode: String(p.barcode || "").trim(),
      sku: String(p.sku || "").trim(),
      image_url: String(p.image_url || p.photo_url || p.thumbnail_url || "").trim(),
      image_path: String(p.image_path || "").trim(),
      _display_image_url: String(p._display_image_url || "").trim(),
    };
  }

  function resolveCatalogImageUrl(row) {
    const src = String(row?._display_image_url || row?.image_url || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    if (src.startsWith("data:image/")) return src;
    return "";
  }

  function rowInitials(row) {
    const words = String(row?.name || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "POS";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase();
  }

  function buildCatalogRows() {
    const q = clean(state.search);
    const locId = asUuid(state.activeLocationId);

    const rows = [];

    if (state.hasRestaurant && (state.activeTab === "all" || state.activeTab === "menus")) {
      state.menuItems.forEach((it) => {
        if (locId && String(it.location_id) !== locId) return;
        const hay = clean([it.name, it.description, it.id, it.location_id].filter(Boolean).join(" "));
        if (q && !hay.includes(q)) return;
        rows.push(makeMenuRow(it));
      });
    }

    if (state.hasBilling && (state.activeTab === "all" || state.activeTab === "products")) {
      state.products.forEach((p) => {
        const hay = clean([p.name, p.sku, p.barcode, p.description, p.id].filter(Boolean).join(" "));
        if (q && !hay.includes(q)) return;
        rows.push(makeProductRow(p));
      });
    }

    rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
    });

    return rows;
  }

  function getCatalogStats(rows) {
    const menus = rows.filter((r) => r.kind === "menu_item").length;
    const products = rows.filter((r) => r.kind === "product").length;
    const visible = rows.length;
    const cartTotal = cartTotals().total;
    return { menus, products, visible, cartTotal };
  }

  function resolveRowByCode(rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) return null;

    if (state.hasBilling) {
      const product = state.products.find((p) => {
        const barcode = normalizeCode(p.barcode || "");
        const sku = normalizeCode(p.sku || "");
        return (barcode && barcode === code) || (sku && sku === code);
      });
      if (product) return makeProductRow(product);
    }

    if (state.hasRestaurant) {
      const menu = state.menuItems.find((it) => {
        const metaCode = normalizeCode(it?.metadata?.barcode || it?.metadata?.sku || "");
        return metaCode && metaCode === code;
      });
      if (menu) return makeMenuRow(menu);
    }

    return null;
  }

  function addCatalogRowToCart(row, qtyToAdd = 1) {
    const qty = Math.max(0.001, Number(qtyToAdd || 1));
    const key = `${row.kind}:${row.id}`;
    const existing = state.cart.find((it) => `${it.kind}:${it.id}` === key);
    if (existing) {
      existing.qty = Math.max(0.001, Number(existing.qty || 0) + qty);
      return;
    }

    state.cart.push({
      kind: row.kind,
      id: row.id,
      name: row.name,
      unit: row.kind === "menu_item" ? "menu" : "u",
      qty,
      unit_price_cents: Number(row.unit_price_cents || 0),
      vat_rate: Number(row.vat_rate || 0),
      location_id: row.location_id || "",
      note: "",
    });
  }

  function addByCode(els, code, qty = 1, source = "manual") {
    const row = resolveRowByCode(code);
    if (!row) {
      showAlert(els, STR.scannerNotFound, "error");
      return false;
    }
    addCatalogRowToCart(row, qty);
    renderCartPanel(els);
    showAlert(els, `${row.name} x${formatQty(qty)} ajoute (${source}).`, "ok");
    return true;
  }

  function shouldIgnoreScannerKey(target) {
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.closest('[data-pos-scan-input="1"]')) return false;
    if (el.closest("input, textarea, select, [contenteditable='true']")) return true;
    return false;
  }

  function bindHardwareScanner(els) {
    if (state.scanner.bound) return;
    state.scanner.bound = true;

    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (shouldIgnoreScannerKey(e.target)) return;

      const now = Date.now();
      const idle = now - Number(state.scanner.lastTs || 0);
      if (idle > CONFIG.SCANNER_IDLE_MS) state.scanner.buffer = "";

      if (e.key === "Enter") {
        const code = String(state.scanner.buffer || "").trim();
        state.scanner.buffer = "";
        state.scanner.lastTs = now;
        if (!code || code.length < 4) return;
        e.preventDefault();
        addByCode(els, code, 1, "scanner");
        return;
      }

      if (e.key.length !== 1) return;

      const next = `${state.scanner.buffer || ""}${e.key}`;
      state.scanner.buffer = next.slice(-80);
      state.scanner.lastTs = now;
    });
  }

  function removeCartLine(index) {
    state.cart.splice(index, 1);
  }

  function upsertCustomLine({ name, qty, unit_price_cents, vat_rate, unit }) {
    state.cart.push({
      kind: "custom",
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      unit: unit || "u",
      qty,
      unit_price_cents,
      vat_rate,
      note: "",
    });
  }

  function renderApp() {
    applyShellVisibilityForTabletMode();
    root.innerHTML = `
      <section class="pos-shell${isTabletMode() ? " pos-shell--tablet" : ""}" data-display-mode="${isTabletMode() ? "tablet" : "classic"}">
        <header class="pos-head">
          <div>
            <h1 class="pos-title">${escapeHTML(STR.title)}</h1>
            <p class="pos-subtitle">${escapeHTML(STR.subtitle)}</p>
          </div>
          <div class="pos-head__actions">
            <button type="button" class="pos-btn pos-btn--tablet" data-action="toggle-tablet-mode" aria-pressed="${isTabletMode() ? "true" : "false"}">
              ${escapeHTML(isTabletMode() ? STR.modeTabletOn : STR.modeTabletOff)}
            </button>
            <button type="button" class="pos-btn" data-action="clear-cart">Vider panier</button>
            <a href="${escapeHTML(normalizePath(CONFIG.RESTAURANT_PATH))}" class="pos-btn">Commandes resto</a>
          </div>
        </header>

        <div class="pos-alert" data-alert></div>

        <div class="pos-grid">
          <section class="pos-card" data-panel-catalog></section>
          <section class="pos-card" data-panel-cart></section>
        </div>
      </section>
    `;

    return {
      alert: root.querySelector("[data-alert]"),
      panelCatalog: root.querySelector("[data-panel-catalog]"),
      panelCart: root.querySelector("[data-panel-cart]"),
      btnClear: root.querySelector('[data-action="clear-cart"]'),
      btnToggleTabletMode: root.querySelector('[data-action="toggle-tablet-mode"]'),
    };
  }

  function renderCatalogPanel(els) {
    const locOptions = state.locations
      .map((l) => `<option value="${escapeHTML(l.id)}"${String(l.id) === String(state.activeLocationId) ? " selected" : ""}>${escapeHTML(l.name)}</option>`)
      .join("");

    const rows = buildCatalogRows();
    const tabletMode = isTabletMode();
    const stats = getCatalogStats(rows);

    const renderCatalogCard = (row) => {
      if (tabletMode) {
        const imageUrl = resolveCatalogImageUrl(row);
        return `
          <article class="pos-item pos-item--tablet" data-item-kind="${escapeHTML(row.kind)}" data-item-id="${escapeHTML(row.id)}" data-item-loc="${escapeHTML(
            row.location_id || ""
          )}" data-action="add-item-card">
            <div class="pos-item__media">
              ${
                imageUrl
                  ? `<img class="pos-item__img" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(row.name)}" loading="lazy" />`
                  : `<div class="pos-item__placeholder">${escapeHTML(rowInitials(row))}</div>`
              }
              <div class="pos-item__overlay">
                <strong>${escapeHTML(formatMoney(row.unit_price_cents, CONFIG.CURRENCY))}</strong>
                <span>${escapeHTML(STR.imageHint)}</span>
              </div>
            </div>
            <div class="pos-item__body pos-item__body--tablet">
              <div class="pos-item__name-line">
                <h4 class="pos-item__title">${escapeHTML(row.name)}</h4>
                <button type="button" class="pos-item__plus" data-action="add-item" aria-label="Ajouter ${escapeHTML(row.name)}">+</button>
              </div>
              ${row.description ? `<div class="pos-item__meta">${escapeHTML(row.description)}</div>` : ""}
              <div class="pos-item__chips">
                <span class="pos-chip">${escapeHTML(row.badge)}</span>
                ${row.location_id ? `<span class="pos-chip">${escapeHTML(locationNameById(row.location_id))}</span>` : ""}
                <span class="pos-chip">TVA ${escapeHTML(String(row.vat_rate || 0))}%</span>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="pos-item" data-item-kind="${escapeHTML(row.kind)}" data-item-id="${escapeHTML(row.id)}" data-item-loc="${escapeHTML(
          row.location_id || ""
        )}">
          <div>
            <h4 class="pos-item__title">${escapeHTML(row.name)}</h4>
            ${row.description ? `<div class="pos-item__meta">${escapeHTML(row.description)}</div>` : ""}
          </div>
          <div class="pos-item__chips">
            <span class="pos-chip">${escapeHTML(row.badge)}</span>
            ${row.location_id ? `<span class="pos-chip">${escapeHTML(locationNameById(row.location_id))}</span>` : ""}
            <span class="pos-chip">TVA ${escapeHTML(String(row.vat_rate || 0))}%</span>
            ${row.barcode ? `<span class="pos-chip">CB ${escapeHTML(row.barcode)}</span>` : ""}
            ${row.sku ? `<span class="pos-chip">SKU ${escapeHTML(row.sku)}</span>` : ""}
          </div>
          <div class="pos-item__row" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <strong>${escapeHTML(formatMoney(row.unit_price_cents, CONFIG.CURRENCY))}</strong>
            <button type="button" class="pos-btn pos-btn--primary" data-action="add-item">Ajouter</button>
          </div>
        </article>
      `;
    };

    els.panelCatalog.innerHTML = `
      <h3 class="pos-card__title">Catalogue</h3>

      ${
        tabletMode
          ? `
        <section class="pos-tablet-overview">
          <article class="pos-kpi">
            <span>${escapeHTML(STR.tabletVisibleItems)}</span>
            <strong>${escapeHTML(String(stats.visible))}</strong>
          </article>
          <article class="pos-kpi">
            <span>${escapeHTML(STR.tabletMenusCount)}</span>
            <strong>${escapeHTML(String(stats.menus))}</strong>
          </article>
          <article class="pos-kpi">
            <span>${escapeHTML(STR.tabletProductsCount)}</span>
            <strong>${escapeHTML(String(stats.products))}</strong>
          </article>
          <article class="pos-kpi">
            <span>${escapeHTML(STR.tabletCartTotal)}</span>
            <strong>${escapeHTML(formatMoney(stats.cartTotal, CONFIG.CURRENCY))}</strong>
          </article>
        </section>
      `
          : ""
      }

      <div class="pos-topbar">
        <div class="pos-topbar__left">
          ${
            state.hasRestaurant
              ? `<select class="pos-select" data-k="location">
                <option value="">Tous les lieux</option>
                ${locOptions}
              </select>`
              : ""
          }
          <input class="pos-input" data-k="search" placeholder="Rechercher..." value="${escapeHTML(state.search)}" />
        </div>
      </div>

      <section class="pos-scan">
        <div class="pos-scan__row">
          <label>
            <span class="pos-scan__label">Code-barres / SKU</span>
            <input class="pos-input" data-k="scan-code" data-pos-scan-input="1" placeholder="Ex: 3700000000012" autocomplete="off" />
          </label>
          <label>
            <span class="pos-scan__label">Qté</span>
            <input class="pos-input" data-k="scan-qty" type="number" step="0.001" min="0.001" value="1" />
          </label>
          <button class="pos-btn pos-btn--primary" type="button" data-action="scan-add">Ajouter code</button>
        </div>
        <div class="pos-scan__hint">${escapeHTML(STR.scannerHint)}</div>
      </section>

      <div class="pos-tabs" style="margin-bottom:10px;">
        <button class="pos-tab" data-tab="all" aria-selected="${state.activeTab === "all" ? "true" : "false"}">${escapeHTML(STR.tabAll)}</button>
        <button class="pos-tab" data-tab="menus" aria-selected="${state.activeTab === "menus" ? "true" : "false"}" ${
      state.hasRestaurant ? "" : "disabled"
    }>${escapeHTML(STR.tabMenus)}</button>
        <button class="pos-tab" data-tab="products" aria-selected="${state.activeTab === "products" ? "true" : "false"}" ${
      state.hasBilling ? "" : "disabled"
    }>${escapeHTML(STR.tabProducts)}</button>
      </div>

      <div class="pos-catalog${tabletMode ? " pos-catalog--tablet" : ""}" data-catalog-list>
        ${
          rows.length
            ? rows.map((row) => renderCatalogCard(row)).join("")
            : `<div class="pos-empty">${escapeHTML(STR.emptyCatalog)}</div>`
        }
      </div>
    `;

    els.panelCatalog.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = String(btn.getAttribute("data-tab") || "all").trim();
        if (tab === "menus" && !state.hasRestaurant) return;
        if (tab === "products" && !state.hasBilling) return;
        state.activeTab = tab;
        renderCatalogPanel(els);
      });
    });

    const selLocation = els.panelCatalog.querySelector('[data-k="location"]');
    selLocation?.addEventListener("change", () => {
      state.activeLocationId = asUuid(selLocation.value);
      renderCatalogPanel(els);
    });

    const inputSearch = els.panelCatalog.querySelector('[data-k="search"]');
    inputSearch?.addEventListener("input", () => {
      state.search = inputSearch.value || "";
      renderCatalogPanel(els);
    });

    const scanCodeEl = els.panelCatalog.querySelector('[data-k="scan-code"]');
    const scanQtyEl = els.panelCatalog.querySelector('[data-k="scan-qty"]');
    const scanAdd = () => {
      const code = String(scanCodeEl?.value || "").trim();
      const qty = parseQty(scanQtyEl?.value || "1");
      if (!code) {
        showAlert(els, "Saisis un code-barres ou un SKU.", "error");
        return;
      }
      const ok = addByCode(els, code, qty, "manuel");
      if (!ok) return;
      if (scanCodeEl) scanCodeEl.value = "";
      if (scanQtyEl) scanQtyEl.value = "1";
      scanCodeEl?.focus();
    };

    els.panelCatalog.querySelector('[data-action="scan-add"]')?.addEventListener("click", scanAdd);
    scanCodeEl?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      scanAdd();
    });

    els.panelCatalog.querySelectorAll("[data-item-id]").forEach((card) => {
      const addCurrentRow = () => {
        const kind = String(card.getAttribute("data-item-kind") || "").trim();
        const id = String(card.getAttribute("data-item-id") || "").trim();
        const loc = String(card.getAttribute("data-item-loc") || "").trim();
        const row = buildCatalogRows().find((x) => x.kind === kind && x.id === id && String(x.location_id || "") === loc);
        if (!row) return;
        addCatalogRowToCart(row);
        renderCartPanel(els);
        showAlert(els, `${row.name} ajoute.`, "ok");
      };

      card.querySelector('[data-action="add-item"]')?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        addCurrentRow();
      });

      card.querySelector('[data-action="add-item-card"]')?.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest('[data-action="add-item"]')) return;
        addCurrentRow();
      });
    });
  }

  function renderCartPanel(els) {
    const totals = cartTotals();

    const cartHtml = state.cart.length
      ? state.cart
          .map((line, idx) => {
            const total = cartLineTotal(line);
            return `
              <article class="pos-cart-item" data-cart-index="${idx}">
                <div class="pos-cart-item__row">
                  <div>
                    <h4 class="pos-cart-item__name">${escapeHTML(line.name)}</h4>
                    <div class="pos-cart-item__meta">${escapeHTML(line.kind === "menu_item" ? "Menu" : line.kind === "product" ? "Produit" : "Ligne libre")} • TVA ${escapeHTML(
              String(line.vat_rate || 0)
            )}%</div>
                  </div>
                  <strong>${escapeHTML(formatMoney(total, CONFIG.CURRENCY))}</strong>
                </div>

                <div class="pos-cart-item__row" style="margin-top:8px;">
                  <div class="pos-qty">
                    <button type="button" data-action="qty-minus">-</button>
                    <input type="number" step="0.001" value="${escapeHTML(String(line.qty || 1))}" data-action="qty-input" />
                    <button type="button" data-action="qty-plus">+</button>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <button type="button" class="pos-btn" data-action="edit-price">Prix</button>
                    <button type="button" class="pos-btn" data-action="remove-line">Retirer</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="pos-empty">${escapeHTML(STR.emptyCart)}</div>`;

    const lastOrderHtml = state.lastOrder
      ? `
        <div class="pos-block" style="margin-top:10px;">
          <div style="font-weight:900;color:#166534;">${escapeHTML(STR.orderCreated)}: ${escapeHTML(state.lastOrder.reference || state.lastOrder.id)}</div>
          <div class="pos-item__meta" style="margin-top:4px;">Total ${escapeHTML(
            formatMoney(state.lastOrder.total_cents || 0, state.lastOrder.currency || CONFIG.CURRENCY)
          )}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <button type="button" class="pos-btn" data-action="open-invoice">${escapeHTML(STR.createInvoice)}</button>
            <button type="button" class="pos-btn" data-action="open-quote">${escapeHTML(STR.createQuote)}</button>
          </div>
        </div>
      `
      : "";

    els.panelCart.innerHTML = `
      <h3 class="pos-card__title">${escapeHTML(isTabletMode() ? STR.tabletOrderDetails : "Panier")}</h3>

      ${
        isTabletMode()
          ? `
        <section class="pos-order-head">
          <div class="pos-order-head__line">
            <span>Sous-total</span>
            <strong>${escapeHTML(formatMoney(totals.subtotal, CONFIG.CURRENCY))}</strong>
          </div>
          <div class="pos-order-head__line">
            <span>TVA</span>
            <strong>${escapeHTML(formatMoney(totals.vat, CONFIG.CURRENCY))}</strong>
          </div>
          <div class="pos-order-head__line is-total">
            <span>Total TTC</span>
            <strong>${escapeHTML(formatMoney(totals.total, CONFIG.CURRENCY))}</strong>
          </div>
        </section>
      `
          : ""
      }

      <div class="pos-cart-list" data-cart-list>${cartHtml}</div>

      <div class="pos-summary">
        <div class="pos-summary__line"><span>Sous-total HT</span><span>${escapeHTML(formatMoney(totals.subtotal, CONFIG.CURRENCY))}</span></div>
        <div class="pos-summary__line"><span>TVA</span><span>${escapeHTML(formatMoney(totals.vat, CONFIG.CURRENCY))}</span></div>
        <div class="pos-summary__line total"><span>Total TTC</span><span>${escapeHTML(formatMoney(totals.total, CONFIG.CURRENCY))}</span></div>
      </div>

      <div class="pos-block" style="margin-top:10px;">
        <div class="pos-card__title" style="margin:0 0 8px;">Ligne libre</div>
        <div class="pos-custom-grid">
          <label data-custom-wrap="name"><input class="pos-input" data-custom="name" placeholder="Designation" /></label>
          <label><input class="pos-input" data-custom="qty" type="number" step="0.001" placeholder="Qt" value="1" /></label>
          <label><input class="pos-input" data-custom="price" type="number" step="0.01" placeholder="PU HT" /></label>
          <label><input class="pos-input" data-custom="vat" type="number" step="0.1" placeholder="TVA" value="20" /></label>
          <button type="button" class="pos-btn" data-action="add-custom">Ajouter</button>
        </div>
      </div>

      <div class="pos-block" style="margin-top:10px;display:grid;gap:8px;">
        <div class="pos-card__title" style="margin:0;">Infos commande</div>
        ${
          state.hasRestaurant
            ? `<label>
                <div class="pos-item__meta">Lieu</div>
                <select class="pos-select" data-k="checkout-location">
                  <option value="">Aucun</option>
                  ${state.locations
                    .map(
                      (l) =>
                        `<option value="${escapeHTML(l.id)}"${String(state.activeLocationId) === String(l.id) ? " selected" : ""}>${escapeHTML(l.name)}</option>`
                    )
                    .join("")}
                </select>
              </label>`
            : ""
        }
        <label>
          <div class="pos-item__meta">Nom client</div>
          <input class="pos-input" data-k="customer_name" value="${escapeHTML(state.checkout.customer_name)}" />
        </label>
        <label>
          <div class="pos-item__meta">Table / point de retrait</div>
          <input class="pos-input" data-k="table_label" value="${escapeHTML(state.checkout.table_label)}" />
        </label>
        <label>
          <div class="pos-item__meta">Statut commande</div>
          <select class="pos-select" data-k="status">
            <option value="confirmed"${state.checkout.status === "confirmed" ? " selected" : ""}>Confirmee</option>
            <option value="preparing"${state.checkout.status === "preparing" ? " selected" : ""}>Preparation</option>
            <option value="ready"${state.checkout.status === "ready" ? " selected" : ""}>Prete</option>
            <option value="served"${state.checkout.status === "served" ? " selected" : ""}>Servie</option>
            <option value="completed"${state.checkout.status === "completed" ? " selected" : ""}>Terminee</option>
            <option value="new"${state.checkout.status === "new" ? " selected" : ""}>Brouillon</option>
          </select>
        </label>
        <label>
          <div class="pos-item__meta">Statut paiement</div>
          <select class="pos-select" data-k="payment_status">
            <option value="paid"${state.checkout.payment_status === "paid" ? " selected" : ""}>Payee</option>
            <option value="unpaid"${state.checkout.payment_status === "unpaid" ? " selected" : ""}>Non payee</option>
            <option value="partially_paid"${state.checkout.payment_status === "partially_paid" ? " selected" : ""}>Partiellement payee</option>
          </select>
        </label>
        <label>
          <div class="pos-item__meta">Note</div>
          <textarea class="pos-textarea" data-k="note">${escapeHTML(state.checkout.note)}</textarea>
        </label>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="pos-btn pos-btn--primary pos-btn--checkout" data-action="create-order" ${state.cart.length ? "" : "disabled"}>${escapeHTML(
      STR.createOrder
    )}</button>
          <button type="button" class="pos-btn" data-action="create-order-open-invoice" ${state.cart.length ? "" : "disabled"}>${escapeHTML(
      STR.createInvoice
    )}</button>
          <button type="button" class="pos-btn" data-action="create-order-open-quote" ${state.cart.length ? "" : "disabled"}>${escapeHTML(
      STR.createQuote
    )}</button>
        </div>
      </div>

      ${lastOrderHtml}
    `;

    els.panelCart.querySelectorAll("[data-cart-index]").forEach((card) => {
      const idx = Number(card.getAttribute("data-cart-index"));
      if (!Number.isFinite(idx)) return;
      const line = state.cart[idx];
      if (!line) return;

      card.querySelector('[data-action="qty-minus"]')?.addEventListener("click", () => {
        line.qty = Math.max(0.001, Number(line.qty || 1) - 1);
        renderCartPanel(els);
      });
      card.querySelector('[data-action="qty-plus"]')?.addEventListener("click", () => {
        line.qty = Math.max(0.001, Number(line.qty || 1) + 1);
        renderCartPanel(els);
      });
      card.querySelector('[data-action="qty-input"]')?.addEventListener("input", (e) => {
        line.qty = parseQty(e.target.value);
        renderCartPanel(els);
      });
      card.querySelector('[data-action="edit-price"]')?.addEventListener("click", () => {
        const current = (Number(line.unit_price_cents || 0) / 100).toFixed(2);
        const next = prompt("Prix unitaire HT", current);
        if (next == null) return;
        line.unit_price_cents = parsePriceToCents(next);
        renderCartPanel(els);
      });
      card.querySelector('[data-action="remove-line"]')?.addEventListener("click", () => {
        removeCartLine(idx);
        renderCartPanel(els);
      });
    });

    els.panelCart.querySelector('[data-action="add-custom"]')?.addEventListener("click", () => {
      const nameEl = els.panelCart.querySelector('[data-custom="name"]');
      const qtyEl = els.panelCart.querySelector('[data-custom="qty"]');
      const priceEl = els.panelCart.querySelector('[data-custom="price"]');
      const vatEl = els.panelCart.querySelector('[data-custom="vat"]');

      const name = String(nameEl?.value || "").trim();
      const qty = parseQty(qtyEl?.value || "1");
      const unit_price_cents = parsePriceToCents(priceEl?.value || "0");
      const vat_rate = Number(String(vatEl?.value || "20").replace(",", "."));

      if (!name) {
        showAlert(els, "La designation est obligatoire pour une ligne libre.", "error");
        return;
      }

      upsertCustomLine({
        name,
        qty,
        unit_price_cents,
        vat_rate: Number.isFinite(vat_rate) ? Math.max(0, vat_rate) : 20,
      });

      if (nameEl) nameEl.value = "";
      if (qtyEl) qtyEl.value = "1";
      if (priceEl) priceEl.value = "";
      if (vatEl) vatEl.value = "20";
      showAlert(els, "Ligne ajoutee.", "ok");
      renderCartPanel(els);
    });

    const locEl = els.panelCart.querySelector('[data-k="checkout-location"]');
    locEl?.addEventListener("change", () => {
      state.activeLocationId = asUuid(locEl.value);
      renderCatalogPanel(els);
    });

    const customerEl = els.panelCart.querySelector('[data-k="customer_name"]');
    customerEl?.addEventListener("input", () => {
      state.checkout.customer_name = customerEl.value || "";
    });

    const tableEl = els.panelCart.querySelector('[data-k="table_label"]');
    tableEl?.addEventListener("input", () => {
      state.checkout.table_label = tableEl.value || "";
    });

    const statusEl = els.panelCart.querySelector('[data-k="status"]');
    statusEl?.addEventListener("change", () => {
      state.checkout.status = normalizeStatus(statusEl.value || "confirmed");
    });

    const payEl = els.panelCart.querySelector('[data-k="payment_status"]');
    payEl?.addEventListener("change", () => {
      state.checkout.payment_status = normalizePaymentStatus(payEl.value || "paid");
    });

    const noteEl = els.panelCart.querySelector('[data-k="note"]');
    noteEl?.addEventListener("input", () => {
      state.checkout.note = noteEl.value || "";
    });

    els.panelCart.querySelector('[data-action="create-order"]')?.addEventListener("click", () => createOrderAndMaybeOpen(els, ""));
    els.panelCart
      .querySelector('[data-action="create-order-open-invoice"]')
      ?.addEventListener("click", () => createOrderAndMaybeOpen(els, "invoice"));
    els.panelCart
      .querySelector('[data-action="create-order-open-quote"]')
      ?.addEventListener("click", () => createOrderAndMaybeOpen(els, "quote"));

    els.panelCart.querySelector('[data-action="open-invoice"]')?.addEventListener("click", () => {
      if (!state.lastOrder?.id) return;
      openPath(`${normalizePath(CONFIG.FACTURE_PATH)}?restaurant_order_id=${encodeURIComponent(state.lastOrder.id)}`);
    });

    els.panelCart.querySelector('[data-action="open-quote"]')?.addEventListener("click", () => {
      if (!state.lastOrder?.id) return;
      openPath(`${normalizePath(CONFIG.DEVIS_PATH)}?restaurant_order_id=${encodeURIComponent(state.lastOrder.id)}`);
    });
  }

  async function createOrderAndMaybeOpen(els, openKind) {
    if (!state.cart.length) return;

    showAlert(els, "", "");

    const buttons = [
      els.panelCart.querySelector('[data-action="create-order"]'),
      els.panelCart.querySelector('[data-action="create-order-open-invoice"]'),
      els.panelCart.querySelector('[data-action="create-order-open-quote"]'),
    ].filter(Boolean);

    const prevLabels = buttons.map((b) => b.textContent);
    buttons.forEach((b) => {
      b.disabled = true;
      b.textContent = STR.creating;
    });

    try {
      const orderInsert = {
        organization_id: state.orgId,
        location_id: state.hasRestaurant ? asUuid(state.activeLocationId) || null : null,
        source: "pos",
        status: "new",
        payment_status: "unpaid",
        table_label: String(state.checkout.table_label || "").trim() || null,
        customer_name: String(state.checkout.customer_name || "").trim() || null,
        note: String(state.checkout.note || "").trim() || null,
        currency: CONFIG.CURRENCY,
        created_by: state.user.id,
      };

      const orderRes = await state.supabase.from(CONFIG.ORDERS_TABLE).insert(orderInsert).select("id, reference").single();
      if (orderRes.error) throw orderRes.error;

      const orderId = String(orderRes.data?.id || "");
      if (!orderId) throw new Error("Creation commande: id manquant");

      const linesPayload = state.cart.map((line) => {
        const common = {
          organization_id: state.orgId,
          order_id: orderId,
          label: String(line.name || "Article").trim() || "Article",
          qty: parseQty(line.qty),
          unit_price_cents: Math.max(0, Number(line.unit_price_cents || 0)),
          vat_rate: Math.max(0, Number(line.vat_rate || 0)),
          metadata: { unit: String(line.unit || "u") },
        };

        if (line.kind === "menu_item") {
          return {
            ...common,
            line_type: "menu_item",
            menu_item_id: asUuid(line.id) || null,
          };
        }

        if (line.kind === "product") {
          return {
            ...common,
            line_type: "product",
            product_id: asUuid(line.id) || null,
          };
        }

        return {
          ...common,
          line_type: "custom",
        };
      });

      const linesRes = await state.supabase.from(CONFIG.ORDER_LINES_TABLE).insert(linesPayload);
      if (linesRes.error) throw linesRes.error;

      const finalStatus = normalizeStatus(state.checkout.status);
      const finalPaymentStatus = normalizePaymentStatus(state.checkout.payment_status);

      if (finalStatus !== "new" || finalPaymentStatus !== "unpaid") {
        const patchRes = await state.supabase
          .from(CONFIG.ORDERS_TABLE)
          .update({ status: finalStatus, payment_status: finalPaymentStatus })
          .eq("id", orderId);
        if (patchRes.error) throw patchRes.error;
      }

      const finalRes = await state.supabase
        .from(CONFIG.ORDERS_TABLE)
        .select("id, reference, total_cents, currency")
        .eq("id", orderId)
        .maybeSingle();

      if (finalRes.error) throw finalRes.error;

      state.lastOrder = finalRes.data || { id: orderId, reference: orderRes.data?.reference || "", total_cents: 0, currency: CONFIG.CURRENCY };
      state.cart = [];

      renderCartPanel(els);
      showAlert(els, `${STR.orderCreated}: ${state.lastOrder.reference || state.lastOrder.id}`, "ok");

      if (openKind === "invoice") {
        openPath(`${normalizePath(CONFIG.FACTURE_PATH)}?restaurant_order_id=${encodeURIComponent(state.lastOrder.id)}`);
        return;
      }

      if (openKind === "quote") {
        openPath(`${normalizePath(CONFIG.DEVIS_PATH)}?restaurant_order_id=${encodeURIComponent(state.lastOrder.id)}`);
        return;
      }
    } catch (e) {
      warn("create order failed", e);
      showAlert(els, e?.message || STR.orderFailed, "error");
    } finally {
      buttons.forEach((b, i) => {
        b.disabled = !state.cart.length;
        b.textContent = prevLabels[i] || b.textContent;
      });
    }
  }

  async function loadData() {
    const jobs = [];

    if (state.hasRestaurant) {
      jobs.push(
        state.supabase
          .from(CONFIG.LOCATIONS_TABLE)
          .select("id, name, slug, is_active")
          .eq("organization_id", state.orgId)
          .eq("is_active", true)
          .order("name", { ascending: true })
      );

      jobs.push(
        (async () => {
          let res = await state.supabase
            .from(CONFIG.MENU_ITEMS_TABLE)
            .select("id, location_id, name, description, image_url, price_cents, vat_rate, metadata, available_for_pos, is_active")
            .eq("organization_id", state.orgId)
            .eq("is_active", true)
            .eq("available_for_pos", true)
            .order("name", { ascending: true });
          if (res.error && isMissingColumnError(res.error)) {
            res = await state.supabase
              .from(CONFIG.MENU_ITEMS_TABLE)
              .select("id, location_id, name, description, price_cents, vat_rate, metadata, available_for_pos, is_active")
              .eq("organization_id", state.orgId)
                .eq("is_active", true)
                .eq("available_for_pos", true)
                .order("name", { ascending: true });
            if (!res.error && Array.isArray(res.data)) {
              res.data = res.data.map((row) => ({ ...row, image_url: "", metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {} }));
            }
          }
          if (res.error && isMissingColumnError(res.error)) {
            res = await state.supabase
              .from(CONFIG.MENU_ITEMS_TABLE)
              .select("id, location_id, name, description, price_cents, vat_rate, available_for_pos, is_active")
              .eq("organization_id", state.orgId)
              .eq("is_active", true)
              .eq("available_for_pos", true)
              .order("name", { ascending: true });
            if (!res.error && Array.isArray(res.data)) {
              res.data = res.data.map((row) => ({ ...row, image_url: "", metadata: {} }));
            }
          }
          return res;
        })()
      );
    } else {
      jobs.push(Promise.resolve({ data: [], error: null }));
      jobs.push(Promise.resolve({ data: [], error: null }));
    }

    if (state.hasBilling) {
      jobs.push(
        (async () => {
          let res = await state.supabase
            .from(CONFIG.PRODUCTS_TABLE)
            .select("id, name, sku, barcode, price_cents, description, image_path, image_url, photo_url, thumbnail_url, is_active")
            .eq("organization_id", state.orgId)
            .eq("is_active", true)
            .order("name", { ascending: true });
          if (res.error && isMissingColumnError(res.error)) {
            res = await state.supabase
              .from(CONFIG.PRODUCTS_TABLE)
              .select("id, name, sku, barcode, price_cents, description, image_path, is_active")
              .eq("organization_id", state.orgId)
              .eq("is_active", true)
              .order("name", { ascending: true });
            if (!res.error && Array.isArray(res.data)) {
              res.data = res.data.map((row) => ({ ...row, barcode: "", image_url: "", photo_url: "", thumbnail_url: "" }));
            }
          }
          if (res.error && isMissingColumnError(res.error)) {
            res = await state.supabase
              .from(CONFIG.PRODUCTS_TABLE)
              .select("id, name, sku, barcode, price_cents, description, is_active")
              .eq("organization_id", state.orgId)
              .eq("is_active", true)
              .order("name", { ascending: true });
            if (!res.error && Array.isArray(res.data)) {
              res.data = res.data.map((row) => ({ ...row, barcode: "", image_path: "", image_url: "", photo_url: "", thumbnail_url: "" }));
            }
          }
          return res;
        })()
      );
    } else {
      jobs.push(Promise.resolve({ data: [], error: null }));
    }

    const [locRes, menuRes, prodRes] = await Promise.all(jobs);

    if (locRes.error) throw locRes.error;
    if (menuRes.error) throw menuRes.error;
    if (prodRes.error) throw prodRes.error;

    state.locations = locRes.data || [];
    state.menuItems = menuRes.data || [];
    state.products = prodRes.data || [];
    await hydrateCatalogImageUrls();

    if (!asUuid(state.activeLocationId) && state.locations[0]?.id) {
      state.activeLocationId = state.locations[0].id;
    }

    if (!state.hasRestaurant && state.activeTab === "menus") {
      state.activeTab = state.hasBilling ? "products" : "all";
    }
    if (!state.hasBilling && state.activeTab === "products") {
      state.activeTab = state.hasRestaurant ? "menus" : "all";
    }
  }

  function bindUI(els) {
    renderCatalogPanel(els);
    renderCartPanel(els);
    bindHardwareScanner(els);

    els.btnToggleTabletMode?.addEventListener("click", async () => {
      const nextMode = isTabletMode() ? "classic" : "tablet";
      saveDisplayMode(nextMode);
      const next = renderApp();
      bindUI(next);
      showAlert(next, isTabletMode() ? "Mode tablette active." : "Mode classique active.", "ok");
      if (nextMode === "tablet") {
        await tryEnterFullscreen();
      }
    });

    els.btnClear?.addEventListener("click", () => {
      state.cart = [];
      renderCartPanel(els);
      showAlert(els, "Panier vide.", "ok");
    });
  }

  injectStyles();
  applyShellVisibilityForTabletMode();

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
    state.memberRole = clean(member?.role);
    if (!state.orgId) {
      renderBlocking({ title: STR.loadError, body: "Aucune organisation active." });
      return;
    }

    if (!canAccessPos(member)) {
      renderBlocking({
        title: "Acces refuse",
        body: "Ce compte n'a pas l'autorisation d'utiliser le POS. Demande a un administrateur d'activer l'acces POS.",
      });
      return;
    }

    state.modules = await fetchModules();
    state.hasBilling = Boolean(state.modules?.billing);
    state.hasRestaurant = Boolean(state.modules?.restaurant);

    if (!state.hasBilling && !state.hasRestaurant) {
      renderBlocking({
        title: STR.moduleMissingTitle,
        body: STR.moduleMissingBody,
        cta: { label: STR.moduleCta, href: CONFIG.SUBSCRIPTIONS_PATH },
      });
      return;
    }

    await loadData();

    const els = renderApp();
    bindUI(els);
    if (isTabletMode() && detectTabletDevice()) {
      setTimeout(() => {
        tryEnterFullscreen();
      }, 350);
    }
    log("ready", { orgId: state.orgId, hasBilling: state.hasBilling, hasRestaurant: state.hasRestaurant, displayMode: state.displayMode });
  } catch (e) {
    warn("boot error", e);
    renderBlocking({ title: STR.loadError, body: e?.message || STR.loadError });
  }
});
