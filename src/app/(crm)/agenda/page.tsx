import { Video, MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickCreate } from "@/components/crm/quick-create";
import { getTeamNames } from "@/lib/data/team-names";
import { nameOf } from "@/lib/team-names";
import { listAppointments } from "@/lib/data/crm";
import { ListToolbar } from "@/components/crm/list-toolbar";
import type { RawParams } from "@/lib/list-params";
import { assigneeOptions, optionsOf } from "@/lib/list-views/common";
import {
  APPOINTMENT_MODALITIES,
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_SORT_LABELS,
  APPOINTMENT_SORTS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  filterAppointments,
  isAppointmentViewFiltered,
  parseAppointmentView,
  sortAppointments,
} from "@/lib/list-views/agenda";
import { formatDate } from "@/lib/utils";

const MODALITY = {
  online: { label: "Online", icon: Video },
  presencial: { label: "Presencial", icon: MapPin },
  telefone: { label: "Telefone", icon: Phone },
};

export default async function AgendaPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [all, names] = await Promise.all([listAppointments(), getTeamNames()]);
  const view = parseAppointmentView(sp, names);
  const appointments = sortAppointments(filterAppointments(all, view), view.ordem);
  return (
    <>
      <PageHeader
        title="Agenda"
        description="Consultas e reuniões da equipe. Preparado para integração futura com Google Calendar."
        action={<QuickCreate kind="appointment" buttonLabel="Novo agendamento" />}
      />
      {all.length > 0 && (
        <ListToolbar
          path="/agenda"
          search={{ value: view.q, placeholder: "Buscar por título ou observações" }}
          selects={[
            {
              name: "modalidade",
              label: "Tipo",
              value: view.modalidade,
              options: optionsOf(APPOINTMENT_MODALITIES, APPOINTMENT_MODALITY_LABELS),
            },
            {
              name: "situacao",
              label: "Situação",
              value: view.situacao,
              options: optionsOf(APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS),
              allLabel: "Todas",
            },
            {
              name: "responsavel",
              label: "Responsável",
              value: view.responsavel,
              options: assigneeOptions(names),
            },
          ]}
          dates={[
            { name: "de", label: "Data de", value: view.de },
            { name: "ate", label: "até", value: view.ate },
          ]}
          sort={{ value: view.ordem, options: optionsOf(APPOINTMENT_SORTS, APPOINTMENT_SORT_LABELS) }}
          active={isAppointmentViewFiltered(view)}
          count={{ shown: appointments.length, total: all.length, singular: "agendamento", plural: "agendamentos" }}
        />
      )}
      {appointments.length === 0 ? (
        <EmptyState
          title={all.length > 0 ? "Nenhum agendamento encontrado" : "Nenhum agendamento"}
          description={all.length > 0 ? "Mude ou limpe os filtros para ver outros agendamentos." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => {
            const mod = MODALITY[appt.modality];
            const Icon = mod.icon;
            return (
              <Card key={appt.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <span className="text-xs">{formatDate(appt.date).slice(0, 5)}</span>
                    <span className="text-sm font-semibold">{appt.start_time}</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{appt.title}</p>
                    <p className="text-xs text-slate-500">
                      {nameOf(names, appt.assigned_to)} • {appt.start_time}
                      {appt.end_time ? `–${appt.end_time}` : ""}
                    </p>
                  </div>
                </div>
                <Badge className="gap-1 border-slate-200 bg-slate-50 text-slate-600">
                  <Icon className="h-3 w-3" /> {mod.label}
                </Badge>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
