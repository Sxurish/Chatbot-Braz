import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSignature, ListChecks, Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaBadge, ContractStatusBadge, LegalStatusBadge } from "@/components/crm/status-badge";
import { EditCaseButton } from "@/components/crm/edit-records";
import { ConfirmDeleteButton } from "@/components/crm/record-actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCaseFicha } from "@/lib/data/fichas";
import { listClientOptions } from "@/lib/data/fase6-options";
import { listResponsibleOptions } from "@/lib/data/cadastros-options";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { deleteCaseAction } from "@/lib/data/edicao-actions";
import { canRemove, canWriteRole } from "@/lib/data/edicao-rules";
import { TASK_STATUS_LABELS } from "@/lib/list-views/tarefas";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

/** Ficha do caso: dados, cliente/lead, processos, contratos (Admin) e tarefas. */
export default async function CasePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [ficha, user, names] = await Promise.all([getCaseFicha(id), getCurrentUser(), getTeamNames()]);
  if (!ficha) notFound();
  const { item, client, lead, processes, contracts, tasks } = ficha;
  const canWrite = canWriteRole(user.role, user.active);
  const canDelete = canRemove(user.role, "case", user.active);
  const isAdmin = user.role === "admin";
  const [clients, team] = canWrite
    ? await Promise.all([listClientOptions(), listResponsibleOptions()])
    : [[], []];

  return (
    <>
      <Link
        href="/casos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para casos
      </Link>

      <PageHeader
        title={item.title}
        description={`Aberto em ${formatDate(item.created_at)} • Responsável: ${nameOf(names, item.assigned_to)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AreaBadge area={item.legal_area} />
            <LegalStatusBadge status={item.status} />
            {canWrite && <EditCaseButton item={item} clients={clients} team={team} />}
            {canDelete && (
              <ConfirmDeleteButton
                fields={{ id: item.id }}
                action={deleteCaseAction}
                label="Remover"
                question="Remover este caso de vez?"
              />
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line text-slate-700">
                {item.summary || "Sem resumo. Use “Editar” para escrever."}
              </p>
              {item.subarea && <p className="mt-3 text-xs text-slate-500">Subárea: {item.subarea}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-slate-400" /> Processos ({processes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {processes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum processo neste caso. Cadastre na aba <Link href="/processos" className="text-brand-primary hover:underline">Processos</Link>.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {processes.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/processos/${p.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-brand-primary"
                      >
                        <span className="font-mono text-sm">{p.process_number ?? "Sem número"}</span>
                        <LegalStatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-slate-400" /> Tarefas ({tasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma tarefa ligada a este caso.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span>{t.title}</span>
                      <span className="text-xs text-slate-500">
                        {TASK_STATUS_LABELS[t.status]} • {formatDateTime(t.due_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pessoa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {client ? (
                <Link href={`/clientes/${client.id}`} className="block text-brand-primary hover:underline">
                  Cliente: {client.full_name}
                </Link>
              ) : (
                <p className="text-slate-500">Sem cliente.</p>
              )}
              {lead && (
                <Link href={`/leads/${lead.id}`} className="block text-brand-primary hover:underline">
                  Lead de origem: {lead.full_name}
                </Link>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-slate-400" /> Contratos ({contracts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum contrato neste caso.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {contracts.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{c.contract_type ?? "Contrato"} • {formatCurrency(c.value)}</span>
                        <ContractStatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
