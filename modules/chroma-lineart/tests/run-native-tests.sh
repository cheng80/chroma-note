#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 MODEL_URL OUTPUT_DIR" >&2
  exit 64
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENGINE="$SCRIPT_DIR/../ios/LineArtEngine.swift"
RUNNER="$SCRIPT_DIR/LineArtEngineTests.swift"
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/chroma-lineart-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

xcrun --sdk iphoneos swiftc -typecheck -parse-as-library -target arm64-apple-ios17.0 "$ENGINE"
echo "PASS iOS 17 compile"

xcrun --sdk macosx swiftc -O -parse-as-library "$ENGINE" "$RUNNER" -o "$BUILD_DIR/LineArtEngineTests"
"$BUILD_DIR/LineArtEngineTests" "$1" "$2"
