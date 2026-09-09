# DreamLite iOS 메모리 종료 대안 조사

갱신: 2026-09-10 (Asia/Seoul)

## 결론

DreamLite는 iPhone 14 Pro Max 6GB에서 전체 추론에 성공했다. 핵심은 공식 MLX 4-bit 변환에 `--dtype bfloat16`을 명시해 비전부를 FP32에서 BF16으로 줄이는 것이다. 결과 artifact는 2.52GiB에서 1.660GiB로 감소했다. 공식 접두문·길이 200·CPU 전용 warm 실행은 14.79초, peak RSS 약 1.57GiB였다. 5~10초 목표와 고무도장 품질은 미달이다.

## 공식 DreamLite-mobile 가중치 대조

확인한 Hugging Face snapshot은 `6695c3f4be230f0493fa5dbf78be3bc4d3bb2ab4`다.

| 구성 | 원본 dtype·크기 | 핵심 설정 |
|---|---:|---|
| Qwen3-VL text encoder | BF16 · 4,255,140,312 bytes(3.963GiB) | text hidden 2048, 28 layers; vision hidden 1024, 24 layers, output 2048 |
| DreamLite UNet | BF16 · 780,074,688 bytes(0.727GiB) | sample 128, hidden input 2048, 4-channel latent |
| Tiny VAE | BF16 · 4,903,270 bytes(4.7MiB) | scaling 1.0, shift 0.0 |
| Scheduler | 설정 파일 | FlowMatch Euler, dynamic shifting, base 0.5, max 1.15 |

로컬 Qwen 원본은 위 snapshot의 `text_encoder/model.safetensors`와 같은 파일이다. 공식 의존성의 `transformers==4.57.3`도 변환 환경에서 확인했다. MLX 기본 4-bit 결과는 언어부 약 0.8GiB만 Q4이며 비전부 약 1.52GiB가 FP32로 남았다. `--dtype float16`은 크기를 줄였지만 공식 Swift의 BF16 attention mask와 충돌해 assertion이 났고, `--dtype bfloat16`이 크기와 dtype 계약을 함께 만족했다.

실기기 결과는 다음과 같다.

| 설정 | 결과 | 총시간 | peak RSS |
|---|---|---:|---:|
| BF16 vision + Q4 language, Core ML CPU | 전체 경로·PNG 성공 | 22.88초 | 약 1.90GiB |
| 동일 가중치, 공식 Core ML `.all`/VAE `.cpuAndNeuralEngine` 냉간 | 전체 경로·PNG 성공 | 74.95초 | 약 1.70GiB |
| 공식 입력·Core ML `.all` warm | 전체 경로·PNG 성공 | 20.32초 | 약 1.59GiB |
| 공식 입력·Core ML CPU 첫 실행 | 전체 경로·PNG 성공 | 18.13초 | 약 1.89GiB |
| 공식 입력·Core ML CPU warm | 전체 경로·PNG 성공 | **14.79초** | **약 1.57GiB** |

공식 가속 설정의 긴 첫 실행은 기기 최적화 비용이었다. warm에서도 `.all` UNet 4단계는 15.63초, CPU 전용은 10.16초였다. iPhone 14 Pro Max에서는 공식 `.all`보다 CPU 전용이 빠르다.

공식 `ContentView.swift`의 `[Edit]: A diptych ...` 접두문과 `encodeEditPrompt` 기본 길이 200으로 재실행했다. 원본의 두 사람과 카페 배치는 대체로 유지했지만 결과는 평면화된 그림에 가깝고, 마모된 고무도장 인쇄 질감이 부족하며 원치 않는 가장자리 효과가 생겼다. 공식 배포 문서의 권장 기기는 8GB 이상이지만 이번 6GB 실측은 변환 dtype을 바로 잡으면 실행 자체는 가능함을 보여 준다.

