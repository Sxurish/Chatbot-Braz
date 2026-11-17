"use client";

import { useCallback, useEffect, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Loader2, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
  createTaskAction,
  createFollowUpAction,
  createAppointmentAction,
  type ActionState,
} from "@/lib/data/actions";

const initial: ActionState = {};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-sm leading-6 font-medium text-slate-700">{children}</label>
);

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="flex items-center gap-1.5 text-sm text-amber-600">
        <Info className="h-4 w-4" /> {state.message}
      </p>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> Salvo.
      </p>
    );
  return null;
}

type Kind = "task" | "followup" | "appointment";

const ACTIONS = {
  task: { fn: createTaskAction, title: "Nova tarefa", label: "Criar tarefa" },
  followup: {
    fn: createFollowUpAction,
    title: "Novo follow-up",
    label: "Criar follow-up",
  },
  appointment: {
    fn: createAppointmentAction,
    title: "Novo agendamento",
    label: "Agendar",
  },
} as const;

/** Botão "Novo ..." que abre o formulário correspondente (sem vínculo a lead). */
export function QuickCreate({ kind, buttonLabel }: { kind: Kind; buttonLabel: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {buttonLabel}
      </Button>

      <Dialog open={open} onClose={close} title={ACTIONS[kind].title}>
        {/* O formulário (e o resultado do envio) nasce de novo a cada abertura. */}
        {open && <QuickCreateForm kind={kind} onClose={close} />}
      </Dialog>
    </>
  );
}

function QuickCreateForm({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const cfg = ACTIONS[kind];
  const [state, action] = useActionState(cfg.fn, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(onClose, 800);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel>Título</FieldLabel>
        <Input name="title" required />
      </div>

      {kind === "task" && (
        <>
          <div className="space-y-1.5">
            <FieldLabel>Descrição</FieldLabel>
            <Textarea name="description" rows={2} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel>Prazo</FieldLabel>
              <Input name="due_date" type="datetime-local" />
            </div>
            <div className="w-32 space-y-1.5">
              <FieldLabel>Prioridade</FieldLabel>
              <Select name="priority" defaultValue="media">
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </Select>
            </div>
          </div>
        </>
      )}

      {kind === "followup" && (
        <>
          <div className="space-y-1.5">
            <FieldLabel>Descrição</FieldLabel>
            <Textarea name="description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Quando</FieldLabel>
            <Input name="scheduled_at" type="datetime-local" required />
          </div>
        </>
      )}

      {kind === "appointment" && (
        <>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel>Data</FieldLabel>
              <Input name="date" type="date" required />
            </div>
            <div className="w-28 space-y-1.5">
              <FieldLabel>Início</FieldLabel>
              <Input name="start_time" type="time" required />
            </div>
            <div className="w-28 space-y-1.5">
              <FieldLabel>Fim</FieldLabel>
              <Input name="end_time" type="time" />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Modalidade</FieldLabel>
            <Select name="modality" defaultValue="online">
              <option value="online">Online</option>
              <option value="presencial">Presencial</option>
              <option value="telefone">Telefone</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Link da reunião (opcional)</FieldLabel>
            <Input name="meeting_link" placeholder="https://..." />
          </div>
        </>
      )}

      <Feedback state={state} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Submit label={cfg.label} />
      </div>
    </form>
  );
}
