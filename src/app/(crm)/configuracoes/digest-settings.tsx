import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, MessageCircle, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DIGEST_TEMPLATE_BODY } from "@/lib/digest/format";
import type { DigestRecipientView } from "@/lib/digest/recipients";
import { maskWhatsappNumber } from "@/lib/whatsapp-number";

/**
 * Bloco somente leitura: horário do resumo diário, quem recebe e o modelo a
 * aprovar na Meta. Quem recebe e os números são alterados na tela Equipe.
 */
export function DigestSettings({
  recipients,
  setupMissing,
  whatsappConfigured,
  cronConfigured,
  templateName,
  templateLang,
}: {
  recipients: DigestRecipientView[];
  setupMissing: boolean;
  whatsappConfigured: boolean;
  cronConfigured: boolean;
  templateName: string;
  templateLang: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-brand-gold" /> Resumo diário e WhatsApp
        </CardTitle>
        <CardDescription>
          Prazos dos próximos 7 dias, leads novos e urgentes, andamentos novos e tarefas atrasadas. Fica no painel e vai
          por WhatsApp. Valores financeiros só aparecem no painel de quem é Admin, nunca no WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {setupMissing && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Falta rodar <code className="font-mono">supabase/assistente-fase4.sql</code> no SQL Editor do Supabase.
            </p>
          </div>
        )}

        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 font-medium text-slate-700">
              <CalendarClock className="h-4 w-4 text-slate-400" /> Horário
            </dt>
            <dd className="mt-1 text-slate-600">
              Dias úteis (segunda a sexta), às 9h de Brasília. Fixo no agendamento da Vercel (
              <code className="font-mono text-xs">vercel.json</code>). Feriados não são pulados.
            </dd>
            <dd className="mt-1 text-xs text-slate-500">
              {cronConfigured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> CRON_SECRET configurado
                </span>
              ) : (
                <span className="text-amber-700">Falta CRON_SECRET na Vercel: a rotina não roda sem ele.</span>
              )}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 font-medium text-slate-700">
              <Users className="h-4 w-4 text-slate-400" /> Quem recebe
            </dt>
            <dd className="mt-1">
              {recipients.length === 0 ? (
                <p className="text-slate-500">Ninguém marcado ainda.</p>
              ) : (
                <ul className="space-y-1">
                  {recipients.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-slate-800">{r.name}</span>
                      {r.whatsapp_number ? (
                        <span className="font-mono text-xs text-slate-500">{maskWhatsappNumber(r.whatsapp_number)}</span>
                      ) : (
                        <span className="text-xs text-amber-700">sem WhatsApp: só no painel</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/equipe" className="mt-2 inline-block text-xs font-medium text-brand-primary hover:underline">
                Gerenciar na Equipe →
              </Link>
            </dd>
          </div>
        </dl>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
          <p className="font-medium text-slate-700">Modelo de mensagem para aprovar na Meta</p>
          <p className="mt-1 text-xs text-slate-500">
            Fora da conversa das últimas 24h o WhatsApp só entrega modelos aprovados. Crie no WhatsApp Manager (Meta
            Business) com estes dados:
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-slate-500">Nome</dt>
            <dd className="font-mono text-slate-800">{templateName}</dd>
            <dt className="text-slate-500">Categoria</dt>
            <dd className="text-slate-800">Utilidade (Utility)</dd>
            <dt className="text-slate-500">Idioma</dt>
            <dd className="text-slate-800">
              Português (BR) <span className="font-mono text-slate-500">({templateLang})</span>
            </dd>
            <dt className="text-slate-500">Corpo</dt>
            <dd className="break-words rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-slate-800">
              {DIGEST_TEMPLATE_BODY}
            </dd>
            <dt className="text-slate-500">Exemplos</dt>
            <dd className="break-words text-slate-600">
              {"{{1}}"} = Jean · {"{{2}}"} = 3 prazos nos próximos 7 dias (1 amanhã) · 2 leads urgentes
            </dd>
          </dl>
          <p className="mt-3 text-xs">
            {whatsappConfigured ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> WhatsApp configurado (WHATSAPP_ACCESS_TOKEN e
                WHATSAPP_PHONE_NUMBER_ID).
              </span>
            ) : (
              <span className="text-amber-700">
                WhatsApp ainda não configurado: o resumo fica só no painel até preencher WHATSAPP_ACCESS_TOKEN e
                WHATSAPP_PHONE_NUMBER_ID na Vercel.
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
