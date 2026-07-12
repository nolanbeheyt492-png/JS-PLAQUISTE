/* ============================================================
   ESPACE ADMIN SÉCURISÉ MULTI-PAGES — JS BATIMENT
   Accès : Double-clic sur le logo "JS PLAQUISTE"
   ============================================================ */
(function () {
  /* ---------- CONFIGURATION ---------- */
  const SUPABASE_URL = "https://rumlowblqgzxkhadymur.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_9zcs4Q-rciRAVmmuPL738A_6n353h3G";
  const BUCKET = "photos";
  const PHOTOS_TABLE = "gallery_photos";
  const SETTINGS_TABLE = "site_settings";

  const DEFAULT_ADMIN_PASSWORD_HASH = "dd05d37e8efb4628ea29eb808e27a23872e1de385d848b5211319d042aefea57";
  const UNLOCK_KEY = "jc_admin_unlocked";
  const LOCAL_STORAGE_KEY = "jc_gallery_photos";
  const MAX_IMAGE_WIDTH = 1280;
  const JPEG_QUALITY = 0.78;
  const NETWORK_TIMEOUT_MS = 10000;

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
  let supabaseLoadPromise = null;

  /* ---------- INJECTION DU DESIGN (CAROUSEL PUBLIC & VRAIE PAGE ADMIN) ---------- */
  function injectStyles() {
    if (document.getElementById("jc-custom-styles")) return;
    const style = document.createElement("style");
    style.id = "jc-custom-styles";
    style.innerHTML = `
      /* --- CAROUSEL HORIZONTAL PUBLIC --- */
      .jc-carousel-wrapper {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        box-sizing: border-box;
      }
      #gallery-grid {
        display: flex !important;
        overflow-x: auto !important;
        scroll-behavior: smooth;
        gap: 20px !important;
        width: 100%;
        padding: 15px 0 !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      #gallery-grid::-webkit-scrollbar { display: none !important; }
      .gallery-item {
        flex: 0 0 calc(25% - 15px) !important;
        min-width: 280px !important;
        max-width: 350px !important;
        margin: 0 !important;
        box-sizing: border-box;
      }
      .gallery-item img {
        width: 100% !important;
        height: 250px !important;
        object-fit: cover !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      }
      .gallery-info { display: none !important; }
      
      .jc-carousel-btn {
        position: absolute; top: 50%; transform: translateY(-50%);
        background: #ffffff !important; border: none !important; width: 42px; height: 42px;
        border-radius: 50% !important; cursor: pointer; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999; font-size: 18px; color: #000000 !important; font-weight: bold;
        transition: background 0.2s, transform 0.2s;
      }
      .jc-carousel-btn:hover { background: #f39c12 !important; color: #fff !important; transform: translateY(-50%) scale(1.05); }
      .jc-carousel-btn.prev { left: 10px; }
      .jc-carousel-btn.next { right: 10px; }
      
      @media (max-width: 1024px) { .gallery-item { flex: 0 0 calc(33.33% - 14px) !important; } }
      @media (max-width: 768px) { .gallery-item { flex: 0 0 calc(50% - 10px) !important; } .jc-carousel-btn { width: 36px; height: 36px; font-size: 14px; } }
      @media (max-width: 480px) { .gallery-item { flex: 0 0 85% !important; } }

      /* --- STYLE EN PLEIN ÉCRAN TYPE "VRAIE PAGE" --- */
      .jc-admin-overlay {
        position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        width: 100vw !important; height: 100vh !important; height: 100dvh !important; background: #121212 !important;
        z-index: 999999 !important; display: none; align-items: center !important; justify-content: center !important;
        font-family: 'Segoe UI', Roboto, sans-serif; opacity: 0; transition: opacity 0.2s ease;
        box-sizing: border-box !important; overflow: hidden !important; overscroll-behavior: contain !important;
        -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important;
      }
      .jc-admin-overlay *, .jc-admin-overlay *::before, .jc-admin-overlay *::after { box-sizing: border-box !important; }
      .jc-admin-overlay.show { display: flex !important; opacity: 1 !important; }
      
      /* Bouton Quitter sur le panneau de Connexion */
      .jc-admin-close-page {
        position: fixed !important; top: 20px !important; right: 20px !important;
        background: #252525 !important; border: 1px solid #444 !important; color: #fff !important;
        padding: 10px 20px !important; border-radius: 6px !important; font-size: 14px !important;
        font-weight: bold !important; cursor: pointer !important; z-index: 9999999 !important; transition: all 0.2s;
      }
      .jc-admin-close-page:hover { background: #e74c3c !important; border-color: #e74c3c !important; }

      /* Boite de verrouillage style portail de connexion */
      .jc-admin-lock {
        background: #1a1a1a !important; color: #ffffff !important; border-radius: 12px !important;
        padding: 40px 30px !important; width: 90% !important; max-width: 400px !important;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6) !important; border: 1px solid #333 !important;
        box-sizing: border-box !important; text-align: center !important;
      }
      .jc-admin-lock h3 { margin: 0 0 6px 0 !important; font-size: 26px !important; color: #f39c12 !important; text-transform: uppercase !important; letter-spacing: 1px; }
      .jc-admin-pass-input {
        width: 100% !important; padding: 14px !important; background: #2b2b2b !important; border: 1px solid #444 !important;
        border-radius: 8px !important; color: #fff !important; font-size: 16px !important; margin-top: 20px !important;
        box-sizing: border-box !important; text-align: center !important;
      }
      .jc-admin-pass-input:focus { border-color: #f39c12 !important; outline: none; }
      .jc-admin-error { color: #e74c3c !important; margin-top: 14px !important; font-size: 14px; min-height: 20px !important; font-weight: 500; }

      /* L'interface Tableau de bord Plein Écran */
      .jc-admin-dashboard {
        display: none; flex-direction: column !important; width: 100vw !important; height: 100vh !important; height: 100dvh !important;
        background: #141414 !important; color: #ffffff !important; position: absolute !important; top: 0 !important; left: 0 !important;
      }
      .jc-admin-topbar {
        display: flex !important; justify-content: space-between !important; align-items: center !important;
        padding: 18px 30px !important; background: #1a1a1a !important; border-bottom: 1px solid #2b2b2b !important; flex-shrink: 0 !important;
      }
      .jc-admin-brand { font-weight: bold !important; font-size: 20px !important; letter-spacing: 0.5px; }
      .jc-admin-brand span { color: #f39c12 !important; }
      .jc-admin-topbar-status { display: flex !important; align-items: center !important; font-size: 13px !important; color: #2ecc71 !important; font-weight: 500; }
      .jc-admin-topbar-status .dot { width: 8px !important; height: 8px !important; background: currentColor !important; border-radius: 50% !important; margin-right: 8px !important; }
      
      .jc-admin-body { display: flex !important; flex: 1 !important; min-height: 0 !important; overflow: hidden !important; }
      .jc-admin-sidebar {
        width: 250px !important; background: #111111 !important; border-right: 1px solid #2b2b2b !important;
        padding: 25px 15px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; flex-shrink: 0 !important; box-sizing: border-box !important;
      }
      .jc-admin-nav-btn, .jc-admin-nav-logout {
        width: 100% !important; padding: 13px 16px !important; background: none !important; border: none !important; border-radius: 8px !important;
        color: #aaa !important; text-align: left !important; cursor: pointer !important; font-size: 14px !important; transition: all 0.2s !important; display: block !important;
        font-weight: 500;
      }
      .jc-admin-nav-btn:hover { background: #222222 !important; color: #fff !important; }
      .jc-admin-nav-btn.active { background: #f39c12 !important; color: #000 !important; font-weight: bold !important; }
      .jc-admin-nav-logout { margin-top: auto !important; color: #e74c3c !important; border: 1px solid rgba(231,76,60,0.15) !important; background: rgba(231,76,60,0.02) !important; text-align: center !important; }
      .jc-admin-nav-logout:hover { background: #e74c3c !important; color: #fff !important; }
      
      .jc-admin-content { flex: 1 !important; min-height: 0 !important; padding: 40px !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; overscroll-behavior: contain !important; background: #181818 !important; box-sizing: border-box !important; }
      .jc-admin-tab { width: 100% !important; }
      .jc-admin-form { display: flex !important; flex-direction: column !important; gap: 14px !important; max-width: 600px !important; margin-bottom: 35px !important; }
      .jc-admin-form label { font-weight: 600 !important; font-size: 14px !important; color: #bbb !important; }
      .jc-admin-form input, .jc-admin-form select {
        padding: 13px !important; background: #252525 !important; border: 1px solid #3d3d3d !important; border-radius: 6px !important; color: #fff !important; font-size: 14px !important; box-sizing: border-box !important; width: 100% !important;
      }
      .jc-admin-form input:focus, .jc-admin-form select:focus { border-color: #f39c12 !important; outline: none !important; }
      
      .btn { padding: 13px 26px !important; border: none !important; border-radius: 6px !important; font-weight: bold !important; cursor: pointer !important; font-size: 14px !important; transition: all 0.2s !important; display: inline-block !important; }
      .btn-primary { background: #f39c12 !important; color: #000 !important; }
      .btn-primary:hover { background: #e67e22 !important; }
      
      .jc-admin-list { display: flex !important; flex-direction: column !important; gap: 12px !important; margin-top: 20px !important; }
      .jc-admin-list-item { display: flex !important; align-items: center !important; justify-content: space-between !important; background: #202020 !important; padding: 14px !important; border-radius: 8px !important; border: 1px solid #2b2b2b !important; }
      .jc-admin-list-item img { width: 80px !important; height: 80px !important; object-fit: cover !important; border-radius: 6px !important; border: 1px solid #3a3a3a !important; }
      .jc-admin-delete-btn { background: none !important; border: none !important; color: #e74c3c !important; font-size: 20px !important; cursor: pointer !important; padding: 8px !important; transition: transform 0.2s; }
      .jc-admin-delete-btn:hover { transform: scale(1.15); }
      
      .jc-zone-tag-list { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; margin-bottom: 20px !important; }
      .jc-zone-tag-chip { background: #252525 !important; border: 1px solid #3d3d3d !important; color: #fff !important; padding: 6px 14px !important; border-radius: 20px !important; font-size: 13px !important; display: flex !important; align-items: center !important; gap: 8px !important; }
      .jc-zone-tag-chip button { background: none !important; border: none !important; color: #888 !important; cursor: pointer !important; font-weight: bold !important; }
      
      @media (max-width: 768px) {
        .jc-admin-dashboard { max-width: 100vw !important; overflow-x: hidden !important; }
        .jc-admin-topbar { padding: 12px 16px !important; flex-wrap: wrap !important; gap: 6px !important; max-width: 100vw !important; }
        .jc-admin-brand { font-size: 15px !important; overflow-wrap: anywhere !important; }
        .jc-admin-topbar-status { font-size: 11px !important; }
        .jc-admin-topbar-status .dot { width: 6px !important; height: 6px !important; margin-right: 6px !important; }

        .jc-admin-body { flex-direction: column !important; max-width: 100vw !important; overflow-x: hidden !important; }
        .jc-admin-sidebar {
          width: 100% !important; max-width: 100vw !important; flex-direction: row !important; flex-wrap: nowrap !important;
          overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch !important;
          padding: 10px !important; gap: 8px !important; border-right: none !important; border-bottom: 1px solid #2b2b2b !important;
        }
        .jc-admin-nav-btn, .jc-admin-nav-logout {
          width: auto !important; flex-shrink: 0 !important; white-space: nowrap !important;
          padding: 10px 14px !important; font-size: 12.5px !important; margin-top: 0 !important;
        }

        .jc-admin-content { padding: 18px !important; max-width: 100vw !important; overflow-x: hidden !important; box-sizing: border-box !important; }
        .jc-admin-form { max-width: 100% !important; }

        .jc-admin-lock { padding: 30px 20px !important; width: 88% !important; }
        .jc-admin-lock h3 { font-size: 20px !important; }
        .jc-admin-close-page { top: 12px !important; right: 12px !important; padding: 8px 14px !important; font-size: 12px !important; }

        .jc-admin-list-item { flex-wrap: wrap !important; gap: 10px !important; max-width: 100% !important; }
        .jc-admin-list-item img { width: 56px !important; height: 56px !important; }
        .jc-admin-list-item span { flex: 1 1 100px !important; font-size: 12px !important; overflow-wrap: anywhere !important; min-width: 0 !important; }
      }

      @media (max-width: 380px) {
        .jc-admin-topbar-status { display: none !important; }
        .jc-admin-nav-btn, .jc-admin-nav-logout { font-size: 11.5px !important; padding: 9px 11px !important; }
        .jc-admin-brand { font-size: 14px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- FONCTIONS MUTUELLES & CRYPTO ---------- */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Délai dépassé, vérifie la connexion.")), ms)),
    ]);
  }

  function loadSupabaseLib() {
    if (window.supabase) return Promise.resolve();
    if (supabaseLoadPromise) return supabaseLoadPromise;
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

  function getLocalPhotos() {
    try { const raw = localStorage.getItem(LOCAL_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function setUnlocked(val) { try { localStorage.setItem(UNLOCK_KEY, val ? "1" : "0"); } catch (e) {} }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function readAndResizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_IMAGE_WIDTH) {
            height = Math.round((height * MAX_IMAGE_WIDTH) / width);
            width = MAX_IMAGE_WIDTH;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
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
    const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML;
  }

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
      } catch (e) { return fallback; }
    }
    return localStorage.getItem("jc_setting_" + key) || fallback;
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
      localStorage.setItem("jc_setting_" + key, value);
    }
  }

  async function getAllSettings() {
    const [phone, quote_email, beforeImg, afterImg, zoneCitiesRaw] = await Promise.all([
      getSetting("phone", DEFAULT_SETTINGS.phone),
      getSetting("quote_email", DEFAULT_SETTINGS.quote_email),
      getSetting("before_image", ""),
      getSetting("after_image", ""),
      getSetting("zone_cities", ""),
    ]);
    let zoneCities;
    try { zoneCities = zoneCitiesRaw ? JSON.parse(zoneCitiesRaw) : DEFAULT_ZONE_CITIES; } catch (e) { zoneCities = DEFAULT_ZONE_CITIES; }
    return { phone, quote_email, beforeImg, afterImg, zoneCities };
  }

  async function applySettingsToPage() {
    const settings = await getAllSettings();
    document.querySelectorAll('[data-jc-phone-link], a[href^="tel:"]').forEach((el) => {
      el.setAttribute("href", "tel:" + settings.phone.replace(/\D/g, ""));
    });
    document.querySelectorAll("[data-jc-phone-text]").forEach((el) => {
      el.textContent = settings.phone.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    });
    document.querySelectorAll('[data-jc-quote-form], form[action*="formsubmit.co"]').forEach((form) => {
      if ((form.getAttribute("action") || "").indexOf("formsubmit.co") !== -1) {
        form.setAttribute("action", "https://formsubmit.co/" + settings.quote_email);
      }
    });

    const beforeImg = document.getElementById("ba-before-img");
    const afterImg = document.getElementById("ba-after-img");
    if (beforeImg && settings.beforeImg) beforeImg.src = settings.beforeImg;
    if (afterImg && settings.afterImg) afterImg.src = settings.afterImg;

    const zoneContainer = document.getElementById("zone-tags-container");
    if (zoneContainer && settings.zoneCities) {
      zoneContainer.innerHTML = settings.zoneCities.map((c) => `<span>${escapeHtml(c)}</span>`).join("");
    }
  }

  async function fetchPhotos() {
    if (isConfigured) {
      const client = await ensureSupabase();
      const { data, error } = await client.from(PHOTOS_TABLE).select("*").order("created_at", { ascending: true });
      if (error) return getLocalPhotos();
      return data || [];
    }
    return getLocalPhotos();
  }

  /* ---------- RENDER PUBLIC CAROUSEL HORIZONTAL ---------- */
  async function renderPublicGallery() {
    const grid = document.getElementById("gallery-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const photos = await fetchPhotos();

    if (!photos.length) {
      const emptyMsg = document.createElement("p");
      emptyMsg.id = "gallery-empty-msg";
      emptyMsg.style.cssText = "color:var(--text-muted); font-style:italic; padding:20px 0;";
      emptyMsg.textContent = "Nos prochaines réalisations arrivent bientôt ici.";
      grid.appendChild(emptyMsg);
      return;
    }

    photos.forEach((p) => {
      const item = document.createElement("div");
      item.className = "gallery-item";
      item.setAttribute("data-admin-photo", p.id);
      item.innerHTML = `<img src="${p.image_url}" alt="Réalisation JS Bâtiment">`;
      grid.appendChild(item);
    });

    let wrapper = grid.parentElement;
    if (!wrapper.classList.contains("jc-carousel-wrapper")) {
      wrapper = document.createElement("div");
      wrapper.className = "jc-carousel-wrapper";
      grid.parentNode.insertBefore(wrapper, grid);
      wrapper.appendChild(grid);

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "jc-carousel-btn prev";
      prevBtn.innerHTML = "&#10094;";
      prevBtn.addEventListener("click", () => { grid.scrollLeft -= 320; });

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "jc-carousel-btn next";
      nextBtn.innerHTML = "&#10095;";
      nextBtn.addEventListener("click", () => { grid.scrollLeft += 320; });

      wrapper.appendChild(prevBtn);
      wrapper.appendChild(nextBtn);
    }
  }

  /* ---------- CONSTRUIRE LA VRAIE PAGE ADMISTRATIVE ---------- */
  let overlay;

  function buildOverlay() {
    if (overlay) return overlay;
    injectStyles();
    
    overlay = document.createElement("div");
    overlay.id = "jc-admin-overlay";
    overlay.className = "jc-admin-overlay";
    overlay.innerHTML = `
      <!-- Bouton de secours pour abandonner la connexion -->
      <button type="button" class="jc-admin-close-page">✕ Retour au Site</button>

      <!-- ÉCRAN DE CONNEXION PRINCIPAL -->
      <div class="jc-admin-lock">
        <h3>Connexion</h3>
        <p style="color:#666; margin:0; font-size:13px; text-transform:uppercase;">JS BÂTIMENT — Administration</p>
        <input type="password" class="jc-admin-pass-input" placeholder="Entrez le mot de passe">
        <button type="button" class="btn btn-primary jc-admin-pass-btn" style="width:100%; margin-top:16px;">Accéder à la gestion</button>
        <p class="jc-admin-error"></p>
      </div>

      <!-- INTERFACE DÉDIÉE PLEIN ÉCRAN (INVISIBLE TANT QUE PAS CONNECTÉ) -->
      <div class="jc-admin-dashboard">
        <div class="jc-admin-topbar">
          <div class="jc-admin-brand">JS <span>BATIMENT</span> — Espace Privé</div>
          <div class="jc-admin-topbar-status"><span class="dot"></span>Session Administrateur active</div>
        </div>
        <div class="jc-admin-body">
          <nav class="jc-admin-sidebar">
            <button type="button" class="jc-admin-nav-btn active" data-tab="photos">📸 Gestion Photos</button>
            <button type="button" class="jc-admin-nav-btn" data-tab="contact">☎️ Coordonnées</button>
            <button type="button" class="jc-admin-nav-btn" data-tab="zone">📍 Zone d'intervention</button>
            <button type="button" class="jc-admin-nav-btn" data-tab="security">🔒 Sécurité</button>
            <button type="button" class="jc-admin-nav-logout" id="jc-admin-logout-btn">✕ Quitter l'admin</button>
          </nav>
          <div class="jc-admin-content">

            <section class="jc-admin-tab" data-tab-panel="photos">
              <h3>Ajouter une nouvelle photo</h3>
              <div class="jc-admin-form">
                <label>Emplacement sur le site :</label>
                <select class="jc-admin-placement-input">
                  <option value="gallery">Galerie Défilante « Nos Réalisations »</option>
                  <option value="before">Comparateur Avant / Après — Photo AVANT</option>
                  <option value="after">Comparateur Avant / Après — Photo APRÈS</option>
                </select>

                <label>Sélectionner l'image :</label>
                <input type="file" accept="image/*" class="jc-admin-file-input">

                <button type="button" class="btn btn-primary jc-admin-add-btn" style="margin-top:10px;">Mettre en ligne la photo</button>
              </div>

              <h4 style="border-top:1px solid #333; padding-top:20px; color:#f39c12;">Photos actuellement dans la galerie défilante :</h4>
              <div class="jc-admin-list"></div>
            </section>

            <section class="jc-admin-tab" data-tab-panel="contact" style="display:none;">
              <h3>Coordonnées de l'entreprise</h3>
              <div class="jc-admin-form">
                <label>Téléphone</label>
                <input type="text" class="jc-admin-phone-input" placeholder="06 00 00 00 00">
                <label>E-mail de réception des devis</label>
                <input type="email" class="jc-admin-email-input" placeholder="contact@exemple.fr">
                <button type="button" class="btn btn-primary jc-admin-save-contact-btn">Enregistrer</button>
              </div>
            </section>

            <section class="jc-admin-tab" data-tab-panel="zone" style="display:none;">
              <h3>Zone d'intervention</h3>
              <div class="jc-zone-tag-list" id="jc-zone-tag-list"></div>
              <div style="display:flex; gap:10px; max-width:450px;">
                <input type="text" id="jc-zone-input" placeholder="Ajouter une ville (ex : Thuir)" style="padding:12px; background:#2b2b2b; border:1px solid #444; color:#fff; border-radius:6px; flex:1;">
                <button type="button" class="btn" id="jc-zone-add-btn" style="background:#333; color:#fff; border:1px solid #555;">Ajouter</button>
              </div>
              <button type="button" class="btn btn-primary jc-admin-save-zone-btn" style="margin-top:20px;">Enregistrer la zone d'intervention</button>
            </section>

            <section class="jc-admin-tab" data-tab-panel="security" style="display:none;">
              <h3>Changer le mot de passe de cette page</h3>
              <div class="jc-admin-form">
                <input type="password" class="jc-admin-new-pass-input" placeholder="Nouveau mot de passe">
                <input type="password" class="jc-admin-confirm-pass-input" placeholder="Confirmer le mot de passe">
                <button type="button" class="btn btn-primary jc-admin-save-pass-btn">Modifier le mot de passe</button>
                <p class="jc-admin-save-msg" id="jc-pass-save-msg"></p>
              </div>
            </section>

          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".jc-admin-close-page").addEventListener("click", closeAdmin);
    overlay.querySelector(".jc-admin-pass-btn").addEventListener("click", tryUnlock);
    overlay.querySelectorAll(".jc-admin-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });
    overlay.querySelector("#jc-admin-logout-btn").addEventListener("click", () => { setUnlocked(false); closeAdmin(); });
    overlay.querySelector(".jc-admin-add-btn").addEventListener("click", addPhotoHandler);
    overlay.querySelector(".jc-admin-save-contact-btn").addEventListener("click", saveContactHandler);
    overlay.querySelector(".jc-admin-save-zone-btn").addEventListener("click", saveZoneHandler);
    overlay.querySelector("#jc-zone-add-btn").addEventListener("click", addZoneChip);
    overlay.querySelector(".jc-admin-save-pass-btn").addEventListener("click", changePasswordHandler);

    return overlay;
  }

  function switchTab(tab) {
    overlay.querySelectorAll(".jc-admin-nav-btn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tab));
    overlay.querySelectorAll(".jc-admin-tab").forEach((s) => {
      s.style.display = s.getAttribute("data-tab-panel") === tab ? "block" : "none";
    });
    if (tab === "contact") loadContactTab();
    if (tab === "zone") loadZoneTab();
  }

  async function tryUnlock() {
    const input = overlay.querySelector(".jc-admin-pass-input");
    const errorEl = overlay.querySelector(".jc-admin-error");
    const hash = await sha256Hex(input.value);
    const validHash = await getSetting("admin_password_hash", DEFAULT_ADMIN_PASSWORD_HASH);
    
    if (hash === validHash) {
      setUnlocked(true);
      showDashboard();
      input.value = "";
      errorEl.textContent = "";
    } else {
      errorEl.textContent = "Mot de passe erroné. Accès refusé.";
    }
  }

  function showDashboard() {
    overlay.querySelector(".jc-admin-lock").style.display = "none";
    overlay.querySelector(".jc-admin-close-page").style.display = "none"; // On masque le bouton de sortie temporaire
    overlay.querySelector(".jc-admin-dashboard").style.display = "flex"; // La vraie page se déploie
    switchTab("photos");
    renderAdminList();
  }

  async function renderAdminList() {
    const list = overlay.querySelector(".jc-admin-list");
    list.innerHTML = `<p style="color:#666;">Chargement des images…</p>`;
    const photos = await fetchPhotos();
    if (!photos.length) { list.innerHTML = `<p style="color:#666; font-style:italic;">Aucune photo dans la galerie.</p>`; return; }
    list.innerHTML = "";
    photos.forEach((p) => {
      const row = document.createElement("div");
      row.className = "jc-admin-list-item";
      row.innerHTML = `
        <img src="${p.image_url}" alt="">
        <span style="color:#aaa; font-size:13px;">Photo affichée en galerie défilante</span>
        <button type="button" class="jc-admin-delete-btn">🗑️</button>`;
      row.querySelector(".jc-admin-delete-btn").addEventListener("click", async () => {
        if (confirm("Supprimer cette photo de la galerie ?")) {
          if (isConfigured) {
            const client = await ensureSupabase();
            if (p.storage_path) await client.storage.from(BUCKET).remove([p.storage_path]);
            await client.from(PHOTOS_TABLE).delete().eq("id", p.id);
          }
          renderAdminList(); renderPublicGallery();
        }
      });
      list.appendChild(row);
    });
  }

  async function addPhotoHandler() {
    const placement = overlay.querySelector(".jc-admin-placement-input").value;
    const fileInput = overlay.querySelector(".jc-admin-file-input");
    const file = fileInput.files[0];
    if (!file) { alert("Veuillez sélectionner une image."); return; }

    const btn = overlay.querySelector(".jc-admin-add-btn");
    btn.disabled = true; btn.textContent = "Mise en ligne…";

    try {
      const dataUrl = await readAndResizeImage(file);
      if (placement === "gallery") {
        if (isConfigured) {
          const { url, path } = await uploadImage(dataUrl);
          const client = await ensureSupabase();
          await client.from(PHOTOS_TABLE).insert([{ image_url: url, storage_path: path, title: "", description: "", category: "Autre" }]);
        }
        renderAdminList();
      } else {
        const key = placement === "before" ? "before_image" : "after_image";
        if (isConfigured) { const { url } = await uploadImage(dataUrl); await setSetting(key, url); }
      }
      fileInput.value = ""; renderPublicGallery(); applySettingsToPage(); alert("Photo ajoutée avec succès ! ✅");
    } catch (e) { alert("Erreur : " + e.message); } finally { btn.disabled = false; btn.textContent = "Mettre en ligne la photo"; }
  }

  async function changePasswordHandler() {
    const newPass = overlay.querySelector(".jc-admin-new-pass-input").value;
    const confirmPass = overlay.querySelector(".jc-admin-confirm-pass-input").value;
    const msg = overlay.querySelector("#jc-pass-save-msg");
    if (newPass.length < 6) { msg.textContent = "Minimum 6 caractères."; msg.style.color = "#e74c3c"; return; }
    if (newPass !== confirmPass) { msg.textContent = "Les mots de passe diffèrent."; msg.style.color = "#e74c3c"; return; }
    const newHash = await sha256Hex(newPass);
    await setSetting("admin_password_hash", newHash);
    msg.textContent = "Mot de passe modifié ! ✅"; msg.style.color = "#2ecc71";
    overlay.querySelector(".jc-admin-new-pass-input").value = ""; overlay.querySelector(".jc-admin-confirm-pass-input").value = "";
  }

  async function loadContactTab() {
    const settings = await getAllSettings();
    overlay.querySelector(".jc-admin-phone-input").value = settings.phone;
    overlay.querySelector(".jc-admin-email-input").value = settings.quote_email;
  }

  async function saveContactHandler() {
    const p = overlay.querySelector(".jc-admin-phone-input").value;
    const e = overlay.querySelector(".jc-admin-email-input").value;
    await setSetting("phone", p); await setSetting("quote_email", e);
    applySettingsToPage(); alert("Coordonnées enregistrées ! ✅");
  }

  let pendingZoneCities = [];
  async function loadZoneTab() {
    const settings = await getAllSettings(); pendingZoneCities = settings.zoneCities.slice(); renderZoneChips();
  }
  function renderZoneChips() {
    const list = overlay.querySelector("#jc-zone-tag-list");
    list.innerHTML = pendingZoneCities.map((c, i) => `<span class="jc-zone-tag-chip">${escapeHtml(c)}<button type="button" data-idx="${i}">✕</button></span>`).join("");
    list.querySelectorAll("button[data-idx]").forEach((b) => {
      b.addEventListener("click", () => { pendingZoneCities.splice(Number(b.getAttribute("data-idx")), 1); renderZoneChips(); });
    });
  }
  function addZoneChip() {
    const input = overlay.querySelector("#jc-zone-input");
    if (input.value.trim()) { pendingZoneCities.push(input.value.trim()); input.value = ""; renderZoneChips(); }
  }
  async function saveZoneHandler() {
    await setSetting("zone_cities", JSON.stringify(pendingZoneCities)); applySettingsToPage(); alert("Zone d'intervention mise à jour ! ✅");
  }

  /* MODIFICATION MAJEURE : Force le panneau de connexion à chaque clic et réinitialise la session */
  let jcAdminSavedScrollY = 0;
  function openAdmin() {
    setUnlocked(false); // Force la déconnexion immédiate à chaque tentative d'ouverture
    jcAdminSavedScrollY = window.scrollY || window.pageYOffset || 0;
    buildOverlay();
    overlay.classList.add("show");
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.top = (-jcAdminSavedScrollY) + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    // On réaffiche obligatoirement la boîte de verrouillage et le bouton quitter
    overlay.querySelector(".jc-admin-lock").style.display = "block"; 
    overlay.querySelector(".jc-admin-close-page").style.display = "block"; 
    overlay.querySelector(".jc-admin-dashboard").style.display = "none";
    
    // Met le focus direct sur le mot de passe
    setTimeout(() => overlay.querySelector(".jc-admin-pass-input").focus(), 100);
  }
  
  function closeAdmin() {
    if (overlay) { overlay.classList.remove("show"); }
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, jcAdminSavedScrollY);
  }

  // Filet de sécurité : si la page revient du cache du navigateur (retour arrière,
  // changement d'appli...) avec le panneau admin resté "ouvert" et le scroll
  // verrouillé, on force un état propre pour éviter que la page reste figée.
  window.addEventListener("pageshow", () => {
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    if (overlay) { overlay.classList.remove("show"); }
  });

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    const logo = document.getElementById("brand-logo");
    if (logo) {
      let clicks = 0;
      let clicksTimer = null;
      logo.addEventListener("click", (e) => {
        e.preventDefault(); clicks++;
        if (clicks >= 3) { clicks = 0; openAdmin(); }
        clearTimeout(clicksTimer);
        clicksTimer = setTimeout(() => { clicks = 0; }, 900);
      });
    }
    renderPublicGallery(); applySettingsToPage();
  });
})();