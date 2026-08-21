package com.innovanetwork.cristispos.printing

import org.json.JSONObject

data class BluetoothPrinterDevice(
    val name: String,
    val address: String,
    val bonded: Boolean,
    val selected: Boolean,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("name", name)
        put("address", address)
        put("bonded", bonded)
        put("selected", selected)
    }
}
