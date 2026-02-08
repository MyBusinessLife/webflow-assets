document.documentElement.setAttribute("data-page", "admin-products");

document.addEventListener("submit", (e) => {
  if (e.target && e.target.matches(".products-search-form")) e.preventDefault();
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitSupabaseSingleton(timeoutMs = 8000) {
  const t0 = Date.now();
  while (!window.__MBL_SUPABASE__) {
    if (Date.now() - t0 > timeoutMs) return null;
    await wait(50);
  }
  return window.__MBL_SUPABASE__;
}

function getLoginPath() {
  const cfg = window.__MBL_CFG__ || {};
  const fromCfg = String(cfg.LOGIN_PATH || "").trim();
  if (fromCfg && /\/login\/?$/.test(fromCfg)) return fromCfg;
  try {
    const learned = String(localStorage.getItem("mbl-app-login-path") || "").trim();
    if (learned && /\/login\/?$/.test(learned)) return learned;
  } catch (_) {}
  return "/applications/login";
}

async function requireSessionOrRedirect(supabase) {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user) {
    location.replace(getLoginPath());
    return null;
  }
  return session;
}

window.Webflow ||= [];
window.Webflow.push(async function () {
  const supabase = await waitSupabaseSingleton();

  if (!supabase) {
    console.error("[ADMIN PRODUCTS] Supabase global introuvable.");
    location.replace(getLoginPath());
    return;
  }

  const session = await requireSessionOrRedirect(supabase);
  if (!session) return;

  const ORG_ID = String(
    window.__MBL_CFG__?.ORGANIZATION_ID ||
    window.__MBL_ORG_ID__ ||
    document.querySelector("[data-admin-products]")?.dataset?.organizationId ||
    ""
  ).trim();

  const STORAGE_BUCKET = "product-images";
  const ROW_SELECTOR = ".product-row";

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function debounce(fn, waitMs = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), waitMs);
    };
  }

  function attachOrganization(payload, organizationId) {
    const orgId = String(organizationId || "").trim();
    if (!orgId) return payload;
    const row = { ...(payload || {}) };
    if (!row.organization_id) row.organization_id = orgId;
    return row;
  }

  function stripOrganization(payload) {
    const row = { ...(payload || {}) };
    delete row.organization_id;
    return row;
  }

  function isOrganizationColumnMissing(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return (
      (code === "42703" || code === "PGRST204" || code === "PGRST205") &&
      msg.includes("organization_id")
    );
  }

  function formatCents(cents) {
    if (cents === null || cents === undefined) return "—";
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function eurosToCents(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const sanitized = raw
      .replace(/\s/g, "")
      .replace(/€/g, "")
      .replace(/,/g, ".");

    if (!/^[-+]?\d*(?:\.\d+)?$/.test(sanitized)) return null;
    const n = Number(sanitized);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function centsToEurosInput(cents) {
    if (cents === null || cents === undefined) return "";
    return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseStock(value) {
    const n = parseInt(String(value || "").trim(), 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
  }

  function getExtFromFile(file) {
    const name = file?.name || "";
    const parts = name.split(".");
    const ext = (parts.length > 1 ? parts.pop() : "jpg").toLowerCase();
    return ext.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  function safeUUID() {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch (_) {
      // noop
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function uploadProductImage({ productId, file }) {
    if (!productId || !file) return null;

    const ext = getExtFromFile(file);
    const path = `products/${productId}/${safeUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      });

    if (upErr) throw new Error(upErr.message);

    return { path };
  }

  async function getDisplayUrlFromPath(path) {
    if (!path) return null;

    const { data, error } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error) {
      console.warn("[ADMIN PRODUCTS] signed url error:", error.message);
      return null;
    }

    const signedUrl = data?.signedUrl;
    if (!signedUrl) return null;
    return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  function marginUnitCents(product) {
    return (product._priceCents || 0) - (product._costCents || 0);
  }

  function marginStockCents(product) {
    return marginUnitCents(product) * (product._stockQty || 0);
  }

  function applyStatus(el, isActive) {
    if (!el) return;
    el.classList.remove("mbl-ap-pill", "is-active", "is-inactive");
    el.classList.add("mbl-ap-pill", isActive ? "is-active" : "is-inactive");
    el.textContent = isActive ? "Actif" : "Inactif";
  }

  function injectThemeStyles() {
    if (document.getElementById("mbl-admin-products-theme")) return;

    const style = document.createElement("style");
    style.id = "mbl-admin-products-theme";
    style.textContent = `
      html[data-page="admin-products"] body {
        background:
          radial-gradient(900px 420px at 8% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
          radial-gradient(860px 470px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
          linear-gradient(180deg, #f4f8fc, #edf4fb);
      }

      html[data-page="admin-products"] .product-row {
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 8px 20px rgba(12, 37, 66, 0.06);
        transition: transform .16s ease, box-shadow .22s ease, border-color .22s ease;
      }

      html[data-page="admin-products"] .product-row:hover {
        transform: translateY(-1px);
        border-color: #b8d1e5;
        box-shadow: 0 14px 26px rgba(12, 37, 66, 0.10);
      }

      html[data-page="admin-products"] .name {
        color: #143a61;
        font-weight: 800;
      }

      html[data-page="admin-products"] .category {
        color: #3f6387;
      }

      html[data-page="admin-products"] .price,
      html[data-page="admin-products"] .stock {
        color: #10233f;
        font-weight: 700;
      }

      html[data-page="admin-products"] .product-image {
        border-radius: 10px;
        border: 1px solid #d6e2ee;
        background: #f2f8ff;
      }

      .mbl-ap-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-weight: 700;
        font-size: 12px;
        border: 1px solid transparent;
      }

      .mbl-ap-pill.is-active {
        color: #0f766e;
        background: rgba(15, 118, 110, 0.12);
        border-color: rgba(15, 118, 110, 0.28);
      }

      .mbl-ap-pill.is-inactive {
        color: #be123c;
        background: rgba(190, 18, 60, 0.12);
        border-color: rgba(190, 18, 60, 0.25);
      }

      .mbl-ap-toolbar {
        margin: 10px 0 14px;
        padding: 12px;
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffffff, #f7fbff);
        box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
      }

      .mbl-ap-controls {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr 1fr auto;
        gap: 10px;
        align-items: center;
      }

      .mbl-ap-input,
      .mbl-ap-select,
      html[data-page="admin-products"] .products-search,
      html[data-page="admin-products"] .products-category-filter {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 12px;
        background: #ffffff;
        color: #10233f;
        outline: none;
        padding: 10px 12px;
        transition: border-color .2s ease, box-shadow .2s ease;
      }

      .mbl-ap-input:focus,
      .mbl-ap-select:focus,
      html[data-page="admin-products"] .products-search:focus,
      html[data-page="admin-products"] .products-category-filter:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .mbl-ap-count {
        justify-self: end;
        color: #4d6b8a;
        font-size: 12px;
        font-weight: 700;
      }

      .mbl-ap-kpis {
        margin-top: 10px;
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .mbl-ap-kpi {
        border: 1px solid #d6e2ee;
        border-radius: 12px;
        padding: 10px;
        background: #fff;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
      }

      .mbl-ap-kpi-label {
        color: #55708c;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .mbl-ap-kpi-value {
        color: #143a61;
        font-size: 17px;
        font-weight: 800;
      }

      .mbl-ap-modal,
      .mbl-ap-view-modal,
      .mbl-ap-delete-modal {
        position: fixed;
        inset: 0;
        font-family: inherit;
      }

      .mbl-ap-view-modal,
      .mbl-ap-delete-modal,
      .mbl-ap-modal {
        display: none;
      }

      .mbl-ap-modal *,
      .mbl-ap-view-modal *,
      .mbl-ap-delete-modal * {
        box-sizing: border-box;
      }

      .mbl-ap-overlay {
        position: absolute;
        inset: 0;
        background: rgba(10, 31, 53, 0.42);
        backdrop-filter: blur(3px);
      }

      .mbl-ap-panel {
        position: relative;
        width: min(940px, calc(100vw - 28px));
        max-height: calc(100vh - 30px);
        overflow: auto;
        background:
          radial-gradient(700px 210px at 8% -6%, rgba(15, 118, 110, 0.10), transparent 64%),
          radial-gradient(660px 260px at 100% 0%, rgba(14, 165, 233, 0.10), transparent 70%),
          linear-gradient(180deg, #f7fbff, #eef6fd);
        border: 1px solid #d6e2ee;
        border-radius: 18px;
        margin: 14px auto;
        top: 50%;
        transform: translateY(-50%);
        box-shadow: 0 25px 60px rgba(12, 37, 66, 0.24);
        color: #10233f;
      }

      .mbl-ap-head {
        position: sticky;
        top: 0;
        z-index: 4;
        background: linear-gradient(180deg, rgba(247, 251, 255, 0.98), rgba(239, 246, 253, 0.96));
        border-bottom: 1px solid #d6e2ee;
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        border-radius: 18px 18px 0 0;
      }

      .mbl-ap-title {
        font-size: 18px;
        font-weight: 800;
        color: #143a61;
        margin-bottom: 6px;
      }

      .mbl-ap-sub {
        color: #55708c;
        font-size: 13px;
        line-height: 1.4;
      }

      .mbl-ap-meta {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .mbl-ap-chip {
        border: 1px solid #c9dbe9;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
        color: #245279;
        background: #fff;
      }

      .mbl-ap-chip.is-dirty {
        color: #92400e;
        border-color: #facc15;
        background: #fff7d6;
        display: none;
      }

      .mbl-ap-chip.is-dirty.is-visible {
        display: inline-flex;
      }

      .mbl-ap-close {
        border: 1px solid #cfdeeb;
        background: #fff;
        color: #0c4a6e;
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        font-weight: 800;
      }

      .mbl-ap-body {
        padding: 14px 16px 16px;
        display: grid;
        gap: 12px;
      }

      .mbl-ap-metrics {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .mbl-ap-metric {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        padding: 10px;
        background: #fff;
      }

      .mbl-ap-metric-label {
        color: #55708c;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .mbl-ap-metric-value {
        color: #143a61;
        font-size: 16px;
        font-weight: 800;
      }

      .mbl-ap-metric-value.is-positive { color: #0f766e; }
      .mbl-ap-metric-value.is-negative { color: #be123c; }

      .mbl-ap-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .mbl-ap-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mbl-ap-field--full {
        grid-column: 1 / -1;
      }

      .mbl-ap-label {
        color: #4f6b86;
        font-size: 12px;
        font-weight: 700;
      }

      .mbl-ap-input,
      .mbl-ap-select,
      .mbl-ap-field textarea,
      .mbl-ap-file {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 10px 11px;
        outline: none;
        color: #10233f;
        background: #fff;
        transition: border-color .2s ease, box-shadow .2s ease;
      }

      .mbl-ap-field textarea {
        min-height: 92px;
        resize: vertical;
      }

      .mbl-ap-input:focus,
      .mbl-ap-select:focus,
      .mbl-ap-field textarea:focus,
      .mbl-ap-file:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .mbl-ap-input.is-invalid,
      .mbl-ap-select.is-invalid {
        border-color: #dc2626;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
      }

      .mbl-ap-hint {
        color: #6d86a0;
        font-size: 12px;
      }

      .mbl-ap-preview {
        border: 1px dashed #d6e2ee;
        border-radius: 10px;
        padding: 10px;
        background: #fbfdff;
      }

      .mbl-ap-preview img {
        width: 100%;
        max-height: 220px;
        object-fit: contain;
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fff;
      }

      .mbl-ap-error {
        display: none;
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
        border-radius: 10px;
        padding: 10px 11px;
        font-size: 13px;
        font-weight: 700;
      }

      .mbl-ap-actions {
        position: sticky;
        bottom: 0;
        z-index: 4;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 16px;
        border-top: 1px solid #d6e2ee;
        background: linear-gradient(180deg, rgba(247, 251, 255, 0.96), rgba(239, 246, 253, 0.98));
        border-radius: 0 0 18px 18px;
      }

      .mbl-ap-btn {
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        background: #fff;
        color: #0c4a6e;
      }

      .mbl-ap-btn--primary {
        border-color: #0f766e;
        background: linear-gradient(180deg, #0f766e, #0d5d57);
        color: #fff;
        box-shadow: 0 10px 24px rgba(15, 118, 110, 0.28);
      }

      .mbl-ap-delete-panel {
        position: relative;
        width: min(560px, calc(100vw - 26px));
        background: linear-gradient(180deg, #ffffff, #f6faff);
        border: 1px solid #d6e2ee;
        border-radius: 14px;
        padding: 16px;
        margin: 12px auto;
        top: 50%;
        transform: translateY(-50%);
        box-shadow: 0 20px 60px rgba(12, 37, 66, 0.24);
        color: #10233f;
      }

      .mbl-ap-delete-title {
        font-size: 18px;
        font-weight: 800;
        color: #143a61;
        margin-bottom: 6px;
      }

      .mbl-ap-delete-text {
        color: #55708c;
        line-height: 1.45;
      }

      .mbl-ap-delete-target {
        margin-top: 12px;
        padding: 12px;
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        background: #fff;
      }

      .mbl-ap-delete-target-label {
        color: #5a7490;
        font-size: 12px;
        margin-bottom: 5px;
      }

      .mbl-ap-delete-target-value {
        color: #143a61;
        font-weight: 800;
      }

      .mbl-ap-delete-confirm {
        margin-top: 10px;
        border: 1px dashed #d8e4ef;
        border-radius: 10px;
        padding: 10px;
        background: #fbfdff;
      }

      .mbl-ap-delete-confirm-label {
        color: #5a7490;
        font-size: 12px;
        margin-bottom: 6px;
        font-weight: 700;
      }

      .mbl-ap-delete-input {
        width: 100%;
        border: 1px solid #cfdeeb;
        border-radius: 10px;
        padding: 9px 10px;
        outline: none;
        color: #10233f;
        background: #fff;
      }

      .mbl-ap-delete-input:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
      }

      .mbl-ap-delete-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 12px;
      }

      .mbl-ap-delete-error {
        display: none;
        margin-top: 10px;
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
        border-radius: 10px;
        padding: 9px 10px;
        font-size: 13px;
        font-weight: 700;
      }

      .mbl-ap-view-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .mbl-ap-view-card {
        border: 1px solid #d6e2ee;
        border-radius: 10px;
        padding: 10px;
        background: #fff;
      }

      .mbl-ap-view-label {
        color: #55708c;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .mbl-ap-view-value {
        color: #143a61;
        font-weight: 800;
      }

      @media (max-width: 1080px) {
        .mbl-ap-controls {
          grid-template-columns: 1fr;
        }

        .mbl-ap-count {
          justify-self: start;
        }

        .mbl-ap-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mbl-ap-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mbl-ap-grid {
          grid-template-columns: 1fr;
        }

        .mbl-ap-view-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;

    document.head.appendChild(style);
  }

  injectThemeStyles();

  const firstRow = document.querySelector(ROW_SELECTOR);
  if (!firstRow) {
    console.error("[ADMIN PRODUCTS] .product-row introuvable.");
    return;
  }

  const rowsContainer = firstRow.parentElement;
  const nativeSearchInput = document.querySelector(".products-search");
  const nativeCategoryFilter = document.querySelector(".products-category-filter");
  const searchForm = document.querySelector(".products-search-form");
  if (searchForm) searchForm.addEventListener("submit", (e) => e.preventDefault());

  const listState = {
    items: [],
    filtered: [],
    search: "",
    categoryId: "",
    status: "all",
    sort: "created_desc",
  };

  const formState = {
    mode: "add",
    id: null,
    saving: false,
    dirty: false,
    initialSignature: "",
    existingImagePath: null,
  };

  let listUi = null;
  let categoriesCache = null;
  let brandsCache = [];
  const imageUrlCache = new Map();

  function extractCategoryName(product) {
    const rel = product?.categories;
    if (!rel) return "—";
    if (Array.isArray(rel)) return rel[0]?.name || "—";
    return rel.name || "—";
  }

  async function getDisplayUrlCached(path) {
    if (!path) return null;
    if (imageUrlCache.has(path)) return imageUrlCache.get(path);
    const promise = getDisplayUrlFromPath(path).catch(() => null);
    imageUrlCache.set(path, promise);
    return promise;
  }

  async function loadCategoriesCache(force = false) {
    if (!force && categoriesCache) return categoriesCache;

    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("[ADMIN PRODUCTS] categories load error:", error);
      categoriesCache = [];
      return categoriesCache;
    }

    categoriesCache = data || [];
    return categoriesCache;
  }

  function buildBrandsFromItems(items) {
    const map = new Map();
    (items || []).forEach((p) => {
      const original = String(p.brand || "").trim();
      if (!original) return;
      const key = norm(original);
      if (!map.has(key)) map.set(key, original);
    });

    brandsCache = Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }

  function setRowActionsEnabled(rowEl, enabled) {
    rowEl
      .querySelectorAll(
        "a.show-product, .show-product, a.update-product, .update-product, a.delete-product, .delete-product"
      )
      .forEach((el) => {
        el.style.pointerEvents = enabled ? "" : "none";
        el.style.opacity = enabled ? "" : "0.45";
      });
  }

  function fillRow(rowEl, product) {
    const imgEl = rowEl.querySelector(".product-image");
    const nameEl = rowEl.querySelector(".name");
    const catEl = rowEl.querySelector(".category");
    const priceEl = rowEl.querySelector(".price");
    const stockEl = rowEl.querySelector(".stock");
    const statusEl = rowEl.querySelector(".status");

    if (nameEl) nameEl.textContent = product.name || "—";
    if (catEl) catEl.textContent = product.category_name || "—";
    if (priceEl) priceEl.textContent = formatCents(product._priceCents);
    if (stockEl) stockEl.textContent = String(product._stockQty || 0);
    applyStatus(statusEl, !!product.is_active);

    rowEl.dataset.productId = product.id || "";
    rowEl.dataset.productName = product.name || "";
    rowEl.dataset.categoryId = product.category_id || "";
    rowEl.dataset.categoryName = product.category_name || "";
    rowEl.dataset.brand = product.brand || "";
    rowEl.dataset.sku = product.sku || "";
    rowEl.dataset.barcode = product.barcode || "";

    if (imgEl) {
      imgEl.src = "";
      imgEl.alt = product.name || "";
      imgEl.style.visibility = "hidden";

      if (product.image_path) {
        const stableId = product.id;
        getDisplayUrlCached(product.image_path).then((url) => {
          if (!url) return;
          if (rowEl.dataset.productId !== stableId) return;
          imgEl.src = url;
          imgEl.style.visibility = "visible";
        });
      }
    }
  }

  function sortProducts(rows) {
    const list = rows.slice();
    list.sort((a, b) => {
      switch (listState.sort) {
        case "name_asc":
          return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
        case "name_desc":
          return String(b.name || "").localeCompare(String(a.name || ""), "fr", { sensitivity: "base" });
        case "price_desc":
          return (b._priceCents || 0) - (a._priceCents || 0);
        case "price_asc":
          return (a._priceCents || 0) - (b._priceCents || 0);
        case "stock_desc":
          return (b._stockQty || 0) - (a._stockQty || 0);
        case "stock_asc":
          return (a._stockQty || 0) - (b._stockQty || 0);
        case "margin_desc":
          return marginStockCents(b) - marginStockCents(a);
        case "margin_asc":
          return marginStockCents(a) - marginStockCents(b);
        case "created_asc":
          return (a._createdTs || 0) - (b._createdTs || 0);
        case "created_desc":
        default:
          return (b._createdTs || 0) - (a._createdTs || 0);
      }
    });
    return list;
  }

  function renderRows(rows) {
    rowsContainer.querySelectorAll(ROW_SELECTOR).forEach((row, idx) => {
      if (idx > 0) row.remove();
    });

    if (!rows.length) {
      const hasData = (listState.items || []).length > 0;
      fillRow(firstRow, {
        id: "",
        name: hasData ? "Aucun resultat" : "Aucun produit",
        category_name: "—",
        _priceCents: null,
        _stockQty: 0,
        is_active: false,
      });
      setRowActionsEnabled(firstRow, false);
      return;
    }

    fillRow(firstRow, rows[0]);
    setRowActionsEnabled(firstRow, true);

    for (let i = 1; i < rows.length; i += 1) {
      const clone = firstRow.cloneNode(true);
      fillRow(clone, rows[i]);
      setRowActionsEnabled(clone, true);
      rowsContainer.appendChild(clone);
    }
  }

  function renderKpis() {
    const ui = ensureListingUi();
    const total = listState.items || [];
    const filtered = listState.filtered || [];

    const activeCount = filtered.filter((p) => p.is_active).length;
    const stockUnits = filtered.reduce((sum, p) => sum + (p._stockQty || 0), 0);
    const stockValue = filtered.reduce((sum, p) => sum + ((p._priceCents || 0) * (p._stockQty || 0)), 0);
    const stockMargin = filtered.reduce((sum, p) => sum + marginStockCents(p), 0);

    ui.kpis.innerHTML = `
      <article class="mbl-ap-kpi">
        <div class="mbl-ap-kpi-label">Produits</div>
        <div class="mbl-ap-kpi-value">${filtered.length} / ${total.length}</div>
      </article>
      <article class="mbl-ap-kpi">
        <div class="mbl-ap-kpi-label">Actifs</div>
        <div class="mbl-ap-kpi-value">${activeCount}</div>
      </article>
      <article class="mbl-ap-kpi">
        <div class="mbl-ap-kpi-label">Stock total</div>
        <div class="mbl-ap-kpi-value">${stockUnits}</div>
      </article>
      <article class="mbl-ap-kpi">
        <div class="mbl-ap-kpi-label">Valeur stock</div>
        <div class="mbl-ap-kpi-value">${formatCents(stockValue)}</div>
      </article>
      <article class="mbl-ap-kpi">
        <div class="mbl-ap-kpi-label">Marge stock</div>
        <div class="mbl-ap-kpi-value">${formatCents(stockMargin)}</div>
      </article>
    `;

    ui.count.textContent = `${filtered.length} / ${total.length} affiches`;
    ui.status.value = listState.status;
    ui.sort.value = listState.sort;
  }

  function refreshListingView() {
    const query = listState.search;
    const categoryId = listState.categoryId;
    const status = listState.status;

    const filtered = (listState.items || []).filter((item) => {
      if (query && !(item._search || "").includes(query)) return false;
      if (categoryId && item.category_id !== categoryId) return false;
      if (status === "active" && !item.is_active) return false;
      if (status === "inactive" && item.is_active) return false;
      return true;
    });

    listState.filtered = sortProducts(filtered);
    renderRows(listState.filtered);
    renderKpis();
  }

  async function populateCategorySelect(selectEl, selectedId) {
    if (!selectEl) return;

    const categories = await loadCategoriesCache();
    selectEl.innerHTML = "";

    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— Aucune —";
    selectEl.appendChild(emptyOpt);

    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (selectedId && c.id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    });

    if (!selectedId) emptyOpt.selected = true;
  }

  async function populateCategoryFilterSelect(selectEl) {
    if (!selectEl) return;

    const categories = await loadCategoriesCache();
    const currentValue = selectEl.value || "";

    selectEl.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Toutes les categories";
    selectEl.appendChild(allOpt);

    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (currentValue && currentValue === c.id) opt.selected = true;
      selectEl.appendChild(opt);
    });

    if (!currentValue) allOpt.selected = true;
  }

  function populateBrandDatalist(datalistEl) {
    if (!datalistEl) return;
    datalistEl.innerHTML = "";
    brandsCache.forEach((brand) => {
      const opt = document.createElement("option");
      opt.value = brand;
      datalistEl.appendChild(opt);
    });
  }

  function ensureListingUi() {
    if (listUi) return listUi;

    const toolbar = document.createElement("section");
    toolbar.className = "mbl-ap-toolbar";
    toolbar.innerHTML = `
      <div class="mbl-ap-controls">
        <div class="mbl-ap-search-slot"></div>
        <div class="mbl-ap-category-slot"></div>
        <select class="mbl-ap-select mbl-ap-status">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
        <select class="mbl-ap-select mbl-ap-sort">
          <option value="created_desc">Plus recents</option>
          <option value="created_asc">Plus anciens</option>
          <option value="name_asc">Nom (A-Z)</option>
          <option value="name_desc">Nom (Z-A)</option>
          <option value="price_desc">Prix (haut-bas)</option>
          <option value="price_asc">Prix (bas-haut)</option>
          <option value="stock_desc">Stock (haut-bas)</option>
          <option value="stock_asc">Stock (bas-haut)</option>
          <option value="margin_desc">Marge stock (haut-bas)</option>
          <option value="margin_asc">Marge stock (bas-haut)</option>
        </select>
        <div class="mbl-ap-count">0 / 0 affiches</div>
      </div>
      <div class="mbl-ap-kpis"></div>
    `;

    rowsContainer.parentElement.insertBefore(toolbar, rowsContainer);

    const searchSlot = toolbar.querySelector(".mbl-ap-search-slot");
    const categorySlot = toolbar.querySelector(".mbl-ap-category-slot");

    const searchInput = nativeSearchInput || document.createElement("input");
    if (!nativeSearchInput) {
      searchInput.type = "search";
      searchInput.placeholder = "Rechercher nom, marque, sku, code-barres...";
    }
    searchInput.classList.add("mbl-ap-input");
    if (!searchInput.parentElement || searchInput.parentElement !== searchSlot) {
      searchSlot.appendChild(searchInput);
    }

    const categoryFilter = nativeCategoryFilter || document.createElement("select");
    categoryFilter.classList.add("mbl-ap-select");
    if (!categoryFilter.parentElement || categoryFilter.parentElement !== categorySlot) {
      categorySlot.appendChild(categoryFilter);
    }

    const status = toolbar.querySelector(".mbl-ap-status");
    const sort = toolbar.querySelector(".mbl-ap-sort");
    const count = toolbar.querySelector(".mbl-ap-count");
    const kpis = toolbar.querySelector(".mbl-ap-kpis");

    const applySearchDebounced = debounce(() => {
      listState.search = norm(searchInput.value || "");
      refreshListingView();
    }, 120);

    searchInput.addEventListener("input", applySearchDebounced);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        listState.search = norm(searchInput.value || "");
        refreshListingView();
      }
      if (e.key === "Escape") {
        searchInput.value = "";
        listState.search = "";
        refreshListingView();
      }
    });

    categoryFilter.addEventListener("change", () => {
      listState.categoryId = categoryFilter.value || "";
      refreshListingView();
    });

    status.addEventListener("change", () => {
      listState.status = status.value || "all";
      refreshListingView();
    });

    sort.addEventListener("change", () => {
      listState.sort = sort.value || "created_desc";
      refreshListingView();
    });

    listUi = {
      toolbar,
      searchInput,
      categoryFilter,
      status,
      sort,
      count,
      kpis,
    };

    return listUi;
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_path, price_cents, cost_cents, stock_qty, is_active, category_id, categories(name), barcode, sku, brand, description, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN PRODUCTS] load error:", error);
      listState.items = [];
      listState.filtered = [];
      fillRow(firstRow, {
        id: "",
        name: "Erreur chargement",
        category_name: "—",
        _priceCents: null,
        _stockQty: 0,
        is_active: false,
      });
      setRowActionsEnabled(firstRow, false);
      ensureListingUi();
      renderKpis();
      return;
    }

    imageUrlCache.clear();

    const products = data || [];
    listState.items = products.map((p) => {
      const createdTs = p.created_at ? new Date(p.created_at).getTime() : 0;
      const priceCents = Number.isFinite(p.price_cents) ? p.price_cents : 0;
      const costCents = Number.isFinite(p.cost_cents) ? p.cost_cents : 0;
      const stockQty = Number.isFinite(p.stock_qty) ? Math.max(0, p.stock_qty) : 0;
      const category_name = extractCategoryName(p);

      return {
        ...p,
        category_name,
        _createdTs: Number.isFinite(createdTs) ? createdTs : 0,
        _priceCents: priceCents,
        _costCents: costCents,
        _stockQty: stockQty,
        _search: norm([
          p.name,
          category_name,
          p.brand,
          p.sku,
          p.barcode,
          p.is_active ? "actif" : "inactif",
        ].join(" ")),
      };
    });

    buildBrandsFromItems(listState.items);
    ensureListingUi();

    await populateCategoryFilterSelect(listUi.categoryFilter);
    if (listState.categoryId) listUi.categoryFilter.value = listState.categoryId;

    refreshListingView();
  }

  function ensureViewModalExists() {
    let modal = document.querySelector(".mbl-ap-view-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "mbl-ap-view-modal";
    modal.style.zIndex = "100002";
    modal.innerHTML = `
      <div class="mbl-ap-overlay"></div>
      <div class="mbl-ap-panel">
        <div class="mbl-ap-head">
          <div>
            <div class="mbl-ap-title vm-title">Produit</div>
            <div class="mbl-ap-sub vm-sub">Detail produit</div>
            <div class="mbl-ap-meta">
              <span class="mbl-ap-chip vm-status">—</span>
              <span class="mbl-ap-chip vm-category">—</span>
              <span class="mbl-ap-chip vm-brand">—</span>
            </div>
          </div>
          <button type="button" class="mbl-ap-close vm-close">Fermer</button>
        </div>

        <div class="mbl-ap-body">
          <div class="mbl-ap-preview vm-image-wrap" style="display:none;">
            <img class="vm-image" alt="" />
          </div>

          <div class="mbl-ap-view-grid">
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">SKU</div>
              <div class="mbl-ap-view-value vm-sku">—</div>
            </article>
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">Code-barres</div>
              <div class="mbl-ap-view-value vm-barcode">—</div>
            </article>
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">Stock</div>
              <div class="mbl-ap-view-value vm-stock">—</div>
            </article>
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">Prix</div>
              <div class="mbl-ap-view-value vm-price">—</div>
            </article>
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">Cout</div>
              <div class="mbl-ap-view-value vm-cost">—</div>
            </article>
            <article class="mbl-ap-view-card">
              <div class="mbl-ap-view-label">Marge unitaire</div>
              <div class="mbl-ap-view-value vm-margin">—</div>
            </article>
          </div>

          <article class="mbl-ap-view-card vm-description-wrap" style="display:none;">
            <div class="mbl-ap-view-label">Description</div>
            <div class="mbl-ap-view-value vm-description" style="white-space:pre-wrap; line-height:1.5;"></div>
          </article>
        </div>

        <div class="mbl-ap-actions">
          <button type="button" class="mbl-ap-btn vm-close">Fermer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeViewModal();
    modal.querySelector(".mbl-ap-overlay").addEventListener("click", close);
    modal.querySelectorAll(".vm-close").forEach((el) => el.addEventListener("click", close));

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    return modal;
  }

  function openViewModal() {
    const modal = ensureViewModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeViewModal() {
    const modal = document.querySelector(".mbl-ap-view-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  async function loadProductDetailsToView(productId) {
    const modal = ensureViewModalExists();

    const title = modal.querySelector(".vm-title");
    const status = modal.querySelector(".vm-status");
    const category = modal.querySelector(".vm-category");
    const brand = modal.querySelector(".vm-brand");
    const sku = modal.querySelector(".vm-sku");
    const barcode = modal.querySelector(".vm-barcode");
    const stock = modal.querySelector(".vm-stock");
    const price = modal.querySelector(".vm-price");
    const cost = modal.querySelector(".vm-cost");
    const margin = modal.querySelector(".vm-margin");
    const descriptionWrap = modal.querySelector(".vm-description-wrap");
    const description = modal.querySelector(".vm-description");
    const imageWrap = modal.querySelector(".vm-image-wrap");
    const image = modal.querySelector(".vm-image");

    if (title) title.textContent = "Chargement...";

    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, barcode, price_cents, cost_cents, stock_qty, is_active, image_path, description, brand, category_id, categories(name)")
      .eq("id", productId)
      .single();

    if (error) {
      console.error("[ADMIN PRODUCTS] view load error:", error);
      if (title) title.textContent = "Erreur de chargement";
      return;
    }

    if (title) title.textContent = data.name || "—";
    if (status) {
      status.classList.remove("is-active", "is-inactive");
      status.classList.add(data.is_active ? "is-active" : "is-inactive");
      status.textContent = data.is_active ? "Actif" : "Inactif";
    }

    if (category) category.textContent = `Categorie: ${extractCategoryName(data)}`;
    if (brand) brand.textContent = `Marque: ${data.brand || "—"}`;
    if (sku) sku.textContent = data.sku || "—";
    if (barcode) barcode.textContent = data.barcode || "—";
    if (stock) stock.textContent = String(Number.isFinite(data.stock_qty) ? data.stock_qty : 0);
    if (price) price.textContent = formatCents(Number.isFinite(data.price_cents) ? data.price_cents : 0);
    if (cost) cost.textContent = formatCents(Number.isFinite(data.cost_cents) ? data.cost_cents : 0);

    const marginC = (Number.isFinite(data.price_cents) ? data.price_cents : 0) - (Number.isFinite(data.cost_cents) ? data.cost_cents : 0);
    if (margin) {
      margin.textContent = formatCents(marginC);
      margin.style.color = marginC >= 0 ? "#0f766e" : "#be123c";
    }

    const desc = String(data.description || "").trim();
    if (desc) {
      description.textContent = desc;
      descriptionWrap.style.display = "block";
    } else {
      description.textContent = "";
      descriptionWrap.style.display = "none";
    }

    const url = await getDisplayUrlFromPath(data.image_path);
    if (url) {
      image.src = url;
      image.alt = data.name || "";
      imageWrap.style.display = "block";
    } else {
      image.src = "";
      image.alt = "";
      imageWrap.style.display = "none";
    }
  }

  function ensureDeleteModalExists() {
    let modal = document.querySelector(".mbl-ap-delete-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "mbl-ap-delete-modal";
    modal.style.zIndex = "100003";
    modal.innerHTML = `
      <div class="mbl-ap-overlay"></div>
      <div class="mbl-ap-delete-panel">
        <div class="mbl-ap-delete-title">Supprimer le produit</div>
        <div class="mbl-ap-delete-text">Cette action est irreversible. Saisissez le nom exact du produit pour confirmer.</div>

        <div class="mbl-ap-delete-target">
          <div class="mbl-ap-delete-target-label">Produit</div>
          <div class="mbl-ap-delete-target-value dp-name">—</div>
        </div>

        <div class="mbl-ap-delete-confirm">
          <div class="mbl-ap-delete-confirm-label">Tapez le nom exact pour activer la suppression</div>
          <input type="text" class="mbl-ap-delete-input dp-input" />
        </div>

        <div class="mbl-ap-delete-actions">
          <button type="button" class="mbl-ap-btn dp-cancel">Annuler</button>
          <button type="button" class="mbl-ap-btn mbl-ap-btn--primary dp-confirm" disabled>Supprimer</button>
        </div>

        <div class="mbl-ap-delete-error dp-error"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeDeleteModal();
    modal.querySelector(".mbl-ap-overlay").addEventListener("click", close);
    modal.querySelector(".dp-cancel").addEventListener("click", close);

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    return modal;
  }

  function openDeleteModal() {
    const modal = ensureDeleteModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeDeleteModal() {
    const modal = document.querySelector(".mbl-ap-delete-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  async function openDeleteProduct(productId) {
    const modal = ensureDeleteModalExists();
    const nameEl = modal.querySelector(".dp-name");
    const input = modal.querySelector(".dp-input");
    const confirmBtn = modal.querySelector(".dp-confirm");
    const errEl = modal.querySelector(".dp-error");

    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_path")
      .eq("id", productId)
      .single();

    if (error) {
      console.error(error);
      window.alert("Erreur chargement produit: " + error.message);
      return;
    }

    modal.dataset.productId = data.id;
    modal.dataset.expectedName = data.name || "";
    modal.dataset.imagePath = data.image_path || "";

    if (nameEl) nameEl.textContent = data.name || "—";
    if (input) input.value = "";
    if (confirmBtn) confirmBtn.disabled = true;
    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }

    const refreshGate = () => {
      const expected = modal.dataset.expectedName || "";
      const typed = String(input?.value || "").trim();
      if (confirmBtn) confirmBtn.disabled = !expected || typed !== expected;
    };

    if (input) input.oninput = refreshGate;
    refreshGate();

    confirmBtn.onclick = async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Suppression...";

        const productToDelete = modal.dataset.productId || "";
        const imagePath = modal.dataset.imagePath || "";

        const { error: delErr } = await supabase
          .from("products")
          .delete()
          .eq("id", productToDelete);
        if (delErr) throw new Error(delErr.message);

        if (imagePath) {
          const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
          if (rmErr) console.warn("[ADMIN PRODUCTS] image remove warning:", rmErr.message);
        }

        closeDeleteModal();
        await loadProducts();
      } catch (e) {
        console.error(e);
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = e?.message || "Erreur lors de la suppression";
        }
      } finally {
        confirmBtn.textContent = "Supprimer";
        refreshGate();
      }
    };

    openDeleteModal();
  }

  function ensureFormModalExists() {
    let modal = document.querySelector(".mbl-ap-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "mbl-ap-modal";
    modal.style.zIndex = "100004";
    modal.innerHTML = `
      <div class="mbl-ap-overlay"></div>
      <div class="mbl-ap-panel">
        <div class="mbl-ap-head">
          <div>
            <div class="mbl-ap-title pf-title">Produit</div>
            <div class="mbl-ap-sub">Renseignez les informations puis enregistrez.</div>
            <div class="mbl-ap-meta">
              <span class="mbl-ap-chip pf-mode-chip">Mode: creation</span>
              <span class="mbl-ap-chip is-dirty pf-dirty-chip">Modifications non sauvegardees</span>
            </div>
          </div>
          <button type="button" class="mbl-ap-close pf-close">Fermer</button>
        </div>

        <div class="mbl-ap-body">
          <div class="mbl-ap-metrics">
            <article class="mbl-ap-metric">
              <div class="mbl-ap-metric-label">Prix</div>
              <div class="mbl-ap-metric-value pf-m-price">—</div>
            </article>
            <article class="mbl-ap-metric">
              <div class="mbl-ap-metric-label">Cout</div>
              <div class="mbl-ap-metric-value pf-m-cost">—</div>
            </article>
            <article class="mbl-ap-metric">
              <div class="mbl-ap-metric-label">Marge unitaire</div>
              <div class="mbl-ap-metric-value pf-m-margin">—</div>
            </article>
            <article class="mbl-ap-metric">
              <div class="mbl-ap-metric-label">Marge stock</div>
              <div class="mbl-ap-metric-value pf-m-stock-margin">—</div>
            </article>
          </div>

          <div class="mbl-ap-grid">
            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Nom *</span>
              <input type="text" class="mbl-ap-input pf-name" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Categorie</span>
              <select class="mbl-ap-select pf-category"></select>
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Marque</span>
              <input type="text" class="mbl-ap-input pf-brand" list="mbl-brand-datalist" placeholder="ex: Apple, Samsung..." />
              <datalist id="mbl-brand-datalist"></datalist>
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">SKU</span>
              <input type="text" class="mbl-ap-input pf-sku" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Code-barres</span>
              <input type="text" class="mbl-ap-input pf-barcode" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Stock</span>
              <input type="number" min="0" class="mbl-ap-input pf-stock" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Prix (EUR)</span>
              <input type="text" class="mbl-ap-input pf-price" placeholder="ex: 12,50" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Cout (EUR)</span>
              <input type="text" class="mbl-ap-input pf-cost" placeholder="ex: 8,20" />
            </label>

            <label class="mbl-ap-field">
              <span class="mbl-ap-label">Statut</span>
              <select class="mbl-ap-select pf-active">
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </label>

            <label class="mbl-ap-field mbl-ap-field--full">
              <span class="mbl-ap-label">Description</span>
              <textarea class="pf-description" placeholder="Description du produit..."></textarea>
            </label>

            <label class="mbl-ap-field mbl-ap-field--full">
              <span class="mbl-ap-label">Image (optionnel)</span>
              <input type="file" accept="image/*" class="mbl-ap-file pf-image" />
              <div class="mbl-ap-hint">Si vous ajoutez une image, elle remplacera l'image courante du produit.</div>
            </label>

            <div class="mbl-ap-preview pf-preview" style="display:none;">
              <img class="pf-preview-img" alt="" />
            </div>
          </div>

          <div class="mbl-ap-error pf-error"></div>
        </div>

        <div class="mbl-ap-actions">
          <button type="button" class="mbl-ap-btn pf-cancel">Annuler</button>
          <button type="button" class="mbl-ap-btn mbl-ap-btn--primary pf-save">Enregistrer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => tryCloseFormModal();
    modal.querySelector(".mbl-ap-overlay").addEventListener("click", close);
    modal.querySelector(".pf-close").addEventListener("click", close);
    modal.querySelector(".pf-cancel").addEventListener("click", close);
    modal.querySelector(".pf-save").addEventListener("click", () => submitProductForm());

    const bindDirty = (selector, type = "input") => {
      const el = modal.querySelector(selector);
      if (!el) return;
      el.addEventListener(type, () => {
        updateFormMetrics();
        refreshFormDirty();
      });
    };

    bindDirty(".pf-name");
    bindDirty(".pf-category", "change");
    bindDirty(".pf-brand");
    bindDirty(".pf-sku");
    bindDirty(".pf-barcode");
    bindDirty(".pf-stock");
    bindDirty(".pf-price");
    bindDirty(".pf-cost");
    bindDirty(".pf-active", "change");
    bindDirty(".pf-description");

    const imageInput = modal.querySelector(".pf-image");
    imageInput.addEventListener("change", async () => {
      await refreshFormPreviewImage();
      refreshFormDirty();
    });

    [".pf-price", ".pf-cost"].forEach((selector) => {
      const el = modal.querySelector(selector);
      el.addEventListener("focusout", () => {
        const cents = eurosToCents(el.value || "");
        if (cents !== null) el.value = centsToEurosInput(cents);
        updateFormMetrics();
        refreshFormDirty();
      });
    });

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        tryCloseFormModal();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submitProductForm();
      }
    });

    return modal;
  }

  function openFormModal() {
    const modal = ensureFormModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeFormModal() {
    const modal = document.querySelector(".mbl-ap-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
    formState.saving = false;
  }

  function getFormSignature() {
    const modal = ensureFormModalExists();
    return JSON.stringify({
      name: modal.querySelector(".pf-name")?.value || "",
      category: modal.querySelector(".pf-category")?.value || "",
      brand: modal.querySelector(".pf-brand")?.value || "",
      sku: modal.querySelector(".pf-sku")?.value || "",
      barcode: modal.querySelector(".pf-barcode")?.value || "",
      stock: modal.querySelector(".pf-stock")?.value || "",
      price: modal.querySelector(".pf-price")?.value || "",
      cost: modal.querySelector(".pf-cost")?.value || "",
      active: modal.querySelector(".pf-active")?.value || "true",
      description: modal.querySelector(".pf-description")?.value || "",
      imageName: modal.querySelector(".pf-image")?.files?.[0]?.name || "",
      existingImagePath: formState.existingImagePath || "",
    });
  }

  function setFormDirty(flag) {
    formState.dirty = Boolean(flag);
    const modal = ensureFormModalExists();
    const chip = modal.querySelector(".pf-dirty-chip");
    if (chip) chip.classList.toggle("is-visible", formState.dirty);
  }

  function refreshFormDirty() {
    setFormDirty(getFormSignature() !== formState.initialSignature);
  }

  function resetFormDirtyBaseline() {
    formState.initialSignature = getFormSignature();
    setFormDirty(false);
  }

  function showFormError(message) {
    const modal = ensureFormModalExists();
    const err = modal.querySelector(".pf-error");
    err.textContent = message || "";
    err.style.display = message ? "block" : "none";
  }

  function clearFormInvalid() {
    const modal = ensureFormModalExists();
    modal.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  }

  function markFormInvalid(selectors) {
    const modal = ensureFormModalExists();
    selectors.forEach((sel) => {
      const el = modal.querySelector(sel);
      if (el) el.classList.add("is-invalid");
    });
  }

  function setFormMode(mode) {
    formState.mode = mode;
    const modal = ensureFormModalExists();

    const title = modal.querySelector(".pf-title");
    const modeChip = modal.querySelector(".pf-mode-chip");
    const saveBtn = modal.querySelector(".pf-save");

    if (mode === "add") {
      if (title) title.textContent = "Ajouter un produit";
      if (modeChip) modeChip.textContent = "Mode: creation";
      if (saveBtn) saveBtn.textContent = "Ajouter";
    } else {
      if (title) title.textContent = "Modifier le produit";
      if (modeChip) modeChip.textContent = "Mode: edition";
      if (saveBtn) saveBtn.textContent = "Enregistrer";
    }
  }

  function updateFormMetrics() {
    const modal = ensureFormModalExists();

    const priceC = eurosToCents(modal.querySelector(".pf-price").value);
    const costC = eurosToCents(modal.querySelector(".pf-cost").value);
    const stockQty = parseStock(modal.querySelector(".pf-stock").value);

    const price = priceC === null ? 0 : priceC;
    const cost = costC === null ? 0 : costC;
    const margin = price - cost;
    const marginStock = margin * stockQty;

    const mPrice = modal.querySelector(".pf-m-price");
    const mCost = modal.querySelector(".pf-m-cost");
    const mMargin = modal.querySelector(".pf-m-margin");
    const mStockMargin = modal.querySelector(".pf-m-stock-margin");

    if (mPrice) mPrice.textContent = formatCents(price);
    if (mCost) mCost.textContent = formatCents(cost);

    if (mMargin) {
      mMargin.textContent = formatCents(margin);
      mMargin.classList.toggle("is-positive", margin >= 0);
      mMargin.classList.toggle("is-negative", margin < 0);
    }

    if (mStockMargin) {
      mStockMargin.textContent = formatCents(marginStock);
      mStockMargin.classList.toggle("is-positive", marginStock >= 0);
      mStockMargin.classList.toggle("is-negative", marginStock < 0);
    }
  }

  async function refreshFormPreviewImage() {
    const modal = ensureFormModalExists();
    const preview = modal.querySelector(".pf-preview");
    const img = modal.querySelector(".pf-preview-img");
    const file = modal.querySelector(".pf-image")?.files?.[0] || null;

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.alt = "Preview";
      preview.style.display = "block";
      return;
    }

    if (formState.existingImagePath) {
      const url = await getDisplayUrlFromPath(formState.existingImagePath);
      if (url) {
        img.src = url;
        img.alt = "Image produit";
        preview.style.display = "block";
        return;
      }
    }

    img.src = "";
    img.alt = "";
    preview.style.display = "none";
  }

  function tryCloseFormModal() {
    if (formState.saving) return;
    if (formState.dirty) {
      const ok = window.confirm("Vous avez des modifications non sauvegardees. Fermer quand meme ?");
      if (!ok) return;
    }
    closeFormModal();
  }

  async function openAddProduct() {
    const modal = ensureFormModalExists();

    formState.id = null;
    formState.existingImagePath = null;

    setFormMode("add");
    showFormError("");
    clearFormInvalid();

    await loadCategoriesCache();
    await populateCategorySelect(modal.querySelector(".pf-category"), null);

    populateBrandDatalist(modal.querySelector("#mbl-brand-datalist"));

    modal.querySelector(".pf-name").value = "";
    modal.querySelector(".pf-category").value = "";
    modal.querySelector(".pf-brand").value = "";
    modal.querySelector(".pf-sku").value = "";
    modal.querySelector(".pf-barcode").value = "";
    modal.querySelector(".pf-stock").value = "0";
    modal.querySelector(".pf-price").value = "";
    modal.querySelector(".pf-cost").value = "";
    modal.querySelector(".pf-active").value = "true";
    modal.querySelector(".pf-description").value = "";
    modal.querySelector(".pf-image").value = "";

    openFormModal();
    await refreshFormPreviewImage();
    updateFormMetrics();
    resetFormDirtyBaseline();
    modal.querySelector(".pf-name").focus();
  }

  async function openUpdateForProduct(productId) {
    const modal = ensureFormModalExists();

    formState.id = productId;
    setFormMode("edit");
    showFormError("");
    clearFormInvalid();

    await loadCategoriesCache();
    populateBrandDatalist(modal.querySelector("#mbl-brand-datalist"));

    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, barcode, price_cents, cost_cents, stock_qty, is_active, category_id, image_path, description, brand")
      .eq("id", productId)
      .single();

    if (error) {
      showFormError("Erreur chargement produit: " + error.message);
      openFormModal();
      return;
    }

    formState.existingImagePath = data.image_path || null;

    await populateCategorySelect(modal.querySelector(".pf-category"), data.category_id || null);

    modal.querySelector(".pf-name").value = data.name || "";
    modal.querySelector(".pf-brand").value = data.brand || "";
    modal.querySelector(".pf-sku").value = data.sku || "";
    modal.querySelector(".pf-barcode").value = data.barcode || "";
    modal.querySelector(".pf-stock").value = String(Number.isFinite(data.stock_qty) ? Math.max(0, data.stock_qty) : 0);
    modal.querySelector(".pf-price").value = centsToEurosInput(Number.isFinite(data.price_cents) ? data.price_cents : 0);
    modal.querySelector(".pf-cost").value = centsToEurosInput(Number.isFinite(data.cost_cents) ? data.cost_cents : 0);
    modal.querySelector(".pf-active").value = data.is_active ? "true" : "false";
    modal.querySelector(".pf-description").value = data.description || "";
    modal.querySelector(".pf-image").value = "";

    openFormModal();
    await refreshFormPreviewImage();
    updateFormMetrics();
    resetFormDirtyBaseline();
    modal.querySelector(".pf-name").focus();
  }

  async function submitProductForm() {
    const modal = ensureFormModalExists();
    if (formState.saving) return;

    showFormError("");
    clearFormInvalid();

    const name = String(modal.querySelector(".pf-name").value || "").trim();
    const categoryId = modal.querySelector(".pf-category").value || null;
    const brand = String(modal.querySelector(".pf-brand").value || "").trim() || null;
    const sku = String(modal.querySelector(".pf-sku").value || "").trim() || null;
    const barcode = String(modal.querySelector(".pf-barcode").value || "").trim() || null;
    const stock = parseStock(modal.querySelector(".pf-stock").value);
    const priceRaw = String(modal.querySelector(".pf-price").value || "").trim();
    const costRaw = String(modal.querySelector(".pf-cost").value || "").trim();
    const active = modal.querySelector(".pf-active").value === "true";
    const description = String(modal.querySelector(".pf-description").value || "").trim() || null;
    const imageFile = modal.querySelector(".pf-image")?.files?.[0] || null;

    const priceCents = eurosToCents(priceRaw);
    const costCents = eurosToCents(costRaw);

    if (!name) {
      markFormInvalid([".pf-name"]);
      showFormError("Le nom du produit est obligatoire.");
      return;
    }

    if (priceRaw && priceCents === null) {
      markFormInvalid([".pf-price"]);
      showFormError("Le prix est invalide.");
      return;
    }

    if (costRaw && costCents === null) {
      markFormInvalid([".pf-cost"]);
      showFormError("Le cout est invalide.");
      return;
    }

    if ((priceCents ?? 0) < 0) {
      markFormInvalid([".pf-price"]);
      showFormError("Le prix doit etre positif.");
      return;
    }

    if ((costCents ?? 0) < 0) {
      markFormInvalid([".pf-cost"]);
      showFormError("Le cout doit etre positif.");
      return;
    }

    const saveBtn = modal.querySelector(".pf-save");
    const prevLabel = saveBtn ? saveBtn.textContent : "";

    const payload = {
      name,
      category_id: categoryId,
      brand,
      sku,
      barcode,
      stock_qty: stock,
      price_cents: priceCents === null ? 0 : priceCents,
      cost_cents: costCents === null ? 0 : costCents,
      is_active: active,
      description,
    };

    try {
      formState.saving = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = formState.mode === "add" ? "Ajout..." : "Enregistrement...";
      }

      let productId = formState.id;

      if (formState.mode === "add") {
        let response = await supabase
          .from("products")
          .insert(attachOrganization(payload, ORG_ID))
          .select("id")
          .single();

        if (response.error && isOrganizationColumnMissing(response.error)) {
          response = await supabase
            .from("products")
            .insert(stripOrganization(payload))
            .select("id")
            .single();
        }

        const { data, error } = response;

        if (error) throw new Error(error.message);
        productId = data.id;
      } else {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productId);

        if (error) throw new Error(error.message);
      }

      if (imageFile) {
        if (saveBtn) saveBtn.textContent = "Upload image...";
        const uploaded = await uploadProductImage({ productId, file: imageFile });

        const { error: imgErr } = await supabase
          .from("products")
          .update({ image_path: uploaded.path })
          .eq("id", productId);

        if (imgErr) throw new Error(imgErr.message);
      }

      closeFormModal();
      await loadProducts();
    } catch (err) {
      console.error(err);
      showFormError(err?.message || "Erreur lors de l'enregistrement");
    } finally {
      formState.saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = prevLabel || (formState.mode === "add" ? "Ajouter" : "Enregistrer");
      }
    }
  }

  document.addEventListener(
    "click",
    async (e) => {
      const withModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

      const addBtn = e.target.closest(".add-product");
      if (addBtn && !withModifier) {
        e.preventDefault();
        await openAddProduct();
        return;
      }

      const showBtn = e.target.closest("a.show-product, .show-product");
      if (showBtn && !withModifier) {
        e.preventDefault();
        const row = showBtn.closest(ROW_SELECTOR);
        const productId = row?.dataset?.productId;
        if (!productId) return;
        openViewModal();
        await loadProductDetailsToView(productId);
        return;
      }

      const updateBtn = e.target.closest("a.update-product, .update-product");
      if (updateBtn && !withModifier) {
        e.preventDefault();
        const row = updateBtn.closest(ROW_SELECTOR);
        const productId = row?.dataset?.productId;
        if (!productId) return;
        await openUpdateForProduct(productId);
        return;
      }

      const deleteBtn = e.target.closest("a.delete-product, .delete-product");
      if (deleteBtn && !withModifier) {
        e.preventDefault();
        const row = deleteBtn.closest(ROW_SELECTOR);
        const productId = row?.dataset?.productId;
        if (!productId) return;
        await openDeleteProduct(productId);
      }
    },
    true
  );

  ensureListingUi();
  await populateCategoryFilterSelect(listUi.categoryFilter);
  await loadProducts();

  if (listUi.searchInput) listUi.searchInput.focus();
});
