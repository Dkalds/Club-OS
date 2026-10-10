// Integración contra Supabase local: `supabase start`, `.env.local` con las claves, `pnpm seed`
// y `pnpm test:int scripts/content`. Importa el paquete de ejemplo (ficticio) en los clubes del
// seed y comprueba, con la base de datos y Storage de verdad, lo que `importPack` promete:
// crea, no repite, respeta lo editado en la app salvo `update`, no escribe nada si al club le
// falta algo y deshace lo que creó si falla a mitad.
//
// Quién ve lo importado se comprueba con la sesión de cada persona (`signInAs`), así que RLS y
// las políticas de Storage intervienen de verdad. Vive en `scripts/` porque importa y limpia
// con la clave de servicio, que nunca entra en `src/` (regla 2).
//
// No deja nada: los ids del paquete son deterministas, y `cleanup` borra de los dos clubes sus
// ejercicios, su ficha de medios y los objetos de sus carpetas, antes de empezar (por si una
// ejecución anterior murió) y después de cada test. El test del seed cuenta los ejercicios de
// cada club: por eso no puede quedar ninguno. Con un Supabase que no es local se salta entera.

import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../lib/admin-client";
import { signInAs } from "../lib/user-client";
import { isLocalSupabaseUrl } from "../seed/guard";
import { seedId } from "../seed/ids";
import { ImportError, importPack } from "./import";
import { PACK_FILE } from "./pack";
import { MissingRefsError, contentId } from "./rows";

type Client = SupabaseClient<Database>;

const { url } = readSupabaseEnv();

const BUCKET = "club-media";
const FIXTURE = path.resolve(import.meta.dirname, "fixtures/pack-ejemplo");
const PNG = path.join(FIXTURE, "diagrams/rueda-de-pases-en-estrella.png");
const PACK = "pack-ejemplo";
const K1 = "rueda-de-pases-en-estrella";
const K2 = "dos-contra-uno-en-carrera";
const ARCANGEL = seedId("arcangel", "organization");
const DEMO = seedId("club-demo", "organization");
/** Lo que alguien añade a la ficha en la app y el formato del paquete no lleva. */
const APP_SUMMARY = "Resumen puesto en la app";
const APP_VIDEO = "https://www.youtube.com/watch?v=aaaaaaaaaaa";

/** Los ids que el paquete de ejemplo tiene en un club: sus dos ejercicios y la ficha de la pizarra. */
function ids(org: string) {
  return {
    k1: contentId(org, PACK, `drill:${K1}`),
    k2: contentId(org, PACK, `drill:${K2}`),
    media: contentId(org, PACK, `drill:${K1}:diagram`),
  };
}

/** La carpeta de Storage del primer ejercicio, y el objeto de su pizarra. */
const folderOf = (org: string) => `org/${org}/drills/${ids(org).k1}`;
const objectPath = (org: string, ext = "png") => `${folderOf(org)}/${ids(org).media}.${ext}`;

/**
 * Un cliente que falla al escribir en `table` (`insert` y `upsert`), como si la base rechazara
 * esa escritura. Todo lo demás (las otras tablas, borrar, leer, Storage) pasa al cliente real.
 */
function failingOn(client: Client, table: string): Client {
  const failure = { data: null, error: { message: "fallo provocado" } };
  const passThrough = (target: object, prop: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, prop, target);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop !== "from") return passThrough(target, prop);
      return (name: string) => {
        const builder = (target.from as (relation: string) => object)(name);
        if (name !== table) return builder;
        return new Proxy(builder, {
          get(real, method) {
            if (method === "insert" || method === "upsert") return () => Promise.resolve(failure);
            return passThrough(real, method);
          },
        });
      };
    },
  });
}

