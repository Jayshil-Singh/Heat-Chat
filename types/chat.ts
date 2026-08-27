import type {
  Conversation,
  ConversationMember,
  Profile,
  FriendshipStatus,
  ConversationType,
  Message,
  UserStatus,
  ReactionType,
} from "./database";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

/** Aggregated reaction summary for a single emoji type on a message */
export interface ReactionSummary {
  reaction: ReactionType;
  count: number;
  /** IDs of users who used this reaction — used to detect if current user reacted */
  userIds: string[];
}

/** Minimal preview of the message being replied to */
export interface ReplyPreviewData {
  messageId: string;
  senderName: string;
  /** Truncated content (~100 chars). Empty string when isDeleted is true. */
  content: string;
  isDeleted: boolean;
}

export interface ChatMessage extends Message {
  sender?: Profile | null;
  status?: MessageStatus;
  tempId?: string;
  readBy?: string[];
  reactions?: ReactionSummary[];
  replyPreview?: ReplyPreviewData | null;
}

export interface ConversationWithDetails extends Conversation {
  otherMember?: Profile | null;
  members?: Profile[];
  lastMessage?: {
    content: string;
    sender_id: string;
    created_at: string;
    message_type: string;
  } | null;
  unreadCount?: number;
}

export interface FriendItem {
  friendshipId: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: string;
  profile: Profile;
}

export interface FriendshipRequest {
  friendshipId: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
  profile: Profile;
}

export interface TypingUser {
  userId: string;
  displayName: string;
  username: string;
  timestamp: number;
}

export interface PresenceUser {
  userId: string;
  status: UserStatus;
  lastSeen?: string;
}

// Re-export for convenience
export type { ReactionType, ConversationType, FriendshipStatus };
