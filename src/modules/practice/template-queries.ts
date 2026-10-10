import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import { totalMinutes } from "./items";
import type { FocusOption, PracticeTemplate } from "./types";

// Lecturas de las plantillas de sesión de quien las guarda.
//
// Una plantilla es un plan sin equipo ni evento (`is_template`). RLS deja leerla a su autor y a
// la dirección del club; las pantallas solo enseñan las propias, así que aquí se filtra además
// por quien tiene la sesión. Como el resto de lecturas: con la sesión de la persona, acotadas al
// club, y un error se registra y lanza (`throwReadError`).

/** Las plantillas que una persona puede tener en un club (lo aplica la función que las guarda). */
export const TEMPLATE_LIMIT = 50;

const TEMPLATE_COLUMNS = `id, title,
  primary_focus:focus_areas!practice_plans_organization_id_primary_focus_id_fkey(id, name),
  secondary_focus:focus_areas!practice_plans_organization_id_secondary_focus_id_fkey(id, name),
  practice_items(minutes)`;

type Embedded<T> = T | T[] | null;

type TemplateRow = {
  id: string;
  title: string;
  primary_focus: Embedded<FocusOption>;
  secondary_focus: Embedded<FocusOption>;
  practice_items: Array<{ minutes: number }> | null;
};

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function focusOf(value: Embedded<FocusOption>): FocusOption | null {
  const focus = one(value);
  return focus ? { id: focus.id, name: focus.name } : null;
}

function toTemplate(row: TemplateRow): PracticeTemplate {
  const items = row.practice_items ?? [];
  return {
    id: row.id,
    title: row.title,
    totalMinutes: totalMinutes(items),
    itemCount: items.length,
    primaryFocus: focusOf(row.primary_focus),
    secondaryFocus: focusOf(row.secondary_focus),
  };
}

/** El id de quien tiene la sesión (comprobado, no la cookie tal cual), o `null` si no hay. */
async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) throwReadError("practice.template-viewer", error);

  return data?.claims.sub ?? null;
}

/** Mis plantillas en este club, por título. Sin sesión, ninguna. */
export async function listTemplates(ctx: ClubContext): Promise<PracticeTemplate[]> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (userId === null) return [];

  const { data, error } = await supabase
    .from("practice_plans")
    .select(TEMPLATE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("is_template", true)
    .is("team_id", null)
    .eq("created_by", userId)
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .limit(TEMPLATE_LIMIT);
  if (error) throwReadError("practice.templates", error);

  return data.map(toTemplate);
}

/**
 * Una plantilla mía de este club. `null` si el id no es un uuid (sin consultar nada) o si la fila
 * no llega: no existe, es de otro club, es de otra persona o no es una plantilla, sin distinguir;
 * quien llama responde con el mismo 404.
 */
export async function getTemplate(ctx: ClubContext, templateId: string): Promise<PracticeTemplate | null> {
  if (!UUID_RE.test(templateId)) return null;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (userId === null) return null;

  const { data, error } = await supabase
    .from("practice_plans")
    .select(TEMPLATE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", templateId)
    .eq("is_template", true)
    .is("team_id", null)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throwReadError("practice.template", error);

  return data ? toTemplate(data) : null;
}
