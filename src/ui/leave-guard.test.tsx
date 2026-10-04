import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

// Solo el router es de pega.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { LeaveGuardDialog, useLeaveGuard } from "./leave-guard";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const HREF = "/c/club-a/train/e1";

function Harness({ dirty }: { dirty: boolean }) {
  const { guard, dialog, release } = useLeaveGuard(dirty);

  return (
    <>
      <a href={HREF} onClick={guard}>
        Volver a la sesión
      </a>
      <button type="button" onClick={release}>
        Recargar
      </button>
      <LeaveGuardDialog {...dialog} />
    </>
  );
}

const link = () => screen.getByRole("link", { name: "Volver a la sesión" });

/**
 * Pulsa el enlace y dice si el clic habría llegado a navegar. jsdom no implementa la
 * navegación (la registra como error): el clic se corta en `document`, ya después de que React
 * y el gancho lo hayan visto, y se mira si el gancho lo había cancelado.
 */
function clickLink(init: MouseEventInit = {}): "navega" | "se detiene" {
  let outcome: "navega" | "se detiene" = "navega";
  const cut = (event: Event) => {
    outcome = event.defaultPrevented ? "se detiene" : "navega";
    event.preventDefault();
  };
  document.addEventListener("click", cut);
  fireEvent.click(link(), init);
  document.removeEventListener("click", cut);
  return outcome;
}

/**
 * Lo que haría el navegador al cerrar o recargar la pestaña: lanza `beforeunload` y dice si
 * algo pidió confirmación (cancelando el evento).
 */
