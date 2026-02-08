document.documentElement.setAttribute("data-page", "driver-dashboard");

window.Webflow ||= [];
window.Webflow.push(async function () {
  if (window.__mblDriverDashboardLoaded) return;
  window.__mblDriverDashboardLoaded = true;

  const ROOT_SELECTOR = "[data-mbl-driver-dashboard]";
  const root =
    document.querySelector(ROOT_SELECTOR) ||
    document.querySelector("#mbl-driver-dashboard") ||
    document.querySelector(".mbl-driver-dashboard") ||
    null;

  if (!root) {
    console.error("[DRIVER] Root introuvable. Ajoute <div data-mbl-driver-dashboard></div> sur la page.");
    return;
  }

  const url = new URL(location.href);
  const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
  const log = (...a) => DEBUG && console.log("[DRIVER]", ...a);

  const CFG = window.__MBL_CFG__ || {};
  const match = String(location.pathname || "").match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT = match ? `/${match[1]}` : "/applications";

  const CONFIG = {
    SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
    SUPABASE_ANON_KEY:
      CFG.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
    SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",

    LOGIN_PATH: String(CFG.LOGIN_PATH || localStorage.getItem("mbl-app-login-path") || `${APP_ROOT}/login`).trim(),
    SUBSCRIBE_PATH: String(CFG.SUBSCRIBE_PATH || "/subscriptions").trim() || "/subscriptions",

    DRIVERS_TABLE: "transport_drivers",
    TOURS_TABLE: "transport_tours",
    SHIPMENTS_TABLE: "transport_shipments",
    VEHICLES_TABLE: "transport_vehicles",
  };

  const STR = {
    title: "Espace chauffeur",
    subtitle: "Tournées, courses et infos utiles",
    loading: "Chargement…",
    refresh: "Actualiser",
    upcoming: "A venir",
    history: "Historique",
    empty: "Aucune tournee a afficher.",
    loginTitle: "Connexion requise",
    loginBody: "Connecte-toi pour acceder a ton espace chauffeur.",
    loginCta: "Se connecter",
    moduleMissingTitle: "Module non inclus",
    moduleMissingBody: "Ton abonnement n'inclut pas le module Transport.",
    moduleCta: "Gerer mon abonnement",
    noDriverTitle: "Profil chauffeur manquant",
    noDriverBody: "Ton compte n'est pas configure comme chauffeur dans cette organisation.",
    noDriverCta: "Contacter un admin",
  };

  function escapeHTML(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clamp255(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function parseColorToRgb(input) {
    const s = String(input || "").trim();
    if (!s) return null;
    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return { r, g, b };
      }
    }
    const m = s.match(/rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/i);
    if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };
    return null;
  }

  function resolvePrimary() {
    try {
      const v = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary") || "").trim();
      if (v) return v;
    } catch (_) {}
    return String(CFG.THEME_PRIMARY || "").trim() || "#0ea5e9";
  }

  function ensurePrimaryRgbCssVar() {
    try {
      const existing = String(getComputedStyle(document.documentElement).getPropertyValue("--mbl-primary-rgb") || "").trim();
      if (existing) return;
    } catch (_) {}
    const rgb = parseColorToRgb(resolvePrimary());
    if (!rgb) return;
    try {
      document.documentElement.style.setProperty("--mbl-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("mbl-driver-style")) return;
    ensurePrimaryRgbCssVar();
    const st = document.createElement("style");
    st.id = "mbl-driver-style";
    st.textContent = `
      html[data-page="driver-dashboard"] {
        --dv-ink: rgba(2,6,23,0.92);
        --dv-muted: rgba(2,6,23,0.62);
        --dv-border: rgba(15,23,42,0.12);
        --dv-card: rgba(255,255,255,0.88);
        --dv-shadow: 0 22px 60px rgba(2,6,23,0.10);
      }

      html[data-page="driver-dashboard"] .dv-shell,
      html[data-page="driver-dashboard"] .dv-shell * { box-sizing: border-box; }

      html[data-page="driver-dashboard"] .dv-shell {
        border-radius: 18px;
        border: 1px solid rgba(15,23,42,0.10);
        background:
          radial-gradient(1000px 520px at 12% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.10), transparent 55%),
          radial-gradient(920px 520px at 92% 8%, rgba(2, 6, 23, 0.08), transparent 60%),
          linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.96));
        box-shadow: var(--dv-shadow);
        overflow: hidden;
        color: var(--dv-ink);
      }

      html[data-page="driver-dashboard"] .dv-top {
        display:flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 18px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.70));
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      html[data-page="driver-dashboard"] .dv-title { margin:0; font-size: 18px; font-weight: 950; }
      html[data-page="driver-dashboard"] .dv-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--dv-muted); font-weight: 750; }

      html[data-page="driver-dashboard"] .dv-actions { display:flex; gap:10px; flex-wrap: wrap; justify-content:flex-end; }
      html[data-page="driver-dashboard"] .dv-btn {
        height: 42px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        color: rgba(2,6,23,0.86);
        font-weight: 950;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }
      html[data-page="driver-dashboard"] .dv-btn:hover { transform: translateY(-1px); border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.35); box-shadow: 0 18px 44px rgba(2,6,23,0.10); }

      html[data-page="driver-dashboard"] .dv-banner {
        display:none;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 800;
        font-size: 13px;
      }
      html[data-page="driver-dashboard"] .dv-banner.is-ok { display:block; background:#ecfdf5; color:#065f46; }
      html[data-page="driver-dashboard"] .dv-banner.is-err { display:block; background:#fef2f2; color:#991b1b; }

      html[data-page="driver-dashboard"] .dv-body { padding: 14px; }

      html[data-page="driver-dashboard"] .dv-tabs {
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 8px;
        border: 1px solid rgba(15,23,42,0.10);
        border-radius: 16px;
        background: rgba(255,255,255,0.64);
        margin-bottom: 12px;
      }
      html[data-page="driver-dashboard"] .dv-tab {
        height: 36px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.85);
        font-weight: 950;
        color: rgba(2,6,23,0.76);
        cursor: pointer;
        transition: background .18s ease, transform .18s ease, border-color .18s ease;
      }
      html[data-page="driver-dashboard"] .dv-tab[aria-selected="true"] {
        border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.35);
        background: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.12);
        color: rgba(2,6,23,0.88);
      }

      html[data-page="driver-dashboard"] .dv-grid {
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      html[data-page="driver-dashboard"] .dv-card {
        border: 1px solid var(--dv-border);
        background: var(--dv-card);
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 12px 24px rgba(2,6,23,0.06);
      }
      html[data-page="driver-dashboard"] .dv-row { display:flex; justify-content: space-between; align-items:flex-start; gap: 12px; }
      html[data-page="driver-dashboard"] .dv-row h3 { margin:0; font-size: 15px; font-weight: 1000; letter-spacing: -0.01em; }
      html[data-page="driver-dashboard"] .dv-meta { color: var(--dv-muted); font-size: 13px; line-height: 1.4; margin-top: 6px; font-weight: 800; }

      html[data-page="driver-dashboard"] .dv-badges { display:flex; gap: 8px; flex-wrap: wrap; justify-content:flex-end; }
      html[data-page="driver-dashboard"] .dv-badge {
        display:inline-flex; align-items:center; gap: 8px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(248,250,252,0.92);
        padding: 6px 10px;
        border-radius: 999px;
        font-weight: 1000;
        font-size: 12px;
        color: rgba(2,6,23,0.74);
        white-space: nowrap;
      }
      html[data-page="driver-dashboard"] .dv-dot { width:8px; height:8px; border-radius: 999px; background: rgba(148,163,184,0.9); }
      html[data-page="driver-dashboard"] .is-planned .dv-dot { background:#0ea5e9; }
      html[data-page="driver-dashboard"] .is-progress .dv-dot { background:#7c3aed; }
      html[data-page="driver-dashboard"] .is-done .dv-dot { background:#22c55e; }
      html[data-page="driver-dashboard"] .is-canceled .dv-dot { background:#ef4444; }

      @media (max-width: 760px) {
        html[data-page="driver-dashboard"] .dv-top { flex-direction: column; align-items: flex-start; }
        html[data-page="driver-dashboard"] .dv-actions { width: 100%; }
        html[data-page="driver-dashboard"] .dv-actions .dv-btn { flex: 1; }
        html[data-page="driver-dashboard"] .dv-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(st);
  }

  async function ensureSupabaseJs() {
    if (window.supabase?.createClient) return;
    const existing = document.querySelector('script[data-mbl-lib="supabase"]');
    if (existing) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout supabase-js")), 8000);
        existing.addEventListener("load", () => (clearTimeout(t), resolve()), { once: true });
        existing.addEventListener("error", () => (clearTimeout(t), reject(new Error("Echec chargement supabase-js"))), {
          once: true,
        });
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
      s.addEventListener("load", () => (clearTimeout(t), resolve()), { once: true });
      s.addEventListener("error", () => (clearTimeout(t), reject(new Error("Echec chargement supabase-js"))), { once: true });
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

  function showBanner(els, msg, kind) {
    els.banner.textContent = msg || "";
    els.banner.classList.toggle("is-ok", kind === "ok");
    els.banner.classList.toggle("is-err", kind === "err");
    els.banner.style.display = msg ? "block" : "none";
  }

  function renderShell() {
    root.classList.add("dv-shell");
    root.innerHTML = `
      <div class="dv-top">
        <div>
          <h2 class="dv-title">${escapeHTML(STR.title)}</h2>
          <p class="dv-subtitle">${escapeHTML(STR.subtitle)}</p>
        </div>
        <div class="dv-actions">
          <button type="button" class="dv-btn" data-action="refresh">${escapeHTML(STR.refresh)}</button>
        </div>
      </div>
      <div class="dv-banner" data-banner></div>
      <div class="dv-body">
        <div class="dv-tabs" role="tablist">
          <button type="button" class="dv-tab" data-tab="upcoming" role="tab" aria-selected="true">${escapeHTML(STR.upcoming)}</button>
          <button type="button" class="dv-tab" data-tab="history" role="tab" aria-selected="false">${escapeHTML(STR.history)}</button>
        </div>
        <div class="dv-grid" data-grid></div>
      </div>
    `;
    return {
      btnRefresh: root.querySelector('[data-action="refresh"]'),
      banner: root.querySelector("[data-banner]"),
      tabs: Array.from(root.querySelectorAll(".dv-tab[data-tab]")),
      grid: root.querySelector("[data-grid]"),
    };
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "planned") return "is-planned";
    if (s === "in_progress") return "is-progress";
    if (s === "done") return "is-done";
    if (s === "canceled") return "is-canceled";
    return "";
  }

  function statusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "draft") return "Brouillon";
    if (s === "planned") return "Planifiee";
    if (s === "in_progress") return "En cours";
    if (s === "done") return "Terminee";
    if (s === "canceled") return "Annulee";
    return s || "—";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function fmtInt(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
  }

  function renderBlocking(els, title, body, ctaLabel, ctaHref) {
    els.grid.innerHTML = `
      <div class="dv-card" style="grid-column: 1 / -1;">
        <div class="dv-row">
          <div>
            <h3>${escapeHTML(title)}</h3>
            <div class="dv-meta">${escapeHTML(body)}</div>
          </div>
        </div>
        <div style="margin-top:12px;">
          <a class="dv-btn" href="${escapeHTML(ctaHref)}" style="display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">
            ${escapeHTML(ctaLabel)}
          </a>
        </div>
      </div>
    `;
  }

  injectStyles();
  const els = renderShell();
  showBanner(els, STR.loading, "");

  let supabase = null;

  const state = {
    userId: "",
    orgId: "",
    driver: null,
    tours: [],
    shipments: [],
    vehicles: [],
    tab: "upcoming",
    modules: {},
  };

  wireEvents();

  try {
    await ensureSupabaseJs();
    supabase = getSupabase();
    if (!supabase) throw new Error("Supabase non charge.");

    const user = (await supabase.auth.getUser())?.data?.user || null;
    state.userId = String(user?.id || "");
    if (!state.userId) {
      renderBlocking(els, STR.loginTitle, STR.loginBody, STR.loginCta, CONFIG.LOGIN_PATH);
      return;
    }

    const member = await resolveMember();
    state.orgId = String(member?.organization_id || "").trim();
    if (!state.orgId) {
      renderBlocking(els, "Organisation introuvable", "Ton compte n'est rattache a aucune organisation.", STR.moduleCta, CONFIG.SUBSCRIBE_PATH);
      return;
    }

    const entRes = await supabase.from("organization_entitlements").select("modules").eq("organization_id", state.orgId).maybeSingle();
    state.modules = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
    if (!state.modules?.transport) {
      renderBlocking(els, STR.moduleMissingTitle, STR.moduleMissingBody, STR.moduleCta, CONFIG.SUBSCRIBE_PATH);
      return;
    }

    await refreshAll();
    showBanner(els, "", "");
  } catch (e) {
    console.error("[DRIVER] boot error:", e);
    renderBlocking(els, "Erreur", "Impossible de charger l'espace chauffeur.", "Recharger", location.href);
  }

  function wireEvents() {
    els.btnRefresh.addEventListener("click", async () => {
      await refreshAll();
      showBanner(els, "Actualise.", "ok");
      setTimeout(() => showBanner(els, "", ""), 1200);
    });
    els.tabs.forEach((t) => {
      t.addEventListener("click", () => {
        state.tab = String(t.dataset.tab || "upcoming");
        els.tabs.forEach((x) => x.setAttribute("aria-selected", x === t ? "true" : "false"));
        render();
      });
    });
  }

  async function resolveMember() {
    const baseSel = "organization_id, role, is_default, created_at";
    const fullSel = baseSel + ", permissions_mode, permissions";
    let res = await supabase
      .from("organization_members")
      .select(fullSel)
      .eq("user_id", state.userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (res.error && String(res.error.message || "").toLowerCase().includes("does not exist")) {
      res = await supabase
        .from("organization_members")
        .select(baseSel)
        .eq("user_id", state.userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
    }
    return res.error ? null : res.data?.[0] || null;
  }

  async function refreshAll() {
    showBanner(els, STR.loading, "");

    const driverRes = await supabase
      .from(CONFIG.DRIVERS_TABLE)
      .select("id, first_name, last_name, email, phone, license_number, license_expiry, is_active")
      .eq("organization_id", state.orgId)
      .eq("profile_id", state.userId)
      .maybeSingle();

    if (driverRes.error || !driverRes.data?.id) {
      renderBlocking(els, STR.noDriverTitle, STR.noDriverBody, STR.noDriverCta, `${APP_ROOT}/transport`);
      return;
    }

    state.driver = driverRes.data;

    const [toursRes, shipRes, vehRes] = await Promise.all([
      supabase
        .from(CONFIG.TOURS_TABLE)
        .select("id, reference, tour_date, status, start_name, start_address, start_city, end_name, end_address, end_city, distance_m, duration_s, vehicle_id")
        .eq("organization_id", state.orgId)
        .eq("driver_id", state.driver.id)
        .order("tour_date", { ascending: true })
        .limit(200),
      supabase
        .from(CONFIG.SHIPMENTS_TABLE)
        .select("id, reference, title, status, tour_id, tour_sequence, pickup_address, pickup_city, delivery_address, delivery_city, planned_pickup_at, planned_delivery_at")
        .eq("organization_id", state.orgId)
        .eq("driver_id", state.driver.id)
        .order("planned_pickup_at", { ascending: true })
        .limit(600),
      supabase
        .from(CONFIG.VEHICLES_TABLE)
        .select("id, plate_number, name, brand, model")
        .eq("organization_id", state.orgId)
        .limit(400),
    ]);

    state.tours = toursRes.error ? [] : toursRes.data || [];
    state.shipments = shipRes.error ? [] : shipRes.data || [];
    state.vehicles = vehRes.error ? [] : vehRes.data || [];

    render();
  }

  function render() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const tours = (state.tours || [])
      .filter((t) => {
        const d = String(t.tour_date || "");
        if (!d) return state.tab === "history";
        return state.tab === "upcoming" ? d >= todayStr : d < todayStr;
      })
      .slice()
      .sort((a, b) => {
        const da = String(a.tour_date || "9999-12-31");
        const db = String(b.tour_date || "9999-12-31");
        return state.tab === "upcoming" ? da.localeCompare(db) : db.localeCompare(da);
      });

    if (!tours.length) {
      els.grid.innerHTML = `<div class="dv-card" style="grid-column:1/-1;"><div class="dv-meta">${escapeHTML(STR.empty)}</div></div>`;
      return;
    }

    const shipmentsByTour = new Map();
    (state.shipments || []).forEach((s) => {
      const k = String(s.tour_id || "");
      if (!k) return;
      const arr = shipmentsByTour.get(k) || [];
      arr.push(s);
      shipmentsByTour.set(k, arr);
    });

    const vehById = new Map((state.vehicles || []).map((v) => [String(v.id), v]));

    els.grid.innerHTML = tours
      .map((t) => {
        const ship = shipmentsByTour.get(String(t.id)) || [];
        ship.sort((a, b) => Number(a.tour_sequence || 0) - Number(b.tour_sequence || 0));
        const veh = vehById.get(String(t.vehicle_id)) || null;

        const badgeCls = statusClass(t.status);
        const badge = `<span class="dv-badge ${escapeHTML(badgeCls)}"><span class="dv-dot"></span>${escapeHTML(
          statusLabel(t.status)
        )}</span>`;

        const distanceKm = t.distance_m ? Math.round(Number(t.distance_m) / 1000) : 0;
        const metaBits = [];
        if (t.tour_date) metaBits.push(`Date: ${fmtDate(t.tour_date)}`);
        if (veh?.plate_number) metaBits.push(`Vehicule: ${veh.plate_number}${veh.name ? " • " + veh.name : ""}`);
        if (distanceKm) metaBits.push(`Distance: ${fmtInt(distanceKm)} km`);
        if (ship.length) metaBits.push(`Courses: ${fmtInt(ship.length)}`);

        const routeBits = [];
        if (t.start_city || t.start_address) routeBits.push(`${t.start_city || ""} ${t.start_address || ""}`.trim());
        if (t.end_city || t.end_address) routeBits.push(`${t.end_city || ""} ${t.end_address || ""}`.trim());
        const route = routeBits.filter(Boolean).join(" → ") || "—";

        const shipHtml = ship
          .slice(0, 10)
          .map((s) => {
            const pickup = [s.pickup_city, s.pickup_address].filter(Boolean).join(" • ");
            const drop = [s.delivery_city, s.delivery_address].filter(Boolean).join(" • ");
            return `<div class="dv-meta">• ${escapeHTML(s.reference || s.title || "Course")} — ${escapeHTML(
              pickup || "Pickup"
            )} → ${escapeHTML(drop || "Delivery")}</div>`;
          })
          .join("");

        const more = ship.length > 10 ? `<div class="dv-meta">… +${escapeHTML(String(ship.length - 10))} autres</div>` : "";

        return `
          <article class="dv-card">
            <div class="dv-row">
              <div>
                <h3>${escapeHTML(t.reference || "Tournee")} • ${escapeHTML(route)}</h3>
                <div class="dv-meta">${escapeHTML(metaBits.join(" • ") || "—")}</div>
              </div>
              <div class="dv-badges">
                ${badge}
              </div>
            </div>
            <div style="margin-top:10px;">
              ${shipHtml || `<div class="dv-meta">Aucune course rattachee.</div>`}
              ${more}
            </div>
          </article>
        `;
      })
      .join("");
  }

  log("mounted");
});
