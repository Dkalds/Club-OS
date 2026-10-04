import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { PracticeItemDraft, SavedPracticeItem } from "@/modules/practice/types";

const mocks = vi.hoisted(() => ({ savePracticeItems: vi.fn() }));

vi.mock("@/modules/practice/actions", () => ({ savePracticeItems: mocks.savePracticeItems }));

import { PracticeBuilder } from "./practice-builder";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const EVENT = "00000000-0000-4000-8000-0000000000e1";
const DRILL = "00000000-0000-4000-8000-0000000000d1";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const UPDATED_AT = "2026-10-04T10:00:00.123456+00:00";
const NEXT_UPDATED_AT = "2026-10-04T10:05:00.654321+00:00";
const THIRD_UPDATED_AT = "2026-10-04T10:06:00.000001+00:00";

function item(n: number, title: string, phase: string | null, minutes: number): SavedPracticeItem {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    drillId: null,
    title,
    phase,
    minutes,
    notes: null,
  };
}

// «A», «B» y «C»: 10 + 15 + 10 = 35 minutos.
const A = item(1, "Rueda de pases", "Activación", 10);
const B = item(2, "Tres calles", "Técnica", 15);
const C = item(3, "Dos contra dos", null, 10);
const ITEMS = [A, B, C];

type Props = Parameters<typeof PracticeBuilder>[0];

function renderBuilder(props: Partial<Props> = {}) {
  const handlers = { onSaved: vi.fn(), onDirtyChange: vi.fn(), onPendingChange: vi.fn(), onReload: vi.fn() };
  const element = (next: Partial<Props>) => (
    <PracticeBuilder
      clubSlug="club-a"
      eventId={EVENT}
      initialItems={ITEMS}
      expectedUpdatedAt={UPDATED_AT}
      locked={false}
      {...handlers}
      {...props}
      {...next}
    />
  );
  const view = render(element({}));
  return { ...view, ...handlers, update: (next: Partial<Props>) => view.rerender(element(next)) };
}

/** Las filas de la lista, en su orden. */
const rows = () => screen.queryAllByRole("listitem");

/** El número y el título de cada fila, en el orden en que se ven: «01 Tres calles». */
function order(): string[] {
  return rows().map((row) => {
    const toggle = row.querySelector('[data-control="toggle"]') as HTMLElement;
    const title = toggle.lastElementChild?.textContent;
    return `${row.textContent?.slice(0, 2)} ${title}`;
  });
}

const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
/** El botón que abre y cierra una fila: su nombre es la fase y el título, tal como se leen. */
const toggle = button;
const open = click;
const saveButton = () => button("Guardar sesión");
const save = () => fireEvent.click(saveButton());

/** La fila del total, en la barra de guardado: «Total» y la suma. */
const total = () => screen.getByText("Total").parentElement as HTMLElement;

/** Lo que recibió la acción en su llamada número `call` (la primera es la 0). */
function sent(call = 0): { eventId: string; expectedUpdatedAt: string; items: PracticeItemDraft[] } {
  return mocks.savePracticeItems.mock.calls[call][1];
}

/** Una acción que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

/** Deja correr los temporizadores a cero pendientes (dnd-kit engancha así el teclado al coger). */
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

beforeAll(() => {
  // jsdom no implementa `scrollIntoView`; el constructor lo usa para dejar a la vista la fila nueva.
  Element.prototype.scrollIntoView = vi.fn();
});

