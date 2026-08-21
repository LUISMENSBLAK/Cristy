package com.innovanetwork.cristispos

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.innovanetwork.cristispos.printing.AndroidBluetoothPrinterBridge
import com.innovanetwork.cristispos.printing.AndroidPrinterBridge
import com.innovanetwork.cristispos.printing.BluetoothPrinterManager
import com.innovanetwork.cristispos.printing.UsbEscPosPrinterManager
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorContainer: View
    private lateinit var errorTitle: TextView
    private lateinit var errorMessage: TextView
    private lateinit var printerManager: UsbEscPosPrinterManager
    private lateinit var bluetoothPrinterManager: BluetoothPrinterManager
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var renderProcessGone = false
    private val trustedUri: Uri by lazy { Uri.parse(BuildConfig.POS_BASE_URL) }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = filePathCallback ?: return@registerForActivityResult
        callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        filePathCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        errorContainer = findViewById(R.id.errorContainer)
        errorTitle = findViewById(R.id.errorTitle)
        errorMessage = findViewById(R.id.errorMessage)
        findViewById<Button>(R.id.retryButton).setOnClickListener { retryPos() }

        printerManager = UsbEscPosPrinterManager(this, object : UsbEscPosPrinterManager.Listener {
            override fun onPrintResult(jobId: String, success: Boolean, message: String, errorCode: String?) {
                dispatchEvent(
                    "android-printer-result",
                    JSONObject().apply {
                        put("jobId", jobId)
                        put("success", success)
                        put("message", message)
                        if (errorCode != null) put("errorCode", errorCode)
                    },
                )
            }

            override fun onDevicesChanged(reason: String) {
                dispatchEvent(
                    "android-printer-devices-changed",
                    JSONObject().put("reason", reason),
                )
            }

            override fun onPermissionResult(granted: Boolean, message: String) {
                dispatchEvent(
                    "android-printer-permission",
                    JSONObject().put("granted", granted).put("message", message),
                )
            }
        })
        printerManager.start()
        printerManager.notifyInitialDeviceIntent(intent)

        bluetoothPrinterManager = BluetoothPrinterManager(this, object : BluetoothPrinterManager.Listener {
            override fun onPrintResult(jobId: String, success: Boolean, message: String, errorCode: String?) {
                dispatchEvent(
                    "android-bluetooth-printer-result",
                    JSONObject().apply {
                        put("jobId", jobId)
                        put("success", success)
                        put("message", message)
                        if (errorCode != null) put("errorCode", errorCode)
                    },
                )
            }

            override fun onDevicesChanged(reason: String) {
                dispatchEvent(
                    "android-bluetooth-printer-devices-changed",
                    JSONObject().put("reason", reason),
                )
            }

            override fun onPermissionResult(granted: Boolean, message: String) {
                dispatchEvent(
                    "android-bluetooth-printer-permission",
                    JSONObject().put("granted", granted).put("message", message),
                )
            }
        })

        // Request Bluetooth runtime permissions (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val missing = mutableListOf<String>()
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                missing += Manifest.permission.BLUETOOTH_CONNECT
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                missing += Manifest.permission.BLUETOOTH_SCAN
            }
            if (missing.isNotEmpty()) {
                ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQUEST_CODE_BLUETOOTH)
            }
        }

        configureWebView()
        configureBackNavigation()

        if (!BuildConfig.DEBUG && trustedUri.scheme != "https") {
            showError("Configuración insegura", "La URL de producción de Cristi\'s POS debe utilizar HTTPS.")
            return
        }

        if (savedInstanceState == null) {
            loadPos()
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            WebView.startSafeBrowsing(this, null)
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString CristisPOSAndroid/${BuildConfig.VERSION_NAME}"
        }

        webView.addJavascriptInterface(AndroidPrinterBridge(printerManager), "AndroidPrinter")
        webView.addJavascriptInterface(AndroidBluetoothPrinterBridge(bluetoothPrinterManager), "AndroidBluetoothPrinter")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                val chooserIntent = runCatching { fileChooserParams?.createIntent() }.getOrNull()
                    ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                return try {
                    fileChooserLauncher.launch(chooserIntent)
                    true
                } catch (_: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback?.onReceiveValue(null)
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                if (isTrusted(uri)) return false
                openExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
                errorContainer.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                if (url != null && isTrusted(Uri.parse(url))) {
                    errorContainer.visibility = View.GONE
                    CookieManager.getInstance().flush()
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                if (request?.isForMainFrame == true) {
                    showError(
                        "No se pudo abrir el punto de venta",
                        error?.description?.toString().orEmpty().ifBlank {
                            "Comprueba la conexión a internet y vuelve a intentarlo."
                        },
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 500) {
                    showError(
                        "El servidor no respondió correctamente",
                        "Cristi\'s POS devolvió el error HTTP ${errorResponse?.statusCode}. Pulsa Reintentar.",
                    )
                }
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                handler?.cancel()
                showError(
                    "Certificado de seguridad inválido",
                    "La aplicación bloqueó la conexión porque el certificado HTTPS no es válido.",
                )
            }

            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                renderProcessGone = true
                showError(
                    "La vista del punto de venta se cerró",
                    "Android liberó el proceso web. Pulsa Reintentar para restaurarlo.",
                )
                return true
            }
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    errorContainer.visibility == View.VISIBLE -> retryPos()
                    webView.canGoBack() -> webView.goBack()
                    else -> finish()
                }
            }
        })
    }

    private fun retryPos() {
        if (renderProcessGone) {
            recreate()
        } else {
            loadPos()
        }
    }

    private fun loadPos() {
        errorContainer.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        webView.loadUrl(BuildConfig.POS_BASE_URL)
    }

    private fun isTrusted(uri: Uri): Boolean {
        val schemeMatches = uri.scheme.equals(trustedUri.scheme, ignoreCase = true)
        val hostMatches = uri.host.equals(trustedUri.host, ignoreCase = true)
        val portMatches = effectivePort(uri) == effectivePort(trustedUri)
        return schemeMatches && hostMatches && portMatches
    }

    private fun effectivePort(uri: Uri): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> 443
        uri.scheme.equals("http", ignoreCase = true) -> 80
        else -> -1
    }

    private fun openExternal(uri: Uri) {
        val intent = when (uri.scheme?.lowercase()) {
            "tel", "mailto", "sms" -> Intent(Intent.ACTION_VIEW, uri)
            else -> Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        }
        runCatching { startActivity(intent) }
    }

    private fun showError(title: String, message: String) {
        runOnUiThread {
            progressBar.visibility = View.GONE
            errorTitle.text = title
            errorMessage.text = message
            errorContainer.visibility = View.VISIBLE
        }
    }

    private fun dispatchEvent(eventName: String, detail: JSONObject) {
        val script = "window.dispatchEvent(new CustomEvent(${JSONObject.quote(eventName)}, { detail: ${detail} }));"
        runOnUiThread {
            if (!isDestroyed && ::webView.isInitialized) {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        printerManager.notifyInitialDeviceIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CODE_BLUETOOTH) {
            val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            bluetoothPrinterManager.requestPermission() // Notify JS side of final state
        }
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        printerManager.close()
        bluetoothPrinterManager.close()
        webView.removeJavascriptInterface("AndroidPrinter")
        webView.removeJavascriptInterface("AndroidBluetoothPrinter")
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_CODE_BLUETOOTH = 1001
    }
}
