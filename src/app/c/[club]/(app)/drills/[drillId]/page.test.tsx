import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillDetail, DrillStatus } from "@/modules/drills/types";
import type { Standard } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getDrill: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/drills/queries", () => ({ getDrill: mocks.getDrill }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// Los botones de dirección son de cliente y tienen su propio test: aquí solo importa qué reciben.
vi.mock("./drill-admin-actions", () => ({
  DrillAdminActions: (props: unknown) => <div data-testid="admin-actions" data-props={JSON.stringify(props)} />,
}));

import DrillPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";

function props(drillId = DRILL_ID) {
  return { params: Promise.resolve({ club: "club-a", drillId }), searchParams: Promise.resolve({}) };
}

const STANDARDS: Standard[] = [
  { id: "st-3", number: 3, title: "TERCER STANDARD", description: "Descripción del tercero." },
  { id: "st-4", number: 4, title: "CUARTO STANDARD", description: "Descripción del cuarto." },
  { id: "st-5", number: 5, title: "QUINTO STANDARD", description: "Descripción del quinto." },
];

/** La ficha de un ejercicio sin nada opcional: lo mínimo que puede traer `getDrill`. */
function minimal(overrides: Partial<DrillDetail> = {}): DrillDetail {
  return {
    id: DRILL_ID,
    title: "Rebote + outlet",
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [],
    summary: null,
    objective: null,
    setupMd: null,
    equipment: [],
    videoUrl: null,
    diagramMediaId: null,
    diagramUrl: null,
    coachingPoints: [],
    variants: [],
    focusAreaIds: [],
    principleIds: [],
    standardIds: [],
    principles: [],
    principlesSectionSlug: null,
    standards: [],
    createdByMe: false,
    updatedAt: "2026-10-03T10:00:00.123456+00:00",
    ...overrides,
  };
}

/** La ficha de un ejercicio con todo lo que puede llevar. */
function full(overrides: Partial<DrillDetail> = {}): DrillDetail {
  return minimal({
    objective: "Asegurar el rebote y convertirlo en ventaja.",
    setupMd: "Un tirador y **dos** exteriores abiertos.",
    equipment: ["Balones", "Conos", "Petos"],
    videoUrl: "https://www.youtube.com/watch?v=abc123",
    diagramUrl: "https://storage.test/diagrama.png?token=firmado",
    coachingPoints: [
      { text: "Rebote con dos manos", isKey: true },
      { text: "Primera mirada hacia delante", isKey: true },
      { text: "Outlet rápido", isKey: false },
    ],
    variants: [
      { title: "Con defensor", description: "Un defensor presiona al que recibe." },
      { title: "Tras tiro libre", description: null },
    ],
    principles: [
      { id: "p-1", slug: "rebote", title: "Rebote" },
      { id: "p-2", slug: "transicion", title: "Transición" },
    ],
    principlesSectionSlug: "como-jugamos",
    standards: STANDARDS,
    ...overrides,
  });
}

async function renderPage(drillId = DRILL_ID) {
  return render(await DrillPage(props(drillId)));
}

/** Lo que la página le pasó a los botones de dirección. */
function adminProps() {
  return JSON.parse(screen.getByTestId("admin-actions").getAttribute("data-props") ?? "{}");
}

/** Los `<h2>` de la ficha, en el orden en que salen. */
function sections() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getDrill.mockResolvedValue(full());
});

describe("quién entra", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(DrillPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getDrill).not.toHaveBeenCalled();
  });

  it("pide la ficha con el contexto del club y el id de la URL", async () => {
    await renderPage();

    expect(mocks.getDrill).toHaveBeenCalledTimes(1);
    expect(mocks.getDrill).toHaveBeenCalledWith(clubContext("coach"), DRILL_ID);
  });

  it("si la ficha no llega (no existe, es de otro club o no se puede ver) es el 404 de siempre", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(DrillPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("un id que no es un uuid acaba igual: lo resuelve `getDrill`, que devuelve null", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(DrillPage(props("no-soy-un-uuid"))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getDrill).toHaveBeenCalledWith(expect.anything(), "no-soy-un-uuid");
  });

  it("un fallo de lectura sube hasta error.tsx, no se traga", async () => {
    mocks.getDrill.mockRejectedValue(new Error("drills.detail: boom"));

    await expect(DrillPage(props())).rejects.toThrow("drills.detail: boom");
  });
});

