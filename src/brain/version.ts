// Graph versions are independent of the dashboard package version.
export const BRAIN_RELEASES = [{
  version: '0.1.6',
  date: '2026-11-05',
  change: 'Added a full-screen graph view with a toolbar toggle and Escape-to-exit support.'
}, {
  version: '0.1.5',
  date: '2026-11-04',
  change: 'Mentioned Markdown files that are not in the AI folder are drawn on the graph. Names shared by more than one note stay unlinked, and those notes stay visible.'
}, {
  version: '0.1.4',
  date: '2026-11-04',
  change: 'Every Markdown file stays on the graph, including notes with no connections. The camera fits them after layout. A renamed file connects when its original path or filename matches only one note.'
}, {
  version: '0.1.3',
  date: '2026-11-04',
  change: "Applied the dashboard kit’s carbon-card style and teal accents to the memory graph."
}, {
  version: '0.1.2',
  date: '2026-11-04',
  change: 'Added slow idle rotation. Graph input stops rotation immediately; after five seconds without input, it resumes. It pauses while the window is hidden and stays off when reduced motion is requested.'
}, {
  version: '0.1.1',
  date: '2026-11-04',
  change: 'Added hover cards, connection spotlight, search, area filters, unresolved-reference details, and version tracking.'
}]
