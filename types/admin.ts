export type AdminRoleName =
  | "SuperAdmin"
  | "SystemAdmin"
  | "Admin"
  | "Moderator"
  | "Support"
  | "Analyst"
  | (string & {});

export const ROLE_HIERARCHY: Record<string, number> = {
  SuperAdmin: 100,
  SystemAdmin: 80,
  Admin: 60,
  Moderator: 40,
  Support: 30,
  Analyst: 20,
};

export type AdminAccountState =
  | "INVITED"
  | "EMAIL_PENDING"
  | "EMAIL_VERIFIED"
  | "MFA_PENDING"
  | "MFA_VERIFIED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DISABLED"
  | "REVOKED";

export type AdminPermissionKey =
  | "users.view"
  | "users.create"
  | "users.edit"
  | "users.delete"
  | "users.suspend"
  | "users.restore"
  | "users.revoke_sessions"
  | "roles.view"
  | "roles.manage"
  | "permissions.view"
  | "permissions.manage"
  | "conversations.metadata.view"
  | "conversations.moderate"
  | "conversations.delete"
  | "messages.metadata.view"
  | "messages.content.view"
  | "messages.delete"
  | "messages.restore"
  | "attachments.view"
  | "attachments.delete"
  | "reports.view"
  | "reports.assign"
  | "reports.resolve"
  | "security.view"
  | "security.manage"
  | "analytics.view"
  | "settings.view"
  | "settings.manage"
  | "notifications.view"
  | "notifications.manage"
  | "audit.view"
  | "system.health.view"
  | (string & {});

export interface AdminRole {
  id: string;
  name: string;
  description: string;
  hierarchy_level: number;
  is_system: boolean;
  created_at: string;
  updated_at?: string;
  permissions?: AdminPermissionKey[];
}

export interface AdminPermission {
  id: string;
  key: AdminPermissionKey;
  category: string;
  description: string;
  created_at: string;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_seen: string | null;
  is_suspended: boolean;
  suspended_until: string | null;
  suspension_reason: string | null;
  is_disabled: boolean;
  force_logout_at: string | null;
  email?: string;
  email_confirmed_at?: string | null;
  roles: string[];
  top_role_level: number;
  is_primary_superadmin?: boolean;
  account_state?: AdminAccountState;
  mfa_enrolled_at?: string | null;
  mfa_last_verified_at?: string | null;
}

export interface AdminInvitation {
  id: string;
  email: string;
  role_id: string;
  role_name?: string;
  hierarchy_level?: number;
  token_hash: string;
  invited_by: string;
  invited_by_username?: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_username?: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  result: string;
  metadata?: unknown;
}

export interface ModerationReport {
  id: string;
  reporter_id: string;
  reporter_username?: string;
  target_type: string;
  target_id: string;
  target_preview?: string;
  reason: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  assigned_username?: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSecurityEvent {
  id: string;
  created_at: string;
  event_type: string;
  user_id: string | null;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: string;
  metadata: unknown;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  category: string;
  description: string;
  is_secret: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface AdminDashboardMetrics {
  total_users: number;
  verified_users: number;
  unverified_users: number;
  suspended_users: number;
  online_users: number;
  total_conversations: number;
  total_messages: number;
  messages_today: number;
  total_attachments: number;
  storage_bytes: number;
  pending_reports: number;
  security_events_today: number;
}

export interface AdminSessionContext {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  isSuspended: boolean;
  roles: string[];
  topRoleLevel: number;
  permissions: Set<AdminPermissionKey>;
  isPrimarySuperAdmin: boolean;
  accountState: AdminAccountState;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
  mfaLastVerifiedAt: string | null;
}
