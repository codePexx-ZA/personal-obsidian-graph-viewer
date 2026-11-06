# Pexx Brain

Pexx Brain is the local 3D memory graph displayed in the Brain tab of the Pexx Industries dashboard. This repository records and packages that graph system. It replaces the earlier standalone 2D Cytoscape prototype.

The app reads Markdown from `~/Desktop/AI` through a narrow, read-only Electron bridge. It never edits, moves, deletes, uploads, or syncs note files. The graph is built locally from the notes and their metadata.

## Current graph

The current release is **Brain 0.1.6**. Every Markdown file is shown, including notes without references. Larger nodes group notes by domain and project. The graph reads `_manifest.csv` when present to retain original-path provenance.

Relationships come from:

- folder and metadata structure;
- Obsidian wiki links;
- Markdown links to `.md` files;
- YAML `source` fields; and
- backticked Markdown paths.

Exact paths and unique names resolve to notes. Unique directory and filename suffixes and manifest original paths can resolve renamed files. Ambiguous names remain unlinked. Referenced Markdown paths outside `Desktop/AI` appear in a `mentioned` area, with a visible link back to the citing note.

The 3D view supports search, area filters, group visibility, fit, freeze/resume, refresh, full-screen, note inspection, hover details, and connection highlighting. It rotates slowly when idle, pauses on interaction or when the window is hidden, and respects reduced-motion settings. Loading, missing-folder, empty-folder, renderer-failure, and file-read warning states are surfaced in the UI.

## Run and package

Requires Node.js and npm on Linux. The graph data bridge is provided by Electron; running the Vite renderer alone does not have permission to read `Desktop/AI`.

```bash
npm install
npm run desktop
```

To create a Linux AppImage:

```bash
npm run package:linux
```

The packaged app reads `~/Desktop/AI` for the current user. It does not include the notes in its build output.

## Architecture

- `src/brain/Brain.tsx`: graph layout, controls, inspection, and UI state.
- `src/brain/brain.css`: graph surface and interaction styling.
- `src/brain/types.ts`: graph data contract shared with the reader.
- `src/brain/version.ts`: Brain release history.
- `electron/brain.cjs`: local Markdown discovery, metadata parsing, and reference resolution.
- `electron/main.cjs`: isolated BrowserWindow and validated `brain:get` IPC handler.
- `electron/preload.cjs`: the single `window.pexx.getBrain()` method exposed to the renderer.

The reader skips hidden folders and symbolic links and enforces a 4 MB per-file limit, a 32 MB total read limit, and a 5,000-file limit. Plain-text previews are capped at 6,000 characters. Invalid or unreadable files are reported as warnings where possible.

The dashboard embeds the same `src/brain/` component and uses the same `electron/brain.cjs` reader. The parent project contains the full dashboard around this graph.
