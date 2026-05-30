"use client";

import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";

export function Topbar({ title }: { title?: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="min-w-0">
        {title && (
          <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar lead, telefone, processo..."
            className="w-64 pl-9"
          />
        </div>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <div className="flex items-center gap-2">
          <Avatar fallback={getInitials("Jean Braz")} />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-slate-900">Dr. Jean Braz</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}
