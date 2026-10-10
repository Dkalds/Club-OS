# Preparar sesión · Plan de implementación

**Objetivo:** que «Preparar sesión» ofrezca proponer un entrenamiento o empezar desde cero, que una sesión se guarde como plantilla y se vuelva a usar, y que el constructor diga si lo montado encaja con la franja.

**Arquitectura:** la propuesta es una función pura (`buildProposal`) sobre lo que una acción de solo lectura lee con la sesión del usuario; llega al constructor como cambios sin guardar. Las plantillas son planes sin equipo ni evento (`is_template`), personales, con dos funciones SQL `security invoker` y tres políticas nuevas; sin tablas nuevas.

**Pila:** la del proyecto (Next 16, Supabase con RLS, Zod, Vitest, pgTAP, Playwright).

**Especificación:** `docs/superpowers/specs/2026-10-10-preparar-sesion-design.md`. Va encima de la pieza 1 (Dkalds/Club-OS#15).

## Restricciones

- Las de `CLAUDE.md`. En particular: nada de un club en `src/` (el motor no conoce slugs de objetivos: los recibe), la clave de servicio fuera de `src/`, solo tokens.
- C25 (la acción acota al club antes de llamar a una función SQL), C26 (`NOT_FOUND` primero), C27 (`posture.test.sql` al día), C15 (argumentos opcionales ausentes, no null).
- Copy en español, tuteando, sin exclamaciones.

## Dónde mirar al revisar

1. Biblioteca vacía o sin ejercicios para la edad del equipo: la propuesta es una lista vacía y la pantalla lo dice; no falla.
2. Sesión de 15 min (menos tiempo que huecos): se quitan huecos, no salen minutos negativos ni ejercicios de 0 min.
3. Volver a `/edit?propose=1` (recargar, atrás) con la sesión ya guardada: no vuelve a proponer encima.
4. Plantilla cuyo ejercicio se archivó o se borró después: la sesión nace igual (el ítem conserva su título).
5. Dirección ve en la base las plantillas de otros: ninguna pantalla ni acción las enseña, usa ni borra.

## Tareas

### 1. Base de datos de las plantillas

- [x] `supabase/migrations/20270119000100_practice_templates.sql`: `check` (una plantilla no tiene evento), `grant insert (is_template)` y `grant delete` en `practice_plans`, `practice_plans_insert_managed` rechaza `is_template`, políticas `practice_plans_insert_template`, `practice_plans_delete_own_template`, `practice_items_insert_template`; funciones `save_practice_as_template(p_event uuid) returns uuid` (`NOT_FOUND`, `INVALID` sin ejercicios, `TEMPLATE_LIMIT` con 50) y `create_practice_from_template(p_template, p_team, p_starts_at, p_ends_at, p_title, p_primary_focus default null, p_secondary_focus default null, p_location default null) returns uuid`.
- [x] `supabase/tests/database/practice_templates.test.sql` (32): por club, por autor, por equipo, API directa, tope, borrado en cascada. `posture`, `calendar` y `practice_write` al día.
- [x] `pnpm db:types`, `supabase db lint`.

### 2. El motor de la propuesta

- [x] `src/modules/practice/proposal.ts` (+ test). `buildProposal(input: ProposalInput): Proposal`.
  - `ProposalInput = { minutes; age: number | null; players: number | null; primaryFocus; secondaryFocus: { slug; name } | null; drills: ProposalDrill[]; recentDrillIds: string[] }`.
  - `ProposalDrill = { id; title; minAge; maxAge; minPlayers; maxPlayers; minMinutes; maxMinutes; focus: { slug; name }[]; keyPoints; variants }`.
  - `Proposal = { items: ProposedItem[]; uncoveredMinutes: number }`, `ProposedItem = { drillId; title; phase: string | null; minutes; hint: string }`.
  - Huecos, en el orden de la sesión: Activación 15 % (el más corto), principal 45 % (dos; uno si dura menos de 60 min), secundario 20 % (sin secundario, otro del principal), Competición 20 % (el que más jugadores admite). Se eligen primero los de objetivo.
  - Escalera por hueco: sin usar hace poco y con sitio para la plantilla → usado hace poco → sin mirar jugadores → cualquier objetivo. La edad, nunca. Empates por título.
  - Minutos de 5 en 5 dentro del rango del ejercicio; lo que falta o sobra, por turnos del principal hacia fuera. Si los mínimos no caben, se quitan huecos (secundario, competición, segundo principal, activación). Si los huecos no llenan la franja, más ejercicios del principal y del secundario por turnos, hasta ocho.
  - `hint`: «Transición · 2 puntos clave · 1 variante», sin las partes a cero.
- [x] `fitNotice(totalMinutes, slotMinutes): string | null` en `items.ts`: «Te sobran 10 min», «Te pasas 10 min», `null` si coincide o no hay nada montado.

### 3. Leer y proponer

- [x] `src/modules/practice/proposal-queries.ts`: `getProposalInput(ctx, eventId): Promise<ProposalInput | null>` (sesión, edad de la categoría, tamaño de la plantilla, ejercicios publicados válidos por edad con sus puntos clave y variantes, ejercicios de las tres últimas sesiones no canceladas del equipo anteriores a esta).
- [x] `proposePracticeItems(clubSlug, { eventId }): Promise<ActionResult<Proposal>>` en `actions.ts`: solo lectura, como `findDrills` (Zod, club, `practice.manage`, `SAVE_FAILED` si la lectura falla).

### 4. Los dos caminos y el constructor

- [x] `PracticeForm` (alta): «Proponer entrenamiento» (principal) → `/train/{id}/edit?propose=1`; «Empezar desde cero» (secundario) → `/train/{id}/edit`.
- [x] `PracticeEditor`: `autoPropose` (de `?propose=1`, solo con la sesión sin ejercicios; quita el parámetro de la URL al usarlo), botón «Proponer entrenamiento» con la lista vacía, aviso «Propuesta sin guardar. Revísala, cámbiala y guarda.» y, sin candidatos, «No hay ejercicios en la biblioteca para esta sesión. Móntala tú.»
- [x] `PracticeBuilder`: `slotMinutes` (aviso de encaje junto al total), `extraActions(add, full, empty)`, `add(item, { hint })`; `PracticeItem` con `hint`.

### 5. Plantillas

- [x] `ActionError` `TEMPLATE_LIMIT`: «Ya tienes 50 plantillas, el máximo. Borra alguna para guardar otra.»
- [x] Acciones: `savePracticeAsTemplate(clubSlug, { eventId }) → { templateId }`, `createPracticeFromTemplate(clubSlug, { templateId, teamId, …datos }) → { eventId }`, `deletePracticeTemplate(clubSlug, { templateId }) → null`.
- [x] Lecturas (`template-queries.ts`): `listTemplates(ctx)`, `getTemplate(ctx, id)`; solo las propias. `PracticeTemplate = { id; title; totalMinutes; itemCount; primaryFocus; secondaryFocus }`.
- [x] Pantallas: pestaña «Plantillas» (`?scope=templates`), `/train/new?template={id}` (aviso, «Crear sesión», «Borrar plantilla» con confirmación), «Guardar como plantilla» en la ficha.

### 6. Valores por defecto del equipo

- [x] `getPracticeFormOptions` devuelve `teamDefaults: Record<teamId, { time; durationMinutes; location }>` (última sesión no cancelada de cada equipo). El formulario los pone al cambiar de equipo mientras no se hayan tocado.

### 7. Cierre

- [x] E2E: proponer → cambiar → guardar; salir sin guardar deja la sesión vacía; desde cero con el aviso de encaje; plantilla: guardar → usar → borrar; otra entrenadora no la ve.
- [x] Contratos, backlog, README, `design/components/PracticeItem`.
- [x] Suite entera desde base vacía, repaso visual a 375×812, revisión de la rama y una tanda de arreglos.
