#!/usr/bin/env python3
"""Compile actual Kotlin/Expo/Android/ORT APIs and run host checks, without Gradle.

Reuses the installed Android SDK and Gradle dependency cache. Downloads only the
pinned public ORT AAR if absent. All artifacts stay in this module's build folder.
The device checks are compiled here but require the parent's emulator run.
"""
import os
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "modules/chroma-lineart"
BUILD = MODULE / "android/build/standalone-checks"
CACHE = Path.home() / ".gradle/caches/modules-2/files-2.1"
SDK = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))


def jar(group, artifact, version):
    return next((CACHE / group / artifact / version).glob("*/*.jar"))


def classes(aar, name):
    dest = BUILD / f"{name}.jar"
    with zipfile.ZipFile(aar) as archive:
        dest.write_bytes(archive.read("classes.jar"))
    return dest


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    compiler = jar("org.jetbrains.kotlin", "kotlin-compiler-embeddable", "2.1.20")
    stdlib = jar("org.jetbrains.kotlin", "kotlin-stdlib", "2.1.20")
    reflect = jar("org.jetbrains.kotlin", "kotlin-reflect", "2.1.20")
    coroutines = jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.10.2")
    annotations = jar("org.jetbrains", "annotations", "23.0.0")
    trove = jar("org.jetbrains.intellij.deps", "trove4j", "1.0.20200330")
    compiler_cp = os.pathsep.join(map(str, [compiler, stdlib, reflect, coroutines, annotations, trove]))
    ort_aar = BUILD / "onnxruntime-android-1.24.3.aar"
    if not ort_aar.exists():
        with urllib.request.urlopen("https://repo.maven.apache.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/1.24.3/onnxruntime-android-1.24.3.aar", timeout=60) as response:
            with ort_aar.open("wb") as output:
                shutil.copyfileobj(response, output)
    ort = classes(ort_aar, "onnxruntime")
    exif = classes(next((CACHE / "androidx.exifinterface/exifinterface/1.4.1").glob("*/*.aar")), "exifinterface")
    react = classes(next((CACHE / "com.facebook.react/react-android/0.86.3").glob("*/*.aar")), "react")
    expo = ROOT / "node_modules/expo-modules-core/android/build/intermediates/aar_main_jar/release/syncReleaseLibJars/classes.jar"
    platform = SDK / "platforms/android-36/android.jar"
    cp = os.pathsep.join(map(str, [stdlib, coroutines, annotations, platform, ort, exif, react, expo]))
    sources = list((MODULE / "android/src/main/java").rglob("*.kt"))
    sources += list((MODULE / "tests/android").rglob("*.kt"))
    java = shutil.which("java")
    subprocess.run([java, "-cp", compiler_cp, "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect", "-jvm-target", "17", "-classpath", cp,
                    "-d", str(BUILD / "checks.jar"), *map(str, sources)], check=True)
    subprocess.run([java, "-cp", os.pathsep.join(map(str, [BUILD / "checks.jar", stdlib])), "expo.modules.chromalineart.CoreChecksKt", str(BUILD)], check=True)
    print("PASS: all Kotlin sources compile against installed Expo 57, Android 36 and pinned ONNX Runtime; device checks compiled, not run")


if __name__ == "__main__":
    main()
