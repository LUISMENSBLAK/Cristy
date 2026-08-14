// Type declarations for qz-tray
// QZ Tray is a browser library that exposes a global `qz` object.
// These are the minimal typings needed for USB/raw ESC-POS printing.

declare module 'qz-tray' {
  const qz: QZTray
  export default qz
  export = qz
}

interface QZTray {
  websocket: {
    connect(options?: { host?: string; port?: { secure?: number[]; insecure?: number[] }; retries?: number; delay?: number }): Promise<void>
    disconnect(): Promise<void>
    isActive(): boolean
  }
  printers: {
    find(query?: string): Promise<string | string[]>
    getDefault(): Promise<string>
  }
  configs: {
    create(printer: string, options?: Record<string, any>): QZConfig
  }
  print(config: QZConfig, data: QZPrintData[]): Promise<void>
  security: {
    setCertificatePromise(fn: (resolve: (cert: string) => void, reject: (err: any) => void) => void): void
    setSignatureAlgorithm(algorithm: string): void
    setSignaturePromise(fn: (toSign: string) => (resolve: (sig: string) => void, reject: (err: any) => void) => void): void
  }
}

interface QZConfig {
  // opaque config object returned by qz.configs.create()
  [key: string]: any
}

interface QZPrintData {
  type: 'raw' | 'pixel' | 'html' | 'image' | 'pdf'
  format?: 'plain' | 'base64' | 'hex' | 'file' | 'xml'
  flavor?: 'plain' | 'base64'
  data: string | string[]
  options?: Record<string, any>
}
