# VLM 로컬 smoke 실측 결과

2026-09-12 · 이 문서는 사진 이해·태그·사용자 요청 문구 VLM 검증만 보존한다. 이미지 생성형 Stamp 실험과 출력은 현재 컬러 선화 방향에 맞지 않아 삭제했다. 선화 실측은 [LINE_ART_RESEARCH.md](LINE_ART_RESEARCH.md)에서 관리한다.

## LFM2.5-VL-450M과 현재 Qwen3-VL 4B, 5장 비교

**현재 설정에서는 LFM으로 교체하지 않는다.** 용량과 응답 시간은 줄지만 한국어 문구와 태그의 구조·사실성 조건을 안정적으로 지키지 못했다. 기존 Qwen에도 어색한 표현과 다른 언어 혼입이 있으므로 Qwen의 형식 통과를 품질 보증으로 바꾸지 않는다.

2026-09-12, MacBook Air M4 16GB에서 iPhone 17 Pro / iOS 26.5 Simulator 내부 네이티브 CPU 추론을 수행했다. `p001`~`p005` 원본 JPEG 5장(긴 변 640px), 모델 2개, 태그/문구 2개 작업, 지시문 2개 조건으로 **총 40개 요청**이다. 각 사진을 건너뛰지 않았고 실패·보정 원문을 모두 남겼다. 앱이나 저장된 사용자 데이터는 변경하지 않았다.

| 지시문 | 모델 | 태그 형식 통과 | 문구 형식 통과 | 태그 요청 평균 | 문구 요청 평균 | 프로세스 최대 RSS |
|---|---|---:|---:|---:|---:|---:|
| 현재 앱 그대로 | LFM 450M | 0/5 | 0/5 | 2.74초 | 2.66초 | 688.0MiB |
| 현재 앱 그대로 | Qwen 4B | 5/5 | 5/5 | 11.99초 | 8.04초 | 4,787.7MiB |
| 짧은 지시문 | LFM 450M | 0/5 | 2/5 | 2.27초 | 1.44초 | 698.4MiB |
| 짧은 지시문 | Qwen 4B | 5/5 | 5/5 | 8.77초 | 6.28초 | 4,875.9MiB |

시간은 사진당 최초 요청과 구조 오류 때의 보정 1회를 합친 값의 5장 산술 평균이다. **LFM의 실패 응답 시간도 포함하므로 성공한 문구 생성 속도 비교가 아니다.** 최대 RSS는 해당 네이티브 프로세스의 `getrusage` 값이며 앱 전체 메모리나 실기기 RAM 측정이 아니다. 다운로드·파일 해시 검증·모델 최초 로드는 위 요청 시간에서 제외했다. 샘플 수 5로 p95나 모든 사진의 품질을 판정하지 않는다.

### 사진별 문구 관찰

LFM은 현재 앱 지시문에서 5장 전부 거부됐으므로, 아래에는 짧은 지시문에서 생성한 원문을 따로 표시했다. 서로 다른 지시문 결과를 동일 조건 승패로 계산하지 않는다. 원문을 고쳐서 성공으로 만들지 않았다.

| 사진 | 현재 앱 Qwen 문구 원문 | 짧은 지시문 LFM 문구 원문 | LFM 관찰 |
|---|---|---|---|
| p001, 창가 커피 | 창가에 놓인 커피 한 잔 | 사진에는 흰색 쿠키가 보입니다. | 형식 통과, 사진에 없는 쿠키 생성 |
| p002, 꽃모자 인물 | 금빛 빛 속 빈티지한 여인 | 사진에는 꽃이 있는 모자와 흰색 드레스를 입은 사람이 있습니다. | 최대 24자 초과 |
| p003, 골목 | 노란빛으로 비춰진 고요한 улиц | 사진에는 나무가 없습니다. | 코드 블록으로 형식 실패, 식물이 보이는데 부정 |
| p004, 숲과 절벽 | 자연의 푸른 숲과 바위가 어우러진 풍경 | 사진에는 나무의 색상이 생생하고, 빛이 그림자를 드리우고, 구름이 흩어져 있어서 하늘이 푸른색으로 보입니다. | 길이 초과, 보이지 않는 하늘과 구름 생성 |
| p005, 계단 실내 | 따뜻한 조명 아래 계단 | 사진에는 나무로 만든 천장 램프가 있습니다. | 형식 통과, 나무 재질 단정 근거 부족 |

Qwen의 p003 문구는 현재 앱 검사에 통과했지만 `улиц`라는 키릴 문자 문자열이 섞였다. p002는 ‘금빛 빛’이 중복되고 p004는 목표 8~20자를 넘는 21자지만 최대 24자 안이다. Astra의 모델명·속도·용량을 가린 사전 기준 평가에서 표준 Qwen 문구 5장의 자연스러움/사진 근거/분위기 평균은 3.4/4.4/4.2였다. 이는 에이전트 평가이며 사람의 정답이 아니다. LFM 표준 조건은 승인 문구 0건이므로 잘린 원문으로 평균 점수를 만들지 않았다.

### 동일하게 유지한 것과 한계

