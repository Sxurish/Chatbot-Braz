import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCalendar, easterSunday, movableSuspensions, normalizeComarca } from "@/lib/prazos/calendar";
import { computeDeadline, groupSkipped, validateDeadlineInput } from "@/lib/prazos/compute";
import type { CalendarDay, DeadlineInput } from "@/lib/prazos/types";

/**
 * Casos conferidos à mão no calendário. Cada teste explica a conta.
 * Dias da tabela usados aqui (os mesmos da semente do banco):
 * 2026: Carnaval 16 e 17/02, Quinta e Sexta Santa 02 e 03/04, Corpus Christi 04/06.
 * 2027: Carnaval 08 e 09/02, Quinta e Sexta Santa 25 e 26/03, Corpus Christi 27/05.
 */
function day(date: string, description: string, extra: Partial<CalendarDay> = {}): CalendarDay {
  return {
    id: `t-${date}`,
    court: "TJSP",
    day: date,
    kind: "suspensao",
    comarca: null,
    description,
    source: "Calendário forense do TJSP (conferir o provimento do CSM do ano)",
    source_url: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    ...extra,
  };
}

const TABLE: CalendarDay[] = [
  day("2026-02-16", "Carnaval (segunda-feira)"),
  day("2026-02-17", "Carnaval (terça-feira)"),
  day("2026-04-02", "Quinta-feira Santa"),
  day("2026-04-03", "Sexta-feira Santa"),
  day("2026-06-04", "Corpus Christi"),
  day("2027-02-08", "Carnaval (segunda-feira)"),
  day("2027-02-09", "Carnaval (terça-feira)"),
  day("2027-03-25", "Quinta-feira Santa"),
  day("2027-03-26", "Sexta-feira Santa"),
  day("2027-05-27", "Corpus Christi"),
];

function calc(input: DeadlineInput, days: CalendarDay[] = TABLE) {
  return computeDeadline(input, days);
}

describe("Páscoa e dias móveis", () => {
  it("calcula a Páscoa de 2026 e 2027", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2025)).toBe("2025-04-20");
  });

  it("deriva Carnaval, Semana Santa e Corpus Christi da Páscoa, sem a Quarta-feira de Cinzas", () => {
    expect(movableSuspensions(2026).map((m) => m.day)).toEqual([
      "2026-02-16",
      "2026-02-17",
      "2026-04-02",
      "2026-04-03",
      "2026-06-04",
    ]);
    expect(movableSuspensions(2027).map((m) => m.day)).toEqual([
      "2027-02-08",
      "2027-02-09",
      "2027-03-25",
      "2027-03-26",
      "2027-05-27",
    ]);
  });

  it("a semente do SQL tem exatamente esses dias (e não tem a Quarta-feira de Cinzas)", () => {
    const sql = readFileSync("supabase/fase5-prazos.sql", "utf8");
    const seed = sql.slice(sql.indexOf("-- SEMENTE"), sql.indexOf("-- FIM DA SEMENTE"));
    const dates = [...seed.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]).sort();
    const expected = [...movableSuspensions(2026), ...movableSuspensions(2027)].map((m) => m.day).sort();
    expect(dates).toEqual(expected);
    expect(dates).not.toContain("2026-02-18");
    expect(dates).not.toContain("2027-02-10");
  });
});

describe("calendário", () => {
  it("filtra comarca e removidos", () => {
    const days = [
      day("2026-04-08", "Aniversário de Santo André", { kind: "feriado_municipal", comarca: "Santo André" }),
      day("2026-02-16", "Carnaval", { removed_at: "2026-01-10T00:00:00Z" }),
    ];
    expect(buildCalendar(days, "Comarca de Santo Andre").isBusinessDay("2026-04-08")).toBe(false);
    expect(buildCalendar(days, "São Bernardo do Campo").isBusinessDay("2026-04-08")).toBe(true);
    expect(buildCalendar(days).isBusinessDay("2026-04-08")).toBe(true);
    // Removido não vale mais.
    expect(buildCalendar(days).isBusinessDay("2026-02-16")).toBe(true);
    expect(normalizeComarca("Comarca de São Paulo")).toBe("sao paulo");
  });

  it("recesso vai de 20/12 a 20/01, inclusive", () => {
    const cal = buildCalendar([]);
    expect(cal.nonWorking("2026-12-18")).toBeNull();
    expect(cal.nonWorking("2026-12-21")?.kind).toBe("recesso");
    expect(cal.nonWorking("2027-01-20")?.kind).toBe("recesso");
    expect(cal.nonWorking("2027-01-21")).toBeNull();
  });
});

