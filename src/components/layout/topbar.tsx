"use client";

import { useState } from "react";
import { Bell, Search, LogOut, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";
import { signOutAction } from "@/lib/auth/actions";
import type { UserRole } from "@/lib/types";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  advogado: "Advogado",
  atendente: "Atendente",
  financeiro: "Financeiro",
  visualizador: "Visualizador",
};

interface TopbarProps {
  title?: string;
  user: { name: string; role: UserRole };
}

export function Topbar({ title, user }: TopbarProps) {
  const [open, setOpen] = useState(false);

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

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100"
          >
            <Avatar fallback={getInitials(user.name)} />
            <div className="hidden leading-tight sm:block">
              <p className="text-left text-sm font-medium text-slate-900">
                {user.name}
              </p>
              <p className="text-left text-xs text-slate-500">
                {ROLE_LABEL[user.role]}
              </p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
