# Entrega técnica — impresión automática Android

## URL de producción

```text
https://candid-banoffee-d589cc.netlify.app/login
```

La APK carga esta URL mediante `BuildConfig.POS_BASE_URL` y permite navegar únicamente dentro del mismo esquema, host y puerto. En release se exige HTTPS.

## Implementado

- Proyecto Android nativo Kotlin dentro de `android-app/`.
- WebView con cookies/sesión persistentes, pantalla de carga, error de red, reintento, pantalla activa y enlaces externos fuera de la app.
- Puente `window.AndroidPrinter` limitado a métodos de impresión.
- Enumeración de dispositivos USB con endpoint BULK OUT, sin fijar VID/PID.
- Selección persistente en `SharedPreferences`.
- Solicitud oficial de permiso USB de Android.
- Cola de impresión en un único hilo, envíos por bloques y bloqueo de `jobId` duplicados.
- Eventos asíncronos de resultado hacia Next.js.
- Generación ESC/POS compartida para 58 mm.
- CP850 para caracteres españoles.
- Logo rasterizado para Android; si falla, el ticket continúa sin logo.
- QZ Tray conservado para Windows.
- Impresión de red y fallback del navegador conservados fuera de la APK.
- La APK nunca abre `window.print()` cuando falla la impresión USB.
- Caja espera el resultado sin revertir ni repetir el cobro.
- Reimpresión bloqueada mientras otro ticket está activo.
- Panel administrativo Android para buscar, seleccionar, autorizar e imprimir una prueba.
- Migración Supabase para `red`, `bluetooth`, `usb_qz` y `android_usb`.
- Gradle Wrapper 8.9 con verificación SHA-256.
- Flujo de GitHub Actions para generar APK debug.
- Documentación de compilación, firma, instalación y pruebas físicas.

## Validaciones realizadas en esta entrega

Superadas:

- sintaxis de los archivos TypeScript/TSX modificados;
- comprobación semántica aislada de la capa de impresión y componentes modificados;
- pruebas de CP850, concatenación de bytes, hexadecimal, Base64, ancho de texto, generación de ticket y corte;
- análisis sintáctico de Kotlin sin errores de gramática;
- JSON y XML válidos;
- scripts shell válidos;
- checksum correcto de `gradle-wrapper.jar`;
- ausencia de keystores y claves privadas.

No fue posible ejecutar en este entorno:

- `npm ci`, `next build` y ESLint completos, porque el contenedor no pudo descargar dependencias de npm;
- `assembleDebug`/`assembleRelease`, porque no existe Android SDK local y el contenedor no puede resolver los repositorios de Gradle/Google.

Para compensarlo, el repositorio incluye `.github/workflows/build-android-apk.yml` y scripts locales de compilación. La prueba final debe hacerse en la Lenovo Idea Tab y en la GHIA 58B1 real.

## Archivos creados

- `.github/workflows/build-android-apk.yml`
- `IMPLEMENTACION-IMPRESION-ANDROID.md`
- `ENTREGA-TECNICA.md`
- `scripts/test-printing.mjs`
- `src/components/AndroidPrinterPanel.tsx`
- `src/types/android-printer.d.ts`
- `src/utils/escPos.ts`
- `supabase/migrations/20260722010000_add_android_usb_printer_mode.sql`
- proyecto completo `android-app/`

## Archivos principales modificados

- `.gitignore`
- `package.json`
- `src/app/admin/AdminView.tsx`
- `src/app/caja/CajaView.tsx`
- `src/utils/printTicket.ts`

## Puesta en funcionamiento

1. Publica esta versión web en Netlify.
2. Aplica la nueva migración de Supabase.
3. Abre `android-app` en Android Studio y genera `app-debug.apk` para pruebas.
4. Instálala en la Lenovo.
5. Conecta la GHIA por USB-C OTG.
6. En Administración selecciona `USB Android — APK Abaroa POS`.
7. Busca, selecciona y autoriza la impresora.
8. Imprime el ticket de diagnóstico.
9. Cuando la prueba física sea correcta, genera y guarda una release firmada.

Consulta `android-app/README.md` para el procedimiento completo.
