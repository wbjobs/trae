declare module 'trpc-nuxt'
declare module 'trpc-nuxt/client'
declare module 'trpc-nuxt/server'

declare module '#imports' {
  import type { H3Event } from 'h3'
  export function useRuntimeConfig(): any
  export function defineNuxtPlugin(callback: (nuxtApp: any) => void | { provide: any }): void
  export function defineEventHandler(handler: (event: H3Event) => any): any
  export function readBody(event: H3Event): Promise<any>
  export function getQuery(event: H3Event): any
  export function useNuxtApp(): any
  export function useRouter(): any
  export function useRoute(): any
  export function computed<T>(getter: () => T): { value: T }
  export function ref<T>(value: T): { value: T }
  export function watch(source: any, callback: any, options?: any): void
  export function onMounted(callback: () => void): void
  export function onUnmounted(callback: () => void): void
  export function useState<T>(key: string, init?: () => T): { value: T }
  export function setHeader(event: H3Event, name: string, value: string): void
  export function sendStream(event: H3Event, stream: ReadableStream): any
}

declare module 'h3' {
  export function eventHandler(handler: (event: H3Event) => any): any
  export function setHeader(event: H3Event, name: string, value: string): void
  export function sendStream(event: H3Event, stream: ReadableStream): any
  export function readBody(event: H3Event): Promise<any>
  export function getQuery(event: H3Event): any
  export interface H3Event {
    node: {
      req: any
      res: any
    }
  }
}
