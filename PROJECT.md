# Personal Obsidian Graph Viewer

## Purpose

Build a local-first visual graph viewer for an existing collection of Markdown notes. Markdown files and the folder structure remain the source of truth; the application only indexes links and displays their relationships.

The inspiration is Obsidian's graph view, not a replacement for Obsidian. The project should make it easier to explore connections between notes while preserving the simplicity and portability of an organised file system.

## Product principles

- Read-only for the first release: never rename, move, modify or delete the user's notes.
- Local-first: notes stay on the user's computer.
- File-system based: no proprietary database is required for the notes themselves.
- Keep the graph useful: focus on navigation and relationships rather than an impressive but unreadable all-notes cloud.
- AI may later suggest relationships, but Markdown links remain the source of truth.

## Minimum viable product

1. Let the user select a local notes folder.
2. Recursively discover Markdown (`.md`) files.
3. Extract and resolve:
   - Obsidian-style wiki links such as `[[Project Brief]]`
   - normal Markdown links to `.md` files such as `[Read notes](projects/project-brief.md)`
   - tags such as `#project`
   - optional YAML frontmatter.
4. Represent every note as a node and every resolved link as an edge.
5. Show a graph with pan, zoom, search and node selection.
6. When a node is selected, show a note preview, its file path, outgoing links, backlinks and tags.
7. Allow filtering by folder, tag and the selected note's local neighbourhood.
8. Create visible missing-note nodes for unresolved links.

## Link-resolution scope

Version one supports file-level links only. It should detect broken links, but can defer aliases, embeds, block references and links to headings such as `[[Project Brief#Next steps]]` until the core experience is reliable.

## Recommended initial stack

- React, TypeScript and Vite for the interface.
- Cytoscape.js for graph rendering, layouts and interaction.
- `gray-matter` for YAML frontmatter.
- `remark` or a lightweight Markdown parser for standard Markdown links and headings.
- Begin as a local browser application using folder selection. Package it with Tauri later if a desktop application needs more reliable filesystem access.

## Personal project-memory view

A useful later view could:

- show only a selected project's local subgraph;
- highlight disconnected notes, missing links and heavily connected hub notes;
- surface recently changed notes; and
- suggest potential links without changing files automatically.

## Explicitly deferred

Do not build these in the first version:

- Markdown note editing;
- cloud sync or collaboration;
- mobile support;
- plugin architecture;
- embedding/vector search;
- AI chat, automatic summaries or automatic file edits;
- advanced alias, block-reference and heading-link support.

## Why this is a good project

It is personally useful while demonstrating local file handling, Markdown parsing, graph data structures, visual interaction design and disciplined product scope. A focused MVP should be realistic in two to three weekends.

## Next decision

Before implementation, choose whether the first prototype should be a browser-based local app or a Tauri desktop app. Start browser-based unless filesystem access proves limiting.