describe("la cabecera", () => {
  it("es la de detalle «Ejercicio», lo primero del contenido, y vuelve a la biblioteca", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(within(header).getByText("Ejercicio")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/drills");
  });

  it("la pantalla tiene un único <h1>, que es el título del ejercicio, y no el de la cabecera", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Rebote + outlet");
  });

  it("«Editar» lleva a su formulario y sale a quien puede editar", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    await renderPage();

    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", `/c/club-a/drills/${DRILL_ID}/edit`);
    // Está en la cabecera, no en el contenido.
    const header = document.querySelector("[data-topnav=detail]") as HTMLElement;
    expect(within(header).getByRole("link", { name: "Editar" })).toBeInTheDocument();
  });

  it.each([
    ["admin", "draft", false, true],
    ["admin", "published", false, true],
    ["admin", "archived", false, true],
    ["coach", "draft", true, true],
    ["coach", "draft", false, false],
    ["coach", "published", true, false],
    ["coach", "archived", true, false],
    ["player", "published", false, false],
    ["guardian", "published", false, false],
  ] as const)("%s, ejercicio %s, suyo: %s → «Editar»: %s", async (role, status, createdByMe, edit) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getDrill.mockResolvedValue(full({ status, createdByMe }));

    await renderPage();

    expect(screen.queryByRole("link", { name: "Editar" }) !== null).toBe(edit);
  });
});

describe("una ficha completa", () => {
  it("enseña las píldoras de edad, jugadores y minutos con sus unidades enteras", async () => {
    await renderPage();

    for (const text of ["U12+", "6–12 jugadores", "10–15 minutos"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("sigue el orden de la pantalla", async () => {
    await renderPage();

    expect(sections()).toEqual([
      "Objetivo",
      "Organización",
      "Coaching points",
      "Standards",
      "Principios",
      "Variantes",
      "Material",
      "Vídeo",
    ]);
  });

  it("el diagrama es la imagen firmada, con su nombre accesible", async () => {
    await renderPage();

    const diagram = screen.getByRole("img", { name: "Diagrama de Rebote + outlet" });
    expect(diagram).toHaveAttribute("src", "https://storage.test/diagrama.png?token=firmado");
    expect(screen.queryByRole("img", { name: "Pista sin diagrama" })).not.toBeInTheDocument();
  });

  it("el objetivo y la organización (en Markdown) salen bajo su título", async () => {
    await renderPage();

    expect(screen.getByText("Asegurar el rebote y convertirlo en ventaja.")).toBeInTheDocument();
    const setup = screen.getByText("dos");
    expect(setup.tagName).toBe("STRONG");
    expect(setup.closest("p")).toHaveTextContent("Un tirador y dos exteriores abiertos.");
  });

  it("los coaching points salen en su lista y en su orden, con «Clave» en los que lo son", async () => {
    await renderPage();

    const section = screen.getByRole("heading", { level: 2, name: "Coaching points" }).closest("section") as HTMLElement;
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "ClaveRebote con dos manos",
      "ClavePrimera mirada hacia delante",
      "Outlet rápido",
    ]);
    expect(within(section).getAllByText("Clave")).toHaveLength(2);
  });

  it("las variantes enseñan su título y, si la tienen, su descripción", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 3, name: "Con defensor" })).toBeInTheDocument();
    expect(screen.getByText("Un defensor presiona al que recibe.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Tras tiro libre" })).toBeInTheDocument();
  });

  it("el material sale como lista", async () => {
    await renderPage();

    const section = screen.getByRole("heading", { level: 2, name: "Material" }).closest("section") as HTMLElement;
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Balones",
      "Conos",
      "Petos",
    ]);
  });

  it("el vídeo se abre aparte, sin pasar la ventana ni la referencia", async () => {
    await renderPage();

    const link = screen.getByRole("link", { name: "Ver vídeo" });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("no ofrece añadirlo a una sesión: eso es de otra fase", async () => {
    await renderPage();

    expect(screen.queryByText(/Añadir a sesión/)).not.toBeInTheDocument();
  });
});

