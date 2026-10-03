import { describe, expect, it } from "vitest";
import { formatStandardNumber, sectionSubtitle } from "./format";

const NONE = { values: 0, principles: 0, standards: 0 };

describe("formatStandardNumber", () => {
  it.each([
    [3, "03"],
    [12, "12"],
    [1, "01"],
    [99, "99"],
  ])("formatStandardNumber(%i) === %s", (n, expected) => {
    expect(formatStandardNumber(n)).toBe(expected);
  });
});

describe("sectionSubtitle", () => {
  it("una sección de texto enseña su resumen, tenga lo que tenga el club", () => {
    expect(
      sectionSubtitle("text", "Lo que nos define", { values: 3, principles: 4, standards: 5 }),
    ).toBe("Lo que nos define");
  });

  it("una sección de texto sin resumen no tiene subtítulo", () => {
    expect(sectionSubtitle("text", null, NONE)).toBeNull();
  });

  it.each([
    [3, "3 valores"],
    [1, "1 valor"],
  ])("valores: %i → «%s»", (values, expected) => {
    expect(sectionSubtitle("values", null, { ...NONE, values })).toBe(expected);
  });

  it.each([
    [4, "4 principios"],
    [1, "1 principio"],
  ])("principios: %i → «%s»", (principles, expected) => {
    expect(sectionSubtitle("principles", null, { ...NONE, principles })).toBe(expected);
  });

  it.each([
    [5, "5 Standards"],
    [1, "1 Standard"],
  ])("Standards: %i → «%s»", (standards, expected) => {
    expect(sectionSubtitle("standards", null, { ...NONE, standards })).toBe(expected);
  });

  it.each(["values", "principles", "standards"] as const)(
    "%s sin nada publicado → «Sin contenido todavía»",
    (kind) => {
      expect(sectionSubtitle(kind, null, NONE)).toBe("Sin contenido todavía");
    },
  );

  it("solo cuenta la lista de su tipo y no usa el resumen", () => {
    const vacioDeValores = { values: 0, principles: 4, standards: 5 };
    const dosStandards = { values: 3, principles: 4, standards: 2 };

    expect(sectionSubtitle("values", "Un resumen", vacioDeValores)).toBe("Sin contenido todavía");
    expect(sectionSubtitle("standards", "Un resumen", dosStandards)).toBe("2 Standards");
  });
});
