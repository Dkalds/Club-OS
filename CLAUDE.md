# CLUB OS

Plataforma SaaS multi-club para clubes de baloncesto de formación. CB Arcángel es el primer club piloto, no el producto.

## Dónde está cada cosa

- Especificación aprobada: `docs/spec/club-os-primera-entrega.md`
- Plan de la fase en curso: `docs/superpowers/plans/`
- Design system (fuente de verdad visual): `design/tokens.json`, `design/README.md` y `design/components/<Comp>/` (vista previa HTML + reglas de uso). Los componentes de `src/ui/` se reconstruyen a partir de esas vistas previas; no se importan.

## Reglas que no se negocian

1. **Aislamiento entre clubes.** Toda tabla de club lleva `organization_id NOT NULL`, RLS activado y claves foráneas compuestas `(organization_id, x_id)`. Sin política no hay acceso. Cada tabla nueva llega con sus tests pgTAP de aislamiento por club y por equipo.
2. **La clave de servicio nunca entra en `src/`.** Solo en `scripts/` y `e2e/`. La app usa siempre la sesión del usuario.
3. **Nada de un club escrito en el código.** Ni "Arcángel", ni "The Arcángel Way", ni sus colores, categorías o equipos en `src/`. Todo sale de la base de datos (`organization_branding`, terminología). `pnpm check:guards` lo comprueba.
4. **Colores, espacios y radios solo con tokens.** Nada de hex en componentes; los tokens se generan desde `design/tokens.json` con `pnpm tokens`.
5. **Menores.** Solo año de nacimiento, nunca fecha completa. Sin fotos sin consentimiento registrado. URLs con slug de club o uuid, nunca nombres de personas. Datos de ejemplo siempre ficticios.
6. **Acceso solo por invitación.** `signInWithOtp` con `shouldCreateUser: false`; la respuesta es la misma exista o no el email.
7. **Horas.** `timestamptz` en BD; se muestran siempre en `organizations.timezone`, nunca en la zona del dispositivo.
8. **Regla qué/por qué.** Todo lo que se muestra (sesión, ejercicio, objetivo) enseña el Standard o principio que trabaja, cuando existe.

## Interfaz

- Español, tuteando, frases cortas, sin exclamaciones ni emoji.
- Formatos: «Martes 6 oct», «18:00–19:15» (raya corta), «75 min».
- Mobile-first: viewport de referencia 375×812; áreas táctiles de 44px como mínimo.

## Comandos

- `pnpm dev`: app en local (requiere `pnpm supabase start`)
- `pnpm test`: Vitest (unidad y componentes)
- `pnpm test:db`: tests pgTAP de RLS (`supabase test db`)
- `pnpm test:int`: integración contra Supabase local (seed). Los tests que necesitan la clave de servicio viven en `scripts/`, nunca en `src/`
- `pnpm test:e2e`: Playwright en viewport móvil
- `pnpm seed`: datos de ejemplo (Arcángel + Club Demo); se niega a correr contra un Supabase remoto salvo `ALLOW_REMOTE_SEED=true`
- `pnpm tokens`: regenera `src/ui/tokens.css` desde `design/tokens.json`
- `pnpm db:types`: regenera `src/lib/database.types.ts`
- `pnpm check:guards`: reglas 2, 3 y 4 (ni colores hex ni medidas entre corchetes en componentes), páginas de Gestión exportadas con `adminPage` y tokens sincronizados

## Forma de trabajar

- TDD: test que falla, código mínimo, test en verde, commit.
- Una fase no se cierra con errores conocidos. Al terminar cada fase: arrancar el proyecto, revisar errores de consola, probar en móvil, comprobar permisos y aislamiento entre clubes, y corregir regresiones.
