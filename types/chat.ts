import type { Conversation, ConversationMember, Profile, FriendshipStatus, ConversationType } from "./database";

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
