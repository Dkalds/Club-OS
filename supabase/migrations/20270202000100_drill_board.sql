-- La pizarra de un ejercicio como datos: jugadores, balón, conos y movimientos por pasos, que
-- la app dibuja. Hasta ahora un ejercicio solo podía llevar una imagen subida
-- (`diagram_media_id`), que sigue valiendo para los que no tengan pizarra.
--
-- Una columna, `drills.board`. Su forma (fichas, pasos, movimientos; versión 1) la describe
-- `src/modules/board/types.ts` y la valida la app al leer: una pizarra que no la cumple se trata
-- como si no hubiera. La base solo cierra lo que la protege a ella: que sea un objeto, que diga
-- su versión y que no pase de 32 kB.
--
-- Quién la ve: es una columna del ejercicio, así que la misma política de lectura. Quién la
-- escribe: en esta entrega, nadie con la sesión de un usuario. No se añade al `grant update`
-- por columnas de `20261103000400_save_drill.sql` (C27: lo que la app no escribe no se
-- concede), y `save_drill` no la toca: guardar un ejercicio conserva su pizarra. La escribe el
-- seed, con la clave de servicio; escribirla desde la app llega con el editor de jugadas.
--
-- El alta de un ejercicio sí está concedida sobre la tabla entera desde
-- `20261103000100_drills.sql`: quien puede crear un borrador por la API directa puede traerlo
-- con pizarra. No abre nada (es su propio borrador, pasa por el mismo `check` y la app la
-- valida al leer), y cerrarlo sería cambiar ese `grant` por columnas.

alter table public.drills
  add column board jsonb
    constraint drills_board_check check (
      board is null
      or (
        jsonb_typeof(board) = 'object'
        -- Por contención y no con `->>`: sin la clave, `->>` da null y el `check` pasaría.
        and board @> '{"version": 1}'::jsonb
        and octet_length(board::text) <= 32768
      )
    );

comment on column public.drills.board is
  'La pizarra del ejercicio (versión 1: court, tokens, steps). La valida la app al leer.';
