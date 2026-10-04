import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillSummary } from "@/modules/drills/types";
import type {
  ClubValue,
  GamePrinciple,
  Standard,
  WayIndexEntry,
  WaySection,
  WaySectionView,
} from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getWayIndex: vi.fn(),
  getWaySection: vi.fn(),
  getStandards: vi.fn(),
  getRelatedDrills: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/methodology/queries", () => ({
  getWayIndex: mocks.getWayIndex,
  getWaySection: mocks.getWaySection,
  getStandards: mocks.getStandards,
}));
vi.mock("@/modules/drills/queries", () => ({ getRelatedDrills: mocks.getRelatedDrills }));
// El componente de cliente que lleva la página a su ancla no pinta nada: aquí se sustituye por
// una marca para comprobar que cada página que tiene anclas lo monta. Lo que hace, en su test.
vi.mock("@/ui/scroll-to-hash", () => ({
  ScrollToHash: () => <span data-testid="scroll-to-hash" />,
}));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import WayPage from "./page";
import WaySectionPage from "./[section]/page";
import WayStandardsPage from "./standards/page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página pide el contexto ella misma antes de leer nada: un layout no protege a sus
// páginas. Aquí se comprueba eso, qué decide cada una (404, vacío, qué bloque pinta) y que
// el nombre de la metodología y de los Standards es el del club.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
const SECTION_PARAMS = {
  params: Promise.resolve({ club: "club-a", section: "una-seccion" }),
  searchParams: Promise.resolve({}),
};

const INDEX: WayIndexEntry[] = [
  { id: "s-1", number: 1, slug: "una-seccion", title: "Una sección", subtitle: "3 valores" },
  { id: "s-4", number: 4, slug: "otra", title: "Otra sección", subtitle: null },
];

function section(overrides: Partial<WaySection> = {}): WaySection {
  return {
    id: "s-1",
    number: 1,
    slug: "una-seccion",
    title: "Una sección",
    summary: "El resumen de la sección.",
    bodyMd: "",
    contentKind: "text",
    status: "published",
    updatedAt: "2026-10-03T10:00:00.123456+00:00",
    ...overrides,
  };
}

function view(overrides: Partial<WaySectionView> = {}): WaySectionView {
  return { section: section(), values: [], principles: [], standards: [], ...overrides };
}

const VALUES: ClubValue[] = [
  { id: "v-1", code: "UNO", title: null, description: "Descripción del valor uno.", status: "published" },
  { id: "v-2", code: "DOS", title: "Título dos", description: "Descripción del valor dos.", status: "published" },
];

const PRINCIPLES: GamePrinciple[] = [
  {
    id: "p-1",
    slug: "salida",
    title: "Salida",
    summary: "Resumen de la salida.",
    status: "published",
    points: [{ id: "pt-1", text: "Primer punto de la salida." }],
  },
  { id: "p-2", slug: "cierre", title: "Cierre", summary: null, status: "published", points: [] },
];

const STANDARDS: Standard[] = [
  { id: "st-1", number: 1, title: "PRIMER STANDARD", description: "Descripción del primero." },
  { id: "st-3", number: 3, title: "TERCER STANDARD", description: "Descripción del tercero." },
];

function drill(id: string, title: string): DrillSummary {
  return {
    id,
    title,
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getWayIndex.mockResolvedValue(INDEX);
  mocks.getWaySection.mockResolvedValue(view());
  mocks.getStandards.mockResolvedValue(STANDARDS);
  mocks.getRelatedDrills.mockResolvedValue({});
});

const PAGES: Array<[string, (props: typeof SECTION_PARAMS) => Promise<ReactElement>]> = [
  ["/way", WayPage],
  ["/way/[section]", WaySectionPage],
  ["/way/standards", WayStandardsPage],
];

