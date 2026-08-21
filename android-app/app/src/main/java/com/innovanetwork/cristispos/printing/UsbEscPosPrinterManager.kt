package com.innovanetwork.cristispos.printing

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import java.io.Closeable
import java.util.LinkedHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

class UsbEscPosPrinterManager(
    context: Context,
    private val listener: Listener,
) : Closeable {

    interface Listener {
        fun onPrintResult(jobId: String, success: Boolean, message: String, errorCode: String? = null)
        fun onDevicesChanged(reason: String)
        fun onPermissionResult(granted: Boolean, message: String)
    }

    private data class OutputTarget(
        val usbInterface: UsbInterface,
        val endpoint: UsbEndpoint,
    )

    private val appContext = context.applicationContext
    private val usbManager = appContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val printExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val permissionAction = "${appContext.packageName}.USB_PERMISSION"
    private val recentJobs = LinkedHashMap<String, Long>()
    private var receiversRegistered = false

    @Volatile
    var lastError: String = ""
        private set

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != permissionAction) return
            val device = intent.usbDeviceExtra()
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) &&
                device != null && usbManager.hasPermission(device)
            lastError = if (granted) "" else "Android no concedió el permiso USB."
            listener.onPermissionResult(
                granted,
                if (granted) "Permiso USB concedido. Ya puedes imprimir automáticamente."
                else "Permiso USB rechazado. Vuelve a autorizar la impresora.",
            )
            listener.onDevicesChanged("permission")
        }
    }

    private val deviceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> listener.onDevicesChanged("attached")
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val detached = intent.usbDeviceExtra()
                    if (detached != null && isSelected(detached)) {
                        lastError = "La impresora USB seleccionada fue desconectada."
                    }
                    listener.onDevicesChanged("detached")
                }
            }
        }
    }

    fun start() {
        if (receiversRegistered) return
        registerReceiverCompat(permissionReceiver, IntentFilter(permissionAction), exported = false)
        val deviceFilter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        registerReceiverCompat(deviceReceiver, deviceFilter, exported = true)
        receiversRegistered = true
    }

    fun listPrinters(): List<UsbPrinterDevice> = usbManager.deviceList.values
        .mapNotNull { device ->
            val target = findOutputTarget(device) ?: return@mapNotNull null
            val manufacturer = safeManufacturer(device)
            val product = safeProduct(device)
            val fallback = "USB ${device.vendorId}:${device.productId}"
            val displayName = listOfNotNull(manufacturer, product).joinToString(" ").trim().ifBlank { fallback }
            UsbPrinterDevice(
                deviceName = device.deviceName,
                displayName = displayName,
                manufacturerName = manufacturer,
                productName = product,
                vendorId = device.vendorId,
                productId = device.productId,
                hasPermission = usbManager.hasPermission(device),
                selected = isSelected(device),
                printerClass = target.usbInterface.interfaceClass == UsbConstants.USB_CLASS_PRINTER,
            )
        }
        .sortedWith(compareByDescending<UsbPrinterDevice> { it.selected }
            .thenByDescending { it.printerClass }
            .thenBy { it.displayName.lowercase() })

    fun selectedPrinter(): UsbPrinterDevice? {
        val selected = findSelectedDevice() ?: return null
        return listPrinters().firstOrNull { it.deviceName == selected.deviceName }
    }

    fun selectPrinter(vendorId: Int, productId: Int, deviceName: String): Boolean {
        val device = findDevice(vendorId, productId, deviceName)
        if (device == null || findOutputTarget(device) == null) {
            lastError = "El dispositivo seleccionado ya no está conectado o no tiene salida USB BULK."
            return false
        }
        preferences.edit()
            .putInt(KEY_VENDOR_ID, vendorId)
            .putInt(KEY_PRODUCT_ID, productId)
            .putString(KEY_DEVICE_NAME, device.deviceName)
            .apply()
        lastError = ""
        listener.onDevicesChanged("selection")
        return true
    }

    fun requestPermission(vendorId: Int, productId: Int, deviceName: String): Boolean {
        val device = findDevice(vendorId, productId, deviceName)
        if (device == null) {
            lastError = "La impresora USB ya no está conectada."
            return false
        }
        if (!selectPrinter(vendorId, productId, deviceName)) return false
        if (usbManager.hasPermission(device)) {
            listener.onPermissionResult(true, "La impresora ya tiene permiso USB.")
            return true
        }

        val permissionIntent = Intent(permissionAction).setPackage(appContext.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pendingIntent = PendingIntent.getBroadcast(appContext, 0, permissionIntent, flags)
        return try {
            usbManager.requestPermission(device, pendingIntent)
            true
        } catch (error: Exception) {
            lastError = "No se pudo solicitar el permiso USB: ${error.message.orEmpty()}"
            Log.e(TAG, lastError, error)
            false
        }
    }

    fun hasPermission(): Boolean = findSelectedDevice()?.let(usbManager::hasPermission) == true

    fun enqueue(jobId: String, bytes: ByteArray): Boolean {
        if (jobId.isBlank()) {
            lastError = "El trabajo de impresión no tiene identificador."
            return false
        }
        if (bytes.isEmpty()) {
            lastError = "El ticket recibido está vacío."
            return false
        }
        if (bytes.size > MAX_JOB_BYTES) {
            lastError = "El ticket supera el tamaño máximo permitido."
            return false
        }
        if (!reserveJob(jobId)) {
            lastError = "El ticket ya fue recibido y se bloqueó para evitar una impresión duplicada."
            return false
        }

        val selected = findSelectedDevice()
        if (selected == null) {
            lastError = "No hay una impresora USB seleccionada o está desconectada."
            listener.onPrintResult(jobId, false, lastError, "USB_PRINTER_NOT_FOUND")
            return true
        }
        if (!usbManager.hasPermission(selected)) {
            lastError = "La impresora no tiene permiso USB. Autorízala desde Configuración."
            listener.onPrintResult(jobId, false, lastError, "USB_PERMISSION_REQUIRED")
            return true
        }

        printExecutor.execute { print(jobId, selected, bytes) }
        return true
    }

    fun notifyInitialDeviceIntent(intent: Intent?) {
        if (intent?.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
            listener.onDevicesChanged("initial-attach")
        }
    }

    private fun print(jobId: String, device: UsbDevice, bytes: ByteArray) {
        val target = findOutputTarget(device)
        if (target == null) {
            reportFailure(jobId, "No se encontró un endpoint USB BULK OUT en la impresora.", "USB_ENDPOINT_NOT_FOUND")
            return
        }

        val connection = usbManager.openDevice(device)
        if (connection == null) {
            reportFailure(jobId, "Android no pudo abrir la conexión con la impresora USB.", "USB_OPEN_FAILED")
            return
        }

        try {
            if (!connection.claimInterface(target.usbInterface, true)) {
                reportFailure(jobId, "No se pudo reclamar la interfaz USB de la impresora.", "USB_CLAIM_FAILED")
                return
            }

            val packetBasedChunk = max(1024, target.endpoint.maxPacketSize * 16)
            val chunkSize = min(4096, packetBasedChunk)
            var offset = 0
            while (offset < bytes.size) {
                val requested = min(chunkSize, bytes.size - offset)
                val transferred = connection.bulkTransfer(
                    target.endpoint,
                    bytes,
                    offset,
                    requested,
                    TRANSFER_TIMEOUT_MS,
                )
                if (transferred <= 0) {
                    reportFailure(
                        jobId,
                        "La transferencia USB se interrumpió en el byte $offset de ${bytes.size}.",
                        "USB_TRANSFER_FAILED",
                    )
                    return
                }
                offset += transferred
                if (offset < bytes.size) Thread.sleep(8)
            }

            Thread.sleep(120)
            lastError = ""
            listener.onPrintResult(jobId, true, "Ticket enviado correctamente a ${safeProduct(device) ?: "la impresora USB"}.")
        } catch (error: Exception) {
            Log.e(TAG, "Error enviando el trabajo $jobId", error)
            reportFailure(jobId, "Error de impresión USB: ${error.message.orEmpty()}", "USB_PRINT_EXCEPTION")
        } finally {
            runCatching { connection.releaseInterface(target.usbInterface) }
            connection.close()
        }
    }

    private fun reportFailure(jobId: String, message: String, errorCode: String) {
        lastError = message
        Log.e(TAG, "$errorCode: $message")
        listener.onPrintResult(jobId, false, message, errorCode)
    }

    private fun findOutputTarget(device: UsbDevice): OutputTarget? {
        val candidates = mutableListOf<OutputTarget>()
        for (interfaceIndex in 0 until device.interfaceCount) {
            val usbInterface = device.getInterface(interfaceIndex)
            for (endpointIndex in 0 until usbInterface.endpointCount) {
                val endpoint = usbInterface.getEndpoint(endpointIndex)
                if (endpoint.direction == UsbConstants.USB_DIR_OUT && endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    candidates += OutputTarget(usbInterface, endpoint)
                }
            }
        }
        return candidates.firstOrNull { it.usbInterface.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
            ?: candidates.firstOrNull()
    }

    private fun findSelectedDevice(): UsbDevice? {
        val vendorId = preferences.getInt(KEY_VENDOR_ID, -1)
        val productId = preferences.getInt(KEY_PRODUCT_ID, -1)
        val deviceName = preferences.getString(KEY_DEVICE_NAME, null).orEmpty()
        if (vendorId < 0 || productId < 0) return null
        return findDevice(vendorId, productId, deviceName)
    }

    private fun findDevice(vendorId: Int, productId: Int, deviceName: String): UsbDevice? {
        val exact = usbManager.deviceList.values.firstOrNull {
            it.vendorId == vendorId && it.productId == productId && it.deviceName == deviceName
        }
        return exact ?: usbManager.deviceList.values.firstOrNull {
            it.vendorId == vendorId && it.productId == productId
        }
    }

    private fun isSelected(device: UsbDevice): Boolean {
        val vendorId = preferences.getInt(KEY_VENDOR_ID, -1)
        val productId = preferences.getInt(KEY_PRODUCT_ID, -1)
        val deviceName = preferences.getString(KEY_DEVICE_NAME, null)
        return device.vendorId == vendorId && device.productId == productId &&
            (deviceName == null || device.deviceName == deviceName)
    }

    private fun reserveJob(jobId: String): Boolean = synchronized(recentJobs) {
        val now = System.currentTimeMillis()
        val iterator = recentJobs.entries.iterator()
        while (iterator.hasNext()) {
            if (now - iterator.next().value > DUPLICATE_WINDOW_MS) iterator.remove()
        }
        if (recentJobs.containsKey(jobId)) return@synchronized false
        recentJobs[jobId] = now
        true
    }

    private fun safeManufacturer(device: UsbDevice): String? = runCatching { device.manufacturerName }
        .getOrNull()?.trim()?.takeIf(String::isNotEmpty)

    private fun safeProduct(device: UsbDevice): String? = runCatching { device.productName }
        .getOrNull()?.trim()?.takeIf(String::isNotEmpty)

    private fun registerReceiverCompat(receiver: BroadcastReceiver, filter: IntentFilter, exported: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(
                receiver,
                filter,
                if (exported) Context.RECEIVER_EXPORTED else Context.RECEIVER_NOT_EXPORTED,
            )
        } else {
            @Suppress("DEPRECATION")
            appContext.registerReceiver(receiver, filter)
        }
    }

    @Suppress("DEPRECATION")
    private fun Intent.usbDeviceExtra(): UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
    } else {
        getParcelableExtra(UsbManager.EXTRA_DEVICE)
    }

    override fun close() {
        printExecutor.shutdownNow()
        if (receiversRegistered) {
            runCatching { appContext.unregisterReceiver(permissionReceiver) }
            runCatching { appContext.unregisterReceiver(deviceReceiver) }
            receiversRegistered = false
        }
    }

    companion object {
        private const val TAG = "CristisUsbPrinter"
        private const val PREFERENCES = "cristis_usb_printer"
        private const val KEY_VENDOR_ID = "vendor_id"
        private const val KEY_PRODUCT_ID = "product_id"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val MAX_JOB_BYTES = 4 * 1024 * 1024
        private const val DUPLICATE_WINDOW_MS = 60_000L
        private const val TRANSFER_TIMEOUT_MS = 5_000
    }
}
