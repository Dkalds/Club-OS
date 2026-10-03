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

function renderControls(
  props: Partial<{
    kind: MethodologyKind;
    status: ContentStatus;
    isFirst: boolean;
    isLast: boolean;
  }> = {},
) {
  return render(
    <ItemControls
      clubSlug="club-a"
      kind="way_sections"
      id={ID}
      title="Una sección"
      status="draft"
      isFirst={false}
      isLast={false}
      {...props}
    />,
  );
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
});
