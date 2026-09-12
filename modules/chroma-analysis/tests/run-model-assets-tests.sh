#!/bin/sh
set -eu

TEST_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MODEL_STORE="$TEST_DIR/../ios/ModelAssetStore.swift"
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/chroma-model-assets-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT

xcrun --sdk iphoneos swiftc -typecheck -parse-as-library -target arm64-apple-ios17.0 "$MODEL_STORE"
xcrun --sdk macosx swiftc -parse-as-library "$MODEL_STORE" "$TEST_DIR/ModelAssetStoreTests.swift" -o "$BUILD_DIR/ModelAssetStoreTests"
"$BUILD_DIR/ModelAssetStoreTests"
