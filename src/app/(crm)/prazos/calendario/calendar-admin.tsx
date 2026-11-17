"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  addCalendarDayAction,
  removeCalendarDayAction,
  type CalendarActionState,
} from "@/lib/data/prazos-actions";

const label = "mb-1 block text-sm font-medium text-slate-700";

function Submit({ children, pendingText, variant }: { children: React.ReactNode; pendingText: string; variant?: "default" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

function Feedback({ state }: { state: CalendarActionState }) {
  if (state.error) {
    return (
      <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}
      </p>
    );
  }
  return null;
}

export function AddDayForm({ defaultDay }: { defaultDay: string }) {
  const [state, action] = useActionState(addCalendarDayAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="day">
          Data
        </label>
        <Input id="day" name="day" type="date" required defaultValue={defaultDay} />
      </div>
      <div>
        <label className={label} htmlFor="kind">
          Tipo
        </label>
        <Select id="kind" name="kind" defaultValue="suspensao">
          <option value="suspensao">Suspensão de expediente</option>
          <option value="feriado">Feriado</option>
          <option value="feriado_municipal">Feriado municipal</option>
          <option value="ponto_facultativo">Ponto facultativo (sem expediente)</option>
        </Select>
      </div>
      <div>
        <label className={label} htmlFor="comarca">
          Comarca
        </label>
        <Input id="comarca" name="comarca" placeholder="Vazio = todas as comarcas" />
      </div>
      <div>
        <label className={label} htmlFor="description">
          Descrição
        </label>
        <Input id="description" name="description" required placeholder="Ex.: Aniversário de Santo André" />
      </div>
      <div>
        <label className={label} htmlFor="source">
          Fonte (obrigatória)
        </label>
        <Input id="source" name="source" required placeholder="Ex.: Provimento CSM nº ..., Lei municipal nº ..." />
      </div>
      <div>
        <label className={label} htmlFor="source_url">
          Link da fonte (opcional)
        </label>
        <Input id="source_url" name="source_url" type="url" placeholder="https://" />
      </div>
      <Feedback state={state} />
      <Submit pendingText="Cadastrando...">Cadastrar dia</Submit>
    </form>
  );
}

export function RemoveDayButton({ id, label: dayLabel }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(removeCalendarDayAction, {});
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Remover ${dayLabel}`}>
        <Trash2 className="h-4 w-4" /> Remover
      </Button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2 sm:w-56">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" required placeholder="Motivo da remoção" aria-label="Motivo da remoção" />
      <Feedback state={state} />
      <div className="flex gap-2">
        <Submit pendingText="Removendo..." variant="destructive">
          Remover
        </Submit>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
