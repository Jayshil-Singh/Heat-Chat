"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import { useRealtimeChat } from "./use-realtime-chat";
import { validateMessageContent } from "@/lib/validation/message";
import type {
  Attachment,
  Message,
  MessageRead,
  MessageReaction,
  Profile,
  ReactionType,
} from "@/types/database";
import type { ChatMessage, ReactionSummary, ReplyPreviewData, AttachmentWithUrl } from "@/types/chat";
import type { PendingAttachment } from "./use-media-upload";

const PAGE_SIZE = 50;
const REPLY_CONTENT_TRUNCATE = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReactionsMap(
  rawReactions: { message_id: string; user_id: string; reaction: ReactionType }[]
): Map<string, ReactionSummary[]> {
  const map = new Map<string, ReactionSummary[]>();
  for (const r of rawReactions) {
    const summaries = map.get(r.message_id) || [];
    const existing = summaries.find((s) => s.reaction === r.reaction);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.user_id);
    } else {
      summaries.push({ reaction: r.reaction, count: 1, userIds: [r.user_id] });
    }
    map.set(r.message_id, summaries);
  }
  return map;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);
  const pendingTempIdsRef = React.useRef<Map<string, string>>(new Map());

  // Keep a ref to the latest messages for use in async callbacks that need
  // current state without stale closures.
  const messagesRef = React.useRef<ChatMessage[]>([]);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ─── Enrichment ─────────────────────────────────────────────────────────────

  /**
   * Enrich raw DB message rows with sender profiles, read receipts,
   * reactions, reply previews, and attachments — using batched queries (not per-message).
   */
  const enrichMessages = React.useCallback(
    async (rawMessages: Message[]): Promise<ChatMessage[]> => {
      if (rawMessages.length === 0) return [];

      const messageIds = rawMessages.map((m) => m.id);
      const nonDeletedIds = rawMessages.filter((m) => !m.deleted_at).map((m) => m.id);
      const senderIds = [...new Set(rawMessages.map((m) => m.sender_id))];

      // Batch-fetch all enrichment data in parallel
      const [profilesRes, readsRes, reactionsRes, attachmentsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("id", senderIds),
        supabase
          .from("message_reads")
          .select("message_id, user_id")
          .in("message_id", messageIds),
        supabase
          .from("message_reactions")
          .select("message_id, user_id, reaction")
          .in("message_id", messageIds),
        nonDeletedIds.length > 0
          ? supabase.from("attachments").select("*").in("message_id", nonDeletedIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesMap = new Map<string, Profile>();
      (profilesRes.data || []).forEach((p) =>
        profilesMap.set(p.id, p as Profile)
      );

      const readsMap = new Map<string, string[]>();
      (readsRes.data || []).forEach((r) => {
        const list = readsMap.get(r.message_id) || [];
        list.push(r.user_id);
        readsMap.set(r.message_id, list);
      });

      const reactionsMap = buildReactionsMap(
        (reactionsRes.data || []) as {
          message_id: string;
          user_id: string;
          reaction: ReactionType;
        }[]
      );

      // Batch-resolve signed URLs for all attachments
      const rawAttachments = (attachmentsRes.data || []) as Attachment[];
      const attachmentsMap = new Map<string, AttachmentWithUrl[]>();

      if (rawAttachments.length > 0) {
        const paths = rawAttachments.map((a) => a.storage_path);
        const { data: signedUrlsData } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrls(paths, 3600);

        rawAttachments.forEach((att, idx) => {
          const signedUrl = signedUrlsData?.[idx]?.signedUrl || "";
          const list = attachmentsMap.get(att.message_id) || [];
          list.push({
            id: att.id,
            messageId: att.message_id,
            fileName: att.file_name,
            fileType: att.file_type,
            fileSize: att.file_size,
            width: att.width,
            height: att.height,
            storagePath: att.storage_path,
            signedUrl,
          });
          attachmentsMap.set(att.message_id, list);
        });
      }

      // Batch-fetch parent messages for replies (one query, not per-message)
      const replyParentIds = [
        ...new Set(
          rawMessages
            .filter((m) => m.reply_to_message_id)
            .map((m) => m.reply_to_message_id!)
        ),
      ];

      const parentMap = new Map<
        string,
        { id: string; sender_id: string; content: string; deleted_at: string | null; senderName: string }
      >();

      if (replyParentIds.length > 0) {
        const { data: parentMsgs } = await supabase
          .from("messages")
          .select("id, sender_id, content, deleted_at")
          .in("id", replyParentIds);

        if (parentMsgs && parentMsgs.length > 0) {
          const parentSenderIds = [...new Set(parentMsgs.map((m) => m.sender_id))];
          const { data: parentProfiles } = await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", parentSenderIds);

          const parentProfileMap = new Map<string, string>();
          (parentProfiles || []).forEach((p) =>
            parentProfileMap.set(p.id, p.display_name)
          );

          parentMsgs.forEach((m) => {
            parentMap.set(m.id, {
              id: m.id,
              sender_id: m.sender_id,
              content: m.content,
              deleted_at: m.deleted_at,
              senderName:
                parentProfileMap.get(m.sender_id) || "Unknown",
            });
          });
        }
      }

      return rawMessages.map((m): ChatMessage => {
        let replyPreview: ReplyPreviewData | null = null;
        if (m.reply_to_message_id) {
          const parent = parentMap.get(m.reply_to_message_id);
          replyPreview = parent
            ? {
                messageId: parent.id,
                senderName: parent.senderName,
                content: parent.deleted_at
                  ? ""
                  : parent.content.slice(0, REPLY_CONTENT_TRUNCATE),
                isDeleted: parent.deleted_at !== null,
              }
            : {
                // Parent message not found (outside user's access) — show as deleted
                messageId: m.reply_to_message_id,
                senderName: "Unknown",
                content: "",
                isDeleted: true,
              };
        }

        return {
          ...m,
          sender: profilesMap.get(m.sender_id) || null,
          status: m.sender_id === user?.id ? "sent" : undefined,
          readBy: readsMap.get(m.id) || [],
          reactions: reactionsMap.get(m.id) || [],
          replyPreview,
          attachments: m.deleted_at ? [] : attachmentsMap.get(m.id) || [],
        };
      });
    },
    [supabase, user?.id]
  );

  // ─── Fetch initial messages ──────────────────────────────────────────────────

  const fetchMessages = React.useCallback(async () => {
    if (!conversationId || !user?.id) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: rawMessages, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (msgError) {
        console.warn("Error fetching messages:", msgError.message);
        setError(msgError.message);
        setIsLoading(false);
        return;
      }

      const count = rawMessages?.length || 0;
      setHasMore(count === PAGE_SIZE);

      const chronMessages = (rawMessages || []).reverse();
      const formatted = await enrichMessages(chronMessages);
      setMessages(formatted);

      // Mark incoming unread messages as read (batch insert)
      const unreadIncoming = chronMessages.filter(
        (m) => m.sender_id !== user.id
      );

      if (unreadIncoming.length > 0) {
        const readsPayload: MessageRead[] = unreadIncoming.map((m) => ({
          message_id: m.id,
          user_id: user.id,
          read_at: new Date().toISOString(),
        }));

        await supabase
          .from("message_reads")
          .upsert(readsPayload, {
            onConflict: "message_id,user_id",
            ignoreDuplicates: true,
          });
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setError("Failed to load messages.");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user?.id, supabase, enrichMessages]);

  React.useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ─── Pagination: Load older messages ─────────────────────────────────────────

  const loadOlderMessages = React.useCallback(async () => {
    if (
      !conversationId ||
      !user?.id ||
      isLoadingOlder ||
      !hasMore ||
      messages.length === 0
    ) {
      return;
    }

    setIsLoadingOlder(true);
    const oldestCreatedAt = messages[0].created_at;

    try {
      const { data: olderRaw, error: olderErr } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (olderErr) {
        console.warn("Error loading older messages:", olderErr.message);
        setIsLoadingOlder(false);
        return;
      }

      const count = olderRaw?.length || 0;
      setHasMore(count === PAGE_SIZE);

      if (count === 0) {
        setIsLoadingOlder(false);
        return;
      }

      const chronOlder = (olderRaw || []).reverse();
      const formattedOlder = await enrichMessages(chronOlder);
      setMessages((prev) => [...formattedOlder, ...prev]);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [
    conversationId,
    user?.id,
    isLoadingOlder,
    hasMore,
    messages,
    supabase,
    enrichMessages,
  ]);

  // ─── Realtime handlers ───────────────────────────────────────────────────────

  const handleRealtimeNewMessage = React.useCallback(
    async (newMsg: Message) => {
      if (newMsg.conversation_id !== conversationId) return;

      const [enriched] = await enrichMessages([newMsg]);
      if (!enriched) return;

      const tempId = pendingTempIdsRef.current.get(newMsg.content || newMsg.id);

      setMessages((prev) => {
        // Dedup: already in list
        if (prev.some((m) => m.id === newMsg.id)) return prev;

        // Replace optimistic temp message
        if (tempId && prev.some((m) => m.tempId === tempId)) {
          return prev.map((m) =>
            m.tempId === tempId
              ? {
                  ...enriched,
                  status: "sent" as const,
                  readBy: m.readBy || [],
                  reactions: m.reactions || [],
                }
              : m
          );
        }

        // New message from another user or self
        return [
          ...prev,
          {
            ...enriched,
            status:
              newMsg.sender_id === user?.id ? ("sent" as const) : undefined,
          },
        ];
      });

      // Mark incoming message as read
      if (newMsg.sender_id !== user?.id && user?.id) {
        await supabase.from("message_reads").upsert(
          {
            message_id: newMsg.id,
            user_id: user.id,
            read_at: new Date().toISOString(),
          },
          { onConflict: "message_id,user_id", ignoreDuplicates: true }
        );
      }
    },
    [conversationId, user?.id, enrichMessages, supabase]
  );

  const handleRealtimeMessageUpdate = React.useCallback(
    (updatedMsg: Message) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== updatedMsg.id) return m;
          return {
            ...m,
            content: updatedMsg.content,
            updated_at: updatedMsg.updated_at,
            deleted_at: updatedMsg.deleted_at,
            attachments: updatedMsg.deleted_at ? [] : m.attachments,
          };
        })
      );
    },
    []
  );

  const handleRealtimeMessageDelete = React.useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            deleted_at: new Date().toISOString(),
            attachments: [],
          };
        })
      );
    },
    []
  );

  const handleRealtimeReadReceipt = React.useCallback(
    (read: Pick<MessageRead, "message_id" | "user_id">) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== read.message_id) return m;
          const currentReadBy = m.readBy || [];
          if (currentReadBy.includes(read.user_id)) return m;
          return { ...m, readBy: [...currentReadBy, read.user_id] };
        })
      );
    },
    []
  );

  const handleRealtimeReactionInsert = React.useCallback(
    (
      reaction: Pick<
        MessageReaction,
        "id" | "message_id" | "user_id" | "reaction"
      >
    ) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.message_id) return m;
          const existingReactions = m.reactions || [];
          const found = existingReactions.find(
            (r) => r.reaction === reaction.reaction
          );
          if (found) {
            if (found.userIds.includes(reaction.user_id)) return m;
            return {
              ...m,
              reactions: existingReactions.map((r) =>
                r.reaction === reaction.reaction
                  ? {
                      ...r,
                      count: r.count + 1,
                      userIds: [...r.userIds, reaction.user_id],
                    }
                  : r
              ),
            };
          }
          return {
            ...m,
            reactions: [
              ...existingReactions,
              {
                reaction: reaction.reaction,
                count: 1,
                userIds: [reaction.user_id],
              },
            ],
          };
        })
      );
    },
    []
  );

  const handleRealtimeReactionDelete = React.useCallback(
    (
      reaction: Pick<
        MessageReaction,
        "id" | "message_id" | "user_id" | "reaction"
      >
    ) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== reaction.message_id) return m;
          const existingReactions = m.reactions || [];
          const updated = existingReactions
            .map((r) => {
              if (r.reaction !== reaction.reaction) return r;
              const newUserIds = r.userIds.filter(
                (id) => id !== reaction.user_id
              );
              return { ...r, count: newUserIds.length, userIds: newUserIds };
            })
            .filter((r) => r.count > 0);
          return { ...m, reactions: updated };
        })
      );
    },
    []
  );

  const { connectionStatus } = useRealtimeChat({
    conversationId,
    onNewMessage: handleRealtimeNewMessage,
    onMessageUpdate: handleRealtimeMessageUpdate,
    onMessageDelete: handleRealtimeMessageDelete,
    onReadReceipt: handleRealtimeReadReceipt,
    onReactionInsert: handleRealtimeReactionInsert,
    onReactionDelete: handleRealtimeReactionDelete,
    onReconnectSync: fetchMessages,
  });

  // ─── Send message (with optional reply & attachments) ───────────────────────────

  const sendMessage = async (
    content: string,
    replyToMessageId?: string | null,
    stagedAttachments?: PendingAttachment[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!conversationId || !user?.id) {
      return { success: false, error: "Not in an active conversation" };
    }

    const trimmedContent = content.trim();
    const hasAttachments = stagedAttachments && stagedAttachments.length > 0;

    if (!trimmedContent && !hasAttachments) {
      return { success: false, error: "Cannot send an empty message." };
    }

    if (trimmedContent) {
      const validationErr = validateMessageContent(trimmedContent);
      if (validationErr) return { success: false, error: validationErr };
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build optimistic attachments
    const optimisticAttachments: AttachmentWithUrl[] = (stagedAttachments || []).map((att, i) => ({
      id: `temp_att_${i}`,
      messageId: tempId,
      fileName: att.processed?.originalFileName || att.originalFile.name,
      fileType: att.processed?.mimeType || att.originalFile.type,
      fileSize: att.processed?.fileSize || att.originalFile.size,
      width: att.processed?.width || null,
      height: att.processed?.height || null,
      storagePath: "",
      signedUrl: att.processed?.previewUrl || "",
    }));

    const optimisticMessage: ChatMessage = {
      id: tempId,
      tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmedContent,
      message_type: hasAttachments ? "image" : "text",
      reply_to_message_id: replyToMessageId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      status: "sending",
      readBy: [],
      reactions: [],
      replyPreview: null,
      attachments: optimisticAttachments,
    };

    pendingTempIdsRef.current.set(trimmedContent || tempId, tempId);
    setMessages((prev) => [...prev, optimisticMessage]);

    const createdStoragePaths: string[] = [];
    let createdMessageId: string | null = null;

    try {
      const messageContent = trimmedContent || (hasAttachments ? "Photo" : "");

      const insertPayload: {
        conversation_id: string;
        sender_id: string;
        content: string;
        message_type: import("@/types/database").MessageType;
        reply_to_message_id?: string | null;
      } = {
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
        message_type: hasAttachments ? "image" : "text",
      };

      if (replyToMessageId) {
        insertPayload.reply_to_message_id = replyToMessageId;
      }

      const { data: insertedMsg, error: insertError } = await supabase
        .from("messages")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertError || !insertedMsg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? { ...m, status: "failed" } : m
          )
        );
        pendingTempIdsRef.current.delete(trimmedContent || tempId);
        return {
          success: false,
          error: insertError?.message || "Failed to send message.",
        };
      }

      createdMessageId = insertedMsg.id;

      // If attachments exist, upload each object and insert rows into public.attachments
      const finalAttachments: AttachmentWithUrl[] = [];

      if (hasAttachments) {
        for (const item of stagedAttachments!) {
          if (!item.processed) continue;
          const processed = item.processed;
          const storagePath = `${conversationId}/${insertedMsg.id}/${processed.fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from("chat-attachments")
            .upload(storagePath, processed.file, {
              contentType: processed.mimeType,
              upsert: false,
            });

          if (uploadErr) {
            throw new Error(`Upload failed: ${uploadErr.message}`);
          }

          createdStoragePaths.push(storagePath);

          const { data: insertedAtt, error: attDbErr } = await supabase
            .from("attachments")
            .insert({
              message_id: insertedMsg.id,
              storage_path: storagePath,
              file_name: processed.originalFileName,
              file_type: processed.mimeType,
              file_size: processed.fileSize,
              width: processed.width,
              height: processed.height,
            })
            .select("*")
            .single();

          if (attDbErr || !insertedAtt) {
            throw new Error(`Failed to save attachment metadata: ${attDbErr?.message}`);
          }

          const { data: signedData } = await supabase.storage
            .from("chat-attachments")
            .createSignedUrl(storagePath, 3600);

          finalAttachments.push({
            id: insertedAtt.id,
            messageId: insertedAtt.message_id,
            fileName: insertedAtt.file_name,
            fileType: insertedAtt.file_type,
            fileSize: insertedAtt.file_size,
            width: insertedAtt.width,
            height: insertedAtt.height,
            storagePath: insertedAtt.storage_path,
            signedUrl: signedData?.signedUrl || processed.previewUrl,
          });
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId
            ? {
                ...insertedMsg,
                status: "sent",
                readBy: [],
                reactions: [],
                replyPreview: null,
                attachments: finalAttachments,
              }
            : m
        )
      );

      pendingTempIdsRef.current.delete(trimmedContent || tempId);
      return { success: true };
    } catch (err: any) {
      // Compensating rollback: delete uploaded storage files & delete message row
      if (createdStoragePaths.length > 0) {
        try {
          await supabase.storage.from("chat-attachments").remove(createdStoragePaths);
        } catch {}
      }
      if (createdMessageId) {
        try {
          await supabase.from("messages").delete().eq("id", createdMessageId);
        } catch {}
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, status: "failed" } : m
        )
      );
      pendingTempIdsRef.current.delete(trimmedContent || tempId);
      return { success: false, error: err.message || "Failed to send message." };
    }
  };

  const sendReply = (
    content: string,
    replyToMessageId: string,
    stagedAttachments?: PendingAttachment[]
  ): Promise<{ success: boolean; error?: string }> =>
    sendMessage(content, replyToMessageId, stagedAttachments);

  const retryMessage = async (failedMsg: ChatMessage) => {
    if (!failedMsg.content && (!failedMsg.attachments || failedMsg.attachments.length === 0)) return;
    setMessages((prev) =>
      prev.filter(
        (m) => m.id !== failedMsg.id && m.tempId !== failedMsg.tempId
      )
    );
    await sendMessage(failedMsg.content, failedMsg.reply_to_message_id);
  };

  // ─── Add reaction (optimistic + rollback) ────────────────────────────────────

  const addReaction = async (
    messageId: string,
    reaction: ReactionType
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions || [];
        const found = reactions.find((r) => r.reaction === reaction);
        if (found) {
          if (found.userIds.includes(user.id)) return m; // already added
          return {
            ...m,
            reactions: reactions.map((r) =>
              r.reaction === reaction
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, user.id] }
                : r
            ),
          };
        }
        return {
          ...m,
          reactions: [
            ...reactions,
            { reaction, count: 1, userIds: [user.id] },
          ],
        };
      })
    );

    try {
      const { error } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        reaction,
      });

      if (error) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = (m.reactions || [])
              .map((r) => {
                if (r.reaction !== reaction) return r;
                const newUserIds = r.userIds.filter((id) => id !== user.id);
                return { ...r, count: newUserIds.length, userIds: newUserIds };
              })
              .filter((r) => r.count > 0);
            return { ...m, reactions };
          })
        );
        return { success: false, error: "Unable to add reaction." };
      }

      return { success: true };
    } catch {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = (m.reactions || [])
            .map((r) => {
              if (r.reaction !== reaction) return r;
              const newUserIds = r.userIds.filter((id) => id !== user.id);
              return { ...r, count: newUserIds.length, userIds: newUserIds };
            })
            .filter((r) => r.count > 0);
          return { ...m, reactions };
        })
      );
      return { success: false, error: "Network error adding reaction." };
    }
  };

  // ─── Remove reaction (optimistic + rollback) ─────────────────────────────────

  const removeReaction = async (
    messageId: string,
    reaction: ReactionType
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    const originalMsg = messagesRef.current.find((m) => m.id === messageId);
    const snapshot = originalMsg?.reactions || [];

    // Optimistic remove
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const updated = (m.reactions || [])
          .map((r) => {
            if (r.reaction !== reaction) return r;
            const newUserIds = r.userIds.filter((id) => id !== user.id);
            return { ...r, count: newUserIds.length, userIds: newUserIds };
          })
          .filter((r) => r.count > 0);
        return { ...m, reactions: updated };
      })
    );

    try {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("reaction", reaction);

      if (error) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: snapshot } : m))
        );
        return { success: false, error: "Unable to remove reaction." };
      }

      return { success: true };
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: snapshot } : m))
      );
      return { success: false, error: "Network error removing reaction." };
    }
  };

  // ─── Edit message (optimistic + rollback) ─────────────────────────────────────

  const editMessage = async (
    messageId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    const validationErr = validateMessageContent(newContent);
    if (validationErr) return { success: false, error: validationErr };

    const trimmedContent = newContent.trim();
    const originalMsg = messagesRef.current.find((m) => m.id === messageId);

    if (!originalMsg) return { success: false, error: "Message not found." };
    if (originalMsg.sender_id !== user.id)
      return { success: false, error: "You can only edit your own messages." };
    if (originalMsg.deleted_at)
      return { success: false, error: "Cannot edit a deleted message." };

    const snapshotContent = originalMsg.content;
    const snapshotUpdatedAt = originalMsg.updated_at;

    // Optimistic edit
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: trimmedContent, updated_at: new Date().toISOString() }
          : m
      )
    );

    try {
      const { error } = await supabase
        .from("messages")
        .update({ content: trimmedContent })
        .eq("id", messageId)
        .eq("sender_id", user.id)
        .is("deleted_at", null);

      if (error) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: snapshotContent, updated_at: snapshotUpdatedAt }
              : m
          )
        );
        return { success: false, error: error.message || "Failed to edit message." };
      }

      return { success: true };
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: snapshotContent, updated_at: snapshotUpdatedAt }
            : m
        )
      );
      return { success: false, error: "Failed to edit message." };
    }
  };

  // ─── Soft-delete message (optimistic + rollback) ──────────────────────────────

  const deleteMessage = async (
    messageId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: "Not authenticated" };

    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg) return { success: false, error: "Message not found." };
    if (msg.sender_id !== user.id)
      return { success: false, error: "You can only delete your own messages." };
    if (msg.deleted_at)
      return { success: false, error: "Message is already deleted." };

    const deletedAt = new Date().toISOString();

    // Optimistic soft-delete: immediately wipe attachments from rendered state
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deleted_at: deletedAt, attachments: [] } : m
      )
    );

    try {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: deletedAt })
        .eq("id", messageId)
        .eq("sender_id", user.id)
        .is("deleted_at", null);

      if (error) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, deleted_at: null, attachments: msg.attachments } : m
          )
        );
        return {
          success: false,
          error: error.message || "Failed to delete message.",
        };
      }

      return { success: true };
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deleted_at: null, attachments: msg.attachments } : m
        )
      );
      return { success: false, error: "Failed to delete message." };
    }
  };

  return {
    messages,
    isLoading,
    isLoadingOlder,
    hasMore,
    error,
    connectionStatus,
    sendMessage,
    sendReply,
    retryMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    loadOlderMessages,
    refreshMessages: fetchMessages,
  };
}
