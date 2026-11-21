/**
 * Busca, filtros e ordem da aba Tarefas. Funções puras (testes em
 * tests/list-views-operacao.test.ts).
 */
import { compareDate, compareText, flag, matchesText, param, pickEnum, sortedBy, type RawParams } from "@/lib/list-params";
import type { TeamNames } from "@/lib/team-names";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { assigneeParam, dayOf, enumOrNull, matchesAssignee } from "./common";

export const TASK_STATUSES = ["pendente", "em_andamento", "concluida", "cancelada", "atrasada"] as const satisfies readonly TaskStatus[];
export const TASK_PRIORITIES = ["alta", "media", "baixa"] as const satisfies readonly TaskPriority[];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** "prazo" é a ordem de sempre (prazo mais próximo primeiro, sem prazo no fim). */
export const TASK_SORTS = ["prazo", "prioridade", "recentes"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];
export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  prazo: "Prazo mais próximo",
  prioridade: "Prioridade",
  recentes: "Mais recentes",
};

export interface TaskView {
  q: string | null;
  status: TaskStatus | null;
  prioridade: TaskPriority | null;
  responsavel: string | null;
  atrasadas: boolean;
  minhas: boolean;
  ordem: TaskSort;
}

export function parseTaskView(sp: RawParams, names: TeamNames): TaskView {
  return {
    q: param(sp, "q"),
    status: enumOrNull(sp, "status", TASK_STATUSES),
    prioridade: enumOrNull(sp, "prioridade", TASK_PRIORITIES),
    responsavel: assigneeParam(sp, names),
    atrasadas: flag(sp, "atrasadas"),
    minhas: flag(sp, "minhas"),
    ordem: pickEnum(sp, "ordem", TASK_SORTS, "prazo"),
  };
}

export function isTaskViewFiltered(v: TaskView): boolean {
  return Boolean(v.q || v.status || v.prioridade || v.responsavel || v.atrasadas || v.minhas || v.ordem !== "prazo");
}

/** Atrasada: marcada assim, ou ainda aberta com o prazo antes de hoje. */
export function isTaskOverdue(t: Task, today: string): boolean {
  if (t.status === "atrasada") return true;
  if (t.status === "concluida" || t.status === "cancelada") return false;
  const due = dayOf(t.due_date);
  return Boolean(due && due < today);
}

export function filterTasks(
  tasks: readonly Task[],
  v: TaskView,
  ctx: { today: string; userId: string | null }
): Task[] {
  return tasks.filter((t) => {
    if (v.status && t.status !== v.status) return false;
    if (v.prioridade && t.priority !== v.prioridade) return false;
    if (!matchesAssignee(t.assigned_to, v.responsavel)) return false;
    if (v.minhas && (!ctx.userId || t.assigned_to !== ctx.userId)) return false;
    if (v.atrasadas && !isTaskOverdue(t, ctx.today)) return false;
    return matchesText(v.q, [t.title, t.description]);
  });
}

const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, media: 1, baixa: 2 };

export function sortTasks(tasks: readonly Task[], ordem: TaskSort): Task[] {
  switch (ordem) {
    case "prioridade":
      return sortedBy(
        tasks,
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDate(a.due_date, b.due_date)
      );
    case "recentes":
      return sortedBy(tasks, (a, b) => compareDate(a.created_at, b.created_at, "desc") || compareText(a.title, b.title));
    default:
      return sortedBy(tasks, (a, b) => compareDate(a.due_date, b.due_date));
  }
}
