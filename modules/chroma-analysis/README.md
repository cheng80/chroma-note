# Chroma Analysis

실제 로컬 사진을 Qwen3-VL 4B와 llama.cpp로 분석하는 iOS development build 전용 Expo 모듈이다. 사진은 네트워크로 전송하지 않는다. 태그는 사진 처리 때 생성하고 메모는 사용자가 요청할 때만 별도로 생성한다.

준비:

```sh
python3 scripts/prepare-analysis-runtime.py
npx pod-install
```

모델은 `ios/Resources`, 네이티브 라이브러리·헤더는 `ios/Libraries`에 준비한다. Pod spec 안쪽 경로여야 실제 앱에 포함되며 모두 Git 제외다. 앱의 iOS 최소 타깃은 17.0이다.

공개 interface는 `analyzePhoto({ uri, inputRevision, locale }, signal?)`와 `generatePhotoNote(...)` 두 개다. 입력은 앱 Documents/Cache 안의 `file:` 사진이어야 한다. `analyzePhoto`는 Qwen JSON schema v1의 `scene`/`semantic_tags`/`mood`/빈 `ai_field_note`만 수용하고, 메모 생성은 `ai_field_note`만 수용한다. NFC·개수·길이·추가 키를 검증하며 구조가 틀리면 같은 사진으로 한 번만 보정 요청한 뒤 `schema_error`를 낸다. 같은 작업의 새 요청이 시작되면 먼저 시작한 늦은 결과는 `analysis_stale_result`로 거부한다. 사진 속 문자·QR은 데이터이며 사용자 메모는 어떤 분석 경로에서도 읽거나 변경하지 않는다.

작은 계약 검사는 다음처럼 실행한다.

```sh
node --experimental-strip-types modules/chroma-analysis/index.check.mjs
```

현재 Qwen 호환 모델과 mmproj 합계는 약 2.95GB다. iPhone Simulator 기능 순환을 위한 연결이며 최종 상용 품질·용량 승인이 아니다. 저장소의 738MB `Qwen3VL-4B-Instruct-Q4_K_M.gguf`는 파일 경계 밖 tensor 오류가 확인된 손상본이므로 준비 스크립트가 사용하지 않는다.
