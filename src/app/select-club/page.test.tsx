import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
// Como el de verdad: `redirect()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

import SelectClubPage from "./page";

// ── Un doble mínimo de la base de datos ──────────────────────────────────────────────
// Guarda las filas de `memberships` que RLS dejaría leer a quien pregunta y aplica de
// verdad los filtros `eq` de la consulta: los tests comprueban qué clubes salen.

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ME = "8f0f4a52-7c1d-4d0e-9a55-2f5a3c6f1b01";
const OTHER_COACH = "0d7a5a0c-51c5-4f0b-8f0e-6f5c2f0a9b02";

const CLUB_A = { slug: "club-a", name: "Club A" };
const CLUB_B = { slug: "club-b", name: "Baloncesto Norte" };
const CLUB_C = { slug: "club-c", name: "Élite Sur" };

type MembershipRow = {
  user_id: string;
  status: string;
  organization: { slug: string; name: string } | null;
};

function membership(organization: MembershipRow["organization"], overrides: Partial<MembershipRow> = {}) {
  return { user_id: ME, status: "active", organization, ...overrides };
}

let visible: MembershipRow[];
let queryError: Record<string, unknown> | null;
let queried: string[];
let logged: string[];

function fakeQuery() {
  const filters: Array<[keyof MembershipRow, unknown]> = [];
  const query = {
    select: () => query,
    eq(column: keyof MembershipRow, value: unknown) {
      filters.push([column, value]);
      return query;
    },
    then(resolve: (result: { data: unknown; error: unknown }) => void) {
      if (queryError) return resolve({ data: null, error: queryError });
      const rows = visible.filter((row) => filters.every(([column, value]) => row[column] === value));
      return resolve({ data: rows.map(({ organization }) => ({ organization })), error: null });
    },
  };
  return query;
}

function signedInAs(userId: string | null) {
  mocks.createClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: userId ? { claims: { sub: userId } } : null, error: null }),
    },
    from(table: string) {
      queried.push(table);
      return fakeQuery();
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  visible = [];
  queryError = null;
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

describe("/select-club con varios clubes", () => {
  beforeEach(() => {
    visible = [membership(CLUB_C), membership(CLUB_A), membership(CLUB_B)];
  });

  it("lista los clubes por nombre, cada uno como una fila que lleva a su club", async () => {
    render(await SelectClubPage());

    expect(screen.getByRole("heading", { level: 1, name: "Tus clubes" })).toBeInTheDocument();
    const rows = within(screen.getByRole("main")).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/c/club-b", "/c/club-a", "/c/club-c"]);
    // El nombre accesible de cada fila es el del club, una sola vez.
    expect(screen.getByRole("link", { name: "Baloncesto Norte" })).toBe(rows[0]);
    expect(screen.getByRole("link", { name: "Club A" })).toBe(rows[1]);
    expect(screen.getByRole("link", { name: "Élite Sur" })).toBe(rows[2]);
  });

  it("cada fila lleva las iniciales del club, decorativas y sin colores de ningún club", async () => {
    const { container } = render(await SelectClubPage());

    const row = screen.getByRole("link", { name: "Baloncesto Norte" });
    const initials = within(row).getByText("BN");
    expect(initials.closest("[aria-hidden='true']")).not.toBeNull();
    // Fuera de un club no hay marca de club: ni `data-club` ni variables de color.
    expect(container.querySelector("[data-club]")).toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("las filas son hijas directas de una misma card, que es lo que pinta sus separadores", async () => {
    render(await SelectClubPage());

    const rows = within(screen.getByRole("main")).getAllByRole("link");
    const card = rows[0].parentElement;
    expect(card).toHaveClass("overflow-hidden");
    for (const row of rows) expect(row.parentElement).toBe(card);
  });

  it("solo cuentan las membresías propias y activas, aunque RLS deje leer más", async () => {
    // RLS deja a quien administra un club leer las membresías de todo el club, y a cualquiera
    // leer la suya aunque esté revocada.
    visible = [
      membership(CLUB_A),
      membership(CLUB_B),
      membership(CLUB_C, { status: "revoked" }),
      membership({ slug: "club-d", name: "Club D" }, { user_id: OTHER_COACH }),
    ];

    render(await SelectClubPage());

    const rows = within(screen.getByRole("main")).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/c/club-b", "/c/club-a"]);
    expect(queried).toEqual(["memberships"]);
  });
});

describe("/select-club con un solo club", () => {
  it("salta directamente a ese club", async () => {
    visible = [membership(CLUB_A), membership(CLUB_B, { status: "revoked" })];

    await expect(SelectClubPage()).rejects.toThrow("REDIRECT /c/club-a");
  });
});

describe("/select-club sin clubes", () => {
  it("lo dice como título de la pantalla y explica qué hacer", async () => {
    render(await SelectClubPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Tu cuenta no tiene acceso a ningún club" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Si crees que es un error, pide una nueva invitación a tu club."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("la salida es «Salir»: un formulario que envía un POST a /auth/sign-out", async () => {
    render(await SelectClubPage());

    const button = screen.getByRole("button", { name: "Salir" });
    expect(button).toHaveAttribute("type", "submit");
    const form = button.closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("action", "/auth/sign-out");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    // Área táctil mínima.
    expect(button).toHaveClass("min-h-(--target-min)");
  });

  it("una membresía sin su organización no cuenta como club", async () => {
    visible = [membership(null)];

    render(await SelectClubPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Tu cuenta no tiene acceso a ningún club" }),
    ).toBeInTheDocument();
  });
});

describe("/select-club: sesión y averías", () => {
  it("sin sesión verificada manda a /login sin consultar nada", async () => {
    signedInAs(null);

    await expect(SelectClubPage()).rejects.toThrow("REDIRECT /login");
    expect(queried).toEqual([]);
  });

  it("si la consulta falla, deja rastro sin datos personales y lanza (lo recoge la página de error)", async () => {
    queryError = { code: "PGRST000", message: `db down for ${ME}`, details: "coach@club-a.test" };

    const failure = await SelectClubPage().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).not.toContain(ME);
    expect(String((failure as Error).message)).not.toContain("REDIRECT");
    expect(logged).toEqual(["[select-club.memberships] error code=PGRST000"]);
  });
});
