// Integración contra Supabase local de verdad (`pnpm test:int`): confirma si el hook
// `before_user_created` protege también la API de administración o solo el autoservicio de
// Auth, pregunta que la documentación de Supabase no deja clara (ver Task 1, Step 6, del plan
// de la Fase 7). Da igual el resultado para la seguridad del flujo real: `create_invitation`
// nunca pasa por la API de Auth (inserta en `auth.users` directamente), así que el hook no la
// afecta ni para bien ni para mal. Esto solo documenta hasta dónde llega la defensa en
// profundidad, con un email que de verdad no tiene ninguna invitación.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAdminClient } from "../lib/admin-client";

describe("before_user_created, protección real contra la API de administración", () => {
  it("auth.admin.createUser para un email sin invitación: deja constancia de si el hook lo bloquea", async () => {
    const db = createAdminClient();
    const email = `sin-invitacion-${randomUUID()}@invitations.pgtap.test`;

    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });

    if (error) {
      // El hook también protege la API de administración: defensa en depth real.
      expect(error.message).toMatch(/invitación/i);
    } else {
      // El hook no se dispara para la API de administración: solo el autoservicio. El cierre
      // de seguridad sigue en pie igual (ver el comentario de arriba), pero limpiamos lo creado.
      expect(data.user?.email).toBe(email);
      await db.auth.admin.deleteUser(data.user!.id);
    }
  });
});
