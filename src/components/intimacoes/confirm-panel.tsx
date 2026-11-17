"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DeadlineResultView } from "@/components/prazos/deadline-result";
import {
  confirmPublicationAction,
  discardPublicationAction,
  linkPublicationProcessAction,
  type IntimacaoActionState,
} from "@/lib/data/intimacoes-actions";
import { brDay } from "@/lib/prazos/calendar";
import type { CalendarDay, DeadlineResult, DeadlineUnit, StartKind } from "@/lib/prazos/types";
import { comarcaOf, computePublicationDeadline, confirmFormDefaults } from "@/lib/intimacoes/rules";
import type { CourtPublication } from "@/lib/intimacoes/types";
import { cn } from "@/lib/utils";

export interface ProcessOption {
  value: string;
  label: string;
  comarca: string;
}

interface Props {
  pub: CourtPublication;
  calendar: CalendarDay[];
  processes: ProcessOption[];
  canWrite: boolean;
}

const label = "mb-1 block text-sm font-medium text-slate-700";
const doubtRing = "border-amber-400 bg-amber-50 ring-1 ring-amber-300";

function Submit({
  children,
  pendingText,
  variant,
  formAction,
}: {
  children: React.ReactNode;
  pendingText: string;
  variant?: "default" | "outline" | "destructive" | "ghost";
  formAction?: (fd: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} formAction={formAction} formNoValidate={Boolean(formAction)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}

function Feedback({ state }: { state: IntimacaoActionState }) {
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

function Doubt() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-amber-700">
      <AlertTriangle className="h-3 w-3" /> IA com dúvida
    </span>
  );
}

/** Faz a conta fora do componente (erro vira mensagem, não quebra a tela). */
function liveCalc(
  pub: CourtPublication,
  o: { days: string; unit: DeadlineUnit; startKind: StartKind; dobro: boolean; comarca: string },
  calendar: CalendarDay[]
): { result: DeadlineResult } | { error: string } {
  const days = Number(o.days);
  if (!o.days || !Number.isInteger(days) || days < 1) return { error: "Informe o número de dias para ver a conta." };
  try {
    return { result: computePublicationDeadline(pub, { ...o, days }, calendar).result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não consegui fazer a conta." };
  }
}

/** Conferência: formulário com a sugestão da IA, conta ao vivo, ajuste, descarte e vínculo. */
export function ConfirmPanel({ pub, calendar, processes, canWrite }: Props) {
  const defaults = confirmFormDefaults(pub);
  const doubts = new Set((pub.ai_reading?.uncertain ?? []).map((f) => f.toLowerCase()));
  const has = (f: string) => doubts.has(f) || (f === "inicio" && doubts.has("início"));

  const [days, setDays] = useState(defaults.days ? String(defaults.days) : "");
  const [unit, setUnit] = useState<DeadlineUnit>(defaults.unit);
  const [startKind, setStartKind] = useState<StartKind>(defaults.startKind);
  const [dobro, setDobro] = useState(defaults.dobro);
  const [processId, setProcessId] = useState(pub.process_id ?? "");
  const [updateDeadline, setUpdateDeadline] = useState(Boolean(pub.process_id));
  const [adjusting, setAdjusting] = useState(false);
  const [mode, setMode] = useState<"confirmar" | "descartar">("confirmar");

  const [confirmState, confirm] = useActionState(confirmPublicationAction, {});
  const [discardState, discard] = useActionState(discardPublicationAction, {});
  const [linkState, link] = useActionState(linkPublicationProcessAction, {});

  const comarca = comarcaOf(processes.find((p) => p.value === processId)?.comarca);
  const calc = liveCalc(pub, { days, unit, startKind, dobro, comarca }, calendar);
  const done = confirmState.closed ?? discardState.closed;

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <Feedback state={done === "confirmada" ? confirmState : discardState} />
          {done === "confirmada" && confirmState.finalDate && (
            <p className="text-sm text-slate-700">
              Prazo final: <span className="font-semibold">{brDay(confirmState.finalDate)}</span>.{" "}
              <Link href="/tarefas" className="text-brand-primary hover:underline">
                Ver a tarefa
              </Link>
            </p>
          )}
          <Link href="/intimacoes" className="inline-block text-sm text-brand-primary hover:underline">
            Voltar para a lista
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle>Conferência</CardTitle>
        <p className="text-sm text-slate-500">
          {pub.ai_reading ? "Já preenchido com a sugestão da IA. Confira cada campo." : "Preencha o prazo a partir do texto."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
        {pub.cancelled && (
          <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Cancelada no DJEN{pub.cancel_reason ? `: ${pub.cancel_reason}` : ""}. Não vira prazo: descarte com o motivo.
          </p>
        )}
        {!canWrite && (
          <p className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Info className="h-4 w-4 shrink-0" /> Seu perfil só pode consultar. Peça a um advogado para conferir.
          </p>
        )}

        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "confirmar" ? "secondary" : "ghost"} onClick={() => setMode("confirmar")}>
              Confirmar prazo
            </Button>
            <Button type="button" size="sm" variant={mode === "descartar" ? "secondary" : "ghost"} onClick={() => setMode("descartar")}>
              Descartar
            </Button>
          </div>
        )}

        {mode === "confirmar" && (
          <form action={confirm} className="space-y-5">
            <input type="hidden" name="publication_id" value={pub.id} />
            <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="days">
                  Dias de prazo {has("dias") && <Doubt />}
                </label>
                <Input
                  id="days"
                  name="days"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className={cn(has("dias") && doubtRing)}
                />
              </div>
              <div>
                <label className={label} htmlFor="unit">
                  Contagem {has("unidade") && <Doubt />}
                </label>
                <Select
                  id="unit"
                  name="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as DeadlineUnit)}
                  className={cn(has("unidade") && doubtRing)}
                >
                  <option value="uteis">Dias úteis</option>
                  <option value="corridos">Dias corridos</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="start_kind">
                  Começa a partir de {has("inicio") && <Doubt />}
                </label>
                <Select
                  id="start_kind"
                  name="start_kind"
                  value={startKind}
                  onChange={(e) => setStartKind(e.target.value as StartKind)}
                  className={cn(has("inicio") && doubtRing)}
                >
                  <option value="disponibilizacao">Disponibilização no DJEN ({brDay(pub.available_date)})</option>
                  <option value="intimacao">Intimação (ciência)</option>
                </Select>
                {startKind === "intimacao" && (
                  <p className="mt-1 text-xs text-amber-700">
                    O DJEN só informa a disponibilização: a conta usa {brDay(pub.available_date)} como a data da ciência.
                  </p>
                )}
              </div>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-md text-sm text-slate-700 sm:col-span-2",
                  has("dobro") && "border border-amber-300 bg-amber-50 px-3 py-2"
                )}
              >
                <input
                  type="checkbox"
                  name="dobro"
                  checked={dobro}
                  onChange={(e) => setDobro(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Prazo em dobro (Fazenda, MP, Defensoria, litisconsortes) {has("dobro") && <Doubt />}
              </label>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="title">
                  O que vence (título da tarefa)
                </label>
                <Input id="title" name="title" required defaultValue={defaults.title} placeholder="Ex.: Réplica à contestação" />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="process_id">
                  Processo no CRM {has("processo") && <Doubt />}
                </label>
                <Select
                  id="process_id"
                  name="process_id"
                  value={processId}
                  onChange={(e) => {
                    setProcessId(e.target.value);
                    setUpdateDeadline(Boolean(e.target.value));
                  }}
                  className={cn(has("processo") && doubtRing)}
                >
                  <option value="">Sem processo</option>
                  {processes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                {!processId && pub.process_number_masked && (
                  <p className="mt-1 text-xs text-slate-500">
                    O processo {pub.process_number_masked} não está no CRM. Cadastre-o ou escolha outro.
                  </p>
                )}
                {canWrite && (processId || null) !== pub.process_id && (
                  <div className="mt-2">
                    <Submit formAction={link} variant="outline" pendingText="Salvando...">
                      Só vincular este processo
                    </Submit>
                  </div>
                )}
                <div className="mt-2">
                  <Feedback state={linkState} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  name="update_process_deadline"
                  checked={updateDeadline && Boolean(processId)}
                  disabled={!processId}
                  onChange={(e) => setUpdateDeadline(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Atualizar o próximo prazo do processo
              </label>
            </fieldset>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="mb-3 text-sm font-semibold text-slate-900">Conta ao vivo</h4>
              {"error" in calc ? (
                <p className="text-sm text-slate-500">{calc.error}</p>
              ) : (
                <DeadlineResultView result={calc.result} compact />
              )}
            </div>

            {canWrite && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={adjusting} onChange={(e) => setAdjusting(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  A data final é outra (ajustar com motivo)
                </label>
                {adjusting && (
                  <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="override_date">
                        Data final correta
                      </label>
                      <Input
                        id="override_date"
                        name="override_date"
                        type="date"
                        required
                        defaultValue={"result" in calc ? calc.result.finalDate : ""}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor="override_reason">
                        Motivo do ajuste (obrigatório)
                      </label>
                      <Textarea
                        id="override_reason"
                        name="override_reason"
                        rows={2}
                        required
                        minLength={5}
                        placeholder="Ex.: suspensão do expediente pelo Comunicado CSM nº ..."
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className={label} htmlFor="note">
                    Observações (opcional)
                  </label>
                  <Textarea id="note" name="note" rows={2} />
                </div>
                <Feedback state={confirmState} />
                <div>
                  <Submit pendingText="Confirmando...">Confirmar e criar prazo</Submit>
                  <p className="mt-2 text-xs text-slate-500">
                    Registra a conta no histórico de prazos, cria a tarefa &quot;Prazo: ...&quot; com prioridade alta (vence às
                    23:59 da data final) e lança o andamento no processo.
                  </p>
                </div>
              </div>
            )}
          </form>
        )}

        {mode === "descartar" && canWrite && (
          <form action={discard} className="space-y-3">
            <input type="hidden" name="publication_id" value={pub.id} />
            <div>
              <label className={label} htmlFor="reason">
                Motivo do descarte (obrigatório)
              </label>
              <Textarea
                id="reason"
                name="reason"
                rows={2}
                required
                minLength={3}
                placeholder="Ex.: intimação dirigida à parte contrária; sem providência nossa"
              />
            </div>
            <Feedback state={discardState} />
            <Submit variant="destructive" pendingText="Descartando...">
              Descartar intimação
            </Submit>
            <p className="text-xs text-slate-500">Nenhum prazo é criado. A intimação fica no histórico com o motivo.</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
