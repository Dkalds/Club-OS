import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { AdminPlayer } from "@/modules/structure/types";
import type { PickablePerson } from "./person-picker";

const mocks = vi.hoisted(() => ({
  addPlayer: vi.fn(),
  addNewPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  removePlayer: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  addPlayer: mocks.addPlayer,
  addNewPlayer: mocks.addNewPlayer,
  updatePlayer: mocks.updatePlayer,
  removePlayer: mocks.removePlayer,
}));

import { RosterSection } from "./roster-section";

// Datos ficticios; de las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = uuid(1);
const ELOY = uuid(11);
const DANI = uuid(12);
const ANA = uuid(13);
const LUIS = uuid(14);
const NEW_ID = uuid(170);

const PLAYERS: AdminPlayer[] = [
  { personId: ELOY, firstName: "Eloy", lastName: "Mar", birthYear: 2013, jerseyNumber: 4, position: "Base" },
  { personId: DANI, firstName: "Dani", lastName: "Sol", birthYear: null, jerseyNumber: null, position: null },
];

/** Las personas sin archivar del club: las dos de la plantilla y dos más. */
const PEOPLE: PickablePerson[] = [
  { id: ELOY, firstName: "Eloy", lastName: "Mar", birthYear: 2013 },
  { id: DANI, firstName: "Dani", lastName: "Sol", birthYear: null },
  { id: ANA, firstName: "Ana", lastName: "Soler", birthYear: 2014 },
  { id: LUIS, firstName: "Luis", lastName: "Marín", birthYear: null },
];

function renderSection(props: Partial<Parameters<typeof RosterSection>[0]> = {}) {
  return render(<RosterSection clubSlug="club-a" teamId={TEAM} players={PLAYERS} people={PEOPLE} {...props} />);
}

const JERSEY = "Dorsal (opcional)";
const POSITION = "Posición (opcional)";
const YEAR = "Año de nacimiento (opcional)";

/** La fila de alguien de la plantilla, por su nombre de lista. */
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
/** Un bloque de alta: su encabezado y su formulario. */
const block = (heading: string) => screen.getByRole("heading", { level: 3, name: heading }).parentElement as HTMLElement;
const existing = () => block("Añadir a alguien del club");
const fresh = () => block("Dar de alta a alguien nuevo");
const typeIn = (scope: HTMLElement, label: string, text: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value: text } });

const search = (text: string) => typeIn(existing(), "Persona", text);
const pick = (name: RegExp) => fireEvent.click(within(existing()).getByRole("button", { name }));
const addExisting = () => fireEvent.click(within(existing()).getByRole("button", { name: "Añadir a la plantilla" }));
const addNew = () => fireEvent.click(within(fresh()).getByRole("button", { name: "Dar de alta y añadir" }));
const results = () =>
  within(within(existing()).getByRole("list", { name: "Resultados de persona" }))
    .getAllByRole("button")
    .map((button) => button.textContent);

const REMOVE_TITLE = "¿Quitar a Eloy Mar de la plantilla?";
const askRemove = () => fireEvent.click(screen.getByRole("button", { name: "Quitar a Eloy Mar de la plantilla" }));
async function confirmRemove() {
  const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.addPlayer.mockResolvedValue(ok(null));
  mocks.addNewPlayer.mockResolvedValue(ok({ personId: NEW_ID }));
  mocks.updatePlayer.mockResolvedValue(ok(null));
  mocks.removePlayer.mockResolvedValue(ok(null));
});

