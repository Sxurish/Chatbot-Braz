import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  fallback: string;
}

function Avatar({ className, fallback, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary",
        className
      )}
      {...props}
    >
      {fallback}
    </div>
  );
}

export { Avatar };
