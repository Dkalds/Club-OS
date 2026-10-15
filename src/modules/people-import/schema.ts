import { z } from "zod";

// Entrada de `importPeople`: las filas que dirección confirmó, ya sin las inválidas (el
// cliente filtra antes de llamar: el servidor no vuelve a leer el fichero).

const rowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
});

export const importPeopleSchema = z.object({ rows: z.array(rowSchema).min(1).max(500) });

export type ImportPeopleInput = z.input<typeof importPeopleSchema>;
