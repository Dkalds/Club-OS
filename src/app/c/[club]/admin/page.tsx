import { redirect } from "next/navigation";
import { adminPage } from "@/lib/guards";

/** La raíz de Gestión no tiene contenido propio: lleva al primer apartado, la metodología. */
export default adminPage((ctx) => redirect(`/c/${ctx.org.slug}/admin/way`));
