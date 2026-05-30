import { type LucideIcon, Hammer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  roadmap?: string[];
}

/**
 * Placeholder consistente para módulos previstos na arquitetura modular
 * (ecossistema LexIA) ainda não implementados nesta fase.
 */
export function ModulePlaceholder({
  title,
  description,
  icon: Icon = Hammer,
  roadmap = [],
}: ModulePlaceholderProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10">
            <Icon className="h-7 w-7 text-brand-primary" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Módulo previsto na arquitetura
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Este módulo faz parte da estrutura modular do sistema e será implementado nas
            próximas fases do roadmap.
          </p>
          {roadmap.length > 0 && (
            <ul className="mt-6 space-y-2 text-left text-sm text-slate-600">
              {roadmap.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
