// Un doble mínimo de la base de datos para los tests de las lecturas de cualquier módulo
// (`methodology/queries.test.ts`, `methodology/admin-queries.test.ts`, `drills/queries.test.ts`).
// Solo lo importan tests.
//
// Es el mismo enfoque que el de `src/modules/home/queries.test.ts`: no ejecuta SQL ni mira la
// cadena del `select` (de eso se encarga el tipado de supabase-js contra `Database`, que
// `pnpm typecheck` comprueba). Guarda filas ya con la forma que devuelve PostgREST y aplica de
// verdad los filtros y el orden que pide la consulta, y apunta qué filtros llegaron. Así un
// test ve qué filas salen: una consulta que pierde su filtro de club o de estado deja pasar
// filas de otro club o borradores, y el test falla.
//
// Entiende `eq`, `in`, `order` y `limit`, también sobre una tabla anidada (`tabla.columna`), y que
// `tabla!inner(...)` en el `select` deja solo las filas con alguna fila anidada que cumpla los
// filtros de esa tabla (el único dato que lee de la cadena del `select`).
//
// Además de tablas, simula las funciones SQL que se llaman con `rpc()` (`search_drills`): su
// «tabla» es la clave con el nombre de la función, y no filtra, devuelve las filas tal cual
// las dejó el test, porque la función ya se prueba en la base de datos (pgTAP).
//
// Las filas de cada módulo (`sectionRow`, `drillRow`…) las pone cada módulo en sus tests; aquí
// solo está lo que sirve a todos.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

import { clubContext } from "@/modules/tenancy/test-support";

export type Row = Record<string, unknown>;
export type Failure = { name: string; code: string; message: string };

type Result = { data: Row[] | Row | null; count: number | null; error: Failure | null };
type Sort = { column: string; ascending: boolean };

/**
 * Lo que pidió una consulta. `embedded` es lo pedido sobre una tabla anidada (`tabla.columna`).
 * `in` son las listas de valores de `in()`, y solo está si la consulta lo usó. `args` son los
 * argumentos de un `rpc()` (`table` es el nombre de la función) y `limit` el tope de filas, si
 * lo hubo.
 */
export type Call = {
  table: string;
  eq: Record<string, unknown>;
  order: string[];
  embedded: Record<
    string,
    { eq: Record<string, unknown>; order: string[]; in?: Record<string, readonly unknown[]> }
  >;
  in?: Record<string, readonly unknown[]>;
  args?: Record<string, unknown>;
  limit?: number;
};

/** Más de una fila donde `maybeSingle` espera una: lo que responde PostgREST. */
const SEVERAL_ROWS: Failure = {
  name: "PostgrestError",
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
};

/** Los números se comparan como números; lo demás (ids, fechas ISO) como texto. */
function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortRows(rows: Row[], sorts: Sort[]): Row[] {
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of sorts) {
      const order = compare(a[column], b[column]);
      if (order !== 0) return ascending ? order : -order;
    }
    return 0;
  });
}

class FakeQuery implements PromiseLike<Result> {
  private readonly call: Call;
  private readonly filters: Array<(row: Row) => boolean> = [];
  private readonly sorts: Sort[] = [];
  private readonly embeddedFilters: Record<string, Array<(row: Row) => boolean>> = {};
  private readonly embeddedSorts: Record<string, Sort[]> = {};
  private readonly inner = new Set<string>();
  private head = false;
  private max: number | null = null;

