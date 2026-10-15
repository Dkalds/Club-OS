import { describe, expect, it } from "vitest";
import type { Connector, RawRecord } from "./types";

// Sin proveedor real en el MVP: solo comprueba que el contrato compila con una implementación
// mínima, de prueba, nunca llamada por el core.
class FakeConnector implements Connector {
  provider = "fake";
  capabilities: Connector["capabilities"] = ["fixtures"];

  async fetch(entity: Connector["capabilities"][number], cursor?: string): Promise<RawRecord[]> {
    return entity === "fixtures" && cursor === undefined
      ? [{ externalId: "1", checksum: "abc", payload: { ok: true } }]
      : [];
  }
}

describe("Connector", () => {
  it("una implementación mínima cumple el contrato", async () => {
    const connector = new FakeConnector();

    const records = await connector.fetch("fixtures");

    expect(connector.provider).toBe("fake");
    expect(connector.capabilities).toEqual(["fixtures"]);
    expect(records).toEqual([{ externalId: "1", checksum: "abc", payload: { ok: true } }]);
  });
});
