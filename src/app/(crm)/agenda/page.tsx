import { CalendarPlus, Video, MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserName } from "@/lib/mock-data";
import { listAppointments } from "@/lib/data/crm";
import { formatDate } from "@/lib/utils";

const MODALITY = {
  online: { label: "Online", icon: Video },
  presencial: { label: "Presencial", icon: MapPin },
  telefone: { label: "Telefone", icon: Phone },
};

export default async function AgendaPage() {
  const appointments = await listAppointments();
  return (
    <>
      <PageHeader
        title="Agenda"
        description="Consultas e reuniões da equipe. Preparado para integração futura com Google Calendar."
        action={
          <Button>
            <CalendarPlus className="h-4 w-4" /> Novo agendamento
          </Button>
        }
      />
      {appointments.length === 0 ? (
        <EmptyState title="Nenhum agendamento" />
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
                      {getUserName(appt.assigned_to)} • {appt.start_time}
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