describe("páginas de The Way", () => {
  it.each(PAGES)("%s: sin club recibe el 404 y no lee nada", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(page(SECTION_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getWayIndex).not.toHaveBeenCalled();
    expect(mocks.getWaySection).not.toHaveBeenCalled();
    expect(mocks.getStandards).not.toHaveBeenCalled();
    expect(mocks.getRelatedDrills).not.toHaveBeenCalled();
  });

  it.each(PAGES)("%s: tiene un único <h1>", async (_route, page) => {
    render(await page(SECTION_PARAMS));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("/way", () => {
  it("pinta el Hero con el nombre y el lema del club y una fila por sección", async () => {
    const ctx = clubContext("coach");
    ctx.branding.tagline = "Un club, una forma.";
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await WayPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "El camino del Club A" })).toBeInTheDocument();
    expect(screen.getByText("Un club, una forma.")).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((row) => [row.textContent, row.getAttribute("href")])).toEqual([
      ["01Una sección3 valores", "/c/club-a/way/una-seccion"],
      ["04Otra sección", "/c/club-a/way/otra"],
    ]);
    expect(mocks.getWayIndex).toHaveBeenCalledWith(expect.objectContaining({ org: expect.objectContaining({ id: ctx.org.id }) }));
  });

  it("sin nada publicado: el Hero y el aviso, y a un entrenador le ofrece volver a Inicio", async () => {
    mocks.getWayIndex.mockResolvedValue([]);

    render(await WayPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "El camino del Club A" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Tu club todavía no ha publicado su metodología" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/c/club-a");
    expect(screen.queryByRole("link", { name: "Ir a Gestión" })).not.toBeInTheDocument();
  });

  it("sin nada publicado, quien administra puede ir a Gestión", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));
    mocks.getWayIndex.mockResolvedValue([]);

    render(await WayPage(PARAMS));

    expect(screen.getByRole("link", { name: "Ir a Gestión" })).toHaveAttribute("href", "/c/club-a/admin/way");
    expect(screen.queryByRole("link", { name: "Volver a Inicio" })).not.toBeInTheDocument();
  });
});

