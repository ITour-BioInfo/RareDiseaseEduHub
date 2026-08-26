export interface MonitorSummary {
  mode: string;
  checkedAt: string;
  sourcesChecked: number;
  successful: number;
  failed: number;
  changed: number;
  proposals: number;
  conflicts: number;
  rawCandidates: number;
  filteredCandidates: number;
  validatedCandidates: number;
  rejectedCandidates: number;
  duplicateCandidates: number;
  suppressedCandidates: number;
  validationFailures: number;
  safetyGateTripped: boolean;
  warnings: string[];
}
export function markdownReport(summary: MonitorSummary) {
  return `# Catalogue monitor report\n\n- Run time: ${summary.checkedAt}\n- Mode: ${summary.mode}\n- Official sources checked: ${summary.sourcesChecked}\n- Successful checks: ${summary.successful}\n- Failed checks: ${summary.failed}\n- Raw links passing listing-page extraction: ${summary.rawCandidates}\n- New links after URL, title and provider deduplication: ${summary.filteredCandidates}\n- Candidates verified on their official detail page: ${summary.validatedCandidates}\n- Candidates rejected by page-level checks: ${summary.rejectedCandidates}\n- Duplicate links or records suppressed: ${summary.duplicateCandidates}\n- Unchanged previously seen candidates suppressed: ${summary.suppressedCandidates}\n- Candidate detail-page fetch failures: ${summary.validationFailures}\n- Detected source changes or verified new candidates: ${summary.changed}\n- Review proposals: ${summary.proposals}\n- Pull-request safety gate: ${summary.safetyGateTripped ? 'blocked; report only' : 'open'}\n- Source conflicts: ${summary.conflicts}\n- Tests required before pull request: validation, translations, unit, crawler fixtures, build, browser and accessibility\n\n## Warnings\n\n${summary.warnings.length ? summary.warnings.map((item) => `- ${item}`).join('\n') : '- None.'}\n`;
}
