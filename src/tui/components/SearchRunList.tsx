import { Text } from 'ink';
import type { SearchRunSummary } from '../../domain/search-run.js';
import { displayText, formatStartedAt, searchRunName, searchRunStatus } from '../presentation.js';
import { ChoiceList } from './ChoiceList.js';

export function SearchRunList({ runs, index }: { runs: readonly SearchRunSummary[]; index: number }) {
  return <ChoiceList labels={runs.map(run => run.searchRunId)} index={index} rowHeight={3}
    renderLabel={(row, selected) => {
      const run = runs[row]!;
      const status = searchRunStatus(run.status);
      return <>
        <Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">
          {formatStartedAt(run.startedAt)}  {searchRunName(run)}
        </Text>
        <Text wrap="truncate">
          <Text color={status.color}>{status.symbol} {run.status}</Text>
          <Text dimColor> · {run.totalResults} results · {run.queryCount} queries</Text>
        </Text>
        <Text dimColor wrap="truncate">{displayText(run.searchRunId)}</Text>
      </>;
    }} />;
}