let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.savePracticeItems.mockResolvedValue(ok({ updatedAt: NEXT_UPDATED_AT }));
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  // Ni avisos de React (`act`, claves) ni de dnd-kit.
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("PracticeBuilder · la lista", () => {
  it("pinta los ítems en su orden, numerados, con su fase, sus minutos y el total", () => {
    renderBuilder();

    expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos"]);
    expect(rows()[0]).toHaveTextContent("Activación");
    expect(rows()[0]).toHaveTextContent("10'");
    expect(rows()[1]).toHaveTextContent("15'");
    expect(within(total()).getByText("35'")).toBeInTheDocument();
    expect(within(total()).getByText("35 minutos")).toBeInTheDocument();
  });

  it("es una lista de verdad: cada fila es un <li> de una lista con su rol", () => {
    renderBuilder();

    const list = rows()[0].parentElement as HTMLElement;
    expect(list.tagName).toBe("UL");
    expect(list).toHaveAttribute("role", "list");
    expect(rows()).toHaveLength(3);
  });

  it("todas las filas empiezan cerradas, y solo una está abierta a la vez", () => {
    renderBuilder();

    expect(screen.queryByLabelText("Fase")).not.toBeInTheDocument();

    open("Activación Rueda de pases");
    expect(toggle("Activación Rueda de pases")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByLabelText("Fase")).toHaveLength(1);

    open("Técnica Tres calles");
    expect(toggle("Técnica Tres calles")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Activación Rueda de pases")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByLabelText("Fase")).toHaveLength(1);

    open("Técnica Tres calles");
    expect(toggle("Técnica Tres calles")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Fase")).not.toBeInTheDocument();
  });

  it("sin ítems lo dice, con el total a cero y sin lista", () => {
    renderBuilder({ initialItems: [] });

    expect(screen.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" })).toBeInTheDocument();
    expect(screen.getByText("Añade ejercicios para prepararla.")).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    expect(within(total()).getByText("0'")).toBeInTheDocument();
    expect(button("Añadir bloque libre")).toBeEnabled();
  });
});

describe("PracticeBuilder · ordenar", () => {
  // Review Focus 4: arrastrar con el dedo falla o no se puede.
  it("subir y bajar reordenan y renumeran", () => {
    renderBuilder();
    open("Activación Rueda de pases");

    click("Bajar Rueda de pases");
    expect(order()).toEqual(["01 Tres calles", "02 Rueda de pases", "03 Dos contra dos"]);

    click("Bajar Rueda de pases");
    expect(order()).toEqual(["01 Tres calles", "02 Dos contra dos", "03 Rueda de pases"]);
    expect(button("Bajar Rueda de pases")).toBeDisabled();

    click("Subir Rueda de pases");
    click("Subir Rueda de pases");
    expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos"]);
    expect(button("Subir Rueda de pases")).toBeDisabled();
  });

  it("la fila sigue abierta al moverse, y el total no cambia", () => {
    renderBuilder();
    open("Activación Rueda de pases");

    click("Bajar Rueda de pases");

    expect(toggle("Activación Rueda de pases")).toHaveAttribute("aria-expanded", "true");
    expect(within(total()).getByText("35'")).toBeInTheDocument();
  });

  it("tras mover, el foco sigue en el botón usado; en el extremo pasa a su pareja", () => {
    renderBuilder();
    open("Técnica Tres calles");

    button("Bajar Tres calles").focus();
    click("Bajar Tres calles");
    // Ha llegado al final: «Bajar» ya no se puede usar.
    expect(button("Subir Tres calles")).toHaveFocus();

    click("Subir Tres calles");
    expect(button("Subir Tres calles")).toHaveFocus();

    click("Subir Tres calles");
    expect(button("Bajar Tres calles")).toHaveFocus();
  });

  it("al mover con los botones se anuncia la posición nueva, como al arrastrar", () => {
    renderBuilder();
    open("Activación Rueda de pases");

    click("Bajar Rueda de pases");

    const announcement = screen.getByText("Rueda de pases está en la posición 2 de 3.");
    expect(announcement.closest('[role="status"]')).not.toBeNull();
  });

  describe("el asa", () => {
    it("cada fila tiene un botón «Mover {título}», que es lo único que arrastra", () => {
      renderBuilder();

      for (const title of ["Rueda de pases", "Tres calles", "Dos contra dos"]) {
        const handle = button(`Mover ${title}`);
        expect(handle.tagName, title).toBe("BUTTON");
        expect(handle, title).toHaveAttribute("type", "button");
        // El dedo sobre el asa arrastra; sobre el resto de la fila, desplaza la página.
        expect(handle, title).toHaveClass("touch-none");
      }
      expect(rows()[0]).not.toHaveClass("touch-none");
      expect(toggle("Activación Rueda de pases")).not.toHaveClass("touch-none");
    });

    it("mide 44 px de área aunque ocupe los 32 de su hueco", () => {
      renderBuilder();

      const handle = button("Mover Rueda de pases");
      expect(handle).toHaveClass("size-(--target-min)", "-mr-(--space-3)");
      expect(handle.parentElement).toHaveClass("w-8");
    });

    it("dice en español cómo se usa con el teclado", () => {
      renderBuilder();

      const handle = button("Mover Rueda de pases");
      expect(handle).toHaveAccessibleDescription(
        "Pulsa Espacio para coger el ejercicio, las flechas para moverlo y Espacio otra vez para soltarlo. Escape cancela.",
      );
      expect(handle).toHaveAttribute("aria-roledescription", "botón de ordenar");
    });

    it("con el teclado: Espacio coge la fila y lo anuncia; Escape cancela y lo anuncia", async () => {
      renderBuilder();
      const handle = button("Mover Tres calles");

      handle.focus();
      fireEvent.keyDown(handle, { code: "Space" });
      await tick();

      expect(await screen.findByText("Has cogido Tres calles.")).toBeInTheDocument();
      // La fila que se arrastra lo dice con su aspecto.
      expect(rows()[1].firstElementChild).toHaveClass("bg-surface-3", "shadow-sheet");

      fireEvent.keyDown(document, { code: "Escape" });

      expect(await screen.findByText("Has cancelado el movimiento.")).toBeInTheDocument();
      await waitFor(() => expect(rows()[1].firstElementChild).toHaveClass("bg-surface-1"));
      expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos"]);
    });
  });
});

describe("PracticeBuilder · minutos", () => {
  it("los minutos van de 5 en 5 y el total se recalcula", () => {
    renderBuilder();

    click("Más minutos, Rueda de pases");
    expect(rows()[0]).toHaveTextContent("15'");
    expect(within(total()).getByText("40'")).toBeInTheDocument();

    click("Menos minutos, Tres calles");
    click("Menos minutos, Tres calles");
    expect(rows()[1]).toHaveTextContent("5'");
    expect(within(total()).getByText("30'")).toBeInTheDocument();
  });

  it("no pasa de 120' ni baja de 1'", () => {
    renderBuilder({ initialItems: [item(1, "Partido largo", null, 118), item(2, "Saludo", null, 5)] });

    click("Más minutos, Partido largo");
    expect(rows()[0]).toHaveTextContent("120'");
    click("Más minutos, Partido largo");
    expect(rows()[0]).toHaveTextContent("120'");

    click("Menos minutos, Saludo");
    expect(rows()[1]).toHaveTextContent("1'");
    click("Menos minutos, Saludo");
    expect(rows()[1]).toHaveTextContent("1'");

    expect(within(total()).getByText("121'")).toBeInTheDocument();
  });
});

describe("PracticeBuilder · editar una fila", () => {
  it("abierta, ofrece «Fase», «Título» y «Notas», con sus límites", () => {
    renderBuilder({ initialItems: [{ ...A, notes: "Con dos balones." }, B] });
    open("Activación Rueda de pases");

    const editor = screen.getByRole("group", { name: "Editar Rueda de pases" });
    expect(within(editor).getByLabelText("Fase")).toHaveValue("Activación");
    expect(within(editor).getByLabelText("Título")).toHaveValue("Rueda de pases");
    expect(within(editor).getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(within(editor).getByLabelText("Notas")).toHaveValue("Con dos balones.");
    expect(within(editor).getByLabelText("Notas")).toHaveAttribute("maxlength", "500");
  });

  it("«Fase» ofrece «Sin fase», las fases de una sesión y las que ya tenga algún ítem", () => {
    renderBuilder({ initialItems: [A, item(2, "Tres calles", "Juego reducido", 15)] });
    open("Activación Rueda de pases");

    const options = within(screen.getByLabelText("Fase")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Sin fase",
      "Activación",
      "Técnica",
      "Táctica",
      "Rebote",
      "Transición",
      "Defensa",
      "Competición",
      "Vuelta a la calma",
      "Juego reducido",
    ]);
    expect((options[0] as HTMLOptionElement).value).toBe("");
  });

  it("cambiar la fase, el título y las notas se ve en la fila y es lo que se guarda", async () => {
    renderBuilder();
    open("Dos contra dos");

    fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "Competición" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Dos contra dos con ayuda" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Sin bote." } });

    expect(toggle("Competición Dos contra dos con ayuda")).toHaveAttribute("aria-expanded", "true");
    expect(button("Mover Dos contra dos con ayuda")).toBeInTheDocument();

    save();
    await screen.findByText("Sesión guardada.");
    expect(sent().items[2]).toStrictEqual({
      id: C.id,
      drillId: null,
      title: "Dos contra dos con ayuda",
      phase: "Competición",
      minutes: 10,
      notes: "Sin bote.",
    });
  });

  it("«Sin fase» y unas notas vacías se guardan como null", async () => {
    renderBuilder({ initialItems: [{ ...A, notes: "Con dos balones." }] });
    open("Activación Rueda de pases");

    fireEvent.change(screen.getByLabelText("Fase"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "" } });
    save();

    await screen.findByText("Sesión guardada.");
    expect(sent().items[0]).toMatchObject({ phase: null, notes: null });
  });

  it("un ítem con ejercicio no deja cambiar el título: es el del ejercicio", () => {
    renderBuilder({ initialItems: [{ ...A, drillId: DRILL }] });
    open("Activación Rueda de pases");

    expect(screen.getByLabelText("Fase")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  });
});

