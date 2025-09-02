import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Global shims for browser
export const ensureBrowserGlobals = () => {
  if (typeof window === 'undefined') return
  // Buffer for libs using Node API
  if (!(window as any).Buffer) {
    try {
      const { Buffer } = require('buffer')
      ;(window as any).Buffer = Buffer
    } catch {}
  }
}