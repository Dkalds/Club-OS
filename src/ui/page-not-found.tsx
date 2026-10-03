import Link from "next/link";

/**
 * El contenido del 404, el mismo en toda la app.
 *
 * Es deliberadamente opaco: no dice si la página no existe o si no tienes acceso, y no
 * recibe ningún dato (ni club, ni ruta), para que no pueda mostrar nada de un club ajeno.
 * No lleva `<main>`: lo pone quien lo pinta (el 404 de la app o el marco del club).
 */
export function PageNotFound() {
  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4)">
      <h1 className="font-display text-display-l uppercase">No encontramos esta página</h1>
      <Link
        href="/select-club"
        className="flex min-h-(--target-min) w-full items-center justify-center rounded-md bg-brand-accent px-(--space-5) font-display text-body-l font-bold uppercase tracking-[0.04em] text-brand-on-accent active:bg-brand-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Volver a tus clubes
      </Link>
    </div>
  );
}
