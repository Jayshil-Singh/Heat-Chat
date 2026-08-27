export type Theme = "light" | "dark" | "system";

export interface NavItem {
  label: string;
  href: string;
  iconName: "chat" | "friends" | "settings" | "profile";
  badge?: number;
}

export type StatusType = "online" | "offline" | "away" | "busy";

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  statusMessage?: string | null;
  status: StatusType;
  lastSeen?: string | null;
}