describe("computeDeadline — dias úteis", () => {
  it("DJEN + 20/11 (Consciência Negra) + virada de mês", () => {
    // Disponibilizada seg 16/11/2026 → publicada ter 17/11 → começa qua 18/11.
    // 18(1) 19(2) [20/11 feriado, Lei 14.759/2023] [21-22 fim de semana]
    // 23(3) 24(4) 25(5) 26(6) 27(7) 30(8) 01/12(9) 02(10) 03(11) 04(12)
    // 07(13) 08(14) 09(15) → vence qua 09/12/2026.
    const r = calc({ start: { kind: "disponibilizacao", date: "2026-11-16" }, days: 15, unit: "uteis" });
    expect(r.publicationDate).toBe("2026-11-17");
    expect(r.startDate).toBe("2026-11-18");
    expect(r.finalDate).toBe("2026-12-09");
    expect(r.countedDays).toBe(15);
    const nov20 = r.skipped.find((s) => s.date === "2026-11-20");
    expect(nov20?.source).toBe("Lei 14.759/2023");
    expect(r.steps.map((s) => s.label)).toEqual([
      "Disponibilização no DJEN",
      "Publicação",
      "Início da contagem",
      "Contagem em dias úteis",
      "Data final",
    ]);
    expect(r.steps[1].detail).toContain("art. 4º, §3º");
    expect(r.steps.at(-1)?.detail).toBe("Vence em quarta-feira, 09/12/2026.");
  });

  it("virada de mês simples", () => {
    // Intimação qui 27/08/2026 → começa sex 28/08(1); 31(2) 01/09(3) 02(4) 03(5).
    const r = calc({ start: { kind: "intimacao", date: "2026-08-27" }, days: 5, unit: "uteis" });
    expect(r.publicationDate).toBeUndefined();
    expect(r.startDate).toBe("2026-08-28");
    expect(r.finalDate).toBe("2026-09-03");
  });

  it("Carnaval: a Quarta-feira de Cinzas conta", () => {
    // Disponibilizada qui 12/02/2026 → publicada sex 13/02 → [14-15 fds, 16-17 Carnaval]
    // começa qua 18/02(1) 19(2) 20(3) 23(4) 24(5) → 24/02/2026.
    const r = calc({ start: { kind: "disponibilizacao", date: "2026-02-12" }, days: 5, unit: "uteis" });
    expect(r.publicationDate).toBe("2026-02-13");
    expect(r.startDate).toBe("2026-02-18");
    expect(r.finalDate).toBe("2026-02-24");
    expect(r.skipped.map((s) => s.date)).toEqual(["2026-02-14", "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-21", "2026-02-22"]);
  });

  it("Semana Santa e virada de mês", () => {
    // Intimação sex 27/03/2026 → [28-29 fds] começa seg 30/03(1) 31(2) 01/04(3)
    // [02 Quinta Santa, 03 Sexta Santa, 04-05 fds] 06(4) 07(5) → 07/04/2026.
    const r = calc({ start: { kind: "intimacao", date: "2026-03-27" }, days: 5, unit: "uteis" });
    expect(r.startDate).toBe("2026-03-30");
    expect(r.finalDate).toBe("2026-04-07");
    expect(r.skipped.find((s) => s.date === "2026-04-03")?.reason).toBe("Sexta-feira Santa");
  });

  it("sem a Semana Santa na tabela (removida pelo Admin), o prazo vence antes", () => {
    const days = TABLE.map((d) => (d.day.startsWith("2026-04") ? { ...d, removed_at: "2026-03-01T00:00:00Z" } : d));
    // 30/03(1) 31(2) 01/04(3) 02(4) 03(5).
    expect(calc({ start: { kind: "intimacao", date: "2026-03-27" }, days: 5, unit: "uteis" }, days).finalDate).toBe(
      "2026-04-03"
    );
  });

  it("recesso de fim de ano: prazo que atravessa 20/12–20/01", () => {
    // Disponibilizada qui 10/12/2026 → publicada sex 11/12 → começa seg 14/12(1)
    // 15(2) 16(3) 17(4) 18(5) [19/12 sábado; 20/12 a 20/01 recesso]
    // 21/01/2027 qui(6) 22(7) 25(8) 26(9) 27(10) 28(11) 29(12) 01/02(13) 02(14) 03(15).
    const r = calc({ start: { kind: "disponibilizacao", date: "2026-12-10" }, days: 15, unit: "uteis" });
    expect(r.finalDate).toBe("2027-02-03");
    const groups = groupSkipped(r.skipped);
    const recess = groups.find((g) => g.source === "CPC, art. 220");
    expect(recess).toEqual(expect.objectContaining({ from: "2026-12-20", to: "2027-01-20" }));
  });

  it("disponibilizada durante o recesso: publica em 21/01 e começa em 22/01", () => {
    // 12/01/2027 → publicação qui 21/01 → começa sex 22/01(1) 25(2) 26(3) 27(4) 28(5).
    const r = calc({ start: { kind: "disponibilizacao", date: "2027-01-12" }, days: 5, unit: "uteis" });
    expect(r.publicationDate).toBe("2027-01-21");
    expect(r.startDate).toBe("2027-01-22");
    expect(r.finalDate).toBe("2027-01-28");
  });

  it("9 de julho (feriado estadual de SP)", () => {
    // Intimação qua 08/07/2026 → [09/07 feriado] começa sex 10/07(1) 13(2) 14(3).
    const r = calc({ start: { kind: "intimacao", date: "2026-07-08" }, days: 3, unit: "uteis" });
    expect(r.startDate).toBe("2026-07-10");
    expect(r.finalDate).toBe("2026-07-14");
    expect(r.skipped[0]).toEqual({
      date: "2026-07-09",
      reason: "Feriado: Revolução Constitucionalista (feriado estadual de SP)",
      source: "Lei estadual 9.497/1997",
    });
  });

  it("prazo em dobro", () => {
    // Intimação seg 16/11/2026, 5 dias em dobro = 10 dias úteis.
    // 17(1) 18(2) 19(3) [20 feriado] 23(4) 24(5) 25(6) 26(7) 27(8) 30(9) 01/12(10).
    const r = calc({ start: { kind: "intimacao", date: "2026-11-16" }, days: 5, unit: "uteis", dobro: true });
    expect(r.countedDays).toBe(10);
    expect(r.finalDate).toBe("2026-12-01");
    expect(r.steps.find((s) => s.label === "Prazo em dobro")?.detail).toBe(
      "5 dias × 2 = 10 dias (CPC, arts. 180, 183, 186 e 229)."
    );
  });

  it("feriado municipal só vale com a comarca", () => {
    // Intimação ter 07/04/2026, 1 dia útil: qua 08/04 é aniversário de Santo André.
    const days = [...TABLE, day("2026-04-08", "Aniversário de Santo André", { kind: "feriado_municipal", comarca: "Santo André" })];
    const input: DeadlineInput = { start: { kind: "intimacao", date: "2026-04-07" }, days: 1, unit: "uteis" };
    expect(calc(input, days).finalDate).toBe("2026-04-08");
    expect(calc({ ...input, comarca: "Santo André" }, days).finalDate).toBe("2026-04-09");
    expect(calc(input, days).warnings).toContain("Comarca não informada: feriados municipais não entraram na conta.");
  });
});

