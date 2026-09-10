# Pixabay 사진으로 AI 모델 선정하기

> 현재 이미지 방향(2026-09-10)은 [스타일 1 원본색 컬러 선화](LINE_ART_RESEARCH.md)다. 아래 확산 모델 실행법과 과거 비교는 이력이며 재다운로드·재개 지시가 아니다. 태그·메모용 VLM은 계속 별도 평가한다.

**AI 모델 선정 실험 전용**이다. Pixabay 검색·API 키·사진·응답 캐시는 앱과 Supabase에 연결하지 않는다. VLM과 Stamp 모델은 같은 고정 사진을 로컬에서 처리한다. 실제 모델·품질 게이트는 [AI 검증 계획](../../docs/05_AI_VALIDATION_PLAN.md)이 정본이다.

## 재생성 가능한 로컬 환경

저장소에는 실행 스크립트·고정 프롬프트·검사·의존성 버전만 둔다. 가중치, 변환 모델, Xcode 빌드, 입력 사진과 출력은 Git에서 제외한다.

```sh
python3.12 -m venv experiments/model-selection/.venv
experiments/model-selection/.venv/bin/pip install -r experiments/model-selection/requirements.txt
experiments/model-selection/.venv/bin/python -m unittest discover -s experiments/model-selection -p 'test_*.py'
```

각 모델은 문서에 기록한 저장소와 revision에서 다시 받아 `data/` 아래에 준비한다. 라이선스 확인 없이 가중치를 자동 배포하지 않는다.

## iOS 시뮬레이터 테스트 조건

모델 선정에는 **시뮬레이터 내부의 실제 네이티브 추론**이 필요하다. 현재 Python/Ollama/MPS 실행기는 Mac 전용이며 `expo start --ios`만으로 이를 iOS 모델 실행으로 바꿀 수 없다. 저장된 결과 화면이나 Mac 서버 연결은 모델 이식 검증으로 집계하지 않는다.

2026-09-09 확인: Xcode26.6(17F113), iOS26.5(23F77), iPhone17 Pro 시뮬레이터 기동 성공. 앱 테스트 화면·네이티브 모델 연결은 아직 없다. MLX 전용 실행 경로가 시뮬레이터를 지원하지 않아 먼저 호환 런타임을 갖춘 후보를 골라야 한다.

환경 확인은 `xcodebuild -version`, `xcrun simctl list devices available`로 한다. Xcode의 실행 대상에서 iOS 시뮬레이터를 선택할 수 있어야 한다. 현재 장치 기동 재현은 다음과 같으며 다른 Mac에서는 목록에서 얻은 장치 ID를 사용한다.

```sh
xcrun simctl boot 690514C8-D269-4B41-82C2-1DCBA643C8C6
xcrun simctl bootstatus 690514C8-D269-4B41-82C2-1DCBA643C8C6 -b
```

이미 Booted이면 첫 명령은 생략한다. 모델 시험은 다음 체크를 별도로 완료해야 한다.

- [ ] Simulator 대상 네이티브 빌드·설치·앱 실행.
- [ ] 해당 프로세스 내부에서 가중치 로드와 실제 사진→Stamp/태그 추론. 모델 revision·실행 위치 기록.
- [ ] 앱 시작 준비·재사용·취소·재준비와 원본/메모 보존.
- [ ] 태그는 Stamp와 함께 표시, 문구는 명시 요청 때만 생성.
- [ ] safe area·시트·키보드와 작은 화면 조작.
- [ ] 실기기에서 속도·메모리·발열 별도 확인. 시뮬레이터 시간으로 10초 성능을 주장하지 않음.

검증용 최소 실행기는 제품 앱·Supabase 구축과 분리한다. 지원이 확인되지 않은 런타임을 가짜 결과로 감싼 테스트 앱을 만들지 않는다.

## 1. 키 작성

[.env.example](.env.example)을 이 폴더의 `.env.local`로 복사해 `PIXABAY_API_KEY`를 채운다. 기존 파일이 있으면 덮어쓰지 않고 해당 항목만 입력한다. 작성 후 **“Pixabay 키 작성 완료”**라고 알려 준다. 키는 채팅·명령줄·로그·앱 env에 넣지 않는다.

실험에서만 이 env 파일을 명시적으로 읽는다. API 요청에 키가 필요하므로 요청 URL·예외 메시지를 그대로 출력하지 않는다. 설정 확인은 필수값 존재 여부만 보고한다. 키 작성과 API 연결 확인을 마쳤다. [로컬 VLM 실행기](run_vlm.py)는 준비되어 있으며 사진 검색은 소수 후보를 대상으로 일회성 실행했다.

