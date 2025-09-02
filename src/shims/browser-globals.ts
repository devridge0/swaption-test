import { Buffer } from 'buffer'

// Polyfill globals required by some libraries when running in the browser
if (typeof window !== 'undefined') {
  if (!(window as any).Buffer) {
    ;(window as any).Buffer = Buffer
  }
}


