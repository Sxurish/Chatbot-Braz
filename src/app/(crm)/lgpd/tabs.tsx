"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

export function LgpdTabs({
  current,
  tabs,
  basePath,
}: {
  current: string;
  tabs: Tab[];
  basePath: string;
}) {
  const params = useSearchParams();

  function hrefFor(key: string): string {
    const next = new URLSearchParams();
    next.set("tab", key);
    // mantém apenas o tab — outros filtros são por seção
    void params;
    return `${basePath}?${next.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            scroll={false}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "text-brand-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {t.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-primary" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
