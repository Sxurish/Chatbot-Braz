"use client";

import { startTransition, useCallback, useEffect, useState, useActionState } from "react";
import { Plus, Loader2, AlertCircle, Info, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
  createTaskAction,
  createFollowUpAction,
  createAppointmentAction,
} from "@/lib/data/actions";
import {
  updateAppointmentAction,
  updateFollowUpAction,
  updateTaskAction,
} from "@/lib/data/edicao-actions";
import { TASK_EDIT_STATUSES } from "@/lib/data/edicao-rules";
import { FOLLOW_UP_STATUS_LABELS, FOLLOW_UP_STATUSES } from "@/lib/list-views/follow-ups";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES } from "@/lib/list-views/agenda";
import { TASK_STATUS_LABELS } from "@/lib/list-views/tarefas";
import { isoToBrInput } from "@/lib/datetime-br";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Appointment, FollowUp, Task } from "@/lib/types";

interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const initial: FormState = {};

const FieldLabel = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="block text-sm leading-6 font-medium text-slate-700">
    {children}
  </label>
);

function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </Button>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-amber-600">
        <Info className="h-4 w-4 shrink-0" /> {state.message}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Salvo.
      </p>
    );
  return null;
}

export type OperationKind = "task" | "followup" | "appointment";

type OperationRecord =
  | { kind: "task"; record: Task }
  | { kind: "followup"; record: FollowUp }
  | { kind: "appointment"; record: Appointment };

const CONFIG = {
  task: {
    create: createTaskAction,
    update: updateTaskAction,
    newTitle: "Nova tarefa",
    editTitle: "Editar tarefa",
    label: "Criar tarefa",
  },
  followup: {
    create: createFollowUpAction,
    update: updateFollowUpAction,
    newTitle: "Novo follow-up",
    editTitle: "Editar follow-up",
    label: "Criar follow-up",
  },
  appointment: {
    create: createAppointmentAction,
    update: updateAppointmentAction,
    newTitle: "Novo agendamento",
    editTitle: "Editar compromisso",
    label: "Agendar",
  },
} as const;

/** Botão "Novo ..." que abre o formulário correspondente (sem vínculo a lead). */
export function QuickCreate({
  kind,
  buttonLabel,
  assignees = [],
}: {
  kind: OperationKind;
  buttonLabel: string;
  /** Equipe para o campo "Responsável". */
  assignees?: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {buttonLabel}
      </Button>

      <Dialog open={open} onClose={close} title={CONFIG[kind].newTitle}>
        {/* O formulário (e o resultado do envio) nasce de novo a cada abertura. */}
        {open && <OperationForm kind={kind} assignees={assignees} onClose={close} />}
      </Dialog>
    </>
  );
}

/** Botão "Editar" de uma tarefa, follow-up ou compromisso. */
export function EditOperationButton({
  assignees = [],
  ...item
}: OperationRecord & { assignees?: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Editar"
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <Pencil className="h-3.5 w-3.5" /> Editar
      </button>
      <Dialog open={open} onClose={close} title={CONFIG[item.kind].editTitle}>
        {open && <OperationForm {...item} assignees={assignees} onClose={close} />}
      </Dialog>
    </>
  );
}