describe("computeDeadline — dias corridos", () => {
  it("termina no sábado e prorroga para segunda", () => {
    // Intimação seg 14/09/2026 → começa ter 15/09(1) 16(2) 17(3) 18(4) sáb 19(5)
    // → sábado não é útil: vence seg 21/09/2026 (CPC, art. 224, §1º).
    const r = calc({ start: { kind: "intimacao", date: "2026-09-14" }, days: 5, unit: "corridos" });
    expect(r.startDate).toBe("2026-09-15");
    expect(r.finalDate).toBe("2026-09-21");
    const prorrogacao = r.steps.find((s) => s.label === "Prorrogação");
    expect(prorrogacao?.detail).toContain("sábado, 19/09/2026");
    expect(r.skipped.map((s) => s.date)).toEqual(["2026-09-19", "2026-09-20"]);
  });

  it("não conta os dias do recesso", () => {
    // Intimação ter 15/12/2026 → começa qua 16/12(1) 17(2) 18(3) sáb 19(4)
    // [20/12 a 20/01 não contam] 21/01(5) 22(6) 23(7) 24(8) 25(9) ter 26/01/2027(10).
    const r = calc({ start: { kind: "intimacao", date: "2026-12-15" }, days: 10, unit: "corridos" });
    expect(r.finalDate).toBe("2027-01-26");
  });

  it("fim de semana no meio conta normalmente", () => {
    // Intimação qui 01/10/2026 → começa sex 02/10(1) ... 15º dia = sex 16/10.
    const r = calc({ start: { kind: "intimacao", date: "2026-10-01" }, days: 15, unit: "corridos" });
    expect(r.finalDate).toBe("2026-10-16");
    expect(r.steps.some((s) => s.label === "Prorrogação")).toBe(false);
  });
});

describe("validação", () => {
  it("recusa entrada inválida", () => {
    expect(validateDeadlineInput({ start: { kind: "intimacao", date: "2026-02-30" }, days: 5, unit: "uteis" })).toBe(
      "Data inválida."
    );
    expect(validateDeadlineInput({ start: { kind: "intimacao", date: "2026-02-10" }, days: 0, unit: "uteis" })).toMatch(
      /número de dias/
    );
    expect(() => calc({ start: { kind: "intimacao", date: "x" }, days: 5, unit: "uteis" })).toThrow();
  });

  it("avisa quando o ano não tem calendário cadastrado", () => {
    const r = calc({ start: { kind: "intimacao", date: "2028-03-01" }, days: 5, unit: "uteis" });
    expect(r.warnings.some((w) => w.includes("2028"))).toBe(true);
  });
});
