const fs = require('node:fs/promises')
const path = require('node:path')
const YAML = require('yaml')
const { parse: parseCsv } = require('csv-parse/sync')

const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = 32 * 1024 * 1024
const MAX_FILES = 5000
const slash = value => value.replace(/\\/g, '/')
const key = value => slash(value).toLowerCase()
const normal = value => path.posix.normalize(slash(value))
const str = value => typeof value === 'string' ? value : ''
const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : typeof value === 'string' ? [value] : []

// Only regular files inside the fixed AI root are indexed. No symlink traversal.
async function collect(root) {
  const files = [], manifests = [], warnings = []
  const realRoot = await fs.realpath(root)
  let bytes = 0
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { await visit(full); continue }
      if (!entry.isFile() || (!/\.md$/i.test(entry.name) && entry.name !== '_manifest.csv')) continue
      const relative = slash(path.relative(realRoot, full))
      try {
        // Recheck containment after discovery, including paths changed during a refresh.
        const real = await fs.realpath(full)
        const rel = path.relative(realRoot, real)
        if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) continue
        const stat = await fs.stat(real)
        if (stat.size > MAX_FILE_BYTES) { warnings.push(`${relative}: exceeds the 4 MB per-file limit.`); continue }
        bytes += stat.size
        if (bytes > MAX_TOTAL_BYTES || files.length >= MAX_FILES) throw new Error('BRAIN_LIMIT')
        const content = await fs.readFile(real, 'utf8')
        if (entry.name === '_manifest.csv') manifests.push({ path: relative, content })
        else files.push({ path: relative, content, modified: stat.mtime.toISOString() })
      } catch (error) {
        if (error.message === 'BRAIN_LIMIT') throw new Error('The AI folder exceeds the first-version limit of 5,000 notes or 32 MB.')
        warnings.push(`${relative}: could not read this file.`)
      }
    }
  }
  await visit(realRoot)
  return { files, manifests, warnings }
}

