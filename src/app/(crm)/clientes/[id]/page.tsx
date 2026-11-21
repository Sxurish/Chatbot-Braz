import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, FileSignature, FileText, Mail, MapPin, Phone, Scale, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaBadge, ContractStatusBadge, LegalStatusBadge } from "@/components/crm/status-badge";
import { EditClientButton } from "@/components/crm/edit-records";
import { ConfirmDeleteButton, StatusButton } from "@/components/crm/record-actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClientFicha } from "@/lib/data/fichas";
import { deleteClientAction } from "@/lib/data/edicao-actions";
import { canRemove, canWriteRole } from "@/lib/data/edicao-rules";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Ficha do cliente: dados, casos, processos, contratos (Admin) e documentos. */
export default async function ClientPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [ficha, user] = await Promise.all([getClientFicha(id), getCurrentUser()]);
  if (!ficha) notFound();
  const { client, cases, processes, contracts, documents } = ficha;
  const canWrite = canWriteRole(user.role, user.active);
  const canDelete = canRemove(user.role, "client", user.active);
  const isAdmin = user.role === "admin";
  const active = client.status === "ativo";

  return (
    <>
      <Link
        href="/clientes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Link>

      <PageHeader
        title={client.full_name}
        description={`Cliente desde ${formatDate(client.created_at)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                active
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }
            >
              {active ? "Ativo" : "Inativo"}
            </Badge>
            {canWrite && <EditClientButton client={client} />}
            {canWrite && (
              <StatusButton
                kind="client"
                id={client.id}
                status={active ? "inativo" : "ativo"}
                label={active ? "Inativar" : "Reativar"}
              />
            )}
            {canDelete && (
              <ConfirmDeleteButton
                fields={{ id: client.id }}
                action={deleteClientAction}
                label="Remover"
                question="Remover este cliente de vez?"
              />
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400" /> Casos ({cases.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cases.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum caso deste cliente.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/casos/${c.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-brand-primary"
                      >
                        <span className="font-medium">{c.title}</span>
                        <span className="flex gap-2">
                          <AreaBadge area={c.legal_area} />
                          <LegalStatusBadge status={c.status} />
                        </span>
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
                <Scale className="h-4 w-4 text-slate-400" /> Processos ({processes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {processes.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum processo ligado aos casos deste cliente.</p>
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

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-slate-400" /> Contratos ({contracts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum contrato deste cliente.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {contracts.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                        <span>{c.contract_type ?? "Contrato"}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-600">{formatCurrency(c.value)}</span>
                          <ContractStatusBadge status={c.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-slate-400" /> Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" /> {client.phone ?? "—"}
              </p>
              <p className="flex items-center gap-2 break-all">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" /> {client.email ?? "—"}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                {client.city ? `${client.city}${client.state ? `/${client.state}` : ""}` : "—"}
              </p>
              <p className="font-mono text-xs text-slate-500">CPF/CNPJ: {client.cpf_cnpj ?? "—"}</p>
              {client.lead_id && (
                <Link href={`/leads/${client.lead_id}`} className="text-brand-primary hover:underline">
                  Ver o lead de origem
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" /> Documentos ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum documento ligado direto ao cliente. Os do lead ficam na ficha do lead.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {documents.map((d) => (
                    <li key={d.id} className="truncate">
                      {d.file_name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
