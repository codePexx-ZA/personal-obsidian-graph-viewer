# Pexx Brain graph system

## Purpose

This repository contains the local 3D graph shown in the Brain tab of Pexx Industries. It replaces the original browser-only 2D Cytoscape prototype. The graph is a read-only view of the user's local Markdown memory folder.

## Current release

**Brain 0.1.6 — 5 November 2026**

- Every Markdown note remains visible, including notes with no references.
- Larger graph nodes group notes by folder and YAML metadata.
- Directed references distinguish wiki links, Markdown links, YAML `source` fields, and file mentions. Folder and metadata edges remain visually subdued.
- `_manifest.csv` preserves original paths for uniquely renamed notes.
- A unique current path, original path, filename, or directory-plus-filename suffix can resolve a reference. Ambiguous references stay unlinked.
- Cited Markdown paths outside the indexed folder appear in a `mentioned` area. They are represented as mentioned paths, not read as external note content.
- Search, domain filtering, group visibility, fit, freeze/resume, refresh, full-screen, hover detail, note inspection, and connection highlighting are available.
- Slow idle rotation resumes five seconds after interaction, pauses while the app is hidden, and is disabled for reduced motion.

## Local data boundary

Electron reads `~/Desktop/AI` from disk and exposes graph data through a single validated IPC call, `window.pexx.getBrain()`. The renderer has no Node.js access. The reader skips hidden folders and symbolic links, limits files to 4 MB each, total input to 32 MB, and the index to 5,000 Markdown files. Note previews are plain text and capped at 6,000 characters. Graph construction and parsing run locally. The application never changes or uploads notes.

## Source map

- `src/brain/Brain.tsx` — 3D graph, layout, controls, selection, and inspection.
- `src/brain/brain.css` — graph controls, inspector, empty/error states, and responsive styles.
- `src/brain/types.ts` — graph node, link, and reader result types.
- `src/brain/version.ts` — graph-specific release history.
- `electron/brain.cjs` — Markdown collection, YAML/manifest parsing, relationship resolution, graph construction, and input limits.
- `electron/main.cjs` and `electron/preload.cjs` — Electron window and the restricted reader bridge.

The Pexx Industries parent project embeds the same `src/brain/` component and reader. Changes to graph behavior should be reflected in both projects and appended to `src/brain/version.ts`.

## Run

```bash
npm install
npm run desktop
```

To package a Linux AppImage, run `npm run package:linux`. The desktop app reads the current user's `~/Desktop/AI` folder. The Vite renderer alone cannot access the folder; use the Electron desktop command.

## Previous prototype

The former 2D browser prototype, its Cytoscape resolver, and its unfinished feature roadmap were removed from the current working tree. Their Git history remains available in earlier commits.
