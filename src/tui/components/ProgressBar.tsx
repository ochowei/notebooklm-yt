import { Text } from 'ink';
import { formatProgress } from '../presentation.js';

/** Presentation data only, with no knowledge of the import workflow or backend. */
export function ProgressBar({ completed, total }: { readonly completed: number; readonly total: number }) {
  const progress = formatProgress(completed, total);
  return <Text>
    <Text dimColor>[</Text><Text color="cyan">{progress.filled}</Text><Text dimColor>{progress.remaining}]</Text>
    {' '}{progress.completed} / {progress.total}{'  '}{progress.percentage}%
  </Text>;
}
