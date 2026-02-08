// Supabase Edge Function: transport-route
// Compute distance/duration for multiple waypoints (addresses or lat/lng).
//
// Current default provider: OSRM public endpoint (no API key, OK for dev).
// For production, consider hosting OSRM or switching to Google/Mapbox with secrets.
//
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// Request body:
// {
//   organization_id: "uuid",
//   waypoints: [{ address?: string, lat?: number, lng?: number }, ...]
// }
//
// Response:
// { distance_m: number, duration_s: number, waypoints: [{ lat:number, lng:number, address?:string }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(key: string) {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type WaypointIn = { address?: string; lat?: number; lng?: number };
type WaypointOut = { address?: string; lat: number; lng: number };

function asNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  // Nominatim usage policy expects a real User-Agent.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", address);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "MBLTransport/1.0 (contact@mybusinesslife.fr)",
      "Accept-Language": "fr",
    },
  });
  if (!res.ok) return null;
  const arr = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  const hit = arr?.[0];
  if (!hit) return null;
  const lat = asNumber(hit.lat);
  const lng = asNumber(hit.lon);
  if (lat === null || lng === null) return null;
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

async function routeOsrm(points: WaypointOut[]): Promise<{ distance_m: number; duration_s: number } | null> {
  if (points.length < 2) return null;
  const coords = points
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
    .join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set("overview", "false");
  url.searchParams.set("steps", "false");

  const res = await fetch(url.toString(), { headers: { "User-Agent": "MBLTransport/1.0" } });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as any;
  const route = data?.routes?.[0];
  const distance = asNumber(route?.distance);
  const duration = asNumber(route?.duration);
  if (distance === null || duration === null) return null;
  return { distance_m: Math.round(distance), duration_s: Math.round(duration) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(401, { error: "Unauthorized" });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = String(body.organization_id || "").trim();
    const waypointsRaw = Array.isArray(body.waypoints) ? (body.waypoints as WaypointIn[]) : [];

    if (!orgId) return json(400, { error: "organization_id is required" });
    if (!Array.isArray(waypointsRaw) || waypointsRaw.length < 2) return json(400, { error: "At least 2 waypoints" });
    if (waypointsRaw.length > 30) return json(400, { error: "Too many waypoints (max 30)" });

    // Ensure the user is an active member of the org and has the transport module.
    const [{ data: member }, { data: ent }] = await Promise.all([
      supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin.from("organization_entitlements").select("modules").eq("organization_id", orgId).maybeSingle(),
    ]);

    if (!member?.organization_id) return json(403, { error: "Forbidden" });
    const mods = (ent?.modules && typeof ent.modules === "object") ? (ent.modules as Record<string, unknown>) : {};
    if (!Boolean((mods as any).transport)) return json(403, { error: "Module transport not enabled" });

    const points: WaypointOut[] = [];

    for (const w of waypointsRaw) {
      const lat = asNumber((w as any)?.lat);
      const lng = asNumber((w as any)?.lng);
      const address = String((w as any)?.address || "").trim();

      if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
        points.push({ lat, lng, address: address || undefined });
        continue;
      }

      if (!address) return json(400, { error: "Each waypoint must have lat/lng or address" });
      const geo = await geocode(address);
      if (!geo) return json(400, { error: `Geocoding failed for: ${address}` });
      points.push({ lat: geo.lat, lng: geo.lng, address });
    }

    // Force stable precision for caching and consistent UI.
    const normalized = points.map((p) => ({
      address: p.address,
      lat: clamp(p.lat, -90, 90),
      lng: clamp(p.lng, -180, 180),
    }));

    const route = await routeOsrm(normalized);
    if (!route) return json(502, { error: "Routing provider error" });

    return json(200, { ...route, waypoints: normalized });
  } catch (e) {
    console.error("[transport-route] error:", e);
    return json(500, { error: e?.message || "Internal error" });
  }
});

