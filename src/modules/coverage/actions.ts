"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getCoverageMatrix } from "./queries";
import type { CoverageMatrix } from "./types";

/**
 * Vuelve a leer la cobertura con otro rango de fechas, desde el selector de `/admin/coverage`
 * (sin recargar la página). De solo lectura: no hay nada que revalidar, así que no pasa por
 * `mutate` (pensado para escrituras). El permiso es el mismo que ya exige la página.
 */
export async function fetchCoverageMatrix(
  clubSlug: string,
  from: string,
  to: string,
): Promise<ActionResult<CoverageMatrix>> {
  const ctx = await requireClub(clubSlug);
  if (!can(ctx, "coverage.view")) return fail("NOT_FOUND");

  const matrix = await getCoverageMatrix(ctx, from, to);
  return ok(matrix);
}
