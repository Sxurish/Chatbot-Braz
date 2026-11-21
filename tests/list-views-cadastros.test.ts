import { describe, expect, it } from "vitest";
import {
  NO_OWNER,
  filterLeads,
  leadFiltersActive,
  leadSourceOptions,
  parseLeadOptions,
  sortLeads,
} from "@/lib/list-views/leads";
import {
  clientFiltersActive,
  clientPlaceOptions,
  filterClients,
  parseClientOptions,
  sortClients,
} from "@/lib/list-views/clientes";
import { caseFiltersActive, filterCases, parseCaseOptions, sortCases } from "@/lib/list-views/casos";
import { ownerOptions } from "@/lib/list-views/owners";
import type { Case, Client, Lead } from "@/lib/types";

function lead(id: string, over: Partial<Lead> = {}): Lead {
  return {
    id,
    full_name: `Lead ${id}`,
    phone: null,
    email: null,
    city: null,
    state: null,
    legal_area: "civil",
    subarea: null,
    case_type: null,
    case_summary: null,
    urgency: "media",
    urgency_reason: null,
    commercial_status: "novo_lead",
    legal_status: "triagem_inicial",
    financial_status: "sem_cobranca",
    source: "chatbot",
    assigned_to: null,
    consent_given: true,
    consent_at: null,
    privacy_policy_version: null,
    process_number: null,
    has_existing_process: false,
    is_existing_client: false,
    preferred_contact_time: null,
    next_action: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  } as Lead;
}

function client(id: string, over: Partial<Client> = {}): Client {
  return {
    id,
    lead_id: null,
    full_name: `Cliente ${id}`,
    phone: null,
    email: null,
    cpf_cnpj: null,
    city: null,
    state: null,
    status: "ativo",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

function kase(id: string, over: Partial<Case> = {}): Case {
  return {
    id,
    lead_id: null,
    client_id: null,
    title: `Caso ${id}`,
    legal_area: "civil",
    subarea: null,
    summary: null,
    status: "triagem_inicial",
    assigned_to: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("Leads", () => {
  const leads = [
    lead("a", {
      full_name: "João Conceição",
      phone: "(11) 98765-4321",
      city: "São Paulo",
      state: "SP",
      urgency: "baixa",
      commercial_status: "proposta_enviada",
      source: "indicacao",
      assigned_to: "u1",
      created_at: "2026-11-03T10:00:00Z",
      updated_at: "2026-11-03T10:00:00Z",
    }),
    lead("b", {
      full_name: "Ana Souza",
      email: "ana@exemplo.com",
      legal_area: "penal",
      urgency: "alta",
      process_number: "0000468-20.2020.8.26.0177",
      created_at: "2026-11-02T10:00:00Z",
      updated_at: "2026-11-05T10:00:00Z",
    }),
    lead("c", {
      full_name: "Bruno Lima",
      urgency: "alta",
      commercial_status: "em_qualificacao",
      created_at: "2026-11-01T10:00:00Z",
    }),
  ];

  it("lê a URL e ignora valores inválidos", () => {
    const o = parseLeadOptions({ q: " joao ", area: "penal", urgencia: "xx", etapa: "negociacao", ordem: "nada" });
    expect(o).toMatchObject({ q: "joao", area: "penal", urgencia: null, etapa: "negociacao", ordem: "recentes" });
    expect(leadFiltersActive(parseLeadOptions({}))).toBe(false);
    expect(leadFiltersActive(parseLeadOptions({ ordem: "nome" }))).toBe(true);
  });

  it("ignora responsável e origem desconhecidos quando a lista é informada", () => {
    const known = { owners: ["u1"], sources: ["chatbot"] };
    expect(parseLeadOptions({ resp: "u9", origem: "tv" }, known)).toMatchObject({ resp: null, origem: null });
    expect(parseLeadOptions({ resp: "u1", origem: "chatbot" }, known)).toMatchObject({ resp: "u1", origem: "chatbot" });
    expect(parseLeadOptions({ resp: NO_OWNER }, known).resp).toBe(NO_OWNER);
  });

  it("busca sem acento, por telefone e por número do processo", () => {
    expect(ids(filterLeads(leads, parseLeadOptions({ q: "joao conceicao" })))).toEqual(["a"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ q: "sao paulo" })))).toEqual(["a"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ q: "98765" })))).toEqual(["a"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ q: "00004682020" })))).toEqual(["b"]);
  });

  it("filtra por área, urgência, etapa, origem e responsável", () => {
    expect(ids(filterLeads(leads, parseLeadOptions({ area: "penal" })))).toEqual(["b"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ urgencia: "alta" })))).toEqual(["b", "c"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ etapa: "em_qualificacao" })))).toEqual(["c"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ origem: "indicacao" })))).toEqual(["a"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ resp: "u1" })))).toEqual(["a"]);
    expect(ids(filterLeads(leads, parseLeadOptions({ resp: NO_OWNER })))).toEqual(["b", "c"]);
  });

  it("ordena; a padrão mantém a ordem do banco", () => {
    expect(ids(sortLeads(leads, "recentes"))).toEqual(["a", "b", "c"]);
    expect(ids(sortLeads(leads, "antigos"))).toEqual(["c", "b", "a"]);
    expect(ids(sortLeads(leads, "nome"))).toEqual(["b", "c", "a"]);
    expect(ids(sortLeads(leads, "urgencia"))).toEqual(["b", "c", "a"]);
    expect(ids(sortLeads(leads, "etapa"))).toEqual(["b", "c", "a"]);
    expect(ids(sortLeads(leads, "atualizados"))).toEqual(["b", "a", "c"]);
    expect(ids(leads)).toEqual(["a", "b", "c"]);
  });

  it("lista as origens presentes com rótulo", () => {
    expect(leadSourceOptions(leads)).toEqual([
      { value: "chatbot", label: "Chatbot (site)" },
      { value: "indicacao", label: "Indicação" },
    ]);
  });
});