describe("PracticeBuilder · añadir y quitar", () => {
  it("añadir y quitar un bloque libre", () => {
    renderBuilder();
    open("Activación Rueda de pases");

    click("Añadir bloque libre");

    // Al final, con 10 minutos, abierto (y es el único abierto) y con el foco en «Título».
    expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos", "04 Sin título"]);
    expect(rows()[3]).toHaveTextContent("10'");
    expect(toggle("Sin título")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Activación Rueda de pases")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Título")).toHaveFocus();
    expect(screen.getByLabelText("Fase")).toHaveValue("");
    expect(within(total()).getByText("45'")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Juego libre" } });
    expect(order()[3]).toBe("04 Juego libre");
    // Escribir no mueve el foco del campo.
    expect(screen.getByLabelText("Título")).toHaveFocus();

    click("Quitar Juego libre");

    expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos"]);
    expect(within(total()).getByText("35'")).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  });

  it("al quitar se anuncia, y el foco va a la fila que ocupa su sitio", () => {
    renderBuilder();
    open("Activación Rueda de pases");

    click("Quitar Rueda de pases");

    expect(order()).toEqual(["01 Tres calles", "02 Dos contra dos"]);
    expect(screen.getByText("Has quitado Rueda de pases.").closest('[role="status"]')).not.toBeNull();
    expect(toggle("Técnica Tres calles")).toHaveFocus();
  });

  it("al quitar la última fila, el foco va a la anterior; y sin filas, a «Añadir bloque libre»", () => {
    renderBuilder({ initialItems: [A, B] });

    open("Técnica Tres calles");
    click("Quitar Tres calles");
    expect(toggle("Activación Rueda de pases")).toHaveFocus();

    open("Activación Rueda de pases");
    click("Quitar Rueda de pases");
    expect(rows()).toHaveLength(0);
    expect(button("Añadir bloque libre")).toHaveFocus();
  });

  it("«Añadir bloque libre» es secondary, a todo el ancho", () => {
    renderBuilder();

    expect(button("Añadir bloque libre")).toHaveClass("border-line-strong", "w-full");
    expect(button("Añadir bloque libre")).toHaveAttribute("type", "button");
  });

  it("con 30 ítems no deja añadir, y dice por qué", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, null, 5));
    renderBuilder({ initialItems: thirty });

    const add = button("Añadir bloque libre");
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("Una sesión tiene como máximo 30 ejercicios.");
    expect(screen.getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeVisible();
  });

  it("con 29 deja añadir el que hace 30, y ahí se para", () => {
    const twentyNine = Array.from({ length: 29 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, null, 5));
    renderBuilder({ initialItems: twentyNine });

    expect(screen.queryByText("Una sesión tiene como máximo 30 ejercicios.")).not.toBeInTheDocument();
    click("Añadir bloque libre");

    expect(rows()).toHaveLength(30);
    expect(button("Añadir bloque libre")).toBeDisabled();
    expect(screen.getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeInTheDocument();
  });

  describe("extraActions", () => {
    const DRILL_ITEM: PracticeItemDraft = {
      drillId: DRILL,
      title: "Rebote y salida",
      phase: null,
      minutes: 12,
      notes: null,
    };

    function extraActions(add: (item: PracticeItemDraft) => void): ReactNode {
      return (
        <button type="button" onClick={() => add(DRILL_ITEM)}>
          Añadir ejercicio
        </button>
      );
    }

    it("se pinta encima de «Añadir bloque libre»", () => {
      renderBuilder({ extraActions });

      const extra = button("Añadir ejercicio");
      expect(extra.compareDocumentPosition(button("Añadir bloque libre"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(rows().at(-1)?.compareDocumentPosition(extra)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("`add` añade el ítem al final, cerrado, y se guarda con su ejercicio y sin id", async () => {
      const { onDirtyChange } = renderBuilder({ extraActions });

      click("Añadir ejercicio");

      expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Dos contra dos", "04 Rebote y salida"]);
      expect(rows()[3]).toHaveTextContent("12'");
      expect(toggle("Rebote y salida")).toHaveAttribute("aria-expanded", "false");
      expect(within(total()).getByText("47'")).toBeInTheDocument();
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);

      save();
      await screen.findByText("Sesión guardada.");
      expect(sent().items[3]).toStrictEqual(DRILL_ITEM);
    });

    it("con 30 ítems, `add` no añade nada", () => {
      const thirty = Array.from({ length: 30 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, null, 5));
      renderBuilder({ initialItems: thirty, extraActions });

      click("Añadir ejercicio");

      expect(rows()).toHaveLength(30);
    });

    it("recibe también si la sesión está llena, y lo sabe en la misma pintura en que se llena", () => {
      const twentyNine = Array.from({ length: 29 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, null, 5));
      const seen: boolean[] = [];
      function watching(add: (item: PracticeItemDraft) => void, full: boolean): ReactNode {
        seen.push(full);
        return (
          <button type="button" onClick={() => add(DRILL_ITEM)}>
            Añadir ejercicio
          </button>
        );
      }
      renderBuilder({ initialItems: twentyNine, extraActions: watching });
      expect(seen.at(-1)).toBe(false);

      click("Añadir ejercicio");

      expect(rows()).toHaveLength(30);
      expect(seen.at(-1)).toBe(true);
    });

    // Quien elige varios ejercicios de una vez llama a `add` varias veces en el mismo evento.
    describe("dos `add` en el mismo evento", () => {
      const SECOND: PracticeItemDraft = { ...DRILL_ITEM, title: "Pase y va", minutes: 8 };

      function addTwo(add: (item: PracticeItemDraft) => void): ReactNode {
        return (
          <button
            type="button"
            onClick={() => {
              add(DRILL_ITEM);
              add(SECOND);
            }}
          >
            Añadir dos ejercicios
          </button>
        );
      }

      it("añaden los dos, en su orden, cada uno con su fila, y los dos se guardan", async () => {
        const { onDirtyChange } = renderBuilder({ extraActions: addTwo });

        click("Añadir dos ejercicios");

        expect(order()).toEqual([
          "01 Rueda de pases",
          "02 Tres calles",
          "03 Dos contra dos",
          "04 Rebote y salida",
          "05 Pase y va",
        ]);
        expect(within(total()).getByText("55'")).toBeInTheDocument();
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);

        // Son dos filas distintas: cambiar una no toca la otra (de 8, el paso sube a 10).
        click("Más minutos, Pase y va");
        expect(rows()[3]).toHaveTextContent("12'");
        expect(rows()[4]).toHaveTextContent("10'");

        save();
        await screen.findByText("Sesión guardada.");
        expect(sent().items.slice(3)).toStrictEqual([DRILL_ITEM, { ...SECOND, minutes: 10 }]);
      });

      it("con 29 ítems solo cabe el primero", () => {
        const twentyNine = Array.from({ length: 29 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, null, 5));
        renderBuilder({ initialItems: twentyNine, extraActions: addTwo });

        click("Añadir dos ejercicios");

        expect(rows()).toHaveLength(30);
        expect(order()[29]).toBe("30 Rebote y salida");
      });
    });
  });
});

describe("PracticeBuilder · guardar", () => {
  it("«Guardar sesión» es el primary y está desactivado mientras no hay cambios", () => {
    renderBuilder();

    expect(saveButton()).toHaveClass("bg-brand-accent");
    expect(saveButton()).toBeDisabled();

    click("Más minutos, Rueda de pases");
    expect(saveButton()).toBeEnabled();

    // Deshacer el cambio vuelve a dejar la lista como la guardada.
    click("Menos minutos, Rueda de pases");
    expect(saveButton()).toBeDisabled();
  });

  it("guardar envía el orden nuevo", async () => {
    mocks.savePracticeItems
      .mockResolvedValueOnce(ok({ updatedAt: NEXT_UPDATED_AT }))
      .mockResolvedValueOnce(ok({ updatedAt: THIRD_UPDATED_AT }));
    const { onSaved, update } = renderBuilder();
    open("Activación Rueda de pases");
    click("Bajar Rueda de pases");

    save();

    expect(await screen.findByText("Sesión guardada.")).toBeInTheDocument();
    expect(mocks.savePracticeItems).toHaveBeenCalledTimes(1);
    expect(mocks.savePracticeItems.mock.calls[0][0]).toBe("club-a");
    // Los ítems en su orden, con sus `id`, y nada de lo que el constructor lleva por dentro.
    expect(sent()).toStrictEqual({ eventId: EVENT, expectedUpdatedAt: UPDATED_AT, items: [B, A, C] });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(NEXT_UPDATED_AT);

    // La copia esperada la manda quien lo monta: el siguiente guardado usa la que le dé.
    update({ expectedUpdatedAt: NEXT_UPDATED_AT });
    click("Más minutos, Tres calles");
    save();

    await waitFor(() => expect(mocks.savePracticeItems).toHaveBeenCalledTimes(2));
    expect(sent(1).expectedUpdatedAt).toBe(NEXT_UPDATED_AT);
    expect(sent(1).items).toStrictEqual([{ ...B, minutes: 20 }, A, C]);
    await waitFor(() => expect(onSaved).toHaveBeenLastCalledWith(THIRD_UPDATED_AT));
  });

  it("un bloque nuevo se envía sin `id`, con lo escrito", async () => {
    renderBuilder();
    click("Añadir bloque libre");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Juego libre" } });

    save();

    await screen.findByText("Sesión guardada.");
    expect(sent().items).toHaveLength(4);
    expect(sent().items[3]).toStrictEqual({
      drillId: null,
      title: "Juego libre",
      phase: null,
      minutes: 10,
      notes: null,
    });
  });

  it("dice «Sesión guardada.» en una región de estado que ya estaba, y un cambio lo quita", async () => {
    renderBuilder();
    // La región está siempre en el árbol: un lector de pantalla solo anuncia lo que cambia dentro.
    const regions = screen.getAllByRole("status");
    click("Más minutos, Rueda de pases");

    save();

    const status = (await screen.findByText("Sesión guardada.")).closest('[role="status"]') as HTMLElement;
    expect(regions).toContain(status);

    click("Más minutos, Rueda de pases");
    expect(status).toBeEmptyDOMElement();
    expect(status).toBeInTheDocument();
  });

  it("mientras guarda no se puede enviar otra vez, y al terminar vuelve a no haber cambios", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.savePracticeItems.mockReturnValue(pending.promise);
    const { onSaved } = renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText("Sesión guardada.")).not.toBeInTheDocument();

    pending.finish(ok({ updatedAt: NEXT_UPDATED_AT }));
    await screen.findByText("Sesión guardada.");
    expect(saveButton()).toBeDisabled();
    expect(mocks.savePracticeItems).toHaveBeenCalledTimes(1);
  });

  it("lo que se cambia mientras guarda sigue sin guardar: no dice «Sesión guardada.»", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.savePracticeItems.mockReturnValue(pending.promise);
    const { onSaved, onDirtyChange } = renderBuilder();
    click("Más minutos, Rueda de pases");
    save();
    await waitFor(() => expect(saveButton()).toBeDisabled());

    click("Más minutos, Tres calles");
    pending.finish(ok({ updatedAt: NEXT_UPDATED_AT }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(NEXT_UPDATED_AT));
    expect(screen.queryByText("Sesión guardada.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(rows()[1]).toHaveTextContent("20'");
  });
});

describe("PracticeBuilder · con otro guardado de la pantalla en marcha", () => {
  it("con `locked`, «Guardar sesión» espera aunque haya cambios, y vuelve al quitarse", () => {
    const { update } = renderBuilder({ locked: true });

    click("Más minutos, Rueda de pases");
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(mocks.savePracticeItems).not.toHaveBeenCalled();
    // Lo que se monta no espera: solo el guardado.
    expect(rows()[0]).toHaveTextContent("15'");

    update({ locked: false });
    expect(saveButton()).toBeEnabled();
  });

  it("avisa a quien lo monta de que está guardando, desde el toque, y de que ha terminado", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.savePracticeItems.mockReturnValue(pending.promise);
    const { onPendingChange } = renderBuilder();
    click("Más minutos, Rueda de pases");
    expect(onPendingChange).not.toHaveBeenCalledWith(true);

    save();
    // En el mismo toque, sin esperar a ninguna pintura: el otro guardado se cierra ya.
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    pending.finish(ok({ updatedAt: NEXT_UPDATED_AT }));
    await screen.findByText("Sesión guardada.");
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
  });

  it("si el guardado falla, también avisa de que ha terminado", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("SAVE_FAILED"));
    const { onPendingChange } = renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
    expect(onPendingChange).toHaveBeenCalledWith(true);
  });
});

