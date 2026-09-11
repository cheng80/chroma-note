#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
EXTRACTOR="$SCRIPT_DIR/../ios/PaletteExtractor.swift"
RUNNER="$SCRIPT_DIR/PaletteExtractorTests.swift"
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/chroma-palette-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

xcrun --sdk iphoneos swiftc -typecheck -parse-as-library -target arm64-apple-ios16.4 "$EXTRACTOR"
echo "PASS iOS 16.4 compile"

xcrun --sdk macosx swiftc -O -parse-as-library "$EXTRACTOR" "$RUNNER" -o "$BUILD_DIR/PaletteExtractorTests"
"$BUILD_DIR/PaletteExtractorTests"
