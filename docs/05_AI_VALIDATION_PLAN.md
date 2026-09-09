# AI·대표색 검증 계획

> 2026-09-09 · Phase 0 설계. 모델 실행·다운로드·학습을 수행한 보고서가 아니다. 제품 기준은 [제품 명세](01_PRODUCT_SPEC.md), 앱 계약은 [기술 명세](02_TECH_SPEC.md)다.

## 1. 검증 목적과 판정

Stamp의 원본 보존성과 시각 품질을 먼저 검증한다. 상업 이용 가능한 pretrained 모델의 **사진+자연어 지시→이미지 편집** 경로가 목표다. VLM 사진 이해는 별도 모델로 비교한다. 사진의 핵심 특징을 알아볼 수 있는 컬러 도장 재구성이 목표다. 주요 인물·사물의 정체성과 관계는 유지하되 주변 세부 생략·여백 재배치·장면 압축을 허용한다. 전혀 다른 인물·대표 사물·장소로 바꾸면 실패다.

최종 모델은 미선정이다. “Mac 실행 가능”, “상업 라이선스”, “모바일 네이티브 실행”, “Chroma Note 기준 품질”은 서로 다른 판정 칸이다. 하나가 통과했다고 다른 칸을 채우지 않는다. 사진 처리 클라우드 우회, 자체 학습/LoRA/distillation로 문제를 해결하지 않는다.

2026-09-09 사용자 추가 조건: **iOS 시뮬레이터에서 실제 모델을 테스트할 수 있어야 한다.** 후보 선별 때 시뮬레이터용 네이티브 빌드·가중치 로드·사진 입력 추론 경로를 확인한다. 모델 이름만으로 지원을 추정하지 않는다. Mac의 Ollama/Python 서버 대리 추론이나 저장된 이미지 재생은 UI 확인에만 해당하며 이 조건을 충족하지 않는다.

