import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from '3d-force-graph'
import type { ForceGraph3DInstance } from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { Group } from 'three'
import { Focus, RefreshCw, Search, X, ChevronRight, Info, Pause, Play, Maximize2, Minimize2 } from 'lucide-react'
import type { BrainData, BrainLink, BrainNode } from './types'
import { BRAIN_RELEASES } from './version'
import './brain.css'

type PositionedNode = BrainNode & { x?: number; y?: number; z?: number }
type RenderLink = Omit<BrainLink, 'source' | 'target'> & { source: string | PositionedNode; target: string | PositionedNode }
type Graph = ForceGraph3DInstance<PositionedNode, RenderLink>
const palette: Record<string, string> = { global: '#d8e4f6', business: '#f4b881', homelab: '#62d8be', learning: '#f1d57a', 'software-projects': '#8baeff', university: '#bb9df7', personal: '#f1a3c4', finance: '#9cd68f', tools: '#70d6e9', 'Grok Bot History': '#b6a6dc', setup: '#a2b1c7', mentioned: '#e7a090' }
const color = (node: BrainNode) => palette[node.domain] || '#aabbd0'
const relationName: Record<string, string> = { structure: 'Folder / metadata group', wiki: 'Wiki link', markdown: 'Markdown link', source: 'YAML source', mention: 'File mention' }
const endId = (value: string | PositionedNode) => typeof value === 'string' ? value : value.id
const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650

function makeNodeTooltip(node: PositionedNode, graphLinks: BrainLink[]) {
  const card = document.createElement('div')
  card.className = 'brain-tooltip brain-note-tooltip'
  card.setAttribute('role', 'tooltip')
  const title = document.createElement('strong')
  title.textContent = node.label
  card.append(title)

  const detail = document.createElement('span')
  if (node.kind === 'note') {
    detail.textContent = node.summary || node.path || `${node.domain} · ${node.project}`
    card.append(detail)
    if (node.tags?.length) {
      const tags = document.createElement('small')
      tags.textContent = node.tags.map(tag => `#${tag}`).join('  ')
      card.append(tags)
    }
    const referenceCount = graphLinks.filter(link => link.kind !== 'structure' && (link.source === node.id || link.target === node.id)).length
    const count = document.createElement('small')
    count.textContent = `${node.domain} · ${referenceCount} references`
    card.append(count)
  } else {
    const members = node.kind === 'root' ? graphLinks.filter(link => link.kind === 'structure' && link.source === node.id).length
      : graphLinks.filter(link => link.kind === 'structure' && link.source === node.id).length
    detail.textContent = node.kind === 'root' ? `${members} memory areas` : `${members} grouped notes or projects`
    card.append(detail)
  }
  return card
}

