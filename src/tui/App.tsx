import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { ClientError } from '../application/errors.js';
import { ChoiceList } from './components/ChoiceList.js';
import { Report } from './screens/Report.js';
import { displayText, errorCode, friendlyError } from './presentation.js';
import type { BrowserState, TuiDependencies, TuiState } from './state.js';

export interface AppProps {
  readonly userId: string;
  readonly createDependencies: () => TuiDependencies | Promise<TuiDependencies>;
}

export function App({ userId, createDependencies }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState<TuiState>({ screen: 'loading', label: 'Loading Search Runs...' });
  const [ready, setReady] = useState(false);
  const current = useRef(state);
  const dependencies = useRef<TuiDependencies | undefined>(undefined);
  const generation = useRef(0);
  const active = useRef(true);
  const navigate = (next: TuiState) => {
    current.current = next;
    setState(next);
  };

  useEffect(() => {
    active.current = true;
    const request = ++generation.current;
    void (async () => {
      try {
        const deps = await createDependencies();
        if (!active.current || request !== generation.current) return;
        dependencies.current = deps;
        const runs = await deps.queryTube.listSearchRuns(userId);
        if (!active.current || request !== generation.current) return;
        setReady(true);
        navigate({ screen: 'search-runs', runs, runIndex: 0 });
      } catch (error) {
        if (active.current && request === generation.current) navigate({ screen: 'error', code: errorCode(error) });
      }
    })();
    return () => { active.current = false; generation.current++; };
  }, [createDependencies, userId]);

  const backToRuns = (browser: BrowserState) => {
    generation.current++;
    navigate({ screen: 'search-runs', runs: browser.runs, runIndex: browser.runIndex });
  };

  useInput((input, key) => {
    const screen = current.current;
    // Ordinary navigation cannot safely cancel an active application operation.
    if (screen.screen === 'importing') return;
    // q belongs to text entry on the title screen; Ctrl+C remains Ink's exit shortcut.
    if (input === 'q' && screen.screen !== 'title') {
      active.current = false;
      generation.current++;
      exit();
      return;
    }
    if (screen.screen === 'loading' || screen.screen === 'error') {
      if (key.escape && screen.back) backToRuns(screen.back);
      return;
    }
    if (screen.screen === 'report') {
      if (key.return || key.escape) backToRuns(screen.draft);
      return;
    }
    if (screen.screen === 'search-runs') {
      if (key.upArrow || key.downArrow) {
        navigate({ ...screen, runIndex: Math.max(0, Math.min(screen.runs.length - 1,
          screen.runIndex + (key.upArrow ? -1 : 1))) });
      } else if (key.return && screen.runs[screen.runIndex]) {
        const reference = screen.runs[screen.runIndex]!;
        const request = ++generation.current;
        navigate({ screen: 'loading', label: 'Loading videos...', back: screen });
        void (async () => {
          try {
            const run = await dependencies.current!.queryTube.getSearchRun(userId, reference.searchRunId);
            if (!active.current || request !== generation.current) return;
            if (!run.videos.length) throw new ClientError('IMPORT_NO_SOURCES', 'No sources.');
            navigate({ screen: 'videos', draft: { runs: screen.runs, runIndex: screen.runIndex,
              run, selected: new Set(run.videos.map(video => video.videoId)), videoIndex: 0, title: '' } });
          } catch (error) {
            if (active.current && request === generation.current) navigate({ screen: 'error', code: errorCode(error), back: screen });
          }
        })();
      }
      return;
    }
    const draft = screen.draft;
    if (screen.screen === 'videos') {
      if (key.escape) backToRuns(draft);
      else if (key.upArrow || key.downArrow) navigate({ screen: 'videos', draft: { ...draft,
        videoIndex: Math.max(0, Math.min(draft.run.videos.length - 1, draft.videoIndex + (key.upArrow ? -1 : 1))) } });
      else if (input === ' ' || input === 'a' || input === 'n') {
        const selected = input === 'a' ? new Set(draft.run.videos.map(video => video.videoId))
          : input === 'n' ? new Set<string>() : new Set(draft.selected);
        if (input === ' ') {
          const id = draft.run.videos[draft.videoIndex]!.videoId;
          if (selected.has(id)) selected.delete(id); else selected.add(id);
        }
        navigate({ screen: 'videos', draft: { ...draft, selected, notice: undefined } });
      } else if (key.return) navigate(draft.selected.size
        ? { screen: 'title', draft: { ...draft, notice: undefined } }
        : { screen: 'videos', draft: { ...draft, notice: friendlyError('IMPORT_NO_SELECTED_SOURCES') } });
    } else if (screen.screen === 'title') {
      if (key.escape) navigate({ screen: 'videos', draft: { ...draft, notice: undefined } });
      else if (key.return) navigate(draft.title.trim()
        ? { screen: 'confirm', draft: { ...draft, notice: undefined } }
        : { screen: 'title', draft: { ...draft, notice: 'Enter a notebook title.' } });
      else if (key.backspace || key.delete) navigate({ screen: 'title', draft: { ...draft,
        title: Array.from(draft.title).slice(0, -1).join(''), notice: undefined } });
      else if (!key.ctrl && !key.meta && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow)
        navigate({ screen: 'title', draft: { ...draft, title: draft.title + displayText(input), notice: undefined } });
    } else if (screen.screen === 'confirm') {
      if (key.escape) navigate({ screen: 'title', draft });
      else if (key.return) {
        // Change the synchronous ref before executing: repeated Enter cannot create a second notebook.
        navigate({ screen: 'importing', draft });
        void (async () => {
          try {
            const result = await dependencies.current!.importer.execute({ userId,
              searchRunId: draft.run.searchRunId, notebookTitle: draft.title,
              selection: { videoIds: [...draft.selected] } });
            if (active.current) navigate({ screen: 'report', draft, result });
          } catch (error) {
            if (active.current) navigate({ screen: 'error', code: errorCode(error), back: draft });
          }
        })();
      }
    }
  });

  return <Box flexDirection="column" paddingBottom={1}>
    <Text bold>nlyt — Interactive import</Text>
    <Text>QueryTube: {ready ? 'ready (list succeeded)' : 'not yet ready'} · NotebookLM: checked during import</Text>
    {state.screen === 'loading' && <><Text>{state.label}</Text><Text>{state.back ? 'Esc Back · ' : ''}q Quit</Text></>}
    {state.screen === 'search-runs' && <>
      <Text bold>QueryTube Search Runs</Text>
      {state.runs.length ? <ChoiceList labels={state.runs.map(run => run.searchRunId)} index={state.runIndex} />
        : <Text>No public Search Runs found.</Text>}
      <Text>↑↓ Navigate · Enter Select · q Quit</Text>
    </>}
    {state.screen === 'videos' && <>
      <Text bold>Videos — {displayText(state.draft.run.searchRunId)}</Text>
      <ChoiceList labels={state.draft.run.videos.map(video =>
        `[${state.draft.selected.has(video.videoId) ? 'x' : ' '}] ${video.title || video.videoId}`)} index={state.draft.videoIndex} />
      <Text>↑↓ Navigate · Space Toggle · a Select all · n Select none</Text>
      <Text>Enter Continue · Esc Back · q Quit</Text>
    </>}
    {state.screen === 'title' && <>
      <Text bold>Notebook title</Text><Text>{'> '}{displayText(state.draft.title)}▌</Text>
      <Text>Type / paste title · Backspace Delete last character · Enter Continue · Esc Back · Ctrl+C Quit</Text>
    </>}
    {state.screen === 'confirm' && <>
      <Text bold>Ready to import</Text>
      <Text>Search Run: {displayText(state.draft.run.searchRunId)}</Text>
      <Text>Selected: {state.draft.selected.size} / {state.draft.run.videos.length} videos</Text>
      <Text>Notebook: {displayText(state.draft.title)}</Text>
      <Text>Enter Import · Esc Back · q Quit</Text>
    </>}
    {(state.screen === 'videos' || state.screen === 'title') && state.draft.notice && <Text>{state.draft.notice}</Text>}
    {state.screen === 'importing' && <>
      <Text bold>Importing...</Text><Text>Creating notebook and importing selected YouTube sources.</Text>
      <Text>Import in progress. Exiting cannot safely cancel the operation.</Text>
    </>}
    {state.screen === 'report' && <Report result={state.result} />}
    {state.screen === 'error' && <>
      <Text bold>{state.code}</Text><Text>{friendlyError(state.code)}</Text>
      {state.code.startsWith('NOTEBOOKLM_') && <Text>If a write was not confirmed, inspect the target notebook before importing again.</Text>}
      <Text>{state.back ? 'Esc Back to Search Runs · ' : ''}q Quit</Text>
    </>}
  </Box>;
}
