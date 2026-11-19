import type { Note } from '../db'

export type SummaryBucket = 'note' | 'trading' | 'crypto'

export function noteSummaryBucket(note: Note): SummaryBucket {
  if (note.summaryCategory === 'trading' || note.summaryCategory === 'crypto') {
    return note.summaryCategory
  }
  return 'note'
}