describe("RosterSection · quién está", () => {
  it("es el bloque «Plantilla», con una fila por persona en el orden en que llegan", () => {
    renderSection();

    expect(screen.getByRole("heading", { level: 2, name: "Plantilla" })).toBeInTheDocument();
    const list = screen.getAllByRole("list")[0];
    expect(Array.from(list.children).map((item) => item.querySelector("summary .text-body-strong")?.textContent)).toEqual([
      "Mar, Eloy",
      "Sol, Dani",
    ]);
  });

  it("plegada, cada fila dice el dorsal, el nombre y lo que distingue a la persona: posición y año", () => {
    renderSection();

    const summary = row("Mar, Eloy").querySelector("summary") as HTMLElement;
    expect(within(summary).getByText("4")).toBeInTheDocument();
    expect(within(summary).getByText("Mar, Eloy")).toBeInTheDocument();
    expect(within(summary).getByText("Base · 2013")).toBeInTheDocument();
  });

  it("sin dorsal enseña una raya; sin posición ni año, solo el nombre", () => {
    renderSection();

    const summary = row("Sol, Dani").querySelector("summary") as HTMLElement;
    expect(within(summary).getByText("–")).toBeInTheDocument();
    expect(summary.querySelector(".text-ink-2.text-body-s")).toBeNull();
  });

  it("el dorsal 0 se enseña como 0, no como una raya", () => {
    renderSection({ players: [{ ...PLAYERS[0], jerseyNumber: 0 }] });

    const summary = row("Mar, Eloy").querySelector("summary") as HTMLElement;
    expect(within(summary).getByText("0")).toBeInTheDocument();
    expect(within(summary).queryByText("–")).not.toBeInTheDocument();
  });

  it("con solo posición o solo año, enseña lo que hay, sin separador", () => {
    renderSection({
      players: [
        { ...PLAYERS[0], birthYear: null },
        { ...PLAYERS[1], birthYear: 2012 },
      ],
    });

    expect(within(row("Mar, Eloy")).getByText("Base")).toBeInTheDocument();
    expect(within(row("Sol, Dani")).getByText("2012")).toBeInTheDocument();
  });

  it("cada fila es un desplegable cerrado: una plantilla entera cabe en la pantalla", () => {
    renderSection();

    for (const name of ["Mar, Eloy", "Sol, Dani"]) {
      const details = row(name).querySelector("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(details?.querySelector("summary")?.className).toContain("min-h-14");
    }
  });

  it("sin nadie, lo dice; las dos formas de añadir siguen ahí", () => {
    renderSection({ players: [] });

    expect(screen.getByText("Aún no hay nadie en la plantilla.")).toBeInTheDocument();
    expect(within(existing()).getByRole("button", { name: "Añadir a la plantilla" })).toBeInTheDocument();
    expect(within(fresh()).getByRole("button", { name: "Dar de alta y añadir" })).toBeInTheDocument();
  });

  it("con alguien, no sale el aviso de que no hay nadie", () => {
    renderSection();

    expect(screen.queryByText("Aún no hay nadie en la plantilla.")).not.toBeInTheDocument();
  });
});

describe("RosterSection · dorsal y posición de alguien de la plantilla", () => {
  it("su formulario empieza con su dorsal y su posición, con sus rangos", () => {
    renderSection();

    const eloy = row("Mar, Eloy");
    const jersey = within(eloy).getByLabelText(JERSEY);
    expect(jersey).toHaveValue(4);
    expect(jersey).toHaveAttribute("min", "0");
    expect(jersey).toHaveAttribute("max", "99");
    expect(within(eloy).getByLabelText(POSITION)).toHaveValue("Base");
    expect(within(eloy).getByLabelText(POSITION)).toHaveAttribute("maxlength", "30");
  });

  it("quien no tiene dorsal ni posición empieza con los dos campos vacíos", () => {
    renderSection();

    const dani = row("Sol, Dani");
    expect(within(dani).getByLabelText(JERSEY)).toHaveValue(null);
    expect(within(dani).getByLabelText(POSITION)).toHaveValue("");
  });

  it("el dorsal 0 guardado se enseña como 0", () => {
    renderSection({ players: [{ ...PLAYERS[0], jerseyNumber: 0 }] });

    expect(within(row("Mar, Eloy")).getByLabelText(JERSEY)).toHaveValue(0);
  });

  it("su «Guardar» es secondary y lo describe el nombre de la persona", () => {
    renderSection();

    const button = within(row("Mar, Eloy")).getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription("Mar, Eloy");
  });

  it("guarda el dorsal como número y la posición, para esa persona de ese equipo", async () => {
    renderSection();
    const eloy = row("Mar, Eloy");

    typeIn(eloy, JERSEY, "9");
    typeIn(eloy, POSITION, "Alero");
    fireEvent.click(within(eloy).getByRole("button", { name: "Guardar" }));

    await within(eloy).findByText("Cambios guardados.");
    expect(mocks.updatePlayer).toHaveBeenCalledTimes(1);
    expect(mocks.updatePlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      personId: ELOY,
      jerseyNumber: 9,
      position: "Alero",
    });
    // La otra fila ni se guarda ni se confirma.
    expect(within(row("Sol, Dani")).queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("vaciar el dorsal lo manda como null (sin dorsal), no como 0; la posición vacía viaja vacía", async () => {
    renderSection();
    const eloy = row("Mar, Eloy");

    typeIn(eloy, JERSEY, "");
    typeIn(eloy, POSITION, "");
    fireEvent.click(within(eloy).getByRole("button", { name: "Guardar" }));

    await within(eloy).findByText("Cambios guardados.");
    expect(mocks.updatePlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      personId: ELOY,
      jerseyNumber: null,
      position: "",
    });
  });

  it("el dorsal 0 escrito viaja como 0", async () => {
    renderSection();
    const dani = row("Sol, Dani");

    typeIn(dani, JERSEY, "0");
    fireEvent.click(within(dani).getByRole("button", { name: "Guardar" }));

    await within(dani).findByText("Cambios guardados.");
    expect(mocks.updatePlayer.mock.calls[0][1].jerseyNumber).toBe(0);
  });

  it("un dorsal que ya lleva otra persona se dice bajo el dorsal de esa fila", async () => {
    mocks.updatePlayer.mockResolvedValue(
      fail("INVALID", { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." }),
    );
    renderSection();
    const dani = row("Sol, Dani");

    typeIn(dani, JERSEY, "4");
    fireEvent.click(within(dani).getByRole("button", { name: "Guardar" }));

    const message = await within(dani).findByText("Ese dorsal ya lo lleva otra persona del equipo.");
    expect(within(dani).getByLabelText(JERSEY)).toHaveAttribute("aria-invalid", "true");
    expect(within(dani).getByLabelText(JERSEY)).toHaveAttribute("aria-describedby", message.id);
    expect(within(dani).getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(within(row("Mar, Eloy")).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dani).queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("una posición demasiado larga se dice bajo la posición", async () => {
    mocks.updatePlayer.mockResolvedValue(fail("INVALID", { position: "Máximo 30 caracteres." }));
    renderSection();
    const eloy = row("Mar, Eloy");

    fireEvent.click(within(eloy).getByRole("button", { name: "Guardar" }));

    const message = await within(eloy).findByText("Máximo 30 caracteres.");
    expect(within(eloy).getByLabelText(POSITION)).toHaveAttribute("aria-describedby", message.id);
  });

  it("el aviso de guardado se quita al tocar el dorsal o la posición", async () => {
    renderSection();
    const eloy = row("Mar, Eloy");

    fireEvent.click(within(eloy).getByRole("button", { name: "Guardar" }));
    await within(eloy).findByText("Cambios guardados.");
    typeIn(eloy, POSITION, "Escolta");

    expect(within(eloy).queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(within(eloy).getByLabelText(POSITION)).toHaveValue("Escolta");
  });

  it("si ya no está en la plantilla, lo dice", async () => {
    mocks.updatePlayer.mockResolvedValue(fail("NOT_FOUND"));
    renderSection();
    const eloy = row("Mar, Eloy");

    fireEvent.click(within(eloy).getByRole("button", { name: "Guardar" }));

    expect(await within(eloy).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
  });
});

describe("RosterSection · quitar de la plantilla", () => {
  it("cada fila lleva su «Quitar», en `danger` y con el nombre de la persona", () => {
    renderSection();

    const button = within(row("Mar, Eloy")).getByRole("button", { name: "Quitar a Eloy Mar de la plantilla" });
    expect(button).toHaveTextContent("Quitar");
    expect(button).toHaveClass("border-danger");
    expect(within(row("Sol, Dani")).getByRole("button", { name: "Quitar a Dani Sol de la plantilla" })).toBeInTheDocument();
  });

  it("pregunta antes, con su nombre, diciendo que sigue en el club con lo suyo, y aún no quita", async () => {
    renderSection();

    askRemove();

    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    expect(dialog).toHaveAccessibleDescription("Sale de este equipo. Sigue en el club, con sus objetivos y sus notas.");
    expect(mocks.removePlayer).not.toHaveBeenCalled();
  });

  it("al confirmar, quita a esa persona de ese equipo y cierra el diálogo", async () => {
    renderSection();

    askRemove();
    await confirmRemove();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.removePlayer).toHaveBeenCalledTimes(1);
    expect(mocks.removePlayer).toHaveBeenCalledWith("club-a", { teamId: TEAM, personId: ELOY });
    expect(mocks.updatePlayer).not.toHaveBeenCalled();
  });

  it("«Volver» cierra el diálogo sin quitar a nadie", async () => {
    renderSection();

    askRemove();
    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.removePlayer).not.toHaveBeenCalled();
  });

  it("si no se puede quitar, cierra el diálogo y la fila lo dice", async () => {
    mocks.removePlayer.mockResolvedValue(fail("SAVE_FAILED"));
    renderSection();

    askRemove();
    await confirmRemove();

    expect(await within(row("Mar, Eloy")).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(row("Sol, Dani")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.removePlayer.mockRejectedValue(new Error("fetch failed"));
    renderSection();

    askRemove();
    await confirmRemove();

    const alert = await within(row("Mar, Eloy")).findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras quita, los botones del diálogo esperan y no se quita dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.removePlayer.mockReturnValue(
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
    expect(mocks.removePlayer).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

describe("RosterSection · añadir a alguien del club", () => {
  it("el formulario empieza sin persona, sin dorsal y sin posición", () => {
    renderSection();

    expect(within(existing()).getByLabelText("Persona")).toHaveValue("");
    expect(within(existing()).getByLabelText(JERSEY)).toHaveValue(null);
    expect(within(existing()).getByLabelText(POSITION)).toHaveValue("");
  });

  it("«Añadir a la plantilla» es secondary y lo describe su encabezado", () => {
    renderSection();

    const button = within(existing()).getByRole("button", { name: "Añadir a la plantilla" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription("Añadir a alguien del club");
  });

  it("el buscador no ofrece a quien ya está en la plantilla", () => {
    renderSection();

    // «sol» está en Sol (ya está) y en Soler; «mar», en Mar (ya está) y en Marín.
    search("sol");
    expect(results()).toEqual(["Soler, Ana2014"]);

    search("mar");
    expect(results()).toEqual(["Marín, Luis"]);
  });

  it("con la plantilla vacía, ofrece a todas las personas que le llegan", () => {
    renderSection({ players: [] });

    search("sol");

    expect(results()).toEqual(["Sol, Dani", "Soler, Ana2014"]);
  });

  it("añade a la persona elegida con su dorsal, como número, y su posición", async () => {
    renderSection();

    search("soler");
    pick(/Soler, Ana/);
    typeIn(existing(), JERSEY, "7");
    typeIn(existing(), POSITION, "Base");
    addExisting();

    await within(existing()).findByText("Añadido a la plantilla.");
    expect(mocks.addPlayer).toHaveBeenCalledTimes(1);
    expect(mocks.addPlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      personId: ANA,
      jerseyNumber: 7,
      position: "Base",
    });
    expect(mocks.addNewPlayer).not.toHaveBeenCalled();
  });

  it("sin dorsal ni posición: el dorsal viaja null, no 0", async () => {
    renderSection();

    search("marín");
    pick(/Marín, Luis/);
    addExisting();

    await within(existing()).findByText("Añadido a la plantilla.");
    expect(mocks.addPlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      personId: LUIS,
      jerseyNumber: null,
      position: "",
    });
  });

  it("tras añadir, el formulario vuelve a empezar: buscador, dorsal y posición vacíos", async () => {
    renderSection();

    search("soler");
    pick(/Soler, Ana/);
    typeIn(existing(), JERSEY, "7");
    typeIn(existing(), POSITION, "Base");
    addExisting();

    await within(existing()).findByText("Añadido a la plantilla.");
    expect(within(existing()).getByLabelText("Persona")).toHaveValue("");
    expect(within(existing()).queryByRole("list")).not.toBeInTheDocument();
    expect(within(existing()).getByLabelText(JERSEY)).toHaveValue(null);
    expect(within(existing()).getByLabelText(POSITION)).toHaveValue("");
  });

  it("sin persona elegida dice «Elige a una persona.» en el buscador y no llama a la acción", async () => {
    renderSection();

    typeIn(existing(), JERSEY, "7");
    addExisting();

    const field = within(existing()).getByLabelText("Persona");
    const message = await within(existing()).findByText("Elige a una persona.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", message.id);
    expect(mocks.addPlayer).not.toHaveBeenCalled();
    // Lo ya escrito no se pierde.
    expect(within(existing()).getByLabelText(JERSEY)).toHaveValue(7);
  });

  it("el aviso de que falta la persona se quita al elegir a alguien", () => {
    renderSection();

    addExisting();
    expect(within(existing()).getByText("Elige a una persona.")).toBeInTheDocument();
    search("soler");
    pick(/Soler, Ana/);

    expect(within(existing()).queryByText("Elige a una persona.")).not.toBeInTheDocument();
    expect(within(existing()).getByText("Soler, Ana")).toBeInTheDocument();
  });

  it("si ya estaba (la acción marca `personId`), se dice junto a la persona elegida", async () => {
    mocks.addPlayer.mockResolvedValue(fail("INVALID", { personId: "Ya está en la plantilla." }));
    renderSection();

    search("soler");
    pick(/Soler, Ana/);
    addExisting();

    expect(await within(existing()).findByText("Ya está en la plantilla.")).toBeInTheDocument();
    expect(within(existing()).getByText("Soler, Ana")).toBeInTheDocument();
    expect(within(existing()).queryByText("Añadido a la plantilla.")).not.toBeInTheDocument();
  });

  it("un dorsal repetido se dice bajo el dorsal, y no se pierde nada de lo elegido", async () => {
    mocks.addPlayer.mockResolvedValue(
      fail("INVALID", { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." }),
    );
    renderSection();

    search("soler");
    pick(/Soler, Ana/);
    typeIn(existing(), JERSEY, "4");
    addExisting();

    const message = await within(existing()).findByText("Ese dorsal ya lo lleva otra persona del equipo.");
    expect(within(existing()).getByLabelText(JERSEY)).toHaveAttribute("aria-describedby", message.id);
    expect(within(existing()).getByLabelText(JERSEY)).toHaveValue(4);
    expect(within(existing()).getByText("Soler, Ana")).toBeInTheDocument();
    // El error es del dorsal: la persona no se marca.
    expect(within(existing()).queryByText("Elige a una persona.")).not.toBeInTheDocument();
  });

  it("mientras añade, el botón espera y no se añade dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.addPlayer.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderSection();

    search("soler");
    pick(/Soler, Ana/);
    addExisting();
    await waitFor(() =>
      expect(within(existing()).getByRole("button", { name: "Añadir a la plantilla" })).toBeDisabled(),
    );
    addExisting();
    expect(mocks.addPlayer).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await within(existing()).findByText("Añadido a la plantilla.");
  });
});

describe("RosterSection · dar de alta a alguien nuevo", () => {
  function fillNew() {
    typeIn(fresh(), "Nombre", "Nora");
    typeIn(fresh(), "Apellidos", "Gil Pardo");
    typeIn(fresh(), YEAR, "2014");
    typeIn(fresh(), JERSEY, "7");
    typeIn(fresh(), POSITION, "Pívot");
  }

  it("el formulario empieza vacío, con los topes de cada campo", () => {
    renderSection();

    expect(within(fresh()).getByLabelText("Nombre")).toHaveValue("");
    expect(within(fresh()).getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
    expect(within(fresh()).getByLabelText("Apellidos")).toHaveAttribute("maxlength", "60");
    expect(within(fresh()).getByLabelText(YEAR)).toHaveAttribute("min", "1900");
    expect(within(fresh()).getByLabelText(JERSEY)).toHaveAttribute("max", "99");
    expect(within(fresh()).getByLabelText(POSITION)).toHaveAttribute("maxlength", "30");
  });

  it("pide solo el año de nacimiento, y lo dice: no hay ningún campo de fecha", () => {
    const { container } = renderSection();

    expect(within(fresh()).getByLabelText(YEAR)).toHaveAccessibleDescription("Solo el año, nunca la fecha completa.");
    expect(within(fresh()).getByLabelText(YEAR)).toHaveAttribute("type", "number");
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("«Dar de alta y añadir» es secondary y lo describe su encabezado", () => {
    renderSection();

    const button = within(fresh()).getByRole("button", { name: "Dar de alta y añadir" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription("Dar de alta a alguien nuevo");
  });

  it("da de alta y añade de una vez, con el año y el dorsal como números", async () => {
    renderSection();

    fillNew();
    addNew();

    await within(fresh()).findByText("Dado de alta y añadido a la plantilla.");
    expect(mocks.addNewPlayer).toHaveBeenCalledTimes(1);
    expect(mocks.addNewPlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      firstName: "Nora",
      lastName: "Gil Pardo",
      birthYear: 2014,
      jerseyNumber: 7,
      position: "Pívot",
    });
    expect(mocks.addPlayer).not.toHaveBeenCalled();
  });

  it("solo con nombre y apellidos: el año y el dorsal viajan null, no 0", async () => {
    renderSection();

    typeIn(fresh(), "Nombre", "Nora");
    typeIn(fresh(), "Apellidos", "Gil Pardo");
    addNew();

    await within(fresh()).findByText("Dado de alta y añadido a la plantilla.");
    expect(mocks.addNewPlayer).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      firstName: "Nora",
      lastName: "Gil Pardo",
      birthYear: null,
      jerseyNumber: null,
      position: "",
    });
  });

  it("tras el alta, vacía el formulario entero y vuelve al nombre, listo para el siguiente", async () => {
    renderSection();

    fillNew();
    addNew();

    await within(fresh()).findByText("Dado de alta y añadido a la plantilla.");
    expect(within(fresh()).getByLabelText("Nombre")).toHaveValue("");
    expect(within(fresh()).getByLabelText("Apellidos")).toHaveValue("");
    expect(within(fresh()).getByLabelText(YEAR)).toHaveValue(null);
    expect(within(fresh()).getByLabelText(JERSEY)).toHaveValue(null);
    expect(within(fresh()).getByLabelText(POSITION)).toHaveValue("");
    await waitFor(() => expect(within(fresh()).getByLabelText("Nombre")).toHaveFocus());
  });

  it("el aviso del alta se quita al empezar a escribir el siguiente", async () => {
    renderSection();

    fillNew();
    addNew();
    await within(fresh()).findByText("Dado de alta y añadido a la plantilla.");
    typeIn(fresh(), "Nombre", "O");

    expect(within(fresh()).queryByText("Dado de alta y añadido a la plantilla.")).not.toBeInTheDocument();
  });

  it("entrada inválida: cada error bajo su campo, enlazado, y no se vacía nada", async () => {
    mocks.addNewPlayer.mockResolvedValue(
      fail("INVALID", {
        firstName: "Escribe un nombre.",
        lastName: "Escribe los apellidos.",
        birthYear: "Escribe un año de nacimiento válido.",
        jerseyNumber: "El dorsal tiene que estar entre 0 y 99.",
        position: "Máximo 30 caracteres.",
      }),
    );
    renderSection();

    typeIn(fresh(), YEAR, "1800");
    typeIn(fresh(), JERSEY, "100");
    addNew();

    expect(await within(fresh()).findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Nombre", "Escribe un nombre."],
      ["Apellidos", "Escribe los apellidos."],
      [YEAR, "Escribe un año de nacimiento válido."],
      [JERSEY, "El dorsal tiene que estar entre 0 y 99."],
      [POSITION, "Máximo 30 caracteres."],
    ]) {
      const field = within(fresh()).getByLabelText(label);
      const text = within(fresh()).getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" "), label).toContain(text.id);
    }
    expect(within(fresh()).getByLabelText(YEAR)).toHaveValue(1800);
    expect(within(fresh()).getByLabelText(JERSEY)).toHaveValue(100);
    // El otro formulario no se entera.
    expect(within(existing()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un dorsal repetido no da de alta a nadie: se dice bajo el dorsal y lo escrito sigue ahí", async () => {
    mocks.addNewPlayer.mockResolvedValue(
      fail("INVALID", { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." }),
    );
    renderSection();

    fillNew();
    addNew();

    await within(fresh()).findByText("Ese dorsal ya lo lleva otra persona del equipo.");
    expect(within(fresh()).getByLabelText("Nombre")).toHaveValue("Nora");
    expect(within(fresh()).queryByText("Dado de alta y añadido a la plantilla.")).not.toBeInTheDocument();
  });

  it("si la acción lanza, lo dice sin el error técnico y no pierde lo escrito", async () => {
    mocks.addNewPlayer.mockRejectedValue(new Error("fetch failed"));
    renderSection();

    fillNew();
    addNew();

    const alert = await within(fresh()).findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(within(fresh()).getByLabelText("Apellidos")).toHaveValue("Gil Pardo");
  });

  it("mientras da de alta, el botón espera y no se da de alta dos veces", async () => {
    let finish: (result: ActionResult<{ personId: string }>) => void = () => {};
    mocks.addNewPlayer.mockReturnValue(
      new Promise<ActionResult<{ personId: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderSection();

    fillNew();
    addNew();
    await waitFor(() =>
      expect(within(fresh()).getByRole("button", { name: "Dar de alta y añadir" })).toBeDisabled(),
    );
    addNew();
    expect(mocks.addNewPlayer).toHaveBeenCalledTimes(1);

    finish(ok({ personId: NEW_ID }));
    await within(fresh()).findByText("Dado de alta y añadido a la plantilla.");
  });

  it("usa el club y el equipo que le pasan", async () => {
    renderSection({ clubSlug: "club-b", teamId: uuid(2) });

    typeIn(fresh(), "Nombre", "Nora");
    typeIn(fresh(), "Apellidos", "Gil Pardo");
    addNew();

    await waitFor(() => expect(mocks.addNewPlayer).toHaveBeenCalledTimes(1));
    expect(mocks.addNewPlayer.mock.calls[0][0]).toBe("club-b");
    expect(mocks.addNewPlayer.mock.calls[0][1]).toMatchObject({ teamId: uuid(2) });
  });
});
