# 컬러 선화 모듈

2026-09-11 확정된 `style1` 선 마스크 + 원본 RGB/흰 배경 변환이다. 입력·옵션을 바꿀 수 있으며 VLM, 대표색, Supabase, UI에 의존하지 않는다. iOS 17 이상은 Core ML, Android 네이티브 빌드는 ONNX Runtime으로 구현한다. Android의 현재 검증 범위는 아래에 구분한다. Expo Go·Web은 지원하지 않으며 다른 이미지로 대체하지 않는다.

```ts
import { convertLineArt } from './modules/chroma-lineart';

const controller = new AbortController();
const result = await convertLineArt(
  {
    uri: workingPhotoUri,
    outputDirectory: draftDirectoryUri, // 앱 Documents 안의 기존 초안 폴더
    inputRevision: revision,
  },
  { maxEdge: 1024, lineGain: 1.8 },
  controller.signal,
);
// result: uri, width, height, bytes, durationMs, inputRevision, options
// 취소: controller.abort()
```

옵션은 생략할 수 있다. `maxEdge`는 16~1536 정수, `lineGain`은 0.1~4 유한수다. 이 범위는 호출 안전 상한이며 모든 해상도의 성능·품질 합격을 뜻하지 않는다. 기본 1024·1.8은 기존 결과를 유지한다. crop·upscale 없이 축소하므로 극단적인 종횡비로 축이 16px보다 작아지면 실패한다. 흰 배경, 원본색, 단일 스타일은 변경 옵션이 아니다.

## 입력·결과 수명

- URI는 로컬 파일만 허용한다. 원본은 수정하지 않는다. 결과는 초안 폴더의 새 `lineart-UUID.png`이며 이전 PNG를 덮어쓰지 않는다.
- JPEG/PNG/HEIC 정지 이미지, 30MiB·50MP 상한을 검사한다. EXIF 방향과 sRGB 변환 뒤 4배수 reflection padding을 적용하고 출력에서 제거한다. 출력 PNG는 5MiB 이하다.
- 모델은 직렬 백그라운드 큐에서 재사용한다. 동시 호출은 `lineart_busy`로 거부한다. 취소는 연산 단계 사이에서 처리되며 진행 중 Core ML 호출을 즉시 끊는다는 뜻은 아니다.
- Core ML은 `.cpuAndGPU`로 실행한다. iPhone 14 Pro Max의 iOS 26.6.2에서 같은 1024×768 입력이 `.all` 설정의 BNNS reshape 오류로 실패하고 `.cpuAndGPU`에서 1.787초에 성공한 결과를 반영했다. 가중치·종횡비·기본 출력 크기는 유지한다.
- 호출자가 계정·초안 소유권과 `inputRevision`을 관리한다. 사진/옵션 변경 시 revision을 올리고 기존 결과 확인을 해제한다. 늦은 결과는 현재 revision과 대조한 후 수용해야 한다.
- 결과 폴더는 OS 백업에서 제외한다. 성공 PNG는 서버 저장 확인 또는 초안 명시 폐기까지 호출자가 보존한다. 네이티브 빌드/모델 부재, 입력 오류, 취소는 성공으로 처리하지 않는다.

## 모델·빌드 준비

사진 가져오기에서는 별도 `PhotoImporter`를 사용한다. JPEG/PNG/HEIC를 최대 150MiB·250MP까지 확인하고 방향·sRGB를 적용해 긴 변 2048px 이하의 작업본으로 만든다. 실제 투명 픽셀이 있으면 PNG, 없으면 품질 0.95 JPEG로 저장한다. 갤러리 원본은 건드리지 않으며 기존 선화 엔진에는 축소된 작업본을 전달한다. `normalizePhotoAsync`는 앱 내부 파일과 백업 제외 출력 폴더만 사용한다.

```sh
xcrun --sdk macosx swiftc -O -parse-as-library \
  modules/chroma-lineart/ios/PhotoImporter.swift \
  modules/chroma-lineart/tests/PhotoImporterTests.swift -o /tmp/chroma-photo-import-tests
/tmp/chroma-photo-import-tests
```

