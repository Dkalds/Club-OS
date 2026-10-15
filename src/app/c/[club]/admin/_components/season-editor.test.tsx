import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { SeasonSummary } from "@/modules/structure/types";

const mocks = vi.hoisted(() => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  setCurrentSeason: vi.fn(),
  deleteSeason: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  createSeason: mocks.createSeason,
  updateSeason: mocks.updateSeason,
  setCurrentSeason: mocks.setCurrentSeason,
  deleteSeason: mocks.deleteSeason,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { SeasonActions, SeasonEditor } from "./season-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = uuid(1);
const OTHER_ID = uuid(2);
const NEW_ID = uuid(170);

function season(overrides: Partial<SeasonSummary> = {}): SeasonSummary {
  return { id: ID, name: "2025/26", startsOn: "2025-09-01", endsOn: "2026-06-30", isCurrent: false, ...overrides };
}

const CURRENT = season({ id: OTHER_ID, name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true });

const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear temporada" }));

function fillNew() {
  type("Nombre", "2027/28");
  type("Inicio", "2027-09-01");
  type("Fin", "2028-06-30");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createSeason.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateSeason.mockResolvedValue(ok(null));
  mocks.setCurrentSeason.mockResolvedValue(ok(null));
  mocks.deleteSeason.mockResolvedValue(ok(null));
});

