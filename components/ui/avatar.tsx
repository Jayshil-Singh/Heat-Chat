import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { StatusType } from "@/types";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: "sm" | "default" | "lg" | "xl";
  status?: StatusType;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  default: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

const statusClasses: Record<StatusType, string> = {
  online: "bg-emerald-500",
  offline: "bg-zinc-400",
  away: "bg-amber-500",
  busy: "bg-rose-500",
};

const statusBadgeSizes = {
  sm: "h-2 w-2 ring-1",
  default: "h-2.5 w-2.5 ring-2",
  lg: "h-3.5 w-3.5 ring-2",
  xl: "h-4 w-4 ring-2",
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getGradient(name?: string): string {
  const gradients = [
    "from-orange-500 to-amber-600",
    "from-rose-500 to-orange-500",
    "from-amber-500 to-yellow-600",
    "from-red-500 to-rose-600",
    "from-heat-500 to-heat-700",
  ];
  if (!name) return gradients[0];
  const charCode = name.charCodeAt(0) + (name.charCodeAt(name.length - 1) || 0);
  return gradients[charCode % gradients.length];
}

export function Avatar({
  src,
  alt,
  name,
  size = "default",
  status,
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const initials = getInitials(name || alt);
  const gradient = getGradient(name || alt);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full select-none",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src && !imageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || name || "Avatar"}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-inner",
            gradient
          )}
        >
          {initials}
        </div>
      )}

      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-white dark:ring-zinc-900",
            statusBadgeSizes[size],
            statusClasses[status]
          )}
          aria-label={`Status: ${status}`}
          role="status"
        />
      )}
    </div>
  );
}
