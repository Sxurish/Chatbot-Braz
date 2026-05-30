import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Clock,
  FileText,
  CalendarPlus,
  UserCheck,
  ListPlus,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AreaBadge,
  CommercialStatusBadge,
  FinancialStatusBadge,
  LegalStatusBadge,
  UrgencyBadge,
} from "@/components/crm/status-badge";
import { DocumentUpload } from "@/components/crm/document-upload";
import { getUserName, mockTimeline } from "@/lib/mock-data";
import { getLead } from "@/lib/data/leads";
import { listDocumentsByLead } from "@/lib/data/crm";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const lead = await getLead(params.id);
  if (!lead) notFound();

  const timeline = mockTimeline[lead.id] ?? [];
  const documents = await listDocumentsByLead(lead.id);

  return (
    <>
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para leads
      </Link>

      <PageHeader
        title={lead.full_name}
        description={lead.case_type ?? "Atendimento jurídico"}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <CalendarPlus className="h-4 w-4" /> Agendar
            </Button>
            <Button variant="outline" size="sm">
              <UserCheck className="h-4 w-4" /> Tornar cliente
            </Button>
            <Button variant="gold" size="sm">
              <FileText className="h-4 w-4" /> Exportar resumo
            </Button>
          </div>
        }
      />

      {lead.urgency === "alta" && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Atendimento prioritário</p>
            <p className="text-red-600">{lead.urgency_reason}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Resumo do caso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <AreaBadge area={lead.legal_area} />
                {lead.subarea && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    {lead.subarea}
                  </span>
                )}
                <UrgencyBadge urgency={lead.urgency} />
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {lead.case_summary ?? "Sem resumo registrado."}
              </p>
              {lead.next_action && (
                <div className="rounded-lg bg-brand-primary/5 px-4 py-3 text-sm text-brand-primary">
                  <span className="font-medium">Próxima ação:</span> {lead.next_action}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documentos vinculados</CardTitle>
              <DocumentUpload leadId={lead.id} />
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Nenhum documento enviado ainda.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {doc.file_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {doc.category} • {(doc.file_size / 1024).toFixed(0)} KB •{" "}
                            {formatDate(doc.created_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={
                          doc.review_status === "revisado"
                            ? "text-xs text-emerald-600"
                            : "text-xs text-amber-600"
                        }
                      >
                        {doc.review_status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline do atendimento</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Nenhum evento registrado.
                </p>
              ) : (
                <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                  {timeline.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                      <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                      {entry.description && (
                        <p className="text-sm text-slate-600">{entry.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        {entry.author} • {formatDateTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={Phone} value={lead.phone} />
              <InfoRow icon={Mail} value={lead.email} />
              <InfoRow
                icon={MapPin}
                value={lead.city ? `${lead.city} / ${lead.state}` : null}
              />
              <InfoRow icon={Clock} value={lead.preferred_contact_time} />
              <Separator />
              <div className="flex justify-between">
                <span className="text-slate-500">Responsável</span>
                <span className="font-medium text-slate-900">
                  {getUserName(lead.assigned_to)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Origem</span>
                <span className="font-medium text-slate-900">{lead.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Processo</span>
                <span className="font-medium text-slate-900">
                  {lead.process_number ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusRow label="Comercial">
                <CommercialStatusBadge status={lead.commercial_status} />
              </StatusRow>
              <StatusRow label="Jurídico">
                <LegalStatusBadge status={lead.legal_status} />
              </StatusRow>
              <StatusRow label="Financeiro">
                <FinancialStatusBadge status={lead.financial_status} />
              </StatusRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conformidade LGPD</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Consentimento</span>
                <span
                  className={
                    lead.consent_given
                      ? "font-medium text-emerald-600"
                      : "font-medium text-red-600"
                  }
                >
                  {lead.consent_given ? "Concedido" : "Não concedido"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data</span>
                <span className="text-slate-900">{formatDateTime(lead.consent_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Versão da política</span>
                <span className="text-slate-900">
                  {lead.privacy_policy_version ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações rápidas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              <Button variant="outline" size="sm" className="justify-start">
                <ListPlus className="h-4 w-4" /> Criar tarefa
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <Repeat className="h-4 w-4" /> Criar follow-up
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <FileText className="h-4 w-4" /> Criar caso
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3 text-slate-700">
      <Icon className="h-4 w-4 text-slate-400" />
      <span>{value ?? "—"}</span>
    </div>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      {children}
    </div>
  );
}
