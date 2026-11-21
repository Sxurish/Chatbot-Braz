import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EditOperationButton, QuickCreate } from "@/components/crm/quick-create";
import { ConfirmDeleteButton, StatusButton } from "@/components/crm/record-actions";
import { canWriteRecords, listResponsibleOptions } from "@/lib/data/cadastros-options";
import { Check, RotateCcw } from "lucide-react";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { listTasks } from "@/lib/data/crm";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isoDateInSaoPaulo } from "@/lib/digest/dates";
import type { RawParams } from "@/lib/list-params";
import { assigneeOptions, optionsOf } from "@/lib/list-views/common";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_SORT_LABELS,
  TASK_SORTS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  filterTasks,
  isTaskViewFiltered,
  parseTaskView,
  sortTasks,
} from "@/lib/list-views/tarefas";
import { formatDateTime } from "@/lib/utils";
import type { TaskPriority } from "@/lib/types";

const PRIORITY_TONE: Record<TaskPriority, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default async function TasksPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [all, names, me, canWrite, assignees] = await Promise.all([
    listTasks(),
    getTeamNames(),
    getCurrentUser(),
    canWriteRecords(),
    listResponsibleOptions(),
  ]);
  const view = parseTaskView(sp, names);
  const filtered = isTaskViewFiltered(view);
  const tasks = sortTasks(
    filterTasks(all, view, { today: isoDateInSaoPaulo(new Date()), userId: me.id }),
    view.ordem
  );
  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Ações internas vinculadas a leads, clientes, casos e processos."
        action={canWrite ? <QuickCreate kind="task" buttonLabel="Nova tarefa" assignees={assignees} /> : undefined}
      />
      {all.length > 0 && (
        <ListToolbar
          path="/tarefas"
          search={{ value: view.q, placeholder: "Buscar por título ou descrição" }}
          selects={[
            {
              name: "status",
              label: "Status",
              value: view.status,
              options: optionsOf(TASK_STATUSES, TASK_STATUS_LABELS),
            },
            {
              name: "prioridade",
              label: "Prioridade",
              value: view.prioridade,
              options: optionsOf(TASK_PRIORITIES, TASK_PRIORITY_LABELS),
              allLabel: "Todas",
            },
            {
              name: "responsavel",
              label: "Responsável",
              value: view.responsavel,
              options: assigneeOptions(names),
            },
          ]}
          checks={[
            { name: "atrasadas", label: "Só atrasadas", checked: view.atrasadas },
            { name: "minhas", label: "Só minhas", checked: view.minhas },
          ]}
          sort={{ value: view.ordem, options: optionsOf(TASK_SORTS, TASK_SORT_LABELS) }}
          active={filtered}
          count={{ shown: tasks.length, total: all.length, singular: "tarefa", plural: "tarefas" }}
        />
      )}
      {tasks.length === 0 ? (
        <EmptyState
          title={all.length > 0 ? "Nenhuma tarefa encontrada" : "Nenhuma tarefa pendente"}
          description={all.length > 0 ? "Mude ou limpe os filtros para ver outras tarefas." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={
                      task.status === "concluida" || task.status === "cancelada"
                        ? "font-medium text-slate-400 line-through"
                        : "font-medium text-slate-900"
                    }
                  >
                    {task.title}
                  </p>
                  <Badge className={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {nameOf(names, task.assigned_to)} • Prazo: {formatDateTime(task.due_date)}
                  {task.lead_id && (
                    <>
                      {" • "}
                      <Link
                        href={`/leads/${task.lead_id}`}
                        className="text-brand-primary hover:underline"
                      >
                        ver lead
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
                <Badge className="mr-1 border-slate-200 bg-slate-50 text-slate-600">
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
                {canWrite && (
                  <>
                    {task.status === "concluida" || task.status === "cancelada" ? (
                      <StatusButton
                        kind="task"
                        id={task.id}
                        status="pendente"
                        label="Reabrir"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                      />
                    ) : (
                      <StatusButton
                        kind="task"
                        id={task.id}
                        status="concluida"
                        label="Concluir"
                        tone="primary"
                        icon={<Check className="h-3.5 w-3.5" />}
                      />
                    )}
                    <EditOperationButton kind="task" record={task} assignees={assignees} />
                    <ConfirmDeleteButton fields={{ kind: "task", id: task.id }} question="Remover a tarefa?" />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
