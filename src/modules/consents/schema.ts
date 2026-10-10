import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

// Entrada de las acciones de consentimiento. Un id que no es uuid se queda aquí, nunca llega
// a la base como un 22023.

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

export const grantImageConsentSchema = z.object({ personId: id });
export const consentIdSchema = z.object({ consentId: id });

export type GrantImageConsentInput = z.input<typeof grantImageConsentSchema>;
export type ConsentIdInput = z.input<typeof consentIdSchema>;
