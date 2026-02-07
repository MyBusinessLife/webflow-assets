document.documentElement.setAttribute("data-page", "admin-categories");

(function () {
  if (window.__MBL_ADMIN_CATEGORIES_RUNNING__) return;
  window.__MBL_ADMIN_CATEGORIES_RUNNING__ = true;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitSupabase(timeoutMs = 8000) {
    const t0 = Date.now();
    while (!window.__MBL_SUPABASE__) {
      if (Date.now() - t0 > timeoutMs) return null;
      await wait(50);
    }
    return window.__MBL_SUPABASE__;
  }

  async function requireSessionOrRedirect(supabase) {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) {
      location.replace("/extranet/login");
      return null;
    }
    return session;
  }

  window.Webflow ||= [];
  window.Webflow.push(async function () {
    const supabase = await waitSupabase();
    if (!supabase) {
      console.error("[ADMIN CATEGORIES] Supabase global introuvable.");
      location.replace("/extranet/login");
      return;
    }

    const session = await requireSessionOrRedirect(supabase);
    if (!session) return;

    function norm(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function slugify(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    }

    function debounce(fn, waitMs = 150) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), waitMs);
      };
    }

    function injectThemeStyles() {
      if (document.getElementById("mbl-admin-categories-theme")) return;

      const style = document.createElement("style");
      style.id = "mbl-admin-categories-theme";
      style.textContent = `
        html[data-page="admin-categories"] body {
          background:
            radial-gradient(920px 420px at 6% -8%, rgba(15, 118, 110, 0.14), transparent 68%),
            radial-gradient(860px 470px at 100% 0%, rgba(14, 165, 233, 0.14), transparent 70%),
            linear-gradient(180deg, #f4f8fc, #edf4fb);
        }

        html[data-page="admin-categories"] .category-row {
          border: 1px solid #d6e2ee;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 8px 20px rgba(12, 37, 66, 0.06);
          transition: transform .16s ease, box-shadow .22s ease, border-color .22s ease;
        }
        html[data-page="admin-categories"] .category-row:hover {
          transform: translateY(-1px);
          border-color: #b8d1e5;
          box-shadow: 0 14px 26px rgba(12, 37, 66, 0.10);
        }

        html[data-page="admin-categories"] .category-name {
          color: #143a61;
          font-weight: 800;
        }

        html[data-page="admin-categories"] .slug-category {
          color: #3f6387;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
        }

        .mbl-ac-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 10px;
          font-weight: 700;
          font-size: 12px;
          border: 1px solid transparent;
        }
        .mbl-ac-pill.is-active {
          color: #0f766e;
          background: rgba(15, 118, 110, 0.12);
          border-color: rgba(15, 118, 110, 0.28);
        }
        .mbl-ac-pill.is-inactive {
          color: #be123c;
          background: rgba(190, 18, 60, 0.12);
          border-color: rgba(190, 18, 60, 0.25);
        }

        .mbl-ac-toolbar {
          margin: 10px 0 14px;
          padding: 12px;
          border: 1px solid #d6e2ee;
          border-radius: 14px;
          background: linear-gradient(180deg, #ffffff, #f7fbff);
          box-shadow: 0 10px 24px rgba(12, 37, 66, 0.08);
        }

        .mbl-ac-controls {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr auto;
          gap: 10px;
          align-items: center;
        }

        .mbl-ac-input,
        .mbl-ac-select {
          width: 100%;
          border: 1px solid #cfdeeb;
          border-radius: 12px;
          background: #ffffff;
          color: #10233f;
          outline: none;
          padding: 10px 12px;
          transition: border-color .2s ease, box-shadow .2s ease;
        }

        .mbl-ac-input:focus,
        .mbl-ac-select:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
        }

        .mbl-ac-count {
          justify-self: end;
          color: #4d6b8a;
          font-size: 12px;
          font-weight: 700;
        }

        .mbl-ac-kpis {
          margin-top: 10px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .mbl-ac-kpi {
          border: 1px solid #d6e2ee;
          border-radius: 12px;
          padding: 10px;
          background: #fff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
        }

        .mbl-ac-kpi-label {
          color: #55708c;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .mbl-ac-kpi-value {
          color: #143a61;
          font-size: 18px;
          font-weight: 800;
        }

        .mbl-ac-modal {
          position: fixed;
          inset: 0;
          z-index: 100002;
          display: none;
          font-family: inherit;
        }

        .mbl-ac-modal * { box-sizing: border-box; }

        .mbl-ac-modal__overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 31, 53, 0.42);
          backdrop-filter: blur(3px);
        }

        .mbl-ac-modal__panel {
          position: relative;
          width: min(760px, calc(100vw - 28px));
          max-height: calc(100vh - 30px);
          overflow: auto;
          background:
            radial-gradient(660px 180px at 6% -5%, rgba(15, 118, 110, 0.10), transparent 65%),
            radial-gradient(620px 240px at 100% 0%, rgba(14, 165, 233, 0.10), transparent 70%),
            linear-gradient(180deg, #f7fbff, #eef6fd);
          border: 1px solid #d6e2ee;
          border-radius: 18px;
          margin: 14px auto;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 25px 60px rgba(12, 37, 66, 0.24);
          color: #10233f;
        }

        .mbl-ac-modal__head {
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

        .mbl-ac-modal__title {
          font-size: 18px;
          font-weight: 800;
          color: #143a61;
          margin-bottom: 6px;
        }

        .mbl-ac-modal__sub {
          color: #55708c;
          font-size: 13px;
          line-height: 1.4;
        }

        .mbl-ac-meta {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .mbl-ac-chip {
          border: 1px solid #c9dbe9;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 700;
          color: #245279;
          background: #fff;
        }

        .mbl-ac-chip.is-dirty {
          color: #92400e;
          border-color: #facc15;
          background: #fff7d6;
          display: none;
        }

        .mbl-ac-chip.is-dirty.is-visible {
          display: inline-flex;
        }

        .mbl-ac-close {
          border: 1px solid #cfdeeb;
          background: #fff;
          color: #0c4a6e;
          border-radius: 10px;
          padding: 10px 12px;
          cursor: pointer;
          font-weight: 800;
        }

        .mbl-ac-modal__body {
          padding: 14px 16px 16px;
          display: grid;
          gap: 12px;
        }

        .mbl-ac-grid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mbl-ac-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .mbl-ac-field--full {
          grid-column: 1 / -1;
        }

        .mbl-ac-label {
          color: #4f6b86;
          font-size: 12px;
          font-weight: 700;
        }

        .mbl-ac-input,
        .mbl-ac-select,
        .mbl-ac-field textarea {
          width: 100%;
          border: 1px solid #cfdeeb;
          border-radius: 10px;
          padding: 10px 11px;
          outline: none;
          color: #10233f;
          background: #fff;
          transition: border-color .2s ease, box-shadow .2s ease;
        }

        .mbl-ac-field textarea {
          min-height: 84px;
          resize: vertical;
        }

        .mbl-ac-input:focus,
        .mbl-ac-select:focus,
        .mbl-ac-field textarea:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
        }

        .mbl-ac-input.is-invalid,
        .mbl-ac-select.is-invalid {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
        }

        .mbl-ac-hint {
          color: #6d86a0;
          font-size: 12px;
        }

        .mbl-ac-modal__error {
          display: none;
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #b91c1c;
          border-radius: 10px;
          padding: 10px 11px;
          font-size: 13px;
          font-weight: 700;
        }

        .mbl-ac-modal__actions {
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

        .mbl-ac-btn {
          border: 1px solid #cfdeeb;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          background: #fff;
          color: #0c4a6e;
        }

        .mbl-ac-btn--primary {
          border-color: #0f766e;
          background: linear-gradient(180deg, #0f766e, #0d5d57);
          color: #fff;
          box-shadow: 0 10px 24px rgba(15, 118, 110, 0.28);
        }

        .mbl-ac-delete-modal {
          position: fixed;
          inset: 0;
          z-index: 100003;
          display: none;
          font-family: inherit;
        }

        .mbl-ac-delete-modal * { box-sizing: border-box; }

        .mbl-ac-delete-modal__overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 31, 53, 0.42);
          backdrop-filter: blur(2px);
        }

        .mbl-ac-delete-modal__panel {
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

        .mbl-ac-delete-modal__title {
          font-size: 18px;
          font-weight: 800;
          color: #143a61;
          margin-bottom: 6px;
        }

        .mbl-ac-delete-modal__text {
          color: #55708c;
          line-height: 1.45;
        }

        .mbl-ac-delete-modal__target {
          margin-top: 12px;
          padding: 12px;
          border: 1px solid #d6e2ee;
          border-radius: 10px;
          background: #fff;
        }

        .mbl-ac-delete-modal__target-label {
          color: #5a7490;
          font-size: 12px;
          margin-bottom: 5px;
        }

        .mbl-ac-delete-modal__target-value {
          color: #143a61;
          font-weight: 800;
        }

        .mbl-ac-delete-modal__warn {
          margin-top: 10px;
          border: 1px dashed #f59e0b;
          background: #fff7e6;
          color: #92400e;
          border-radius: 10px;
          padding: 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .mbl-ac-delete-modal__confirm {
          margin-top: 10px;
          border: 1px dashed #d8e4ef;
          border-radius: 10px;
          padding: 10px;
          background: #fbfdff;
        }

        .mbl-ac-delete-modal__confirm-label {
          color: #5a7490;
          font-size: 12px;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .mbl-ac-delete-modal__input {
          width: 100%;
          border: 1px solid #cfdeeb;
          border-radius: 10px;
          padding: 9px 10px;
          outline: none;
          color: #10233f;
          background: #fff;
        }

        .mbl-ac-delete-modal__input:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
        }

        .mbl-ac-delete-modal__actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 12px;
        }

        .mbl-ac-delete-modal__error {
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

        @media (max-width: 980px) {
          .mbl-ac-controls {
            grid-template-columns: 1fr;
          }

          .mbl-ac-count {
            justify-self: start;
          }

          .mbl-ac-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .mbl-ac-grid {
            grid-template-columns: 1fr;
          }
        }
      `;

      document.head.appendChild(style);
    }

    injectThemeStyles();

    const ROW_SELECTOR = ".category-row";
    const firstRow = document.querySelector(ROW_SELECTOR);
    if (!firstRow) {
      console.error("[ADMIN CATEGORIES] .category-row introuvable.");
      return;
    }

    const rowsContainer = firstRow.parentElement;

    const listState = {
      items: [],
      filtered: [],
      search: "",
      status: "all",
      sort: "created_desc",
    };

    let listUi = null;

    const modalState = {
      mode: "add",
      id: null,
      saving: false,
      dirty: false,
      initialSignature: "",
      slugTouched: false,
    };

    function categoryStatusLabel(isActive) {
      return isActive ? "Actif" : "Inactif";
    }

    function applyStatus(el, isActive) {
      if (!el) return;
      el.classList.remove("mbl-ac-pill", "is-active", "is-inactive");
      el.classList.add("mbl-ac-pill", isActive ? "is-active" : "is-inactive");
      el.textContent = categoryStatusLabel(isActive);
    }

    function setRowActionsEnabled(rowEl, enabled) {
      rowEl
        .querySelectorAll("a.update-category, .update-category, a.delete-category, .delete-category")
        .forEach((el) => {
          el.style.pointerEvents = enabled ? "" : "none";
          el.style.opacity = enabled ? "" : "0.45";
        });
    }

    function buildSearchTextFromItem(item) {
      return norm([item.name, item.slug, item.is_active ? "actif" : "inactif"].join(" "));
    }

    function fillRow(rowEl, item) {
      const nameEl = rowEl.querySelector(".category-name");
      const slugEl = rowEl.querySelector(".slug-category");
      const statusEl = rowEl.querySelector(".status-category");

      if (nameEl) nameEl.textContent = item.name || "—";
      if (slugEl) slugEl.textContent = item.slug || "—";
      applyStatus(statusEl, !!item.is_active);

      rowEl.dataset.categoryId = item.id || "";
      rowEl.dataset.categoryName = item.name || "";
      rowEl.dataset.categorySlug = item.slug || "";
      rowEl.dataset.categoryStatus = item.is_active ? "active" : "inactive";
    }

    function sortCategories(rows) {
      const list = rows.slice();
      list.sort((a, b) => {
        switch (listState.sort) {
          case "name_asc":
            return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
          case "name_desc":
            return String(b.name || "").localeCompare(String(a.name || ""), "fr", { sensitivity: "base" });
          case "slug_asc":
            return String(a.slug || "").localeCompare(String(b.slug || ""), "fr", { sensitivity: "base" });
          case "slug_desc":
            return String(b.slug || "").localeCompare(String(a.slug || ""), "fr", { sensitivity: "base" });
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
          name: hasData ? "Aucun resultat" : "Aucune categorie",
          slug: "—",
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

      const activeCount = filtered.filter((c) => c.is_active).length;
      const inactiveCount = filtered.length - activeCount;

      const slugMap = new Map();
      filtered.forEach((c) => {
        const key = String(c.slug || "").trim().toLowerCase();
        if (!key) return;
        slugMap.set(key, (slugMap.get(key) || 0) + 1);
      });
      const duplicateSlugs = Array.from(slugMap.values()).filter((n) => n > 1).length;

      ui.kpis.innerHTML = `
        <article class="mbl-ac-kpi">
          <div class="mbl-ac-kpi-label">Categories</div>
          <div class="mbl-ac-kpi-value">${filtered.length} / ${total.length}</div>
        </article>
        <article class="mbl-ac-kpi">
          <div class="mbl-ac-kpi-label">Actives</div>
          <div class="mbl-ac-kpi-value">${activeCount}</div>
        </article>
        <article class="mbl-ac-kpi">
          <div class="mbl-ac-kpi-label">Inactives</div>
          <div class="mbl-ac-kpi-value">${inactiveCount}</div>
        </article>
        <article class="mbl-ac-kpi">
          <div class="mbl-ac-kpi-label">Slugs dupliques</div>
          <div class="mbl-ac-kpi-value">${duplicateSlugs}</div>
        </article>
      `;

      ui.count.textContent = `${filtered.length} / ${total.length} affichees`;
      ui.status.value = listState.status;
      ui.sort.value = listState.sort;
    }

    function refreshListingView() {
      const query = listState.search;
      const status = listState.status;

      const filtered = (listState.items || []).filter((item) => {
        if (status === "active" && !item.is_active) return false;
        if (status === "inactive" && item.is_active) return false;
        if (query && !(item._search || "").includes(query)) return false;
        return true;
      });

      listState.filtered = sortCategories(filtered);
      renderRows(listState.filtered);
      renderKpis();
    }

    function ensureListingUi() {
      if (listUi) return listUi;

      const toolbar = document.createElement("section");
      toolbar.className = "mbl-ac-toolbar";
      toolbar.innerHTML = `
        <div class="mbl-ac-controls">
          <input type="search" class="mbl-ac-input mbl-ac-search" placeholder="Rechercher nom, slug..." />
          <select class="mbl-ac-select mbl-ac-status">
            <option value="all">Tous les statuts</option>
            <option value="active">Actives</option>
            <option value="inactive">Inactives</option>
          </select>
          <select class="mbl-ac-select mbl-ac-sort">
            <option value="created_desc">Plus recentes</option>
            <option value="created_asc">Plus anciennes</option>
            <option value="name_asc">Nom (A-Z)</option>
            <option value="name_desc">Nom (Z-A)</option>
            <option value="slug_asc">Slug (A-Z)</option>
            <option value="slug_desc">Slug (Z-A)</option>
          </select>
          <div class="mbl-ac-count">0 / 0 affichees</div>
        </div>
        <div class="mbl-ac-kpis"></div>
      `;

      rowsContainer.parentElement.insertBefore(toolbar, rowsContainer);

      const search = toolbar.querySelector(".mbl-ac-search");
      const status = toolbar.querySelector(".mbl-ac-status");
      const sort = toolbar.querySelector(".mbl-ac-sort");
      const count = toolbar.querySelector(".mbl-ac-count");
      const kpis = toolbar.querySelector(".mbl-ac-kpis");

      search.addEventListener("input", debounce(() => {
        listState.search = norm(search.value || "");
        refreshListingView();
      }, 120));

      search.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          listState.search = norm(search.value || "");
          refreshListingView();
        }
        if (e.key === "Escape") {
          search.value = "";
          listState.search = "";
          refreshListingView();
        }
      });

      status.addEventListener("change", () => {
        listState.status = status.value || "all";
        refreshListingView();
      });

      sort.addEventListener("change", () => {
        listState.sort = sort.value || "created_desc";
        refreshListingView();
      });

      listUi = { toolbar, search, status, sort, count, kpis };
      return listUi;
    }

    async function loadCategories() {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ADMIN CATEGORIES] load error:", error);
        listState.items = [];
        listState.filtered = [];
        fillRow(firstRow, { id: "", name: "Erreur chargement", slug: "—", is_active: false });
        setRowActionsEnabled(firstRow, false);
        ensureListingUi();
        renderKpis();
        return;
      }

      const cats = data || [];
      listState.items = cats.map((c) => {
        const ts = c.created_at ? new Date(c.created_at).getTime() : 0;
        return {
          ...c,
          _createdTs: Number.isFinite(ts) ? ts : 0,
          _search: buildSearchTextFromItem(c),
        };
      });

      ensureListingUi();
      refreshListingView();
    }

    function ensureCategoryModalExists() {
      let modal = document.querySelector(".mbl-ac-modal");
      if (modal) return modal;

      modal = document.createElement("div");
      modal.className = "mbl-ac-modal";
      modal.innerHTML = `
        <div class="mbl-ac-modal__overlay"></div>
        <div class="mbl-ac-modal__panel">
          <div class="mbl-ac-modal__head">
            <div>
              <div class="mbl-ac-modal__title">Categorie</div>
              <div class="mbl-ac-modal__sub">Renseignez les informations puis enregistrez.</div>
              <div class="mbl-ac-meta">
                <span class="mbl-ac-chip mbl-ac-mode-chip">Mode: creation</span>
                <span class="mbl-ac-chip is-dirty mbl-ac-dirty-chip">Modifications non sauvegardees</span>
              </div>
            </div>
            <button type="button" class="mbl-ac-close">Fermer</button>
          </div>

          <div class="mbl-ac-modal__body">
            <div class="mbl-ac-grid">
              <label class="mbl-ac-field">
                <span class="mbl-ac-label">Nom *</span>
                <input type="text" class="mbl-ac-input cf-name" />
              </label>

              <label class="mbl-ac-field">
                <span class="mbl-ac-label">Slug *</span>
                <input type="text" class="mbl-ac-input cf-slug" />
                <div class="mbl-ac-hint">Auto depuis le nom tant que vous ne modifiez pas le slug.</div>
              </label>

              <label class="mbl-ac-field">
                <span class="mbl-ac-label">Statut</span>
                <select class="mbl-ac-select cf-active">
                  <option value="true">Actif</option>
                  <option value="false">Inactif</option>
                </select>
              </label>
            </div>

            <div class="mbl-ac-modal__error"></div>
          </div>

          <div class="mbl-ac-modal__actions">
            <button type="button" class="mbl-ac-btn cf-cancel">Annuler</button>
            <button type="button" class="mbl-ac-btn mbl-ac-btn--primary cf-save">Enregistrer</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector(".mbl-ac-modal__overlay").addEventListener("click", () => tryCloseCategoryModal());
      modal.querySelector(".mbl-ac-close").addEventListener("click", () => tryCloseCategoryModal());
      modal.querySelector(".cf-cancel").addEventListener("click", () => tryCloseCategoryModal());
      modal.querySelector(".cf-save").addEventListener("click", () => submitCategoryModal());

      modal.querySelector(".cf-name").addEventListener("input", () => {
        if (!modalState.slugTouched) {
          const slugField = modal.querySelector(".cf-slug");
          slugField.value = slugify(modal.querySelector(".cf-name").value || "");
        }
        refreshCategoryModalDirty();
      });

      modal.querySelector(".cf-slug").addEventListener("input", () => {
        const name = modal.querySelector(".cf-name").value || "";
        const slugField = modal.querySelector(".cf-slug");
        const sanitized = slugify(slugField.value || "");
        if (slugField.value !== sanitized) slugField.value = sanitized;
        modalState.slugTouched = sanitized !== slugify(name);
        refreshCategoryModalDirty();
      });

      modal.querySelector(".cf-active").addEventListener("change", refreshCategoryModalDirty);

      modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          tryCloseCategoryModal();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          submitCategoryModal();
        }
      });

      return modal;
    }

    function openCategoryModal() {
      const modal = ensureCategoryModalExists();
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
    }

    function closeCategoryModal() {
      const modal = document.querySelector(".mbl-ac-modal");
      if (!modal) return;
      modal.style.display = "none";
      document.body.style.overflow = "";
      modalState.saving = false;
    }

    function getCategoryModalSignature() {
      const modal = ensureCategoryModalExists();
      return JSON.stringify({
        name: modal.querySelector(".cf-name")?.value || "",
        slug: modal.querySelector(".cf-slug")?.value || "",
        active: modal.querySelector(".cf-active")?.value || "true",
      });
    }

    function setCategoryModalDirty(flag) {
      modalState.dirty = Boolean(flag);
      const modal = ensureCategoryModalExists();
      const chip = modal.querySelector(".mbl-ac-dirty-chip");
      if (chip) chip.classList.toggle("is-visible", modalState.dirty);
    }

    function refreshCategoryModalDirty() {
      setCategoryModalDirty(getCategoryModalSignature() !== modalState.initialSignature);
    }

    function resetCategoryModalDirtyBaseline() {
      modalState.initialSignature = getCategoryModalSignature();
      setCategoryModalDirty(false);
    }

    function showCategoryModalError(message) {
      const modal = ensureCategoryModalExists();
      const err = modal.querySelector(".mbl-ac-modal__error");
      err.textContent = message || "";
      err.style.display = message ? "block" : "none";
    }

    function clearCategoryModalInvalid() {
      const modal = ensureCategoryModalExists();
      modal.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    }

    function markCategoryInvalid(selectors) {
      const modal = ensureCategoryModalExists();
      selectors.forEach((sel) => {
        const el = modal.querySelector(sel);
        if (el) el.classList.add("is-invalid");
      });
    }

    function setCategoryModalMode(mode) {
      modalState.mode = mode;
      const modal = ensureCategoryModalExists();
      const title = modal.querySelector(".mbl-ac-modal__title");
      const chip = modal.querySelector(".mbl-ac-mode-chip");
      const save = modal.querySelector(".cf-save");

      if (mode === "add") {
        if (title) title.textContent = "Ajouter une categorie";
        if (chip) chip.textContent = "Mode: creation";
        if (save) save.textContent = "Ajouter";
      } else {
        if (title) title.textContent = "Modifier la categorie";
        if (chip) chip.textContent = "Mode: edition";
        if (save) save.textContent = "Enregistrer";
      }
    }

    function tryCloseCategoryModal() {
      if (modalState.saving) return;
      if (modalState.dirty) {
        const ok = window.confirm("Vous avez des modifications non sauvegardees. Fermer quand meme ?");
        if (!ok) return;
      }
      closeCategoryModal();
    }

    async function openAddCategory() {
      const modal = ensureCategoryModalExists();
      modalState.id = null;
      modalState.slugTouched = false;
      setCategoryModalMode("add");
      showCategoryModalError("");
      clearCategoryModalInvalid();

      modal.querySelector(".cf-name").value = "";
      modal.querySelector(".cf-slug").value = "";
      modal.querySelector(".cf-active").value = "true";

      openCategoryModal();
      resetCategoryModalDirtyBaseline();
      modal.querySelector(".cf-name").focus();
    }

    async function openUpdateCategory(categoryId) {
      const modal = ensureCategoryModalExists();
      modalState.id = categoryId;
      modalState.slugTouched = true;
      setCategoryModalMode("edit");
      showCategoryModalError("");
      clearCategoryModalInvalid();

      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active")
        .eq("id", categoryId)
        .single();

      if (error) {
        showCategoryModalError("Erreur chargement categorie: " + error.message);
        openCategoryModal();
        return;
      }

      modal.querySelector(".cf-name").value = data?.name || "";
      modal.querySelector(".cf-slug").value = data?.slug || "";
      modal.querySelector(".cf-active").value = data?.is_active ? "true" : "false";

      openCategoryModal();
      resetCategoryModalDirtyBaseline();
      modal.querySelector(".cf-name").focus();
    }

    async function ensureSlugUnique(slug, excludeId) {
      const { data, error } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", slug)
        .limit(2);

      if (error) throw new Error(error.message);

      const list = data || [];
      if (!list.length) return true;
      if (excludeId && list.every((r) => r.id === excludeId)) return true;
      if (excludeId && list.length === 1 && list[0].id === excludeId) return true;
      return false;
    }

    async function submitCategoryModal() {
      const modal = ensureCategoryModalExists();
      if (modalState.saving) return;

      showCategoryModalError("");
      clearCategoryModalInvalid();

      const name = String(modal.querySelector(".cf-name").value || "").trim();
      const slug = slugify(modal.querySelector(".cf-slug").value || "");
      const isActive = modal.querySelector(".cf-active").value === "true";

      modal.querySelector(".cf-slug").value = slug;

      if (!name) {
        markCategoryInvalid([".cf-name"]);
        showCategoryModalError("Le nom est obligatoire.");
        return;
      }

      if (!slug) {
        markCategoryInvalid([".cf-slug"]);
        showCategoryModalError("Le slug est obligatoire.");
        return;
      }

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        markCategoryInvalid([".cf-slug"]);
        showCategoryModalError("Le slug doit contenir uniquement lettres minuscules, chiffres et tirets.");
        return;
      }

      const saveBtn = modal.querySelector(".cf-save");
      const prevLabel = saveBtn ? saveBtn.textContent : "";

      try {
        modalState.saving = true;
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = modalState.mode === "add" ? "Ajout..." : "Enregistrement...";
        }

        const unique = await ensureSlugUnique(slug, modalState.id || null);
        if (!unique) {
          markCategoryInvalid([".cf-slug"]);
          throw new Error("Ce slug est deja utilise par une autre categorie.");
        }

        const payload = {
          name,
          slug,
          is_active: isActive,
        };

        if (modalState.mode === "add") {
          const { error } = await supabase.from("categories").insert(payload);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase
            .from("categories")
            .update(payload)
            .eq("id", modalState.id);
          if (error) throw new Error(error.message);
        }

        closeCategoryModal();
        await loadCategories();
      } catch (err) {
        console.error(err);
        showCategoryModalError(err?.message || "Erreur lors de l'enregistrement.");
      } finally {
        modalState.saving = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = prevLabel || (modalState.mode === "add" ? "Ajouter" : "Enregistrer");
        }
      }
    }

    function ensureDeleteModalExists() {
      let modal = document.querySelector(".mbl-ac-delete-modal");
      if (modal) return modal;

      modal = document.createElement("div");
      modal.className = "mbl-ac-delete-modal";
      modal.innerHTML = `
        <div class="mbl-ac-delete-modal__overlay"></div>
        <div class="mbl-ac-delete-modal__panel">
          <div class="mbl-ac-delete-modal__title">Supprimer la categorie</div>
          <div class="mbl-ac-delete-modal__text">Cette action est irreversible. Saisissez le slug pour confirmer.</div>

          <div class="mbl-ac-delete-modal__target">
            <div class="mbl-ac-delete-modal__target-label">Categorie</div>
            <div class="mbl-ac-delete-modal__target-value dc-name">—</div>
          </div>

          <div class="mbl-ac-delete-modal__warn dc-products-count">Produits lies: —</div>

          <div class="mbl-ac-delete-modal__confirm">
            <div class="mbl-ac-delete-modal__confirm-label">Tapez le slug exact pour activer la suppression</div>
            <input type="text" class="mbl-ac-delete-modal__input dc-confirm-input" />
          </div>

          <div class="mbl-ac-delete-modal__actions">
            <button type="button" class="mbl-ac-btn dc-cancel">Annuler</button>
            <button type="button" class="mbl-ac-btn mbl-ac-btn--primary dc-confirm" disabled>Supprimer</button>
          </div>

          <div class="mbl-ac-delete-modal__error dc-error"></div>
        </div>
      `;

      document.body.appendChild(modal);

      const close = () => closeDeleteModal();
      modal.querySelector(".mbl-ac-delete-modal__overlay").addEventListener("click", close);
      modal.querySelector(".dc-cancel").addEventListener("click", close);

      modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeDeleteModal();
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
      const modal = document.querySelector(".mbl-ac-delete-modal");
      if (!modal) return;
      modal.style.display = "none";
      document.body.style.overflow = "";
    }

    async function openDeleteCategory(categoryId) {
      const modal = ensureDeleteModalExists();
      const nameEl = modal.querySelector(".dc-name");
      const countEl = modal.querySelector(".dc-products-count");
      const input = modal.querySelector(".dc-confirm-input");
      const confirmBtn = modal.querySelector(".dc-confirm");
      const errEl = modal.querySelector(".dc-error");

      const { data: cat, error } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("id", categoryId)
        .single();

      if (error) {
        console.error(error);
        window.alert("Erreur chargement categorie: " + error.message);
        return;
      }

      const { count, error: countErr } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", categoryId);
      if (countErr) console.warn("[ADMIN CATEGORIES] products count warning:", countErr.message);

      modal.dataset.categoryId = cat.id;
      modal.dataset.expectedSlug = cat.slug || "";

      if (nameEl) nameEl.textContent = `${cat.name || "—"} (${cat.slug || "—"})`;
      if (countEl) countEl.textContent = `Produits lies: ${count || 0}`;
      if (input) input.value = "";
      if (confirmBtn) confirmBtn.disabled = true;
      if (errEl) {
        errEl.style.display = "none";
        errEl.textContent = "";
      }

      const refreshGate = () => {
        const expected = modal.dataset.expectedSlug || "";
        const typed = String(input?.value || "").trim();
        if (confirmBtn) confirmBtn.disabled = !expected || typed !== expected;
      };

      if (input) input.oninput = refreshGate;
      refreshGate();

      confirmBtn.onclick = async () => {
        try {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Suppression...";

          const { error: delErr } = await supabase
            .from("categories")
            .delete()
            .eq("id", modal.dataset.categoryId || "");

          if (delErr) throw new Error(delErr.message);

          closeDeleteModal();
          await loadCategories();
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

    document.addEventListener(
      "click",
      async (e) => {
        const withModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

        const addBtn = e.target.closest(".add-category");
        if (addBtn && !withModifier) {
          e.preventDefault();
          await openAddCategory();
          return;
        }

        const updateBtn = e.target.closest("a.update-category, .update-category");
        if (updateBtn && !withModifier) {
          e.preventDefault();
          const row = updateBtn.closest(ROW_SELECTOR);
          const categoryId = row?.dataset?.categoryId;
          if (!categoryId) return;
          await openUpdateCategory(categoryId);
          return;
        }

        const deleteBtn = e.target.closest("a.delete-category, .delete-category");
        if (deleteBtn && !withModifier) {
          e.preventDefault();
          const row = deleteBtn.closest(ROW_SELECTOR);
          const categoryId = row?.dataset?.categoryId;
          if (!categoryId) return;
          await openDeleteCategory(categoryId);
        }
      },
      true
    );

    ensureListingUi();
    await loadCategories();
  });
})();
