import { runMonitor } from './monitor';
const mode = process.argv[2] || 'dry-run';
const recordId = mode === 'record' ? process.argv[3] : undefined;
if (!['dry-run', 'fixtures', 'morning', 'priority', 'record'].includes(mode))
  throw new Error(`Unsupported monitor mode: ${mode}`);
const summary = await runMonitor(mode, recordId);
console.log(JSON.stringify(summary, null, 2));
