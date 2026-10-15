// Contrato de integraciones externas (decisión 10 de la spec). Esqueleto sin implementación:
// ningún proveedor real en el MVP. Un conector declara qué sabe traer; el core nunca lo llama
// directamente, siempre a través de un normalizador que no existe todavía.

export type Capability = "fixtures" | "results" | "standings";

export type RawRecord = {
  externalId: string;
  checksum: string;
  payload: unknown;
};

export interface Connector {
  provider: string;
  capabilities: Capability[];
  fetch(entity: Capability, cursor?: string): Promise<RawRecord[]>;
}