describe("SeasonEditor · una temporada nueva", () => {
  it("es el alta: su encabezado da nombre al formulario, que empieza vacío", () => {
    render(<SeasonEditor clubSlug="club-a" />);

    expect(screen.getByRole("heading", { level: 2, name: "Nueva temporada" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nueva temporada" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    expect(within(form).getByLabelText("Inicio")).toHaveValue("");
    expect(within(form).getByLabelText("Fin")).toHaveValue("");
  });

  it("el nombre tiene tope y un ejemplo; las fechas son campos de fecha", () => {
    render(<SeasonEditor clubSlug="club-a" />);

    expect(screen.getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
    expect(screen.getByLabelText("Nombre")).toHaveAccessibleDescription("Por ejemplo, 2027/28.");
    expect(screen.getByLabelText("Inicio")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Fin")).toHaveAttribute("type", "date");
  });

  it("«Crear temporada» es el botón principal", () => {
    render(<SeasonEditor clubSlug="club-a" />);

    const button = screen.getByRole("button", { name: "Crear temporada" });
    expect(button).toHaveClass("bg-brand-accent");
    expect(button).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("sin otras temporadas no ofrece copiar equipos", () => {
    render(<SeasonEditor clubSlug="club-a" />);

    expect(screen.queryByLabelText("Copiar equipos de")).not.toBeInTheDocument();
  });

  it("con otras temporadas ofrece copiar sus equipos, y por defecto no copia", () => {
    render(<SeasonEditor clubSlug="club-a" copyFrom={[CURRENT, season()]} />);

    const select = screen.getByLabelText("Copiar equipos de");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "No copiar",
      "2026/27",
      "2025/26",
    ]);
    expect(select).toHaveValue("");
  });

  it("crea con lo escrito, sin copiar (`copyTeamsFrom` null), y lleva a la temporada nueva", async () => {
    render(<SeasonEditor clubSlug="club-a" copyFrom={[CURRENT]} />);

    fillNew();
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/admin/season/${NEW_ID}`);
    expect(mocks.createSeason).toHaveBeenCalledTimes(1);
    expect(mocks.createSeason).toHaveBeenCalledWith("club-a", {
      name: "2027/28",
      startsOn: "2027-09-01",
      endsOn: "2028-06-30",
      copyTeamsFrom: null,
    });
    expect(mocks.updateSeason).not.toHaveBeenCalled();
  });

  it("eligiendo una temporada, manda de cuál copiar los equipos", async () => {
    render(<SeasonEditor clubSlug="club-a" copyFrom={[CURRENT, season()]} />);

    fillNew();
    fireEvent.change(screen.getByLabelText("Copiar equipos de"), { target: { value: ID } });
    create();

    await waitFor(() => expect(mocks.createSeason).toHaveBeenCalledTimes(1));
    expect(mocks.createSeason.mock.calls[0][1]).toMatchObject({ copyTeamsFrom: ID });
  });

  it("volver a «No copiar» manda null", async () => {
    render(<SeasonEditor clubSlug="club-a" copyFrom={[CURRENT]} />);

    fillNew();
    fireEvent.change(screen.getByLabelText("Copiar equipos de"), { target: { value: OTHER_ID } });
    fireEvent.change(screen.getByLabelText("Copiar equipos de"), { target: { value: "" } });
    create();

    await waitFor(() => expect(mocks.createSeason).toHaveBeenCalledTimes(1));
    expect(mocks.createSeason.mock.calls[0][1].copyTeamsFrom).toBeNull();
  });

  it("usa el club que le pasan, también para navegar", async () => {
    render(<SeasonEditor clubSlug="club-b" />);

    fillNew();
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-b/admin/season/${NEW_ID}`));
    expect(mocks.createSeason.mock.calls[0][0]).toBe("club-b");
  });

  it("lo que se manda vacío viaja vacío: lo rechaza la acción, con su mensaje", async () => {
    mocks.createSeason.mockResolvedValue(fail("INVALID", { name: "Escribe un nombre." }));
    render(<SeasonEditor clubSlug="club-a" />);

    create();

    await screen.findByText("Escribe un nombre.");
    expect(mocks.createSeason).toHaveBeenCalledWith("club-a", {
      name: "",
      startsOn: "",
      endsOn: "",
      copyTeamsFrom: null,
    });
  });

  it("entrada inválida: el aviso general y cada error bajo su campo, enlazado; no navega", async () => {
    mocks.createSeason.mockResolvedValue(
      fail("INVALID", {
        name: "Ya hay una temporada con ese nombre.",
        startsOn: "Elige una fecha.",
        endsOn: "El fin tiene que ser posterior al inicio.",
      }),
    );
    render(<SeasonEditor clubSlug="club-a" />);

    fillNew();
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Nombre", "Ya hay una temporada con ese nombre."],
      ["Inicio", "Elige una fecha."],
      ["Fin", "El fin tiene que ser posterior al inicio."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" "), label).toContain(text.id);
    }
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre")).toHaveValue("2027/28");
  });

  it("un error de campo se quita al enviar de nuevo", async () => {
    mocks.createSeason.mockResolvedValueOnce(fail("INVALID", { endsOn: "El fin tiene que ser posterior al inicio." }));
    render(<SeasonEditor clubSlug="club-a" />);

    create();
    await screen.findByText("El fin tiene que ser posterior al inicio.");
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("El fin tiene que ser posterior al inicio.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("mientras crea, el botón espera y no se lanza un segundo alta", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createSeason.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    render(<SeasonEditor clubSlug="club-a" />);

    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear temporada" })).toBeDisabled());
    create();
    expect(mocks.createSeason).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("si no se puede guardar, lo dice con el copy del contrato y no pierde lo escrito", async () => {
    mocks.createSeason.mockResolvedValue(fail("SAVE_FAILED"));
    render(<SeasonEditor clubSlug="club-a" />);

    fillNew();
    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByLabelText("Nombre")).toHaveValue("2027/28");
    expect(screen.getByLabelText("Fin")).toHaveValue("2028-06-30");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear temporada" })).toBeEnabled();
  });

  it("si la acción lanza, tampoco se queda sin avisar, ni enseña el error técnico", async () => {
    mocks.createSeason.mockRejectedValue(new Error("fetch failed"));
    render(<SeasonEditor clubSlug="club-a" />);

    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
  });
});

describe("SeasonEditor · una temporada que existe", () => {
  it("empieza con lo que tiene guardado, bajo «Datos de la temporada»", () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Datos de la temporada" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("2025/26");
    expect(screen.getByLabelText("Inicio")).toHaveValue("2025-09-01");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-06-30");
  });

  it("no lleva el ejemplo del alta ni ofrece copiar equipos", () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} copyFrom={[CURRENT]} />);

    expect(screen.queryByText("Por ejemplo, 2027/28.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Copiar equipos de")).not.toBeInTheDocument();
  });

  it("«Guardar» es secondary, lo describe su encabezado y no hay botón de alta", () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAccessibleDescription("Datos de la temporada");
    expect(screen.queryByRole("button", { name: "Crear temporada" })).not.toBeInTheDocument();
    // El formulario de algo que existe no es un punto de referencia más.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("guarda lo escrito con el id de la temporada, y lo confirma sin navegar", async () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    type("Nombre", "2025/26 bis");
    type("Inicio", "2025-08-25");
    type("Fin", "2026-07-05");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateSeason).toHaveBeenCalledTimes(1);
    expect(mocks.updateSeason).toHaveBeenCalledWith("club-a", {
      id: ID,
      name: "2025/26 bis",
      startsOn: "2025-08-25",
      endsOn: "2026-07-05",
    });
    expect(mocks.createSeason).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el aviso de guardado es un estado: la región ya está antes y se vacía al tocar un campo", async () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("status")).toBe(region);

    type("Fin", "2026-07-01");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });

  it("lo guardado no vacía el formulario", async () => {
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    type("Nombre", "Otro nombre");
    save();

    await screen.findByText("Cambios guardados.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Otro nombre");
  });

  it("repintar con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = render(<SeasonEditor clubSlug="club-a" season={season()} />);

    type("Nombre", "Lo que escribo ahora");
    rerender(<SeasonEditor clubSlug="club-a" season={season({ name: "Lo de la base" })} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo que escribo ahora");
  });

  it("el fin anterior al inicio se dice bajo «Fin»", async () => {
    mocks.updateSeason.mockResolvedValue(fail("INVALID", { endsOn: "El fin tiene que ser posterior al inicio." }));
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    type("Fin", "2025-01-01");
    save();

    const message = await screen.findByText("El fin tiene que ser posterior al inicio.");
    expect(screen.getByLabelText("Fin")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Fin")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByLabelText("Inicio")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("si la temporada ya no existe, lo dice sin inventar un error de campo", async () => {
    mocks.updateSeason.mockResolvedValue(fail("NOT_FOUND"));
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid");
  });

  it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.updateSeason.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    render(<SeasonEditor clubSlug="club-a" season={season()} />);

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
    save();
    expect(mocks.updateSeason).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });
});

