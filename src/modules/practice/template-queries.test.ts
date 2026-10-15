import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { TEMPLATE_LIMIT, getTemplate, listTemplates } from "./template-queries";

// ── Un doble pequeño de Supabase ─────────────────────────────────────────────────────────
// Lo justo para estas lecturas: `auth.getClaims()` dice quién tiene la sesión y `from()` responde
// con lo que el test prepara, apuntando lo que se le pidió. No aplica los filtros: los tests
// comprueban cuáles viajan (el club, que es una plantilla y de quién) y qué sale de lo que vuelve.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

type Failure = { name: string; code: string; message: string };
type Reply = { data: unknown; error: Failure | null };
type Claims = { data: { claims: { sub?: string } } | null; error: Failure | null };
type Call = { method: string; args: unknown[] };

class FakeQuery implements PromiseLike<Reply> {
  readonly calls: Call[] = [];

  constructor(
    readonly table: string,
    private readonly reply: Reply,
  ) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select = (...args: unknown[]) => this.record("select", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  is = (...args: unknown[]) => this.record("is", args);
  order = (...args: unknown[]) => this.record("order", args);
  limit = (...args: unknown[]) => this.record("limit", args);
  maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);

  then<A = Reply, B = never>(
    onfulfilled?: ((value: Reply) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(onfulfilled, onrejected);
  }

  /** Los argumentos de cada llamada a `method`, en orden. */
  sent(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }
}

class FakeDb {
  readonly queries: FakeQuery[] = [];
  /** Cuántas veces se preguntó quién tiene la sesión. */
  claimsAsked = 0;

  constructor(
    private readonly claims: Claims,
    private readonly replies: Reply[],
  ) {}

  readonly auth = {
    getClaims: async (): Promise<Claims> => {
      this.claimsAsked += 1;
      return this.claims;
    },
  };

