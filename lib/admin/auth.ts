import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AdminAccountState, AdminPermissionKey, AdminRoleName, AdminSessionContext } from "@/types/admin";
import { ROLE_HIERARCHY } from "@/types/admin";

export type AdminAuthResult =
  | { success: true; session: AdminSessionContext; error?: never }
  | {
      success: false;
      error:
        | "UNAUTHENTICATED"
        | "UNVERIFIED_EMAIL"
        | "ACCOUNT_SUSPENDED"
        | "ACCOUNT_DISABLED"
        | "ACCOUNT_NOT_ACTIVE"
        | "MFA_REQUIRED"
        | "FORBIDDEN_NOT_ADMIN"
        | "SERVER_ERROR";
      message: string;
      session?: never;
    };

/**
 * Validates the caller's server session, email confirmation state, account status,
 * mandatory MFA enrollment & verification, and loads all assigned administrative roles and permissions.
 */
export async function getAdminSession(options?: { allowPendingMfa?: boolean }): Promise<AdminAuthResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return {
        success: false,
        error: "UNAUTHENTICATED",
        message: "Authentication required to access administrative features.",
      };
    }

    if (!user.email_confirmed_at) {
      return {
        success: false,
        error: "UNVERIFIED_EMAIL",
        message: "Email verification is mandatory before accessing administrative tools.",
      };
    }

    // Query profile for account status & metadata
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_suspended, is_disabled, force_logout_at")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return {
        success: false,
        error: "SERVER_ERROR",
        message: "Failed to resolve user profile state.",
      };
    }

    if (profile.is_disabled) {
      return {
        success: false,
        error: "ACCOUNT_DISABLED",
        message: "This account has been administratively disabled.",
      };
    }

    if (profile.is_suspended) {
      return {
        success: false,
        error: "ACCOUNT_SUSPENDED",
        message: "This account is currently suspended from accessing administrative tools.",
      };
    }

    // Query active administrative roles, PrimarySuperAdmin flag, and MFA status
    const { data: userRoles, error: rolesErr } = await supabase
      .from("admin_user_roles")
      .select("role_id, is_primary_superadmin, mfa_required, mfa_enrolled_at, mfa_last_verified_at, account_state, admin_roles(id, name, hierarchy_level)")
      .eq("user_id", user.id);

    if (rolesErr || !userRoles || userRoles.length === 0) {
      return {
        success: false,
        error: "FORBIDDEN_NOT_ADMIN",
        message: "Access denied: you do not possess administrative roles.",
      };
    }

    let isPrimarySuperAdmin = false;
    let accountState: AdminAccountState = "ACTIVE";
    let mfaEnrolledAt: string | null = null;
    let mfaLastVerifiedAt: string | null = null;
    const roles: AdminRoleName[] = [];
    let topRoleLevel = 0;

    userRoles.forEach((ur) => {
      if (ur.is_primary_superadmin) {
        isPrimarySuperAdmin = true;
      }
      if (ur.account_state) {
        accountState = ur.account_state as AdminAccountState;
      }
      if (ur.mfa_enrolled_at) {
        mfaEnrolledAt = ur.mfa_enrolled_at;
      }
      if (ur.mfa_last_verified_at) {
        mfaLastVerifiedAt = ur.mfa_last_verified_at;
      }

      const roleData = ur.admin_roles as unknown as { name: AdminRoleName; hierarchy_level: number } | null;
      if (roleData?.name) {
        roles.push(roleData.name);
        const level = roleData.hierarchy_level || ROLE_HIERARCHY[roleData.name] || 0;
        if (level > topRoleLevel) {
          topRoleLevel = level;
        }
      }
    });

    if (roles.length === 0) {
      return {
        success: false,
        error: "FORBIDDEN_NOT_ADMIN",
        message: "No valid active administrative role assigned.",
      };
    }

    if (accountState !== "ACTIVE" && !options?.allowPendingMfa) {
      return {
        success: false,
        error: "ACCOUNT_NOT_ACTIVE",
        message: `Administrative account is not active (status: ${accountState}).`,
      };
    }

    // Check MFA state via Supabase AAL & DB metadata
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const hasAal2 = aalData?.currentLevel === "aal2";
    const mfaEnrolled = Boolean(mfaEnrolledAt || (aalData?.nextLevel === "aal2" && aalData?.currentLevel === "aal1"));
    const mfaVerified = hasAal2 || Boolean(mfaLastVerifiedAt);

    if (!options?.allowPendingMfa && (!mfaEnrolled || !mfaVerified)) {
      return {
        success: false,
        error: "MFA_REQUIRED",
        message: "Multi-Factor Authentication (MFA) is mandatory for administrative access.",
      };
    }

    // Query all distinct permissions mapped to caller's roles
    const roleIds = userRoles.map((ur) => ur.role_id);
    const { data: rolePerms, error: permsErr } = await supabase
      .from("admin_role_permissions")
      .select("permission_id, admin_permissions(key)")
      .in("role_id", roleIds);

    const permissions = new Set<AdminPermissionKey>();
    if (!permsErr && rolePerms) {
      rolePerms.forEach((rp) => {
        const permData = rp.admin_permissions as unknown as { key: AdminPermissionKey } | null;
        if (permData?.key) {
          permissions.add(permData.key);
        }
      });
    }

    const session: AdminSessionContext = {
      userId: user.id,
      email: user.email || "",
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      isEmailVerified: Boolean(user.email_confirmed_at),
      isDisabled: profile.is_disabled,
      isSuspended: profile.is_suspended,
      roles,
      topRoleLevel,
      permissions,
      isPrimarySuperAdmin,
      accountState,
      mfaEnrolled,
      mfaVerified,
      mfaLastVerifiedAt,
    };

    return { success: true, session };
  } catch (error) {
    console.error("Admin auth verification error:", error);
    return {
      success: false,
      error: "SERVER_ERROR",
      message: "An unexpected error occurred during administrative session verification.",
    };
  }
}

