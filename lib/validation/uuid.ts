export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Validates whether a given value is a valid non-nil RFC 4122 UUID.
 */
export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id) && id !== NIL_UUID;
}
