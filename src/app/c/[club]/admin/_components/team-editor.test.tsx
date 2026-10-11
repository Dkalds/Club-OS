import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  createTeam: mocks.createTeam,
  updateTeam: mocks.updateTeam,
  deleteTeam: mocks.deleteTeam,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { TeamDelete, TeamEditor } from "./team-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM_ID = uuid(1);
const SEASON_ID = uuid(2);
const SMALL = uuid(10);
const BIG = uuid(20);
const NEW_ID = uuid(170);

const CATEGORIES = [
  { id: SMALL, name: "Pequeños" },
  { id: BIG, name: "Mayores" },
];
const TEAM = { id: TEAM_ID, name: "Equipo A", categoryId: BIG };

const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear equipo" }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createTeam.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateTeam.mockResolvedValue(ok(null));
  mocks.deleteTeam.mockResolvedValue(ok(null));
});

describe("TeamEditor · un equipo nuevo", () => {
  function renderNew(props: Partial<Parameters<typeof TeamEditor>[0]> = {}) {
    return render(<TeamEditor clubSlug="club-a" seasonId={SEASON_ID} categories={CATEGORIES} {...props} />);
  }

  it("es el alta: su encabezado da nombre al formulario, con el nombre vacío", () => {
    renderNew();

    expect(screen.getByRole("heading", { level: 2, name: "Nuevo equipo" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nuevo equipo" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    expect(within(form).getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
  });

  it("la categoría se elige entre las del club, en su orden, y empieza en la primera", () => {
    renderNew();

    const select = screen.getByLabelText("Categoría");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Pequeños",
      "Mayores",
    ]);
    expect(select).toHaveValue(SMALL);
  });

  it("«Crear equipo» es el botón principal", () => {
    renderNew();

    expect(screen.getByRole("button", { name: "Crear equipo" })).toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("crea el equipo en su temporada con lo escrito y lleva a su página, para montarlo", async () => {
    renderNew();

    type("Nombre", "Equipo B");
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: BIG } });
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/admin/teams/${NEW_ID}`);
    expect(mocks.createTeam).toHaveBeenCalledTimes(1);
    expect(mocks.createTeam).toHaveBeenCalledWith("club-a", {
      seasonId: SEASON_ID,
      name: "Equipo B",
      categoryId: BIG,
    });
    expect(mocks.updateTeam).not.toHaveBeenCalled();
  });

  it("sin tocar la categoría, manda la primera", async () => {
    renderNew();

    type("Nombre", "Equipo B");
    create();

    await waitFor(() => expect(mocks.createTeam).toHaveBeenCalledTimes(1));
    expect(mocks.createTeam.mock.calls[0][1].categoryId).toBe(SMALL);
  });

  it("usa el club que le pasan, también para navegar", async () => {
    renderNew({ clubSlug: "club-b" });

    type("Nombre", "Equipo B");
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-b/admin/teams/${NEW_ID}`));
    expect(mocks.createTeam.mock.calls[0][0]).toBe("club-b");
  });

  it("entrada inválida: el aviso general y cada error bajo su campo, enlazado; no navega", async () => {
    mocks.createTeam.mockResolvedValue(
      fail("INVALID", {
        name: "Ya hay un equipo con ese nombre en esta temporada.",
        categoryId: "No encontramos este contenido.",
      }),
    );
    renderNew();

    type("Nombre", "Equipo A");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Nombre", "Ya hay un equipo con ese nombre en esta temporada."],
      ["Categoría", "No encontramos este contenido."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field, label).toHaveAttribute("aria-describedby", text.id);
    }
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Equipo A");
  });

  it("si la temporada o la categoría ya no existen, lo dice y no navega", async () => {
    mocks.createTeam.mockResolvedValue(fail("NOT_FOUND"));
    renderNew();

    type("Nombre", "Equipo B");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("mientras crea, el botón espera y no se lanza un segundo alta", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createTeam.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderNew();

    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear equipo" })).toBeDisabled());
    create();
    expect(mocks.createTeam).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("si la acción lanza, lo dice sin el error técnico", async () => {
    mocks.createTeam.mockRejectedValue(new Error("fetch failed"));
    renderNew();

    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
  });
});

describe("TeamEditor · un equipo que existe", () => {
  function renderExisting(team = TEAM) {
    return render(<TeamEditor clubSlug="club-a" seasonId={SEASON_ID} team={team} categories={CATEGORIES} />);
  }

  it("empieza con su nombre y su categoría, bajo «Datos del equipo»", () => {
    renderExisting();

    expect(screen.getByRole("heading", { level: 2, name: "Datos del equipo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Equipo A");
    // Su categoría, no la primera de la lista.
    expect(screen.getByLabelText("Categoría")).toHaveValue(BIG);
  });

  it("«Guardar» es secondary, lo describe su encabezado y no hay botón de alta", () => {
    renderExisting();

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription("Datos del equipo");
    expect(screen.queryByRole("button", { name: "Crear equipo" })).not.toBeInTheDocument();
  });

  it("guarda nombre y categoría con el id del equipo; la temporada no viaja", async () => {
    renderExisting();

    type("Nombre", "Equipo A2");
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: SMALL } });
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateTeam).toHaveBeenCalledTimes(1);
    expect(mocks.updateTeam).toHaveBeenCalledWith("club-a", { id: TEAM_ID, name: "Equipo A2", categoryId: SMALL });
    expect(mocks.createTeam).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el aviso de guardado se quita al tocar el nombre o la categoría", async () => {
    renderExisting();

    save();
    await screen.findByText("Cambios guardados.");
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: SMALL } });
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();

    save();
    await screen.findByText("Cambios guardados.");
    type("Nombre", "Otro");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("repintar con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = renderExisting();

    type("Nombre", "Lo que escribo");
    rerender(
      <TeamEditor
        clubSlug="club-a"
        seasonId={SEASON_ID}
        team={{ ...TEAM, name: "Lo de la base" }}
        categories={CATEGORIES}
      />,
    );

    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo que escribo");
  });

  it("un nombre repetido se dice bajo el nombre, y no se confirma nada", async () => {
    mocks.updateTeam.mockResolvedValue(fail("INVALID", { name: "Ya hay un equipo con ese nombre en esta temporada." }));
    renderExisting();

    save();

    const message = await screen.findByText("Ya hay un equipo con ese nombre en esta temporada.");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });
});

