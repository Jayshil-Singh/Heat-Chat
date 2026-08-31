export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ConversationType = "direct" | "group";
export type MemberRole = "owner" | "admin" | "member";
export type MessageType = "text" | "image" | "video" | "audio" | "voice" | "file";
export type ReactionType = "❤️" | "😂" | "👍" | "😮" | "😢" | "🔥" | "😡" | "👏";
export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked" | "cancelled" | "expired";
export type FriendshipState = "NONE" | "PENDING_OUTGOING" | "PENDING_INCOMING" | "FRIENDS" | "SELF";
export type UserStatus = "online" | "offline" | "away" | "busy";
export type PresenceStatus = "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" | "INVISIBLE";
export type PrivacyAudience = "everyone" | "friends" | "friends_of_friends" | "nobody";
export type ReportCategory =
  | "SPAM"
  | "HARASSMENT"
  | "BULLYING"
  | "IMPERSONATION"
  | "THREATS"
  | "INAPPROPRIATE_CONTENT"
  | "SCAM"
  | "FRAUD"
  | "ILLEGAL_CONTENT"
  | "SELF_HARM"
  | "OTHER";
export type ReportStatus = "New" | "Assigned" | "Investigating" | "ActionTaken" | "Resolved" | "Closed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          cover_url: string | null;
          bio: string | null;
          status: UserStatus;
          status_message: string | null;
          status_emoji: string | null;
          presence_status: PresenceStatus;
          last_seen: string | null;
          last_seen_at: string | null;
          timezone: string;
          language: string;
          created_at: string;
          updated_at: string;
          is_suspended: boolean;
          suspended_until: string | null;
          suspension_reason: string | null;
          is_disabled: boolean;
          force_logout_at: string | null;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          status_message?: string | null;
          status_emoji?: string | null;
          presence_status?: PresenceStatus;
          last_seen?: string | null;
          last_seen_at?: string | null;
          timezone?: string;
          language?: string;
          created_at?: string;
          updated_at?: string;
          is_suspended?: boolean;
          suspended_until?: string | null;
          suspension_reason?: string | null;
          is_disabled?: boolean;
          force_logout_at?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          status_message?: string | null;
          status_emoji?: string | null;
          presence_status?: PresenceStatus;
          last_seen?: string | null;
          last_seen_at?: string | null;
          timezone?: string;
          language?: string;
          created_at?: string;
          updated_at?: string;
          is_suspended?: boolean;
          suspended_until?: string | null;
          suspension_reason?: string | null;
          is_disabled?: boolean;
          force_logout_at?: string | null;
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
          client_message_id: string | null;
          edited_at: string | null;
          deleted_by: string | null;
          delete_scope: "me" | "everyone" | null;
          forwarded_from_message_id: string | null;
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
          client_message_id?: string | null;
          edited_at?: string | null;
          deleted_by?: string | null;
          delete_scope?: "me" | "everyone" | null;
          forwarded_from_message_id?: string | null;
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
          client_message_id?: string | null;
          edited_at?: string | null;
          deleted_by?: string | null;
          delete_scope?: "me" | "everyone" | null;
          forwarded_from_message_id?: string | null;
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
      message_user_states: {
        Row: {
          user_id: string;
          message_id: string;
          hidden_at: string;
        };
        Insert: {
          user_id: string;
          message_id: string;
          hidden_at?: string;
        };
        Update: {
          user_id?: string;
          message_id?: string;
          hidden_at?: string;
        };
        Relationships: [];
      };
      message_pins: {
        Row: {
          id: string;
          conversation_id: string;
          message_id: string;
          pinned_by: string;
          pinned_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          message_id: string;
          pinned_by: string;
          pinned_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          message_id?: string;
          pinned_by?: string;
          pinned_at?: string;
        };
        Relationships: [];
      };
      message_delivery_states: {
        Row: {
          message_id: string;
          user_id: string;
          delivered_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          delivered_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          delivered_at?: string;
        };
        Relationships: [];
      };
      conversation_user_states: {
        Row: {
          user_id: string;
          conversation_id: string;
          last_read_message_id: string | null;
          last_read_at: string | null;
          unread_count: number;
          is_marked_unread: boolean;
        };
        Insert: {
          user_id: string;
          conversation_id: string;
          last_read_message_id?: string | null;
          last_read_at?: string | null;
          unread_count?: number;
          is_marked_unread?: boolean;
        };
        Update: {
          user_id?: string;
          conversation_id?: string;
          last_read_message_id?: string | null;
          last_read_at?: string | null;
          unread_count?: number;
          is_marked_unread?: boolean;
        };
        Relationships: [];
      };
      conversation_drafts: {
        Row: {
          user_id: string;
          conversation_id: string;
          content: string;
          reply_to_message_id: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          conversation_id: string;
          content: string;
          reply_to_message_id?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          conversation_id?: string;
          content?: string;
          reply_to_message_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
          duration_seconds: number | null;
          thumbnail_path: string | null;
          metadata: Record<string, unknown> | null;
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
          duration_seconds?: number | null;
          thumbnail_path?: string | null;
          metadata?: Record<string, unknown> | null;
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
          duration_seconds?: number | null;
          thumbnail_path?: string | null;
          metadata?: Record<string, unknown> | null;
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
      starred_messages: {
        Row: {
          id: string;
          user_id: string;
          message_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          message_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          message_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "starred_messages_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "starred_messages_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      message_mentions: {
        Row: {
          id: string;
          message_id: string;
          mentioned_user_id: string;
          username_snapshot: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          mentioned_user_id: string;
          username_snapshot?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          mentioned_user_id?: string;
          username_snapshot?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_mentions_message_id_fkey";
            columns: ["message_id"];
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_mentions_mentioned_user_id_fkey";
            columns: ["mentioned_user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_privacy_settings: {
        Row: {
          user_id: string;
          who_can_message: PrivacyAudience;
          who_can_friend_request: PrivacyAudience;
          who_can_see_profile: PrivacyAudience;
          who_can_see_avatar: PrivacyAudience;
          who_can_see_status: PrivacyAudience;
          who_can_see_online: PrivacyAudience;
          who_can_see_last_seen: PrivacyAudience;
          who_can_add_to_groups: PrivacyAudience;
          who_can_call: PrivacyAudience;
          read_receipts_enabled: boolean;
          typing_indicators_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          who_can_message?: PrivacyAudience;
          who_can_friend_request?: PrivacyAudience;
          who_can_see_profile?: PrivacyAudience;
          who_can_see_avatar?: PrivacyAudience;
          who_can_see_status?: PrivacyAudience;
          who_can_see_online?: PrivacyAudience;
          who_can_see_last_seen?: PrivacyAudience;
          who_can_add_to_groups?: PrivacyAudience;
          who_can_call?: PrivacyAudience;
          read_receipts_enabled?: boolean;
          typing_indicators_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          who_can_message?: PrivacyAudience;
          who_can_friend_request?: PrivacyAudience;
          who_can_see_profile?: PrivacyAudience;
          who_can_see_avatar?: PrivacyAudience;
          who_can_see_status?: PrivacyAudience;
          who_can_see_online?: PrivacyAudience;
          who_can_see_last_seen?: PrivacyAudience;
          who_can_add_to_groups?: PrivacyAudience;
          who_can_call?: PrivacyAudience;
          read_receipts_enabled?: boolean;
          typing_indicators_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_privacy_settings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      blocked_users: {
        Row: {
          id: string;
          user_id: string;
          blocked_user_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          blocked_user_id: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          blocked_user_id?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocked_users_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_users_blocked_user_id_fkey";
            columns: ["blocked_user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_roles: {
        Row: {
          id: string;
          name: string;
          description: string;
          hierarchy_level: number;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          hierarchy_level: number;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          hierarchy_level?: number;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_permissions: {
        Row: {
          id: string;
          key: string;
          category: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          category: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          category?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
          created_at?: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_role_permissions_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            referencedRelation: "admin_permissions";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_user_roles: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          assigned_by: string | null;
          assigned_at: string;
          scope_type: string | null;
          scope_id: string | null;
          is_primary_superadmin: boolean;
          mfa_required: boolean;
          mfa_enrolled_at: string | null;
          mfa_last_verified_at: string | null;
          account_state: string;
          activated_at: string | null;
          last_admin_login_at: string | null;
          mfa_reset_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          role_id: string;
          assigned_by?: string | null;
          assigned_at?: string;
          scope_type?: string | null;
          scope_id?: string | null;
          is_primary_superadmin?: boolean;
          mfa_required?: boolean;
          mfa_enrolled_at?: string | null;
          mfa_last_verified_at?: string | null;
          account_state?: string;
          activated_at?: string | null;
          last_admin_login_at?: string | null;
          mfa_reset_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          role_id?: string;
          assigned_by?: string | null;
          assigned_at?: string;
          scope_type?: string | null;
          scope_id?: string | null;
          is_primary_superadmin?: boolean;
          mfa_required?: boolean;
          mfa_enrolled_at?: string | null;
          mfa_last_verified_at?: string | null;
          account_state?: string;
          activated_at?: string | null;
          last_admin_login_at?: string | null;
          mfa_reset_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_user_roles_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          created_at: string;
          actor_user_id: string;
          actor_role: string;
          action: string;
          target_type: string;
          target_id: string;
          reason: string;
          old_value: Json | null;
          new_value: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          request_id: string | null;
          result: string;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          actor_user_id: string;
          actor_role: string;
          action: string;
          target_type: string;
          target_id: string;
          reason: string;
          old_value?: Json | null;
          new_value?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          request_id?: string | null;
          result?: string;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          actor_user_id?: string;
          actor_role?: string;
          action?: string;
          target_type?: string;
          target_id?: string;
          reason?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          request_id?: string | null;
          result?: string;
          metadata?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_security_events: {
        Row: {
          id: string;
          created_at: string;
          event_type: string;
          user_id: string | null;
          email: string | null;
          ip_address: string | null;
          user_agent: string | null;
          severity: string;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          event_type: string;
          user_id?: string | null;
          email?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          severity?: string;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          event_type?: string;
          user_id?: string | null;
          email?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          severity?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      moderation_reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          category: string;
          reason: string;
          description: string | null;
          status: string;
          assigned_to: string | null;
          resolution_notes: string | null;
          action_taken: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
          target_user_id: string | null;
          target_message_id: string | null;
          target_attachment_id: string | null;
          target_conversation_id: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          category?: string;
          reason: string;
          description?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolution_notes?: string | null;
          action_taken?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
          target_user_id?: string | null;
          target_message_id?: string | null;
          target_attachment_id?: string | null;
          target_conversation_id?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: string;
          target_id?: string;
          category?: string;
          reason?: string;
          description?: string | null;
          status?: string;
          assigned_to?: string | null;
          resolution_notes?: string | null;
          action_taken?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
          target_user_id?: string | null;
          target_message_id?: string | null;
          target_attachment_id?: string | null;
          target_conversation_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_reports_target_user_id_fkey";
            columns: ["target_user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      moderation_notes: {
        Row: {
          id: string;
          report_id: string;
          author_id: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          author_id: string;
          note: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          author_id?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_notes_report_id_fkey";
            columns: ["report_id"];
            referencedRelation: "moderation_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_notes_author_id_fkey";
            columns: ["author_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      system_settings: {
        Row: {
          key: string;
          value: Json;
          category: string;
          description: string;
          is_secret: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          category: string;
          description: string;
          is_secret?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          category?: string;
          description?: string;
          is_secret?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_invitations: {
        Row: {
          id: string;
          email: string;
          role_id: string;
          token_hash: string;
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          role_id: string;
          token_hash: string;
          invited_by: string;
          expires_at: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role_id?: string;
          token_hash?: string;
          invited_by?: string;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_invitations_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "admin_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_invitations_invited_by_fkey";
            columns: ["invited_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_mfa_recovery_codes: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code_hash: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code_hash?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_mfa_recovery_codes_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_user_deletions: {
        Row: {
          id: string;
          target_user_id: string;
          target_email: string | null;
          target_username: string | null;
          target_display_name: string | null;
          actor_user_id: string;
          reason: string;
          state: string;
          last_error: string | null;
          storage_paths_to_delete: string[] | null;
          retry_count: number;
          last_reconciled_at: string | null;
          reconciled_by: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          target_user_id: string;
          target_email?: string | null;
          target_username?: string | null;
          target_display_name?: string | null;
          actor_user_id: string;
          reason: string;
          state: string;
          last_error?: string | null;
          storage_paths_to_delete?: string[] | null;
          retry_count?: number;
          last_reconciled_at?: string | null;
          reconciled_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          target_user_id?: string;
          target_email?: string | null;
          target_username?: string | null;
          target_display_name?: string | null;
          actor_user_id?: string;
          reason?: string;
          state?: string;
          last_error?: string | null;
          storage_paths_to_delete?: string[] | null;
          retry_count?: number;
          last_reconciled_at?: string | null;
          reconciled_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
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
      search_conversation_messages: {
        Args: {
          p_conv_id: string;
          p_query: string;
          p_limit?: number;
        };
        Returns: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          message_type: string;
          created_at: string;
          rank: number;
        }[];
      };
      search_global_messages: {
        Args: {
          p_query: string;
          p_limit?: number;
        };
        Returns: {
          id: string;
          conversation_id: string;
          conversation_name: string;
          conversation_type: string;
          sender_id: string;
          sender_name: string;
          sender_avatar: string | null;
          content: string;
          message_type: string;
          created_at: string;
          rank: number;
        }[];
      };
      toggle_starred_message: {
        Args: {
          p_message_id: string;
        };
        Returns: boolean;
      };
      get_message_context_by_id: {
        Args: {
          p_message_id: string;
        };
        Returns: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          message_type: string;
          reply_to_message_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          sender_username: string;
          sender_display_name: string;
          sender_avatar_url: string | null;
        }[];
      };
      admin_get_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_suspend_user: {
        Args: {
          p_target_user_id: string;
          p_reason: string;
          p_duration_hours?: number | null;
        };
        Returns: boolean;
      };
      admin_restore_user: {
        Args: {
          p_target_user_id: string;
          p_reason: string;
        };
        Returns: boolean;
      };
      admin_assign_role: {
        Args: {
          p_target_user_id: string;
          p_role_id: string;
          p_reason: string;
        };
        Returns: boolean;
      };
      admin_remove_role: {
        Args: {
          p_target_user_id: string;
          p_role_id: string;
          p_reason: string;
        };
        Returns: boolean;
      };
      admin_resolve_report: {
        Args: {
          p_report_id: string;
          p_new_status: string;
          p_action_taken?: string | null;
          p_resolution_notes?: string | null;
        };
        Returns: boolean;
      };
      admin_break_glass_message_content: {
        Args: {
          p_message_id: string;
          p_reason: string;
        };
        Returns: {
          message_id: string;
          conversation_id: string;
          sender_id: string;
          sender_username: string;
          content: string;
          message_type: string;
          created_at: string;
        }[];
      };
      admin_update_system_setting: {
        Args: {
          p_key: string;
          p_value: Json;
          p_reason: string;
        };
        Returns: boolean;
      };
      admin_log_audit: {
        Args: {
          p_action: string;
          p_target_type: string;
          p_target_id: string;
          p_reason: string;
          p_old_value?: Json | null;
          p_new_value?: Json | null;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
          p_result?: string;
          p_metadata?: Json | null;
        };
        Returns: string;
      };
      has_admin_permission: {
        Args: {
          req_permission: string;
        };
        Returns: boolean;
      };
      get_caller_admin_permissions: {
        Args: Record<string, never>;
        Returns: {
          permission_key: string;
        }[];
      };
      get_caller_admin_roles: {
        Args: Record<string, never>;
        Returns: {
          role_name: string;
          hierarchy_level: number;
        }[];
      };
      admin_is_bootstrap_available: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      admin_bootstrap_primary_superadmin: {
        Args: {
          p_user_id: string;
          p_display_name?: string | null;
        };
        Returns: boolean;
      };
      admin_create_invitation: {
        Args: {
          p_email: string;
          p_role_id: string;
          p_token_hash: string;
          p_expires_hours?: number;
        };
        Returns: string;
      };
      admin_validate_invitation: {
        Args: {
          p_token_hash: string;
        };
        Returns: {
          invitation_id: string | null;
          email: string | null;
          role_id: string | null;
          role_name: string | null;
          hierarchy_level: number | null;
          invited_by_username: string | null;
          is_valid: boolean;
          invalid_reason: string | null;
        }[];
      };
      admin_accept_invitation: {
        Args: {
          p_user_id: string;
          p_token_hash: string;
        };
        Returns: boolean;
      };
      admin_update_mfa_status: {
        Args: {
          p_user_id: string;
          p_enrolled?: boolean;
          p_verified?: boolean;
        };
        Returns: boolean;
      };
      admin_delete_user: {
        Args: {
          p_target_user_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      admin_initiate_user_deletion: {
        Args: {
          p_target_user_id: string;
          p_reason: string;
          p_target_email?: string | null;
          p_target_username?: string | null;
          p_target_display_name?: string | null;
          p_storage_paths?: string[];
        };
        Returns: Json;
      };
      admin_advance_deletion_state: {
        Args: {
          p_deletion_id: string;
          p_next_state: string;
          p_last_error?: string | null;
        };
        Returns: boolean;
      };
      admin_get_stuck_deletions: {
        Args: {
          p_timeout_minutes?: number;
        };
        Returns: {
          id: string;
          target_user_id: string;
          target_email: string | null;
          target_username: string | null;
          target_display_name: string | null;
          actor_user_id: string;
          reason: string;
          state: string;
          last_error: string | null;
          retry_count: number;
          created_at: string;
          updated_at: string;
          is_stuck: boolean;
        }[];
      };
      admin_start_deletion_reconciliation: {
        Args: {
          p_operation_id: string;
        };
        Returns: Json;
      };
      send_friend_request: {
        Args: {
          p_recipient_id: string;
        };
        Returns: Json;
      };
      accept_friend_request: {
        Args: {
          p_friendship_id: string;
        };
        Returns: Json;
      };
      decline_friend_request: {
        Args: {
          p_friendship_id: string;
        };
        Returns: Json;
      };
      cancel_friend_request: {
        Args: {
          p_friendship_id: string;
        };
        Returns: Json;
      };
      remove_friend: {
        Args: {
          p_target_user_id: string;
        };
        Returns: Json;
      };
      get_mutual_friends: {
        Args: {
          p_viewer_id: string;
          p_target_id: string;
        };
        Returns: Json;
      };
      get_user_relationship_state: {
        Args: {
          p_viewer_id: string;
          p_target_id: string;
        };
        Returns: Json;
      };
      submit_moderation_report: {
        Args: {
          p_target_type: string;
          p_target_id: string;
          p_category: string;
          p_description?: string | null;
        };
        Returns: Json;
      };
      block_user: {
        Args: {
          target_id: string;
          block_reason?: string | null;
        };
        Returns: boolean;
      };
      send_message: {
        Args: {
          p_conversation_id: string;
          p_content: string;
          p_client_message_id?: string | null;
          p_reply_to_message_id?: string | null;
          p_forwarded_from_message_id?: string | null;
          p_message_type?: string | null;
        };
        Returns: Json;
      };
      edit_message: {
        Args: {
          p_message_id: string;
          p_content: string;
        };
        Returns: Json;
      };
      delete_message_for_me: {
        Args: {
          p_message_id: string;
        };
        Returns: Json;
      };
      delete_message_for_everyone: {
        Args: {
          p_message_id: string;
        };
        Returns: Json;
      };
      forward_message: {
        Args: {
          p_message_id: string;
          p_target_conversation_id: string;
          p_client_message_id?: string | null;
        };
        Returns: Json;
      };
      pin_message: {
        Args: {
          p_message_id: string;
        };
        Returns: Json;
      };
      unpin_message: {
        Args: {
          p_message_id: string;
        };
        Returns: Json;
      };
      toggle_message_reaction: {
        Args: {
          p_message_id: string;
          p_reaction: string;
        };
        Returns: Json;
      };
      mark_message_delivered: {
        Args: {
          p_message_id: string;
        };
        Returns: Json;
      };
      mark_conversation_read: {
        Args: {
          p_conversation_id: string;
        };
        Returns: Json;
      };
      mark_conversation_unread: {
        Args: {
          p_conversation_id: string;
        };
        Returns: Json;
      };
      save_draft: {
        Args: {
          p_conversation_id: string;
          p_content: string;
          p_reply_to_message_id?: string | null;
        };
        Returns: Json;
      };
      delete_draft: {
        Args: {
          p_conversation_id: string;
        };
        Returns: Json;
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
export type StarredMessage = Database["public"]["Tables"]["starred_messages"]["Row"];
export type MessageMention = Database["public"]["Tables"]["message_mentions"]["Row"];
export type UserPrivacySettings = Database["public"]["Tables"]["user_privacy_settings"]["Row"];
export type BlockedUser = Database["public"]["Tables"]["blocked_users"]["Row"];

export interface PublicProfileDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  statusMessage: string | null;
  statusEmoji: string | null;
  presenceStatus: PresenceStatus;
  lastSeenAt: string | null;
  timezone: string | null;
  language: string | null;
  isSelf: boolean;
  isFriend: boolean;
  isBlocked: boolean;
  hasBlockedViewer: boolean;
  canMessage: boolean;
  canFriendRequest: boolean;
}

export interface OwnProfileDto extends Profile {
  privacy_settings?: UserPrivacySettings;
}

export interface RelationshipStateDto {
  friendship: FriendshipState;
  requestId: string | null;
  createdAt: string | null;
  isBlocked: boolean;
  hasBlockedViewer: boolean;
  canMessage: boolean;
  canFriendRequest: boolean;
}

export interface MutualFriendProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MutualFriendsDto {
  count: number;
  profiles: MutualFriendProfile[];
}

export interface ModerationReport {
  id: string;
  reporter_id: string;
  target_type: "user" | "message" | "conversation" | "attachment";
  target_id: string;
  category: ReportCategory | string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  reporter?: {
    username: string;
    display_name?: string;
  };
}

export type MessageUserState = Database["public"]["Tables"]["message_user_states"]["Row"];
export type MessagePin = Database["public"]["Tables"]["message_pins"]["Row"];
export type MessageDeliveryState = Database["public"]["Tables"]["message_delivery_states"]["Row"];
export type ConversationUserState = Database["public"]["Tables"]["conversation_user_states"]["Row"];
export type ConversationDraft = Database["public"]["Tables"]["conversation_drafts"]["Row"];

export interface MessageActionState {
  canReply: boolean;
  canEdit: boolean;
  canDeleteForMe: boolean;
  canDeleteForEveryone: boolean;
  canForward: boolean;
  canReact: boolean;
  canPin: boolean;
  canReport: boolean;
}

export interface MessageDto extends Message {
  sender?: Profile | null;
  isPinned?: boolean;
  isDeletedForMe?: boolean;
  deliveryStates?: MessageDeliveryState[];
}

