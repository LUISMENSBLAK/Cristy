# Implementación de impresión Android

## Arquitectura

```text
Abaroa POS (Next.js)
  -> WebView seguro en la APK
  -> window.AndroidPrinter
  -> Kotlin / Android USB Host
  -> USB-C OTG
  -> GHIA 58B1 (ESC/POS, 58 mm)
```

## Canales conservados

- `android_usb`: APK Android y USB OTG.
- `usb_qz`: QZ Tray en Windows.
- `red`: endpoint de impresión en red existente.
- `browser`: impresión manual como último recurso únicamente fuera de la APK.

## Archivos principales

- `src/utils/escPos.ts`: generación compartida de bytes ESC/POS y CP850.
- `src/utils/printTicket.ts`: selección de canal y resultado estructurado.
- `src/components/AndroidPrinterPanel.tsx`: detección, selección, permiso y prueba.
- `android-app/`: proyecto nativo Android.
- `supabase/migrations/20260722010000_add_android_usb_printer_mode.sql`: restricción actualizada.

Consulta `android-app/README.md` para compilar, firmar e instalar.