describe("/way/[section]", () => {
  it("una sección que no existe o no está publicada recibe el 404", async () => {
    // `getWaySection` no distingue un caso del otro: las dos devuelven `null` (Review Focus 2).
    mocks.getWaySection.mockResolvedValue(null);

    await expect(WaySectionPage(SECTION_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getWaySection).toHaveBeenCalledWith(expect.objectContaining({ org: expect.anything() }), "una-seccion");
  });

  it("pinta el número, el título como <h1> y el resumen", async () => {
    mocks.getWaySection.mockResolvedValue(
      view({ section: section({ number: 3, bodyMd: "Un texto.", title: "Cómo jugamos" }) }),
    );

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Cómo jugamos" })).toBeInTheDocument();
    expect(screen.getByText("03")).toHaveClass("font-display", "text-numeral", "text-brand-accent");
    expect(screen.getByText("El resumen de la sección.")).toBeInTheDocument();
  });

  it("sin resumen no deja un párrafo vacío", async () => {
    mocks.getWaySection.mockResolvedValue(view({ section: section({ summary: null, bodyMd: "Un texto." }) }));

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.queryByText("El resumen de la sección.")).not.toBeInTheDocument();
    for (const paragraph of screen.getAllByText(/./, { selector: "p" })) {
      expect(paragraph.textContent?.trim()).not.toBe("");
    }
  });

  it("el enlace de vuelta lleva el nombre que el club da a su metodología", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { way: "Nuestra forma" }));
    mocks.getWaySection.mockResolvedValue(view({ section: section({ bodyMd: "Un texto." }) }));

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.getByRole("link", { name: "Nuestra forma" })).toHaveAttribute("href", "/c/club-a/way");
  });

  it("sin terminología, el enlace de vuelta dice «The Way»", async () => {
    mocks.getWaySection.mockResolvedValue(view({ section: section({ bodyMd: "Un texto." }) }));

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.getByRole("link", { name: "The Way" })).toHaveAttribute("href", "/c/club-a/way");
  });

  describe("de texto", () => {
    it("pinta el cuerpo en Markdown", async () => {
      mocks.getWaySection.mockResolvedValue(
        view({ section: section({ bodyMd: "Queremos **competir**.\n\n### Lo que esperamos\n\n- Llega puntual." }) }),
      );

      render(await WaySectionPage(SECTION_PARAMS));

      expect(screen.getByText("competir")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "Lo que esperamos" })).toBeInTheDocument();
      expect(screen.getByText("Llega puntual.")).toBeInTheDocument();
      expect(screen.queryByText("Esta sección todavía no tiene contenido")).not.toBeInTheDocument();
    });

    it("sin cuerpo dice que no hay contenido y ofrece volver a la metodología", async () => {
      render(await WaySectionPage(SECTION_PARAMS));

      expect(
        screen.getByRole("heading", { level: 2, name: "Esta sección todavía no tiene contenido" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Vuelve a consultarla más adelante.")).toBeInTheDocument();
      // El enlace de vuelta y la acción del aviso llevan al mismo sitio.
      for (const link of screen.getAllByRole("link", { name: "The Way" })) {
        expect(link).toHaveAttribute("href", "/c/club-a/way");
      }
    });

    it("un cuerpo en blanco cuenta como vacío", async () => {
      mocks.getWaySection.mockResolvedValue(view({ section: section({ bodyMd: "  \n " }) }));

      render(await WaySectionPage(SECTION_PARAMS));

      expect(screen.getByText("Esta sección todavía no tiene contenido")).toBeInTheDocument();
    });
  });

  describe("de valores", () => {
    const kind = { contentKind: "values" as const };

    it("pinta un bloque por valor, tras la introducción si la hay", async () => {
      mocks.getWaySection.mockResolvedValue(
        view({ section: section({ ...kind, bodyMd: "Lo que nos une." }), values: VALUES }),
      );

      render(await WaySectionPage(SECTION_PARAMS));

      const intro = screen.getByText("Lo que nos une.");
      const first = screen.getByRole("heading", { level: 2, name: "UNO" });
      expect(Boolean(intro.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      expect(screen.getByRole("heading", { level: 2, name: "DOS" })).toBeInTheDocument();
      expect(screen.getByText("Descripción del valor dos.")).toBeInTheDocument();
      expect(screen.queryByText("Todavía no hay valores publicados")).not.toBeInTheDocument();
    });

    it("sin valores publicados lo dice, aunque la sección tenga texto", async () => {
      mocks.getWaySection.mockResolvedValue(
        view({ section: section({ ...kind, bodyMd: "Lo que nos une." }) }),
      );

      render(await WaySectionPage(SECTION_PARAMS));

      expect(screen.getByText("Lo que nos une.")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: "Todavía no hay valores publicados" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Cuando dirección los publique, aparecerán aquí.")).toBeInTheDocument();
      expect(screen.queryByText("Esta sección todavía no tiene contenido")).not.toBeInTheDocument();
    });
  });

  describe("de principios", () => {
    const kind = { contentKind: "principles" as const };

    it("pinta una tarjeta por principio, con su ancla y sus puntos", async () => {
      mocks.getWaySection.mockResolvedValue(view({ section: section(kind), principles: PRINCIPLES }));

      const { container } = render(await WaySectionPage(SECTION_PARAMS));

      expect(screen.getByRole("heading", { level: 2, name: "Salida" })).toBeInTheDocument();
      expect(screen.getByText("Primer punto de la salida.")).toBeInTheDocument();
      expect(container.querySelector("#principle-salida")).not.toBeNull();
      expect(container.querySelector("#principle-cierre")).not.toBeNull();
      expect(screen.queryByText("Todavía no hay principios publicados")).not.toBeInTheDocument();
    });

    it("sin principios publicados lo dice", async () => {
      mocks.getWaySection.mockResolvedValue(view({ section: section(kind) }));

      render(await WaySectionPage(SECTION_PARAMS));

      expect(
        screen.getByRole("heading", { level: 2, name: "Todavía no hay principios publicados" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Cuando dirección los publique, aparecerán aquí.")).toBeInTheDocument();
      // El enlace de vuelta y la acción del aviso.
      expect(screen.getAllByRole("link", { name: "The Way" })).toHaveLength(2);
      // Sin principios no hay a quién buscarle ejercicios.
      expect(mocks.getRelatedDrills).not.toHaveBeenCalled();
    });

    describe("ejercicios relacionados", () => {
      beforeEach(() => {
        mocks.getWaySection.mockResolvedValue(view({ section: section(kind), principles: PRINCIPLES }));
        mocks.getRelatedDrills.mockResolvedValue({
          "p-1": [drill("d-1", "Primer ejercicio"), drill("d-2", "Segundo ejercicio")],
          "p-2": [],
        });
      });

      it.each(["coach", "admin"] as const)(
        "%s: los lee todos de una vez, con los ids de los principios de la sección",
        async (role) => {
          mocks.getClubContext.mockResolvedValue(clubContext(role));

          render(await WaySectionPage(SECTION_PARAMS));

          expect(mocks.getRelatedDrills).toHaveBeenCalledTimes(1);
          expect(mocks.getRelatedDrills).toHaveBeenCalledWith(
            expect.objectContaining({ org: expect.objectContaining({ slug: "club-a" }) }),
            ["p-1", "p-2"],
          );
        },
      );

      it("cada principio enseña los suyos, enlazados a su ficha, y la biblioteca filtrada por él", async () => {
        const { container } = render(await WaySectionPage(SECTION_PARAMS));

        const salida = within(container.querySelector("#principle-salida") as HTMLElement);
        expect(salida.getByRole("heading", { level: 3, name: "Ejercicios relacionados" })).toBeInTheDocument();
        expect(
          salida.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]),
        ).toEqual([
          ["Primer ejercicioU12+ · 6–12 jug. · 10–15 min", "/c/club-a/drills/d-1"],
          ["Segundo ejercicioU12+ · 6–12 jug. · 10–15 min", "/c/club-a/drills/d-2"],
          ["Ver todos en la biblioteca", "/c/club-a/drills?principle=salida"],
        ]);
      });

      it("un principio sin ejercicios lo dice, sin enlace a la biblioteca", async () => {
        const { container } = render(await WaySectionPage(SECTION_PARAMS));

        const cierre = within(container.querySelector("#principle-cierre") as HTMLElement);
        expect(cierre.getByRole("heading", { level: 3, name: "Ejercicios relacionados" })).toBeInTheDocument();
        expect(cierre.getByText("Aún no hay ejercicios con este principio.")).toBeInTheDocument();
        expect(cierre.queryByRole("link")).not.toBeInTheDocument();
      });

      it("un principio que la lectura no trae cuenta como sin ejercicios", async () => {
        mocks.getRelatedDrills.mockResolvedValue({});

        render(await WaySectionPage(SECTION_PARAMS));

        expect(screen.getAllByText("Aún no hay ejercicios con este principio.")).toHaveLength(2);
      });

      it.each(["player", "guardian"] as const)(
        "%s: la biblioteca no es suya, así que no se lee nada y las tarjetas quedan como siempre",
        async (role) => {
          mocks.getClubContext.mockResolvedValue(clubContext(role));

          const { container } = render(await WaySectionPage(SECTION_PARAMS));

          expect(mocks.getRelatedDrills).not.toHaveBeenCalled();
          expect(screen.queryByText("Ejercicios relacionados")).not.toBeInTheDocument();
          expect(screen.queryByText("Aún no hay ejercicios con este principio.")).not.toBeInTheDocument();
          expect(screen.queryByRole("link", { name: "Ver todos en la biblioteca" })).not.toBeInTheDocument();
          // Los principios siguen ahí, con sus puntos.
          expect(screen.getByRole("heading", { level: 2, name: "Salida" })).toBeInTheDocument();
          expect(screen.getByText("Primer punto de la salida.")).toBeInTheDocument();
          expect(container.querySelector("#principle-salida")).not.toBeNull();
          expect(container.querySelectorAll("h3")).toHaveLength(0);
        },
      );

      it("solo las secciones de principios: ni valores, ni Standards, ni texto leen ejercicios", async () => {
        const others: WaySectionView[] = [
          view({ section: section({ contentKind: "values" }), values: VALUES }),
          view({ section: section({ contentKind: "standards" }), standards: STANDARDS }),
          view({ section: section({ bodyMd: "Un texto." }) }),
        ];

        for (const other of others) {
          mocks.getWaySection.mockResolvedValue(other);

          render(await WaySectionPage(SECTION_PARAMS));
        }

        expect(mocks.getRelatedDrills).not.toHaveBeenCalled();
        expect(screen.queryByText("Ejercicios relacionados")).not.toBeInTheDocument();
      });

      it("si los ejercicios no se pueden leer, la página falla y lo recoge el error de la ruta", async () => {
        mocks.getRelatedDrills.mockRejectedValue(new Error("drills.related: no se pudo leer de la base de datos"));

        await expect(WaySectionPage(SECTION_PARAMS)).rejects.toThrow("drills.related");
      });

      it("el enlace a la biblioteca lleva el slug del principio escapado", async () => {
        mocks.getWaySection.mockResolvedValue(
          view({ section: section(kind), principles: [{ ...PRINCIPLES[0], slug: "a&b c" }] }),
        );
        mocks.getRelatedDrills.mockResolvedValue({ "p-1": [drill("d-1", "Primer ejercicio")] });

        render(await WaySectionPage(SECTION_PARAMS));

        expect(screen.getByRole("link", { name: "Ver todos en la biblioteca" })).toHaveAttribute(
          "href",
          "/c/club-a/drills?principle=a%26b%20c",
        );
      });
    });
  });

  describe("de Standards", () => {
    const kind = { contentKind: "standards" as const };

    it("pinta un bloque por Standard, con su número de dos cifras", async () => {
      mocks.getWaySection.mockResolvedValue(view({ section: section(kind), standards: STANDARDS }));

      const { container } = render(await WaySectionPage(SECTION_PARAMS));

      expect(screen.getByRole("heading", { level: 2, name: "PRIMER STANDARD" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "TERCER STANDARD" })).toBeInTheDocument();
      expect(container.querySelector("#standard-01")).not.toBeNull();
      expect(container.querySelector("#standard-03")).not.toBeNull();
      expect(screen.queryByText("Todavía no hay Standards publicados")).not.toBeInTheDocument();
    });

    it("sin Standards publicados lo dice", async () => {
      mocks.getWaySection.mockResolvedValue(view({ section: section(kind) }));

      render(await WaySectionPage(SECTION_PARAMS));

      expect(
        screen.getByRole("heading", { level: 2, name: "Todavía no hay Standards publicados" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Cuando dirección los publique, aparecerán aquí.")).toBeInTheDocument();
    });
  });

  it("la lista de otro tipo no se cuela: una sección de texto no pinta valores que lleguen de más", async () => {
    mocks.getWaySection.mockResolvedValue(
      view({ section: section({ bodyMd: "Un texto." }), values: VALUES, standards: STANDARDS }),
    );

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.queryByRole("heading", { level: 2, name: "UNO" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "PRIMER STANDARD" })).not.toBeInTheDocument();
  });
});

// Los destinos de los anclas (`#principle-…`, `#standard-NN`) llegan en el contenido que se
// transmite tras el `loading.tsx`, cuando el navegador ya ha dejado de buscar el fragmento de la
// URL: estas páginas montan `ScrollToHash` con ese contenido, no un layout que se monta antes.
describe("anclas de la URL", () => {
  it.each([
    ["una sección de principios", () => view({ section: section({ contentKind: "principles" }), principles: PRINCIPLES })],
    ["una sección de Standards", () => view({ section: section({ contentKind: "standards" }), standards: STANDARDS })],
  ])("%s monta ScrollToHash una vez", async (_name, make) => {
    mocks.getWaySection.mockResolvedValue(make());

    render(await WaySectionPage(SECTION_PARAMS));

    expect(screen.getAllByTestId("scroll-to-hash")).toHaveLength(1);
  });

  it("la página de los Standards monta ScrollToHash una vez", async () => {
    render(await WayStandardsPage(PARAMS));

    expect(screen.getAllByTestId("scroll-to-hash")).toHaveLength(1);
  });

  it("también con la lista vacía: el contenido llega igual", async () => {
    mocks.getStandards.mockResolvedValue([]);

    render(await WayStandardsPage(PARAMS));

    expect(screen.getAllByTestId("scroll-to-hash")).toHaveLength(1);
  });

  it("el índice de The Way no tiene destinos de ancla y no lo monta", async () => {
    render(await WayPage(PARAMS));

    expect(screen.queryByTestId("scroll-to-hash")).not.toBeInTheDocument();
  });
});

describe("/way/standards", () => {
  it("el <h1> es el nombre que el club da a sus Standards", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { standards: "Normas del club" }));

    render(await WayStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Normas del club" })).toBeInTheDocument();
  });

  it("sin terminología, el <h1> es «Standards»", async () => {
    render(await WayStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Standards" })).toBeInTheDocument();
  });

  it("pinta un bloque por Standard, en su orden, con su ancla", async () => {
    const { container } = render(await WayStandardsPage(PARAMS));

    const titles = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["PRIMER STANDARD", "TERCER STANDARD"]);
    expect(container.querySelector("#standard-01")).not.toBeNull();
    expect(container.querySelector("#standard-03")).not.toBeNull();
    expect(mocks.getStandards).toHaveBeenCalledWith(expect.objectContaining({ org: expect.anything() }));
  });

  it("el enlace de vuelta lleva a la metodología con el nombre del club", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { way: "Nuestra forma" }));

    render(await WayStandardsPage(PARAMS));

    const back = screen.getByRole("link", { name: "Nuestra forma" });
    expect(back).toHaveAttribute("href", "/c/club-a/way");
    // Antes que el título: es lo primero que se alcanza con el teclado.
    expect(
      Boolean(back.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it("sin Standards publicados lo dice, con la salida a la metodología", async () => {
    mocks.getStandards.mockResolvedValue([]);

    render(await WayStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Standards" })).toBeInTheDocument();
    const empty = screen.getByRole("heading", { level: 2, name: "Todavía no hay Standards publicados" });
    expect(screen.getByText("Cuando dirección los publique, aparecerán aquí.")).toBeInTheDocument();
    const card = empty.closest("div");
    expect(within(card!).getByRole("link", { name: "The Way" })).toHaveAttribute("href", "/c/club-a/way");
  });
});
