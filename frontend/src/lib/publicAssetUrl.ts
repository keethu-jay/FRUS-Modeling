/** Vite `base` (e.g. `/` or `/repo/`) + path under `public/` — works on GitHub Project Pages. */
export function publicAssetUrl(pathUnderPublic: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const p = pathUnderPublic.replace(/^\/+/, '')
  return `${base}${p}`
}