describe("Clientes", () => {
  const clients = [
    client("a", {
      full_name: "Márcia Antônia",
      cpf_cnpj: "123.456.789-00",
      city: "Embu-Guaçu",
      state: "SP",
      created_at: "2026-11-03T10:00:00Z",
    }),
    client("b", { full_name: "Carlos Dias", city: "Curitiba", state: "pr", status: "inativo", created_at: "2026-11-02T10:00:00Z" }),
    client("c", { full_name: "Beatriz Melo", phone: "11 91234-5678", created_at: "2026-11-01T10:00:00Z" }),
  ];
  const places = clientPlaceOptions(clients);

  it("lê a URL e ignora valores inválidos", () => {
    expect(places).toEqual({ ufs: ["PR", "SP"], cidades: ["Curitiba", "Embu-Guaçu"] });
    expect(parseClientOptions({ uf: "sp", status: "ativo", cidade: "embu-guacu" }, places)).toMatchObject({
      uf: "SP",
      status: "ativo",
      cidade: "embu-guacu",
    });
    expect(parseClientOptions({ uf: "RJ", status: "x", cidade: "Recife", ordem: "z" }, places)).toMatchObject({
      uf: null,
      status: null,
      cidade: null,
      ordem: "recentes",
    });
    expect(clientFiltersActive(parseClientOptions({}))).toBe(false);
  });

  it("busca sem acento, por CPF e telefone", () => {
    expect(ids(filterClients(clients, parseClientOptions({ q: "marcia antonia" })))).toEqual(["a"]);
    expect(ids(filterClients(clients, parseClientOptions({ q: "12345678900" })))).toEqual(["a"]);
    expect(ids(filterClients(clients, parseClientOptions({ q: "91234-5678" })))).toEqual(["c"]);
  });

  it("filtra por situação, UF e cidade", () => {
    expect(ids(filterClients(clients, parseClientOptions({ status: "inativo" })))).toEqual(["b"]);
    expect(ids(filterClients(clients, parseClientOptions({ uf: "PR" })))).toEqual(["b"]);
    expect(ids(filterClients(clients, parseClientOptions({ cidade: "Embu-Guacu" })))).toEqual(["a"]);
  });

  it("ordena; a padrão mantém a ordem do banco", () => {
    expect(ids(sortClients(clients, "recentes"))).toEqual(["a", "b", "c"]);
    expect(ids(sortClients(clients, "antigos"))).toEqual(["c", "b", "a"]);
    expect(ids(sortClients(clients, "nome"))).toEqual(["c", "b", "a"]);
    expect(ids(sortClients(clients, "cidade"))).toEqual(["b", "a", "c"]);
  });
});

