import { describe, expect, it } from "vitest";
import {
  buildProcessRows,
  filterProcessRows,
  hasNearDeadline,
  hasProcessFilters,
  parseProcessOptions,
  processFilterOptions,
  sortProcessRows,
} from "@/lib/list-views/processos";
import {
  buildContractRows,
  contractFilterOptions,
  filterContractRows,
  hasContractFilters,
  parseContractOptions,
  sortContractRows,
} from "@/lib/list-views/contratos";
import {
  buildPaymentRows,
  filterPaymentRows,
  hasPaymentFilters,
  isOverdue,
  parsePaymentOptions,
  sortPaymentRows,
} from "@/lib/list-views/pagamentos";
import { dayParam, spDay } from "@/lib/list-views/dates";
import type { Case, Contract, Payment, Process } from "@/lib/types";

const TODAY = "2026-11-21";

function proc(over: Partial<Process> & { id: string }): Process {
  return {
    case_id: null,
    process_number: null,
    court: null,
    jurisdiction: null,
    class: null,
    subject: null,
    status: "em_andamento",
    next_deadline: null,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

type CaseLite = Pick<Case, "id" | "title" | "client_id" | "legal_area" | "assigned_to">;

const cases: CaseLite[] = [
  { id: "k1", title: "Revisão de contrato bancário", client_id: "c1", legal_area: "bancario", assigned_to: "u1" },
  { id: "k2", title: "Ação de alimentos", client_id: "c2", legal_area: "familia", assigned_to: "u2" },
];
const clientNames = new Map([
  ["c1", "João Conceição"],
  ["c2", "Ana Beatriz"],
]);
const teamNames = new Map([
  ["u1", "Dr. Jean"],
  ["u2", "Marina"],
]);

const processes: Process[] = [
  proc({
    id: "p1",
    case_id: "k1",
    process_number: "1001234-56.2024.8.26.0100",
    court: "TJSP",
    jurisdiction: "5ª Vara Cível de São Paulo",
    next_deadline: "2026-11-25T15:00:00Z",
    created_at: "2026-03-01T12:00:00Z",
  }),
  proc({
    id: "p2",
    case_id: "k2",
    process_number: "0005555-11.2023.8.26.0001",
    court: "TJSP",
    jurisdiction: "Vara de Família",
    status: "recurso",
    next_deadline: "2026-12-30T15:00:00Z",
    created_at: "2026-05-01T12:00:00Z",
  }),
  proc({
    id: "p3",
    process_number: null,
    court: "TRF3",
    next_deadline: null,
    created_at: "2026-09-01T12:00:00Z",
  }),
];

const rows = buildProcessRows(processes, cases, clientNames, teamNames);
const ids = (list: { process: Process }[]) => list.map((r) => r.process.id);

describe("processos: parâmetros", () => {
  it("lê os filtros e ignora valores inválidos", () => {
    const o = parseProcessOptions({ q: "  joao ", status: "xpto", area: "familia", ordem: "qualquer", prazo: "1" });
    expect(o).toMatchObject({ q: "joao", status: null, area: "familia", ordem: "prazo", prazo: true });
    expect(hasProcessFilters(parseProcessOptions({}))).toBe(false);
    expect(hasProcessFilters(parseProcessOptions({ ordem: "numero" }))).toBe(true);
  });
});

describe("processos: filtros", () => {
  const none = parseProcessOptions({});
  it("busca o número CNJ com e sem pontuação", () => {
    expect(ids(filterProcessRows(rows, { ...none, q: "1001234-56.2024.8.26.0100" }, TODAY))).toEqual(["p1"]);
    expect(ids(filterProcessRows(rows, { ...none, q: "10012345620248260100" }, TODAY))).toEqual(["p1"]);
    expect(ids(filterProcessRows(rows, { ...none, q: "0005555" }, TODAY))).toEqual(["p2"]);
  });
  it("busca cliente, caso e vara sem acento", () => {
    expect(ids(filterProcessRows(rows, { ...none, q: "joao conceicao" }, TODAY))).toEqual(["p1"]);
    expect(ids(filterProcessRows(rows, { ...none, q: "familia" }, TODAY))).toEqual(["p2"]);
    expect(ids(filterProcessRows(rows, { ...none, q: "vara civel sao paulo" }, TODAY))).toEqual(["p1"]);
  });
  it("filtra por tribunal, situação, área, responsável e prazo próximo", () => {
    expect(ids(filterProcessRows(rows, { ...none, tribunal: "TRF3" }, TODAY))).toEqual(["p3"]);
    expect(ids(filterProcessRows(rows, { ...none, status: "recurso" }, TODAY))).toEqual(["p2"]);
    expect(ids(filterProcessRows(rows, { ...none, area: "bancario" }, TODAY))).toEqual(["p1"]);
    expect(ids(filterProcessRows(rows, { ...none, responsavel: "u2" }, TODAY))).toEqual(["p2"]);
    expect(ids(filterProcessRows(rows, { ...none, prazo: true }, TODAY))).toEqual(["p1"]);
  });
  it("prazo próximo não inclui prazos já passados", () => {
    expect(hasNearDeadline(proc({ id: "x", next_deadline: "2026-11-10T12:00:00Z" }), TODAY)).toBe(false);
    expect(hasNearDeadline(proc({ id: "x", next_deadline: "2026-12-06T12:00:00Z" }), TODAY)).toBe(true);
  });
  it("monta as opções dos seletores", () => {
    const o = processFilterOptions(rows);
    expect(o.tribunais.map((t) => t.value)).toEqual(["TJSP", "TRF3"]);
    expect(o.responsaveis.map((r) => r.label)).toEqual(["Dr. Jean", "Marina"]);
    expect(o.areas.map((a) => a.value)).toEqual(["bancario", "familia"]);
    expect(o.status.map((s) => s.value)).toEqual(["em_andamento", "recurso"]);
  });
});

describe("processos: ordens", () => {
  it("padrão: próximo prazo, sem prazo no fim", () => {
    expect(ids(sortProcessRows([rows[2], rows[1], rows[0]], "prazo"))).toEqual(["p1", "p2", "p3"]);
  });
  it("mais recentes, número e cliente (vazios no fim)", () => {
    expect(ids(sortProcessRows(rows, "recentes"))).toEqual(["p3", "p2", "p1"]);
    expect(ids(sortProcessRows(rows, "numero"))).toEqual(["p2", "p1", "p3"]);
    expect(ids(sortProcessRows(rows, "cliente"))).toEqual(["p2", "p1", "p3"]);
  });
});

function contract(over: Partial<Contract> & { id: string }): Contract {
  return {
    lead_id: null,
    client_id: null,
    case_id: null,
    contract_type: null,
    status: "rascunho",
    value: null,
    payment_terms: null,
    signed_at: null,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

const contracts = buildContractRows(
  [
    contract({ id: "a", client_id: "c1", case_id: "k1", contract_type: "Honorários", status: "assinado", value: 5000, signed_at: "2026-05-01T12:00:00Z", created_at: "2026-04-01T12:00:00Z" }),
    contract({ id: "b", client_id: "c2", contract_type: "Consultoria", status: "enviado", value: 12000, created_at: "2026-06-01T12:00:00Z" }),
    contract({ id: "c", contract_type: null, status: "rascunho", value: null, created_at: "2026-02-01T12:00:00Z" }),
  ],
  clientNames,
  new Map([["k1", "Revisão de contrato bancário"]])
);
const cids = (list: { contract: Contract }[]) => list.map((r) => r.contract.id);

describe("contratos", () => {
  it("lê parâmetros e ignora inválidos", () => {
    expect(parseContractOptions({ status: "nada", ordem: "x" })).toMatchObject({ status: null, ordem: "recentes" });
    expect(parseContractOptions({ status: "assinado", tipo: "Honorários" })).toMatchObject({ status: "assinado", tipo: "Honorários" });
    expect(hasContractFilters(parseContractOptions({}))).toBe(false);
  });
  it("busca por cliente e caso sem acento, filtra status e tipo", () => {
    const none = parseContractOptions({});
    expect(cids(filterContractRows(contracts, { ...none, q: "joao" }))).toEqual(["a"]);
    expect(cids(filterContractRows(contracts, { ...none, q: "revisao bancario" }))).toEqual(["a"]);
    expect(cids(filterContractRows(contracts, { ...none, status: "enviado" }))).toEqual(["b"]);
    expect(cids(filterContractRows(contracts, { ...none, tipo: "Consultoria" }))).toEqual(["b"]);
    expect(contractFilterOptions(contracts).tipos.map((t) => t.value)).toEqual(["Consultoria", "Honorários"]);
  });
  it("ordena: padrão mais recentes; valor e assinatura com vazios no fim", () => {
    expect(cids(sortContractRows(contracts, "recentes"))).toEqual(["b", "a", "c"]);
    expect(cids(sortContractRows(contracts, "valor_desc"))).toEqual(["b", "a", "c"]);
    expect(cids(sortContractRows(contracts, "valor_asc"))).toEqual(["a", "b", "c"]);
    expect(cids(sortContractRows(contracts, "assinatura"))[0]).toBe("a");
    expect(cids(sortContractRows(contracts, "cliente"))).toEqual(["b", "a", "c"]);
  });
});

function payment(over: Partial<Payment> & { id: string }): Payment {
  return {
    contract_id: null,
    client_id: null,
    description: null,
    amount: 0,
    due_date: null,
    paid_at: null,
    status: "pendente",
    created_at: "2026-01-01T12:00:00Z",
    ...over,
  };
}

const payments = buildPaymentRows(
  [
    payment({ id: "x1", client_id: "c1", description: "Entrada dos honorários", amount: 1500, due_date: "2026-11-10", status: "pendente" }),
    payment({ id: "x2", client_id: "c2", description: "Parcela 2", amount: 800, due_date: "2026-12-05", status: "pendente" }),
    payment({ id: "x3", client_id: "c1", description: "Consulta", amount: 300, due_date: "2026-10-01", status: "pago", paid_at: "2026-10-01T15:00:00Z" }),
    payment({ id: "x4", description: "Sem vencimento", amount: 200, due_date: null, status: "atrasado" }),
  ],
  clientNames,
  new Map()
);
const pids = (list: { payment: Payment }[]) => list.map((r) => r.payment.id);

describe("financeiro: pagamentos", () => {
  it("lê parâmetros, ignora datas e status inválidos", () => {
    const o = parsePaymentOptions({ status: "quitado", de: "2026-13-01", ate: "2026-11-30", ordem: "?", vencidos: "1" });
    expect(o).toMatchObject({ status: null, de: null, ate: "2026-11-30", ordem: "vencimento", vencidos: true });
    expect(hasPaymentFilters(parsePaymentOptions({}))).toBe(false);
    expect(dayParam({ d: "ontem" }, "d")).toBeNull();
  });
  it("busca por cliente e descrição sem acento", () => {
    const none = parsePaymentOptions({});
    expect(pids(filterPaymentRows(payments, { ...none, q: "honorarios" }, TODAY))).toEqual(["x1"]);
    expect(pids(filterPaymentRows(payments, { ...none, q: "conceicao" }, TODAY))).toEqual(["x1", "x3"]);
  });
  it("filtra status, cliente, período de vencimento e vencidos", () => {
    const none = parsePaymentOptions({});
    expect(pids(filterPaymentRows(payments, { ...none, status: "pago" }, TODAY))).toEqual(["x3"]);
    expect(pids(filterPaymentRows(payments, { ...none, cliente: "c2" }, TODAY))).toEqual(["x2"]);
    expect(pids(filterPaymentRows(payments, { ...none, de: "2026-11-01", ate: "2026-11-30" }, TODAY))).toEqual(["x1"]);
    expect(pids(filterPaymentRows(payments, { ...none, vencidos: true }, TODAY))).toEqual(["x1", "x4"]);
    expect(isOverdue(payments[2].payment, TODAY)).toBe(false);
  });
  it("ordena: padrão por vencimento; vazios no fim nos dois sentidos", () => {
    expect(pids(sortPaymentRows(payments, "vencimento"))).toEqual(["x3", "x1", "x2", "x4"]);
    expect(pids(sortPaymentRows(payments, "vencimento_desc"))).toEqual(["x2", "x1", "x3", "x4"]);
    expect(pids(sortPaymentRows(payments, "valor_desc"))).toEqual(["x1", "x2", "x3", "x4"]);
    expect(pids(sortPaymentRows(payments, "cliente"))).toEqual(["x2", "x3", "x1", "x4"]);
  });
});

describe("datas no horário de Brasília", () => {
  it("converte data e hora para o dia em Brasília", () => {
    expect(spDay("2026-11-21T02:00:00Z")).toBe("2026-11-20");
    expect(spDay("2026-11-21")).toBe("2026-11-21");
    expect(spDay(null)).toBeNull();
  });
});
