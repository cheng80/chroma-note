# Chroma Note 세션 핸드오프

작성: 2026-09-08, Asia/Seoul. 긴 대화를 새 Codex 세션으로 이관하기 위한 현재 상태 기록이다.

## 1. 가장 먼저 적용할 상태

**모든 구현·검수·빌드·커밋·push·위임은 사용자 요청으로 일시 중단돼 있다.** 이번 요청은 핸드오프 문서 작성과 새 대화 생성만 허용한다. 새 세션은 이 문서를 읽고 인계 확인 후 대기한다. 사용자가 재개를 지시하기 전에는 Orca 세션·Metro·기기 검수·자동화를 다시 시작하지 않는다.

- Orca 관리/구현 터미널에 interrupt를 전달했고 두 터미널의 `tui-idle`을 확인했다. 세션 자체는 보존했다. 입력창에 중단 지시가 남아 있을 수 있으므로 재개 때 무작정 Enter를 보내지 않는다.
- integration Metro 8081, UI worker Metro 8083, ChromaWDA 연결 프로세스를 종료했다. 중단 직후 관련 빌드·검사 실행 프로세스가 없음을 확인했다.
- Codex 자동화 `chroma-note-orca`는 `PAUSED`다. 사용자는 타이머 점검 대신 작업 세션 직접 감사를 원한다.
- 코드·사진 기록·워크트리는 삭제하지 않았다. 이번 핸드오프 문서만 새로 작성했으며 별도 커밋하지 않았다.

## 2. 코드 위치와 정본

| 용도 | 위치 / 상태 |
|---|---|
| 원래 프로젝트 | `/Users/cheng80/Desktop/Sesac_Works/Project/chroma-note`, `main`. 사용자 변경 및 미추적 기획·디자인 파일이 많다. 최신 실행 코드로 오인하지 않는다. |
| 실제 통합 코드 | `/Users/cheng80/orca/workspaces/chroma-note/chroma-v1-integration`, `codex/chroma-v1-integration` |
| UI 작업본 | `/Users/cheng80/orca/workspaces/chroma-note/camera-free-ui-reicon`, `cheng80/camera-free-ui-reicon` |
| Orca 관리 세션 cwd | `/Users/cheng80/orca/workspaces/chroma-note/codex-design-checkpoint` |
| 원격 | `https://github.com/cheng80/chroma-note.git` |

핸드오프 작성 시 직접 조회한 Git 상태:

- integration HEAD와 `origin/codex/chroma-v1-integration`은 **`fe4c5aa`**로 일치. 미추적 `.playwright-cli/`만 남아 있다.
- UI HEAD와 `origin/cheng80/camera-free-ui-reicon`은 **`4dafbd5`**로 일치. 미추적 `artifacts/`만 남아 있다.
- 직전 진행 보고의 “날짜·폰트 통합 대기”는 이제 과거 상태다. 두 변경은 통합됐다. 태블릿 다열 변경 `4dafbd5`는 아직 integration에 없다.
- 원래 프로젝트의 `AGENTS.md`, `CLAUDE.md`, `design/chroma-note.pen`, `docs/design/DESIGN_BRIEF.md` 수정 및 `.agents/`, `CONTEXT.md`, 다수 docs/design 미추적 파일을 보존한다. 광범위 stage·restore·reset을 하지 않는다.

재개 시에는 **integration 경로**에서 다음 정본을 읽는다. 원래 프로젝트의 같은 이름 파일은 오래된 내용일 수 있다.

1. `docs/03_PROJECT_STATUS.md`: 체크리스트, E-19~25 검증 근거, 미실행 범위.
2. `docs/01_PRODUCT_SPEC.md`, `docs/02_TECH_SPEC.md`, `docs/plans/PLAN-001-chroma-v1.md`.
3. `docs/04_WORKFLOW.md`: 역할별 모델 정책, Orca·기기·Git 운영.
4. 디자인 대조 시 `design/chroma-note.pen`, `design/README.md`, `design/previews/`, `docs/design/INTERFACE_REVIEW.md`, `docs/chroma_note_handoff_package/chroma_note_project_handoff.html`.

