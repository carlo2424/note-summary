import { useEffect, useSyncExternalStore } from 'react'
import {
  getGoogleCalendarSnapshot,
  refreshGoogleCalendar,
  subscribeGoogleCalendar,
} from '../utils/googleCalendar'

/** Eventi Google in cache. Se `active`, aggiorna quando c’è già un token. */
export function useGoogleCalendar(active: boolean) {
  const snapshot = useSyncExternalStore(
    subscribeGoogleCalendar,
    getGoogleCalendarSnapshot,
    getGoogleCalendarSnapshot,
  )

  useEffect(() => {
    if (!active) return
    void refreshGoogleCalendar()
  }, [active])

  return snapshot
}
