import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isRetryableDetailError, isRetryableDetailStatus } from '../../automation/monitor';
import {
  loadMonitorState,
  stateFromFailure,
  stateFromResult,
  restoreStateForRetry,
  type MonitorSourceState,
} from '../../automation/state';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const previous: MonitorSourceState = {
  record_id: 'course-a',
  checked_at: '2026-08-24T10:00:00.000Z',
  last_successful_at: '2026-08-24T10:00:00.000Z',
  http_status: 200,
  final_url: 'https://official.example/course-a',
  redirects: [],
  etag: 'old-etag',
  last_modified: null,
  content_hash: 'old-hash',
  failure_count: 2,
  last_proposal_id: null,
};

describe('monitor state persistence', () => {
  it('loads legacy snapshots without discarding other records', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'catalog-monitor-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'state.json');
    await writeFile(
      file,
      JSON.stringify({
        'course-a': {
          checked_at: previous.checked_at,
          status: 200,
          final_url: previous.final_url,
          redirect_chain: [],
          etag: previous.etag,
          last_modified: null,
          content_hash: previous.content_hash,
          failure_count: 2,
        },
        'course-b': { ...previous, record_id: 'course-b' },
      }),
    );
    const state = await loadMonitorState(file);
    expect(Object.keys(state)).toEqual(['course-a', 'course-b']);
    expect(state['course-a']?.content_hash).toBe('old-hash');
  });

  it('preserves hashes on 304 and advances consecutive failures', () => {
    const unchanged = stateFromResult(
      'course-a',
      '2026-08-25T10:00:00.000Z',
      {
        status: 304,
        body: '',
        finalUrl: previous.final_url,
        redirects: [],
        etag: null,
        lastModified: null,
      },
      null,
      previous,
    );
    expect(unchanged.content_hash).toBe('old-hash');
    expect(unchanged.failure_count).toBe(0);
    expect(stateFromFailure('course-a', '2026-08-25T11:00:00.000Z', previous).failure_count).toBe(
      3,
    );
  });

  it('restores or removes a collection checkpoint so failed candidates are rediscovered', () => {
    const state = {
      listing: stateFromResult(
        'listing',
        '2026-08-25T10:00:00.000Z',
        {
          status: 200,
          body: '<a href="/new-course">New course</a>',
          finalUrl: 'https://official.example/courses',
          redirects: [],
          etag: 'new-etag',
          lastModified: null,
        },
        'new-hash',
      ),
    };

    restoreStateForRetry(state, 'listing', previous);
    expect(state.listing.etag).toBe('old-etag');
    restoreStateForRetry(state, 'listing');
    expect(state).not.toHaveProperty('listing');
  });

  it('retries only transient detail-page failures', () => {
    expect(isRetryableDetailStatus(408)).toBe(true);
    expect(isRetryableDetailStatus(429)).toBe(true);
    expect(isRetryableDetailStatus(503)).toBe(true);
    expect(isRetryableDetailStatus(404)).toBe(false);
    expect(isRetryableDetailStatus(410)).toBe(false);
    expect(isRetryableDetailError(new DOMException('timed out', 'AbortError'))).toBe(true);
    expect(isRetryableDetailError(new Error('Response exceeds maximum configured size.'))).toBe(
      false,
    );
  });
});
