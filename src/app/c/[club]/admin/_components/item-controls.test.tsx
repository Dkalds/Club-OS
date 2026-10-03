import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { ContentStatus, MethodologyKind } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({ moveMethodologyItem: vi.fn(), setMethodologyStatus: vi.fn() }));

vi.mock("@/modules/methodology/actions", () => ({
  moveMethodologyItem: mocks.moveMethodologyItem,
  setMethodologyStatus: mocks.setMethodologyStatus,
}));

import { ItemControls } from "./item-controls";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";

type Props = Partial<{
  kind: MethodologyKind;
  status: ContentStatus;
  isFirst: boolean;
  isLast: boolean;
}>;

function controls(props: Props = {}) {
  return (
    <ItemControls
      clubSlug="club-a"
      kind="way_sections"
      id={ID}
      title="Una sección"
      status="draft"
      isFirst={false}
      isLast={false}
      {...props}
    />
  );
}

function renderControls(props: Props = {}) {
  const view = render(controls(props));
  return { ...view, update: (next: Props) => view.rerender(controls(next)) };
}

/** Una acción que no termina hasta que el test lo diga. */
function deferred() {
  let finish: (result: ActionResult<null>) => void = () => {};
  const promise = new Promise<ActionResult<null>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (result: ActionResult<null> = ok(null)) => finish(result) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.moveMethodologyItem.mockResolvedValue(ok(null));
  mocks.setMethodologyStatus.mockResolvedValue(ok(null));
});

