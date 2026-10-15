import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ importPeople: vi.fn(), refresh: vi.fn() }));

vi.mock("@/modules/people-import/actions", () => ({ importPeople: mocks.importPeople }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ImportCsv } from "./import-csv";

function csvFile(text: string): File {
  return new File([text], "personas.csv", { type: "text/csv" });
}

function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImportCsv", () => {
  it("lee el fichero y enseña cada fila, válida o con su error", async () => {
    render(<ImportCsv clubSlug="club-a" />);

    chooseFile(csvFile("nombre,apellidos,año_nacimiento\nAna,Pino,2014\n,Ruiz,2013"));

    await waitFor(() => expect(screen.getByText(/Fila 1: Ana Pino/)).toBeInTheDocument());
    expect(screen.getByText(/Fila 2: Escribe el nombre\./)).toBeInTheDocument();
    expect(screen.getByText("1 de 2 filas son válidas. Solo esas se importan.")).toBeInTheDocument();
  });

  it("confirmar importa solo las filas válidas", async () => {
    mocks.importPeople.mockResolvedValue({ ok: true, data: { count: 1 } });
    render(<ImportCsv clubSlug="club-a" />);

    chooseFile(csvFile("nombre,apellidos,año_nacimiento\nAna,Pino,2014\n,Ruiz,2013"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Importar 1 persona/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Importar 1 persona/ }));

    await waitFor(() => expect(screen.getByText("1 personas importadas.")).toBeInTheDocument());
    expect(mocks.importPeople).toHaveBeenCalledWith("club-a", {
      rows: [{ firstName: "Ana", lastName: "Pino", birthYear: 2014 }],
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("sin ninguna fila válida, no deja confirmar", async () => {
    render(<ImportCsv clubSlug="club-a" />);

    chooseFile(csvFile("nombre,apellidos,año_nacimiento\n,Ruiz,2013"));

    await waitFor(() => expect(screen.getByText(/Fila 1:/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Importar 0 personas/ })).toBeDisabled();
  });

  it("cancelar la vista previa no importa nada", async () => {
    render(<ImportCsv clubSlug="club-a" />);

    chooseFile(csvFile("nombre,apellidos,año_nacimiento\nAna,Pino,2014"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText(/Fila 1/)).toBeNull();
    expect(mocks.importPeople).not.toHaveBeenCalled();
  });
});
