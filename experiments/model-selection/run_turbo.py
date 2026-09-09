#!/usr/bin/env python3
"""SD-Turbo smoke: load once, time first/warm photo transformations separately."""
import argparse
import hashlib
import json
import time
from pathlib import Path
from PIL import Image, ImageOps
from run_stamp import dimensions, save

REPO = 'stabilityai/sd-turbo'
REVISION = 'b261bac6fd2cf515557d5d0707481eafa0485ec2'
PROMPT = {'style':'multicolor rubber stamp, rough ink on ivory paper',
          'detail':'simplified main subjects, few details, original colors'}
CASES = [(2, .5, 17), (2, .5, 17), (4, .5, 17), (4, .75, 17)]


def validate_cases(cases):
    for steps, strength, seed in cases:
        if not isinstance(steps, int) or steps < 1 or not 0 < strength <= 1 or int(steps * strength) < 1:
            raise ValueError('img2img needs at least one effective denoising step')
        if not isinstance(seed, int):
            raise ValueError('integer seed required')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--cases',type=json.loads,default=CASES,help='JSON list of [steps,strength,seed]')
    args=parser.parse_args()
    validate_cases(args.cases)
    args.out.mkdir(parents=True,exist_ok=False)
    import torch
    from diffusers import AutoPipelineForImage2Image
    from huggingface_hub import snapshot_download
    if not torch.backends.mps.is_available():
        raise RuntimeError('MPS required for this experiment')
    model=snapshot_download(REPO,revision=REVISION,local_files_only=True,
        allow_patterns=['*.json','tokenizer/*','*fp16.safetensors','LICENSE.md','README.md'])
    started=time.monotonic()
    pipe=AutoPipelineForImage2Image.from_pretrained(model,torch_dtype=torch.float16,
             variant='fp16',use_safetensors=True,local_files_only=True).to('mps')
    torch.mps.synchronize()
    load_seconds=time.monotonic()-started
    prompt=json.dumps(PROMPT,ensure_ascii=False,separators=(',',':'))
    tokens=pipe.tokenizer(prompt,truncation=False)['input_ids']
    if len(tokens)>pipe.tokenizer.model_max_length:
        raise ValueError('JSON prompt exceeds encoder token budget; refusing truncation')
    image=ImageOps.exif_transpose(Image.open(args.image)).convert('RGB')
    image=image.resize(dimensions(image.size,512),Image.Resampling.LANCZOS)
    config={'model':REPO,'revision':REVISION,'prompt_version':'turbo-json-v1',
            'prompt':PROMPT,'actual_prompt':prompt,'prompt_tokens':len(tokens),
            'input_sha256':hashlib.sha256(args.image.read_bytes()).hexdigest(),
            'dimensions':list(image.size),'device':'mps','dtype':'float16',
            'load_seconds':load_seconds,'cases':[],
            'scope':'Mac local inference; not Core ML or mobile benchmark; no download in timing'}
    save(args.out/'run.json',config)
    print('model loaded',round(load_seconds,2),'seconds;',len(tokens),'prompt tokens',flush=True)
    for index,(steps,strength,seed) in enumerate(args.cases,1):
        name=f'{index:02}-steps{steps}-strength{strength}-seed{seed}.png'
        torch.mps.synchronize();started=time.monotonic()
        result=pipe(prompt=prompt,image=image,num_inference_steps=steps,strength=strength,
                    guidance_scale=0.0,generator=torch.Generator('cpu').manual_seed(seed))
        torch.mps.synchronize();elapsed=time.monotonic()-started
        output=result.images[0]
        assert output.size==image.size, 'unexpected output dimensions'
        output.save(args.out/name)
        row={'output':name,'steps':steps,'strength':strength,'seed':seed,
             'effective_steps':int(steps*strength),'inference_seconds':elapsed,
             'condition':'first inference after load' if index==1 else 'same loaded pipeline',
             'output_sha256':hashlib.sha256((args.out/name).read_bytes()).hexdigest(),
             'mps_current_bytes':torch.mps.current_allocated_memory(),
             'mps_driver_bytes':torch.mps.driver_allocated_memory(),
             'memory_note':'end-of-case allocation, not peak RSS',
             'nsfw_detected':getattr(result,'nsfw_content_detected',None)}
        config['cases'].append(row);save(args.out/'run.json',config)
        print(name,round(elapsed,2),'seconds',flush=True)
    return 0


if __name__=='__main__':
    raise SystemExit(main())