macOS/Xcode와 Python 3.11 이상이 필요하다. 변환 도구의 검증 버전은 [manifest](model-manifest.json)의 `prepared_with.dependencies`를 따른다. 기존 격리 환경이 없으면 별도 가상환경을 만든다. 모델은 고정된 저자 공개 URL에서 SHA-256 검증 후 가져오며 사진은 업로드하지 않는다.

```sh
experiments/model-selection/.venv/bin/pip install -r modules/chroma-lineart/requirements-prepare.txt
experiments/model-selection/.venv/bin/python scripts/prepare-lineart-model.py
npx expo prebuild --platform ios --no-install
cd ios && pod install
```

결과는 `modules/chroma-lineart/ios/Resources/LineArt.mlmodelc`다. 원본 가중치·변환 캐시·컴파일 결과는 Git 제외이며 `expo-module.config.json`과 Pod 리소스 번들로 연결한다. 네이티브 빌드는 기존 iPhone의 ID를 명시해 실행한다. iPad를 자동 실행하지 않는다. 배포 시 [저자 사용조건](THIRD_PARTY_NOTICES.md)을 확인한다.

빌드·설치 후 실제 설치된 `.app/ChromaLineArt.bundle/LineArt.mlmodelc` 포함 여부를 확인하고, 앱을 새로 시작한 상태에서 아래 `tests/native-bridge.ts`의 `checkNativeLineArt()`로 모델 로딩부터 PNG 생성까지 검증한다.

## 검증과 연결 범위

```sh
node modules/chroma-lineart/options.check.ts
node modules/chroma-lineart/index.check.mjs
sh modules/chroma-lineart/tests/run-native-tests.sh \
  modules/chroma-lineart/ios/Resources/LineArt.mlmodelc /tmp
npx tsc --noEmit
```

모델 준비 스크립트는 실제 Core ML/PyTorch 수치·반복 일치를 검사한다. Swift 엔진 검사는 `tests/`에 있다. 네이티브 빌드 안에서 `tests/native-bridge.ts`의 `checkNativeLineArt()`를 호출하면 실제 JS→Core ML→PNG 경로를 확인한다. 테스트 파일만 만들고 끝에 정리하며 계정·사용자 사진은 사용하지 않는다. 임시 테스트 라우트는 검증 후 제거한다.

실행 결과는 [프로젝트 현황](../../docs/03_PROJECT_STATUS.md)에 기록한다. 이 모듈은 변환 자체를 제공하며 앱의 대표색/VLM/저장 흐름 통합 완료나 설정 편집 화면 제공을 의미하지 않는다.

## Android 준비와 통합

Android는 동일 저자 코드·style1 가중치를 ONNX opset 17로 변환한다. 가중치만 FP16으로 저장하고 `Cast` 뒤 FP32 CPU 연산을 수행한다. crop·upscale 없이 우측/아래쪽 reflection pad4, 원본 RGB/흰색 합성, `lineGain`의 ties-to-even 반올림을 유지한다. `onnxruntime-android:1.24.3`, 기존 Expo 사진 모듈과 같은 `exifinterface:1.4.1`만 Gradle에 추가한다. 모델 실행에는 네트워크가 필요 없다.

```sh
experiments/model-selection/.venv/bin/pip install 'onnx==1.20.1' 'onnxruntime==1.24.3'
experiments/model-selection/.venv/bin/python scripts/prepare-lineart-android.py
experiments/model-selection/.venv/bin/python modules/chroma-lineart/tests/android/run-checks.py
```

기존 격리 환경의 Torch 2.14.0과 원본 `.model-cache/vendor`를 재사용한다. 변환은 Android 자산과 [Android manifest](android/model-manifest.json)만 갱신하고 iOS 자산·manifest는 변경하지 않는다. 모델 부재 또는 SHA-256 불일치는 Android `preBuild`에서 실패한다.

