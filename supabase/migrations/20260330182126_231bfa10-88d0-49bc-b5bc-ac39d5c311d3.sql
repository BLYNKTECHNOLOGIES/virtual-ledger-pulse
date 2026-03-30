-- Phase 27: Terminal RBAC — Database-Level RLS Enforcement
-- Replace open authenticated_all_* policies with terminal-access-gated policies

---------------------------------------------------------------
-- TIER 1: High-sensitivity tables (permission-gated writes)
---------------------------------------------------------------

-- p2p_terminal_roles
DROP POLICY IF EXISTS "authenticated_read_terminal_roles" ON p2p_terminal_roles;
CREATE POLICY "terminal_select" ON p2p_terminal_roles FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_insert" ON p2p_terminal_roles FOR INSERT TO authenticated WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "terminal_update" ON p2p_terminal_roles FOR UPDATE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_manage')) WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "terminal_delete" ON p2p_terminal_roles FOR DELETE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "service_all_p2p_terminal_roles" ON p2p_terminal_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- p2p_terminal_role_permissions
DROP POLICY IF EXISTS "authenticated_read_terminal_role_permissions" ON p2p_terminal_role_permissions;
CREATE POLICY "terminal_select" ON p2p_terminal_role_permissions FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_insert" ON p2p_terminal_role_permissions FOR INSERT TO authenticated WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "terminal_update" ON p2p_terminal_role_permissions FOR UPDATE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_manage')) WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "terminal_delete" ON p2p_terminal_role_permissions FOR DELETE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_manage'));
CREATE POLICY "service_all_p2p_terminal_role_permissions" ON p2p_terminal_role_permissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- p2p_terminal_user_roles
DROP POLICY IF EXISTS "authenticated_read_terminal_user_roles" ON p2p_terminal_user_roles;
CREATE POLICY "terminal_select" ON p2p_terminal_user_roles FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_insert" ON p2p_terminal_user_roles FOR INSERT TO authenticated WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_role_assign'));
CREATE POLICY "terminal_update" ON p2p_terminal_user_roles FOR UPDATE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_role_assign')) WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_role_assign'));
CREATE POLICY "terminal_delete" ON p2p_terminal_user_roles FOR DELETE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_role_assign'));
CREATE POLICY "service_all_p2p_terminal_user_roles" ON p2p_terminal_user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_bypass_codes
DROP POLICY IF EXISTS "authenticated_all_terminal_bypass_codes" ON terminal_bypass_codes;
CREATE POLICY "terminal_select" ON terminal_bypass_codes FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_insert" ON terminal_bypass_codes FOR INSERT TO authenticated WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_bypass_code'));
CREATE POLICY "terminal_update" ON terminal_bypass_codes FOR UPDATE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_bypass_code')) WITH CHECK (has_terminal_permission(auth.uid(), 'terminal_users_bypass_code'));
CREATE POLICY "terminal_delete" ON terminal_bypass_codes FOR DELETE TO authenticated USING (has_terminal_permission(auth.uid(), 'terminal_users_bypass_code'));
CREATE POLICY "service_all_terminal_bypass_codes" ON terminal_bypass_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

---------------------------------------------------------------
-- TIER 2: Standard terminal tables (terminal-access-gated)
---------------------------------------------------------------

