import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClientLike } from "@/lib/assistant/agent";
import { handleTeamWhatsapp } from "@/lib/assistant/whatsapp";
import type { InboundMessage } from "@/lib/channels/types";
import { computeDailyDigest, digestSummaryLine, digestToWhatsappText } from "@/lib/digest/build";
import { notifyNewPublications, pickRecipient } from "@/lib/intimacoes/notify";
import { INTIMACAO_TEMPLATE_BODY, intimacaoTemplateConfig } from "@/lib/intimacoes/notify-format";
import {
  parseIntimacaoReply,
  whatsappConfirmInput,
  type IntimacaoWhatsappStore,
} from "@/lib/intimacoes/whatsapp-ok";
import type {
  ConfirmPublicationInput,
  CourtPublication,
  PublicationAiReading,
} from "@/lib/intimacoes/types";
import type { TeamUser, UserRole } from "@/lib/types";
import { fakeDb } from "./helpers/intimacoes-fake-db";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://chatbot-braz.vercel.app";

function member(role: UserRole, id: string): TeamUser {
  return {
    id,
    name: "Dr. Jean Braz",
    email: `${id}@teste.dev`,
    role,
    active: true,
    last_login: null,
    created_at: "2026-01-01T00:00:00Z",
    whatsapp_number: "5511988887777",
  };
}

const READING: PublicationAiReading = {
  actType: "Intimação para réplica",
  summary: "Manifestar-se sobre a contestação.",
  requiresAction: true,
  suggestedDays: 15,
  suggestedUnit: "uteis",
  startKind: "disponibilizacao",
  dobro: false,
  taskTitle: "Réplica à contestação",
  legalBasis: "CPC, art. 351",
  quote: "Manifeste-se no prazo de 15 dias.",
  uncertain: [],
  confidence: "alta",
};

function publication(id: string, to: string, extra: Partial<CourtPublication> = {}): CourtPublication {
  return {
    id,
    source: "djen",
    external_key: `k-${id}`,
    external_id: null,
    hash: null,
    available_date: "2026-11-16",
    publication_date: "2026-11-17",
    tribunal: "TJSP",
    organ: "1ª Vara Cível",
    kind: "Intimação",
    document_type: null,
    class_name: null,
    process_number: "10023456720268260554",
    process_number_masked: `1002345-67.2026.8.26.05${id.slice(-2).padStart(2, "0")}`,
    process_id: null,
    text: "Manifeste-se no prazo de 15 dias.",
    parties: [],
    lawyers: [{ name: "JEAN BRAZ", oab: "459159", uf: "SP" }],
    link: null,
    cancelled: false,
    cancel_reason: null,
    status: "para_conferir",
    ai_status: "pronta",
    ai_reading: READING,
    ai_read_at: "2026-11-17T12:00:00Z",
    ai_error: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    calculation_id: null,
    task_id: null,
    movement_id: null,
    whatsapp_notified_at: "2026-11-17T12:05:00Z",
    whatsapp_notified_to: to,
    captured_at: "2026-11-17T11:00:00Z",
    created_at: "2026-11-17T11:00:00Z",
    updated_at: "2026-11-17T11:00:00Z",
    ...extra,
  };
}

/** Intimações falsas: confirmar marca como confirmada e devolve uma data. */
function fakeStore(pubs: CourtPublication[]) {
  const confirmed: ConfirmPublicationInput[] = [];
  const store: IntimacaoWhatsappStore = {
    async listNotified(userId) {
      return pubs
        .filter((p) => p.whatsapp_notified_to === userId && p.status === "para_conferir" && !p.cancelled)
        .sort((a, b) => (a.whatsapp_notified_at ?? "").localeCompare(b.whatsapp_notified_at ?? "") || a.id.localeCompare(b.id));
    },
    async confirm(input) {
      confirmed.push(input);
      const p = pubs.find((x) => x.id === input.publicationId)!;
      p.status = "confirmada";
      return { ok: true, finalDate: "2026-12-09", taskId: "t1", calculationId: "c1", movementId: null, processId: null };
    },
  };
  return { store, confirmed };
}

