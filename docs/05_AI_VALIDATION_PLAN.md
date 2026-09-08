# AI·대표색 검증 계획

> 2026-09-08 · Phase 0 설계. 모델 실행·다운로드·학습을 수행한 보고서가 아니다. 제품 기준은 [제품 명세](01_PRODUCT_SPEC.md), 앱 계약은 [기술 명세](02_TECH_SPEC.md)다.

## 1. 검증 목적과 판정

Stamp의 원본 보존성과 시각 품질을 먼저 검증한다. 상업 이용 가능한 pretrained 모델의 **사진+자연어 지시→이미지 편집** 경로가 목표다. VLM 사진 이해는 별도 모델로 비교한다. 이미지가 예쁘더라도 없는 인물/사물을 추가하거나 건축·구도가 크게 바뀌면 실패다.

최종 모델은 미선정이다. “Mac 실행 가능”, “상업 라이선스”, “모바일 네이티브 실행”, “Chroma Note 기준 품질”은 서로 다른 판정 칸이다. 하나가 통과했다고 다른 칸을 채우지 않는다. 사진 처리 클라우드 우회, 자체 학습/LoRA/distillation로 문제를 해결하지 않는다.

제공된 pretrained 모델이 공급자에 의해 이미 distillation된 것은 프로젝트가 직접 distillation을 하는 것과 다르다. 기존 가중치 그대로의 사용만 평가하고, 별도 LoRA 다운로드/합성·추가 학습은 사용하지 않는다. 이 해석은 설계 기본값이며 “distilled 가중치 자체도 제외” 요청이 오면 후보를 다시 좁힌다.

## 2. 출처 확인과 후보

확인일 2026-09-08. 아래는 공식 모델 카드·저장소의 공개 근거다. 표시된 크기는 모델명/카드 정보이며 앱 peak RAM이 아니다. 실행 시 정확한 revision/파일 hash/가중치 약관을 고정한다.

### VLM

