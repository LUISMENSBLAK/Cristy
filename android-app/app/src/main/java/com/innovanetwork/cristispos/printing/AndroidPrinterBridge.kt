package com.innovanetwork.cristispos.printing

import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONArray

class AndroidPrinterBridge(
    private val printerManager: UsbEscPosPrinterManager,
) {
    @Volatile
    private var bridgeError: String = ""

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun listPrinters(): String = JSONArray().apply {
        printerManager.listPrinters().forEach { put(it.toJson()) }
    }.toString()

    @JavascriptInterface
    fun getSelectedPrinter(): String = printerManager.selectedPrinter()?.toJson()?.toString().orEmpty()

    @JavascriptInterface
    fun selectPrinter(vendorId: Int, productId: Int, deviceName: String): Boolean =
        printerManager.selectPrinter(vendorId, productId, deviceName)

    @JavascriptInterface
    fun requestPermission(vendorId: Int, productId: Int, deviceName: String): Boolean =
        printerManager.requestPermission(vendorId, productId, deviceName)

    @JavascriptInterface
    fun hasPermission(): Boolean = printerManager.hasPermission()

    @JavascriptInterface
    fun printBase64(base64Data: String, jobId: String): Boolean {
        val bytes = try {
            Base64.decode(base64Data, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            bridgeError = "El ticket recibido no contiene Base64 válido."
            return false
        }
        bridgeError = ""
        return printerManager.enqueue(jobId, bytes)
    }

    @JavascriptInterface
    fun getLastError(): String = bridgeError.ifBlank { printerManager.lastError }
}
