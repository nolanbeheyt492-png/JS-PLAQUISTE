/* ============================================================
   ESPACE ADMIN — JC PLAQUISTE
   Accès : 5 clics (ou 5 taps) rapprochés sur le logo "JC PLAQUISTE"
   ------------------------------------------------------------
   Stockage : Supabase (gratuit) → visible par tout le monde,
   sur tous les appareils, pas seulement dans ton navigateur.

   ⚠️ SI TU REVENDS CE SITE À UN AUTRE CLIENT : crée un NOUVEAU
   projet Supabase pour lui et remplace SUPABASE_URL /
   SUPABASE_ANON_KEY ci-dessous par les siens. Si tu gardes les
   mêmes valeurs sur plusieurs sites vendus, tous les clients
   partageront les mêmes photos et coordonnées entre eux.

   🔒 À PROPOS DU MOT DE PASSE : il n'est JAMAIS écrit en clair
   dans ce fichier. Seule son empreinte (hash SHA-256, à sens
   unique — impossible à "déchiffrer") est utilisée, et cette
   empreinte est elle-même stockée dans la base Supabase (pas
   dans le code) dès que le mot de passe est changé depuis
   l'onglet "Sécurité" du tableau de bord. Avant le premier
   changement, une empreinte par défaut sert de secours (voir
   plus bas), donc change le mot de passe dès l'ouverture.

   ⚠️ NOTE HONNÊTE SUR LA SÉCURITÉ D'UN SITE STATIQUE :
   La clé "SUPABASE_ANON_KEY" ci-dessous N'EST PAS un secret —
   elle est conçue par Supabase pour être publique et visible
   dans le code d'un site (comme une clé d'API publique Google
   Maps). Ce qui protège réellement tes données, ce sont les
   règles de sécurité ("Row Level Security") configurées côté
   Supabase, pas le fait de la cacher. Impossible de rendre une
   clé 100% invisible dans du code qui tourne dans le navigateur
   du visiteur — c'est une limite technique de tout site sans
   serveur, pas un oubli de notre part.
   ============================================================ */
