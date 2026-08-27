export const MAX_MESSAGE_LENGTH = 4000;

export function validateMessageContent(content: string): string | null {
  if (!content || typeof content !== "string") {
    return "Message cannot be empty.";
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return "Message cannot be empty.";
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters (currently ${trimmed.length}).`;
  }

  // Check for invalid control characters (excluding standard whitespace \n, \r, \t)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
    return "Message contains unsupported characters.";
  }

  return null;
}
