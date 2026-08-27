import type { UserStatus } from "./database";

export interface PublicUserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  status: UserStatus;
  last_seen: string | null;
  created_at: string;
}

export interface ProfileUpdatePayload {
  username: string;
  display_name: string;
  bio?: string | null;
  status?: UserStatus;
  avatar_url?: string | null;
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  status: UserStatus;
}
