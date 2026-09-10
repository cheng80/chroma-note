"""Build a separate local device benchmark with an existing wildcard development profile."""
import argparse
import hashlib
import json
import plistlib
import shutil
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--profile", type=Path, required=True)
    p.add_argument("--identity", required=True)
    p.add_argument("--model", type=Path, help="Compiled model; defaults to the first phone experiment")
    args = p.parse_args()
    if args.output.exists():
        p.error("Use a new build output directory")
    profile = plistlib.loads(subprocess.check_output(["security", "cms", "-D", "-i", str(args.profile)], stderr=subprocess.DEVNULL))
    assert profile["Entitlements"]["application-identifier"].endswith(".*"), "Wildcard profile required"
    assert args.identity.upper() in [hashlib.sha1(c).hexdigest().upper() for c in profile["DeveloperCertificates"]]
    app = args.output.resolve() / "LineArtBench.app"
    app.mkdir(parents=True)
    bundle = "com.cheng80.LineArtBench"
    source = Path(__file__).with_name("LineArtBench.swift")
    sdk = subprocess.check_output(["xcrun", "--sdk", "iphoneos", "--show-sdk-path"], text=True).strip()
    subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-O", "-parse-as-library", "-sdk", sdk,
                    "-target", "arm64-apple-ios17.0", str(source), "-o", str(app / "LineArtBench")], check=True)
    info = {"CFBundleExecutable": "LineArtBench", "CFBundleIdentifier": bundle,
            "CFBundleName": "LineArtBench", "CFBundleDisplayName": "선화 시간 측정",
            "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "1.0", "CFBundleVersion": "1",
            "CFBundleSupportedPlatforms": ["iPhoneOS"], "LSRequiresIPhoneOS": True,
            "MinimumOSVersion": "17.0", "UIDeviceFamily": [1, 2], "UILaunchScreen": {},
            "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"]}
    (app / "Info.plist").write_bytes(plistlib.dumps(info))
    shutil.copytree(args.model or args.data / "coreml-fp16/LineArt.mlmodelc", app / "LineArt.mlmodelc")
    manifest = json.loads((args.data / "inputs.json").read_text())
    for case in manifest["cases"]:
        original = args.data / case["input"]
        assert hashlib.sha256(original.read_bytes()).hexdigest() == case["sha256"]
        shutil.copy2(original, app / original.name)
        normalized = args.data / "style1-detail" / f"{case['id']}-input.png"
        shutil.copy2(normalized, app / normalized.name)
    shutil.copy2(args.profile, app / "embedded.mobileprovision")
    entitlements = profile["Entitlements"]
    entitlements["application-identifier"] = entitlements["application-identifier"][:-1] + bundle
    entitlements["keychain-access-groups"] = [entitlements["application-identifier"]]
    entitlements_path = args.output / "entitlements.plist"
    entitlements_path.write_bytes(plistlib.dumps(entitlements))
    subprocess.run(["codesign", "--force", "--sign", args.identity, "--entitlements", str(entitlements_path), str(app)], check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    hashes = {str(f.relative_to(app)): hashlib.sha256(f.read_bytes()).hexdigest()
              for f in sorted(app.rglob("*")) if f.is_file() and f.name != "embedded.mobileprovision"}
    (args.output / "build.json").write_text(json.dumps({"bundle_id": bundle, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sdk": sdk, "optimization": "-O", "files_sha256": hashes}, indent=2) + "\n")
    print(app)


if __name__ == "__main__":
    main()
