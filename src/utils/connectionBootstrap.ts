import { ensureCloudCredentials } from './cloudBackup'
import {
  hydrateGoogleCalendarCredentials,
  refreshGoogleCalendar,
} from './googleCalendar'

/**
 * Ripristina token GitHub e sessione calendario da copie ridondanti
 * (localStorage → OPFS → IndexedDB) prima che l'UI chieda le credenziali.
 */
export async function restorePersistedConnections(): Promise<void> {
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
}

/** Dopo l'idratazione: aggiorna eventi Google con token salvato o rinnovo silenzioso. */
export function resumeGoogleCalendarConnection(): void {
  void refreshGoogleCalendar()
}