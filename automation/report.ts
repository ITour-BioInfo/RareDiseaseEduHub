export interface MonitorSummary {
  mode: string;
  checkedAt: string;
  sourcesChecked: number;
  successful: number;
  failed: number;
  changed: number;
  proposals: number;
  conflicts: number;
  warnings: string[];
}
export function markdownReport(summary: MonitorSummary) {
  return `# Catalogue monitor report\n\n- Run time: ${summary.checkedAt}\n- Mode: ${summary.mode}\n- Sources checked: ${summary.sourcesChecked}\n- Successful checks: ${summary.successful}\n- Failed checks: ${summary.failed}\n- Changed sources: ${summary.changed}\n- Field-level proposals: ${summary.proposals}\n- Source conflicts: ${summary.conflicts}\n- Tests required before pull request: validation, translations, unit, crawler fixtures, build, browser and accessibility\n\n## Warnings\n\n${summary.warnings.length ? summary.warnings.map((item) => `- ${item}`).join('\n') : '- None.'}\n`;
}
