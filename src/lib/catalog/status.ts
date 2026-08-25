import type { CatalogRecord } from './schema';

export const STATUS_CODES = [
  'starts-today',
  'ongoing-event',
  'upcoming-event',
  'applications-open',
  'applications-closed-event-upcoming',
  'registration-open',
  'registration-closed-event-upcoming',
  'on-demand-access-open',
  'access-closes-soon',
  'recurring-series',
  'next-date-tba',
  'not-currently-running',
  'archived-resource',
  'past-event',
  'cancelled',
  'postponed',
  'date-status-unknown',
] as const;

export type StatusCode = (typeof STATUS_CODES)[number];
export interface StatusResult {
  primary: StatusCode;
  secondary: StatusCode[];
  next_action_at: string | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function partsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
}

function zonedDateOnly(value: string, timeZone: string, endOfDay = false): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  const wanted = {
    year,
    month,
    day,
    hour: endOfDay ? 23 : 0,
    minute: endOfDay ? 59 : 0,
    second: endOfDay ? 59 : 0,
  };
  let instant = new Date(
    Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second),
  );
  for (let i = 0; i < 3; i += 1) {
    const actual = partsInZone(instant, timeZone);
    const wantedUtc = Date.UTC(
      wanted.year,
      wanted.month - 1,
      wanted.day,
      wanted.hour,
      wanted.minute,
      wanted.second,
    );
    const actualUtc = Date.UTC(
      actual.year!,
      actual.month! - 1,
      actual.day!,
      actual.hour!,
      actual.minute!,
      actual.second!,
    );
    instant = new Date(instant.getTime() + wantedUtc - actualUtc);
  }
  return instant;
}

export function instant(value: string | null, timeZone: string, endOfDay = false): Date | null {
  if (!value) return null;
  if (DATE_ONLY.test(value)) return zonedDateOnly(value, timeZone, endOfDay);
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

const active = (opens: Date | null, closes: Date | null, now: Date) =>
  (!opens || now >= opens) && (!closes || now <= closes);
const future = (value: Date | null, now: Date) => Boolean(value && value > now);
const soon = (value: Date | null, now: Date, days = 30) =>
  Boolean(value && value > now && value.getTime() - now.getTime() <= days * 86_400_000);

export function calculateStatus(
  record: CatalogRecord,
  now = new Date(),
  operationalTimeZone = 'Europe/Sofia',
): StatusResult {
  if (record.lifecycle === 'cancelled')
    return { primary: 'cancelled', secondary: [], next_action_at: null };
  if (record.lifecycle === 'postponed')
    return { primary: 'postponed', secondary: [], next_action_at: null };
  if (['archived', 'retired'].includes(record.lifecycle))
    return { primary: 'archived-resource', secondary: [], next_action_at: null };

  const zone = record.dates.event.timezone || operationalTimeZone;
  const eventStart = instant(record.dates.event.start, zone);
  const eventEnd = instant(record.dates.event.end || record.dates.event.start, zone, true);
  const applicationOpen = instant(record.dates.application.opens, zone);
  const applicationClose = instant(record.dates.application.closes, zone, true);
  const registrationOpen = instant(record.dates.registration.opens, zone);
  const registrationClose = instant(record.dates.registration.closes, zone, true);
  const availabilityOpen = instant(record.dates.availability.opens, zone);
  const availabilityClose = instant(record.dates.availability.closes, zone, true);
  const occurrences = record.dates.recurrence.occurrences
    .map((value) => instant(value, zone))
    .filter((value): value is Date => Boolean(value));
  const nextOccurrence =
    occurrences.filter((date) => date > now).sort((a, b) => a.getTime() - b.getTime())[0] || null;

  const candidates = [
    applicationClose,
    registrationClose,
    availabilityClose,
    nextOccurrence,
    eventStart,
    applicationOpen,
    registrationOpen,
  ]
    .filter((date): date is Date => Boolean(date && date > now))
    .sort((a, b) => a.getTime() - b.getTime());
  const next_action_at = candidates[0]?.toISOString() || null;
  const secondary: StatusCode[] = [];

  if (active(availabilityOpen, availabilityClose, now) && (availabilityOpen || availabilityClose)) {
    if (soon(availabilityClose, now, 30))
      return { primary: 'access-closes-soon', secondary, next_action_at };
    secondary.push('on-demand-access-open');
  }
  if (active(applicationOpen, applicationClose, now) && (applicationOpen || applicationClose))
    secondary.push('applications-open');
  else if (applicationClose && eventStart && applicationClose < now && eventStart > now)
    secondary.push('applications-closed-event-upcoming');
  if (active(registrationOpen, registrationClose, now) && (registrationOpen || registrationClose))
    secondary.push('registration-open');
  else if (registrationClose && eventStart && registrationClose < now && eventStart > now)
    secondary.push('registration-closed-event-upcoming');

  if (eventStart && eventEnd && now >= eventStart && now <= eventEnd) {
    const today =
      new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now) ===
      new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(eventStart);
    return { primary: today ? 'starts-today' : 'ongoing-event', secondary, next_action_at };
  }
  if (future(eventStart, now))
    return {
      primary: secondary[0] || 'upcoming-event',
      secondary: secondary.slice(1),
      next_action_at,
    };
  if (eventEnd && eventEnd < now)
    return { primary: secondary[0] || 'past-event', secondary: secondary.slice(1), next_action_at };
  if (record.dates.recurrence.rule || nextOccurrence)
    return { primary: 'recurring-series', secondary, next_action_at };
  if (secondary.length)
    return { primary: secondary[0]!, secondary: secondary.slice(1), next_action_at };
  if (
    record.classification.resource_type === 'programme' ||
    record.classification.resource_type === 'series'
  )
    return { primary: 'next-date-tba', secondary, next_action_at };
  if (record.lifecycle === 'inactive')
    return { primary: 'not-currently-running', secondary, next_action_at };
  return { primary: 'date-status-unknown', secondary, next_action_at };
}
