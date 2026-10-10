import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPerson } from "@/modules/people/types";

const mocks = vi.hoisted(() => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  archivePerson: vi.fn(),
  createGuardianship: vi.fn(),
  createInvitation: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/modules/people/actions", () => ({
  createPerson: mocks.createPerson,
  updatePerson: mocks.updatePerson,
  archivePerson: mocks.archivePerson,
  createGuardianship: mocks.createGuardianship,
}));
vi.mock("@/modules/invitations/actions", () => ({ createInvitation: mocks.createInvitation }));
vi.mock("@/modules/people-import/actions", () => ({ importPeople: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PeopleScreen } from "./people-screen";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = { id: uuid(1), name: "Equipo A" };

function person(extra: Partial<AdminPerson> = {}): AdminPerson {
  return { id: uuid(2), firstName: "Ana", lastName: "Pino", birthYear: 2014, archivedAt: null, hasAccount: false, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText.mockResolvedValue(undefined) } });
});

describe("PeopleScreen", () => {
  it("sin personas: el aviso de lista vacía", () => {
    render(<PeopleScreen clubSlug="club-a" people={[]} teams={[TEAM]} />);

    expect(screen.getByText("Aún no hay personas")).toBeInTheDocument();
  });

  it("una fila por persona, con su año y si tiene cuenta", () => {
    render(<PeopleScreen clubSlug="club-a" people={[person(), person({ id: uuid(3), hasAccount: true })]} teams={[TEAM]} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Ana Pino")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: "Invitar" })).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("button", { name: "Invitar" })).toBeNull();
    expect(within(rows[1]!).getByText(/Con cuenta/)).toBeInTheDocument();
  });

  it("una persona archivada no ofrece ninguna acción", () => {
    render(<PeopleScreen clubSlug="club-a" people={[person({ archivedAt: "2026-10-10T00:00:00Z" })]} teams={[TEAM]} />);

    const row = screen.getByRole("listitem");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).getByText(/Archivada/)).toBeInTheDocument();
  });

  it("crea una persona", async () => {
    mocks.createPerson.mockResolvedValue({ ok: true, data: { personId: "x" } });
    render(<PeopleScreen clubSlug="club-a" people={[]} teams={[TEAM]} />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Luis" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Ruiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear persona" }));

    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledWith("club-a", { firstName: "Luis", lastName: "Ruiz", birthYear: null }));
  });

  it("edita una persona", async () => {
    mocks.updatePerson.mockResolvedValue({ ok: true, data: null });
    const p = person();
    render(<PeopleScreen clubSlug="club-a" people={[p]} teams={[TEAM]} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const row = screen.getByRole("button", { name: "Guardar" }).closest("li")!;
    fireEvent.change(within(row).getByLabelText("Nombre"), { target: { value: "Ana2" } });
    fireEvent.click(within(row).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mocks.updatePerson).toHaveBeenCalledWith("club-a", { personId: p.id, firstName: "Ana2", lastName: "Pino", birthYear: 2014 }),
    );
  });

  it("archivar pide confirmación", async () => {
    mocks.archivePerson.mockResolvedValue({ ok: true, data: null });
    const p = person();
    render(<PeopleScreen clubSlug="club-a" people={[p]} teams={[TEAM]} />);

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    expect(mocks.archivePerson).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Archivar persona" }));
    await waitFor(() => expect(mocks.archivePerson).toHaveBeenCalledWith("club-a", { personId: p.id }));
  });

  it("invitar a quien no tiene cuenta abre el formulario, con la persona ya elegida", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: true, data: { invitationId: "x", token: "abc123" } });
    const p = person();
    render(<PeopleScreen clubSlug="club-a" people={[p]} teams={[TEAM]} />);

    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@club-a.test" } });
    const submit = screen.getAllByRole("button", { name: "Invitar" }).find((b) => b.getAttribute("type") === "submit")!;
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText("/invite/abc123")).toBeInTheDocument());
    expect(mocks.createInvitation).toHaveBeenCalledWith("club-a", {
      email: "ana@club-a.test",
      role: "coach",
      personId: p.id,
      teamId: TEAM.id,
      staffRole: "assistant",
    });
  });

  it("con más de una persona, ofrece dar una tutela", async () => {
    mocks.createGuardianship.mockResolvedValue({ ok: true, data: null });
    render(<PeopleScreen clubSlug="club-a" people={[person(), person({ id: uuid(3), firstName: "Hijo" })]} teams={[TEAM]} />);

    fireEvent.click(screen.getByRole("button", { name: "Dar la tutela" }));

    await waitFor(() => expect(mocks.createGuardianship).toHaveBeenCalled());
  });

  it("con una sola persona, no ofrece dar una tutela", () => {
    render(<PeopleScreen clubSlug="club-a" people={[person()]} teams={[TEAM]} />);

    expect(screen.queryByRole("heading", { name: "Dar una tutela" })).toBeNull();
  });
});