function MemoryGraph({ nodes, links, selected, hovered, onSelect, onHover, graphRef, frozen, onError }: {
  nodes: BrainNode[]; links: BrainLink[]; selected: string | null; hovered: string | null; onSelect: (id: string | null) => void; onHover: (id: string | null) => void
  graphRef: React.MutableRefObject<Graph | null>; frozen: boolean; onError: (message: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const fitAfterLayout = useRef(false)
  const selectRef = useRef(onSelect)
  useEffect(() => { selectRef.current = onSelect }, [onSelect])
  const frozenRef = useRef(frozen)
  useEffect(() => { frozenRef.current = frozen }, [frozen])
  useEffect(() => {
    if (!host.current) return
    const element = host.current
    let graph: Graph
    let resumeSpinTimer = 0
    let resumeAfterInactivity = () => {}
    let trackInteraction = (_event: Event) => {}
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lost = (event: Event) => { event.preventDefault(); onError('The 3D renderer stopped. Reload the graph to try again.') }
    try {
      graph = new ForceGraph3D(element, { controlType: 'orbit', rendererConfig: { antialias: true, alpha: false } }) as unknown as Graph
      graphRef.current = graph
      const orbit = graph.controls() as { autoRotate?: boolean; autoRotateSpeed?: number }
      orbit.autoRotateSpeed = 0.25
      orbit.autoRotate = false
      const stopSpin = () => {
        window.clearTimeout(resumeSpinTimer)
        orbit.autoRotate = false
      }
      resumeAfterInactivity = () => {
        stopSpin()
        if (!reducedMotion && !document.hidden) {
          resumeSpinTimer = window.setTimeout(() => {
            if (!document.hidden) orbit.autoRotate = true
          }, 5000)
        }
      }
      trackInteraction = (event: Event) => {
        if (event.type === 'pointerdown' || event.type === 'touchstart') stopSpin()
        else if (event.type !== 'pointermove' || (event as PointerEvent).buttons > 0) resumeAfterInactivity()
      }
      for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) element.addEventListener(event, trackInteraction, { passive: true })
      window.addEventListener('pointerup', trackInteraction)
      window.addEventListener('pointercancel', trackInteraction)
      graph.backgroundColor('#0a101b').showNavInfo(false).nodeResolution(12).nodeOpacity(0.95)
        .nodeColor(node => color(node)).nodeVal(node => node.kind === 'root' ? 36 : node.kind === 'domain' ? 18 : node.kind === 'project' ? 7 : 2.4)
        .nodeLabel(node => makeNodeTooltip(node, links))
        .linkLabel(link => { const el = document.createElement('div'); el.className = 'brain-tooltip'; el.textContent = `${relationName[link.kind]}${link.evidence ? ': ' + link.evidence : ''}`; return el })
        .nodeThreeObjectExtend(true).nodeThreeObject((node: PositionedNode) => {
          if (node.kind === 'note') return new Group()
          const label = new SpriteText(node.label.replaceAll('-', ' '), node.kind === 'root' ? 14 : node.kind === 'domain' ? 10 : 6.5, color(node))
          label.fontFace = 'system-ui'; label.fontWeight = node.kind === 'project' ? '400' : '600'; label.position.y = node.kind === 'root' ? -19 : node.kind === 'domain' ? -15 : -11
          label.material.depthWrite = false
          return label
        })
        .linkOpacity(0.48).linkWidth(link => link.kind === 'structure' ? 0.4 : 0.9)
        .linkColor(link => link.kind === 'structure' ? '#405675' : link.kind === 'mention' ? '#739db7' : link.kind === 'source' ? '#b99be4' : '#72ead0')
        .linkDirectionalArrowLength(link => link.kind === 'structure' ? 0 : 2.4)
        .linkDirectionalArrowRelPos(0.8).warmupTicks(90).cooldownTicks(80)
        .onNodeClick(node => selectRef.current(node.id)).onNodeHover(node => onHover(node?.id || null)).onBackgroundClick(() => selectRef.current(null))
      graph.d3Force('charge')?.strength(-55)
      graph.d3Force('link')?.distance((link: RenderLink) => link.kind === 'structure' ? 40 : 75)
      graph.d3Force('hold', (alpha: number) => {
        const data = graph.graphData()
        const degree = new Map(data.nodes.map(node => [node.id, 0]))
        for (const link of data.links) {
          const source = endId(link.source), target = endId(link.target)
          degree.set(source, (degree.get(source) || 0) + 1)
          degree.set(target, (degree.get(target) || 0) + 1)
        }
        const loose = data.nodes.filter(node => !degree.get(node.id))
        loose.forEach((node, index) => {
          const point = node as PositionedNode & { vx?: number; vy?: number; vz?: number }
          const angle = index / Math.max(loose.length, 1) * Math.PI * 2
          const pull = 0.55 * alpha
          point.vx = (point.vx || 0) + (Math.cos(angle) * 240 - (point.x || 0)) * pull
          point.vy = (point.vy || 0) + (0 - (point.y || 0)) * pull
          point.vz = (point.vz || 0) + (Math.sin(angle) * 240 - (point.z || 0)) * pull
        })
      })
      graph.onEngineStop(() => {
        if (!fitAfterLayout.current) return
        fitAfterLayout.current = false
        graph.zoomToFit(duration(), 90)
      })
      graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      graph.renderer().domElement.addEventListener('webglcontextlost', lost)
    } catch { onError('3D graphics are unavailable. Check graphics acceleration, then reload the graph.'); return }
    const resize = new ResizeObserver(() => { graph.width(element.clientWidth).height(element.clientHeight) })
    resize.observe(element)
    const visibility = () => {
      if (document.hidden) { window.clearTimeout(resumeSpinTimer); graph.pauseAnimation() }
      else { graph.resumeAnimation(); resumeAfterInactivity() }
    }
    document.addEventListener('visibilitychange', visibility)
    resumeAfterInactivity()
    return () => {
      window.clearTimeout(resumeSpinTimer)
      for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) element.removeEventListener(event, trackInteraction)
      window.removeEventListener('pointerup', trackInteraction)
      window.removeEventListener('pointercancel', trackInteraction)
      resize.disconnect(); document.removeEventListener('visibilitychange', visibility)
      graph.renderer().domElement.removeEventListener('webglcontextlost', lost)
      graph._destructor(); graphRef.current = null; element.replaceChildren()
    }
  }, [graphRef, onError, links, onHover])
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    const domains = [...new Set(nodes.map(n => n.domain))].sort()
    const existing = new Map(graph.graphData().nodes.map(n => [n.id, n]))
    const degree = new Map<string, number>()
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) || 0) + 1)
      degree.set(link.target, (degree.get(link.target) || 0) + 1)
    }
    const loose = nodes.filter(node => !degree.get(node.id))
    let looseIndex = 0
    const initial = nodes.map((node, i) => {
      const old = existing.get(node.id)
      if (!degree.get(node.id)) {
        const angle = (looseIndex++ / Math.max(loose.length, 1)) * Math.PI * 2
        return { ...node, x: Math.cos(angle) * 240, y: looseIndex % 2 === 0 ? 36 : -36, z: Math.sin(angle) * 240 }
      }
      const angle = domains.indexOf(node.domain) / Math.max(domains.length, 1) * Math.PI * 2
      const radius = node.kind === 'root' ? 0 : node.kind === 'domain' ? 100 : 160
      return { ...node, x: old?.x ?? Math.cos(angle) * radius + Math.sin(i * 17) * 30, y: old?.y ?? Math.sin(angle) * radius + Math.cos(i * 11) * 30, z: old?.z ?? Math.sin(i * 7) * 80 }
    })
    fitAfterLayout.current = true
    graph.cooldownTicks(frozenRef.current ? 0 : 80).graphData({ nodes: initial, links: links.map(link => ({ ...link })) })
    return () => { fitAfterLayout.current = false }
  }, [nodes, links, graphRef])
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    const focused = selected || hovered
    const adjacent = new Set<string>(focused ? [focused] : [])
    links.filter(l => l.source === focused || l.target === focused).forEach(l => { adjacent.add(l.source); adjacent.add(l.target) })
    graph.nodeColor(node => focused && !adjacent.has(node.id) ? '#8ea3bd' : color(node))
      .linkColor(link => focused ? endId(link.source) === focused || endId(link.target) === focused ? '#b6ffe3' : '#1c2a40' : link.kind === 'structure' ? '#405675' : link.kind === 'mention' ? '#739db7' : link.kind === 'source' ? '#b99be4' : '#72ead0')
      .linkWidth(link => focused && (endId(link.source) === focused || endId(link.target) === focused) ? 1.2 : link.kind === 'structure' ? 0.4 : 0.9)
    if (selected) {
      const node = graph.graphData().nodes.find(n => n.id === selected)
      if (node && node.x !== undefined) graph.cameraPosition({ x: node.x + 50, y: (node.y || 0) + 35, z: (node.z || 0) + 220 }, { x: node.x, y: node.y || 0, z: node.z || 0 }, duration())
    }
  }, [selected, hovered, links, graphRef])
  useEffect(() => { const graph = graphRef.current; if (graph) { graph.cooldownTicks(frozen ? 0 : 80); if (!frozen) graph.d3ReheatSimulation() } }, [frozen, graphRef])
  return <div ref={host} className="brain-canvas" aria-label="Interactive 3D memory graph. Drag to orbit, scroll to zoom, right-drag to pan. Use Find a note for keyboard navigation." role="img" />
}

