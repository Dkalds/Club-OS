#!/usr/bin/env bash
# Guards de CLUB OS (reglas 2, 3 y tokens sincronizados de CLAUDE.md).
# Sale con 1 si alguna comprobación falla e imprime las líneas culpables.
# Se ejecuta desde la raíz del repo: `pnpm check:guards`.
set -u
cd "$(dirname "$0")/.."

fail=0

# check_absent <descripción> <opciones de grep...>
# Falla si grep encuentra algo en src/ (tests incluidos), y también si grep no ha podido
# buscar: su estado 1 es «sin coincidencias» (pasa), 0 es «hay coincidencias» y 2 o más es
# un error (src/ no existe o no se puede leer), que no puede contar como un pase.
check_absent() {
  local label="$1"
  shift
  local found status
  found="$(grep "$@" src/)"
  status=$?
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

# Regla 3: nada de un club escrito en src/. Los dos clubes del seed: nombre, slug y color
# de acento, sin distinguir mayúsculas. Alternancia explícita (no [aá]) para que funcione
# igual con cualquier locale.
check_absent "src/ menciona a un club (Arcángel / c9a45c / Club Demo / 3fb8af)" \
  -rniE 'arc(a|á|Á)ngel|c9a45c|club[ _-]?demo|3fb8af'

# Regla 2: la clave de servicio nunca entra en src/.
check_absent "src/ menciona SERVICE_ROLE" -rn 'SERVICE_ROLE'

# Gestión: cada página de /admin llama ella misma a `requireClub(` y a `requireAdmin(`. Un
# layout no protege a sus páginas (Next puede pintar una página sin volver a ejecutar su
# layout), así que la comprobación del layout no basta. La ruta lleva corchetes y paréntesis:
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
  for call in 'requireClub(' 'requireAdmin('; do
    unguarded="$(find "$admin_dir" -type f -name 'page.[jt]s*' -exec grep -LF "$call" {} + || true)"
    if [ -n "$unguarded" ]; then
      echo "FALLO: páginas de Gestión sin $call (regla: cada page.tsx de /admin llama a requireClub( y a requireAdmin( ella misma)"
      echo "$unguarded"
      echo
      fail=1
    fi
  done
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
