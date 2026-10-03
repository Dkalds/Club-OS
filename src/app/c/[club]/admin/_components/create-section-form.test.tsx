import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({ createWaySection: vi.fn(), push: vi.fn() }));

vi.mock("@/modules/methodology/actions", () => ({ createWaySection: mocks.createWaySection }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { CreateSectionForm } from "./create-section-form";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createWaySection.mockResolvedValue(ok({ id: NEW_ID }));
});

function fillTitle(title: string) {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: title } });
}

describe("CreateSectionForm", () => {
  it("pide el título y el tipo, y ofrece «Crear sección»", () => {
    render(<CreateSectionForm clubSlug="club-a" />);

    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Tipo")).toHaveValue("text");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Texto",
      "Valores",
      "Principios",
      "Standards",
    ]);
    expect(screen.getByRole("button", { name: "Crear sección" })).toHaveAttribute("type", "submit");
  });

  it("el botón es el primary de la pantalla", () => {
    render(<CreateSectionForm clubSlug="club-a" />);

    expect(screen.getByRole("button", { name: "Crear sección" })).toHaveClass(
      "bg-brand-accent",
      "text-brand-on-accent",
    );
  });

  it("crea la sección con el título y el tipo elegidos, y abre su editor", async () => {
    render(<CreateSectionForm clubSlug="club-a" />);

    fillTitle("Plan de trabajo");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "principles" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.createWaySection).toHaveBeenCalledWith("club-a", {
      title: "Plan de trabajo",
      contentKind: "principles",
    });
    // La sección se identifica por su uuid, nunca por su título.
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/admin/way/${NEW_ID}`);
  });

  it("sin cambiar el tipo crea una sección de texto", async () => {
    render(<CreateSectionForm clubSlug="club-a" />);

    fillTitle("Otra sección");
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    await waitFor(() => expect(mocks.createWaySection).toHaveBeenCalledTimes(1));
    expect(mocks.createWaySection).toHaveBeenCalledWith("club-a", {
      title: "Otra sección",
      contentKind: "text",
    });
  });

  it("mientras se crea, el botón espera: un doble toque no crea dos secciones", async () => {
    let finish: (value: Awaited<ReturnType<typeof mocks.createWaySection>>) => void = () => {};
    mocks.createWaySection.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<CreateSectionForm clubSlug="club-a" />);

    fillTitle("Una");
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Crear sección" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));
    expect(mocks.createWaySection).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("un título vacío: el error del campo bajo el campo y el aviso general arriba", async () => {
    mocks.createWaySection.mockResolvedValue(fail("INVALID", { title: "Escribe un título." }));
    render(<CreateSectionForm clubSlug="club-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    const fieldError = await screen.findByText("Escribe un título.");
    const title = screen.getByLabelText("Título");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-describedby", fieldError.id);
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el error de un campo se quita al volver a enviar", async () => {
    mocks.createWaySection.mockResolvedValueOnce(fail("INVALID", { title: "Escribe un título." }));
    render(<CreateSectionForm clubSlug="club-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));
    await screen.findByText("Escribe un título.");

    fillTitle("Ya tiene título");
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Escribe un título.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("si no se puede guardar, lo dice con el copy del contrato y no abre nada", async () => {
    mocks.createWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    render(<CreateSectionForm clubSlug="club-a" />);

    fillTitle("Una");
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar. Inténtalo de nuevo.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título")).toHaveValue("Una");
    expect(screen.getByRole("button", { name: "Crear sección" })).toBeEnabled();
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.createWaySection.mockRejectedValue(new Error("fetch failed"));
    render(<CreateSectionForm clubSlug="club-a" />);

    fillTitle("Una");
    fireEvent.click(screen.getByRole("button", { name: "Crear sección" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
