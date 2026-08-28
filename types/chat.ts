import type {
  Conversation,
  ConversationMember,
  Profile,
  FriendshipStatus,
  ConversationType,
  MemberRole,
  Message,
  UserStatus,
  ReactionType,
  Attachment,
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

/** Chat attachment with resolved signed URL for client rendering */
export interface AttachmentWithUrl {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  storagePath: string;
  signedUrl: string;
}

export interface ChatMessage extends Message {
  sender?: Profile | null;
  status?: MessageStatus;
  tempId?: string;
  readBy?: string[];
  reactions?: ReactionSummary[];
  replyPreview?: ReplyPreviewData | null;
  attachments?: AttachmentWithUrl[];
}

export interface ConversationMemberWithProfile {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  profile: Profile;
}

export interface ConversationWithDetails extends Conversation {
  otherMember?: Profile | null;
  members?: Profile[];
  memberDetails?: ConversationMemberWithProfile[];
  memberCount?: number;
  currentMemberRole?: MemberRole;
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

export interface NotificationWithDetails {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string | null;
  senderId: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  sender?: Profile | null;
  conversationName?: string;
  conversationType?: ConversationType;
  /** Safe message preview text ("This message was deleted" if soft-deleted) */
  preview: string;
  isDeleted: boolean;
}

// Re-export for convenience
export type { ReactionType, ConversationType, FriendshipStatus, MemberRole };