export default function Brain() {
  const [data, setData] = useState<BrainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [renderError, setRenderError] = useState('')
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('all')
  const [structure, setStructure] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [inspect, setInspect] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [frozen, setFrozen] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const graphRef = useRef<Graph | null>(null)
  const active = useRef(true)
  const load = useCallback(async () => {
    setLoading(true); setError(''); setRenderError('')
    try {
      if (!window.pexx?.getBrain) throw new Error('Open the Pexx Industries desktop app to read Desktop/AI locally.')
      const result = await window.pexx.getBrain()
      if (!active.current) return
      if (result.error) throw new Error(result.error)
      setData(result); setSelected(null); setDomain(current => current === 'all' || result.nodes.some(n => n.domain === current) ? current : 'all')
    } catch (err) { if (active.current) { setData(null); setError(err instanceof Error ? err.message : 'Could not read the AI folder.') } }
    finally { if (active.current) setLoading(false) }
  }, [])
  useEffect(() => { active.current = true; void load(); return () => { active.current = false } }, [load])
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])
  const toggleFullscreen = async () => {
    const stage = stageRef.current
    if (!stage) return
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen()
      else await stage.requestFullscreen()
    } catch { /* Fullscreen can be unavailable in embedded or restricted contexts. */ }
  }
  const domains = useMemo(() => [...new Set(data?.nodes.filter(n => n.kind === 'note').map(n => n.domain))].sort(), [data])
  const visible = useMemo(() => {
    const nodes = (data?.nodes || []).filter(n => (structure || n.kind === 'note') && (domain === 'all' || n.domain === domain))
    const ids = new Set(nodes.map(n => n.id))
    return { nodes, links: (data?.links || []).filter(l => (structure || l.kind !== 'structure') && ids.has(l.source) && ids.has(l.target)) }
  }, [data, domain, structure])
  const matches = useMemo(() => visible.nodes.filter(n => n.kind === 'note' && `${n.label} ${n.path} ${n.tags?.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())), [visible.nodes, query])
  const current = data?.nodes.find(n => n.id === selected)
  const connections = data?.links.filter(l => l.kind !== 'structure' && (l.source === selected || l.target === selected)) || []
  const outgoing = connections.filter(l => l.source === selected)
  const incoming = connections.filter(l => l.target === selected)
  const unresolved = data?.unresolved.filter(r => r.source === selected) || []
  const onSelect = useCallback((id: string | null) => { setSelected(id); setInspect(false); setQuery('') }, [])
  const onHover = useCallback((id: string | null) => setHovered(id), [])
  const onRenderError = useCallback((message: string) => setRenderError(message), [])
  const release = BRAIN_RELEASES[0]
  const reset = () => { setSelected(null); setQuery(''); graphRef.current?.zoomToFit(duration(), 65) }
  return <section className="brain-page" aria-label="Brain memory graph">
    <div className="brain-heading"><div><div className="brain-eyebrow"><span /> LOCAL MEMORY / 3D</div><h1>Brain<span>Everything connects.</span></h1></div><div className="brain-summary" aria-live="polite">{data ? <><strong>{data.stats.notes}</strong> notes <i /> <strong>{data.stats.references}</strong> references <i /> <strong>{data.stats.projects}</strong> projects</> : 'Your AI folder, in view'}</div></div>
    <div ref={stageRef} className="brain-stage">
      {data && data.stats.notes > 0 && !renderError && <MemoryGraph nodes={visible.nodes} links={visible.links} selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} graphRef={graphRef} frozen={frozen} onError={onRenderError} />}
      <div className="brain-toolbar"><div className="brain-search"><Search size={15} /><input aria-label="Find a note" placeholder="Find a note or #tag…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && matches[0]) onSelect(matches[0].id); if (e.key === 'Escape') setQuery('') }} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
        {query.trim() && <div className="brain-results" aria-label="Search results">{matches.length ? matches.slice(0, 12).map(n => <button key={n.id} onClick={() => onSelect(n.id)}><i style={{ background: color(n) }} /><span>{n.label}<small>{n.project}</small></span><ChevronRight size={14} /></button>) : <p>No notes match this search.</p>}{matches.length > 12 && <p>{matches.length} matches · refine your search</p>}</div>}</div>
        <select aria-label="Filter memory area" value={domain} onChange={e => { setDomain(e.target.value); setSelected(null); setQuery('') }}><option value="all">All areas</option>{domains.map(d => <option key={d}>{d}</option>)}</select>
        <button className={structure ? 'enabled' : ''} aria-pressed={structure} onClick={() => { setStructure(s => !s); setSelected(null) }} title="Show folder and metadata groups">Groups</button>
        <span className="brain-toolbar-gap" /><button aria-label="Fit graph" title="Fit graph" onClick={reset}><Focus size={17} /></button><button aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'} title={isFullscreen ? 'Exit full screen' : 'Enter full screen'} aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button aria-label={frozen ? 'Resume layout' : 'Freeze layout'} title={frozen ? 'Resume layout' : 'Freeze layout'} onClick={() => setFrozen(v => !v)}>{frozen ? <Play size={15} /> : <Pause size={15} />}</button><button aria-label="Refresh AI folder" title="Read AI folder again" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'brain-spinning' : ''} /></button>
      </div>
      {(error || renderError || !data || data.stats.notes === 0) && <div className="brain-empty" role="status"><span>◌</span><h2>{loading ? 'Connecting your memory…' : error || renderError ? 'Brain is waiting' : 'No Markdown notes yet'}</h2><p>{error || renderError || (loading ? 'Reading Desktop/AI on this computer.' : 'Add .md files to Desktop/AI, then refresh.')}</p>{!loading && <button onClick={() => void load()}>Reload graph</button>}</div>}
      {data && !error && <div className="brain-legend"><p>MEMORY AREAS</p>{domains.map(d => <button key={d} className={domain !== 'all' && domain !== d ? 'muted' : ''} onClick={() => { setDomain(domain === d ? 'all' : d); setSelected(null); setQuery('') }}><i style={{ background: palette[d] || '#aabbd0' }} />{d.replaceAll('-', ' ')}</button>)}<div className="brain-lines"><span><i className="reference-line" /> Written reference</span>{structure && <span><i className="structure-line" /> Folder / metadata group</span>}</div></div>}
      {current && <aside className="brain-inspector" aria-label="Selected memory"><button className="brain-dismiss" onClick={() => setSelected(null)} aria-label="Close note details"><X size={16} /></button><div className="brain-eyebrow" style={{ color: color(current) }}>{current.kind === 'note' ? current.domain : `${current.kind} GROUP`}</div><h2>{current.label}</h2>{current.kind === 'note' ? <><p className="brain-path">{current.path}</p><div className="brain-note-meta">{current.noteType && <span>{current.noteType}</span>}{current.status && <span>{current.status}</span>}{current.updated && <span>Updated {current.updated}</span>}</div>{current.summary && <p className="brain-note-summary">{current.summary}</p>}<div className="brain-connection-counts"><span>{incoming.length} incoming</span><span>{outgoing.length} outgoing</span></div>{current.tags?.length ? <p className="brain-tags">{current.tags.map(t => `#${t}`).join(' ')}</p> : null}<details><summary>Connections & evidence ({connections.length})</summary><div className="brain-connections">{connections.map((link, i) => { const other = data?.nodes.find(n => n.id === (link.source === selected ? link.target : link.source)); return <button key={i} onClick={() => other && onSelect(other.id)}><strong>{link.source === selected ? '→' : '←'} {other?.label}</strong><small>{relationName[link.kind]}{link.provenance === 'manifest' ? ' · original path in manifest' : link.provenance === 'mentioned' ? ' · not in the AI folder' : ''}</small><code>{link.evidence}</code></button> })}</div></details>{unresolved.length > 0 && <details><summary>{unresolved.length} unresolved references</summary>{unresolved.map((r, i) => <p className="brain-unresolved" key={i}><code>{r.raw}</code><small>{r.reason}</small></p>)}</details>}<details><summary>Markdown preview</summary><pre className="brain-preview">{current.preview}{current.previewTruncated ? '\n\n… Preview limited to 6,000 characters.' : ''}</pre></details></> : <><p className="brain-note-summary">A group from your folder structure and note metadata.</p><div className="brain-connections">{data?.nodes.filter(n => n.kind === 'note' && (current.kind === 'root' || n.domain === current.domain && (current.kind === 'domain' || n.project === current.project))).map(n => <button key={n.id} onClick={() => onSelect(n.id)}>{n.label}</button>)}</div></>}</aside>}
      {inspect && data && <aside className="brain-inspector" aria-label="Graph information"><button className="brain-dismiss" onClick={() => setInspect(false)} aria-label="Close graph information"><X size={16} /></button><div className="brain-eyebrow">GRAPH INFORMATION</div><h2>Built from your files.</h2><p className="brain-note-summary">Every small node is a Markdown file, including files with no connections. Larger nodes group notes by area and project. Connections use wiki links, Markdown links, YAML source fields, and backticked file paths. Original paths resolve through the manifest when available.</p><p className="brain-note-summary">File mentions can include examples or historical references. A file that is not in the AI folder is still drawn, in the mentioned area. Ambiguous names are left unlinked because more than one note uses that name, and those notes are already on the graph.</p><p className="brain-path">{data.rootPath}</p><div className="brain-note-meta"><span>{data.stats.explicitLinks} resolved Markdown / wiki links</span><span>{data.stats.withoutReferences} notes without references</span><span>{data.unresolved.length ? `${data.unresolved.length} unresolved references` : 'All Markdown files are on the graph'}</span></div><p className="brain-note-summary">Read-only · local processing · refresh to load file changes. Previews display plain text.</p>{data.unresolved.length > 0 && <details><summary>Unresolved references ({data.unresolved.length})</summary><div className="brain-connections">{data.unresolved.map((r, i) => <button key={i} onClick={() => { setDomain('all'); onSelect(r.source) }}><strong>{r.raw}</strong><small>{r.reason}</small><small>{r.source}</small></button>)}</div></details>}{data.warnings.length > 0 && <details open><summary>Read warnings ({data.warnings.length})</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}</details>}<details><summary>Version history</summary>{BRAIN_RELEASES.map(r => <p key={r.version}><strong>v{r.version} · {r.date}</strong><br />{r.change}</p>)}</details></aside>}
      <div className="brain-stage-footer"><span>Drag to orbit · scroll to zoom · right-drag to pan · click to explore</span><button aria-label="Graph information" onClick={() => { setInspect(v => !v); setSelected(null) }}><Info size={14} />{data ? (data.unresolved.length ? `${data.unresolved.length} unresolved` : 'All notes shown') : 'About this graph'}</button></div>
    </div>
    <div className="brain-release"><span className="brain-version">BRAIN v{release.version}</span><span><strong>Latest change</strong> {release.change}</span><time>{data ? `Read ${new Date(data.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : release.date}</time></div>
  </section>
}
