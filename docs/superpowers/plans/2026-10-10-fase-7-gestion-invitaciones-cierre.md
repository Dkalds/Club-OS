# CLUB OS · Fase 7 (Gestión, cobertura, invitaciones y cierre del MVP) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: APROBADO por el propietario el 10 oct 2026**, con [D1]–[D14] tal como están.

**Goal:** Dirección da de alta personas y las invita por email; quien recibe la invitación abre el enlace, entra con un código y, antes de ver nada del club, acepta las condiciones de la plataforma (y, si es tutor, el consentimiento de imagen de su hijo o hija). Dirección gestiona club, equipos, personas (una por una o por CSV), invitaciones y la cola de ejercicios pendientes de revisión, y ve en Inicio y en una pantalla propia qué Standards y principios ha trabajado cada equipo. Se cierra la revisión de seguridad del MVP: matriz RLS completa, cabeceras, límite de intentos de login y accesibilidad.

**Architecture:** Dos flujos de alta nuevos, los dos detrás de `public.accept_invitation(token)` (`security definer`, la única función que puede crear una membresía sin que quien llama tenga ya una en ese club): el hook de Auth `before_user_created` que impide crear una cuenta sin invitación pendiente, y una pantalla de consentimiento de cliente entre el login y la primera vez que se entra a `/c/[club]`. Gestión gana cinco apartados nuevos sobre el mismo `AdminShell` y el mismo patrón de las fases 2 y 6 (Server Components que leen, Server Actions con `mutate` que escriben). La cobertura es una sola función SQL (`coverage_by_team`) que cuenta, por equipo y por Standard, los ítems completados de sesiones ya hechas en un rango de fechas, y una función pura en TypeScript (`buildCoverageMatrix`) que la convierte en la tabla que se pinta. El cierre de seguridad no añade funcionalidad: endurece lo que ya existe (cabeceras en el proxy de sesión, límite de intentos en las acciones de login, postura de funciones ejecutables).

**Tech Stack:** lo de las Fases 1–6. Sin dependencias nuevas: la importación CSV se analiza en el servidor con lo que ya trae Node (sin `papaparse` ni similar, un fichero de hasta unas pocas MB con comas y comillas no las necesita).

