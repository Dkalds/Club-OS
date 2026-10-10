import type { CoverageMatrix, CoveragePair, CoverageStandard, CoverageTeam } from "./types";

// Función pura (contrato, Fase 7): cruza los pares que sí se cubrieron
// (`coverage_by_team`) con la lista de equipos y de Standards del club, para una matriz
// completa, sin huecos. Un par de un equipo o un Standard que ya no está en esas listas
// (archivado, de otra temporada) se ignora: no aparecería en ninguna fila ni columna.

function key(teamId: string, standardId: string): string {
  return `${teamId}\u0000${standardId}`;
}

export function buildCoverageMatrix(
  pairs: CoveragePair[],
  teams: CoverageTeam[],
  standards: CoverageStandard[],
): CoverageMatrix {
  const covered = new Set(pairs.map((pair) => key(pair.teamId, pair.standardId)));

  return {
    standards,
    rows: teams.map((team) => ({
      team,
      covered: standards.map((standard) => covered.has(key(team.id, standard.id))),
    })),
  };
}