## 2. 사진 검색과 선택

사용자가 정한 장면·태그·분위기·톤으로 소수 후보를 찾고 사진을 직접 확인해 고른다. 첫 실행은 smoke 5장부터 시작하며 사진을 보지 않고 전체 세트를 일괄 다운로드하지 않는다.

| 사진군 | 검색어 예시 | 색 필터 예시 | 사진에서 확인할 분위기·단서 |
|---|---|---|---|
| 카페 | cozy cafe window | brown | 따뜻함·차분함 / 창·테이블·잔 |
| 인물 포함 실내 | people indoor conversation | orange | 친근함·활기 / 보이는 사람 수와 행동 |
| 거리 | rainy street | gray | 고요함·쓸쓸함 / 젖은 길·도시 구조 |
| 건축물 | old building facade | brown | 고전적·차분함 / 문·창·건물 윤곽 |
| 산·자연 | misty mountain | green | 평온함·신비로움 / 산·안개·나무 |
| 바다 | calm sea | blue | 시원함·평온함 / 물·수평선 |
| 음식 | breakfast table | yellow | 포근함·밝음 / 실제 보이는 음식·그릇 |
| 야경 | city night lights | black | 도시적·활기 / 어둠·조명·거리 |
| 식물 | sunlight leaves | green | 싱그러움·차분함 / 잎·빛 |
| 복잡한 실내 | busy cafe interior | brown | 활기·밀도 / 물건 수·배치 |

위 내용은 **검색 의도이며 사진의 정답이 아니다**. 실제 선택 사진에 없는 잔·사람·안개를 필수 태그로 만들지 않는다. 같은 색에서도 분위기가 다른 사진, 같은 분위기에서도 색이 다른 사진을 포함해 색 하나로 무드를 맞추는 편향을 확인한다.

