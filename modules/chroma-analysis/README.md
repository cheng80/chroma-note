# Chroma Analysis

실제 로컬 사진을 Qwen3-VL 4B와 llama.cpp로 분석하는 iOS·Android 네이티브 빌드용 Expo 모듈이다. Android 실행 검증 범위는 아래에 별도로 구분한다. 사진은 네트워크로 전송하지 않는다. 태그는 사진 처리 때 생성하고 메모는 사용자가 요청할 때만 별도로 생성한다.

iOS 준비:

```sh
python3 scripts/prepare-analysis-runtime.py --build
npx pod-install
```

실기기 라이브러리를 처음 만들거나 갱신할 때는 `python3 scripts/prepare-analysis-runtime.py --platform iphoneos --build`를 사용한다. 실기기는 Metal, 시뮬레이터는 CPU를 사용한다. 이미지 분석은 256 이미지 토큰·2048 문맥 토큰으로 제한하며 선화 입력 해상도는 유지한다. 스케치 실행 전에는 기존 `unloadPhotoAnalysis()`로 VLM 메모리를 해제한다.

2026-09-14에 재생성 가능한 llama.cpp·Vulkan 소스 캐시, iOS 라이브러리, Android 중간 파일과 Pods를 정리했다. `--build`는 소스가 없으면 공식 저장소에서 manifest의 고정 리비전을 임시 폴더에 받은 뒤 검증·게시하고 라이브러리를 빌드한다. 기존 소스의 리비전 불일치나 로컬 변경은 덮어쓰지 않고 거부한다. 소스와 라이브러리가 준비된 이후에만 `--build`를 생략할 수 있다. 모델 GGUF 원본은 유지하며 재다운로드하지 않는다.

준비 스크립트는 `ios/Libraries`에 네이티브 라이브러리·헤더를 준비한다. Qwen GGUF는 앱에 포함하지 않고 `model-manifest.json`과 초기 주소 목록 `model-download.json`을 번들에 넣는다. 앱의 iOS 최소 타깃은 17.0이다. 선화 모듈의 약 8.6MB `LineArt.mlmodelc`는 계속 내장한다.

NAS 배포:

1. 앱은 번들 [model-download.json](model-download.json)의 초기 주소로 다운로드할 수 있다. 주소를 바꿀 때 이 JSON을 NAS의 `ai_model/model-download.json`에 올린다. 앱이 읽는 주소는 `model-manifest.json`의 `delivery.catalog_url`이다.
2. `files["qwen3-vl-4b.model"].url`은 본체, `files["qwen3-vl-4b.vision"].url`은 projector의 HTTPS 다운로드 주소다. 두 파일은 합계 2,950,511,680바이트다.
3. 파일 위치만 바뀌면 NAS JSON의 URL만 수정한다. 파일 내용이 바뀌면 앱의 고정 bytes·SHA-256도 새 검증 결과와 함께 바꿔야 한다. JSON 자체 주소를 옮길 때는 앱의 `delivery.catalog_url`도 갱신한다.

다운로드마다 NAS 주소 목록을 우선 조회한다. 목록이 아직 게시되지 않은 HTTP 404에만 번들 초기 주소를 사용한다. 잘못된 JSON, HTTPS 위반과 다른 서버 오류는 초기 주소로 숨기지 않고 실패로 처리한다.

앱 시작 시 `getModelAssetStatus()`로 로컬 파일의 크기·SHA-256을 먼저 확인한다. 확인 중에는 기본 스플래시를 유지하고, 정상 파일이면 앱으로 바로 진입하며 누락·손상이면 다운로드 화면을 표시한다. 사용자가 `downloadModelAssets()`를 눌러야 대용량 다운로드를 시작하며 상태는 `subscribeModelAssets()`로 전달한다. iOS에서 `pauseModelDownload()`와 백그라운드 진입은 다운로드를 멈추고 OS의 이어받기 정보를 보관한다. 재시도 때 최신 NAS JSON을 읽으며 주소가 달라졌거나 OS 임시 파일이 사라졌다면 해당 파일만 처음부터 받는다. 완성된 다른 파일은 재사용한다.

iOS의 `ModelAssetStore`가 URLSession 다운로드, 크기·SHA-256 확인과 원자적 설치를 맡는다. 파일은 백업 제외 `Application Support/chroma-models`에 저장한다. 검증되지 않은 부분 파일은 추론에서 사용하지 않으며 설치 완료 후에는 NAS 연결 없이 재사용한다. 다운로드·검증 완료 전에는 시작 안내를 표시하고 기존 계정·초안 controller를 마운트하지 않는다. 파일 설치와 아래 엔진 메모리 준비는 별도 상태다.

