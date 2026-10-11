import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PersonSummary } from "@/modules/structure/types";
import { PeopleList } from "./people-list";

// Datos ficticios; de las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function person(n: number, firstName: string, lastName: string, overrides: Partial<PersonSummary> = {}): PersonSummary {
  return { id: uuid(n), firstName, lastName, birthYear: null, archived: false, teams: [], ...overrides };
}

const PEOPLE: PersonSummary[] = [
  person(1, "Ana", "Alonso", { birthYear: 2014, teams: ["Equipo A", "Equipo B"] }),
  person(2, "Luis", "Álvarez", { teams: ["Equipo A"] }),
  person(3, "María José", "Núñez", { birthYear: 2012 }),
  person(4, "Eva", "Zamora", { archived: true, birthYear: 1990 }),
  person(5, "Blas", "Arco", { archived: true }),
];

function renderList(people: readonly PersonSummary[] = PEOPLE) {
  return render(<PeopleList clubSlug="club-a" people={people} />);
}

const search = (text: string) => fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: text } });
const view = (name: "En el club" | "Archivadas") => screen.getByRole("button", { name });
const rows = () => screen.queryAllByRole("listitem");
const names = () => rows().map((row) => within(row).getByRole("link").querySelector(".text-body-strong")?.textContent);
const count = () => screen.getByRole("status").textContent;

