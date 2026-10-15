import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

export const createGuardianshipSchema = z.object({ guardianPersonId: id, childPersonId: id });

export type CreateGuardianshipInput = z.input<typeof createGuardianshipSchema>;