공식 API는 `q`, `lang`, `image_type=photo`, `colors`, `orientation`, `safesearch` 등을 지원한다. 전용 mood 인수는 없으므로 분위기는 검색어에 표현하고 직접 확인한다. 시작은 `lang=en`, `safesearch=true`, 한 검색당 `per_page=5`로 한다. `image_type=photo`만으로 실사진임을 확정하지 않고 생성 이미지 여부도 확인한다. [API 명세](https://pixabay.com/api/docs/)

동일 검색 응답은 24시간 캐시하고 실제 rate-limit 헤더를 따른다. 429에는 즉시 반복하지 않는다. 검색 결과를 보여 줄 때 Pixabay와 원문 페이지를 표시하며, 실제 평가에는 선택 사진을 로컬로 저장한다. 대량·체계적 다운로드나 사이트 스크래핑은 하지 않는다. [API 사용 지침](https://pixabay.com/api/docs/), [서비스 약관](https://pixabay.com/service/terms/)

사진의 이용 조건을 확인하고 학습·미세조정 없이 사전학습 모델의 추론 비교에만 사용한다. 로고·인물 등 사진별 추가 권리도 확인한다. 원본 모음이나 이미지 원물을 Git·배포물로 재배포하지 않는다. [콘텐츠 라이선스](https://pixabay.com/service/license-summary/)

## 3. 평가 사진과 정답 기준 고정

1. 선택 사진에 비식별 `photo_id`를 붙인다. 같은 이미지와 유사 장면이 frozen/holdout 양쪽에 들어가지 않게 ID·hash·시각 비교로 중복을 확인한다.
2. 모델 결과를 보기 전에 사진만 보고 객체·사람 수·배치, 허용 태그/동의어, 가능한 무드·판단 근거, 지어내면 안 되는 사실을 기록한다. Pixabay 태그는 참고 메타데이터로만 분리한다.
3. 목표 색/톤은 실제 픽셀 분석·밝기와 함께 확인한다. Pixabay의 색 필터는 대표 HEX나 색 비중의 정답이 아니다.
4. smoke 5장은 frozen 후보의 부분집합으로 쓸 수 있다. 최종 frozen 40장과 holdout 10장은 서로 겹치지 않게 고정한다. holdout은 모델·프롬프트 조정에 사용하지 않는다.
5. 모든 후보 모델에 같은 파일·같은 전처리·같은 언어별 프롬프트를 넣는다. 검색어·Pixabay 태그·예상 무드·예시 문구·출처 URL을 모델 입력이나 파일명에 넣지 않는다.

로컬 `data/`에는 선택 사진, 검색 캐시, manifest, 에이전트의 annotation, 모델 출력과 결과를 둔다. 이 디렉터리와 `.env.local`은 Git에서 제외된다. manifest에는 사진 ID·Pixabay ID·원문 페이지·취득일·이용조건 확인일·선택 이유·split·파일 hash·실제 해상도·전처리를 기록한다. 검색어·색 필터·출처 태그는 모델 입력과 분리하고 키가 들어 있는 API URL은 저장하지 않는다.

## 4. 모델별 확인

| 대상 | 확인할 내용 | 평가 방법 |
|---|---|---|
| VLM 태그 | 보이는 객체·장면과 일치하는가 | 에이전트가 원본에서 기록한 기준 precision·동의어 인정·중대한 환각 기록 |
| VLM 무드 | 사진의 빛·구도·상황으로 설명할 수 있는가 | 가능한 복수 표현과 근거로 1~5점 평가; 검색 단어와의 완전 일치로 채점하지 않음 |
| VLM 문구 | 사진에 맞고 한/영이 자연스러운가 | 1~5점 평가; 인물 이름·정확한 장소·사건·사용자의 기억을 지어내면 별도 실패 |
| 대표색 | 픽셀과 색·비중이 맞는가 | 독립된 색 알고리즘과 합성 입력으로 검증; VLM이 색을 맞췄다고 대신하지 않음 |
| Stamp | 동일 장면을 보존하면서 Ink로 바꾸는가 | 원본과 나란히 비교해 객체·사람 수·배치·구도를 먼저 검사하고 스타일은 별도 채점 |

문구의 예시는 정답 문장이 아니다. 같은 의미의 다른 표현을 인정하며 한/영을 따로 평가한다. VLM 태그 precision ≥90%, 언어·사진 적합성 평균 ≥4/5 등 기존 기준을 유지하고, 무드 적합성도 1~5점·평균 ≥4·2점 이하 ≤5%를 사전 제안 기준으로 추가한다. AI 평가임을 명시하며 애매한 후보는 독립 에이전트가 재검토한다. 사용자에게 사진별 검수를 요청하지 않는다.

결과는 `photo_id / model revision / locale / 생성 태그·무드·문구 / 원본 관찰 기준과의 비교 / 점수·실패 이유 / 실행 시간·메모리 / run_id`로 기록한다. 검색과 다운로드 시간은 로컬 추론 시간과 분리한다. 선택 사진의 hash와 prompt version을 고정한 뒤 비교하며, 좋은 결과만 보고서에 골라 넣지 않는다.

## 5. 로컬 실행 재현

사용자가 Ollama 모델 다운로드와 로컬 실험 실행을 승인했다. 앱 패키지와 Supabase 설정은 변경하지 않는다. 현재 Mac 결과·정확한 가중치·실패 사례는 [smoke 결과](SMOKE_RESULTS.md)에 기록한다.

저장소 루트에서 실행한다. VLM 실행기는 Python 표준 라이브러리만 사용하며 Ollama가 `127.0.0.1:11434`에서 실행 중이어야 한다. 공개 다운로드와 로컬 추론을 구분하고 클라우드 모델은 허용하지 않는다.

```sh
ollama pull qwen3-vl:2b-instruct
ollama pull hf.co/ggml-org/SmolVLM-500M-Instruct-GGUF:Q8_0
ollama pull qwen3-vl:4b-instruct
python3 -m unittest discover -s experiments/model-selection -p 'test_run_vlm.py'
python3 experiments/model-selection/run_vlm.py \
  --model qwen3-vl:2b-instruct hf.co/ggml-org/SmolVLM-500M-Instruct-GGUF:Q8_0 qwen3-vl:4b-instruct \
  --images experiments/model-selection/data/photos/p001.jpg experiments/model-selection/data/photos/p002.jpg experiments/model-selection/data/photos/p003.jpg experiments/model-selection/data/photos/p004.jpg experiments/model-selection/data/photos/p005.jpg \
  --seeds 42 --locales ko en \
  --out experiments/model-selection/data/vlm-new-run
```

사진은 먼저 직접 확인해 선정한다. 위 `data/photos/`는 이 Mac에만 있으며 Git 복제에 포함되지 않는다. `--out`은 새 경로를 사용하며 기존 결과를 덮어쓰지 않는다. 기본 seed는 17/42/89, 언어는 ko/en이다. smoke에서는 먼저 seed 42 한 번으로 명백한 실패를 확인한다.

기본 `--task analysis`는 태그·무드를 분석하며 문구는 빈 문자열로 검증한다. 스탬프 변환 결과와 태그는 함께 제공한다. 사용자 요청에 해당하는 실험만 `--task caption`으로 실행하며 이 응답은 `ai_field_note` 하나만 포함한다. 문구 제안은 메모·태그를 덮어쓰지 않는다. v4의 한국어 문구 목표는 8~20자(최대 24자), 영어는 4~8단어(최대 60자)이며 저장 계약은 300자를 유지한다. 기존 v1~v3의 동시 문구 생성은 과거 능력 비교 결과다.

JSON schema와 사후 검증을 함께 적용하며 형식 오류만 한 번 재요청한다. 출력·시간·digest·사진 hash·프롬프트·작업 모드를 보존한다. 빈 값의 구조 통과를 품질 합격으로 간주하지 않는다. 120초는 Mac 실험 대기 상한이며 앱 취소 검증을 대신하지 않는다.

Stamp는 Ollama와 별도 프로세스에서 `mflux==0.19.1`로 실행한다. 두 추론을 동시에 실행하지 않는다. 실험 전용 환경을 사용하며 이미 있으면 다시 만들지 않는다.

이미 준비된 실험 `.venv`와 로컬 가중치를 재사용한다. 현재 요청문은 [stamp-prompt.json](stamp-prompt.json)의 JSON 객체이며 실제 모델 입력과 설정을 출력 폴더에 보존한다.

```sh
experiments/model-selection/.venv/bin/python experiments/model-selection/run_stamp.py \
  --image experiments/model-selection/data/reference-cafe/input-640.png \
  --profile balanced --seeds 42 42 17 89 \
  --out experiments/model-selection/data/stamp-new-run
```

`fast`는 긴 변 384, `balanced`는 512를 사용한다. 모델 revision·4 steps·guidance 1·low-RAM은 JSON에 고정한다. 같은 seed의 반복 결과와 다른 seed의 장면/색/질감 변화를 모두 기록한다. JSON 형식과 seed만으로 품질 일관성을 보증하지 않는다. 과거 텍스트 요청문 결과는 별도 탐색군으로 남긴다.

결과는 HTML 소스 파일 대신 **브라우저**로 연다. 데이터 폴더만 localhost에 제공하며 env가 있는 상위 폴더는 제공하지 않는다.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory experiments/model-selection/data
```

브라우저 주소: `http://127.0.0.1:8765/reference-cafe/review.html` (카페 기준 비교), `http://127.0.0.1:8765/review.html` (초기 Pixabay 비교). 자산은 이 Mac에만 있으므로 복제한 저장소에서는 실험을 먼저 실행해야 한다.

## 현재 상태와 다음 단계

Pixabay 키 작성·API 연결과 Mac smoke 실행을 마쳤다. [결과 문서](SMOKE_RESULTS.md)에서 사진별 실패·한계와 에이전트 평가와 남은 항목을 확인한다. 원본/결과/캐시/모델 런타임은 Git에서 제외된다.

현재 5장은 실행 가능성과 명백한 품질 문제를 찾기 위한 탐색용이며, 정식 frozen 40장·holdout 10장·에이전트의 사전 annotation·3 seeds·모바일 검증은 완료하지 않았다. 모델 최종 선정과 앱/Supabase 구축의 선행 조건은 아직 충족하지 않았다.

## 대체 모델 SD-Turbo 재현

[대체 후보 조사](ALTERNATIVES.md)와 사용 조건을 확인한다. 기존 실험 환경의 Diffusers0.40.0 / Accelerate1.14.0을 사용한다. 가중치가 이미 로컬에 있어야 하며 실행 중 추가 다운로드하지 않는다.

```sh
experiments/model-selection/.venv/bin/python experiments/model-selection/run_turbo.py \
  --image experiments/model-selection/data/reference-cafe/input-640.png \
  --out experiments/model-selection/data/turbo-new-run
```

`--cases '[[8,0.25,17],[8,0.25,17]]'`은 낮은 변형 강도 반복 비교다. 실제 생성 단계는 steps×strength의 정수 부분이며 최소1이어야 한다. JSON 요청문은 실행기에 고정되어 있고 실제 문자열·토큰 수·사진 hash·설정·로드/추론 시간이 결과에 저장된다. 사진은 모델 내부에서 재해석하므로 높은 강도에서 핵심 특징이 사라지는지 검사한다. 상주 로딩은 Mac 실험에서만 확인했으며 모바일 앱 구현이 아니다.
