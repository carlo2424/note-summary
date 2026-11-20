import { SHARED_GITHUB_TOKEN_KEY, appStorageKey } from '../constants/storageScope'

/**
 * Copia unificata delle credenziali (GitHub + Google) in IDB + OPFS.
 * Su mobile alcuni browser svuotano localStorage ma lasciano IndexedDB/OPFS.
 */

const VAULT_IDB = 'note-summary-auth-vault'
const VAULT_IDB_VER = 1
const VAULT_IDB_KEY = 'bundle'
const VAULT_OPFS = 'note-summary-auth-vault.json'

const GIST_ID_KEY = appStorageKey('cloud-gist-id')
const G_CLIENT_ID = appStorageKey('google-calendar-client-id')
const G_TOKEN = appStorageKey('google-calendar-token')
const G_CONNECTED = appStorageKey('google-calendar-connected')

export type VaultGoogleToken = { accessToken: string; expiresAt: number }

export type AuthVaultBundle = {
  github?: { token: string; gistId: string | null }
  google?: {
    clientId: string
    token: VaultGoogleToken | null
    connected: boolean
  }
  savedAt: number
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignora
  }
}

function readBundleFromLocalStorage(): AuthVaultBundle {
  const token = lsGet(SHARED_GITHUB_TOKEN_KEY)?.trim() ?? ''
  const gistId = lsGet(GIST_ID_KEY)
  const clientId = lsGet(G_CLIENT_ID)?.trim() ?? ''
  const connected = lsGet(G_CONNECTED) === '1'
  let googleToken: VaultGoogleToken | null = null
  const rawG = lsGet(G_TOKEN)
  if (rawG) {
    try {
      const parsed = JSON.parse(rawG) as VaultGoogleToken
      if (
        typeof parsed.accessToken === 'string' &&
        typeof parsed.expiresAt === 'number'
      ) {
        googleToken = parsed
      }
    } catch {
      // ignora
    }
  }

  return {
    savedAt: Date.now(),
    ...(token ? { github: { token, gistId } } : {}),
    ...(clientId || connected || googleToken
      ? {
          google: {
            clientId,
            token: googleToken,
            connected,
          },
        }
      : {}),
  }
}

function supportsOpfs(): boolean {
  return typeof navigator.storage?.getDirectory === 'function'
}

async function opfsRead(): Promise<string | null> {
  if (!supportsOpfs()) return null
  try {
    const root = await navigator.storage.getDirectory()
    const fh = await root.getFileHandle(VAULT_OPFS)
    return await (await fh.getFile()).text()
  } catch {
    return null
  }
}

async function opfsWrite(payload: string): Promise<void> {
  if (!supportsOpfs()) return
  const root = await navigator.storage.getDirectory()
  const fh = await root.getFileHandle(VAULT_OPFS, { create: true })
  const w = await fh.createWritable()
  await w.write(payload)
  await w.close()
}

function openVaultIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_IDB, VAULT_IDB_VER)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('vault')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbRead(): Promise<AuthVaultBundle | null> {
  try {
    const db = await openVaultIdb()
    const value = await new Promise<AuthVaultBundle | null>((resolve, reject) => {
      const tx = db.transaction('vault', 'readonly')
      const req = tx.objectStore('vault').get(VAULT_IDB_KEY)
      req.onsuccess = () =>
        resolve((req.result as AuthVaultBundle | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return value
  } catch {
    return null
  }
}

async function idbWrite(bundle: AuthVaultBundle): Promise<void> {
  const db = await openVaultIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('vault', 'readwrite')
    tx.objectStore('vault').put(bundle, VAULT_IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

function parseBundle(raw: string | null): AuthVaultBundle | null {
  if (!raw) return null
  try {
    const b = JSON.parse(raw) as AuthVaultBundle
    if (!b || typeof b !== 'object') return null
    return b
  } catch {
    return null
  }
}

async function loadVaultBundle(): Promise<AuthVaultBundle | null> {
  const fromIdb = await idbRead()
  if (fromIdb?.github?.token || fromIdb?.google?.connected) return fromIdb
  return parseBundle(await opfsRead())
}

function applyVaultToLocalStorage(bundle: AuthVaultBundle): boolean {
  let touched = false
  if (bundle.github?.token?.trim()) {
    if (!lsGet(SHARED_GITHUB_TOKEN_KEY)) {
      lsSet(SHARED_GITHUB_TOKEN_KEY, bundle.github.token.trim())
      touched = true
    }
    if (bundle.github.gistId && !lsGet(GIST_ID_KEY)) {
      lsSet(GIST_ID_KEY, bundle.github.gistId)
      touched = true
    }
  }
  const g = bundle.google
  if (g) {
    if (g.clientId?.trim() && !lsGet(G_CLIENT_ID)) {
      lsSet(G_CLIENT_ID, g.clientId.trim())
      touched = true
    }
    if (g.connected && lsGet(G_CONNECTED) !== '1') {
      lsSet(G_CONNECTED, '1')
      touched = true
    }
    if (g.token && !lsGet(G_TOKEN)) {
      lsSet(G_TOKEN, JSON.stringify(g.token))
      touched = true
    }
  }
  return touched
}

/** Se localStorage è vuoto, ripristina da vault unificato (IDB → OPFS). */
export async function restoreAuthVaultToLocalStorage(): Promise<boolean> {
  const needGithub = !lsGet(SHARED_GITHUB_TOKEN_KEY)?.trim()
  const needGoogle =
    lsGet(G_CONNECTED) !== '1' &&
    !lsGet(G_TOKEN) &&
    !lsGet(G_CLIENT_ID)?.trim()
  if (!needGithub && !needGoogle) return false

  const bundle = await loadVaultBundle()
  if (!bundle) return false
  return applyVaultToLocalStorage(bundle)
}

/** Salva stato corrente nel vault (best-effort, senza log di segreti). */
export async function snapshotLocalAuthToVault(): Promise<void> {
  const bundle = readBundleFromLocalStorage()
  if (!bundle.github?.token && !bundle.google?.connected && !bundle.google?.token) {
    return
  }
  const payload = JSON.stringify(bundle)
  try {
    await opfsWrite(payload)
  } catch {
    // ignora
  }
  try {
    await idbWrite(bundle)
  } catch {
    // ignora
  }
}