import { adminPage } from "@/lib/guards";
import { addLocalDays, isoToLocalInputs } from "@/lib/time";
import { DEFAULT_COVERAGE_WEEKS, getCoverageMatrix } from "@/modules/coverage/queries";
import { CoverageScreen } from "./coverage-screen";

/** Qué Standards ha trabajado cada equipo de verdad, en las últimas semanas (spec, decisión 11). */
export default adminPage(async (ctx) => {
  const now = new Date().toISOString();
  const to = isoToLocalInputs(now, ctx.org.timezone).date;
  const from = isoToLocalInputs(addLocalDays(now, -DEFAULT_COVERAGE_WEEKS * 7, ctx.org.timezone), ctx.org.timezone).date;

  const matrix = await getCoverageMatrix(ctx, from, to);

  return <CoverageScreen clubSlug={ctx.org.slug} from={from} to={to} matrix={matrix} />;
});
