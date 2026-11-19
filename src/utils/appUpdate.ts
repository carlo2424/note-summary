import {
  canUseServiceWorker,
  isServiceWorkerBlocked,
  shouldSkipServiceWorkerRegistration,
} from './appRecovery'

import {
  appStorageKey,
  readSharedGitHubToken,
  writeSharedGitHubToken,
} from '../constants/storageScope'
import { hydrateCloudCredentials } from './cloudBackup'

const BUILD_KEY = appStorageKey('app-build')
const LEGACY_BUILD_KEY = 'pwa-app-build'

/** Incrementa quando cambiano menu/layout shell: forza una pulizia cache PWA. */
export const APP_SHELL_REVISION = 'nav-summary-v3'
const SHELL_REVISION_KEY = appStorageKey('shell-revision')

function appScopePath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function serviceWorkerBelongsToThisApp(
  reg: ServiceWorkerRegistration,
): boolean {
  const base = appScopePath()
  if (base === '/') return true
  const needle = base.replace(/^\//, '').replace(/\/$/, '')
  return reg.scope.includes(`/${needle}`)
}

function cacheBelongsToThisApp(cacheName: string): boolean {
  const base = appScopePath()
  if (base === '/') return true
  const needle = base.replace(/^\//, '').replace(/\/$/, '')
  return (
    cacheName.includes(needle) ||
    cacheName.includes('note-summary-google-fonts')
  )
}

export function appBuildId(): string {
  return import.meta.env.VITE_APP_BUILD ?? 'dev'
}

export function appBuildLabel(): string {
  const id = appBuildId()
  return id.length > 7 ? id.slice(0, 7) : id
}

function versionJsonUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}version.json`.replace(/([^:]\/)\/+/g, '$1')
}

/** Build pubblicata su GitHub Pages (non dalla cache del bundle locale). */
export async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${versionJsonUrl()}?_${Date.now()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { build?: string }
    return typeof data.build === 'string' && data.build.length > 0
      ? data.build
      : null
  } catch {
    return null
  }
}

export function isUpdateAvailable(remoteBuild: string | null): boolean {
  if (!remoteBuild) return false
  return remoteBuild !== appBuildId()
}

/** Dopo svuotamento cache PWA: token GitHub condiviso + copie ridondanti. */
async function restoreSharedGitHubTokenAfterCachePurge(): Promise<void> {
  const token = readSharedGitHubToken()
  if (token) writeSharedGitHubToken(token)
  await hydrateCloudCredentials()
}

async function purgeAppShellCache(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        regs
          .filter(serviceWorkerBelongsToThisApp)
          .map((r) => r.unregister()),
      )
    } catch {
      // ignora
    }
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(cacheBelongsToThisApp)
          .map((k) => caches.delete(k)),
      )
    } catch {
      // ignora
    }
  }
}

function reloadWithCacheBust(): void {
  const url = new URL(window.location.href)
  url.searchParams.set('_refresh', String(Date.now()))
  window.location.replace(url.toString())
}

export function applyAppUpdateReload(): void {
  reloadWithCacheBust()
}

function readStoredBuildId(): string | null {
  return (
    localStorage.getItem(BUILD_KEY) ??
    localStorage.getItem(LEGACY_BUILD_KEY)
  )
}

/** Menu Note Summary (senza tab Spese): svuota cache obsoleta una tantum. */
export async function ensureAppShellRevision(): Promise<'reload' | 'continue'> {
  if (!import.meta.env.PROD) return 'continue'

  const prev = localStorage.getItem(SHELL_REVISION_KEY)
  if (prev === APP_SHELL_REVISION) return 'continue'

  localStorage.setItem(SHELL_REVISION_KEY, APP_SHELL_REVISION)
  await purgeAppShellCache()
  await restoreSharedGitHubTokenAfterCachePurge()
  return prev != null ? 'reload' : 'continue'
}

/** Confronta con version.json online: rileva deploy anche con bundle PWA in cache. */
export async function prepareAppUpdate(): Promise<'reload' | 'continue'> {
  if (!import.meta.env.PROD) return 'continue'

  const embedded = appBuildId()
  const stored = readStoredBuildId()

  const remote = await fetchRemoteBuildId()
  if (!remote) {
    if (stored && stored !== embedded) {
      await purgeAppShellCache()
      await restoreSharedGitHubTokenAfterCachePurge()
      return 'reload'
    }
    if (!stored) localStorage.setItem(BUILD_KEY, embedded)
    return 'continue'
  }

  if (embedded !== remote || (stored && stored !== remote)) {
    localStorage.setItem(BUILD_KEY, remote)
    localStorage.removeItem(LEGACY_BUILD_KEY)
    await purgeAppShellCache()
    await restoreSharedGitHubTokenAfterCachePurge()
    return 'reload'
  }

  if (!stored) localStorage.setItem(BUILD_KEY, remote)
  return 'continue'
}

async function purgeAppCacheAndMaybeReload(reload: boolean): Promise<void> {
  const remote = await fetchRemoteBuildId()
  if (remote) localStorage.setItem(BUILD_KEY, remote)
  else localStorage.removeItem(BUILD_KEY)
  await purgeAppShellCache()
  await restoreSharedGitHubTokenAfterCachePurge()
  if (reload) reloadWithCacheBust()
}

/** Aggiornamento manuale da Impostazioni: cache + reload senza bloccare IndexedDB. */
export async function forceAppUpdateAndReload(): Promise<void> {
  await purgeAppCacheAndMaybeReload(true)
}

/** Pulizia cache PWA (menu/file vecchi). Note, token GitHub e gist restano. */
export async function clearAppShellCacheFromSettings(): Promise<void> {
  await purgeAppCacheAndMaybeReload(true)
}

/** Se online c'è una build più recente del bundle installato, svuota cache e ricarica. */
export async function applyRemoteUpdateIfNeeded(): Promise<boolean> {
  if (!import.meta.env.PROD) return false

  const remote = await fetchRemoteBuildId()
  if (!remote || remote === appBuildId()) return false

  localStorage.setItem(BUILD_KEY, remote)
  await purgeAppShellCache()
  await restoreSharedGitHubTokenAfterCachePurge()
  reloadWithCacheBust()
  return true
}

/** Controlla version.json quando l'app torna in primo piano (e ogni 5 min). */
export function scheduleRemoteBuildChecks(): void {
  if (!import.meta.env.PROD) return

  const check = () => {
    void applyRemoteUpdateIfNeeded()
  }

  check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, 5 * 60 * 1000)
}

function scheduleServiceWorkerUpdateChecks(
  registration: ServiceWorkerRegistration,
): void {
  const check = () => void registration.update()
  check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, 5 * 60 * 1000)
}

export function registerProductionServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (shouldSkipServiceWorkerRegistration()) return
  if (isServiceWorkerBlocked()) return

  void canUseServiceWorker().then((ok) => {
    if (!ok) return
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onRegisteredSW(_swUrl, registration) {
            if (registration) scheduleServiceWorkerUpdateChecks(registration)
          },
          onNeedRefresh() {
            reloadWithCacheBust()
          },
        })
      })
      .catch(() => {})
  })
}
