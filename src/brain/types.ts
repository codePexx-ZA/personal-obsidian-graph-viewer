export type BrainNode = {
  id: string; label: string; kind: 'root' | 'domain' | 'project' | 'note'; domain: string
  project?: string; path?: string; noteType?: string; status?: string; updated?: string
  summary?: string; tags?: string[]; preview?: string; previewTruncated?: boolean; modified?: string
}
export type BrainLink = { source: string; target: string; kind: 'structure' | 'wiki' | 'markdown' | 'source' | 'mention'; evidence?: string; provenance?: string }
export type BrainData = {
  nodes: BrainNode[]; links: BrainLink[]
  unresolved: { source: string; raw: string; kind: string; reason: string; candidates: string[] }[]
  warnings: string[]; scannedAt: string; rootPath: string; error: string | null
  stats: { notes: number; domains: number; projects: number; references: number; structure: number; withoutReferences: number; explicitLinks: number }
}
