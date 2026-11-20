import { ensureCloudCredentials } from './cloudBackup'
import {
  hydrateGoogleCalendarCredentials,
  refreshGoogleCalendar,
  reloadGoogleCalendarSnapshotFromStorage,
} from './googleCalendar'
import {
  restoreAuthVaultToLocalStorage,
  snapshotLocalAuthToVault,
} from './authVault'

const AUTH_BOOT_TIMEOUT_MS = 12_000
const AUTH_REFRESH_TIMEOUT_MS = 10_000

let authBootPromise: Promise<void> | null = null
let keepaliveInstalled = false

async function raceWithTimeout<T>(
  task: Promise<T>,
  ms: number,
): Promise<T | 'timeout'> {
  return Promise.race([
    task,
    new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), ms)),
  ])
}

async function runAuthBootstrap(): Promise<void> {
  try {
    await restoreAuthVaultToLocalStorage()
  } catch {
    // best-effort
  }
  try {
    await ensureCloudCredentials()
  } catch {
    // best-effort
  }
  try {
    await hydrateGoogleCalendarCredentials()
  } catch {
    // best-effort
  }
  reloadGoogleCalendarSnapshotFromStorage()
  await snapshotLocalAuthToVault()

  const refresh = refreshGoogleCalendar()
  const result = await raceWithTimeout(refresh, AUTH_REFRESH_TIMEOUT_MS)
  if (result === 'timeout') {
  }
  await snapshotLocalAuthToVault()
}

/**
 * Ripristina token GitHub e sessione calendario da vault + copie ridondanti,
 * poi tenta rinnovo silenzioso Google prima dell’UI.
 */
export async function restorePersistedConnections(): Promise<void> {
  await ensureAuthBootstrapped()
}

/** Un’unica promessa condivisa tra main.tsx e Bootstrap. */
export function ensureAuthBootstrapped(): Promise<void> {
  if (!authBootPromise) {
    authBootPromise = raceWithTimeout(
      runAuthBootstrap(),
      AUTH_BOOT_TIMEOUT_MS,
    ).then(() => undefined)
  }
  return authBootPromise
}

/** @deprecated Usa ensureAuthBootstrapped */
export function resumeGoogleCalendarConnection(): void {
  void refreshGoogleCalendar()
}

/** Rinnovo silenzioso periodico e al ritorno in primo piano. */
export function scheduleAuthKeepalive(): void {
  if (keepaliveInstalled || typeof window === 'undefined') return
  keepaliveInstalled = true

  const tick = () => {
    void ensureAuthBootstrapped().then(() => refreshGoogleCalendar())
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })

  window.setInterval(() => {
    if (document.visibilityState === 'visible') tick()
  }, 20 * 60 * 1000)
}