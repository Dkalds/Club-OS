import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { AdminStaffMember } from "@/modules/structure/types";
import type { PickablePerson } from "./person-picker";

const mocks = vi.hoisted(() => ({
  addStaff: vi.fn(),
  setStaffRole: vi.fn(),
  removeStaff: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  addStaff: mocks.addStaff,
  setStaffRole: mocks.setStaffRole,
  removeStaff: mocks.removeStaff,
}));

import { StaffSection } from "./staff-section";

// Datos ficticios; de las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = uuid(1);
const CRUZ = uuid(11);
const BLAS = uuid(12);
const ANA = uuid(13);
const LUIS = uuid(14);

const STAFF: AdminStaffMember[] = [
  { personId: CRUZ, firstName: "Cruz", lastName: "Vidal", role: "head_coach" },
  { personId: BLAS, firstName: "Blas", lastName: "Arco", role: "assistant" },
];

/** Las personas sin archivar del club: las dos del cuerpo técnico y dos más. */
const PEOPLE: PickablePerson[] = [
  { id: CRUZ, firstName: "Cruz", lastName: "Vidal", birthYear: null },
  { id: BLAS, firstName: "Blas", lastName: "Arco", birthYear: 1990 },
  { id: ANA, firstName: "Ana", lastName: "Vega", birthYear: 1988 },
  { id: LUIS, firstName: "Luis", lastName: "Vera", birthYear: null },
];

function renderSection(props: Partial<Parameters<typeof StaffSection>[0]> = {}) {
  return render(<StaffSection clubSlug="club-a" teamId={TEAM} staff={STAFF} people={PEOPLE} {...props} />);
}

/** La fila de alguien del cuerpo técnico, por su nombre de lista. */
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
/** El bloque de «Añadir al cuerpo técnico»: su encabezado y su formulario. */
const addBlock = () =>
  screen.getByRole("heading", { level: 3, name: "Añadir al cuerpo técnico" }).parentElement as HTMLElement;
const search = (text: string) =>
  fireEvent.change(within(addBlock()).getByLabelText("Persona"), { target: { value: text } });
const pick = (name: RegExp) => fireEvent.click(within(addBlock()).getByRole("button", { name }));
const add = () => fireEvent.click(within(addBlock()).getByRole("button", { name: "Añadir" }));
const results = () =>
  within(within(addBlock()).getByRole("list", { name: "Resultados de persona" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

const REMOVE_TITLE = "¿Quitar a Cruz Vidal del cuerpo técnico?";
const askRemove = () => fireEvent.click(screen.getByRole("button", { name: "Quitar a Cruz Vidal del cuerpo técnico" }));
async function confirmRemove() {
  const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.addStaff.mockResolvedValue(ok(null));
  mocks.setStaffRole.mockResolvedValue(ok(null));
  mocks.removeStaff.mockResolvedValue(ok(null));
});

describe("StaffSection · quién está", () => {
  it("es el bloque «Cuerpo técnico», con una fila por persona en el orden en que llegan", () => {
    renderSection();

    expect(screen.getByRole("heading", { level: 2, name: "Cuerpo técnico" })).toBeInTheDocument();
    const list = screen.getAllByRole("list")[0];
    expect(within(list).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Vidal, Cruz",
      "Arco, Blas",
    ]);
  });

  it("cada fila dice su papel en un selector con su nombre, para distinguirlo de los demás", () => {
    renderSection();

    const cruz = within(row("Vidal, Cruz")).getByLabelText("Papel de Cruz Vidal");
    expect(cruz).toHaveValue("head_coach");
    expect(within(cruz).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Entrenador principal",
      "Ayudante",
    ]);
    expect(within(row("Arco, Blas")).getByLabelText("Papel de Blas Arco")).toHaveValue("assistant");
  });

  it("cada fila lleva su «Quitar», en `danger` y con el nombre de la persona", () => {
    renderSection();

    const button = within(row("Vidal, Cruz")).getByRole("button", { name: "Quitar a Cruz Vidal del cuerpo técnico" });
    expect(button).toHaveTextContent("Quitar");
    expect(button).toHaveClass("border-danger");
    expect(
      within(row("Arco, Blas")).getByRole("button", { name: "Quitar a Blas Arco del cuerpo técnico" }),
    ).toBeInTheDocument();
  });

  it("sin nadie, lo dice y avisa de la consecuencia; añadir sigue ahí", () => {
    renderSection({ staff: [] });

    expect(
      screen.getByText("Aún no hay nadie. Sin cuerpo técnico, nadie que entrene ve este equipo."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Papel de /)).not.toBeInTheDocument();
    expect(within(addBlock()).getByRole("button", { name: "Añadir" })).toBeInTheDocument();
  });

  it("con alguien, no sale el aviso de que no hay nadie", () => {
    renderSection();

    expect(screen.queryByText(/Aún no hay nadie/)).not.toBeInTheDocument();
  });
});

