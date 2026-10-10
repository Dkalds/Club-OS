export type CoverageTeam = { id: string; name: string };
export type CoverageStandard = { id: string; number: number; title: string };

/** Lo que trajo `coverage_by_team`: los pares equipo-Standard que SÍ se cubrieron. */
export type CoveragePair = { teamId: string; standardId: string };

export type CoverageRow = {
  team: CoverageTeam;
  /** En el mismo orden que `CoverageMatrix.standards`. */
  covered: boolean[];
};

/** La matriz completa: equipos en fila, Standards en columna, sin huecos. */
export type CoverageMatrix = {
  standards: CoverageStandard[];
  rows: CoverageRow[];
};
