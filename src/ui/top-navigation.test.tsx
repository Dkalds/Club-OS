import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// El selector de equipo es de cliente y llama a una acción: aquí solo importa si se monta.
vi.mock("@/modules/team/actions", () => ({ setActiveTeam: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { TopNavigation } from "./top-navigation";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
describe("TopNavigation", () => {
  it("muestra el nombre del club y su subtítulo", () => {
    render(<TopNavigation brand={{ displayName: "Club A", wordmarkSub: "Baloncesto" }} />);

    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("Club A");
    expect(header).toHaveTextContent("Baloncesto");
    // La marca, nombre y subtítulo, va en la fuente de títulos.
    expect(screen.getByText("Club A").closest(".font-display")).not.toBeNull();
    expect(screen.getByText("Baloncesto").closest(".font-display")).not.toBeNull();
  });

  it("sin subtítulo solo muestra el nombre", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: null }} />);

    expect(screen.getByRole("banner").textContent).toBe("Club B");
  });

  it("un subtítulo vacío no deja un hueco", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: "  " }} />);

    expect(screen.getByRole("banner").textContent).toBe("Club B");
  });

  it("sin cuenta no pinta el menú de cuenta", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: null }} />);

    expect(screen.queryByRole("button", { name: "Abrir menú de cuenta" })).not.toBeInTheDocument();
  });

  it("con cuenta pinta el menú a la derecha de la marca, dentro de la cabecera", () => {
    render(
      <TopNavigation
        brand={{ displayName: "Club B", wordmarkSub: null }}
        account={{ name: "Ana Ruiz", links: [{ label: "Gestión", href: "/c/club-b/admin" }] }}
      />,
    );

    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Abrir menú de cuenta" });
    expect(within(toggle).getByRole("img", { name: "Ana Ruiz" })).toBeInTheDocument();
    expect(header.firstElementChild?.textContent).toBe("Club B");

    fireEvent.click(toggle);
    expect(within(header).getByRole("link", { name: "Gestión" })).toHaveAttribute(
      "href",
      "/c/club-b/admin",
    );
    expect(within(header).getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("con cuenta sin enlaces el menú solo ofrece Salir", () => {
    render(
      <TopNavigation
        brand={{ displayName: "Club B", wordmarkSub: null }}
        account={{ name: "Ana Ruiz", links: [] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
    expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("un nombre o un subtítulo larguísimos se truncan en vez de ensanchar la pantalla", () => {
    const displayName = "Club Deportivo de Baloncesto de Formación de la Comarca del Norte";
    const wordmarkSub = "Escueladebaloncestoyformacióndeportivadelacomarcadelnorte";
    render(<TopNavigation brand={{ displayName, wordmarkSub }} />);

    // El texto sigue entero en el documento (lo lee un lector de pantalla); lo que se
    // recorta es lo que se pinta, en una sola línea y con puntos suspensivos.
    const name = screen.getByText(displayName);
    const sub = screen.getByText(wordmarkSub);
    expect(name).toHaveClass("truncate");
    expect(sub).toHaveClass("truncate");

    // Para que el recorte funcione, la marca tiene que poder encoger dentro de la cabecera.
    const mark = name.parentElement;
    expect(mark).toBe(sub.parentElement);
    expect(mark).toHaveClass("min-w-0");
  });

  it("el recorte no se come los acentos de las mayúsculas", () => {
    render(<TopNavigation brand={{ displayName: "Águilas", wordmarkSub: "Cantera" }} />);

    // `truncate` oculta lo que sobresale de la caja y, con interlínea 1, el acento de una
    // mayúscula sobresale. Cada línea lleva un relleno vertical que le hace sitio y un
    // margen negativo igual que lo compensa: la marca ocupa lo mismo.
    for (const line of [screen.getByText("Águilas"), screen.getByText("Cantera")]) {
      expect(line).toHaveClass("truncate", "py-(--space-1)", "-my-(--space-1)");
    }
  });
});

describe("TopNavigation · cabecera de inicio y su coexistencia con la de detalle", () => {
  describe("selector de equipo", () => {
    const BRAND = { displayName: "Club A", wordmarkSub: null };
    const TEAM_A = { id: "00000000-0000-4000-8000-0000000000a1", name: "Equipo A" };
    const TEAM_B = { id: "00000000-0000-4000-8000-0000000000b1", name: "Equipo B" };
    const switcher = () => screen.queryByRole("button", { name: /Cambiar de equipo$/ });

    it("sin `team` no hay selector", () => {
      render(<TopNavigation brand={BRAND} />);

      expect(switcher()).not.toBeInTheDocument();
    });

    it("con un solo equipo no hay nada que elegir: no se pinta", () => {
      render(<TopNavigation brand={BRAND} team={{ clubSlug: "club-a", teams: [TEAM_A], activeId: null }} />);

      expect(switcher()).not.toBeInTheDocument();
    });

    it("con varios, va en la cabecera, antes del menú de cuenta, con el equipo que se está viendo", () => {
      render(
        <TopNavigation
          brand={BRAND}
          account={{ name: "Ana Ruiz", links: [] }}
          team={{ clubSlug: "club-a", teams: [TEAM_A, TEAM_B], activeId: TEAM_B.id }}
        />,
      );

      const buttons = within(screen.getByRole("banner")).getAllByRole("button");
      expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
        "Equipo B. Cambiar de equipo",
        "Abrir menú de cuenta",
      ]);
    });

    it("sin equipo elegido dice «Todos»", () => {
      render(<TopNavigation brand={BRAND} team={{ clubSlug: "club-a", teams: [TEAM_A, TEAM_B], activeId: null }} />);

      expect(switcher()).toHaveTextContent("Todos");
    });
  });

  it("variant «home» es lo mismo que no decir nada", () => {
    render(<TopNavigation variant="home" brand={{ displayName: "Club A", wordmarkSub: "Baloncesto" }} />);

    expect(screen.getByRole("banner")).toHaveTextContent("Club A");
    expect(screen.getByRole("banner")).toHaveTextContent("Baloncesto");
  });

  it("se marca como cabecera de inicio", () => {
    render(<TopNavigation brand={{ displayName: "Club A", wordmarkSub: null }} />);

    expect(screen.getByRole("banner")).toHaveAttribute("data-topnav", "home");
  });

  it("se oculta cuando la pantalla trae su propia cabecera de detalle", () => {
    render(<TopNavigation brand={{ displayName: "Club A", wordmarkSub: null }} />);

    // `:has()` no se evalúa en jsdom: aquí se comprueba la regla; que de verdad se oculta lo
    // prueba el e2e de la biblioteca. El marco de la app (`AppShell`) es el grupo `shell`.
    expect(screen.getByRole("banner")).toHaveClass("group-has-[[data-topnav=detail]]/shell:hidden");
  });
});

describe("TopNavigation · detail", () => {
  const detail = { variant: "detail", title: "Ejercicio", backHref: "/c/club-a/train/library" } as const;

  it("muestra el título de la pantalla", () => {
    render(<TopNavigation {...detail} />);

    expect(screen.getByText("Ejercicio")).toBeInTheDocument();
  });

  it("el título va en mayúsculas, en la fuente de títulos, centrado", () => {
    render(<TopNavigation {...detail} />);

    expect(screen.getByText("Ejercicio")).toHaveClass(
      "font-display",
      "text-title",
      "uppercase",
      "text-center",
    );
  });

  it("el título no es un encabezado: el <h1> es el de la página", () => {
    render(
      <>
        <TopNavigation {...detail} />
        <h1>Rebote + outlet</h1>
      </>,
    );

    // Con un encabezado en la cabecera, una pantalla con su propio <h1> tendría dos.
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Rebote + outlet" })).toBeInTheDocument();
  });

  it("volver es un enlace de 44×44 a backHref, con nombre accesible", () => {
    render(<TopNavigation {...detail} />);

    const back = screen.getByRole("link", { name: "Volver" });
    expect(back).toHaveAttribute("href", "/c/club-a/train/library");
    expect(back).toHaveClass("size-(--target-min)");
    // El nombre es la etiqueta, no el icono; el icono es decorativo.
    expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("volver es el primer elemento de la cabecera", () => {
    render(<TopNavigation {...detail} />);

    const header = document.querySelector("[data-topnav='detail']");
    expect(header?.firstElementChild).toBe(screen.getByRole("link", { name: "Volver" }));
  });

  it("sin acción solo hay el enlace de volver", () => {
    render(<TopNavigation {...detail} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("con acción pinta su enlace a la derecha del título", () => {
    render(
      <TopNavigation
        {...detail}
        action={{ label: "Editar", href: "/c/club-a/admin/drills/1" }}
      />,
    );

    const action = screen.getByRole("link", { name: "Editar" });
    expect(action).toHaveAttribute("href", "/c/club-a/admin/drills/1");
    expect(action).toHaveClass("min-h-(--target-min)");
    expect(
      screen.getByText("Ejercicio").compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("sin acción deja un hueco del tamaño de «volver» para que el título quede centrado", () => {
    render(<TopNavigation {...detail} />);

    const header = document.querySelector("[data-topnav='detail']");
    const spacer = header?.lastElementChild;
    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(spacer).toHaveClass("w-(--target-min)", "shrink-0");
  });

  it("un título larguísimo se trunca en vez de ensanchar la pantalla", () => {
    const title = "Un título de pantalla larguísimo que no cabe entre el botón de volver y la acción";
    render(<TopNavigation {...detail} title={title} action={{ label: "Editar", href: "/x" }} />);

    expect(screen.getByText(title)).toHaveClass("min-w-0", "flex-1", "truncate");
  });

  it("se queda arriba al desplazar y mide como la de inicio", () => {
    render(<TopNavigation {...detail} />);

    const header = document.querySelector("[data-topnav='detail']");
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveClass(
      "sticky",
      "top-0",
      "z-10",
      "bg-bg",
      "top-nav-line",
      "min-h-[calc(var(--header-height)+env(safe-area-inset-top))]",
      "pt-[env(safe-area-inset-top)]",
    );
  });

  it("no se oculta a sí misma cuando hay una cabecera de detalle", () => {
    render(<TopNavigation {...detail} />);

    expect(document.querySelector("[data-topnav='detail']")?.className).not.toContain("group-has");
  });

  it("conserva el anillo de foco en sus enlaces", () => {
    render(<TopNavigation {...detail} action={{ label: "Editar", href: "/x" }} />);

    for (const name of ["Volver", "Editar"]) {
      expect(screen.getByRole("link", { name })).toHaveClass(
        "focus-visible:outline-2",
        "focus-visible:outline-focus-ring",
      );
    }
  });
});
