import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildHistory, runAgent, type AgentEvent } from "@/lib/assistant/agent";
import {
  ASSISTANT_HISTORY_LIMIT,
  ASSISTANT_MODEL,
  isAssistantConfigured,
} from "@/lib/assistant/config";
import {
  budgetMessage,
  computeCostUsd,
  getBudgetStatus,
  type BudgetStatus,
} from "@/lib/assistant/cost";
import { buildSystemPrompt, describePage } from "@/lib/assistant/prompt";
import { getAssistantSession, rateLimited } from "@/lib/assistant/session";
import {
  AssistantSetupError,
  createConversation,
  getConversation,
  getMonthSpendUsd,
  listMessages,
  saveMessage,
} from "@/lib/assistant/store";
import { getToolsFor } from "@/lib/assistant/tools";
import { getSettings } from "@/lib/data/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1, "Escreva uma pergunta.").max(4000, "Pergunta muito longa."),
  conversationId: z.string().min(1).max(64).nullish(),
  page: z.string().max(300).nullish(),
});

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function budgetFor(): Promise<{ status: BudgetStatus; enabled: boolean }> {
  const [settings, spent] = await Promise.all([getSettings(), getMonthSpendUsd()]);
  return {
    status: getBudgetStatus(spent, settings.assistant.monthly_limit_usd),
    enabled: settings.assistant.enabled,
  };
}

/** Situação do assistente (configurado, ligado, gasto do mês) para a interface. */
export async function GET() {
  const session = await getAssistantSession();
  if (!session) return json({ error: "Faça login para usar o assistente." }, 401);
  try {
    const { status, enabled } = await budgetFor();
    return json({
      configured: isAssistantConfigured(),
      enabled,
      isAdmin: session.isAdmin,
      budget: {
        level: status.level,
        message: budgetMessage(status),
        // Valores do gasto só para Admin.
        ...(session.isAdmin ? { spentUsd: status.spentUsd, limitUsd: status.limitUsd } : {}),
      },
    });
  } catch (err) {
    if (err instanceof AssistantSetupError) return json({ error: err.message, setup: true }, 503);
    console.error("[assistente] status", err);
    return json({ error: "Não foi possível consultar o assistente agora." }, 500);
  }
}

function friendlyApiError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) {
    return "Muitas perguntas ao mesmo tempo. Espere alguns segundos e tente de novo.";
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "A chave da IA (ANTHROPIC_API_KEY) está inválida ou sem permissão. Avise o administrador.";
  }
  if (err instanceof Anthropic.APIError && err.status === 529) {
    return "A IA está sobrecarregada no momento. Tente de novo em instantes.";
  }
  if (err instanceof Anthropic.APIError) {
    return "A IA não respondeu como esperado. Tente de novo em instantes.";
  }
  return "Algo deu errado ao responder. Tente de novo.";
}

export async function POST(request: Request) {
  const session = await getAssistantSession();
  if (!session) return json({ error: "Faça login para usar o assistente." }, 401);
  const { user, isAdmin } = session;

  if (!isAssistantConfigured()) {
    return json(
      { error: "O assistente ainda não foi ligado: falta a variável ANTHROPIC_API_KEY na Vercel." },
      503
    );
  }
  if (rateLimited(user.id)) {
    return json({ error: "Muitas perguntas seguidas. Espere um minuto e tente de novo." }, 429);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, 400);
    }
    body = parsed.data;
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }

  let budget: BudgetStatus;
  let conversationId: string;
  let history: Awaited<ReturnType<typeof listMessages>> = [];
  try {
    const b = await budgetFor();
    if (!b.enabled) return json({ error: "O assistente está desligado em Configurações." }, 403);
    budget = b.status;
    if (!budget.allowChat) return json({ error: budgetMessage(budget) }, 402);

    if (body.conversationId && (await getConversation(user.id, body.conversationId))) {
      conversationId = body.conversationId;
      history = await listMessages(user.id, conversationId, ASSISTANT_HISTORY_LIMIT);
    } else {
      conversationId = await createConversation(user.id, body.message);
    }
  } catch (err) {
    if (err instanceof AssistantSetupError) return json({ error: err.message }, 503);
    console.error("[assistente] preparação", err);
    return json({ error: "Não foi possível iniciar a conversa agora." }, 500);
  }

  const page = describePage(body.page);
  await saveMessage(user.id, conversationId, {
    role: "user",
    content: body.message,
    pageContext: body.page ?? null,
  });

  // Histórico só com o texto das mensagens anteriores (as consultas são refeitas
  // quando precisa, para nunca responder com dado velho).
  const messages = buildHistory(
    history,
    page ? `[Tela atual: ${page}]\n\n${body.message}` : body.message
  );

  const now = new Date();
  const client = new Anthropic();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // conexão fechada pelo navegador
        }
      };

      send({
        type: "meta",
        conversationId,
        budget: { level: budget.level, message: budgetMessage(budget) },
      });

      try {
        const result = await runAgent({
          client,
          model: ASSISTANT_MODEL,
          system: buildSystemPrompt(user, isAdmin, now),
          tools: getToolsFor(isAdmin),
          messages,
          ctx: { user, isAdmin, now },
          signal: abort.signal,
          onEvent: (e: AgentEvent) => send(e),
        });
        const costUsd = computeCostUsd(ASSISTANT_MODEL, result.usage);
        await saveMessage(user.id, conversationId, {
          role: "assistant",
          content: result.text,
          toolsUsed: result.toolsUsed,
          model: ASSISTANT_MODEL,
          usage: result.usage,
          costUsd,
        });
        send({ type: "done", conversationId, toolsUsed: result.toolsUsed });
      } catch (err) {
        if (abort.signal.aborted) {
          controller.close();
          return;
        }
        console.error("[assistente] resposta", err);
        send({ type: "error", message: friendlyApiError(err) });
      }
      controller.close();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
