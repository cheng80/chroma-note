# Galaxy A24의 저메모리 VLM 검토

2026-09-13. 대상은 Samsung SM-A245N / Android 16 / RAM 4GB / Mali-G57 MC2다. 사용자 제공 추천 자료를 공식 출처와 이전 프로젝트 실측으로 검토했다. 제품 모델을 변경하거나 외부 서비스 계정을 개설한 기록이 아니다. 최신 실측 진행 상태는 [프로젝트 현황](../03_PROJECT_STATUS.md)을 따른다.

**사용자 최종 판정: 현 스펙으로 실사용 불가.** Galaxy A24 4GB의 현재 앱·온디바이스 AI 구성에 대한 판정이다. 4B의 시간 초과·메모리 종료, 2B의 현행 조건 시간 초과 및 축소 조건 지연·문구 품질 실패가 근거다. 일반 기록·선화·저장 성공을 AI 실사용 가능으로 확대하지 않으며, 다른 Android 기기 전체에 대한 판정으로 일반화하지 않는다. 이 판정으로 이번 성능 실험을 종료한다.

## 수치 해석

- 모델 파일 용량은 실행 시 RAM과 같지 않다. 언어 가중치 외에 비전 가중치·연산 버퍼·문맥·앱·OS가 함께 상주한다. `최대 1.5GB 파일`, `1.6B 이하`, `FP16은 절대 불가능`을 모든 기기에 적용하는 고정 기준으로 삼지 않는다.
- A24에서 기존 4B GPU 실행은 실제 LOW_MEMORY 종료를 겪었다. 2B는 전체 파일 1,552,463,168바이트로 줄지만, 초기 Vulkan 문구 요청은 메모리 종료 없이도 90초를 넘었다. `GPU 배치 성공`과 `실용적인 생성 속도`는 별도다.
- 모델/런타임·이미지 토큰·지시문·정밀도·CPU 기능·앱 포함 여부가 같은 결과끼리 비교한다. Mac·Simulator의 시간을 실폰 속도로 환산하지 않는다.

## 후보 검토

| 후보 | 확인한 공식 내용 | Chroma Note 판단 |
|---|---|---|
| SmolVLM2 256M/500M | 256M 모델 카드는 언어를 영어로 명시하며 영상 추론 메모리를 1.38GB GPU RAM으로 설명한다. 일반 SmolVLM 256M의 이미지 추론 `1GB 미만` 수치와 다른 조건이다. | 이전 500M 50장 검사에서 구조 50/50 통과, 태그 precision 78.26%, holdout 일치 40%로 품질 미달. 한국어 짧은 문구 생성의 교체 후보로 다시 합격 처리하지 않는다. |
| Moondream2 | 현재 공식 사이트는 2B dense 모델과 별도 0.5B 모델을 구분한다. 2B 모델 카드의 고정 릴리즈는 `2025-06-21`이며 caption·query·detect·point API를 제공한다. | `약 1.6B, INT4 실행 RAM 1.1GB`는 현재 배포본·Android·한국어 조건의 보장값으로 확인되지 않았다. 한국어 문구와 실제 사용 런타임 검사가 먼저 필요하다. |
| picoVLM | 공식 제품 페이지가 CPU 실행·Android/iOS·다국어를 안내한다. Android SDK는 Picovoice 계정·AccessKey와 `.pllm` 모델을 사용하며 일반 시작 안내에 키 검증용 인터넷 권한이 있다. | A24의 메모리·속도·한국어 문구 품질 수치는 확인하지 못했다. 업체의 Qwen급 품질 표현을 독립 검증으로 취급하지 않는다. 모델 접근·계정 조건을 갖추기 전 실행 후보 확정은 보류한다. |
| Qwen3-VL 2B | 공식 `Qwen/Qwen3-VL-2B-Instruct-GGUF`, revision `52d6c8ffea26cc873ac5ad116f8631268d7eb503`, Q4_K_M 본체 1,107,409,952바이트 + Q8_0 비전 445,053,216바이트. 다운로드·실폰 파일 SHA-256 일치 확인. | A24의 현행 이미지 256토큰 조건은 첫 문구가 90초를 넘었다. 축소 64토큰·별도 CPU 빌드의 사진 5장은 형식 3/5, 형식과 사진 근거를 함께 만족한 문구 0/5였다. 이 조건으로 제품을 교체하지 않는다. |

