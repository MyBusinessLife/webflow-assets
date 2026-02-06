  document.documentElement.setAttribute("data-page", "admin-products");

  // bloque submit recherche
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.matches(".products-search-form")) e.preventDefault();
  });

  // Attend que le client Supabase global existe
  function waitSupabaseSingleton(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (window.__MBL_SUPABASE__) return resolve(window.__MBL_SUPABASE__);
        if (Date.now() - t0 > timeoutMs) return resolve(null);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  // Petit guard auth local (en plus du protect) => si pas de session, redirect immédiat
  async function requireSessionOrRedirect(supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      location.replace("/extranet/login");
      return null;
    }
    return session;
  }

  window.Webflow ||= [];
  window.Webflow.push(async function () {
    const supabase = await waitSupabaseSingleton();

    if (!supabase) {
      console.error("❌ Supabase global introuvable. Le protect/global footer n’est pas chargé sur cette page.");
      // fallback: redirige login (sinon page “ouverte”)
      location.replace("/extranet/login");
      return;
    }

    // 🔒 sécurité : si pas de session => dehors
    const session = await requireSessionOrRedirect(supabase);
    if (!session) return;

    console.log("✅ [admin-products] ready", session.user.id);

    // ✅ Ton code Products continue ici (tout ce que tu as après STORAGE_BUCKET)
    const STORAGE_BUCKET = "product-images";

  // =========================
  // HELPERS
  // =========================
  function formatCents(cents) {
    if (cents === null || cents === undefined) return "—";
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  }

  function applyStatus(el, isActive) {
    if (!el) return;
    el.textContent = isActive ? "Actif" : "Inactif";
    el.style.backgroundColor = isActive ? "#22c55e" : "#ef4444";
    el.style.color = "#ffffff";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "999px";
    el.style.display = "inline-block";
    el.style.fontWeight = "600";
  }

  function eurosToCents(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const normalized = s.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isNaN(n)) return null;
    return Math.round(n * 100);
  }

  function centsToEurosInput(cents) {
    if (cents === null || cents === undefined) return "";
    return (cents / 100).toFixed(2).replace(".", ",");
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
    } catch (_) {}
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
  // IMPORTANT: upsert=false => pas besoin de policy UPDATE sur storage
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

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data?.publicUrl || null };
  }

  async function getDisplayUrlFromPath(path) {
    if (!path) return null;

    // URL signée valable 1h
    const { data, error } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error) {
      console.warn("[IMG] signed url error:", error.message);
      return null;
    }

    // petit cache-buster (utile si tu ré-uploade souvent)
    return data?.signedUrl ? (data.signedUrl + (data.signedUrl.includes("?") ? "&" : "?") + "t=" + Date.now()) : null;
  }

  function normBrand(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[’']/g, "'")
      .toLowerCase();
  }

  // =========================
  // CATEGORIES CACHE
  // =========================
  let categoriesCache = null;

  async function loadCategories() {
    if (categoriesCache) return categoriesCache;

    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("[CATEGORIES] load error:", error);
      categoriesCache = [];
      return categoriesCache;
    }

    categoriesCache = data || [];
    return categoriesCache;
  }

  async function populateCategorySelect(selectEl, selectedId) {
    const cats = await loadCategories();
    selectEl.innerHTML = "";

    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "— Aucune —";
    selectEl.appendChild(optEmpty);

    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (selectedId && c.id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    });

    if (!selectedId) optEmpty.selected = true;
  }

  async function populateCategoryFilterSelect(selectEl) {
  if (!selectEl) return;

  const cats = await loadCategories();

  // reset
  selectEl.innerHTML = "";

  // Option "toutes"
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Toutes les catégories";
  selectEl.appendChild(optAll);

  // Options catégories
  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;        // on stocke l'ID (plus fiable)
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  });
}

  // =========================
  // BRANDS CACHE (depuis products)
  // =========================
  let brandsCache = null;

  async function loadBrands() {
    if (brandsCache) return brandsCache;

    const { data, error } = await supabase
      .from("products")
      .select("brand")
      .not("brand", "is", null)
      .order("brand", { ascending: true });

    if (error) {
      console.error("[BRANDS] load error:", error);
      brandsCache = [];
      return brandsCache;
    }

    const map = new Map(); // norm -> first original
    (data || []).forEach((row) => {
      const b = String(row.brand || "").trim();
      if (!b) return;
      const k = normBrand(b);
      if (!map.has(k)) map.set(k, b);
    });

    brandsCache = Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    return brandsCache;
  }

  async function populateBrandDatalist(datalistEl) {
    const brands = await loadBrands();
    datalistEl.innerHTML = "";
    brands.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      datalistEl.appendChild(opt);
    });
  }

  // =========================
  // 1) LISTING
  // =========================
  const firstRow = document.querySelector(".product-row");
  if (!firstRow) {
    console.error("[ADMIN PRODUCTS] .product-row introuvable (Div Block 53).");
    return;
  }

    function getCategoryName(p) {
      const rel = p.categories; // ce que tu as dans le select
      if (!rel) return "—";
      if (Array.isArray(rel)) return rel[0]?.name ?? "—";
      return rel.name ?? "—";
    }

    async function fillRow(rowEl, p) {
      // -----------------------
      // 1) Image du produit
      // -----------------------
      const imgEl = rowEl.querySelector(".product-image");

      if (imgEl) {
        // reset propre (évite les images fantômes lors du clone)
        imgEl.src = "";
        imgEl.alt = p.name || "";
        imgEl.style.visibility = "hidden";

        // si une image existe en base
        if (p.image_path) {
          const url = await getDisplayUrlFromPath(p.image_path);
          if (url) {
            imgEl.src = url;
            imgEl.style.visibility = "visible";
          }
        }
      }
      const nameEl = rowEl.querySelector(".name");
      const catEl = rowEl.querySelector(".category");
      const priceEl = rowEl.querySelector(".price");
      const stockEl = rowEl.querySelector(".stock");
      const statusEl = rowEl.querySelector(".status");

      if (nameEl) nameEl.textContent = p.name ?? "—";
      if (catEl) catEl.textContent = getCategoryName(p);
      if (priceEl) priceEl.textContent = formatCents(p.price_cents);
      if (stockEl) stockEl.textContent = String(p.stock_qty ?? 0);

      applyStatus(statusEl, !!p.is_active);
      rowEl.dataset.productId = p.id || "";
      rowEl.dataset.categoryId = p.category_id || "";
      rowEl.dataset.categoryName = getCategoryName(p) || "";

      rowEl.dataset.barcode = p.barcode ? String(p.barcode) : "";
      rowEl.dataset.sku = p.sku ? String(p.sku) : "";
      rowEl.dataset.brand = p.brand ? String(p.brand) : "";
    }

  async function loadProducts() {
  // Nettoyage des lignes clonées
  document.querySelectorAll(".product-row").forEach((row, idx) => {
    if (idx > 0) row.remove();
  });

  // Test sans jointure categories pour isoler le problème
  const { data, error } = await supabase
    .from("products")
    .select("id, name, image_path, price_cents, stock_qty, is_active, category_id, categories(name), barcode, sku, brand")
    .order("created_at", { ascending: false });

  console.log("[ADMIN PRODUCTS] data:", data);
  console.log("[ADMIN PRODUCTS] error:", error);

  if (error) {
    fillRow(firstRow, {
      id: "",
      name: "Erreur chargement",
      categories: { name: "—" },
      price_cents: null,
      stock_qty: 0,
      is_active: false,
    });
    //alert("Supabase error: " + error.message);
    return;
  }

  const products = data || [];
  if (products.length === 0) {
    fillRow(firstRow, {
      id: "",
      name: "Aucun produit",
      categories: { name: "—" },
      price_cents: null,
      stock_qty: 0,
      is_active: false,
    });
    return;
  }

  await fillRow(firstRow, products[0]);

  for (let i = 1; i < products.length; i++) {
    const clone = firstRow.cloneNode(true);
    await fillRow(clone, products[i]);
    firstRow.parentElement.appendChild(clone);
  }

  if (searchInput) applyFilter(searchInput.value);

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      applyFilter(searchInput?.value || "");
    });
  }
}

  // =========================
  // SEARCH (live filter)
  // =========================
  const searchInput = document.querySelector(".products-search");
  const categorySelect = document.querySelector(".products-category-filter");
  const searchForm = document.querySelector(".products-search-form");

  // (sécurité) éviter submit = reload
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => e.preventDefault());
  }

  // Petit debounce pour éviter de filtrer 30 fois/seconde
  function debounce(fn, wait = 120) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // Normalise pour matcher facilement (accents, espaces, etc.)
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlève accents
      .replace(/\s+/g, " ")
      .trim();
  }

  // Construit une "chaine searchable" par ligne
  // -> marche même si tu n'affiches pas barcode/sku/brand dans le row (on fallback sur dataset si tu l'ajoutes plus tard)
  function rowSearchText(row) {
    const name = row.querySelector(".name")?.textContent || "";
    const barcode = row.querySelector(".barcode")?.textContent || row.dataset.barcode || "";
    const sku = row.querySelector(".sku")?.textContent || row.dataset.sku || "";
    const brand = row.querySelector(".brand")?.textContent || row.dataset.brand || "";
    return norm(`${name} ${barcode} ${sku} ${brand}`);
  }

  function applyFilter(qRaw) {
    const q = norm(qRaw);
    const selectedCatId = categorySelect?.value || ""; // "" => toutes

    const rows = Array.from(document.querySelectorAll(".product-row"));
    if (!rows.length) return;

    rows.forEach((row) => {
      // 1) filtre recherche
      const hay = rowSearchText(row);
      const okSearch = !q || hay.includes(q);

      // 2) filtre catégorie
      const rowCatId = row.dataset.categoryId || "";
      const okCat = !selectedCatId || rowCatId === selectedCatId;

      row.style.display = (okSearch && okCat) ? "" : "none";
    });
  }

  const applyFilterDebounced = debounce(applyFilter, 120);

  if (searchInput) {
    // Filtre pendant la saisie
    searchInput.addEventListener("input", () => {
      applyFilterDebounced(searchInput.value);
    });

    // Cas scanner: souvent ça envoie tout d’un coup + Enter
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFilter(searchInput.value);
      }
      // ESC = reset
      if (e.key === "Escape") {
        searchInput.value = "";
        applyFilter("");
      }
    });
  }

  // =========================
  // INIT
  // =========================
  await loadProducts();

  // Important : si tu veux que le filtre reste appliqué après reloadProducts()
  // -> on réapplique le filtre juste après
  if (searchInput && searchInput.value) {
    applyFilter(searchInput.value);
  }

  // =========================
  // 2) MODALE "VOIR PRODUIT"
  // =========================
  function ensureViewModalExists() {
    let modal = document.querySelector(".product-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "product-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:99999; display:none; font-family:inherit;";

    modal.innerHTML = `
      <div class="product-modal__overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>
      <div class="product-modal__content" style="
        position:relative; width:min(720px, calc(100vw - 32px));
        max-height:calc(100vh - 32px); overflow:auto;
        background:#fff; border-radius:14px;
        padding:20px 20px 24px; margin:16px auto; top:50%;
        transform:translateY(-50%); box-shadow:0 20px 70px rgba(0,0,0,.35);
      ">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div class="modal-name" style="font-size:20px; font-weight:700; margin-bottom:6px;">—</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <div class="modal-status">—</div>
              <div class="modal-category" style="opacity:.75;">—</div>
            </div>
            <div class="modal-brand" style="margin-top:6px; opacity:.85; font-weight:600;">—</div>
          </div>
          <button type="button" class="product-modal__close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:700;">✕</button>
        </div>

        <div class="modal-image-wrap" style="margin:10px 0 14px; display:none;">
          <img class="modal-image" src="" alt="" style="width:100%; max-height:260px; object-fit:contain; border-radius:12px; border:1px solid #e5e7eb;" />
        </div>

        <div class="modal-description-wrap" style="display:none; margin:10px 0 4px;">
          <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Description</div>
          <div class="modal-description" style="white-space:pre-wrap; line-height:1.45;"></div>
        </div>

        <hr style="border:none; height:1px; background:#e5e7eb; margin:16px 0;" />

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">SKU</div>
            <div class="modal-sku" style="font-weight:600;">—</div>
          </div>
          <div style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Code-barres</div>
            <div class="modal-barcode" style="font-weight:600;">—</div>
          </div>
          <div style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Prix</div>
            <div class="modal-price" style="font-weight:700;">—</div>
          </div>
          <div style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Coût</div>
            <div class="modal-cost" style="font-weight:700;">—</div>
          </div>
          <div style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Stock</div>
            <div class="modal-stock" style="font-weight:700;">—</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector(".product-modal__overlay").addEventListener("click", () => closeViewModal());
    modal.querySelector(".product-modal__close").addEventListener("click", () => closeViewModal());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewModal(); });

    return modal;
  }

  function openViewModal() {
    const modal = ensureViewModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeViewModal() {
    const modal = document.querySelector(".product-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  async function loadProductDetailsToView(productId) {
    const modal = ensureViewModalExists();

    const elName = modal.querySelector(".modal-name");
    const elCategory = modal.querySelector(".modal-category");
    const elSku = modal.querySelector(".modal-sku");
    const elBarcode = modal.querySelector(".modal-barcode");
    const elPrice = modal.querySelector(".modal-price");
    const elCost = modal.querySelector(".modal-cost");
    const elStock = modal.querySelector(".modal-stock");
    const elStatus = modal.querySelector(".modal-status");
    const elBrand = modal.querySelector(".modal-brand");

    const imgWrap = modal.querySelector(".modal-image-wrap");
    const imgEl = modal.querySelector(".modal-image");

    const descWrap = modal.querySelector(".modal-description-wrap");
    const descEl = modal.querySelector(".modal-description");

    if (elName) elName.textContent = "Chargement...";

    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, barcode, price_cents, cost_cents, stock_qty, is_active, image_path, description, brand, categories(name)")
      .eq("id", productId)
      .single();

    if (error) {
      console.error("[VIEW MODAL] load error:", error);
      if (elName) elName.textContent = "Erreur de chargement";
      if (imgWrap) imgWrap.style.display = "none";
      if (descWrap) descWrap.style.display = "none";
      return;
    }

    if (elName) elName.textContent = data.name ?? "—";
    if (elCategory) {
        elCategory.textContent = data.categories?.name
          ? `Catégorie : ${data.categories.name}`
          : "Catégorie : —";
      }

    if (elBrand) {
        elBrand.textContent = data.brand
          ? `Marque : ${data.brand}`
          : "Marque : —";
      }
    if (elSku) elSku.textContent = data.sku ?? "—";
    if (elBarcode) elBarcode.textContent = data.barcode ?? "—";
    if (elPrice) elPrice.textContent = formatCents(data.price_cents);
    if (elCost) elCost.textContent = formatCents(data.cost_cents);
    if (elStock) elStock.textContent = String(data.stock_qty ?? 0);
    applyStatus(elStatus, !!data.is_active);

    const url = await getDisplayUrlFromPath(data.image_path);
    
    if (url && imgEl && imgWrap) {
      imgEl.src = url;
      imgEl.alt = data.name ?? "";
      imgWrap.style.display = "block";
    } else if (imgWrap) {
      imgWrap.style.display = "none";
    }

    const d = (data.description || "").trim();
    if (d && descEl && descWrap) {
      descEl.textContent = d;
      descWrap.style.display = "block";
    } else if (descWrap) {
      descWrap.style.display = "none";
    }
  }

  // =========================
  // 3) MODALE SUPPRESSION
  // =========================
  function ensureDeleteModalExists() {
    let modal = document.querySelector(".delete-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "delete-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100000; display:none; font-family:inherit;";

    modal.innerHTML = `
      <div class="delete-modal__overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>
      <div class="delete-modal__content" style="
        position:relative; width:min(520px, calc(100vw - 32px));
        background:#fff; border-radius:14px; padding:18px 18px 16px;
        margin:16px auto; top:50%; transform:translateY(-50%);
        box-shadow:0 20px 70px rgba(0,0,0,.35);
      ">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-size:18px; font-weight:800; margin-bottom:6px;">Confirmer la suppression</div>
            <div style="opacity:.75; line-height:1.4;">Voulez-vous vraiment supprimer ce produit ?</div>
          </div>
          <button type="button" class="delete-modal__close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
        </div>

        <div style="margin-top:14px; padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
          <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Produit</div>
          <div class="delete-modal__product" style="font-weight:700;">—</div>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="delete-modal__cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
          <button type="button" class="delete-modal__confirm" style="border:none; background:#ef4444; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Supprimer</button>
        </div>

        <div class="delete-modal__error" style="display:none; margin-top:10px; color:#b91c1c; font-weight:600;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeDeleteModal();
    modal.querySelector(".delete-modal__overlay").addEventListener("click", close);
    modal.querySelector(".delete-modal__close").addEventListener("click", close);
    modal.querySelector(".delete-modal__cancel").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    return modal;
  }

  function openDeleteModal({ productId, productName }) {
    const modal = ensureDeleteModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
    modal.dataset.productId = productId || "";

    const productEl = modal.querySelector(".delete-modal__product");
    const errEl = modal.querySelector(".delete-modal__error");
    const confirmBtn = modal.querySelector(".delete-modal__confirm");

    if (productEl) productEl.textContent = productName || "—";
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    confirmBtn.onclick = async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Suppression...";

        // Optionnel: récupérer image_path, supprimer après
        const { data: p, error: pErr } = await supabase
          .from("products")
          .select("id, image_path")
          .eq("id", productId)
          .single();

        if (pErr) throw new Error(pErr.message);

        const { error } = await supabase.from("products").delete().eq("id", productId);
        if (error) throw new Error(error.message);

        // On tente de supprimer l'image si policy DELETE existe (sinon ça échouera sans bloquer)
        if (p?.image_path) {
          const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([p.image_path]);
          if (rmErr) console.warn("[DELETE] image remove warning:", rmErr.message);
        }

        brandsCache = null;

        closeDeleteModal();
        await loadProducts();
      } catch (e) {
        console.error(e);
        if (errEl) { errEl.style.display = "block"; errEl.textContent = e?.message || "Erreur lors de la suppression"; }
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Supprimer";
      }
    };
  }

  function closeDeleteModal() {
    const modal = document.querySelector(".delete-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  // =========================
  // 4) MODALE UPDATE (marque + description + upload image)
  // =========================
  function ensureUpdateModalExists() {
    let modal = document.querySelector(".update-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "update-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100001; display:none; font-family:inherit;";

    modal.innerHTML = `
      <div class="update-modal__overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>

      <div class="update-modal__content" style="
        position:relative; width:min(760px, calc(100vw - 32px));
        max-height:calc(100vh - 32px); overflow:auto;
        background:#fff; border-radius:14px; padding:18px;
        margin:16px auto; top:50%; transform:translateY(-50%);
        box-shadow:0 20px 70px rgba(0,0,0,.35);
      ">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-size:18px; font-weight:800; margin-bottom:6px;">Modifier le produit</div>
            <div style="opacity:.7;">Mettez à jour les informations puis enregistrez.</div>
          </div>
          <button type="button" class="update-modal__close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
        </div>

        <hr style="border:none; height:1px; background:#e5e7eb; margin:14px 0;" />

        <form class="update-form" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Nom *</span>
            <input class="u-name" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Catégorie</span>
            <select class="u-category" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;"></select>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Marque</span>
            <input class="u-brand" type="text" list="brand-datalist-update"
              placeholder="ex: Apple, Samsung..."
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
            <datalist id="brand-datalist-update"></datalist>
            <div style="font-size:12px; opacity:.6;">Choisissez une marque existante ou tapez-en une nouvelle.</div>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">SKU</span>
            <input class="u-sku" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Code-barres</span>
            <input class="u-barcode" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Prix (EUR)</span>
            <input class="u-price" type="text" placeholder="ex: 12,50" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Coût (EUR)</span>
            <input class="u-cost" type="text" placeholder="ex: 8,20" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Stock</span>
            <input class="u-stock" type="number" min="0" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Statut</span>
            <select class="u-active" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px; grid-column:1/-1;">
            <span style="font-size:12px; opacity:.7;">Description</span>
            <textarea class="u-description" rows="4" placeholder="Description du produit..."
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; resize:vertical;"></textarea>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px; grid-column:1/-1;">
            <span style="font-size:12px; opacity:.7;">Changer l’image (optionnel)</span>
            <input class="u-image" type="file" accept="image/*"
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
            <div class="u-image-help" style="font-size:12px; opacity:.6;">Une nouvelle image sera ajoutée et utilisée. (L’ancienne n’est pas supprimée automatiquement.)</div>
          </label>

          <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
            <button type="button" class="u-cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
            <button type="submit" class="u-save" style="border:none; background:#0f766e; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Enregistrer</button>
          </div>

          <div class="update-error" style="display:none; grid-column:1/-1; color:#b91c1c; font-weight:600;"></div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeUpdateModal();
    modal.querySelector(".update-modal__overlay").addEventListener("click", close);
    modal.querySelector(".update-modal__close").addEventListener("click", close);
    modal.querySelector(".u-cancel").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    return modal;
  }

  function openUpdateModal() {
    const modal = ensureUpdateModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeUpdateModal() {
    const modal = document.querySelector(".update-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  async function openUpdateForProduct(productId) {
    const modal = ensureUpdateModalExists();
    const form = modal.querySelector(".update-form");
    const errEl = modal.querySelector(".update-error");
    const btnSave = modal.querySelector(".u-save");

    const iName = modal.querySelector(".u-name");
    const iCat = modal.querySelector(".u-category");
    const iBrand = modal.querySelector(".u-brand");
    const dlBrands = modal.querySelector("#brand-datalist-update");
    const iSku = modal.querySelector(".u-sku");
    const iBarcode = modal.querySelector(".u-barcode");
    const iPrice = modal.querySelector(".u-price");
    const iCost = modal.querySelector(".u-cost");
    const iStock = modal.querySelector(".u-stock");
    const iActive = modal.querySelector(".u-active");
    const iDesc = modal.querySelector(".u-description");
    const iImage = modal.querySelector(".u-image");

    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    if (iImage) iImage.value = "";

    await populateBrandDatalist(dlBrands);

    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, barcode, price_cents, cost_cents, stock_qty, is_active, category_id, image_path, description, brand")
      .eq("id", productId)
      .single();

    if (error) {
      console.error("[UPDATE MODAL] product load error:", error);
      alert("Erreur chargement produit: " + error.message);
      return;
    }

    iName.value = data.name ?? "";
    iBrand.value = data.brand ?? "";
    iSku.value = data.sku ?? "";
    iBarcode.value = data.barcode ?? "";
    iPrice.value = centsToEurosInput(data.price_cents);
    iCost.value = centsToEurosInput(data.cost_cents);
    iStock.value = String(data.stock_qty ?? 0);
    iActive.value = data.is_active ? "true" : "false";
    iDesc.value = data.description ?? "";

    await populateCategorySelect(iCat, data.category_id);
    modal.dataset.productId = data.id;

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      const name = iName.value.trim();
      if (!name) {
        if (errEl) { errEl.style.display = "block"; errEl.textContent = "Le nom du produit est obligatoire."; }
        return;
      }

      const brand = iBrand.value.trim();
      const priceC = eurosToCents(iPrice.value);
      const costC = eurosToCents(iCost.value);

      // IMPORTANT: éviter null si colonnes NOT NULL
      const payload = {
        name,
        brand: brand || null,
        description: (iDesc.value || "").trim() || null,
        sku: iSku.value.trim() || null,
        barcode: iBarcode.value.trim() || null,
        price_cents: (priceC === null ? 0 : priceC),
        cost_cents: (costC === null ? 0 : costC),
        stock_qty: Math.max(0, parseInt(iStock.value || "0", 10) || 0),
        is_active: iActive.value === "true",
        category_id: iCat.value ? iCat.value : null
      };

      const file = iImage?.files?.[0] || null;

      try {
        btnSave.disabled = true;
        btnSave.textContent = "Enregistrement...";

        const { error: upErr } = await supabase.from("products").update(payload).eq("id", data.id);
        if (upErr) throw new Error(upErr.message);

        if (file) {
          btnSave.textContent = "Upload image...";
          const uploaded = await uploadProductImage({ productId: data.id, file });

          const { error: imgErr } = await supabase
            .from("products")
            .update({ image_path: uploaded.path })
            .eq("id", data.id);

          if (imgErr) throw new Error(imgErr.message);
        }

        brandsCache = null;

        closeUpdateModal();
        await loadProducts();
      } catch (ex) {
        console.error(ex);
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = ex?.message || "Erreur lors de la mise à jour";
        }
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = "Enregistrer";
      }
    };

    openUpdateModal();
  }

  // =========================
  // 5) MODALE ADD (marque + description + upload image)
  // =========================
  function ensureAddModalExists() {
    let modal = document.querySelector(".add-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "add-modal";
    modal.style.cssText = "position:fixed; inset:0; z-index:100002; display:none; font-family:inherit;";

    modal.innerHTML = `
      <div class="add-modal__overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>

      <div class="add-modal__content" style="
        position:relative; width:min(760px, calc(100vw - 32px));
        max-height:calc(100vh - 32px); overflow:auto;
        background:#fff; border-radius:14px; padding:18px;
        margin:16px auto; top:50%; transform:translateY(-50%);
        box-shadow:0 20px 70px rgba(0,0,0,.35);
      ">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-size:18px; font-weight:800; margin-bottom:6px;">Ajouter un produit</div>
            <div style="opacity:.7;">Renseignez les informations puis enregistrez.</div>
          </div>
          <button type="button" class="add-modal__close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
        </div>

        <hr style="border:none; height:1px; background:#e5e7eb; margin:14px 0;" />

        <form class="add-form" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Nom *</span>
            <input class="a-name" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Catégorie</span>
            <select class="a-category" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;"></select>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Marque</span>
            <input class="a-brand" type="text" list="brand-datalist-add"
              placeholder="ex: Apple, Samsung..."
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
            <datalist id="brand-datalist-add"></datalist>
            <div style="font-size:12px; opacity:.6;">Choisissez une marque existante ou tapez-en une nouvelle.</div>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">SKU</span>
            <input class="a-sku" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Code-barres</span>
            <input class="a-barcode" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Prix (EUR)</span>
            <input class="a-price" type="text" placeholder="ex: 12,50" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Coût (EUR)</span>
            <input class="a-cost" type="text" placeholder="ex: 8,20" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Stock</span>
            <input class="a-stock" type="number" min="0" value="0" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <label style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:12px; opacity:.7;">Statut</span>
            <select class="a-active" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
              <option value="true" selected>Actif</option>
              <option value="false">Inactif</option>
            </select>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px; grid-column:1/-1;">
            <span style="font-size:12px; opacity:.7;">Description</span>
            <textarea class="a-description" rows="4" placeholder="Description du produit..."
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; resize:vertical;"></textarea>
          </label>

          <label style="display:flex; flex-direction:column; gap:6px; grid-column:1/-1;">
            <span style="font-size:12px; opacity:.7;">Image (optionnel)</span>
            <input class="a-image" type="file" accept="image/*"
              style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
          </label>

          <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
            <button type="button" class="a-cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
            <button type="submit" class="a-save" style="border:none; background:#0f766e; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Ajouter</button>
          </div>

          <div class="add-error" style="display:none; grid-column:1/-1; color:#b91c1c; font-weight:600;"></div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => closeAddModal();
    modal.querySelector(".add-modal__overlay").addEventListener("click", close);
    modal.querySelector(".add-modal__close").addEventListener("click", close);
    modal.querySelector(".a-cancel").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    return modal;
  }

  function openAddModal() {
    const modal = ensureAddModalExists();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeAddModal() {
    const modal = document.querySelector(".add-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  async function openAddProduct() {
    const modal = ensureAddModalExists();
    const form = modal.querySelector(".add-form");
    const errEl = modal.querySelector(".add-error");
    const btnSave = modal.querySelector(".a-save");

    const iName = modal.querySelector(".a-name");
    const iCat = modal.querySelector(".a-category");
    const iBrand = modal.querySelector(".a-brand");
    const dlBrands = modal.querySelector("#brand-datalist-add");
    const iSku = modal.querySelector(".a-sku");
    const iBarcode = modal.querySelector(".a-barcode");
    const iPrice = modal.querySelector(".a-price");
    const iCost = modal.querySelector(".a-cost");
    const iStock = modal.querySelector(".a-stock");
    const iActive = modal.querySelector(".a-active");
    const iDesc = modal.querySelector(".a-description");
    const iImage = modal.querySelector(".a-image");

    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    await populateBrandDatalist(dlBrands);

    // reset
    iName.value = "";
    iBrand.value = "";
    iSku.value = "";
    iBarcode.value = "";
    iPrice.value = "";
    iCost.value = "";
    iStock.value = "0";
    iActive.value = "true";
    iDesc.value = "";
    if (iImage) iImage.value = "";

    await populateCategorySelect(iCat, null);

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      const name = iName.value.trim();
      if (!name) {
        if (errEl) { errEl.style.display = "block"; errEl.textContent = "Le nom du produit est obligatoire."; }
        return;
      }

      const brand = iBrand.value.trim();
      const priceC = eurosToCents(iPrice.value);
      const costC = eurosToCents(iCost.value);

      const payload = {
        name,
        brand: brand || null,
        description: (iDesc.value || "").trim() || null,
        sku: iSku.value.trim() || null,
        barcode: iBarcode.value.trim() || null,
        price_cents: (priceC === null ? 0 : priceC),
        cost_cents: (costC === null ? 0 : costC),
        stock_qty: Math.max(0, parseInt(iStock.value || "0", 10) || 0),
        is_active: iActive.value === "true",
        category_id: iCat.value ? iCat.value : null
      };

      const file = iImage?.files?.[0] || null;

      try {
        btnSave.disabled = true;
        btnSave.textContent = "Ajout...";

        // 1) Insert + récupérer l'ID
        const { data: inserted, error: insErr } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (insErr) throw new Error(insErr.message);

        const productId = inserted.id;

        // 2) Upload image si fournie
        if (file) {
          btnSave.textContent = "Upload image...";
          const uploaded = await uploadProductImage({ productId, file });

          // 3) update produit avec image_path
          const { error: imgErr } = await supabase
            .from("products")
            .update({ image_path: uploaded.path })
            .eq("id", productId);

          if (imgErr) throw new Error(imgErr.message);
        }

        brandsCache = null;

        closeAddModal();
        await loadProducts();
      } catch (ex) {
        console.error(ex);
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = ex?.message || "Erreur lors de l'ajout";
        }
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = "Ajouter";
      }
    };

    openAddModal();
  }

  // =========================
  // CLICK HANDLERS
  // =========================
  document.addEventListener("click", async (e) => {
    const addBtn = e.target.closest(".add-product");
    if (addBtn) {
      e.preventDefault?.();
      await openAddProduct();
      return;
    }

    const showBtn = e.target.closest("a.show-product, .show-product");
    if (showBtn) {
      e.preventDefault();
      const row = showBtn.closest(".product-row");
      const productId = row?.dataset?.productId;
      if (!productId) return;
      openViewModal();
      await loadProductDetailsToView(productId);
      return;
    }

    const delBtn = e.target.closest("a.delete-product, .delete-product");
    if (delBtn) {
      e.preventDefault();
      const row = delBtn.closest(".product-row");
      const productId = row?.dataset?.productId;
      const productName = row?.querySelector(".name")?.textContent?.trim() || "ce produit";
      if (!productId) return;
      openDeleteModal({ productId, productName });
      return;
    }

    const upBtn = e.target.closest("a.update-product, .update-product");
    if (upBtn) {
      e.preventDefault();
      const row = upBtn.closest(".product-row");
      const productId = row?.dataset?.productId;
      if (!productId) return;
      await openUpdateForProduct(productId);
      return;
    }
  }, true);

  // =========================
  // INIT
  // =========================
  await populateCategoryFilterSelect(categorySelect);
  await loadProducts();
  applyFilter(searchInput?.value || "");
  searchInput?.focus();
});
