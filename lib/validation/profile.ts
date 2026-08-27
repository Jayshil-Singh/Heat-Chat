import type { UserStatus } from "@/types/database";

export function validateBio(bio: string): string | null {
  if (bio && bio.length > 250) {
    return "Bio cannot exceed 250 characters";
  }
  return null;
}

export function validateStatus(status: string): string | null {
  const validStatuses: UserStatus[] = ["online", "offline", "away", "busy"];
  if (!validStatuses.includes(status as UserStatus)) {
    return "Invalid status value";
  }
  return null;
}