프롬프트 비교에서는 `worn edges`와 `aged beige paper`가 잉크 내부 질감보다 이미지 외곽 손상·흐림으로 해석됐다. 이를 제거하고 `Vintage hand-drawn editorial illustration`, 선명한 거친 잉크 윤곽, 원본의 채도 높은 평면색, 미세 하프톤만 지정한 결과는 분위기와 색상이 개선됐다. seed 42 반복 PNG SHA-256은 모두 `5865fc030a9b2008055f4566dac5f3f375dc68f369a5be9090d7032eaa6ecd68`였고 warm 실행은 13.90초·peak RSS 약 1.67GiB였다. 작은 물체와 옷 무늬 손상은 원본 RGB 20%를 합성해 보완하고, 종이 질감은 soft-light 18%의 결정적 후처리로 분리했다. 최종 프로토타입 샘플 SHA-256은 `aac86c24b886406f0ac04ded7e66ec4022225bd5a50c2d1cd074980c8264bafc`다.

## 조사 경계와 기준

아래 외부 근거는 DreamLite 공식 저장소·가중치 약관, Qwen 공식 저장소/가중치 카드, Apple Core ML/coremltools 공식 문서·소스, Apple MLX/MLX Swift 공식 문서·소스만 사용했다. 로컬 실측·계약 대조는 외부 공식 주장과 분리해 표시한다.

