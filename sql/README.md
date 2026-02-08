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
