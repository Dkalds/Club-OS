import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { listStandardsForAdmin } from "@/modules/methodology/admin-queries";
import { listTeamsForAdmin } from "@/modules/team/queries";
import type { ClubContext } from "@/modules/tenancy/queries";
import { buildCoverageMatrix } from "./build-matrix";
import type { CoverageMatrix } from "./types";

/** Las últimas semanas por defecto (spec, señal de validación: 6 semanas). */
export const DEFAULT_COVERAGE_WEEKS = 6;

/**
 * La cobertura del club entre `from` y `to` (fechas `YYYY-MM-DD`): qué equipos han
 * trabajado qué Standards publicados, de verdad (`coverage_by_team`). Dirección ve todos
 * los equipos del club; un entrenador, solo los suyos (la misma RLS de siempre).
 */
export async function getCoverageMatrix(ctx: ClubContext, from: string, to: string): Promise<CoverageMatrix> {
  const supabase = await createClient();

  const [pairs, teams, standards] = await Promise.all([
    supabase.rpc("coverage_by_team", { p_org: ctx.org.id, p_from: from, p_to: to }),
    listTeamsForAdmin(ctx),
    listStandardsForAdmin(ctx),
  ]);
  if (pairs.error) throwReadError("coverage.pairs", pairs.error);

  return buildCoverageMatrix(
    pairs.data.map((row) => ({ teamId: row.team_id, standardId: row.standard_id })),
    teams.map((team) => ({ id: team.id, name: team.name })),
    standards.filter((standard) => standard.status === "published"),
  );
}
