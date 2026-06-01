import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickCreate } from "@/components/crm/quick-create";
import { getUserName } from "@/lib/mock-data";
import { listTasks } from "@/lib/data/crm";
import { formatDateTime } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITY_TONE: Record<TaskPriority, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
};

export default async function TasksPage() {
  const tasks = await listTasks();
  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Ações internas vinculadas a leads, clientes, casos e processos."
        action={<QuickCreate kind="task" buttonLabel="Nova tarefa" />}
      />
      {tasks.length === 0 ? (
        <EmptyState title="Nenhuma tarefa pendente" />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  <Badge className={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {getUserName(task.assigned_to)} • Prazo: {formatDateTime(task.due_date)}
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
              <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                {STATUS_LABEL[task.status]}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