function OperationForm({
  kind,
  record,
  assignees,
  onClose,
}: {
  kind: OperationKind;
  record?: Task | FollowUp | Appointment;
  assignees: SelectOption[];
  onClose: () => void;
}) {
  const cfg = CONFIG[kind];
  const [state, dispatch, pending] = useActionState(record ? cfg.update : cfg.create, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(onClose, state.message ? 2500 : 800);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  // Envio à mão: o formulário NÃO é limpo se der erro (o que foi digitado fica).
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const task = kind === "task" ? (record as Task | undefined) : undefined;
  const followUp = kind === "followup" ? (record as FollowUp | undefined) : undefined;
  const appt = kind === "appointment" ? (record as Appointment | undefined) : undefined;
  const p = `op-${kind}`;

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {record && <input type="hidden" name="id" value={record.id} />}
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${p}-title`}>Título</FieldLabel>
        <Input id={`${p}-title`} name="title" required maxLength={200} defaultValue={record?.title ?? ""} />
      </div>

      {kind === "task" && (
        <>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${p}-desc`}>Descrição</FieldLabel>
            <Textarea id={`${p}-desc`} name="description" rows={2} defaultValue={task?.description ?? ""} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel htmlFor={`${p}-due`}>Prazo</FieldLabel>
              <Input id={`${p}-due`} name="due_date" type="datetime-local" defaultValue={isoToBrInput(task?.due_date)} />
            </div>
            <div className="w-32 space-y-1.5">
              <FieldLabel htmlFor={`${p}-prio`}>Prioridade</FieldLabel>
              <Select id={`${p}-prio`} name="priority" defaultValue={task?.priority ?? "media"}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </Select>
            </div>
          </div>
          {task && (
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${p}-status`}>Status</FieldLabel>
              <Select
                id={`${p}-status`}
                name="status"
                defaultValue={task.status === "atrasada" ? "pendente" : task.status}
              >
                {TASK_EDIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </>
      )}

      {kind === "followup" && (
        <>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${p}-desc`}>Descrição</FieldLabel>
            <Textarea id={`${p}-desc`} name="description" rows={2} defaultValue={followUp?.description ?? ""} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel htmlFor={`${p}-when`}>Quando</FieldLabel>
              <Input
                id={`${p}-when`}
                name="scheduled_at"
                type="datetime-local"
                required
                defaultValue={isoToBrInput(followUp?.scheduled_at)}
              />
            </div>
            {followUp && (
              <div className="w-36 space-y-1.5">
                <FieldLabel htmlFor={`${p}-status`}>Status</FieldLabel>
                <Select id={`${p}-status`} name="status" defaultValue={followUp.status}>
                  {FOLLOW_UP_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {FOLLOW_UP_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </>
      )}

      {kind === "appointment" && (
        <>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel htmlFor={`${p}-date`}>Data</FieldLabel>
              <Input id={`${p}-date`} name="date" type="date" required defaultValue={appt?.date ?? ""} />
            </div>
            <div className="w-28 space-y-1.5">
              <FieldLabel htmlFor={`${p}-start`}>Início</FieldLabel>
              <Input
                id={`${p}-start`}
                name="start_time"
                type="time"
                required
                defaultValue={appt?.start_time?.slice(0, 5) ?? ""}
              />
            </div>
            <div className="w-28 space-y-1.5">
              <FieldLabel htmlFor={`${p}-end`}>Fim</FieldLabel>
              <Input id={`${p}-end`} name="end_time" type="time" defaultValue={appt?.end_time?.slice(0, 5) ?? ""} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <FieldLabel htmlFor={`${p}-mod`}>Modalidade</FieldLabel>
              <Select id={`${p}-mod`} name="modality" defaultValue={appt?.modality ?? "online"}>
                <option value="online">Online</option>
                <option value="presencial">Presencial</option>
                <option value="telefone">Telefone</option>
              </Select>
            </div>
            {appt && (
              <div className="flex-1 space-y-1.5">
                <FieldLabel htmlFor={`${p}-status`}>Status</FieldLabel>
                <Select id={`${p}-status`} name="status" defaultValue={appt.status}>
                  {APPOINTMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {APPOINTMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${p}-link`}>Link da reunião (opcional)</FieldLabel>
            <Input id={`${p}-link`} name="meeting_link" placeholder="https://..." defaultValue={appt?.meeting_link ?? ""} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${p}-notes`}>Observações (opcional)</FieldLabel>
            <Textarea id={`${p}-notes`} name="notes" rows={2} defaultValue={appt?.notes ?? ""} />
          </div>
        </>
      )}

      {assignees.length > 0 && (
        <div className="space-y-1.5">
          <FieldLabel htmlFor={`${p}-resp`}>Responsável</FieldLabel>
          <Select id={`${p}-resp`} name="assigned_to" defaultValue={record?.assigned_to ?? ""}>
            <option value="">Sem responsável</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Feedback state={state} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Submit label={record ? "Salvar" : cfg.label} pending={pending} />
      </div>
    </form>
  );
}
