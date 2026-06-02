import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getConversation, listMessages } from "@/lib/data/conversations";
import {
  channelMeta,
  statusMeta,
} from "@/lib/data/conversations-types";
import { MessageBubble } from "./message-bubble";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface Params {
  params: { id: string };
}

export default async function Page({ params }: Params) {
  const conversation = await getConversation(params.id);
  if (!conversation) notFound();

  const messages = await listMessages(params.id);
  const ch = channelMeta(conversation.channel);
  const st = statusMeta(conversation.status);
  const handoffFlagged = messages.some(
    (m) =>
      m.sender_type === "bot" &&
      (m.metadata as { handoff?: boolean } | null)?.handoff === true
  );
  const title =
    conversation.lead_name ??
    conversation.contact_name ??
    conversation.external_contact_id ??
    "Conversa";

  return (
    <>
      <div className="mb-2">
        <Link
          href="/conversas"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para conversas
        </Link>
      </div>
      <PageHeader
        title={title}
        description={`Conversa iniciada em ${dateFmt.format(
          new Date(conversation.created_at)
        )}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={ch.tone}>{ch.label}</Badge>
            <Badge className={st.tone}>{st.label}</Badge>
            {conversation.lead_id && (
              <Link
                href={`/leads/${conversation.lead_id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline"
              >
                Ver lead <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        }
      />

      {handoffFlagged && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Esta conversa foi sinalizada para <strong>handoff humano</strong>. A
            equipe jurídica deve assumir o atendimento.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="py-6">
          {messages.length === 0 ? (
            <EmptyState
              title="Sem mensagens"
              description="Esta conversa ainda não tem mensagens registradas."
            />
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
