import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonDetail, PersonSummary, PersonTeam } from "@/modules/structure/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listPeople: vi.fn(),
  getPerson: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// `PEOPLE_LIMIT` vale lo mismo que el de verdad (lo fija `queries.test.ts`): la página avisa
// cuando la lista llega a él.
vi.mock("@/modules/structure/queries", () => ({
  PEOPLE_LIMIT: 1000,
  listPeople: mocks.listPeople,
  getPerson: mocks.getPerson,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/structure/actions", () => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  setPersonArchived: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminPersonPage from "./[personId]/page";
import AdminPeoplePage from "./page";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm
// check:guards). De las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PERSON_ID = uuid(1);

const PARAMS = { params: Promise.resolve({ club: "club-a" }) };
const personParams = (personId: string) => ({ params: Promise.resolve({ club: "club-a", personId }) });

function summary(n: number, firstName: string, lastName: string, overrides: Partial<PersonSummary> = {}): PersonSummary {
  return { id: uuid(n), firstName, lastName, birthYear: null, archived: false, teams: [], ...overrides };
}

const PEOPLE: PersonSummary[] = [
  summary(1, "Ana", "Alonso", { birthYear: 2014, teams: ["Equipo A"] }),
  summary(2, "Luis", "Álvarez"),
  summary(3, "Eva", "Zamora", { archived: true }),
];

const TEAMS: PersonTeam[] = [
  { teamId: uuid(21), teamName: "Equipo A", seasonName: "2026/27", isCurrent: true, as: "player" },
  { teamId: uuid(22), teamName: "Equipo B", seasonName: "2026/27", isCurrent: true, as: "head_coach" },
  { teamId: uuid(23), teamName: "Equipo viejo", seasonName: "2025/26", isCurrent: false, as: "assistant" },
];

function detail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: PERSON_ID,
    firstName: "Ana",
    lastName: "Alonso Ruiz",
    birthYear: 2014,
    archived: false,
    teams: TEAMS,
    access: null,
    ...overrides,
  };
}

let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  // React avisa por consola de las claves repetidas de una lista: la salida tiene que quedar limpia.
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listPeople.mockResolvedValue(PEOPLE);
  mocks.getPerson.mockResolvedValue(detail());
});

afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ["/admin/people", () => AdminPeoplePage(PARAMS)],
  ["/admin/people/[personId]", () => AdminPersonPage(personParams(PERSON_ID))],
];

describe("quién entra", () => {
  it.each(PAGES)("%s: quien no dirige el club recibe el 404 y no se lee a nadie", async (_route, page) => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(page()).rejects.toThrow("NOT_FOUND");
    }
    expect(mocks.listPeople).not.toHaveBeenCalled();
    expect(mocks.getPerson).not.toHaveBeenCalled();
  });

  it.each(PAGES)("%s: sin club recibe el mismo 404 y no se lee a nadie", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listPeople).not.toHaveBeenCalled();
    expect(mocks.getPerson).not.toHaveBeenCalled();
  });

  it("nadie ve su propia ficha de Gestión sin ser dirección", async () => {
    const coach = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(coach);

    await expect(AdminPersonPage(personParams(coach.membership.personId as string))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getPerson).not.toHaveBeenCalled();
  });
});

