import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClientLike } from "@/lib/assistant/agent";
import { getAssistantSession } from "@/lib/assistant/session";
import { getToolsFor } from "@/lib/assistant/tools";
import {
  findTeamMemberByPhone,
  getWhatsappTools,
  handleTeamWhatsapp,
  type MemberLookupDb,
} from "@/lib/assistant/whatsapp";
import {
  buildDraftFooter,
  composeWhatsappReply,
  isDigestDetailsRequest,
  parseConfirmReply,
  splitWhatsappMessage,
  toWhatsappText,
} from "@/lib/assistant/whatsapp-format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { dispatchWhatsappPayload } from "@/lib/channels/whatsapp-dispatch";
import type { InboundMessage } from "@/lib/channels/types";
import { runAsTeamMember } from "@/lib/supabase/request-context";
import type { TeamUser, UserRole } from "@/lib/types";
import {
  maskWhatsappNumber,
  parseWhatsappNumberInput,
  whatsappNumberVariants,
} from "@/lib/whatsapp-number";

const BASE = "https://crm.exemplo.adv.br";

function member(role: UserRole, extra: Partial<TeamUser> = {}): TeamUser {
  return {
    id: `wa-${role}`,
    name: `Pessoa ${role}`,
    email: `${role}@teste.dev`,
    role,
    active: true,
    last_login: null,
    created_at: "2026-01-01T00:00:00Z",
    whatsapp_number: "5511988887777",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Número e roteamento
// ---------------------------------------------------------------------------

/** Banco falso: só a busca de users por whatsapp_number. */
function fakeUsersDb(rows: TeamUser[]): MemberLookupDb & { queried: string[][] } {
  const queried: string[][] = [];
  return {
    queried,
    from() {
      return {
        select() {
          return {
            in(_col: string, values: string[]) {
              queried.push(values);
              return {
                eq(_c: string, active: boolean) {
                  return {
                    limit: async (n: number) => ({
                      data: rows
                        .filter((r) => r.active === active && values.includes(r.whatsapp_number ?? ""))
                        .slice(0, n),
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function payload(from: string, text: string, id: string, type = "text") {
  const message =
    type === "text"
      ? { from, id, timestamp: "1763300000", type, text: { body: text } }
      : { from, id, timestamp: "1763300000", type, [type]: { id: "media-1" } };
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { contacts: [{ profile: { name: "Contato" } }], messages: [message] } }] }],
  };
}

describe("número de WhatsApp da equipe", () => {
  it("aceita o celular com e sem o nono dígito (Brasil)", () => {
    expect(whatsappNumberVariants("+55 (11) 98888-7777").sort()).toEqual(["551188887777", "5511988887777"]);
    expect(whatsappNumberVariants("551188887777")).toContain("5511988887777");
    // Fixo (começa com 2–5) não ganha nono dígito.
    expect(whatsappNumberVariants("551133334444")).toEqual(["551133334444"]);
    // Outro país: só a forma recebida.
    expect(whatsappNumberVariants("14155550100")).toEqual(["14155550100"]);
  });

  it("valida o que o Admin digita (DDI obrigatório)", () => {
    expect(parseWhatsappNumberInput("+55 11 98888-7777")).toEqual({ ok: true, number: "5511988887777" });
    expect(parseWhatsappNumberInput("")).toEqual({ ok: true, number: null });
    expect(parseWhatsappNumberInput("11 98888-7777").ok).toBe(false);
    expect(parseWhatsappNumberInput("011 98888-7777").ok).toBe(false);
    expect(parseWhatsappNumberInput("55 11 9888").ok).toBe(false);
  });

  it("mascara o número na lista", () => {
    expect(maskWhatsappNumber("5511988887777")).toBe("+55 11 9••••-7777");
    expect(maskWhatsappNumber("5511988887777")).not.toContain("98888");
    expect(maskWhatsappNumber(null)).toBe("");
  });

  it("reconhece a pessoa pelo número, com ou sem o nono dígito", async () => {
    const jean = member("admin");
    const db = fakeUsersDb([jean]);
    expect((await findTeamMemberByPhone("5511988887777", db))?.id).toBe(jean.id);
    expect((await findTeamMemberByPhone("551188887777", db))?.id).toBe(jean.id);
    expect(await findTeamMemberByPhone("5511977776666", db)).toBeNull();
  });

  it("não reconhece pessoa desativada nem número em duas pessoas", async () => {
    expect(await findTeamMemberByPhone("5511988887777", fakeUsersDb([member("admin", { active: false })]))).toBeNull();
    const dup = fakeUsersDb([member("admin"), member("advogado", { whatsapp_number: "551188887777" })]);
    expect(await findTeamMemberByPhone("5511988887777", dup)).toBeNull();
  });

  it("sem service role (demonstração) ninguém chega ao assistente", async () => {
    expect(await findTeamMemberByPhone("5511988887777")).toBeNull();
  });

  it("número da equipe vai ao assistente; desconhecido vai à triagem", async () => {
    const db = fakeUsersDb([member("advogado")]);
    const calls: string[] = [];
    const deferred: (() => Promise<unknown>)[] = [];
    const deps = {
      teamEnabled: true,
      findMember: (id: string) => findTeamMemberByPhone(id, db),
      team: async (m: TeamUser, msg: InboundMessage) => void calls.push(`assistente:${m.id}:${msg.text}`),
      teamMedia: async (m: TeamUser) => void calls.push(`midia:${m.id}`),
      triage: async (msg: InboundMessage) => void calls.push(`triagem:${msg.contactId}`),
      defer: (task: () => Promise<unknown>) => void deferred.push(task),
    };

    // Meta mandou sem o nono dígito: ainda é da equipe.
    let summary = await dispatchWhatsappPayload(payload("551188887777", "prazos de hoje?", "m1"), deps);
    expect(summary).toEqual({ assistant: 1, triage: 0, media: 0 });
    expect(calls).toEqual([]); // roda depois do 200
    await Promise.all(deferred.map((t) => t()));
    expect(calls).toEqual(["assistente:wa-advogado:prazos de hoje?"]);

    calls.length = 0;
    deferred.length = 0;
    summary = await dispatchWhatsappPayload(payload("5521912345678", "Oi, preciso de um advogado", "m2"), deps);
    expect(summary).toEqual({ assistant: 0, triage: 1, media: 0 });
    expect(calls).toEqual(["triagem:5521912345678"]);
    expect(deferred).toHaveLength(0);

    // Mídia: aviso só para a equipe; de cliente continua ignorada.
    calls.length = 0;
    summary = await dispatchWhatsappPayload(payload("5511988887777", "", "m3", "document"), deps);
    await Promise.all(deferred.map((t) => t()));
    expect(summary.media).toBe(1);
    expect(calls).toEqual(["midia:wa-advogado"]);
    deferred.length = 0;
    calls.length = 0;
    summary = await dispatchWhatsappPayload(payload("5521912345678", "", "m4", "image"), deps);
    expect(summary).toEqual({ assistant: 0, triage: 0, media: 0 });
    expect(calls).toEqual([]);
  });

  it("falha na busca do número cai na triagem (nunca no assistente)", async () => {
    const calls: string[] = [];
    await dispatchWhatsappPayload(payload("5511988887777", "oi", "m5"), {
      teamEnabled: true,
      findMember: async () => {
        throw new Error("banco fora");
      },
      team: async () => void calls.push("assistente"),
      teamMedia: async () => void calls.push("midia"),
      triage: async () => void calls.push("triagem"),
      defer: (t) => void t(),
    });
    expect(calls).toEqual(["triagem"]);
  });

  it("sem o segredo da Meta (assinatura não conferida) o número da equipe vai à triagem", async () => {
    const calls: string[] = [];
    await dispatchWhatsappPayload(payload("5511988887777", "oi", "m6"), {
      teamEnabled: false,
      findMember: async () => member("admin"),
      team: async () => void calls.push("assistente"),
      teamMedia: async () => void calls.push("midia"),
      triage: async () => void calls.push("triagem"),
      defer: (t) => void t(),
    });
    expect(calls).toEqual(["triagem"]);
  });
});

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

describe("ferramentas pelo WhatsApp", () => {
  const FINANCE = /financ|pagament|contrat/;

  it("nenhuma ferramenta financeira, nem para Admin", () => {
    // No painel o Admin tem as financeiras...
    expect(getToolsFor(true).some((t) => t.adminOnly)).toBe(true);
    // ...no WhatsApp, não.
    for (const role of ["admin", "advogado", "atendente", "financeiro", "visualizador"] as UserRole[]) {
      const tools = getWhatsappTools({ role });
      expect(tools.some((t) => t.adminOnly)).toBe(false);
      expect(tools.map((t) => t.name).filter((n) => FINANCE.test(n))).toEqual([]);
    }
  });

  it("Visualizador não recebe ferramentas de rascunho; os outros recebem (sem anexar documento)", () => {
    expect(getWhatsappTools({ role: "visualizador" }).some((t) => t.name.startsWith("preparar_"))).toBe(false);
    const adv = getWhatsappTools({ role: "advogado" }).map((t) => t.name);
    expect(adv).toContain("preparar_tarefa");
    expect(adv).toContain("preparar_andamento");
    expect(adv).not.toContain("preparar_documento");
  });
});

// ---------------------------------------------------------------------------
// "OK" / "CANCELAR"
// ---------------------------------------------------------------------------

describe("resposta OK / CANCELAR", () => {
  it.each(["OK", "ok", "Ok!", " sim ", "Confirmo.", "pode gravar", "Pode gravar!", "SIM", "👍"])(
    "%s confirma",
    (t) => expect(parseConfirmReply(t)).toBe("confirm")
  );
  it.each(["CANCELAR", "cancela", "Não", "nao", "descartar", "não grava"])("%s cancela", (t) =>
    expect(parseConfirmReply(t)).toBe("cancel")
  );
  it.each([
    "ok, mas muda a data",
    "ok mas o responsável é a Marina",
    "sim, só troca o horário para 15h",
    "não, a data é dia 20",
    "quais são os prazos de hoje?",
    "cancelar a audiência de amanhã",
    "okay então muda o título",
    "",
  ])("%s não é confirmação nem cancelamento", (t) => expect(parseConfirmReply(t)).toBeNull());

  it("pedido de detalhes do resumo diário", () => {
    expect(isDigestDetailsRequest("Ver detalhes")).toBe(true);
    expect(isDigestDetailsRequest("resumo!")).toBe(true);
    expect(isDigestDetailsRequest("quais os detalhes do processo 123?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

describe("Markdown para o WhatsApp", () => {
  it("negrito, títulos, listas e links absolutos", () => {
    const md = [
      "## Prazos de hoje",
      "",
      "- **Contestação** no [processo 1002345](/processos/proc-001)",
      "* Ligar para a [Ana](/leads/lead-002)",
      "",
      "Veja a [agenda](/agenda).",
    ].join("\n");
    const out = toWhatsappText(md, `${BASE}/`);
    expect(out).toBe(
      [
        "*Prazos de hoje*",
        "",
        `• *Contestação* no processo 1002345: ${BASE}/processos/proc-001`,
        `• Ligar para a Ana: ${BASE}/leads/lead-002`,
        "",
        `Veja a agenda: ${BASE}/agenda.`,
      ].join("\n")
    );
  });

  it("links que não são do CRM viram só texto", () => {
    const out = toWhatsappText(
      "Clique [aqui](https://phishing.example/login), [aqui](//evil.example) ou [js](javascript:alert(1)).",
      BASE
    );
    expect(out).not.toMatch(/phishing|evil|javascript/);
    expect(out).toContain("Clique aqui, aqui ou js");
  });

  it("tabelas viram linhas simples", () => {
    const out = toWhatsappText("| Nome | Prazo |\n|---|---|\n| Ana | 20/11 |", BASE);
    expect(out).toBe("Nome · Prazo\nAna · 20/11");
  });

  it("divide em até 3 mensagens de 4096 caracteres", () => {
    const para = "x".repeat(1500);
    const long = Array.from({ length: 6 }, () => para).join("\n\n"); // ~9000
    const parts = splitWhatsappMessage(long);
    expect(parts.length).toBe(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4096);

    const huge = Array.from({ length: 12 }, () => para).join("\n\n"); // ~18000
    const cut = splitWhatsappMessage(huge);
    expect(cut.length).toBe(3);
    expect(cut[2]).toContain("Resposta cortada");
    for (const p of cut) expect(p.length).toBeLessThanOrEqual(4096);

    expect(splitWhatsappMessage("curto")).toEqual(["curto"]);
    // Palavra gigante sem espaços também é cortada.
    expect(splitWhatsappMessage("y".repeat(5000)).every((p) => p.length <= 4096)).toBe(true);
  });

  it("o resumo do rascunho nunca é cortado", () => {
    const footer = buildDraftFooter(
      [
        {
          id: "d1",
          kind: "tarefa",
          data: { title: "Ligar para a Ana", due_date: "2026-11-17T09:00", priority: "alta", assigned_to: "u2", assigned_to_label: "Marina Alves" },
          uncertain: ["assigned_to", "description"],
          duplicates: [],
          attachment: null,
          status: "pendente",
          resultLink: null,
        },
      ],
      BASE
    );
    expect(footer).toContain("*Nova tarefa*");
    expect(footer).toContain("• Vence em: 17/11/2026 09:00");
    expect(footer).toContain("• Responsável: Marina Alves _(conferir)_");
    expect(footer).toContain("• Descrição: (vazio) _(conferir)_");
    expect(footer).toContain("• Prioridade: Alta");
    expect(footer).toContain("Responda *OK* para gravar ou *CANCELAR* para descartar.");
    const parts = composeWhatsappReply("z".repeat(20_000), footer);
    expect(parts.length).toBeLessThanOrEqual(3);
    expect(parts[parts.length - 1]).toContain("Responda *OK*");
  });
});

// ---------------------------------------------------------------------------
// Identidade sem cookie
// ---------------------------------------------------------------------------

describe("identidade emprestada (runAsTeamMember)", () => {
  it("getCurrentUser devolve a pessoa do WhatsApp, nunca o Admin de demonstração", async () => {
    const atendente = member("atendente");
    // Fora do contexto, em modo demonstração: o Admin fictício.
    expect((await getCurrentUser()).id).toBe("demo-admin");
    const inside = await runAsTeamMember({ client: null, user: atendente, channel: "whatsapp" }, async () => ({
      user: await getCurrentUser(),
      session: await getAssistantSession(),
    }));
    expect(inside.user.id).toBe(atendente.id);
    expect(inside.user.role).toBe("atendente");
    expect(inside.session).toEqual({ user: atendente, isAdmin: false });
    // E não vaza para fora.
    expect((await getCurrentUser()).id).toBe("demo-admin");
  });

  it("pessoa desativada não tem sessão do assistente", async () => {
    const off = member("advogado", { active: false });
    const session = await runAsTeamMember({ client: null, user: off, channel: "whatsapp" }, () =>
      getAssistantSession()
    );
    expect(session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Conversa completa (modo demonstração, IA falsa)
// ---------------------------------------------------------------------------

function msg(id: string): Anthropic.Message {
  return { id, type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as unknown as Anthropic.Message;
}
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.TextBlock;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;

function scriptedClient(script: { content: Anthropic.ContentBlock[]; stop: Anthropic.StopReason }[]) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const client: MessagesClientLike = {
    messages: {
      stream(params) {
        calls.push(structuredClone(params));
        const step = script[calls.length - 1];
        const reply = { ...msg(`m${calls.length}`), content: step.content, stop_reason: step.stop };
        const listeners: ((d: string) => void)[] = [];
        return {
          on(_e: "text", l: (d: string) => void) {
            listeners.push(l);
            return this;
          },
          async finalMessage() {
            for (const b of reply.content) if (b.type === "text") listeners.forEach((l) => l(b.text));
            return reply as Anthropic.Message;
          },
        };
      },
    },
  };
  return { client, calls };
}

describe("assistente pelo WhatsApp (ponta a ponta, demonstração)", () => {
  let seq = 0;
  const inbound = (from: string, body: string): InboundMessage => ({
    channel: "whatsapp",
    contactId: from,
    text: body,
    messageId: `wamid.test.${Date.now()}.${seq++}`,
  });

  it("prepara, corrige e grava com OK; sem financeiro no pedido à IA", async () => {
    const adv = member("admin", { id: "wa-e2e-admin" });
    const from = "5511911112222";
    const sent: string[] = [];
    const send = async (_to: string, body: string) => void sent.push(body);

    // 1) Pedido de cadastro: a IA prepara a tarefa.
    const first = scriptedClient([
      {
        content: [toolUse("t1", "preparar_tarefa", { title: "Ligar para a Ana", due_date: "2026-11-17T09:00", incertos: ["due_date"] })],
        stop: "tool_use",
      },
      { content: [text("Preparei a **tarefa** para [ligar para a Ana](/tarefas).")], stop: "end_turn" },
    ]);
    const r1 = await handleTeamWhatsapp(adv, inbound(from, "Cadastra tarefa: ligar para a Ana amanhã 9h"), {
      client: first.client,
      send,
      db: null,
    });
    expect(r1.outcome).toBe("answer");
    const toolNames = (first.calls[0].tools ?? []).map((t) => ("name" in t ? t.name : ""));
    expect(toolNames).toContain("preparar_tarefa");
    expect(toolNames.some((n) => /financ|pagament|contrat/.test(n))).toBe(false);
    const system = JSON.stringify(first.calls[0].system);
    expect(system).toContain("Acesso a dados financeiros: não");
    expect(system).toContain("WhatsApp");
    const reply1 = r1.replies.join("\n");
    expect(reply1).toContain("Preparei a *tarefa* para ligar para a Ana: https://");
    expect(reply1).toContain("*Nova tarefa*");
    expect(reply1).toContain("17/11/2026 09:00 _(conferir)_");
    expect(reply1).toContain("Responda *OK*");

    // 2) "ok, mas muda a hora" NÃO confirma: vai à IA, que prepara outro rascunho.
    const second = scriptedClient([
      {
        content: [toolUse("t2", "preparar_tarefa", { title: "Ligar para a Ana", due_date: "2026-11-17T15:00" })],
        stop: "tool_use",
      },
      { content: [text("Corrigi o horário.")], stop: "end_turn" },
    ]);
    const r2 = await handleTeamWhatsapp(adv, inbound(from, "ok, mas muda a hora para 15h"), {
      client: second.client,
      send,
      db: null,
    });
    expect(r2.outcome).toBe("answer");
    expect(second.calls.length).toBe(2);
    const reply2 = r2.replies.join("\n");
    expect(reply2).toContain("17/11/2026 15:00");
    expect(reply2).toContain("O rascunho anterior, não confirmado, foi descartado.");
    // O histórico enviado à IA traz o rascunho anterior.
    expect(JSON.stringify(second.calls[0].messages)).toContain("Ligar para a Ana");

    // 3) "OK" grava só o rascunho novo (demonstração: confere sem gravar).
    const none = scriptedClient([]);
    const r3 = await handleTeamWhatsapp(adv, inbound(from, "OK"), { client: none.client, send, db: null });
    expect(r3.outcome).toBe("confirmed");
    expect(none.calls).toHaveLength(0);
    expect(r3.replies).toHaveLength(1);
    expect(r3.replies[0]).toContain("Pronto, gravei no CRM:");
    expect(r3.replies[0]).toContain("https://");
    expect(r3.replies[0].match(/•/g)).toHaveLength(1);

    // 4) Mensagem repetida pela Meta é ignorada.
    const dup = inbound(from, "Quais prazos?");
    const echo = scriptedClient([{ content: [text("Nenhum prazo hoje.")], stop: "end_turn" }]);
    expect((await handleTeamWhatsapp(adv, dup, { client: echo.client, send, db: null })).outcome).toBe("answer");
    expect((await handleTeamWhatsapp(adv, dup, { client: echo.client, send, db: null })).outcome).toBe("duplicate");
  });

  it("CANCELAR descarta os rascunhos pendentes", async () => {
    const adv = member("advogado", { id: "wa-e2e-cancel" });
    const from = "5511933334444";
    const prep = scriptedClient([
      { content: [toolUse("t1", "preparar_compromisso", { title: "Reunião", date: "2026-11-20", start_time: "14:00" })], stop: "tool_use" },
      { content: [text("Preparei a reunião.")], stop: "end_turn" },
    ]);
    await handleTeamWhatsapp(adv, inbound(from, "marca reunião dia 20 às 14h"), { client: prep.client, send: async () => {}, db: null });
    const r = await handleTeamWhatsapp(adv, inbound(from, "Cancelar"), { client: scriptedClient([]).client, send: async () => {}, db: null });
    expect(r.outcome).toBe("cancelled");
    expect(r.replies[0]).toContain("descartei o rascunho");
    // Depois disso "ok" não tem o que confirmar: vai para a IA.
    const after = scriptedClient([{ content: [text("Certo!")], stop: "end_turn" }]);
    const r2 = await handleTeamWhatsapp(adv, inbound(from, "ok"), { client: after.client, send: async () => {}, db: null });
    expect(r2.outcome).toBe("answer");
    expect(after.calls).toHaveLength(1);
  });

  it("Visualizador consulta, mas não recebe ferramentas de rascunho", async () => {
    const viewer = member("visualizador", { id: "wa-e2e-viewer" });
    const c = scriptedClient([{ content: [text("Só consulto.")], stop: "end_turn" }]);
    await handleTeamWhatsapp(viewer, inbound("5511955556666", "cadastra um lead"), { client: c.client, send: async () => {}, db: null });
    const names = (c.calls[0].tools ?? []).map((t) => ("name" in t ? t.name : ""));
    expect(names.some((n) => n.startsWith("preparar_"))).toBe(false);
    expect(JSON.stringify(c.calls[0].system)).toContain("Pode preparar cadastros: não");
  });
});
