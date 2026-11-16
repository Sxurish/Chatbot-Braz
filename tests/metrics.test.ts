import { describe, expect, it } from "vitest";
import { getDashboardMetrics, getWeeklyEvolution } from "@/lib/metrics";
import { nameOf } from "@/lib/team-names";
import type { Appointment, FollowUp, Lead, Task } from "@/lib/types";

const now = new Date("2026-11-16T15:00:00-03:00");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const lead = (id: string, created_at: string, extra: Partial<Lead> = {}) =>
  ({ id, created_at, urgency: "baixa", commercial_status: "novo", is_existing_client: false, ...extra }) as Lead;

describe("dashboard sem dados de exemplo", () => {
  it("conta tarefas, consultas e follow-ups recebidos, não os fictícios", () => {
    const empty = getDashboardMetrics([], { tasks: [], appointments: [], followUps: [] });
    expect(empty).toMatchObject({ consultasAgendadas: 0, tarefasPendentes: 0, followUpsPendentes: 0, totalLeads: 0 });

    const m = getDashboardMetrics([lead("a", daysAgo(0))], {
      tasks: [{ status: "pendente" }, { status: "concluida" }, { status: "em_andamento" }] as Task[],
      appointments: [{ status: "agendada" }, { status: "cancelada" }] as Appointment[],
      followUps: [{ status: "pendente" }, { status: "realizado" }] as FollowUp[],
    });
    expect(m).toMatchObject({ consultasAgendadas: 1, tarefasPendentes: 2, followUpsPendentes: 1, totalLeads: 1 });
  });

  it("evolução semanal vem dos leads reais (4 semanas, a última termina hoje)", () => {
    const weeks = getWeeklyEvolution(
      [
        lead("1", daysAgo(1)),
        lead("2", daysAgo(2), { commercial_status: "cliente_ativo" }),
        lead("3", daysAgo(10)),
        lead("4", daysAgo(40)),
      ],
      now
    );
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w) => w.leads)).toEqual([0, 0, 1, 2]);
    expect(weeks[3].clientes).toBe(1);
    expect(getWeeklyEvolution([], now).every((w) => w.leads === 0 && w.clientes === 0)).toBe(true);
  });

  it("nome do responsável vem da equipe real", () => {
    expect(nameOf({ u1: "Dr. Jean" }, "u1")).toBe("Dr. Jean");
    expect(nameOf({}, "x")).toBe("—");
    expect(nameOf({}, null)).toBe("Sem responsável");
  });
});
