import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_BRAND_COLORS } from "./branding";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getClubContext } from "./queries";

// ── Un doble mínimo de la base de datos ──────────────────────────────────────────────
// Guarda las filas de `memberships` que RLS dejaría leer a quien pregunta y aplica de
// verdad los filtros `eq` que pide la consulta. Así los tests comprueban qué club sale,
// no con qué argumentos se llamó a cada método.

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ME = "8f0f4a52-7c1d-4d0e-9a55-2f5a3c6f1b01";
const OTHER_COACH = "0d7a5a0c-51c5-4f0b-8f0e-6f5c2f0a9b02";

const CLUB_A = {
  id: "5b0e1c4e-2a53-4f6b-9a0c-1d2e3f4a5b6c",
  slug: "club-a",
  name: "Club A",
  timezone: "Europe/Madrid",
  organization_branding: {
    display_name: "Club A",
    wordmark_sub: "Baloncesto",
    short_name: "CLA",
    way_name: "El camino del Club A",
    tagline: "Un club, una idea.",
    color_accent: "#5aa9e6",
    color_accent_pressed: "#4a90c8",
    color_on_accent: "#0a0a0b",
    color_accent_soft: "#14283a",
    terminology: { way: "Nuestro estilo", standards: "Normas del club" },
  },
};

const CLUB_B = {
  id: "7c1f2d5f-3b64-4a7c-8b1d-2e3f4a5b6c7d",
  slug: "club-b",
  name: "Club B",
  timezone: "America/Mexico_City",
  organization_branding: null,
};

type MembershipRow = {
  user_id: string;
  status: string;
  role: string;
  person_id: string | null;
  organizations: unknown;
};

function membership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    user_id: ME,
    status: "active",
    role: "coach",
    person_id: "2a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
    organizations: CLUB_A,
    ...overrides,
  };
}

/** Filas de `memberships` visibles con la sesión actual. */
let visible: MembershipRow[];
/** Lo que responde la consulta si se fuerza un fallo. */
let queryError: Record<string, unknown> | null;
/** Lo que lanza la consulta si ni siquiera llega a responder. */
let queryThrows: Error | null;
/** Tablas consultadas. */
let queried: string[];
/** Líneas escritas en el log del servidor. */
let logged: string[];

function valueAt(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
  }, row);
}

function fakeQuery() {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      if (queryThrows) throw queryThrows;
      if (queryError) return { data: null, error: queryError };
      const rows = visible.filter((row) =>
        filters.every(([column, value]) => valueAt(row, column) === value),
      );
      if (rows.length > 1) {
        return { data: null, error: { code: "PGRST116", message: "more than one row" } };
      }
      return { data: rows[0] ?? null, error: null };
    },
  };
  return query;
}

function signedInAs(userId: string | null, error: unknown = null) {
  const getClaims = vi.fn().mockResolvedValue({
    data: userId ? { claims: { sub: userId } } : null,
    error,
  });
  mocks.createClient.mockResolvedValue({
    auth: { getClaims },
    from(table: string) {
      queried.push(table);
      return fakeQuery();
    },
  });
  return getClaims;
}

/** Un error con la forma de los de auth-js: nombre, estado HTTP y código. */
function authError(name: string, status: number | undefined, code?: string): Error {
  // El mensaje lleva un dato personal a propósito: no puede acabar en el log ni en lo que se lanza.
  return Object.assign(new Error(`fallo de Auth para ${ME}`), { name, status, code });
}