공개 interface는 `preparePhotoAnalysis(signal?)`, `analyzePhoto({ uri, inputRevision, locale }, signal?)`, `generatePhotoNote(...)`, `unloadPhotoAnalysis()`다. 준비는 겹친 호출이 하나의 로드를 공유하고 실패·해제 뒤 다시 실행할 수 있다. 준비는 180초, 추론은 90초 뒤 `analysis_timeout`으로 끝나며 취소 신호는 `analysis_cancelled`로 끝난다. `unloadPhotoAnalysis()`는 유휴 엔진을 해제하면 `true`, 재빌드 전 네이티브 모듈처럼 API가 없으면 `false`를 반환한다.

iOS 입력은 앱 Documents/Cache 안의 `file:` 사진이어야 한다. Android 입력 경로는 아래를 따른다. 모델 파일의 크기와 SHA-256이 manifest와 다르면 `analysis_model_corrupt`, 없으면 `analysis_model_missing`이다. `analyzePhoto`는 Qwen JSON schema v1의 `scene`/`semantic_tags`/`mood`/빈 `ai_field_note`만 수용하고, 메모 생성은 `ai_field_note`만 수용한다. NFC·개수·길이·추가 키를 검증하며 구조가 틀리면 같은 사진으로 한 번만 보정 요청한 뒤 `schema_error`를 낸다. 같은 작업의 새 요청이 시작되면 먼저 시작한 늦은 결과는 `analysis_stale_result`로 거부한다. 사진 속 문자·QR은 데이터이며 사용자 메모는 어떤 분석 경로에서도 읽거나 변경하지 않는다.

작은 계약 검사는 다음처럼 실행한다.

```sh
node --experimental-strip-types modules/chroma-analysis/index.check.mjs
sh modules/chroma-analysis/tests/run-model-assets-tests.sh
node src/ui/useModelAssets.check.mjs
```

현재 Qwen 호환 모델과 mmproj 합계는 약 2.95GB다. iPhone Simulator 기능 순환을 위한 연결이며 최종 상용 품질·용량 승인이 아니다. 738MB `Qwen3VL-4B-Instruct-Q4_K_M.gguf`는 파일 경계 밖 tensor 오류가 확인된 손상본으로 2026-09-12 삭제했다. 사용하지 않던 이 모듈의 `.model-cache` 중복본도 삭제했으며 실험 폴더의 정상 원본은 보존했다. 이후 NAS 배포 전환으로 `ios/Resources`의 번들용 Qwen 사본도 제거했다.

## Android 준비와 동작

2.5GB mmap 모델을 위해 Android 앱은 64비트(`arm64-v8a`, `x86_64`)로 빌드한다. 앱 설정 플러그인이 네이티브 재생성 때 기본 아키텍처를 유지한다. ARM64 기기용 APK는 `./android/gradlew -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`로 만든다.

작업 루트에서 Python 3·Git으로 고정 llama.cpp 소스를 준비한다.

```sh
python3 scripts/prepare-analysis-android.py
npx expo prebuild --platform android --no-install --no-clean
```

스크립트는 `model-manifest.json`의 `runtime_revision`에 고정된 소스를 `modules/chroma-analysis/.model-cache/llama.cpp`에 준비한다. 최초에는 기존 `experiments/model-selection/data/ios-smoke/vendor/llama.cpp` Git 저장소를 우선 복제하고, 없으면 공식 GitHub 저장소를 복제한다. 기존 대상의 HEAD가 pin과 다르거나 추적 파일에 수정이 있으면 덮어쓰지 않고 실패한다. GGUF 다운로드·내장은 수행하지 않는다.