// ── Borrar ──────────────────────────────────────────────────────────────────────────────

const DELETE_TITLE = "¿Borrar el equipo Equipo A?";

function renderDelete(props: Partial<Parameters<typeof TeamDelete>[0]> = {}) {
  return render(<TeamDelete clubSlug="club-a" team={TEAM} seasonId={SEASON_ID} {...props} />);
}

const askDelete = () => fireEvent.click(screen.getByRole("button", { name: "Borrar equipo" }));
async function confirmDelete() {
  const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Borrar equipo" }));
}

describe("TeamDelete", () => {
  it("«Borrar equipo» va en `danger`, y de entrada no hay diálogo ni aviso", () => {
    renderDelete();

    expect(screen.getByRole("button", { name: "Borrar equipo" })).toHaveClass("border-danger", "text-danger");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pregunta antes, diciendo qué se va y qué se queda, y aún no borra", async () => {
    renderDelete();

    askDelete();

    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    expect(dialog).toHaveAccessibleDescription(
      "Se va con su cuerpo técnico y su plantilla. Las personas siguen en el club. No se puede deshacer.",
    );
    expect(mocks.deleteTeam).not.toHaveBeenCalled();
  });

  it("al confirmar, borra ese equipo y vuelve a su temporada", async () => {
    renderDelete();

    askDelete();
    await confirmDelete();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/admin/season/${SEASON_ID}`);
    expect(mocks.deleteTeam).toHaveBeenCalledTimes(1);
    expect(mocks.deleteTeam).toHaveBeenCalledWith("club-a", { id: TEAM_ID });
  });

  it("«Volver» cierra el diálogo sin borrar ni navegar", async () => {
    renderDelete();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteTeam).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("un equipo con actividad no se borra: lo dice con sus palabras, y no navega", async () => {
    mocks.deleteTeam.mockResolvedValue(fail("IN_USE"));
    renderDelete();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este equipo ya tiene actividad (sesiones, partidos, objetivos o notas) y no se puede borrar.",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(["NOT_FOUND", "SAVE_FAILED"] as const)("otro fallo (%s) se dice con el copy del contrato", async (error) => {
    mocks.deleteTeam.mockResolvedValue(fail(error));
    renderDelete();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY[error]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.deleteTeam.mockRejectedValue(new Error("fetch failed"));
    renderDelete();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras borra, los botones esperan y no se borra dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.deleteTeam.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderDelete();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Borrar equipo" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.deleteTeam).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("usa el club y la temporada que le pasan", async () => {
    renderDelete({ clubSlug: "club-b", seasonId: uuid(77) });

    askDelete();
    await confirmDelete();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-b/admin/season/${uuid(77)}`));
    expect(mocks.deleteTeam).toHaveBeenCalledWith("club-b", { id: TEAM_ID });
  });
});
