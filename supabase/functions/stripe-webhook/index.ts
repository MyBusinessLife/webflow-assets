// Supabase Edge Function: stripe-webhook
// Receives Stripe events and syncs organization_subscriptions (and entitlements via DB trigger).
//
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - STRIPE_SECRET_KEY
// - STRIPE_WEBHOOK_SECRET
//
// Optional env vars:
// - STRIPE_API_VERSION (default: 2023-10-16)

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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
const STRIPE_WEBHOOK_SECRET = requireEnv("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_API_VERSION = Deno.env.get("STRIPE_API_VERSION") || "2023-10-16";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function mapStripeStatus(status: string): "trialing" | "active" | "past_due" | "canceled" | "paused" {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "paused";
  }
}

function toIsoFromUnix(value?: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription) {
  const organizationId = String((sub.metadata as Record<string, string>)?.organization_id || "").trim();
  const planCodeMeta = String((sub.metadata as Record<string, string>)?.plan_code || "").trim();

  if (!organizationId) {
    throw new Error("Missing organization_id in subscription metadata.");
  }

  // Resolve plan id by code (preferred) or by price id (fallback).
  let planId: string | null = null;
  if (planCodeMeta) {
    const { data: planRow } = await supabaseAdmin
      .from("billing_plans")
      .select("id")
      .eq("code", planCodeMeta)
      .maybeSingle();
    planId = planRow?.id || null;
  }

  if (!planId) {
    const priceId = String(sub.items?.data?.[0]?.price?.id || "").trim();
    if (priceId) {
      const { data: planRow } = await supabaseAdmin
        .from("billing_plans")
        .select("id")
        .or(`stripe_price_monthly_id.eq.${priceId},stripe_price_annual_id.eq.${priceId}`)
        .maybeSingle();
      planId = planRow?.id || null;
    }
  }

  if (!planId) {
    throw new Error("Unable to resolve billing plan from Stripe subscription.");
  }

  const mapped = mapStripeStatus(String(sub.status || ""));
  const isActive = ["trialing", "active", "past_due"].includes(mapped);

  const payload = {
    organization_id: organizationId,
    plan_id: planId,
    status: mapped,
    starts_at: toIsoFromUnix(sub.start_date) || new Date().toISOString(),
    ends_at: isActive ? null : toIsoFromUnix(sub.ended_at || sub.canceled_at || sub.current_period_end) || new Date().toISOString(),
    trial_ends_at: toIsoFromUnix(sub.trial_end),
    provider: "stripe",
    provider_customer_id: String(sub.customer || ""),
    provider_subscription_id: String(sub.id || ""),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("organization_subscriptions")
    .upsert(payload, { onConflict: "provider,provider_subscription_id" });

  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const sig = req.headers.get("stripe-signature") || "";
    if (!sig) return json(400, { error: "Missing stripe-signature header" });

    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe-webhook] signature error:", err);
      return json(400, { error: "Invalid signature" });
    }

    // Insert event for idempotency and debugging.
    const insertRes = await supabaseAdmin.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      livemode: event.livemode,
      type: event.type,
      api_version: event.api_version,
      event_created: event.created,
      data: event.data,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    });

    if (insertRes.error) {
      // Unique violation => already processed.
      if (String(insertRes.error.code || "") === "23505") {
        return json(200, { ok: true, deduped: true });
      }
      console.warn("[stripe-webhook] event insert warning:", insertRes.error.message);
    }

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripe(sub);
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("[stripe-webhook] error:", e);
    return json(500, { error: e?.message || "Internal error" });
  }
});