describe("PracticeBuilder · cambios sin guardar", () => {
  it("avisa a quien lo monta cuando la lista deja de ser la guardada, y cuando vuelve a serlo", async () => {
    const { onDirtyChange } = renderBuilder();
    expect(onDirtyChange).not.toHaveBeenCalled();

    click("Más minutos, Rueda de pases");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    click("Menos minutos, Rueda de pases");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    open("Activación Rueda de pases");
    click("Bajar Rueda de pases");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    save();
    await screen.findByText("Sesión guardada.");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("abrir y cerrar filas no es un cambio", () => {
    const { onDirtyChange } = renderBuilder();

    open("Activación Rueda de pases");
    open("Técnica Tres calles");

    expect(onDirtyChange).not.toHaveBeenCalled();
    expect(saveButton()).toBeDisabled();
  });
});

describe("PracticeBuilder · cuando falla", () => {
  // Review Focus 5: guardar falla y lo escrito sigue en pantalla.
  it("si falla, lo escrito sigue ahí", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("SAVE_FAILED"));
    const { onSaved, onDirtyChange } = renderBuilder();
    click("Añadir bloque libre");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Juego libre" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "A media pista." } });
    click("Subir Juego libre");
    click("Más minutos, Rueda de pases");

    save();

    const alert = (await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).closest('[role="alert"]');
    // El aviso se lleva el foco en un efecto, que corre un turno después de pintarse: se espera.
    await waitFor(() => expect(alert).toHaveFocus());
    expect(order()).toEqual(["01 Rueda de pases", "02 Tres calles", "03 Juego libre", "04 Dos contra dos"]);
    expect(rows()[0]).toHaveTextContent("15'");
    expect(screen.getByLabelText("Título")).toHaveValue("Juego libre");
    expect(screen.getByLabelText("Notas")).toHaveValue("A media pista.");
    expect(within(total()).getByText("50'")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText("Sesión guardada.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  });

  it("si la llamada se cae, es un SAVE_FAILED sin el mensaje del error, y lo escrito sigue ahí", async () => {
    mocks.savePracticeItems.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent("15'");
    expect(saveButton()).toBeEnabled();
  });

  it("al volver a guardar se quita el aviso anterior", async () => {
    mocks.savePracticeItems.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderBuilder();
    click("Más minutos, Rueda de pases");
    save();
    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);

    save();

    await screen.findByText("Sesión guardada.");
    expect(screen.queryByText(ACTION_ERROR_COPY.SAVE_FAILED)).not.toBeInTheDocument();
  });

  // Review Focus 2: otra persona guardó antes.
  it("copia obsoleta ofrece recargar", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("STALE_COPY"));
    const { onReload } = renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    const alert = (await screen.findByText(ACTION_ERROR_COPY.STALE_COPY)).closest('[role="alert"]') as HTMLElement;
    const reload = within(alert).getByRole("button", { name: "Recargar" });
    expect(reload).toHaveClass("border-line-strong");
    // Hasta que se pulsa, lo escrito sigue en pantalla.
    expect(rows()[0]).toHaveTextContent("15'");
    expect(onReload).not.toHaveBeenCalled();

    fireEvent.click(reload);

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("sesión cerrada ofrece volver a la sesión", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("SESSION_CLOSED"));
    renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    const alert = (await screen.findByText(ACTION_ERROR_COPY.SESSION_CLOSED)).closest('[role="alert"]') as HTMLElement;
    expect(within(alert).getByRole("link", { name: "Volver a la sesión" })).toHaveAttribute(
      "href",
      `/c/club-a/train/${EVENT}`,
    );
    expect(within(alert).queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent("15'");
  });

  it("título vacío: el error se pinta en su fila, que se abre", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("INVALID", { "items.1.title": "Escribe un título." }));
    renderBuilder();
    open("Activación Rueda de pases");
    open("Técnica Tres calles");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "" } });
    open("Técnica Sin título");

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(ACTION_ERROR_COPY.INVALID).toBe("Revisa los campos marcados.");
    expect(toggle("Técnica Sin título")).toHaveAttribute("aria-expanded", "true");
    const title = screen.getByLabelText("Título");
    expect(rows()[1]).toContainElement(title);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("Escribe un título.");
    expect(saveButton()).toBeEnabled();
  });

  it("con errores en varias filas se abre la primera, y cada una pinta el suyo al abrirla", async () => {
    mocks.savePracticeItems.mockResolvedValue(
      fail("INVALID", {
        "items.2.notes": "Máximo 500 caracteres.",
        "items.1.phase": "Máximo 40 caracteres.",
        "items.1.minutes": "Entre 1 y 120 minutos.",
      }),
    );
    renderBuilder();
    click("Más minutos, Rueda de pases");

    save();

    await screen.findByText(ACTION_ERROR_COPY.INVALID);
    expect(toggle("Técnica Tres calles")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Fase")).toHaveAccessibleDescription("Máximo 40 caracteres.");
    // Los minutos no son un campo del editor: su error sale arriba, dentro de la fila.
    expect(within(rows()[1]).getByText("Entre 1 y 120 minutos.")).toBeInTheDocument();
    expect(screen.queryByText("Máximo 500 caracteres.")).not.toBeInTheDocument();

    open("Dos contra dos");
    expect(screen.getByLabelText("Notas")).toHaveAccessibleDescription("Máximo 500 caracteres.");
  });

  it("el error sigue a su fila aunque después se mueva", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("INVALID", { "items.1.title": "Escribe un título." }));
    renderBuilder();
    click("Más minutos, Rueda de pases");
    save();
    await screen.findByText(ACTION_ERROR_COPY.INVALID);

    click("Subir Tres calles");

    expect(order()[0]).toBe("01 Tres calles");
    expect(rows()[0]).toContainElement(screen.getByLabelText("Título"));
    expect(screen.getByLabelText("Título")).toHaveAccessibleDescription("Escribe un título.");
  });
});
