import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireTeamAccess } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getLead } from "@/lib/data/leads";
import { listDocumentsByLead } from "@/lib/data/crm";
import { getTeamNames } from "@/lib/data/team-names";
import { getSettings } from "@/lib/data/settings";
import { nameOf } from "@/lib/team-names";
import { SOURCE_LABELS } from "@/lib/data/cadastros-rules";
import { CATEGORY_LABELS } from "@/lib/data/documents-types";
import {
  COMMERCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  LEGAL_STATUS_LABELS,
  URGENCY_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PrintToolbar } from "./print-toolbar";

export const metadata: Metadata = { title: "Resumo do lead — CRM Jurídico" };

/**
 * Resumo do lead para imprimir ou salvar em PDF (pela janela de impressão do
 * navegador). Fica fora do layout do CRM para sair sem menu lateral.
 */
export default async function LeadSummaryPrintPage(props: { params: Promise<{ id: string }> }) {
  await requireTeamAccess();
  const { id } = await props.params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [documents, names, settings, user] = await Promise.all([
    listDocumentsByLead(lead.id),
    getTeamNames(),
    getSettings(),
    getCurrentUser(),
  ]);

  // LGPD: exportar dados pessoais fica registrado na auditoria.
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.from("audit_logs").insert({
        user_id: user.id.startsWith("demo") ? null : user.id,
        action: "export_lead_summary",
        entity_type: "lead",
        entity_id: lead.id,
      });
    } catch {
      // auditoria não bloqueia
    }
  }

  const generatedAt = formatDateTime(new Date());

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <PrintToolbar backHref={`/leads/${lead.id}`} />

        <article className="rounded-xl bg-white p-6 text-sm text-slate-800 shadow-sm sm:p-10 print:rounded-none print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-primary pb-4">
            <div>
              <p className="text-base font-semibold text-brand-primary">{settings.office_name}</p>
              {settings.office.oab && <p className="text-xs text-slate-500">{settings.office.oab}</p>}
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-medium uppercase tracking-wide text-slate-700">Resumo do lead</p>
              <p>Gerado em {generatedAt}</p>
              <p>por {user.name}</p>
            </div>
          </header>

          <h1 className="mt-6 text-xl font-semibold text-slate-900">{lead.full_name}</h1>
          <p className="text-slate-500">{lead.case_type ?? "Atendimento jurídico"}</p>

          {lead.urgency === "alta" && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <strong>Atendimento prioritário.</strong> {lead.urgency_reason ?? ""}
            </p>
          )}

          <Section title="Contato">
            <Row label="Telefone" value={lead.phone} />
            <Row label="E-mail" value={lead.email} />
            <Row label="Cidade / UF" value={lead.city ? `${lead.city}${lead.state ? ` / ${lead.state}` : ""}` : null} />
            <Row label="Melhor horário" value={lead.preferred_contact_time} />
          </Section>

          <Section title="Caso">
            <Row label="Área" value={LEGAL_AREA_LABELS[lead.legal_area] ?? lead.legal_area} />
            <Row label="Subárea" value={lead.subarea} />
            <Row label="Urgência" value={URGENCY_LABELS[lead.urgency] ?? lead.urgency} />
            {lead.urgency_reason && <Row label="Motivo da urgência" value={lead.urgency_reason} />}
            <Row label="Processo" value={lead.process_number} />
            <div className="col-span-full mt-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resumo</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed">
                {lead.case_summary ?? "Sem resumo registrado."}
              </p>
            </div>
            {lead.next_action && (
              <div className="col-span-full">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Próxima ação</p>
                <p className="mt-1">{lead.next_action}</p>
              </div>
            )}
          </Section>

          <Section title="Atendimento">
            <Row label="Status comercial" value={COMMERCIAL_STATUS_LABELS[lead.commercial_status]} />
            <Row label="Status jurídico" value={LEGAL_STATUS_LABELS[lead.legal_status]} />
            <Row label="Status financeiro" value={FINANCIAL_STATUS_LABELS[lead.financial_status]} />
            <Row label="Origem" value={SOURCE_LABELS[lead.source] ?? lead.source} />
            <Row label="Responsável" value={nameOf(names, lead.assigned_to)} />
            <Row label="Cadastrado em" value={formatDateTime(lead.created_at)} />
          </Section>

          <Section title="LGPD">
            <Row label="Consentimento" value={lead.consent_given ? "Concedido" : "Não concedido"} />
            <Row label="Data" value={lead.consent_at ? formatDateTime(lead.consent_at) : null} />
            <Row label="Versão da política" value={lead.privacy_policy_version} />
          </Section>

          <section className="mt-6 break-inside-avoid">
            <h2 className="border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-primary">
              Documentos ({documents.length})
            </h2>
            {documents.length === 0 ? (
              <p className="mt-2 text-slate-500">Nenhum documento enviado.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className="break-all">{doc.file_name}</span>
                    <span className="text-xs text-slate-500">
                      {CATEGORY_LABELS[doc.category] ?? doc.category} • {formatDate(doc.created_at)} • {doc.review_status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Documento interno com dados pessoais protegidos pela LGPD. Não compartilhe fora do escritório.
          </footer>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-primary">
        {title}
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}
