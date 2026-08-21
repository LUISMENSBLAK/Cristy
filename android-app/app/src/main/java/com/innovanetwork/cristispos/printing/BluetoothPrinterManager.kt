package com.innovanetwork.cristispos.printing

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.Closeable
import java.util.UUID
import java.util.LinkedHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class BluetoothPrinterManager(
    context: Context,
    private val listener: Listener,
) : Closeable {

    interface Listener {
        fun onPrintResult(jobId: String, success: Boolean, message: String, errorCode: String? = null)
        fun onDevicesChanged(reason: String)
        fun onPermissionResult(granted: Boolean, message: String)
    }

    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val printExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val recentJobs = LinkedHashMap<String, Long>()

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val manager = appContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        manager?.adapter
    }

    @Volatile
    var lastError: String = ""
        private set

    @Volatile
    private var activeSocket: BluetoothSocket? = null

    /** Check whether the app has the necessary runtime Bluetooth permissions. */
    fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true // Legacy — permission granted at install time
        }
    }

    /** Return all currently bonded (paired) Bluetooth devices. */
    fun listPrinters(): List<BluetoothPrinterDevice> {
        if (!hasConnectPermission()) return emptyList()
        val adapter = bluetoothAdapter ?: return emptyList()
        val selectedAddress = preferences.getString(KEY_ADDRESS, null)
        return try {
            @Suppress("MissingPermission")
            adapter.bondedDevices.orEmpty()
                .map { device ->
                    BluetoothPrinterDevice(
                        name = device.name ?: device.address,
                        address = device.address,
                        bonded = true,
                        selected = device.address == selectedAddress,
                    )
                }
                .sortedWith(compareByDescending<BluetoothPrinterDevice> { it.selected }
                    .thenBy { it.name.lowercase() })
        } catch (error: Exception) {
            Log.e(TAG, "Error listing bonded devices", error)
            emptyList()
        }
    }

    fun selectedPrinter(): BluetoothPrinterDevice? {
        val address = preferences.getString(KEY_ADDRESS, null) ?: return null
        return listPrinters().firstOrNull { it.address == address }
    }

    fun selectPrinter(address: String): Boolean {
        if (!hasConnectPermission()) {
            lastError = "Falta el permiso Bluetooth. Otórgalo desde Configuración."
            return false
        }
        val adapter = bluetoothAdapter
        if (adapter == null) {
            lastError = "Este dispositivo no tiene Bluetooth."
            return false
        }
        @Suppress("MissingPermission")
        val device = adapter.bondedDevices?.firstOrNull { it.address == address }
        if (device == null) {
            lastError = "No se encontró un dispositivo Bluetooth emparejado con la dirección $address."
            return false
        }
        preferences.edit().putString(KEY_ADDRESS, address).apply()
        lastError = ""
        listener.onDevicesChanged("selection")
        return true
    }

    /**
     * For Bluetooth there is no OS-level "request permission" dialog for individual devices
     * (pairing is done from system Settings). This method just checks and reports the result.
     */
    fun requestPermission(): Boolean {
        val granted = hasConnectPermission()
        lastError = if (granted) "" else "Falta el permiso BLUETOOTH_CONNECT. Concédelo en Configuración → Aplicaciones → Cristi\'s POS → Permisos."
        listener.onPermissionResult(
            granted,
            if (granted) "Permiso Bluetooth disponible. Ya puedes imprimir." else lastError,
        )
        return granted
    }

    fun hasPermission(): Boolean = hasConnectPermission()

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
        if (!hasConnectPermission()) {
            lastError = "Falta el permiso BLUETOOTH_CONNECT."
            listener.onPrintResult(jobId, false, lastError, "BT_PERMISSION_REQUIRED")
            return true
        }

        val address = preferences.getString(KEY_ADDRESS, null)
        if (address.isNullOrBlank()) {
            lastError = "No hay una impresora Bluetooth seleccionada."
            listener.onPrintResult(jobId, false, lastError, "BT_PRINTER_NOT_FOUND")
            return true
        }

        printExecutor.execute { print(jobId, address, bytes) }
        return true
    }

    private fun print(jobId: String, address: String, bytes: ByteArray) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            reportFailure(jobId, "El dispositivo no tiene Bluetooth.", "BT_NO_ADAPTER")
            return
        }

        @Suppress("MissingPermission")
        val remoteDevice = try {
            adapter.getRemoteDevice(address)
        } catch (error: Exception) {
            reportFailure(jobId, "Dirección Bluetooth inválida: $address.", "BT_INVALID_ADDRESS")
            return
        }

        // Try to reuse an existing socket; if it's broken, reconnect once.
        var socket = activeSocket
        var connected = isSocketConnected(socket)

        if (!connected) {
            socket = connectSocket(remoteDevice)
            if (socket == null) {
                // One automatic retry
                Log.w(TAG, "First connect attempt failed; retrying…")
                Thread.sleep(800)
                socket = connectSocket(remoteDevice)
            }
            if (socket == null) {
                reportFailure(jobId, "No se pudo conectar con la impresora Bluetooth. Asegúrate de que esté encendida y en rango.", "BT_CONNECT_FAILED")
                return
            }
            activeSocket = socket
            connected = true
        }

        try {
            socket!!.outputStream.write(bytes)
            socket.outputStream.flush()
            Thread.sleep(120)
            lastError = ""
            @Suppress("MissingPermission")
            val deviceName = remoteDevice.name ?: address
            listener.onPrintResult(jobId, true, "Ticket enviado correctamente a $deviceName.")
        } catch (error: Exception) {
            Log.e(TAG, "Error writing to Bluetooth socket for job $jobId", error)
            // Socket may be stale — clear it so the next job reconnects
            runCatching { activeSocket?.close() }
            activeSocket = null
            reportFailure(jobId, "Error de impresión Bluetooth: ${error.message.orEmpty()}", "BT_PRINT_EXCEPTION")
        }
    }

    @Suppress("MissingPermission")
    private fun connectSocket(device: android.bluetooth.BluetoothDevice): BluetoothSocket? {
        return try {
            val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            // Cancel any ongoing discovery to speed up connection
            bluetoothAdapter?.cancelDiscovery()
            socket.connect()
            socket
        } catch (error: Exception) {
            Log.e(TAG, "createRfcommSocket / connect failed: ${error.message}")
            null
        }
    }

    private fun isSocketConnected(socket: BluetoothSocket?): Boolean {
        if (socket == null) return false
        return try {
            socket.isConnected
        } catch (_: Exception) {
            false
        }
    }

    private fun reportFailure(jobId: String, message: String, errorCode: String) {
        lastError = message
        Log.e(TAG, "$errorCode: $message")
        listener.onPrintResult(jobId, false, message, errorCode)
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

    override fun close() {
        printExecutor.shutdownNow()
        runCatching { activeSocket?.close() }
        activeSocket = null
    }

    companion object {
        private const val TAG = "CristisBtPrinter"
        private const val PREFERENCES = "cristis_bluetooth_printer"
        private const val KEY_ADDRESS = "bt_address"
        private const val MAX_JOB_BYTES = 4 * 1024 * 1024
        private const val DUPLICATE_WINDOW_MS = 60_000L
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }
}