Android SDK·NDK·CMake 3.22.1 환경에서 앱 Gradle 빌드가 JNI 라이브러리 `chroma-analysis`와 llama.cpp/mtmd를 컴파일한다. `preBuild`는 기존 `model-manifest.json`·`model-download.json`만 Android assets의 `chroma-analysis/`로 복사한다. NAS의 GGUF 두 파일과 주소 JSON을 iOS와 그대로 공유하며 Android 전용 모델이나 URL 목록을 만들지 않는다. 앱 전체 빌드 전에는 [ChromaLineArt의 Android 준비](../chroma-lineart/README.md#android-준비와-통합)도 필요하다. 선화는 `scripts/prepare-lineart-android.py`로 준비한 `LineArt.onnx`를 내장하고 ONNX Runtime CPU로 실행한다.

Android `ModelAssetStore`는 `noBackupFilesDir/chroma-models/<sha256>/`에 모델을 저장한다. 상태 조회와 다운로드 시작은 원격 조회보다 로컬 크기·SHA-256 검사를 먼저 수행한다(hash-first). 두 파일이 정상이면 NAS 없이 재사용하며, 추론 경로를 반환하기 전에도 검증한다. 필요한 파일만 받을 때 최신 NAS JSON을 조회하고 HTTP 404에만 번들 주소를 사용한다. HTTPS 위반·잘못된 JSON·다른 서버 오류는 실패로 처리한다.

Android의 추론용 내부 검사는 다운로드 상태와 이벤트를 변경하지 않는다. 사진 선택기가 Activity를 백그라운드로 보내도 실제 설치·다운로드 작업이 없으면 `pause()`는 완료 상태와 진행 중인 내부 검사를 유지한다. 같은 store에서 SHA-256을 통과한 파일은 장치·inode·크기·수정/변경 시각이 같으면 전체 해시를 반복하지 않는다. [Android `StructStat`](https://developer.android.com/reference/android/system/StructStat)의 나노초 필드는 API 27 이상에서 사용하며, 정확한 메타데이터가 없으면 전체 해시를 수행한다. 같은 파일시스템 시계 틱의 변경을 놓치지 않도록 최근 1~2초 내 수정·설치 파일과 미래 시각은 재사용 확인 대상으로 보관하지 않는다. 새 설치 파일은 안정된 시점의 검사가 한 번 더 필요할 수 있고, 앱 프로세스 재시작·파일 변경 시에는 다시 해시한다.

`python3 modules/chroma-analysis/tests/android/run-model-assets-tests.py`는 실제 Kotlin store를 호스트에서 검사한다. `--device <adb serial>`은 API 27 이상 Android의 ART와 실제 `Os.lstat`으로 같은 검사를 실행한다. 23개 시나리오에는 사진 선택기와 같은 백그라운드 중단, 검증 재사용, 크기·mtime을 유지한 손상, 동일한 시각의 연속 변경, 이어받기와 종료 경합을 포함한다. Android 검사는 자체 임시 폴더만 쓰고 삭제하며 설치된 앱·모델·계정 자료나 NAS 전송을 사용하지 않는다.

다운로드는 `HttpsURLConnection`을 사용한다. 일시 정지·백그라운드 진입 시 전송을 멈추고 같은 저장 폴더의 `incoming.part`와 `resume.json`에 부분 파일·URL·ETag·고정 크기/해시를 보존한다. 재시도는 Range와 가능한 경우 If-Range로 이어받으며, URL 변경·유효하지 않은 이어받기 정보·ETag 불일치·서버의 전체 응답에는 해당 파일을 처음부터 받는다. 완성된 다른 파일은 재사용한다. 크기·SHA-256 검증 후 같은 폴더에서 rename으로 설치하고, 미검증 부분 파일은 추론에 전달하지 않는다. 남은 다운로드 크기 외에 64MiB 여유 공간을 요구한다.

JNI는 Vulkan을 포함해 빌드한다. Vulkan 1.2 이상에서 고정 llama.cpp가 지원하는 GPU를 찾고, CPU 장치와 `llvmpipe`·`lavapipe`·`SwiftShader` 등 소프트웨어 GPU를 제외한다. RAM 6GiB 미만이거나 두 모델의 가중치가 메모리 예산을 넘으면 비전 임베딩을 보존한 뒤 비전 모델을 해제하고 언어 모델을 로드한다. 언어 가중치가 예산 안이면 출력층까지 Vulkan에 올리고, 넘으면 CPU 작업 공간을 남기는 부분 GPU 배치를 사용한다. 그 외에는 기존 전체 GPU 경로를 유지한다. Mali-G57은 실측에서 비전과 2B 언어 Vulkan이 모두 제한 시간을 넘어 CPU를 기본 선택한다. 다른 지원 GPU는 메모리 예산에 따라 선택한다. 이 메모리 예산은 경험적 정책이며 모든 기기의 종료 방지를 보장하지 않는다. 지원 GPU가 없으면 CPU를 사용하며 GPU 준비 또는 추론의 복구 가능한 실패에는 메모리를 해제하고 CPU로 한 번 재시도한다. 취소·입력 오류는 GPU 재시도 대상이 아니다. 드라이버의 프로세스 종료·OS 메모리 강제 종료까지 복구한다고 보장하지 않는다. 이미지 최대 256토큰·문맥 2048토큰을 사용하며, 직렬 작업 큐에서 엔진을 재사용하고 취소·유휴 해제를 제공한다. 단계 분리 경로는 요청 완료 후 언어 모델도 해제한다. 비전·언어 그래프의 주기적 취소 확인을 추가하고, 취소된 작업 뒤의 해제 요청은 같은 큐에서 정리를 기다린다. Android 입력은 앱 `filesDir`·`cacheDir`·`noBackupFilesDir` 하위의 로컬 `file:` JPEG/PNG이며 30MiB 이하로 제한한다. 앱은 선화 실행 전에 기존 `unloadPhotoAnalysis()`로 VLM 메모리를 해제한다.

Vulkan 준비 스크립트는 기존 호스트 `glslc`(PATH, 없으면 설치된 NDK)를 재사용하고 Q4_K 셰이더 컴파일을 검사한다. `--glslc /path/to/glslc`, `--cmake /path/to/cmake`로 지정할 수도 있다. Khronos `Vulkan-Headers`·`SPIRV-Headers`의 `vulkan-sdk-1.4.328.1` 리비전만 `.model-cache/android-vulkan`에 준비하고 헤더를 설치한다. 전체 Vulkan SDK·호스트 드라이버는 설치하지 않으며 llama.cpp 소스는 수정하지 않는다. 현재 NDK shaderc 2022.3은 기본 Vulkan 셰이더를 컴파일하지만 cooperative matrix·integer dot 등 새 컴파일러 확장은 비활성화된다. 최신 호스트 `glslc`를 지정하면 고정 llama.cpp의 확장 검사 결과에 따라 활성화된다. [llama.cpp 빌드 문서](https://github.com/ggml-org/llama.cpp/blob/1945e092030f8668ff93382799502d01490e564d/docs/build.md#vulkan), [Android Vulkan 문서](https://developer.android.com/ndk/guides/graphics/getting-started)를 기준으로 한다.

`ChromaAnalysis` 로그는 `backend=cpu|vulkan|cpu+vulkan_vision`, 메모리 정책·가중치 크기·GPU 층 수, 준비·비전·언어 로드·prefill·decode·합계 시간과 토큰 수를 기록한다. 모델 경로·사진·문구·프롬프트는 기록하지 않는다. prefill에는 문맥 준비·이미지 인코딩·프롬프트 평가가 포함되며, 합계에는 모델 해시 검사와 모델 준비 시간이 포함되지 않는다. `gpu-policy-test.cpp`는 소프트웨어 장치 배제와 재시도 오류 분류를 검사한다. 2026-09-13 GPU 변경은 정책 검사·ARM64 JNI 구문 검사·Android/호스트 CMake 설정·Q4_K 셰이더 컴파일까지 확인했다. ARM64 릴리즈 APK 빌드와 서명·16KiB 정렬 검사를 통과했고, llvmpipe 에뮬레이터에서 CPU 모델 준비·실제 사진 분석 50.009초·문구 추론 32.705초(버튼부터 네이티브 완료까지 35.694초)를 확인했다. Android 24에 없는 `vkGetPhysicalDeviceFeatures2`의 직접 링크는 `--wrap`과 런타임 조회로 연결하며, API 1.2 gate 전에 Vulkan backend를 등록하지 않는다. 후속 Galaxy A24 실폰에서 Vulkan 가중치 배치는 확인했으나, 4B 전체 AI 순환은 시간 초과·메모리 종료로 미통과했다. 정책별 결과와 2B 비교는 [프로젝트 현황](../../docs/03_PROJECT_STATUS.md)을 따른다.

2026-09-13 Android 16 ARM64 에뮬레이터에서 NAS 2,950,511,680바이트 다운로드와 SHA-256 검증, 약 0.47GB 일시 정지·강제 종료·이어받기, 오프라인 정상 모델 재사용, 이메일 인증, 실제 사진 분석·선화·기록 저장·상세 조회·갤러리 내보내기를 확인했다. Vulkan 변경 이후의 최종 APK와 추론 측정 결과는 [프로젝트 현황](../../docs/03_PROJECT_STATUS.md)을 따른다. Android 실기기의 GPU 성능과 전체 사진 품질 검증은 별도다.
