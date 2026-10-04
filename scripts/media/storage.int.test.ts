// Integración contra Supabase local: `supabase start`, `.env.local` con las claves, `pnpm seed`
// y `pnpm test:int scripts/media`. Comprueba con la API de Storage de verdad lo que los tests
// de unidad de la acción `uploadDrillDiagram` suponen: que el bucket `club-media` y sus
// políticas (`20261103000200_media_storage.sql`) rechazan lo que tienen que rechazar, y con
// qué errores, porque la acción distingue «sin permiso» de «el bucket no acepta el fichero»
// por ellos.
//
// Vive en `scripts/` y no en `src/modules/media/` porque usa la clave de servicio para
// limpiar, y la clave de servicio nunca entra en `src/` (regla 2).
//
// Cada usuario actúa con su propia sesión (`signInAs`), así que RLS interviene de verdad. Los
// datos son los del seed y sus ids: el borrador «Bloqueo de rebote» (de Irene), el publicado
// «Rebote + outlet» (de Raúl) y «Defensa individual» de Club Demo. Se supone que existen, y
// nada más: `seed.int.test.ts` vuelve a sembrar mientras este fichero corre y cambia
// temporalmente el estado de «Rebote + outlet» (lo archiva), por eso nada de aquí depende de
// que ese ejercicio esté publicado y no archivado, y ningún test escribe en las filas de
// `drills`.
//
// No deja nada: cada ruta se anota antes de intentar subirla y `afterAll` borra todas con la
// clave de servicio, también si una aserción falla; las fichas de `media_assets` que crea el
// test, igual. Los nombres son uuid nuevos, así que no dependen de restos de una ejecución
// anterior. Con un Supabase que no es local se salta entera: no escribe nunca en un remoto.

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../lib/admin-client";
import { signInAs } from "../lib/user-client";
import { isLocalSupabaseUrl } from "../seed/guard";
import { seedId } from "../seed/ids";

const { url } = readSupabaseEnv();
/** `readSupabaseEnv` ya cargó `.env.local`. La clave publicable es la de un cliente sin sesión. */
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const BUCKET = "club-media";
const ARCANGEL = seedId("arcangel", "organization");
const DEMO = seedId("club-demo", "organization");
/** «Bloqueo de rebote»: el único borrador del seed, de Irene. */
const DRAFT = seedId("arcangel", "drill:bloqueo-de-rebote");
/** «Rebote + outlet»: publicado, de Raúl. */
const PUBLISHED = seedId("arcangel", "drill:rebote-outlet");
/** «Defensa individual» de Club Demo, publicado, de Marta. */
const DEMO_DRILL = seedId("club-demo", "drill:defensa-individual");

const MIB = 1024 * 1024;

/**
 * Una imagen PNG que lo es solo por la cabecera: la firma de 8 bytes y relleno. El bucket mira
 * el tipo declarado y el tamaño, no los píxeles.
 */
