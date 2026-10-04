#!/usr/bin/env bash
# Guards de CLUB OS (reglas 2, 3 y 4 de CLAUDE.md, y tokens sincronizados).
# Sale con 1 si alguna comprobación falla e imprime las líneas culpables.
# Se ejecuta desde la raíz del repo: `pnpm check:guards`.
set -u
cd "$(dirname "$0")/.."

fail=0

# check_absent_except <descripción> <excepción> <opciones de grep...>
# Falla si grep encuentra algo en src/ (tests incluidos salvo que las opciones los excluyan), y
# también si grep no ha podido buscar: su estado 1 es «sin coincidencias» (pasa), 0 es «hay
# coincidencias» y 2 o más es un error (src/ no existe o no se puede leer), que no puede contar
# como un pase.
#
# <excepción> es una regex extendida (vacía: ninguna) con las coincidencias que sí valen. Se
# aplica sobre las líneas que grep ya ha encontrado, porque grep -E no tiene lookbehind y «una
# medida salvo si va detrás de text-» no se escribe en una sola regex. El estado del filtro
# sigue la misma regla que el de grep: 1 es que todo lo encontrado eran excepciones (pasa).
check_absent_except() {
  local label="$1" allowed="$2"
  shift 2
  local found status
  found="$(grep "$@" src/)"
  status=$?
  if [ "$status" -eq 0 ] && [ -n "$allowed" ]; then
    found="$(printf '%s\n' "$found" | grep -vE "$allowed")"
    status=$?
  fi
  if [ "$status" -eq 1 ]; then
    return
  fi
  if [ "$status" -eq 0 ]; then
    echo "FALLO: $label"
  else
    echo "FALLO: $label: grep no pudo comprobarlo (estado $status)"
  fi
  if [ -n "$found" ]; then
    echo "$found"
  fi
  echo
  fail=1
}

# check_absent <descripción> <opciones de grep...>
# Lo mismo sin excepciones: todo lo que grep encuentre es un fallo.
check_absent() {
  check_absent_except "$1" "" "${@:2}"
}

# Regla 3: nada de un club escrito en src/. Los dos clubes del seed: nombre, slug y color
# de acento, sin distinguir mayúsculas. Alternancia explícita (no [aá]) para que funcione
# igual con cualquier locale.
check_absent "src/ menciona a un club (Arcángel / c9a45c / Club Demo / 3fb8af)" \
  -rniE 'arc(a|á|Á)ngel|c9a45c|club[ _-]?demo|3fb8af'

# Regla 2: la clave de servicio nunca entra en src/.
check_absent "src/ menciona SERVICE_ROLE" -rn 'SERVICE_ROLE'

# Regla 4: los colores, espacios y radios salen de los tokens. Las dos comprobaciones miran
# solo los componentes (`.tsx`) y dejan fuera los tests: un test puede escribir un hex o una
# medida para comprobar que no salen. `--include` va antes que `--exclude` porque, si un
# archivo cumple los dos, grep hace caso al último.
tsx_only=(--include='*.tsx' --exclude='*.test.tsx')

# Nada de colores hex: `#` y 3, 4, 6 u 8 dígitos (#rgb, #rgba, #rrggbb, #rrggbbaa) que acaban
# ahí, para no confundir `#12345` ni `#1234567` con un color. [[:xdigit:]] y no [0-9a-f]:
# no depende del locale.
#
# Una línea de comentario no cuenta: un comentario que nombra un ancla (`/way#1abc`) o una
# entidad no es un color de la interfaz, y el guard no puede distinguirlo de uno por su forma.
# Es comentario la línea cuyo primer carácter que no es un espacio abre uno (`//`, `/*`, `*`
# en las líneas de en medio de un bloque, o `{/*` en un comentario de JSX). Los comentarios
# que siguen a código en su misma línea sí cuentan, igual que cualquier hex dentro de código
# (un `className`, un `style`): ahí sí podría ser un color de verdad. La excepción se aplica
# sobre la salida de grep (`archivo:línea:texto`), de ahí el prefijo.
check_absent_except "src/ lleva un color hex (usa un token de color: bg-surface-1, text-ink...)" \
  '^[^:]*:[0-9]+:[[:space:]]*(//|/\*|\*|\{/\*)' \
  -rnE "${tsx_only[@]}" '#([[:xdigit:]]{3,4}|[[:xdigit:]]{6}|[[:xdigit:]]{8})\b'

