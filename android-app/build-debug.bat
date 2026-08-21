@echo off
setlocal
cd /d "%~dp0"
call gradlew.bat --no-daemon clean assembleDebug
if errorlevel 1 exit /b %errorlevel%
echo.
echo APK generada en: %CD%\app\build\outputs\apk\debug\app-debug.apk
