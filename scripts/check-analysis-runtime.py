"""Check iPhone GPU backend linkage and same-size runtime library replacement."""

import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[1]
prepare = runpy.run_path(str(root / "scripts/prepare-analysis-runtime.py"))
with TemporaryDirectory() as temporary:
    source, target = Path(temporary) / "new.a", Path(temporary) / "staged.a"
    source.write_bytes(b"metal")
    target.write_bytes(b"old!!")
    os.utime(target, ns=(source.stat().st_atime_ns, source.stat().st_mtime_ns))
    prepare["checked_copy"](source, target)
    assert target.read_bytes() == b"metal", "same-size runtime update was skipped"

libraries = root / "modules/chroma-analysis/ios/Libraries/iphoneos/lib"
for filename, symbol in [("libggml.a", "U _ggml_backend_metal_reg"),
                         ("libggml-metal.a", "T _ggml_backend_metal_reg")]:
    result = subprocess.run(["xcrun", "nm", "-g", str(libraries / filename)],
                            capture_output=True, text=True, check=True)
    assert symbol in result.stdout, f"{filename} lacks the linked Metal backend"
print("PASS: iPhone Metal backend linkage and same-size library replacement")
