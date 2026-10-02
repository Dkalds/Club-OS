#!/usr/bin/env bash
# Guards de CLUB OS (reglas 2, 3 y tokens sincronizados de CLAUDE.md).
# Sale con 1 si alguna comprobación falla e imprime las líneas culpables.
# Se ejecuta desde la raíz del repo: `pnpm check:guards`.
set -u
cd "$(dirname "$0")/.."

fail=0

# check_absent <descripción> <opciones de grep...>
# Falla si grep encuentra algo en src/ (tests incluidos).
check_absent() {
  local label="$1"
  shift
  local found
  found="$(grep "$@" src/ || true)"
  if [ -n "$found" ]; then
    echo "FALLO: $label"
    echo "$found"
    echo
    fail=1
  fi
}

# Regla 3: nada de un club escrito en src/. Alternancia explícita (no [aá]) para
# que funcione igual con cualquier locale.
check_absent "src/ menciona a un club (Arcángel / c9a45c)" \
  -rniE 'arc(a|á|Á)ngel|c9a45c'

# Regla 2: la clave de servicio nunca entra en src/.
check_absent "src/ menciona SERVICE_ROLE" -rn 'SERVICE_ROLE'

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
