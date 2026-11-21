"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCheck, Circle, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationReadAction, type EditState } from "@/lib/data/edicao-actions";

const initial: EditState = {};

function Inner({ read }: { read: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={read ? "Marcar como não lida" : "Marcar como lida"}
      aria-label={read ? "Marcar como não lida" : "Marcar como lida"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : read ? (
        <Circle className="h-4 w-4" />
      ) : (
        <CircleCheck className="h-4 w-4" />
      )}
    </button>
  );
}

/** Marca uma notificação como lida (ou volta para não lida). */
export function ReadToggle({ id, read }: { id: string; read: boolean }) {
  const [state, action] = useActionState(markNotificationReadAction, initial);
  return (
    <form action={action} className="flex items-center">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="read" value={read ? "0" : "1"} />
      <Inner read={read} />
      {state.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function AllInner() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
      Marcar todas como lidas
    </Button>
  );
}

export function MarkAllRead() {
  const [state, action] = useActionState(markNotificationReadAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="all" value="1" />
      <AllInner />
      {state.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
      {state.message && <span role="status" className="text-xs text-amber-600">{state.message}</span>}
    </form>
  );
}
