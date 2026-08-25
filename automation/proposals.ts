import { proposalSchema } from '../src/lib/catalog/schema';
export function proposal(input: unknown) {
  return proposalSchema.parse(input);
}
export function requiresManualReview(change: {
  field: string;
  old_value: unknown;
  proposed_value: unknown;
  evidence: string;
}) {
  if (!change.evidence.trim()) return true;
  if (
    /date|opens|closes|title|provider|lifecycle|cost|language|certificate|delivery/.test(
      change.field,
    )
  )
    return true;
  return change.old_value !== change.proposed_value;
}
