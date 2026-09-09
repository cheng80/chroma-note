#!/usr/bin/env python3
"""Run a fixed JSON stamp prompt through the installed local mflux runtime."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from PIL import Image


def dimensions(size, edge):
    if edge < 64 or edge % 16 or min(size) <= 0:
        raise ValueError('positive input size and long edge >=64, multiple of 16 required')
    scale = edge / max(size)
    return tuple(max(16, round(v * scale / 16) * 16) for v in size)


def canonical_prompt(config):
    if not isinstance(config.get('prompt'), dict) or not config['prompt'].get('task'):
        raise ValueError('prompt must be an object with a task')
    return json.dumps(config['prompt'], ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)


def save(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    tmp.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--config', type=Path, default=Path(__file__).with_name('stamp-prompt.json'))
    parser.add_argument('--profile', choices=['fast', 'balanced'], default='balanced')
    parser.add_argument('--seeds', type=int, nargs='+')
    parser.add_argument('--timeout', type=float, default=180)
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error('timeout must be a finite positive number')
    config = json.loads(args.config.read_text())
    prompt = canonical_prompt(config)
    generation = config['generation']
    edge = generation['profiles'][args.profile]['long_edge']
    with Image.open(args.image) as im:
        width, height = dimensions(im.size, edge)
    from huggingface_hub import snapshot_download
    model_path = snapshot_download(generation['model_repo'], revision=generation['model_revision'], local_files_only=True)
    cli = Path(sys.executable).with_name('mflux-generate-flux2-edit')
    if not cli.is_file():
        parser.error('run with the experiment .venv Python containing mflux')
    args.out.mkdir(parents=True, exist_ok=False)
    prompt_path = args.out/'prompt.json'
    prompt_path.write_text(prompt)
    save(args.out/'config.json', config)
    rows = []
    for index, seed in enumerate(args.seeds or [generation['seed']], 1):
        name = f'{index:02}-{args.profile}-{seed}'
        output = args.out/f'{name}.png'
        command = [str(cli), '--model', model_path, '--base-model', 'flux2-klein-4b',
                   '--image-paths', str(args.image), '--prompt-file', str(prompt_path),
                   '--width', str(width), '--height', str(height), '--steps', str(generation['steps']),
                   '--guidance', str(generation['guidance']), '--seed', str(seed), '--metadata', '--output', str(output)]
        if generation['low_ram']:
            command.append('--low-ram')
        print(name, 'started', flush=True)
        started = time.monotonic()
        with (args.out/f'{name}.log').open('w') as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True, env={**os.environ, 'HF_HUB_OFFLINE':'1'})
            try:
                code = process.wait(timeout=args.timeout)
                status = 'completed' if code == 0 else 'error'
            except (subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                status = 'timeout' if isinstance(exc, subprocess.TimeoutExpired) else 'interrupted'
                code = process.returncode
        row = {'case':name, 'seed':seed, 'profile':args.profile, 'status':status,
               'returncode':code, 'wall_seconds':time.monotonic()-started,
               'input_sha256':hashlib.sha256(args.image.read_bytes()).hexdigest(),
               'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),
               'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest() if output.exists() else None,
               'dimensions':[width,height], 'command':command,
               'condition':'new CLI process; cached local weights; no cloud inference'}
        rows.append(row)
        save(args.out/'run.json', rows)
        print(name, status, round(row['wall_seconds'],2), flush=True)
        if status != 'completed':
            return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
