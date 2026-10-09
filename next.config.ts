import withSerwist from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Un diagrama de ejercicio pesa hasta 2 MiB (`MAX_DIAGRAM_BYTES`) y llega a la Server
      // Action como `multipart/form-data`, que suma sus bordes y cabeceras: con el límite por
      // defecto (1 MB) Next cortaría la petición antes de que la acción pueda validarla. El
      // límite es para todas las Server Actions de la app, no solo para la de subida; la
      // acción sigue comprobando tipo y tamaño por su cuenta.
      bodySizeLimit: "3mb",
    },
  },
};

export default withSerwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