function scriptedClient(script: { content: Anthropic.ContentBlock[]; stop: Anthropic.StopReason }[]) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const client: MessagesClientLike = {
    messages: {
      stream(params) {
        calls.push(structuredClone(params));
        const step = script[calls.length - 1];
        const reply = {
          id: `m${calls.length}`,
          type: "message",
          role: "assistant",
          model: "falso",
          content: step.content,
          stop_reason: step.stop,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        };
        const listeners: ((d: string) => void)[] = [];
        return {
          on(_e: "text", l: (d: string) => void) {
            listeners.push(l);
            return this;
          },
          async finalMessage() {
            for (const b of reply.content) if (b.type === "text") listeners.forEach((l) => l(b.text));
            return reply as unknown as Anthropic.Message;
          },
        };
      },
    },
  };
  return { client, calls };
}
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.TextBlock;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;

let seq = 0;
const inbound = (from: string, body: string): InboundMessage => ({
  channel: "whatsapp",
  contactId: from,
  text: body,
  messageId: `wamid.intim.${Date.now()}.${seq++}`,
});
const NOW = () => new Date("2026-11-17T13:00:00Z");

// ---------------------------------------------------------------------------

describe("leitura da resposta de intimação", () => {
  it.each([
    ["OK", { kind: "next" }],
    ["ok!", { kind: "next" }],
    ["sim", { kind: "next" }],
    ["OK 2", { kind: "index", n: 2 }],
    ["ok2", { kind: "index", n: 2 }],
    ["Ok #3", { kind: "index", n: 3 }],
    ["confirmo 1", { kind: "index", n: 1 }],
    ["OK todas", { kind: "all" }],
    ["pode confirmar todas", { kind: "all" }],
  ])("%s", (t, expected) => expect(parseIntimacaoReply(t)).toEqual(expected));

  it.each(["ok, mas muda a data", "prazos de hoje?", "OK 0", "2", "cancelar"])("%s não é OK de intimação", (t) =>
    expect(parseIntimacaoReply(t)).toBeNull()
  );

  it("só confirma a sugestão que a pessoa viu no aviso", () => {
    const p = publication("p1", "u");
    expect(whatsappConfirmInput(p, "u")).toMatchObject({ days: 15, unit: "uteis", channel: "whatsapp", userId: "u" });
    // Leitura refeita depois do aviso: não confirma.
    expect(whatsappConfirmInput({ ...p, ai_read_at: "2026-11-17T12:10:00Z" }, "u")).toBeNull();
    // Sem leitura pronta: não confirma.
    expect(whatsappConfirmInput({ ...p, ai_status: "desligada", ai_reading: null }, "u")).toBeNull();
  });
});