`03_PROJECT_STATUS.md`의 “기존 Metro 유지” 문장은 중단 전 상태다. 현재는 위 중단 지시가 우선한다. Expo 코드를 수정하기 전에는 프로젝트 AGENTS가 지정한 `https://docs.expo.dev/versions/v57.0.0/`의 정확한 SDK57 문서를 확인한다.

## 3. 사용자 확정사항

- V1 목표: 정식 스토어 출시 제품, iOS·Android, 한국어·영어. **출시 준비 REL-01~06은 사용자가 별도 진행하므로 현재 에이전트 작업/진행률에서 제외**한다.
- 우선순위: **카메라 없이 할 수 있는 구현·검수를 먼저 끝낸다.** 실카메라 추가 테스트는 현재 작업으로 자동 재개하지 않는다.
- 디자인: 색 인덱스북과 포스트잇 인덱스가 쌓인 다이어리의 느낌. HTML 참고 이미지와 Pen 화면이 기준이며, 폰·태블릿을 모두 다룬다. 기존 better 계열 및 make-interfaces-feel-better 검토 이력이 있다.
- 모든 사용자 UI의 그림문자·이모티콘 대체 아이콘을 공식 다운로드 아이콘으로 교체한다. 자체 SVG path를 그리지 않는다. 네트워크 없이 로컬 번들에 포함한다.
- **설정 아이콘은 `reicon-react-native/icons/Settings`의 육각 너트로 고정.** 메인이 제안했던 Gear 변경은 사용자가 취소했다. 익숙함을 이유로 다시 기어로 바꾸지 않는다.
- Reicon은 로컬 사용이 확인됐으므로 유지한다. 실제 오프라인 사용이 불가능할 때만 사용자 승인 대안 `@expo/vector-icons: ^15.0.2`를 고려한다.
- Find 진입·뒤로·탭 복귀에서 카메라 자동 시작 금지. 사용자 명시적 시작 이후만 CameraView를 켜며 이탈/백그라운드에서 해제한다. 전체 화면에 네 방향 Safe Area를 적용한다.
- 사진은 **앱 내부 최적화 사본 저장 방식**이다. 철회된 갤러리 참조·재연결·부분 백업 정책을 되살리지 않는다. 카메라 촬영 원본은 시스템 사진 앱에도 저장하며, 가져온 갤러리 원본은 수정하지 않는다.
- 사진 한 장 최대 5색, 같은 기준색 중복 없음. 선택한 기준색을 인덱스에 표시하고 실제 채집색을 보존한다. 기준색 ID로 Colors를 묶는다.
- 색을 붙일 때마다 저장. 최초 색을 붙이기 전 이탈은 확인 후 폐기하며 초안 복구 없음. 마지막 색을 제거해도 사진 기록은 유지한다. 전체 사진 삭제는 별도 확인 후 처리한다.
- 갤러리 촬영일 우선/없으면 가져온 날짜, 사용자 날짜 수정 가능. 메모·색·배치는 조작 완료 시 저장한다.
- 전체 사진 포함 수동 백업·복원. 새 ID만 추가하고 동일 ID는 현재 기기 기록 전체를 유지한다. 기기 간 동기화가 아니다.
- Book 첫 화면, 촬영 진입 강조. 갤러리·Ideas 포함. 시스템 언어 자동 감지와 앱 내 변경, 색 이름도 번역. 무료·광고·인앱결제 없음.
- 실제 구현은 Orca CLI 워크트리/세션으로 분담한다. 기능별 검증·한국어 커밋·push는 재개 후 기존 승인 범위다. PR·merge·스토어 공개는 승인되지 않았다.
- 모델 선호: Astra high=구조화/설계/검증, Sol high=계획/관리, Sol xhigh=복잡한 구현/배정, Luna max=일반 구현. 현재 지원 옵션·가용성에 맞춰 조정 가능하며 실제 구성을 보고한다. 전체 재검증과 반복 확인으로 시간을 소모하지 않는다.

## 4. 검증된 진행과 남은 일

정본 체크리스트: **95개 중 14개 완료(14.7%), 81개 열림**. 출시 준비 제외. 검수대기 73, 재작업 5, 미결정 2, 미결정/검수대기 1이다. 이는 검증 완료 항목 비율이며 구현 코드량이나 공수 비율이 아니다. Orca task 완료를 native 기능 완료로 치환하지 않는다.