function unloadAsks(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("useLeaveGuard · clic en un enlace", () => {
  it("sin cambios, el clic navega y no pregunta nada", () => {
    render(<Harness dirty={false} />);

    expect(clickLink()).toBe("navega");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("con cambios, detiene el clic y abre el diálogo", () => {
    render(<Harness dirty />);

    expect(clickLink()).toBe("se detiene");

    expect(screen.getByRole("alertdialog", { name: "¿Salir sin guardar?" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Mayús", { shiftKey: true }],
    ["el botón central", { button: 1 }],
  ])("con %s deja pasar el clic: abre otra pestaña y esta se queda como está", (_name, init) => {
    render(<Harness dirty />);

    expect(clickLink(init)).toBe("navega");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("«Salir sin guardar» navega con router.push al href del enlace, tal como está escrito", () => {
    render(<Harness dirty />);
    clickLink();

    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    // El atributo, no la propiedad `href` del navegador, que lo completa con el origen.
    expect(mocks.push).toHaveBeenCalledWith(HREF);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("«Seguir editando» cierra el diálogo y no navega", () => {
    render(<Harness dirty />);
    clickLink();

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("Escape cierra el diálogo y no navega", () => {
    render(<Harness dirty />);
    clickLink();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("tras seguir editando, un nuevo clic vuelve a preguntar", () => {
    render(<Harness dirty />);
    clickLink();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(clickLink()).toBe("se detiene");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("si los cambios se guardan con el diálogo abierto, confirmar sigue llevando al destino", () => {
    const { rerender } = render(<Harness dirty />);
    clickLink();

    rerender(<Harness dirty={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(mocks.push).toHaveBeenCalledWith(HREF);
  });
});

// Lo que rodea a la pantalla que usa el gancho: la navegación de la app (enlaces de `next/link`,
// como los de `BottomNavigation`) y otros enlaces que ella no pinta ni conoce. Ninguno lleva
// `guard`.
function Screen({ dirty, screens = 1 }: { dirty: boolean; screens?: number }) {
  return (
    <>
      <nav aria-label="Principal">
        <Link href="/c/club-a/way" prefetch={false}>
          <span>The Way</span>
        </Link>
        <Link href="/c/club-a/train?scope=history#lista" prefetch={false}>
          Histórico
        </Link>
        <Link href="/c/club-a/way" prefetch={false} target="_blank" rel="noreferrer">
          The Way en otra pestaña
        </Link>
        <Link href="/c/club-a/way" prefetch={false} target="_self">
          The Way aquí mismo
        </Link>
        <a href="/informe.pdf" download>
          Descargar el informe
        </a>
        <a href="https://ayuda.example/guia">Ayuda</a>
        <a href="#resumen">Ir al resumen</a>
        <a href="#">Arriba</a>
        <a href="http://">Enlace roto</a>
        <button type="button">Abrir menú</button>
      </nav>
      {Array.from({ length: screens }, (_, index) => (
        <Harness key={index} dirty={dirty} />
      ))}
    </>
  );
}

/** Pulsa `target` (un enlace, o algo de dentro) y dice si el clic habría llegado a navegar. */
function click(target: Element, init: MouseEventInit = {}): "navega" | "se detiene" {
  let outcome: "navega" | "se detiene" = "navega";
  const cut = (event: Event) => {
    outcome = event.defaultPrevented ? "se detiene" : "navega";
    event.preventDefault();
  };
  document.addEventListener("click", cut);
  fireEvent.click(target, init);
  document.removeEventListener("click", cut);
  return outcome;
}

const navLink = (name: string) => screen.getByRole("link", { name });
const leaveDialogs = () => screen.queryAllByRole("alertdialog", { name: "¿Salir sin guardar?" });

describe("useLeaveGuard · cualquier enlace de la app", () => {
  // La navegación inferior queda a un dedo de «Guardar»: un toque fallido no puede tirar lo escrito.
  it("con cambios, un enlace que la pantalla no conoce también se detiene y pregunta", () => {
    render(<Screen dirty />);

    // El toque cae en lo de dentro del enlace (su icono, su texto), no en el `<a>`.
    expect(click(screen.getByText("The Way"))).toBe("se detiene");

    expect(leaveDialogs()).toHaveLength(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("«Salir sin guardar» lleva a ese enlace, con su búsqueda y su ancla", () => {
    render(<Screen dirty />);
    click(navLink("Histórico"));

    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/c/club-a/train?scope=history#lista");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it("«Seguir editando» cierra el diálogo y no navega; otro clic vuelve a preguntar", () => {
    render(<Screen dirty />);
    click(navLink("The Way"));

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(leaveDialogs()).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();

    expect(click(navLink("The Way"))).toBe("se detiene");
    expect(leaveDialogs()).toHaveLength(1);
  });

  it("sin cambios, el clic pasa y no pregunta nada", () => {
    render(<Screen dirty={false} />);

    expect(click(navLink("The Way"))).toBe("navega");
    expect(click(navLink("Histórico"))).toBe("navega");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it("`target=\"_self\"` es navegar aquí mismo: también pregunta", () => {
    render(<Screen dirty />);

    expect(click(navLink("The Way aquí mismo"))).toBe("se detiene");
    expect(leaveDialogs()).toHaveLength(1);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Mayús", { shiftKey: true }],
    ["el botón central", { button: 1 }],
  ])("con %s deja pasar el clic: abre otra pestaña y esta se queda como está", (_name, init) => {
    render(<Screen dirty />);

    expect(click(navLink("The Way"), init)).toBe("navega");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it.each([
    ["un enlace que abre otra pestaña", "The Way en otra pestaña"],
    ["una descarga", "Descargar el informe"],
    ["un enlace a otro sitio", "Ayuda"],
    ["un ancla de esta misma página", "Ir al resumen"],
    ["un enlace vacío a esta misma página", "Arriba"],
    // Lo puede escribir cualquiera en un texto en Markdown: no lleva a ningún sitio, y no rompe nada.
    ["un enlace con una dirección imposible", "Enlace roto"],
  ])("%s no saca de la pantalla: pasa sin preguntar", (_what, name) => {
    render(<Screen dirty />);

    expect(click(navLink(name))).toBe("navega");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it("lo que no es un enlace no se toca", () => {
    render(<Screen dirty />);

    expect(click(screen.getByRole("button", { name: "Abrir menú" }))).toBe("navega");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it("un enlace que además lleva `guard` abre el diálogo una sola vez, con su destino", () => {
    render(<Screen dirty />);

    expect(click(link())).toBe("se detiene");

    expect(leaveDialogs()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(HREF);
  });

  it("dos pantallas con el gancho no preguntan dos veces por el mismo clic", () => {
    render(<Screen dirty screens={2} />);

    expect(click(navLink("The Way"))).toBe("se detiene");

    expect(leaveDialogs()).toHaveLength(1);
  });

  it("sigue a `dirty`: pregunta al haber cambios y deja de preguntar al dejar de haberlos", () => {
    const { rerender } = render(<Screen dirty={false} />);

    rerender(<Screen dirty />);
    expect(click(navLink("The Way"))).toBe("se detiene");
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));

    rerender(<Screen dirty={false} />);
    expect(click(navLink("The Way"))).toBe("navega");
  });

  it("`release` lo quita al momento, como el aviso de la pestaña", () => {
    render(<Screen dirty />);

    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));

    expect(click(navLink("The Way"))).toBe("navega");
    expect(leaveDialogs()).toHaveLength(0);
  });

  it("al salir de la pantalla ya no pregunta", () => {
    const { rerender } = render(<Screen dirty />);

    rerender(<Screen dirty screens={0} />);

    expect(click(navLink("The Way"))).toBe("navega");
  });
});

describe("LeaveGuardDialog", () => {
  it("pregunta en español, con la salida peligrosa marcada como tal", async () => {
    render(<Harness dirty />);
    clickLink();

    const dialog = screen.getByRole("alertdialog", { name: "¿Salir sin guardar?" });
    expect(dialog).toHaveAccessibleDescription("Tienes cambios sin guardar. Si sales, se pierden.");
    expect(screen.getByRole("button", { name: "Salir sin guardar" })).toHaveClass("border-danger");
    expect(screen.getByRole("button", { name: "Seguir editando" })).toHaveClass("border-line-strong");
    // El foco cae en lo que no pierde nada.
    await waitFor(() => expect(screen.getByRole("button", { name: "Seguir editando" })).toHaveFocus());
  });

  it("cerrado no pinta nada", () => {
    render(<LeaveGuardDialog open={false} onOpenChange={() => {}} onConfirm={() => {}} />);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("useLeaveGuard · cerrar o recargar la pestaña", () => {
  it("con cambios, pide confirmación al navegador", () => {
    render(<Harness dirty />);

    expect(unloadAsks()).toBe(true);
  });

  it("sin cambios, no pide nada", () => {
    render(<Harness dirty={false} />);

    expect(unloadAsks()).toBe(false);
  });

  it("sigue a `dirty`: pone el aviso al haber cambios y lo quita al dejar de haberlos", () => {
    const { rerender } = render(<Harness dirty={false} />);

    rerender(<Harness dirty />);
    expect(unloadAsks()).toBe(true);

    rerender(<Harness dirty={false} />);
    expect(unloadAsks()).toBe(false);
  });

  it("al salir de la pantalla ya no avisa", () => {
    const { unmount } = render(<Harness dirty />);
    expect(unloadAsks()).toBe(true);

    unmount();

    expect(unloadAsks()).toBe(false);
  });

  it("`release` quita el aviso al momento, aunque siga habiendo cambios", () => {
    const { rerender } = render(<Harness dirty />);
    expect(unloadAsks()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
    expect(unloadAsks()).toBe(false);

    // Una nueva pintura con lo mismo sin guardar no lo vuelve a poner.
    rerender(<Harness dirty />);
    expect(unloadAsks()).toBe(false);
  });

  it("dos pantallas con el gancho no se pisan: quitar una no quita el aviso de la otra", () => {
    const first = render(<Harness dirty />);
    const second = render(<Harness dirty />);

    second.unmount();
    expect(unloadAsks()).toBe(true);

    first.unmount();
    expect(unloadAsks()).toBe(false);
  });

  // `dirty` suele dejar de serlo al llegar el resultado de guardar, que se aplica en una
  // transición: una pintura que no es urgente y cuyos efectos pasivos React corre en un turno
  // posterior. Un efecto pasivo dejaría el aviso puesto un instante después de enseñar lo
  // guardado (el navegador preguntaría al cerrar la pestaña sin nada pendiente, y un test que
  // mirase en cuanto aparece el texto, según la carga, lo vería puesto). El aviso sigue a
  // `dirty` en la misma pintura. Se mira en el instante en que el texto entra en el documento:
  // un MutationObserver corre justo después de esa pintura y antes de cualquier otro turno.
  it("al quitarse `dirty` en una transición, el aviso se quita en la misma pintura", async () => {
    function Saver() {
      const [dirty, setDirty] = useState(true);
      const [, startTransition] = useTransition();
      useLeaveGuard(dirty);

      function save() {
        // Como `useAction`: la espera es una transición y el resultado, otra, tras un await.
        startTransition(async () => {
          await Promise.resolve();
          startTransition(() => setDirty(false));
        });
      }

      return (
        <>
          <p>{dirty ? "Sin guardar" : "Guardado"}</p>
          <button type="button" onClick={save}>
            Guardar
          </button>
        </>
      );
    }
    render(
      <>
        <Link href="/c/club-a/way" prefetch={false}>
          The Way
        </Link>
        <Saver />
      </>,
    );
    expect(unloadAsks()).toBe(true);
    expect(click(navLink("The Way"))).toBe("se detiene");

    // Ni la pestaña ni un enlace cualquiera de la app: los dos avisos siguen a `dirty` a la vez.
    let askedWhenShown: { tab: boolean; link: boolean } | null = null;
    const observer = new MutationObserver(() => {
      if (askedWhenShown === null && screen.queryByText("Guardado")) {
        askedWhenShown = { tab: unloadAsks(), link: click(navLink("The Way")) === "se detiene" };
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    observer.disconnect();

    expect(askedWhenShown).toEqual({ tab: false, link: false });
  });
});
