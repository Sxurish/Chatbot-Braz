import Link from "next/link";
import { ChevronLeft, ChevronRight, MessagesSquare, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { listConversations } from "@/lib/data/conversations";
import {
  channelMeta,
  statusMeta,
} from "@/lib/data/conversations-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ConversationFilters } from "./conversation-filters";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function relativeOrDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return dateFmt.format(d);
}

interface SearchParams {
  searchParams: { channel?: string; status?: string; page?: string };
}

export default async function Page({ searchParams }: SearchParams) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const channel = searchParams.channel || null;
  const status = searchParams.status || null;

  const result = await listConversations({ channel, status, page });

  const start =
    result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);

  function pageHref(p: number): string {
    const next = new URLSearchParams();
    if (channel) next.set("channel", channel);
    if (status) next.set("status", status);
    if (p > 1) next.set("page", String(p));
    const q = next.toString();
    return q ? `/conversas?${q}` : "/conversas";
  }

  const pagerClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "min-w-[110px]"
  );
  const pagerDisabledClass = cn(pagerClass, "pointer-events-none opacity-50");

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Histórico das conversas do chatbot por canal e status."
      />

      <Card>
        <CardContent className="space-y-4 py-6">
          <ConversationFilters />

          {!isSupabaseConfigured() ? (
            <EmptyState
              icon={MessagesSquare}
              title="Modo demonstração"
              description="Configure o Supabase para listar conversas reais do chatbot."
            />
          ) : result.rows.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nenhuma conversa encontrada"
              description={
                channel || status
                  ? "Ajuste os filtros para visualizar outras conversas."
                  : "As conversas aparecerão aqui conforme o chatbot for utilizado."
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {result.rows.map((c) => {
                  const ch = channelMeta(c.channel);
                  const st = statusMeta(c.status);
                  const title =
                    c.lead_name ??
                    c.contact_name ??
                    c.external_contact_id ??
                    "Contato anônimo";
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/conversas/${c.id}`}
                        className="flex flex-col gap-2 rounded-lg px-3 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-slate-900">
                              {title}
                            </span>
                            <Badge className={ch.tone}>{ch.label}</Badge>
                            <Badge className={st.tone}>{st.label}</Badge>
                          </div>
                          {c.last_message_snippet && (
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {c.last_message_snippet}
                            </p>
                          )}
                        </div>
                        <span
                          className="shrink-0 text-xs text-slate-500"
                          title={new Date(c.last_message_at).toLocaleString(
                            "pt-BR"
                          )}
                        >
                          {relativeOrDate(c.last_message_at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between text-sm text-slate-500">
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
