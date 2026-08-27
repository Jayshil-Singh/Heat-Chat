import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h4>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {message}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </Button>
        </div>
      )}
    </div>
  );
}
