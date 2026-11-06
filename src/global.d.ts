import type { BrainData } from './brain/types'

declare global {
  interface Window {
    pexx?: { getBrain: () => Promise<BrainData> }
  }
}

export {}
