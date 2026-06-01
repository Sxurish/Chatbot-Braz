"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  CalendarPlus,
  UserCheck,
  ListPlus,
  Repeat,
  Briefcase,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
  createTaskAction,
  createFollowUpAction,
  createAppointmentAction,
  createCaseFromLeadAction,
  convertLeadToClientAction,
  type ActionState,
} from "@/lib/data/actions";

const initial: ActionState = {};

function SubmitButton({ label }: { label: string }) {
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
  return null;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-sm font-medium text-slate-700">{children}</label>
);

type DialogKey = "task" | "followup" | "appointment" | "case" | null;

export function LeadActions({ leadId }: { leadId: string }) {
  const [dialog, setDialog] = useState<DialogKey>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => setDialog("task")}
        >
          <ListPlus className="h-4 w-4" /> Criar tarefa
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => setDialog("followup")}
        >
          <Repeat className="h-4 w-4" /> Criar follow-up
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => setDialog("case")}
        >
          <Briefcase className="h-4 w-4" /> Criar caso
        </Button>
      </div>

      <TaskDialog
        leadId={leadId}
        open={dialog === "task"}
        onClose={() => setDialog(null)}
      />
      <FollowUpDialog
        leadId={leadId}
        open={dialog === "followup"}
        onClose={() => setDialog(null)}
      />
      <CaseDialog
        leadId={leadId}
        open={dialog === "case"}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

/** Botões do cabeçalho da página do lead (agendar / tornar cliente). */
export function LeadHeaderActions({ leadId }: { leadId: string }) {
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [convertState, convertAction] = useFormState(
    convertLeadToClientAction,
    initial
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setDialog("appointment")}>
        <CalendarPlus className="h-4 w-4" /> Agendar
      </Button>
      <form action={convertAction}>
        <input type="hidden" name="lead_id" value={leadId} />
        <ConvertButton ok={convertState.ok} />
      </form>

      <AppointmentDialog
        leadId={leadId}
        open={dialog === "appointment"}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function ConvertButton({ ok }: { ok?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending || ok}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserCheck className="h-4 w-4" />
      )}
      {ok ? "Convertido" : "Tornar cliente"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
function useCloseOnSuccess(state: ActionState, onClose: () => void) {
  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(onClose, 800);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);
}

function TaskDialog({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(createTaskAction, initial);
  useCloseOnSuccess(state, onClose);
  return (
    <Dialog open={open} onClose={onClose} title="Nova tarefa">
      <form action={action} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div className="space-y-1.5">
          <FieldLabel>Título</FieldLabel>
          <Input name="title" required placeholder="Ex.: Protocolar defesa" />
        </div>
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
        <Feedback state={state} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Criar tarefa" />
        </div>
      </form>
    </Dialog>
  );
}

function FollowUpDialog({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(createFollowUpAction, initial);
  useCloseOnSuccess(state, onClose);
  return (
    <Dialog open={open} onClose={onClose} title="Novo follow-up">
      <form action={action} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div className="space-y-1.5">
          <FieldLabel>Título</FieldLabel>
          <Input name="title" required placeholder="Ex.: Retornar contato" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Descrição</FieldLabel>
          <Textarea name="description" rows={2} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Quando</FieldLabel>
          <Input name="scheduled_at" type="datetime-local" required />
        </div>
        <Feedback state={state} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Criar follow-up" />
        </div>
      </form>
    </Dialog>
  );
}

function AppointmentDialog({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(createAppointmentAction, initial);
  useCloseOnSuccess(state, onClose);
  return (
    <Dialog open={open} onClose={onClose} title="Novo agendamento">
      <form action={action} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div className="space-y-1.5">
          <FieldLabel>Título</FieldLabel>
          <Input name="title" required placeholder="Ex.: Consulta inicial" />
        </div>
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
        <Feedback state={state} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Agendar" />
        </div>
      </form>
    </Dialog>
  );
}

function CaseDialog({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useFormState(createCaseFromLeadAction, initial);
  useCloseOnSuccess(state, onClose);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Criar caso"
      description="Cria um caso jurídico a partir dos dados deste lead."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div className="space-y-1.5">
          <FieldLabel>Título do caso</FieldLabel>
          <Input name="title" required placeholder="Ex.: Defesa em ação X" />
        </div>
        <Feedback state={state} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Criar caso" />
        </div>
      </form>
    </Dialog>
  );
}
