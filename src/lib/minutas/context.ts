import "server-only";
import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS, OFFICE_OAB } from "@/lib/constants";
import { listCases, listClients, listProcesses } from "@/lib/data/fase6";
import { listPublications } from "@/lib/data/intimacoes";
import { getLead } from "@/lib/data/leads";
import { listMovements } from "@/lib/data/movements";
import { getSettings } from "@/lib/data/settings";
import type { CourtPublication } from "@/lib/intimacoes/types";
import type { MinutaContext } from "@/lib/minutas/prompt";
import type { MinutaRefs } from "@/lib/minutas/types";
import type { Case, Client, Lead, Process, ProcessMovement } from "@/lib/types";

/**
 * Reúne do CRM (com o login de quem pediu: RLS vale) os dados para a
 * minuta: processo, caso, cliente, lead, andamentos e intimações recentes e
 * os dados do escritório. Nada financeiro entra aqui.
 */

/** Advogado titular do escritório (dono da OAB em OFFICE_OAB). */
export const OFFICE_LAWYER = "Dr. Jean Braz";

const MAX_MOVEMENTS = 15;
const MAX_PUBLICATIONS = 5;
const MAX_PUBLICATION_CHARS = 4_000;

export interface MinutaRequestRefs {
  process_id?: string;
  case_id?: string;
  lead_id?: string;
  client_id?: string;
}

export type GatherResult =
  | { ok: true; context: MinutaContext; refs: MinutaRefs; refLabel: string | null }
  | { ok: false; error: string };

const br = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : iso;
};

function processView(p: Process) {
  return {
    numero: p.process_number,
    vara: p.court,
    comarca: p.jurisdiction,
    classe: p.class,
    assunto: p.subject,
    situacao: LEGAL_STATUS_LABELS[p.status] ?? p.status,
    proximo_prazo_cadastrado: br(p.next_deadline),
  };
}

function caseView(c: Case) {
  return {
    titulo: c.title,
    area: LEGAL_AREA_LABELS[c.legal_area] ?? c.legal_area,
    subarea: c.subarea,
    resumo: c.summary,
    situacao: LEGAL_STATUS_LABELS[c.status] ?? c.status,
  };
}

function clientView(c: Client) {
  return {
    nome: c.full_name,
    cpf_cnpj: c.cpf_cnpj,
    email: c.email,
    telefone: c.phone,
    cidade: [c.city, c.state].filter(Boolean).join("/") || null,
  };
}

function leadView(l: Lead) {
  return {
    nome: l.full_name,
    email: l.email,
    telefone: l.phone,
    cidade: [l.city, l.state].filter(Boolean).join("/") || null,
    area: LEGAL_AREA_LABELS[l.legal_area] ?? l.legal_area,
    tipo_de_caso: l.case_type,
    resumo_do_caso: l.case_summary,
    numero_processo_informado: l.process_number,
  };
}

function movementView(m: ProcessMovement) {
  return {
    data: br(m.occurred_at),
    descricao: m.description,
    origem: m.source === "datajud" ? "tribunal" : m.source === "djen" ? "intimacao" : "equipe",
  };
}

function publicationView(p: CourtPublication) {
  const text = p.text ?? "";
  return {
    disponibilizada_em: br(p.available_date),
    tribunal: p.tribunal,
    orgao: p.organ,
    tipo: p.kind ?? p.document_type,
    partes: (p.parties ?? []).map((x) => ({ nome: x.name, polo: x.side })),
    advogados: (p.lawyers ?? []).map((x) => ({ nome: x.name, oab: x.oab && x.uf ? `${x.oab}/${x.uf}` : x.oab })),
    texto: text.length > MAX_PUBLICATION_CHARS ? `${text.slice(0, MAX_PUBLICATION_CHARS)} [... texto cortado]` : text,
  };
}

async function recentPublications(processIds: string[]): Promise<CourtPublication[]> {
  if (processIds.length === 0) return [];
  const all = await listPublications({ status: "todas", vinculo: "com", from: null, to: null });
  return all
    .filter((p) => p.process_id && processIds.includes(p.process_id) && !p.cancelled)
    .sort((a, b) => b.available_date.localeCompare(a.available_date))
    .slice(0, MAX_PUBLICATIONS);
}

export async function gatherMinutaContext(
  input: MinutaRequestRefs,
  now: Date
): Promise<GatherResult> {
  const [processes, cases, clients, settings] = await Promise.all([
    listProcesses(),
    listCases(),
    listClients(),
    getSettings(),
  ]);

  let process: Process | null = null;
  let kase: Case | null = null;
  let client: Client | null = null;
  let lead: Lead | null = null;

  if (input.process_id) {
    process = processes.find((p) => p.id === input.process_id) ?? null;
    if (!process) return { ok: false, error: "Processo não encontrado. Ache o id com buscar_processos." };
  }
  if (input.case_id) {
    kase = cases.find((c) => c.id === input.case_id) ?? null;
    if (!kase) return { ok: false, error: "Caso não encontrado. Ache o id com buscar_casos." };
  } else if (process?.case_id) {
    kase = cases.find((c) => c.id === process!.case_id) ?? null;
  }
  if (input.client_id) {
    client = clients.find((c) => c.id === input.client_id) ?? null;
    if (!client) return { ok: false, error: "Cliente não encontrado. Ache o id com buscar_clientes." };
  } else if (kase?.client_id) {
    client = clients.find((c) => c.id === kase!.client_id) ?? null;
  }
  if (input.lead_id) {
    lead = await getLead(input.lead_id);
    if (!lead) return { ok: false, error: "Lead não encontrado. Ache o id com buscar_leads." };
  } else if (kase?.lead_id || client?.lead_id) {
    lead = await getLead((kase?.lead_id ?? client?.lead_id)!);
  }
  if (!client && lead) client = clients.find((c) => c.lead_id === lead!.id) ?? null;
  if (!kase && client && !process) {
    const own = cases.filter((c) => c.client_id === client!.id);
    if (own.length === 1) kase = own[0];
  }

  // Processos considerados: o pedido, ou os do caso (até 3).
  const related = process
    ? [process]
    : kase
      ? processes.filter((p) => p.case_id === kase!.id).slice(0, 3)
      : [];

  const movementLists = await Promise.all(related.map((p) => listMovements(p.id)));
  const andamentos = related.flatMap((p, i) =>
    movementLists[i].slice(0, MAX_MOVEMENTS).map((m) => ({ processo: p.process_number, ...movementView(m) }))
  );
  const intimacoes = (await recentPublications(related.map((p) => p.id))).map(publicationView);

  const context: MinutaContext = {
    hoje: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(now),
    escritorio: {
      nome: settings.office_name,
      oab: settings.office.oab || OFFICE_OAB,
      advogado_responsavel: OFFICE_LAWYER,
      endereco: settings.office.address || null,
      telefone: settings.office.phone || null,
      email: settings.office.email || null,
    },
    processo: process ? processView(process) : null,
    caso: kase ? caseView(kase) : null,
    cliente: client ? clientView(client) : null,
    lead: lead && !client ? leadView(lead) : null,
    ...(!process && related.length ? { outros_processos: related.map(processView) } : {}),
    andamentos,
    intimacoes,
  };

  const refs: MinutaRefs = {
    process_id: process?.id ?? null,
    case_id: kase?.id ?? null,
    lead_id: lead?.id ?? null,
    client_id: client?.id ?? null,
  };
  const refLabel =
    process?.process_number ?? kase?.title ?? client?.full_name ?? lead?.full_name ?? null;
  return { ok: true, context, refs, refLabel };
}
