# JavascriptInterface methods are called by name from the WebView.
-keepclassmembers class com.innovanetwork.abaroapos.printing.AndroidPrinterBridge {
    @android.webkit.JavascriptInterface <methods>;
}