describe("StaffSection · cambiar el papel", () => {
  const changeRole = (label: string, role: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value: role } });

  it("al elegir otro papel lo guarda al momento, para esa persona de ese equipo", async () => {
    renderSection();

    changeRole("Papel de Cruz Vidal", "assistant");

    await waitFor(() => expect(mocks.setStaffRole).toHaveBeenCalledTimes(1));
    expect(mocks.setStaffRole).toHaveBeenCalledWith("club-a", { teamId: TEAM, personId: CRUZ, role: "assistant" });
    expect(screen.getByLabelText("Papel de Cruz Vidal")).toHaveValue("assistant");
    // La otra fila no se toca.
    expect(screen.getByLabelText("Papel de Blas Arco")).toHaveValue("assistant");
    expect(mocks.addStaff).not.toHaveBeenCalled();
  });

  it("guardado sin botón, lo dice: «Papel guardado.», en la fila de esa persona y solo en ella", async () => {
    renderSection();
    expect(screen.queryByText("Papel guardado.")).not.toBeInTheDocument();

    changeRole("Papel de Cruz Vidal", "assistant");

    const said = await screen.findByText("Papel guardado.");
    expect(said).toHaveAttribute("role", "status");
    expect(row("Vidal, Cruz")).toContainElement(said);
    expect(within(row("Arco, Blas")).queryByText("Papel guardado.")).not.toBeInTheDocument();
  });

  it("si no se guarda, no dice que se ha guardado", async () => {
    mocks.setStaffRole.mockResolvedValue({ ok: false, error: "SAVE_FAILED" });
    renderSection();

    changeRole("Papel de Cruz Vidal", "assistant");

    await screen.findByRole("alert");
    expect(screen.queryByText("Papel guardado.")).not.toBeInTheDocument();
  });

  it("el selector enseña el papel nuevo mientras se guarda", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.setStaffRole.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderSection();

    changeRole("Papel de Blas Arco", "head_coach");

    expect(screen.getByLabelText("Papel de Blas Arco")).toHaveValue("head_coach");
    finish(ok(null));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Quitar a Blas Arco del cuerpo técnico" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Papel de Blas Arco")).toHaveValue("head_coach");
  });

  it("si no se guarda, el selector vuelve a decir lo que hay y la fila lo avisa", async () => {
    mocks.setStaffRole.mockResolvedValue(fail("NOT_FOUND"));
    renderSection();

    changeRole("Papel de Cruz Vidal", "assistant");

    const alert = await within(row("Vidal, Cruz")).findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(screen.getByLabelText("Papel de Cruz Vidal")).toHaveValue("head_coach");
    expect(within(row("Arco, Blas")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un aviso anterior se quita al cambiar el papel de nuevo", async () => {
    mocks.setStaffRole.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderSection();

    changeRole("Papel de Cruz Vidal", "assistant");
    await within(row("Vidal, Cruz")).findByRole("alert");
    changeRole("Papel de Cruz Vidal", "assistant");

    await waitFor(() => expect(mocks.setStaffRole).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(row("Vidal, Cruz")).queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Papel de Cruz Vidal")).toHaveValue("assistant");
  });
});

describe("StaffSection · quitar", () => {
  it("pregunta antes, con el nombre de la persona, diciendo que sigue en el club, y aún no quita", async () => {
    renderSection();

    askRemove();

    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    expect(dialog).toHaveAccessibleDescription("Deja de ver este equipo. Sigue en el club.");
    expect(within(dialog).getByRole("button", { name: "Quitar" })).toHaveClass("border-danger");
    expect(mocks.removeStaff).not.toHaveBeenCalled();
  });

  it("al confirmar, quita a esa persona de ese equipo y cierra el diálogo", async () => {
    renderSection();

    askRemove();
    await confirmRemove();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.removeStaff).toHaveBeenCalledTimes(1);
    expect(mocks.removeStaff).toHaveBeenCalledWith("club-a", { teamId: TEAM, personId: CRUZ });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Volver» cierra el diálogo sin quitar a nadie", async () => {
    renderSection();

    askRemove();
    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.removeStaff).not.toHaveBeenCalled();
  });

  it("si no se puede quitar, cierra el diálogo y la fila lo dice", async () => {
    mocks.removeStaff.mockResolvedValue(fail("SAVE_FAILED"));
    renderSection();

    askRemove();
    await confirmRemove();

    expect(await within(row("Vidal, Cruz")).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.removeStaff.mockRejectedValue(new Error("fetch failed"));
    renderSection();

    askRemove();
    await confirmRemove();

    const alert = await within(row("Vidal, Cruz")).findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras quita, los botones del diálogo esperan y no se quita dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.removeStaff.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderSection();

    askRemove();
    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Quitar" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.removeStaff).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

describe("StaffSection · añadir", () => {
  it("el formulario empieza sin persona y con «Entrenador principal»", () => {
    renderSection();

    expect(within(addBlock()).getByLabelText("Persona")).toHaveValue("");
    expect(within(addBlock()).getByLabelText("Papel")).toHaveValue("head_coach");
  });

  it("«Añadir» es secondary y lo describe su encabezado", () => {
    renderSection();

    const button = within(addBlock()).getByRole("button", { name: "Añadir" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAccessibleDescription("Añadir al cuerpo técnico");
  });

  it("el buscador no ofrece a quien ya está en el cuerpo técnico", () => {
    renderSection();

    // «v» está en Vidal (ya está), Vega y Vera.
    search("v");
    expect(results()).toEqual(["Vega, Ana1988", "Vera, Luis"]);

    search("arco");
    expect(within(addBlock()).getByText(/^Nadie con ese nombre./)).toBeInTheDocument();
    expect(within(addBlock()).queryByRole("list")).not.toBeInTheDocument();
  });

  it("sin nadie en el cuerpo técnico, ofrece a todas las personas que le llegan", () => {
    renderSection({ staff: [] });

    search("v");

    expect(results()).toEqual(["Vidal, Cruz", "Vega, Ana1988", "Vera, Luis"]);
  });

  it("añade a la persona elegida con el papel elegido", async () => {
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    fireEvent.change(within(addBlock()).getByLabelText("Papel"), { target: { value: "assistant" } });
    add();

    await within(addBlock()).findByText("Añadido al cuerpo técnico.");
    expect(mocks.addStaff).toHaveBeenCalledTimes(1);
    expect(mocks.addStaff).toHaveBeenCalledWith("club-a", { teamId: TEAM, personId: ANA, role: "assistant" });
  });

  it("sin tocar el papel, la añade como entrenador principal", async () => {
    renderSection();

    search("vera");
    pick(/Vera, Luis/);
    add();

    await within(addBlock()).findByText("Añadido al cuerpo técnico.");
    expect(mocks.addStaff).toHaveBeenCalledWith("club-a", { teamId: TEAM, personId: LUIS, role: "head_coach" });
  });

  it("tras añadir, el buscador vuelve a empezar, vacío y sin resultados", async () => {
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    add();

    await within(addBlock()).findByText("Añadido al cuerpo técnico.");
    expect(within(addBlock()).getByLabelText("Persona")).toHaveValue("");
    expect(within(addBlock()).queryByRole("list")).not.toBeInTheDocument();
    expect(within(addBlock()).queryByText("Vega, Ana")).not.toBeInTheDocument();
  });

  it("el aviso de añadido se quita al elegir a la siguiente persona", async () => {
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    add();
    await within(addBlock()).findByText("Añadido al cuerpo técnico.");
    search("vera");
    pick(/Vera, Luis/);

    expect(within(addBlock()).queryByText("Añadido al cuerpo técnico.")).not.toBeInTheDocument();
  });

  it("sin persona elegida dice «Elige a una persona.» en el buscador y no llama a la acción", async () => {
    renderSection();

    add();

    const field = within(addBlock()).getByLabelText("Persona");
    const message = await within(addBlock()).findByText("Elige a una persona.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", message.id);
    expect(mocks.addStaff).not.toHaveBeenCalled();
    expect(within(addBlock()).queryByText("Añadido al cuerpo técnico.")).not.toBeInTheDocument();
  });

  it("escribir sin elegir a nadie no es elegir: sigue pidiéndolo", () => {
    renderSection();

    search("vega");
    add();

    expect(within(addBlock()).getByText("Elige a una persona.")).toBeInTheDocument();
    expect(mocks.addStaff).not.toHaveBeenCalled();
  });

  it("el aviso de que falta la persona se quita al elegir a alguien", () => {
    renderSection();

    add();
    expect(within(addBlock()).getByText("Elige a una persona.")).toBeInTheDocument();
    search("vega");
    pick(/Vega, Ana/);

    expect(within(addBlock()).queryByText("Elige a una persona.")).not.toBeInTheDocument();
    expect(within(addBlock()).getByText("Vega, Ana")).toBeInTheDocument();
  });

  it("si ya estaba (la acción marca `personId`), se dice junto a la persona elegida, que sigue elegida", async () => {
    mocks.addStaff.mockResolvedValue(fail("INVALID", { personId: "Ya está en el cuerpo técnico." }));
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    add();

    expect(await within(addBlock()).findByText("Ya está en el cuerpo técnico.")).toBeInTheDocument();
    expect(within(addBlock()).getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(within(addBlock()).getByText("Vega, Ana")).toBeInTheDocument();
    expect(within(addBlock()).queryByText("Añadido al cuerpo técnico.")).not.toBeInTheDocument();
  });

  it("si el equipo o la persona ya no existen, lo dice y no confirma nada", async () => {
    mocks.addStaff.mockResolvedValue(fail("NOT_FOUND"));
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    add();

    expect(await within(addBlock()).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(within(addBlock()).queryByText("Añadido al cuerpo técnico.")).not.toBeInTheDocument();
  });

  it("mientras añade, el botón espera y no se añade dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.addStaff.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderSection();

    search("vega");
    pick(/Vega, Ana/);
    add();
    await waitFor(() => expect(within(addBlock()).getByRole("button", { name: "Añadir" })).toBeDisabled());
    add();
    expect(mocks.addStaff).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await within(addBlock()).findByText("Añadido al cuerpo técnico.");
  });

  it("usa el club y el equipo que le pasan", async () => {
    renderSection({ clubSlug: "club-b", teamId: uuid(2) });

    search("vega");
    pick(/Vega, Ana/);
    add();

    await waitFor(() =>
      expect(mocks.addStaff).toHaveBeenCalledWith("club-b", { teamId: uuid(2), personId: ANA, role: "head_coach" }),
    );
  });
});
