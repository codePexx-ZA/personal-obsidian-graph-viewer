import type { GraphData, Link, Note } from './types'

type FileSystemDirectoryHandleWithValues = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
}

const markdownExtension = /\.md$/i
const wikiLinkPattern = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+\.md)(?:#[^)]+)?\)/gi
const tagPattern = /(^|\s)#([\p{L}\d_/-]+)/gu

async function collectMarkdownFiles(
  directory: FileSystemDirectoryHandleWithValues,
  parentPath = '',
): Promise<Array<{ path: string; file: File }>> {
  const files: Array<{ path: string; file: File }> = []

  for await (const entry of directory.values()) {
    const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
    if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
      files.push(...(await collectMarkdownFiles(entry as FileSystemDirectoryHandleWithValues, path)))
    }
    if (entry.kind === 'file' && markdownExtension.test(entry.name)) {
      files.push({ path, file: await (entry as FileSystemFileHandle).getFile() })
    }
  }

  return files
}

function noteName(path: string) {
  return path.split('/').at(-1)?.replace(markdownExtension, '') ?? path
}

function extractTags(content: string) {
  return [...content.matchAll(tagPattern)].map((match) => match[2].toLowerCase())
}

function normalisePath(raw: string, fromPath: string) {
  const decoded = decodeURIComponent(raw.trim()).replace(/^\.\//, '')
  const pieces = [...fromPath.split('/').slice(0, -1), ...decoded.split('/')]
  const resolved: string[] = []
  for (const piece of pieces) {
    if (!piece || piece === '.') continue
    if (piece === '..') resolved.pop()
    else resolved.push(piece)
  }
  return resolved.join('/')
}

function extractTargets(note: Note, notes: Note[]): Link[] {
  const links: Link[] = []
  const byPath = new Map(notes.map((candidate) => [candidate.path.toLowerCase(), candidate.id]))
  const byName = new Map(notes.map((candidate) => [candidate.name.toLowerCase(), candidate.id]))

  for (const match of note.content.matchAll(wikiLinkPattern)) {
    const label = match[1].trim()
    const target = byName.get(label.toLowerCase()) ?? byPath.get(`${label}.md`.toLowerCase())
    links.push({ source: note.id, target: target ?? `missing:${label}`, unresolved: !target })
  }

  for (const match of note.content.matchAll(markdownLinkPattern)) {
    const path = normalisePath(match[1], note.path)
    const target = byPath.get(path.toLowerCase())
    links.push({ source: note.id, target: target ?? `missing:${path}`, unresolved: !target })
  }

  return links
}

export async function readGraph(directory: FileSystemDirectoryHandle): Promise<GraphData> {
  const files = await collectMarkdownFiles(directory as FileSystemDirectoryHandleWithValues)
  const notes = await Promise.all(
    files.map(async ({ path, file }) => {
      const content = await file.text()
      return { id: path, name: noteName(path), path, content, tags: extractTags(content) }
    }),
  )
  const links = notes.flatMap((note) => extractTargets(note, notes))
  return { notes, links, rootName: directory.name }
}