// ── Marcar como actual y borrar ─────────────────────────────────────────────────────────

const MARK_TITLE = "¿Marcar 2025/26 como la temporada actual?";
const DELETE_TITLE = "¿Borrar la temporada 2025/26?";

function renderActions(props: Partial<Parameters<typeof SeasonActions>[0]> = {}) {
  return render(<SeasonActions clubSlug="club-a" season={season()} hasTeams={false} {...props} />);
}

const askMark = () => fireEvent.click(screen.getByRole("button", { name: "Marcar como actual" }));
const askDelete = () => fireEvent.click(screen.getByRole("button", { name: "Borrar temporada" }));
/** Confirma en el diálogo abierto: su botón se llama como el que lo abrió. */
async function confirmIn(title: string, label: string) {
  const dialog = await screen.findByRole("alertdialog", { name: title });
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
}

describe("SeasonActions", () => {
  it("en la temporada actual no se ofrece nada: ni marcarla ni borrarla", () => {
    const { container } = renderActions({ season: CURRENT });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("la actual tampoco se puede borrar aunque no tenga equipos", () => {
    renderActions({ season: CURRENT, hasTeams: false });

    expect(screen.queryByRole("button", { name: "Borrar temporada" })).not.toBeInTheDocument();
  });

  it("en otra temporada sin equipos se ofrecen las dos cosas; borrar va en `danger`", () => {
    renderActions();

    expect(screen.getByRole("button", { name: "Marcar como actual" })).toHaveClass("border-line-strong");
    expect(screen.getByRole("button", { name: "Borrar temporada" })).toHaveClass("border-danger", "text-danger");
  });

  it("con equipos solo se ofrece marcarla como actual: borrar, no", () => {
    renderActions({ hasTeams: true });

    expect(screen.getByRole("button", { name: "Marcar como actual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar temporada" })).not.toBeInTheDocument();
  });

  it("de entrada no hay diálogo ni aviso, y no se ha llamado a nada", () => {
    renderActions();

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.setCurrentSeason).not.toHaveBeenCalled();
    expect(mocks.deleteSeason).not.toHaveBeenCalled();
  });

  it("«Marcar como actual» pregunta antes, diciendo qué cambia para el club", async () => {
    renderActions();

    askMark();

    const dialog = await screen.findByRole("alertdialog", { name: MARK_TITLE });
    expect(dialog).toHaveAccessibleDescription(
      "La agenda, las sesiones y los equipos que ve todo el club pasan a ser los de esta temporada. Nada se borra.",
    );
    expect(within(dialog).getByRole("button", { name: "Marcar como actual" })).toHaveClass("bg-brand-accent");
    expect(within(dialog).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(mocks.setCurrentSeason).not.toHaveBeenCalled();
  });

  it("al confirmar, marca esa temporada y cierra el diálogo, sin navegar", async () => {
    renderActions();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.setCurrentSeason).toHaveBeenCalledTimes(1);
    expect(mocks.setCurrentSeason).toHaveBeenCalledWith("club-a", { id: ID });
    expect(mocks.deleteSeason).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marcada, lo dice en una región de estado que ya estaba, y deja de ofrecer marcarla y borrarla", async () => {
    renderActions();
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");

    await waitFor(() => expect(region).toHaveTextContent("Ya es la temporada actual."));
    expect(screen.getByRole("status")).toBe(region);
    expect(screen.queryByRole("button", { name: "Marcar como actual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar temporada" })).not.toBeInTheDocument();
  });

  it("sigue diciéndolo cuando la página se repinta con la temporada ya como actual", async () => {
    const { rerender } = renderActions();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");
    await screen.findByText("Ya es la temporada actual.");
    rerender(<SeasonActions clubSlug="club-a" season={season({ isCurrent: true })} hasTeams={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("Ya es la temporada actual.");
  });

  it("si no se pudo marcar, no dice que lo es y sigue ofreciéndolo", async () => {
    mocks.setCurrentSeason.mockResolvedValue({ ok: false, error: "SAVE_FAILED" });
    renderActions();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");

    await screen.findByRole("alert");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Marcar como actual" })).toBeInTheDocument();
  });

  it("«Volver» cierra el diálogo sin marcar nada", async () => {
    renderActions();

    askMark();
    const dialog = await screen.findByRole("alertdialog", { name: MARK_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.setCurrentSeason).not.toHaveBeenCalled();
  });

  it("si marcarla falla, cierra el diálogo y lo dice", async () => {
    mocks.setCurrentSeason.mockResolvedValue(fail("NOT_FOUND"));
    renderActions();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar como actual" })).toBeEnabled();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.setCurrentSeason.mockRejectedValue(new Error("fetch failed"));
    renderActions();

    askMark();
    await confirmIn(MARK_TITLE, "Marcar como actual");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras se marca, los dos botones del diálogo esperan y no se lanza dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.setCurrentSeason.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderActions();

    askMark();
    const dialog = await screen.findByRole("alertdialog", { name: MARK_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Marcar como actual" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: "Volver" })).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.setCurrentSeason).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("«Borrar temporada» pregunta antes, en `danger`, y avisa de que no se deshace", async () => {
    renderActions();

    askDelete();

    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    expect(dialog).toHaveAccessibleDescription("No tiene equipos. No se puede deshacer.");
    expect(within(dialog).getByRole("button", { name: "Borrar temporada" })).toHaveClass("border-danger");
    expect(mocks.deleteSeason).not.toHaveBeenCalled();
  });

  it("al confirmar, borra esa temporada y vuelve a la temporada del club", async () => {
    renderActions();

    askDelete();
    await confirmIn(DELETE_TITLE, "Borrar temporada");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith("/c/club-a/admin/season");
    expect(mocks.deleteSeason).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSeason).toHaveBeenCalledWith("club-a", { id: ID });
    expect(mocks.setCurrentSeason).not.toHaveBeenCalled();
  });

  it("«Volver» cierra el diálogo sin borrar nada", async () => {
    renderActions();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteSeason).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("si no se puede borrar porque se usa, lo dice y no navega", async () => {
    mocks.deleteSeason.mockResolvedValue(fail("IN_USE"));
    renderActions();

    askDelete();
    await confirmIn(DELETE_TITLE, "Borrar temporada");

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede borrar porque se está usando.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("un aviso anterior se quita al intentarlo de nuevo", async () => {
    mocks.deleteSeason.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderActions();

    askDelete();
    await confirmIn(DELETE_TITLE, "Borrar temporada");
    await screen.findByRole("alert");
    askDelete();
    await confirmIn(DELETE_TITLE, "Borrar temporada");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("usa el club que le pasan", async () => {
    renderActions({ clubSlug: "club-b" });

    askDelete();
    await confirmIn(DELETE_TITLE, "Borrar temporada");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/c/club-b/admin/season"));
    expect(mocks.deleteSeason).toHaveBeenCalledWith("club-b", { id: ID });
  });
});
