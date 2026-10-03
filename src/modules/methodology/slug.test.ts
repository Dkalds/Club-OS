import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

/** La misma forma que exige el CHECK de `way_sections.slug`. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("quita acentos y signos", () => {
    expect(slugify("¿Cómo jugamos?")).toBe("como-jugamos");
  });

  it("recorta los espacios de los extremos y conserva los números", () => {
    expect(slugify("  1x1  ")).toBe("1x1");
  });

  it("pasa a minúsculas", () => {
    expect(slugify("Cómo ENTRENAMOS")).toBe("como-entrenamos");
  });

  it("la eñe pierde la tilde y las diéresis también", () => {
    expect(slugify("Año de pingüinos")).toBe("ano-de-pinguinos");
  });

  it("una racha de separadores es un solo guion, y no hay guiones en los extremos", () => {
    expect(slugify("--¡Hola,   mundo!--")).toBe("hola-mundo");
    expect(slugify("a / b _ c")).toBe("a-b-c");
  });

  it("lo que no tiene letras ni números se queda vacío", () => {
    expect(slugify("¿?!")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("no pasa de 60 caracteres", () => {
    expect(slugify("a".repeat(100))).toBe("a".repeat(60));
  });

  it("al cortar a 60 no deja un guion al final", () => {
    // 59 letras y el guion son justo 60 caracteres: el corte dejaría el guion colgando.
    const title = `${"a".repeat(59)} ${"b".repeat(40)}`;
    const slug = slugify(title);

    expect(slug).toBe("a".repeat(59));
    expect(slug).toMatch(SLUG);
  });

  it("un título largo de varias palabras da un slug válido", () => {
    const slug = slugify("Palabra ".repeat(20));

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(SLUG);
  });
});

describe("uniqueSlug", () => {
  it("un slug libre se queda como está", () => {
    expect(uniqueSlug("como-jugamos", ["otro"], "seccion")).toBe("como-jugamos");
  });

  it("uno ocupado recibe -2", () => {
    expect(uniqueSlug("como-jugamos", ["como-jugamos"], "seccion")).toBe("como-jugamos-2");
  });

  it("si -2 también está ocupado, sigue con -3", () => {
    expect(uniqueSlug("a", ["a", "a-2"], "seccion")).toBe("a-3");
  });

  it("no se queda en un hueco: salta al primer sufijo libre", () => {
    expect(uniqueSlug("a", ["a", "a-3"], "seccion")).toBe("a-2");
  });

  it("«standards» está reservado aunque nadie lo use", () => {
    expect(uniqueSlug("standards", [], "seccion")).toBe("standards-2");
  });

  it("«standards-2» sí es un slug permitido", () => {
    expect(uniqueSlug("standards-2", [], "seccion")).toBe("standards-2");
  });

  it("una base vacía usa el slug de reserva", () => {
    expect(uniqueSlug("", [], "seccion")).toBe("seccion");
  });

  it("el slug de reserva también se desambigua si está ocupado", () => {
    expect(uniqueSlug("", ["seccion"], "seccion")).toBe("seccion-2");
  });

  it("con una base de 60 caracteres, el sufijo no la saca de los 60", () => {
    const base = "a".repeat(60);
    const slug = uniqueSlug(base, [base], "seccion");

    expect(slug).toBe(`${"a".repeat(58)}-2`);
    expect(slug).toHaveLength(60);
    expect(slug).toMatch(SLUG);
  });

  it("al recortar la base para el sufijo no deja un guion colgando", () => {
    // 57 letras, un guion y 2 letras: recortar a 58 deja la base terminada en guion.
    const base = `${"a".repeat(57)}-bb`;
    const slug = uniqueSlug(base, [base], "seccion");

    expect(slug).toBe(`${"a".repeat(57)}-2`);
    expect(slug).toMatch(SLUG);
  });

  it("no cambia la lista de slugs ocupados", () => {
    const taken = ["a"];
    uniqueSlug("a", taken, "seccion");

    expect(taken).toEqual(["a"]);
  });
});
