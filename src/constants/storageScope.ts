/**
 * Note Summary e PWA Note Personali vivono su origini diverse in locale,
 * ma su GitHub Pages condividono la stessa origine (carlo2424.github.io).
 * Token GitHub condiviso; tutto il resto (DB, gist id, snapshot) è scoped.
 */
export const SHARED_GITHUB_TOKEN_KEY = 'pwa-cloud-gist-token'

export function appStorageKey(suffix: string): string {
  return `note-summary:${suffix}`
}