function pngOf(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/** La ruta de un objeto nuevo en la carpeta de un ejercicio, con la forma que exige la política. */
const pathIn = (org: string, drill: string, name = `${randomUUID()}.png`) =>
  `org/${org}/drills/${drill}/${name}`;

/** Rutas que no son `org/<club>/drills/<ejercicio>/<uuid>.<png|jpg|webp>`, cada una con su defecto. */
const BAD_PATHS: Array<[string, (org: string, drill: string) => string]> = [
  ["un nombre que no es un uuid", (org, drill) => pathIn(org, drill, "diagrama.png")],
  ["una extensión que no es png, jpg ni webp", (org, drill) => pathIn(org, drill, `${randomUUID()}.gif`)],
  ["una subcarpeta más", (org, drill) => `${pathIn(org, drill, "extra")}/${randomUUID()}.png`],
  ["un ejercicio que no existe", (org) => pathIn(org, randomUUID())],
  ["otra carpeta de primer nivel", (org, drill) => `org/${org}/otra/${drill}/${randomUUID()}.png`],
];

describe.skipIf(!isLocalSupabaseUrl(url))("Storage de club-media contra Supabase local", () => {
  const admin = createAdminClient();
  /** Toda ruta que algún test intenta subir, para que `afterAll` la borre haya salido bien o no. */
  const attempted: string[] = [];
  /** Los `path` de las fichas de `media_assets` que crea el test. */
  const registered: string[] = [];

  let irene: SupabaseClient<Database>;
  let raul: SupabaseClient<Database>;
  let alex: SupabaseClient<Database>;
  let marta: SupabaseClient<Database>;
  /** Un cliente con la clave publicable y sin iniciar sesión: lo que haría quien no es de nadie. */
  const anonymous = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** Sube `body` a `path` como lo hace la acción: con el tipo detectado y sin pisar nada. */
  async function upload(
    client: SupabaseClient<Database>,
    path: string,
    body: Uint8Array,
    contentType = "image/png",
    upsert = false,
  ) {
    attempted.push(path);
    return client.storage.from(BUCKET).upload(path, body, { contentType, upsert });
  }

  /** ¿Hay un objeto en `path`? Se pregunta con la clave de servicio, que no pasa por las políticas. */
  async function stored(path: string) {
    const slash = path.lastIndexOf("/");
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(path.slice(0, slash), { search: path.slice(slash + 1) });
    expect(error).toBeNull();
    return data ?? [];
  }

  beforeAll(async () => {
    [irene, raul, alex, marta] = await Promise.all([
      signInAs("irene@arcangel.test"),
      signInAs("raul@arcangel.test"),
      signInAs("alex@arcangel.test"),
      signInAs("marta@demo.test"),
    ]);

    // Lo único que se da por sembrado: que existan los tres ejercicios.
    const { data: drills, error } = await admin
      .from("drills")
      .select("id")
      .in("id", [DRAFT, PUBLISHED, DEMO_DRILL]);
    expect(error).toBeNull();
    if (drills?.length !== 3) {
      throw new Error("Faltan ejercicios del seed: ejecuta `pnpm seed` antes de `pnpm test:int`.");
    }
  }, 60_000);

  afterAll(async () => {
    if (attempted.length > 0) {
      const { error } = await admin.storage.from(BUCKET).remove(attempted);
      expect(error).toBeNull();
    }
    if (registered.length > 0) {
      const { error } = await admin.from("media_assets").delete().in("path", registered);
      expect(error).toBeNull();
    }
  });

  describe("subir el diagrama de un borrador", () => {
    it("Irene, su autora, sube un PNG de 1 KB", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await upload(irene, path, pngOf(1024));

      expect(error).toBeNull();
      expect(data?.path).toBe(path);
      const [object] = await stored(path);
      expect(object.metadata).toMatchObject({ size: 1024, mimetype: "image/png" });
    });

    it("el bucket rechaza un SVG (image/svg+xml): 415, y no guarda nada", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await upload(irene, path, SVG, "image/svg+xml");

      expect(data).toBeNull();
      // La acción reconoce «el bucket no acepta el fichero» por estos campos: el `status`
      // HTTP de todos los errores de Storage es 400, no distingue nada.
      expect(error).toMatchObject({ statusCode: "415", code: "InvalidMimeType" });
      expect(await stored(path)).toEqual([]);
    });

    it("el bucket rechaza un PNG de 3 MB: 413, y no guarda nada", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await upload(irene, path, pngOf(3 * MIB));

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "413", code: "EntityTooLarge" });
      expect(await stored(path)).toEqual([]);
    });

    it("el límite está en 2 MiB: uno más se rechaza y 2 MiB justos entran", async () => {
      const over = pathIn(ARCANGEL, DRAFT);
      const exact = pathIn(ARCANGEL, DRAFT);

      const rejected = await upload(irene, over, pngOf(2 * MIB + 1));
      const accepted = await upload(irene, exact, pngOf(2 * MIB));

      expect(rejected.error).toMatchObject({ statusCode: "413" });
      expect(accepted.error).toBeNull();
    });

    it("JPEG y WebP entran con su tipo", async () => {
      const jpg = pathIn(ARCANGEL, DRAFT, `${randomUUID()}.jpg`);
      const webp = pathIn(ARCANGEL, DRAFT, `${randomUUID()}.webp`);

      expect((await upload(irene, jpg, pngOf(64), "image/jpeg")).error).toBeNull();
      expect((await upload(irene, webp, pngOf(64), "image/webp")).error).toBeNull();
    });

    it("un objeto no se pisa: ni con upsert false (409) ni con upsert true (no hay política update)", async () => {
      const path = pathIn(ARCANGEL, DRAFT);
      expect((await upload(irene, path, pngOf(1024))).error).toBeNull();

      const again = await upload(irene, path, pngOf(2048));
      const overwrite = await upload(irene, path, pngOf(2048), "image/png", true);

      expect(again.error).toMatchObject({ statusCode: "409", code: "KeyAlreadyExists" });
      expect(overwrite.error).not.toBeNull();
      const [object] = await stored(path);
      expect(object.metadata).toMatchObject({ size: 1024 });
    });

    it.each(BAD_PATHS)("Irene no sube a una ruta con %s", async (_name, build) => {
      const path = build(ARCANGEL, DRAFT);

      const { data, error } = await upload(irene, path, pngOf(64));

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "403", code: "AccessDenied" });
    });

    it("Irene no sube a un ejercicio de Club Demo escribiendo la ruta de Arcángel, ni al revés", async () => {
      const mixedUp = pathIn(ARCANGEL, DEMO_DRILL);
      const other = pathIn(DEMO, DRAFT);

      expect((await upload(irene, mixedUp, pngOf(64))).error).toMatchObject({ statusCode: "403" });
      expect((await upload(irene, other, pngOf(64))).error).toMatchObject({ statusCode: "403" });
    });
  });

  describe("quién no puede subir", () => {
    it("Álex, otro entrenador del club, no sube a la carpeta del borrador de Irene", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await upload(alex, path, pngOf(1024));

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "403", code: "AccessDenied" });
      expect(await stored(path)).toEqual([]);
    });

    it("Álex no sube a la carpeta de un ejercicio publicado de su club: eso solo lo edita la dirección", async () => {
      const path = pathIn(ARCANGEL, PUBLISHED);

      const { data, error } = await upload(alex, path, pngOf(1024));

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "403", code: "AccessDenied" });
      expect(await stored(path)).toEqual([]);
    });

    it("Álex no sube a org/{Club Demo}/drills/…, ni con un ejercicio de Club Demo ni con uno de Arcángel", async () => {
      const own = pathIn(DEMO, DEMO_DRILL);
      const crossed = pathIn(DEMO, DRAFT);

      expect((await upload(alex, own, pngOf(1024))).error).toMatchObject({ statusCode: "403" });
      expect((await upload(alex, crossed, pngOf(1024))).error).toMatchObject({ statusCode: "403" });
      expect(await stored(own)).toEqual([]);
      expect(await stored(crossed)).toEqual([]);
    });

    it("Marta, entrenadora de Club Demo, no sube a ningún ejercicio de Arcángel", async () => {
      for (const drill of [DRAFT, PUBLISHED]) {
        const path = pathIn(ARCANGEL, drill);

        const { error } = await upload(marta, path, pngOf(1024));

        expect(error, drill).toMatchObject({ statusCode: "403", code: "AccessDenied" });
        expect(await stored(path)).toEqual([]);
      }
    });

    it("Raúl, que es dirección de Arcángel, no sube a un club que no es el suyo", async () => {
      const path = pathIn(DEMO, DEMO_DRILL);

      const { error } = await upload(raul, path, pngOf(1024));

      expect(error).toMatchObject({ statusCode: "403", code: "AccessDenied" });
      expect(await stored(path)).toEqual([]);
    });

    it("sin sesión no se sube nada", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await upload(anonymous, path, pngOf(1024));

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(await stored(path)).toEqual([]);
    });

    it("Álex no borra un objeto de Irene: no encuentra nada que borrar y el objeto sigue ahí", async () => {
      const path = pathIn(ARCANGEL, DRAFT);
      expect((await upload(irene, path, pngOf(1024))).error).toBeNull();

      const { data, error } = await alex.storage.from(BUCKET).remove([path]);

      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await stored(path)).toHaveLength(1);
    });
  });

  describe("quién sí puede subir", () => {
    it("Raúl, la dirección, sube a la carpeta de un ejercicio publicado", async () => {
      const path = pathIn(ARCANGEL, PUBLISHED);

      const { error } = await upload(raul, path, pngOf(1024));

      expect(error).toBeNull();
      expect(await stored(path)).toHaveLength(1);
    });

    it("Raúl sube también a la carpeta del borrador de Irene, y puede borrar lo que hay", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      expect((await upload(raul, path, pngOf(1024))).error).toBeNull();
      const { data, error } = await raul.storage.from(BUCKET).remove([path]);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(await stored(path)).toEqual([]);
    });
  });

  describe("leer el diagrama de un borrador", () => {
    const path = pathIn(ARCANGEL, DRAFT);
    const folder = `org/${ARCANGEL}/drills/${DRAFT}`;

    beforeAll(async () => {
      const { error } = await upload(irene, path, pngOf(1024));
      expect(error).toBeNull();
    });

    it("Irene, su autora, firma una URL y con ella se descarga la imagen", async () => {
      const { data, error } = await irene.storage.from(BUCKET).createSignedUrl(path, 600);

      expect(error).toBeNull();
      expect(data?.signedUrl).toMatch(/\/object\/sign\/club-media\/.+\?token=/);
      const response = await fetch(data?.signedUrl ?? "");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect((await response.arrayBuffer()).byteLength).toBe(1024);
    });

    it("Raúl, la dirección, también la firma", async () => {
      const { data, error } = await raul.storage.from(BUCKET).createSignedUrl(path, 600);

      expect(error).toBeNull();
      expect(data?.signedUrl).toContain("token=");
    });

    it("Álex, otro entrenador del club, no la firma: el borrador no es suyo y para él el objeto no existe", async () => {
      const { data, error } = await alex.storage.from(BUCKET).createSignedUrl(path, 600);

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "404", code: "NoSuchKey" });
    });

    it("Marta, de otro club, tampoco", async () => {
      const { data, error } = await marta.storage.from(BUCKET).createSignedUrl(path, 600);

      expect(data).toBeNull();
      expect(error).toMatchObject({ statusCode: "404", code: "NoSuchKey" });
    });

    it("un objeto que no existe da el mismo error que uno que no se puede ver", async () => {
      const { error } = await irene.storage.from(BUCKET).createSignedUrl(pathIn(ARCANGEL, DRAFT), 600);

      expect(error).toMatchObject({ statusCode: "404", code: "NoSuchKey" });
    });

    it("Álex, listando la carpeta del borrador, no ve nada; Irene y Raúl ven el objeto", async () => {
      const name = path.slice(path.lastIndexOf("/") + 1);

      const asAlex = await alex.storage.from(BUCKET).list(folder);
      const asMarta = await marta.storage.from(BUCKET).list(folder);
      const asIrene = await irene.storage.from(BUCKET).list(folder);
      const asRaul = await raul.storage.from(BUCKET).list(folder);

      expect(asAlex).toEqual({ data: [], error: null });
      expect(asMarta).toEqual({ data: [], error: null });
      expect(asIrene.data?.map((object) => object.name)).toContain(name);
      expect(asRaul.data?.map((object) => object.name)).toContain(name);
    });

    it("sin sesión no se firma", async () => {
      const { data, error } = await anonymous.storage.from(BUCKET).createSignedUrl(path, 600);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  describe("la ficha en media_assets, tal como la inserta la acción", () => {
    /** El insert de la acción: el club, la ruta, el tipo y los bytes; lo demás son valores por defecto. */
    function row(path: string) {
      registered.push(path);
      return {
        organization_id: ARCANGEL,
        path,
        kind: "image",
        mime: "image/png",
        bytes: 1024,
      } as const;
    }

    it("Irene registra la suya y recibe el id de vuelta (insert … returning)", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await irene.from("media_assets").insert(row(path)).select("id").single();

      expect(error).toBeNull();
      expect(data?.id).toMatch(/^[0-9a-f-]{36}$/);
      const { data: saved } = await admin
        .from("media_assets")
        .select("bucket, kind, mime, bytes, contains_minor, created_by")
        .eq("path", path)
        .single();
      expect(saved).toMatchObject({
        bucket: BUCKET,
        kind: "image",
        mime: "image/png",
        bytes: 1024,
        contains_minor: false,
      });
      expect(saved?.created_by).not.toBeNull();
    });

    it("Álex no registra una ficha en la carpeta del borrador de Irene", async () => {
      const path = pathIn(ARCANGEL, DRAFT);

      const { data, error } = await alex.from("media_assets").insert(row(path)).select("id").single();

      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("Irene no registra una ficha a nombre de otro", async () => {
      const path = pathIn(ARCANGEL, DRAFT);
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const raulId = users?.users.find((user) => user.email === "raul@arcangel.test")?.id;

      const { error } = await irene
        .from("media_assets")
        .insert({ ...row(path), created_by: raulId });

      expect(error?.code).toBe("42501");
    });
  });
});