통합된 주요 커밋:

| 커밋 | 내용 |
|---|---|
| `fe4c5aa` | 실제 사용하는 폰트 네 종만 로컬 번들에 포함 |
| `1853995` | 비카메라 화면 표시 규칙 정합. UI child `23342b4`에 대응 |
| `9ba740d` | 공식 Reicon 세 환경 렌더 근거·육각 너트 확정 문서화 |
| `d5e61c4` | 공식 Reicon 사용자 아이콘 교체, `react-native-svg` 추가 |
| `c060fb0` | 누락 사진 백업 오류 수정, 실제 Node SQLite/JPEG bytes 격리 검증 |
| `4144ca5`, `c4515d3`, `84d36ea` | lint 설치/잠금 정합과 웹 테마 hydration 수정 |
| `2a20a0b`, `f487ea1` | 촬영 원본 사진 앱 저장 및 실패 복구 동작 |

검증 범위를 구별한다:

- E-22: iPad mini 6 실제 촬영→두 지점 채집/손가락 drag→동일 사진 2색/다른 위치 저장→재실행 보존, 카메라 설정 off/on, 사진 앱 원본 저장의 정상 경로 통과. Android·전체 실패 경로까지 통과한 것은 아니다.
- E-24: 실제 임시 Node SQLite와 사진 bytes로 0색 유지/재부착, 5색·중복·재시도, ID 보존, 반복/삭제 복원, 손상·누락·실패 무손실 검사. Expo native DB·OS picker 검증과 구분한다.
- E-25: 공식 Reicon 12개 정적 subpath import, iOS/Android `EXPO_OFFLINE=1 expo export` 성공. 세 기기에 RNSVG 포함 Debug 앱을 update install/launch한 화면 증거가 정본에 기록됐다. Metro 개발 앱 실행과 네트워크 없는 앱 콜드스타트는 별개다.
- E-25에 기록된 integration 검사는 typecheck, 101 tests, lint 오류0/경고6, Expo dependency check 통과다. 이후 `1853995`/`fe4c5aa` 및 미통합 `4dafbd5` 전체 결과로 확대하지 말고 해당 커밋 로그/보고서를 확인한다.
- UI child `4dafbd5`: 태블릿 비카메라 다열 화면 변경, `chroma-ui.tsx`와 `chroma-ui.layout.test.ts`. child에 커밋·push됐으나 integration 미반영. 전체 UI/Pen·접근성 인수가 끝난 것으로 처리하지 않는다.
- 큰 잔여 범위: tablet Pick/Place 분할·Detail·Settings·Ideas의 실제 Pen 대조, 접근성/큰 글씨/회전/Reduce Motion, native 파일 백업·복원 정상·취소·손상·재실행, 날짜·언어·0색 기록의 통합 회귀. Android 및 카메라 관련 남은 체크는 이번 비카메라 범위와 구별한다.

## 5. Orca 인계 정보 — 현재는 중단 유지

Run: `run_0ab7221c105c`, repo ID: `5b5568a2-216b-425c-984f-cc2eccf8e937`.

| 역할 / 작업 | 식별자 / 작성 시 상태 |
|---|---|
| 관리 세션 | `term_cb95e465-565c-4bf4-8424-01e1c55604fc`, Sol high, interrupt 상태 |
| UI worker | `term_ba54617f-38a9-4083-a853-77ea42cedff6`, Sol xhigh, interrupt 상태 |
| UI task / dispatch | `task_edc81f648e01` / `ctx_afb9d0d458be`; DB 표기는 dispatched지만 실행 재개 허가가 아니다 |
| 데이터·백업 task | `task_ddd81e318643`, completed, 결과 통합됨 |
| lint task | `task_17da098c91d1`, completed, 결과 통합됨 |
| 최종 비카메라 통합 task | `task_027755a77003`, pending; UI 및 데이터 task 의존 |

재개 지시 후에만 현재 Orca 버전의 `orca-cli`/`orchestration` 스킬과 CLI help를 확인한다. terminal handle은 런타임 재시작 시 바뀔 수 있으므로 목록을 다시 확인한다. 관리 세션 inbox를 다른 세션이 consume/ack하지 않는다. 공통 `chroma-ui.tsx`·integration index의 writer는 하나만 둔다.