describe("Standards y principios", () => {
  it("el título de los Standards es el que les da el club, o «Standards»", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { standards: "Estándares del club" }));
    const { unmount } = await renderPage();
    expect(sections()).toContain("Estándares del club");
    expect(sections()).not.toContain("Standards");
    unmount();

    mocks.getClubContext.mockResolvedValue(clubContext("coach", {}));
    await renderPage();
    expect(sections()).toContain("Standards");
  });

  it("cada Standard es un chip con su número y su título, que enlaza a su sitio en The Way", async () => {
    await renderPage();

    const third = screen.getByRole("link", { name: "03 TERCER STANDARD" });
    expect(third).toHaveAttribute("href", "/c/club-a/way/standards#standard-03");
    expect(screen.getByRole("link", { name: "04 CUARTO STANDARD" })).toHaveAttribute(
      "href",
      "/c/club-a/way/standards#standard-04",
    );
    expect(screen.getByRole("link", { name: "05 QUINTO STANDARD" })).toHaveAttribute(
      "href",
      "/c/club-a/way/standards#standard-05",
    );
    // Con tres no sobra ninguno.
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("más de tres Standards: enseña los tres primeros por número y «+N» con los demás", async () => {
    const more: Standard[] = [
      ...STANDARDS,
      { id: "st-6", number: 6, title: "SEXTO STANDARD", description: "Descripción del sexto." },
      { id: "st-7", number: 7, title: "SÉPTIMO STANDARD", description: "Descripción del séptimo." },
    ];
    mocks.getDrill.mockResolvedValue(full({ standards: more }));

    await renderPage();

    const section = screen.getByRole("heading", { level: 2, name: "Standards" }).closest("section") as HTMLElement;
    expect(within(section).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/c/club-a/way/standards#standard-03",
      "/c/club-a/way/standards#standard-04",
      "/c/club-a/way/standards#standard-05",
    ]);
    expect(within(section).getByText("+2")).toBeInTheDocument();
    // Quien escucha la pantalla oye qué significa.
    expect(within(section).getByText("y 2 más")).toHaveClass("sr-only");
    expect(screen.queryByText("SEXTO STANDARD")).not.toBeInTheDocument();
  });

  it("cada principio enlaza a su sitio en la sección de principios de The Way", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Rebote" })).toHaveAttribute(
      "href",
      "/c/club-a/way/como-jugamos#principle-rebote",
    );
    expect(screen.getByRole("link", { name: "Transición" })).toHaveAttribute(
      "href",
      "/c/club-a/way/como-jugamos#principle-transicion",
    );
  });

  it("sin sección de principios publicada, el principio se nombra pero no enlaza", async () => {
    mocks.getDrill.mockResolvedValue(full({ principlesSectionSlug: null }));

    await renderPage();

    const section = screen.getByRole("heading", { level: 2, name: "Principios" }).closest("section") as HTMLElement;
    expect(within(section).getByText("Rebote")).toBeInTheDocument();
    expect(within(section).getByText("Transición")).toBeInTheDocument();
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("una ficha mínima", () => {
  beforeEach(() => {
    mocks.getDrill.mockResolvedValue(minimal());
  });

  it("no pinta ninguna sección vacía: ni títulos ni listas", async () => {
    const { container } = await renderPage();

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(container.querySelectorAll("ul")).toHaveLength(1); // solo las píldoras
    expect(screen.queryByRole("link", { name: "Ver vídeo" })).not.toBeInTheDocument();
  });

  it("sin diagrama sale la pista vacía", async () => {
    await renderPage();

    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
  });

  it("sigue teniendo el título, las píldoras y la pista", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Rebote + outlet" })).toBeInTheDocument();
    expect(screen.getByText("U12+")).toBeInTheDocument();
    expect(screen.getByText("6–12 jugadores")).toBeInTheDocument();
    expect(screen.getByText("10–15 minutos")).toBeInTheDocument();
  });

  it("una organización en blanco o un objetivo en blanco cuentan como vacíos", async () => {
    mocks.getDrill.mockResolvedValue(minimal({ objective: "   ", setupMd: "\n  " }));

    await renderPage();

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});

describe("el estado del ejercicio", () => {
  it("un publicado no lleva aviso", async () => {
    await renderPage();

    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
    expect(screen.queryByText("Archivado")).not.toBeInTheDocument();
  });

  it("un borrador lo dice y explica quién lo ve", async () => {
    mocks.getDrill.mockResolvedValue(full({ status: "draft" }));

    await renderPage();

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Solo lo ven su autor y dirección hasta que se publique.")).toBeInTheDocument();
    expect(screen.queryByText("Archivado")).not.toBeInTheDocument();
  });

  it("un archivado lo dice y explica que no sale en la biblioteca", async () => {
    mocks.getDrill.mockResolvedValue(full({ status: "archived" }));

    await renderPage();

    expect(screen.getByText("Archivado")).toBeInTheDocument();
    expect(screen.getByText("Este ejercicio está archivado y no sale en la biblioteca.")).toBeInTheDocument();
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });

  it("el aviso va entre el título y las píldoras", async () => {
    mocks.getDrill.mockResolvedValue(full({ status: "draft" }));

    await renderPage();

    const title = screen.getByRole("heading", { level: 1 });
    const notice = screen.getByText("Borrador");
    const pill = screen.getByText("U12+");
    expect(title.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("los botones de dirección", () => {
  it.each([
    ["admin", "draft", { canPublish: true, canArchive: true }],
    ["admin", "published", { canPublish: false, canArchive: true }],
    ["admin", "archived", { canPublish: true, canArchive: false }],
    ["coach", "draft", { canPublish: false, canArchive: false }],
    ["coach", "published", { canPublish: false, canArchive: false }],
    ["coach", "archived", { canPublish: false, canArchive: false }],
  ] as const satisfies ReadonlyArray<readonly [string, DrillStatus, { canPublish: boolean; canArchive: boolean }]>)(
    "%s, ejercicio %s → %o",
    async (role, status, flags) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));
      mocks.getDrill.mockResolvedValue(full({ status, createdByMe: true }));

      await renderPage();

      expect(adminProps()).toEqual({ clubSlug: "club-a", drillId: DRILL_ID, ...flags });
    },
  );

  it("van al final de la ficha, después del vídeo", async () => {
    await renderPage();

    const video = screen.getByRole("link", { name: "Ver vídeo" });
    const actions = screen.getByTestId("admin-actions");
    expect(video.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
