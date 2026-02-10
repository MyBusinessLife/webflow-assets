(() => {
  "use strict";

  if (window.__mblApplicationsShellLoaded) return;
  window.__mblApplicationsShellLoaded = true;

  const path = String(location.pathname || "");
  const match = path.match(/^\/(applications|application)(?=\/|$)/);
  const APP_ROOT_MATCH = match ? `/${match[1]}` : "";

  const isPublicRestaurantOrder = /^(\/applications|\/application)\/restaurant-order\/?$/.test(path);
  if (isPublicRestaurantOrder) return;

  const isAuthPage = /^(\/applications|\/application)\/(login|signup)\/?$/.test(path);
  if (isAuthPage) return;

  const isAppArea =
    Boolean(match) ||
    /^\/facturation(\/|$)/.test(path) ||
    /^\/crm(\/|$)/.test(path) ||
    /^\/settings\/?$/.test(path) ||
    /^\/subscriptions\/?$/.test(path);
  if (!isAppArea) return;

  if (document.documentElement.hasAttribute("data-no-shell")) return;
  if (document.querySelector("[data-no-shell]")) return;

  window.Webflow ||= [];
  window.Webflow.push(async function () {
    if (window.__mblApplicationsShellMounted) return;
    window.__mblApplicationsShellMounted = true;

    const url = new URL(location.href);
    const DEBUG = url.searchParams.get("mbl_debug") === "1" || location.hostname.includes("webflow.io");
    const log = (...a) => DEBUG && console.log("[MBL SHELL]", ...a);
    const warn = (...a) => DEBUG && console.warn("[MBL SHELL]", ...a);

    const CFG = window.__MBL_CFG__ || {};

    function sanitizePath(value) {
      const v = String(value || "").trim();
      if (!v) return "";
      if (v.startsWith("/") && !v.startsWith("//")) return v;
      try {
        const u = new URL(v, location.origin);
        if (u.origin === location.origin) return u.pathname + u.search + u.hash;
      } catch (_) {}
      return "";
    }

    function sanitizeLoginPath(value) {
      const v = sanitizePath(value);
      if (!v) return "";
      return /\/login\/?$/.test(v) ? v : "";
    }

    const INFERRED_APP_ROOT = String(CFG.APP_ROOT || localStorage.getItem("mbl-app-root") || APP_ROOT_MATCH || "/applications").trim() ||
      "/applications";

    const CONFIG = {
      SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
      SUPABASE_ANON_KEY:
        CFG.SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
      SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
      APP_ROOT: INFERRED_APP_ROOT,
      LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${INFERRED_APP_ROOT}/login`,
      SUBSCRIBE_PATH: sanitizePath(CFG.SUBSCRIBE_PATH) || "/subscriptions",
      // Default: show locked modules (the user asked for it). Set to "0" to hide locked items.
      SHOW_LOCKED: String(CFG.SHELL_SHOW_LOCKED ?? "1").trim() !== "0",
    };

    const BRAND_DEFAULTS = {
      theme_primary: String(CFG.THEME_PRIMARY || "").trim() || "#0ea5e9",
      theme_secondary: "#0c4a6e",
      theme_surface: "#f6fbff",
      theme_text: "#020617",
      theme_nav_bg: "#f1f5f9",
    };

    const FALLBACK_ROUTES = {
      // Admin
      "admin-dashboard": sanitizePath(CFG.ADMIN_DASH) || `${CONFIG.APP_ROOT}/admin/dashboard`,
      "admin-paiements": `${CONFIG.APP_ROOT}/admin/paiements`,
      "admin-crm": sanitizePath(CFG.CRM_PATH) || `${CONFIG.APP_ROOT}/crm/crm`,
      "admin-settings": `${CONFIG.APP_ROOT}/settings`,
      "admin-users": `${CONFIG.APP_ROOT}/settings?tab=users`,
      "admin-transport": `${CONFIG.APP_ROOT}/transport`,
      "admin-logistics": `${CONFIG.APP_ROOT}/logistics`,
      "admin-restaurant": `${CONFIG.APP_ROOT}/restaurant`,
      "admin-pos": `${CONFIG.APP_ROOT}/pos`,
      "admin-rental": `${CONFIG.APP_ROOT}/rental`,

      // Billing (Facturation)
      clients: `${CONFIG.APP_ROOT}/facturation/clients`,
      "devis-list": `${CONFIG.APP_ROOT}/facturation/devis-list`,
      devis: `${CONFIG.APP_ROOT}/facturation/devis-add`,
      "factures-list": `${CONFIG.APP_ROOT}/facturation/invoices-list`,
      facture: `${CONFIG.APP_ROOT}/facturation/invoice`,

      "admin-products": `${CONFIG.APP_ROOT}/admin/products`,
      "admin-categories": `${CONFIG.APP_ROOT}/admin/categories`,
      "admin-interventions": `${CONFIG.APP_ROOT}/admin/interventions`,

      // Technician
      "technician-dashboard": sanitizePath(CFG.TECH_DASH) || `${CONFIG.APP_ROOT}/technician/dashboard`,
      "technician-interventions": `${CONFIG.APP_ROOT}/technician/interventions`,
      "technician-interventions-list": `${CONFIG.APP_ROOT}/technician/interventions`,
      "technician-interventions-run": `${CONFIG.APP_ROOT}/technician/intervention-realisation`,
      "technician-profile": `${CONFIG.APP_ROOT}/technician/profile`,
      "technician-earn": `${CONFIG.APP_ROOT}/technician/earn`,
      "technician-planning": `${CONFIG.APP_ROOT}/technician/planning`,

      // Driver
      "driver-dashboard": `${CONFIG.APP_ROOT}/driver/dashboard`,

      // Shared
      subscriptions: CONFIG.SUBSCRIBE_PATH,
    };

    const ROUTES_OVERRIDE = CFG.ROUTES && typeof CFG.ROUTES === "object" ? CFG.ROUTES : null;

    function rememberCurrentRoute() {
      const page = String(document.documentElement.dataset.page || "").trim();
      if (!page) return;
      try {
        localStorage.setItem(`mbl-route:${page}`, location.pathname);
      } catch (_) {}
    }

    function routeFor(pageKey) {
      const key = String(pageKey || "").trim();
      if (!key) return "";

      // 1) Explicit override via window.__MBL_CFG__.ROUTES
      if (ROUTES_OVERRIDE && ROUTES_OVERRIDE[key]) {
        const v = sanitizePath(ROUTES_OVERRIDE[key]);
        if (v) return v;
      }

      // 2) Learned from localStorage (the first time you visit each page)
      try {
        const learned = sanitizePath(localStorage.getItem(`mbl-route:${key}`));
        if (learned) {
          // Defensive cleanup: older versions could "learn" routes wrongly prefixed with APP_ROOT
          // (ex: /applications/facturation/clients) even though the real Webflow folder is /facturation/*.
          const fallback = FALLBACK_ROUTES[key] || "";
          const normalize = (p) => String(p || "").replace(/\/+$/, "");
          const learnedNorm = normalize(learned);
          const fallbackNorm = normalize(fallback);
          const appRootNorm = normalize(CONFIG.APP_ROOT);
          const roots = new Set([appRootNorm, "/applications", "/application"]);

          let stale = false;
          if (fallbackNorm && fallbackNorm.startsWith("/") && appRootNorm && !fallbackNorm.startsWith(appRootNorm + "/")) {
            for (const r of roots) {
              if (!r) continue;
              if (learnedNorm === normalize(r + fallbackNorm)) {
                stale = true;
                break;
              }
            }
          }

          // Opposite case: fallback is under APP_ROOT but learned is the same route without APP_ROOT prefix.
          if (!stale && fallbackNorm && appRootNorm && fallbackNorm.startsWith(appRootNorm + "/")) {
            const without = normalize(fallbackNorm.slice(appRootNorm.length) || "/");
            if (without && learnedNorm === without) stale = true;
          }

          if (!stale) return learned;

          try {
            localStorage.removeItem(`mbl-route:${key}`);
          } catch (_) {}
        }
      } catch (_) {}

      // 3) Fallback map (requires your Webflow slugs to follow the standard)
      return FALLBACK_ROUTES[key] || "";
    }

    function resolveAssetsBase() {
      const fromCfg = String(CFG.ASSETS_BASE || CFG.assetsBase || "").trim();
      if (fromCfg) return fromCfg.endsWith("/") ? fromCfg : fromCfg + "/";

      try {
        const scripts = Array.from(document.scripts || []);
        const self = scripts.find((s) => {
          const src = String(s?.src || "");
          return src.includes("applications-shell.js") && src.includes("webflow-assets");
        });
        if (self?.src) return new URL(".", self.src).href;
      } catch (_) {}

      return "https://mybusinesslife.github.io/webflow-assets/";
    }

    function loadScriptOnce(id, src) {
      const cache = (window.__MBL_SCRIPT_LOADS__ = window.__MBL_SCRIPT_LOADS__ || {});
      if (cache[id]) return cache[id];

      cache[id] = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-mbl-lib="${id}"]`);
        if (existing) {
          if (existing.dataset.loaded === "1") return resolve();
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error(`Failed to load ${id}`)), { once: true });
          return;
        }

        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.dataset.mblLib = id;
        s.addEventListener(
          "load",
          () => {
            s.dataset.loaded = "1";
            resolve();
          },
          { once: true }
        );
        s.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(s);
      });

      return cache[id];
    }

    async function openSubscriptionsModal(opts = {}) {
      const source = String(opts?.source || "").trim();
      try {
        if (window.MBLSubscriptions && typeof window.MBLSubscriptions.open === "function") {
          return await window.MBLSubscriptions.open({ source });
        }
      } catch (_) {}

      const base = resolveAssetsBase();
      const src = base + "abonnement.js" + `?nocache=${Date.now()}`;
      try {
        await loadScriptOnce("abonnement", src);
      } catch (e) {
        warn("abonnement.js load failed", e);
        location.href = CONFIG.SUBSCRIBE_PATH;
        return;
      }

      try {
        if (window.MBLSubscriptions && typeof window.MBLSubscriptions.open === "function") {
          return await window.MBLSubscriptions.open({ source });
        }
      } catch (_) {}

      location.href = CONFIG.SUBSCRIBE_PATH;
    }

    window.MBL = window.MBL || {};
    if (typeof window.MBL.openSubscriptionsModal !== "function") window.MBL.openSubscriptionsModal = openSubscriptionsModal;

    function rewriteKnownBadLinks() {
      // Webflow buttons can keep stale slugs after refactors.
      // Fix them defensively so navigation stays consistent.
      const appRoot = String(CONFIG.APP_ROOT || "/applications").trim() || "/applications";
      const fixMap = new Map([
        // Old root-level slugs -> app folder slugs
        ["/settings", `${appRoot}/settings`],
        ["/crm", `${appRoot}/crm/crm`],
        ["/crm/crm", `${appRoot}/crm/crm`],
        ["/transport", `${appRoot}/transport`],
        ["/logistics", `${appRoot}/logistics`],
        ["/restaurant", `${appRoot}/restaurant`],
        ["/admin/restaurant", `${appRoot}/restaurant`],
        ["/pos", `${appRoot}/pos`],
        ["/admin/pos", `${appRoot}/pos`],
        ["/facturation/clients", `${appRoot}/facturation/clients`],
        ["/facturation/devis-list", `${appRoot}/facturation/devis-list`],
        ["/facturation/devis-add", `${appRoot}/facturation/devis-add`],
        ["/facturation/invoices-list", `${appRoot}/facturation/invoices-list`],
        ["/facturation/invoice", `${appRoot}/facturation/invoice`],
      ]);

      const normalizePath = (p) => String(p || "").trim().replace(/\/+$/, "") || "/";

      document.querySelectorAll("a[href]").forEach((a) => {
        const raw = String(a.getAttribute("href") || "").trim();
        if (!raw) return;
        if (raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("#")) return;

        try {
          const u = new URL(raw, location.origin);
          if (u.origin !== location.origin) return;
          const key = normalizePath(u.pathname);
          const fixed = fixMap.get(key);
          if (!fixed) return;
          a.setAttribute("href", fixed + u.search + u.hash);
        } catch (_) {}
      });
    }

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

      const m = s.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
      );
      if (m) return { r: clamp255(m[1]), g: clamp255(m[2]), b: clamp255(m[3]) };

      return null;
    }

    function rgbToHex(rgb) {
      if (!rgb) return "";
      const toHex = (n) => clamp255(n).toString(16).padStart(2, "0");
      return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }

    function normalizeColor(value, fallback = "") {
      const v = String(value || "").trim();
      if (!v) return fallback || "";
      const rgb = parseColorToRgb(v);
      if (!rgb) return fallback || "";
      return rgbToHex(rgb);
    }

    function sanitizeLogoUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        const u = new URL(raw, location.origin);
        if (!["http:", "https:"].includes(u.protocol)) return "";
        return u.toString();
      } catch (_) {
        return "";
      }
    }

    function applyBrandingThemeVars(branding) {
      const primary = normalizeColor(branding?.theme_primary, BRAND_DEFAULTS.theme_primary);
      const secondary = normalizeColor(branding?.theme_secondary, BRAND_DEFAULTS.theme_secondary);
      const surface = normalizeColor(branding?.theme_surface, BRAND_DEFAULTS.theme_surface);
      const text = normalizeColor(branding?.theme_text, BRAND_DEFAULTS.theme_text);
      const navBg = normalizeColor(branding?.theme_nav_bg, BRAND_DEFAULTS.theme_nav_bg);
      const rgb = parseColorToRgb(primary) || parseColorToRgb(BRAND_DEFAULTS.theme_primary);

      if (primary) document.documentElement.style.setProperty("--mbl-primary", primary);
      if (rgb) document.documentElement.style.setProperty("--mbl-primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      if (secondary) document.documentElement.style.setProperty("--mbl-secondary", secondary);
      if (surface) document.documentElement.style.setProperty("--mbl-surface", surface);
      if (text) document.documentElement.style.setProperty("--mbl-text", text);
      if (navBg) document.documentElement.style.setProperty("--mbl-shell-bg-custom", navBg);
    }

    function isMissingColumnError(err) {
      const msg = String(err?.message || "").toLowerCase();
      return msg.includes("does not exist") || msg.includes("column") || msg.includes("missing");
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
      if (document.getElementById("mbl-appshell-style")) return;
      ensurePrimaryRgbCssVar();
      const st = document.createElement("style");
      st.id = "mbl-appshell-style";
      st.textContent = `
        html[data-mbl-appshell="1"] {
          --mbl-shell-w: 282px;
          --mbl-shell-wc: 86px;
          --mbl-shell-radius: 18px;
          --mbl-shell-border: rgba(15, 23, 42, 0.12);
          --mbl-shell-text: var(--mbl-text, rgba(2, 6, 23, 0.90));
          --mbl-shell-muted: rgba(2, 6, 23, 0.60);
          --mbl-shell-bg: var(--mbl-shell-bg-custom, rgba(250, 252, 255, 0.92));
          --mbl-shell-surface: var(--mbl-surface, rgba(255,255,255,0.84));
          --mbl-shell-shadow: 0 28px 90px rgba(2, 6, 23, 0.14);
          --mbl-shell-shadow-sm: 0 10px 24px rgba(2, 6, 23, 0.12);
        }

        html[data-mbl-appshell="1"] body {
          padding-left: var(--mbl-shell-w);
          transition: padding-left 220ms ease;
          overflow-x: hidden;
        }

        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] body {
          padding-left: var(--mbl-shell-wc);
        }

        @media (max-width: 991px) {
          html[data-mbl-appshell="1"] body,
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] body {
            padding-left: 0 !important;
          }
        }

        .mbl-app-shell {
          position: fixed;
          inset: 0 auto 0 0;
          width: var(--mbl-shell-w);
          z-index: 2147483644;
          display: flex;
          flex-direction: column;
          padding: 14px 12px;
          color: var(--mbl-shell-text);
          background:
            radial-gradient(980px 520px at 30% 0%, rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14), transparent 52%),
            radial-gradient(900px 520px at 90% 10%, rgba(2, 6, 23, 0.10), transparent 58%),
            var(--mbl-shell-bg);
          border-right: 1px solid rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: width 220ms ease, transform 220ms ease;
        }

        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-app-shell {
          width: var(--mbl-shell-wc);
        }

        @media (max-width: 991px) {
          .mbl-app-shell {
            width: min(84vw, 332px);
            max-width: calc(100vw - 6px);
            height: 100dvh;
            padding:
              max(10px, env(safe-area-inset-top))
              10px
              max(10px, env(safe-area-inset-bottom));
            border-right: 1px solid rgba(15, 23, 42, 0.10);
            border-top-right-radius: 18px;
            border-bottom-right-radius: 18px;
            transform: translateX(-110%);
            box-shadow: var(--mbl-shell-shadow);
          }
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-app-shell {
            width: min(84vw, 332px);
          }
          html[data-mbl-appshell="1"][data-mbl-appshell-open="1"] .mbl-app-shell {
            transform: translateX(0);
          }

          /* On mobile, always render the full menu content even if desktop was collapsed. */
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-org__txt,
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__text,
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__badge,
          html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__label {
            display: initial;
          }
        }

        .mbl-app-shell__overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483643;
          background: rgba(2, 6, 23, 0.45);
          display: none;
        }
        html[data-mbl-appshell="1"][data-mbl-appshell-open="1"] .mbl-app-shell__overlay {
          display: block;
        }

        .mbl-app-shell__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 8px 12px;
          border-radius: var(--mbl-shell-radius);
          background: var(--mbl-shell-surface);
          border: 1px solid rgba(15, 23, 42, 0.10);
          box-shadow: 0 14px 28px rgba(2, 6, 23, 0.08);
        }
        @media (max-width: 991px) {
          .mbl-app-shell__top {
            position: sticky;
            top: 0;
            z-index: 2;
          }
        }

        .mbl-org {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .mbl-org__mark {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: white;
          font-weight: 950;
          letter-spacing: 0.01em;
          background: linear-gradient(180deg,
            rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.96),
            rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.66)
          );
          box-shadow: 0 14px 28px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.25);
          flex: 0 0 auto;
        }
        .mbl-org__mark.is-logo {
          padding: 0;
          background: #fff;
          box-shadow: 0 8px 20px rgba(2, 6, 23, 0.14);
          border: 1px solid rgba(15, 23, 42, 0.12);
          color: transparent;
        }
        .mbl-org__mark img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .mbl-org__txt { min-width: 0; }
        .mbl-org__name {
          font-size: 13px;
          font-weight: 950;
          line-height: 1.15;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mbl-org__meta {
          font-size: 12px;
          font-weight: 800;
          color: var(--mbl-shell-muted);
          margin: 3px 0 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-org__txt {
          display: none;
        }

        .mbl-app-shell__toggle {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: rgba(255,255,255,0.86);
          color: rgba(2, 6, 23, 0.82);
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
          flex: 0 0 auto;
        }
        .mbl-app-shell__toggle:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.30);
          box-shadow: var(--mbl-shell-shadow-sm);
        }
        .mbl-app-shell__toggle svg {
          transform: rotate(180deg);
          transition: transform 200ms ease;
        }
        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-app-shell__toggle svg {
          transform: rotate(0deg);
        }
        @media (max-width: 991px) {
          .mbl-app-shell__toggle {
            display: grid;
            width: 36px;
            height: 36px;
            border-radius: 12px;
          }
          .mbl-app-shell__toggle svg { transform: rotate(90deg); }
          html[data-mbl-appshell="1"][data-mbl-appshell-open="1"] .mbl-app-shell__toggle svg {
            transform: rotate(0deg);
          }
        }

        .mbl-app-shell__nav {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          gap: 10px;
          overflow: auto;
          padding: 6px 2px;
        }

        .mbl-nav__section { padding: 6px 6px 0; }
        .mbl-nav__label {
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(2, 6, 23, 0.42);
          margin: 10px 6px 8px;
        }

        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__label {
          display: none;
        }

        .mbl-nav__item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: rgba(255,255,255,0.78);
          color: rgba(2, 6, 23, 0.86);
          text-decoration: none;
          cursor: pointer;
          transition: transform 160ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
          position: relative;
          user-select: none;
        }

        .mbl-nav__item:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.28);
          box-shadow: 0 16px 38px rgba(2, 6, 23, 0.10);
          background: rgba(255,255,255,0.92);
        }

        .mbl-nav__item.is-active {
          border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.42);
          background: linear-gradient(
            180deg,
            rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.12),
            rgba(255,255,255,0.92)
          );
          box-shadow: 0 18px 44px rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.14);
        }

        .mbl-nav__item.is-locked {
          opacity: 0.62;
        }
        .mbl-nav__item.is-locked:hover {
          transform: none;
          box-shadow: none;
          border-color: rgba(239, 68, 68, 0.30);
          background: rgba(255,255,255,0.86);
        }
        .mbl-nav__item.is-locked .mbl-nav__badge {
          border-color: rgba(239, 68, 68, 0.30);
          background: rgba(254, 242, 242, 0.92);
          color: #991b1b;
        }

        .mbl-nav__left {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .mbl-nav__icon {
          width: 20px;
          height: 20px;
          color: rgba(2, 6, 23, 0.82);
          flex: 0 0 auto;
        }
        .mbl-nav__text {
          font-weight: 950;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__text {
          display: none;
        }

        .mbl-nav__badge {
          font-size: 11px;
          font-weight: 900;
          border-radius: 999px;
          padding: 4px 8px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: rgba(255,255,255,0.9);
          color: rgba(2, 6, 23, 0.60);
          flex: 0 0 auto;
        }
        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__badge { display: none; }

        .mbl-app-shell__bottom {
          margin-top: auto;
          padding: 10px 2px 0;
        }

        .mbl-app-shell__burger {
          position: fixed;
          z-index: 2147483645;
          left: max(10px, env(safe-area-inset-left));
          top: max(10px, env(safe-area-inset-top));
          width: 44px;
          height: 44px;
          border-radius: 16px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 18px 46px rgba(2, 6, 23, 0.16);
          display: none;
          place-items: center;
          cursor: pointer;
        }
        @media (max-width: 991px) {
          .mbl-app-shell__burger { display: grid; }
        }
        @media (max-width: 480px) {
          .mbl-app-shell {
            width: min(90vw, 320px) !important;
          }
          .mbl-app-shell__burger {
            width: 42px;
            height: 42px;
            border-radius: 14px;
          }
        }

        .mbl-tooltip {
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          background: rgba(2, 6, 23, 0.92);
          color: white;
          font-size: 12px;
          font-weight: 850;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 22px 60px rgba(0,0,0,0.28);
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 140ms ease;
        }
        html[data-mbl-appshell="1"][data-mbl-appshell-collapsed="1"] .mbl-nav__item:hover .mbl-tooltip { opacity: 1; }

        @media (prefers-reduced-motion: reduce) {
          html[data-mbl-appshell="1"] body,
          .mbl-app-shell,
          .mbl-nav__item,
          .mbl-app-shell__toggle { transition: none !important; }
        }
      `;
      document.head.appendChild(st);
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

    async function getSupabase() {
      if (window.__MBL_SUPABASE__) return window.__MBL_SUPABASE__;
      await ensureSupabaseJs();
      if (!window.supabase?.createClient) throw new Error("Supabase non charge.");
      const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: CONFIG.AUTH_STORAGE_KEY },
      });
      window.__MBL_SUPABASE__ = client;
      return client;
    }

    async function getCurrentUser(supabase) {
      const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      if (userErr) return sessionData?.session?.user || null;
      return userData?.user || sessionData?.session?.user || null;
    }

    async function resolveOrgMember(supabase, userId) {
      // Newer schemas include permissions_mode + permissions.
      const baseSel = "organization_id, role, is_default, created_at";
      const fullSel = baseSel + ", permissions_mode, permissions";
      let res = await supabase
        .from("organization_members")
        .select(fullSel)
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);

      if (res.error && String(res.error.message || "").toLowerCase().includes("does not exist")) {
        res = await supabase
          .from("organization_members")
          .select(baseSel)
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1);
      }

      if (res.error) return null;
      return res.data?.[0] || null;
    }

    async function getProfileRole(supabase, userId) {
      try {
        const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
        if (error) return "";
        return String(data?.role || "").trim().toLowerCase();
      } catch (_) {
        return "";
      }
    }

    function isActiveSubscription(sub) {
      const status = String(sub?.status || "");
      if (!["trialing", "active", "past_due"].includes(status)) return false;
      const now = Date.now();
      const ends = sub?.ends_at ? Date.parse(sub.ends_at) : null;
      if (ends && Number.isFinite(ends) && ends <= now) return false;
      if (status === "trialing" && sub?.trial_ends_at) {
        const trialEnds = Date.parse(sub.trial_ends_at);
        if (Number.isFinite(trialEnds) && trialEnds <= now) return false;
      }
      return true;
    }

    function pickInitials(name) {
      const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const a = parts[0]?.[0] || "M";
      const b = parts[1]?.[0] || parts[0]?.[1] || "B";
      return (a + b).toUpperCase();
    }

    function renderOrgMark(markEl, orgName, logoUrl) {
      if (!markEl) return;
      const safeLogo = sanitizeLogoUrl(logoUrl);
      if (safeLogo) {
        markEl.classList.add("is-logo");
        markEl.innerHTML = `<img src="${escapeHTML(safeLogo)}" alt="${escapeHTML(orgName || "Logo")}" loading="lazy" decoding="async" />`;
        return;
      }
      markEl.classList.remove("is-logo");
      markEl.textContent = pickInitials(orgName);
    }

    async function loadOrgProfile(supabase, orgId) {
      if (!orgId) return null;

      const baseSel = "trade_name, legal_name";
      const fullSel = `${baseSel}, brand_logo_url, theme_primary, theme_secondary, theme_surface, theme_text, theme_nav_bg`;

      let res = await supabase.from("organization_profiles").select(fullSel).eq("organization_id", orgId).maybeSingle();

      if (res.error && isMissingColumnError(res.error)) {
        res = await supabase.from("organization_profiles").select(baseSel).eq("organization_id", orgId).maybeSingle();
      }

      if (res.error) {
        warn("organization_profiles load failed", res.error);
        return null;
      }
      return res.data || null;
    }

    const ICONS = {
      dashboard: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v9H3z"/><path d="M14 3h7v5h-7z"/><path d="M14 10h7v11h-7z"/><path d="M3 14h7v7H3z"/></svg>`,
      crm: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v6H4z"/><path d="M4 14h10v6H4z"/><path d="M18 14h2v6h-2z"/><path d="M8 10v4"/></svg>`,
      clients: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      quotes: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`,
      invoices: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>`,
      products: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>`,
      logistics: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-6 9 6v12H3V9z"/><path d="M9 22V12h6v10"/><path d="M9 12h6"/></svg>`,
      restaurant: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v8"/><path d="M10 2v8"/><path d="M8 2v20"/><path d="M14 2v8a2 2 0 0 0 2 2h2V2"/></svg>`,
      pos: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10"/><path d="M7 12h6"/><path d="M15 15h2"/></svg>`,
      interventions: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a2.1 2.1 0 0 0-3-3z"/><path d="M19 8l-7.5 7.5a2 2 0 0 1-1.2.6l-3.8.5.5-3.8a2 2 0 0 1 .6-1.2L15 4"/></svg>`,
      calendar: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
      rental: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M4 11h16"/><path d="M6 21v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/><path d="M8 21v-2"/><path d="M16 21v-2"/></svg>`,
      truck: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><path d="M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`,
      settings: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
      card: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
      logout: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
      menu: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`,
      chevron: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    };

    function buildShellDOM() {
      if (document.querySelector(".mbl-app-shell")) return null;
      document.documentElement.setAttribute("data-mbl-appshell", "1");

      const overlay = document.createElement("div");
      overlay.className = "mbl-app-shell__overlay";
      overlay.setAttribute("data-shell-overlay", "1");

      const aside = document.createElement("aside");
      aside.className = "mbl-app-shell";
      aside.setAttribute("aria-label", "Menu");
      aside.innerHTML = `
        <div class="mbl-app-shell__top">
          <div class="mbl-org">
            <div class="mbl-org__mark" data-org-mark>MB</div>
            <div class="mbl-org__txt">
              <p class="mbl-org__name" data-org-name>Applications</p>
              <p class="mbl-org__meta" data-org-meta></p>
            </div>
          </div>
          <button type="button" class="mbl-app-shell__toggle" data-shell-toggle aria-label="Réduire le menu">
            ${ICONS.chevron}
          </button>
        </div>

        <nav class="mbl-app-shell__nav" data-shell-nav></nav>

        <div class="mbl-app-shell__bottom" data-shell-bottom></div>
      `;

      const burger = document.createElement("button");
      burger.type = "button";
      burger.className = "mbl-app-shell__burger";
      burger.setAttribute("data-shell-burger", "1");
      burger.setAttribute("aria-label", "Ouvrir le menu");
      burger.innerHTML = ICONS.menu;

      document.body.appendChild(overlay);
      document.body.appendChild(aside);
      document.body.appendChild(burger);

      return { overlay, aside, burger };
    }

    function loadCollapsedPref() {
      try {
        return localStorage.getItem("mbl-shell-collapsed") === "1";
      } catch (_) {
        return false;
      }
    }

    function setCollapsed(collapsed) {
      const v = collapsed ? "1" : "0";
      if (collapsed) document.documentElement.setAttribute("data-mbl-appshell-collapsed", "1");
      else document.documentElement.removeAttribute("data-mbl-appshell-collapsed");
      try {
        localStorage.setItem("mbl-shell-collapsed", v);
      } catch (_) {}
    }

    function openMobile(open) {
      if (open) document.documentElement.setAttribute("data-mbl-appshell-open", "1");
      else document.documentElement.removeAttribute("data-mbl-appshell-open");
    }

    function itemTemplate({ href, label, icon, badge, active, locked }) {
      const a = document.createElement(href ? "a" : "button");
      a.className = "mbl-nav__item" + (active ? " is-active" : "") + (locked ? " is-locked" : "");
      if (href) {
        a.href = href;
      } else {
        a.type = "button";
      }
      if (locked) a.setAttribute("aria-disabled", "true");

      a.innerHTML = `
        <span class="mbl-nav__left">
          ${icon || ""}
          <span class="mbl-nav__text">${escapeHTML(label)}</span>
        </span>
        ${badge ? `<span class="mbl-nav__badge">${escapeHTML(badge)}</span>` : ""}
        <span class="mbl-tooltip">${escapeHTML(label)}</span>
      `;
      return a;
    }

    function modulesAllow(mods, required, requiredAny) {
      const req = Array.isArray(required) ? required.filter(Boolean) : [];
      const any = Array.isArray(requiredAny) ? requiredAny.filter(Boolean) : [];
      const allOk = !req.length || req.every((m) => Boolean(mods?.[m]));
      const anyOk = !any.length || any.some((m) => Boolean(mods?.[m]));
      return allOk && anyOk;
    }

    // =========================================================
    // Per-member permissions
    // - Stored in organization_members.permissions + permissions_mode ('inherit'|'custom')
    // - Effective access also depends on the active subscription modules (checked separately).
    // =========================================================

    const PERMS = {
      admin_dashboard: "admin_dashboard",
      settings: "settings",

      billing_clients: "billing_clients",
      billing_quotes: "billing_quotes",
      billing_invoices: "billing_invoices",
      billing_payments: "billing_payments",

      inventory_products: "inventory_products",
      inventory_categories: "inventory_categories",

      crm: "crm",
      restaurant_admin: "restaurant_admin",
      pos: "pos",
      rental_admin: "rental_admin",

      interventions_admin: "interventions_admin",
      interventions_tech: "interventions_tech",

      fleet: "fleet",
      logistics: "logistics",

      transport_driver: "transport_driver",
    };

    function normalizePermissions(raw) {
      const mode = String(raw?.permissions_mode || "inherit").trim().toLowerCase();
      const permissions = raw?.permissions && typeof raw.permissions === "object" ? raw.permissions : {};
      return { mode: mode === "custom" ? "custom" : "inherit", permissions };
    }

    function isRestaurantEmployeeRole(role) {
      const r = String(role || "").trim().toLowerCase();
      return ["restaurant_employee", "restaurant_staff", "resto_employee", "cashier"].includes(r);
    }

    function permissionAllow({ isAdmin, orgRole, permMode, permMap }, permKey) {
      const key = String(permKey || "").trim();
      if (!key) return true;
      if (isAdmin) return true;

      if (permMode === "custom") return permMap?.[key] === true;

      // Inherit defaults: keep it strict.
      // - tech => interventions only
      // - driver => transport driver only
      // - restaurant_employee => POS only
      // - others => no access by default (admin can enable via "custom")
      if (orgRole === "tech") return key === PERMS.interventions_tech;
      if (orgRole === "driver") return key === PERMS.transport_driver;
      if (isRestaurantEmployeeRole(orgRole)) return key === PERMS.pos;
      return false;
    }

    function cleanPath(value) {
      const v = sanitizePath(value) || "";
      const pathOnly = String(v).split("?")[0].split("#")[0];
      return pathOnly.replace(/\/+$/, "") || "/";
    }

    const CURRENT_PATH = cleanPath(location.pathname);
    const CURRENT_TAB = String(new URLSearchParams(location.search).get("tab") || "").trim().toLowerCase();
    const IS_SETTINGS_USERS_TAB = CURRENT_TAB === "users" && /\/settings\/?$/.test(CURRENT_PATH);

    function buildNav({ isAdmin, isTech, isDriver, orgRole, permMode, permMap, modules, activePage }) {
      if (isRestaurantEmployeeRole(orgRole)) {
        const posItem = {
          key: "admin-pos",
          label: "POS",
          href: routeFor("admin-pos"),
          icon: ICONS.pos,
          perm: PERMS.pos,
          requiresAny: ["billing", "restaurant"],
          active: String(activePage || "").trim() === "admin-pos" || cleanPath(routeFor("admin-pos")) === CURRENT_PATH,
        };
        const modOk = modulesAllow(modules, [], posItem.requiresAny);
        const permOk = permissionAllow({ isAdmin, orgRole, permMode, permMap }, posItem.perm);
        const lockKind = !modOk ? "subscription" : !permOk ? "permission" : "";
        const locked = Boolean(lockKind);
        return [
          {
            section: "Service",
            entries: [{ ...posItem, visible: true, locked, lockKind }],
          },
        ];
      }

      const items = [
        {
          section: "Général",
          entries: [
            {
              key: "admin-dashboard",
              label: "Dashboard",
              href: isTech && !isAdmin ? routeFor("technician-dashboard") : routeFor("admin-dashboard"),
              icon: ICONS.dashboard,
              perm: isDriver && !isAdmin ? PERMS.transport_driver : isTech && !isAdmin ? PERMS.interventions_tech : PERMS.admin_dashboard,
              roles: [],
              requires: [],
            },
            {
              key: "admin-crm",
              label: "CRM",
              href: routeFor("admin-crm"),
              icon: ICONS.crm,
              perm: PERMS.crm,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "admin-users",
              label: "Utilisateurs",
              href: routeFor("admin-users"),
              icon: ICONS.clients,
              perm: PERMS.settings,
              roles: [],
              requires: [],
            },
          ],
        },
        {
          section: "Facturation",
          entries: [
            {
              key: "clients",
              label: "Clients",
              href: routeFor("clients"),
              icon: ICONS.clients,
              perm: PERMS.billing_clients,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "devis-list",
              label: "Devis",
              href: routeFor("devis-list"),
              icon: ICONS.quotes,
              perm: PERMS.billing_quotes,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "factures-list",
              label: "Factures",
              href: routeFor("factures-list"),
              icon: ICONS.invoices,
              perm: PERMS.billing_invoices,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "admin-paiements",
              label: "Paiements",
              href: routeFor("admin-paiements"),
              icon: ICONS.card,
              perm: PERMS.billing_payments,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "admin-pos",
              label: "POS",
              href: routeFor("admin-pos"),
              icon: ICONS.pos,
              perm: PERMS.pos,
              roles: [],
              requiresAny: ["billing", "restaurant"],
            },
            {
              key: "admin-products",
              label: "Produits",
              href: routeFor("admin-products"),
              icon: ICONS.products,
              perm: PERMS.inventory_products,
              roles: [],
              requires: ["billing"],
            },
            {
              key: "admin-categories",
              label: "Catégories",
              href: routeFor("admin-categories"),
              icon: ICONS.products,
              perm: PERMS.inventory_categories,
              roles: [],
              requires: ["billing"],
            },
          ],
        },
        {
          section: "Restauration",
          entries: [
            {
              key: "admin-restaurant",
              label: "Restaurant",
              href: routeFor("admin-restaurant"),
              icon: ICONS.restaurant,
              perm: PERMS.restaurant_admin,
              roles: [],
              requires: ["restaurant"],
            },
          ],
        },
        {
          section: "Hôtellerie",
          entries: [
            {
              key: "admin-rental",
              label: "Locations",
              href: routeFor("admin-rental"),
              icon: ICONS.rental,
              perm: PERMS.rental_admin,
              roles: [],
              requires: ["rental"],
            },
          ],
        },
        {
          section: "Interventions",
          entries: [
            {
              key: "admin-interventions",
              label: "Gestion interventions",
              href: routeFor("admin-interventions"),
              icon: ICONS.interventions,
              perm: PERMS.interventions_admin,
              roles: [],
              requires: ["interventions"],
            },
            {
              key: "technician-interventions",
              label: "Mes interventions",
              href: routeFor("technician-interventions"),
              icon: ICONS.interventions,
              perm: PERMS.interventions_tech,
              roles: [],
              requires: ["interventions"],
            },
            {
              key: "technician-dashboard",
              label: "Espace technicien",
              href: routeFor("technician-dashboard"),
              icon: ICONS.interventions,
              perm: PERMS.interventions_tech,
              roles: [],
              requires: ["interventions"],
            },
            {
              key: "technician-earn",
              label: "Gains",
              href: routeFor("technician-earn"),
              icon: ICONS.card,
              perm: PERMS.interventions_tech,
              roles: [],
              requires: ["interventions"],
            },
            {
              key: "technician-profile",
              label: "Mon profil",
              href: routeFor("technician-profile"),
              icon: ICONS.settings,
              perm: PERMS.interventions_tech,
              roles: [],
              requires: ["interventions"],
            },
            {
              key: "technician-planning",
              label: "Planning",
              href: routeFor("technician-planning"),
              icon: ICONS.calendar,
              perm: PERMS.interventions_tech,
              roles: [],
              requires: ["interventions"],
            },
          ],
        },
        {
          section: "Logistique",
          entries: [
            {
              key: "admin-logistics",
              label: "Logistique",
              href: routeFor("admin-logistics"),
              icon: ICONS.logistics,
              perm: PERMS.logistics,
              roles: [],
              requires: ["logistics"],
            },
          ],
        },
        {
          section: "Transport",
          entries: [
            {
              key: "admin-transport",
              // Fleet (vehicles/drivers) is available for all plans except Starter.
              // Transport (tours/courses/tarifs) remains a separate module; the page adapts its tabs accordingly.
              label: modules && typeof modules === "object" && modules.transport ? "Transport" : "Véhicules",
              href: routeFor("admin-transport"),
              icon: ICONS.truck,
              perm: PERMS.fleet,
              roles: [],
              requires: ["fleet"],
            },
          ],
        },
        {
          section: "Chauffeur",
          entries: [
            {
              key: "driver-dashboard",
              label: "Mes tournées",
              href: routeFor("driver-dashboard"),
              icon: ICONS.truck,
              perm: PERMS.transport_driver,
              roles: [],
              requires: ["transport"],
            },
          ],
        },
      ];

      // Filter by role and modules.
      const allowedItems = items
        .map((sec) => {
          const entries = sec.entries
            .map((it) => {
              const roleOk =
                !it.roles?.length ||
                (it.roles.includes("admin") && isAdmin) ||
                (it.roles.includes("tech") && isTech) ||
                (it.roles.includes("driver") && isDriver);

              const modOk = modulesAllow(modules, it.requires, it.requiresAny);
              const permOk = permissionAllow({ isAdmin, orgRole, permMode, permMap }, it.perm);

              const lockKind = roleOk && !modOk ? "subscription" : roleOk && modOk && !permOk ? "permission" : "";
              const locked = Boolean(lockKind);
              const visible = roleOk && (!locked || CONFIG.SHOW_LOCKED);
              return { ...it, visible, locked, lockKind };
            })
            .filter((it) => it.visible);
          return { ...sec, entries };
        })
        .filter((sec) => sec.entries.length);

      // Active marker by data-page when possible.
      allowedItems.forEach((sec) => {
        sec.entries.forEach((it) => {
          it.active =
            String(activePage || "").trim() === it.key ||
            (it.key === "admin-users"
              ? IS_SETTINGS_USERS_TAB
              : it.href
              ? cleanPath(it.href) === CURRENT_PATH
              : false);
        });
      });

      return allowedItems;
    }

    function renderNav(navEl, nav) {
      navEl.innerHTML = "";
      nav.forEach((sec) => {
        const wrap = document.createElement("div");
        wrap.className = "mbl-nav__section";
        wrap.innerHTML = `<div class="mbl-nav__label">${escapeHTML(sec.section)}</div>`;
        sec.entries.forEach((it) => {
          const badge = it.lockKind === "subscription" ? "Verrouillé" : it.lockKind === "permission" ? "Accès" : "";
          const node = itemTemplate({
            href: it.locked ? "" : it.href,
            label: it.label,
            icon: it.icon,
            badge,
            active: it.active,
            locked: it.locked,
          });
          if (it.locked) {
            node.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (it.lockKind === "permission") {
                alert("Accès restreint. Demande à un administrateur de t'accorder l'accès à ce module.");
              } else {
                openSubscriptionsModal({ source: `locked:${it.key}` });
              }
              openMobile(false);
            });
          }
          wrap.appendChild(node);
        });
        navEl.appendChild(wrap);
      });
    }

    function renderBottom(bottomEl, { isAdmin, isTech, isRestaurantEmployee, planName, isLogged }) {
      bottomEl.innerHTML = "";

      if (isAdmin) {
        bottomEl.appendChild(
          itemTemplate({
            href: routeFor("admin-settings"),
            label: "Paramètres",
            icon: ICONS.settings,
            badge: "",
            active: cleanPath(routeFor("admin-settings")) === CURRENT_PATH,
            locked: false,
          })
        );
      }

      if (!isRestaurantEmployee) {
        const subItem = itemTemplate({
          href: CONFIG.SUBSCRIBE_PATH,
          label: "Abonnement",
          icon: ICONS.card,
          badge: planName ? String(planName) : "",
          active: cleanPath(CONFIG.SUBSCRIBE_PATH) === CURRENT_PATH,
          locked: false,
        });
        if (isLogged) {
          subItem.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSubscriptionsModal({ source: "menu" });
            openMobile(false);
          });
        }
        bottomEl.appendChild(subItem);
      }

      const logoutBtn = itemTemplate({
        href: "",
        label: "Déconnexion",
        icon: ICONS.logout,
        badge: "",
        active: false,
        locked: false,
      });
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = document.querySelector(".btnLogout, #btnLogout, a.btnLogout");
        if (btn) btn.click();
        else {
          // Backstop logout if page doesn't have a logout button.
          try {
            window.__MBL_SUPABASE__?.auth?.signOut?.({ scope: "global" });
          } catch (_) {}
          try {
            localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
          } catch (_) {}
          location.href = CONFIG.LOGIN_PATH + "?logout=1";
        }
      });
      bottomEl.appendChild(logoutBtn);

      // On mobile, close the drawer on navigation.
      bottomEl.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", () => openMobile(false));
      });
    }

    function wireInteractions(dom) {
      const overlay = dom.overlay;
      const toggle = dom.aside.querySelector("[data-shell-toggle]");

      dom.burger.addEventListener("click", () => openMobile(true));
      overlay.addEventListener("click", () => openMobile(false));

      toggle?.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 991px)").matches) {
          openMobile(false);
          return;
        }
        const collapsed = document.documentElement.hasAttribute("data-mbl-appshell-collapsed");
        setCollapsed(!collapsed);
      });

      // Close drawer on escape (mobile).
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        openMobile(false);
      });

      // Close drawer when navigating (mobile).
      dom.aside.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", () => openMobile(false));
      });
    }

    // ==== boot ====
    rememberCurrentRoute();
    applyBrandingThemeVars({});
    injectStyles();
    rewriteKnownBadLinks();

    const dom = buildShellDOM();
    if (!dom) return;
    wireInteractions(dom);

    setCollapsed(loadCollapsedPref());

    const navEl = dom.aside.querySelector("[data-shell-nav]");
    const bottomEl = dom.aside.querySelector("[data-shell-bottom]");

    // Minimal skeleton while loading
    navEl.innerHTML = `
      <div class="mbl-nav__section">
        <div class="mbl-nav__label">Chargement</div>
        <div class="mbl-nav__item" style="opacity:.65; cursor: default;">
          <span class="mbl-nav__left">${ICONS.dashboard}<span class="mbl-nav__text">Chargement…</span></span>
        </div>
      </div>
    `;

    try {
      const supabase = await getSupabase();
      const user = await getCurrentUser(supabase);
      if (!user) {
        // Not logged; keep shell minimal and offer login link.
        const activePage = String(document.documentElement.dataset.page || "").trim();
        const nav = [
          {
            section: "Compte",
            entries: [
              { key: "login", label: "Connexion", href: CONFIG.LOGIN_PATH, icon: ICONS.settings, requires: [], roles: [], active: activePage === "login" },
            ],
          },
        ];
        renderNav(navEl, nav);
        renderBottom(bottomEl, { isAdmin: false, isTech: false, isRestaurantEmployee: false, planName: "", isLogged: false });
        return;
      }

      const member = await resolveOrgMember(supabase, user.id);
      const orgId = member?.organization_id ? String(member.organization_id) : "";
      const orgRole = String(member?.role || "").trim().toLowerCase();
      const profileRole = await getProfileRole(supabase, user.id);

      const isAdmin = ["owner", "admin", "manager"].includes(orgRole) || profileRole === "admin";
      const isTech = orgRole === "tech" || profileRole === "tech";
      const isDriver = orgRole === "driver" || profileRole === "driver";
      const isRestaurantEmployee = isRestaurantEmployeeRole(orgRole) || isRestaurantEmployeeRole(profileRole);
      const permState = normalizePermissions(member);
      const accessRole = isAdmin ? "admin" : isTech ? "tech" : isDriver ? "driver" : isRestaurantEmployee ? "restaurant_employee" : orgRole;

      // Resolve org name + branding + plan/modules
      const [orgRes, orgProfile, entRes, subRes] = await Promise.all([
        orgId ? supabase.from("organizations").select("id, name, slug").eq("id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        loadOrgProfile(supabase, orgId),
        orgId ? supabase.from("organization_entitlements").select("modules, limits").eq("organization_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId
          ? supabase
              .from("organization_subscriptions")
              .select("status, ends_at, trial_ends_at, plan:plan_id(code, name, modules)")
              .eq("organization_id", orgId)
              .order("starts_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const orgName =
        String(orgProfile?.trade_name || orgProfile?.legal_name || orgRes?.data?.name || "Applications").trim() || "Applications";
      const planName = String(subRes?.data?.plan?.name || "").trim();
      const planMods = subRes?.data?.plan?.modules && typeof subRes.data.plan.modules === "object" ? subRes.data.plan.modules : {};
      const entMods = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
      const modules = { ...planMods, ...entMods };

      // Put org context in UI
      applyBrandingThemeVars(orgProfile || {});
      renderOrgMark(dom.aside.querySelector("[data-org-mark]"), orgName, orgProfile?.brand_logo_url);
      dom.aside.querySelector("[data-org-name]").textContent = orgName;

      const sub = subRes?.data || null;
      const subActive = isActiveSubscription(sub);
      const metaBits = [];
      if (planName) metaBits.push(planName);
      if (!subActive) metaBits.push("Abonnement requis");
      dom.aside.querySelector("[data-org-meta]").textContent = metaBits.join(" • ");

      const activePage = String(document.documentElement.dataset.page || "").trim();
      const nav = buildNav({
        isAdmin,
        isTech,
        isDriver,
        orgRole: accessRole,
        permMode: permState.mode,
        permMap: permState.permissions,
        modules: subActive ? modules : {},
        activePage,
      });
      renderNav(navEl, nav);
      renderBottom(bottomEl, { isAdmin, isTech, isRestaurantEmployee, planName, isLogged: true });
    } catch (e) {
      warn("boot error", e);
      // Still show something usable
      navEl.innerHTML = "";
      const sec = document.createElement("div");
      sec.className = "mbl-nav__section";
      sec.innerHTML = `<div class="mbl-nav__label">Menu</div>`;
      sec.appendChild(itemTemplate({ href: CONFIG.SUBSCRIBE_PATH, label: "Abonnement", icon: ICONS.card, badge: "", active: false }));
      sec.appendChild(itemTemplate({ href: CONFIG.LOGIN_PATH, label: "Connexion", icon: ICONS.settings, badge: "", active: false }));
      navEl.appendChild(sec);
      renderBottom(bottomEl, { isAdmin: false, isTech: false, isRestaurantEmployee: false, planName: "", isLogged: false });
    }

    log("mounted");
  });
})();
