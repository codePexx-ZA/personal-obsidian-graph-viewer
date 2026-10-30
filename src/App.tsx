import { useMemo, useState } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type { Core, ElementDefinition, EventObjectNode } from 'cytoscape'
import { readGraph } from './markdown'
import type { GraphData, Note } from './types'

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
}

const emptyGraph: GraphData = { notes: [], links: [], rootName: '' }

function makeElements(graph: GraphData, search: string): ElementDefinition[] {
  const query = search.trim().toLowerCase()
  const matchingIds = new Set(
    graph.notes
      .filter((note) => !query || note.name.toLowerCase().includes(query) || note.tags.some((tag) => tag.includes(query)))
      .map((note) => note.id),
  )
  const nodes = graph.notes.map((note) => ({
    data: { id: note.id, label: note.name, note },
    classes: query && !matchingIds.has(note.id) ? 'dimmed' : '',
  }))
  const missing = new Map<string, string>()
  for (const link of graph.links.filter((candidate) => candidate.unresolved)) {
    missing.set(link.target, link.target.replace('missing:', ''))
  }
  const missingNodes = [...missing].map(([id, label]) => ({ data: { id, label }, classes: 'missing' }))
  const edges = graph.links.map((link, index) => ({
    data: { id: `${link.source}-${link.target}-${index}`, source: link.source, target: link.target },
  }))
  return [...nodes, ...missingNodes, ...edges]
}

function countLinks(graph: GraphData, id: string) {
  return {
    outgoing: graph.links.filter((link) => link.source === id).length,
    incoming: graph.links.filter((link) => link.target === id).length,
  }
}

export default function App() {
  const [graph, setGraph] = useState<GraphData>(emptyGraph)
  const [selected, setSelected] = useState<Note | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Choose a Markdown folder to begin.')

  const elements = useMemo(() => makeElements(graph, search), [graph, search])
  const selectedCounts = selected ? countLinks(graph, selected.id) : null
  const tags = [...new Set(graph.notes.flatMap((note) => note.tags))].sort()

  async function chooseFolder() {
    if (!window.showDirectoryPicker) {
      setStatus('This browser does not support folder selection. Use Chrome or Edge for this local-first prototype.')
      return
    }
    try {
      setStatus('Reading Markdown files locally…')
      const directory = await window.showDirectoryPicker()
      const nextGraph = await readGraph(directory)
      setGraph(nextGraph)
      setSelected(null)
      setStatus(`Indexed ${nextGraph.notes.length} notes and ${nextGraph.links.length} links from ${nextGraph.rootName}.`)
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        setStatus('Folder selection was cancelled.')
      } else {
        setStatus('The folder could not be read. Please try again.')
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LOCAL-FIRST MARKDOWN GRAPH</p>
          <h1>Threadline</h1>
        </div>
        <button className="primary-button" type="button" onClick={chooseFolder}>Choose notes folder</button>
      </header>

      <section className="intro">
        <div>
          <h2>Your files, made navigable.</h2>
          <p>Threadline reads Markdown on your device and visualises its links. It does not upload, modify, or sync your notes.</p>
        </div>
        <p className="status" aria-live="polite">{status}</p>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <label htmlFor="search">Find a note or tag</label>
          <input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. project or #ideas" />
          <div className="metrics">
            <span><strong>{graph.notes.length}</strong> notes</span>
            <span><strong>{graph.links.length}</strong> links</span>
            <span><strong>{graph.links.filter((link) => link.unresolved).length}</strong> missing</span>
          </div>
          <div className="tag-section">
            <p className="section-label">Tags</p>
            <div className="tags">
              {tags.length ? tags.map((tag) => <button key={tag} type="button" onClick={() => setSearch(tag)}>#{tag}</button>) : <span>No tags indexed yet.</span>}
            </div>
          </div>
          <p className="legend"><i className="legend-dot" /> note <i className="legend-dot missing-dot" /> missing link</p>
        </aside>

        <div className="graph-panel">
          {graph.notes.length ? (
            <CytoscapeComponent
              elements={elements}
              style={{ width: '100%', height: '100%' }}
              layout={{ name: 'cose', animate: false, padding: 48, nodeRepulsion: 9000 }}
              stylesheet={[
                { selector: 'node', style: { label: 'data(label)', color: '#e7edf3', 'font-size': 11, 'text-valign': 'bottom', 'text-margin-y': 7, 'background-color': '#91d5bd', width: 18, height: 18 } },
                { selector: 'node.dimmed', style: { opacity: 0.18 } },
                { selector: 'node.missing', style: { 'background-color': '#f6b27a', shape: 'diamond' } },
                { selector: 'edge', style: { width: 1.2, 'line-color': '#46616d', opacity: 0.72, 'curve-style': 'bezier' } },
              ]}
              cy={(cy: Core) => cy.on('tap', 'node', (event: EventObjectNode) => {
                const note = event.target.data('note') as Note | undefined
                if (note) setSelected(note)
              })}
            />
          ) : <div className="empty-graph"><span>◌</span><p>Choose a folder to draw its connections.</p></div>}
        </div>

        <aside className="detail-panel">
          {selected ? <>
            <p className="eyebrow">SELECTED NOTE</p>
            <h2>{selected.name}</h2>
            <p className="path">{selected.path}</p>
            <div className="connection-counts"><span>{selectedCounts?.incoming} backlinks</span><span>{selectedCounts?.outgoing} outgoing</span></div>
            {selected.tags.length > 0 && <div className="tags">{selected.tags.map((tag) => <button key={tag} type="button" onClick={() => setSearch(tag)}>#{tag}</button>)}</div>}
            <article className="preview"><pre>{selected.content.slice(0, 1800)}{selected.content.length > 1800 ? '\n…' : ''}</pre></article>
          </> : <div className="empty-detail"><p className="eyebrow">NOTE PREVIEW</p><h2>Pick a node</h2><p>Its path, connections, tags, and Markdown preview will appear here.</p></div>}
        </aside>
      </section>
    </main>
  )
}
