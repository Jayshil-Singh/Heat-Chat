/**
 * Heat Chat — Mention Parsing & Extraction Utility
 *
 * Pattern matches `@username` where usernames consist of 3-30 alphanumeric chars and underscores.
 * Avoids false matches in email addresses (e.g. `test@example.com`).
 */

// Matches @username when preceded by whitespace, start-of-line, or punctuation
export const MENTION_REGEX = /(?:^|[\s.,!?;:()[\]{}'"])@([a-zA-Z0-9_]{3,30})(?=$|[\s.,!?;:()[\]{}'"])/g;

/**
 * Extracts a deduplicated array of lowercased usernames mentioned in text.
 * Capped at max 50 unique mentions.
 */
export function extractMentions(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match[1]) {
      matches.add(match[1].toLowerCase());
      if (matches.size >= 50) break;
    }
  }

  return Array.from(matches);
}

export interface MentionToken {
  type: "text" | "mention";
  value: string;
  username?: string;
}

/**
 * Tokenizes text into plain text chunks and `@username` mention tokens for safe React rendering.
 */
export function tokenizeMentions(text: string): MentionToken[] {
  if (!text) return [];

  const tokens: MentionToken[] = [];
  let lastIndex = 0;

  MENTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const username = match[1];
    const mentionIndex = match.index + (fullMatch.length - username.length - 1);

    if (mentionIndex > lastIndex) {
      tokens.push({
        type: "text",
        value: text.substring(lastIndex, mentionIndex),
      });
    }

    tokens.push({
      type: "mention",
      value: `@${username}`,
      username,
    });

    lastIndex = mentionIndex + username.length + 1;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      value: text.substring(lastIndex),
    });
  }

  return tokens;
}
