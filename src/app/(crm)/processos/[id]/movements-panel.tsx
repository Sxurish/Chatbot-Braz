"use client";

import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gavel,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createMovementAction,
  removeMovementAction,
  setProcessSyncAction,
  syncProcessNowAction,
  updateMovementAction,
  type MovementActionState,
} from "@/lib/data/movements-actions";
import type { MovementWithNames } from "@/lib/data/movements";
import { cn } from "@/lib/utils";
import { brDate, brDateTime, brDayMonth, brInputParts, brTime } from "../format";

type Action = (prev: MovementActionState, formData: FormData) => Promise<MovementActionState>;

const LOCK_TITLE = "Travado: a busca automática não altera";
const INSTANCE_LABELS: Record<string, string> = { G1: "1º grau", G2: "2º grau", JE: "Juizado", TR: "Turma recursal" };

interface Props {
  processId: string;
  movements: MovementWithNames[];
  canEdit: boolean;
  hasTribunal: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
}

export function MovementsPanel({
  processId,
  movements,
  canEdit,
  hasTribunal,
  syncEnabled,
  lastSyncedAt,
  syncError,
}: Props) {
  const [adding, setAdding] = useState<{ date: string } | null>(null);
  const [flash, setFlash] = useState<MovementActionState | null>(null);

  // Ação com efeito colateral: fecha o formulário e mostra o aviso no topo.
  const withFlash =
    (action: Action, onOk?: () => void): Action =>
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        onOk?.();
        setFlash(result);
      }
      return result;
    };

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <CardTitle>Andamentos</CardTitle>
          <p className="mt-1.5 text-sm text-slate-500">
            {movements.length === 0
              ? "Nenhum andamento registrado."
              : `${movements.length} ${movements.length === 1 ? "andamento" : "andamentos"}, do mais recente para o mais antigo.`}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <SyncNowButton processId={processId} disabled={!hasTribunal} onResult={setFlash} />
            <Button
              size="sm"
              aria-label="Lançar andamento"
              onClick={() => {
                setFlash(null);
                setAdding(adding ? null : { date: brInputParts(new Date()).date });
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Lançar</span>
              <span className="hidden sm:inline">Lançar andamento</span>
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        <SyncStatus
          processId={processId}
          canEdit={canEdit}
          hasTribunal={hasTribunal}
          syncEnabled={syncEnabled}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
          onResult={setFlash}
        />

        {flash && <Feedback state={flash} />}

        {adding && (
          <MovementForm
            key={adding.date}
            processId={processId}
            title="Lançar andamento"
            hint="Andamentos lançados pela equipe ficam travados: a busca automática nunca altera nem apaga."
            initial={{ date: adding.date, time: "" }}
            submitLabel="Lançar"
            action={withFlash(createMovementAction, () => setAdding(null))}
            onCancel={() => setAdding(null)}
          />
        )}

        {movements.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="Nenhum andamento ainda"
            description={
              hasTribunal
                ? "Os andamentos aparecem aqui depois da busca no DataJud. Você também pode lançar um à mão."
                : "Lance os andamentos à mão ou cadastre o número CNJ completo para a busca automática."
            }
            className="py-10"
          />
        ) : (
          <ol className="relative ml-1.5 space-y-5 border-l border-slate-200 pt-1 pl-5">
            {movements.map((m) => (
              <MovementItem
                key={m.id}
                movement={m}
                processId={processId}
                canEdit={canEdit}
                withFlash={withFlash}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Busca no DataJud ---------- */

function SyncNowSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={disabled || pending}>
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
      {pending ? "Buscando..." : "Buscar agora"}
    </Button>
  );
}

function SyncNowButton({
  processId,
  disabled,
  onResult,
}: {
  processId: string;
  disabled: boolean;
  onResult: (s: MovementActionState) => void;
}) {
  const [, action] = useActionState<MovementActionState, FormData>(async (prev, formData) => {
    const result = await syncProcessNowAction(prev, formData);
    onResult(result);
    return result;
  }, {});
  return (
    <form action={action} title={disabled ? "Precisa do número CNJ completo" : undefined}>
      <input type="hidden" name="process_id" value={processId} />
      <SyncNowSubmit disabled={disabled} />
    </form>
  );
}

function SyncStatus({
  processId,
  canEdit,
  hasTribunal,
  syncEnabled,
  lastSyncedAt,
  syncError,
  onResult,
}: {
  processId: string;
  canEdit: boolean;
  hasTribunal: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  onResult: (s: MovementActionState) => void;
}) {
  const [enabled, setEnabled] = useState(syncEnabled);
  const [, toggle, pending] = useActionState<MovementActionState, FormData>(async (prev, formData) => {
    const result = await setProcessSyncAction(prev, formData);
    if (result.error) setEnabled(formData.get("enabled") !== "true");
    onResult(result);
    return result;
  }, {});

  function onToggle(next: boolean) {
    setEnabled(next);
    const fd = new FormData();
    fd.set("process_id", processId);
    fd.set("enabled", String(next));
    startTransition(() => toggle(fd));
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm sm:px-4">
      <p className="flex items-center gap-2 text-slate-700">
        <RefreshCw className="h-4 w-4 shrink-0 text-slate-400" />
        {lastSyncedAt ? (
          <span>
            Última busca no DataJud: <span className="font-medium">{brDateTime(lastSyncedAt)}</span>
          </span>
        ) : (
          <span>Ainda não buscado no DataJud.</span>
        )}
      </p>

      {!hasTribunal && (
        <p className="flex items-start gap-2 text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          A busca automática precisa do número CNJ completo (20 dígitos, como 0000000-00.0000.0.00.0000). Corrija o
          número na lista de processos para ligar a busca.
        </p>
      )}

      {hasTribunal &&
        (canEdit ? (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              role="switch"
              aria-checked={enabled}
              checked={enabled}
              disabled={pending}
              onChange={(e) => onToggle(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-primary peer-focus-visible:ring-offset-2",
                enabled ? "bg-brand-primary" : "bg-slate-300",
                pending && "opacity-60"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  enabled && "translate-x-4"
                )}
              />
            </span>
            <span>
              <span className="font-medium text-slate-900">Buscar andamentos automaticamente</span>
              <span className="block text-xs text-slate-500">Desligue para processos em segredo de justiça.</span>
            </span>
          </label>
        ) : (
          <p className="text-slate-600">
            Busca automática: <span className="font-medium">{syncEnabled ? "ligada" : "desligada"}</span>
          </p>
        ))}

      {syncError && (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">A última busca não deu certo:</span> {syncError}
          </span>
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />O DataJud costuma ter alguns dias de atraso. O prazo oficial é o
        da intimação e o do sistema do tribunal.
      </p>
    </div>
  );
}

/* ---------- Linha do tempo ---------- */

function showsTime(m: MovementWithNames): boolean {
  // Lançamento só com data é gravado ao meio-dia; aí não mostramos a hora.
  return !(m.source === "manual" && brTime(m.occurred_at) === "12:00");
}

function MovementItem({
  movement: m,
  processId,
  canEdit,
  withFlash,
}: {
  movement: MovementWithNames;
  processId: string;
  canEdit: boolean;
  withFlash: (action: Action, onOk?: () => void) => Action;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isManual = m.source === "manual";
  const time = showsTime(m) ? brTime(m.occurred_at) : "";

  const author = m.edited_at
    ? `Editado por ${m.edited_by_name ?? "alguém da equipe"} em ${brDayMonth(m.edited_at)}`
    : isManual
      ? `Lançado por ${m.created_by_name ?? "alguém da equipe"}`
      : null;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute top-1.5 -left-[1.6rem] h-2.5 w-2.5 rounded-full ring-4 ring-white",
          isManual ? "bg-brand-gold" : "bg-brand-primary"
        )}
      />

      {editing ? (
        <MovementForm
          processId={processId}
          movementId={m.id}
          title="Corrigir andamento"
          hint={
            isManual
              ? undefined
              : "Depois de corrigido, este andamento fica travado: a busca automática não muda mais o texto."
          }
          initial={{
            date: brInputParts(m.occurred_at).date,
            time: showsTime(m) ? brInputParts(m.occurred_at).time : "",
            description: m.description,
          }}
          submitLabel="Salvar"
          action={withFlash(updateMovementAction, () => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time dateTime={m.occurred_at} className="text-sm font-semibold text-slate-900">
              {brDate(m.occurred_at)}
              {time && <span className="font-normal text-slate-500"> às {time}</span>}
            </time>
            <SourceBadge movement={m} />
            {m.locked && (
              <span title={LOCK_TITLE} className="inline-flex items-center text-slate-400">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{LOCK_TITLE}</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-slate-700">
            {m.description}
          </p>
          {author && <p className="mt-0.5 text-xs text-slate-400">{author}</p>}

          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {!confirming ? (
                <>
                  <ItemButton onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </ItemButton>
                  <ItemButton onClick={() => setConfirming(true)} danger>
                    {isManual ? <Trash2 className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {isManual ? "Apagar" : "Ocultar"}
                  </ItemButton>
                </>
              ) : (
                <RemoveConfirm
                  id={m.id}
                  processId={processId}
                  isManual={isManual}
                  action={withFlash(removeMovementAction, () => setConfirming(false))}
                  onCancel={() => setConfirming(false)}
                />
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}

function SourceBadge({ movement: m }: { movement: MovementWithNames }) {
  if (m.source === "manual") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Equipe
      </span>
    );
  }
  const inst = m.instance ? INSTANCE_LABELS[m.instance] : undefined;
  return (
    <span
      title={inst ? `Trazido do DataJud (${inst})` : "Trazido do DataJud"}
      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800"
    >
      Tribunal{m.instance ? ` · ${m.instance}` : ""}
    </span>
  );
}

function ItemButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800",
        danger && "hover:bg-red-50 hover:text-red-700"
      )}
    >
      {children}
    </button>
  );
}

function ConfirmSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />} {label}
    </button>
  );
}

function RemoveConfirm({
  id,
  processId,
  isManual,
  action,
  onCancel,
}: {
  id: string;
  processId: string;
  isManual: boolean;
  action: Action;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      // onSubmit (e não action=) para o React não limpar o que foi digitado quando dá erro.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="process_id" value={processId} />
      <span className="text-xs text-slate-600">
        {isManual ? "Apagar este andamento?" : "Ocultar? A busca automática não o traz de volta."}
      </span>
      <ConfirmSubmit label={isManual ? "Apagar" : "Ocultar"} />
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        Cancelar
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

/* ---------- Formulário (lançar / corrigir) ---------- */

function FormSubmit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </Button>
  );
}

function MovementForm({
  processId,
  movementId,
  title,
  hint,
  initial,
  submitLabel,
  action,
  onCancel,
}: {
  processId: string;
  movementId?: string;
  title: string;
  hint?: string;
  initial: { date: string; time: string; description?: string };
  submitLabel: string;
  action: Action;
  onCancel: () => void;
}) {
  // Junta data e hora no campo que a ação espera ("AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm").
  const [state, formAction, pending] = useActionState<MovementActionState, FormData>((prev, formData) => {
    const date = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "");
    formData.set("occurred_at", date && time ? `${date}T${time}` : date);
    return action(prev, formData);
  }, {});

  const fieldId = movementId ?? "novo";

  return (
    <form
      // onSubmit (e não action=) para o React não limpar o que foi digitado quando dá erro.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-3 rounded-lg border border-brand-primary/20 bg-brand-primary/[0.03] p-4">
      <input type="hidden" name="process_id" value={processId} />
      {movementId && <input type="hidden" name="id" value={movementId} />}
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7.5rem)] gap-3 sm:max-w-sm">
        <div className="min-w-0">
          <label htmlFor={`date-${fieldId}`} className="block text-xs font-medium text-slate-700">
            Data
          </label>
          <Input id={`date-${fieldId}`} type="date" name="date" required defaultValue={initial.date} className="mt-1" />
        </div>
        <div className="min-w-0">
          <label htmlFor={`time-${fieldId}`} className="block text-xs font-medium text-slate-700">
            Hora <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <Input id={`time-${fieldId}`} type="time" name="time" defaultValue={initial.time} className="mt-1" />
        </div>
      </div>
      <div>
        <label htmlFor={`desc-${fieldId}`} className="block text-xs font-medium text-slate-700">
          O que aconteceu
        </label>
        <Textarea
          id={`desc-${fieldId}`}
          name="description"
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          defaultValue={initial.description}
          placeholder="Ex.: Protocolada a contestação."
          className="mt-1"
        />
      </div>
      {state.error && <Feedback state={state} />}
      <div className="flex flex-wrap gap-2">
        <FormSubmit label={submitLabel} pending={pending} />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Feedback({ state }: { state: MovementActionState }) {
  if (state.error)
    return (
      <p className="flex items-start gap-1.5 text-sm text-red-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}
      </p>
    );
  return null;
}
