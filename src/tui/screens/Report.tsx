import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ChoiceList } from '../components/ChoiceList.js';
import { summarizeImportSources } from '../../application/import-search-run-to-notebook.js';
import type { ImportSearchRunResult } from '../../application/import-search-run-to-notebook.js';
import { displayText } from '../presentation.js';

export function Report({ result }: { result: ImportSearchRunResult }) {
  const { status, summary } = summarizeImportSources(result.sources);
  const failures = result.sources.flatMap(source => source.status === 'failure'
    ? [`${source.source.videoId} — ${source.error.code}`] : []);
  const [index, setIndex] = useState(0);
  useInput((_input, key) => {
    if (key.upArrow || key.downArrow) setIndex(value => Math.max(0,
      Math.min(failures.length - 1, value + (key.upArrow ? -1 : 1))));
  });
  return <Box flexDirection="column">
    <Text bold color={status === 'success' ? 'green' : status === 'partial_failure' ? 'yellow' : 'red'}>Import complete — {status}</Text>
    <Text dimColor>Import: {result.importId} / {result.createdAt}</Text>
    <Text>Notebook: {displayText(result.notebook.title)}</Text>
    <Text>ID: {displayText(result.notebook.id)}</Text>
    <Text bold>Sources</Text>
    {Object.entries(summary).map(([name, count]) => <Text key={name} color={name === 'failed' && count > 0 ? 'red' : name === 'succeeded' ? 'green' : undefined}>{name}: {count}</Text>)}
    {summary.failed > 0 && <Text bold color="red">Failures</Text>}
    {failures.length > 0 && <ChoiceList labels={failures} index={index} reservedRows={20} />}
    {failures.length > 0 && <Text dimColor>↑↓ Browse failures</Text>}
    <Text dimColor>Success confirms registration; source processing may still be pending.</Text>
    <Text dimColor>Enter Back to Search Runs · q Quit</Text>
  </Box>;
}
