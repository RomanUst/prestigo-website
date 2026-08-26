-- Migration 057: security_rls_hardening
-- Post-v2.1 remediation of Supabase database-advisor security findings.
--
-- Context: every target below is accessed by the app ONLY through the
-- service-role client (createSupabaseServiceClient in lib/supabase.ts), which
-- bypasses RLS and holds its own explicit EXECUTE grant. Both admin routes that
-- touch these objects are behind the getAdminUser() 401/403 guard. These changes
-- therefore harden the public PostgREST surface without affecting the running app.

-- 1) [ERROR 0013 rls_disabled_in_public] booking_edit_audit_log (created by 055
--    without RLS). Enable RLS with NO policy => deny-all for anon/authenticated;
--    the service-role client bypasses RLS and keeps full access. Idempotent.
ALTER TABLE public.booking_edit_audit_log ENABLE ROW LEVEL SECURITY;

-- 2) [WARN 0028/0029 SECURITY DEFINER executable] admin_search_bookings is a
--    SECURITY DEFINER RPC reachable at /rest/v1/rpc/admin_search_bookings by the
--    anon/authenticated roles, bypassing the admin guard. Revoke the public /
--    anon / authenticated EXECUTE grants; service_role and postgres retain their
--    own explicit grants (verified), so the app's service-role .rpc() call is
--    unaffected.
REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

-- 3) [WARN 0011 function_search_path_mutable] pin an explicit, non-mutable
--    search_path on the three flagged functions (matching admin_search_bookings'
--    existing "public, pg_temp"). Preserves any other SET options already present
--    (e.g. prestigo_text_to_utc's DateStyle).
ALTER FUNCTION public.prestigo_text_to_utc(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.content_items_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.saved_passengers_set_updated_at() SET search_path = public, pg_temp;

-- Out of scope (intentionally NOT touched here):
--   * 9 public.chat_history / fb_* / ig_content / *_comments / workflow_logs /
--     follower_count_log tables (rls_enabled_no_policy, INFO) belong to a separate
--     n8n social-automation workflow; RLS is already enabled (deny-all to anon).
--   * auth_leaked_password_protection (WARN) is a Supabase Auth dashboard setting,
--     not SQL — enable it in Authentication > Policies.
