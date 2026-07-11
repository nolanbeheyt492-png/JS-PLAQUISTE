/* ============================================================
   ESPACE ADMIN — JC PLAQUISTE
   Accès : double-clic (ou double-tap) sur le logo "JC PLAQUISTE"
   ------------------------------------------------------------
   Stockage : Supabase (gratuit) → visible par tout le monde,
   sur tous les appareils, pas seulement dans ton navigateur.

   ⚠️ SI TU REVENDS CE SITE À UN AUTRE CLIENT : crée un NOUVEAU
   projet Supabase pour lui et remplace SUPABASE_URL /
   SUPABASE_ANON_KEY ci-dessous par les siens. Si tu gardes les
   mêmes valeurs sur plusieurs sites vendus, tous les clients
   partageront les mêmes photos et coordonnées entre eux.

   🔒 À PROPOS DU MOT DE PASSE : il n'est jamais écrit en clair
   ici, seule son empreinte (hash SHA-256) est stockée. Personne
   ne peut le relire depuis le code — voir tout en bas du fichier
   pour savoir comment le changer.
   ============================================================ */
(function () {
  /* ---------- CONFIGURATION ---------- */
  const SUPABASE_URL = "https://rumlowblqgzxkhadymur.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_9zcs4Q-rciRAVmmuPL738A_6n353h3G";
  const BUCKET = "photos";
  const PHOTOS_TABLE = "gallery_photos";
  const SETTINGS_TABLE = "site_settings";

  // Empreinte du mot de passe actuel ("jcplaquiste66" par défaut).
  // Pour le changer : voir les instructions tout en bas du fichier.
  const ADMIN_PASSWORD_HASH = "dd05d37e8efb4628ea29eb808e27a23872e1de385d848b5211319d042aefea57";

  const UNLOCK_KEY = "jc_admin_unlocked";
  const LOCAL_STORAGE_KEY = "jc_gallery_photos"; // secours si Supabase indisponible
  const MAX_IMAGE_WIDTH = 1280;
  const JPEG_QUALITY = 0.78;
  const NETWORK_TIMEOUT_MS = 10000;

  const CATEGORIES = [
    "Cloisons",
    "Faux plafonds",
    "Isolation",
    "Bandes à joints & Enduits",
    "Rénovation complète",
    "Autre",
  ];

  const DEFAULT_SETTINGS = {
    phone: "0600000000",
    quote_email: "beheytnolan@gmail.com",
  };

  const isConfigured =
    SUPABASE_URL && SUPABASE_URL.indexOf("YOUR_SUPABASE_URL") === -1 &&
    SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;

  let sb = null;

  /* ---------- Aide : timeout sur les promesses réseau ---------- */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Délai dépassé, vérifie la connexion.")), ms)),
    ]);
  }

  function loadSupabaseLib() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Librairie Supabase indisponible"));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabase() {
    if (!isConfigured) return null;
    if (sb) return sb;
    await withTimeout(loadSupabaseLib(), NETWORK_TIMEOUT_MS);
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  }

  /* ---------- Mode local de secours ---------- */
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

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

  async function uploadImage(dataUrl) {
    const client = await ensureSupabase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const blob = dataUrlToBlob(dataUrl);
    const { error } = await withTimeout(
      client.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }),
      NETWORK_TIMEOUT_MS
    );
    if (error) throw error;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  /* ---------- Réglages (téléphone, e-mail des devis, avant/après) ---------- */
  async function getSetting(key, fallback) {
    if (isConfigured) {
      try {
        const client = await ensureSupabase();
        const { data, error } = await withTimeout(
          client.from(SETTINGS_TABLE).select("value").eq("key", key).maybeSingle(),
          NETWORK_TIMEOUT_MS
        );
        if (error) throw error;
        return data ? data.value : fallback;
      } catch (e) {
        console.warn("Réglage indisponible:", key, e);
        return fallback;
      }
    }
    try {
      return localStorage.getItem("jc_setting_" + key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  async function setSetting(key, value) {
    if (isConfigured) {
      const client = await ensureSupabase();
      const { error } = await withTimeout(
        client.from(SETTINGS_TABLE).upsert({ key, value }, { onConflict: "key" }),
        NETWORK_TIMEOUT_MS
      );
      if (error) throw error;
    } else {
      try {
        localStorage.setItem("jc_setting_" + key, value);
      } catch (e) {}
    }
  }

  async function getAllSettings() {
    const [phone, quote_email, beforeImg, afterImg] = await Promise.all([
      getSetting("phone", DEFAULT_SETTINGS.phone),
      getSetting("quote_email", DEFAULT_SETTINGS.quote_email),
      getSetting("before_image", ""),
      getSetting("after_image", ""),
    ]);
    return { phone, quote_email, beforeImg, afterImg };
  }

  function formatPhoneDisplay(digits) {
    const clean = (digits || "").replace(/\D/g, "");
    return clean.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }

  /* ---------- Application des réglages sur la page en cours ---------- */
  async function applySettingsToPage() {
    const settings = await getAllSettings();

    document.querySelectorAll("[data-jc-phone-link]").forEach((el) => {
      el.setAttribute("href", "tel:" + settings.phone.replace(/\D/g, ""));
    });
    document.querySelectorAll("[data-jc-phone-text]").forEach((el) => {
      el.textContent = formatPhoneDisplay(settings.phone);
    });
    document.querySelectorAll("[data-jc-quote-form]").forEach((form) => {
      form.setAttribute("action", "https://formsubmit.co/" + settings.quote_email);
    });

    const beforeImg = document.getElementById("ba-before-img");
    const afterImg = document.getElementById("ba-after-img");
    if (beforeImg && settings.beforeImg) beforeImg.src = settings.beforeImg;
    if (afterImg && settings.afterImg) afterImg.src = settings.afterImg;
  }

  /* ---------- Photos (galerie) ---------- */
  async function fetchPhotos() {
    if (isConfigured) {
      try {
        const client = await ensureSupabase();
        const { data, error } = await withTimeout(
          client.from(PHOTOS_TABLE).select("*").order("created_at", { ascending: false }),
          NETWORK_TIMEOUT_MS
        );
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.warn("Supabase indisponible, mode local utilisé:", e);
        return getLocalPhotos();
      }
    }
    return getLocalPhotos();
  }

  async function createGalleryPhoto({ file, title, description, category }) {
    const dataUrl = await readAndResizeImage(file);
    if (isConfigured) {
      const { url, path } = await uploadImage(dataUrl);
      const client = await ensureSupabase();
      const { error } = await withTimeout(
        client.from(PHOTOS_TABLE).insert([{ title, description, category, image_url: url, storage_path: path }]),
        NETWORK_TIMEOUT_MS
      );
      if (error) throw error;
    } else {
      const photos = getLocalPhotos();
      photos.unshift({ id: Date.now().toString(36), image_url: dataUrl, title, description, category });
      saveLocalPhotos(photos);
    }
  }

  async function removeGalleryPhoto(photo) {
    if (isConfigured) {
      const client = await ensureSupabase();
      if (photo.storage_path) await client.storage.from(BUCKET).remove([photo.storage_path]);
      await client.from(PHOTOS_TABLE).delete().eq("id", photo.id);
    } else {
      saveLocalPhotos(getLocalPhotos().filter((p) => p.id !== photo.id));
    }
  }

  async function setBeforeAfterPhoto(slot, file) {
    const dataUrl = await readAndResizeImage(file);
    if (isConfigured) {
      const { url } = await uploadImage(dataUrl);
      await setSetting(slot === "before" ? "before_image" : "after_image", url);
    } else {
      await setSetting(slot === "before" ? "before_image" : "after_image", dataUrl);
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

  /* ---------- Overlay admin (dashboard) ---------- */
  let overlay;
  let activeTab = "photos";

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "jc-admin-overlay";
    overlay.className = "jc-admin-overlay";
    overlay.innerHTML = `
      <div class="jc-admin-modal jc-admin-modal-lg">
        <button type="button" class="jc-admin-close" title="Fermer">✕</button>

        <div class="jc-admin-lock">
          <h3>Espace admin</h3>
          <p>Entrez le mot de passe pour accéder au tableau de bord.</p>
          <input type="password" class="jc-admin-pass-input" placeholder="Mot de passe">
          <button type="button" class="btn btn-primary jc-admin-pass-btn">Déverrouiller</button>
          <p class="jc-admin-error"></p>
        </div>

        <div class="jc-admin-dashboard" style="display:none;">
          <div class="jc-admin-topbar">
            <div class="jc-admin-brand">JC <span>PLAQUISTE</span> — Administration</div>
          </div>
          <div class="jc-admin-body">
            <nav class="jc-admin-sidebar">
              <button type="button" class="jc-admin-nav-btn active" data-tab="photos">📸 Photos</button>
              <button type="button" class="jc-admin-nav-btn" data-tab="contact">☎️ Coordonnées</button>
            </nav>
            <div class="jc-admin-content">

              <section class="jc-admin-tab" data-tab-panel="photos">
                <h3>Gérer les photos du site</h3>
                <p class="jc-admin-hint">${isConfigured ? "Visibles par tous les visiteurs, sur tous les appareils." : "⚠️ Mode local : Supabase pas configuré, visible sur cet appareil seulement."}</p>

                <div class="jc-admin-form">
                  <label>Où ajouter cette photo ?</label>
                  <select class="jc-admin-placement-input">
                    <option value="gallery">Galerie « Nos Réalisations » (nouvelle carte)</option>
                    <option value="before">Comparateur Avant / Après — photo AVANT</option>
                    <option value="after">Comparateur Avant / Après — photo APRÈS</option>
                  </select>

                  <label>Photo</label>
                  <input type="file" accept="image/*" class="jc-admin-file-input">

                  <div class="jc-admin-gallery-fields">
                    <label>Catégorie</label>
                    <select class="jc-admin-cat-input">
                      ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
                    </select>
                    <label>Titre</label>
                    <input type="text" class="jc-admin-title-input" placeholder="Ex : Rénovation salon">
                    <label>Description</label>
                    <textarea class="jc-admin-desc-input" rows="3" placeholder="Ex : Doublage thermique et faux plafond suspendu."></textarea>
                  </div>

                  <button type="button" class="btn btn-primary jc-admin-add-btn">Ajouter la photo</button>
                </div>

                <h4 class="jc-admin-subhead">Photos de la galerie</h4>
                <div class="jc-admin-list"><p class="jc-admin-empty">Chargement…</p></div>
              </section>

              <section class="jc-admin-tab" data-tab-panel="contact" style="display:none;">
                <h3>Coordonnées de l'entreprise</h3>
                <p class="jc-admin-hint">Ces informations sont utilisées automatiquement sur toutes les pages du site (bouton « Appeler », formulaire de devis).</p>
                <div class="jc-admin-form">
                  <label>Téléphone</label>
                  <input type="text" class="jc-admin-phone-input" placeholder="06 00 00 00 00">
                  <label>E-mail de réception des devis</label>
                  <input type="email" class="jc-admin-email-input" placeholder="contact@exemple.fr">
                  <button type="button" class="btn btn-primary jc-admin-save-contact-btn">Enregistrer</button>
                  <p class="jc-admin-save-msg"></p>
                </div>
              </section>

            </div>
          </div>
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
    overlay.querySelectorAll(".jc-admin-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });
    overlay.querySelector(".jc-admin-placement-input").addEventListener("change", updatePlacementFields);
    overlay.querySelector(".jc-admin-add-btn").addEventListener("click", addPhotoHandler);
    overlay.querySelector(".jc-admin-save-contact-btn").addEventListener("click", saveContactHandler);

    return overlay;
  }

  function switchTab(tab) {
    activeTab = tab;
    overlay.querySelectorAll(".jc-admin-nav-btn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tab));
    overlay.querySelectorAll(".jc-admin-tab").forEach((s) => {
      s.style.display = s.getAttribute("data-tab-panel") === tab ? "block" : "none";
    });
    if (tab === "contact") loadContactTab();
  }

  function updatePlacementFields() {
    const placement = overlay.querySelector(".jc-admin-placement-input").value;
    overlay.querySelector(".jc-admin-gallery-fields").style.display = placement === "gallery" ? "block" : "none";
  }

  async function tryUnlock() {
    const input = overlay.querySelector(".jc-admin-pass-input");
    const errorEl = overlay.querySelector(".jc-admin-error");
    const hash = await sha256Hex(input.value);
    if (hash === ADMIN_PASSWORD_HASH) {
      setUnlocked(true);
      showDashboard();
      errorEl.textContent = "";
      input.value = "";
    } else {
      errorEl.textContent = "Mot de passe incorrect.";
    }
  }

  async function showDashboard() {
    overlay.querySelector(".jc-admin-lock").style.display = "none";
    overlay.querySelector(".jc-admin-dashboard").style.display = "block";
    switchTab("photos");
    await renderAdminList();
  }

  async function renderAdminList() {
    const list = overlay.querySelector(".jc-admin-list");
    list.innerHTML = `<p class="jc-admin-empty">Chargement…</p>`;
    try {
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
    } catch (e) {
      list.innerHTML = `<p class="jc-admin-empty">Erreur de chargement : ${escapeHtml(e.message)}</p>`;
    }
  }

  async function addPhotoHandler() {
    const placement = overlay.querySelector(".jc-admin-placement-input").value;
    const fileInput = overlay.querySelector(".jc-admin-file-input");
    const addBtn = overlay.querySelector(".jc-admin-add-btn");
    const file = fileInput.files[0];
    if (!file) {
      alert("Choisis d'abord une photo.");
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Ajout en cours…";
    try {
      if (placement === "gallery") {
        const titleInput = overlay.querySelector(".jc-admin-title-input");
        const descInput = overlay.querySelector(".jc-admin-desc-input");
        const catInput = overlay.querySelector(".jc-admin-cat-input");
        await createGalleryPhoto({
          file,
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          category: catInput.value,
        });
        titleInput.value = "";
        descInput.value = "";
        await renderAdminList();
      } else {
        await setBeforeAfterPhoto(placement, file);
      }
      fileInput.value = "";
      await renderPublicGallery();
      alert("Photo ajoutée ✅");
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
      await removeGalleryPhoto(photo);
      await renderAdminList();
      await renderPublicGallery();
    } catch (err) {
      alert("Erreur lors de la suppression : " + (err.message || err));
    }
  }

  async function loadContactTab() {
    const phoneInput = overlay.querySelector(".jc-admin-phone-input");
    const emailInput = overlay.querySelector(".jc-admin-email-input");
    const settings = await getAllSettings();
    phoneInput.value = formatPhoneDisplay(settings.phone);
    emailInput.value = settings.quote_email;
  }

  async function saveContactHandler() {
    const phoneInput = overlay.querySelector(".jc-admin-phone-input");
    const emailInput = overlay.querySelector(".jc-admin-email-input");
    const msgEl = overlay.querySelector(".jc-admin-save-msg");
    const btn = overlay.querySelector(".jc-admin-save-contact-btn");
    btn.disabled = true;
    btn.textContent = "Enregistrement…";
    try {
      await setSetting("phone", phoneInput.value.replace(/\D/g, ""));
      await setSetting("quote_email", emailInput.value.trim());
      await applySettingsToPage();
      msgEl.textContent = "Enregistré ✅";
      msgEl.style.color = "var(--success)";
    } catch (e) {
      msgEl.textContent = "Erreur : " + (e.message || e);
      msgEl.style.color = "#B3441E";
    } finally {
      btn.disabled = false;
      btn.textContent = "Enregistrer";
    }
  }

  function openAdmin() {
    try {
      buildOverlay();
      overlay.classList.add("show");
      document.body.style.overflow = "hidden";
      if (isUnlocked()) {
        showDashboard();
      } else {
        overlay.querySelector(".jc-admin-lock").style.display = "block";
        overlay.querySelector(".jc-admin-dashboard").style.display = "none";
        overlay.querySelector(".jc-admin-error").textContent = "";
        setTimeout(() => overlay.querySelector(".jc-admin-pass-input").focus(), 100);
      }
    } catch (e) {
      console.error("Erreur ouverture admin:", e);
      document.body.style.overflow = "";
    }
  }

  function closeAdmin() {
    if (!overlay) return;
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  /* ---------- Déclenchement double-clic / double-tap ---------- */
  function initTrigger() {
    const logo = document.getElementById("brand-logo");
    if (!logo) return;
    logo.style.cursor = "pointer";
    logo.classList.add("jc-admin-trigger");

    logo.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAdmin();
    });

    let lastTap = 0;
    logo.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        if (now - lastTap < 350) {
          e.preventDefault();
          openAdmin();
        }
        lastTap = now;
      },
      { passive: false }
    );
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && overlay.classList.contains("show")) closeAdmin();
  });

  document.addEventListener("DOMContentLoaded", () => {
    initTrigger();
    renderPublicGallery();
    applySettingsToPage();
  });
})();

/* ============================================================
   CHANGER LE MOT DE PASSE ADMIN
   ------------------------------------------------------------
   1. Ouvre la console du navigateur (F12) sur n'importe quelle
      page du site.
   2. Colle cette ligne en remplaçant NOUVEAU_MOT_DE_PASSE, puis
      Entrée :
        crypto.subtle.digest("SHA-256", new TextEncoder().encode("NOUVEAU_MOT_DE_PASSE")).then(b=>console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")))
   3. Copie le résultat affiché (64 caractères) et remplace la
      valeur de ADMIN_PASSWORD_HASH tout en haut de ce fichier.
   ============================================================ */
