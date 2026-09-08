"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import { useNotificationPreferences } from "./use-notification-preferences";
import { useNotificationPermission } from "./use-notification-permission";
import { playNotificationSound, clearSoundCache } from "@/lib/audio/sound-cue";
import {
  isToastDeduplicated,
  recordToastPresented,
  clearToastDedupeCache,
} from "@/components/notifications/notification-toast";
import {
  getCachedProfiles,
  setCachedProfiles,
} from "@/lib/cache/profile-cache";
import type { Notification, Profile, Conversation } from "@/types/database";
import type { NotificationWithDetails } from "@/types/chat";

const PAGE_SIZE = 25;
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const DEDUPE_MAX_ENTRIES = 1000;
const TOAST_MAX_ENTRIES = 500;
const SOUND_MAX_ENTRIES = 250;
const BROADCAST_CHANNEL_NAME = "heat-chat-notifications";

interface MultiTabMessage {
  type:
    | "notification:new"
    | "notification:read"
    | "notification:read-all"
    | "notification:sync"
    | "presenter:claim"
    | "notification:presented";
  id?: string;
  payload?: NotificationWithDetails;
  timestamp?: string | number;
  unreadCount?: number;
  tabId?: string;
}

export function useNotifications(currentActiveConversationId?: string | null) {
  const { user } = useAuth();
  const { preferences, isConversationMuted } = useNotificationPreferences();
  const { showDesktopNotification } = useNotificationPermission();

  const [notifications, setNotifications] = React.useState<NotificationWithDetails[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [toasts, setToasts] = React.useState<NotificationWithDetails[]>([]);
  const [isReconnecting, setIsReconnecting] = React.useState(false);

  // Exponential reconnect backoff tracking
  const reconnectAttemptRef = React.useRef<number>(0);
  const reconnectTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const activeChannelRef = React.useRef<any>(null);

  // Ephemeral tab identifier to prevent echo loops across multi-tab BroadcastChannel
  const tabIdRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab_${Math.random().toString(36).slice(2)}`
  );

  // Presenter election state
  const isPresenterRef = React.useRef<boolean>(false);
  const lastPresenterClaimTimeRef = React.useRef<number>(0);

  // Bounded memory deduplication caches (TTL 5 mins)
  // Max 1000 notification IDs
  const dedupeCacheRef = React.useRef<Map<string, number>>(new Map());
  // Max 500 toast IDs
  const toastDedupeCacheRef = React.useRef<Map<string, number>>(new Map());
  // Max 250 sound IDs
  const soundDedupeCacheRef = React.useRef<Map<string, number>>(new Map());

  // Cursor tracking for pagination
  const cursorRef = React.useRef<{ createdAt: string; id: string } | null>(null);

  // Active conversation & reconnect reconciliation refs
  const activeConvIdRef = React.useRef<string | null>(currentActiveConversationId || null);
  const lastSeenTimestampRef = React.useRef<string>(new Date().toISOString());
  const hasConnectedOnceRef = React.useRef<boolean>(false);
  const isMountedRef = React.useRef<boolean>(true);

  // Race protection with sequence generation and AbortController
  const reqGenRef = React.useRef<number>(0);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Coalescing queue for rapid realtime event bursts (150ms)
  const burstQueueRef = React.useRef<Notification[]>([]);
  const burstTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Multi-tab BroadcastChannel
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null);

  React.useEffect(() => {
    activeConvIdRef.current = currentActiveConversationId || null;
  }, [currentActiveConversationId]);

  const supabase = React.useMemo(() => createClient(), []);

  // Helper to test and record event deduplication (Max 1000 entries, 5m TTL)
  const checkAndRecordDedupe = React.useCallback((key: string): boolean => {
    if (!key) return false;
    const now = Date.now();
    const cache = dedupeCacheRef.current;

    const existingTime = cache.get(key);
    if (existingTime && now - existingTime < DEDUPE_TTL_MS) {
      return true; // Duplicate within TTL window
    }

    if (cache.size >= DEDUPE_MAX_ENTRIES) {
      const oldestEntries = Array.from(cache.entries())
        .filter(([, time]) => now - time >= DEDUPE_TTL_MS)
        .map(([k]) => k);
      oldestEntries.forEach((k) => cache.delete(k));
      if (cache.size >= DEDUPE_MAX_ENTRIES) {
        const keys = Array.from(cache.keys()).slice(0, 100);
        keys.forEach((k) => cache.delete(k));
      }
    }

    cache.set(key, now);
    return false;
  }, []);

  // Bounded toast presentation deduplication (Max 500 entries, 5m TTL)
  const checkAndRecordToastDedupe = React.useCallback((key: string): boolean => {
    if (!key) return false;
    if (isToastDeduplicated(key)) return true;
    const now = Date.now();
    const cache = toastDedupeCacheRef.current;

    const existingTime = cache.get(key);
    if (existingTime && now - existingTime < DEDUPE_TTL_MS) {
      return true;
    }

    if (cache.size >= TOAST_MAX_ENTRIES) {
      for (const [k, time] of cache.entries()) {
        if (now - time >= DEDUPE_TTL_MS) cache.delete(k);
      }
      if (cache.size >= TOAST_MAX_ENTRIES) {
        const keys = Array.from(cache.keys()).slice(0, 50);
        keys.forEach((k) => cache.delete(k));
      }
    }

    cache.set(key, now);
    recordToastPresented(key);
    return false;
  }, []);

  // Bounded sound presentation deduplication (Max 250 entries, 5m TTL)
  const checkAndRecordSoundDedupe = React.useCallback((key: string): boolean => {
    if (!key) return false;
    const now = Date.now();
    const cache = soundDedupeCacheRef.current;

    const existingTime = cache.get(key);
    if (existingTime && now - existingTime < DEDUPE_TTL_MS) {
      return true;
    }

    if (cache.size >= SOUND_MAX_ENTRIES) {
      for (const [k, time] of cache.entries()) {
        if (now - time >= DEDUPE_TTL_MS) cache.delete(k);
      }
      if (cache.size >= SOUND_MAX_ENTRIES) {
        const keys = Array.from(cache.keys()).slice(0, 25);
        keys.forEach((k) => cache.delete(k));
      }
    }

    cache.set(key, now);
    return false;
  }, []);

  // Broadcast multi-tab message safely
  const broadcast = React.useCallback((msg: MultiTabMessage & { originTabId?: string }) => {
    try {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          ...msg,
          originTabId: tabIdRef.current,
        });
      }
    } catch {
      // BroadcastChannel post failure is non-fatal
    }
  }, []);

  // Presenter election: claim presentation lease when tab is visible and focused
  const claimPresenterLease = React.useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible" && document.hasFocus()) {
      isPresenterRef.current = true;
      lastPresenterClaimTimeRef.current = Date.now();
      broadcast({
        type: "presenter:claim",
        tabId: tabIdRef.current,
        timestamp: Date.now(),
      });
    }
  }, [broadcast]);

  // Fetch authoritative unread count from server
  const fetchAuthoritativeUnreadCount = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc("get_notification_unread_count");
      if (!error && typeof data === "number" && isMountedRef.current) {
        setUnreadCount(Math.max(0, data));
      }
    } catch {
      // Non-fatal, keep current unread count
    }
  }, [user?.id, supabase]);

  // Enrich raw notification records with profiles, conversations, and safe message previews
  const enrichNotifications = React.useCallback(
    async (
      rawNotifs: (Notification & { recipient_id?: string; metadata?: any; friend_request_id?: string | null })[]
    ): Promise<NotificationWithDetails[]> => {
      if (!rawNotifs || rawNotifs.length === 0) return [];

      // 1. Batch-fetch sender profiles using in-memory cache
      const senderIds = Array.from(
        new Set(rawNotifs.map((n) => n.sender_id || (n as any).actor_id).filter(Boolean))
      ) as string[];

      const { cached: cachedProfiles, missingIds } = getCachedProfiles(senderIds);
      const profileMap = new Map<string, Profile>(cachedProfiles);

      if (missingIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url, status")
            .in("id", missingIds);

          (profiles || []).forEach((p) => profileMap.set(p.id, p as Profile));
          setCachedProfiles((profiles || []) as Profile[]);
        } catch {
          // Profile batch fetch error non-blocking
        }
      }

      // 2. Batch-fetch conversations
      const convIds = Array.from(
        new Set(rawNotifs.map((n) => n.conversation_id).filter(Boolean))
      ) as string[];

      const convMap = new Map<string, Conversation>();
      if (convIds.length > 0) {
        try {
          const { data: convs } = await supabase
            .from("conversations")
            .select("id, name, type")
            .in("id", convIds);

          (convs || []).forEach((c) => convMap.set(c.id, c as Conversation));
        } catch {
          // Conversation batch fetch error non-blocking
        }
      }

      // 3. Batch-fetch messages for safe preview
      const msgIds = Array.from(
        new Set(rawNotifs.map((n) => n.message_id).filter(Boolean))
      ) as string[];

      const msgMap = new Map<string, { content: string; message_type: string; deleted_at: string | null }>();
      if (msgIds.length > 0) {
        try {
          const { data: msgs } = await supabase
            .from("messages")
            .select("id, content, message_type, deleted_at")
            .in("id", msgIds);

          (msgs || []).forEach((m) => msgMap.set(m.id, m));
        } catch {
          // Message batch fetch error non-blocking
        }
      }

      // 4. Construct safe, sanitized detailed notification objects
      return rawNotifs.map((n) => {
        const senderId = n.sender_id || (n as any).actor_id || "";
        const sender = profileMap.get(senderId) || null;
        const conv = n.conversation_id ? convMap.get(n.conversation_id) : undefined;
        const msg = n.message_id ? msgMap.get(n.message_id) : null;

        const isDeleted = Boolean(msg?.deleted_at);
        let preview = "";

        const notifType = n.type || (n as any).event_type || "message";

        if (
          notifType === "friend_request_accepted" ||
          (notifType.startsWith("friend") && notifType.includes("accept"))
        ) {
          preview = (n as any).body || "accepted your friend request";
        } else if (notifType === "friend_request" || notifType.startsWith("friend")) {
          preview = (n as any).body || "sent you a friend request";
        } else if (notifType === "reaction") {
          preview = (n as any).body || "reacted to your message";
        } else if (isDeleted) {
          preview = "This message was deleted";
        } else if (msg?.message_type === "image" && !msg?.content?.trim()) {
          preview = "📷 Photo";
        } else if (msg?.message_type === "voice") {
          preview = "🎤 Voice message";
        } else {
          preview = msg?.content || (n as any).body || "New notification";
        }

        const senderName = sender?.display_name || "Friend";
        const convName =
          conv?.name ||
          senderName ||
          (notifType.startsWith("friend") ? "Friend Request" : "Conversation");

        const isRead = Boolean(n.read_at || (n as any).is_read);

        return {
          id: n.id,
          userId: n.user_id || n.recipient_id || "",
          recipientId: n.recipient_id || n.user_id || "",
          conversationId: n.conversation_id,
          messageId: n.message_id,
          friendRequestId: n.friend_request_id || null,
          senderId,
          type: notifType,
          readAt: n.read_at,
          isRead,
          createdAt: n.created_at,
          sender: sender || null,
          conversationName: convName,
          conversationType: conv?.type || "direct",
          preview,
          isDeleted,
          metadata: n.metadata || (n as any).data || {},
          dedupeKey: (n as any).dedupe_key || null,
        };
      });
    },
    [supabase]
  );

  // Fetch initial notifications with race protection (AbortController + sequence number)
  const fetchNotifications = React.useCallback(async () => {
    if (!user?.id) {
      dedupeCacheRef.current.clear();
      toastDedupeCacheRef.current.clear();
      soundDedupeCacheRef.current.clear();
      burstQueueRef.current = [];
      cursorRef.current = null;
      if (isMountedRef.current) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        setHasMore(false);
        setIsReconnecting(false);
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;
    const currentGen = ++reqGenRef.current;

    try {
      setIsLoading(true);

      // Enforce notification isolation for authenticated user: .eq("user_id", user.id)
      const [notifsRes, countRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
        supabase.rpc("get_notification_unread_count"),
      ]);

      if (ac.signal.aborted || currentGen !== reqGenRef.current || !isMountedRef.current) {
        return;
      }

      if (notifsRes.error) throw notifsRes.error;
      const rawNotifs = notifsRes.data || [];

      // Record dedupes for fetched items
      rawNotifs.forEach((n) => {
        checkAndRecordDedupe(n.id);
        if ((n as any).dedupe_key) checkAndRecordDedupe((n as any).dedupe_key);
      });

      const detailed = await enrichNotifications(rawNotifs);

      if (ac.signal.aborted || currentGen !== reqGenRef.current || !isMountedRef.current) {
        return;
      }

      setNotifications(detailed);
      if (!countRes.error && typeof countRes.data === "number") {
        setUnreadCount(Math.max(0, countRes.data));
      } else {
        setUnreadCount(detailed.filter((d) => !d.isRead).length);
      }

      if (detailed.length > 0) {
        const lastItem = detailed[detailed.length - 1];
        cursorRef.current = { createdAt: lastItem.createdAt, id: lastItem.id };
        setHasMore(detailed.length >= PAGE_SIZE);
        lastSeenTimestampRef.current = detailed[0].createdAt;
      } else {
        cursorRef.current = null;
        setHasMore(false);
        lastSeenTimestampRef.current = new Date().toISOString();
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("Error loading notifications:", err);
      }
    } finally {
      if (currentGen === reqGenRef.current && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [user?.id, supabase, enrichNotifications, checkAndRecordDedupe]);

  // Load more notifications using (created_at, id) cursor with race protection
  const loadMore = React.useCallback(async () => {
    if (!user?.id || !cursorRef.current || !hasMore || isLoadingMore) return;

    const currentGen = ++reqGenRef.current;

    try {
      setIsLoadingMore(true);
      const cursor = cursorRef.current;

      const { data: rawNotifs, error } = await supabase
        .from("notifications")
        .select("*")
        .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .is("deleted_at", null)
        .lt("created_at", cursor.createdAt)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (currentGen !== reqGenRef.current || !isMountedRef.current) return;
      if (error) throw error;

      if (!rawNotifs || rawNotifs.length === 0) {
        setHasMore(false);
        return;
      }

      rawNotifs.forEach((n) => {
        checkAndRecordDedupe(n.id);
        if ((n as any).dedupe_key) checkAndRecordDedupe((n as any).dedupe_key);
      });

      const detailed = await enrichNotifications(rawNotifs);
      if (currentGen !== reqGenRef.current || !isMountedRef.current) return;

      setNotifications((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = detailed.filter((d) => !existingIds.has(d.id));
        return [...prev, ...newItems];
      });

      const lastItem = detailed[detailed.length - 1];
      cursorRef.current = { createdAt: lastItem.createdAt, id: lastItem.id };
      setHasMore(detailed.length >= PAGE_SIZE);
    } catch (err) {
      console.warn("Error loading more notifications:", err);
    } finally {
      if (currentGen === reqGenRef.current && isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [user?.id, hasMore, isLoadingMore, supabase, enrichNotifications, checkAndRecordDedupe]);

  // Process a coalesced batch of incoming realtime notifications (Burst coalescing <= 150ms)
  const processBurstQueue = React.useCallback(async () => {
    const batch = burstQueueRef.current.splice(0);
    if (batch.length === 0 || !user?.id) return;

    // Filter out self-notifications and duplicates
    const uniqueBatch = batch.filter((rawNotif) => {
      const senderId = rawNotif.sender_id || (rawNotif as any).actor_id;
      if (senderId === user.id) return false;
      if (rawNotif.sender_id === user?.id) return false;

      const key = rawNotif.id || (rawNotif as any).dedupe_key;
      return !checkAndRecordDedupe(key);
    });

    if (uniqueBatch.length === 0) return;

    const detailedItems = await enrichNotifications(uniqueBatch);
    if (!isMountedRef.current || detailedItems.length === 0) return;

    // Prepend new items to state without duplicates
    // setNotifications((prev) => [item, ...prev.filter((p) => p.id !== item.id)])
    setNotifications((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const processedNotifIds = existingIds;
      const filteredNew = detailedItems.filter((item) => !existingIds.has(item.id));
      if (filteredNew.length === 0) return prev;
      return [...filteredNew, ...prev];
    });

    // Determine presentation targets (toasts, sounds, haptics)
    const newToasts: NotificationWithDetails[] = [];
    let unsuppressedCount = 0;

    // Presenter election: Only one tab should show toast/play sound
    const isElectedPresenter =
      isPresenterRef.current ||
      (typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        Date.now() - lastPresenterClaimTimeRef.current > 5000);

    detailedItems.forEach((item) => {
      const isActive = activeConvIdRef.current === item.conversationId;
      const isMuted = item.conversationId ? isConversationMuted(item.conversationId) : false;
      const isGlobalDisabled = !preferences.notifications_enabled;

      if (!item.isRead) {
        unsuppressedCount++;
      }

      // Check granular category preference
      const notifType = (item as any).type || "message";
      const isSecurity = ["security", "security_alert", "password_changed", "new_device_login"].includes(notifType);
      let isCategoryAllowed = true;
      if (!isSecurity) {
        if (notifType === "message") isCategoryAllowed = preferences.messages_notify ?? true;
        else if (notifType === "mention") isCategoryAllowed = preferences.mentions_notify ?? true;
        else if (notifType === "reaction") isCategoryAllowed = preferences.reactions_notify ?? true;
        else if (notifType.startsWith("friend")) isCategoryAllowed = preferences.friend_activity_notify ?? true;
      }

      if (!isActive && !isMuted && !isGlobalDisabled) {
        if (isCategoryAllowed && !checkAndRecordToastDedupe(item.id)) {
          newToasts.push(item);
        }
      }

      // Broadcast to other open browser tabs
      broadcast({ type: "notification:new", payload: item });
    });

    if (unsuppressedCount > 0) {
      setUnreadCount((prev) => prev + unsuppressedCount);
    }

    // Only elected presenter presents audio, haptic, and in-app toast
    if (newToasts.length > 0 && isElectedPresenter) {
      const top = newToasts[0];

      // Audio cue & haptics with deduplication
      if (preferences.sound_enabled && !checkAndRecordSoundDedupe(top.id)) {
        playNotificationSound();
      }

      // Desktop notification
      if (preferences.desktop_notifications_enabled) {
        const title =
          top.conversationType === "group" && top.conversationName
            ? `${top.sender?.display_name || "Someone"} in ${top.conversationName}`
            : top.sender?.display_name || "Heat Chat";

        const bodyText = preferences.message_preview_enabled
          ? top.preview
          : `New message from ${top.sender?.display_name || "a friend"}`;

        showDesktopNotification(title, {
          body: bodyText,
          tag: top.conversationId || undefined,
        });
      }

      // Add to in-app toasts
      setToasts((prev) => [...prev, ...newToasts.slice(0, 3)]);

      // Inform other tabs that these notifications were presented
      newToasts.forEach((t) => {
        broadcast({ type: "notification:presented", id: t.id });
      });
    }

    if (detailedItems[0]) {
      lastSeenTimestampRef.current = detailedItems[0].createdAt;
    }
  }, [
    user?.id,
    checkAndRecordDedupe,
    checkAndRecordToastDedupe,
    checkAndRecordSoundDedupe,
    enrichNotifications,
    preferences,
    isConversationMuted,
    showDesktopNotification,
    broadcast,
  ]);

  // Queue an incoming realtime event with 150ms debounce
  const queueIncomingEvent = React.useCallback(
    (rawNotif: Notification) => {
      if (rawNotif.sender_id === user?.id) return;

      burstQueueRef.current.push(rawNotif);
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
      }
      burstTimerRef.current = setTimeout(() => {
        processBurstQueue();
      }, 150);
    },
    [processBurstQueue, user?.id]
  );

  // Cross-device and reconnect reconciliation: fetch unread count and newer notifications
  const reconcileOnReconnect = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const since = lastSeenTimestampRef.current;
      const [missedRes, countRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .is("deleted_at", null)
          .gt("created_at", since)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
        supabase.rpc("get_notification_unread_count"),
      ]);

      if (!countRes.error && typeof countRes.data === "number" && isMountedRef.current) {
        setUnreadCount(Math.max(0, countRes.data));
      }

      if (missedRes.data && missedRes.data.length > 0 && isMountedRef.current) {
        const enrichedMissed = await enrichNotifications(missedRes.data);
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = enrichedMissed.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        });
        if (enrichedMissed[0]) {
          lastSeenTimestampRef.current = enrichedMissed[0].createdAt;
        }
      }
    } catch (err) {
      console.warn("Error reconciling notifications:", err);
    }
  }, [user?.id, supabase, enrichNotifications]);
  const reconcileMissedNotifications = reconcileOnReconnect;

  // Initial load
  React.useEffect(() => {
    isMountedRef.current = true;
    fetchNotifications();

    return () => {
      isMountedRef.current = false;
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, [fetchNotifications]);

  // Multi-tab presentation election & synchronization via BroadcastChannel
  React.useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window) || !user?.id) {
      return;
    }

    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannelRef.current = bc;

    bc.onmessage = (event: MessageEvent<MultiTabMessage & { originTabId?: string }>) => {
      const msg = event.data;
      if (!msg || !isMountedRef.current) return;
      if (msg.originTabId && msg.originTabId === tabIdRef.current) return;

      if (msg.type === "presenter:claim") {
        // Another tab has claimed presentation lease
        if (msg.tabId !== tabIdRef.current) {
          isPresenterRef.current = false;
          lastPresenterClaimTimeRef.current = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
        }
      } else if (msg.type === "notification:presented" && msg.id) {
        // Mark as presented in local memory deduplication cache so this tab won't show it again
        checkAndRecordToastDedupe(msg.id);
        checkAndRecordSoundDedupe(msg.id);
      } else if (msg.type === "notification:read" && msg.id) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === msg.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else if (msg.type === "notification:read-all") {
        const now = typeof msg.timestamp === "string" ? msg.timestamp : new Date().toISOString();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || now })));
        setUnreadCount(0);
      } else if (msg.type === "notification:sync" && typeof msg.unreadCount === "number") {
        setUnreadCount(Math.max(0, msg.unreadCount));
      } else if (msg.type === "notification:new" && msg.payload) {
        const item = msg.payload;
        setNotifications((prev) => {
          if (prev.some((p) => p.id === item.id)) return prev;
          return [item, ...prev];
        });
        if (!item.isRead) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    };

    claimPresenterLease();

    const handleFocus = () => claimPresenterLease();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      bc.close();
      broadcastChannelRef.current = null;
    };
  }, [user?.id, claimPresenterLease, checkAndRecordToastDedupe, checkAndRecordSoundDedupe]);

  // Cross-device reconciliation on focus, visibility change, and network recovery (~300ms debounce)
  React.useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const triggerReconciliation = () => {
      if (document.visibilityState !== "visible") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchAuthoritativeUnreadCount();
        reconcileOnReconnect();
      }, 300);
    };

    const handleFocus = () => triggerReconciliation();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerReconciliation();
      }
    };
    const handleOnline = () => triggerReconciliation();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [user?.id, fetchAuthoritativeUnreadCount, reconcileMissedNotifications]);

  // Logout / SIGNED_OUT purge
  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        dedupeCacheRef.current.clear();
        toastDedupeCacheRef.current.clear();
        soundDedupeCacheRef.current.clear();
        burstQueueRef.current = [];
        cursorRef.current = null;
        isPresenterRef.current = false;
        clearToastDedupeCache();
        clearSoundCache();
        if (isMountedRef.current) {
          setNotifications([]);
          setUnreadCount(0);
          setToasts([]);
          setIsLoading(false);
          setHasMore(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Bounded exponential reconnect backoff: 1s, 2s, 4s, 8s, 16s, max 30s
  const getBackoffDelay = React.useCallback((attempt: number): number => {
    const delays = [1000, 2000, 4000, 8000, 16000, 30000];
    return delays[Math.min(attempt, delays.length - 1)];
  }, []);

  // Realtime subscription with bounded exponential backoff
  React.useEffect(() => {
    if (!user?.id) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      setIsReconnecting(false);
      return;
    }

    const channelName = `user-notifs-${user.id}`;
    let channel: any = null;

    const subscribeToChannel = () => {
      if (!isMountedRef.current || !user?.id) return;

      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.new) {
              queueIncomingEvent(payload.new as Notification);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.new) {
              const updated = payload.new as Notification;
              const isReadNow = Boolean(updated.read_at || (updated as any).is_read);

              setNotifications((prev) =>
                prev.map((n) =>
                  n.id === updated.id
                    ? { ...n, readAt: updated.read_at, isRead: isReadNow }
                    : n
                )
              );

              if (isReadNow) {
                fetchAuthoritativeUnreadCount();
              }
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.old?.id) {
              setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
              fetchAuthoritativeUnreadCount();
            }
          }
        )
        .subscribe((status) => {
          if (!isMountedRef.current) return;

          if (status === "SUBSCRIBED") {
            reconnectAttemptRef.current = 0;
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            setIsReconnecting(false);

            if (hasConnectedOnceRef.current) {
              reconcileMissedNotifications();
            }
            hasConnectedOnceRef.current = true;
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (!isMountedRef.current || !user?.id) return;
            setIsReconnecting(true);

            const delay = getBackoffDelay(reconnectAttemptRef.current);
            reconnectAttemptRef.current += 1;

            if (!reconnectTimerRef.current) {
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (isMountedRef.current && user?.id) {
                  subscribeToChannel();
                }
              }, delay);
            }
          }
        });

      activeChannelRef.current = channel;
    };

    subscribeToChannel();

    return () => {
      supabase.removeChannel(channel);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }
    };
  }, [
    user?.id,
    supabase,
    queueIncomingEvent,
    reconcileMissedNotifications,
    fetchAuthoritativeUnreadCount,
    getBackoffDelay,
  ]);

  // Mark single notification as read
  const markAsRead = React.useCallback(
    async (notifId: string) => {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId ? { ...n, isRead: true, readAt: n.readAt || now } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      broadcast({ type: "notification:read", id: notifId });

      try {
        await (supabase.rpc as any)("mark_notification_read", {
          notification_id: notifId,
        });
      } catch {
        try {
          await (supabase.rpc as any)("mark_notification_as_read", {
            notif_id: notifId,
          });
        } catch (err) {
          console.warn("Failed to mark notification read:", err);
        }
      }
    },
    [supabase, broadcast]
  );

  // Mark all notifications as read
  const markAllAsRead = React.useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || now })));
    setUnreadCount(0);

    broadcast({ type: "notification:read-all", timestamp: now });

    try {
      await (supabase.rpc as any)("mark_all_notifications_read");
    } catch {
      try {
        await (supabase.rpc as any)("mark_all_notifications_as_read");
      } catch (err) {
        console.warn("Failed to mark all notifications read:", err);
      }
    }
  }, [supabase, broadcast]);

  // Dismiss an in-app toast
  const dismissToast = React.useCallback((notifId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== notifId));
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    isReconnecting,
    loadMore,
    toasts,
    dismissToast,
    markAsRead,
    markAllAsRead,
    refreshNotifications: fetchNotifications,
  };
}
