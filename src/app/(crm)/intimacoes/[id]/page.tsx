import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Info, Link2Off, Sparkles, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBadge, PublicationStatusBadge } from "@/components/intimacoes/badges";
import { ConfirmPanel } from "@/components/intimacoes/confirm-panel";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listProcesses } from "@/lib/data/fase6";
import { getPublication } from "@/lib/data/intimacoes";
import { getCalculation, listActiveCalendarDays } from "@/lib/data/prazos";
import { brDay } from "@/lib/prazos/calendar";
import { DEADLINE_DISCLAIMER, START_KIND_LABELS, UNIT_LABELS, type DeadlineCalculation } from "@/lib/prazos/types";
import { DeadlineResultView } from "@/components/prazos/deadline-result";
import { AI_STATUS_LABELS, type CourtPublication } from "@/lib/intimacoes/types";
import { uncertainSet } from "@/lib/intimacoes/rules";
import { cn } from "@/lib/utils";
import { brDateTime } from "../../processos/format";

const SIDE_LABELS = { ativo: "Polo ativo", passivo: "Polo passivo", outro: "Outros" } as const;

export default async function IntimacaoDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const pub = await getPublication(id);
  if (!pub) notFound();

  const open = pub.status === "para_conferir";
  const [user, processes, calendar, calculation] = await Promise.all([
    getCurrentUser(),
    open ? listProcesses() : Promise.resolve([]),
    open ? listActiveCalendarDays() : Promise.resolve([]),
    pub.calculation_id ? getCalculation(pub.calculation_id) : Promise.resolve(null),
  ]);
  const canWrite = user.active && user.role !== "visualizador";
  const options = processes
    .map((p) => ({ value: p.id, label: p.process_number ?? "Processo sem número", comarca: p.jurisdiction ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const title = pub.ai_reading?.actType || [pub.kind, pub.document_type].filter(Boolean).join(" · ") || "Intimação";

  return (
    <>
      <Link href="/intimacoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" /> Intimações
      </Link>

      <PageHeader
        title={title}
        description={`Disponibilizada no DJEN em ${brDay(pub.available_date)}${pub.process_number_masked ? ` · processo ${pub.process_number_masked}` : ""}`}
        action={
          <>
            <AiBadge pub={pub} />
            <PublicationStatusBadge status={pub.status} />
          </>
        }
      />

      <p className="mb-6 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Info className="h-4 w-4 shrink-0" />
        {DEADLINE_DISCLAIMER}
      </p>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <DataCard pub={pub} />

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Texto da intimação</CardTitle>
              {pub.ai_reading?.quote && (
                <p className="text-sm text-slate-500">
                  <mark className="rounded bg-amber-100 px-1 text-slate-800">Em destaque</mark> o trecho que a IA usou para o prazo.
                </p>
              )}
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="max-w-prose font-serif text-[16px] leading-8 break-words whitespace-pre-wrap text-slate-800">
                <Highlighted text={pub.text} quote={pub.ai_reading?.quote ?? null} />
              </div>
            </CardContent>
          </Card>

          <PartiesCard pub={pub} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <AiCard pub={pub} />
          {pub.status === "para_conferir" ? (
            <ConfirmPanel pub={pub} calendar={calendar} processes={options} canWrite={canWrite} />
          ) : (
            <ReviewedCard pub={pub} calculation={calculation} />
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-slate-900">{children || "—"}</dd>
    </div>
  );
}

function DataCard({ pub }: { pub: CourtPublication }) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle>Dados da intimação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {pub.cancelled && (
          <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> Cancelada no DJEN{pub.cancel_reason ? `: ${pub.cancel_reason}` : "."}
          </p>
        )}
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Tribunal">{pub.tribunal}</Row>
          <Row label="Órgão">{pub.organ}</Row>
          <Row label="Tipo">{[pub.kind, pub.document_type].filter(Boolean).join(" · ")}</Row>
          <Row label="Classe">{pub.class_name}</Row>
          <Row label="Disponibilização">{brDay(pub.available_date)}</Row>
          <Row label="Publicação">{pub.publication_date ? brDay(pub.publication_date) : null}</Row>
          <Row label="Processo">
            {pub.process_id ? (
              <Link href={`/processos/${pub.process_id}`} className="text-brand-primary hover:underline">
                {pub.process_title ?? pub.process_number_masked ?? "Ver processo"}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <Link2Off className="h-3.5 w-3.5" /> {pub.process_number_masked ?? "Sem número"} (fora do CRM)
              </span>
            )}
          </Row>
          <Row label="Capturada">{brDateTime(pub.captured_at)}</Row>
        </dl>
        {pub.link && (
          <a
            href={pub.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" /> Abrir no site do tribunal
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function PartiesCard({ pub }: { pub: CourtPublication }) {
  const sides = (["ativo", "passivo", "outro"] as const)
    .map((side) => ({ side, names: pub.parties.filter((p) => p.side === side).map((p) => p.name) }))
    .filter((s) => s.names.length > 0);
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle>Partes e advogados</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 text-sm sm:grid-cols-2 sm:p-6 sm:pt-0">
        <div className="space-y-3">
          {sides.length === 0 && <p className="text-slate-500">O DJEN não informou as partes.</p>}
          {sides.map((s) => (
            <div key={s.side}>
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{SIDE_LABELS[s.side]}</p>
              <ul className="mt-1 space-y-0.5 text-slate-900">
                {s.names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Advogados</p>
          {pub.lawyers.length === 0 ? (
            <p className="mt-1 text-slate-500">Não informados.</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-slate-900">
              {pub.lawyers.map((l) => (
                <li key={`${l.name}-${l.oab}`}>
                  {l.name}
                  {l.oab && (
                    <span className="text-slate-500">
                      {" "}
                      · OAB {l.oab}
                      {l.uf ? `/${l.uf}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AiField({ label, value, doubt }: { label: string; value: React.ReactNode; doubt?: boolean }) {
  return (
    <div className={cn("rounded-md px-3 py-2", doubt ? "border border-amber-300 bg-amber-50" : "bg-slate-50")}>
      <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        {doubt && (
          <span className="inline-flex items-center gap-0.5 text-amber-700">
            <AlertTriangle className="h-3 w-3" /> dúvida
          </span>
        )}
      </p>
      <p className={cn("text-sm font-medium", doubt ? "text-amber-900" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function AiCard({ pub }: { pub: CourtPublication }) {
  const r = pub.ai_reading;
  const doubts = uncertainSet(pub);
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-400" /> Leitura da IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {pub.ai_status !== "pronta" || !r ? (
          <p className="text-sm text-slate-600">
            {AI_STATUS_LABELS[pub.ai_status]}.{" "}
            {pub.ai_status === "pendente"
              ? "A IA lê as intimações logo depois da captura."
              : pub.ai_status === "falhou"
                ? `Leia o texto e preencha o prazo à mão.${pub.ai_error ? ` (${pub.ai_error})` : ""}`
                : "Leia o texto e preencha o prazo à mão."}
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-slate-700">{r.summary}</p>
            {doubts.size > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                A IA ficou em dúvida nos campos em destaque. Confira com atenção.
              </p>
            )}
            {!r.requiresAction && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                A IA entendeu que esta intimação não pede providência com prazo.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <AiField
                label="Prazo sugerido"
                doubt={doubts.has("dias")}
                value={r.suggestedDays ? `${r.suggestedDays} ${r.suggestedDays === 1 ? "dia" : "dias"}` : "Não sugerido"}
              />
              <AiField label="Contagem" doubt={doubts.has("unidade")} value={r.suggestedUnit ? UNIT_LABELS[r.suggestedUnit] : "—"} />
              <AiField label="Começa a partir de" doubt={doubts.has("inicio") || doubts.has("início")} value={START_KIND_LABELS[r.startKind]} />
              <AiField label="Em dobro" doubt={doubts.has("dobro")} value={r.dobro ? "Sim" : "Não"} />
              <AiField
                label="Processo"
                doubt={doubts.has("processo")}
                value={pub.process_id ? pub.process_title ?? "Vinculado" : "Não encontrado no CRM"}
              />
              <AiField label="Base legal" value={r.legalBasis ?? "—"} />
            </div>
            {r.quote && (
              <blockquote className="border-l-2 border-amber-300 pl-3 font-serif text-[15px] leading-7 text-slate-700 italic">
                “{r.quote}”
              </blockquote>
            )}
            <p className="text-xs text-slate-500">Lida em {brDateTime(pub.ai_read_at)}. É uma sugestão: quem decide é o advogado.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewedCard({ pub, calculation }: { pub: CourtPublication; calculation: DeadlineCalculation | null }) {
  const confirmed = pub.status === "confirmada";
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2">
          {confirmed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}
          {confirmed ? "Conferida e confirmada" : "Descartada"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
        <p className="text-slate-700">
          Por <span className="font-medium">{pub.reviewed_by_name ?? "—"}</span> em {brDateTime(pub.reviewed_at)}.
        </p>
        {pub.review_note && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-700">
            <span className="font-medium">{confirmed ? "Observação" : "Motivo"}:</span> {pub.review_note}
          </p>
        )}
        {confirmed && calculation?.final_date && (
          <div className="border-t border-slate-100 pt-3">
            <DeadlineResultView result={calculation.result} adjustedTo={calculation.final_date} compact />
          </div>
        )}
        {confirmed && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {pub.task_id && (
              <Link href="/tarefas" className="text-brand-primary hover:underline">
                Ver a tarefa do prazo
              </Link>
            )}
            {pub.process_id && (
              <Link href={`/processos/${pub.process_id}`} className="text-brand-primary hover:underline">
                Ver o processo
              </Link>
            )}
            <Link href="/prazos" className="text-brand-primary hover:underline">
              Histórico de prazos
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Destaca o trecho citado pela IA, quando ele aparece igual no texto. */
function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  const q = (quote ?? "").trim();
  const at = q.length >= 10 ? text.indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-amber-100 px-0.5 text-slate-900">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