describe.skipIf(!isLocalSupabaseUrl(url))("importPack contra Supabase local", () => {
  // Cada caso importa una o varias veces: son decenas de peticiones a la API local.
  vi.setConfig({ testTimeout: 60_000 });

  const admin = createAdminClient();
  const copies: string[] = [];
  let irene: Client;
  let raul: Client;
  let marta: Client;

  /** Una copia del paquete de ejemplo que el test puede cambiar. */
  function copyOfFixture(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "pack-int-"));
    copies.push(dir);
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  }

  /** Reescribe el primer ejercicio del `pack.json` de una copia. */
  function editFirstDrill(dir: string, edit: (drill: Record<string, unknown>) => void): void {
    const file = path.join(dir, PACK_FILE);
    const pack = JSON.parse(readFileSync(file, "utf8")) as { drills: Record<string, unknown>[] };
    edit(pack.drills[0]);
    writeFileSync(file, JSON.stringify(pack), "utf8");
  }

  /** Los nombres de los objetos de la carpeta del primer ejercicio, con la clave de servicio. */
  async function objectsIn(org: string): Promise<string[]> {
    const { data, error } = await admin.storage.from(BUCKET).list(folderOf(org));
    expect(error).toBeNull();
    return (data ?? []).map((object) => object.name);
  }

  /** Los ejercicios del paquete que hay en un club, con la clave de servicio. */
  async function drillsIn(org: string) {
    const { k1, k2 } = ids(org);
    const { data, error } = await admin
      .from("drills")
      .select("id, title, status, created_by, diagram_media_id, summary, video_url, updated_at")
      .in("id", [k1, k2]);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function drill(id: string) {
    const { data, error } = await admin
      .from("drills")
      .select("id, title, status, created_by, diagram_media_id, summary, video_url, updated_at")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error(`No existe el ejercicio ${id}.`);
    return data;
  }

  async function mediaRow(org: string) {
    const { data, error } = await admin
      .from("media_assets")
      .select("id, path, mime, bytes, created_by")
      .eq("id", ids(org).media)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  /** Los puntos de un ejercicio, en su orden. */
  async function pointsOf(drillId: string) {
    const { data, error } = await admin
      .from("drill_coaching_points")
      .select("id, text, is_key, sort")
      .eq("drill_id", drillId)
      .order("sort");
    expect(error).toBeNull();
    return data ?? [];
  }

  async function countOf(
    table: "drill_variants" | "drill_focus_areas" | "drill_principles" | "drill_standards",
    drillId: string,
  ): Promise<number> {
    const { count, error } = await admin
      .from(table)
      .select("drill_id", { count: "exact", head: true })
      .eq("drill_id", drillId);
    expect(error).toBeNull();
    return count ?? 0;
  }

  /** Nada del paquete en un club: ni ejercicios, ni ficha de medios, ni objetos. */
  async function expectNothingIn(org: string): Promise<void> {
    expect(await drillsIn(org)).toEqual([]);
    expect(await mediaRow(org)).toBeNull();
    expect(await objectsIn(org)).toEqual([]);
  }

  /**
   * Lo que hace `save_drill` cuando alguien guarda el ejercicio desde la app: cambia la ficha y
   * sustituye los puntos por otros con ids nuevos en las mismas posiciones. Además pone un
   * resumen y un vídeo y enlaza un Standard del club: nada de eso lo trae el paquete. Devuelve
   * los ids de los puntos nuevos.
   */
  async function savedInApp(drillId: string): Promise<string[]> {
    const edited = await admin
      .from("drills")
      .update({
        title: "Editado en la app",
        diagram_media_id: null,
        summary: APP_SUMMARY,
        video_url: APP_VIDEO,
      })
      .eq("id", drillId);
    expect(edited.error).toBeNull();

    const removed = await admin.from("drill_coaching_points").delete().eq("drill_id", drillId);
    expect(removed.error).toBeNull();
    const points = [0, 1, 2].map((sort) => ({
      id: randomUUID(),
      organization_id: ARCANGEL,
      drill_id: drillId,
      text: `Punto de la app ${sort}`,
      is_key: false,
      sort,
    }));
    const added = await admin.from("drill_coaching_points").insert(points);
    expect(added.error).toBeNull();

    const standard = await admin
      .from("standards")
      .select("id")
      .eq("organization_id", ARCANGEL)
      .limit(1)
      .single();
    expect(standard.error).toBeNull();
    if (!standard.data) throw new Error("Arcángel no tiene Standards: ejecuta `pnpm seed`.");
    const linked = await admin
      .from("drill_standards")
      .insert({ organization_id: ARCANGEL, drill_id: drillId, standard_id: standard.data.id });
    expect(linked.error).toBeNull();

    return points.map((point) => point.id);
  }

  async function cleanup(): Promise<void> {
    for (const org of [ARCANGEL, DEMO]) {
      const { k1, k2, media } = ids(org);
      const drills = await admin.from("drills").delete().in("id", [k1, k2]);
      expect(drills.error).toBeNull();
      const assets = await admin.from("media_assets").delete().eq("id", media);
      expect(assets.error).toBeNull();
      for (const folder of [`org/${org}/drills/${k1}`, `org/${org}/drills/${k2}`]) {
        const { data, error } = await admin.storage.from(BUCKET).list(folder);
        expect(error).toBeNull();
        const paths = (data ?? []).map((object) => `${folder}/${object.name}`);
        if (paths.length > 0) expect((await admin.storage.from(BUCKET).remove(paths)).error).toBeNull();
      }
    }
  }

  beforeAll(async () => {
    [irene, raul, marta] = await Promise.all([
      signInAs("irene@arcangel.test"),
      signInAs("raul@arcangel.test"),
      signInAs("marta@demo.test"),
    ]);
    await cleanup();
  }, 60_000);

  afterEach(async () => {
    await cleanup();
    for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("crea los ejercicios con sus hijos y su pizarra", async () => {
    const report = await importPack({ dir: FIXTURE, club: "arcangel" }, admin);
    const { k1, k2, media } = ids(ARCANGEL);

    expect(report).toEqual({
      club: "arcangel",
      pack: { id: PACK, title: "Paquete de ejemplo" },
      created: [K1, K2],
      skipped: [],
      updated: [],
    });

    expect(await drill(k1)).toMatchObject({
      title: "Rueda de pases en estrella",
      status: "published",
      created_by: null,
      diagram_media_id: media,
    });
    expect((await pointsOf(k1)).map((point) => [point.text, point.is_key])).toEqual([
      ["Manos preparadas antes de recibir", true],
      ["Paso hacia el pase", false],
    ]);
    expect(await countOf("drill_variants", k1)).toBe(1);
    expect(await countOf("drill_focus_areas", k1)).toBe(1);
    expect(await countOf("drill_principles", k1)).toBe(0);

    expect(await drill(k2)).toMatchObject({ status: "draft", created_by: null, diagram_media_id: null });
    expect(await countOf("drill_focus_areas", k2)).toBe(2);
    expect(await countOf("drill_principles", k2)).toBe(1);

    expect(await mediaRow(ARCANGEL)).toEqual({
      id: media,
      path: objectPath(ARCANGEL),
      mime: "image/png",
      bytes: statSync(PNG).size,
      created_by: null,
    });
    expect(await objectsIn(ARCANGEL)).toEqual([`${media}.png`]);
  });

  it("lo publicado lo ve el cuerpo técnico del club, con su pizarra; el borrador, solo dirección; otro club, nada", async () => {
    await importPack({ dir: FIXTURE, club: "arcangel" }, admin);
    const { k1, k2 } = ids(ARCANGEL);
    const visibleTo = async (client: Client) => {
      const { data, error } = await client.from("drills").select("id").in("id", [k1, k2]);
      expect(error).toBeNull();
      return (data ?? []).map((row) => row.id).sort();
    };

    expect(await visibleTo(irene)).toEqual([k1]);
    expect(await visibleTo(raul)).toEqual([k1, k2].sort());
    expect(await visibleTo(marta)).toEqual([]);

    const signed = await irene.storage.from(BUCKET).createSignedUrl(objectPath(ARCANGEL), 60);
    expect(signed.error).toBeNull();
    const response = await fetch(signed.data?.signedUrl ?? "");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const denied = await marta.storage.from(BUCKET).createSignedUrl(objectPath(ARCANGEL), 60);
    expect(denied.error).not.toBeNull();
  });

  it("repetir no cambia nada", async () => {
    await importPack({ dir: FIXTURE, club: "arcangel" }, admin);
    const before = await drillsIn(ARCANGEL);

    const report = await importPack({ dir: FIXTURE, club: "arcangel" }, admin);

    expect(report).toMatchObject({ created: [], skipped: [K1, K2], updated: [] });
    expect(await drillsIn(ARCANGEL)).toEqual(before);
  });

  it("lo editado en la app manda, salvo con update", async () => {
    await importPack({ dir: FIXTURE, club: "arcangel" }, admin);
    const { k1, media } = ids(ARCANGEL);
    const appPoints = await savedInApp(k1);

    await importPack({ dir: FIXTURE, club: "arcangel" }, admin);

    expect((await drill(k1)).title).toBe("Editado en la app");
    expect((await pointsOf(k1)).map((point) => point.id)).toEqual(appPoints);

    const report = await importPack({ dir: FIXTURE, club: "arcangel", update: true }, admin);

    expect(report).toMatchObject({ created: [], skipped: [], updated: [K1, K2] });
    expect(await drill(k1)).toMatchObject({
      title: "Rueda de pases en estrella",
      diagram_media_id: media,
      // El formato del paquete no lleva resumen ni vídeo: los que se pusieron en la app siguen ahí.
      summary: APP_SUMMARY,
      video_url: APP_VIDEO,
    });
    expect((await pointsOf(k1)).map((point) => point.id)).toEqual([
      contentId(ARCANGEL, PACK, `drill:${K1}:point:0`),
      contentId(ARCANGEL, PACK, `drill:${K1}:point:1`),
    ]);
    // El paquete no opina sobre los Standards: el que se enlazó en la app sigue ahí.
    expect(await countOf("drill_standards", k1)).toBe(1);
  });

  it.each(["no-existe", "Arcangel"])("un club que no existe (%s) se dice y no escribe nada", async (club) => {
    const attempt = importPack({ dir: FIXTURE, club }, admin);

    await expect(attempt).rejects.toBeInstanceOf(ImportError);
    await expect(attempt).rejects.toThrow(`No existe el club "${club}".`);
    await expectNothingIn(ARCANGEL);
    await expectNothingIn(DEMO);
  });

  it("si al club le falta algo de lo que el paquete nombra, no escribe nada", async () => {
    let error: unknown;
    try {
      await importPack({ dir: FIXTURE, club: "club-demo" }, admin);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MissingRefsError);
    expect((error as MissingRefsError).missing).toEqual(['el principio "transicion"']);
    await expectNothingIn(DEMO);
  });

  it("si falla a mitad, deshace lo que había creado", async () => {
    const attempt = importPack({ dir: FIXTURE, club: "arcangel" }, failingOn(admin, "drill_variants"));

    await expect(attempt).rejects.toBeInstanceOf(ImportError);
    await expect(attempt).rejects.toThrow(/drill_variants.*fallo provocado/);
    await expectNothingIn(ARCANGEL);
  });

  it("completa sobre los restos de una ejecución cortada", async () => {
    const { k1, media } = ids(ARCANGEL);
    const uploaded = await admin.storage
      .from(BUCKET)
      .upload(objectPath(ARCANGEL), readFileSync(PNG), { contentType: "image/png" });
    expect(uploaded.error).toBeNull();
    const registered = await admin.from("media_assets").insert({
      id: media,
      organization_id: ARCANGEL,
      path: objectPath(ARCANGEL),
      kind: "image",
      mime: "image/png",
      bytes: statSync(PNG).size,
      created_by: null,
    });
    expect(registered.error).toBeNull();

    const report = await importPack({ dir: FIXTURE, club: "arcangel" }, admin);

    expect(report).toMatchObject({ created: [K1, K2], skipped: [], updated: [] });
    expect((await drill(k1)).diagram_media_id).toBe(media);
  });

  it("completa un ejercicio que una ejecución cortada dejó a medias", async () => {
    const { k1, media } = ids(ARCANGEL);
    // Lo que queda si el proceso muere tras escribir la ficha y antes de sus hijos: el ejercicio,
    // sin puntos, sin variantes y sin ningún objetivo de trabajo.
    const bare = await admin.from("drills").insert({
      id: k1,
      organization_id: ARCANGEL,
      title: "Rueda de pases en estrella",
      min_players: 5,
      max_players: 12,
      min_minutes: 8,
      max_minutes: 10,
      min_age: 10,
      status: "published",
      created_by: null,
    });
    expect(bare.error).toBeNull();

    const report = await importPack({ dir: FIXTURE, club: "arcangel" }, admin);

    expect(report).toMatchObject({ created: [K1, K2], skipped: [], updated: [] });
    expect(await drill(k1)).toMatchObject({ status: "published", diagram_media_id: media });
    expect((await pointsOf(k1)).map((point) => point.text)).toEqual([
      "Manos preparadas antes de recibir",
      "Paso hacia el pase",
    ]);
    expect(await countOf("drill_variants", k1)).toBe(1);
    expect(await countOf("drill_focus_areas", k1)).toBe(1);
    expect(await objectsIn(ARCANGEL)).toEqual([`${media}.png`]);
  });

  it("con update, una pizarra de otro tipo sustituye a la anterior y una que ya no está se retira", async () => {
    await importPack({ dir: FIXTURE, club: "arcangel" }, admin);
    const { k1, media } = ids(ARCANGEL);

    const withJpeg = copyOfFixture();
    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff]);
    writeFileSync(path.join(withJpeg, "diagrams/otra.jpg"), jpeg);
    editFirstDrill(withJpeg, (first) => {
      first.diagram = "diagrams/otra.jpg";
    });
    await importPack({ dir: withJpeg, club: "arcangel", update: true }, admin);

    expect(await mediaRow(ARCANGEL)).toMatchObject({
      path: objectPath(ARCANGEL, "jpg"),
      mime: "image/jpeg",
      bytes: 64,
    });
    expect(await objectsIn(ARCANGEL)).toEqual([`${media}.jpg`]);
    expect((await drill(k1)).diagram_media_id).toBe(media);

    const withoutDiagram = copyOfFixture();
    editFirstDrill(withoutDiagram, (first) => {
      delete first.diagram;
    });
    await importPack({ dir: withoutDiagram, club: "arcangel", update: true }, admin);

    expect((await drill(k1)).diagram_media_id).toBeNull();
    expect(await mediaRow(ARCANGEL)).toBeNull();
    expect(await objectsIn(ARCANGEL)).toEqual([]);
  });
});
