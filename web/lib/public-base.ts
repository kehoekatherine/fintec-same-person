/** True for the GitHub Pages export. A local `next dev` / `next start` leaves this unset. */
export function staticDesk(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_DESK === "1";
}

/** Prefix for files in `public/`. `fetch` does not apply Next's `basePath` on its own. */
export function publicUrl(pathname: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${suffix}`;
}

export function developmentUrl(): string {
  return staticDesk() ? publicUrl("/demo/development.json") : "/api/development";
}
