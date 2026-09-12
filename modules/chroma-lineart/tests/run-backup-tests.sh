#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HELPER="$SCRIPT_DIR/../ios/PrivateDirectoryBackup.swift"
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/chroma-backup-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

xcrun --sdk iphoneos swiftc -typecheck -parse-as-library -target arm64-apple-ios16.4 "$HELPER"
xcrun --sdk macosx swiftc -parse-as-library "$HELPER" "$SCRIPT_DIR/PrivateDirectoryBackupTests.swift" -o "$BUILD_DIR/PrivateDirectoryBackupTests"
"$BUILD_DIR/PrivateDirectoryBackupTests"
