# 경량 photo-to-stamp 대체 후보

갱신: 2026-09-10

## 핸드오프 후보 대조와 다음 순서

사용자가 제공한 `CHROMA_NOTE_CODEX_HANDOFF.md` 5절과 실제 실행 기록을 대조했다. 속도 대안을 찾으며 SD-Turbo·LCM으로 이동하기 전에 아래 누락을 먼저 확인한다. LCM 추가 다운로드·추론은 보류한다.

| 핸드오프 후보 | 실제 상태 | 다음 처리 |
|---|---|---|
| SmolVLM 500M | Ollama/GGUF 실행, 현재 구성 품질 실패 | 모델 전체·다른 런타임의 실패로 일반화하지 않는다 |
| Qwen3-VL 2B | 실행, 환각·언어 혼합 확인 | 비교 기록 유지 |
| Qwen3-VL 4B | 실행, 태그·문구 품질 잠정 수용 | 모바일 선정 확정 아님 |
| FastVLM 0.5B | iPhone 14 Pro Max에서 공식 앱·가중치로 카페+smoke 5장 실행 | 성능 기준점 통과; 연구 전용 약관으로 제품 후보 제외 |
| SmolVLM2 500M | 공식 MLX Swift로 iPhone 카페+smoke 5장 연속 실행 | 1차 제품 후보; 고정 ontology 어댑터 검증 |
| Gemma 3n | 네이티브 사진 입력에서 특수 토큰 반복 | 현재 구성 품질 탈락 |
| DreamLite Mobile | BF16 vision + Q4 language 1.660GiB 구성으로 iPhone 14 Pro Max 전체 편집·1024 PNG 성공 | CPU warm 14.79초; 고무도장 질감 미달 |

현재 병목은 DreamLite 실행 여부가 아니라 속도와 Stamp 품질이다. 공식 MLX 기본 변환의 2.52GiB artifact는 vision FP32 때문에 signal 9가 났고, `--dtype bfloat16`을 명시한 1.660GiB artifact는 iPhone 14 Pro Max 전체 편집을 완주했다. 공식 입력 warm 실측은 `.all` 20.32초, CPU 전용 14.79초다. NAS 다운로드 구조는 품질·속도 채택 뒤로 유지한다.

추가 필수 조건: 실제 iPhone 전체 경로는 통과했다. 공식 가속 warm 시간, 동일 입력 반복 안정성, 목표 Stamp 질감·구조 보존은 아직 통과 증거가 아니다. 기준과 공식 근거는 [AI 검증 계획](../../docs/05_AI_VALIDATION_PLAN.md)에 있다.

## 범위와 현재 결론

- FLUX Mac 37–51초는 탈락했다. 목표는 장당 5–10초지만 mobile/peak memory는 미측정이다. 앱 시작 시 사전 로드를 전제로 한다.
- 목표는 사진 필터나 strict pixel 복제가 아니라 주요 인물·사물의 특징과 관계를 남기는 도장 재구성이다. 주변 세부 축소와 위치 압축은 허용한다.
- SD-Turbo 6회 연구 test 완료: `strength=.5/.75`에서 주요 인물 소실로 품질 FAIL, `.25`는 사진 느낌이 강해 품질 탈락. 추가 다운로드·추론·튜닝은 중단한다.

## 짧은 비교표