**Spec:** `docs/spec/club-os-primera-entrega.md` (decisión 9 «Imagen de menores», decisión 11 «Vista de cobertura», §5 «Sistema de permisos» y «Menores», §6 sitemap, §9 multi-tenancy, §11 riesgos técnicos, §13 «Qué recortaría del MVP») + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md` («Fase 7 · … — produce», C1–C30 enteras: es la última fase y las usa todas) + bloque «Fase 7» de `docs/superpowers/backlog.md` (el más largo: arrastra pendientes de las Fases 2 a 6) + memoria del propietario sobre consentimientos (confirmada 2026-10-10, recogida en «Decisiones», [D7]–[D9]).

**Requiere:** Fases 1–6 fusionadas en `main` (lo están: Dkalds/Club-OS#9). También en `main`, sin relación con esta fase: el acceso de demo temporal (#11, apagado por defecto) y el rediseño del login con `CourtPlay` (#12), que esta fase reutiliza para `/invite/[token]`.

**Dentro de esta fase:** invitaciones y su aceptación; consentimiento de términos generales (cualquier usuario, primer login) y de imagen de menores (tutores, vía `guardianships`), cada uno con su texto por club; Gestión completa (`/admin/club`, `/admin/teams`, `/admin/people` con CSV, `/admin/invites`, `/admin/drills`, `/admin/coverage`); cobertura de The Way en Inicio de dirección; `audit_log` y `platform_admins` (solo esquema, sin interfaz: es soporte de plataforma, no un apartado de Gestión); esqueleto vacío de integraciones (`external_*`, interfaz `Connector`); cierre de seguridad. **Fuera:** subida de la foto en sí (el campo `photo_media_id` y sus políticas de Storage se crean, pero nadie sube nada en el MVP: es la base para cuando lleguen cuentas de familia, decisión 13 de la spec); cuentas de jugador o de familia con interfaz; cualquier conector real (FBM, IA); interfaz de `platform_admins`; rol de coordinación de categoría (spec, riesgos de producto); importar el calendario en ICS.

## Antes de empezar (no es código)

1. **Revisión del propietario** de este plan y de sus decisiones, en especial las de menores y consentimientos ([D6]–[D9]) y las de seguridad ([D12]–[D14]).
2. **Entorno:** Docker en marcha, `pnpm supabase start`, `pnpm seed`.
3. **Plantilla de CSV.** Antes de la Task 11, decidir con el propietario las columnas exactas que admite la importación (nombre de cada una, orden, si lleva cabecera) para no construir el analizador dos veces.

## Global Constraints

Las de las Fases 2 a 6 siguen valiendo todas (TypeScript estricto, regla de literales de club en `src/`, tokens, copy, horas en la zona del club, `requireClub`/`adminPage` en cada página, 404 opaco, `TZ=UTC` además de la zona local en unidad, C1–C30 del contrato). Además:

- Migraciones en el rango F7: `20270112000100_invitations.sql`, `…000200_guardianships_consents.sql`, `…000300_people_photo_storage.sql`, `…000400_audit_platform.sql`, `…000500_coverage.sql`, `…000600_integrations.sql` (una por bloque, para que una revisión a medias no deje media tabla sin su RLS).
- **C12:** la CSP del proxy de sesión incluye `img-src 'self' data: blob: <supabase>`, `worker-src 'self'`, `manifest-src 'self'`, `connect-src 'self' <supabase https> <supabase wss>`; `Permissions-Policy` no bloquea `screen-wake-lock` ni `web-share` (Live y compartir la ficha del club los usan).
- **C20:** las políticas de Storage de `people.photo_media_id` son propias (`can_see_person_media`, prefijo `org/{org}/people/{person}/`), no una ampliación de las de `drills`.
- **C27:** cada tabla y cada `grant` de esta fase se apuntan en `posture.test.sql`, y esta fase además cierra lo que el test no fijaba: qué funciones ejecuta `authenticated`.
- **Menores.** La foto de una persona (cuando llegue a subirse, fuera de esta fase) no se puede leer sin consentimiento registrado; aquí se deja la base (columna, tabla, políticas) pero no el subidor. El texto del consentimiento de imagen lo redacta dirección, no un valor libre sin revisar: el formulario de `/admin/club` lo trata como cualquier campo de texto largo (sin sanitizar HTML: se pinta como texto, nunca como marcado).
- **Auditoría sin dato personal en el mensaje.** `audit_log` guarda quién, qué acción, sobre qué entidad (tabla + id) y cuándo; nunca el contenido de una fila (ni el cuerpo de una nota, ni el texto de un objetivo, ni un email completo — si hace falta reconocer una invitación, el email se trunca o se omite).

## Decisiones que este plan toma y hay que confirmar

Se marcan **[D1]–[D14]** donde se aplican.

- **[D1] Quién invita a qué.** Solo dirección (`admin.access`) invita, con rol (`admin` o `coach`) y, si es `coach`, un equipo y un `staff_role` (`head_coach`/`assistant`) obligatorios. Invitar a otro admin no pide equipo. Una invitación de prueba no crea la persona todavía: se crea al aceptar (o se enlaza a una persona que dirección ya dio de alta y aún no tiene cuenta — ver [D2]).
- **[D2] Invitar a una persona existente.** `/admin/people` permite «Invitar» sobre una persona sin cuenta (aparece en el alta de personas desde la Fase 1 de uso, sin membresía): la invitación lleva su `person_id` y, al aceptar, la membresía se liga a ella en vez de crear una persona nueva. Invitar sin partir de una persona (email suelto) crea la persona al aceptar, con el nombre que dirección escribió en la invitación.
- **[D3] Expira a los 7 días.** Pasado ese plazo, `accept_invitation` responde `INVITE_EXPIRED` y dirección reenvía (nuevo token, misma fila: `expires_at` y `token_hash` se sustituyen, no se crea una segunda invitación para el mismo email+club pendiente a la vez — único parcial sobre `(organization_id, email) where accepted_at is null`).
- **[D4] Revocar una invitación pendiente.** Sí, `cancel_invitation`: la fila pasa a un estado que `before_user_created` ya no reconoce como válida. Una invitación aceptada no se revoca (eso es dar de baja la membresía, aparte).
- **[D5] Dar de baja a una persona.** `archived_at` en `people` (ya existe la columna desde la Fase 1). Archivar a alguien con membresía activa revoca la membresía (`memberships.status = 'revoked'`) y lo quita de `team_staff`/`team_players`; sus objetivos y notas se quedan (son historial). No se puede archivar al último admin activo del club (`LAST_ADMIN`).
- **[D6] La importación CSV es de personas, no de membresías.** Da de alta jugadores (con año de nacimiento, equipo y dorsal opcional) y, para el cuerpo técnico, personas sin cuenta que luego se invitan una a una desde [D2]: el CSV no manda invitaciones ni crea cuentas. Antes de escribir nada enseña una vista previa fila a fila (qué se va a crear, qué fila falla y por qué) y pide una confirmación aparte; nada se guarda hasta esa segunda confirmación (como el paquete de contenido de #13, que tampoco escribe si algo falla). Una fila que choca con un dorsal ya usado en su equipo falla esa fila sola, no el fichero entero.
- **[D7] Los términos generales bloquean el acceso.** Entre el login y la primera vista de `/c/[club]`, toda cuenta sin un registro de consentimiento de términos para ese club ve la pantalla de aceptación y no puede saltársela (ni con la URL directa: el layout de `/c/[club]` la redirige allí). Una cuenta con membresías en dos clubes acepta los términos de cada uno por separado, la primera vez que entra a cada uno.
- **[D8] El consentimiento de imagen no bloquea nada.** Es independiente de los términos generales: un tutor que no lo da sigue entrando a la app con normalidad: solo determina si, cuando exista el subidor de fotos (fuera de esta fase), se podrá usar una foto en vez de iniciales. Se ofrece dar (o no) el consentimiento en la misma pantalla de primer login, como un paso aparte y opcional, solo a quien tiene al menos una `guardianship` activa; quien no es tutor de nadie no ve ese paso.
- **[D9] Consentimiento de imagen: snapshot, no versión; revocable.** Cada fila de `consents` guarda su propia copia del texto consentido (decidido 2026-10-10, sin tabla de versiones) y a qué persona se refiere (el hijo o la hija, no el tutor). Se puede revocar más tarde desde `/team/[teamId]/players/[personId]` (el tutor, si lo hay con interfaz — fuera de esta fase al no haber cuentas de familia; en el MVP solo dirección lo revoca, desde la ficha, por si un tutor lo pide por otro medio). Revocarlo no borra la fila: pasa a `revoked_at`, para quedar como historial de que existió y se retiró.
- **[D10] `photo_media_id` sin subidor.** La columna y las políticas de Storage se crean (C20), pero ningún formulario de esta fase ofrece subir una foto: `PlayerCard` y `Avatar` siguen pintando iniciales o dorsal siempre, porque `photo_media_id` siempre es `null` en el MVP. Evita construir un flujo de subida que nadie usa hasta que haya cuentas de familia.
- **[D11] La cola de `/admin/drills` es solo de borradores**, ordenada por fecha de creación (el más antiguo primero: el que lleva más tiempo esperando). Publicar o archivar desde ahí reutiliza `publishDrill`/`archiveDrill` de la Fase 3; esta fase no añade un estado «en revisión» aparte de `draft`.
- **[D12] Límite de intentos de login: propio en la app, no CAPTCHA.** Añadir el widget de Supabase es más trabajo (captchaToken en las dos acciones, claves nuevas) para un MVP con pocos usuarios. Un contador en una tabla pequeña (`login_attempts`, o reutilizar `audit_log`) por email+IP, con backoff, basta; se revisa cuando haya tráfico real.
- **[D13] `coverage_by_team` cuenta las últimas 6 semanas por defecto** si la pantalla no pide otro rango (la spec dice «en las últimas semanas» sin fijar cuántas). «Trabajado» es un ítem con `completed = true` de una sesión con evento `done`, vía `drill_id → drill_standards`; un Standard sin ningún ítem así en el rango es «sin trabajar», no un error.
- **[D14] `platform_admins` sin interfaz en el MVP**, tal como dice el contrato («vacía, solo admin»): la tabla y sus políticas existen para que el soporte de la plataforma se pueda dar de alta a mano, sin pantalla. Confirmar que no hace falta ni una fila sembrada.
- **[D15] La invitación no manda un email: da un enlace para copiar.** No hay proveedor de email en el proyecto (solo el SMTP interno de Supabase, para sus propios códigos de acceso, al que la app no tiene acceso) y añadir uno es una dependencia nueva fuera del alcance de esta fase (decidido 2026-10-10). `/admin/invites` muestra, tras crear una invitación, su enlace (`/invite/{token}`) con un botón de copiar; dirección lo envía por el medio que prefiera. El texto de la spec «Dirección le invita por email» se cumple en que el destino de la invitación es un email (la cuenta se crea para ese email y `before_user_created` lo exige), no en que la entrega sea automática.

## Review Focus

1. **Nadie crea una cuenta sin invitación.** Un intento de alta directo contra Supabase Auth (fuera de la app, con la clave pública) para un email sin invitación pendiente falla; uno con invitación caducada o ya aceptada también. → Task 1 (pgTAP del hook) y Task 12 (e2e).
2. **Los términos generales no se saltan.** Una cuenta recién aceptada que navega directamente a `/c/[club]/train` (URL a mano, sin pasar por la pantalla de consentimiento) acaba en la pantalla de consentimiento igual. → Tasks 4 y 9.
3. **Una nota o un objetivo no se filtra por auditoría.** `audit_log` registra que alguien editó una nota, nunca su texto. → Task 6 (pgTAP: ningún trigger de auditoría referencia una columna de contenido).
4. **El CSV no escribe nada si una fila es inválida**, salvo que dirección confirme fila a fila cuáles sí. → Task 11.
5. **La matriz RLS no tiene huecos**, con los fixtures que faltaban desde la Fase 2 (admin sin persona, usuario sin membresías) y las ocho tablas nuevas. → Task 13.
6. **Nada de un club en el texto de consentimiento** cuando se lee desde `src/` en un test (datos neutros, como todo lo demás). → Tasks 2 y 9.

---

## Estructura de ficheros

```
supabase/migrations/20270112000{100_invitations,200_guardianships_consents,300_people_photo_storage,400_audit_platform,500_coverage,600_integrations}.sql
supabase/tests/database/{invitations,consents,audit,coverage,posture}.test.sql
scripts/seed/data.ts                                                   +3 personas (C7: 19→22), invitaciones, consents, textos
src/lib/action-result.ts, src/lib/permissions.ts                       INVITE_*, CONSENT_*, LAST_ADMIN; invite.manage, club.manage, people.manage
src/lib/proxy headers (src/lib/supabase/session.ts o src/proxy.ts)     CSP, Permissions-Policy
src/modules/invitations/{queries,actions,schema,types}.ts (+ tests)
src/modules/consents/{queries,actions,schema,types}.ts (+ tests)
src/modules/coverage/{queries,map-rows,types}.ts (+ tests)             buildCoverageMatrix
src/modules/people-import/{parse,actions,types}.ts (+ tests)           CSV
src/modules/integrations/types.ts                                      interfaz Connector, sin implementación
src/ui/{coverage-cell,import-preview-table,...}.tsx (+ tests)
src/app/(auth)/invite/[token]/page.tsx
src/app/(auth)/consent/page.tsx (o dentro del layout de /c/[club])
src/app/c/[club]/layout.tsx                                            redirección a /consent si faltan términos
src/app/c/[club]/admin/{club,teams,people,invites,drills,coverage}/…
src/modules/home/…                                                     cobertura en Inicio de dirección
e2e/{invite,admin-club,admin-people,admin-invites,coverage}.spec.ts
```

---

### Task 1: `invitations` y la puerta de entrada de Auth

**Files:** Create `supabase/migrations/20270112000100_invitations.sql`, `supabase/tests/database/invitations.test.sql`; Modify `supabase/tests/database/posture.test.sql`

**Interfaces (diseño final, tras investigar el hook y las restricciones de `anon`/clave de servicio — ver nota al final del fichero):**
- `invitations (id, organization_id, email, role, team_id, staff_role, person_id, token_hash, expires_at, accepted_at, cancelled_at, invited_by, created_at)`. `check ((role = 'coach') = (team_id is not null and staff_role is not null))`. Único parcial `(organization_id, lower(email)) where accepted_at is null and cancelled_at is null` ([D3]).
- **La cuenta de Auth se crea al INVITAR, no al aceptar.** `public.create_invitation(...)` (`security definer`, solo `authenticated` con `admin.access` del club) inserta `auth.users` en el momento (como ya hace `tests.create_user()`: sin pasar por la API de Auth) si ese email no tenía cuenta, e inserta la invitación. Así el acceso posterior usa el `signInWithOtp({ shouldCreateUser: false })` normal de siempre, sin tocar nada del login.
- `public.accept_pending_invitations() returns text[]` (slugs de los clubes nuevos): `security definer`, solo `authenticated`, identifica a quien llama por `auth.jwt() ->> 'email'` (nunca uniendo contra `auth.users`, que `authenticated` no puede leer), y por cada invitación pendiente y vigente de ese email crea la persona si hace falta ([D2]), la membresía, y marca `accepted_at`. Se llama automáticamente desde `/select-club`, antes de leer los clubes: así una invitación se acepta sola en el primer login, sin un paso aparte ni un token que sobreviva la vuelta por el formulario de código.
- `private.before_user_created(event jsonb) returns jsonb`: el hook de Postgres de Auth (`config.toml`). Nunca se dispara para `create_invitation` (un `insert` directo no pasa por GoTrue): es un cierre de seguridad para cualquier otro camino (señal de alta sin pasar por `create_invitation`), no el mecanismo principal. Devuelve `{}` si hay una invitación pendiente y vigente para ese email; si no, el objeto de error del contrato de la hook (no es `ActionError`: esto no lo ve nunca la app).
- Cancelar y reenviar son `update` directos bajo RLS (sin función): `cancelled_at = now()` y, para reenviar, nuevo `token_hash`/`expires_at`, los dos solo si `private.has_org_role(organization_id, ['admin'])` y `accepted_at is null`.
- **`/invite/[token]` no lee nada.** Es una página estática (sin sesión: no hay nada seguro que mostrar sin ella) que explica el paso siguiente y enlaza a `/login`, sin el email relleno: quien lo abre ya sabe con qué email le han invitado. El `token_hash` queda en la tabla para un futuro resumen o para auditoría; hoy ninguna pantalla lo usa para decidir nada.

- [ ] **Step 1: Test que falla.** `invitations.test.sql`: `create_invitation` por quien no es admin del club falla (`NOT_FOUND`-equivalente); con un `team_id` de otro club, falla; un `role = 'coach'` sin equipo o un `admin` con equipo, falla el `check`; invitar dos veces al mismo email sin que la primera se acepte o cancele, falla (único parcial); invitar a un email que ya tiene cuenta (de otra invitación, de otro club) no duplica `auth.users`, reutiliza su id. `accept_pending_invitations()`, llamada con el jwt de cada email de prueba, acepta exactamente las pendientes y vigentes del suyo y ninguna de otro; una ya aceptada o cancelada no se vuelve a aplicar; dos llamadas seguidas son idempotentes. `before_user_created` con un email sin invitación pendiente devuelve el error; con una pendiente y vigente, `{}`; con una cancelada o caducada, el error. Posture al día (incluida la nueva tabla, y que `anon` sigue sin ejecutar ninguna función: esta fase no le concede ninguna).
- [ ] **Step 2–4:** FAIL → migración → PASS; `pnpm db:types`; `supabase db lint`.
- [ ] **Step 5: Commit** `feat(db): invitaciones, alta de cuenta al invitar y aceptación automática al entrar`

- [ ] **Step 6 (integración, contra Supabase local de verdad):** `scripts/invitations/before-user-created.int.test.ts`. Llama a `auth.admin.createUser` (clave de servicio, como el propio seed) con un email sin invitación y observa el resultado real de GoTrue: confirma si el hook también protege la API de administración o solo el autoservicio. El resultado no cambia el diseño (ninguna escritura del propio flujo pasa por ahí), solo documenta hasta dónde llega esta defensa en profundidad. Anotar lo observado en «Cambios propuestos al contrato».

### Task 2: Consentimientos y su texto por club

**Files:** Create `supabase/migrations/20270112000200_guardianships_consents.sql`, `supabase/tests/database/consents.test.sql`; Modify `supabase/tests/database/posture.test.sql`, `supabase/migrations` (alter `organization_branding`)

**Interfaces:**
- `organization_branding` gana `terms_text text`, `image_consent_text text` (sin check de longitud máxima: es el texto que redacta dirección, puede ser largo; sí un mínimo no vacío para poder activarlo).
- `guardianships (organization_id, guardian_person_id, child_person_id, created_at)`: distingue tutor de otro familiar (spec). Un `guardian_person_id` no puede ser igual a `child_person_id`.
- `consents (id, organization_id, kind 'terms'|'image', person_id, granted_by uuid references auth.users, body_snapshot text, granted_at, revoked_at)`. `kind = 'terms'`: `person_id` es quien da el consentimiento (no hace falta ser tutor de nadie). `kind = 'image'`: `person_id` es el menor; `granted_by` tiene que tener una `guardianship` activa sobre él ([D9]), comprobado en el `insert`.
- `public.grant_terms_consent()`, `public.grant_image_consent(p_person uuid)`, `public.revoke_image_consent(p_consent uuid)` ([D9]: solo dirección, en el MVP).

- [ ] **Step 1: Test que falla:** dar el consentimiento de imagen sin ser tutor de esa persona falla; dos consentimientos de términos del mismo usuario para el mismo club no duplican (el segundo es idempotente o falla con mensaje claro — decidir cuál al escribir, documentarlo); revocar guarda `revoked_at` y no borra la fila; `body_snapshot` queda igual aunque `organization_branding.image_consent_text` cambie después; posture al día.
- [ ] **Step 2–4:** FAIL → migración → PASS; tipos; lint.
- [ ] **Step 5: Commit** `feat(db): consentimientos con texto por club y copia por autor`

---

### Task 3: Foto de persona — columna y Storage, sin subidor ([D10])

**Files:** Create `supabase/migrations/20270112000300_people_photo_storage.sql`, `supabase/tests/database/people-photo.test.sql`

**Interfaces:**
- `people.photo_media_id uuid references media_assets(id) on delete set null`.
- Políticas de Storage propias para `org/{org}/people/{person}/` (C20): `can_see_person_media(person)`, lectura si `can_see_person`; sin política de subida en esta fase (nadie sube).

- [ ] Test: nadie, con ningún rol, puede subir a `org/{org}/people/…` (sin política = sin acceso); `can_see_person_media` sigue la misma visibilidad que `can_see_person`. Commit `feat(db): columna de foto de persona y su Storage, sin subidor`.

---

### Task 4: `audit_log` y `platform_admins`

**Files:** Create `supabase/migrations/20270112000400_audit_platform.sql`, `supabase/tests/database/audit.test.sql`

**Interfaces:**
- `audit_log (id, organization_id, actor_id, action text, entity_table text, entity_id uuid, created_at)`. Sin columna de contenido (Global Constraints).
- `private.record_audit(action text, entity_table text, entity_id uuid)`: la llaman las funciones de esta fase que cambian algo sensible (invitar, aceptar, revocar, archivar persona, dar/revocar consentimiento). No hace falta instrumentar todo el sistema, solo lo que esta fase añade.
- `platform_admins (user_id primary key, granted_at)`, sin política de escritura para `authenticated` ([D14]): solo lectura para quien está en ella, y se puebla a mano con la clave de servicio si hace falta.

- [ ] Test: cada acción de la Task 1 y 2 deja una fila en `audit_log` sin texto de contenido; `platform_admins` no tiene ninguna política de `insert`/`update` para `authenticated`. Commit `feat(db): auditoría de invitaciones y consentimientos, y soporte de plataforma`.

---

### Task 5: Integraciones — esqueleto vacío

**Files:** Create `supabase/migrations/20270112000600_integrations.sql`, `src/modules/integrations/types.ts`, `src/modules/integrations/types.test.ts`

**Interfaces:** `external_connections`, `external_records`, `external_links`, `sync_runs` (columnas del contrato, C-Fase 7, sin lógica); `export interface Connector { provider: string; capabilities: Capability[]; fetch(entity: Capability, cursor?: string): Promise<RawRecord[]> }` (contrato, tal cual).

- [ ] Las cuatro tablas con RLS activado y sin ningún privilegio para `authenticated` (solo admin de plataforma, por ahora sin política: cerradas del todo). Test de tipos de `Connector` (que compila con una implementación de prueba mínima). Commit `feat(db): esqueleto vacío de integraciones externas`.

---

### Task 6: Errores, permisos y `posture.test.sql` cierra las funciones ejecutables

**Files:** Modify `src/lib/action-result.ts`, `src/lib/permissions.ts` (+ tests), `supabase/tests/database/posture.test.sql`

- `ActionError` añade `INVITE_EXPIRED`, `INVITE_INVALID`, `INVITE_ALREADY_ACCEPTED`, `LAST_ADMIN`, `CONSENT_GRANTOR` (nombres del contrato, C1).
- `Action` añade `'invite.manage' | 'club.manage' | 'team.manage' | 'people.manage' | 'coverage.view'`, todas `["admin"]`.
- `posture.test.sql`: nueva lista (C27, lo que quedaba abierto) de qué funciones de `public`/`private` ejecuta `authenticated`, escrita a mano, como las dos listas de tabla y columna.

- [ ] TDD de `fromDbError`, `can` y la lista nueva de posture. Commit `feat(lib): errores y permisos de invitaciones, consentimientos y gestión; postura de funciones`.

---

### Task 7: Módulo `invitations`

**Files:** Create `src/modules/invitations/{queries,actions,schema,types}.ts` (+ tests unitarios e int)

- `listInvitations(ctx)`, `createInvitation`, `resendInvitation`, `cancelInvitation` (acotan al club antes de llamar a la función SQL, C25).
- `acceptInvitation` no es una Server Action del club (no hay `clubSlug` todavía): vive en `src/modules/auth/` o en `invitations/accept.ts`, se llama desde `/invite/[token]` sin pasar por `mutate` (no hay sesión de club que revalidar, solo la redirección que da la función).
- [ ] TDD con el patrón de Fase 6. Commit `feat(invitations): alta, reenvío y cancelación`.

---

### Task 8: Módulo `consents`

**Files:** Create `src/modules/consents/{queries,actions,schema,types}.ts` (+ tests)

- `getConsentStatus(ctx)`: si el usuario ya aceptó términos en este club y si tiene tutelas pendientes de decidir ([D7], [D8]).
- `acceptTerms(clubSlug)`, `grantImageConsent(clubSlug, { personId })`, `revokeImageConsent(clubSlug, { consentId })`.
- [ ] TDD. Commit `feat(consents): términos generales e imagen de menores`.

---

### Task 9: Pantallas de invitación y consentimiento

**Files:** Create `src/app/(auth)/invite/[token]/page.tsx`, `src/app/(auth)/consent/page.tsx` (o ruta equivalente dentro de `/c/[club]`, a decidir con [D7]); Modify `src/app/select-club/page.tsx`, `src/app/c/[club]/layout.tsx`

- `/invite/[token]`: estática, sin leer nada (nadie tiene sesión todavía); reutiliza `CourtPlay` y la composición del login (#12) para que no desentone. Explica el paso siguiente y enlaza a `/login`, sin el email relleno. Nadie llega aquí por un email automático ([D15]): el enlace lo comparte dirección a mano.
- `/select-club`: antes de `listClubs()`, llama a `acceptPendingInvitations()`. Es donde de verdad se acepta una invitación, en el primer login tras ella, sin paso aparte: quien entra ve ya su club nuevo en la lista (o salta directo si es el único).
- Pantalla de consentimiento: términos (obligatorio) y, si hay tutelas, imagen por cada hijo o hija (opcional, [D8]). El layout de `/c/[club]` redirige aquí si `getConsentStatus` dice que faltan términos ([D7], Review Focus 2).
- [ ] TDD de las páginas + un e2e de extremo a extremo (Task 14 lo amplía, pero el recorrido feliz puede ir aquí si es más simple). Commit `feat(auth): cuenta creada al invitar, aceptación automática y consentimientos en el primer acceso`.

---

### Task 10: Gestión — club, equipos e invitaciones

**Files:** Create `src/app/c/[club]/admin/{club,teams,invites}/page.tsx` (+ `_components`, tests)

- `/admin/club`: nombre, zona horaria, colores de marca (`contrastRatio`, `validateAccent`, `deriveBrandColors` — contrato, C-Fase 7), terminología, y los dos textos de consentimiento.
- `/admin/teams`: temporadas, categorías y equipos (alta y edición; no hay "fase de equipo" en el contrato más allá de CRUD simple).
- `/admin/invites`: lista, crear, reenviar, cancelar.
- [ ] TDD por pantalla, con `contrastRatio`/`validateAccent`/`deriveBrandColors` primero como funciones puras con sus tests. Commit `feat(admin): club, equipos e invitaciones`.

---

### Task 11: Gestión — personas y CSV

**Files:** Create `src/app/c/[club]/admin/people/page.tsx` (+ `_components/import-csv.tsx`), `src/modules/people-import/{parse,actions,types}.ts` (+ tests)

- Lista y alta/edición de personas una a una, con «Invitar» sobre quien no tiene cuenta ([D2]), «Archivar» ([D5]).
- Importación CSV ([D6]): subir fichero → vista previa fila a fila (válida/con error, y por qué) → confirmar → escribir solo lo válido o nada, según lo que dirección confirme.
- [ ] TDD: el analizador de CSV primero, como función pura (fichero de texto a filas tipadas, sin tocar la base), con casos de comillas, comas dentro de un campo y filas vacías. Después las acciones. Commit `feat(admin): personas, alta, baja e importación CSV`.

---

### Task 12: Gestión — cola de ejercicios y seguridad de la cobertura

**Files:** Create `src/app/c/[club]/admin/drills/page.tsx` (+ tests)

- Lista de ejercicios `draft` del club entero (no solo los propios, a diferencia de la biblioteca normal), ordenada por antigüedad ([D11]). Publicar/archivar reutiliza las acciones de la Fase 3.
- [ ] TDD. Commit `feat(admin): cola de ejercicios pendientes de revisión`.

---

### Task 13: Cobertura

**Files:** Create `supabase/migrations/20270112000500_coverage.sql`, `supabase/tests/database/coverage.test.sql`, `src/modules/coverage/{queries,map-rows,types}.ts` (+ tests), `src/app/c/[club]/admin/coverage/page.tsx`; Modify `src/modules/home/{queries,build-home,home-screen}.tsx`

- `public.coverage_by_team(p_org uuid, p_from date, p_to date) returns table (team_id uuid, standard_id uuid, worked_count int)`: cuenta ítems `completed = true` de planes de eventos `done` en el rango, vía `drill_id → drill_standards` ([D13]).
- `buildCoverageMatrix(rows, teams, standards)`: filas = equipos, columnas = Standards, celda = trabajado/sin trabajar (y cuántas veces).
- Inicio de dirección: un resumen corto («3 de 12 Standards sin trabajar esta temporada» o similar) que enlaza a `/admin/coverage`.
- [ ] TDD: la función SQL con pgTAP (un ítem completado cuenta, uno no completado no, uno de una sesión cancelada no), `buildCoverageMatrix` con datos falsos, la página. Commit `feat(coverage): qué ha trabajado cada equipo y qué no`.

---

### Task 14: Seed, e2e y cierre de seguridad

**Files:** Modify `scripts/seed/data.ts`, `scripts/seed/seed.int.test.ts`, `supabase/tests/database/posture.test.sql`; Create `e2e/{invite,admin-club,admin-people,admin-invites,coverage}.spec.ts`; Modify `src/lib/supabase/session.ts` o `src/proxy.ts`, login actions

- Seed (C7: `people` 19→22): tres personas más — un tutor con una `guardianship` sobre un jugador existente, y dos invitaciones de prueba (una pendiente, una caducada). Además, cada usuario que el seed crea de cero pasa a llevar su propia invitación «aceptada»: antes de `auth.admin.createUser` se inserta su fila en `invitations` (pendiente, vigente) y justo después se marca `accepted_at = now()` — el mismo baile de dos pasos que haría un alta real, para que `before_user_created` (si de verdad protege también la API de administración, Task 1 Step 6) nunca bloquee el seed, y de paso para que `/admin/invites` tenga un historial de altas realista en vez de datos sueltos. Textos de consentimiento ficticios en los dos clubes del seed.
- Cabeceras de seguridad y CSP (C12) en el proxy de sesión; límite de intentos de login ([D12]).
- Fixtures de la matriz RLS que faltaban desde la Fase 2: admin sin persona, usuario sin ninguna membresía (backlog).
- e2e del recorrido completo de invitación (email → código → términos → consentimiento de imagen si aplica → Inicio), de cada pantalla de Gestión nueva, y de la cobertura.
- [ ] Commit `test(e2e): invitaciones, consentimientos, gestión y cobertura`.

---

### Task 15: Cierre de la fase

- [ ] Desde una base vacía: `supabase db reset`, `pnpm seed` dos veces, tipos sin deriva, `supabase db lint`, `lint`, `typecheck`, `check:guards`, unidad (`TZ=UTC` también), `test:db`, `test:int`, `test:e2e`.
- [ ] Accesibilidad: pasar axe sobre las pantallas nuevas (Gestión completa, invitación, consentimiento).
- [ ] Asesores de seguridad y de rendimiento de Supabase, limpios o con lo que quede documentado como pendiente aceptado.
- [ ] Recorrido manual de los criterios de éxito del MVP (spec, meta de las 3 pantallas de Live Practice: no está en esta fase pero se revisa que nada de lo nuevo lo haya roto) a 375×812 con Álex, Irene, Raúl, Nora, Marta y un tutor nuevo del seed.
- [ ] Actualizar `docs/superpowers/backlog.md`: cerrar el bloque «Fase 7» y abrir, si queda algo, uno de «después del MVP» (familias, decisión 13).
- [ ] README: «Despliegue de Gestión y cierre del MVP (Fase 7)», con las seis migraciones y, por primera vez, un paso de configuración fuera de la base de datos (el hook de Auth `before_user_created`, que según cómo lo ofrezca el proyecto puede necesitar activarse desde el panel de Supabase, no solo con `db push`).
- [ ] Abrir el PR.

## Cambios propuestos al contrato

- **`getPlayerProfile` ya tomaba `(ctx, teamId, personId)`** desde la Fase 6 (C13 lo daba por aceptado); sin cambio aquí, solo una nota de que `revokeImageConsent` necesita el mismo par para comprobar la tutela.
- **`ActionError` cierra su unión en esta fase** (el contrato dice «`Action` final» para el TS; aquí se deja constancia de que `ActionError` también deja de crecer: cualquier error nuevo después del MVP es ya fuera de esta spec).