## 6. 기기·빌드·증거

| 대상 | 식별자 |
|---|---|
| iPhone 17 Pro Simulator | `690514C8-D269-4B41-82C2-1DCBA643C8C6` |
| iPad mini (A17 Pro) Simulator | `0BFEA78D-9000-4805-B866-2D9DC0658087` |
| 실물 iPad mini 6 | CoreDevice `BD6FA8BA-FDB1-5330-A5BF-04F9218CE1AE`, hardware UDID `00008110-000611692232801E` |

앱 bundle ID: `com.cheng80.chromanote`, scheme: `chromanote`. iPhone 14 Pro Max 및 iPhone Mirroring은 다시 명시 허용되기 전까지 접근·연결·설치·잠금해제 요청 대상이 아니다.

- 세 환경에 새 Debug 앱이 설치됐다. 기존 사진/Book 데이터를 지우지 않았다. 현재 Metro를 중단했으므로 설치됨과 바로 실행 가능함을 혼동하지 않는다.
- 실제 iPad 빌드 캐시: `/private/tmp/chroma-e22-gallery-derived`. iPhone/iPad Simulator 공용 빌드의 `/private/tmp/chroma-reicon-derived`는 설치 이후 디스크 확보를 위해 제거했다. 다시 무조건 clean build하지 말고 설치 상태·필요 변경을 먼저 판단한다.
- 공간 부족은 **Mac** 문제였다. 당시 148MiB까지 줄었고 임시 빌드 정리 후 성공했다. 핸드오프 작성 시 `df -h /private/tmp`는 가용 약40GiB로 바뀌어 있다. 과거 3.5GB 안내를 현재 수치로 재사용하지 않는다.
- `idevicescreenshot`은 실물 iPad에서 `Invalid service`, 오래된 WDA 연결은 빈 응답 이력이 있다. 설치/실행 성공과 캡처 도구 상태를 구별하며 죽은 검수 연결 복구만 반복하지 않는다.

주요 로컬 증거(임시 파일은 없어질 수 있으므로 재사용 전 존재 확인):

- `/private/tmp/chroma-offline-icons-verification.md`
- `/private/tmp/chroma-ipad-simulator-native-report.md`
- `/private/tmp/chroma-reicon-native-iphone17pro-book.png`
- `/private/tmp/chroma-reicon-native-iphone17pro-settings.png`
- `/private/tmp/chroma-reicon-native-ipad-simulator-book.png`
- `/private/tmp/chroma-reicon-native-ipad-simulator-settings.png`
- `/private/tmp/chroma-reicon-native-ipad-physical-book.png`
- `/private/tmp/chroma-reicon-native-ipad-physical-settings.png`
- `/private/tmp/chroma-reicon-ipad-xcodebuild-final.log` (`BUILD SUCCEEDED`)
- `/private/tmp/chroma-reicon-ipad-install.json` (`outcome: success`)
- `/private/tmp/chroma-camera-free-data-backup-task_ddd81e318643.md`
- `/private/tmp/chroma-qa09-lint-report.md`

## 7. 재개를 요청받았을 때의 순서

1. 원래 프로젝트·integration·UI child의 Git 상태와 Orca 세션을 다시 읽고 단독 writer를 정한다. 이 문서의 SHA와 달라졌다면 새 변경부터 확인한다.
2. `4dafbd5`와 integration의 차이 및 검증 보고를 검토한다. 완료 근거가 있는 변경만 목적별로 통합한다. 이미 반영한 날짜/폰트/아이콘 변경은 중복 적용하지 않는다.
3. 남은 비카메라 UI/Pen·접근성 검수와 native 백업·복원 인수를 독립 가능한 범위로 나눠 수행한다. UI 묶음 전체를 기다리느라 다른 검수가 막히지 않게 소유 범위를 조정한다.
4. 변경 규모에 맞는 typecheck/tests/lint와 실제 대상 기기 흐름을 확인하고, 증거가 충족된 체크 ID만 갱신한다. 새 실패/변경 없이 같은 검사를 반복하지 않는다.
5. 기능별 한국어 커밋·push 후 결과와 정확한 미실행 범위를 보고한다. 사용자 재개 지시가 없으면 1번부터 실행하지 않고 대기한다.