-- terminal_order_assignments
DROP POLICY IF EXISTS "authenticated_all_terminal_order_assignments" ON terminal_order_assignments;
CREATE POLICY "terminal_select" ON terminal_order_assignments FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_order_assignments FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_order_assignments" ON terminal_order_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- p2p_order_chats
DROP POLICY IF EXISTS "Authenticated users can delete p2p_order_chats" ON p2p_order_chats;
DROP POLICY IF EXISTS "Authenticated users can insert p2p_order_chats" ON p2p_order_chats;
DROP POLICY IF EXISTS "Authenticated users can read p2p_order_chats" ON p2p_order_chats;
CREATE POLICY "terminal_select" ON p2p_order_chats FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON p2p_order_chats FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_p2p_order_chats" ON p2p_order_chats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_payer_assignments
DROP POLICY IF EXISTS "authenticated_all_terminal_payer_assignments" ON terminal_payer_assignments;
CREATE POLICY "terminal_select" ON terminal_payer_assignments FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_payer_assignments FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_payer_assignments" ON terminal_payer_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_mpi_snapshots
DROP POLICY IF EXISTS "Authenticated users can insert MPI snapshots" ON terminal_mpi_snapshots;
DROP POLICY IF EXISTS "Authenticated users can read MPI snapshots" ON terminal_mpi_snapshots;
DROP POLICY IF EXISTS "Authenticated users can update MPI snapshots" ON terminal_mpi_snapshots;
CREATE POLICY "terminal_select" ON terminal_mpi_snapshots FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_mpi_snapshots FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_mpi_snapshots" ON terminal_mpi_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_operator_assignments
DROP POLICY IF EXISTS "authenticated_all_terminal_operator_assignments" ON terminal_operator_assignments;
CREATE POLICY "terminal_select" ON terminal_operator_assignments FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_operator_assignments FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_operator_assignments" ON terminal_operator_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_notifications
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON terminal_notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON terminal_notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON terminal_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON terminal_notifications;
CREATE POLICY "terminal_select" ON terminal_notifications FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_notifications FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_notifications" ON terminal_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_user_presence
DROP POLICY IF EXISTS "Authenticated users can read presence" ON terminal_user_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON terminal_user_presence;
DROP POLICY IF EXISTS "Users can upsert own presence" ON terminal_user_presence;
CREATE POLICY "terminal_select" ON terminal_user_presence FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_user_presence FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_user_presence" ON terminal_user_presence FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_permission_change_log
DROP POLICY IF EXISTS "Authenticated users can view permission change log" ON terminal_permission_change_log;
CREATE POLICY "terminal_select" ON terminal_permission_change_log FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_permission_change_log FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_permission_change_log" ON terminal_permission_change_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_assignment_audit_logs
DROP POLICY IF EXISTS "authenticated_all_terminal_assignment_audit_logs" ON terminal_assignment_audit_logs;
CREATE POLICY "terminal_select" ON terminal_assignment_audit_logs FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_assignment_audit_logs FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_assignment_audit_logs" ON terminal_assignment_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

---------------------------------------------------------------
-- ADDITIONAL terminal tables (also Tier 2)
---------------------------------------------------------------

-- terminal_biometric_sessions
DROP POLICY IF EXISTS "authenticated_all_terminal_biometric_sessions" ON terminal_biometric_sessions;
CREATE POLICY "terminal_select" ON terminal_biometric_sessions FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_biometric_sessions FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_biometric_sessions" ON terminal_biometric_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_internal_messages
DROP POLICY IF EXISTS "authenticated_all_terminal_internal_messages" ON terminal_internal_messages;
CREATE POLICY "terminal_select" ON terminal_internal_messages FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_internal_messages FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_internal_messages" ON terminal_internal_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_internal_chat_reads
DROP POLICY IF EXISTS "authenticated_all_terminal_internal_chat_reads" ON terminal_internal_chat_reads;
CREATE POLICY "terminal_select" ON terminal_internal_chat_reads FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_internal_chat_reads FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_internal_chat_reads" ON terminal_internal_chat_reads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_auto_reply_exclusions
DROP POLICY IF EXISTS "authenticated_all_terminal_auto_reply_exclusions" ON terminal_auto_reply_exclusions;
CREATE POLICY "terminal_select" ON terminal_auto_reply_exclusions FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_auto_reply_exclusions FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_auto_reply_exclusions" ON terminal_auto_reply_exclusions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_payer_order_log
DROP POLICY IF EXISTS "authenticated_all_terminal_payer_order_log" ON terminal_payer_order_log;
CREATE POLICY "terminal_select" ON terminal_payer_order_log FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_payer_order_log FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_payer_order_log" ON terminal_payer_order_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_alternate_upi_requests (replace existing specific policies)
DROP POLICY IF EXISTS "Authenticated users can create alternate UPI requests" ON terminal_alternate_upi_requests;
DROP POLICY IF EXISTS "Authenticated users can update alternate UPI requests" ON terminal_alternate_upi_requests;
DROP POLICY IF EXISTS "Authenticated users can view alternate UPI requests" ON terminal_alternate_upi_requests;
CREATE POLICY "terminal_select" ON terminal_alternate_upi_requests FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_alternate_upi_requests FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_alternate_upi_requests" ON terminal_alternate_upi_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

---------------------------------------------------------------
-- Remaining terminal tables with open policies
---------------------------------------------------------------

