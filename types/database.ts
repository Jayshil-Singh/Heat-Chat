export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ConversationType = "direct" | "group";
export type MemberRole = "owner" | "admin" | "member";
export type MessageType = "text" | "image" | "file";
export type ReactionType = "❤️" | "😂" | "👍" | "😮" | "😢" | "🔥";
export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";
export type UserStatus = "online" | "offline" | "away" | "busy";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          status: UserStatus;
          last_seen: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          last_seen?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          last_seen?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          type: ConversationType;
          name: string | null;
          description: string | null;
          avatar_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type?: ConversationType;
          name?: string | null;
          description?: string | null;
          avatar_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: ConversationType;
          name?: string | null;
          description?: string | null;
          avatar_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          user_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_id?: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          message_type: MessageType;
          reply_to_message_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          message_type?: MessageType;
          reply_to_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          content?: string;
          message_type?: MessageType;
          reply_to_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey";
            columns: ["reply_to_message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          reaction: ReactionType;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          reaction: ReactionType;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          reaction?: ReactionType;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      message_reads: {
        Row: {
          message_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reads_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      attachments: {
        Row: {
          id: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          storage_path?: string;
          file_name?: string;
          file_type?: string;
          file_size?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          status: FriendshipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          status?: FriendshipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_id?: string;
          status?: FriendshipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friendships_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_friend_id_fkey";
            columns: ["friend_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          notifications_enabled: boolean;
          sound_enabled: boolean;
          desktop_notifications_enabled: boolean;
          message_preview_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          notifications_enabled?: boolean;
          sound_enabled?: boolean;
          desktop_notifications_enabled?: boolean;
          message_preview_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          notifications_enabled?: boolean;
          sound_enabled?: boolean;
          desktop_notifications_enabled?: boolean;
          message_preview_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_notification_preferences: {
        Row: {
          conversation_id: string;
          user_id: string;
          muted: boolean;
          updated_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          muted?: boolean;
          updated_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_id?: string;
          muted?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_notification_preferences_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          message_id: string | null;
          sender_id: string;
          type: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          message_id?: string | null;
          sender_id: string;
          type?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          conversation_id?: string;
          message_id?: string | null;
          sender_id?: string;
          type?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_sender_id_fkey";
            columns: ["sender_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_conversation_member: {
        Args: {
          conv_id: string;
          check_user_id: string;
        };
        Returns: boolean;
      };
      is_conversation_admin: {
        Args: {
          conv_id: string;
          check_user_id: string;
        };
        Returns: boolean;
      };
      is_conversation_owner: {
        Args: {
          conv_id: string;
          check_user_id: string;
        };
        Returns: boolean;
      };
      get_conversation_role: {
        Args: {
          conv_id: string;
          check_user_id: string;
        };
        Returns: string | null;
      };
      get_or_create_direct_conversation: {
        Args: {
          target_user_id: string;
        };
        Returns: string;
      };
      create_group_conversation: {
        Args: {
          group_name: string;
          member_user_ids: string[];
          group_avatar_url?: string | null;
        };
        Returns: string;
      };
      add_group_members: {
        Args: {
          conv_id: string;
          new_user_ids: string[];
        };
        Returns: void;
      };
      remove_group_member: {
        Args: {
          conv_id: string;
          target_user_id: string;
        };
        Returns: void;
      };
      update_group_member_role: {
        Args: {
          conv_id: string;
          target_user_id: string;
          new_role: string;
        };
        Returns: void;
      };
      update_group_details: {
        Args: {
          conv_id: string;
          new_name: string;
          new_avatar_url?: string | null;
        };
        Returns: void;
      };
      leave_group: {
        Args: {
          conv_id: string;
        };
        Returns: void;
      };
      mark_notification_as_read: {
        Args: {
          notif_id: string;
        };
        Returns: boolean;
      };
      mark_all_notifications_as_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      toggle_conversation_mute: {
        Args: {
          conv_id: string;
          is_muted: boolean;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationMember = Database["public"]["Tables"]["conversation_members"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageReaction = Database["public"]["Tables"]["message_reactions"]["Row"];
export type MessageRead = Database["public"]["Tables"]["message_reads"]["Row"];
export type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
export type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
export type NotificationPreference = Database["public"]["Tables"]["notification_preferences"]["Row"];
export type ConversationNotificationPreference = Database["public"]["Tables"]["conversation_notification_preferences"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
