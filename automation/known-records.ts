import { createHash } from 'node:crypto';
import { extractJsonLd } from './html-extract';
import { eventsFromJsonLd } from './structured-data';
import { proposalSchema, type CatalogRecord } from '../src/lib/catalog/schema';

function sameValue(left: string | null, right: string | null) {
  if (left === null || right === null) return left === right;
  const leftDate = Date.parse(left);
  const rightDate = Date.parse(right);
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate === rightDate;
  return (
    left.trim().replace(/\s+/g, ' ').toLowerCase() ===
    right.trim().replace(/\s+/g, ' ').toLowerCase()
  );
}

function evidence(label: string, value: string) {
  return `${label} on the official source: ${value}`.slice(0, 240);
}

export function knownRecordChangeProposal(
  record: CatalogRecord,
  body: string,
  checkedAt: string,
  previousHash: string,
  currentHash: string,
) {
  const event = eventsFromJsonLd(extractJsonLd(body))[0];
  const changes: Array<{
    field: string;
    old_value: unknown;
    proposed_value: unknown;
    evidence: string;
    confidence: 'medium' | 'high';
    review_required: true;
  }> = [];

  if (event?.name && !sameValue(record.content.title_original, event.name))
    changes.push({
      field: 'content.title_original',
      old_value: record.content.title_original,
      proposed_value: event.name,
      evidence: evidence('JSON-LD title', event.name),
      confidence: 'medium',
      review_required: true,
    });

  for (const [field, oldValue, proposedValue] of [
    ['dates.event.start', record.dates.event.start, event?.start ?? null],
    ['dates.event.end', record.dates.event.end, event?.end ?? null],
  ] as const)
    if (
      proposedValue &&
      !Number.isNaN(Date.parse(proposedValue)) &&
      !sameValue(oldValue, proposedValue)
    )
      changes.push({
        field,
        old_value: oldValue,
        proposed_value: proposedValue,
        evidence: evidence(
          `JSON-LD ${field.endsWith('start') ? 'start date' : 'end date'}`,
          proposedValue,
        ),
        confidence: 'high',
        review_required: true,
      });

  if (!changes.length)
    changes.push({
      field: 'sources.official_url.content_hash',
      old_value: previousHash,
      proposed_value: currentHash,
      evidence:
        'The normalized official page content changed; review dates, registration, availability and title.',
      confidence: 'medium',
      review_required: true,
    });

  const suffix = createHash('sha256').update(currentHash).digest('hex').slice(0, 16);
  return proposalSchema.parse({
    proposal_id: `record-change-${record.id}-${suffix}`,
    record_id: record.id,
    checked_at: checkedAt,
    source_url: record.sources.official_url,
    source_kind: 'official-record-page',
    changes,
  });
}