describe("OK no WhatsApp", () => {
  it("com rascunho do assistente pendente, o OK continua gravando o rascunho", async () => {
    const jean = member("admin", "wa-int-draft");
    const from = "5511900000001";
    const { store, confirmed } = fakeStore([publication("p01", jean.id)]);
    const prep = scriptedClient([
      { content: [toolUse("t1", "preparar_tarefa", { title: "Ligar para a Ana", due_date: "2026-11-18T09:00" })], stop: "tool_use" },
      { content: [text("Preparei a tarefa.")], stop: "end_turn" },
    ]);
    // Relógio real: o rascunho vale por 2 horas a partir de agora.
    await handleTeamWhatsapp(jean, inbound(from, "cadastra tarefa ligar para a Ana amanhã 9h"), {
      client: prep.client,
      send: async () => {},
      db: null,
      intimacoes: store,
    });
    const r = await handleTeamWhatsapp(jean, inbound(from, "OK"), {
      client: scriptedClient([]).client,
      send: async () => {},
      db: null,
      intimacoes: store,
    });
    expect(r.outcome).toBe("confirmed");
    expect(r.replies[0]).toContain("Pronto, gravei no CRM:");
    expect(confirmed).toHaveLength(0);
  });

  it("sem rascunho, o OK confirma a intimação avisada e responde a data final e o link", async () => {
    const jean = member("admin", "wa-int-ok");
    const { store, confirmed } = fakeStore([publication("p02", jean.id), publication("p99", "outra-pessoa")]);
    const ai = scriptedClient([]);
    const r = await handleTeamWhatsapp(jean, inbound("5511900000002", "OK"), {
      client: ai.client,
      send: async () => {},
      db: null,
      intimacoes: store,
      now: NOW,
    });
    expect(r.outcome).toBe("intimacao_confirmed");
    expect(ai.calls).toHaveLength(0);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ publicationId: "p02", userId: jean.id, channel: "whatsapp", days: 15 });
    expect(r.replies[0]).toContain("Pronto, intimação confirmada");
    expect(r.replies[0]).toContain("quarta-feira, 09/12/2026");
    expect(r.replies[0]).toContain(`${BASE}/intimacoes/p02`);
  });

  it("sem sugestão segura, o OK não confirma e manda o link do painel", async () => {
    const jean = member("advogado", "wa-int-link");
    const { store, confirmed } = fakeStore([
      publication("p03", jean.id, { ai_reading: { ...READING, confidence: "baixa" } }),
    ]);
    const r = await handleTeamWhatsapp(jean, inbound("5511900000003", "ok"), {
      client: scriptedClient([]).client,
      send: async () => {},
      db: null,
      intimacoes: store,
      now: NOW,
    });
    expect(r.outcome).toBe("intimacao_link");
    expect(confirmed).toHaveLength(0);
    expect(r.replies[0]).toContain("não confirmei");
    expect(r.replies[0]).toContain(`${BASE}/intimacoes/p03`);
  });

  it("Visualizador não confirma", async () => {
    const viewer = member("visualizador", "wa-int-viewer");
    const { store, confirmed } = fakeStore([publication("p04", viewer.id)]);
    const r = await handleTeamWhatsapp(viewer, inbound("5511900000004", "OK"), {
      client: scriptedClient([]).client,
      send: async () => {},
      db: null,
      intimacoes: store,
      now: NOW,
    });
    expect(confirmed).toHaveLength(0);
    expect(r.outcome).toBe("intimacao_link");
    expect(r.replies[0]).toContain("Visualizador");
  });

  it("com várias: OK manda a lista; OK 2 confirma a 2ª; OK todas confirma o resto", async () => {
    const jean = member("admin", "wa-int-many");
    const from = "5511900000005";
    const pubs = [
      publication("p11", jean.id, { whatsapp_notified_at: "2026-11-17T12:01:00Z" }),
      publication("p12", jean.id, { whatsapp_notified_at: "2026-11-17T12:02:00Z" }),
      publication("p13", jean.id, { whatsapp_notified_at: "2026-11-17T12:03:00Z" }),
    ];
    const { store, confirmed } = fakeStore(pubs);
    const deps = { client: scriptedClient([]).client, send: async () => {}, db: null, intimacoes: store, now: NOW };

    const list = await handleTeamWhatsapp(jean, inbound(from, "OK"), deps);
    expect(list.outcome).toBe("intimacao_list");
    expect(confirmed).toHaveLength(0);
    expect(list.replies[0]).toMatch(/1\) .*\n.*p11/);
    expect(list.replies[0]).toContain("OK todas");

    const two = await handleTeamWhatsapp(jean, inbound(from, "OK 2"), deps);
    expect(two.outcome).toBe("intimacao_confirmed");
    expect(confirmed.map((c) => c.publicationId)).toEqual(["p12"]);
    // A lista que sobrou vem renumerada: 1) p11, 2) p13.
    expect(two.replies[0]).toMatch(/1\) [^\n]*\n[^\n]*p11[\s\S]*2\) [^\n]*\n[^\n]*p13/);

    const all = await handleTeamWhatsapp(jean, inbound(from, "ok todas"), deps);
    expect(all.outcome).toBe("intimacao_confirmed");
    expect(confirmed.map((c) => c.publicationId)).toEqual(["p12", "p11", "p13"]);
    expect(all.replies[0]).toContain("2 intimações confirmadas");
  });

  it("OK sozinho depois de uma conversa mais nova que o aviso segue para o assistente", async () => {
    const jean = member("admin", "wa-int-chat");
    const from = "5511900000006";
    // Aviso de 1 hora atrás (relógio real); a conversa abaixo é mais nova.
    const notifiedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const readAt = new Date(Date.now() - 65 * 60_000).toISOString();
    const { store, confirmed } = fakeStore([
      publication("p21", jean.id, { whatsapp_notified_at: notifiedAt, ai_read_at: readAt }),
    ]);
    const first = scriptedClient([{ content: [text("Hoje não há prazos.")], stop: "end_turn" }]);
    await handleTeamWhatsapp(jean, inbound(from, "prazos de hoje?"), { client: first.client, send: async () => {}, db: null, intimacoes: store });
    const after = scriptedClient([{ content: [text("Certo!")], stop: "end_turn" }]);
    const r = await handleTeamWhatsapp(jean, inbound(from, "ok"), { client: after.client, send: async () => {}, db: null, intimacoes: store });
    expect(r.outcome).toBe("answer");
    expect(confirmed).toHaveLength(0);
    // "OK 1" é explícito: confirma.
    const one = await handleTeamWhatsapp(jean, inbound(from, "OK 1"), { client: scriptedClient([]).client, send: async () => {}, db: null, intimacoes: store });
    expect(one.outcome).toBe("intimacao_confirmed");
    expect(confirmed).toHaveLength(1);
  });

  it("sem intimação avisada, nada muda: OK vai para o assistente", async () => {
    const jean = member("admin", "wa-int-none");
    const { store } = fakeStore([]);
    const ai = scriptedClient([{ content: [text("Certo!")], stop: "end_turn" }]);
    const r = await handleTeamWhatsapp(jean, inbound("5511900000007", "ok"), { client: ai.client, send: async () => {}, db: null, intimacoes: store });
    expect(r.outcome).toBe("answer");
    expect(ai.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe("aviso das intimações pelo WhatsApp", () => {
  const ENV = { WHATSAPP_INTIMACAO_TEMPLATE: "intimacao_conferir", WHATSAPP_ACCESS_TOKEN: "x", WHATSAPP_PHONE_NUMBER_ID: "1" };
  const now = new Date("2026-11-17T13:00:00Z");

  function tables() {
    return {
      court_publications: [
        { ...publication("n1", ""), whatsapp_notified_at: null, whatsapp_notified_to: null, process_id: "proc-1" },
        { ...publication("n2", ""), whatsapp_notified_at: null, whatsapp_notified_to: null, ai_status: "pendente" },
        { ...publication("n3", ""), whatsapp_notified_at: null, whatsapp_notified_to: null, cancelled: true },
        { ...publication("n4", ""), whatsapp_notified_at: null, whatsapp_notified_to: null, captured_at: "2026-11-01T00:00:00Z" },
      ] as unknown as Record<string, unknown>[],
      users: [
        { id: "u-adm2", name: "Marina Alves", role: "admin", active: true, whatsapp_number: "5511977776666", created_at: "2026-02-01" },
        { id: "u-jean", name: "Dr. Jean Braz", role: "advogado", active: true, whatsapp_number: "5511988887777", created_at: "2026-01-01" },
        { id: "u-view", name: "Ana", role: "visualizador", active: true, whatsapp_number: "5511955554444", created_at: "2026-01-01" },
      ],
      processes: [{ id: "proc-1", subject: "Cobrança", jurisdiction: "Comarca de Santo André" }],
      forensic_calendar_days: [],
    };
  }

  it("sem o nome do modelo na env não manda nada (pulada)", async () => {
    const { client } = fakeDb(tables());
    const sent: unknown[] = [];
    const r = await notifyNewPublications(client, {
      env: { WHATSAPP_ACCESS_TOKEN: "x", WHATSAPP_PHONE_NUMBER_ID: "1" },
      now,
      send: async (m) => (sent.push(m), { ok: true, messageId: "w" }),
    });
    expect(r).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(sent).toHaveLength(0);
    expect(intimacaoTemplateConfig({}).enabled).toBe(false);
  });

  it("manda uma por intimação lida, para o advogado intimado, e marca o aviso", async () => {
    const t = tables();
    const { client } = fakeDb(t);
    const sent: { to: string; params: [string, number][] }[] = [];
    const r = await notifyNewPublications(client, {
      env: ENV,
      now,
      send: async (m) => (sent.push(m), { ok: true, messageId: "w" }),
    });
    expect(r).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(sent).toHaveLength(1);
    // O nome bate com o advogado intimado (JEAN BRAZ): vai para ele, não para a outra Admin.
    expect(sent[0].to).toBe("5511988887777");
    const [proc, resumo, prazo, data, link] = sent[0].params.map((p) => p[0]);
    expect(proc).toContain("(Cobrança)");
    expect(resumo).toContain("Intimação para réplica");
    expect(prazo).toContain("15 dias úteis");
    // Disponibilizada 16/11 → publicada 17/11 → conta de 18/11: 15 dias úteis.
    expect(data).toMatch(/^\S+-feira, \d{2}\/12\/2026$/);
    expect(link).toMatch(/\/intimacoes\/n1$/);
    const row = t.court_publications.find((p) => p.id === "n1")!;
    expect(row.whatsapp_notified_to).toBe("u-jean");
    expect(row.whatsapp_notified_at).toBeTruthy();

    // Segunda execução: nada novo.
    const again = await notifyNewPublications(client, { env: ENV, now, send: async () => ({ ok: true, messageId: "w" }) });
    expect(again.sent).toBe(0);
  });

  it("falha no envio não marca (tenta de novo na próxima hora)", async () => {
    const t = tables();
    const { client } = fakeDb(t);
    const r = await notifyNewPublications(client, { env: ENV, now, send: async () => ({ ok: false, error: "Meta fora" }) });
    expect(r).toEqual({ sent: 0, skipped: 0, errors: 1 });
    expect(t.court_publications[0].whatsapp_notified_at).toBeNull();
  });

  it("sem nome do advogado na equipe, vai para o Admin mais antigo", () => {
    const admins = [
      { id: "a1", name: "Fulano", role: "admin", whatsapp_number: "5511" },
      { id: "a2", name: "Beltrano", role: "advogado", whatsapp_number: "5512" },
    ];
    expect(pickRecipient(admins, { lawyers: [{ name: "OUTRO NOME", oab: "1", uf: "SP" }] })?.id).toBe("a1");
  });

  it("o texto do modelo tem as 5 variáveis e não termina numa variável", () => {
    for (let i = 1; i <= 5; i++) expect(INTIMACAO_TEMPLATE_BODY).toContain(`{{${i}}}`);
    expect(INTIMACAO_TEMPLATE_BODY).toContain("Responda OK para confirmar, ou abra o painel: {{5}}");
    expect(INTIMACAO_TEMPLATE_BODY.trim().endsWith("}}")).toBe(false);
    expect(INTIMACAO_TEMPLATE_BODY.startsWith("{{")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("resumo diário: intimações para conferir", () => {
  const empty = { processes: [], tasks: [], appointments: [], leads: [], movements: [] };
  const now = new Date("2026-11-17T10:00:00-03:00");
  const row = (id: string, date: string, act: string | null) => ({
    id,
    available_date: date,
    process_number: null,
    process_number_masked: `000000${id}-00.2026.8.26.0001`,
    kind: "Intimação",
    cancelled: false,
    ai_reading: act ? { actType: act } : null,
  });

  it("mostra a quantidade e as 3 mais antigas", () => {
    const d = computeDailyDigest(
      {
        ...empty,
        publications: [
          row("5", "2026-11-16", "Sentença"),
          row("1", "2026-11-10", "Réplica"),
          row("3", "2026-11-12", null),
          row("2", "2026-11-11", "Embargos"),
        ],
      },
      { now, includeFinance: false }
    );
    expect(d.intimacoes?.total).toBe(4);
    expect(d.intimacoes?.items.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(digestSummaryLine(d)).toMatch(/^4 intimações para conferir/);

    const wa = digestToWhatsappText(d, "https://crm.exemplo");
    expect(wa).toContain("*Intimações para conferir*");
    expect(wa).toContain("• 0000001-00.2026.8.26.0001: Réplica (disponibilizada em 10/11)");
    expect(wa).toContain("  https://crm.exemplo/intimacoes/1");
    expect(wa).toContain("• 0000003-00.2026.8.26.0001: Intimação (disponibilizada em 12/11)");
    expect(wa).not.toContain("intimacoes/5");
    expect(wa).toContain("_e mais 1_");
    expect(wa).toContain("Conferir todas: https://crm.exemplo/intimacoes");
    // A seção vem antes dos prazos.
    expect(wa.indexOf("Intimações para conferir")).toBeLessThan(wa.indexOf("Abrir o CRM"));
  });

  it("uma só: singular; nenhuma: a seção não aparece", () => {
    const one = computeDailyDigest({ ...empty, publications: [row("1", "2026-11-10", "Réplica")] }, { now, includeFinance: false });
    expect(digestSummaryLine(one)).toMatch(/^1 intimação para conferir/);
    const none = computeDailyDigest({ ...empty, publications: [] }, { now, includeFinance: false });
    expect(none.intimacoes).toBeUndefined();
    expect(digestToWhatsappText(none, "https://crm.exemplo")).not.toContain("Intimações");
  });
});
