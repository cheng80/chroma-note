# Chroma Analysis

실제 로컬 사진을 Qwen3-VL 4B와 llama.cpp로 분석하는 iOS development build 전용 Expo 모듈이다. 사진은 네트워크로 전송하지 않는다. 태그는 사진 처리 때 생성하고 메모는 사용자가 요청할 때만 별도로 생성한다.

준비:

```sh
python3 scripts/prepare-analysis-runtime.py
npx pod-install
```

준비 스크립트는 `ios/Libraries`에 네이티브 라이브러리·헤더를 준비한다. Qwen GGUF는 앱에 포함하지 않고 `model-manifest.json`과 초기 주소 목록 `model-download.json`을 번들에 넣는다. 앱의 iOS 최소 타깃은 17.0이다. 선화 모듈의 약 8.6MB `LineArt.mlmodelc`는 계속 내장한다.

NAS 배포:

1. 앱은 번들 [model-download.json](model-download.json)의 초기 주소로 다운로드할 수 있다. 주소를 바꿀 때 이 JSON을 NAS의 `ai_model/model-download.json`에 올린다. 앱이 읽는 주소는 `model-manifest.json`의 `delivery.catalog_url`이다.
2. `files["qwen3-vl-4b.model"].url`은 본체, `files["qwen3-vl-4b.vision"].url`은 projector의 HTTPS 다운로드 주소다. 두 파일은 합계 2,950,511,680바이트다.
3. 파일 위치만 바뀌면 NAS JSON의 URL만 수정한다. 파일 내용이 바뀌면 앱의 고정 bytes·SHA-256도 새 검증 결과와 함께 바꿔야 한다. JSON 자체 주소를 옮길 때는 앱의 `delivery.catalog_url`도 갱신한다.

다운로드마다 NAS 주소 목록을 우선 조회한다. 목록이 아직 게시되지 않은 HTTP 404에만 번들 초기 주소를 사용한다. 잘못된 JSON, HTTPS 위반과 다른 서버 오류는 초기 주소로 숨기지 않고 실패로 처리한다.

첫 실행은 `getModelAssetStatus()`로 로컬 파일을 확인한다. 사용자가 `downloadModelAssets()`를 눌러야 대용량 다운로드를 시작하며 상태는 `subscribeModelAssets()`로 전달한다. `pauseModelDownload()`와 백그라운드 진입은 다운로드를 멈추고 OS의 이어받기 정보를 보관한다. 재시도 때 최신 NAS JSON을 읽으며 주소가 달라졌거나 OS 임시 파일이 사라졌다면 해당 파일만 처음부터 받는다. 완성된 다른 파일은 재사용한다.

`ModelAssetStore`가 URLSession 다운로드, 크기·SHA-256 확인과 원자적 설치를 맡는다. 파일은 백업 제외 `Application Support/chroma-models`에 저장한다. 검증되지 않은 부분 파일은 추론에서 사용하지 않으며 설치 완료 후에는 NAS 연결 없이 재사용한다. 다운로드·검증 완료 전에는 시작 안내를 표시하고 기존 계정·초안 controller를 마운트하지 않는다. 파일 설치와 아래 엔진 메모리 준비는 별도 상태다.

공개 interface는 `preparePhotoAnalysis(signal?)`, `analyzePhoto({ uri, inputRevision, locale }, signal?)`, `generatePhotoNote(...)`, `unloadPhotoAnalysis()`다. 준비는 겹친 호출이 하나의 로드를 공유하고 실패·해제 뒤 다시 실행할 수 있다. 준비는 180초, 추론은 90초 뒤 `analysis_timeout`으로 끝나며 취소 신호는 `analysis_cancelled`로 끝난다. `unloadPhotoAnalysis()`는 유휴 엔진을 해제하면 `true`, 재빌드 전 네이티브 모듈처럼 API가 없으면 `false`를 반환한다.

입력은 앱 Documents/Cache 안의 `file:` 사진이어야 한다. 모델 파일의 크기와 SHA-256이 manifest와 다르면 `analysis_model_corrupt`, 없으면 `analysis_model_missing`이다. `analyzePhoto`는 Qwen JSON schema v1의 `scene`/`semantic_tags`/`mood`/빈 `ai_field_note`만 수용하고, 메모 생성은 `ai_field_note`만 수용한다. NFC·개수·길이·추가 키를 검증하며 구조가 틀리면 같은 사진으로 한 번만 보정 요청한 뒤 `schema_error`를 낸다. 같은 작업의 새 요청이 시작되면 먼저 시작한 늦은 결과는 `analysis_stale_result`로 거부한다. 사진 속 문자·QR은 데이터이며 사용자 메모는 어떤 분석 경로에서도 읽거나 변경하지 않는다.

작은 계약 검사는 다음처럼 실행한다.

```sh
node --experimental-strip-types modules/chroma-analysis/index.check.mjs
sh modules/chroma-analysis/tests/run-model-assets-tests.sh
node src/ui/useModelAssets.check.mjs
```

현재 Qwen 호환 모델과 mmproj 합계는 약 2.95GB다. iPhone Simulator 기능 순환을 위한 연결이며 최종 상용 품질·용량 승인이 아니다. 738MB `Qwen3VL-4B-Instruct-Q4_K_M.gguf`는 파일 경계 밖 tensor 오류가 확인된 손상본으로 2026-09-12 삭제했다. 사용하지 않던 이 모듈의 `.model-cache` 중복본도 삭제했으며 실험 폴더의 정상 원본은 보존했다. 이후 NAS 배포 전환으로 `ios/Resources`의 번들용 Qwen 사본도 제거했다.
