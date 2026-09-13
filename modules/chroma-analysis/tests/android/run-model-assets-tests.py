#!/usr/bin/env python3
"""Run actual ModelAssetStore with tiny fixtures on the host or --device SERIAL (API 27+)."""
import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--device", help="Run with production Android file metadata on this adb device (API 27+).")
args = parser.parse_args()

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
    main = "com.cheng80.chromaanalysis.ModelAssetStoreTestKt"
    if not args.device:
        runtime = os.pathsep.join([output, json, stdlib, annotations, str(android)])
        subprocess.run(["java", "-Xmx96m", "-cp", runtime, main, str(module)], check=True)
    else:
        adb = ["adb", "-s", args.device]
        api = int(subprocess.check_output(adb + ["shell", "getprop", "ro.build.version.sdk"], text=True).strip())
        if api < 27:
            raise SystemExit("The ART fixture runner requires API 27+; host fixtures cover the no-receipt fallback.")
        jar_path = Path(output) / "fixtures.jar"
        with zipfile.ZipFile(jar_path, "w") as archive:
            for file in Path(output).rglob("*.class"):
                archive.write(file, file.relative_to(output))
        dex = Path(output) / "fixtures.zip"
        d8 = sorted((sdk / "build-tools").glob("*/d8"))[-1]
        subprocess.run([str(d8), "--lib", str(android), "--min-api", "27", "--output", str(dex),
                        str(jar_path), stdlib, annotations], check=True)
        remote = subprocess.check_output(adb + ["shell", "mktemp", "-d",
                                               "/data/local/tmp/chroma-model-assets-XXXXXX"], text=True).strip()
        if not re.fullmatch(r"/data/local/tmp/chroma-model-assets-[A-Za-z0-9]+", remote):
            raise SystemExit("Unexpected fixture directory returned by adb")
        try:
            subprocess.run(adb + ["push", str(dex), str(module / "model-manifest.json"),
                                  str(module / "model-download.json"), remote + "/"], check=True)
            command = "CLASSPATH=" + shlex.quote(remote + "/fixtures.zip") + " " + shlex.join([
                "app_process", "-Xmx96m", "-Djava.io.tmpdir=" + remote, "/system/bin", main, remote])
            subprocess.run(adb + ["shell", command], check=True)
        finally:
            # Only this run's temporary fixtures are removed; no installed app or model files are accessed.
            subprocess.run(adb + ["shell", "rm -rf " + shlex.quote(remote)], check=True)
