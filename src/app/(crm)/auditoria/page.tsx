import Link from "next/link";
import { ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listAuditLogs } from "@/lib/data/audit";
import {
  actionMeta,
  ACTION_TONE_CLASS,
  entityInfo,
} from "@/lib/data/audit-types";
import { listTeam } from "@/lib/data/leads";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AuditFilters } from "./audit-filters";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function relativeOrDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return dateFmt.format(d);
}

interface SearchParams {
  searchParams: { user?: string; page?: string };
}

export default async function Page({ searchParams }: SearchParams) {
  const admin = await checkAdmin();

  if (!admin.ok) {
    return (
      <>
        <PageHeader
          title="Logs de auditoria"
          description="Histórico de ações da equipe no sistema."
        />
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ShieldAlert}
              title="Acesso restrito"
              description="Apenas administradores podem visualizar os logs de auditoria."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const page = Math.max(1, Number(searchParams.page) || 1);
  const userFilter = searchParams.user || null;

  const [team, result] = await Promise.all([
    listTeam(),
    listAuditLogs({ userId: userFilter, page }),
  ]);

  const start =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);

  function pageHref(p: number): string {
    const next = new URLSearchParams();
    if (userFilter) next.set("user", userFilter);
    if (p > 1) next.set("page", String(p));
    const q = next.toString();
    return q ? `/auditoria?${q}` : "/auditoria";
  }

  const pagerClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "min-w-[110px]"
  );
  const pagerDisabledClass = cn(pagerClass, "pointer-events-none opacity-50");

  return (
    <>
      <PageHeader
        title="Logs de auditoria"
        description="Histórico das ações importantes realizadas pela equipe no sistema."
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <div className="pt-3">
            <AuditFilters team={team} />
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {!isSupabaseConfigured() ? (
            <EmptyState
              title="Modo demonstração"
              description="Configure o Supabase para começar a registrar e visualizar logs de auditoria."
            />
          ) : result.rows.length === 0 ? (
            <EmptyState
              title="Nenhum registro encontrado"
              description={
                userFilter
                  ? "Ajuste o filtro para visualizar outros registros."
                  : "Os logs de auditoria aparecerão aqui conforme a equipe usar o sistema."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Quando</th>
                      <th className="py-2 pr-3 font-medium">Usuário</th>
                      <th className="py-2 pr-3 font-medium">Ação</th>
                      <th className="py-2 pr-3 font-medium">Entidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((r) => {
                      const meta = actionMeta(r.action);
                      const ent = entityInfo(r.entity_type);
                      const href = ent.href(r.entity_id);
                      return (
                        <tr key={r.id}>
                          <td
                            className="py-2.5 pr-3 text-slate-600"
                            title={new Date(r.created_at).toLocaleString(
                              "pt-BR"
                            )}
                          >
                            {relativeOrDate(r.created_at)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">
                            {r.user_name ?? (
                              <span className="text-slate-400">Sistema</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <Badge className={ACTION_TONE_CLASS[meta.tone]}>
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">
                            {href ? (
                              <Link
                                href={href}
                                className="font-medium text-brand-primary hover:underline"
                              >
                                {ent.label}
                              </Link>
                            ) : (
                              <span>{ent.label}</span>
                            )}
                            {r.entity_id && (
                              <span className="ml-1 font-mono text-xs text-slate-400">
                                #{r.entity_id.slice(0, 8)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  {start}–{end} de {result.total}
                </span>
                <div className="flex items-center gap-2">
                  {result.page > 1 ? (
                    <Link
                      href={pageHref(result.page - 1)}
                      className={pagerClass}
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Link>
                  ) : (
                    <span className={pagerDisabledClass}>
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </span>
                  )}
                  {result.page < result.totalPages ? (
                    <Link
                      href={pageHref(result.page + 1)}
                      className={pagerClass}
                    >
                      Próxima <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className={pagerDisabledClass}>
                      Próxima <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
