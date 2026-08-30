/**
 * Heat Chat — Profile & Privacy Validation Rules
 */

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "support",
  "moderator",
  "system",
  "security",
  "root",
  "help",
  "official",
  "heatchat",
  "heat",
  "owner",
  "superadmin",
  "api",
  "auth",
  "null",
  "undefined",
  "bot",
  "service",
  "guest",
  "everyone",
  "anonymous",
]);

export const VALID_PRESENCE_STATUSES = [
  "ONLINE",
  "AWAY",
  "BUSY",
  "OFFLINE",
  "INVISIBLE",
] as const;

export const VALID_PRIVACY_AUDIENCES = [
  "everyone",
  "friends",
  "friends_of_friends",
  "nobody",
] as const;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || typeof username !== "string") {
    return { isValid: false, error: "Username is required." };
  }

  const normalized = normalizeUsername(username);

  if (normalized.length < 3 || normalized.length > 30) {
    return { isValid: false, error: "Username must be between 3 and 30 characters." };
  }

  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(normalized)) {
    return {
      isValid: false,
      error: "Username can only contain letters, numbers, underscores, and hyphens.",
    };
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return { isValid: false, error: "This username is reserved and cannot be used." };
  }

  return { isValid: true };
}

export function validateDisplayName(displayName: string): { isValid: boolean; error?: string } {
  if (!displayName || typeof displayName !== "string") {
    return { isValid: false, error: "Display name is required." };
  }

  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { isValid: false, error: "Display name must be between 1 and 50 characters." };
  }

  return { isValid: true };
}

export function validateBio(bio: string | null | undefined): { isValid: boolean; error?: string } {
  if (!bio) return { isValid: true };
  if (bio.length > 500) {
    return { isValid: false, error: "Bio cannot exceed 500 characters." };
  }
  return { isValid: true };
}

export function validateStatusMessage(statusMessage: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!statusMessage) return { isValid: true };
  if (statusMessage.length > 160) {
    return { isValid: false, error: "Status message cannot exceed 160 characters." };
  }
  return { isValid: true };
}

export function validateStatusEmoji(statusEmoji: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!statusEmoji) return { isValid: true };
  if (statusEmoji.length > 16) {
    return { isValid: false, error: "Status emoji is too long." };
  }
  return { isValid: true };
}
