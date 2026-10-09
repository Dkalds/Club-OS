import { z } from "zod";

const id = z.string().uuid("No encontramos este contenido.");

const liveItemSchema = z.object({
  id,
  completed: z.boolean(),
  actualMinutes: z.number().int().min(0).max(180).nullable(),
});

export const liveProgressSchema = z.object({
  clubSlug: z.string().min(1),
  eventId: id,
  items: z.array(liveItemSchema),
  finished: z.boolean(),
  actualMinutes: z.number().int().min(0).max(999).optional(),
});

export type LiveProgressInput = z.infer<typeof liveProgressSchema>;
