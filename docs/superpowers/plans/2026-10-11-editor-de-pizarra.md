# Editor de pizarra · Plan de implementación

**Objetivo:** que quien puede editar un ejercicio dibuje y cambie su pizarra en el móvil: fichas, movimientos, pasos, deshacer, vista previa y guardar.

**Arquitectura:** un reductor puro (`src/modules/board/editor.ts`) sobre el `Board` de la versión 1, con historial; un componente de cliente (`BoardEditor`) que lo pinta con el dibujo del visor y traduce toques y teclas a acciones del reductor; una acción (`saveDrillBoard`) que valida con `parseBoard` y guarda con una función SQL `security invoker`.

**Pila:** la del proyecto. Sin dependencias nuevas: eventos de puntero sobre SVG.

**Especificación:** `docs/superpowers/specs/2026-10-11-editor-de-pizarra-design.md`. Va encima de la pieza 3 (Dkalds/Club-OS#18).

## Restricciones

- Las de `CLAUDE.md`: solo tokens, nada de un club en `src/`, 44 px de área táctil, copy en español de tú.
- C17 y C27 (la columna que la app escribe se concede y se apunta en `posture`), C25 (la acción acota al club antes de la función), C26 (`NOT_FOUND` primero), C28 (aviso al salir con cambios), C36 (la pizarra se valida al leer y al escribir).
- Lo que el editor produce pasa siempre `parseBoard`.

## Dónde mirar al revisar

1. Arrastrar con el dedo sobre la pista no desplaza la página, y soltar fuera de la pista deja la ficha dentro.
2. Quitar una ficha, un movimiento o un paso a mitad de una secuencia: los pasos siguientes siguen siendo válidos (nadie se mueve dos veces, nadie mueve una ficha que no existe).
3. Deshacer tras guardar, y guardar dos veces seguidas: la copia esperada es la que devolvió el último guardado.
4. Los topes (24 fichas, 12 pasos, 12 movimientos): el botón se desactiva y lo dice; no se puede pasar por teclado.
5. Otro móvil con el formulario del ejercicio abierto: al guardar recibe `STALE_COPY`, no pisa la pizarra.

## Tareas

### 1. Base de datos

- [x] `supabase/migrations/20270216000100_save_drill_board.sql`: `grant update (board)`; `save_drill_board(p_drill, p_expected_updated_at, p_board default null) returns timestamptz`.
- [x] `supabase/tests/database/drill_board_save.test.sql`; `drill_board.test.sql` y `posture.test.sql` al día.
- [x] `pnpm db:types`, `supabase db lint`.

### 2. El reductor

- [x] `src/modules/board/editor.ts` (+ test): `EditorState = { board; view; selected; history: { past; future } }`, `initialEditor(board | null)`, `editorReducer(state, action)`, `toSavable(board): Board | null`. Acciones: `add-token`, `move-token`, `remove-token`, `set-move`, `clear-move`, `add-step`, `duplicate-step`, `remove-step`, `set-note`, `set-court`, `select`, `view`, `undo`, `redo`.
- [x] `src/modules/board/limits.ts`: `HISTORY_MAX = 50`, `MAX_LABEL_NUMBER = 9`.

### 3. Guardar

- [x] `saveDrillBoard(clubSlug, { drillId, expectedUpdatedAt, board }) → { updatedAt }` en `src/modules/drills/actions.ts` y su esquema; `removeDrillBoard` es la misma acción con `board: null`.

### 4. La pantalla

- [x] `src/ui/board-drawing.tsx`: `fromBox(court, point)`, el inverso de `toBox`, acotado a la pista.
- [x] `src/app/c/[club]/(app)/drills/[drillId]/board/{page,loading,error}.tsx` y `_components/board-editor.tsx`.
- [x] Entradas: «Dibujar pizarra» / «Editar pizarra» en la ficha; enlace en el campo «Diagrama» del formulario.

### 5. Cierre

- [x] E2E (`board-editor.spec.ts`, en `admin`).
- [x] Contratos, backlog, README y `design/components/Board`.
- [ ] Suite entera desde base vacía, repaso visual a 375×812, revisión de la rama y una tanda de arreglos.
