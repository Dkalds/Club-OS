import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invitation } from "@/modules/invitations/types";

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/modules/invitations/actions", () => ({
  createInvitation: mocks.createInvitation,
  resendInvitation: mocks.resendInvitation,
  cancelInvitation: mocks.cancelInvitation,
}));

import { InvitesScreen } from "./invites-screen";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = { id: uuid(1), name: "Equipo A" };

function invitation(extra: Partial<Invitation> = {}): Invitation {
  return {
    id: uuid(2),
    email: "coach@club-a.test",
    role: "coach",
    teamId: TEAM.id,
    teamName: TEAM.name,
    staffRole: "assistant",
    personId: null,
    status: "pending",
    expiresAt: "2026-10-20T00:00:00Z",
    createdAt: "2026-10-10T00:00:00Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText.mockResolvedValue(undefined) } });
});

describe("InvitesScreen", () => {
  it("sin invitaciones, el aviso de lista vacía y el alta sigue ahí", () => {
    render(<InvitesScreen clubSlug="club-a" invitations={[]} teams={[TEAM]} />);

    expect(screen.getByText("Aún no hay invitaciones")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nueva invitación" })).toBeInTheDocument();
  });

  it("una fila por invitación, con su email, su rol, su equipo y su estado", () => {
    render(
      <InvitesScreen
        clubSlug="club-a"
        invitations={[invitation(), invitation({ id: uuid(3), role: "admin", teamId: null, teamName: null, status: "accepted" })]}
        teams={[TEAM]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("coach@club-a.test")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Entrenador · Equipo A")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Pendiente")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Aceptada")).toBeInTheDocument();
  });

  it("solo una pendiente o caducada ofrece reenviar y cancelar", () => {
    render(
      <InvitesScreen
        clubSlug="club-a"
        invitations={[invitation(), invitation({ id: uuid(3), status: "accepted" })]}
        teams={[TEAM]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("button", { name: "Reenviar" })).toBeNull();
  });

  it("crea una invitación de dirección, sin equipo", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: true, data: { invitationId: "x", token: "abc123" } });

    render(<InvitesScreen clubSlug="club-a" invitations={[]} teams={[TEAM]} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@club-a.test" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));

    await waitFor(() => expect(mocks.createInvitation).toHaveBeenCalled());
    expect(mocks.createInvitation).toHaveBeenCalledWith("club-a", { email: "admin@club-a.test", role: "admin" });
    expect(screen.getByText("/invite/abc123")).toBeInTheDocument();
  });

  it("crea una invitación de entrenador, con equipo y nombre", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: true, data: { invitationId: "x", token: "abc123" } });

    render(<InvitesScreen clubSlug="club-a" invitations={[]} teams={[TEAM]} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coach@club-a.test" } });
    fireEvent.change(screen.getByLabelText("Equipo"), { target: { value: TEAM.id } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nuevo" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Coach" } });
    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));

    await waitFor(() => expect(mocks.createInvitation).toHaveBeenCalled());
    expect(mocks.createInvitation).toHaveBeenCalledWith("club-a", {
      email: "coach@club-a.test",
      role: "coach",
      teamId: TEAM.id,
      staffRole: "assistant",
      firstName: "Nuevo",
      lastName: "Coach",
    });
  });

  it("copiar el enlace usa el origen de la página", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: true, data: { invitationId: "x", token: "abc123" } });

    render(<InvitesScreen clubSlug="club-a" invitations={[]} teams={[TEAM]} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@club-a.test" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Invitar" }));
    await waitFor(() => expect(screen.getByText("/invite/abc123")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/abc123`));
  });

  it("reenviar pide un token nuevo y lo enseña", async () => {
    mocks.resendInvitation.mockResolvedValue({ ok: true, data: { token: "nuevo-token" } });

    render(<InvitesScreen clubSlug="club-a" invitations={[invitation()]} teams={[TEAM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));

    await waitFor(() => expect(screen.getByText("/invite/nuevo-token")).toBeInTheDocument());
    expect(mocks.resendInvitation).toHaveBeenCalledWith("club-a", { invitationId: invitation().id });
  });

  it("cancelar pide confirmación antes de llamar a la acción", async () => {
    mocks.cancelInvitation.mockResolvedValue({ ok: true, data: null });

    render(<InvitesScreen clubSlug="club-a" invitations={[invitation()]} teams={[TEAM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mocks.cancelInvitation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar invitación" }));

    await waitFor(() => expect(mocks.cancelInvitation).toHaveBeenCalledWith("club-a", { invitationId: invitation().id }));
  });
});