/** Lo que lanza una promesa. Si no lanza, el test falla aquí. */
async function failureOf(promise: Promise<unknown>): Promise<Error> {
  const outcome = await promise.then(
    (value) => ({ resolved: value }),
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error(`Se esperaba un error y llegó ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** Todo lo que viaja en un error: mensaje, pila, causa y cualquier otra propiedad. */
function everythingIn(error: Error): string {
  return JSON.stringify(error, Object.getOwnPropertyNames(error));
}

const FAILURE = "tenancy.club-context: no se pudo comprobar el acceso al club";
const PERSONAL_DATA = [ME, "coach@club-a.test"];

beforeEach(() => {
  vi.resetAllMocks();
  visible = [membership()];
  queryError = null;
  queryThrows = null;
  queried = [];
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  signedInAs(ME);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getClubContext", () => {
  it("devuelve el club, su marca y la membresía de quien pregunta", async () => {
    expect(await getClubContext("club-a")).toEqual({
      org: {
        id: CLUB_A.id,
        slug: "club-a",
        name: "Club A",
        timezone: "Europe/Madrid",
      },
      branding: {
        displayName: "Club A",
        wordmarkSub: "Baloncesto",
        shortName: "CLA",
        wayName: "El camino del Club A",
        tagline: "Un club, una idea.",
        colors: {
          accent: "#5aa9e6",
          accentPressed: "#4a90c8",
          onAccent: "#0a0a0b",
          accentSoft: "#14283a",
        },
        terminology: { way: "Nuestro estilo", standards: "Normas del club" },
      },
      membership: { role: "coach", personId: "2a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
    });
    expect(logged).toEqual([]);
  });

  it("un club que no existe y uno ajeno dan lo mismo: null, con una sola consulta", async () => {
    // RLS no deja ver ni la organización ni membresías ajenas: para la app, el club de
    // otro es tan invisible como uno que no existe.
    expect(await getClubContext("no-existe")).toBeNull();
    const queriesForMissing = [...queried];

    queried = [];
    visible = [membership({ organizations: CLUB_A }), membership({ user_id: OTHER_COACH, organizations: CLUB_B })];
    expect(await getClubContext("club-b")).toBeNull();

    expect(queried).toEqual(queriesForMissing);
    expect(queried).toEqual(["memberships"]);
    expect(logged).toEqual([]);
  });

  it("una membresía revocada no da acceso", async () => {
    // RLS deja leer la propia membresía aunque esté revocada (R11).
    visible = [membership({ status: "revoked" })];

    expect(await getClubContext("club-a")).toBeNull();
  });

  it("quien administra un club entra con su membresía, no con la de otra persona", async () => {
    // RLS deja a un admin leer todas las membresías de su club.
    visible = [
      membership({ user_id: OTHER_COACH, role: "coach", person_id: "c0ffee00-0000-4000-8000-000000000001" }),
      membership({ user_id: ME, role: "admin", person_id: null }),
      membership({ user_id: "3e9c1f6a-0b2d-4c5e-8f7a-9b0c1d2e3f4a", role: "player", status: "revoked" }),
    ];

    const context = await getClubContext("club-a");

    expect(context?.membership).toEqual({ role: "admin", personId: null });
  });

  it("con varios clubes devuelve el del slug pedido", async () => {
    visible = [membership({ organizations: CLUB_A }), membership({ organizations: CLUB_B, role: "admin" })];

    const context = await getClubContext("club-b");

    expect(context?.org).toEqual({
      id: CLUB_B.id,
      slug: "club-b",
      name: "Club B",
      timezone: "America/Mexico_City",
    });
    expect(context?.membership.role).toBe("admin");
  });

  it("sin sesión verificada devuelve null sin consultar nada", async () => {
    signedInAs(null);

    expect(await getClubContext("club-a")).toBeNull();
    expect(queried).toEqual([]);
  });

  it("identifica al usuario con una comprobación verificada", async () => {
    const getClaims = signedInAs(ME);

    await getClubContext("club-a");

    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["vacío", ""],
    ["mayúsculas", "Club-A"],
    ["guion al principio", "-club"],
    ["guion al final", "club-"],
    ["dos guiones seguidos", "club--a"],
    ["guion bajo", "club_a"],
    ["espacio", "club a"],
    ["punto", "club.a"],
    ["extensión de fichero", "club-a.png"],
    ["barra", "club/a"],
    ["sin decodificar", "club%2Da"],
    ["filtro de PostgREST", "club-a,name.eq.x"],
    ["comodín", "*"],
    ["paréntesis", "club-a)"],
    ["letra con acento", "clüb"],
    ["salto de línea detrás", "club-a\n"],
    ["espacio detrás", "club-a "],
  ])("un slug con forma inválida no llega a Supabase: %s", async (_case, slug) => {
    expect(await getClubContext(slug)).toBeNull();

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(queried).toEqual([]);
  });

  it.each(["a", "club", "club-a", "club-a-2", "2club", "u12-club-norte"])(
    "un slug con la forma de la base de datos sí se consulta: %s",
    async (slug) => {
      await getClubContext(slug);

      expect(queried).toEqual(["memberships"]);
    },
  );

  it("un club sin marca usa su nombre y los colores de plataforma", async () => {
    visible = [membership({ organizations: CLUB_B })];

    const context = await getClubContext("club-b");

    expect(context?.branding).toEqual({
      displayName: "Club B",
      wordmarkSub: null,
      shortName: "CLU",
      wayName: "The Way",
      tagline: null,
      colors: PLATFORM_BRAND_COLORS,
      terminology: {},
    });
  });

  it("una marca con el nombre en blanco muestra el nombre de la organización", async () => {
    visible = [
      membership({
        organizations: {
          ...CLUB_A,
          name: "Club A Baloncesto",
          organization_branding: { ...CLUB_A.organization_branding, display_name: "   " },
        },
      }),
    ];

    const context = await getClubContext("club-a");

    expect(context?.branding.displayName).toBe("Club A Baloncesto");
    // El resto de la marca sigue siendo la del club.
    expect(context?.branding.colors.accent).toBe("#5aa9e6");
  });

  it("un color malformado en la base de datos no sale del contexto", async () => {
    visible = [
      membership({
        organizations: {
          ...CLUB_A,
          organization_branding: { ...CLUB_A.organization_branding, color_accent: "red;background:url(x)", color_accent_soft: "#14283A" },
        },
      }),
    ];

    const context = await getClubContext("club-a");

    expect(context?.branding.colors).toEqual({
      accent: PLATFORM_BRAND_COLORS.accent,
      accentPressed: "#4a90c8",
      onAccent: "#0a0a0b",
      accentSoft: "#14283a",
    });
  });

  it.each([
    ["lista", ["Nuestro estilo"], {}],
    ["texto", "Nuestro estilo", {}],
    ["null", null, {}],
    ["valores que no son texto", { way: 7, standards: { es: "Normas" } }, {}],
    ["claves desconocidas", { way: " Nuestro estilo ", drills: "Tareas" }, { way: "Nuestro estilo" }],
  ])("la terminología se lee con cuidado: %s", async (_case, terminology, expected) => {
    visible = [
      membership({ organizations: { ...CLUB_A, organization_branding: { ...CLUB_A.organization_branding, terminology } } }),
    ];

    const context = await getClubContext("club-a");

    expect(context?.branding.terminology).toEqual(expected);
  });

  it("acepta la marca también si llega como lista de una fila", async () => {
    // PostgREST devuelve un objeto si reconoce la relación uno a uno, y una lista si no.
    visible = [membership({ organizations: { ...CLUB_A, organization_branding: [CLUB_A.organization_branding] } })];

    const context = await getClubContext("club-a");

    expect(context?.branding.displayName).toBe("Club A");
    expect(context?.branding.colors.accent).toBe("#5aa9e6");
  });

  it("una membresía sin su organización no da acceso", async () => {
    visible = [membership({ organizations: null })];

    expect(await getClubContext("club-a")).toBeNull();
  });

  // ── Averías ──────────────────────────────────────────────────────────────────────────
  // Que Supabase falle no es lo mismo que «ese club no existe»: se lanza, para que lo recoja
  // una página de error con reintento, y no el 404. `null` queda para cuando Supabase ha
  // contestado: ese club no está entre los tuyos, o esa sesión no vale.

  it("si la consulta falla, deja rastro sin datos personales y lanza", async () => {
    queryError = {
      code: "PGRST301",
      message: `JWT expired for ${ME} asking for club-a`,
      details: "coach@club-a.test",
    };

    const failure = await failureOf(getClubContext("club-a"));

    expect(failure.message).toBe(FAILURE);
    // Lo que dijo la base de datos no viaja con el error: ni en el mensaje ni como causa.
    expect(failure.cause).toBeUndefined();
    for (const secret of PERSONAL_DATA) expect(everythingIn(failure)).not.toContain(secret);
    expect(logged).toEqual(["[tenancy.club-context] error code=PGRST301"]);
  });

  it("si la consulta ni siquiera responde, deja rastro y lanza", async () => {
    queryThrows = new TypeError(`fetch failed for ${ME}`);

    const failure = await failureOf(getClubContext("club-a"));

    expect(failure.message).toBe(FAILURE);
    expect(failure.cause).toBeUndefined();
    for (const secret of PERSONAL_DATA) expect(everythingIn(failure)).not.toContain(secret);
    expect(logged).toEqual(["[tenancy.club-context] TypeError"]);
  });

  it("una avería no depende del club: el propio, uno ajeno y uno que no existe lanzan lo mismo", async () => {
    // Si el club ajeno diera 404 y el propio un error, la avería diría qué clubes existen.
    visible = [membership({ organizations: CLUB_A }), membership({ user_id: OTHER_COACH, organizations: CLUB_B })];
    queryError = { code: "PGRST000", message: "db down" };

    const messages: string[] = [];
    for (const slug of ["club-a", "club-b", "no-existe"]) {
      messages.push((await failureOf(getClubContext(slug))).message);
    }

    expect(messages).toEqual([FAILURE, FAILURE, FAILURE]);
    expect(logged).toEqual([
      "[tenancy.club-context] error code=PGRST000",
      "[tenancy.club-context] error code=PGRST000",
      "[tenancy.club-context] error code=PGRST000",
    ]);
  });

  it.each([
    ["sin conexión con Auth", authError("AuthRetryableFetchError", 0), "AuthRetryableFetchError status=0"],
    ["Auth caído", authError("AuthRetryableFetchError", 503), "AuthRetryableFetchError status=503"],
    [
      "error interno de Auth",
      authError("AuthApiError", 500, "unexpected_failure"),
      "AuthApiError status=500 code=unexpected_failure",
    ],
    [
      "límite de peticiones",
      authError("AuthApiError", 429, "over_request_rate_limit"),
      "AuthApiError status=429 code=over_request_rate_limit",
    ],
    ["error sin estado", authError("AuthUnknownError", undefined), "AuthUnknownError"],
  ])(
    "si la sesión no se puede comprobar (%s), deja rastro y lanza sin consultar nada",
    async (_case, error, trace) => {
      signedInAs(null, error);

      const failure = await failureOf(getClubContext("club-a"));

      expect(failure.message).toBe(FAILURE);
      expect(failure.cause).toBeUndefined();
      for (const secret of PERSONAL_DATA) expect(everythingIn(failure)).not.toContain(secret);
      expect(logged).toEqual([`[tenancy.club-context] ${trace}`]);
      expect(queried).toEqual([]);
    },
  );

  it.each([
    ["token inválido", authError("AuthApiError", 403, "bad_jwt"), "AuthApiError status=403 code=bad_jwt"],
    [
      "sesión cerrada",
      authError("AuthApiError", 403, "session_not_found"),
      "AuthApiError status=403 code=session_not_found",
    ],
    [
      "sin autorización",
      authError("AuthApiError", 401, "no_authorization"),
      "AuthApiError status=401 code=no_authorization",
    ],
    ["sesión que falta", authError("AuthSessionMissingError", 400), "AuthSessionMissingError status=400"],
    [
      "cuenta borrada",
      authError("AuthApiError", 404, "user_not_found"),
      "AuthApiError status=404 code=user_not_found",
    ],
  ])(
    "si Auth rechaza la sesión (%s) no hay usuario: null, con rastro y sin consultar nada",
    async (_case, error, trace) => {
      // No es una avería: Auth ha contestado, y ha dicho que esa sesión no vale.
      signedInAs(null, error);

      expect(await getClubContext("club-a")).toBeNull();

      expect(logged).toEqual([`[tenancy.club-context] ${trace}`]);
      expect(queried).toEqual([]);
    },
  );

  it("si Supabase lanza una excepción al comprobar la sesión, deja rastro y lanza", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: vi.fn().mockRejectedValue(new TypeError(`fetch failed for ${ME}`)) },
      from: () => fakeQuery(),
    });

    const failure = await failureOf(getClubContext("club-a"));

    expect(failure.message).toBe(FAILURE);
    expect(failure.cause).toBeUndefined();
    for (const secret of PERSONAL_DATA) expect(everythingIn(failure)).not.toContain(secret);
    expect(logged).toEqual(["[tenancy.club-context] TypeError"]);
    expect(queried).toEqual([]);
  });
});
