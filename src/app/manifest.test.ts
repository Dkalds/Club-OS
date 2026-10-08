import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const m = manifest();

describe("manifest · campos de plataforma", () => {
  it("el nombre de la plataforma es «CLUB OS», no el de ningún club", () => {
    expect(m.name).toBe("CLUB OS");
    expect(m.short_name).toBe("CLUB OS");
  });

  it("display standalone y start_url en /select-club", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/select-club");
  });

  it("tiene iconos 192, 512 y maskable", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(icons.some((i) => (i as { purpose?: string }).purpose === "maskable")).toBe(true);
  });

  it("el nombre y descripción son de la plataforma, no de ningún club", () => {
    // Regla 3: los campos de texto no son del piloto ni de ningún club del seed.
    expect(m.name).toBe("CLUB OS");
    expect(m.short_name).toBe("CLUB OS");
    expect(m.description).toContain("clubes");
  });
});