describe("/admin/people", () => {
  it("lee las personas del club de quien administra", async () => {
    render(await AdminPeoplePage(PARAMS));

    expect(mocks.listPeople).toHaveBeenCalledTimes(1);
    expect(mocks.listPeople.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" }, membership: { role: "admin" } });
  });

  it("«Personas» es el único <h1> y dice a quién recoge", async () => {
    render(await AdminPeoplePage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Personas" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText("Quien juega y quien entrena en tu club, tenga o no acceso a la app."),
    ).toBeInTheDocument();
  });

  it("la lista de quien está en el club, con su buscador y su conmutador de archivadas", async () => {
    render(await AdminPeoplePage(PARAMS));

    expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivadas" })).toHaveAttribute("aria-pressed", "false");
    const rows = within(screen.getByRole("list")).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      `/c/club-a/admin/people/${uuid(1)}`,
      `/c/club-a/admin/people/${uuid(2)}`,
    ]);
    expect(within(rows[0]).getByText("Alonso, Ana")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Equipo A")).toBeInTheDocument();
    expect(within(rows[0]).getByText("2014")).toBeInTheDocument();
    expect(screen.queryByText("Zamora, Eva")).not.toBeInTheDocument();
    expect(screen.getByText("2 personas")).toBeInTheDocument();
  });

  it("debajo de la lista, el alta de una persona, con el único botón principal", async () => {
    render(await AdminPeoplePage(PARAMS));

    const form = screen.getByRole("form", { name: "Nueva persona" });
    const create = within(form).getByRole("button", { name: "Dar de alta" });
    expect(screen.getByRole("list").compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const primaries = screen.getAllByRole("button").filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([create]);
  });

  it("del nacimiento solo se pide y se enseña el año", async () => {
    const { container } = render(await AdminPeoplePage(PARAMS));

    expect(screen.getByLabelText("Año de nacimiento (opcional)")).toHaveAttribute("type", "number");
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("un club sin personas: el aviso, sin lista, y el alta sigue ahí", async () => {
    mocks.listPeople.mockResolvedValue([]);

    render(await AdminPeoplePage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay personas" })).toBeInTheDocument();
    expect(screen.getByText("Da de alta a la primera persona de tu club.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Nueva persona" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("por debajo del tope de lectura no avisa de nada", async () => {
    render(await AdminPeoplePage(PARAMS));

    expect(screen.queryByText(/Se enseñan las primeras/)).not.toBeInTheDocument();
  });

  it("si la lista llega al tope de lectura, avisa de que no están todas", async () => {
    // Mil personas, casi todas archivadas: la lista que se pinta sigue siendo corta.
    mocks.listPeople.mockResolvedValue([
      ...PEOPLE,
      ...Array.from({ length: 997 }, (_, index) => summary(1000 + index, "Persona", `Número ${index}`, { archived: true })),
    ]);

    render(await AdminPeoplePage(PARAMS));

    expect(screen.getByText("Se enseñan las primeras 1000 personas.")).toBeInTheDocument();
  });

  it("con una menos que el tope, no avisa", async () => {
    mocks.listPeople.mockResolvedValue([
      ...PEOPLE,
      ...Array.from({ length: 996 }, (_, index) => summary(1000 + index, "Persona", `Número ${index}`, { archived: true })),
    ]);

    render(await AdminPeoplePage(PARAMS));

    expect(screen.queryByText(/Se enseñan las primeras/)).not.toBeInTheDocument();
  });
});

describe("/admin/people/[personId] · qué persona", () => {
  it("lee la persona de la URL con el contexto del club de quien administra", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(mocks.getPerson).toHaveBeenCalledTimes(1);
    expect(mocks.getPerson.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
    expect(mocks.getPerson.mock.calls[0][1]).toBe(PERSON_ID);
    expect(mocks.listPeople).not.toHaveBeenCalled();
  });

  it.each([
    ["que no existe", uuid(77)],
    ["cuyo id no tiene forma de uuid", "no-es-un-id"],
    ["buscada por su nombre en vez de por su id", "ana-alonso"],
  ])("una persona %s es el 404", async (_case, personId) => {
    // `getPerson` devuelve null para lo que no existe, lo que no es un id y lo de otro club.
    mocks.getPerson.mockResolvedValue(null);

    await expect(AdminPersonPage(personParams(personId))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getPerson.mock.calls[0][1]).toBe(personId);
  });
});

describe("/admin/people/[personId] · la cabecera", () => {
  it("su nombre completo es el único <h1>, y vuelve a Personas", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Alonso Ruiz" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Personas" })).toHaveAttribute("href", "/c/club-a/admin/people");
  });

  it("quien no tiene cuenta, lo dice", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByText("No tiene acceso a la app.")).toBeInTheDocument();
  });

  it.each([
    ["admin", "Dirección"],
    ["coach", "Cuerpo técnico"],
    ["player", "Jugador"],
    ["guardian", "Familia"],
  ] as const)("quien tiene cuenta con el rol %s lo dice como «%s»", async (access, label) => {
    mocks.getPerson.mockResolvedValue(detail({ access }));

    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByText(`Tiene acceso a la app: ${label}.`)).toBeInTheDocument();
    expect(screen.queryByText("No tiene acceso a la app.")).not.toBeInTheDocument();
  });

  it("el acceso se lee, no se cambia: no hay nada con lo que invitar ni quitar acceso", async () => {
    mocks.getPerson.mockResolvedValue(detail({ access: "coach" }));

    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.queryByRole("button", { name: /invitar|acceso|rol/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correo|email|rol/i)).not.toBeInTheDocument();
  });

  it("quien está en el club no lleva etiqueta, y se puede archivar", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.queryByText("Archivada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recuperar" })).not.toBeInTheDocument();
  });

  it("una archivada lo dice junto a su nombre, y se puede recuperar", async () => {
    mocks.getPerson.mockResolvedValue(detail({ archived: true, teams: [] }));

    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByText("Archivada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recuperar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
  });
});

