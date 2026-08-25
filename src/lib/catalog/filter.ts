import type { CatalogRecord } from './schema';
import type { StatusCode } from './status';

export interface CatalogFilters {
  query?: string;
  resourceType?: string;
  provider?: string;
  delivery?: string;
  language?: string;
  cost?: string;
  certificate?: string;
  status?: string;
}

export function matchesFilters(record: CatalogRecord, status: StatusCode, filters: CatalogFilters) {
  const query = filters.query?.trim().toLocaleLowerCase();
  if (query) {
    const haystack = [
      record.content.title_original,
      record.provider.name,
      record.content.summary_original,
      ...record.classification.topics,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filters.resourceType && record.classification.resource_type !== filters.resourceType)
    return false;
  if (filters.provider && record.provider.name !== filters.provider) return false;
  if (filters.delivery && !record.classification.delivery_modes.includes(filters.delivery as any))
    return false;
  if (filters.language && !record.classification.languages.includes(filters.language)) return false;
  if (filters.cost && record.commercial.cost_kind !== filters.cost) return false;
  if (filters.certificate && record.classification.certificate_kind !== filters.certificate)
    return false;
  if (filters.status && status !== filters.status) return false;
  return true;
}
