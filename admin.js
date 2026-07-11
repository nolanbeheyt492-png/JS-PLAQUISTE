/* ============================================================
   ESPACE ADMIN — JC PLAQUISTE
   Accès : double-clic (ou double-tap) sur le logo "JC PLAQUISTE"
   ------------------------------------------------------------
   Les photos ajoutées sont stockées sur Supabase (gratuit),
   donc visibles par TOUT LE MONDE, sur TOUS les appareils —
   pas seulement dans ton navigateur.

   ⚠️ CONFIGURATION OBLIGATOIRE avant que ça fonctionne :
   remplis SUPABASE_URL et SUPABASE_ANON_KEY ci-dessous.
   Tant que ce n'est pas fait, le site utilise un mode "local"
   de secours (visible seulement sur ton appareil), pour que le
   site ne soit jamais cassé pendant que tu configures Supabase.
   Toutes les étapes sont expliquées dans le message de Claude.
   ============================================================ */
(function () {
  /* ---------- CONFIGURATION À REMPLIR ---------- */
  const SUPABASE_URL = "https://rumlowblqgzxkhadymur.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_9zcs4Q-rciRAVmmuPL738A_6n353h3G";
  const BUCKET = "photos";
  const TABLE = "gallery_photos";

  const ADMIN_PASSWORD = "jcplaquiste66"; // <-- change ce mot de passe ici
  const UNLOCK_KEY = "jc_admin_unlocked";
  const LOCAL_STORAGE_KEY = "jc_gallery_photos"; // utilisé seulement en mode local de secours
  const MAX_IMAGE_WIDTH = 1280;
  const JPEG_QUALITY = 0.78;

  const CATEGORIES = [
    "Cloisons",
    "Faux plafonds",
    "Isolation",
    "Bandes à joints & Enduits",
    "Rénovation complète",
    "Autre",
  ];

  const isConfigured =
    SUPABASE_URL && SUPABASE_URL.indexOf("YOUR_SUPABASE_URL") === -1 &&
    SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;

  let sb = null;

  function loadSupabaseLib() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Impossible de charger la librairie Supabase"));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (!isConfigured) return null;
    if (sb) return sb;
    await loadSupabaseLib();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  }

  /* ---------- Mode local de secours (si Supabase pas configuré) ---------- */
  function getLocalPhotos() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveLocalPhotos(photos) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(photos));
      return true;
    } catch (e) {
      alert("Mémoire du navigateur pleine, supprime des photos puis réessaie.");
      return false;
    }
  }

  function isUnlocked() {
    try {
      return localStorage.getItem(UNLOCK_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function setUnlocked(val) {
    try {
      localStorage.setItem(UNLOCK_KEY, val ? "1" : "0");
    } catch (e) {}
  }

  /* ---------- Image : redimensionnement + compression ---------- */
  function readAndResizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Image invalide"));
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_IMAGE_WIDTH) {
            height = Math.round((height * MAX_IMAGE_WIDTH) / width);
            width = MAX_IMAGE_WIDTH;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  /* ---------- Accès données (Supabase ou local) ---------- */
  async function fetchPhotos() {
    if (isConfigured) {
      try {
        const client = await ensureSupabase();
        const { data, error } = await client
          .from(TABLE)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.warn("Supabase indisponible, mode local utilisé:", e);
        return getLocalPhotos();
      }
    }
    return getLocalPhotos();
  }

  async function createPhoto({ file, title, description, category }) {
    const dataUrl = await readAndResizeImage(file);

    if (isConfigured) {
      const client = await ensureSupabase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const blob = dataUrlToBlob(dataUrl);
      const { error: uploadError } = await client.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(path);
      const { error: insertError } = await client.from(TABLE).insert([
        {
          title,
          description,
          category,
          image_url: urlData.publicUrl,
          storage_path: path,
        },
      ]);
      if (insertError) throw insertError;
    } else {
      const photos = getLocalPhotos();
      photos.unshift({
        id: Date.now().toString(36),
        image_url: dataUrl,
        title,
        description,
        category,
      });
      saveLocalPhotos(photos);
    }
  }

  async function removePhoto(photo) {
    if (isConfigured) {
      const client = await ensureSupabase();
      if (photo.storage_path) {
        await client.storage.from(BUCKET).remove([photo.storage_path]);
      }
      await client.from(TABLE).delete().eq("id", photo.id);
    } else {
      const photos = getLocalPhotos().filter((p) => p.id !== photo.id);
      saveLocalPhotos(photos);
    }
  }

  /* ---------- Rendu galerie publique (realisations.html) ---------- */
  let currentFilter = "Tous";

  async function renderPublicGallery() {
    const grid = document.getElementById("gallery-grid");
    if (!grid) return;

    const photos = await fetchPhotos();
    grid.querySelectorAll("[data-admin-photo]").forEach((el) => el.remove());
    photos.forEach((p) => {
      const item = document.createElement("div");
      item.className = "gallery-item";
      item.setAttribute("data-admin-photo", p.id);
      item.setAttribute("data-category", p.category || "Autre");
      item.innerHTML = `
        <img src="${p.image_url}" alt="${escapeHtml(p.title || "Chantier")}" style="width:100%; height:240px; object-fit:cover;">
        <div class="gallery-info">
          <span class="gallery-tag">${escapeHtml(p.category || "Autre")}</span>
          <h3>${escapeHtml(p.title || "Sans titre")}</h3>
          <p>${escapeHtml(p.description || "")}</p>
        </div>`;
      grid.appendChild(item);
    });

    buildFilterTabs(grid);
    applyFilter(grid);
  }

  function buildFilterTabs(grid) {
    let tabsWrap = document.getElementById("gallery-filter-tabs");
    const cats = Array.from(new Set(Array.from(grid.querySelectorAll("[data-category]")).map((el) => el.getAttribute("data-category"))));
    if (!cats.length) {
      if (tabsWrap) tabsWrap.remove();
      return;
    }
    if (!tabsWrap) {
      tabsWrap = document.createElement("div");
      tabsWrap.id = "gallery-filter-tabs";
      tabsWrap.className = "gallery-filter-tabs";
      grid.parentNode.insertBefore(tabsWrap, grid);
    }
    const all = ["Tous", ...cats];
    tabsWrap.innerHTML = all
      .map((c) => `<button type="button" class="gallery-filter-btn${c === currentFilter ? " active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
      .join("");
    tabsWrap.querySelectorAll(".gallery-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.getAttribute("data-cat");
        tabsWrap.querySelectorAll(".gallery-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyFilter(grid);
      });
    });
  }

  function applyFilter(grid) {
    grid.querySelectorAll(".gallery-item").forEach((item) => {
      const cat = item.getAttribute("data-category");
      item.style.display = currentFilter === "Tous" || cat === currentFilter ? "" : "none";
    });
  }

  /* ---------- Overlay admin ---------- */
  let overlay;

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "jc-admin-overlay";
    overlay.className = "jc-admin-overlay";
    overlay.innerHTML = `
      <div class="jc-admin-modal">
        <button type="button" class="jc-admin-close" title="Fermer">✕</button>

        <div class="jc-admin-lock">
          <h3>Espace admin</h3>
          <p>Entrez le mot de passe pour gérer les photos du site.</p>
          <input type="password" class="jc-admin-pass-input" placeholder="Mot de passe">
          <button type="button" class="btn btn-primary jc-admin-pass-btn">Déverrouiller</button>
          <p class="jc-admin-error"></p>
        </div>

        <div class="jc-admin-panel" style="display:none;">
          <h3>📸 Gérer les photos — Nos Réalisations</h3>
          <p class="jc-admin-hint">${isConfigured ? "Les photos ajoutées ici sont visibles par tous les visiteurs, sur tous les appareils." : "⚠️ Mode local : Supabase n'est pas encore configuré dans admin.js, donc ces photos ne sont visibles que sur cet appareil."}</p>

          <div class="jc-admin-form">
            <label>Photo</label>
            <input type="file" accept="image/*" class="jc-admin-file-input">
            <label>Catégorie</label>
            <select class="jc-admin-cat-input">
              ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
            <label>Titre</label>
            <input type="text" class="jc-admin-title-input" placeholder="Ex : Rénovation salon">
            <label>Description</label>
            <textarea class="jc-admin-desc-input" rows="3" placeholder="Ex : Doublage thermique et faux plafond suspendu."></textarea>
            <button type="button" class="btn btn-primary jc-admin-add-btn">Ajouter la photo</button>
          </div>

          <div class="jc-admin-list"><p class="jc-admin-empty">Chargement…</p></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".jc-admin-close").addEventListener("click", closeAdmin);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAdmin();
    });

    overlay.querySelector(".jc-admin-pass-btn").addEventListener("click", tryUnlock);
    overlay.querySelector(".jc-admin-pass-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryUnlock();
    });

    overlay.querySelector(".jc-admin-add-btn").addEventListener("click", addPhotoHandler);

    return overlay;
  }

  function tryUnlock() {
    const input = overlay.querySelector(".jc-admin-pass-input");
    const errorEl = overlay.querySelector(".jc-admin-error");
    if (input.value === ADMIN_PASSWORD) {
      setUnlocked(true);
      showPanel();
      errorEl.textContent = "";
      input.value = "";
    } else {
      errorEl.textContent = "Mot de passe incorrect.";
    }
  }

  async function showPanel() {
    overlay.querySelector(".jc-admin-lock").style.display = "none";
    overlay.querySelector(".jc-admin-panel").style.display = "block";
    await renderAdminList();
  }

  async function renderAdminList() {
    const list = overlay.querySelector(".jc-admin-list");
    list.innerHTML = `<p class="jc-admin-empty">Chargement…</p>`;
    const photos = await fetchPhotos();
    if (!photos.length) {
      list.innerHTML = `<p class="jc-admin-empty">Aucune photo ajoutée pour l'instant.</p>`;
      return;
    }
    list.innerHTML = "";
    photos.forEach((p) => {
      const row = document.createElement("div");
      row.className = "jc-admin-list-item";
      row.innerHTML = `
        <img src="${p.image_url}" alt="">
        <div class="jc-admin-list-info">
          <strong>${escapeHtml(p.title || "Sans titre")} <span class="jc-admin-cat-badge">${escapeHtml(p.category || "Autre")}</span></strong>
          <span>${escapeHtml(p.description || "")}</span>
        </div>
        <button type="button" class="jc-admin-delete-btn" title="Supprimer">🗑️</button>`;
      row.querySelector(".jc-admin-delete-btn").addEventListener("click", () => deletePhotoHandler(p));
      list.appendChild(row);
    });
  }

  async function addPhotoHandler() {
    const fileInput = overlay.querySelector(".jc-admin-file-input");
    const titleInput = overlay.querySelector(".jc-admin-title-input");
    const descInput = overlay.querySelector(".jc-admin-desc-input");
    const catInput = overlay.querySelector(".jc-admin-cat-input");
    const addBtn = overlay.querySelector(".jc-admin-add-btn");

    const file = fileInput.files[0];
    if (!file) {
      alert("Choisis d'abord une photo.");
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Ajout en cours…";
    try {
      await createPhoto({
        file,
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        category: catInput.value,
      });
      fileInput.value = "";
      titleInput.value = "";
      descInput.value = "";
      await renderAdminList();
      await renderPublicGallery();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'ajout de la photo : " + (err.message || err));
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Ajouter la photo";
    }
  }

  async function deletePhotoHandler(photo) {
    if (!confirm("Supprimer cette photo ?")) return;
    try {
      await removePhoto(photo);
      await renderAdminList();
      await renderPublicGallery();
    } catch (err) {
      alert("Erreur lors de la suppression : " + (err.message || err));
    }
  }

  function openAdmin() {
    buildOverlay();
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
    if (isUnlocked()) {
      showPanel();
    } else {
      overlay.querySelector(".jc-admin-lock").style.display = "block";
      overlay.querySelector(".jc-admin-panel").style.display = "none";
      overlay.querySelector(".jc-admin-error").textContent = "";
      setTimeout(() => overlay.querySelector(".jc-admin-pass-input").focus(), 100);
    }
  }

  function closeAdmin() {
    if (!overlay) return;
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  /* ---------- Déclenchement double-clic / double-tap sur le logo ---------- */
  function initTrigger() {
    const logo = document.getElementById("brand-logo");
    if (!logo) return;
    logo.style.cursor = "pointer";
    logo.style.userSelect = "none";
    logo.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openAdmin();
    });

    let lastTap = 0;
    logo.addEventListener("touchend", () => {
      const now = Date.now();
      if (now - lastTap < 350) openAdmin();
      lastTap = now;
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && overlay.classList.contains("show")) closeAdmin();
  });

  document.addEventListener("DOMContentLoaded", () => {
    initTrigger();
    renderPublicGallery();
  });
})();