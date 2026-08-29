import { createClient } from "@/lib/supabase/server";
import type { AdminSessionContext } from "@/types/admin";
import type { Json } from "@/types/database";

export interface LogAuditParams {
  session: AdminSessionContext;
  action: string;
  targetType: "user" | "message" | "conversation" | "role" | "permission" | "report" | "attachment" | "setting" | "security" | "session";
  targetId: string;
  reason: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  result?: "SUCCESS" | "DENIED" | "FAILURE";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Dispatches an immutable administrative audit record to the database.
 * Every privileged administrative action MUST call this helper.
 */
export async function logAdminAction(params: LogAuditParams): Promise<{ success: boolean; logId?: string }> {
  try {
    const supabase = await createClient();

    const { data: logId, error } = await supabase.rpc("admin_log_audit", {
      p_action: params.action,
      p_target_type: params.targetType,
      p_target_id: params.targetId,
      p_reason: params.reason,
      p_old_value: (params.oldValue as unknown as Json) ?? null,
      p_new_value: (params.newValue as unknown as Json) ?? null,
      p_ip_address: params.ipAddress ?? null,
      p_user_agent: params.userAgent ?? null,
      p_result: params.result ?? "SUCCESS",
      p_metadata: (params.metadata as unknown as Json) ?? null,
    });

    if (error) {
      console.error("Failed to write admin audit log via RPC:", error);
      // Fallback: direct insert if RPC encounters schema mismatch
      const { data: directLog, error: insertErr } = await supabase
        .from("admin_audit_logs")
        .insert({
          actor_user_id: params.session.userId,
          actor_role: params.session.roles[0] || "Admin",
          action: params.action,
          target_type: params.targetType,
          target_id: params.targetId,
          reason: params.reason,
          old_value: (params.oldValue as unknown as Json) ?? null,
          new_value: (params.newValue as unknown as Json) ?? null,
          ip_address: params.ipAddress ?? null,
          user_agent: params.userAgent ?? null,
          result: params.result ?? "SUCCESS",
          metadata: (params.metadata as unknown as Json) ?? null,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Fatal: failed to write fallback audit log:", insertErr);
        return { success: false };
      }
      return { success: true, logId: directLog?.id };
    }

    return { success: true, logId: logId as string };
  } catch (err) {
    console.error("Unexpected error writing audit record:", err);
    return { success: false };
  }
}
