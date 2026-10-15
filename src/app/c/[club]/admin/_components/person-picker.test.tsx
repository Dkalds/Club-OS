import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PersonPicker, type PickablePerson } from "./person-picker";

// Datos ficticios; de las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const person = (n: number, firstName: string, lastName: string, birthYear: number | null = null): PickablePerson => ({
  id: uuid(n),
  firstName,
  lastName,
  birthYear,
});

const PEOPLE: PickablePerson[] = [
  person(1, "Ana", "García López", 2014),
  person(2, "Bea", "Álvarez Ruiz", 2013),
  person(3, "María José", "Núñez", null),
  person(4, "Luis", "García Mora", 2012),
];

/** Diez personas con el mismo apellido: más de las que el buscador enseña de una vez. */
const MANY: PickablePerson[] = Array.from({ length: 10 }, (_, index) =>
  person(100 + index, `Persona ${String(index + 1).padStart(2, "0")}`, "Vega", 2010),
);

/** El buscador montado como lo monta un formulario: quien lo usa guarda el valor. */
function Harness({
  people = PEOPLE,
  initial = null,
  error,
  onChange,
}: {
  people?: readonly PickablePerson[];
  initial?: string | null;
  error?: string;
  onChange?: (personId: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initial);

  return (
    <PersonPicker
      label="Persona"
      people={people}
      value={value}
      error={error}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

const search = (text: string) => fireEvent.change(screen.getByLabelText("Persona"), { target: { value: text } });
const results = () => within(screen.getByRole("list", { name: "Resultados de persona" })).getAllByRole("button");
const resultNames = () => results().map((button) => button.textContent);

describe("PersonPicker · buscar", () => {
  it("es un campo de búsqueda con su etiqueta, sin autocompletar y con tope de texto", () => {
    render(<Harness />);

    const field = screen.getByLabelText("Persona");
    expect(field).toHaveAttribute("type", "search");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "80");
    expect(field).toHaveValue("");
  });

  it("sin escribir nada no enseña a nadie: ni lista ni aviso", () => {
    render(<Harness />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hay \d+ personas/)).not.toBeInTheDocument();
  });

  it("escribir solo espacios tampoco busca", () => {
    render(<Harness />);

    search("   ");

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("al escribir enseña a quien coincide, como «Apellidos, Nombre», con su año si lo tiene", () => {
    render(<Harness />);

    search("garcía");

    expect(resultNames()).toEqual(["García López, Ana2014", "García Mora, Luis2012"]);
    const [first] = results();
    expect(within(first).getByText("García López, Ana")).toBeInTheDocument();
    expect(within(first).getByText("2014")).toBeInTheDocument();
  });

  it("quien no tiene año de nacimiento sale solo con su nombre", () => {
    render(<Harness />);

    search("núñez");

    expect(resultNames()).toEqual(["Núñez, María José"]);
  });

  it("no distingue tildes ni mayúsculas", () => {
    render(<Harness />);

    search("ALVAREZ");
    expect(resultNames()).toEqual(["Álvarez Ruiz, Bea2013"]);

    search("maria jose");
    expect(resultNames()).toEqual(["Núñez, María José"]);
  });

  it("varias palabras, en cualquier orden", () => {
    render(<Harness />);

    search("mora luis");

    expect(resultNames()).toEqual(["García Mora, Luis2012"]);
  });

  it("los resultados salen en el orden en que llegan las personas", () => {
    render(<Harness people={[PEOPLE[3], PEOPLE[0]]} />);

    search("garcía");

    expect(resultNames()).toEqual(["García Mora, Luis2012", "García López, Ana2014"]);
  });

  it("los resultados son botones que no envían el formulario", () => {
    render(<Harness />);

    search("garcía");

    for (const button of results()) expect(button).toHaveAttribute("type", "button");
  });

  it("sin nadie con ese nombre lo dice como un estado, y sugiere el alta", () => {
    render(<Harness />);

    search("zzz");

    expect(screen.getByRole("status")).toHaveTextContent("Nadie con ese nombre. Si es alguien nuevo, dalo de alta.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("sin candidatas, cualquier búsqueda dice que no hay nadie", () => {
    render(<Harness people={[]} />);

    search("ana");

    expect(screen.getByRole("status")).toHaveTextContent("Nadie con ese nombre.");
  });
});

describe("PersonPicker · el tope de resultados", () => {
  it("con ocho coincidencias las enseña todas, sin aviso", () => {
    render(<Harness people={MANY.slice(0, 8)} />);

    search("vega");

    expect(results()).toHaveLength(8);
    expect(screen.queryByText(/Escribe algo más para afinar/)).not.toBeInTheDocument();
  });

  it("con más de ocho enseña las ocho primeras y dice cuántas hay", () => {
    render(<Harness people={MANY} />);

    search("vega");

    expect(results()).toHaveLength(8);
    expect(resultNames()[0]).toBe("Vega, Persona 012010");
    expect(resultNames()[7]).toBe("Vega, Persona 082010");
    expect(screen.getByText("Hay 10 personas. Escribe algo más para afinar.")).toBeInTheDocument();
  });

  it("afinar la búsqueda quita el aviso y deja ver a quien no cabía", () => {
    render(<Harness people={MANY} />);

    search("vega");
    expect(screen.queryByText("Vega, Persona 10")).not.toBeInTheDocument();
    search("vega 10");

    expect(resultNames()).toEqual(["Vega, Persona 102010"]);
    expect(screen.queryByText(/Escribe algo más para afinar/)).not.toBeInTheDocument();
  });
});

describe("PersonPicker · elegir y cambiar", () => {
  it("elegir a alguien avisa con su id", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    search("garcía");
    fireEvent.click(screen.getByRole("button", { name: /García Mora, Luis/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(uuid(4));
  });

  it("con alguien elegido enseña su nombre y «Cambiar», sin campo ni resultados", () => {
    render(<Harness />);

    search("garcía");
    fireEvent.click(screen.getByRole("button", { name: /García Mora, Luis/ }));

    expect(screen.getByText("García Mora, Luis")).toBeInTheDocument();
    expect(screen.getByText("Persona")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar" })).toHaveAttribute("type", "button");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("con un valor de entrada enseña a esa persona sin buscar", () => {
    render(<Harness initial={uuid(2)} />);

    expect(screen.getByText("Álvarez Ruiz, Bea")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("«Cambiar» quita a la persona y vuelve al buscador vacío", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    search("garcía");
    fireEvent.click(screen.getByRole("button", { name: /García Mora, Luis/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText("Persona")).toHaveValue("");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("García Mora, Luis")).not.toBeInTheDocument();
  });

  it("elegida una persona, la búsqueda se vacía: si quien lo monta la suelta (ya la ha añadido), no queda un texto viejo buscando", () => {
    const onChange = vi.fn();
    const picker = (value: string | null) => (
      <PersonPicker label="Persona" people={PEOPLE} value={value} onChange={onChange} />
    );
    const { rerender } = render(picker(null));

    search("garcía");
    fireEvent.click(screen.getByRole("button", { name: /García Mora, Luis/ }));
    rerender(picker(uuid(4)));
    expect(screen.getByText("García Mora, Luis")).toBeInTheDocument();
    // El formulario la añade y vuelve a empezar, sin pasar por «Cambiar».
    rerender(picker(null));

    expect(screen.getByLabelText("Persona")).toHaveValue("");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("al elegir a alguien, el foco pasa a «Cambiar»: el resultado que lo tenía ya no está", () => {
    render(<Harness />);

    search("garcía");
    const result = screen.getByRole("button", { name: /García Mora, Luis/ });
    result.focus();
    fireEvent.click(result);

    expect(screen.getByRole("button", { name: "Cambiar" })).toHaveFocus();
  });

  it("al pulsar «Cambiar», el foco vuelve al campo de búsqueda", () => {
    render(<Harness initial={uuid(1)} />);

    const change = screen.getByRole("button", { name: "Cambiar" });
    change.focus();
    fireEvent.click(change);

    expect(screen.getByLabelText("Persona")).toHaveFocus();
  });

  it("si es quien lo monta quien suelta a la persona (ya la ha añadido), no se lleva el foco", () => {
    const picker = (value: string | null) => (
      <PersonPicker label="Persona" people={PEOPLE} value={value} onChange={() => {}} />
    );
    const { rerender } = render(picker(uuid(1)));

    rerender(picker(null));

    expect(screen.getByLabelText("Persona")).not.toHaveFocus();
  });

  it("un valor que no está entre las candidatas se trata como nadie elegido: se puede buscar", () => {
    render(<Harness initial={uuid(999)} />);

    expect(screen.getByLabelText("Persona")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar" })).not.toBeInTheDocument();
  });
});

describe("PersonPicker · el error", () => {
  it("buscando, marca el campo y lo enlaza con el mensaje", () => {
    render(<Harness error="Elige a una persona." />);

    const field = screen.getByLabelText("Persona");
    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Elige a una persona.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", message.id);
  });

  it("sin error, el campo no está marcado ni describe nada", () => {
    render(<Harness />);

    const field = screen.getByLabelText("Persona");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con alguien elegido, el error se enseña bajo su nombre", () => {
    render(<Harness initial={uuid(1)} error="Ya está en la plantilla." />);

    expect(screen.getByText("García López, Ana")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Ya está en la plantilla.");
  });
});
