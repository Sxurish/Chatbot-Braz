import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { checkAdmin } from "@/lib/auth/require-admin";
import { listCases, listProcesses } from "@/lib/data/fase6";
import { listCaseOptions, listClientOptions } from "@/lib/data/fase6-options";
import { listTeam } from "@/lib/data/leads";
import type { RawParams } from "@/lib/list-params";
import { spDay } from "@/lib/list-views/dates";
import {
  NEAR_DEADLINE_DAYS,
  PROCESS_SORTS,
  PROCESS_SORT_LABELS,
  buildProcessRows,
  filterProcessRows,
  hasProcessFilters,
  parseProcessOptions,
  processFilterOptions,
  sortProcessRows,
} from "@/lib/list-views/processos";
import { ProcessesClient } from "./processes-client";

export default async function ProcessesPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const [admin, processes, cases, caseRows, clients, team] = await Promise.all([
    checkAdmin(),
    listProcesses(),
    listCaseOptions(),
    listCases(),
    listClientOptions(),
    listTeam(),
  ]);

  const view = parseProcessOptions(sp);
  const rows = buildProcessRows(
    processes,
    caseRows,
    new Map(clients.map((c) => [c.id, c.label])),
    new Map(team.map((u) => [u.id, u.name]))
  );
  const options = processFilterOptions(rows);
  const shown = sortProcessRows(filterProcessRows(rows, view, spDay(new Date()) ?? ""), view.ordem);
  const active = hasProcessFilters(view);

  return (
    <>
      <PageHeader
        title="Processos"
        description="Processos judiciais e administrativos com acompanhamento de prazos."
      />
      <ProcessesClient
        processes={shown.map((r) => r.process)}
        cases={cases}
        isAdmin={admin.ok}
        filtered={processes.length > 0 && shown.length === 0}
        toolbar={
          processes.length > 0 ? (
            <ListToolbar
              path="/processos"
              search={{
                value: view.q,
                placeholder: "Buscar por número do processo (com ou sem pontuação), cliente, caso, vara ou classe",
              }}
              selects={[
                { name: "tribunal", label: "Tribunal", value: view.tribunal, options: options.tribunais },
                { name: "status", label: "Situação", value: view.status, options: options.status, allLabel: "Todas" },
                { name: "area", label: "Área", value: view.area, options: options.areas, allLabel: "Todas" },
                { name: "responsavel", label: "Responsável", value: view.responsavel, options: options.responsaveis },
              ]}
              checks={[
                {
                  name: "prazo",
                  label: `Prazo nos próximos ${NEAR_DEADLINE_DAYS} dias`,
                  checked: view.prazo,
                },
              ]}
              sort={{
                value: view.ordem,
                options: PROCESS_SORTS.map((s) => ({ value: s, label: PROCESS_SORT_LABELS[s] })),
              }}
              active={active}
              count={{ shown: shown.length, total: processes.length, singular: "processo", plural: "processos" }}
            />
          ) : null
        }
      />
    </>
  );
}