시뮬레이터의 CPU 실행 경로를 사용할 수 있지만 같은 가중치·전처리·JSON 요청 조건과 결과 차이를 기록한다. Core ML 등의 변환 경로도 실제 변환·로드·추론까지 검증해야 한다. MLX Swift는 현재 공식적으로 iOS Simulator를 지원하지 않으므로 MLX 전용 구성은 이 조건에 부적합하다. 모델 자체를 영구 제외한다는 뜻은 아니며 다른 네이티브 런타임으로 검증한 경우 다시 판단한다. [MLX 공식 제약](https://github.com/ml-explore/mlx-swift/blob/main/Source/MLX/Documentation.docc/troubleshooting.md#running-on-ios-simulator)

시뮬레이터에서는 앱 시작 사전 준비·인스턴스 재사용, 사진 선택, Stamp와 태그 함께 제공, 요청 시 문구, 취소·재준비·safe area를 확인한다. 성능은 `SIMULATOR`로 별도 기록하고 iPhone의 5~10초 목표·메모리·발열·배터리 판정은 실기기에서 수행한다. Simulator는 실기기의 성능과 기능을 그대로 재현하지 않는다. [Apple 안내](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices)

제공된 pretrained 모델이 공급자에 의해 이미 distillation된 것은 프로젝트가 직접 distillation을 하는 것과 다르다. 기존 가중치 그대로의 사용만 평가하고, 별도 LoRA 다운로드/합성·추가 학습은 사용하지 않는다. 이 해석은 설계 기본값이며 “distilled 가중치 자체도 제외” 요청이 오면 후보를 다시 좁힌다.

## 2. 출처 확인과 후보

확인일 2026-09-10. 아래는 공식 모델 카드·저장소의 공개 근거다. 표시된 크기는 모델명/카드 정보이며 앱 peak RAM이 아니다. 실행 시 정확한 revision/파일 hash/가중치 약관을 고정한다.

### VLM

| 후보 | 공식 근거와 용도 | 아직 모르는 것 |
|---|---|---|
| Apple FastVLM 0.5B | Apple 공식 iOS 18.2+ 앱과 모바일 우선 가중치. [공식 저장소](https://github.com/apple/ml-fastVLM), [모델 약관](https://github.com/apple/ml-fastVLM/blob/main/LICENSE_MODEL) | 가중치 약관이 연구만 허용하고 제품 개발을 제외하므로 성능 기준점에만 사용 |
| HuggingFaceTB/SmolVLM-500M-Instruct | 0.5B 이미지 이해, Apache-2.0. 작은 VLM 기준 후보. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct) | 한국어·구조 JSON·앱 메모리/속도 |
| HuggingFaceTB/SmolVLM2-500M-Video-Instruct | 이미지/비디오→텍스트, Apache-2.0. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct), [공식 MLX Swift 지원](https://github.com/ml-explore/mlx-swift-lm/tree/main/Libraries/MLXVLM) | 고정 ontology의 frozen·holdout 정확도, Android 경로 |
| Qwen/Qwen3-VL-2B-Instruct | Apache-2.0. Mac 품질 기준점. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [Ollama 경로](https://ollama.com/library/qwen3-vl) | 실제 Mac/모바일 시간·메모리와 환각 |
| Qwen/Qwen3-VL-4B-Instruct | 2B가 품질 부족할 때 추가 비교. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) | 2B 대비 개선량이 비용을 정당화하는지 |
| Gemma 3n E2B/E4B | 모바일 지향 멀티모달 후보, E 표기는 유효 규모. [공식 개요](https://ai.google.dev/gemma/docs/gemma-3n), [사용 약관](https://ai.google.dev/gemma/terms) | 목표 단말의 메모리·영상 입력 포함 성능·한/영 품질 |

SmolVLM2 500M과 고정 ontology 어댑터를 iPhone 태그 분석의 1차 제품 후보로 둔다. FastVLM 0.5B는 연구 전용 성능 기준점, Qwen3-VL 4B는 품질 우선 대안이다. 처음부터 모든 모델을 설치하지 않는다. 외부 속도 수치는 실행 환경·입력 조건이 다르므로 합격 근거로 사용하지 않는다.

### Stamp 편집 모델

| 후보 | 확인한 근거 | 평가 위치 |
|---|---|---|
| DreamLite / carlofkl/DreamLite-mobile | 0.39B, 모바일 편집 공개 예시. 코드 Apache-2.0와 달리 가중치는 비상업 조건. [공식 repo](https://github.com/ByteVisionLab/DreamLite), [가중치 약관](https://github.com/ByteVisionLab/DreamLite/blob/main/WEIGHTS_LICENSE) | 개인용·비상업 앱 후보. 가중치를 저장소나 공개 배포물에 포함하지 않고 기술·성능 검증을 계속함 |
| black-forest-labs/FLUX.2-klein-4B | Apache-2.0, 사진 조건 편집 지원. [원본 카드](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [4-bit MLX 변환](https://huggingface.co/Runpod/FLUX.2-klein-4B-mflux-4bit), [mflux 편집 문서](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/flux2/README.md) | M4 16GB에서 저해상도·4 steps smoke 우선. iOS/Android 미검증; 학습·LoRA 없이 공개 pretrained distilled 가중치 사용 |
| Qwen/Qwen-Image-Edit-2511 | Apache-2.0, instruction editing·일관성 개선 설명. [공식 카드](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) | 고용량 Mac 품질 기준 후보; 모바일 실행 미확인 |
| OmniGen2/OmniGen2 | Apache-2.0, 이미지 조건 편집. [공식 카드](https://huggingface.co/OmniGen2/OmniGen2), [공식 repo](https://github.com/VectorSpaceLab/OmniGen2) | Mac 자원/호환성 사전 확인 후 품질 후보; 모바일 미확인 |
| meituan-longcat/LongCat-Image-Edit-Turbo | Apache-2.0, 공급자 pretrained distilled editor. [공식 카드](https://huggingface.co/meituan-longcat/LongCat-Image-Edit-Turbo) | Mac/워크스테이션 비교 예비 후보; CUDA 예제를 Mac 지원 증거로 사용하지 않음 |

현재 조사로 **제품 사용 가능한 라이선스·모바일 실행·원본 보존 Stamp 품질을 모두 만족한 모델을 확인하지 못했다.** 존재하지 않는다고 단정하지 않고 미검증으로 관리한다. SnapGen/MobileDiffusion 등 T2I 중심 경로는 사진 편집 경로의 공식 근거 없이는 승격하지 않는다.

식별자 확인(2026-09-09): DreamLite의 코드 저장소는 ByteVisionLab/DreamLite, 모바일 가중치 저장소는 carlofkl/DreamLite-mobile이다. 서로 다른 후보나 fork라는 의미가 아니라 [공식 README의 가중치 안내](https://github.com/ByteVisionLab/DreamLite#2-inference-via--diffusers)가 연결하는 코드/가중치 출처다. 코드와 가중치의 라이선스는 위 표처럼 별도로 확인한다.

공식 배포 재현(2026-09-10): `deploy/export_unet.py`는 공식 의존성 조합과 GQA projection 반복 계산 한 줄 수정으로 dynamic N=10..512 UNet 변환·컴파일에 성공했다. Simulator는 MLX 제한 때문에 전체 경로를 실행할 수 없지만, iPhone 14 Pro Max(iOS 26.6)에서 실기기 전체 경로를 검증했다. Hugging Face `diffusers` 원본 가중치는 Qwen3-VL BF16 3.963GiB, UNet BF16 0.727GiB, Tiny VAE BF16 4.7MiB다. 공식 MLX 기본 변환은 언어부만 Q4이고 비전부가 FP32라 2.52GiB였으며 signal 9가 났다. 비전부까지 BF16으로 명시한 1.660GiB artifact는 전체 경로를 완주했고, FP16 비전부는 Swift BF16 attention mask와 충돌하므로 제외한다. 공식 접두문·길이 200 warm 실측은 `.all` 20.32초·약 1.59GiB, CPU 전용 14.79초·약 1.57GiB다. 출력은 원본의 두 사람과 카페 배치를 대체로 유지했지만 평면 그림에 가깝고 고무도장 질감·5~10초 기준에 미달한다. 채택과 NAS 배포 구조 전환은 보류한다.

라이선스 검사는 코드·가중치·tokenizer/VAE/text encoder·재배포 조건을 분리한다. Apache-2.0/독자약관 표기만으로 전체 구성요소의 사용권을 확정하지 않는다. 정확한 약관 revision, NOTICE·동반 라이선스, 변환 가중치 재배포 허용 범위까지 모델 선정 기록에 남긴다. 이는 모델 채택 조건이며 이번 결제·스토어 문서를 작성하는 의미가 아니다.

## 3. 벤치마크 입력과 기준 자산

제공된 [croma_note.png](/Users/cheng80/Desktop/croma_note.png)는 저장소 밖의 앱 기획 인포그래픽이다. 후속 대화에서 사용자는 카페 포스터 이미지를 제시하고 **왼쪽은 당시 ChatGPT에 넣었던 원본, 오른쪽은 해당 프롬프트로 생성된 최초 목표 결과**라고 확인했다. 이 원본→목표 쌍을 재현 품질 기준으로 삼는다.

카페 원본과 ChatGPT 목표 결과를 각각 수령해 로컬에 보존했다. 수신 프롬프트는 `spatial relation`에서 끝나는 원문 그대로 보관하며 완전성은 확인되지 않았다. 수신 원문 재현과 조정된 JSON 프롬프트를 별도 실험으로 기록한다. 목표의 지명·번호·연도·태그를 VLM 정답으로 주입하지 않는다. 자산 hash·도장 평가 영역·실측은 [실험 결과](../experiments/model-selection/SMOKE_RESULTS.md)에 기록한다.

2026-09-09 사용자 요청에 따라 **Pixabay API로 장면·태그·무드·색 톤에 맞는 사진을 검색해 모델 선정 평가에 사용한다.** 앱 기능과 Supabase에는 Pixabay를 연결하지 않는다. [실험 전용 env·검색·평가 절차](../experiments/model-selection/README.md)에 따라 키를 설정하고 선택 사진의 출처·이용조건·hash를 기록한다. 검색 의도와 Pixabay 태그를 정답으로 간주하거나 모델에 미리 알려 주지 않는다.

BENCH-INPUT-001은 사용자 확인을 마친 카페 원본→ChatGPT 목표 결과 쌍의 로컬 재현 자산을 관리한다. 현재 Pixabay 평가 세트의 수집·선정 테스트를 막지 않으며, 새 사진을 과거 카페 원본의 재현 증거로 표시하지 않는다. 원본·캐시·annotation·출력은 실험 폴더의 Git 제외 `data/`에 로컬 보관한다.

### 평가 세트

| 세트 | 구성 | 용도 |
|---|---|---|
| smoke 5장 | 카페, 인물 실내, 건축, 자연, 복잡한 실내 | 실행/포맷/명백한 보존 실패 조기 탈락 |
| frozen 40장 | 아래 10군 × 4장 | 모델·프롬프트 비교 |
| holdout 10장 | 각 군 1장, 조정에 미사용 | 프롬프트 편향 확인 |
| 색 합성 입력 | 단색, 2색 70:30, 회색/검정/흰색, 투명, 회전, 광색역 | 결정론·비중·파이프라인 검증 |

smoke 5장은 frozen 후보의 부분집합으로 사용할 수 있다. frozen 40장과 holdout 10장은 ID·hash·시각 비교로 중복과 유사 장면을 분리한다.

10군: 카페, 인물 포함 실내, 거리, 건축물, 산/자연, 바다, 음식, 야경, 식물, 복잡한 실내. 각 군에서 단순/복잡·밝음/어두움·가로/세로를 분산한다. 사용 권한과 로컬 파일 hash를 manifest에 기록한다.

각 사진에 먼저 주요 객체·사람 수·배치·건축 윤곽·지형 경계·허용 단순화 항목과 VLM의 허용 태그·동의어·가능한 무드·시각적 근거를 에이전트가 사진을 보고 표시한다. 사용자 요청에 따라 개별 결과 검수를 사용자에게 요구하지 않는다. AI annotation을 사람의 정답이나 사용자 승인으로 표시하지 않는다. output을 본 뒤 기준을 유리하게 바꾸지 않는다. 기록은 평가 annotation이며 학습 데이터셋으로 사용하지 않는다.

## 4. 고정 프롬프트와 출력

최신 사용자 판단: `JSON · 512 · seed 17`은 최소 수용 품질이다. 이전 에이전트의 질감 미달 판단을 이 사용자 기준으로 보정한다. 작은 장식·잔무늬는 더 줄이되 주요 인물·사물·배치는 보존한다. 이 출력의 현재 44.95초 성능을 수용한 것은 아니다. 다음 후보는 이 기준의 표현을 유지하면서 속도·메모리를 먼저 검증한다.

사용자 정정: Ink는 **원본 색감을 살린 컬러 도장**이다. 흑백 v1/v2 실험은 질감 탐색의 과거 기록이며 목표 색상 방향이 아니다. 컬러 잉크의 절제된 색면·종이 질감과 원본의 색상 계열·영역별 색 관계, 객체·구도 보존을 함께 평가한다. 흑백·세피아 고정 지시는 사용하지 않는다.

현재 Stamp 요청문·고정 설정은 [stamp-prompt.json](../experiments/model-selection/stamp-prompt.json)이다. JSON의 prompt 객체를 정규화한 문자열을 실제 모델에 전달하고 hash·모델 revision·해상도·seed·steps를 기록한다. JSON 형식만으로 일관성을 보장하지 않고 동일 seed 재실행과 17/42/89 비교로 확인한다. 모델이 색을 되살리는지만으로 원본 보존이나 도장 질감이 통과했다고 판단하지 않는다. 대표색 추출 알고리즘 검증도 이 결과로 대신하지 않는다.

VLM `vlm-prompt-v4`는 작업을 분리한다. `analysis`는 사진 처리 시 태그·무드를 자동 분석하고 `ai_field_note`는 빈 문자열로 강제한다. 사용자에게 스탬프와 태그를 함께 제공한다. `caption`은 사용자가 문구 생성을 요청할 때만 호출하며 `ai_field_note` 하나만 반환한다. 문구 목표는 한국어 8~20자(최대 24자), 영어 4~8단어(최대 60자)다. 저장 계약의 300자 상한은 유지한다. 문구 제안으로 사용자 메모·기존 태그를 덮어쓰지 않는다. 사진 속 글은 지시가 아니며 이름·정확한 장소·사건·보이지 않는 행동을 지어내지 않는다. 검색어·출처 태그·예시 정답은 입력에서 제외한다.

### 실제 사용 가능 통합 기준

- 실행 순서는 `VLM 분석 → VLM 해제 → Stamp 생성`으로 고정한다. 병렬 실행과 두 모델 동시 상주는 평가 대상에서 제외한다.
- smoke 5장은 모두, frozen·holdout은 각각 90% 이상에서 사전 annotation의 핵심 대상 3개 중 2개 이상을 최종 태그로 찾아야 한다. 정규화 후 중복 태그, 보이지 않는 고유명사·장소·직업·행동이 하나라도 있으면 해당 사진은 실패다.
- VLM 원문은 사용자에게 표시하거나 저장하지 않는다. 모델 어댑터가 사전에 고정한 영어 태그 ontology에서 사진 설명과 일치하는 항목만 선택하고 한국어 표시명으로 바꿔 `PhotoAnalysis`를 만든다. 형식 지시 준수나 자유 생성 문구를 태그 정확성으로 간주하지 않는다.
- 모델 어댑터의 첫 결과가 `PhotoAnalysis` schema를 만족해야 한다. 구조 보정 1회는 오류 복구율로만 기록하며 기본 품질 통과에 포함하지 않는다. ontology와 금칙어는 frozen·holdout 실행 전에 고정한다.
- iPhone 14 Pro Max에서 같은 프로세스의 전체 흐름을 3회 연속 완주하고, warm 기준 VLM 5초 이내·Stamp 15초 이내·사용자 대기 20초 이내를 모두 만족해야 한다. 모델 준비와 최초 다운로드 시간은 별도 표시한다.
- peak RSS 2.2GiB 이하를 현재 안전 상한으로 두고, 종료·메모리 경고·Book 조작 지연이 없어야 한다. 더 큰 메모리 기기에서만 통과한 구성은 기본 후보로 채택하지 않는다.
- 위 수치는 현재 iPhone 14 Pro Max 실측 여유와 사용자가 수용한 품질 결과에 맞춘 후보 선별 기준이다. 한 장의 성공이나 Simulator 결과로 통과시키지 않는다.

모델별 필수 wrapper/size/지원 파라미터는 adapter 설정으로 기록한다. 지원하지 않는 공통 seed 인수를 강제하지 않는다. 지원 모델은 seed 17/42/89, 미지원은 동일 설정 3회 반복으로 variability를 비교한다. 한 모델만 추가 prompt tuning을 한 결과는 같은 비교군으로 집계하지 않는다.

## 5. 실행 절차

사용자 속도 지적 이후 성능·메모리 선별을 화질 튜닝보다 먼저 수행한다. 기존 45초 허용 제안은 폐기했다. 10초는 보장값이 아니며 동일 조건의 실측 없이는 성능으로 안내하지 않는다. 현 FLUX 구성은 Mac 37~51초로 앱 후보에서 제외하고 추가 화질 튜닝을 중단한다. VLM을 포함한 총 대기시간과 모델 준비시간도 별도 보고한다.

1. Mac의 칩·통합 메모리·가용 disk·OS를 실제 조회하고 후보 모델 전체 구성 크기를 비교한다. 자원 초과 후보는 RESOURCE_BLOCKED로 기록한다.
2. 공식 inference 예제, 가중치 revision, license, 기본 image-in/out 지원을 확인한다. 임의 실행 코드/라이선스 신청·동의 없이 모델을 자동 획득하지 않는다.
3. 격리 환경에서 pretrained inference만 실행한다. 프로젝트 앱 의존성과 모델 실험 환경을 섞지 않는다.
4. smoke 세트로 입력/출력·JSON·장면 보존 실패를 확인한다. 명백한 불합격 후보는 frozen 전체 실행을 생략하고 근거를 남긴다.
5. 같은 전처리·prompt·사진·seed로 frozen 세트를 실행한다. 모델 로드 cold 1회, warm 반복 3회, end-to-end와 inference 시간을 각각 기록한다.
6. holdout을 마지막에 실행한다. 메인 에이전트가 원본·목표 쌍의 유사도와 시각적 보존/질감을 평가하고, 애매한 후보는 독립 에이전트 검토로 보완한다. 사용자 개별 검수를 통과 조건으로 두지 않는다. 평가 주체·근거·불확실성을 명시한다.
7. 기준을 통과한 가중치만 변환·양자화/네이티브 runtime 연결 대상으로 삼고, 같은 frozen/holdout으로 출력 회귀를 확인한다.
8. iOS·Android 각각 실제 기기에서 offline·cold start·연속 10건·취소·메모리 압박·복귀를 검증한다.

하드웨어가 미확보면 실제 기기명/메모리 항목을 빈 채로 두고 DEVICE_NOT_SELECTED로 표시한다. Expo SDK 최소 OS와 모델이 실용적으로 동작하는 최소 기기는 별개다. 어떤 기기가 충분한지 사용자 추측으로 확정하지 않는다.

## 6. 합격/탈락 기준

아래 수치는 **사전 제안 게이트**다. 측정 후 기준을 바꾸려면 결과와 변경 이유를 남기고 새 기준으로 재판정한다. 미측정을 0건 실패로 쓰지 않는다.

| 영역 | 통과 기준 | 실패 시 |
|---|---|---|
| 색 정합 | 동일 입력/설정 동일 값, HEX/RGB 일치, weight 합 1±0.001, 단색 1군집, 합성 70:30 오차 ±2%p | 전처리/알고리즘 수정 후 관련 세트 재검증 |
| VLM 구조 | 모델 어댑터의 최초 `PhotoAnalysis` 유효율 100%; null/빈 값 처리 | ontology·어댑터 수정 후 재검증 |
| VLM 근거 | 인물 이름/정확 위치/사건 등 중대한 사실 환각 0건; 보이는 객체 태그 precision ≥90% | 후보 부적합 또는 AI 글 생략 기능만 남김; 핵심 VLM 검증 완료는 아님 |
| VLM 언어 | 한/영 각각 자연스러움·사진 적합성 5점 평균 ≥4, 개별 2점 이하 비율 ≤5% | 해당 locale 미지원으로 기록, 자동 cloud 번역 안 함 |
| VLM 무드 | 사진의 시각적 근거에 맞는 무드 적합성 5점 평균 ≥4, 개별 2점 이하 ≤5%; 동의어·복수 무드 허용 | 검색어 일치로 대체하지 않고 후보/프롬프트 재검토 |
| Stamp 구조 | 고정한 50장×3회에서 주요 인물/대표 사물의 중대한 추가·교체·제거 또는 핵심 관계 붕괴 0건 (주변 세부 생략·장면 압축 허용); 선택한 카페 사진군도 전회 통과 | 스타일 점수와 무관하게 후보 탈락 |
| Stamp 매력 | 원본 보존 통과 output 중 stamp 표현/수집 가치 각각 평균 ≥4/5, 3 미만 ≤10% | 스타일 prompt/모델 후보 재검토 |
| 속도 | 목표 기기 warm p95 색 ≤1초, VLM ≤5초, Stamp ≤15초, 전체 사용자 대기 ≤20초; hard timeout 무한 대기 0건 | 하위 해상도/모델 비교, 목표 기기 지원 판정 재검토 |
| 메모리/안정성 | VLM/Stamp 순차 로드, 10회 연속 crash/OOM 0건, 취소/백그라운드에서 메모 보존 | 모바일 gate 실패 |
| 개인정보 | 분석 네트워크에서 원본/파생 원본 전송 0건, 로그·EXIF GPS·백업 누출 0건 | 핵심 기능 인수 실패 |
| 사용 조건 | 가중치와 부속모델의 해당 사용/변환/재배포 근거 기록 | 제품 후보 제외 |

주요 윤곽·공간 관계는 overlay와 객체 annotation으로 비교한다. 스타일 변화 때문에 단순 pixel difference·CLIP 유사도·SSIM 하나를 합격 판정으로 쓰지 않는다. DINOv2 특징 유사도, 색 분포, LBP 질감 수치를 보조 자료로 사용하되 인물 수·자세·핵심 사물·배치·잉크 질감은 에이전트가 직접 비교한다. 이 수치는 합격 확률이 아니며 지표 하나나 임의 가중 평균으로 통과시키지 않는다.

ChatGPT 결과의 완전 재현을 요구하지 않고, 핵심 장면·색 관계를 지키는 범위에서 세부 단순화·질감 밀도와 시간/메모리를 타협한다. 같은 사진에서 빠른/균형 해상도를 비교해 느려진 만큼 품질이 나아지는지 기록한다. 사용자 판단은 개별 출력이 아니라 제품 범위 변경처럼 위임받지 않은 선택에만 요청한다.

다양한 실사진에서 “환각 0을 보증”한다는 뜻이 아니다. 정해진 평가군의 결과와 사용자 비교/재시도 수단을 함께 확보한다. frozen 통과 후 holdout 실패를 평균으로 숨기지 않는다.

## 7. 결과 기록 형식과 다음 결정

각 run: run_id, 사진군 ID/hash(로컬), 모델/부속모델 revision, runtime/OS/chip/RAM, prompt version, preprocess/settings/seed, input/output dimensions, cold/warm/end-to-end ms, peak process memory, disk bytes, schema retry 횟수, 보존 hard fail 유형, 스타일/글 점수, license 상태.

모델별 summary: NOT_RUN / RESOURCE_BLOCKED / LICENSE_BLOCKED / QUALITY_FAIL / MOBILE_FAIL / PASS_WITH_SCOPE. PASS에는 테스트한 플랫폼·기기·언어·사진군 범위를 붙인다. 4B라는 이름이나 quantized 파일 용량으로 메모리 사용을 대신하지 않는다.

선별 순서: 필수 사용조건 → 로컬 시간/메모리 → 장면 보존·수집 가치 → 목표 기기 검증 → 구현/유지 비용. 전 후보가 실패하면 **Stamp 기술 게이트 미통과**를 기록하고 후보 탐색/범위 변경 판단으로 돌아간다. 모바일 구현을 계속 늘리거나 CV 필터·클라우드 API로 조용히 대체하지 않는다. 인증·저장 계약 문서는 독립적으로 정리할 수 있지만, 프론트엔드 구현과 Supabase 구축은 PLAN-01~03 통과·모델 선정 결과 확정 후 시작한다. 이후 두 작업을 분리해 검증하고 실제 서비스 연동은 양쪽 준비 후 수행한다. 실행 순서와 완료 체크는 [현황 체크리스트](03_PROJECT_STATUS.md#4-작업-체크리스트와-완료-기준)를 따른다.

이 문서에는 결제·스토어 출시 테스트를 포함하지 않는다.

실제 Mac smoke의 실행/실패/에이전트 평가 상태는 [결과 문서](../experiments/model-selection/SMOKE_RESULTS.md)에 기록한다. 탐색 중 수정한 v1/v2 요청문은 별도 비교군이며 이 문서의 정식 게이트를 통과한 것으로 계산하지 않는다.

앱 시작 사전 준비 검증: 첫 화면 표시·Book 조작 중 비동기 로드, 같은 모델 중복 준비 방지, 준비 후 사진 여러 장의 인스턴스 재사용, 메모리 해제 후 재준비·사진 취소·초안 보존을 확인한다. 첫 다운로드·cold 로드·warm 추론·두 모델 교체 비용을 분리한다. 사전 로딩으로 생성 자체가 빨라졌다고 계산하지 않는다.

목표 해석 보정: 사용자는 ChatGPT 목표가 주요 특징을 모아 새로 그린 장면처럼 보인다고 지적했다. 시각상 인물·조명·선풍기·커튼이 선택적으로 재구성되어 있으며 실제 ChatGPT 내부 생성 과정은 확인되지 않았다. 원본의 모든 위치·픽셀·장식 보존을 강제하지 않고 핵심 특징을 남기는 재구성으로 평가한다.
