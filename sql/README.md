# SQL Migrations (Supabase)

Order to run in Supabase SQL Editor:

1. `001_multitenant_foundation.sql`
2. `002_constraints_and_rls.sql`
3. `003_clients_sites_stock_and_billing.sql`
4. `004_user_type_internal_external.sql`
5. `005_devis_table_and_rls.sql`
6. `006_devis_status_and_storage_rls.sql`
7. `007_devis_rls_hardening.sql`
8. `008_devis_storage_bucket_devis_files.sql`
9. `009_organization_profiles.sql`
10. `010_clients_billing_fields.sql`
11. `011_devis_facture_bridge.sql`
12. `012_factures_tables_and_rls.sql`
13. `013_factures_storage_rls.sql`
14. `014_entitlements_and_stripe.sql`
15. `015_invoice_payments.sql`
16. `016_interventions_extensibility.sql`
17. `017_saas_modules_and_subscription_gate.sql`
18. `018_user_limits_max_users.sql`
19. `019_auth_users_bootstrap.sql`
20. `020_crm_core.sql`
21. `021_transport_core.sql`
22. `022_plans_transport_and_ultimate.sql`
23. `023_fleet_module_and_vehicle_compliance.sql`
24. `024_logistics_core.sql`
25. `025_member_permissions_and_availability.sql`
26. `026_org_invitations_and_claim.sql`
27. `027_org_profile_branding.sql`
28. `028_restaurant_pos_core.sql`
29. `029_restaurant_public_links_and_pos_scope.sql`
30. `030_restaurant_media_storage.sql`
31. `031_restaurant_public_path_applications_default.sql`
32. `032_restaurant_employee_role.sql`
33. `033_auth_bootstrap_google_oauth_fix.sql`
34. `034_auth_bootstrap_signup_fix_profiles_compat.sql`
35. `035_plan_restaurant_pos.sql`
36. `036_rental_short_stay_core.sql`
37. `037_plan_rental_short_stay.sql`
38. `038_auth_bootstrap_no_gen_random_bytes.sql`
39. `039_plan_ultimate_include_rental.sql`
40. `040_purchases_core.sql`
41. `041_loyalty_core.sql`
42. `042_activity_feed_core.sql`
43. `043_documents_storage_unification.sql`
44. `044_document_sequences_unified.sql`

## Important
- Run each file in full, then validate before the next file.
- These scripts are designed to be idempotent (safe to re-run).
- They are written to keep your current frontend working while adding SaaS foundations.

## Quick checks after each migration

```sql
select count(*) from organizations;
select count(*) from organization_members;
```

```sql
select column_name
from information_schema.columns
where table_schema='public' and table_name='interventions' and column_name in ('organization_id','arrived_at','started_at','completed_at','client_id','site_id');
```

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname='public'
order by tablename, policyname;
```

## Existing frontend compatibility
- Legacy columns are kept (`client_name`, `client_ref`, `address`, etc.).
- `organization_id` is auto-filled on insert with trigger function.
- New tables (`clients`, `client_sites`, `stock_movements`, `organization_subscriptions`) are additive.
