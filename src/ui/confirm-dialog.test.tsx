import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

// Radix avisa por consola si al diálogo le falta el título o la descripción, y React si algo
// está mal montado. La salida de los tests tiene que quedar limpia.
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

const TITLE = "¿Quitar el ejercicio?";
const BODY = "Se quita de la sesión. Puedes volver a añadirlo.";

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={TITLE}
      body={BODY}
      confirmLabel="Quitar"
      cancelLabel="Conservar"
      onConfirm={onConfirm}
      {...props}
    />,
  );

  return { onOpenChange, onConfirm };
}

const confirmButton = () => screen.getByRole("button", { name: "Quitar" });
const cancelButton = () => screen.getByRole("button", { name: "Conservar" });
const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

describe("ConfirmDialog", () => {
  it("abierto, es un alertdialog con su título como nombre y su cuerpo como descripción", () => {
    renderDialog();

    const dialog = screen.getByRole("alertdialog", { name: TITLE });
    expect(within(dialog).getByText(BODY)).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(BODY);
    expect(within(dialog).getByRole("button", { name: "Conservar" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Quitar" })).toBeInTheDocument();
  });

  it("cerrado no pinta nada", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText(BODY)).not.toBeInTheDocument();
  });

  it("confirmar llama a onConfirm y no cierra por su cuenta: eso lo decide quien lo monta", () => {
    const { onConfirm, onOpenChange } = renderDialog();

    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("cancelar llama a onOpenChange(false) y no confirma", () => {
    const { onConfirm, onOpenChange } = renderDialog();

    fireEvent.click(cancelButton());

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape llama a onOpenChange(false) y no confirma", () => {
    const { onConfirm, onOpenChange } = renderDialog();

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("pulsar el fondo no lo cierra: un aviso que pide decidir no se descarta sin querer", async () => {
    const { onOpenChange } = renderDialog();
    const overlay = document.querySelector("[data-dialog-overlay]");
    expect(overlay).not.toBeNull();
    // Radix empieza a escuchar el exterior en el turno siguiente al montaje.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.pointerDown(overlay as Element);
    fireEvent.pointerUp(overlay as Element);
    fireEvent.click(overlay as Element);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("con pending, los dos botones quedan desactivados y no llaman a nada", () => {
    const { onConfirm, onOpenChange } = renderDialog({ pending: true });

    expect(confirmButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    fireEvent.click(cancelButton());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("con pending, Escape tampoco lo cierra: lo que está en marcha no se deja a medias", () => {
    const { onOpenChange } = renderDialog({ pending: true });

    pressEscape();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("por defecto confirma con el botón primary y cancela con el secondary", () => {
    renderDialog();

    expect(confirmButton()).toHaveClass("bg-brand-accent", "text-brand-on-accent");
    expect(cancelButton()).toHaveClass("border-line-strong", "text-ink");
  });

  it("con tone danger, confirmar es el botón danger", () => {
    renderDialog({ tone: "danger" });

    expect(confirmButton()).toHaveClass("border-danger", "text-danger");
    expect(confirmButton()).not.toHaveClass("bg-brand-accent");
    expect(cancelButton()).toHaveClass("border-line-strong");
  });

  it("los dos botones son botones normales y miden 44 px como mínimo", () => {
    renderDialog();

    for (const button of [confirmButton(), cancelButton()]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveClass("min-h-(--target-min)");
    }
  });

  it("al abrirse, el foco cae en cancelar: la salida que no destruye nada", async () => {
    renderDialog({ tone: "danger" });

    await waitFor(() => expect(cancelButton()).toHaveFocus());
  });

  it("el foco queda dentro mientras está abierto y vuelve a quien lo abrió al cerrarse", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Quitar ejercicio
          </button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title={TITLE}
            body={BODY}
            confirmLabel="Quitar"
            cancelLabel="Conservar"
            onConfirm={() => {}}
          />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Quitar ejercicio" });
    act(() => opener.focus());
    fireEvent.click(opener);

    const dialog = screen.getByRole("alertdialog");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.click(cancelButton());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("deja el resto de la página oculta a los lectores de pantalla mientras está abierto", () => {
    render(
      <>
        <main>
          <p>Página</p>
        </main>
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title={TITLE}
          body={BODY}
          confirmLabel="Quitar"
          cancelLabel="Conservar"
          onConfirm={() => {}}
        />
      </>,
    );

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("el panel es surface-1 con radius-xl y shadow-sheet, sobre el velo de plataforma", () => {
    renderDialog();

    expect(screen.getByRole("alertdialog")).toHaveClass("bg-surface-1", "rounded-xl", "shadow-sheet");
    expect(document.querySelector("[data-dialog-overlay]")).toHaveClass("fixed", "inset-0", "bg-scrim");
  });

  it("no es nunca más ancho que la columna de contenido de la app", () => {
    renderDialog();

    expect(screen.getByRole("alertdialog")).toHaveClass("w-[calc(100%-var(--space-8))]", "max-w-(--content-max)");
  });

  it("se pinta dentro del contenedor del club, para heredar sus colores de marca", () => {
    render(
      <div data-club="club-a" data-testid="club">
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title={TITLE}
          body={BODY}
          confirmLabel="Quitar"
          cancelLabel="Conservar"
          onConfirm={() => {}}
        />
      </div>,
    );

    // El acento del botón principal es del club y vive en ese contenedor, no en <html>.
    expect(screen.getByTestId("club")).toContainElement(screen.getByRole("alertdialog"));
  });

  it("fuera de un club se pinta en <body>", () => {
    renderDialog();

    expect(screen.getByRole("alertdialog").parentElement).toBe(document.body);
  });
});
