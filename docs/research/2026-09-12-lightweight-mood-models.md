# 사진 분위기 분석과 한국어 문구 생성을 위한 소형 모델 조사

확인일: 2026-09-12, Asia/Seoul. **사진 분위기 태그와 한국어 AI 문구 생성 모두 유지**하는 조건이다. 공식 모델 카드, 공급자 문서, 배포 파일 메타데이터와 현재 앱 코드를 확인했다. 최초 조사 뒤 사용자 요청으로 LFM과 현재 Qwen의 [사진 5장 실측](../../experiments/model-selection/SMOKE_RESULTS.md#lfm25-vl-450m과-현재-qwen3-vl-4b-5장-비교)을 수행했다. 현재 앱은 수정하지 않았다.

## 판단

2026-09-12 후속 정리: 사용자 요청으로 LFM과 다른 미사용 실험 가중치를 삭제했다. 아래 파일 크기·revision은 조사 근거로 유지하며 다운로드 파일의 현재 보유를 뜻하지 않는다. [삭제·보존 기록](../../experiments/model-selection/data/model-cleanup-20260912.json)

- **LFM2.5-VL-450M은 현재 앱 설정에서 교체 보류다.** 한국어 지원·파일 용량 근거로 우선 실행했으나 사진 5장의 현재 앱 태그/문구 형식은 0/5·0/5, 짧은 지시문은 0/5·2/5였다. 사실성 오류도 남았다. Qwen3.5-0.8B는 다른 계열의 이미지→문구 생성 비교 후보이며 아직 실행하지 않았다. [LFM 실측](../../experiments/model-selection/SMOKE_RESULTS.md#lfm25-vl-450m과-현재-qwen3-vl-4b-5장-비교), [Qwen 공식 카드](https://huggingface.co/Qwen/Qwen3.5-0.8B)
- 작은 두 모델의 한국어 문구나 사진 근거가 부족하면 **LFM2.5-VL-1.6B, Qwen3.5-2B**를 후속 비교한다. 큰 모델이라고 품질 통과를 보장하지 않는다.
- **VisionPsy-Nano-460M / Flash는 영어 외 공식 미지원**, MobileCLIP은 문장을 생성하지 않는 분류·검색 모델이므로 현재 우선 후보에서 제외한다. 영어 태그를 한국어로 표시하는 매핑은 자유로운 한국어 AI 문구 생성을 대신하지 못한다. [VisionPsy 한계](https://huggingface.co/qvac/VisionPsy-Nano-460M#limitations), [Apple MobileCLIP](https://github.com/apple-aiml-research/ml-mobileclip)

| 비교 구성 | 본체+이미지 처리 파일 | 현재 대비 감소 | 검증 순서 |
|---|---:|---:|---|
| 현재 Qwen3-VL 4B, Q4_K_M-compatible+Q8_0 | 2,950.5 MB | 기준 | 현재 앱 기준점 |
| LFM2.5-VL-450M, Q4_K_M+Q8_0 | **332.1 MB** | **88.7%** | 5장 실측, 현재 설정 보류 |
| Qwen3.5-0.8B, Q4_K_M+F16 | **737.5 MB** | **75.0%** | 1차 |
| LFM2.5-VL-1.6B, Q4_K_M+Q8_0 | 1,314.0 MB | 55.5% | 품질 부족 시 |
| Qwen3.5-2B, Q4_K_M+F16 | 1,949.1 MB | 33.9% | 품질 부족 시 |

MB=10⁶ bytes. 실제로 배포된 구성의 파일 합계이며 RAM이나 속도 비교가 아니다. 후보별 이미지 처리 파일의 정밀도가 다르므로 동일 양자화 품질 비교도 아니다. 기준값은 현재 [model-manifest.json](../../modules/chroma-analysis/model-manifest.json)의 2,496,537,376+453,974,304 bytes다. 별도 선화 모델은 이 비교에서 제외한다. 후보별 고정 파일 근거는 §2에 있다.

새 후보의 Chroma Note 50장 품질과 실기기 성능은 **미검증**이다. LFM 450M은 후속 Simulator 5장 비교에서 현재 조건의 품질 미달을 확인했으며 나머지 새 후보는 미실행이다. 기존 SmolVLM2 500M의 50장 `QUALITY_FAIL`, 태그 precision 78.26%는 유지하며 재추천하지 않는다. 기존 Qwen3-VL 2B 실패와 새 Qwen3.5-2B의 미검증 상태도 구별한다. [기존 검증 기록](../05_AI_VALIDATION_PLAN.md#2-출처-확인과-후보), [실험 결과](../../experiments/model-selection/SMOKE_RESULTS.md)

## 1. 공식 모델, 입력과 언어

**Qwen3.5-0.8B / 2B:** 비전 인코더를 갖춘 텍스트 생성 모델이며 공식 카드가 이미지 입력 예제를 제공한다. 계열의 201개 언어·방언 지원 안내는 한국어 짧은 문구의 개별 품질 점수가 아니다. 0.8B는 기본 non-thinking 모드이며 이번 용도도 추론 과정을 길게 생성하지 않는 모드로 평가한다. 모델별 채팅 템플릿 적용을 확인해야 하며 파일만 교체하면 동작한다고 가정하지 않는다. [0.8B 공식 카드](https://huggingface.co/Qwen/Qwen3.5-0.8B), [2B 공식 카드](https://huggingface.co/Qwen/Qwen3.5-2B)

| 항목 | LFM2.5-VL-450M | LFM2.5-VL-1.6B | VisionPsy-Nano-460M / Flash |
|---|---|---|---|
| 공식 model ID | `LiquidAI/LFM2.5-VL-450M` | `LiquidAI/LFM2.5-VL-1.6B` | `qvac/VisionPsy-Nano-460M`, `qvac/VisionPsy-Nano-460M-Flash` |
| 언어 본체 / 이미지 인코더 | LFM2.5-350M / SigLIP2 NaFlex 86M | LFM2.5-1.2B-Base / SigLIP2 NaFlex 400M | SmolLM2-360M / SigLIP2 base, patch16 |
| 입력→출력 | 이미지+프롬프트→텍스트, captioning·grounding | 이미지+프롬프트→텍스트, 다중 이미지 개선 명시 | **질의당 이미지 1장**+프롬프트→텍스트 |
| 이미지 처리 | 최대 512×512 원해상도, 큰 입력은 512 타일+thumbnail. 토큰·타일 상한 조절 | 같은 방식, 더 큰 vision encoder | 기본형은 긴 변을 2048로 확대 후 타일. Flash는 원래 크기를 유지하되 512×512보다 작은 입력은 최소 해상도로 확대 |
| context | 32,768 tokens | 32,768 tokens | 8,192 tokens |
| 한국어 지원 | **명시**, 지원 언어 9개 중 `ko` | **명시**, 원본 카드 지원 언어 8개 중 `ko` | **공식 미지원**, 카드 `language: en` |

출처: [Liquid 450M 공식 카드](https://huggingface.co/LiquidAI/LFM2.5-VL-450M/blob/fc6221ca597f3315e4f82fc2df606783267b34ba/README.md), [Liquid 1.6B 공식 카드](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B/blob/919fde3d022e3f90a4716006f993938ee8c2eb97/README.md), [VisionPsy 기본형 공식 카드](https://huggingface.co/qvac/VisionPsy-Nano-460M/blob/a779cb695f7627c36ded60a82a8c3cc73f03fa24/README.md), [공급자 Flash 설명](https://huggingface.co/blog/qvac/visionpsy#flash-efficiency-on-real-devices).

**훈련 언어와 평가를 구별한다.** Liquid 카드의 지원 언어 목록은 한국어 훈련 데이터 비율·규모를 공개한 표가 아니다. 확인한 두 카드에서 한국어 훈련량은 확인하지 못했다. 공식 다국어 평가는 영어 benchmark를 GPT-4.1-mini로 번역한 언어별 결과의 평균이며, 450M은 한국어 포함 8개 번역 언어, 1.6B는 7개 번역 언어를 사용한다. 해당 카드 표의 평균 점수를 한국어 단독 점수 또는 자연스러운 한국어 일기 문구 평가로 사용하면 안 된다. [450M 평가](https://huggingface.co/LiquidAI/LFM2.5-VL-450M#-performance), [1.6B 평가](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B#-performance)

VisionPsy는 영어 중심 모델이다. 공식 학습 설명에는 이미지 caption/VQA, OCR·문서·추론·지시 수행 데이터와 추가 정렬 과정이 나오지만 한국어 훈련량·한국어 평가 결과는 확인되지 않는다. 원문: “Primarily English; other languages are not officially supported yet.” 한국어 문장을 우연히 생성할 가능성과 공식 지원·제품 품질은 별개다. [공식 카드의 한계](https://huggingface.co/qvac/VisionPsy-Nano-460M#limitations), [공급자 학습 설명](https://huggingface.co/blog/qvac/visionpsy#how-we-trained-it)

## 2. 실제 GGUF 파일 크기와 revision

**GB=10⁹ bytes. 아래는 설치 파일 합계이며 peak RAM·KV cache·이미지 처리 buffer·앱 전체 용량이 아니다.** 비전 입력에는 본체와 mmproj가 모두 필요하다. Liquid와 VisionPsy는 HF API `?blobs=true`의 파일 size/LFS size와 고정 revision 파일의 HEAD `x-linked-size`, `x-linked-etag`, `x-repo-commit`을 대조했다. 8개 대표 파일 모두 일치했고, HEAD의 302 이후 가중치 전송은 따라가지 않았다. Qwen은 양자화 배포자 Unsloth의 API에서 revision, bytes와 SHA-256 메타데이터를 확인했다.

| 저장소 / 양자화 | 본체 파일 / bytes | mmproj 파일 / bytes | 합계 bytes / GB |
|---|---|---|---|
| Qwen3.5 0.8B, Q4_K_M + F16 | `Qwen3.5-0.8B-Q4_K_M.gguf` / 532,517,120 | `mmproj-F16.gguf` / 204,987,232 | **737,504,352 / 0.7375** |
| Qwen3.5 2B, Q4_K_M + F16 | `Qwen3.5-2B-Q4_K_M.gguf` / 1,280,835,840 | `mmproj-F16.gguf` / 668,227,264 | **1,949,063,104 / 1.9491** |
| Liquid 450M, Q4_K_M + Q8_0 | `LFM2.5-VL-450M-Q4_K_M.gguf` / 229,313,568 | `mmproj-LFM2.5-VL-450m-Q8_0.gguf` / 102,815,168 | **332,128,736 / 0.3321** |
| Liquid 450M, Q4_K_M + F16 | 위 본체 / 229,313,568 | `mmproj-LFM2.5-VL-450m-F16.gguf` / 189,126,080 | 418,439,648 / 0.4184 |
| Liquid 1.6B, Q4_K_M + Q8_0 | `LFM2.5-VL-1.6B-Q4_K_M.gguf` / 730,896,256 | `mmproj-LFM2.5-VL-1.6b-Q8_0.gguf` / 583,109,888 | **1,314,006,144 / 1.3140** |
| Liquid 1.6B, Q4_K_M + F16 | 위 본체 / 730,896,256 | `mmproj-LFM2.5-VL-1.6b-F16.gguf` / 853,993,856 | 1,584,890,112 / 1.5849 |
| VisionPsy 기본형, Q4_K_M imatrix + Q8 | `visionpsy-nano-460m-q4_k_m-imat.gguf` / 303,143,488 | `mmproj-visionpsy-nano-460m-q8.gguf` / 108,782,144 | **411,925,632 / 0.4119** |
| VisionPsy Flash, Q4_K_M imatrix + Q8 | `visionpsy-nano-460m-flash-q4_k_m-imat.gguf` / 303,143,488 | `mmproj-visionpsy-nano-460m-flash-q8.gguf` / 108,782,144 | **411,925,632 / 0.4119** |

파일명 대소문자를 보존한다. 기본형과 Flash는 크기가 같아도 SHA-256이 다른 파일이므로 서로 바꿔 쓰지 않는다. F16 행은 API 메타데이터 확인이며 HEAD 대조 8개에는 포함하지 않았다. Q8 mmproj의 현재 앱 로드·품질 호환성은 실행하지 않았다.

| GGUF 배포 저장소 | 확인한 revision / 메타데이터 출처 |
|---|---|
| `unsloth/Qwen3.5-0.8B-GGUF` | `6ab461498e2023f6e3c1baea90a8f0fe38ab64d0` — [고정 파일 목록](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0), [API](https://huggingface.co/api/models/unsloth/Qwen3.5-0.8B-GGUF?blobs=true) |
| `unsloth/Qwen3.5-2B-GGUF` | `f6d5376be1edb4d416d56da11e5397a961aca8ae` — [고정 파일 목록](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/f6d5376be1edb4d416d56da11e5397a961aca8ae), [API](https://huggingface.co/api/models/unsloth/Qwen3.5-2B-GGUF?blobs=true) |
| `LiquidAI/LFM2.5-VL-450M-GGUF` | `1abed04b6fe71314d8c446a1371c03d7c332266d` — [고정 파일 목록](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/tree/1abed04b6fe71314d8c446a1371c03d7c332266d), [API](https://huggingface.co/api/models/LiquidAI/LFM2.5-VL-450M-GGUF?blobs=true) |
| `LiquidAI/LFM2.5-VL-1.6B-GGUF` | `36fc16bc95133424921bcc3da009e83b2f23ffb5` — [고정 파일 목록](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF/tree/36fc16bc95133424921bcc3da009e83b2f23ffb5), [API](https://huggingface.co/api/models/LiquidAI/LFM2.5-VL-1.6B-GGUF?blobs=true) |
| `qvac/VisionPsy-Nano-460M-GGUFs` | `4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1` — [고정 파일 목록](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs/tree/4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1), [API](https://huggingface.co/api/models/qvac/VisionPsy-Nano-460M-GGUFs?blobs=true) |
| `qvac/VisionPsy-Nano-460M-Flash-GGUFs` | `a24fb9cdd1119406b15ff60b06a51f8438a931c1` — [고정 파일 목록](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs/tree/a24fb9cdd1119406b15ff60b06a51f8438a931c1), [API](https://huggingface.co/api/models/qvac/VisionPsy-Nano-460M-Flash-GGUFs?blobs=true) |

VisionPsy 공식 권장은 기본형/Flash 모두 Q4_K_M imatrix 이상이다. 공급자 속도 비교용 **Q4_0**는 본체 255,764,960 + mmproj 108,782,144 = **364,547,104 bytes**로 위 권장 구성과 다르다. 더 작은 IQ3_XXS imatrix도 존재하지만 241,634,112 + 108,782,144 = 350,416,256 bytes이고 품질 손실을 수반하므로 최소 파일이라는 이유로 추천하지 않는다. [기본형 GGUF 카드](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs), [Flash GGUF 카드](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs)

## 3. 장면·분위기 태그와 AI 문구의 한계

- **Liquid 450M:** 일반 captioning·물체 인식을 의도하지만 지식 집약 작업·세밀한 OCR에는 부적합하다고 명시한다. 1.6B는 더 큰 언어/비전 본체와 고해상도·다중 이미지 개선이 차이이며 한국어 문구 품질을 입증한 별도 결과는 아니다. [450M 한계](https://huggingface.co/LiquidAI/LFM2.5-VL-450M#-model-details), [1.6B 설명](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B#lfm25vl-16b)
- **VisionPsy:** 환각·개수 오류·복잡한 문서/긴 다단계 추론 한계를 공급자가 명시한다. Flash는 작은 이미지에서 시각 토큰을 줄이므로 OCR·미세한 지각 품질 손실이 있고 파일 용량은 기본형과 같다. [기본형 한계](https://huggingface.co/qvac/VisionPsy-Nano-460M#limitations), [Flash 한계](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs#limitations)
- **프로젝트 판단:** 장면·사물 benchmark는 ‘차분함, 아늑함’ 같은 주관적 분위기 태그의 정답률이 아니다. 사진에 없는 장소·관계·감정을 문구로 만들어내는 오류도 별도로 남는다. 두 모델의 한국어 문구 길이, 자연스러움, 사진 근거, JSON 준수와 현재 50장 태그 precision을 검증하지 않았으므로 채택·품질 보장은 하지 않는다. 공급자의 fine-tuning 권고를 프로젝트의 추가 학습 계획으로 바꾸지 않는다.

## 4. 모바일 지원 주장과 외부 실측

현재 앱은 `llama.cpp` revision `1945e092030f8668ff93382799502d01490e564d`를 고정한다. 해당 소스에 `qwen35`, `lfm2` 아키텍처와 관련 비전 처리 코드가 존재하는 것은 확인했다. **각 후보의 실제 로드·이미지 추론 성공을 확인한 것은 아니다.** 현재 [iOS bridge](../../modules/chroma-analysis/ios/ChromaAnalysisBridge.mm)는 언어 모델 GPU layer 0, 비전 GPU 비활성 경로다. 첫 비교는 같은 CPU 실행 조건으로 하고 실기기 성능은 별도로 측정해야 한다.

| 구분 | 확인한 공식 근거 | 아직 확인하지 않은 것 |
|---|---|---|
| Liquid llama.cpp | 공식 GGUF 카드가 upstream `ggml-org/llama.cpp` 실행과 이미지 입력을 안내한다. [공식 카드](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF) | Chroma Note가 고정한 런타임 revision의 지원, iOS bridge 연결, Simulator 이미지 추론 |
| Liquid mobile/iOS | 공급자는 edge/on-device 배포를 명시하며 LEAP을 iOS/Android 배포 경로로 소개한다. 모델 카드의 MLX 경로는 **Mac Apple Silicon** 설명이다. [공급자 발표](https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai), [450M 카드](https://huggingface.co/LiquidAI/LFM2.5-VL-450M) | LEAP/MLX 안내만으로 현재 앱 iOS·Simulator 실행 완료를 주장할 수 없음 |
| VisionPsy llama.cpp | 원문 “with our patched llama.cpp fork (not stock upstream)”. 공식 README가 자체 `llama.cpp-custom`과 CPU/CUDA 빌드 경로를 안내한다. [고정 GGUF 카드](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs/blob/4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1/README.md), [공급자 inference README](https://github.com/tether-ai-research/qvac-visionpsy-nano/blob/main/llama-cpp-inference/README.md) | 일반 upstream·현재 앱 바이너리에서 즉시 실행된다는 보장 없음. iOS 앱 빌드/연결·Simulator 미검증 |
| 외부 휴대전화 실측 | QVAC가 Pixel 9, Galaxy S23, S25 Ultra, **iPhone 15**, Q4_0 GGUF, 512×512 입력으로 측정했다고 보고한다. Flash와 LFM450M은 iPhone 15의 문장 생성 완료시간(TTLT)이 각각 **0.7초**라고 기재한다. [공급자 실측](https://huggingface.co/blog/qvac/visionpsy#on-device-time-to-last-token) | 공급자가 보고한 외부 결과다. 기본형 VisionPsy·Q4_K_M 권장 구성·한국어/JSON 출력·앱 준비시간·목표 iPad mini 6 결과로 전용하지 않음 |

외부 TTLT 요청은 한 문장 이미지 설명이며 한국어 앱 문구가 아니다. 동일 공급자 글에서 Flash 평균 출력 35.9 tokens, LFM450M 29.1 tokens라고 밝힌다. CPU/GPU backend 차이가 있으며 위 본문 수치만으로 특정 backend나 cold/warm 조건을 추가 가정하지 않았다. TTFT는 첫 토큰까지, TTLT는 마지막 토큰까지이므로 혼용하지 않는다. **프로젝트의 예상 ms는 산출하지 않는다.** [측정 조건과 결과](https://huggingface.co/blog/qvac/visionpsy#on-device-time-to-first-token)

## 5. 배포 시 중요한 조건

**Qwen3.5 0.8B / 2B의 공식 가중치 라이선스는 Apache-2.0**다. 여기서 비교한 GGUF는 Qwen 원본의 Unsloth 양자화 배포본이므로 채택 시 해당 파일과 동반 고지를 함께 고정한다. [0.8B LICENSE](https://huggingface.co/Qwen/Qwen3.5-0.8B/blob/main/LICENSE), [2B LICENSE](https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE)

**Liquid: LFM Open License v1.0, Apache-2.0가 아니다.** §1은 Threshold를 연 매출 “10 million United States dollars ($10,000,000) or more”로 정의하고, §5는 “not exceeding the Threshold”를 상업 사용 조건으로 둔다. 법인 정의에는 지배·피지배·공동 지배 조직이 포함된다. 해당 규모의 사업자는 경계 해석·별도 이용권을 확인해야 하며 무제한 상업 사용으로 요약하면 안 된다. §4의 라이선스 사본·변경 표시·저작권/귀속·NOTICE 보존 조건도 따른다. [450M GGUF의 고정 LICENSE](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/blob/1abed04b6fe71314d8c446a1371c03d7c332266d/LICENSE), [1.6B LICENSE](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF/blob/36fc16bc95133424921bcc3da009e83b2f23ffb5/LICENSE)

**VisionPsy: 공개 가중치 LICENSE는 Apache-2.0.** §4(a)의 “a copy of this License”와 변경 고지·관련 귀속·NOTICE 보존 조건이 있다. 공급자 글의 연구/교육 의도 설명을 FastVLM식 연구 전용 가중치 제한으로 바꾸지 않는다. 다만 공급자 카드가 훈련 데이터 중 TabMWP의 **CC BY-NC-SA 4.0**, PKU-SafeRLHF-V의 **CC-BY-NC 4.0**, FineVision 하위 원출처별 조건을 명시한다. 이것만으로 가중치가 자동 비상업용이라고 단정하지도, Apache 표시만으로 데이터 권리 문제가 전부 해소됐다고 단정하지도 않는다. 상업 배포 검토에는 이 출처별 조건을 남긴다. [고정 LICENSE](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs/blob/4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1/LICENSE), [공급자 Licensing 설명](https://huggingface.co/qvac/VisionPsy-Nano-460M#licensing)

## 6. 최소 비교 절차와 이번 확인 범위

1. 현재 사진 분석과 문구 생성의 분리된 요청을 유지한다. 같은 모델로 자동 태그·분위기를 분석하고 사용자가 요청할 때 문구를 생성한다. 문구는 기존 [generatePhotoNote](../../modules/chroma-analysis/index.ts)의 한국어 NFC 8~20자 목표, 최대 24자와 사진 근거 조건을 사용한다. 별도 번역 모델이나 고정 문구 조합은 추가하지 않는다.
2. 기존 smoke 5장으로 Liquid 450M, Qwen 0.8B와 현재 Qwen 4B를 비교한다. 같은 원본·공통 전처리·출력 제한을 쓰되 모델 고유 이미지 토큰 처리와 채팅 템플릿은 기록한다. 태그와 문구를 각각 요청하고 최초 JSON 성공, 보정 1회 여부, 사진에 없는 사실, 자연스러운 한국어를 구별해서 평가한다.
3. 유력 후보만 기존 frozen 40장과 holdout 10장으로 확대한다. 첫 모델 준비와 warm 생성 시간을 분리하고 출력 토큰 수·최대 메모리·재시도 비용을 함께 기록한다. Simulator는 기능과 동일 환경 상대 비교용이며 실기기 속도 보증으로 사용하지 않는다. 작은 후보가 부족할 때만 1.6B/2B를 추가한다.

공식 ID·한국어 명시 여부·평가 공개 범위·파일 bytes/revision·핵심 라이선스 원문과 로컬 런타임 소스를 확인했다. 후속 LFM 450M의 실제 가중치 다운로드·검증과 Simulator 사진 5장 비교는 완료했고 한국어 문구/태그의 품질 미달을 기록했다. 이 조사 본문의 외부 성능·런타임 설명은 사전 조사 근거이며 최신 실행 판정은 [실측 결과](../../experiments/model-selection/SMOKE_RESULTS.md#lfm25-vl-450m과-현재-qwen3-vl-4b-5장-비교)를 따른다. 다른 새 후보와 실기기는 미실행이며 현재 앱 모델은 유지했다. 취소된 Gemma 비교는 재개하지 않았다.