| 상태 | 후보 | 확보한 근거와 판단 |
|---|---|---|
| **연구 test 가능 / 품질 탈락** | **SD-Turbo** | SD 2.1 기반 증류, 1–4 step, 공식 Diffusers 경로: [official model card](https://huggingface.co/stabilityai/sd-turbo). 메인 에이전트의 Mac MPS 실측(416×512, JSON 33 tokens): load 2.77s, 최초 1 effective step 3.80s, warm 1.05s, 2 step 1.26s, 3 step/`.75` 1.49s. |
| **NOT_CHECKED** | **LCM_Dreamshaper_v7 full pipeline/no LoRA** | 공식 Diffusers에 `LatentConsistencyModelImg2ImgPipeline` 및 `SimianLuo/LCM_Dreamshaper_v7` 연결 예시가 있다: [Diffusers docs](https://huggingface.co/docs/diffusers/main/api/pipelines/latent_consistency_models). 이 프로젝트에서 실행·속도·출력 품질은 확인하지 않았다. |
| **미검증 후보** | **SDXL-Turbo** | SDXL 1.0 기반 1–4 step 및 img2img 예시: [official model card](https://huggingface.co/stabilityai/sdxl-turbo). Mac/mobile 시간과 주요 피사체 보존은 미검증. |
| **미검증 후보** | **SDXL-Lightning full UNet(no LoRA)** | SDXL base full-UNet 1/2/4/8-step 체크포인트이며 공식 설명은 1 step을 experimental로 표시: [official model card](https://huggingface.co/ByteDance/SDXL-Lightning). img2img 품질·속도는 미검증. |
| **실기기 실행 통과 / 품질·속도 미달** | **DreamLite** | iPhone 14 Pro Max에서 실제 사진 전체 편집과 1024 PNG 저장을 확인했다. CPU warm 14.79초이며 공식 prompt 결과도 고무도장 질감이 부족하다: [official repository](https://github.com/ByteVisionLab/DreamLite). |

## SD-Turbo license gate

- 공식 `LICENSE.md`는 2024-07-05 Community License다. 연구·비상업 사용과 evaluation/testing은 허용 범위에 포함되지만 AUP와 사용 제한은 따른다: [official LICENSE.md](https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md).
- **상업 등록과 재배포는 별도 gate**다. 상업 사용 등록, 100만 달러 초과 시 Enterprise 절차, 재배포 시 라이선스 사본·attribution·`Powered by Stability AI` 등 조건을 제품 채택·배포 전에 확인한다.
- 실험 확인 상태: 공개·gated false, FP16 2.58GB 다운로드 완료, Mac 연구 실행 완료, `diffusers==0.40.0`, `accelerate==1.14.0`, 기존 `torch==2.14`, `transformers==5.16` 설치 test 완료.
- 현재 표기: `RESEARCH_TRIAL_ALLOWED`; `COMMERCIAL_REGISTRATION_GATE_PENDING`; `REDISTRIBUTION_GATE_PENDING`.
- SD-Turbo card의 “Stable Diffusion 2.1 기반”은 확인했지만, `stable-diffusion-2-1-base` 원모델의 별도 약관까지 확인한 것은 아니다.

## LCM의 미완료 범위

- `SimianLuo/LCM_Dreamshaper_v7` 저장소는 `MIT` 표기이며 full pipeline 구성요소를 제공한다: [official model card](https://huggingface.co/SimianLuo/LCM_Dreamshaper_v7).
- 공식 예시는 LCM UNet과 별도 `Lykon/dreamshaper-7` base를 결합한다. DreamShaper는 `runwayml/stable-diffusion-v1-5` fine-tune이며 `CreativeML OpenRAIL-M` 표기다: [official DreamShaper card](https://huggingface.co/Lykon/dreamshaper-7).
- 위 라이선스 관계는 문헌상 확인했지만 이 프로젝트의 접근·실행·품질·속도·재배포 적합성은 확인하지 못했다. 따라서 최종 상태는 **`NOT_CHECKED`**다.

## 측정 기록과 한계

- 메인 에이전트 측정 기록 위치: `data/reference-cafe/sd-turbo-v1/run.json`. first/repeat hash 동일은 재현성 신호이지 품질·mobile 성능 증거가 아니다.
- `.5/.75` 인물 소실과 `.25` 사진 느낌은 메인 에이전트의 시각 검토 결과다. 자동 합격 점수나 pass threshold로 일반화하지 않는다.
- 조사 미완료 범위: mobile 실측, peak memory, SDXL 계열 실행, LCM 실행·출력 검토, 상업 등록 및 재배포 사용 조건.

## 종료 판단

SD-Turbo는 연구 test와 Mac 속도는 확인했지만 현재 품질 기준에서 탈락했다. LCM은 `NOT_CHECKED`로 남기고 추가 실행을 보류한다. 다음 작업은 위 핸드오프 후보 대조의 미완료 항목부터 진행한다.