async function buildGraph(files, manifests = [], warnings = []) {
  const { marked } = await import('marked')
  const notes = [], rawRefs = [], manifestEntries = [], roots = manifests.map(m => path.posix.dirname(m.path))
  for (const manifest of manifests) {
    try {
      const rows = parseCsv(manifest.content, { columns: true, bom: true, skip_empty_lines: true })
      for (const row of rows) if (row.Path && row.Disposition === 'kept') {
        manifestEntries.push({ path: normal(path.posix.join(path.posix.dirname(manifest.path), slash(row.Path))), original: slash(row.OriginalPath || '') })
      }
    } catch { warnings.push(`${manifest.path}: could not read the manifest; current files are still indexed.`) }
  }
  for (const file of files) {
    const content = file.content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    const front = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content)
    let meta = {}
    if (front) {
      try { const parsed = YAML.parse(front[1], { maxAliasCount: 50 }); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed }
      catch { warnings.push(`${file.path}: invalid YAML header; using folder and heading information.`) }
    }
    const body = front ? content.slice(front[0].length) : content
    const tokens = marked.lexer(body)
    const vault = roots.filter(r => file.path.startsWith(r + '/')).sort((a, b) => b.length - a.length)[0] || ''
    const localPath = vault ? file.path.slice(vault.length + 1) : file.path
    const parts = localPath.split('/')
    const domain = str(meta.domain) || (parts.length > 1 ? parts[0] : vault ? 'global' : 'setup')
    const project = str(meta.project) || (parts.length > 2 ? parts[1] : domain === 'setup' ? 'portable-setup' : domain)
    const tags = new Set(strings(meta.tags).flatMap(t => t.split(/[,\s]+/)).map(t => t.replace(/^#/, '')).filter(Boolean))
    const note = { id: file.path, kind: 'note', path: file.path, label: str(meta.title) || tokens.find(t => t.type === 'heading' && t.depth === 1)?.text || path.posix.basename(file.path, '.md'), domain, project, noteType: str(meta.type), status: str(meta.status), updated: str(meta.updated), summary: str(meta.summary), tags: [], preview: body.slice(0, 6000), previewTruncated: body.length > 6000, modified: file.modified, vault, aliases: strings(meta.aliases) }
    notes.push(note)
    const add = (raw, kind) => { if (raw && raw.length < 1000) rawRefs.push({ source: note.id, raw, kind }) }
    strings(meta.source).forEach(raw => add(raw, 'source'))
    marked.walkTokens(tokens, token => {
      if (token.type === 'link' && /\.md(?:[?#]|$)/i.test(token.href)) add(token.href, 'markdown')
      if (token.type === 'codespan' && /\.md(?:#[^\s]*)?$/i.test(token.text) && !/[<>*%]/.test(token.text) && token.text !== '.md') add(token.text, 'mention')
      if (token.type === 'text' && !token.tokens) {
        for (const match of token.text.matchAll(/!?\[\[([^\]]+)\]\]/g)) add(match[1].split('|')[0], 'wiki')
        for (const match of token.text.matchAll(/(?:^|\s)#([\p{L}\d_/-]+)/gu)) tags.add(match[1])
      }
    })
    note.tags = [...tags].sort()
  }
  const byPath = new Map(), byOriginal = new Map(), byName = new Map()
  const addIndex = (map, name, id) => { const k = key(name); map.set(k, [...new Set([...(map.get(k) || []), id])]) }
  notes.forEach(n => { addIndex(byPath, n.id, n.id); addIndex(byName, path.posix.basename(n.path, path.posix.extname(n.path)), n.id); n.aliases.forEach(a => addIndex(byName, a, n.id)) })
  const originals = new Map(), originalPaths = []
  manifestEntries.forEach(e => {
    if (byPath.has(key(e.path)) && e.original) {
      const orig = normal(e.original)
      addIndex(byOriginal, orig, e.path); originals.set(e.path, orig); originalPaths.push({ id: e.path, path: orig })
      addIndex(byName, path.posix.basename(orig, path.posix.extname(orig)), e.path)
    }
  })
  const byId = new Map(notes.map(n => [n.id, n]))
  // A renamed note still matches when the written path shares a unique directory + filename with its current path or its manifest original.
  function suffixTarget(raw) {
    const rawParts = raw.split('/').filter(Boolean)
    if (rawParts.length < 2) return null
    const hits = new Map()
    const consider = (id, parts, manifest) => {
      let n = 0
      const limit = Math.min(rawParts.length, parts.length)
      while (n < limit && rawParts[rawParts.length - 1 - n].toLowerCase() === parts[parts.length - 1 - n].toLowerCase()) n++
      if (n < 2) return
      const prev = hits.get(id)
      if (!prev || n > prev.n) hits.set(id, { n, manifest })
      else if (n === prev.n && manifest) prev.manifest = true
    }
    for (const note of notes) consider(note.id, note.id.split('/').filter(Boolean), false)
    for (const item of originalPaths) consider(item.id, item.path.split('/').filter(Boolean), true)
    const ranked = [...hits.entries()]
    if (!ranked.length) return null
    const best = Math.max(...ranked.map(([, hit]) => hit.n))
    const top = ranked.filter(([, hit]) => hit.n === best)
    if (top.length > 1) return { reason: 'Ambiguous path', candidates: top.map(([id]) => id) }
    const [id, hit] = top[0]
    const onCurrent = byId.get(id).id.split('/').filter(Boolean)
    let current = 0
    while (current < Math.min(rawParts.length, onCurrent.length) && rawParts[rawParts.length - 1 - current].toLowerCase() === onCurrent[onCurrent.length - 1 - current].toLowerCase()) current++
    return { target: id, provenance: current >= best ? 'path' : hit.manifest ? 'manifest' : 'path' }
  }
  function resolve(ref) {
    const source = byId.get(ref.source)
    let raw
    try { raw = decodeURIComponent(ref.raw.trim()) } catch { return { reason: 'Invalid escaped path' } }
    raw = slash(raw).split('#')[0].split('?')[0]
    if (!raw) return { target: source.id }
    if (/^(?:https?:|mailto:|data:|javascript:)/i.test(raw)) return { ignore: true }
    if (!/\.md$/i.test(raw)) { if (ref.kind !== 'wiki') return { ignore: true }; raw += '.md' }
    // Resolve exact paths before unique short names. Never choose the last duplicate README.
    const candidates = []
    const absolute = /^(?:[a-z]:\/|\/|~\/)/i.test(raw)
    if (!absolute) {
      candidates.push(normal(path.posix.join(path.posix.dirname(source.path), raw)))
      if (!raw.startsWith('.')) {
        if (source.vault) candidates.push(normal(path.posix.join(source.vault, raw)))
        candidates.push(normal(raw))
      }
    }
    for (const candidate of [...new Set(candidates)]) {
      const matches = byPath.get(key(candidate))
      if (matches?.length === 1) return { target: matches[0] }
      if (matches?.length > 1) return { reason: 'Ambiguous path', candidates: matches }
    }
    const historical = absolute ? [normal(raw)] : originals.has(source.id) ? [normal(path.posix.join(path.posix.dirname(originals.get(source.id)), raw))] : []
    for (const candidate of historical) {
      const matches = byOriginal.get(key(candidate))
      if (matches?.length === 1) return { target: matches[0], provenance: 'manifest' }
      if (matches?.length > 1) return { reason: 'Ambiguous original path', candidates: matches }
    }
    if (!raw.includes('/')) {
      const name = raw.replace(/\.md$/i, '')
      const matches = byName.get(key(name))
      if (matches?.length === 1) {
        const target = matches[0]
        const currentBase = path.posix.basename(target, path.posix.extname(target))
        return { target, provenance: key(currentBase) === key(name) ? 'path' : 'manifest' }
      }
      if (matches?.length > 1) return { reason: 'Ambiguous filename', candidates: matches }
    }
    const suffixed = suffixTarget(raw)
    if (suffixed) return suffixed
    return { reason: absolute ? 'Outside the current AI folder' : 'No matching note in AI' }
  }
  const links = [], unresolved = [], seen = new Set()
  for (const ref of rawRefs) {
    const result = resolve(ref)
    if (result.ignore || result.target === ref.source) continue
    const identity = `${ref.source}\0${result.target || ref.raw}\0${ref.kind}`
    if (seen.has(identity)) continue
    seen.add(identity)
    if (result.target) links.push({ source: ref.source, target: result.target, kind: ref.kind, evidence: ref.raw, provenance: result.provenance || 'path' })
    else unresolved.push({ ...ref, reason: result.reason, candidates: result.candidates || [] })
  }
  // A path that matches no file still gets a node, so the graph shows the mention. Ambiguous names already have their files on the graph, so they are not counted again.
  const mentioned = new Map(), open = []
  for (const ref of unresolved) {
    if (ref.reason.startsWith('Ambiguous')) continue
    if (ref.reason === 'Invalid escaped path') { open.push(ref); continue }
    const display = slash(ref.raw.trim()).split('#')[0].split('?')[0]
    const id = `mentioned:${key(display)}`
    if (!mentioned.has(id)) mentioned.set(id, { id, kind: 'note', path: display, label: path.posix.basename(display, '.md') || display, domain: 'mentioned', project: 'outside-folder', noteType: 'mentioned', summary: 'Mentioned in your notes. This file is not in Desktop/AI.', tags: [], preview: display, previewTruncated: false })
    const identity = `${ref.source}\0${id}\0${ref.kind}`
    if (seen.has(identity)) continue
    seen.add(identity)
    links.push({ source: ref.source, target: id, kind: ref.kind, evidence: ref.raw, provenance: 'mentioned' })
  }
  unresolved.length = 0
  unresolved.push(...open)
  const nodes = [{ id: 'hub:ai', label: 'AI MEMORY', kind: 'root', domain: 'global' }]
  const hubs = new Set()
  for (const note of [...notes, ...mentioned.values()]) {
    const domainId = `domain:${note.domain}`, projectId = `project:${note.domain}/${note.project}`
    if (!hubs.has(domainId)) { hubs.add(domainId); nodes.push({ id: domainId, label: note.domain, kind: 'domain', domain: note.domain }); links.push({ source: 'hub:ai', target: domainId, kind: 'structure' }) }
    if (!hubs.has(projectId)) { hubs.add(projectId); nodes.push({ id: projectId, label: note.project, kind: 'project', domain: note.domain, project: note.project }); links.push({ source: domainId, target: projectId, kind: 'structure' }) }
    nodes.push(note); links.push({ source: projectId, target: note.id, kind: 'structure' })
  }
  const referenced = new Set(links.filter(l => l.kind !== 'structure').flatMap(l => [l.source, l.target]))
  return { nodes, links, unresolved, warnings, scannedAt: new Date().toISOString(), stats: { notes: notes.length, domains: nodes.filter(n => n.kind === 'domain').length, projects: nodes.filter(n => n.kind === 'project').length, references: links.filter(l => l.kind !== 'structure').length, structure: links.filter(l => l.kind === 'structure').length, withoutReferences: notes.filter(n => !referenced.has(n.id)).length, explicitLinks: links.filter(l => l.kind === 'wiki' || l.kind === 'markdown').length } }
}

async function readBrain(root) {
  try {
    const { files, manifests, warnings } = await collect(root)
    return { ...await buildGraph(files, manifests, warnings), rootPath: root, error: null }
  } catch (error) {
    return { nodes: [], links: [], unresolved: [], warnings: [], scannedAt: new Date().toISOString(), rootPath: root, stats: { notes: 0, domains: 0, projects: 0, references: 0, structure: 0, withoutReferences: 0, explicitLinks: 0 }, error: error.code === 'ENOENT' ? 'Desktop/AI could not be found. Restore that folder and refresh.' : error.message.includes('first-version limit') ? error.message : 'The AI folder could not be read. Check its permissions and refresh.' }
  }
}
module.exports = { buildGraph, readBrain }
