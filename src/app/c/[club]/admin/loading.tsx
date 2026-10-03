import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega una página de Gestión: el esqueleto, dentro de su marco
 * (el `<main>` lo pone `AdminShell`). Next lo pinta en cuanto el layout ha comprobado que
 * quien entra administra, así que quien no administra sigue recibiendo el 404.
 */
export default function AdminLoading() {
  return <LoadingState />;
}
