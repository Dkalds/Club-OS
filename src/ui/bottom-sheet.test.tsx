import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./bottom-sheet";

// Radix avisa por consola si el diálogo no tiene descripción o título, y React si algo está
// mal montado. La salida de los tests tiene que quedar limpia.
let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function renderSheet(props: Partial<Parameters<typeof BottomSheet>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <BottomSheet open onOpenChange={onOpenChange} title="Duración" {...props}>
      <p>Contenido de la hoja</p>
    </BottomSheet>,
  );

  return onOpenChange;
}

describe("BottomSheet", () => {
  it("con open muestra el título, el contenido y el pie", () => {
    render(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Duración"
        footer={<button type="button">Aplicar</button>}
      >
        <p>Contenido de la hoja</p>
      </BottomSheet>,
    );

    const sheet = screen.getByRole("dialog", { name: "Duración" });
    expect(within(sheet).getByRole("heading", { name: "Duración" })).toBeInTheDocument();
    expect(within(sheet).getByText("Contenido de la hoja")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
  });

  it("cerrada no pinta nada", () => {
    renderSheet({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Contenido de la hoja")).not.toBeInTheDocument();
  });

  it("sin pie no deja un hueco para él", () => {
    renderSheet();

    const sheet = screen.getByRole("dialog");
    expect(sheet.querySelector("[data-sheet-footer]")).toBeNull();
  });

  it("el botón «Cerrar» llama a onOpenChange(false)", () => {
    const onOpenChange = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("«Cerrar» mide 44 px como mínimo y es un botón normal", () => {
    renderSheet();

    const close = screen.getByRole("button", { name: "Cerrar" });
    expect(close).toHaveClass("min-h-(--target-min)");
    expect(close).toHaveAttribute("type", "button");
  });

  it("Escape llama a onOpenChange(false)", () => {
    const onOpenChange = renderSheet();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pulsar el fondo llama a onOpenChange(false)", async () => {
    const onOpenChange = renderSheet();
    const overlay = document.querySelector("[data-sheet-overlay]");
    expect(overlay).not.toBeNull();
    // Radix empieza a escuchar el exterior en el turno siguiente al montaje.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Una pulsación entera: Radix espera al clic para cerrar y que el toque no se cuele
    // a lo que haya debajo.
    fireEvent.pointerDown(overlay as Element);
    fireEvent.pointerUp(overlay as Element);
    fireEvent.click(overlay as Element);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pulsar dentro de la hoja no la cierra", async () => {
    const onOpenChange = renderSheet();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const content = screen.getByText("Contenido de la hoja");
    fireEvent.pointerDown(content);
    fireEvent.pointerUp(content);
    fireEvent.click(content);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("al abrirse lleva el foco dentro y al cerrarse lo devuelve a quien la abrió", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir hoja
          </button>
          <BottomSheet open={open} onOpenChange={setOpen} title="Duración">
            <p>Contenido de la hoja</p>
          </BottomSheet>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir hoja" });
    act(() => opener.focus());
    fireEvent.click(opener);

    // El foco queda atrapado dentro del diálogo.
    const sheet = screen.getByRole("dialog");
    await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));

    fireEvent.click(within(sheet).getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("deja el resto de la página oculta a los lectores de pantalla mientras está abierta", () => {
    render(
      <>
        <main>
          <p>Página</p>
        </main>
        <BottomSheet open onOpenChange={() => {}} title="Duración">
          <p>Contenido de la hoja</p>
        </BottomSheet>
      </>,
    );

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("va anclada abajo, con radius-xl arriba y shadow-sheet", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toHaveClass(
      "fixed",
      "bottom-0",
      "rounded-t-xl",
      "shadow-sheet",
      "bg-surface-1",
    );
  });

  it("no es nunca más ancha que la columna de contenido de la app", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toHaveClass("w-full", "max-w-(--content-max)");
  });

  it("respeta el área segura inferior del dispositivo", () => {
    renderSheet({ footer: <button type="button">Aplicar</button> });

    expect(screen.getByRole("dialog").className).toContain("safe-area-inset-bottom");
  });

  it("no ocupa nunca toda la pantalla y el contenido largo se desplaza dentro", () => {
    renderSheet();

    const sheet = screen.getByRole("dialog");
    expect(sheet.className).toContain("max-h-[calc(100dvh-var(--space-12))]");
    expect(screen.getByText("Contenido de la hoja").parentElement).toHaveClass("overflow-y-auto");
  });

  it("el fondo usa el velo de plataforma, a pantalla completa", () => {
    renderSheet();

    expect(document.querySelector("[data-sheet-overlay]")).toHaveClass(
      "fixed",
      "inset-0",
      "bg-scrim",
    );
  });

  it("se pinta dentro del contenedor del club, para heredar sus colores de marca", () => {
    render(
      <div data-club="club-a" data-testid="club">
        <BottomSheet open onOpenChange={() => {}} title="Duración">
          <p>Contenido de la hoja</p>
        </BottomSheet>
      </div>,
    );

    // Los colores del club viven en ese contenedor, no en <html>: una hoja en <body> los
    // perdería y pintaría el acento de plataforma.
    expect(screen.getByTestId("club")).toContainElement(screen.getByRole("dialog"));
  });

  it("fuera de un club se pinta en <body>", () => {
    renderSheet();

    expect(screen.getByRole("dialog").parentElement).toBe(document.body);
  });

  it("no lleva descripción asociada y no escribe avisos en la consola", () => {
    renderSheet();

    // Lo de la consola lo comprueba el `afterEach`.
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });
});
