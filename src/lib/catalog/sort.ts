import type { CatalogRecord } from './schema';
import { calculateStatus, type StatusCode } from './status';

const priority: Record<StatusCode, number> = {
  'access-closes-soon': 0,
  'applications-open': 1,
  'registration-open': 2,
  'on-demand-access-open': 3,
  'ongoing-event': 4,
  'starts-today': 5,
  'upcoming-event': 6,
  'applications-closed-event-upcoming': 7,
  'registration-closed-event-upcoming': 8,
  'recurring-series': 9,
  'next-date-tba': 10,
  'not-currently-running': 11,
  'date-status-unknown': 12,
  'past-event': 13,
  'archived-resource': 14,
  cancelled: 15,
  postponed: 16,
};

export function sortRecords(records: CatalogRecord[], now = new Date()) {
  return [...records].sort((a, b) => {
    const aStatus = calculateStatus(a, now);
    const bStatus = calculateStatus(b, now);
    return (
      priority[aStatus.primary] - priority[bStatus.primary] ||
      (aStatus.next_action_at || '9999').localeCompare(bStatus.next_action_at || '9999') ||
      a.content.title_original.localeCompare(b.content.title_original)
    );
  });
}