공식 출처: [SmolVLM2 256M 카드](https://huggingface.co/HuggingFaceTB/SmolVLM2-256M-Video-Instruct), [SmolVLM 논문](https://arxiv.org/abs/2504.05299), [Moondream 모델 구분](https://moondream.ai/), [Moondream2 카드](https://huggingface.co/vikhyatk/moondream2), [picoVLM 제품](https://picovoice.ai/products/vision/vlm/), [Picovoice Android 시작 안내](https://picovoice.ai/docs/quick-start/picollm-android/), [Qwen2B GGUF](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF). 이전 출력·판정은 [프로젝트 smoke 결과](../../experiments/model-selection/SMOKE_RESULTS.md)를 따른다.

## CPU 비교 조건

고정 llama.cpp의 [Android 문서](https://github.com/ggml-org/llama.cpp/blob/1945e092030f8668ff93382799502d01490e564d/docs/android.md)는 기본 교차 빌드를 portable ARM64로 설명하고 전역 아키텍처 플래그를 올리면 지원 기기 범위가 달라짐을 명시한다. [KleidiAI 문서](https://github.com/ggml-org/llama.cpp/blob/1945e092030f8668ff93382799502d01490e564d/docs/build.md#arm-kleidiai)는 지원 CPU·연산·텐서 형식에 따른 런타임 선택을 설명하며 모든 연산의 가속을 보장하지 않는다.

이번 A24는 `asimddp`, `fphp`, `asimdhp`를 보고했다. 별도 검사 앱에서 ARM 명령 조건과 이미지 토큰 수를 조절한다. 이 실험용 바이너리를 일반 Android 앱의 호환성 검증 없이 제품에 적용하지 않는다. 검사 앱은 기존 기록·로그인·4B 모델을 변경하지 않으며, 메모리 수치에는 Expo 앱 전체가 포함되지 않는다.

## Qwen3-VL 2B 실폰 결과

제품과 같은 한국어 지시문·출력 계약·1회 보정·추론당 90초·문맥 2048·최대 출력 128토큰을 사용했다. 모델 준비는 별도 180초다. 제품의 사진·기록 저장을 건드리지 않는 별도 Android 검사 앱에서 수행했다. 표의 시간은 보정과 기기 통신을 포함한 문구 요청 전체 시간이며 최초 공통 모델 준비는 제외한다.

| 조건 | p001 커피 사진 결과 |
|---|---|
| 이미지 256토큰, portable ARM64 CPU | 비전 25.827초, prefill 시작부터 80.904초, 출력 완료 전에 90초 제한으로 취소 |
| 이미지 256토큰, 비전 CPU → 언어 Vulkan 29/29층 | 비전 25.367초·언어 로드 5.197초 뒤 90초 내 출력 없음. 초기 취소 callback 보강 전 빌드에서는 132초에도 미반환하여 검사 앱을 중단 |
| 이미지 256토큰, CPU `armv8.2-a+dotprod+fp16` | 약 92초 제한 실패. ARM 플래그 변경만으로 개선되지 않음 |
| 이미지 256토큰, CPU `armv8.2-a+dotprod` | 약 91초 제한 실패. 아래 축소 조건과 이미지 처리량이 다름 |
| 이미지 최대 64토큰, CPU `armv8.2-a+dotprod` | 아래 5장 문구 검사 수행. 이미지 축소와 CPU 플래그 효과를 분리한 성능 개선 수치로 해석하지 않음 |

축소 조건의 실제 이미지는 54~60토큰이었다. 출력 원문을 별도 수정하거나 실패한 결과를 제거하지 않았다.

| 사진 | 최종 문구 또는 실패 원문 | 전체 시간 | 판정 |
|---|---|---:|---|
| p001 커피 | 아침에 커피를 마시는 시간 | 65.237초 | 형식 통과, 사진으로 확정할 수 없는 아침·행동 추정. 최초 출력은 `아이스크림` |
| p002 노란 벽 앞 인물 | 한국어 문구 | 66.681초 | 보정 후에도 최소 길이 미달, 지시문 예시 출력 |
| p003 골목 | 도시의 작은 거리에 있는 온라인 쇼핑몰 | 38.510초 | 형식 통과, 온라인 쇼핑몰 추정 |
| p004 숲과 절벽 | 산들 속에 흰색 나무가 떠 있는 장면 | 40.268초 | 형식 통과, 사진과 다른 묘사 |
| p005 벽돌 실내 | 이곳은 따뜻한 조명과 따뜻한 분위기의 식당입니다. | 80.261초 | 최초 JSON 오류, 보정 후 24자 초과 |

형식은 3/5, 형식과 사진 근거를 모두 만족한 문구는 **0/5**다. 이 5장에 대한 수동 판정이며 모든 2B 모델·프롬프트·런타임이 실패한다는 결론은 아니다. 문구 요청 중앙값은 65.237초, 검사 앱의 1초 간격 최대 관측 PSS는 1,691,786KiB(약 1.61GiB)였다. p001 태그 분석은 두 번의 출력에 149.919초가 들었고 코드 블록·잘린 JSON·아이스크림 반복으로 `schema_error`였다. 분석 최대 관측 PSS는 1,757,478KiB(약 1.68GiB)다. 짧은 메모리 피크를 놓칠 수 있으며 실제 Expo 앱 전체 메모리는 추가된다.

결론은 **현재 조건의 2B를 A24용 제품 모델로 채택하지 않음**이다. 제품의 4B 모델·NAS·이미지 토큰·일반 ARM64 호환성 설정은 유지했다. 남은 사진의 태그 분석은 p001 분석 실패 이후 확대하지 않았다.

로컬 근거: 종합 결과와 원문 (`../../experiments/model-selection/data/android-2b-20260913/comparison.json`, 2026-09-14 삭제), 실험 CPU 조건 (`../../experiments/model-selection/data/android-2b-20260913/reduced-profile.json`, 2026-09-14 삭제), p001 원문 (`../../experiments/model-selection/data/android-2b-20260913/qwen2b-cpu-dotprod-64.json`, 2026-09-14 삭제), p002~p005 원문 (`../../experiments/model-selection/data/android-2b-20260913/qwen2b-cpu-dotprod-64-captions.json`, 2026-09-14 삭제). 이 로컬 실험 자료는 Git에 포함하지 않았으며 2026-09-14 사용자 요청으로 삭제했다. 위 측정 조건·수치·최종 판정은 문서에 유지한다.

## 공유 답변의 영문 분석·번역 분리 제안

[사용자 공유 Google AI 모드 답변](https://share.google/aimode/eAB9A4e0W7jOBDloi)의 후속 대화는 한국어와 사진 분위기 분석을 위해 영문 소형 VLM → ML Kit 한국어 번역, 또는 PaliGemma 파인튜닝을 제안한다. 이 페이지는 제안의 출처이며 성능 검증 근거로 삼지 않는다.

- 영문 분석과 한국어 표현을 분리하는 구조는 검토할 가치가 있다. [ML Kit 공식 안내](https://developers.google.com/ml-kit/language/translation)는 다운로드한 언어 모델로 기기 내 번역이 가능하다고 설명하며, 간단한 번역용이므로 용도별 품질 확인을 요구한다. Android 기본 내장 API가 아니라 앱에 추가하는 SDK이며, [Android 안내](https://developers.google.com/ml-kit/language/translation/android)에 따르면 언어 모델은 약 30MB의 추가 다운로드가 필요하다.
- 먼저 같은 사진에서 영문 원문의 사물·색·조명·배치가 맞는지 검증하고, 그다음 한국어 번역이 근거를 보존하는지 평가한다. 번역은 잘못 인식한 사물이나 없는 시간·행동을 바로잡는 단계가 아니다. 제한된 태그만 필요하면 기존 ontology의 한국어 매핑을 재사용할 수 있지만 자유로운 AI 문구 생성과는 다른 기능 범위다.
- `A24 5~10 tokens/s`, `RAM 500~800MB`, `OOM 위험이 전혀 없음`, `리사이즈로 70% 이상 단축`은 해당 기기·런타임·사진의 실측 근거를 확인하지 못했다. 앞선 SmolVLM2 품질 실패도 번역기를 붙였다는 이유로 해소된 것으로 계산하지 않는다.
- [PaliGemma 공식 문서](https://ai.google.dev/gemma/docs/paligemma)는 3B 이상 크기와 입력 해상도별 변형, PT 모델의 파인튜닝 필요성을 설명하고 mix 모델을 별도로 구분한다. A24 메모리·속도·한국어 분위기 품질을 보장하지 않으므로 현재 2B 실측보다 우선하는 검증된 대안으로 취급하지 않는다.

이 검토에서 새 번역 SDK·모델·계정을 제품에 추가하지 않았다.
