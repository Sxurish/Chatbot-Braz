/** Nome de cada pessoa da equipe por id (lido do banco pela página). */
export type TeamNames = Record<string, string>;

export function nameOf(names: TeamNames, id: string | null | undefined): string {
  if (!id) return "Sem responsável";
  return names[id] ?? "—";
}
