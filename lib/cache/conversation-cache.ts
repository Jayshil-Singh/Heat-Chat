/**
 * Heat Chat — In-Memory Conversation Message Cache
 * Phase 13 Instant UX & Connection Reliability
 *
 * Requirements:
 * - Strictly memory-only (never in localStorage, sessionStorage, IndexedDB, or Service Worker)
 * - 5-minute bounded TTL
 * - Bounded size (maximum 50 active conversations) with LRU eviction
 * - Thread-safe & non-persistent
 * - Cleared automatically on user logout / account switch
 * - Provides instant conversation switching without network waterfalls
 */

import type { ChatMessage } from "@/types/chat";

interface CachedConversationEntry {
  messages: ChatMessage[];
  expiresAt: number;
  lastAccessed: number;
}

const CONVERSATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHED_CONVERSATIONS = 50; // Bound memory footprint

const memoryConversationCache = new Map<string, CachedConversationEntry>();

/**
 * Retrieve cached messages for a conversation if present and unexpired.
 */
export function getCachedConversationMessages(conversationId: string): ChatMessage[] | null {
  if (!conversationId) return null;
  const entry = memoryConversationCache.get(conversationId);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expiresAt) {
    memoryConversationCache.delete(conversationId);
    return null;
  }

  // Update LRU touch timestamp
  entry.lastAccessed = now;
  return entry.messages;
}

/**
 * Store or update messages for a conversation in memory.
 */
export function setCachedConversationMessages(conversationId: string, messages: ChatMessage[]): void {
  if (!conversationId || !messages) return;

  const now = Date.now();

  // If over capacity, evict least-recently-accessed entry
  if (memoryConversationCache.size >= MAX_CACHED_CONVERSATIONS && !memoryConversationCache.has(conversationId)) {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, val] of memoryConversationCache.entries()) {
      if (val.lastAccessed < oldestAccess) {
        oldestAccess = val.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      memoryConversationCache.delete(oldestKey);
    }
  }

  memoryConversationCache.set(conversationId, {
    messages,
    expiresAt: now + CONVERSATION_CACHE_TTL_MS,
    lastAccessed: now,
  });
}

/**
 * Update cached messages using an updater function (e.g. for optimistic append or realtime update).
 */
export function updateCachedConversationMessages(
  conversationId: string,
  updater: (prev: ChatMessage[]) => ChatMessage[]
): void {
  if (!conversationId) return;
  const current = getCachedConversationMessages(conversationId);
  if (current) {
    const updated = updater(current);
    setCachedConversationMessages(conversationId, updated);
  }
}

/**
 * Invalidate a conversation's cached messages (e.g. on leave group, clear chat, or message delete).
 */
export function invalidateCachedConversation(conversationId: string): void {
  memoryConversationCache.delete(conversationId);
}

/**
 * Clear the entire memory message cache (mandatory on logout / session termination).
 */
export function clearConversationCache(): void {
  memoryConversationCache.clear();
}

/**
 * Diagnostic helper for testing.
 */
export function getConversationCacheSize(): number {
  return memoryConversationCache.size;
}
