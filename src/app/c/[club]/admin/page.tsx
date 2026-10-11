import { redirect } from "next/navigation";
import { adminPage } from "@/lib/guards";
import { adminHomeHref } from "@/modules/tenancy/navigation";

/** La raíz de Gestión no tiene contenido propio: lleva al primer apartado, la temporada. */
export default adminPage((ctx) => redirect(adminHomeHref(ctx.org.slug)));
