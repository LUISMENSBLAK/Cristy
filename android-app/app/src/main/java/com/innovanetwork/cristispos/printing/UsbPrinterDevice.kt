package com.innovanetwork.cristispos.printing

import org.json.JSONObject

data class UsbPrinterDevice(
    val deviceName: String,
    val displayName: String,
    val manufacturerName: String?,
    val productName: String?,
    val vendorId: Int,
    val productId: Int,
    val hasPermission: Boolean,
    val selected: Boolean,
    val printerClass: Boolean,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("deviceName", deviceName)
        put("displayName", displayName)
        put("manufacturerName", manufacturerName ?: JSONObject.NULL)
        put("productName", productName ?: JSONObject.NULL)
        put("vendorId", vendorId)
        put("productId", productId)
        put("hasPermission", hasPermission)
        put("selected", selected)
        put("printerClass", printerClass)
    }
}
