// De un paquete ya validado a las filas que se escriben en el club de destino. PURO: sin
// disco, sin red y sin reloj. `import.ts` solo escribe lo que sale de aquí.
//
// Los ids son deterministas: salen del club, del paquete y de la clave del ejercicio. Importar
// dos veces el mismo paquete en el mismo club encuentra las mismas filas, y el mismo paquete
// en dos clubes da filas distintas.

import { v5 as uuidv5 } from "uuid";
import type { TablesInsert } from "@/lib/database.types";
import { DIAGRAM_MIME } from "@/modules/media/diagram-file";
import type { LoadedPack } from "./pack";

// Namespace fijo de los ids del contenido importado, distinto del del seed: un ejercicio
// importado no puede tener el id de uno de ejemplo aunque se llamen igual. No lo cambies: cada
// id ya importado se calcula a partir de él, y cambiarlo haría que la siguiente importación
// duplicara todas las filas en vez de encontrarlas.
export const CONTENT_NAMESPACE = "08a75eb4-da1b-4637-bef7-00ab6759a019";

const MEDIA_BUCKET = "club-media";

/** Id determinista (uuid v5) de una fila importada: mismo club, mismo paquete y misma clave, mismo id. */
export function contentId(organizationId: string, packId: string, key: string): string {
  return uuidv5(`${organizationId}:${packId}:${key}`, CONTENT_NAMESPACE);
}

/** Lo que el club de destino ya define y a lo que los ejercicios del paquete se enlazan. */
export type ClubRefs = {
  organizationId: string;
  slug: string;
  focusAreas: { id: string; slug: string }[];
  principles: { id: string; slug: string }[];
};

type WithId<Row> = Row & { id: string };

/** Todo lo que se escribe de un ejercicio del paquete. */
export type PackDrillRows = {
  key: string;
  drill: WithId<TablesInsert<"drills">>;
  media: WithId<TablesInsert<"media_assets">> | null;
  upload: { path: string; file: string; contentType: string } | null;
  points: WithId<TablesInsert<"drill_coaching_points">>[];
  variants: WithId<TablesInsert<"drill_variants">>[];
  focusAreas: TablesInsert<"drill_focus_areas">[];
  principles: TablesInsert<"drill_principles">[];
};

/** Al club le falta algo de lo que el paquete nombra. `missing` lo trae todo, una vez cada cosa. */
export class MissingRefsError extends Error {
  readonly missing: string[];

  constructor(clubSlug: string, missing: string[]) {
    super(`En ${clubSlug} faltan: ${missing.join(", ")}.`);
    this.name = "MissingRefsError";
    this.missing = missing;
  }
}

/**
 * Las filas de cada ejercicio del paquete, en el orden del paquete. Los objetivos de trabajo y
 * los principios se buscan por `slug` entre los del club (`refs`); si falta alguno, lanza un
 * `MissingRefsError` con todos los que faltan y no devuelve nada a medias.
 *
 * `sort` de puntos y variantes empieza en 0, como `save_drill`. El objeto de Storage se llama
 * `org/<club>/drills/<ejercicio>/<ficha>.<tipo>`: la carpeta que las políticas dejan leer a
 * quien ve el ejercicio.
 */
export function buildPackRows(loaded: LoadedPack, refs: ClubRefs): PackDrillRows[] {
  const { organizationId } = refs;
  const packId = loaded.pack.id;
  const missing: string[] = [];

  const resolve = (list: { id: string; slug: string }[], what: string, slug: string): string => {
    const found = list.find((item) => item.slug === slug);
    if (found) return found.id;
    const label = `${what} "${slug}"`;
    if (!missing.includes(label)) missing.push(label);
    return "";
  };

  const rows = loaded.pack.drills.map((drill): PackDrillRows => {
    const id = contentId(organizationId, packId, `drill:${drill.key}`);
    const diagram = loaded.diagrams.get(drill.key) ?? null;
    const mediaId = diagram ? contentId(organizationId, packId, `drill:${drill.key}:diagram`) : null;
    const objectPath =
      diagram && mediaId ? `org/${organizationId}/drills/${id}/${mediaId}.${diagram.type}` : null;

    return {
      key: drill.key,
      drill: {
        id,
        organization_id: organizationId,
        title: drill.title,
        summary: null,
        objective: drill.objective,
        setup_md: drill.setupMd,
        min_players: drill.players[0],
        max_players: drill.players[1],
        min_minutes: drill.minutes[0],
        max_minutes: drill.minutes[1],
        min_age: drill.age[0],
        max_age: drill.age[1],
        equipment: drill.equipment,
        diagram_media_id: mediaId,
        video_url: null,
        status: drill.status,
        // Sin autor: lo publicado lo ve todo el cuerpo técnico y lo edita dirección.
        created_by: null,
      },
      media:
        diagram && mediaId && objectPath
          ? {
              id: mediaId,
              organization_id: organizationId,
              bucket: MEDIA_BUCKET,
              path: objectPath,
              kind: "image",
              mime: DIAGRAM_MIME[diagram.type],
              bytes: diagram.bytes,
              contains_minor: false,
              created_by: null,
            }
          : null,
      upload:
        diagram && objectPath
          ? { path: objectPath, file: diagram.file, contentType: DIAGRAM_MIME[diagram.type] }
          : null,
      points: drill.points.map((point, index) => ({
        id: contentId(organizationId, packId, `drill:${drill.key}:point:${index}`),
        organization_id: organizationId,
        drill_id: id,
        text: point.text,
        is_key: point.key,
        sort: index,
      })),
      variants: drill.variants.map((variant, index) => ({
        id: contentId(organizationId, packId, `drill:${drill.key}:variant:${index}`),
        organization_id: organizationId,
        drill_id: id,
        title: variant.title,
        description: variant.description,
        sort: index,
      })),
      focusAreas: drill.focus.map((slug) => ({
        organization_id: organizationId,
        drill_id: id,
        focus_area_id: resolve(refs.focusAreas, "el objetivo de trabajo", slug),
      })),
      principles: drill.principles.map((slug) => ({
        organization_id: organizationId,
        drill_id: id,
        principle_id: resolve(refs.principles, "el principio", slug),
      })),
    };
  });

  if (missing.length > 0) throw new MissingRefsError(refs.slug, missing);
  return rows;
}
