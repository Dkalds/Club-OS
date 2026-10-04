import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