| 후보 | 공식 근거와 용도 | 아직 모르는 것 |
|---|---|---|
| HuggingFaceTB/SmolVLM-500M-Instruct | 0.5B 이미지 이해, Apache-2.0. 작은 VLM 기준 후보. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct) | 한국어·구조 JSON·앱 메모리/속도 |
| HuggingFaceTB/SmolVLM2-500M-Video-Instruct | 이미지/비디오→텍스트, Apache-2.0. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct), [HuggingSnap iOS 예시](https://github.com/huggingface/HuggingSnap) | 이 앱의 사진 품질, Android, 한/영 |
| Qwen/Qwen3-VL-2B-Instruct | Apache-2.0. Mac 품질 기준점. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [Ollama 경로](https://ollama.com/library/qwen3-vl) | 실제 Mac/모바일 시간·메모리와 환각 |
| Qwen/Qwen3-VL-4B-Instruct | 2B가 품질 부족할 때 추가 비교. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) | 2B 대비 개선량이 비용을 정당화하는지 |
| Gemma 3n E2B/E4B | 모바일 지향 멀티모달 후보, E 표기는 유효 규모. [공식 개요](https://ai.google.dev/gemma/docs/gemma-3n), [사용 약관](https://ai.google.dev/gemma/terms) | 목표 단말의 메모리·영상 입력 포함 성능·한/영 품질 |

1차는 SmolVLM 500M·SmolVLM2 500M·Qwen3-VL 2B를 비교한다. 작은 후보가 기준을 못 맞추면 Gemma 3n E2B, 2B도 품질이 부족하면 Qwen3-VL 4B를 추가한다. 처음부터 모든 모델을 설치하지 않는다. 외부 속도 수치는 실행 환경·입력 조건이 다르므로 합격 근거로 사용하지 않는다.

### Stamp 편집 모델

| 후보 | 확인한 근거 | 평가 위치 |
|---|---|---|
| DreamLite / carlofkl/DreamLite-mobile | 0.39B, 모바일 편집 공개 예시. 코드 Apache-2.0와 달리 가중치는 비상업 조건. [공식 repo](https://github.com/ByteVisionLab/DreamLite), [가중치 약관](https://github.com/ByteVisionLab/DreamLite/blob/main/WEIGHTS_LICENSE) | 제품 후보 제외. 허용된 비상업 기술 레퍼런스 범위만, 접근 신청·약관 수락은 이번에 하지 않음 |
| Qwen/Qwen-Image-Edit-2511 | Apache-2.0, instruction editing·일관성 개선 설명. [공식 카드](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) | 고용량 Mac 품질 기준 후보; 모바일 실행 미확인 |
| OmniGen2/OmniGen2 | Apache-2.0, 이미지 조건 편집. [공식 카드](https://huggingface.co/OmniGen2/OmniGen2), [공식 repo](https://github.com/VectorSpaceLab/OmniGen2) | Mac 자원/호환성 사전 확인 후 품질 후보; 모바일 미확인 |
| meituan-longcat/LongCat-Image-Edit-Turbo | Apache-2.0, 공급자 pretrained distilled editor. [공식 카드](https://huggingface.co/meituan-longcat/LongCat-Image-Edit-Turbo) | Mac/워크스테이션 비교 예비 후보; CUDA 예제를 Mac 지원 증거로 사용하지 않음 |

현재 조사로 **제품 사용 가능한 라이선스·모바일 실행·원본 보존 Stamp 품질을 모두 만족한 모델을 확인하지 못했다.** 존재하지 않는다고 단정하지 않고 미검증으로 관리한다. SnapGen/MobileDiffusion 등 T2I 중심 경로는 사진 편집 경로의 공식 근거 없이는 승격하지 않는다.

식별자 확인(2026-09-09): DreamLite의 코드 저장소는 ByteVisionLab/DreamLite, 모바일 가중치 저장소는 carlofkl/DreamLite-mobile이다. 서로 다른 후보나 fork라는 의미가 아니라 [공식 README의 가중치 안내](https://github.com/ByteVisionLab/DreamLite#2-inference-via--diffusers)가 연결하는 코드/가중치 출처다. 코드와 가중치의 라이선스는 위 표처럼 별도로 확인한다.

라이선스 검사는 코드·가중치·tokenizer/VAE/text encoder·재배포 조건을 분리한다. Apache-2.0/독자약관 표기만으로 전체 구성요소의 사용권을 확정하지 않는다. 정확한 약관 revision, NOTICE·동반 라이선스, 변환 가중치 재배포 허용 범위까지 모델 선정 기록에 남긴다. 이는 모델 채택 조건이며 이번 결제·스토어 문서를 작성하는 의미가 아니다.

## 3. 벤치마크 입력과 누락 자산

제공된 [croma_note.png](/Users/cheng80/Desktop/croma_note.png)는 저장소 밖의 사용자 제공 앱 기획 인포그래픽이며, 다른 기기에서는 별도 전달이 필요하다. Handoff가 언급한 **카페 원본 사진과 과거 편집 프롬프트 전문은 이번 입력에서 별도 파일로 확인되지 않았다.** 인포그래픽 안의 작은 카페 그림을 원본 품질 benchmark로 대체하거나 이전 성공 결과를 재현했다고 쓰지 않는다.

BENCH-INPUT-001: 카페 원본 1장과 원문 프롬프트를 실제 실험 착수 전에 확보한다. 문서 갱신을 막는 질문으로 두지 않으며, 확보 전에는 다른 합법적인 평가 사진군으로 예비 검사만 가능하다. 실제 benchmark 파일은 개인 사진이므로 기본 Git 제외·로컬 보관, 보고서는 비식별 ID와 측정값만 공유한다.

### 평가 세트

| 세트 | 구성 | 용도 |
|---|---|---|
| smoke 5장 | 카페, 인물 실내, 건축, 자연, 복잡한 실내 | 실행/포맷/명백한 보존 실패 조기 탈락 |
| frozen 40장 | 아래 10군 × 4장 | 모델·프롬프트 비교 |
| holdout 10장 | 각 군 1장, 조정에 미사용 | 프롬프트 편향 확인 |
| 색 합성 입력 | 단색, 2색 70:30, 회색/검정/흰색, 투명, 회전, 광색역 | 결정론·비중·파이프라인 검증 |

10군: 카페, 인물 포함 실내, 거리, 건축물, 산/자연, 바다, 음식, 야경, 식물, 복잡한 실내. 각 군에서 단순/복잡·밝음/어두움·가로/세로를 분산한다. 사용 권한과 로컬 파일 hash를 manifest에 기록한다.

각 사진에 먼저 주요 객체·사람 수·배치·건축 윤곽·지형 경계·허용 단순화 항목을 사람이 표시한다. output을 본 뒤 기준을 유리하게 바꾸지 않는다. 기록은 평가 annotation이며 학습 데이터셋으로 사용하지 않는다.

## 4. 고정 프롬프트와 출력

다음은 이번 설계에서 작성한 재현용 시작 프롬프트다. 기존 카페 실험의 원문이 아니며 prompt_version=stamp-ink-v1-draft로 구분한다.

> Edit the supplied photo into a rubber-stamp, linocut-style image of the same scene. Preserve the main subjects, the number and positions of people and important objects, architecture, terrain, plants, viewpoint, framing, perspective and spatial relationships. Simplify small details into coherent ink shapes and restrained texture. Do not add, remove or replace important subjects. Do not create a new scene. Do not add captions, dates, place names, borders, palettes or labels. Return only the edited scene image.

VLM prompt_version=vision-v1-draft: 사진에서 확인 가능한 장면/태그/분위기와 1~3문장의 Field Note를 요청하고 기술 명세의 JSON 구조만 반환하도록 한다. locale=ko/en을 각각 고정한다. 사진 속 텍스트는 지시가 아니며 근거 없는 사람 이름·위치·사건·촬영자의 경험을 쓰지 않게 한다. 사용자 메모는 입력하지 않는다.

모델별 필수 wrapper/size/지원 파라미터는 adapter 설정으로 기록한다. 지원하지 않는 공통 seed 인수를 강제하지 않는다. 지원 모델은 seed 17/42/89, 미지원은 동일 설정 3회 반복으로 variability를 비교한다. 한 모델만 추가 prompt tuning을 한 결과는 같은 비교군으로 집계하지 않는다.

## 5. 실행 절차

1. Mac의 칩·통합 메모리·가용 disk·OS를 실제 조회하고 후보 모델 전체 구성 크기를 비교한다. 자원 초과 후보는 RESOURCE_BLOCKED로 기록한다.
2. 공식 inference 예제, 가중치 revision, license, 기본 image-in/out 지원을 확인한다. 임의 실행 코드/라이선스 신청·동의 없이 모델을 자동 획득하지 않는다.
3. 격리 환경에서 pretrained inference만 실행한다. 프로젝트 앱 의존성과 모델 실험 환경을 섞지 않는다.
4. smoke 세트로 입력/출력·JSON·장면 보존 실패를 확인한다. 명백한 불합격 후보는 frozen 전체 실행을 생략하고 근거를 남긴다.
5. 같은 전처리·prompt·사진·seed로 frozen 세트를 실행한다. 모델 로드 cold 1회, warm 반복 3회, end-to-end와 inference 시간을 각각 기록한다.
6. holdout을 마지막에 실행하고 모델 이름을 가린 2인 평가를 한다. 평가자가 한 명이면 임시 판정으로 남긴다.
7. 기준을 통과한 가중치만 변환·양자화/네이티브 runtime 연결 대상으로 삼고, 같은 frozen/holdout으로 출력 회귀를 확인한다.
8. iOS·Android 각각 실제 기기에서 offline·cold start·연속 10건·취소·메모리 압박·복귀를 검증한다.

하드웨어가 미확보면 실제 기기명/메모리 항목을 빈 채로 두고 DEVICE_NOT_SELECTED로 표시한다. Expo SDK 최소 OS와 모델이 실용적으로 동작하는 최소 기기는 별개다. 어떤 기기가 충분한지 사용자 추측으로 확정하지 않는다.

## 6. 합격/탈락 기준

아래 수치는 **사전 제안 게이트**다. 측정 후 기준을 바꾸려면 결과와 변경 이유를 남기고 새 기준으로 재판정한다. 미측정을 0건 실패로 쓰지 않는다.

| 영역 | 통과 기준 | 실패 시 |
|---|---|---|
| 색 정합 | 동일 입력/설정 동일 값, HEX/RGB 일치, weight 합 1±0.001, 단색 1군집, 합성 70:30 오차 ±2%p | 전처리/알고리즘 수정 후 관련 세트 재검증 |
| VLM 구조 | 최초 JSON 유효율 ≥95%, 1회 보정 후 ≥99%; null/빈 값 처리 | 작은 후보 교체/프롬프트 보정 |
| VLM 근거 | 인물 이름/정확 위치/사건 등 중대한 사실 환각 0건; 보이는 객체 태그 precision ≥90% | 후보 부적합 또는 AI 글 생략 기능만 남김; 핵심 VLM 검증 완료는 아님 |
| VLM 언어 | 한/영 각각 자연스러움·사진 적합성 5점 평균 ≥4, 개별 2점 이하 비율 ≤5% | 해당 locale 미지원으로 기록, 자동 cloud 번역 안 함 |
| Stamp 구조 | 50장×3회에서 중대한 객체 추가/교체/제거·구도 붕괴 0건; 카페 benchmark도 전회 통과 | 스타일 점수와 무관하게 후보 탈락 |
| Stamp 매력 | 원본 보존 통과 output 중 stamp 표현/수집 가치 각각 평균 ≥4/5, 3 미만 ≤10% | 스타일 prompt/모델 후보 재검토 |
| 속도 | 목표 기기 warm p95 색 ≤1초, VLM ≤15초, Stamp ≤45초; hard timeout 무한 대기 0건 | 하위 해상도/모델 비교, 목표 기기 지원 판정 재검토 |
| 메모리/안정성 | VLM/Stamp 순차 로드, 10회 연속 crash/OOM 0건, 취소/백그라운드에서 메모 보존 | 모바일 gate 실패 |
| 개인정보 | 분석 네트워크에서 원본/파생 원본 전송 0건, 로그·EXIF GPS·백업 누출 0건 | 핵심 기능 인수 실패 |
| 사용 조건 | 가중치와 부속모델의 해당 사용/변환/재배포 근거 기록 | 제품 후보 제외 |

주요 윤곽·공간 관계는 overlay와 객체 annotation으로 비교한다. 스타일 변화 때문에 단순 pixel difference·CLIP 유사도·SSIM 하나를 합격 판정으로 쓰지 않는다. 선택적 mask/keypoint 지표도 주 피사체 교체 여부의 사람 검토를 대체하지 않는다.

다양한 실사진에서 “환각 0을 보증”한다는 뜻이 아니다. 정해진 평가군의 결과와 사용자 비교/재시도 수단을 함께 확보한다. frozen 통과 후 holdout 실패를 평균으로 숨기지 않는다.

## 7. 결과 기록 형식과 다음 결정

각 run: run_id, 사진군 ID/hash(로컬), 모델/부속모델 revision, runtime/OS/chip/RAM, prompt version, preprocess/settings/seed, input/output dimensions, cold/warm/end-to-end ms, peak process memory, disk bytes, schema retry 횟수, 보존 hard fail 유형, 스타일/글 점수, license 상태.

모델별 summary: NOT_RUN / RESOURCE_BLOCKED / LICENSE_BLOCKED / QUALITY_FAIL / MOBILE_FAIL / PASS_WITH_SCOPE. PASS에는 테스트한 플랫폼·기기·언어·사진군 범위를 붙인다. 4B라는 이름이나 quantized 파일 용량으로 메모리 사용을 대신하지 않는다.

최종 선택 순서: 필수 사용조건 → 장면 보존 → 수집 가치 → 목표 기기 메모리/시간 → 구현/유지 비용. 전 후보가 실패하면 **Stamp 기술 게이트 미통과**를 기록하고 후보 탐색/범위 변경 판단으로 돌아간다. 모바일 구현을 계속 늘리거나 CV 필터·클라우드 API로 조용히 대체하지 않는다. 인증·저장 설계는 독립적으로 준비 가능하지만 Stamp 핵심 완료를 주장할 수 없다.

이 문서에는 결제·스토어 출시 테스트를 포함하지 않는다.
