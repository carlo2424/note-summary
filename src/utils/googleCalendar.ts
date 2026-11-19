import { localIsoFromDate } from './calendarMarkers'

/**
 * Calendario Google in sola lettura.
 * Il Client ID OAuth (pubblico) sta in localStorage, come il token GitHub.
 * Il token di accesso non viene scritto nel database degli impegni.
 */

export const GOOGLE_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID_KEY = 'pwa-google-calendar-client-id'
const TOKEN_KEY = 'pwa-google-calendar-token'
const CONNECTED_KEY = 'pwa-google-calendar-connected'
const CACHE_KEY = 'pwa-google-calendar-cache'
const ERROR_KEY = 'pwa-google-calendar-error'
const MAX_RESULTS = 20

export type GoogleCalendarEvent = {
  id: string
  title: string
  /** Giorno locale di inizio, YYYY-MM-DD */
  startDate: string
  /** Ultimo giorno locale incluso, YYYY-MM-DD */
  endDate: string
  /** "09:30" oppure "tutto il giorno" */
  whenLabel: string
  location?: string
  htmlLink?: string
}

export type GoogleCalendarSnapshot = {
  clientId: string
  connected: boolean
  events: GoogleCalendarEvent[]
  error: string | null
  fetchedAt: number | null
  busy: boolean
}

type StoredToken = { accessToken: string; expiresAt: number }

type TokenWaiter = {
  resolve: (token: string) => void
  reject: (error: Error) => void
  timer: number
  prompt: '' | 'consent'
}

const listeners = new Set<() => void>()
let memoryToken: StoredToken | null = null
let snapshot: GoogleCalendarSnapshot = loadInitialSnapshot()
let gisPromise: Promise<void> | null = null
let tokenClient: GoogleTokenClient | null = null
let tokenClientId = ''
let tokenWaiter: TokenWaiter | null = null
let operation: Promise<void> | null = null

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
    // quota o storage non disponibile
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignora
  }
}

export function readStoredClientId(): string {
  return lsGet(CLIENT_ID_KEY)?.trim() ?? ''
}

export function envClientId(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getGoogleClientId(): string {
  return readStoredClientId() || envClientId()
}

function isConnectedFlag(): boolean {
  return lsGet(CONNECTED_KEY) === '1'
}

function readCache(): { fetchedAt: number; events: GoogleCalendarEvent[] } | null {
  const raw = lsGet(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      fetchedAt?: unknown
      events?: unknown
    }
    if (!Array.isArray(parsed.events)) return null
    const events = parsed.events.filter(isGoogleEvent)
    const fetchedAt =
      typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0
    return { fetchedAt, events }
  } catch {
    return null
  }
}

function isGoogleEvent(value: unknown): value is GoogleCalendarEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<GoogleCalendarEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.title === 'string' &&
    typeof event.startDate === 'string' &&
    typeof event.endDate === 'string' &&
    typeof event.whenLabel === 'string'
  )
}

function readStoredToken(): StoredToken | null {
  if (memoryToken) return memoryToken
  const raw = lsGet(TOKEN_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredToken>
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    memoryToken = { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt }
    return memoryToken
  } catch {
    return null
  }
}

function readValidToken(): string | null {
  const stored = readStoredToken()
  if (!stored || stored.expiresAt <= Date.now()) return null
  return stored.accessToken
}

