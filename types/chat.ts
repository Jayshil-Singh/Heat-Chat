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
  /** Duration in seconds — for audio, voice, and video attachments */
  durationSeconds?: number | null;
  /** Signed URL for thumbnail (video poster, etc.) */
  thumbnailSignedUrl?: string | null;
  storagePath: string;
  signedUrl: string;
}

export interface ChatMessage extends Message {
  sender?: Profile | null;
  status?: MessageStatus;
  tempId?: string;
  readBy?: string[];
  deliveredTo?: string[];
  reactions?: ReactionSummary[];
  replyPreview?: ReplyPreviewData | null;
  attachments?: AttachmentWithUrl[];
  isPinned?: boolean;
  forwardedFrom?: { id: string; senderName?: string; content?: string } | null;
  isDeletedForMe?: boolean;
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
  isMarkedUnread?: boolean;
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
  mutualCount?: number;
  mutualProfiles?: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
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

export interface StarredMessageWithDetails {
  id: string;
  userId: string;
  messageId: string;
  createdAt: string;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    messageType: string;
    createdAt: string;
    sender?: Profile | null;
    conversationName?: string;
    conversationType?: ConversationType;
    attachments?: AttachmentWithUrl[];
  };
}

export type SearchCategory =
  | "all"
  | "messages"
  | "people"
  | "media"
  | "files"
  | "saved";

export interface SearchMessageResult {
  id: string;
  conversationId: string;
  conversationName: string;
  conversationType: ConversationType;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string | null;
  content: string;
  messageType: string;
  createdAt: string;
  editedAt?: string | null;
  rank: number;
  isSaved?: boolean;
  attachments?: AttachmentWithUrl[];
}

export interface SearchMediaResult {
  attachmentId: string;
  messageId: string;
  conversationId: string;
  conversationName: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  storagePath: string;
  thumbnailPath?: string | null;
  messageType: string;
  messageContent: string;
  createdAt: string;
  signedUrl?: string;
  thumbnailSignedUrl?: string | null;
}

export interface SearchPeopleResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  isFriend: boolean;
  isBlocked: boolean;
}

export interface SavedMessageDto {
  savedId: string;
  savedAt: string;
  messageId: string;
  conversationId: string;
  conversationName: string;
  conversationType: ConversationType;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string | null;
  content: string;
  messageType: string;
  isDeleted: boolean;
  createdAt: string;
  editedAt?: string | null;
  attachments?: AttachmentWithUrl[];
}

export interface MessageMentionDto {
  id?: string;
  messageId?: string;
  mentionedUserId: string;
  usernameSnapshot?: string | null;
  createdAt?: string;
}

export interface MentionCandidate {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface InChatSearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
  rank: number;
}

export interface GlobalSearchResult {
  id: string;
  conversationId: string;
  conversationName: string;
  conversationType: ConversationType;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  messageType: string;
  createdAt: string;
  rank: number;
}

// Re-export for convenience
export type { ReactionType, ConversationType, FriendshipStatus, MemberRole };


