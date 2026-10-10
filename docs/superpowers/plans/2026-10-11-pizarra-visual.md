# Pizarra visual · Plan de implementación

**Objetivo:** que la pizarra de un ejercicio sea datos que la app dibuja, por pasos y con animación, y que se vea igual en la ficha, en la sesión y en el directo.

**Arquitectura:** una columna `drills.board jsonb` que la app solo lee en esta pieza (la escribe el seed; el editor es la pieza 4). Un módulo puro (`src/modules/board/`) valida la forma al leer y calcula los fotogramas; dos componentes de `src/ui/` la dibujan en SVG con el dibujo del producto: `Board` (de cliente, con controles) y `BoardThumb` (pura).

**Pila:** la del proyecto. Sin dependencias nuevas: SVG y transiciones CSS.

**Especificación:** `docs/superpowers/specs/2026-10-11-pizarra-visual-design.md`. Va encima de la pieza 2 (Dkalds/Club-OS#16).

## Restricciones

- Las de `CLAUDE.md`: solo tokens (ni hex ni medidas con unidades entre corchetes), nada de un club en `src/`, datos de ejemplo ficticios, 44 px de área táctil, «reducir movimiento» respetado.
- C27: una columna que la app no escribe no se concede. C17 no aplica todavía: `save_drill` no escribe `board`.
- El dibujo es el de `design/README.md`, «Diagramas de pista»; `Board` llega con su vista previa en `design/components/Board/`.

## Dónde mirar al revisar

1. Una pizarra con forma rota en la base (otra versión, una ficha sin posición, un movimiento de una ficha que no existe): la pantalla la trata como si no hubiera, no falla.
2. Reproducir y salir de la pantalla, o cambiar de ejercicio en el directo a media animación: no quedan temporizadores vivos ni un paso fuera de rango.
3. «Reducir movimiento»: reproducir avanza sin desplazamiento y sin dejar la pizarra a medias.
4. Una pizarra de un solo fotograma: sin controles ni «Paso 1 de 1».
5. El directo sin conexión con pizarra: se ve; con imagen subida y sin conexión, sigue el aviso de siempre.

## Tareas

### 1. Base de datos

- [x] `supabase/migrations/20270202000100_drill_board.sql`: `drills.board jsonb` con su `check` (objeto, `version` 1, 32 kB). Sin `grant`.
- [x] `supabase/tests/database/drill_board.test.sql`: el `check`; `authenticated` no la escribe (API directa); `save_drill` la conserva; quien no ve el ejercicio no la ve. `posture.test.sql` al día si lista columnas.
- [x] `pnpm db:types`, `supabase db lint`.

### 2. La pizarra como dato

- [ ] `src/modules/board/types.ts`: `Board`, `BoardToken`, `BoardMove`, `BoardStep`, `BoardPoint`, `BoardFrame = Record<tokenId, BoardPoint>`.
- [ ] `src/modules/board/limits.ts`: `MAX_TOKENS = 24`, `MAX_STEPS = 12`, `MAX_MOVES = 12`, `NOTE_MAX = 140`, `LABEL_MAX = 2`, `BALL_REACH = 6` (a qué distancia el balón está «pegado» a quien bota).
- [ ] `src/modules/board/schema.ts`: `parseBoard(value: unknown): Board | null` (Zod; ids únicos; movimientos de fichas que existen; `pass` solo de un balón y los demás solo de un jugador).
- [ ] `src/modules/board/frames.ts`: `boardFrames(board): BoardFrame[]` (uno más que pasos) y `boardLabel(title, step, total)`.

### 3. Dibujarla

- [ ] `src/ui/board-drawing.tsx` (pura): la pista (`half` 4:3, `full` apaisada), las fichas y los movimientos, y el paso de unidades de pista a la caja.
- [ ] `src/ui/board-thumb.tsx` (pura): `BoardThumb({ board, size })`, primer fotograma.
- [ ] `src/ui/board.tsx` (cliente): `Board({ board, title })` con reproducir/pausar, paso anterior y siguiente, reiniciar, «Paso N de M» y la nota. Temporizadores limpios al desmontar; `prefers-reduced-motion`.
- [ ] `design/components/Board/` (vista previa y reglas) y `design/README.md`.

### 4. Leerla

- [ ] `DrillSummary.board: Board | null` (la tarjeta) y, con ella, `DrillDetail`; `SUMMARY_COLUMNS` y `DETAIL_COLUMNS` piden `board`.
- [ ] `PracticeDetailItem.board: Board | null` (`DETAIL_COLUMNS` de sesiones pide `drills(board)`).
- [ ] `LiveItem.board: Board | null` y `LiveItem.setup: string | null`.

### 5. Enseñarla

- [ ] Ficha de un ejercicio: pizarra, o imagen, o nada.
- [ ] `DrillCard`: miniatura de la pizarra si la hay.
- [ ] Ficha de una sesión: miniatura en la fila (`PracticeItemView` acepta `thumb`).
- [ ] Directo: pizarra, o imagen, o nada; «Cómo se organiza», plegado.

### 6. Seed

- [ ] `scripts/seed/boards.ts`: nueve pizarras ficticias (ocho de Arcángel, una de Club Demo) y su validación con `parseBoard` en un test.

### 7. Cierre

- [ ] E2E (`boards.spec.ts`, en `mobile`: solo lee): ficha con pasos, ficha sin pizarra, miniaturas, directo con pizarra y sin conexión.
- [ ] Contratos, backlog y README.
- [ ] Suite entera desde base vacía, repaso visual a 375×812, revisión de la rama y una tanda de arreglos.