# Nada de medidas entre corchetes con unidad (`min-h-[220px]`, `w-[70%]`). Las medidas son un
# token, o la escala de Tailwind (`min-h-55`, `w-7/10`), que es la rejilla de 4px; ver
# «Espaciado y layout» en design/README.md. Solo la tipografía (`text-`, `leading-`, `tracking-`)
# admite un literal con unidad, cuando bundle.css fija una medida sin estilo de texto.
#
# Se piden las clases (`-o`), no las líneas: una línea puede llevar `text-[24px]` (vale) y
# `h-[18px]` (no) a la vez, y el filtro de excepciones debe verlas por separado. El prefijo
# `[A-Za-z0-9-]*` no cruza el `:` de una variante, así que `lg:text-[24px]` sale como
# `text-[24px]`. `calc()`, `env()` y `var()` no empiezan por un número: no son un literal.
check_absent_except "src/ lleva una medida entre corchetes (usa un token o la escala de Tailwind; solo text-, leading- y tracking- admiten un literal con unidad)" \
  ':(text|leading|tracking)-\[' \
  -rnoE "${tsx_only[@]}" '[A-Za-z0-9-]*-\[-?[0-9.]+(px|rem|em|%)[^] ]*\]'

# Gestión: el export por defecto de cada página de /admin es `adminPage(...)` (src/lib/guards.ts),
# que comprueba el club y el permiso antes de ejecutar nada de la página. Un layout no protege
# a sus páginas (Next puede pintar una página sin volver a ejecutar su layout), así que la
# comprobación del layout no basta. Se mira la línea entera, desde su principio: mencionar
# `adminPage(` en un comentario, o llamarlo sin exportarlo, no cuenta. La ruta lleva corchetes:
# va entre comillas.
#
# Un guard que no encuentra qué comprobar no protege nada y pasaría: sin la carpeta (la han
# movido o renombrado) o sin ninguna página dentro, falla.
admin_dir='src/app/c/[club]/admin'
if [ ! -d "$admin_dir" ]; then
  echo "FALLO: no existe $admin_dir: sin las páginas de Gestión no hay nada que comprobar y este guard pasaría sin proteger (si la carpeta se ha movido, actualiza este guard)"
  echo
  fail=1
elif [ -z "$(find "$admin_dir" -type f -name 'page.[jt]s*')" ]; then
  echo "FALLO: $admin_dir no tiene ninguna página (page.tsx): no hay nada que comprobar y este guard pasaría sin proteger"
  echo
  fail=1
else
  # `[(<]`: con o sin los parámetros de la ruta declarados (`adminPage<{ ... }>(`).
  unguarded="$(find "$admin_dir" -type f -name 'page.[jt]s*' -exec grep -L '^export default adminPage[(<]' {} + || true)"
  if [ -n "$unguarded" ]; then
    echo "FALLO: páginas de Gestión que no exportan por defecto adminPage( (regla: cada page.tsx de /admin es \`export default adminPage(async (ctx, params) => ...)\`, que comprueba el club y el permiso antes de ejecutar la página)"
    echo "$unguarded"
    echo
    fail=1
  fi
fi

# Tokens generados desde design/tokens.json. Se activa cuando existe el generador.
if [ -f scripts/tokens-to-css.ts ]; then
  if ! pnpm tokens; then
    echo "FALLO: pnpm tokens no se ha podido ejecutar"
    fail=1
  elif ! git diff --exit-code src/ui/tokens.css; then
    echo "FALLO: src/ui/tokens.css no está sincronizado con design/tokens.json (ejecuta pnpm tokens)"
    fail=1
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "check:guards OK"
fi
exit "$fail"
