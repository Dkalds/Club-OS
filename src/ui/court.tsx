// La pista del producto, en dos archivos: `CourtThumb` es pura y `CourtDiagram` es de cliente
// (necesita saber si su imagen ha fallado). Este es el punto de entrada de quien usa las dos;
// no lleva `"use client"`. Un componente de servidor que solo necesita la miniatura (la fila de
// una lista) importa `./court-thumb`: importar esto arrastraría el módulo de cliente.
export { CourtThumb, type CourtSize } from "./court-thumb";
export { CourtDiagram } from "./court-diagram";