-- terminal_activity_log
DROP POLICY IF EXISTS "authenticated_all_terminal_activity_log" ON terminal_activity_log;
CREATE POLICY "terminal_select" ON terminal_activity_log FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_activity_log FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_activity_log" ON terminal_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_broadcasts
DROP POLICY IF EXISTS "authenticated_all_terminal_broadcasts" ON terminal_broadcasts;
CREATE POLICY "terminal_select" ON terminal_broadcasts FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_broadcasts FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_broadcasts" ON terminal_broadcasts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_exchange_accounts
DROP POLICY IF EXISTS "authenticated_all_terminal_exchange_accounts" ON terminal_exchange_accounts;
CREATE POLICY "terminal_select" ON terminal_exchange_accounts FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_exchange_accounts FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_exchange_accounts" ON terminal_exchange_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_order_escalations
DROP POLICY IF EXISTS "authenticated_all_terminal_order_escalations" ON terminal_order_escalations;
CREATE POLICY "terminal_select" ON terminal_order_escalations FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_order_escalations FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_order_escalations" ON terminal_order_escalations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_order_size_ranges
DROP POLICY IF EXISTS "authenticated_all_terminal_order_size_ranges" ON terminal_order_size_ranges;
CREATE POLICY "terminal_select" ON terminal_order_size_ranges FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_order_size_ranges FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_order_size_ranges" ON terminal_order_size_ranges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_payer_order_locks
DROP POLICY IF EXISTS "Authenticated users can insert locks" ON terminal_payer_order_locks;
DROP POLICY IF EXISTS "Authenticated users can read locks" ON terminal_payer_order_locks;
DROP POLICY IF EXISTS "Authenticated users can update locks" ON terminal_payer_order_locks;
CREATE POLICY "terminal_select" ON terminal_payer_order_locks FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_payer_order_locks FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_payer_order_locks" ON terminal_payer_order_locks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_purchase_sync
DROP POLICY IF EXISTS "Authenticated users can view terminal sync records" ON terminal_purchase_sync;
DROP POLICY IF EXISTS "authenticated_all_terminal_purchase_sync" ON terminal_purchase_sync;
CREATE POLICY "terminal_select" ON terminal_purchase_sync FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_purchase_sync FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_purchase_sync" ON terminal_purchase_sync FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_sales_sync
DROP POLICY IF EXISTS "authenticated_all_terminal_sales_sync" ON terminal_sales_sync;
CREATE POLICY "terminal_select" ON terminal_sales_sync FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_sales_sync FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_sales_sync" ON terminal_sales_sync FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_shift_handovers
DROP POLICY IF EXISTS "authenticated_all_terminal_shift_handovers" ON terminal_shift_handovers;
CREATE POLICY "terminal_select" ON terminal_shift_handovers FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_shift_handovers FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_shift_handovers" ON terminal_shift_handovers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_auto_assignment_config
DROP POLICY IF EXISTS "Authenticated users can manage auto-assignment config" ON terminal_auto_assignment_config;
DROP POLICY IF EXISTS "Authenticated users can read auto-assignment config" ON terminal_auto_assignment_config;
CREATE POLICY "terminal_select" ON terminal_auto_assignment_config FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_auto_assignment_config FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_auto_assignment_config" ON terminal_auto_assignment_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_auto_assignment_log
DROP POLICY IF EXISTS "Authenticated users can insert auto-assignment logs" ON terminal_auto_assignment_log;
DROP POLICY IF EXISTS "Authenticated users can read auto-assignment logs" ON terminal_auto_assignment_log;
CREATE POLICY "terminal_select" ON terminal_auto_assignment_log FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_auto_assignment_log FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_auto_assignment_log" ON terminal_auto_assignment_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_user_exchange_mappings
DROP POLICY IF EXISTS "authenticated_all_terminal_user_exchange_mappings" ON terminal_user_exchange_mappings;
CREATE POLICY "terminal_select" ON terminal_user_exchange_mappings FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_user_exchange_mappings FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_user_exchange_mappings" ON terminal_user_exchange_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_user_profiles
DROP POLICY IF EXISTS "authenticated_all_terminal_user_profiles" ON terminal_user_profiles;
CREATE POLICY "terminal_select" ON terminal_user_profiles FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_user_profiles FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_user_profiles" ON terminal_user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_user_size_range_mappings
DROP POLICY IF EXISTS "authenticated_all_terminal_user_size_range_mappings" ON terminal_user_size_range_mappings;
CREATE POLICY "terminal_select" ON terminal_user_size_range_mappings FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_user_size_range_mappings FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_user_size_range_mappings" ON terminal_user_size_range_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_user_supervisor_mappings
DROP POLICY IF EXISTS "authenticated_all_terminal_user_supervisor_mappings" ON terminal_user_supervisor_mappings;
CREATE POLICY "terminal_select" ON terminal_user_supervisor_mappings FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_user_supervisor_mappings FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_user_supervisor_mappings" ON terminal_user_supervisor_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- terminal_wallet_links
DROP POLICY IF EXISTS "authenticated_all_terminal_wallet_links" ON terminal_wallet_links;
CREATE POLICY "terminal_select" ON terminal_wallet_links FOR SELECT TO authenticated USING (verify_terminal_access(auth.uid()));
CREATE POLICY "terminal_write" ON terminal_wallet_links FOR ALL TO authenticated USING (verify_terminal_access(auth.uid())) WITH CHECK (verify_terminal_access(auth.uid()));
CREATE POLICY "service_all_terminal_wallet_links" ON terminal_wallet_links FOR ALL TO service_role USING (true) WITH CHECK (true);