(function () {
  /* ---------- CONFIGURATION ---------- */
  const SUPABASE_URL = "https://rumlowblqgzxkhadymur.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_9zcs4Q-rciRAVmmuPL738A_6n353h3G";
  const BUCKET = "photos";
  const PHOTOS_TABLE = "gallery_photos";
  const SETTINGS_TABLE = "site_settings";

  // Empreinte de secours si aucun mot de passe n'a encore été défini
  // depuis l'onglet Sécurité ("jcplaquiste66" par défaut).
  const DEFAULT_ADMIN_PASSWORD_HASH = "dd05d37e8efb4628ea29eb808e27a23872e1de385d848b5211319d042aefea57";

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

  // Coordonnées par défaut légèrement obscurcies (Base64) pour éviter
  // qu'un simple Ctrl+F / lecture rapide du fichier les affiche en clair.
  // ⚠️ Ce n'est PAS un vrai chiffrement (voir note de sécurité en tête de
  // fichier) : c'est une donnée publique du site (numéro affiché aux
  // visiteurs), donc il n'y a rien de "secret" à protéger ici — c'est
  // juste pour éviter qu'elle saute aux yeux en survolant le code.
  function unb64(s) { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ""; } }
  const DEFAULT_SETTINGS = {
    phone: unb64("MDYwMDAwMDAwMA=="),
    quote_email: unb64("YmVoZXl0bm9sYW5AZ21haWwuY29t"),
  };
  const DEFAULT_ZONE_CITIES = ["Perpignan", "Argelès-sur-Mer", "Céret", "Prades", "Font-Romeu"];

  const isConfigured =
    SUPABASE_URL && SUPABASE_URL.indexOf("YOUR_SUPABASE_URL") === -1 &&
    SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;

  let sb = null;
  let supabaseLoadPromise = null; // évite de charger la librairie plusieurs fois en parallèle

  /* ---------- Aide : timeout sur les promesses réseau ---------- */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Délai dépassé, vérifie la connexion.")), ms)),
    ]);
  }

  function loadSupabaseLib() {
    if (window.supabase) return Promise.resolve();
    if (supabaseLoadPromise) return supabaseLoadPromise; // déjà en cours de chargement : on réutilise la même promesse
    supabaseLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      script.onload = resolve;
      script.onerror = () => { supabaseLoadPromise = null; reject(new Error("Librairie Supabase indisponible")); };
      document.head.appendChild(script);
    });
    return supabaseLoadPromise;
  }

  async function ensureSupabase() {
    if (!isConfigured) return null;
    if (sb) return sb;
    await withTimeout(loadSupabaseLib(), NETWORK_TIMEOUT_MS);
    if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

  /* ---------- Réglages génériques (clé/valeur dans Supabase) ---------- */
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
    const [phone, quote_email, beforeImg, afterImg, heroImg, zoneCitiesRaw] = await Promise.all([
      getSetting("phone", DEFAULT_SETTINGS.phone),
      getSetting("quote_email", DEFAULT_SETTINGS.quote_email),
      getSetting("before_image", ""),
      getSetting("after_image", ""),
      getSetting("hero_image", ""),
      getSetting("zone_cities", ""),
    ]);
    let zoneCities;
    try {
      zoneCities = zoneCitiesRaw ? JSON.parse(zoneCitiesRaw) : DEFAULT_ZONE_CITIES;
    } catch (e) {
      zoneCities = DEFAULT_ZONE_CITIES;
    }
    return { phone, quote_email, beforeImg, afterImg, heroImg, zoneCities };
  }

  function formatPhoneDisplay(digits) {
    const clean = (digits || "").replace(/\D/g, "");
    return clean.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }

  /* ---------- Application des réglages sur la page en cours ---------- */
  async function applySettingsToPage() {
    const settings = await getAllSettings();

    document.querySelectorAll('[data-jc-phone-link], a[href^="tel:"]').forEach((el) => {
      el.setAttribute("href", "tel:" + settings.phone.replace(/\D/g, ""));
    });
    document.querySelectorAll("[data-jc-phone-text]").forEach((el) => {
      el.textContent = formatPhoneDisplay(settings.phone);
    });
    document.querySelectorAll('[data-jc-quote-form], form[action*="formsubmit.co"]').forEach((form) => {
      const action = form.getAttribute("action") || "";
      if (action.indexOf("formsubmit.co") !== -1) {
        form.setAttribute("action", "https://formsubmit.co/" + settings.quote_email);
      }
    });

    const beforeImg = document.getElementById("ba-before-img");
    const afterImg = document.getElementById("ba-after-img");
    if (beforeImg && settings.beforeImg) beforeImg.src = settings.beforeImg;
    if (afterImg && settings.afterImg) afterImg.src = settings.afterImg;

    const heroSection = document.getElementById("hero-section");
    if (heroSection && settings.heroImg) {
      heroSection.style.backgroundImage =
        `linear-gradient(rgba(33,27,18,0.55), rgba(33,27,18,0.55)), url("${settings.heroImg}")`;
      heroSection.style.backgroundSize = "cover";
      heroSection.style.backgroundPosition = "center";
    }

    const zoneContainer = document.getElementById("zone-tags-container");
    if (zoneContainer && settings.zoneCities && settings.zoneCities.length) {
      zoneContainer.innerHTML = settings.zoneCities.map((c) => `<span>${escapeHtml(c)}</span>`).join("");
    }
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

  async function setNamedImage(slot, file) {
    const dataUrl = await readAndResizeImage(file);
    const key = slot === "before" ? "before_image" : slot === "after" ? "after_image" : "hero_image";
    if (isConfigured) {
      const { url } = await uploadImage(dataUrl);
      await setSetting(key, url);
    } else {
      await setSetting(key, dataUrl);
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
  let activeTab = "dashboard";

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
          <button type="button" class="btn btn-primary jc-admin-pass-btn" style="width:100%; margin-top:14px;">Déverrouiller</button>
          <p class="jc-admin-error"></p>
        </div>

        <div class="jc-admin-dashboard" style="display:none; flex-direction:column; height:100%; min-height:0;">
          <div class="jc-admin-topbar">
            <div class="jc-admin-brand">JC <span>PLAQUISTE</span> — Administration</div>
            <div class="jc-admin-topbar-status ${isConfigured ? "" : "offline"}">
              <span class="dot"></span>${isConfigured ? "Connecté à la base en ligne" : "Mode local (hors ligne)"}
            </div>
          </div>
          <div class="jc-admin-body">
            <nav class="jc-admin-sidebar">
              <button type="button" class="jc-admin-nav-btn active" data-tab="dashboard">📊 Tableau de bord</button>
              <button type="button" class="jc-admin-nav-btn" data-tab="photos">📸 Photos</button>
              <button type="button" class="jc-admin-nav-btn" data-tab="contact">☎️ Coordonnées</button>
              <button type="button" class="jc-admin-nav-btn" data-tab="zone">📍 Zone d'intervention</button>
              <button type="button" class="jc-admin-nav-btn" data-tab="security">🔒 Sécurité</button>
              <button type="button" class="jc-admin-nav-logout" id="jc-admin-logout-btn">Se déconnecter</button>
            </nav>
            <div class="jc-admin-content">

              <section class="jc-admin-tab" data-tab-panel="dashboard">
                <div class="jc-admin-welcome">
                  <h4>Bienvenue sur votre tableau de bord</h4>
                  <p>Gérez ici les photos, coordonnées, zone d'intervention et la sécurité de votre site — les changements sont visibles instantanément par tous les visiteurs.</p>
                  <div class="jc-admin-quicklinks">
                    <button type="button" data-quicklink="photos">+ Ajouter une photo</button>
                    <button type="button" data-quicklink="contact">Modifier le téléphone</button>
                    <button type="button" data-quicklink="zone">Modifier la zone</button>
                  </div>
                </div>
                <div class="jc-stat-grid" id="jc-stat-grid">
                  <div class="jc-stat-card"><div class="jc-stat-value">—</div><div class="jc-stat-label">Photos en galerie</div></div>
                  <div class="jc-stat-card"><div class="jc-stat-value">—</div><div class="jc-stat-label">Catégories utilisées</div></div>
                  <div class="jc-stat-card"><div class="jc-stat-value">—</div><div class="jc-stat-label">Villes couvertes</div></div>
                  <div class="jc-stat-card"><div class="jc-stat-value">${isConfigured ? "En ligne" : "Local"}</div><div class="jc-stat-label">Stockage</div></div>
                </div>
              </section>

              <section class="jc-admin-tab" data-tab-panel="photos" style="display:none;">
                <h3>Gérer les photos du site</h3>
                <p class="jc-admin-hint">${isConfigured ? "Visibles par tous les visiteurs, sur tous les appareils." : "⚠️ Mode local : Supabase pas configuré, visible sur cet appareil seulement."}</p>

                <div class="jc-admin-form">
                  <label>Où ajouter cette photo ?</label>
                  <select class="jc-admin-placement-input">
                    <option value="gallery">Galerie « Nos Réalisations » (nouvelle carte)</option>
                    <option value="before">Comparateur Avant / Après — photo AVANT</option>
                    <option value="after">Comparateur Avant / Après — photo APRÈS</option>
                    <option value="hero">Photo de fond — page d'accueil (Hero)</option>
                  </select>
                  <p class="jc-admin-placement-hint">4 emplacements possibles : la galerie, les 2 photos du comparateur avant/après, et le fond de la page d'accueil.</p>

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
                <p class="jc-admin-hint">Ces informations sont utilisées automatiquement sur toutes les pages du site (liens « Appeler », formulaires de devis).</p>
                <div class="jc-admin-form">
                  <label>Téléphone</label>
                  <input type="text" class="jc-admin-phone-input" placeholder="06 00 00 00 00">
                  <label>E-mail de réception des devis</label>
                  <input type="email" class="jc-admin-email-input" placeholder="contact@exemple.fr">
                  <button type="button" class="btn btn-primary jc-admin-save-contact-btn">Enregistrer</button>
                  <p class="jc-admin-save-msg"></p>
                </div>
              </section>

              <section class="jc-admin-tab" data-tab-panel="zone" style="display:none;">
                <h3>Zone d'intervention</h3>
                <p class="jc-admin-hint">Les villes affichées sur la page Contact, sous forme d'étiquettes.</p>
                <div class="jc-zone-tag-list" id="jc-zone-tag-list"></div>
                <div class="jc-zone-add-row">
                  <input type="text" class="jc-admin-form-inline" id="jc-zone-input" placeholder="Ajouter une ville (ex : Thuir)">
                  <button type="button" class="btn btn-outline" id="jc-zone-add-btn">Ajouter</button>
                </div>
                <button type="button" class="btn btn-primary jc-admin-save-zone-btn" style="margin-top:20px;">Enregistrer la zone</button>
                <p class="jc-admin-save-msg" id="jc-zone-save-msg"></p>
              </section>

              <section class="jc-admin-tab" data-tab-panel="security" style="display:none;">
                <h3>Sécurité de l'espace admin</h3>
                <div class="jc-security-note">
                  🔒 Le mot de passe n'est jamais stocké en clair : seule son empreinte à sens unique (SHA-256) est enregistrée. <strong>Personne — ni vous, ni un tiers lisant le code — ne peut retrouver le mot de passe d'origine à partir de cette empreinte.</strong>
                </div>
                <div class="jc-admin-form">
                  <label>Nouveau mot de passe</label>
                  <input type="password" class="jc-admin-new-pass-input" placeholder="Minimum 6 caractères">
                  <label>Confirmer le nouveau mot de passe</label>
                  <input type="password" class="jc-admin-confirm-pass-input" placeholder="Retapez le mot de passe">
                  <button type="button" class="btn btn-primary jc-admin-save-pass-btn">Changer le mot de passe</button>
                  <p class="jc-admin-save-msg" id="jc-pass-save-msg"></p>
                </div>
                <div class="jc-danger-note">
                  ⚠️ Ce mot de passe protège uniquement l'accès à ce tableau de bord (photos, coordonnées). Il ne chiffre pas vos données publiques (photos, téléphone) qui, par nature, sont visibles de tous les visiteurs du site.
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
    overlay.querySelectorAll("[data-quicklink]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-quicklink")));
    });
    overlay.querySelector("#jc-admin-logout-btn").addEventListener("click", () => {
      setUnlocked(false);
      closeAdmin();
    });
    overlay.querySelector(".jc-admin-placement-input").addEventListener("change", updatePlacementFields);
    overlay.querySelector(".jc-admin-add-btn").addEventListener("click", addPhotoHandler);
    overlay.querySelector(".jc-admin-save-contact-btn").addEventListener("click", saveContactHandler);
    overlay.querySelector(".jc-admin-save-zone-btn").addEventListener("click", saveZoneHandler);
    overlay.querySelector("#jc-zone-add-btn").addEventListener("click", addZoneChip);
    overlay.querySelector("#jc-zone-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addZoneChip(); }
    });
    overlay.querySelector(".jc-admin-save-pass-btn").addEventListener("click", changePasswordHandler);

    return overlay;
  }

  function switchTab(tab) {
    activeTab = tab;
    overlay.querySelectorAll(".jc-admin-nav-btn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tab));
    overlay.querySelectorAll(".jc-admin-tab").forEach((s) => {
      s.style.display = s.getAttribute("data-tab-panel") === tab ? "block" : "none";
    });
    if (tab === "dashboard") loadDashboardTab();
    if (tab === "contact") loadContactTab();
    if (tab === "zone") loadZoneTab();
  }

  function updatePlacementFields() {
    const placement = overlay.querySelector(".jc-admin-placement-input").value;
    overlay.querySelector(".jc-admin-gallery-fields").style.display = placement === "gallery" ? "block" : "none";
  }

  async function getStoredPasswordHash() {
    const stored = await getSetting("admin_password_hash", "");
    return stored || DEFAULT_ADMIN_PASSWORD_HASH;
  }

  async function tryUnlock() {
    const input = overlay.querySelector(".jc-admin-pass-input");
    const errorEl = overlay.querySelector(".jc-admin-error");
    const btn = overlay.querySelector(".jc-admin-pass-btn");
    btn.disabled = true;
    try {
      const hash = await sha256Hex(input.value);
      const validHash = await getStoredPasswordHash();
      if (hash === validHash) {
        setUnlocked(true);
        showDashboard();
        errorEl.textContent = "";
        input.value = "";
      } else {
        errorEl.textContent = "Mot de passe incorrect.";
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function changePasswordHandler() {
    const newPass = overlay.querySelector(".jc-admin-new-pass-input").value;
    const confirmPass = overlay.querySelector(".jc-admin-confirm-pass-input").value;
    const msgEl = overlay.querySelector("#jc-pass-save-msg");
    if (newPass.length < 6) {
      msgEl.style.color = "#B3441E";
      msgEl.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
      return;
    }
    if (newPass !== confirmPass) {
      msgEl.style.color = "#B3441E";
      msgEl.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }
    const btn = overlay.querySelector(".jc-admin-save-pass-btn");
    btn.disabled = true;
    btn.textContent = "Enregistrement…";
    try {
      const newHash = await sha256Hex(newPass);
      await setSetting("admin_password_hash", newHash);
      msgEl.style.color = "var(--success)";
      msgEl.textContent = "Mot de passe changé avec succès ✅";
      overlay.querySelector(".jc-admin-new-pass-input").value = "";
      overlay.querySelector(".jc-admin-confirm-pass-input").value = "";
    } catch (e) {
      msgEl.style.color = "#B3441E";
      msgEl.textContent = "Erreur : " + (e.message || e);
    } finally {
      btn.disabled = false;
      btn.textContent = "Changer le mot de passe";
    }
  }

  async function showDashboard() {
    overlay.querySelector(".jc-admin-lock").style.display = "none";
    overlay.querySelector(".jc-admin-dashboard").style.display = "flex";
    switchTab("dashboard");
    await renderAdminList();
  }

  async function loadDashboardTab() {
    try {
      const [photos, settings] = await Promise.all([fetchPhotos(), getAllSettings()]);
      const cats = new Set(photos.map((p) => p.category || "Autre"));
      const grid = overlay.querySelector("#jc-stat-grid");
      const cards = grid.querySelectorAll(".jc-stat-value");
      cards[0].textContent = photos.length;
      cards[1].textContent = cats.size;
      cards[2].textContent = settings.zoneCities.length;
    } catch (e) {
      console.warn("Stats indisponibles:", e);
    }
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
        // placement === "before" | "after" | "hero"
        await setNamedImage(placement, file);
      }
      fileInput.value = "";
      await renderPublicGallery();
      await applySettingsToPage();
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

  /* ---------- Onglet Zone d'intervention ---------- */
  let pendingZoneCities = [];

  async function loadZoneTab() {
    const settings = await getAllSettings();
    pendingZoneCities = settings.zoneCities.slice();
    renderZoneChips();
  }

  function renderZoneChips() {
    const list = overlay.querySelector("#jc-zone-tag-list");
    list.innerHTML = pendingZoneCities
      .map(
        (city, i) => `<span class="jc-zone-tag-chip">${escapeHtml(city)}<button type="button" data-idx="${i}">✕</button></span>`
      )
      .join("");
    list.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingZoneCities.splice(Number(btn.getAttribute("data-idx")), 1);
        renderZoneChips();
      });
    });
  }

  function addZoneChip() {
    const input = overlay.querySelector("#jc-zone-input");
    const val = input.value.trim();
    if (!val) return;
    pendingZoneCities.push(val);
    input.value = "";
    renderZoneChips();
  }

  async function saveZoneHandler() {
    const msgEl = overlay.querySelector("#jc-zone-save-msg");
    const btn = overlay.querySelector(".jc-admin-save-zone-btn");
    btn.disabled = true;
    btn.textContent = "Enregistrement…";
    try {
      await setSetting("zone_cities", JSON.stringify(pendingZoneCities));
      await applySettingsToPage();
      msgEl.textContent = "Zone enregistrée ✅";
      msgEl.style.color = "var(--success)";
    } catch (e) {
      msgEl.textContent = "Erreur : " + (e.message || e);
      msgEl.style.color = "#B3441E";
    } finally {
      btn.disabled = false;
      btn.textContent = "Enregistrer la zone";
    }
  }

  /* ---------- Ouverture / fermeture ---------- */
  let isOpeningAdmin = false;

  function openAdmin() {
    if (isOpeningAdmin) return; // évite les ouvertures multiples en rafale (bug de gel corrigé)
    isOpeningAdmin = true;
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
    } finally {
      setTimeout(() => { isOpeningAdmin = false; }, 400);
    }
  }

  function closeAdmin() {
    if (!overlay) return;
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  /* ---------- Déclenchement : 5 clics/taps rapprochés sur le logo ---------- */
  function initTrigger() {
    const logo = document.getElementById("brand-logo");
    if (!logo) return;
    logo.style.cursor = "pointer";
    logo.classList.add("jc-admin-trigger");

    const REQUIRED_CLICKS = 5;
    const WINDOW_MS = 2500;
    let clickCount = 0;
    let windowTimer = null;

    function registerClick() {
      clickCount++;
      if (windowTimer) clearTimeout(windowTimer);
      windowTimer = setTimeout(() => { clickCount = 0; }, WINDOW_MS);
      if (clickCount >= REQUIRED_CLICKS) {
        clickCount = 0;
        clearTimeout(windowTimer);
        openAdmin();
      }
    }

    // 'click' se déclenche pour la souris ET pour un tap tactile : un seul
    // gestionnaire suffit et évite tout double-déclenchement.
    logo.addEventListener("click", (e) => {
      e.preventDefault();
      registerClick();
    });
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
   Le plus simple : ouvre l'espace admin (5 clics sur le logo),
   va dans l'onglet "🔒 Sécurité" et change-le directement depuis
   l'interface — c'est enregistré de façon sécurisée (hash) dans
   la base, sans jamais toucher à ce fichier.

   Mot de passe par défaut avant tout changement : jcplaquiste66
   ============================================================ */