- DreamLite 공식 코드: [ByteVisionLab/DreamLite](https://github.com/ByteVisionLab/DreamLite)
- DreamLite 공식 가중치 안내: [README의 checkpoint/weights 안내](https://github.com/ByteVisionLab/DreamLite#2-inference-via--diffusers), [WEIGHTS_LICENSE](https://github.com/ByteVisionLab/DreamLite/blob/main/WEIGHTS_LICENSE)
- Qwen 공식 구현: [QwenLM/Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)
- Qwen 공식 카드: [Qwen3-VL-2B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct)
- MLX 공식 Swift runtime: [ml-explore/mlx-swift](https://github.com/ml-explore/mlx-swift)
- MLX 공식 Swift LM/VLM: [ml-explore/mlx-swift-lm MLXVLM](https://github.com/ml-explore/mlx-swift-lm/tree/main/Libraries/MLXVLM)
- MLX 공식 quantizer: [ml-explore/mlx-lm convert.py](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/convert.py), [quantization utilities](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/utils.py)
- Apple 공식 Core ML: [Flexible Input Shapes](https://apple.github.io/coremltools/docs-guides/source/flexible-inputs.html), [NLP conversion](https://apple.github.io/coremltools/docs-guides/source/convert-nlp-model.html), [Model Exporting](https://apple.github.io/coremltools/docs-guides/source/model-exporting.html), [MIL](https://apple.github.io/coremltools/docs-guides/source/model-intermediate-language.html)
- Apple 공식 메모리 진단: [Reducing your app’s memory use](https://developer.apple.com/documentation/xcode/reducing-your-app-s-memory-use), [Gathering information about memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use), [jetsam/crash reports](https://developer.apple.com/documentation/xcode/diagnosing-issues-using-crash-reports-and-device-logs)

## 1. 현재 실패와 DreamLite 모델 계약

### 공식 사실

DreamLite 공식 README는 모델을 0.39B unified image generation/editing 모델로 설명하고, Mobile checkpoint를 4-step·1024×1024로 구분한다. 같은 README의 기기 예시는 iPhone 17 Pro에서 4-bit Qwen-VL과 fp16 VAE+UNet으로 약 3초이며, “fully on-device”와 “zero cloud dependency”를 명시한다. 이는 iPhone 14 Pro Max 6GB에서의 성공 보장이나 메모리 상한 문서가 아니다.

공식 mobile pipeline의 실제 계약은 다음과 같다.

- 편집 입력이 있으면 최종 `width`/`height`를 1024로 강제한다.
- Qwen 조건 입력에는 사진을 `256×256`으로 resize한다.
- 편집 경로는 text encoder의 `outputs.hidden_states[-1]`에서 attention mask가 유효한 행을 선택하고, 앞의 `drop_idx=64` 행을 버린다(생성 경로의 `drop_idx`는 별도다).
- UNet 조건 입력은 `encoder_hidden_states`와 `encoder_attention_mask`이며, export 예시는 hidden width 2048, dynamic sequence `N=10..512`를 사용한다.
- export 예시의 UNet 입력은 `sample [1,4,128,256]`, `timestep [1]`, `hidden [1,N,2048]`, `mask [1,N]`, `time_ids [1,2]`다.

코드는 Apache-2.0이지만 공식 가중치 약관은 CC BY-NC 4.0이다. 따라서 이 조사에서 DreamLite 가중치의 기술적 실행 가능성을 확인하는 것과 상업 앱에 포함·재배포할 수 있는지는 별도 gate다. [DreamLite `WEIGHTS_LICENSE`](https://github.com/ByteVisionLab/DreamLite/blob/main/WEIGHTS_LICENSE)

근거: [공식 mobile pipeline](https://github.com/ByteVisionLab/DreamLite/blob/main/dreamlite/pipelines/dreamlite/pipeline_dreamlite_mobile.py), [공식 mobile inference](https://github.com/ByteVisionLab/DreamLite/blob/main/infer_mobile.py), [공식 UNet Core ML export](https://github.com/ByteVisionLab/DreamLite/blob/main/deploy/export_unet.py).

### 이 저장소에서 확인한 사실

`experiments/model-selection/data/ios-smoke/dreamlite/result.md`와 `d4/parity-prenorm.json`에서 Qwen3-VL 2B 사진 조건의 native/source parity는 통과했다. 관찰값은 image grid `[[1,16,16]]`, 최종 hidden width 2048, 앞 64행 제거 후 `[1,144,2048]`, mask `[1,144]`이며, 이는 full edit 성공이 아니라 encoder component parity다.

후속 실기기 측정에서 2.52GiB artifact는 반복 signal 9가 났지만, BF16 vision + Q4 language 1.660GiB artifact는 전체 경로를 완주했다. 따라서 원인은 cache limit 자체가 아니라 공식 변환의 기본 FP32 vision weight가 만든 메모리 압력으로 좁혀졌다. 성공 실행에서 앱 peak RSS도 확보했다.

## 2. 입력 token/image 크기 축소

### 공식 근거

Qwen3-VL 공식 README는 processor의 `min_pixels`/`max_pixels`(image의 `size['shortest_edge']`/`size['longest_edge']`)로 image visual-token budget을 제어할 수 있다고 설명한다. Qwen3-VL은 image/video pixel budget을 분리하며, 애플리케이션 메모리에 맞춰 값을 정하라고 권장한다. [Qwen3-VL pixel control](https://github.com/QwenLM/Qwen3-VL#pixel-control-via-official-processor), [공식 vision processor](https://github.com/QwenLM/Qwen3-VL/blob/main/qwen-vl-utils/src/qwen_vl_utils/vision_process.py)

Apple coremltools도 고정 shape, bounded `RangeDim`, 유한 `EnumeratedShapes`를 구분한다. 유한 shape는 device compile 최적화에 유리하고, bounded range가 unbounded range보다 최적화 기회를 더 준다. Core ML은 default shape를 preallocate하며, 입력 shape를 바꿔도 정확성이 자동 보장되는 것은 아니다. [Flexible Input Shapes](https://apple.github.io/coremltools/docs-guides/source/flexible-inputs.html)

### 판단: peak에 미치는 영향

공식 문서가 “이 입력 축소가 DreamLite의 conditioning peak를 얼마 줄인다”고 보장하지는 않는다. 다음은 코드 구조에 따른 추론이다.

- text token을 줄이면 sequence에 비례하는 hidden state·attention 입력·일부 intermediate가 줄어들 수 있다.
- image visual token을 줄이면 vision/DeepStack와 multimodal attention의 activation이 줄어들 수 있다.
- 그러나 Qwen weight file과 모델 layer 수는 그대로이므로 weight residency에는 거의 영향이 없다. 지금처럼 weight 자체가 큰 실패라면 token 축소만으로 signal 9가 사라진다는 보장은 없다.
- `Memory.clearCache()`는 active arrays가 아니라 cached buffers를 비우는 API다. 따라서 token 축소의 효과는 cache가 아닌 `activeMemory`와 `peakMemory` 변화로 확인해야 한다.

### DreamLite 계약 영향

text token은 단순히 문자열을 잘라 쓰면 안 된다. 공식 pipeline의 system/user/edit template, image placeholder, `drop_idx=64`, attention mask와 UNet hidden width 2048이 함께 계약을 이룬다. sequence 길이가 `N=10..512` 안에 있으면 export된 UNet shape에는 들어갈 수 있지만, 학습 때 사용한 template·행 위치·hidden-state 분포가 달라져 품질이 변할 수 있다. `max_sequence_length` 인자만 줄이는 것은 공식 pipeline에서 실제 slicing을 한다는 뜻이 아니므로, 실제 `input_ids`·유효 mask·hidden rows를 기록해야 한다.

image token도 같은 원칙이다. 최종 output/latent를 첫 실험에서 줄이지 말고, 편집 조건에 공급하는 `256×256`만 줄인다. 매 단계마다 다음을 검사한다.

1. `image_grid_thw`와 `pixel_values` shape가 processor 결과와 일치하는가.
2. hidden output이 finite이고 width 2048인가.
3. `drop_idx=64` 이후 sequence가 `10..512`인가.
4. hidden/mask의 batch·sequence가 같고 UNet 입력으로 전달되는가.
5. 같은 사진·prompt·seed에서 peak와 결과 보존을 비교하는가.

첫 실험값은 `256 → 224 → 192 → 128` 순서가 적절하다. 이는 공식 권장값이 아니라 비용을 낮추기 위한 실험 설계다. 128에서 피사체/구도 또는 edit fidelity가 크게 무너지면 더 줄이지 않는다. output을 1024에서 줄이는 실험은 별도 변수이며, 현재 DreamLite mobile contract와 품질 비교를 동시에 흔들므로 후순위다.

## 3. MLX 3-bit/2-bit와 더 작은 Qwen 계열

### 같은 encoder의 3/2-bit

MLX 공식 converter는 `--q-bits`를 받고, `mixed_2_6`, `mixed_3_4`, `mixed_3_6`, `mixed_4_6` 같은 mixed-bit recipe를 제공한다. quantization config는 group size/bits/mode를 저장한다. [mlx-lm `convert.py`](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/convert.py#L766-L855), [mlx-lm `utils.py`](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/utils.py#L600-L720)

MLX Swift의 `Quantization` 구조도 `groupSize`와 `bits`를 읽도록 되어 있다. 그러나 MLX Swift VLM README에서 실제로 시도된 Qwen3-VL 항목은 `lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit`와 `mlx-community/Qwen3-VL-4B-Instruct-8bit`이며, 2/3-bit Qwen3-VL end-to-end iOS 지원을 약속하지 않는다. [MLX Swift VLM 지원 목록](https://github.com/ml-explore/mlx-swift-lm/blob/main/Libraries/MLXVLM/README.md#contents), [Swift quantization config](https://github.com/ml-explore/mlx-swift-lm/blob/main/Libraries/MLXLMCommon/BaseConfiguration.swift)

판정은 다음과 같다.

- 동일 Qwen3-VL architecture를 affine 3-bit/2-bit로 다시 저장하는 것 자체에는 재학습이 필수는 아니다. 다만 calibration/quantization 방식, group size, 비양자화 민감 layer에 따라 품질이 달라지므로 Mac quality gate와 native hidden parity가 필요하다.
- MLX의 DWQ/AWQ/GPTQ 경로는 별도 calibration 또는 distillation 절차를 포함할 수 있다. 이는 “재학습 없이 단순 export”와 다른 선택이며, 2-bit에서는 품질·변환 비용을 별도로 측정한다.
- 3/2-bit가 weight 파일을 줄여도 activation peak, Metal buffer, VAE/UNet 동시 상주가 사라지지 않는다. 파일 크기 감소를 RSS 감소로 간주하지 않는다.
- Swift loader가 config를 읽고 model을 로드하는 것과 Qwen3-VL image conditioning이 end-to-end로 동작하는 것은 별도 gate다. 현재 공식 README는 2/3-bit VLM iOS 성공 근거가 아니다.

가장 현실적인 우선순위는 3-bit → 2-bit다. 2-bit는 가장 큰 메모리 여유를 줄 가능성이 있지만 hidden parity와 한국어/사진 품질 회귀 위험이 더 크다. 원래 4-bit와 같은 tokenizer, processor, prompt, image grid, output hidden contract를 유지한 채 비교해야 한다.

### Qwen3-VL-2B 교체

Qwen 공식 카드는 Qwen3-VL-2B-Instruct와 4B-Instruct를 각각 2B/4B parameter model로 제공한다. [2B 카드](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct#qwen3-vl-2b-instruct), [4B 카드](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct#qwen3-vl-4b-instruct)

공식 config에서 2B text `hidden_size`는 2048이고 4B text `hidden_size`는 2560이다. [2B config](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct/raw/main/config.json), [4B config](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/raw/main/config.json)

이 사실은 2B가 DreamLite의 UNet shape `hidden width 2048`과 맞을 가능성을 보여 주지만, 직접 교체 호환성을 증명하지 않는다. DreamLite UNet은 특정 Qwen conditioning representation으로 학습됐고, 같은 width라도 layer 수·vision fusion·hidden 값의 의미가 다르면 denoising 품질이 변한다.

- 실행 가능성만 보는 smoke: 2B hidden width/mask/shape가 계약에 맞는지 확인할 수 있다.
- 제품 후보: DreamLite UNet이 그 2B encoder로 학습·미세조정된 checkpoint가 있거나, 최소한 adapter/fine-tuning으로 동일 사진군 품질을 회복해야 한다.
- 따라서 “2B로 바꾸면 재학습 불필요”는 근거 없는 결론이다. raw shape-compatible proof-of-life에는 재학습이 필요 없을 수 있지만, 품질이 보장되는 대체 모델에는 retraining/adaptation gate가 필요하다.

Qwen2-VL 2B 등 다른 Qwen 계열은 architecture와 conditioning distribution이 더 달라진다. MLX Swift VLM README에 Qwen2-VL-2B 4-bit가 시도된 기록은 있지만, 그것은 DreamLite checkpoint와의 호환성 또는 iOS full edit 성공을 뜻하지 않는다. [MLXVLM tried models](https://github.com/ml-explore/mlx-swift-lm/blob/main/Libraries/MLXVLM/README.md#contents)

## 4. Qwen3-VL text/vision encoder의 Core ML 변환 현실성

### 공식적으로 가능한 부분

Apple coremltools Unified Conversion API는 PyTorch TorchScript와 `torch.export` `ExportedProgram`을 입력으로 받고, iOS 15+용 ML Program을 만들 수 있다. text transformer의 대표 예로 GPT-2 변환 문서가 있고, flexible input에는 `EnumeratedShapes`/`RangeDim`이 있다. [Unified converter](https://apple.github.io/coremltools/source/coremltools.converters.convert.html), [NLP example](https://apple.github.io/coremltools/docs-guides/source/convert-nlp-model.html), [ML Program](https://apple.github.io/coremltools/docs-guides/source/convert-to-ml-program.html)

### Qwen3-VL에 적용할 때의 장애물

Qwen3-VL은 단순 text-only GPT-2가 아니다. image processor의 `image_grid_thw`, vision tower, DeepStack, multimodal token packing, mRoPE, text decoder hidden-state 추출, DreamLite의 pre-norm/row-drop 계약을 모두 맞춰야 한다. Core ML 변환은 source graph에 없는 unsupported op를 만나면 MIL composite operator를 직접 작성할 수 있지만, 이는 Qwen3-VL용 공식 변환 recipe가 아니다. [MIL/composite operators](https://apple.github.io/coremltools/docs-guides/source/composite-operators.html)

또한 Apple 문서상 `torch.export` 경로는 Core ML Tools 8.0부터 beta이고, 당시 PyTorch op translation test coverage가 대략 70%라고 되어 있다. 이는 Qwen3-VL의 전체 multimodal graph가 변환된다는 증거가 아니다. [Model Exporting limitations](https://apple.github.io/coremltools/docs-guides/source/model-exporting.html#exporting-limitations)

현실적인 단계는 다음과 같다.

1. text-only fixed shape에서 Qwen hidden-state 출력(로그its가 아님)을 Core ML host parity로 검증한다.
2. vision input을 DreamLite와 동일한 `256×256`, 고정 `image_grid_thw`로 제한한 wrapper를 만들고 image+text hidden output parity를 검증한다.
3. iOS device에서 Core ML encoder peak와 MLX encoder peak를 비교한다.
4. 그 뒤에만 `RangeDim`/여러 image shape를 고려한다.

이 경로는 UNet export보다 훨씬 비싸다. DreamLite 공식 export script는 UNet Core ML export를 제공하지만, Qwen3-VL text/vision encoder를 Core ML로 변환해 iOS full edit까지 제공하지 않는다. [DreamLite 공식 export script](https://github.com/ByteVisionLab/DreamLite/blob/main/deploy/export_unet.py)

따라서 Core ML은 “가능성 있음”이지 현재의 저비용 대안이 아니다. 변환이 성공해도 ANE/Core ML이 실제 peak를 낮추는지, hidden parity와 prompt/image contract가 유지되는지, encoder 결과를 UNet으로 넘긴 뒤 전체 edit가 끝나는지를 별도로 증명해야 한다.

## 5. 순차 해제·cache 조정의 한계

MLX 공식 `Memory` 소스는 `activeMemory + cacheMemory`를 MLX가 할당한 총량으로 설명한다. `cacheLimit`은 재활용 가능한 cache를 제어하고, `clearCache()`는 cached buffer를 해제한다. `cacheLimit`은 다음 deallocation 시 적용될 수 있어 즉시 peak를 되돌리는 전역 cap으로 볼 수 없다. `snapshot()`과 `peakMemory`로 active/cache/peak를 관찰할 수 있다. [MLX Memory.swift](https://github.com/ml-explore/mlx-swift/blob/main/Source/MLX/Memory.swift)

따라서 현재 수정의 한계는 명확하다.

- encoder 객체를 해제해도 이미 materialized된 `MLXArray`/merged hidden state가 살아 있으면 active memory는 남는다.
- `clearCache()`는 weight와 active intermediate를 줄이지 않는다.
- text encoder를 conditioning 뒤 해제하는 순차 구조는 이후 UNet/VAE와의 동시 상주를 줄일 수 있지만, 현재처럼 conditioning/`mergedEmbeds` 직후 죽는 peak에는 늦다.
- `memoryLimit`은 “이만큼만 써라”식 성공 보장이 아니다. 공식 소스 설명대로 allocation이 limit을 넘으면 scheduled task를 기다리며, 너무 낮으면 진행이 막히거나 오류가 날 수 있다.
- 같은 이유로 20MiB cache 통과를 메모리 해결로 기록하면 안 된다. 현재 512MiB/20MiB가 모두 실패했다는 실측도 이 판단과 일치한다.

권장 계측은 각 phase 경계의 `Memory.snapshot()`/`Memory.peakMemory`와 Xcode device memory gauge를 같이 저장하는 것이다. Apple은 앱 메모리 한계가 기기에 따라 달라지고, 한계를 넘으면 iOS가 앱을 종료할 수 있다고 설명한다. signal 9만으로 정확한 jetsam cause를 단정하지 말고 device log/jetsam report를 확인한다. [Apple memory limits](https://developer.apple.com/documentation/xcode/reducing-your-app-s-memory-use), [device logs/jetsam](https://developer.apple.com/documentation/xcode/diagnosing-issues-using-crash-reports-and-device-logs)

## 6. 더 많은 메모리 기기에서 검증

DreamLite 공식 README가 밝히는 것은 iPhone 17 Pro의 약 3초 데모뿐이며, 특정 RAM 수치나 iPhone 14 Pro Max의 지원 여부를 명시하지 않는다. Apple도 memory limit이 device-dependent라고 한다. 그러므로 “iPhone 17 Pro는 반드시 통과” 또는 “6GB에서 반드시 실패”라고 공식 사실처럼 쓰지 않는다.

검증 설계:

- iPhone 14 Pro Max 6GB를 baseline으로 고정한다.
- 가능한 더 많은 메모리의 실기기에서 같은 signed build, 같은 iOS major/minor, 같은 Qwen artifact, 사진 hash, prompt, seed, steps를 사용한다.
- cold load, warm reuse, 3회 반복, cancel/retry를 각각 기록한다.
- phase별 `activeMemory`, `cacheMemory`, `peakMemory`, process peak RSS, elapsed time, 종료 원인(jetsam/crash/device log)을 기록한다.
- 성공 기기에서도 background app 조건과 배터리/열 상태를 바꿔 재현성을 확인한다.

해석:

- 14 Pro Max 실패·상위 기기 성공: 현재 model/device matrix에 6GB unsupported gate를 추가할 근거다. 이것은 모델을 고친 것이 아니다.
- 모든 기기 실패: input budget, quantization, Core ML/MLX graph 문제를 계속 조사한다.
- 14 Pro Max도 성공: 이전 signal 9가 일시적 memory pressure였을 가능성이 있어 jetsam와 peak 계측으로 재현성을 확인한다.

Apple 공식 문서는 Xcode Debug memory report, Allocations instrument, Organizer/MetricKit peak memory, `XCTMemoryMetric`을 제공한다. [Gathering memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use), [Preventing memory regressions](https://developer.apple.com/documentation/xcode/preventing-memory-use-regressions)

## 7. 외부 서버 추론의 충돌

외부 서버나 Mac 서버로 사진을 보내 Qwen/DreamLite 추론을 하면 signal 9를 회피할 수는 있다. 그러나 이는 로컬 요구를 충족하는 대안이 아니다.

- Chroma Note의 현재 제품 계약은 원본 사진을 서버에 업로드하지 않는 로컬 처리다.
- DreamLite 공식 목표도 “zero cloud dependency”, “No internet connection or cloud processing required”다. [DreamLite on-device README](https://github.com/ByteVisionLab/DreamLite#on-device-demo)
- 서버 대안은 네트워크 의존성, 업로드 동의, 전송 중 보호, 서버 보존·삭제, 계정 연결, 실패/오프라인 UX를 새로 만든다.
- 따라서 서버 추론은 품질/출력 비교용 진단 harness로만 허용할 수 있으며, 제품 fallback으로 채택하려면 로컬-only 요구와 별도 사용자 승인이 필요하다.

## 8. 저비용 실험 순서와 중단 기준

| 순서 | 실험 | 성공 판정 | 실패 시 처리 |
|---|---|---|---|
| E0 | 현재 4-bit, 현재 256 조건 image, 동일 prompt를 1회 재현하고 MLX/Xcode/jetsam 계측 | peak와 종료 원인이 기록됨 | 측정이 먼저 통과할 때까지 모델을 바꾸지 않음 |
| E1 | text token만 compact/단계 축소. output 1024, image condition 256, encoder/UNet contract 고정 | conditioning peak 감소 + hidden width/mask/품질 유지 | image token 실험으로 이동 |
| E2 | condition image `224 → 192 → 128`; 각 단계 hidden/mask/`image_grid_thw`와 품질 확인 | iPhone에서 conditioning 이후 pipeline load 통과 | 128에서 품질/계약이 깨지면 중단 |
| E3 | 동일 Qwen3-VL 4-bit를 MLX 3-bit로 변환 후 Mac parity → iPhone conditioning | loader·hidden parity·peak·품질 모두 통과 | 2-bit 또는 원래 4-bit 유지 |
| E4 | 동일 encoder 2-bit/mixed 2-bit 변환 후 같은 gate | 3-bit와 동일 gate | 2-bit를 제품 후보에서 제외 |
| E5 | 더 많은 메모리 실기기에서 원본 4-bit와 E1/E2/E3를 A/B | device-dependent gate와 실제 peak 확보 | 6GB 지원을 포기하고 모델 축소/런타임 변경 검토 |
| E6 | Qwen3-VL text-only fixed-shape Core ML hidden-state proof-of-concept | Core ML host parity | custom MIL 비용 대비 중단 |
| E7 | fixed `256×256` photo+text Core ML encoder, iOS device peak/전체 edit | hidden parity·peak·UNet 연결·품질 통과 | MLX path 또는 모델 재선정 |
| E8 | 서버는 별도 진단 비교만 수행 | 로컬 결과와 품질 차이 확인 | 제품 대안으로 승격하지 않음 |

E1/E2는 모델 재학습 없이 가능한 runtime experiment다. E3/E4도 같은 모델의 quantization artifact라면 재학습은 필수가 아니지만, 품질 gate는 필수다. E5는 제품 지원 범위를 결정하는 실험이다. E6/E7 또는 Qwen3-VL-2B 직접 교체는 비용이 크며, DreamLite에 맞는 2B checkpoint 또는 adaptation 없이는 제품 후보로 승격하지 않는다.

## 최종 판단

iPhone 14 Pro Max용 최선 실측 구성은 **BF16 vision + Q4 language, 조건 이미지 256×256, edit drop 64, hidden 2048, 길이 200, CPU 전용 UNet 4단계, 출력 1024×1024**다. 컬러 editorial 프롬프트와 원본 디테일 20%·종이 질감 18% 후처리를 프로토타입 시각 기준으로 확정했다. 모델 최종 채택은 13.90초 속도와 여러 사진의 품질을 확인할 때까지 보류한다. 추가 저비트 변환은 메모리보다 품질 위험을 키우므로 우선하지 않는다.

## 로컬 근거

- [DreamLite native probe 결과](data/ios-smoke/dreamlite/result.md): D1~D4 parity, Core ML UNet 변환/전체 edit의 gate와 미실행 범위.
- [DreamLite 실험 대안 비교](ALTERNATIVES.md): 기존 후보·라이선스·Simulator 제한.
- [현재 AI 검증 계획](../../docs/05_AI_VALIDATION_PLAN.md): local-only, 동일 사진군, mobile gate.
- [프로젝트 현황](../../docs/03_PROJECT_STATUS.md): iPhone 14 Pro Max 전체 추론과 남은 품질·속도 gate.

이 문서의 공식 문서 링크는 2026-09-10 확인 기준이다. 외부 공식 문서는 iPhone 14 Pro Max에서의 이 앱 성공/실패나 exact RAM threshold를 제공하지 않으며, 그 부분은 위 로컬 실측과 제안 실험으로만 구분한다.
