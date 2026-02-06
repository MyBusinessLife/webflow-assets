document.documentElement.setAttribute("data-page","admin-categories");

(function () {
  if (window.__MBL_ADMIN_CATEGORIES_RUNNING__) return;
  window.__MBL_ADMIN_CATEGORIES_RUNNING__ = true;

  console.log("[CATEGORIES] script loaded");

  async function waitSupabase(timeoutMs = 8000) {
    const t0 = Date.now();
    while (!window.__MBL_SUPABASE__) {
      if (Date.now() - t0 > timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
    return window.__MBL_SUPABASE__;
  }

  window.Webflow ||= [];
  window.Webflow.push(async function () {
    // =========================
    // SUPABASE (singleton global)
    // =========================
    const supabase = await waitSupabase();
    if (!supabase) {
      console.error("[CATEGORIES] ❌ window.__MBL_SUPABASE__ introuvable. Le protect global ne tourne pas sur cette page.");
      return;
    }

    // =========================
    // SELECTORS
    // =========================
    const ROW_SELECTOR = ".category-row";

    // =========================
    // HELPERS
    // =========================
    function slugify(str) {
      return String(str || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // accents
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
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

    // =========================
    // 1) LISTING
    // =========================
    const firstRow = document.querySelector(ROW_SELECTOR);
    if (!firstRow) {
      console.error("[ADMIN CATEGORIES] .category-row introuvable.");
      return;
    }
    firstRow.style.display = ""; // sécurité si template caché

    function fillRow(rowEl, c) {
      const nameEl = rowEl.querySelector(".category-name");
      const slugEl = rowEl.querySelector(".slug-category");
      const statusEl = rowEl.querySelector(".status-category");

      if (nameEl) nameEl.textContent = c?.name ?? "—";
      if (slugEl) slugEl.textContent = c?.slug ?? "—";
      applyStatus(statusEl, !!c?.is_active);

      rowEl.dataset.categoryId = c?.id || "";
      rowEl.style.display = "";
    }

    async function loadCategories() {
      // Nettoyage clones
      document.querySelectorAll(ROW_SELECTOR).forEach((row, idx) => {
        if (idx > 0) row.remove();
      });

      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ADMIN CATEGORIES] load error:", error);
        fillRow(firstRow, { id: "", name: "Erreur chargement", slug: "—", is_active: false });
        return;
      }

      const cats = data || [];
      if (cats.length === 0) {
        fillRow(firstRow, { id: "", name: "Aucune catégorie", slug: "—", is_active: false });
        return;
      }

      fillRow(firstRow, cats[0]);
      for (let i = 1; i < cats.length; i++) {
        const clone = firstRow.cloneNode(true);
        fillRow(clone, cats[i]);
        firstRow.parentElement.appendChild(clone);
      }
    }

    // =========================
    // 2) MODAL DELETE
    // =========================
    function ensureDeleteModalExists() {
      let modal = document.querySelector(".delete-category-modal");
      if (modal) return modal;

      modal = document.createElement("div");
      modal.className = "delete-category-modal";
      modal.style.cssText = "position:fixed; inset:0; z-index:100000; display:none; font-family:inherit;";

      modal.innerHTML = `
        <div class="dc-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>
        <div style="
          position:relative; width:min(520px, calc(100vw - 32px));
          background:#fff; border-radius:14px; padding:18px 18px 16px;
          margin:16px auto; top:50%; transform:translateY(-50%);
          box-shadow:0 20px 70px rgba(0,0,0,.35);
        ">
          <div style="display:flex; justify-content:space-between; gap:12px;">
            <div>
              <div style="font-size:18px; font-weight:800; margin-bottom:6px;">Confirmer la suppression</div>
              <div style="opacity:.75; line-height:1.4;">Voulez-vous vraiment supprimer cette catégorie ?</div>
            </div>
            <button type="button" class="dc-close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
          </div>

          <div style="margin-top:14px; padding:12px; border:1px solid #e5e7eb; border-radius:12px;">
            <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Catégorie</div>
            <div class="dc-name" style="font-weight:700;">—</div>
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">
            <button type="button" class="dc-cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
            <button type="button" class="dc-confirm" style="border:none; background:#ef4444; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Supprimer</button>
          </div>

          <div class="dc-error" style="display:none; margin-top:10px; color:#b91c1c; font-weight:600;"></div>
        </div>
      `;

      document.body.appendChild(modal);

      const close = () => closeDeleteModal();
      modal.querySelector(".dc-overlay").addEventListener("click", close);
      modal.querySelector(".dc-close").addEventListener("click", close);
      modal.querySelector(".dc-cancel").addEventListener("click", close);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

      return modal;
    }

    function openDeleteModal({ categoryId, categoryName }) {
      const modal = ensureDeleteModalExists();
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
      modal.dataset.categoryId = categoryId || "";

      const nameEl = modal.querySelector(".dc-name");
      const errEl = modal.querySelector(".dc-error");
      const confirmBtn = modal.querySelector(".dc-confirm");

      if (nameEl) nameEl.textContent = categoryName || "—";
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      confirmBtn.onclick = async () => {
        try {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Suppression...";

          const { error } = await supabase.from("categories").delete().eq("id", categoryId);
          if (error) throw new Error(error.message);

          closeDeleteModal();
          await loadCategories();
        } catch (e) {
          console.error(e);
          if (errEl) { errEl.style.display = "block"; errEl.textContent = e?.message || "Erreur suppression"; }
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Supprimer";
        }
      };
    }

    function closeDeleteModal() {
      const modal = document.querySelector(".delete-category-modal");
      if (!modal) return;
      modal.style.display = "none";
      document.body.style.overflow = "";
    }

    // =========================
    // 3) MODAL ADD / UPDATE (même UI)
    // =========================
    function ensureEditModalExists() {
      let modal = document.querySelector(".edit-category-modal");
      if (modal) return modal;

      modal = document.createElement("div");
      modal.className = "edit-category-modal";
      modal.style.cssText = "position:fixed; inset:0; z-index:100001; display:none; font-family:inherit;";

      modal.innerHTML = `
        <div class="ec-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,.6)"></div>

        <div style="
          position:relative; width:min(720px, calc(100vw - 32px));
          max-height:calc(100vh - 32px); overflow:auto;
          background:#fff; border-radius:14px; padding:18px;
          margin:16px auto; top:50%; transform:translateY(-50%);
          box-shadow:0 20px 70px rgba(0,0,0,.35);
        ">
          <div style="display:flex; justify-content:space-between; gap:12px;">
            <div>
              <div class="ec-title" style="font-size:18px; font-weight:800; margin-bottom:6px;">—</div>
              <div style="opacity:.7;">Renseignez les infos puis enregistrez.</div>
            </div>
            <button type="button" class="ec-close" style="border:none; background:#f3f4f6; padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:800;">✕</button>
          </div>

          <hr style="border:none; height:1px; background:#e5e7eb; margin:14px 0;" />

          <form class="ec-form" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <label style="display:flex; flex-direction:column; gap:6px;">
              <span style="font-size:12px; opacity:.7;">Nom *</span>
              <input class="ec-name" type="text" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
            </label>

            <label style="display:flex; flex-direction:column; gap:6px;">
              <span style="font-size:12px; opacity:.7;">Slug</span>
              <input class="ec-slug" type="text" placeholder="auto si vide"
                style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;" />
              <div style="font-size:12px; opacity:.6;">Si vide, le slug sera généré automatiquement.</div>
            </label>

            <label style="display:flex; flex-direction:column; gap:6px;">
              <span style="font-size:12px; opacity:.7;">Statut</span>
              <select class="ec-active" style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </label>

            <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
              <button type="button" class="ec-cancel" style="border:1px solid #e5e7eb; background:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700;">Annuler</button>
              <button type="submit" class="ec-save" style="border:none; background:#0f766e; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:800;">Enregistrer</button>
            </div>

            <div class="ec-error" style="display:none; grid-column:1/-1; color:#b91c1c; font-weight:600;"></div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);

      const close = () => closeEditModal();
      modal.querySelector(".ec-overlay").addEventListener("click", close);
      modal.querySelector(".ec-close").addEventListener("click", close);
      modal.querySelector(".ec-cancel").addEventListener("click", close);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

      return modal;
    }

    function openEditModal() {
      const modal = ensureEditModalExists();
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
    }

    function closeEditModal() {
      const modal = document.querySelector(".edit-category-modal");
      if (!modal) return;
      modal.style.display = "none";
      document.body.style.overflow = "";
    }

    async function openAddCategory() {
      const modal = ensureEditModalExists();
      const title = modal.querySelector(".ec-title");
      const form = modal.querySelector(".ec-form");
      const errEl = modal.querySelector(".ec-error");
      const btnSave = modal.querySelector(".ec-save");

      const iName = modal.querySelector(".ec-name");
      const iSlug = modal.querySelector(".ec-slug");
      const iActive = modal.querySelector(".ec-active");

      if (title) title.textContent = "Ajouter une catégorie";
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      iName.value = "";
      iSlug.value = "";
      iActive.value = "true";

      form.onsubmit = async (e) => {
        e.preventDefault();
        if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

        const name = iName.value.trim();
        if (!name) {
          errEl.style.display = "block";
          errEl.textContent = "Le nom est obligatoire.";
          return;
        }

        const slug = (iSlug.value.trim() || slugify(name));

        try {
          btnSave.disabled = true;
          btnSave.textContent = "Ajout...";

          const payload = { name, slug, is_active: (iActive.value === "true") };

          const { error } = await supabase.from("categories").insert(payload);
          if (error) throw new Error(error.message);

          closeEditModal();
          await loadCategories();
        } catch (ex) {
          console.error(ex);
          errEl.style.display = "block";
          errEl.textContent = ex?.message || "Erreur ajout";
        } finally {
          btnSave.disabled = false;
          btnSave.textContent = "Enregistrer";
        }
      };

      openEditModal();
    }

    async function openUpdateCategory(categoryId) {
      const modal = ensureEditModalExists();
      const title = modal.querySelector(".ec-title");
      const form = modal.querySelector(".ec-form");
      const errEl = modal.querySelector(".ec-error");
      const btnSave = modal.querySelector(".ec-save");

      const iName = modal.querySelector(".ec-name");
      const iSlug = modal.querySelector(".ec-slug");
      const iActive = modal.querySelector(".ec-active");

      if (title) title.textContent = "Modifier la catégorie";
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active")
        .eq("id", categoryId)
        .single();

      if (error) {
        alert("Erreur chargement catégorie: " + error.message);
        return;
      }

      iName.value = data.name ?? "";
      iSlug.value = data.slug ?? "";
      iActive.value = data.is_active ? "true" : "false";

      form.onsubmit = async (e) => {
        e.preventDefault();
        if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

        const name = iName.value.trim();
        if (!name) {
          errEl.style.display = "block";
          errEl.textContent = "Le nom est obligatoire.";
          return;
        }

        const slug = (iSlug.value.trim() || slugify(name));

        try {
          btnSave.disabled = true;
          btnSave.textContent = "Enregistrement...";

          const payload = { name, slug, is_active: (iActive.value === "true") };

          const { error: upErr } = await supabase
            .from("categories")
            .update(payload)
            .eq("id", categoryId);

          if (upErr) throw new Error(upErr.message);

          closeEditModal();
          await loadCategories();
        } catch (ex) {
          console.error(ex);
          errEl.style.display = "block";
          errEl.textContent = ex?.message || "Erreur mise à jour";
        } finally {
          btnSave.disabled = false;
          btnSave.textContent = "Enregistrer";
        }
      };

      openEditModal();
    }

    // =========================
    // CLICK HANDLERS
    // =========================
    document.addEventListener("click", async (e) => {
      const addBtn = e.target.closest(".add-category");
      if (addBtn) {
        e.preventDefault?.();
        await openAddCategory();
        return;
      }

      const delBtn = e.target.closest("a.delete-category, .delete-category");
      if (delBtn) {
        e.preventDefault();
        const row = delBtn.closest(ROW_SELECTOR);
        const categoryId = row?.dataset?.categoryId;
        const categoryName = row?.querySelector(".category-name")?.textContent?.trim() || "cette catégorie";
        if (!categoryId) return;
        openDeleteModal({ categoryId, categoryName });
        return;
      }

      const upBtn = e.target.closest("a.update-category, .update-category");
      if (upBtn) {
        e.preventDefault();
        const row = upBtn.closest(ROW_SELECTOR);
        const categoryId = row?.dataset?.categoryId;
        if (!categoryId) return;
        await openUpdateCategory(categoryId);
        return;
      }
    }, true);

    // =========================
    // INIT
    // =========================
    await loadCategories();
  });
})();
