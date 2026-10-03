import { redirect } from "next/navigation";

// La raíz no tiene contenido propio: el selector decide a qué club va cada persona
// (y el proxy manda a /login a quien no tiene sesión).
export default function RootPage() {
  redirect("/select-club");
}
