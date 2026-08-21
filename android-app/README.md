# Abaroa POS para Android

Esta carpeta contiene la aplicación Android nativa que abre el punto de venta web y añade impresión USB ESC/POS sin mostrar el diálogo de impresión de Chrome.

## URL configurada

La compilación de producción carga:

```text
https://candid-banoffee-d589cc.netlify.app/login
```

La URL se define una sola vez en `app/build.gradle.kts`, mediante `BuildConfig.POS_BASE_URL`.

Para usar otra URL al compilar sin editar el archivo:

```bash
./gradlew assembleRelease -PPOS_BASE_URL=https://tu-dominio.com/login
```

Para depuración local desde una tablet conectada a la misma red:

```bash
./gradlew assembleDebug -PDEBUG_POS_URL=http://192.168.1.50:3000/login
```

En una tablet física, `10.0.2.2` no apunta a tu computadora; utiliza la IP local de la computadora. `10.0.2.2` sirve para el emulador oficial de Android.

## Requisitos

- Android Studio con JDK 17.
- Android SDK Platform 35 y Build Tools compatibles.
- Tablet Lenovo Idea Tab con Android 8.0 o posterior.
- Impresora GHIA 58B1.
- Adaptador o hub USB-C OTG. Es preferible un hub con alimentación para mantener cargada la tablet.

## Abrir y compilar

1. Abre Android Studio.
2. Selecciona **Open**.
3. Abre la carpeta `android-app`.
4. Espera la sincronización de Gradle.
5. Para generar una APK de prueba:

```bash
cd android-app
./gradlew assembleDebug
```

La APK queda en:

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

En Windows:

```bat
cd android-app
gradlew.bat assembleDebug
```

## Instalar por ADB

1. En la Lenovo, activa **Opciones de desarrollador** pulsando varias veces **Número de compilación**.
2. Activa **Depuración USB**.
3. Conecta la tablet a la computadora.
4. Acepta la huella RSA en la tablet.
5. Ejecuta:

```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

La variante debug usa el paquete `com.innovanetwork.abaroapos.debug`, separado de la versión final.

## Instalar manualmente sin Play Store

1. Copia el APK a Google Drive, correo, memoria USB o almacenamiento de la tablet.
2. Abre el APK desde **Archivos** o **Descargas**.
3. Android mostrará que esa fuente no tiene permiso para instalar aplicaciones.
4. Abre **Configuración** desde el aviso.
5. Activa **Permitir desde esta fuente** solo para la aplicación desde la que abriste el APK.
6. Regresa y pulsa **Instalar**.

No hace falta publicar la aplicación en Google Play.

## Conectar y autorizar la GHIA 58B1

1. Conecta la impresora al hub USB-C OTG.
2. Conecta el hub a la Lenovo.
3. Abre **Abaroa POS**.
4. Inicia sesión.
5. En Administración, activa la impresora y elige **USB Android — APK Abaroa POS**.
6. Pulsa **Buscar impresoras USB**.
7. Selecciona el dispositivo que corresponda a la GHIA.
8. Pulsa **Autorizar USB**.
9. Acepta el permiso oficial de Android. Cuando Android ofrezca usar siempre ese dispositivo con Abaroa POS, marca esa opción.
10. Pulsa **Imprimir prueba**.
11. Guarda la configuración del negocio.

La selección de la impresora se guarda localmente en la APK. Cada tablet puede seleccionar un dispositivo diferente.

## Qué imprime la prueba

El ticket de diagnóstico comprueba:

- conexión USB;
- caracteres `á é í ó ú Á É Í Ó Ú ñ Ñ ü Ü ¿ ¡`;
- alineación y negrita;
- ancho de 58 mm;
- alimentación final;
- comando de corte, cuando el modelo lo soporta.

## Generar la APK release firmada

Nunca subas una clave real al repositorio. El archivo `keystore.properties` y los archivos `.jks`/`.keystore` están ignorados por Git.

Genera el keystore una sola vez:

```bash
keytool -genkeypair \
  -v \
  -keystore abaroa-release.jks \
  -alias abaroa \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Copia el ejemplo:

```bash
cp keystore.properties.example keystore.properties
```

Completa `keystore.properties`:

```properties
storeFile=/ruta/absoluta/abaroa-release.jks
storePassword=TU_CONTRASEÑA
keyAlias=abaroa
keyPassword=TU_CONTRASEÑA
```

Genera la APK:

```bash
./gradlew assembleRelease
```

Queda en:

```text
android-app/app/build/outputs/apk/release/app-release.apk
```

Si no existe `keystore.properties`, Gradle puede compilar una variante release sin firma instalable. Para entregar a la clienta usa siempre la release firmada.

## Actualizaciones

Para que Android acepte una APK como actualización deben mantenerse:

- `applicationId = com.innovanetwork.abaroapos`;
- el mismo keystore;
- un `versionCode` superior.

Cambia en `app/build.gradle.kts`:

```kotlin
versionCode = 2
versionName = "1.1.0"
```

Después genera otra release firmada e instálala encima de la anterior. La sesión y los datos locales se conservan. Si pierdes el keystore, no podrás actualizar la aplicación instalada con esa firma; tendrías que desinstalarla e instalar una aplicación nueva.

Las modificaciones normales del sitio web no requieren una nueva APK. La APK carga la versión publicada en Netlify cada vez que se abre.

## Obtener VID y PID

En el panel Android se muestran Vendor ID, Product ID y nombre de dispositivo. También puedes consultar Logcat:

```bash
adb logcat | grep -i Abaroa
```

O listar USB por ADB, según las herramientas disponibles:

```bash
adb shell dumpsys usb
```

No se ha fijado un VID/PID en el código. La aplicación enumera interfaces USB Printer y dispositivos vendor-specific con endpoint BULK OUT.

## Diagnóstico con Logcat

En Android Studio abre **Logcat** y filtra por:

```text
AbaroaUsbPrinter
```

Errores posibles:

- `USB_PRINTER_NOT_FOUND`: la impresora seleccionada no está conectada.
- `USB_PERMISSION_REQUIRED`: falta autorizar el USB.
- `USB_ENDPOINT_NOT_FOUND`: Android no encontró salida BULK compatible.
- `USB_OPEN_FAILED`: no pudo abrir el dispositivo.
- `USB_CLAIM_FAILED`: no pudo reclamar la interfaz.
- `USB_TRANSFER_FAILED`: la transferencia se interrumpió.

## Pruebas físicas obligatorias

Antes de instalarlo definitivamente en el negocio, prueba en la Lenovo real:

1. detección de la GHIA conectada por OTG;
2. permiso USB tras desconectar y volver a conectar;
3. ticket de prueba con acentos;
4. ticket real corto y uno con muchos productos;
5. logo, ancho y corte;
6. dos cobros seguidos;
7. doble toque accidental;
8. desconexión de la impresora durante un trabajo;
9. reimpresión sin volver a cobrar;
10. reinicio de la tablet y persistencia de sesión/selección;
11. funcionamiento del hub mientras la tablet se carga.

La compilación automática no sustituye estas pruebas porque dependen del chipset USB y de la implementación ESC/POS exacta de la GHIA 58B1.
