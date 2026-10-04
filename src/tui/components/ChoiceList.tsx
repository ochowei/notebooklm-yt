import { Box, Text, useStdout } from 'ink';
import { displayText } from '../presentation.js';

/** Keep the focused row visible in long runs without fetching additional data. */
export function ChoiceList({ labels, index, reservedRows = 12 }: { labels: readonly string[]; index: number; reservedRows?: number }) {
  const { stdout } = useStdout();
  const rows = 'rows' in stdout && typeof stdout.rows === 'number' ? stdout.rows : 24;
  const pageSize = Math.max(1, rows - reservedRows);
  const start = Math.max(0, Math.min(index - Math.floor(pageSize / 2), labels.length - pageSize));
  return <Box flexDirection="column">
    {labels.slice(start, start + pageSize).map((label, offset) =>
      <Text key={start + offset} wrap="truncate">{start + offset === index ? '> ' : '  '}{displayText(label)}</Text>)}
    {labels.length > pageSize && <Text>{index + 1} / {labels.length}</Text>}
  </Box>;
}