describe("ItemControls", () => {
  it("«Subir» y «Bajar» dicen de qué fila hablan", () => {
    renderControls();

    expect(screen.getByRole("button", { name: "Subir Una sección" })).toHaveTextContent("Subir");
    expect(screen.getByRole("button", { name: "Bajar Una sección" })).toHaveTextContent("Bajar");
  });

  it("la primera no sube y la última no baja", () => {
    const { unmount } = renderControls({ isFirst: true });
    expect(screen.getByRole("button", { name: "Subir Una sección" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Una sección" })).toBeEnabled();
    unmount();

    renderControls({ isLast: true });
    expect(screen.getByRole("button", { name: "Subir Una sección" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bajar Una sección" })).toBeDisabled();
  });

  it("una lista de una sola fila no sube ni baja", () => {
    renderControls({ isFirst: true, isLast: true });

    expect(screen.getByRole("button", { name: "Subir Una sección" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Una sección" })).toBeDisabled();
  });

  it("«Subir» manda la dirección «up» de esa fila, de esa lista y de ese club", async () => {
    renderControls({ kind: "standards" });

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));

    await waitFor(() => expect(mocks.moveMethodologyItem).toHaveBeenCalledTimes(1));
    expect(mocks.moveMethodologyItem).toHaveBeenCalledWith("club-a", {
      kind: "standards",
      id: ID,
      direction: "up",
    });
  });

  it("«Bajar» manda «down»", async () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Bajar Una sección" }));

    await waitFor(() => expect(mocks.moveMethodologyItem).toHaveBeenCalledTimes(1));
    expect(mocks.moveMethodologyItem).toHaveBeenCalledWith("club-a", {
      kind: "way_sections",
      id: ID,
      direction: "down",
    });
  });

  it("un borrador ofrece «Publicar» y lo publica", async () => {
    renderControls({ status: "draft" });

    expect(screen.queryByRole("button", { name: /Pasar a borrador/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publicar Una sección" }));

    await waitFor(() => expect(mocks.setMethodologyStatus).toHaveBeenCalledTimes(1));
    expect(mocks.setMethodologyStatus).toHaveBeenCalledWith("club-a", {
      kind: "way_sections",
      id: ID,
      status: "published",
    });
  });

  it("lo publicado ofrece «Pasar a borrador» (archivar) y lo pasa", async () => {
    renderControls({ status: "published" });

    expect(screen.getByRole("button", { name: "Pasar a borrador Una sección" })).toHaveTextContent(
      "Pasar a borrador",
    );
    expect(screen.queryByRole("button", { name: /Publicar/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pasar a borrador Una sección" }));

    await waitFor(() => expect(mocks.setMethodologyStatus).toHaveBeenCalledTimes(1));
    expect(mocks.setMethodologyStatus).toHaveBeenCalledWith("club-a", {
      kind: "way_sections",
      id: ID,
      status: "draft",
    });
  });

  it("mientras la acción corre, todos los botones esperan y no se puede lanzar otra", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.moveMethodologyItem.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderControls({ status: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bajar Una sección" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Subir Una sección" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publicar Una sección" })).toBeDisabled();

    finish(ok(null));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bajar Una sección" })).toBeEnabled(),
    );
    expect(mocks.moveMethodologyItem).toHaveBeenCalledTimes(1);
  });

  it("si la acción falla, dice por qué con el texto del error y deja los botones listos", async () => {
    mocks.setMethodologyStatus.mockResolvedValue(fail("SAVE_FAILED"));
    renderControls({ status: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "Publicar Una sección" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByRole("button", { name: "Publicar Una sección" })).toBeEnabled();
  });

  it("el error describe a los botones: todos lo llevan en aria-describedby mientras está, y ninguno sin él", async () => {
    mocks.setMethodologyStatus.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderControls({ status: "draft" });
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-describedby");
    }

    fireEvent.click(screen.getByRole("button", { name: "Publicar Una sección" }));

    const alert = await screen.findByRole("alert");
    expect(alert.id).not.toBe("");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(button).toHaveAttribute("aria-describedby", alert.id);

    // Al volver a intentarlo el error se quita, y con él lo que los enlazaba.
    fireEvent.click(screen.getByRole("button", { name: "Publicar Una sección" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-describedby");
    }
  });

  it("un error de orden con copia obsoleta enseña su propio texto", async () => {
    mocks.moveMethodologyItem.mockResolvedValue(fail("STALE_COPY"));
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.STALE_COPY);
  });

  it("el error se quita al volver a intentarlo", async () => {
    mocks.moveMethodologyItem.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.moveMethodologyItem.mockRejectedValue(new Error("fetch failed"));
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Subir Una sección" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
  });

  it("cada botón mide al menos target-min y ninguno envía un formulario", () => {
    renderControls();

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("min-h-(--target-min)");
      expect(button).toHaveAttribute("type", "button");
    }
  });

  // Mientras la acción corre, los botones se desactivan y el navegador suelta el foco que
  // tenían (queda en <body>): quien usa el teclado perdería su sitio en la lista. Al terminar,
  // el foco vuelve a lo que se usó. jsdom no lo suelta por sí solo (un botón desactivado sigue
  // siendo `activeElement`): `loseFocus` lo imita pasando el foco a un botón que se quita después.
  describe("foco", () => {
    function loseFocus() {
      const sink = document.createElement("button");
      document.body.append(sink);
      sink.focus();
      sink.remove();
      for (const button of screen.getAllByRole("button")) expect(button).not.toHaveFocus();
    }

    it("tras subir, el foco vuelve a «Subir»", async () => {
      const action = deferred();
      mocks.moveMethodologyItem.mockReturnValue(action.promise);
      renderControls();

      const up = screen.getByRole("button", { name: "Subir Una sección" });
      up.focus();
      fireEvent.click(up);
      await waitFor(() => expect(up).toBeDisabled());
      loseFocus();

      action.finish();

      await waitFor(() => expect(up).toHaveFocus());
    });

    it("si al subir la fila llega arriba, el foco pasa a «Bajar», el que aún se puede usar", async () => {
      const action = deferred();
      mocks.moveMethodologyItem.mockReturnValue(action.promise);
      const { update } = renderControls();

      const up = screen.getByRole("button", { name: "Subir Una sección" });
      up.focus();
      fireEvent.click(up);
      await waitFor(() => expect(up).toBeDisabled());
      loseFocus();
      // La lista se repinta con la fila ya en el primer puesto.
      update({ isFirst: true });

      action.finish();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Bajar Una sección" })).toHaveFocus(),
      );
    });

    it("tras bajar, el foco vuelve a «Bajar»", async () => {
      const action = deferred();
      mocks.moveMethodologyItem.mockReturnValue(action.promise);
      renderControls();

      const down = screen.getByRole("button", { name: "Bajar Una sección" });
      down.focus();
      fireEvent.click(down);
      await waitFor(() => expect(down).toBeDisabled());
      loseFocus();

      action.finish();

      await waitFor(() => expect(down).toHaveFocus());
    });

    it("tras publicar, el foco va al botón que ocupa su lugar: «Pasar a borrador»", async () => {
      const action = deferred();
      mocks.setMethodologyStatus.mockReturnValue(action.promise);
      const { update } = renderControls({ status: "draft" });

      const publish = screen.getByRole("button", { name: "Publicar Una sección" });
      publish.focus();
      fireEvent.click(publish);
      await waitFor(() => expect(publish).toBeDisabled());
      loseFocus();
      update({ status: "published" });

      action.finish();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Pasar a borrador Una sección" })).toHaveFocus(),
      );
    });

    it("si la acción falla, el foco también vuelve al botón que se pulsó", async () => {
      const action = deferred();
      mocks.moveMethodologyItem.mockReturnValue(action.promise);
      renderControls();

      const up = screen.getByRole("button", { name: "Subir Una sección" });
      up.focus();
      fireEvent.click(up);
      await waitFor(() => expect(up).toBeDisabled());
      loseFocus();

      action.finish(fail("SAVE_FAILED"));

      await screen.findByRole("alert");
      await waitFor(() => expect(up).toHaveFocus());
    });

    it("al pintarse por primera vez no roba el foco", () => {
      renderControls();

      expect(document.body).toHaveFocus();
    });
  });
});
