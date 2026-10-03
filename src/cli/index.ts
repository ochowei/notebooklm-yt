const args = process.argv.slice(2);

if (args.length === 0 || (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))) {
  console.log(`notebooklm-yt

Usage: npm start -- [--help]

Local-first bridge: QueryTube → notebooklm-yt → NotebookLM.
Project scaffold only; Search Run loading and NotebookLM import are not implemented yet.`);
} else {
  console.error('Unsupported arguments. Use --help. Import commands are not implemented yet.');
  process.exitCode = 1;
}
