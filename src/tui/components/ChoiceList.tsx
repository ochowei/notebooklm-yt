import type { ReactNode } from 'react';
import { Box, Text, useStdout } from 'ink';
import { displayText } from '../presentation.js';

/** Keep the focused row visible; custom rows declare their fixed terminal height. */
export function ChoiceList({ labels, index, reservedRows = 12, rowHeight = 1, renderLabel }: {
  labels: readonly string[];
  index: number;
  reservedRows?: number;
  rowHeight?: number;
  renderLabel?: (index: number, selected: boolean) => ReactNode;
}) {
  const { stdout } = useStdout();
  const rows = 'rows' in stdout && typeof stdout.rows === 'number' ? stdout.rows : 24;
  const pageSize = Math.max(1, Math.floor((rows - reservedRows) / rowHeight));
  const start = Math.max(0, Math.min(index - Math.floor(pageSize / 2), labels.length - pageSize));
  return <Box flexDirection="column">
    {labels.slice(start, start + pageSize).map((label, offset) => {
      const selected = start + offset === index;
      return <Box key={start + offset}>
        <Text color={selected ? 'cyan' : undefined} bold={selected}>{selected ? '> ' : '  '}</Text>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          {renderLabel ? renderLabel(start + offset, selected)
            : <Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">{displayText(label)}</Text>}
        </Box>
      </Box>;
    })}
    {labels.length > pageSize && <Text dimColor>{index + 1} / {labels.length}</Text>}
  </Box>;
}