function loadInitialSnapshot(): GoogleCalendarSnapshot {
  const cache = readCache()
  const error = lsGet(ERROR_KEY)?.trim() || null
  return {
    clientId: getGoogleClientId(),
    connected: isConnectedFlag(),
    events: cache?.events ?? [],
    error,
    fetchedAt: cache?.fetchedAt || null,
    busy: false,
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function update(patch: Partial<GoogleCalendarSnapshot>) {
  const next: GoogleCalendarSnapshot = { ...snapshot, ...patch }
  if (
    next.clientId === snapshot.clientId &&
    next.connected === snapshot.connected &&
    next.events === snapshot.events &&
    next.error === snapshot.error &&
    next.fetchedAt === snapshot.fetchedAt &&
    next.busy === snapshot.busy
  ) {
    return
  }
  snapshot = next
  emit()
}

export function subscribeGoogleCalendar(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getGoogleCalendarSnapshot(): GoogleCalendarSnapshot {
  return snapshot
}

export function setStoredClientId(value: string) {
  const trimmed = value.trim()
  if (trimmed) lsSet(CLIENT_ID_KEY, trimmed)
  else lsRemove(CLIENT_ID_KEY)
  if (tokenClientId && tokenClientId !== getGoogleClientId()) {
    tokenClient = null
    tokenClientId = ''
  }
  update({ clientId: getGoogleClientId() })
}

function persistError(message: string | null) {
  if (message) lsSet(ERROR_KEY, message)
  else lsRemove(ERROR_KEY)
}

function writeCache(events: GoogleCalendarEvent[]): number {
  const fetchedAt = Date.now()
  lsSet(CACHE_KEY, JSON.stringify({ fetchedAt, events }))
  return fetchedAt
}

function saveToken(accessToken: string, expiresInSec: number) {
  const expiresAt = Date.now() + Math.max(30, expiresInSec - 60) * 1000
  memoryToken = { accessToken, expiresAt }
  lsSet(TOKEN_KEY, JSON.stringify(memoryToken))
  lsSet(CONNECTED_KEY, '1')
}

function clearToken() {
  memoryToken = null
  lsRemove(TOKEN_KEY)
}

function isValidClientId(id: string): boolean {
  return /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(id)
}

function missingClientIdMessage(): string {
  return 'Incolla il Client ID OAuth prima di collegare il calendario.'
}

function invalidClientIdMessage(): string {
  return 'Il Client ID non è valido. Crea un client OAuth di tipo «Applicazione web» e incolla l’ID che termina con .apps.googleusercontent.com.'
}

function mapOAuthError(error: string, description?: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  switch (error) {
    case 'popup_failed_to_open':
    case 'popup_blocked':
      return 'Il browser ha bloccato la finestra di Google. Consenti i popup per questo sito e riprova.'
    case 'popup_closed':
      return 'Accesso annullato: la finestra di Google è stata chiusa.'
    case 'access_denied':
      return 'Accesso al calendario negato.'
    case 'interaction_required':
    case 'login_required':
    case 'consent_required':
      return 'Google chiede un nuovo consenso. Usa «Collega calendario».'
    case 'unauthorized_client':
    case 'origin_mismatch':
      return origin
        ? `Google ha rifiutato questo sito. Aggiungi ${origin} tra le origini JavaScript autorizzate del client OAuth.`
        : 'Google ha rifiutato questo sito. Aggiungi l’origine tra le origini JavaScript autorizzate del client OAuth.'
    case 'invalid_client':
      return 'Client ID non riconosciuto da Google. Controlla di aver incollato il client OAuth «Applicazione web».'
    default:
      return description?.trim() || 'Collegamento a Google non riuscito.'
  }
}

function messageFrom(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Collegamento a Google non riuscito.'
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise

  gisPromise = new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    const fail = () => {
      gisPromise = null
      finish(() =>
        reject(
          new Error(
            'Impossibile caricare il servizio di accesso Google. Controlla la connessione e riprova.',
          ),
        ),
      )
    }
    const succeed = () => finish(() => resolve())
    const watchReady = () => {
      if (window.google?.accounts?.oauth2) {
        succeed()
        return
      }
      const started = Date.now()
      const timer = window.setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          window.clearInterval(timer)
          succeed()
        } else if (Date.now() - started > 8000) {
          window.clearInterval(timer)
          fail()
        }
      }, 50)
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-gis="1"]',
    )
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        succeed()
        return
      }
      existing.addEventListener('load', watchReady, { once: true })
      existing.addEventListener('error', fail, { once: true })
      watchReady()
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.dataset.googleGis = '1'
    script.onload = () => watchReady()
    script.onerror = () => fail()
    document.head.appendChild(script)
  })

  return gisPromise
}

function settleTokenWaiter() {
  const current = tokenWaiter
  tokenWaiter = null
  if (!current) return null
  window.clearTimeout(current.timer)
  return current
}

function handleTokenResponse(response: GoogleTokenResponse) {
  if (!response.error && response.access_token) {
    saveToken(response.access_token, Number(response.expires_in) || 3600)
  }
  const current = settleTokenWaiter()
  if (!current) return
  if (response.error || !response.access_token) {
    current.reject(
      new Error(
        mapOAuthError(response.error || 'unknown', response.error_description),
      ),
    )
    return
  }
  current.resolve(response.access_token)
}

function handleTokenError(error: { type: string; message?: string }) {
  const current = settleTokenWaiter()
  if (!current) return
  const blocked =
    error.type === 'popup_failed_to_open' || error.type === 'popup_blocked'
  if (current.prompt === '' && blocked) {
    current.reject(
      new Error(
        'Sessione Google scaduta. Usa «Collega calendario» per autorizzare di nuovo.',
      ),
    )
    return
  }
  current.reject(new Error(mapOAuthError(error.type, error.message)))
}

