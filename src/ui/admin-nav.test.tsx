import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminNavItems } from "@/modules/tenancy/navigation";

const navigation = vi.hoisted(() => ({ pathname: "/c/club-a/admin/way" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { AdminNav } from "./admin-nav";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ITEMS = adminNavItems("club-a", {});

function current() {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

beforeEach(() => {
  navigation.pathname = "/c/club-a/admin/way";
});

describe("AdminNav", () => {
  it("es la navegación «Gestión», con un enlace por apartado", () => {
    render(<AdminNav items={ITEMS} />);

    const nav = screen.getByRole("navigation", { name: "Gestión" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Temporada",
      "Calendario",
      "Personas",
      "Identidad",
      "Valores",
      "Principios",
      "Standards",
      "Club",
      "Ejercicios pendientes",
      "Cobertura",
      "Invitaciones",
    ]);
    expect(within(nav).getByRole("link", { name: "Valores" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/values",
    );
    expect(within(nav).getByRole("link", { name: "Temporada" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/season",
    );
    expect(within(nav).getByRole("link", { name: "Personas" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/people",
    );
    expect(within(nav).getByRole("link", { name: "Calendario" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/calendar",
    );
  });

  it("en una subruta solo lleva aria-current el apartado al que pertenece", () => {
    navigation.pathname = "/c/club-a/admin/standards/x";
    render(<AdminNav items={ITEMS} />);

    expect(current()).toEqual(["Standards"]);
    expect(screen.getByRole("link", { name: "Standards" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/c/club-a/admin/way", "Identidad"],
    ["/c/club-a/admin/way/", "Identidad"],
    ["/c/club-a/admin/way/2f0c7a9e", "Identidad"],
    ["/c/club-a/admin/values", "Valores"],
    ["/c/club-a/admin/principles", "Principios"],
    ["/c/club-a/admin/season", "Temporada"],
    ["/c/club-a/admin/season/00000000-0000-4000-8000-000000000001", "Temporada"],
    ["/c/club-a/admin/season/categories", "Temporada"],
    ["/c/club-a/admin/calendar", "Calendario"],
    ["/c/club-a/admin/people", "Personas"],
    ["/c/club-a/admin/people/00000000-0000-4000-8000-000000000002", "Personas"],
  ])("%s marca «%s»", (pathname, label) => {
    navigation.pathname = pathname;
    render(<AdminNav items={ITEMS} />);

    expect(current()).toEqual([label]);
  });

  it("el prefijo es de segmentos enteros, no de letras", () => {
    navigation.pathname = "/c/club-a/admin/waylon";
    render(<AdminNav items={ITEMS} />);

    expect(current()).toEqual([]);
  });

  // Los equipos no tienen apartado propio (se llega desde su temporada) y su ruta no cuelga de
  // `/admin/season`: el apartado que la declara suya (`also`) es el actual.
  it("una ruta que un apartado declara suya (`also`) lo marca a él, y solo a él", () => {
    navigation.pathname = "/c/club-a/admin/teams/00000000-0000-4000-8000-000000000003";
    const [first, ...rest] = ITEMS;
    render(<AdminNav items={[{ ...first, also: ["/c/club-a/admin/teams"] }, ...rest]} />);

    expect(current()).toEqual([first.label]);
  });

  it("`also` cuenta por segmentos enteros: `/admin/teams` no es `/admin/teamsters`", () => {
    navigation.pathname = "/c/club-a/admin/teamsters";
    const [first, ...rest] = ITEMS;
    render(<AdminNav items={[{ ...first, also: ["/c/club-a/admin/teams"] }, ...rest]} />);

    expect(current()).toEqual([]);
  });

  it("sin `also`, una ruta que no cuelga de ningún apartado no marca ninguno", () => {
    navigation.pathname = "/c/club-a/admin/teams/00000000-0000-4000-8000-000000000003";
    render(<AdminNav items={ITEMS.map(({ label, href }) => ({ label, href }))} />);

    expect(current()).toEqual([]);
  });

  it("en la raíz de Gestión no marca ninguno", () => {
    navigation.pathname = "/c/club-a/admin";
    render(<AdminNav items={ITEMS} />);

    expect(current()).toEqual([]);
  });

  it("usa las etiquetas que le llegan (la terminología del club)", () => {
    render(
      <AdminNav items={adminNavItems("club-a", { way: "Nuestra forma", standards: "Normas" })} />,
    );

    expect(screen.getByRole("link", { name: "Nuestra forma" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Normas" })).toBeInTheDocument();
  });

  it("los enlaces llegan a target-min de alto", () => {
    render(<AdminNav items={ITEMS} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-(--target-min)");
    }
  });
});
