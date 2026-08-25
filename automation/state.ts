import { readFile } from 'node:fs/promises';
import type { FetchResult } from './fetch';

export interface SourceState {
  record_id: string;
  checked_at: string;
  last_successful_at: string | null;
  http_status: number | null;
  final_url: string;
  redirects: string[];
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  robots_allowed: boolean;
  failure_count: number;
  last_proposal_id: string | null;
}

export interface MonitorSourceState {
  record_id: string;
  checked_at: string;
  last_successful_at: string | null;
  http_status: number | null;
  final_url: string;
  redirects: string[];
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  failure_count: number;
  last_proposal_id: string | null;
}

export type MonitorState = Record<string, MonitorSourceState>;

function normalizedState(key: string, value: unknown): MonitorSourceState | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const checkedAt = typeof entry.checked_at === 'string' ? entry.checked_at : '';
  const legacyStatus = typeof entry.status === 'number' ? entry.status : null;
  const httpStatus = typeof entry.http_status === 'number' ? entry.http_status : legacyStatus;
  const redirects = Array.isArray(entry.redirects)
    ? entry.redirects.filter((item): item is string => typeof item === 'string')
    : Array.isArray(entry.redirect_chain)
      ? entry.redirect_chain.filter((item): item is string => typeof item === 'string')
      : [];
  return {
    record_id: typeof entry.record_id === 'string' ? entry.record_id : key,
    checked_at: checkedAt,
    last_successful_at:
      typeof entry.last_successful_at === 'string'
        ? entry.last_successful_at
        : httpStatus !== null && httpStatus < 400
          ? checkedAt || null
          : null,
    http_status: httpStatus,
    final_url: typeof entry.final_url === 'string' ? entry.final_url : '',
    redirects,
    etag: typeof entry.etag === 'string' ? entry.etag : null,
    last_modified: typeof entry.last_modified === 'string' ? entry.last_modified : null,
    content_hash: typeof entry.content_hash === 'string' ? entry.content_hash : null,
    failure_count:
      typeof entry.failure_count === 'number' && entry.failure_count >= 0 ? entry.failure_count : 0,
    last_proposal_id: typeof entry.last_proposal_id === 'string' ? entry.last_proposal_id : null,
  };
}

export async function loadMonitorState(file: string): Promise<MonitorState> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, normalizedState(key, value)] as const)
        .filter((entry): entry is [string, MonitorSourceState] => entry[1] !== null),
    );
  } catch {
    return {};
  }
}

export function stateFromResult(
  key: string,
  checkedAt: string,
  result: FetchResult,
  nextContentHash: string | null,
  previous?: MonitorSourceState,
): MonitorSourceState {
  const unchanged = result.status === 304 && previous;
  const successful = result.status < 400;
  return {
    record_id: key,
    checked_at: checkedAt,
    last_successful_at: successful ? checkedAt : (previous?.last_successful_at ?? null),
    http_status: result.status,
    final_url: result.finalUrl || previous?.final_url || '',
    redirects: result.redirects,
    etag: result.etag ?? previous?.etag ?? null,
    last_modified: result.lastModified ?? previous?.last_modified ?? null,
    content_hash: unchanged
      ? previous.content_hash
      : successful
        ? nextContentHash
        : (previous?.content_hash ?? null),
    failure_count: successful ? 0 : (previous?.failure_count ?? 0) + 1,
    last_proposal_id: previous?.last_proposal_id ?? null,
  };
}

export function stateFromFailure(
  key: string,
  checkedAt: string,
  previous?: MonitorSourceState,
): MonitorSourceState {
  return {
    record_id: key,
    checked_at: checkedAt,
    last_successful_at: previous?.last_successful_at ?? null,
    http_status: null,
    final_url: previous?.final_url ?? '',
    redirects: previous?.redirects ?? [],
    etag: previous?.etag ?? null,
    last_modified: previous?.last_modified ?? null,
    content_hash: previous?.content_hash ?? null,
    failure_count: (previous?.failure_count ?? 0) + 1,
    last_proposal_id: previous?.last_proposal_id ?? null,
  };
}
export function nextFailureState(
  previous: SourceState,
  checkedAt: string,
  status: number | null,
): SourceState {
  return {
    ...previous,
    checked_at: checkedAt,
    http_status: status,
    failure_count: previous.failure_count + 1,
  };
}
export function nextSuccessState(
  previous: SourceState,
  checkedAt: string,
  update: Partial<SourceState>,
): SourceState {
  return {
    ...previous,
    ...update,
    checked_at: checkedAt,
    last_successful_at: checkedAt,
    failure_count: 0,
  };
}