describe("PeopleList · la lista", () => {
  it("enseña a quien está en el club, en el orden en que llega, y no a las archivadas", () => {
    renderList();

    expect(names()).toEqual(["Alonso, Ana", "Álvarez, Luis", "Núñez, María José"]);
    expect(screen.queryByText("Zamora, Eva")).not.toBeInTheDocument();
  });

  it("cada fila lleva a la página de la persona, por su id y no por su nombre", () => {
    renderList();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/c/club-a/admin/people/${uuid(1)}`,
      `/c/club-a/admin/people/${uuid(2)}`,
      `/c/club-a/admin/people/${uuid(3)}`,
    ]);
  });

  it("dice sus equipos de la temporada actual, o que no tiene", () => {
    renderList();

    const [first, second, third] = rows();
    expect(within(first).getByText("Equipo A, Equipo B")).toBeInTheDocument();
    expect(within(second).getByText("Equipo A")).toBeInTheDocument();
    expect(within(third).getByText("Sin equipo esta temporada")).toBeInTheDocument();
  });

  it("enseña el año de nacimiento de quien lo tiene, y solo el año", () => {
    renderList();

    const [first, second] = rows();
    expect(within(first).getByText("2014")).toBeInTheDocument();
    expect(within(second).queryByText(/^\d{4}$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/)).not.toBeInTheDocument();
  });

  it("es una lista: las filas van dentro de un <ul>", () => {
    renderList();

    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("PeopleList · el recuento", () => {
  it("dice cuántas personas se ven, como un estado", () => {
    renderList();

    expect(count()).toBe("3 personas");
  });

  it("una sola va en singular", () => {
    renderList([person(1, "Ana", "Alonso")]);

    expect(count()).toBe("1 persona");
  });

  it("sigue a la búsqueda y al conmutador", () => {
    renderList();

    search("al");
    expect(count()).toBe("2 personas");

    search("");
    fireEvent.click(view("Archivadas"));
    expect(count()).toBe("2 personas");

    search("zamora");
    expect(count()).toBe("1 persona");

    search("nadie");
    expect(count()).toBe("0 personas");
  });
});

describe("PeopleList · la búsqueda", () => {
  it("es un campo de búsqueda con su etiqueta, sin autocompletar y con tope de texto", () => {
    renderList();

    const field = screen.getByLabelText("Buscar");
    expect(field).toHaveAttribute("type", "search");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", "80");
  });

  it("filtra por nombre o apellidos", () => {
    renderList();

    search("maría");
    expect(names()).toEqual(["Núñez, María José"]);

    search("alonso");
    expect(names()).toEqual(["Alonso, Ana"]);
  });

  it("no distingue tildes ni mayúsculas", () => {
    renderList();

    search("ALVAREZ");
    expect(names()).toEqual(["Álvarez, Luis"]);

    search("nunez maria");
    expect(names()).toEqual(["Núñez, María José"]);
  });

  it("vaciar la búsqueda vuelve a enseñar a todas", () => {
    renderList();

    search("alonso");
    search("");

    expect(names()).toHaveLength(3);
  });

  it("no busca entre las archivadas mientras se ven las del club", () => {
    renderList();

    search("zamora");

    expect(rows()).toHaveLength(0);
    expect(screen.getByText("Nadie con ese nombre.")).toBeInTheDocument();
  });

  it("no busca por equipo: solo por el nombre de la persona", () => {
    renderList();

    search("Equipo A");

    expect(rows()).toHaveLength(0);
  });

  it("sin nadie con ese nombre lo dice, sin el aviso de lista vacía", () => {
    renderList();

    search("zzz");

    expect(screen.getByText("Nadie con ese nombre.")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay personas")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("PeopleList · el conmutador de archivadas", () => {
  it("son dos botones de un grupo con nombre, y empieza en «En el club»", () => {
    renderList();

    const group = screen.getByRole("group", { name: "Qué personas se ven" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "En el club",
      "Archivadas",
    ]);
    expect(view("En el club")).toHaveAttribute("aria-pressed", "true");
    expect(view("Archivadas")).toHaveAttribute("aria-pressed", "false");
  });

  it("«Archivadas» enseña solo a las archivadas, y lo marca", () => {
    renderList();

    fireEvent.click(view("Archivadas"));

    expect(names()).toEqual(["Zamora, Eva", "Arco, Blas"]);
    expect(view("Archivadas")).toHaveAttribute("aria-pressed", "true");
    expect(view("En el club")).toHaveAttribute("aria-pressed", "false");
  });

  it("«En el club» vuelve a las que están", () => {
    renderList();

    fireEvent.click(view("Archivadas"));
    fireEvent.click(view("En el club"));

    expect(names()).toEqual(["Alonso, Ana", "Álvarez, Luis", "Núñez, María José"]);
  });

  it("la búsqueda se mantiene al cambiar de vista", () => {
    renderList();

    search("a");
    fireEvent.click(view("Archivadas"));

    expect(screen.getByLabelText("Buscar")).toHaveValue("a");
    expect(names()).toEqual(["Zamora, Eva", "Arco, Blas"]);
  });

  it("los botones no envían ningún formulario y llegan al área táctil mínima", () => {
    renderList();

    for (const button of [view("En el club"), view("Archivadas")]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.className).toContain("min-h-(--target-min)");
    }
  });
});

describe("PeopleList · vacía", () => {
  it("sin personas en el club lo dice e invita a dar de alta a la primera", () => {
    renderList([]);

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay personas" })).toBeInTheDocument();
    expect(screen.getByText("Da de alta a la primera persona de tu club.")).toBeInTheDocument();
    expect(count()).toBe("0 personas");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("si solo hay archivadas, la vista del club está vacía pero las archivadas se ven", () => {
    renderList([person(4, "Eva", "Zamora", { archived: true })]);

    expect(screen.getByText("Aún no hay personas")).toBeInTheDocument();

    fireEvent.click(view("Archivadas"));

    expect(names()).toEqual(["Zamora, Eva"]);
    expect(screen.queryByText("Aún no hay personas")).not.toBeInTheDocument();
  });

  it("sin archivadas, esa vista dice que no hay nadie y para qué sirve", () => {
    renderList([person(1, "Ana", "Alonso")]);

    fireEvent.click(view("Archivadas"));

    expect(screen.getByRole("heading", { level: 2, name: "No hay nadie archivado" })).toBeInTheDocument();
    expect(screen.getByText("Aquí verás a quien ya no está en el club.")).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it("una vista vacía sigue vacía aunque se busque: no dice «Nadie con ese nombre.»", () => {
    renderList([]);

    search("ana");

    expect(screen.getByText("Aún no hay personas")).toBeInTheDocument();
    expect(screen.queryByText("Nadie con ese nombre.")).not.toBeInTheDocument();
  });
});
