"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ConversationFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const currentChannel = params.get("channel") ?? "";
  const currentStatus = params.get("status") ?? "";
  const hasFilter = Boolean(currentChannel || currentStatus);

  function update(key: "channel" | "status", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`/conversas?${next.toString()}`));
  }

  function clear() {
    startTransition(() => router.replace("/conversas"));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Canal</label>
        <Select
          value={currentChannel}
          onChange={(e) => update("channel", e.target.value)}
          disabled={pending}
          className="w-48"
        >
          <option value="">Todos</option>
          <option value="chatbot">Site (chatbot)</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Status</label>
        <Select
          value={currentStatus}
          onChange={(e) => update("status", e.target.value)}
          disabled={pending}
          className="w-48"
        >
          <option value="">Todos</option>
          <option value="aberta">Aberta</option>
          <option value="em_atendimento">Em atendimento</option>
          <option value="encerrada">Encerrada</option>
        </Select>
      </div>
      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={pending}
        >
          <RotateCcw className="h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  );
}
