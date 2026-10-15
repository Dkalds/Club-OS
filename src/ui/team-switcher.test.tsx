import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({ setActiveTeam: vi.fn(), refresh: vi.fn() }));

vi.mock("@/modules/team/actions", () => ({ setActiveTeam: mocks.setActiveTeam }));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));

import { TeamSwitcher } from "./team-switcher";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAM_A = { id: "00000000-0000-4000-8000-0000000000a1", name: "Equipo A" };
const TEAM_B = { id: "00000000-0000-4000-8000-0000000000b1", name: "Equipo B" };

function renderSwitcher(activeId: string | null = null) {
  return render(
    // El contenedor del club: la hoja se pinta dentro de él.
    <div data-club="club-a">
      <TeamSwitcher clubSlug="club-a" teams={[TEAM_A, TEAM_B]} activeId={activeId} />
    </div>,
  );
}

const trigger = () => screen.getByRole("button", { name: /Cambiar de equipo$/ });
const sheet = () => screen.findByRole("dialog", { name: "Equipo" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.setActiveTeam.mockResolvedValue(ok(null));
});

describe("TeamSwitcher", () => {
  it("sin equipo elegido dice «Todos»", () => {
    renderSwitcher();

    expect(trigger()).toHaveTextContent("Todos");
    expect(trigger()).toHaveAccessibleName("Todos. Cambiar de equipo");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("con un equipo elegido dice su nombre", () => {
    renderSwitcher(TEAM_B.id);

    expect(trigger()).toHaveTextContent("Equipo B");
    expect(trigger()).toHaveAccessibleName("Equipo B. Cambiar de equipo");
  });

  it("un equipo activo que no está en la lista cuenta como ninguno", () => {
    renderSwitcher("00000000-0000-4000-8000-0000000000c1");

    expect(trigger()).toHaveTextContent("Todos");
  });

  it("abre una hoja con «Todos mis equipos» y cada equipo, y marca el que se está viendo", async () => {
    renderSwitcher(TEAM_A.id);

    fireEvent.click(trigger());
    const dialog = await sheet();

    const options = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    expect(options.map((option) => option.textContent)).toEqual(["Todos mis equipos", "Equipo A", "Equipo B"]);
    expect(options.map((option) => option.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
  });

  it("elegir otro equipo lo guarda, cierra la hoja y vuelve a pedir la pantalla", async () => {
    renderSwitcher();

    fireEvent.click(trigger());
    fireEvent.click(within(await sheet()).getByRole("button", { name: "Equipo B" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.setActiveTeam).toHaveBeenCalledWith("club-a", { teamId: TEAM_B.id });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("«Todos mis equipos» quita el equipo elegido", async () => {
    renderSwitcher(TEAM_A.id);

    fireEvent.click(trigger());
    fireEvent.click(within(await sheet()).getByRole("button", { name: "Todos mis equipos" }));

    await waitFor(() => expect(mocks.setActiveTeam).toHaveBeenCalledWith("club-a", { teamId: null }));
  });

  it("elegir el que ya se está viendo solo cierra la hoja", async () => {
    renderSwitcher(TEAM_A.id);

    fireEvent.click(trigger());
    fireEvent.click(within(await sheet()).getByRole("button", { name: "Equipo A" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.setActiveTeam).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("si no se puede guardar lo dice en la hoja, que sigue abierta", async () => {
    mocks.setActiveTeam.mockResolvedValue(fail("NOT_FOUND"));
    renderSwitcher();

    fireEvent.click(trigger());
    const dialog = await sheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Equipo B" }));

    expect(await within(dialog).findByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
