"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { TeamUser } from "@/lib/types";

export function AuditFilters({ team }: { team: TeamUser[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const currentUser = params.get("user") ?? "";

  function update(user: string) {
    const next = new URLSearchParams(params.toString());
    if (user) next.set("user", user);
    else next.delete("user");
    next.delete("page");
    startTransition(() => router.replace(`/auditoria?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Usuário</label>
        <Select
          value={currentUser}
          onChange={(e) => update(e.target.value)}
          disabled={pending}
          className="w-56"
        >
          <option value="">Todos</option>
          <option value="system">Sistema (sem usuário)</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>
      {currentUser && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => update("")}
          disabled={pending}
        >
          <RotateCcw className="h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  );
}
