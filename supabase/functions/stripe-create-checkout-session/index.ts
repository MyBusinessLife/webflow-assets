// Supabase Edge Function: stripe-create-checkout-session
// Creates a Stripe Checkout Session (subscription) for an organization plan.
//
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - STRIPE_SECRET_KEY
//
// Optional env vars:
// - STRIPE_API_VERSION (default: 2023-10-16)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
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

const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_API_VERSION = Deno.env.get("STRIPE_API_VERSION") || "2023-10-16";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    const organizationId = String(body.organization_id || "").trim();
    const planCode = String(body.plan_code || "").trim();
    const interval = String(body.interval || "monthly") === "annual" ? "annual" : "monthly";
    const successUrl = String(body.success_url || "").trim();
    const cancelUrl = String(body.cancel_url || "").trim();

    if (!organizationId) return json(400, { error: "organization_id is required" });
    if (!planCode) return json(400, { error: "plan_code is required" });
    if (!successUrl) return json(400, { error: "success_url is required" });
    if (!cancelUrl) return json(400, { error: "cancel_url is required" });

    // Only org admins can start checkout for their org.
    const { data: member, error: memErr } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (memErr || !member) return json(403, { error: "Forbidden" });
    if (!["owner", "admin", "manager"].includes(String(member.role || ""))) {
      return json(403, { error: "Forbidden" });
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("billing_plans")
      .select("id, code, name, stripe_price_monthly_id, stripe_price_annual_id, is_active")
      .eq("code", planCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planErr || !plan) return json(400, { error: "Unknown plan_code" });

    const priceId =
      interval === "annual" ? String(plan.stripe_price_annual_id || "") : String(plan.stripe_price_monthly_id || "");
    if (!priceId) {
      return json(400, {
        error:
          "Stripe price id missing for this plan. Fill billing_plans.stripe_price_monthly_id / stripe_price_annual_id.",
      });
    }

    // Reuse the last known Stripe customer id for the org if available.
    const { data: lastSub } = await supabaseAdmin
      .from("organization_subscriptions")
      .select("provider_customer_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const customerId = String(lastSub?.provider_customer_id || "").trim();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      allow_promotion_codes: true,
      customer: customerId || undefined,
      customer_email: customerId ? undefined : user.email || undefined,
      metadata: { organization_id: organizationId, plan_code: planCode, interval },
      subscription_data: {
        metadata: { organization_id: organizationId, plan_code: planCode, interval },
      },
    });

    return json(200, { url: session.url });
  } catch (e) {
    console.error("[stripe-create-checkout-session] error:", e);
    return json(500, { error: e?.message || "Internal error" });
  }
});