function ensureClient(clientId: string): GoogleTokenClient {
  const oauth = window.google?.accounts?.oauth2
  if (!oauth) {
    throw new Error(
      'Google Identity Services non è disponibile. Ricarica la pagina e riprova.',
    )
  }
  if (tokenClient && tokenClientId === clientId) return tokenClient
  tokenClientId = clientId
  tokenClient = oauth.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_CALENDAR_SCOPE,
    callback: handleTokenResponse,
    error_callback: handleTokenError,
  })
  return tokenClient
}

function requestAccessToken(prompt: '' | 'consent'): Promise<string> {
  const clientId = getGoogleClientId()
  if (!clientId) return Promise.reject(new Error(missingClientIdMessage()))
  if (!isValidClientId(clientId)) {
    return Promise.reject(new Error(invalidClientIdMessage()))
  }

  return loadGisScript().then(
    () =>
      new Promise<string>((resolve, reject) => {
        if (tokenWaiter) {
          reject(new Error('Accesso Google già in corso.'))
          return
        }
        const timer = window.setTimeout(() => {
          const current = settleTokenWaiter()
          if (!current) return
          current.reject(
            new Error(
              current.prompt === 'consent'
                ? 'Tempo scaduto in attesa di Google. Se il popup è stato bloccato, consenti i popup e riprova.'
                : 'Sessione Google scaduta. Usa «Collega calendario» per autorizzare di nuovo.',
            ),
          )
        }, prompt === 'consent' ? 120_000 : 20_000)
        tokenWaiter = { resolve, reject, timer, prompt }
        try {
          ensureClient(clientId).requestAccessToken({ prompt })
        } catch (err) {
          const current = settleTokenWaiter()
          current?.reject(
            err instanceof Error
              ? err
              : new Error('Collegamento a Google non riuscito.'),
          )
        }
      }),
  )
}

type ApiEvent = {
  id?: string
  summary?: string
  location?: string
  htmlLink?: string
  status?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return localIsoFromDate(date)
}

function mapApiEvent(item: ApiEvent): GoogleCalendarEvent | null {
  if (!item.id || item.status === 'cancelled' || !item.start) return null

  let startDate = ''
  let endDate = ''
  let whenLabel = ''

  if (item.start.date) {
    startDate = item.start.date
    endDate = item.end?.date ? shiftIso(item.end.date, -1) : startDate
    if (endDate < startDate) endDate = startDate
    whenLabel = 'tutto il giorno'
  } else if (item.start.dateTime) {
    const start = new Date(item.start.dateTime)
    if (Number.isNaN(start.getTime())) return null
    startDate = localIsoFromDate(start)
    whenLabel = start.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    })
    endDate = startDate
    if (item.end?.dateTime) {
      const end = new Date(item.end.dateTime)
      if (!Number.isNaN(end.getTime())) {
        let inclusiveEnd = localIsoFromDate(end)
        const endsAtMidnight =
          end.getHours() === 0 &&
          end.getMinutes() === 0 &&
          end.getSeconds() === 0
        if (endsAtMidnight && inclusiveEnd > startDate) {
          inclusiveEnd = shiftIso(inclusiveEnd, -1)
        }
        endDate = inclusiveEnd < startDate ? startDate : inclusiveEnd
      }
    }
  } else {
    return null
  }

  return {
    id: item.id,
    title: item.summary?.trim() || '(Senza titolo)',
    startDate,
    endDate,
    whenLabel,
    location: item.location?.trim() || undefined,
    htmlLink: item.htmlLink || undefined,
  }
}

async function fetchPrimaryEvents(accessToken: string): Promise<GoogleCalendarEvent[]> {
  const timeMin = new Date()
  timeMin.setHours(0, 0, 0, 0)
  const url = new URL(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  )
  url.searchParams.set('timeMin', timeMin.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', String(MAX_RESULTS))

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new Error(
      snapshot.events.length > 0
        ? 'Sei offline: mostro gli ultimi eventi salvati dal calendario Google.'
        : 'Connessione assente: non riesco a leggere il calendario Google.',
    )
  }

  if (!response.ok) {
    let detail = ''
    let reason = ''
    try {
      const body = (await response.json()) as {
        error?: {
          message?: string
          status?: string
          errors?: { reason?: string; message?: string }[]
        }
      }
      detail = body.error?.message?.trim() ?? ''
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? ''
    } catch {
      detail = ''
    }
    const err = new Error(apiErrorMessage(response.status, detail, reason))
    ;(err as Error & { status?: number }).status = response.status
    throw err
  }

  const body = (await response.json()) as { items?: ApiEvent[] }
  return (body.items ?? [])
    .map(mapApiEvent)
    .filter((event): event is GoogleCalendarEvent => event !== null)
}

