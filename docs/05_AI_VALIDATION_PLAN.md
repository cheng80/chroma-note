# AI·대표색 검증 계획

> 2026-09-11 · 현재 선화·VLM·대표색의 검증 계획과 확인된 실측을 구분한다. 제품 기준은 [제품 명세](01_PRODUCT_SPEC.md), 앱 계약은 [기술 명세](02_TECH_SPEC.md)다.

2026-09-10 최신 사용자 지시: **이후 실제 기기 테스트는 iPad mini 6를 기준으로 수행한다.** 기존 iPhone 14 Pro Max 실측은 과거 비교 자료로 보존하며 새 iPad 결과와 동일 조건의 수치로 섞지 않는다. 현재 실행·검증 범위는 [프로젝트 현황](03_PROJECT_STATUS.md)을 따른다.

## 1. 검증 목적과 판정

현재 목표는 Informative Drawings `style1`이 만든 단일 채널 선 마스크에 같은 위치의 정규화 원본 RGB를 그대로 입힌 흰 배경 컬러 선화다. 마스크 농도만 `gain=1.8`로 픽셀별 조정한다. 원본 구도와 선 위치를 유지하며 색면 채우기·5색 양자화·외곽선 굵게·내부 선 제거/약화·재배치·거친 인쇄 표현은 허용하지 않는다. 대표색 1~5개는 선화 합성과 분리된 메타데이터다. VLM은 자동 태그·무드를 분석하고, AI 메모 초안은 사용자의 명시 생성 동작에서만 만든다.

선화 경로는 `style1`로 고정했지만 제품 채택은 아직 아니다. “실험 실행”, “상업 사용 조건”, “실제 제품 앱 통합”, “VLM 통합”, “Android 실행”, “Chroma Note 품질”은 서로 다른 판정 칸이다. 하나가 통과했다고 다른 칸을 채우지 않는다. 사진 처리 클라우드 우회, 자체 학습/LoRA/distillation로 문제를 해결하지 않는다.

2026-09-09 사용자 추가 조건: **iOS 시뮬레이터에서 실제 모델을 테스트할 수 있어야 한다.** 후보 선별 때 시뮬레이터용 네이티브 빌드·가중치 로드·사진 입력 추론 경로를 확인한다. 모델 이름만으로 지원을 추정하지 않는다. Mac의 Ollama/Python 서버 대리 추론이나 저장된 이미지 재생은 UI 확인에만 해당하며 이 조건을 충족하지 않는다.

