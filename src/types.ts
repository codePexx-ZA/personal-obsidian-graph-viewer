export type Note = {
  id: string
  name: string
  path: string
  content: string
  tags: string[]
}

export type Link = {
  source: string
  target: string
  unresolved?: boolean
}

export type GraphData = {
  notes: Note[]
  links: Link[]
  rootName: string
}