describe("Casos", () => {
  const cases = [
    kase("a", {
      title: "Ação de usucapião",
      legal_area: "imobiliario",
      status: "em_andamento",
      client_id: "cl1",
      assigned_to: "u1",
      created_at: "2026-11-03T10:00:00Z",
      updated_at: "2026-11-03T10:00:00Z",
    }),
    kase("b", {
      title: "Defesa criminal",
      legal_area: "penal",
      status: "triagem_inicial",
      lead_id: "ld1",
      summary: "Audiência de custódia marcada.",
      created_at: "2026-11-02T10:00:00Z",
      updated_at: "2026-11-06T10:00:00Z",
    }),
    kase("c", { title: "Busca e apreensão", status: "encerrado", created_at: "2026-11-01T10:00:00Z" }),
  ];
  const people = { cl1: "José Araújo", ld1: "Fábio Nunes" };

  it("lê a URL e ignora valores inválidos", () => {
    expect(parseCaseOptions({ area: "penal", status: "x", ordem: "titulo" })).toMatchObject({
      area: "penal",
      status: null,
      ordem: "titulo",
    });
    expect(parseCaseOptions({ resp: "u9" }, ["u1"]).resp).toBeNull();
    expect(caseFiltersActive(parseCaseOptions({ ordem: "outra" }))).toBe(false);
  });

  it("busca sem acento por título, resumo e nome do cliente ou lead", () => {
    expect(ids(filterCases(cases, parseCaseOptions({ q: "usucapiao" }), people))).toEqual(["a"]);
    expect(ids(filterCases(cases, parseCaseOptions({ q: "custodia" }), people))).toEqual(["b"]);
    expect(ids(filterCases(cases, parseCaseOptions({ q: "jose araujo" }), people))).toEqual(["a"]);
    expect(ids(filterCases(cases, parseCaseOptions({ q: "fabio" }), people))).toEqual(["b"]);
  });

  it("filtra por área, andamento e responsável", () => {
    expect(ids(filterCases(cases, parseCaseOptions({ area: "penal" })))).toEqual(["b"]);
    expect(ids(filterCases(cases, parseCaseOptions({ status: "encerrado" })))).toEqual(["c"]);
    expect(ids(filterCases(cases, parseCaseOptions({ resp: "u1" })))).toEqual(["a"]);
    expect(ids(filterCases(cases, parseCaseOptions({ resp: "sem" })))).toEqual(["b", "c"]);
  });

  it("ordena; a padrão mantém a ordem do banco", () => {
    expect(ids(sortCases(cases, "recentes"))).toEqual(["a", "b", "c"]);
    expect(ids(sortCases(cases, "antigos"))).toEqual(["c", "b", "a"]);
    expect(ids(sortCases(cases, "titulo"))).toEqual(["a", "c", "b"]);
    expect(ids(sortCases(cases, "status"))).toEqual(["b", "a", "c"]);
    expect(ids(sortCases(cases, "atualizados"))).toEqual(["b", "a", "c"]);
  });
});

describe("Opções de responsável", () => {
  it("mostra só quem aparece, em ordem, e Sem responsável no fim", () => {
    expect(ownerOptions(["u2", null, "u1", "u2"], { u1: "Zélia", u2: "Ana" })).toEqual([
      { value: "u2", label: "Ana" },
      { value: "u1", label: "Zélia" },
      { value: "sem", label: "Sem responsável" },
    ]);
  });
});
