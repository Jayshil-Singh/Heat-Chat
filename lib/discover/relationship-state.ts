import type { RelationshipStatus } from "@/types/chat";

export interface RelationshipStateConfig {
  label: string;
  badgeLabel?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "success";
  buttonText?: string;
  canSendRequest: boolean;
  canAccept: boolean;
  canCancel: boolean;
  isFriend: boolean;
}

export const RELATIONSHIP_CONFIG: Record<RelationshipStatus, RelationshipStateConfig> = {
  none: {
    label: "Not connected",
    buttonText: "Add Friend",
    canSendRequest: true,
    canAccept: false,
    canCancel: false,
    isFriend: false,
  },
  outgoing_pending: {
    label: "Request sent",
    badgeLabel: "Pending",
    badgeVariant: "secondary",
    buttonText: "Request Sent",
    canSendRequest: false,
    canAccept: false,
    canCancel: true,
    isFriend: false,
  },
  incoming_pending: {
    label: "Wants to connect",
    badgeLabel: "Received",
    badgeVariant: "outline",
    buttonText: "Accept",
    canSendRequest: false,
    canAccept: true,
    canCancel: false,
    isFriend: false,
  },
  friends: {
    label: "Friends",
    badgeLabel: "Friends",
    badgeVariant: "success",
    buttonText: "Friends",
    canSendRequest: false,
    canAccept: false,
    canCancel: false,
    isFriend: true,
  },
};

export function getRelationshipConfig(status: RelationshipStatus): RelationshipStateConfig {
  return RELATIONSHIP_CONFIG[status] || RELATIONSHIP_CONFIG.none;
}