  constructor(
    table: string,
    private readonly rows: Row[],
    private readonly failure: Failure | null,
    calls: Call[],
    args?: Record<string, unknown>,
  ) {
    this.call = { table, eq: {}, order: [], embedded: {}, ...(args && { args }) };
    calls.push(this.call);
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    this.head = options?.head === true;
    // Sin `!inner` una tabla anidada que no cumple el filtro solo se queda vacía; con él, la
    // fila de la consulta deja de salir (es un `inner join`).
    for (const [, table] of (columns ?? "").matchAll(/(\w+)!inner\(/g)) this.inner.add(table);
    return this;
  }

  /** `eq("tabla.columna", valor)` filtra las filas anidadas de `tabla`, no las de la consulta. */
  eq(column: string, value: unknown) {
    const dot = column.indexOf(".");
    if (dot === -1) {
      this.call.eq[column] = value;
      this.filters.push((row) => row[column] === value);
      return this;
    }

    const table = column.slice(0, dot);
    const name = column.slice(dot + 1);
    this.embedded(table).eq[name] = value;
    (this.embeddedFilters[table] ??= []).push((row) => row[name] === value);
    return this;
  }

  /** `in("tabla.columna", valores)` filtra las filas anidadas de `tabla`, como `eq`. */
  in(column: string, values: readonly unknown[]) {
    const dot = column.indexOf(".");
    if (dot === -1) {
      (this.call.in ??= {})[column] = values;
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }

    const table = column.slice(0, dot);
    const name = column.slice(dot + 1);
    (this.embedded(table).in ??= {})[name] = values;
    (this.embeddedFilters[table] ??= []).push((row) => values.includes(row[name]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
    const sort = { column, ascending: options?.ascending ?? true };
    if (options?.referencedTable) {
      this.embedded(options.referencedTable).order.push(column);
      (this.embeddedSorts[options.referencedTable] ??= []).push(sort);
      return this;
    }
    this.call.order.push(column);
    this.sorts.push(sort);
    return this;
  }

  limit(count: number) {
    this.call.limit = count;
    this.max = count;
    return this;
  }

  maybeSingle() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    if (data && data.length > 1) return Promise.resolve({ data: null, error: SEVERAL_ROWS });
    return Promise.resolve({ data: data?.[0] ?? null, error: null });
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const { data, error } = this.run();
    const count = this.head && data ? data.length : null;
    return Promise.resolve({ data: this.head ? null : data, count, error }).then(
      onfulfilled,
      onrejected,
    );
  }

  private embedded(table: string) {
    return (this.call.embedded[table] ??= { eq: {}, order: [] });
  }

  private run(): { data: Row[] | null; error: Failure | null } {
    if (this.failure) return { data: null, error: this.failure };

    const matching = this.rows.filter(
      (row) =>
        this.filters.every((filter) => filter(row)) &&
        [...this.inner].every((table) => this.nested(row, table).length > 0),
    );
    const sorted = sortRows(matching, this.sorts);
    const data = (this.max === null ? sorted : sorted.slice(0, this.max)).map((row) =>
      this.withEmbedded(row),
    );
    return { data, error: null };
  }

  /** Las filas de `table` anidadas en `row` que cumplen los filtros de esa tabla. */
  private nested(row: Row, table: string): Row[] {
    const nested = row[table];
    if (!Array.isArray(nested)) return [];
    return (nested as Row[]).filter((item) =>
      (this.embeddedFilters[table] ?? []).every((filter) => filter(item)),
    );
  }

  /** Las filas anidadas que pide la consulta, ya filtradas y ordenadas; el resto de la fila igual. */
  private withEmbedded(row: Row): Row {
    const result = { ...row };
    for (const table of Object.keys(this.call.embedded)) {
      if (!Array.isArray(row[table])) continue;
      result[table] = sortRows(this.nested(row, table), this.embeddedSorts[table] ?? []);
    }
    return result;
  }
}

/** Las filas de cada tabla, por nombre. Una tabla que no está se lee vacía. */
export type Store = Record<string, Row[]>;

/**
 * Un cliente que lee de `store`. `failing` hace que las lecturas de una tabla (o de una función
 * llamada con `rpc`) devuelvan ese error. `calls` guarda lo que pidió cada consulta, en el orden
 * en que se hicieron.
 */
export function fakeSupabase(store: Store, failing: Record<string, Failure> = {}) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => new FakeQuery(table, store[table] ?? [], failing[table] ?? null, calls),
    rpc: (name: string, args: Record<string, unknown>) =>
      new FakeQuery(name, store[name] ?? [], failing[name] ?? null, calls, args),
  };
  return { client, calls };
}

// ── El escenario común de los tests de lecturas ──────────────────────────────────────────

/** Quien consulta: un entrenador de `club-a`. */
export const CTX = clubContext("coach");
export const ORG = CTX.org.id;
/** Otro club, cuyas filas no deben salir nunca. */
export const OTHER_ORG = "00000000-0000-4000-8000-0000000000b2";

/** Un uuid con forma válida a partir de un número. */
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Un error de lectura cuyo mensaje lleva datos personales: no debe llegar a ningún sitio. */
export const FAILURE: Failure = {
  name: "PostgrestError",
  code: "42501",
  message: "fila de ana@club-a.test",
};

/** Un sufijo corto del id, para que cada fila tenga su propio texto. */
export const tag = (id: string) => id.slice(-2);
