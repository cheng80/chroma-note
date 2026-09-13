# 모델 검증 기록과 현재 준비 파일

2026-09-14 사용자 요청으로 미사용 모델과 종료된 실험의 임시 테스트 파일을 정리했다. 현재 앱은 기존 iOS에서 사용하던 두 모델만 유지한다.

| 용도 | 유지 모델 | 실행 파일 |
|---|---|---|
| 사진 분석과 문구 | Qwen3-VL 4B Instruct | Q4_K_M 호환 본체 GGUF와 Q8_0 비전 GGUF |
| 컬러 선화 | Informative Drawings style 1 | iOS `LineArt.mlmodelc`, 같은 모델의 Android `LineArt.onnx` |

Qwen 본체와 비전 파일은 하나의 사진 분석 모델을 구성한다. Android 전용 비교 후보인 Qwen3-VL 2B는 제거했다. 후속 요청으로 선화 원본·변환 패키지, 런타임 소스·라이브러리와 Python 환경도 재생성 가능한 캐시로 정리했으며 두 모델의 실제 실행 파일은 유지한다.

## 남겨 둔 로컬 준비 파일

- `data/ios-smoke/qwen3vl-compat/qwen3vl-4b-ollama-compatible.gguf`와 변환 manifest
- `data/ios-smoke/models/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf`
- 제품 모듈의 iOS `LineArt.mlmodelc`와 Android `LineArt.onnx`

`data/ios-smoke/vendor/llama.cpp`, `build-ios-sim-cli`, `build-ios-device-cli`, `.venv/`는 후속 정리에서 삭제했다. iOS 런타임은 `python3 scripts/prepare-analysis-runtime.py --build`로 고정 소스부터 재생성한다. Python 환경은 모델 변환·Python 검사가 필요할 때만 선화 모듈 안내에 따라 만든다.

앱 준비는 [사진 분석 모듈](../../modules/chroma-analysis/README.md)과 [선화 모듈](../../modules/chroma-lineart/README.md)의 절차를 따른다. 정식 회귀 검사는 `modules/`, `src/`, `scripts/`에 유지한다.

## 종료한 실험

과거 후보 비교 실행기와 전용 테스트, 검사 앱, 모델 후보 설정, 평가 사진, 원시 JSON, 로그, 영상, 비교 페이지와 임시 빌드를 삭제했다. 과거 명령으로 후보 모델을 다시 내려받거나 실험을 자동 재개하지 않는다.

[사진 분석 검증 결과](SMOKE_RESULTS.md)와 [선화 검증 결과](LINE_ART_RESEARCH.md)의 측정 조건·수치·판정은 문서에 남겼다. 문서의 과거 실행 명령과 삭제된 로컬 경로는 당시 기록이며 현재 재실행 가능한 자료가 아니다. 앱의 최신 상태와 이번 정리 검증은 [프로젝트 현황](../../docs/03_PROJECT_STATUS.md)을 따른다.