- 생성 자산: `android/src/main/assets/chroma-lineart/LineArt.onnx`, **8,638,398바이트**, FP16 가중치 저장량은 manifest 참조. SHA-256: `c9b90a93097a811c537380fc98ab1376d2b8769de9cdcda46cdd8632df5bebd9`.
- Git 제외: `modules/chroma-lineart/android/src/main/assets/chroma-lineart/LineArt.onnx`, `modules/chroma-lineart/android/build/`, 기존 `modules/chroma-lineart/.model-cache/`·`experiments/model-selection/.venv/`. 모델이 포함된 AAR·독립 컴파일 결과·추가 다운로드 캐시는 `android/build/`에만 생성한다.
- 네이티브 공개 함수: `begin`, `cancel`, `convertAsync`, `discardResult`, `extractPaletteAsync`, `preparePrivateDirectoryAsync`, `normalizePhotoAsync`. `inputRevision`·`options`·`algorithmVersion`은 기존 JS 래퍼가 붙인다. 네이티브 반환값을 바꾸지 않는다.
- 파일은 canonical path 기준 앱 files/cache/noBackupFilesDir의 하위 경로만 허용한다. 외부 URI·형제 prefix·탈출 symlink·원본 덮어쓰기를 거부한다. 출력은 기존 디렉터리에 새 UUID 파일로 원자적으로 생성한다. 일반 files 출력은 `allowBackup=false`가 필요하며, 백업이 허용된 앱에서는 noBackup/cache 출력만 허용한다. 앱의 OS 백업·기기 이전 제외 규칙은 부모 앱에서 적용한다.
- Android 28 이상은 `ImageDecoder`가 방향과 sRGB 변환, 디코드 단계 축소를 처리한다. 그 이전은 sampled `BitmapFactory`와 EXIF 방향 보정을 사용한다. HEIC는 플랫폼 디코더와 메타데이터 지원이 필요하며 Android 28 이상에서 정지 이미지 1장인지 검사한다. 투명도는 사진 정규화·대표색에서 보존하고 선화 입력만 흰색 위에 합성한다.
- 대표색은 기존 `rgb-bin-v1`: 256px 분석, 투명 픽셀 제외, alpha 가중치, 4bit RGB bucket, 상위 5개 seed와 거리 병합, weight/hex 정렬이다. 플랫폼의 색 프로필·축소 디코더가 다른 만큼 iOS와 임의 사진의 픽셀 단위 일치까지 주장하지 않는다.
- 단일 직렬 작업 큐에서 모델을 재사용하며 동시 `begin`은 busy를 반환한다. 취소는 단계 사이와 파일 게시 직후 확인하고 결과·임시 파일을 정리한다. 실행 중 ORT 호출의 즉시 중단은 보장하지 않는다. CPU arena와 memory pattern을 꺼서 큰 사진의 activation 메모리를 다음 작업까지 보유하지 않는다.

2026-09-13 독립 검증: Torch와 ONNX CPU의 최소/최대 축·홀수 종횡비·사진 입력 총 9개에서 기존 iOS 수치 오차 기준 통과, 반복 결과 바이트 일치, 4개 gain의 RGB 오차 검사 통과. 실제 Expo 57·Android 36·ORT 클래스에 대한 전체 Kotlin 컴파일, host의 옵션·NCHW/reflection·반올림·대표색·경로/백업/심볼릭 링크·원본 보존·취소 lifecycle 검사를 통과했다. 상세 수치는 Android manifest에 기록한다.

2026-09-13 Android 16 ARM64 에뮬레이터에서 `LineArtInstrumentation`의 정규화·EXIF·투명도·4096px 축소·ONNX 추론·PNG·취소·원본 보존을 실제 실행해 통과했다. Android의 SELinux가 거부하는 hard link를 같은 폴더의 atomic rename으로 바꾸고, canonical 경로로 소유권을 검증한 후 반환 URI에는 호출자의 경로 별칭을 유지한다. 사진 가져오기 실패를 재현한 경로 검사는 수정 전 실패·수정 후 통과했다. 릴리즈 앱에서도 실제 갤러리 사진 선택·Qwen 태그 분석·컬러 스케치·기록 저장·이미지 다시 조회·갤러리 내보내기를 확인했다. Android 사진 입력 분기, OS 백업 제외, 처리 metadata 연결도 반영했다. Android 실기기·5장 품질 검증으로 확대하지 않는다.

참고: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Modules API](https://docs.expo.dev/modules/module-api/), [ONNX Runtime Java](https://onnxruntime.ai/docs/get-started/with-java.html), [Android ImageDecoder](https://developer.android.com/reference/android/graphics/ImageDecoder).
