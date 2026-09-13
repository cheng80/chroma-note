#!/usr/bin/env python3
"""Compile only ModelAssetStore and tiny fixtures using cached Kotlin/JDK; never run Gradle."""
import os
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
module = here.parent.parent
cache = Path.home() / ".gradle/caches/modules-2/files-2.1"
sdk = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))


def jar(group, name, version):
    matches = list((cache / group / name / version).glob("*/*.jar"))
    if not matches:
        raise SystemExit(f"Missing cached {name} {version}; prepare Kotlin/JDK dependencies first.")
    return str(matches[0])


stdlib = jar("org.jetbrains.kotlin", "kotlin-stdlib", "2.1.20")
annotations = jar("org.jetbrains", "annotations", "13.0")
compiler = [jar("org.jetbrains.kotlin", name, "2.1.20") for name in
            ["kotlin-compiler-embeddable", "kotlin-script-runtime", "kotlin-reflect"]]
compiler += [stdlib, annotations,
             jar("org.jetbrains.intellij.deps", "trove4j", "1.0.20200330"),
             jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0")]
android = sorted((sdk / "platforms").glob("android-*/android.jar"))[-1]
json = jar("org.json", "json", "20180813")
classpath = os.pathsep.join([stdlib, annotations, str(android), json])
source = module / "android/src/main/java/com/cheng80/chromaanalysis/ModelAssetStore.kt"
with tempfile.TemporaryDirectory(prefix="chroma-model-assets-jvm-") as output:
    subprocess.run(["java", "-cp", os.pathsep.join(compiler),
                    "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect",
                    "-jvm-target", "17", "-classpath", classpath, "-d", output,
                    str(source), str(here / "ModelAssetStoreTest.kt")], check=True)
    runtime = os.pathsep.join([output, json, stdlib, annotations, str(android)])
    subprocess.run(["java", "-Xmx96m", "-cp", runtime,
                    "com.cheng80.chromaanalysis.ModelAssetStoreTestKt", str(module)], check=True)
