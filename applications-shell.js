(() => {
  "use strict";

  if (window.__mblApplicationsShellLoaded) return;
  window.__mblApplicationsShellLoaded = true;

  const path = String(location.pathname || "");
  const match = path.match(/^\/(applications|application)(?=\/|$)/);
  if (!match) return;

  const APP_ROOT = `/${match[1]}`;
  const isLogin = new RegExp(`^\\/${match[1]}\\/login\\/?$`).test(path);
  const isSignup = new RegExp(`^\\/${match[1]}\\/signup\\/?$`).test(path);
  if (isLogin || isSignup) return;

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

    const CONFIG = {
      SUPABASE_URL: CFG.SUPABASE_URL || "https://jrjdhdechcdlygpgaoes.supabase.co",
      SUPABASE_ANON_KEY:
        CFG.SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyamRoZGVjaGNkbHlncGdhb2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzczMzQsImV4cCI6MjA4MzM1MzMzNH0.E13XKKpIjB1auVtTmgBgV7jxmvS-EOv52t0mT1neKXE",
      SUPABASE_CDN: CFG.SUPABASE_CDN || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      AUTH_STORAGE_KEY: CFG.AUTH_STORAGE_KEY || "mbl-extranet-auth",
      APP_ROOT: String(CFG.APP_ROOT || APP_ROOT).trim() || APP_ROOT,
      LOGIN_PATH: sanitizeLoginPath(CFG.LOGIN_PATH) || `${APP_ROOT}/login`,
      SUBSCRIBE_PATH: sanitizePath(CFG.SUBSCRIBE_PATH) || "/subscriptions",
      SHOW_LOCKED: String(CFG.SHELL_SHOW_LOCKED || "").trim() === "1",
    };

    const FALLBACK_ROUTES = {
      // Admin
      "admin-dashboard": sanitizePath(CFG.ADMIN_DASH) || `${CONFIG.APP_ROOT}/admin/dashboard`,
      "admin-crm": `${CONFIG.APP_ROOT}/admin/crm`,
      "admin-settings": `${CONFIG.APP_ROOT}/admin/settings`,
      clients: `${CONFIG.APP_ROOT}/admin/clients`,
      "devis-list": `${CONFIG.APP_ROOT}/admin/devis`,
      devis: `${CONFIG.APP_ROOT}/admin/devis-add`,
      "factures-list": `${CONFIG.APP_ROOT}/admin/invoices`,
      facture: `${CONFIG.APP_ROOT}/admin/invoice`,
      "admin-products": `${CONFIG.APP_ROOT}/admin/products`,
      "admin-categories": `${CONFIG.APP_ROOT}/admin/categories`,
      "admin-interventions": `${CONFIG.APP_ROOT}/admin/interventions`,

      // Technician
      "technician-dashboard": sanitizePath(CFG.TECH_DASH) || `${CONFIG.APP_ROOT}/technician/dashboard`,
      "technician-interventions": `${CONFIG.APP_ROOT}/technician/interventions`,
      "technician-interventions-list": `${CONFIG.APP_ROOT}/technician/interventions`,
      "technician-interventions-run": `${CONFIG.APP_ROOT}/technician/intervention`,
      "technician-profile": `${CONFIG.APP_ROOT}/technician/profile`,

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
        if (learned) return learned;
      } catch (_) {}

      // 3) Fallback map (requires your Webflow slugs to follow the standard)
      return FALLBACK_ROUTES[key] || "";
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
      if (document.getElementById("mbl-shell-style")) return;
      ensurePrimaryRgbCssVar();
      const st = document.createElement("style");
      st.id = "mbl-shell-style";
      st.textContent = `
        html[data-mbl-shell="1"] {
          --mbl-shell-w: 282px;
          --mbl-shell-wc: 86px;
          --mbl-shell-radius: 18px;
          --mbl-shell-border: rgba(15, 23, 42, 0.12);
          --mbl-shell-text: rgba(2, 6, 23, 0.90);
          --mbl-shell-muted: rgba(2, 6, 23, 0.60);
          --mbl-shell-bg: rgba(250, 252, 255, 0.92);
          --mbl-shell-shadow: 0 28px 90px rgba(2, 6, 23, 0.14);
          --mbl-shell-shadow-sm: 0 10px 24px rgba(2, 6, 23, 0.12);
        }

        html[data-mbl-shell="1"] body {
          padding-left: var(--mbl-shell-w);
          transition: padding-left 220ms ease;
        }

        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] body {
          padding-left: var(--mbl-shell-wc);
        }

        @media (max-width: 991px) {
          html[data-mbl-shell="1"] body,
          html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] body {
            padding-left: 0 !important;
          }
        }

        .mbl-shell {
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
            rgba(246, 251, 255, 0.92);
          border-right: 1px solid rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: width 220ms ease, transform 220ms ease;
        }

        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-shell {
          width: var(--mbl-shell-wc);
        }

        @media (max-width: 991px) {
          .mbl-shell {
            transform: translateX(-110%);
            box-shadow: var(--mbl-shell-shadow);
            border-right: 1px solid rgba(15, 23, 42, 0.10);
          }
          html[data-mbl-shell="1"][data-mbl-shell-open="1"] .mbl-shell {
            transform: translateX(0);
          }
        }

        .mbl-shell__overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483643;
          background: rgba(2, 6, 23, 0.45);
          display: none;
        }
        html[data-mbl-shell="1"][data-mbl-shell-open="1"] .mbl-shell__overlay {
          display: block;
        }

        .mbl-shell__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 8px 12px;
          border-radius: var(--mbl-shell-radius);
          background: rgba(255,255,255,0.82);
          border: 1px solid rgba(15, 23, 42, 0.10);
          box-shadow: 0 14px 28px rgba(2, 6, 23, 0.08);
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

        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-org__txt {
          display: none;
        }

        .mbl-shell__toggle {
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
        .mbl-shell__toggle:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--mbl-primary-rgb, 14, 165, 233), 0.30);
          box-shadow: var(--mbl-shell-shadow-sm);
        }
        @media (max-width: 991px) {
          .mbl-shell__toggle { display: none; }
        }

        .mbl-shell__nav {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
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

        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-nav__label {
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

        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-nav__text {
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
        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-nav__badge { display: none; }

        .mbl-shell__bottom {
          margin-top: auto;
          padding: 10px 2px 0;
        }

        .mbl-shell__burger {
          position: fixed;
          z-index: 2147483645;
          left: 12px;
          top: 12px;
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
          .mbl-shell__burger { display: grid; }
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
        html[data-mbl-shell="1"][data-mbl-shell-collapsed="1"] .mbl-nav__item:hover .mbl-tooltip { opacity: 1; }

        @media (prefers-reduced-motion: reduce) {
          html[data-mbl-shell="1"] body,
          .mbl-shell,
          .mbl-nav__item,
          .mbl-shell__toggle { transition: none !important; }
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
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, is_default, created_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) return null;
      return data?.[0] || null;
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

    const ICONS = {
      dashboard: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v9H3z"/><path d="M14 3h7v5h-7z"/><path d="M14 10h7v11h-7z"/><path d="M3 14h7v7H3z"/></svg>`,
      crm: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v6H4z"/><path d="M4 14h10v6H4z"/><path d="M18 14h2v6h-2z"/><path d="M8 10v4"/></svg>`,
      clients: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      quotes: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`,
      invoices: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>`,
      products: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>`,
      interventions: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a2.1 2.1 0 0 0-3-3z"/><path d="M19 8l-7.5 7.5a2 2 0 0 1-1.2.6l-3.8.5.5-3.8a2 2 0 0 1 .6-1.2L15 4"/></svg>`,
      settings: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
      card: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`,
      logout: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
      menu: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`,
      chevron: `<svg class="mbl-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    };

    function buildShellDOM() {
      if (document.querySelector(".mbl-shell")) return null;
      document.documentElement.setAttribute("data-mbl-shell", "1");

      const overlay = document.createElement("div");
      overlay.className = "mbl-shell__overlay";
      overlay.setAttribute("data-shell-overlay", "1");

      const aside = document.createElement("aside");
      aside.className = "mbl-shell";
      aside.setAttribute("aria-label", "Menu");
      aside.innerHTML = `
        <div class="mbl-shell__top">
          <div class="mbl-org">
            <div class="mbl-org__mark" data-org-mark>MB</div>
            <div class="mbl-org__txt">
              <p class="mbl-org__name" data-org-name>Applications</p>
              <p class="mbl-org__meta" data-org-meta></p>
            </div>
          </div>
          <button type="button" class="mbl-shell__toggle" data-shell-toggle aria-label="Réduire le menu">
            ${ICONS.chevron}
          </button>
        </div>

        <nav class="mbl-shell__nav" data-shell-nav></nav>

        <div class="mbl-shell__bottom" data-shell-bottom></div>
      `;

      const burger = document.createElement("button");
      burger.type = "button";
      burger.className = "mbl-shell__burger";
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
      document.documentElement.toggleAttribute("data-mbl-shell-collapsed", collapsed);
      try {
        localStorage.setItem("mbl-shell-collapsed", v);
      } catch (_) {}
    }

    function openMobile(open) {
      document.documentElement.toggleAttribute("data-mbl-shell-open", open);
    }

    function itemTemplate({ href, label, icon, badge, active, locked }) {
      const a = document.createElement(href ? "a" : "button");
      a.className = "mbl-nav__item" + (active ? " is-active" : "");
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

    function modulesAllow(mods, required) {
      const req = Array.isArray(required) ? required.filter(Boolean) : [];
      if (!req.length) return true;
      return req.every((m) => Boolean(mods?.[m]));
    }

    function buildNav({ isAdmin, isTech, modules, activePage }) {
      const items = [
        {
          section: "Général",
          entries: [
            {
              key: "admin-dashboard",
              label: "Dashboard",
              href: isTech && !isAdmin ? routeFor("technician-dashboard") : routeFor("admin-dashboard"),
              icon: ICONS.dashboard,
              roles: ["admin", "tech"],
              requires: [],
            },
            {
              key: "admin-crm",
              label: "CRM",
              href: routeFor("admin-crm"),
              icon: ICONS.crm,
              roles: ["admin"],
              requires: ["billing"],
            },
          ],
        },
        {
          section: "Facturation",
          entries: [
            { key: "clients", label: "Clients", href: routeFor("clients"), icon: ICONS.clients, roles: ["admin"], requires: ["billing"] },
            { key: "devis-list", label: "Devis", href: routeFor("devis-list"), icon: ICONS.quotes, roles: ["admin"], requires: ["billing"] },
            { key: "factures-list", label: "Factures", href: routeFor("factures-list"), icon: ICONS.invoices, roles: ["admin"], requires: ["billing"] },
            {
              key: "admin-products",
              label: "Produits",
              href: routeFor("admin-products"),
              icon: ICONS.products,
              roles: ["admin"],
              requires: ["billing"],
            },
            {
              key: "admin-categories",
              label: "Catégories",
              href: routeFor("admin-categories"),
              icon: ICONS.products,
              roles: ["admin"],
              requires: ["billing"],
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
              roles: ["admin"],
              requires: ["interventions"],
            },
            {
              key: "technician-dashboard",
              label: "Espace technicien",
              href: routeFor("technician-dashboard"),
              icon: ICONS.interventions,
              roles: ["tech", "admin"],
              requires: ["interventions"],
            },
            {
              key: "technician-profile",
              label: "Mon profil",
              href: routeFor("technician-profile"),
              icon: ICONS.settings,
              roles: ["tech", "admin"],
              requires: ["interventions"],
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
                (it.roles.includes("tech") && isTech);
              const modOk = modulesAllow(modules, it.requires);
              const locked = roleOk && !modOk;
              const visible = roleOk && (modOk || CONFIG.SHOW_LOCKED);
              return { ...it, visible, locked };
            })
            .filter((it) => it.visible);
          return { ...sec, entries };
        })
        .filter((sec) => sec.entries.length);

      // Active marker by data-page when possible.
      allowedItems.forEach((sec) => {
        sec.entries.forEach((it) => {
          it.active = String(activePage || "").trim() === it.key;
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
          const node = itemTemplate({
            href: it.locked ? "" : it.href,
            label: it.label,
            icon: it.icon,
            badge: it.locked ? "LOCK" : "",
            active: it.active,
            locked: it.locked,
          });
          if (it.locked) {
            node.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              location.href = CONFIG.SUBSCRIBE_PATH;
            });
          }
          wrap.appendChild(node);
        });
        navEl.appendChild(wrap);
      });
    }

    function renderBottom(bottomEl, { isAdmin, isTech, planName }) {
      bottomEl.innerHTML = "";

      if (isAdmin) {
        bottomEl.appendChild(
          itemTemplate({
            href: routeFor("admin-settings"),
            label: "Settings",
            icon: ICONS.settings,
            badge: "",
            active: String(document.documentElement.dataset.page || "") === "admin-settings",
            locked: false,
          })
        );
      }

      bottomEl.appendChild(
        itemTemplate({
          href: CONFIG.SUBSCRIBE_PATH,
          label: "Abonnement",
          icon: ICONS.card,
          badge: planName ? String(planName) : "",
          active: false,
          locked: false,
        })
      );

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
        const collapsed = document.documentElement.hasAttribute("data-mbl-shell-collapsed");
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
    injectStyles();

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
        renderBottom(bottomEl, { isAdmin: false, isTech: false, planName: "" });
        return;
      }

      const member = await resolveOrgMember(supabase, user.id);
      const orgId = member?.organization_id ? String(member.organization_id) : "";
      const orgRole = String(member?.role || "").trim().toLowerCase();
      const profileRole = await getProfileRole(supabase, user.id);

      const isAdmin = ["owner", "admin", "manager"].includes(orgRole) || profileRole === "admin";
      const isTech = orgRole === "tech" || profileRole === "tech";

      // Resolve org name + plan/modules
      const [orgRes, entRes, subRes] = await Promise.all([
        orgId ? supabase.from("organizations").select("id, name, slug").eq("id", orgId).maybeSingle() : Promise.resolve({ data: null }),
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

      const orgName = String(orgRes?.data?.name || "Applications").trim() || "Applications";
      const planName = String(subRes?.data?.plan?.name || "").trim();
      const planMods = subRes?.data?.plan?.modules && typeof subRes.data.plan.modules === "object" ? subRes.data.plan.modules : {};
      const entMods = entRes?.data?.modules && typeof entRes.data.modules === "object" ? entRes.data.modules : {};
      const modules = { ...planMods, ...entMods };

      // Put org context in UI
      dom.aside.querySelector("[data-org-mark]").textContent = pickInitials(orgName);
      dom.aside.querySelector("[data-org-name]").textContent = orgName;

      const sub = subRes?.data || null;
      const subActive = isActiveSubscription(sub);
      const metaBits = [];
      if (planName) metaBits.push(planName);
      if (!subActive) metaBits.push("Abonnement requis");
      dom.aside.querySelector("[data-org-meta]").textContent = metaBits.join(" • ");

      const activePage = String(document.documentElement.dataset.page || "").trim();
      const nav = buildNav({ isAdmin, isTech, modules: subActive ? modules : {}, activePage });
      renderNav(navEl, nav);
      renderBottom(bottomEl, { isAdmin, isTech, planName });
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
      renderBottom(bottomEl, { isAdmin: false, isTech: false, planName: "" });
    }

    log("mounted");
  });
})();

