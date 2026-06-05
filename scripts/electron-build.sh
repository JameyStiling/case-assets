#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:?platform required (mac|win)}"

args=(--"$PLATFORM" --publish never)

if [[ "$PLATFORM" == "mac" ]]; then
  if [[ -n "${MACOS_CERTIFICATE:-}" ]]; then
    export CSC_LINK="$MACOS_CERTIFICATE"
    export CSC_KEY_PASSWORD="${MACOS_CERTIFICATE_PASSWORD:-}"
    export APPLE_ID="${APPLE_ID:-}"
    export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"
    export APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
    args+=(-c.mac.hardenedRuntime=true)
    args+=(-c.mac.entitlements=build/entitlements.mac.plist)
    args+=(-c.mac.entitlementsInherit=build/entitlements.mac.plist)
    echo "macOS code signing enabled"
  else
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    echo "macOS code signing disabled (set MACOS_CERTIFICATE secret to enable)"
  fi
fi

npx electron-builder "${args[@]}"