function apiErrorMessage(status: number, detail: string, reason: string): string {
  const lowered = `${detail} ${reason}`.toLowerCase()
  if (
    status === 403 &&
    (lowered.includes('accessnotconfigured') ||
      lowered.includes('has not been used') ||
      lowered.includes('is disabled') ||
      lowered.includes('service_disabled'))
  ) {
    return 'L’API Google Calendar non è attiva su questo progetto. Abilitala nella console Google Cloud e riprova.'
  }
  if (status === 401) {
    return 'Accesso Google scaduto o non valido. Usa «Collega calendario».'
  }
  if (status === 403) {
    return 'Accesso al calendario negato. Controlla che l’API Google Calendar sia attiva e, se l’app è in fase di test, che il tuo account sia un utente di test.'
  }
  return `Impossibile leggere il calendario Google (${status}).`
}

function errorStatus(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status?: number }).status
    if (typeof status === 'number') return status
  }
  return undefined
}

async function loadEventsWithToken(accessToken: string, allowRetry: boolean) {
  try {
    return await fetchPrimaryEvents(accessToken)
  } catch (err) {
    if (allowRetry && errorStatus(err) === 401) {
      clearToken()
      const next = await requestAccessToken('')
      return fetchPrimaryEvents(next)
    }
    throw err
  }
}

async function storeFetchedEvents(events: GoogleCalendarEvent[]) {
  const fetchedAt = writeCache(events)
  persistError(null)
  update({
    connected: true,
    events,
    fetchedAt,
    error: null,
    clientId: getGoogleClientId(),
  })
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = (operation ?? Promise.resolve())
    .then(() => undefined, () => undefined)
    .then(task)
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  operation = settled
  void settled.finally(() => {
    if (operation === settled) operation = null
  })
  return run
}

export function refreshGoogleCalendar(): Promise<void> {
  if (operation) return operation
  return enqueue(async () => {
    const clientId = getGoogleClientId()
    if (!clientId) {
      if (isConnectedFlag()) {
        const message = missingClientIdMessage()
        persistError(message)
        update({ error: message, clientId: '' })
      }
      return
    }
    if (!isConnectedFlag() && !readValidToken()) return

    try {
      let token = readValidToken()
      if (!token) token = await requestAccessToken('')
      const events = await loadEventsWithToken(token, true)
      await storeFetchedEvents(events)
    } catch (err) {
      const message = messageFrom(err)
      persistError(message)
      update({ error: message, connected: isConnectedFlag() })
    }
  })
}

export async function connectGoogleCalendar(clientIdInput: string): Promise<void> {
  setStoredClientId(clientIdInput)
  const clientId = getGoogleClientId()
  if (!clientId) {
    const message = missingClientIdMessage()
    persistError(message)
    update({ error: message, busy: false })
    throw new Error(message)
  }
  if (!isValidClientId(clientId)) {
    const message = invalidClientIdMessage()
    persistError(message)
    update({ error: message, busy: false })
    throw new Error(message)
  }

  update({ busy: true, error: null })
  try {
    await enqueue(async () => {
      const token = await requestAccessToken('consent')
      const events = await loadEventsWithToken(token, false)
      await storeFetchedEvents(events)
    })
  } catch (err) {
    const message = messageFrom(err)
    persistError(message)
    update({ error: message, connected: isConnectedFlag() })
    throw new Error(message)
  } finally {
    update({ busy: false })
  }
}

export function disconnectGoogleCalendar() {
  const token = readStoredToken()?.accessToken
  const revoke = window.google?.accounts?.oauth2?.revoke
  if (token && revoke) {
    try {
      revoke(token, () => {})
    } catch {
      // lo scollegamento locale resta valido anche se la revoca fallisce
    }
  }
  clearToken()
  lsRemove(CONNECTED_KEY)
  lsRemove(CACHE_KEY)
  lsRemove(ERROR_KEY)
  tokenClient = null
  tokenClientId = ''
  update({
    connected: false,
    events: [],
    error: null,
    fetchedAt: null,
    busy: false,
    clientId: getGoogleClientId(),
  })
}
