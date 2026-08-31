import { describe, expect, it } from 'vitest';
import type { DiscoveryCandidate } from '../../automation/discovery';
import {
  candidateValidationBatch,
  uniquePendingCandidates,
} from '../../automation/pending-candidates';

function candidate(index: number): DiscoveryCandidate {
  return {
    provider: 'Official rare-disease provider',
    title: `Rare disease course ${index}`,
    url: `https://official.example/courses/${index}`,
    evidenceUrl: 'https://official.example/courses',
    sourceKind: 'official-listing',
    confidence: 'high',
  };
}

describe('pending discovery candidate queue', () => {
  it('retains candidates beyond the per-run validation limit', () => {
    const result = candidateValidationBatch([], [candidate(1), candidate(2), candidate(3)], [], 2);
    expect(result.batch).toHaveLength(2);
    expect(result.remaining).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it('processes an existing backlog before newly discovered links', () => {
    const result = candidateValidationBatch([candidate(3)], [candidate(1), candidate(2)], [], 1);
    expect(result.batch[0]?.url).toContain('/3');
  });

  it('deduplicates queued candidates by normalized official URL', () => {
    expect(
      uniquePendingCandidates([
        candidate(1),
        { ...candidate(1), url: 'https://official.example/courses/1/?utm_source=test' },
      ]),
    ).toHaveLength(1);
  });
});