/**
 * Guard utility for Route Handlers to strictly enforce required permission.
 * Returns either an error NextResponse or the verified AdminSessionContext.
 */
export async function requireAdminPermission(
  requiredPermission: AdminPermissionKey,
  options?: { requireRecentMfa?: boolean; maxMfaAgeMinutes?: number }
): Promise<{ errorResponse?: NextResponse; session?: AdminSessionContext }> {
  const authResult = await getAdminSession();

  if (!authResult.success) {
    const statusCode =
      authResult.error === "UNAUTHENTICATED"
        ? 401
        : authResult.error === "MFA_REQUIRED"
        ? 403
        : 403;

    return {
      errorResponse: NextResponse.json(
        { error: authResult.error, message: authResult.message },
        { status: statusCode }
      ),
    };
  }

  const { session } = authResult;

  if (!session.permissions.has(requiredPermission)) {
    return {
      errorResponse: NextResponse.json(
        {
          error: "FORBIDDEN_INSUFFICIENT_PERMISSION",
          message: `Administrative access denied: missing required permission '${requiredPermission}'.`,
        },
        { status: 403 }
      ),
    };
  }

  // Check recent MFA requirement for sensitive operations
  if (options?.requireRecentMfa) {
    const maxMinutes = options.maxMfaAgeMinutes || 10;
    const recentCheck = validateRecentMfa(session, maxMinutes);
    if (!recentCheck.valid) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "MFA_REAUTH_REQUIRED",
            message: `This sensitive operation requires recent MFA verification (within ${maxMinutes} minutes). Please re-authenticate.`,
          },
          { status: 403 }
        ),
      };
    }
  }

  return { session };
}

/**
 * Validates whether the administrator has performed an MFA verification within the allowed age limit.
 */
export function validateRecentMfa(session: AdminSessionContext, maxAgeMinutes = 10): { valid: boolean; ageMinutes?: number } {
  if (!session.mfaLastVerifiedAt) {
    return { valid: false };
  }

  const verifiedTime = new Date(session.mfaLastVerifiedAt).getTime();
  const now = Date.now();
  const ageMinutes = (now - verifiedTime) / (1000 * 60);

  if (ageMinutes > maxAgeMinutes) {
    return { valid: false, ageMinutes };
  }

  return { valid: true, ageMinutes };
}

/**
 * Validates anti-privilege escalation constraints:
 * 1. Administrator cannot modify their own administrative roles.
 * 2. Administrator cannot assign, revoke, or mutate a role equal to or higher than their own hierarchy level.
 * 3. Primary SuperAdmin cannot be modified or suspended.
 */
export function validateHierarchyConstraint(
  actorSession: AdminSessionContext,
  targetUserId: string,
  targetRoleLevel: number,
  targetIsPrimarySuperAdmin?: boolean
): { allowed: boolean; reason?: string } {
  if (actorSession.userId === targetUserId) {
    return {
      allowed: false,
      reason: "Security violation: administrators cannot modify or self-assign roles to their own account.",
    };
  }

  if (targetIsPrimarySuperAdmin) {
    return {
      allowed: false,
      reason: "Security violation: Primary SuperAdmin role cannot be modified or revoked.",
    };
  }

  if (targetRoleLevel >= actorSession.topRoleLevel) {
    return {
      allowed: false,
      reason: `Privilege escalation denied: target role level (${targetRoleLevel}) meets or exceeds caller hierarchy level (${actorSession.topRoleLevel}).`,
    };
  }

  return { allowed: true };
}
