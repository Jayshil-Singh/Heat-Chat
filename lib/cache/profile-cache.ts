/**
 * Heat Chat — In-Memory Session Profile Cache
 * Phase 12 Performance & Reliability
 *
 * Requirements:
 * - Strictly memory-only (never in localStorage, sessionStorage, IndexedDB, or Service Worker)
 * - 5-minute bounded TTL
 * - Stale entries are ignored/evicted
 * - Thread-safe & non-persistent
 * - Only stores authorized profile projections (id, display_name, username, avatar_url, bio)
 */

import type { Profile } from "@/types/database";

interface CachedProfileEntry {
  profile: Profile;
  expiresAt: number;
}

const PROFILE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500; // Bound memory footprint

const memoryProfileCache = new Map<string, CachedProfileEntry>();

/**
 * Retrieve a cached profile if present and unexpired.
 */
export function getCachedProfile(userId: string): Profile | null {
  if (!userId) return null;
  const entry = memoryProfileCache.get(userId);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryProfileCache.delete(userId);
    return null;
  }

  return entry.profile;
}

/**
 * Retrieve multiple cached profiles; returns a Map of found profiles and an array of missing user IDs.
 */
export function getCachedProfiles(userIds: string[]): {
  cached: Map<string, Profile>;
  missingIds: string[];
} {
  const cached = new Map<string, Profile>();
  const missingIds: string[] = [];

  const now = Date.now();
  for (const id of userIds) {
    if (!id) continue;
    const entry = memoryProfileCache.get(id);
    if (entry && now <= entry.expiresAt) {
      cached.set(id, entry.profile);
    } else {
      if (entry) memoryProfileCache.delete(id); // Evict stale
      missingIds.push(id);
    }
  }

  return { cached, missingIds };
}

/**
 * Store or update a profile in memory.
 */
export function setCachedProfile(profile: Profile): void {
  if (!profile?.id) return;

  // Evict oldest entry if size limit reached
  if (memoryProfileCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoryProfileCache.keys().next().value;
    if (oldestKey) memoryProfileCache.delete(oldestKey);
  }

  memoryProfileCache.set(profile.id, {
    profile,
    expiresAt: Date.now() + PROFILE_TTL_MS,
  });
}

/**
 * Store multiple profiles in memory.
 */
export function setCachedProfiles(profiles: Profile[]): void {
  for (const p of profiles) {
    setCachedProfile(p);
  }
}

/**
 * Invalidate a profile from cache (e.g. on profile edit).
 */
export function invalidateCachedProfile(userId: string): void {
  memoryProfileCache.delete(userId);
}

/**
 * Clear the entire memory cache.
 */
export function clearProfileCache(): void {
  memoryProfileCache.clear();
}

/**
 * Diagnostic helper for testing.
 */
export function getProfileCacheSize(): number {
  return memoryProfileCache.size;
}
