import type { MicroazzApi } from './index'

declare global {
  interface Window {
    microazz: MicroazzApi
  }
}

export {}
