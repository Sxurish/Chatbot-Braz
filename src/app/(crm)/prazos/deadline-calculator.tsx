"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, Calculator, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DeadlineResultView } from "@/components/prazos/deadline-result";
import {
  adjustDeadlineAction,
  calculateDeadlineAction,
  confirmDeadlineAction,
  discardDeadlineAction,
  type PrazoActionState,
} from "@/lib/data/prazos-actions";
import type { DeadlineResult } from "@/lib/prazos/types";

interface ProcessOption {
  value: string;
  label: string;
  comarca: string;
}

interface Props {
  processes: ProcessOption[];
  initialProcessId: string;
  canWrite: boolean;
  demo: boolean;
}

/** Data de hoje (AAAA-MM-DD) em São Paulo. */
function todaySp() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "Comarca de Santo André" → "Santo André" */
function comarcaOf(jurisdiction: string) {
  return jurisdiction.replace(/^comarca d[aeo]s?\s+/i, "").split(/[-–/]/)[0].trim();
}

const label = "mb-1 block text-sm font-medium text-slate-700";

function Submit({ children, pendingText, variant }: { children: React.ReactNode; pendingText: string; variant?: "default" | "outline" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}

function Feedback({ state }: { state: PrazoActionState }) {
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

export function DeadlineCalculator({ processes, initialProcessId, canWrite, demo }: Props) {
  const initialComarca = comarcaOf(processes.find((p) => p.value === initialProcessId)?.comarca ?? "");
  const [processId, setProcessId] = useState(initialProcessId);
  const [comarca, setComarca] = useState(initialComarca);
  const [today] = useState(todaySp);
  const [state, action] = useActionState(calculateDeadlineAction, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-slate-400" /> Calculadora
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form action={action} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="start_kind">
                Começa a partir de
              </label>
              <Select id="start_kind" name="start_kind" defaultValue={state.input?.start.kind ?? "disponibilizacao"}>
                <option value="disponibilizacao">Disponibilização no DJEN</option>
                <option value="intimacao">Intimação (ciência)</option>
              </Select>
            </div>
            <div>
              <label className={label} htmlFor="start_date">
                Data
              </label>
              <Input id="start_date" name="start_date" type="date" required defaultValue={state.input?.start.date ?? today} />
            </div>
            <div>
              <label className={label} htmlFor="days">
                Dias de prazo
              </label>
              <Input id="days" name="days" type="number" min={1} max={365} required defaultValue={state.input?.days ?? 15} />
            </div>
            <div>
              <label className={label} htmlFor="unit">
                Contagem
              </label>
              <Select id="unit" name="unit" defaultValue={state.input?.unit ?? "uteis"}>
                <option value="uteis">Dias úteis (CPC art. 219)</option>
                <option value="corridos">Dias corridos</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="process_id">
                Processo (opcional)
              </label>
              <Select
                id="process_id"
                name="process_id"
                value={processId}
                onChange={(e) => {
                  setProcessId(e.target.value);
                  const p = processes.find((o) => o.value === e.target.value);
                  if (p?.comarca) setComarca(comarcaOf(p.comarca));
                }}
              >
                <option value="">Sem processo</option>
                {processes.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={label} htmlFor="comarca">
                Comarca
              </label>
              <Input
                id="comarca"
                name="comarca"
                value={comarca}
                onChange={(e) => setComarca(e.target.value)}
                placeholder="Ex.: Santo André"
              />
              <p className="mt-1 text-xs text-slate-500">Para os feriados municipais cadastrados.</p>
            </div>
            <label className="flex items-center gap-2 self-center text-sm text-slate-700">
              <input type="checkbox" name="dobro" defaultChecked={state.input?.dobro ?? false} className="h-4 w-4 rounded border-slate-300" />
              Prazo em dobro (Fazenda, MP, Defensoria, litisconsortes)
            </label>
            <div className="sm:col-span-2">
              <Submit pendingText="Calculando...">
                <Calculator className="h-4 w-4" /> Calcular
              </Submit>
            </div>
          </form>
          {state.error && !state.result && (
            <div className="mt-4">
              <Feedback state={state} />
            </div>
          )}
        </CardContent>
      </Card>

      {state.result && (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <ResultActions
              key={`${state.calculationId ?? "sem-registro"}-${state.result.finalDate}-${state.result.startDate}`}
              initial={state}
              result={state.result}
              processes={processes}
              canWrite={canWrite}
              demo={demo}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultActions({
  initial,
  result,
  processes,
  canWrite,
  demo,
}: {
  initial: PrazoActionState;
  result: DeadlineResult;
  processes: ProcessOption[];
  canWrite: boolean;
  demo: boolean;
}) {
  const [current, setCurrent] = useState<{ id: string | null; finalDate: string }>({
    id: initial.calculationId ?? null,
    finalDate: result.finalDate,
  });
  const [closed, setClosed] = useState<PrazoActionState["closed"]>(undefined);
  const [mode, setMode] = useState<"confirmar" | "ajustar" | "descartar">("confirmar");
  const [flash, setFlash] = useState<PrazoActionState>({ message: initial.message, error: initial.error });

  const wrap =
    (fn: (prev: PrazoActionState, fd: FormData) => Promise<PrazoActionState>) =>
    async (prev: PrazoActionState, fd: FormData) => {
      const out = await fn(prev, fd);
      setFlash({ message: out.message, error: out.error });
      if (out.ok && !demo) {
        if (out.closed) setClosed(out.closed);
        else if (out.calculationId && out.result) {
          setCurrent({ id: out.calculationId, finalDate: out.result.finalDate });
          setMode("confirmar");
        }
      }
      return out;
    };

  const [, confirm] = useActionState(wrap(confirmDeadlineAction), {});
  const [, adjust] = useActionState(wrap(adjustDeadlineAction), { result });
  const [, discard] = useActionState(wrap(discardDeadlineAction), {});

  const registered = Boolean(current.id) || demo;
  const open = canWrite && registered && !closed;

  return (
    <>
      <DeadlineResultView result={result} adjustedTo={current.finalDate} />
      <Feedback state={flash} />
      {closed === "confirmacao" && (
        <Link href="/tarefas" className="inline-block text-sm text-brand-primary hover:underline">
          Ver a tarefa criada
        </Link>
      )}
      {!canWrite && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4" /> Seu perfil só pode consultar. Peça a um advogado para confirmar.
        </p>
      )}

      {open && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            {(["confirmar", "ajustar", "descartar"] as const).map((m) => (
              <Button key={m} type="button" size="sm" variant={mode === m ? "secondary" : "ghost"} onClick={() => setMode(m)}>
                {m === "confirmar" ? "Confirmar" : m === "ajustar" ? "Ajustar data" : "Descartar"}
              </Button>
            ))}
          </div>

          {mode === "confirmar" && (
            <form action={confirm} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="calculation_id" value={current.id ?? ""} />
              <div className="sm:col-span-2">
                <label className={label} htmlFor="title">
                  O que vence
                </label>
                <Input id="title" name="title" required placeholder="Ex.: Contestação" />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="confirm_process_id">
                  Processo
                </label>
                <Select id="confirm_process_id" name="process_id" defaultValue={initial.processId ?? ""}>
                  <option value="">Sem processo</option>
                  {processes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" name="update_process_deadline" defaultChecked={Boolean(initial.processId)} className="h-4 w-4 rounded border-slate-300" />
                Atualizar o próximo prazo do processo
              </label>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="description">
                  Observações
                </label>
                <Textarea id="description" name="description" rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Submit pendingText="Criando...">Confirmar e criar prazo</Submit>
                <p className="mt-2 text-xs text-slate-500">
                  Cria a tarefa &quot;Prazo: ...&quot; com prioridade alta, vencendo no fim do dia da data final.
                </p>
              </div>
            </form>
          )}

          {mode === "ajustar" && (
            <form action={adjust} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="calculation_id" value={current.id ?? ""} />
              <div>
                <label className={label} htmlFor="final_date">
                  Data final correta
                </label>
                <Input id="final_date" name="final_date" type="date" required defaultValue={current.finalDate} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="reason">
                  Motivo do ajuste (obrigatório)
                </label>
                <Textarea id="reason" name="reason" rows={2} required placeholder="Ex.: suspensão do expediente pelo Comunicado CSM nº ..." />
              </div>
              <div className="sm:col-span-2">
                <Submit pendingText="Registrando..." variant="outline">
                  Registrar ajuste
                </Submit>
              </div>
            </form>
          )}

          {mode === "descartar" && (
            <form action={discard} className="grid gap-3">
              <input type="hidden" name="calculation_id" value={current.id ?? ""} />
              <div>
                <label className={label} htmlFor="discard_reason">
                  Motivo (opcional)
                </label>
                <Input id="discard_reason" name="reason" placeholder="Ex.: data de início errada" />
              </div>
              <div>
                <Submit pendingText="Descartando..." variant="destructive">
                  Descartar cálculo
                </Submit>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
