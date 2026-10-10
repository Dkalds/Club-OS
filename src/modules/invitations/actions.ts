"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import { createInvitationToken } from "./token";
import {
  createInvitationSchema,
  invitationIdSchema,
  type CreateInvitationInput,
  type InvitationIdInput,
} from "./schema";

// Acciones de invitaciones (`/admin/invites`, Task 10). Crear y aceptar van por las funciones
// SQL `security definer` de la Fase 7 Task 1 (`create_invitation`, que ya acota a `p_org` y
// valida el equipo); reenviar y cancelar son el mismo `update` directo que ya acota RLS
// (`invitations_update_managed`: solo mientras sigue pendiente, solo dirección de este club).
//
// El token nunca es la frontera de seguridad: lo es "quien puede llamar a `create_invitation`"
// (dirección autenticada) y "aceptar solo coincide con el propio email" (`accept_pending_
// invitations`, Fase 7 Task 1). El token sirve para un enlace propio por invitación, nada más
// ([D15]: se comparte a mano, no hay email automático).

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `invitations.${name}`, permission: "invite.manage", routes: ["/c/[club]/admin"] },
    clubSlug,
    schema,
    input,
    write,
  );
}

/** ¿Es `personId` una persona de este club? Con la sesión de quien escribe. */
async function personInClub(
  { db, ctx, fromDb }: Pick<Write<unknown>, "db" | "ctx" | "fromDb">,
  personId: string,
): Promise<ActionResult<null>> {
  const { data, error } = await db
    .from("people")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("id", personId)
    .maybeSingle();
  if (error) return fromDb(error);
  return data ? ok(null) : fail("NOT_FOUND");
}

/** Invita a alguien: crea su cuenta si no la tenía y la fila de la invitación. */
export async function createInvitation(
  clubSlug: string,
  input: CreateInvitationInput,
): Promise<ActionResult<{ invitationId: string; token: string }>> {
  return mutate("create", clubSlug, createInvitationSchema, input, async (run) => {
    const { db, ctx, data, fromDb } = run;

    if (data.personId !== null) {
      const person = await personInClub(run, data.personId);
      if (!person.ok) return person;
    }

    const { token, hash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

    const { data: invitationId, error } = await db.rpc("create_invitation", {
      p_org: ctx.org.id,
      p_email: data.email,
      p_role: data.role,
      p_token_hash: hash,
      p_expires_at: expiresAt,
      ...(data.teamId === null ? {} : { p_team: data.teamId }),
      ...(data.staffRole === null ? {} : { p_staff_role: data.staffRole }),
      ...(data.personId === null ? {} : { p_person: data.personId }),
      ...(data.firstName === null ? {} : { p_first_name: data.firstName }),
      ...(data.lastName === null ? {} : { p_last_name: data.lastName }),
    });
    if (error) return fromDb(error, { field: "email", message: "Ya hay una invitación pendiente para este email." });

    return ok({ invitationId, token });
  });
}

/** Reenvía: un token y una caducidad nuevos, solo si sigue pendiente. */
export async function resendInvitation(
  clubSlug: string,
  input: InvitationIdInput,
): Promise<ActionResult<{ token: string }>> {
  return mutate("resend", clubSlug, invitationIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { token, hash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

    const { data: rows, error } = await db
      .from("invitations")
      .update({ token_hash: hash, expires_at: expiresAt })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.invitationId)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok({ token });
  });
}

/** Cancela una invitación pendiente. No se deshace. */
export async function cancelInvitation(clubSlug: string, input: InvitationIdInput): Promise<ActionResult<null>> {
  return mutate("cancel", clubSlug, invitationIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("invitations")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.invitationId)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}
