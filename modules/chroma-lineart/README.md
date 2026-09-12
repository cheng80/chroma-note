# 컬러 선화 모듈

2026-09-11 확정된 `style1` 선 마스크 + 원본 RGB/흰 배경 변환이다. 입력·옵션을 바꿀 수 있으며 VLM, 대표색, Supabase, UI에 의존하지 않는다. iOS 17 이상 네이티브 빌드에서 동작한다. Expo Go·Android·Web은 지원하지 않으며 다른 이미지로 대체하지 않는다.

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
- 호출자가 계정·초안 소유권과 `inputRevision`을 관리한다. 사진/옵션 변경 시 revision을 올리고 기존 결과 확인을 해제한다. 늦은 결과는 현재 revision과 대조한 후 수용해야 한다.
- 결과 폴더는 OS 백업에서 제외한다. 성공 PNG는 서버 저장 확인 또는 초안 명시 폐기까지 호출자가 보존한다. 네이티브 빌드/모델 부재, 입력 오류, 취소는 성공으로 처리하지 않는다.

## 모델·빌드 준비

사진 가져오기에서는 별도 `PhotoImporter`를 사용한다. iOS의 JPEG/PNG/HEIC를 최대 150MiB·250MP까지 확인하고 방향·sRGB·흰 배경을 적용해 긴 변 2048px 이하의 JPEG 작업본으로 만든다. 갤러리 원본은 건드리지 않으며 기존 선화 엔진에는 축소된 작업본을 전달한다. `normalizePhotoAsync`는 앱 내부 파일과 백업 제외 출력 폴더만 사용한다.

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