- [현재 앱 bridge](../../modules/chroma-analysis/ios/ChromaAnalysisBridge.mm)를 변경 없이 컴파일하고 [index.ts](../../modules/chroma-analysis/index.ts)의 요청·한국어 검사·구조 보정 1회 정책과 [출력 검사](../../modules/chroma-analysis/output-contract.ts)를 재사용했다. Expo 전달 경로만 별도 실험 프로세스 입출력으로 연결했으며 실제 모델 추론은 Simulator 내부에서 수행했다.
- `llama.cpp` revision `1945e092030f8668ff93382799502d01490e564d`, CPU 8 threads, GPU off, context 4096, batch 2048, ubatch 512, temperature 0.2, seed 17, 최대 128 tokens였다. 별도 LoRA·클라우드·번역·출력 자르기·코드 블록 제거는 하지 않았다.
- 두 번째 조건은 두 모델 모두 동일한 짧은 한국어 지시문으로 바꾸고 나머지를 유지했다. 지시문·실제 원문은 결과 JSON에 보존했다. Liquid 권장 sampling, 다른 런타임·양자화·영어 지시는 시험하지 않았으므로 LFM의 모든 구성이 불가능하다는 결론은 아니다.
- 모델 준비는 표준 LFM 0.228초/Qwen 9.385초, 짧은 조건 LFM 0.197초/Qwen 3.344초였다. 매 조건 새 프로세스에서 LFM→Qwen 순서로 실행했고 OS 파일 캐시를 비우지 않았다. 파일 해시 검증도 먼저 실행했으므로 완전한 cold disk latency로 해석하지 않는다.
- 공식 LFM Q4_K_M 본체와 Q8_0 mmproj의 합계 332,128,736 bytes, revision `1abed04b6fe71314d8c446a1371c03d7c332266d`를 다운로드 후 SHA-256까지 대조했다. 현재 Qwen 합계는 2,950,511,680 bytes다. [파일 크기·출처 조사](../../docs/research/2026-09-12-lightweight-mood-models.md)

### 재현과 결과 보기

[실행기](compare_vlm_sim.mjs), [네이티브 진입점](ios-vlm-bench.mm). iOS Simulator 라이브러리와 사진 5장을 사용하며 기존 결과 폴더는 덮어쓰지 않는다. **2026-09-12 후속 삭제 요청으로 LFM 가중치는 제거했다.** 아래 비교를 다시 실행하려면 기록한 revision·SHA-256의 LFM 본체와 mmproj를 다시 준비해야 한다. 현재 비교 결과·원문·평가는 보존했다.

```sh
node --experimental-strip-types experiments/model-selection/compare_vlm_sim.mjs --out experiments/model-selection/data/lfm-qwen-new-standard
node --experimental-strip-types experiments/model-selection/compare_vlm_sim.mjs --concise --out experiments/model-selection/data/lfm-qwen-new-concise
```

실제 결과는 `data/lfm-qwen-sim-20260912-01/`, `data/lfm-qwen-sim-20260912-concise/`다. 각 폴더에 환경·소스/사진 hash·모델 manifest·요청별 시간/메모리·첫 출력/보정 출력이 있다. 사진과 두 모델의 결과는 [5장 비교 페이지](data/lfm-qwen-five-photos-report/index.html)에서 본다. 페이지의 설명과 문구에는 설치된 `semantic-wrap` 0.4.0을 적용했으며 두 조건 각각 사진 5장, 좁은/넓은 화면의 원문 보존과 가로 넘침 없음을 확인했다.

## 검증 범위

- VLM 원문은 제품에 표시하거나 저장하지 않는다.
- 기본 `analysis`는 태그·무드를 만들고 `ai_field_note`를 빈 문자열로 둔다.
- `caption`은 사용자가 명시적으로 요청한 경우에만 실행하고 메모·태그를 덮어쓰지 않는다.
- 태그와 컬러 선화는 독립 판정한다. VLM 성공을 선화 품질 통과로 해석하지 않는다.

## Mac·iOS 실행 결과

| 후보 | 범위 | 결과 |
|---|---|---|
| Qwen3-VL 4B | iOS Simulator 네이티브 CLI, 카페 사진 포함 한·영 JSON | 실행 확인. 한글 문구의 근거 없는 표현과 mmproj 출처 검증이 남아 최종 채택 보류 |
| Gemma 3n | 네이티브 사진 입력 | `<unused57>` 반복 출력으로 실패 |
| FastVLM 0.5B | iPhone 14 Pro Max, 카페+smoke 5장 | 실행은 빠르지만 태그 전용 지시를 따르지 않고 추정이 섞여 연구 기준선으로만 유지 |
| SmolVLM2 500M | iOS Simulator fresh process, frozen 40장+holdout 10장 | 실행/schema 50/50 PASS. 태그 precision 90/115(78.26%), frozen 동의어 일치 27/40(67.5%), holdout 4/10(40%)으로 `QUALITY_FAIL` |
| Apple Vision | macOS smoke 5장 기준선 | 평균 0.0211초, 첫 3개 동의어군 precision 8/12(66.67%). iOS 전용 비교 기준선 |

