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
