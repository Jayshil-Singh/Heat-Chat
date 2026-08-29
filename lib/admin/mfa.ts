import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export interface MfaRecoveryCodeGenerationResult {
  plainCodes: string[];
  hashedCodes: { hash: string }[];
}

/**
 * Generates a set of 10 cryptographically random, single-use recovery codes.
 * Returns both plain codes (to be presented once to the admin) and hashed codes (to be stored in DB).
 */
export function generateRecoveryCodes(count = 10): MfaRecoveryCodeGenerationResult {
  const plainCodes: string[] = [];
  const hashedCodes: { hash: string }[] = [];

  for (let i = 0; i < count; i++) {
    // Format: 4 groups of 4 alphanumeric chars: XXXX-XXXX-XXXX
    const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    plainCodes.push(formatted);

    const hash = hashRecoveryCode(formatted);
    hashedCodes.push({ hash });
  }

  return { plainCodes, hashedCodes };
}

/**
 * Hashes a recovery code using SHA-256 for secure storage at rest.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Validates and consumes a single-use recovery code.
 */
export async function consumeRecoveryCode(userId: string, plainCode: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const hash = hashRecoveryCode(plainCode);

    const { data: codeRecord, error } = await supabase
      .from("admin_mfa_recovery_codes")
      .select("id, used_at")
      .eq("user_id", userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .single();

    if (error || !codeRecord) {
      return false;
    }

    // Mark as used
    await supabase
      .from("admin_mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", codeRecord.id);

    return true;
  } catch (err) {
    console.error("Error consuming recovery code:", err);
    return false;
  }
}
