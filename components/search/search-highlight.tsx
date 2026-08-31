import * as React from "react";

interface SearchHighlightProps {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
}

/**
 * Safe React search term highlighter.
 * Splits text on query tokens and wraps matches in a styled <mark> element without using dangerouslySetInnerHTML.
 */
export function SearchHighlight({
  text,
  query,
  className = "",
  highlightClassName = "bg-amber-200 text-zinc-900 dark:bg-amber-500/30 dark:text-amber-200 rounded px-0.5 font-semibold",
}: SearchHighlightProps) {
  if (!text) return null;
  const trimmed = query?.trim();
  if (!trimmed) return <span className={className}>{text}</span>;

  // Escape special regex characters in query
  const escapedQuery = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className={highlightClassName}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}
