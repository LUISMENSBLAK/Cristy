export {}

declare global {
  interface AndroidPrinterDevice {
    deviceName: string
    displayName: string
    manufacturerName?: string | null
    productName?: string | null
    vendorId: number
    productId: number
    hasPermission: boolean
    selected: boolean
    printerClass: boolean
  }

  interface AndroidPrinterBridge {
    isAvailable(): boolean
    listPrinters(): string
    getSelectedPrinter(): string
    selectPrinter(vendorId: number, productId: number, deviceName: string): boolean
    requestPermission(vendorId: number, productId: number, deviceName: string): boolean
    hasPermission(): boolean
    printBase64(base64Data: string, jobId: string): boolean
    getLastError(): string
  }

  interface AndroidPrinterResultDetail {
    jobId: string
    success: boolean
    message: string
    errorCode?: string
  }

  // ── Bluetooth ────────────────────────────────────────────────────────────────

  interface BluetoothPrinterDevice {
    name: string
    address: string
    bonded: boolean
    selected: boolean
  }

  interface AndroidBluetoothPrinterBridge {
    isAvailable(): boolean
    listPrinters(): string
    getSelectedPrinter(): string
    /** Select by MAC address (e.g. "AA:BB:CC:DD:EE:FF") */
    selectPrinter(address: string): boolean
    /** Verifies BLUETOOTH_CONNECT permission; notifies JS via android-bluetooth-printer-permission event */
    requestPermission(): boolean
    hasPermission(): boolean
    printBase64(base64Data: string, jobId: string): boolean
    getLastError(): string
  }

  interface Window {
    AndroidPrinter?: AndroidPrinterBridge
    AndroidBluetoothPrinter?: AndroidBluetoothPrinterBridge
  }

  interface WindowEventMap {
    'android-printer-result': CustomEvent<AndroidPrinterResultDetail>
    'android-printer-devices-changed': CustomEvent<{ reason: string }>
    'android-printer-permission': CustomEvent<{ granted: boolean; message: string }>
    'android-bluetooth-printer-result': CustomEvent<AndroidPrinterResultDetail>
    'android-bluetooth-printer-devices-changed': CustomEvent<{ reason: string }>
    'android-bluetooth-printer-permission': CustomEvent<{ granted: boolean; message: string }>
  }
}
