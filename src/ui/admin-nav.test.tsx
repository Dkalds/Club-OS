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
      "The Way",
      "Valores",
      "Principios",
      "Standards",
      "Club",
      "Equipos",
      "Personas",
      "Ejercicios pendientes",
      "Cobertura",
      "Invitaciones",
    ]);
    expect(within(nav).getByRole("link", { name: "Valores" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/values",
    );
  });

  it("en una subruta solo lleva aria-current el apartado al que pertenece", () => {
    navigation.pathname = "/c/club-a/admin/standards/x";
    render(<AdminNav items={ITEMS} />);

    expect(current()).toEqual(["Standards"]);
    expect(screen.getByRole("link", { name: "Standards" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/c/club-a/admin/way", "The Way"],
    ["/c/club-a/admin/way/", "The Way"],
    ["/c/club-a/admin/way/2f0c7a9e", "The Way"],
    ["/c/club-a/admin/values", "Valores"],
    ["/c/club-a/admin/principles", "Principios"],
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
