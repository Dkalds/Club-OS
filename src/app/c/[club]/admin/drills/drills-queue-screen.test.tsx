import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftDrill } from "@/modules/drills/admin-queries";

const mocks = vi.hoisted(() => ({ publishDrill: vi.fn(), archiveDrill: vi.fn(), refresh: vi.fn() }));

vi.mock("@/modules/drills/actions", () => ({ publishDrill: mocks.publishDrill, archiveDrill: mocks.archiveDrill }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { DrillsQueueScreen } from "./drills-queue-screen";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function draft(extra: Partial<DraftDrill> = {}): DraftDrill {
  return { id: uuid(1), title: "Rondo 4x2", summary: "Rondo de posesión.", createdAt: "2026-10-01T10:00:00Z", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DrillsQueueScreen", () => {
  it("sin borradores: el aviso de nada pendiente", () => {
    render(<DrillsQueueScreen clubSlug="club-a" timezone="Europe/Madrid" drafts={[]} />);

    expect(screen.getByText("Nada pendiente de revisión")).toBeInTheDocument();
  });

  it("una fila por borrador, con su título y desde cuándo espera", () => {
    render(<DrillsQueueScreen clubSlug="club-a" timezone="Europe/Madrid" drafts={[draft()]} />);

    expect(screen.getByText("Rondo 4x2")).toBeInTheDocument();
    expect(screen.getByText("Rondo de posesión.")).toBeInTheDocument();
    expect(screen.getByText(/Borrador desde/)).toBeInTheDocument();
  });

  it("publicar llama a la acción y refresca", async () => {
    mocks.publishDrill.mockResolvedValue({ ok: true, data: null });
    render(<DrillsQueueScreen clubSlug="club-a" timezone="Europe/Madrid" drafts={[draft()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(mocks.publishDrill).toHaveBeenCalledWith("club-a", { drillId: draft().id }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("archivar pide confirmación antes de llamar a la acción", async () => {
    mocks.archiveDrill.mockResolvedValue({ ok: true, data: null });
    render(<DrillsQueueScreen clubSlug="club-a" timezone="Europe/Madrid" drafts={[draft()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    expect(mocks.archiveDrill).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Archivar ejercicio" }));
    await waitFor(() => expect(mocks.archiveDrill).toHaveBeenCalledWith("club-a", { drillId: draft().id }));
  });

  it("«Ver» enlaza a la ficha del ejercicio", () => {
    render(<DrillsQueueScreen clubSlug="club-a" timezone="Europe/Madrid" drafts={[draft()]} />);

    expect(screen.getByRole("link", { name: "Ver Rondo 4x2" })).toHaveAttribute(
      "href",
      `/c/club-a/drills/${draft().id}`,
    );
  });
});
