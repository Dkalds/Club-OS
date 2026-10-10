import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { seedId } from "../seed/ids";
import { loadPack, type LoadedPack } from "./pack";
import { MissingRefsError, buildPackRows, contentId, type ClubRefs } from "./rows";

// De un paquete a las filas que se escriben, sin base de datos: ids deterministas, la ficha,
// la pizarra y los hijos de cada ejercicio, y qué pasa si al club le falta algo de lo que el
// paquete nombra.

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/pack-ejemplo");
const PACK = "pack-ejemplo";
const KEY = "rueda-de-pases-en-estrella";
const ORG = "11111111-1111-4111-8111-111111111111";

const refs: ClubRefs = {
  organizationId: ORG,
  slug: "club-de-prueba",
  focusAreas: [
    { id: "22222222-2222-4222-8222-000000000001", slug: "tecnica" },
    { id: "22222222-2222-4222-8222-000000000002", slug: "transicion" },
    { id: "22222222-2222-4222-8222-000000000003", slug: "ataque" },
  ],
  principles: [{ id: "33333333-3333-4333-8333-000000000001", slug: "transicion" }],
};

function idOf(list: { id: string; slug: string }[], slug: string): string {
  const found = list.find((item) => item.slug === slug);
  if (!found) throw new Error(`El test no define "${slug}".`);
  return found.id;
}
const focusId = (slug: string) => idOf(refs.focusAreas, slug);
const principleId = (slug: string) => idOf(refs.principles, slug);

let loaded: LoadedPack;

beforeAll(async () => {
  loaded = await loadPack(FIXTURE);
});

describe("contentId", () => {
  it("es estable y cambia con cada una de sus partes", () => {
    const id = contentId(ORG, PACK, "drill:x");

    expect(contentId(ORG, PACK, "drill:x")).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const others = [
      contentId(ORG.replace("1", "2"), PACK, "drill:x"),
      contentId(ORG, "otro-paquete", "drill:x"),
      contentId(ORG, PACK, "drill:y"),
    ];
    expect(new Set([id, ...others]).size).toBe(4);
  });

  it("no coincide con el id que el seed da a un ejercicio con la misma clave", () => {
    const org = seedId("arcangel", "organization");

    expect(contentId(org, PACK, "drill:3x2-continuo")).not.toBe(seedId("arcangel", "drill:3x2-continuo"));
  });
});

describe("buildPackRows", () => {
  it("la ficha, la pizarra y los hijos del primer ejercicio", () => {
    const [first] = buildPackRows(loaded, refs);
    const id = contentId(ORG, PACK, `drill:${KEY}`);
    const mediaId = contentId(ORG, PACK, `drill:${KEY}:diagram`);
    const diagram = loaded.diagrams.get(KEY);
    if (!diagram) throw new Error("El paquete de ejemplo no trae la pizarra.");
    const objectPath = `org/${ORG}/drills/${id}/${mediaId}.png`;

    expect(first.key).toBe(KEY);
    expect(first.drill).toEqual({
      id,
      organization_id: ORG,
      title: "Rueda de pases en estrella",
      summary: null,
      objective: "Pasar y moverse sin perder de vista el siguiente pase.",
      setup_md: loaded.pack.drills[0].setupMd,
      min_players: 5,
      max_players: 12,
      min_minutes: 8,
      max_minutes: 10,
      min_age: 10,
      max_age: null,
      equipment: ["Balones"],
      diagram_media_id: mediaId,
      video_url: null,
      status: "published",
      created_by: null,
    });
    expect(first.media).toEqual({
      id: mediaId,
      organization_id: ORG,
      bucket: "club-media",
      path: objectPath,
      kind: "image",
      mime: "image/png",
      bytes: diagram.bytes,
      contains_minor: false,
      created_by: null,
    });
    expect(first.upload).toEqual({ path: objectPath, file: diagram.file, contentType: "image/png" });
    // La forma que exigen las políticas de Storage para la carpeta de un ejercicio.
    expect(objectPath).toMatch(/^org\/[0-9a-f-]{36}\/drills\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/);
    expect(first.points).toEqual([
      {
        id: contentId(ORG, PACK, `drill:${KEY}:point:0`),
        organization_id: ORG,
        drill_id: id,
        text: "Manos preparadas antes de recibir",
        is_key: true,
        sort: 0,
      },
      {
        id: contentId(ORG, PACK, `drill:${KEY}:point:1`),
        organization_id: ORG,
        drill_id: id,
        text: "Paso hacia el pase",
        is_key: false,
        sort: 1,
      },
    ]);
    expect(first.variants).toEqual([
      {
        id: contentId(ORG, PACK, `drill:${KEY}:variant:0`),
        organization_id: ORG,
        drill_id: id,
        title: "Con dos balones",
        description: "Entra un segundo balón cuando el ritmo es estable.",
        sort: 0,
      },
    ]);
    expect(first.focusAreas).toEqual([
      { organization_id: ORG, drill_id: id, focus_area_id: focusId("tecnica") },
    ]);
    expect(first.principles).toEqual([]);
  });

  it("un ejercicio sin pizarra, en borrador y con edad máxima", () => {
    const [, second] = buildPackRows(loaded, refs);

    expect(second.key).toBe("dos-contra-uno-en-carrera");
    expect(second.media).toBeNull();
    expect(second.upload).toBeNull();
    expect(second.drill).toMatchObject({
      diagram_media_id: null,
      status: "draft",
      min_age: 12,
      max_age: 16,
      equipment: [],
    });
    expect(second.focusAreas.map((row) => row.focus_area_id)).toEqual([
      focusId("transicion"),
      focusId("ataque"),
    ]);
    expect(second.principles).toEqual([
      { organization_id: ORG, drill_id: second.drill.id, principle_id: principleId("transicion") },
    ]);
  });

  it("todas las fichas llevan las mismas columnas, para escribirlas en un solo lote", () => {
    const [a, b] = buildPackRows(loaded, refs).map((rows) => Object.keys(rows.drill).sort());

    expect(a).toEqual(b);
  });

  it("dice todo lo que le falta al club, una vez cada cosa y en orden", () => {
    const poor: ClubRefs = {
      ...refs,
      focusAreas: refs.focusAreas.filter((focus) => focus.slug !== "ataque"),
      principles: [],
    };
    let error: unknown;
    try {
      buildPackRows(loaded, poor);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MissingRefsError);
    expect((error as MissingRefsError).missing).toEqual([
      'el objetivo de trabajo "ataque"',
      'el principio "transicion"',
    ]);
    expect((error as MissingRefsError).message).toBe(
      'En club-de-prueba faltan: el objetivo de trabajo "ataque", el principio "transicion".',
    );
  });
});
