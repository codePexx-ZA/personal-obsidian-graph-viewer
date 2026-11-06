import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Brain from './brain/Brain'

class BrainErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Brain graph render failed', error, info.componentStack) }
  render() {
    if (this.state.failed) return <main className="graph-error" role="alert"><p className="graph-error-label">LOCAL MEMORY / 3D</p><h1>Brain could not render.</h1><p>Reload the app to try the graph again. Your Markdown files were not changed.</p><button type="button" onClick={() => window.location.reload()}>Reload Brain</button></main>
    return this.props.children
  }
}

export default function App() {
  return <main className="brain-content"><BrainErrorBoundary><Brain /></BrainErrorBoundary></main>
}