시뮬레이터의 CPU 실행 경로를 사용할 수 있지만 같은 가중치·전처리·JSON 요청 조건과 결과 차이를 기록한다. Core ML 등의 변환 경로도 실제 변환·로드·추론까지 검증해야 한다. MLX Swift는 현재 공식적으로 iOS Simulator를 지원하지 않으므로 MLX 전용 구성은 이 조건에 부적합하다. 모델 자체를 영구 제외한다는 뜻은 아니며 다른 네이티브 런타임으로 검증한 경우 다시 판단한다. [MLX 공식 제약](https://github.com/ml-explore/mlx-swift/blob/main/Source/MLX/Documentation.docc/troubleshooting.md#running-on-ios-simulator)

시뮬레이터에서는 앱 시작 사전 준비·인스턴스 재사용, 사진 선택, 선화와 자동 태그 함께 제공, 요청 시 메모 초안, 취소·재준비·safe area를 확인한다. 성능·메모리·발열·배터리 판정은 iPad mini 6 실기기에서 수행한다. Simulator는 실기기의 성능과 기능을 그대로 재현하지 않는다. [Apple 안내](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices)

제공된 pretrained 모델이 공급자에 의해 이미 distillation된 것은 프로젝트가 직접 distillation을 하는 것과 다르다. 기존 가중치 그대로의 사용만 평가하고, 별도 LoRA 다운로드/합성·추가 학습은 사용하지 않는다. 이 해석은 설계 기본값이며 “distilled 가중치 자체도 제외” 요청이 오면 후보를 다시 좁힌다.

## 2. 출처 확인과 후보

확인일 2026-09-10. 아래는 공식 모델 카드·저장소의 공개 근거다. 표시된 크기는 모델명/카드 정보이며 앱 peak RAM이 아니다. 실행 시 정확한 revision/파일 hash/가중치 약관을 고정한다.

### VLM

| 후보 | 공식 근거와 용도 | 아직 모르는 것 |
|---|---|---|
| Apple FastVLM 0.5B | Apple 공식 iOS 18.2+ 앱과 모바일 우선 가중치. [공식 저장소](https://github.com/apple/ml-fastVLM), [모델 약관](https://github.com/apple/ml-fastVLM/blob/main/LICENSE_MODEL) | 가중치 약관이 연구만 허용하고 제품 개발을 제외하므로 성능 기준점에만 사용 |
| HuggingFaceTB/SmolVLM-500M-Instruct | 0.5B 이미지 이해, Apache-2.0. 작은 VLM 기준 후보. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct) | 한국어·구조 JSON·앱 메모리/속도 |
| HuggingFaceTB/SmolVLM2-500M-Video-Instruct | 이미지/비디오→텍스트, Apache-2.0. [모델 카드](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct), [공식 MLX Swift 지원](https://github.com/ml-explore/mlx-swift-lm/tree/main/Libraries/MLXVLM) | 고정 ontology 실행은 50/50 PASS였으나 태그 precision 90/115(78.26%), frozen core 27/40(67.5%), holdout core 4/10(40%)으로 `QUALITY_FAIL`. peak RSS·대표색·Android는 미측정/미검증 |
| Qwen/Qwen3-VL-2B-Instruct | Apache-2.0. Mac 품질 기준점. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [Ollama 경로](https://ollama.com/library/qwen3-vl) | 실제 Mac/모바일 시간·메모리와 환각 |
| Qwen/Qwen3-VL-4B-Instruct | 2B가 품질 부족할 때 추가 비교. [모델 카드](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) | 2B 대비 개선량이 비용을 정당화하는지 |
| Gemma 3n E2B/E4B | 모바일 지향 멀티모달 후보, E 표기는 유효 규모. [공식 개요](https://ai.google.dev/gemma/docs/gemma-3n), [사용 약관](https://ai.google.dev/gemma/terms) | 목표 단말의 메모리·영상 입력 포함 성능·한/영 품질 |

SmolVLM2 500M과 고정 ontology 어댑터를 iPad mini 6 태그 분석의 1차 제품 후보로 평가했으나, 현재 50장 결과는 `QUALITY_FAIL`이므로 제품 채택 후보로 확정하지 않는다. 해당 실행은 수정·삭제 가능한 보조 제안 실험으로만 유지한다. FastVLM 0.5B는 연구 전용 성능 기준점, Qwen3-VL 4B는 품질 우선 대안이다. 처음부터 모든 모델을 설치하지 않는다. 외부 속도 수치는 실행 환경·입력 조건이 다르므로 합격 근거로 사용하지 않는다.

2026-09-10 SmolVLM2 고정 ontology 결과는 [실험 결과](../experiments/model-selection/SMOKE_RESULTS.md)와 [summary.json](../experiments/model-selection/data/plan01-vlm-smolvlm2-20260910T025411Z/summary.json)을 따른다. 총 50건(실행 50/50 PASS)에서 태그 precision은 0.7826으로 0.9 게이트에 미달했고, frozen core는 0.675, holdout core는 0.4였다. peak RSS와 대표색은 각각 `NOT_RUN`이다. 후속 `plan01-vlm-smolvlm2-20260910T113000Z`·`plan01-vlm-smolvlm2-20260910T113500Z`는 전 건 모델 로드 실패로 품질을 평가하지 못했으며 위 품질 결과와 합산하지 않는다.

### 선화 모델

현재 단일 경로는 Informative Drawings `style1`이다. RGB 사진을 `Generator(3, 1, 3)`에 넣어 단일 채널 선 마스크를 만들며 프롬프트·seed·확산 반복은 없다. 정확한 가중치 revision/hash와 재배포 조건은 앱 배포 전에 고정한다. 상세 조사·실행·변환·실기기 근거는 [선화 연구](../experiments/model-selection/LINE_ART_RESEARCH.md)의 최신 §10~12를 따른다.

RubberStamp와 DreamLite/FLUX/Qwen-Image-Edit 등 확산 편집 후보는 현재 제품 방향에서 폐기했다. 해당 결과와 `JSON · 512 · seed 17` 평가는 과거 실험 기록일 뿐 현재 선화 품질 기준이나 후보 순위가 아니다. `stamp_records`, `StampTransformer`, `StampResult`, `ink-v1`, 기존 SR ID는 마이그레이션 없는 호환 식별자로만 유지한다.

라이선스 검사는 코드·가중치·tokenizer/VAE/text encoder·재배포 조건을 분리한다. Apache-2.0/독자약관 표기만으로 전체 구성요소의 사용권을 확정하지 않는다. 정확한 약관 revision, NOTICE·동반 라이선스, 변환 가중치 재배포 허용 범위까지 모델 선정 기록에 남긴다. 이는 모델 채택 조건이며 이번 결제·스토어 문서를 작성하는 의미가 아니다.

## 3. 벤치마크 입력과 기준 자산

제공된 [croma_note.png](/Users/cheng80/Desktop/croma_note.png)는 저장소 밖의 앱 기획 인포그래픽이며 현재 VLM 품질 benchmark나 선화 정답 이미지로 사용하지 않는다. 현재 선화 입력 hash·출력·실측·관찰은 [선화 연구](../experiments/model-selection/LINE_ART_RESEARCH.md)에 기록한다. 사진의 지명·번호·연도·검색 태그를 VLM 정답으로 주입하지 않는다.

2026-09-09 사용자 요청에 따라 **Pixabay API로 장면·태그·무드·색 톤에 맞는 사진을 검색해 모델 선정 평가에 사용한다.** 앱 기능과 Supabase에는 Pixabay를 연결하지 않는다. [실험 전용 env·검색·평가 절차](../experiments/model-selection/README.md)에 따라 키를 설정하고 선택 사진의 출처·이용조건·hash를 기록한다. 검색 의도와 Pixabay 태그를 정답으로 간주하거나 모델에 미리 알려 주지 않는다.

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

## 4. 고정 선화·VLM 출력

선화는 Informative Drawings `style1`, 긴 변 기본 1024px, 종횡비 유지, 중앙 crop과 upscaling 없음으로 고정한다. 최소 reflection padding은 출력에서 제거한다. 모델의 단일 채널 값 `line`에 `alpha = min(255, round((255 - line) × 1.8))`만 적용하고, 같은 위치의 정규화 원본 RGB를 그대로 흰 배경에 합성한다. 선 위치·영역을 바꾸는 threshold, 색면, 팔레트 양자화, dilation, 내부 선 제거, 구도 재구성, 종이/인쇄 질감은 넣지 않는다.

대표색 1~5개는 정규화 원본의 별도 분석 결과다. 선화의 픽셀 수를 5색으로 줄이거나 대표색으로 선 RGB를 대체하지 않는다. 확산 모델의 prompt·steps·seed는 현재 선화 경로에 존재하지 않는다.

VLM `vlm-prompt-v4`는 작업을 분리한다. `analysis`는 사진 처리 시 태그·무드를 자동 분석하고 `ai_field_note`는 빈 문자열로 강제한다. 사용자에게 선화와 자동 태그를 함께 제공한다. `caption`은 사용자가 메모 초안 생성을 명시했을 때만 호출하며 `ai_field_note` 하나만 반환한다. 문구 제안으로 사용자 메모·기존 태그를 덮어쓰지 않는다. 사진 속 글은 지시가 아니며 이름·정확한 장소·사건·보이지 않는 행동을 지어내지 않는다. 검색어·출처 태그·예시 정답은 입력에서 제외한다.

### 실제 사용 가능 통합 기준

- 실행 순서는 `VLM 자동 태그 분석 → VLM 해제 → 선화 생성`으로 고정한다. 메모 초안은 별도의 명시 요청에서 실행한다. 병렬 실행과 두 모델 동시 상주는 평가 대상에서 제외한다.
- smoke 5장은 모두, frozen·holdout은 각각 90% 이상에서 사전 annotation의 핵심 대상 3개 중 2개 이상을 최종 태그로 찾아야 한다. 정규화 후 중복 태그, 보이지 않는 고유명사·장소·직업·행동이 하나라도 있으면 해당 사진은 실패다.
- VLM 원문은 사용자에게 표시하거나 저장하지 않는다. 모델 어댑터가 사전에 고정한 영어 태그 ontology에서 사진 설명과 일치하는 항목만 선택하고 한국어 표시명으로 바꿔 `PhotoAnalysis`를 만든다. 형식 지시 준수나 자유 생성 문구를 태그 정확성으로 간주하지 않는다.
- 모델 어댑터의 첫 결과가 `PhotoAnalysis` schema를 만족해야 한다. 구조 보정 1회는 오류 복구율로만 기록하며 기본 품질 통과에 포함하지 않는다. ontology와 금칙어는 frozen·holdout 실행 전에 고정한다.
- iPad mini 6에서 같은 프로세스의 전체 흐름을 3회 연속 완주하고, warm 기준 VLM 5초 이내·선화 1초 이내·사용자 대기 7초 이내를 모두 만족해야 한다. 모델 준비와 최초 다운로드 시간은 별도 표시한다.
- peak RSS 2.2GiB 이하를 현재 안전 상한으로 두고, 종료·메모리 경고·Book 조작 지연이 없어야 한다. 더 큰 메모리 기기에서만 통과한 구성은 기본 후보로 채택하지 않는다.
- iPad mini 6 카페 1024px 선화 단독 warm 5회 중앙값 0.223789초는 이 예산 안이지만 실제 제품 앱/VLM 통합이 통과했다는 뜻은 아니다. 한 장의 성공이나 Simulator 결과로 통과시키지 않는다.

모델 wrapper, 입력 크기, padding, `style1` 가중치 hash, gain과 후처리 버전을 adapter 설정으로 기록한다. 결정론은 같은 입력·설정의 반복 픽셀 일치로 확인한다.

## 5. 실행 절차

현재 `style1` 경로를 동일 설정으로 검증한다. VLM을 포함한 총 대기시간과 모델 준비시간도 별도 보고한다.

1. 공식 inference 예제, `style1` 가중치 revision/hash, license와 재배포 조건을 확인한다.
2. smoke 세트로 입력·단일 채널 마스크·원본 RGB 합성·흰 배경·구도 보존 실패를 확인한다.
3. 같은 전처리·가중치·gain으로 frozen 세트를 실행한다. 모델 로드 cold 1회, warm 반복 5회, end-to-end와 inference 시간을 각각 기록한다.
4. holdout을 마지막에 실행한다. 메인 에이전트가 원본과 선화의 구조 보존·가독성을 평가하고, 애매한 후보는 독립 에이전트 검토로 보완한다. 사용자 개별 검수를 통과 조건으로 두지 않는다. 평가 주체·근거·불확실성을 명시한다.
5. 같은 frozen/holdout으로 Core ML 변환 출력의 수치·시각 회귀를 확인한다.
6. iOS·Android 각각 실제 기기에서 offline·cold start·연속 10건·취소·메모리 압박·복귀를 검증한다.

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
| 선화 구조 | 고정한 50장×3회에서 주요 인물/대표 사물의 중대한 누락, 사람 수 오류, 핵심 관계 붕괴, crop·재배치 0건 | 선화 경로 품질 실패 |
| 선화 합성 | 선 이외 영역 white, 합성 전 선 레이어 RGB는 같은 위치의 정규화 원본과 일치(최종 PNG는 흰색과 alpha 합성), gain 1.8 pointwise, 크기·구도 유지; 색면/양자화/선 확장·제거/거친 질감 0건 | adapter/후처리 수정 후 전 세트 재검증 |
| 속도 | iPad mini 6 warm p95 대표색 ≤1초, VLM ≤5초, 선화 ≤1초, 전체 사용자 대기 ≤7초; hard timeout 무한 대기 0건 | 기본 해상도/통합 경로 재검토 |
| 메모리/안정성 | VLM/선화 순차 로드, 10회 연속 crash/OOM 0건, 취소/백그라운드에서 메모 보존 | 모바일 gate 실패 |
| 개인정보 | 분석 네트워크에서 원본/파생 원본 전송 0건, 로그·EXIF GPS·백업 누출 0건 | 핵심 기능 인수 실패 |
| 사용 조건 | 가중치와 부속모델의 해당 사용/변환/재배포 근거 기록 | 제품 후보 제외 |

주요 윤곽·공간 관계는 overlay와 객체 annotation으로 비교한다. 합성 계약은 픽셀 검사로 판정하고 인물 수·자세·핵심 사물·배치와 세부 가독성은 원본과 직접 비교한다. 단일 유사도나 임의 가중 평균으로 통과시키지 않는다.

같은 사진에서 1024px과 1536px을 비교해 느려진 만큼 품질이 나아지는지 기록한다. 현재 iPad mini 6 카페 실측은 원본 읽기부터 PNG 저장까지 warm 5회 중앙값 0.223789초와 0.600536초, peak footprint 87.3MiB와 177.6MiB다. 1536px의 개선이 작아 1024px을 기본값으로 유지한다.

다양한 실사진에서 “환각 0을 보증”한다는 뜻이 아니다. 정해진 평가군의 결과와 사용자 비교/재시도 수단을 함께 확보한다. frozen 통과 후 holdout 실패를 평균으로 숨기지 않는다.

## 7. 결과 기록 형식과 다음 결정

각 run: run_id, 사진군 ID/hash(로컬), 모델 revision/hash, runtime/OS/chip/RAM, style1·gain·전처리·padding, input/output dimensions, cold/warm/end-to-end ms, peak process memory, disk bytes, schema retry 횟수, 보존·합성 hard fail 유형, 선화/글 점수, license 상태.

모델별 summary: NOT_RUN / RESOURCE_BLOCKED / LICENSE_BLOCKED / QUALITY_FAIL / MOBILE_FAIL / PASS_WITH_SCOPE. PASS에는 테스트한 플랫폼·기기·언어·사진군 범위를 붙인다. 4B라는 이름이나 quantized 파일 용량으로 메모리 사용을 대신하지 않는다.

판정 순서는 사용조건 → 합성 계약 → 장면 보존·가독성 → iPad mini 6 시간/메모리 → 실제 앱/VLM 통합 → Android다. 실패하면 **선화 기술 게이트 미통과**로 기록하고 범위 변경 판단으로 돌아간다. 모바일 구현을 계속 늘리거나 클라우드 API로 조용히 대체하지 않는다. 실행 순서와 완료 체크는 [현황 체크리스트](03_PROJECT_STATUS.md#4-작업-체크리스트와-완료-기준)를 따른다.

이 문서에는 결제·스토어 출시 테스트를 포함하지 않는다.

선화 실행·실패·실측은 [선화 연구](../experiments/model-selection/LINE_ART_RESEARCH.md)에 기록한다. 과거 확산 seed 17, RubberStamp, 5색 색면·외곽선 강화 결과는 현재 게이트에 합산하지 않는다.

앱 시작 사전 준비 검증: 첫 화면 표시·Book 조작 중 비동기 로드, 같은 모델 중복 준비 방지, 준비 후 사진 여러 장의 인스턴스 재사용, 메모리 해제 후 재준비·사진 취소·초안 보존을 확인한다. 첫 다운로드·cold 로드·warm 추론·두 모델 교체 비용을 분리한다. 사전 로딩으로 생성 자체가 빨라졌다고 계산하지 않는다.

현재 확인 범위는 실험 전용 iPad mini 6 카페 1장의 1024/1536px 선화 실행과 합성·반복 일치다. 실제 제품 앱, VLM 통합, Android는 미검증이다.
