/** Borra del dispositivo todo lo que Live guarda: claves `clubos:*` de localStorage
 * y cachés `clubos-*` de Cache Storage. Se llama al cerrar sesión. */
export async function clearLiveData(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("clubos:")) localStorage.removeItem(key);
    }
  } catch {
    // localStorage no disponible
  }
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("clubos-")).map((n) => caches.delete(n)),
    );
  } catch {
    // Cache Storage no disponible
  }
}
