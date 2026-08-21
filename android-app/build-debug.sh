#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
./gradlew --no-daemon clean assembleDebug
printf '\nAPK generada en: %s\n' "$PWD/app/build/outputs/apk/debug/app-debug.apk"