SmolVLM2의 고정 ontology adapter는 구조·금칙어·중복 검사를 통과하지만 50장 품질 목표를 통과하지 못했다. 제품 모델 채택이 아니라 수정·삭제 가능한 보조 제안 실험으로만 유지한다.

## 보존한 VLM 실행 근거

2026-09-09 Mac 실행 환경은 MacBook Air M4·16GB·macOS 26.6, Python 3.12.10·Ollama 0.32.5였다. 아래는 당시 실측이며 모바일 성능으로 환산하지 않는다.

- v1/v2는 3모델×사진 5장×한/영으로 총 60건이다. SmolVLM은 요청문 복사, Qwen2B는 환각·언어 혼합으로 해당 구성에서 실패했다. Qwen4B v2는 10건 JSON 통과·평균 8.31초였다.
- 문구 v3는 Pixabay 10건 JSON 통과·평균 7.42초, ko 13~22자·en 29~46자였다. 카페 v3 2건과 v4 4건까지 당시 누적 VLM은 76건이다. 설명조·어색한 연결은 남았으며 과거 동시 문구 생성은 현재 자동 생성 정책이 아니다.
- 카페 v4 자동 분석은 ko 11.85초·en 2.88초로 문구가 비었고, 요청 문구는 ko 8.62초·en 1.33초로 `ai_field_note`만 반환했다. ko→en 순서와 로드·캐시 영향을 포함한다. `바리스타`·`staff members` 같은 역할 추정은 보완 항목이다. 사용자의 초기 문구·태그 수용을 전체 사진·모바일 통과로 확대하지 않는다.
- FastVLM 0.5B는 Apple 공식 코드 `592b4ad`·공식 FP16 가중치로 iPhone 14 Pro Max에서 6장을 실행했다. cold load 3.62초, warm 1.44~2.71초, TTFT 0.88~1.67초, peak RSS 1,103,429,632 bytes였다. 당시 확인한 연구용 가중치 조건과 출력 품질 제한 때문에 제품 후보가 아닌 연구 기준선으로 유지한다.
- SmolVLM2 500M의 앞선 실기기 smoke는 공식 MLX 변환 `fa57db4`·MLX Swift LM 3.31.3, 입력 512·32 token이었다. 준비 후 5장 연속 4.19~4.24초, first chunk 3.60~3.62초, peak RSS 1,211,793,408 bytes였다. 최초 다운로드·로드 포함 146.10초와 앱 재시작 후 준비 포함 6.09초는 warm 수치와 구별한다. 위치 추정·token 절단으로 raw 설명은 `QUALITY_FAIL`이었으며 후속 고정 ontology의 50장 결과도 위 표처럼 품질 미달이다.

| Mac VLM 모델 | 당시 설치된 Ollama digest |
|---|---|
| `qwen3-vl:2b-instruct` | `ea422f1e73652a95479954d8572d3c8c6022f628ce2d38a1a04aae1b7f2d5300` |
| `hf.co/ggml-org/SmolVLM-500M-Instruct-GGUF:Q8_0` | `3904de461d26985a56c6e3b269d1b0fe63086a6d3fd6d5153aff950cfc1dc3ce` |
| `qwen3-vl:4b-instruct` | `ee4b975b58c17ce268cd19d40db35d5edc64603035d2ffc1fee1968eb0947f7b` |

모델 출처는 [Qwen 2B](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [Qwen 4B](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct), [SmolVLM 원본](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct), [SmolVLM GGUF](https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF)다. 당시 Apache-2.0 표기를 확인했으며 앱 변환·재배포 시 정확한 LICENSE/NOTICE 동봉 검증은 남아 있다. 저장소 revision과 Ollama digest는 서로 다른 식별자다.

## 재현 자료

평가 사진·annotation·VLM 실행 결과는 Git 제외 `data/`에 둔다. 2026-09-12 사용자 요청으로 미사용 가중치와 중복 캐시 약 12.33GB를 삭제했다. LFM, SmolVLM 계열, Ollama 실험 모델 3개와 손상 Qwen 파일은 제거했고 현재 앱·재빌드용 Qwen 및 선화 모델을 보존했다. 아래 경로 중 폐기 모델 폴더에는 실행 로그·구성 메타데이터만 남으며 가중치가 있다고 간주하지 않는다. [삭제·보존 검증 기록](data/model-cleanup-20260912.json)

- `data/ios-smoke/models/`의 현재 Qwen3-VL mmproj GGUF
- `data/ios-smoke/qwen3vl-compat/`의 Qwen 호환 준비 자료
- `data/ios-smoke/fastvlm-0.5b/`, `data/ios-smoke/smolvlm2-500m/`, `data/ios-smoke/gemma3n/`
- `data/plan01-vlm-*`, `data/plan01-vision-smoke-*`
- `data/reference-cafe/`의 `json-*`, `smolvlm2-*`, `vlm-*`, `gemma3n-*` 결과

이미지 생성형 Stamp의 DreamLite·SD-Turbo·LCM·결정적 후처리·통합 실행 자료와 관련 모델은 2026-09-10 정리했다.
