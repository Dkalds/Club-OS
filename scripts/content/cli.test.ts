import { describe, expect, it } from "vitest";
import { USAGE, UsageError, formatReport, parseCliArgs } from "./cli";
import type { ImportReport } from "./import";

describe("parseCliArgs", () => {
  it("lee la carpeta, el club y --update en cualquier orden", () => {
    expect(parseCliArgs(["content/x/y", "--club", "club-demo"])).toEqual({
      dir: "content/x/y",
      club: "club-demo",
      update: false,
    });
    expect(parseCliArgs(["--update", "--club=club-demo", "content/x/y"])).toEqual({
      dir: "content/x/y",
      club: "club-demo",
      update: true,
    });
  });

  it.each([
    [[]],
    [["content/x/y"]],
    [["--club", "club-demo"]],
    [["a", "b", "--club", "c"]],
    [["a", "--club", "c", "--force"]],
    [["a", "--club", ""]],
  ])("sin carpeta, sin club, con dos carpetas o con una opción desconocida: uso (%j)", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(USAGE);
  });
});

describe("formatReport", () => {
  const report: ImportReport = {
    club: "club-demo",
    pack: { id: "pack-ejemplo", title: "Paquete de ejemplo" },
    created: ["a", "b"],
    skipped: ["c"],
    updated: [],
  };

  it("dice el paquete, el destino y los recuentos, y cómo sobrescribir lo que ya existía", () => {
    expect(formatReport(report, "127.0.0.1:54321")).toEqual([
      "Paquete «Paquete de ejemplo» (pack-ejemplo) en club-demo · 127.0.0.1:54321.",
      "Creados: 2. Ya existían: 1. Actualizados: 0.",
      "Los que ya existían no se han tocado. Para devolverlos a lo que dice el paquete, repite con --update.",
    ]);
  });

  it("sin ejercicios que ya existieran, no habla de --update", () => {
    expect(formatReport({ ...report, skipped: [] }, "127.0.0.1:54321")).toEqual([
      "Paquete «Paquete de ejemplo» (pack-ejemplo) en club-demo · 127.0.0.1:54321.",
      "Creados: 2. Ya existían: 0. Actualizados: 0.",
    ]);
  });
});
