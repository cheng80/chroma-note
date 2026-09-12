# 세로 전용 Chroma Note의 폴더블 가용 영역 대응

조사 기준: **2026-09-12, Asia/Seoul**. 공식 문서, 제품 발표, 앱 제작사 공개 설명을 대조한 적용 제안이다. 조사 단계의 결과이며, 후속 구현·검증 상태는 [프로젝트 현황](../03_PROJECT_STATUS.md)의 2026-09-12 기록을 따른다.

## 1. 결론과 현재 경계

**`app.json`의 `orientation: portrait`를 유지하고, 현재 창과 콘텐츠의 실제 너비·높이에 적응한다.** 우선순위는 Book 열 수, 본문·입력·시트 최대 폭, 낮은 화면의 이미지·스크롤·키보드·하단 버튼이다. 모든 화면을 두 영역으로 바꾸거나 기기명 분기를 추가할 필요는 없다. 이 방향은 [현재 기술 명세](../02_TECH_SPEC.md#세로-전용-앱과-펼친-화면)와 일치한다.

- Apple은 Duo 내부 화면이 앱의 지원 방향 설정을 따르지 않는다고 설명한다. 세로 설정은 좁고 긴 앱 영역을 보장하지 않는다. 내부 화면의 기본 size class는 가로·세로 모두 regular지만, 분할 창까지 항상 같은 크기라는 뜻은 아니다. [Apple, Prepare your app, 2:46](https://developer.apple.com/videos/play/tech-talks/111461/)
- Samsung은 Galaxy Z Fold8의 펼친 주 화면을 약 4:3, 접힌 커버를 약 10:16으로 소개한다. 이 물리 비율을 앱의 논리적 크기나 breakpoint로 사용하지 않는다. 시스템 UI와 분할 창 때문에 실제 가용 영역은 달라진다. [Samsung 제품 설명, Display](https://www.samsung.com/us/smartphones/galaxy-z-fold8/)
- **지금 구현 가능한 일반 RN 적응**과 **SDK 갱신 후 검증할 Duo 전용 플랫폼 대응**을 구분한다. 문서 확인만으로 전체 화면 지원·힌지 회피·실기기 통과를 선언하지 않는다.

## 2. 발표, 출시, 개발 도구의 시간 구분

| 항목 | 9월 12일 기준 확인 사실 | 해석 |
|---|---|---|
| iPhone Duo | 9월 9일 발표, 10월 16일 예약, 한국 포함 최초 판매 지역은 10월 23일 availability 예정 | 발표·시연은 출시 후 보급이나 앱 배포 검증이 아니다. [Apple Newsroom](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/) |
| Xcode 27.1 beta | 개발자 준비 페이지는 `Coming later this month`로 표기 | 영상의 SDK 사용 안내와 실제 다운로드·설치 가능 상태를 구별한다. [Apple 개발자 진입점](https://developer.apple.com/iphone-duo/) |
| 현재 로컬 도구 | `xcodebuild -version`: Xcode 26.6, Build 17F113. `xcodebuild -showsdks`: iphoneos26.5, iphonesimulator26.5 | 이번 조사에서 직접 확인. SDK 27.1 환경이 아니며 도구 변경은 하지 않았다. |
| 저장소 패키지 | `expo: ~57.0.21`, `react-native: 0.86.3`, `react-native-safe-area-context: ~5.7.0` | [package.json](../../package.json)의 선언값. Expo SDK 번호와 Apple iOS SDK 번호는 별개다. [Expo SDK 57 문서](https://docs.expo.dev/versions/v57.0.0/) |

현재 [app.json](../../app.json)의 iOS `deploymentTarget: 17.0`은 최소 실행 OS 설정이다. 이를 컴파일 SDK 27.1 사용 증거로 해석하지 않는다. 실제 새 빌드에서는 선택된 Xcode, 빌드 로그의 SDK, 설치된 Simulator runtime, 제품 바이너리를 함께 확인해야 한다.

## 3. Apple 공식 원칙과 적용 해석

### 화면 크기와 상태

Apple HIG는 포즈마다 별도 화면을 설계하기보다 기존 레이아웃을 가용 공간에 맞춰 확장하고, 디스플레이 전환에서도 기능·상태·정보 위계를 유지하도록 권장한다. Mail처럼 목록과 상세를 함께 보여주는 것은 콘텐츠에 적합할 때의 선택이다. [HIG, Device poses / Best practices](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)

Chroma Note 적용: 접기·펼치기 때문에 초안, 입력값, 선택 기록, 필터, 처리 단계를 초기화하지 않는다. 폭에 따른 스타일·열 수 변경은 기존 화면 안에서 처리하고, 폭을 화면의 `key`로 삼아 전체 화면이나 controller를 재생성하지 않는다. 이는 [기술 명세의 상태 보존 계약](../02_TECH_SPEC.md#세로-전용-앱과-펼친-화면)에 따른 구현 제안이다.

### 전체 화면, safe area, 네이티브 컨테이너

| 공식 근거 | Chroma Note에서의 의미 |
|---|---|
| 기존 바이너리도 실행되지만 SDK에 따라 화면 사용 범위가 다르다. iOS 27 SDK와 달리 27.1 SDK는 화면 가장자리와 세로 배치된 표준 탐색·도구 버튼을 지원한다. [Prepare, 0:30](https://developer.apple.com/videos/play/tech-talks/111461/) | RN 스타일 수정만으로 Duo의 전체 화면 지원이 완료됐다고 할 수 없다. |
| `UIScreen.main` 같은 단일 화면 가정 대신 scene·현재 영역을 사용한다. [Prepare, 3:57](https://developer.apple.com/videos/play/tech-talks/111461/) | 기기 해상도 상수보다 현재 창과 부모 콘텐츠 `onLayout`을 기준으로 한다. RN 대응 방식은 §6의 제안이다. |
| safe area와 margin은 비대칭일 수 있다. 좌우 inset을 독립 처리하고 조작 요소를 안전 영역에 둔다. [Prepare, 6:06](https://developer.apple.com/videos/play/tech-talks/111461/) | `left * 2`로 빼지 않는다. 이미 safe area가 적용된 콘텐츠 폭에서 다시 inset을 빼는 중복 계산도 피한다. |
| 표준 navigation·sheet·popover·alert는 적응 동작을 제공한다. [Prepare, 5:01](https://developer.apple.com/videos/play/tech-talks/111461/) | RN `Modal` 안에 직접 그린 `Sheet`·`ConfirmDialog`를 UIKit의 표준 시트·경고창과 동일하게 취급하지 않는다. 자동 회피 여부는 별도 확인한다. |

### 접힘 영역은 safe area와 별도다

힌지는 division region, 카메라는 occlusion region으로 구분된다. 접힘 division region은 접었을 때 활성화되고 평평할 때 폭이 0이다. iOS 27.1의 reserved region API로 영역을 조회하며, 연속 스크롤 콘텐츠를 일괄 이동시키기보다 필요한 조작 요소만 조정한다. [Apple, Strike a pose, 2:26 / 6:39 / 7:50](https://developer.apple.com/videos/play/tech-talks/111463/)

HIG는 그리드가 접힌 중앙을 자연스럽게 나누도록 짝수 열을 선호하고, 불필요한 큰 재배치를 피하도록 권장한다. **일반 창 너비만으로 실제 힌지 위치를 알 수는 없다.** Book의 현재 3열 경로는 일반 넓은 화면 대응이며 Duo 접힘 회피의 증거가 아니다. 평평한 넓은 화면까지 무조건 짝수 열로 제한할 필요는 없지만, Duo 부분 접힘은 네이티브 영역 정보와 함께 2·4열 또는 영역별 배치를 검토해야 한다. [HIG, Dynamic layouts](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)

`ArrangementView`와 `UIArrangementViewController`는 두 콘텐츠의 배치를 크기·비율·접힘 영역에 맞춰 조정하는 iOS 27.1 선택지다. 이는 모든 앱에 두 영역을 요구한다는 뜻이 아니다. Chroma Note의 현재 단일 기록 흐름에는 우선 도입하지 않는다. [Strike a pose, 9:20–12:00](https://developer.apple.com/videos/play/tech-talks/111463/)

## 4. 다른 앱의 공개 적용 사례

### Duo 출시 전 공개 사례

| 앱 | 확인한 출처와 공개 방식 | 확인 범위와 한계 |
|---|---|---|
| Netflix | Apple 발표는 외부 화면 Clips 탐색과 내부 대형 화면 경험을 설명한다. [Apple 발표의 Netflix 설명](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/) | 기기 발표 주체의 공식 시연 근거다. Netflix 자체 게시물·출시 버전·배포 완료는 이번 조사에서 확인하지 못했다. 뉴스의 탁상 포즈 재생 컨트롤 배치를 제작사 확정 구현으로 인용하지 않는다. |
| Zoom·Slack | Apple은 Zoom의 공유 콘텐츠와 통화 참가자 동시 표시, Slack의 넓어진 workspace를 소개한다. [Apple 발표](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/) | 발표에서 이름을 든 특정 앱 사례다. 각 제작사의 배포 일정이나 모든 사용자 적용을 증명하지 않는다. |
| The Outsiders | 전달받은 Reddit 미리보기 단서와 검색에 노출된 `@TheOutsidersApp` 게시물 후보를 추적했다. 원 계정 접근과 작성자·원문 검증을 완료하지 못했다. | **채택 근거에서 제외한다.** 재게시 사이트를 first-party로 취급하지 않는다. Reddit 개발자 글의 정확한 원문과 소유 관계를 확보하면 미리보기로 추가 판단할 수 있다. |

따라서 “다른 앱들이 Duo용 레이아웃을 보편적으로 채택했다”는 결론은 내리지 않는다. 위 공식 시연은 참고 사례이며 일반 출시 후 사용성 검증이 아니다.

### 일반 태블릿·Android 사례: Duo와 구분

| 앱과 대상 | 제작사 직접 출처에서 확인한 적용 | Chroma Note에 참고할 점 |
|---|---|---|
| Spotify, iOS·Android 태블릿 | 2026-04-16 발표는 사용 가능한 태블릿 개편으로 소개한다. 재생과 탐색을 병렬 제공하고 접을 수 있는 sidebar를 추가하면서 핵심 탐색은 유지한다. [Spotify Newsroom](https://newsroom.spotify.com/2026-04-16/new-tablet-app-experience/) | 넓은 공간에는 목적이 있는 보조 작업을 배치한다. 회전 지원 사례를 Chroma Note의 회전 설정 변경 근거로 쓰지 않는다. Duo 적용 발표는 아니다. |
| OneDrive, Android Surface Duo | 제작사가 목록·파일 미리보기, 사진 목록·선택 사진의 양쪽 배치와 탐색 위치 동기화를 설명하고 구현 구조를 공개했다. [Microsoft OneDrive 개발 사례](https://devblogs.microsoft.com/surface-duo/enhance-onedrive-dual-screen/) | Book+상세를 나중에 동시 표시한다면 선택·스크롤 문맥 보존이 핵심이다. 물리적으로 분리된 두 화면 사이 hinge 공간을 다루는 과거 사례이므로 연속 디스플레이인 iPhone Duo·Galaxy Fold8에 같은 상수를 복사하지 않는다. |

Google의 feed, list-detail, supporting-pane은 플랫폼 권장 패턴이며 특정 앱의 출시 증거는 아니다. Chroma Note는 현재 Book 그리드의 폭 적응을 먼저 적용하고, 목록·상세 동시 탐색의 필요가 확정될 때만 구조를 확장하면 된다. [Android canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts?hl=en)

## 5. Android 방향 제한의 적용 조건

Android 16에서 **target API 36**인 앱은 일반적으로 **디스플레이 smallest width ≥600dp**일 때 방향·비율·리사이즈 제한이 무시된다. 작은 디스플레이, 게임, 사용자 설정 등의 예외가 있으며, 공식 문서는 target API 37 이상에서 큰 화면 opt-out 제거도 명시한다. 이를 단순히 “Fold8이면 항상 세로 잠금이 무시된다”로 요약하지 않는다. [Android 공식 정책](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability)

현재 `android/app/build.gradle`은 SDK 값을 root project 설정에서 받는다. 이번에는 최종 resolved target SDK나 설치 바이너리를 검증하지 않았다. 실제 Android 작업에서는 빌드의 target SDK, OS, 창 크기, 제조사·사용자 호환 설정을 확인해야 한다. 정책 회피용 opt-out 추가는 최소 대응안에 포함하지 않는다.

같은 공식 문서는 과도하게 늘어난 요소의 최대 폭, 낮은 화면에서의 스크롤, 창 크기 변경 중 상태 보존을 권장한다. 이는 현재 RN 작업으로 수행할 수 있는 공통 대응이다. [Android readiness checklist](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability#readiness-checklist)

## 6. 저장소 현황과 최소 적용안

아래는 조사 시점의 **미커밋 작업본**을 읽은 결과다. 다른 작업에서 Book·SemanticText를 수정 중이므로 최종 통합 시 다시 대조한다. 구현 존재와 화면 검증 통과는 구별한다.

| 대상 | 현재 코드에서 확인 | 최소 적용 제안 |
|---|---|---|
| [BookScreen](../../src/ui/screens/BookScreen.tsx) | 그리드 `onLayout` 측정값을 우선하고 초기에는 창 폭−40을 사용한다. 조건에 따라 1·2·3·4열이다. | 진행 중인 실측 폭 대응을 재사용한다. safe area·본문 여백 이후의 실제 grid 폭으로 계산하고 좁게→넓게→좁게 검증한다. Duo 부분 접힘 전용 짝수 열은 §3·7의 후속이다. |
| [Screen](../../src/ui/components/Screen.tsx) | 좌우 safe area, overflow 스크롤, 키보드 회피, footer 분리가 있다. 본문 최대 폭은 없다. | 글·입력 중심 화면의 내부 콘텐츠와 footer 버튼을 중앙 정렬하고 최대 폭을 둔다. Book·전면 뷰어까지 일괄 제한하지 않는다. |
| [Sheet](../../src/ui/components/Sheet.tsx) | `width: '100%'`, `maxHeight: '88%'`, 좌우·하단 safe area, overflow 스크롤과 입력 노출 처리가 있다. 최대 폭은 없다. | 우선 폭 100%+최대 폭+중앙 정렬을 적용한다. 88%만으로 키보드·상단 안전 영역이 보장되는 것은 아니므로 실제 남은 높이에서 제목·본문·footer를 검증한다. |
| [RecordExportModal](../../src/ui/components/RecordExportModal.tsx), [ConfirmDialog](../../src/ui/components/ConfirmDialog.tsx) | 각각 미리보기 최대 폭 540, 확인 상자 최대 폭 420이다. | 기존 수치를 유지한다. 본문·시트는 540을 시작 후보로 재사용하되 Pen 대조 전 확정 디자인값으로 만들지 않는다. |
| [SemanticText](../../src/ui/components/SemanticText.tsx) | 텍스트 `onLayout`의 폭 변경 시 이전 선택을 무효화하고 새 폭으로 측정한다. 내용·서체·fontScale 등도 측정에 관여한다. | 모든 문장에 기존 wrapper를 검토·적용하는 진행 작업을 유지한다. 좁은/넓은 폭 재측정, 명시 개행·빈 줄·DB 원문 보존, 측정 완료 후 내보내기를 함께 검증한다. |
| [PhotoInputScreen](../../src/ui/screens/PhotoInputScreen.tsx), [CompareScreen](../../src/ui/screens/CompareScreen.tsx) | 이미지 높이는 230·302, `resizeMode="contain"`이다. | 폭 증가에 비례해 높이를 무한 확대하지 않는다. 기존 높이는 보통 화면 기준으로 유지하고 낮은 콘텐츠 영역에서 축소하거나 화면 스크롤로 버튼 접근을 보장한다. |
| [ImageViewerScreen](../../src/ui/screens/ImageViewerScreen.tsx), [ZoomableImage](../../src/ui/components/ZoomableImage.tsx), [Android 구현](../../src/ui/components/ZoomableImage.android.tsx) | 정적 Screen 안 frame과 내부 viewport 모두 `minHeight: 260`이 있다. 내부 viewport는 `onLayout`으로 측정한다. | 외부 frame 하나만 고치면 내부 최소 높이가 남는다. 두 계층의 최소 높이를 실제 남은 영역에 맞추고, 닫기·확대 controls·고지 문구를 위한 높이를 먼저 확보한다. 크기 변경 뒤 확대·이동 경계도 재확인한다. |

**측정 단위와 책임:** RN의 `useWindowDimensions`는 창 크기 변경에 반응한다. 자식의 실제 배치 크기는 `onLayout`의 `layout.width/height`로 읽는다. RN 논리 단위를 사용하며 패널 픽셀이나 물리 대각선으로 breakpoint를 정하지 않는다. Apple size class를 RN의 숫자 breakpoint와 동치라고 부르지 않는다. [RN 0.86 useWindowDimensions](https://reactnative.dev/docs/0.86/usewindowdimensions), [LayoutEvent](https://reactnative.dev/docs/0.86/layoutevent)

**여백·높이 처리:** safe area가 반영된 콘텐츠를 측정했다면 inset을 다시 차감하지 않는다. viewer 높이는 전체 창에서 임의 상수를 빼기보다 header·footer 배치 후 남은 부모 영역을 사용한다. 기존 `SafeAreaView`의 개별 edge 적용과 `KeyboardAvoidingView`·스크롤 구조를 재사용한다. 이것은 앱 적용 제안이며 새 라이브러리가 필요한 작업은 아니다. [Expo 57 safe-area-context](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/), [현재 Screen](../../src/ui/components/Screen.tsx)

540·420은 **저장소에서 재사용할 값**이고, Apple·Google의 의무 최대 폭이 아니다. 540 제한을 적용한 최종 콘텐츠가 좁아지면 `SemanticText`도 그 최종 폭으로 다시 측정해야 한다. 내보내기 캡처 도중의 레이아웃 변경을 준비 완료 상태로 오인하지 않도록 기존 readiness 흐름을 보존한다. [현재 내보내기 구현](../../src/ui/components/RecordExportModal.tsx), [텍스트 계약](../02_TECH_SPEC.md#의미-단위-텍스트-줄바꿈)

## 7. 지금 할 수 있는 일과 플랫폼 후속

| 구분 | 범위 | 완료 증거 |
|---|---|---|
| 현재 RN 범위 | 그리드 실측, 본문·시트 최대 폭, 텍스트 재측정, 낮은 뷰어, 기존 safe area·키보드·상태 보존 | 관련 기존 검사와 현행 iPhone Simulator 회귀. 넓은 폭 수치 검사는 별도 기록하며 Duo 실기기 통과로 환산하지 않는다. |
| SDK 27.1 준비 후 | 새 SDK 빌드의 Duo 전체 화면 범위, status/navigation UI, Device Hub 포즈·Split View | 실제 설치된 Xcode·SDK·runtime과 새 빌드로 재현. 개발자 페이지의 예고를 설치 완료로 기록하지 않는다. [Apple 준비 페이지](https://developer.apple.com/iphone-duo/) |
| Duo 네이티브 연동 후 | `ReservedRegion`·`UIViewReservedRegion`, custom sheet/dialog·grid의 힌지·카메라 회피, 필요시 arrangement | 새 SDK API와 RN 연결의 실제 지원 여부를 확인하고, 정보가 JS에 전달되는지 검증한다. 현재 safe-area-context가 내부 division region까지 전달한다고 가정하지 않는다. [Apple API 소개](https://developer.apple.com/videos/play/tech-talks/111463/) |
| 기기 확보·기존 게이트 통과 후 | 실제 Duo 접기·펼치기, 화면 이동·입력·초안 보존, Galaxy Fold8 창 변경·힌지 대응 | 대상 OS·빌드·기기·조작·결과 기록. Android 힌지 대응은 별도 플랫폼 조사·연동이며 iOS SDK 갱신으로 해결되지 않는다. |

`src`, `modules`, 설치된 `react-native-safe-area-context`, `react-native-screens`, `expo-router`에서 `reservedRegion`, `UIViewReservedRegion`, `ArrangementView`, `UIArrangementViewController` 문자열을 검색했으나 일치가 없었다. **명시적 연결을 발견하지 못했다는 뜻**이며 OS의 간접 자동 동작까지 없다고 증명하는 검사는 아니다.

이번 단계에서 새 layout framework, 포즈별 화면, Book+상세 상시 분할, 네이티브 bridge를 선제 도입하지 않는다. 실제 사용 목적 또는 새 SDK 검증에서 드러난 문제가 생길 때 해당 범위를 추가한다.

## 8. 세 가지 선택: 세로 기본, 가로 허용, Duo 전용 UI

후속 질문의 “아이패드 듀오”는 여기서는 **iPhone Duo의 넓은 화면 대응과 가로 모드 허용의 비교**로 해석한다. 별도의 iPad 제품명으로 사용하지 않는다. 가로 모드를 허용하라는 최종 지시로 해석해 설정을 변경하지 않는다.

| 선택 | 필요한 코드 범위 | 줄일 수 있는 작업과 남는 제약 | 판단 |
|---|---|---|---|
| **A. 세로 기본 유지 + 공통 크기 대응** | `BookScreen`, `Screen`, `Sheet`, `SemanticText`, 이미지 입력·비교, `ImageViewerScreen`과 양 플랫폼 `ZoomableImage`. 진행 중인 변경을 재사용하고 남은 폭·높이 제한만 보완 | `app.json` 방향 변경과 새로운 탐색 구조가 없다. Duo 내부 화면은 방향 제한과 별개로 넓어질 수 있어 대응 자체는 필요하다. 실제 Duo 전체 화면·reserved region은 SDK 27.1 이후 검증 | **현재 추천.** 기존 사용자 의도와 기술 명세를 유지하는 최소 변경 범위 |
| B. 세로·가로 허용 + 공통 크기 대응 | A의 관련 파일에 더해 `app.json` 방향 정책, 생성된 iOS·Android 설정·모달 동작 확인, 회전 중 입력·상태 검증 | 가로를 켜도 본문·시트 폭과 낮은 뷰어 문제가 남는다. 좁고 낮은 일반 iPhone 가로 화면까지 검사 범위가 늘어난다. 새 iOS SDK 요구와 Duo 힌지 회피는 그대로 남는다 | 사용자가 일반 iPhone에서도 회전해 보고 싶을 때 선택. 구현량을 줄이는 지름길로 추천하지 않음 |
| C. Duo 전용 분할 UI | A에 더해 `AppDemo`·화면 조합·Book/상세 선택·뒤로가기·상태 공유 설계. 힌지 정보 연결과 영역별 배치, 필요시 네이티브 arrangement 도입 | 목록·상세 동시 탐색을 제공할 수 있지만 설계·탐색·연동 범위가 증가한다. SDK·Simulator·실기기 확인 없이 전용 대응 완료를 선언할 수 없다 | 지금 보류. 동시 탐색의 실제 필요가 확인됐을 때 별도 작업 |

**논리 근거:** Apple HIG는 포즈마다 앱을 다시 설계할 필요가 없다고 설명한다. 따라서 A가 Duo 전용 화면을 포기한 임시 대응인 것은 아니다. Apple의 방향 제한 비적용 설명과 Android의 최대 폭·스크롤 권고를 함께 보면, B는 A의 공통 레이아웃 작업을 없애지 못한다. [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo), [Apple 방향 안내, 2:46](https://developer.apple.com/videos/play/tech-talks/111461/), [Android 대응 권고](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability)

공수는 시간으로 단정하지 않는다. 코드 기준으로 A는 이미 있는 공통 컴포넌트의 제한값·측정 흐름 보완, B는 A+방향 설정·회전 검증, C는 A+화면 조합·탐색·플랫폼 연동이다. **지금은 A를 마치고, 일반 기기의 가로 사용 요구가 확정되면 B를 더한다.** 가로 허용 여부와 Duo 출시 준비 여부는 독립적으로 판단한다.

## 9. 검증 계획과 이번 조사 결과

후속 구현의 최소 검증:

1. Book·본문·시트를 좁게→넓게→좁게 바꾸어 overflow와 텍스트 재측정을 확인한다. 그리드 경계는 최종 코드의 실제 breakpoint 양쪽을 확인한다.
2. 짧고 넓은 영역에서 viewer 닫기·확대 controls, 사진 입력·비교 버튼, 시트 입력·footer가 도달 가능한지 확인한다. 키보드를 연 상태도 포함한다.
3. 편집·처리·내보내기 중 크기를 바꿔 원문·초안·선택·처리 상태가 보존되고, 내보내기가 새 배치 준비 이후 수행되는지 확인한다.
4. 새 SDK와 Duo 환경이 준비되면 비대칭 inset, 부분 접힘의 중앙 요소, 카메라 활성 영역, Split View를 별도로 검증한다. 논리적 크기 테스트는 이 검증을 대체하지 않는다.

기존 완료 순서는 [프로젝트 현황](../03_PROJECT_STATUS.md#41-체크-방법과-진행-순서)을 유지한다. 현재 iPhone 17 Pro / iOS 26.5 Simulator의 필수 순환 완료 후 iPad mini 실기기로 넘어간다. 이 문서는 추가 접근성 전수 검사나 즉시 Android·Duo 실기기 작업을 새 완료 조건으로 만들지 않는다.

**이번에 확인:** 공식 웹 출처와 현재 코드 대조, Xcode·설치 SDK 확인, 문서의 로컬 링크·변경 범위 검사. HIG는 웹 텍스트 도구에서 JavaScript 요구 화면이 나와 Apple의 [동일 문서 JSON](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/designing-for-iphone-duo.json)을 직접 읽어 본문을 확인했다.

**이번에 미실행:** 앱 코드 변경, UI·Simulator·실기기 실행, 네이티브 빌드, SDK 업데이트, 원격 변경·커밋. 따라서 이 문서는 구현·기기 검증 완료 보고가 아니다.