  from(table: string): FakeQuery {
    const reply = this.replies.shift();
    if (!reply) throw new Error(`lectura de «${table}» sin respuesta preparada`);

    const query = new FakeQuery(table, reply);
    this.queries.push(query);
    return query;
  }
}

const ctx = clubContext("coach");
const ORG = ctx.org.id;
const USER = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const T1 = "00000000-0000-4000-8000-0000000000c1";
const T2 = "00000000-0000-4000-8000-0000000000c2";
const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";

const reply = (data: unknown): Reply => ({ data, error: null });
const failure = (code = "XX000"): Failure => ({
  name: "PostgrestError",
  code,
  message: 'fila con "texto del club"',
});

/** Hay sesión: las claims comprobadas llevan el id de la persona. */
const signedIn: Claims = { data: { claims: { sub: USER } }, error: null };
/** No hay sesión: `getClaims` no devuelve nada, sin error. */
const signedOut: Claims = { data: null, error: null };

function useDb(claims: Claims, ...replies: Reply[]): FakeDb {
  const db = new FakeDb(claims, replies);
  mocks.createClient.mockResolvedValue(db);
  return db;
}

type TemplateRow = {
  id: string;
  title: string;
  primary_focus: unknown;
  secondary_focus: unknown;
  practice_items: Array<{ minutes: number }> | null;
};

/** Una plantilla como la devuelve PostgREST. */
function templateRow(overrides: Partial<TemplateRow> = {}): TemplateRow {
  return {
    id: T1,
    title: "Defensa en transición",
    primary_focus: { id: F1, name: "Objetivo A" },
    secondary_focus: null,
    practice_items: [{ minutes: 10 }, { minutes: 20 }, { minutes: 15 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── listTemplates ────────────────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  it("sin sesión no hay ninguna, y no consulta", async () => {
    const db = useDb(signedOut);

    await expect(listTemplates(ctx)).resolves.toEqual([]);

    expect(db.claimsAsked).toBe(1);
    expect(db.queries).toEqual([]);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("unas claims sin id de persona son como no tener sesión", async () => {
    const db = useDb({ data: { claims: {} }, error: null });

    await expect(listTemplates(ctx)).resolves.toEqual([]);

    expect(db.queries).toEqual([]);
  });

  it("lee las plantillas de este club de quien tiene la sesión: sin equipo y marcadas como tales", async () => {
    const db = useDb(signedIn, reply([]));

    await listTemplates(ctx);

    expect(db.queries).toHaveLength(1);
    const [query] = db.queries;
    expect(query.table).toBe("practice_plans");
    expect(query.sent("eq")).toEqual([
      ["organization_id", ORG],
      ["is_template", true],
      ["created_by", USER],
    ]);
    expect(query.sent("is")).toEqual([["team_id", null]]);
    expect(query.sent("maybeSingle")).toEqual([]);
  });

  it("por título, con el id para desempatar y el tope de plantillas", async () => {
    const db = useDb(signedIn, reply([]));

    await listTemplates(ctx);

    const [query] = db.queries;
    expect(query.sent("order")).toEqual([
      ["title", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(query.sent("limit")).toEqual([[TEMPLATE_LIMIT]]);
    expect(TEMPLATE_LIMIT).toBe(50);
  });

  it("pide el título, los dos objetivos por su clave foránea y los minutos de los ejercicios", async () => {
    const db = useDb(signedIn, reply([]));

    await listTemplates(ctx);

    const [[columns]] = db.queries[0].sent("select");
    for (const column of [
      "id, title",
      "primary_focus:focus_areas!practice_plans_organization_id_primary_focus_id_fkey(id, name)",
      "secondary_focus:focus_areas!practice_plans_organization_id_secondary_focus_id_fkey(id, name)",
      "practice_items(minutes)",
    ]) {
      expect(String(columns)).toContain(column);
    }
  });

  it("de cada plantilla sale lo que dura, cuántos ejercicios tiene y sus objetivos", async () => {
    useDb(
      signedIn,
      reply([
        templateRow(),
        templateRow({
          id: T2,
          title: "Rebote",
          primary_focus: { id: F1, name: "Objetivo A" },
          secondary_focus: { id: F2, name: "Objetivo B" },
          practice_items: [{ minutes: 30 }],
        }),
      ]),
    );

    const templates = await listTemplates(ctx);

    expect(templates).toStrictEqual([
      {
        id: T1,
        title: "Defensa en transición",
        totalMinutes: 45,
        itemCount: 3,
        primaryFocus: { id: F1, name: "Objetivo A" },
        secondaryFocus: null,
      },
      {
        id: T2,
        title: "Rebote",
        totalMinutes: 30,
        itemCount: 1,
        primaryFocus: { id: F1, name: "Objetivo A" },
        secondaryFocus: { id: F2, name: "Objetivo B" },
      },
    ]);
  });

  it("respeta el orden en que llegan", async () => {
    useDb(signedIn, reply([templateRow({ id: T2, title: "B" }), templateRow({ id: T1, title: "A" })]));

    const templates = await listTemplates(ctx);

    expect(templates.map((template) => template.id)).toEqual([T2, T1]);
  });

  it("valen los objetivos como objeto o como lista de un elemento", async () => {
    useDb(
      signedIn,
      reply([
        templateRow({
          primary_focus: [{ id: F1, name: "Objetivo A" }],
          secondary_focus: [{ id: F2, name: "Objetivo B" }],
        }),
      ]),
    );

    const [template] = await listTemplates(ctx);

    expect(template.primaryFocus).toEqual({ id: F1, name: "Objetivo A" });
    expect(template.secondaryFocus).toEqual({ id: F2, name: "Objetivo B" });
  });

  it("un objetivo que no llega (null o lista vacía) queda en null", async () => {
    useDb(signedIn, reply([templateRow({ primary_focus: [], secondary_focus: null })]));

    const [template] = await listTemplates(ctx);

    expect(template.primaryFocus).toBeNull();
    expect(template.secondaryFocus).toBeNull();
  });

  it("de un objetivo solo salen su id y su nombre", async () => {
    useDb(
      signedIn,
      reply([templateRow({ primary_focus: { id: F1, name: "Objetivo A", slug: "objetivo-a", sort: 10 } })]),
    );

    const [template] = await listTemplates(ctx);

    expect(template.primaryFocus).toStrictEqual({ id: F1, name: "Objetivo A" });
  });

  it.each([
    ["sin ejercicios", []],
    ["cuyos ejercicios no llegan", null],
  ])("una plantilla %s dura 0 min y tiene 0 ejercicios", async (_name, items) => {
    useDb(signedIn, reply([templateRow({ practice_items: items })]));

    const [template] = await listTemplates(ctx);

    expect(template).toMatchObject({ totalMinutes: 0, itemCount: 0 });
  });

  it("sin plantillas, una lista vacía", async () => {
    useDb(signedIn, reply([]));

    await expect(listTemplates(ctx)).resolves.toEqual([]);
  });

  it("un error de la lectura lanza y se registra, sin el mensaje de la base de datos", async () => {
    const error = failure();
    useDb(signedIn, { data: null, error });

    const thrown: unknown = await listTemplates(ctx).catch((caught: unknown) => caught);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("practice.templates: no se pudo leer de la base de datos");
    expect(String(thrown)).not.toContain("texto del club");
    expect(mocks.logError.mock.calls).toEqual([["practice.templates", error]]);
  });

  it("si no se puede saber quién tiene la sesión lanza y se registra, sin consultar", async () => {
    const error = failure("bad_jwt");
    const db = useDb({ data: null, error });

    await expect(listTemplates(ctx)).rejects.toThrow(
      "practice.template-viewer: no se pudo leer de la base de datos",
    );

    expect(mocks.logError.mock.calls).toEqual([["practice.template-viewer", error]]);
    expect(db.queries).toEqual([]);
  });
});

// ── getTemplate ──────────────────────────────────────────────────────────────────────────

describe("getTemplate", () => {
  it("un id que no es un uuid es null sin consultar nada, ni la sesión", async () => {
    const db = useDb(signedIn, reply(templateRow()));

    await expect(getTemplate(ctx, "no-es-un-uuid")).resolves.toBeNull();

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(db.claimsAsked).toBe(0);
    expect(db.queries).toEqual([]);
  });

  it("sin sesión es null, y no consulta", async () => {
    const db = useDb(signedOut);

    await expect(getTemplate(ctx, T1)).resolves.toBeNull();

    expect(db.claimsAsked).toBe(1);
    expect(db.queries).toEqual([]);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("lee esa plantilla de este club, de quien tiene la sesión, sin equipo y marcada como tal", async () => {
    const db = useDb(signedIn, reply(templateRow()));

    await getTemplate(ctx, T1);

    expect(db.queries).toHaveLength(1);
    const [query] = db.queries;
    expect(query.table).toBe("practice_plans");
    expect(query.sent("eq")).toEqual([
      ["organization_id", ORG],
      ["id", T1],
      ["is_template", true],
      ["created_by", USER],
    ]);
    expect(query.sent("is")).toEqual([["team_id", null]]);
    expect(query.sent("maybeSingle")).toHaveLength(1);
  });

  it("pide las mismas columnas que la lista", async () => {
    const list = useDb(signedIn, reply([]));
    await listTemplates(ctx);
    const one = useDb(signedIn, reply(null));
    await getTemplate(ctx, T1);

    expect(one.queries[0].sent("select")).toEqual(list.queries[0].sent("select"));
  });

  it("devuelve la plantilla con lo que dura, cuántos ejercicios tiene y sus objetivos", async () => {
    useDb(
      signedIn,
      reply(
        templateRow({
          primary_focus: [{ id: F1, name: "Objetivo A" }],
          secondary_focus: { id: F2, name: "Objetivo B" },
        }),
      ),
    );

    const template = await getTemplate(ctx, T1);

    expect(template).toStrictEqual({
      id: T1,
      title: "Defensa en transición",
      totalMinutes: 45,
      itemCount: 3,
      primaryFocus: { id: F1, name: "Objetivo A" },
      secondaryFocus: { id: F2, name: "Objetivo B" },
    });
  });

  it("una plantilla sin objetivos ni ejercicios", async () => {
    useDb(signedIn, reply(templateRow({ primary_focus: null, secondary_focus: [], practice_items: null })));

    const template = await getTemplate(ctx, T1);

    expect(template).toStrictEqual({
      id: T1,
      title: "Defensa en transición",
      totalMinutes: 0,
      itemCount: 0,
      primaryFocus: null,
      secondaryFocus: null,
    });
  });

  it("si la fila no llega (no existe, es de otro club, de otra persona o no es una plantilla) es null", async () => {
    useDb(signedIn, reply(null));

    await expect(getTemplate(ctx, T1)).resolves.toBeNull();

    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("acepta un uuid en mayúsculas", async () => {
    const db = useDb(signedIn, reply(null));

    await getTemplate(ctx, T1.toUpperCase());

    expect(db.queries).toHaveLength(1);
  });

  it("un error de la lectura lanza y se registra", async () => {
    const error = failure();
    useDb(signedIn, { data: null, error });

    await expect(getTemplate(ctx, T1)).rejects.toThrow(
      "practice.template: no se pudo leer de la base de datos",
    );

    expect(mocks.logError.mock.calls).toEqual([["practice.template", error]]);
  });

  it("si no se puede saber quién tiene la sesión lanza y se registra, sin consultar", async () => {
    const error = failure("bad_jwt");
    const db = useDb({ data: null, error });

    await expect(getTemplate(ctx, T1)).rejects.toThrow(
      "practice.template-viewer: no se pudo leer de la base de datos",
    );

    expect(mocks.logError.mock.calls).toEqual([["practice.template-viewer", error]]);
    expect(db.queries).toEqual([]);
  });
});
