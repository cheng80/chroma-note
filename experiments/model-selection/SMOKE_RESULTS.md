# VLM 로컬 smoke 실측 결과

2026-09-10 · 이 문서는 사진 이해·태그·사용자 요청 문구 VLM 검증만 보존한다. 이미지 생성형 Stamp 실험과 출력은 현재 컬러 선화 방향에 맞지 않아 삭제했다. 선화 실측은 [LINE_ART_RESEARCH.md](LINE_ART_RESEARCH.md)에서 관리한다.

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

평가 사진·annotation·VLM 실행 결과는 Git 제외 `data/`에 둔다. VLM 관련 모델과 실행 자료만 유지한다.

- `data/ios-smoke/models/`의 Qwen3-VL·SmolVLM2 GGUF
- `data/ios-smoke/qwen3vl-compat/`의 Qwen 호환 준비 자료
- `data/ios-smoke/fastvlm-0.5b/`, `data/ios-smoke/smolvlm2-500m/`, `data/ios-smoke/gemma3n/`
- `data/plan01-vlm-*`, `data/plan01-vision-smoke-*`
- `data/reference-cafe/`의 `json-*`, `smolvlm2-*`, `vlm-*`, `gemma3n-*` 결과

이미지 생성형 Stamp의 DreamLite·SD-Turbo·LCM·결정적 후처리·통합 실행 자료와 관련 모델은 2026-09-10 정리했다.
