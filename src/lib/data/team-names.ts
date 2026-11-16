import "server-only";
import { cache } from "react";
import { listTeam } from "@/lib/data/leads";
import type { TeamNames } from "@/lib/team-names";

/** Mapa id → nome da equipe, uma leitura por página. */
export const getTeamNames = cache(async (): Promise<TeamNames> => {
  const team = await listTeam();
  return Object.fromEntries(team.map((u) => [u.id, u.name]));
});