describe("/admin/people/[personId] · sus equipos", () => {
  const rows = () => within(screen.getByRole("region", { name: "Equipos" })).getAllByRole("link");

  it("una fila por equipo, en el orden en que llegan, que lleva a la página del equipo", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByRole("heading", { level: 2, name: "Equipos" })).toBeInTheDocument();
    expect(rows().map((row) => row.getAttribute("href"))).toEqual([
      `/c/club-a/admin/teams/${uuid(21)}`,
      `/c/club-a/admin/teams/${uuid(22)}`,
      `/c/club-a/admin/teams/${uuid(23)}`,
    ]);
  });

  it("cada fila dice qué hace en el equipo y de qué temporada es", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    const [player, head, assistant] = rows();
    expect(within(player).getByText("Equipo A")).toBeInTheDocument();
    expect(within(player).getByText("En la plantilla · 2026/27")).toBeInTheDocument();
    expect(within(head).getByText("Entrenador principal · 2026/27")).toBeInTheDocument();
    expect(within(assistant).getByText("Equipo viejo")).toBeInTheDocument();
    expect(within(assistant).getByText("Ayudante · 2025/26")).toBeInTheDocument();
  });

  it("los de la temporada actual llevan «Actual»; los de otras, no", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    const [player, head, assistant] = rows();
    expect(within(player).getByText("Actual")).toBeInTheDocument();
    expect(within(head).getByText("Actual")).toBeInTheDocument();
    expect(within(assistant).queryByText("Actual")).not.toBeInTheDocument();
  });

  it("quien entrena y juega en el mismo equipo lo lleva dos veces, una por cada cosa", async () => {
    mocks.getPerson.mockResolvedValue(
      detail({
        teams: [
          { teamId: uuid(21), teamName: "Equipo A", seasonName: "2026/27", isCurrent: true, as: "assistant" },
          { teamId: uuid(21), teamName: "Equipo A", seasonName: "2026/27", isCurrent: true, as: "player" },
        ],
      }),
    );

    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText("Ayudante · 2026/27")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("En la plantilla · 2026/27")).toBeInTheDocument();
    // Y React no se queja de dos filas con la misma clave (lo comprueba `afterEach`).
  });

  it("sin equipos lo dice, y dice desde dónde se añade", async () => {
    mocks.getPerson.mockResolvedValue(detail({ teams: [] }));

    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(
      screen.getByText("No está en ningún equipo. Se añade desde la página de cada equipo."),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Equipos" })).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("/admin/people/[personId] · sus datos", () => {
  it("el formulario empieza con su nombre, sus apellidos y su año de nacimiento", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.getByRole("heading", { level: 2, name: "Datos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("Alonso Ruiz");
    expect(screen.getByLabelText("Año de nacimiento (opcional)")).toHaveValue(2014);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
  });

  it("del nacimiento solo se enseña el año: ni fecha ni campo de fecha", async () => {
    const { container } = render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("no hay alta ni botón principal: es la página de una persona que existe", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    expect(screen.queryByRole("button", { name: "Dar de alta" })).not.toBeInTheDocument();
    const primaries = screen.getAllByRole("button").filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([]);
  });

  it("todas las rutas llevan el slug del club y un id, nunca el nombre de la persona", async () => {
    render(await AdminPersonPage(personParams(PERSON_ID)));

    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      expect(href).toMatch(/^\/c\/club-a\/admin\//);
      expect(href.toLowerCase()).not.toMatch(/ana|alonso/);
    }
  });
});
