# Chroma Note · 선화 디자인

2026-09-10 · [Pen 디자인](chroma-note.pen) · 동작 정본은 [제품 명세](../docs/01_PRODUCT_SPEC.md), 화면 원칙은 [디자인 brief](../docs/design/DESIGN_BRIEF.md), 조사·개선 근거는 [design.md](../docs/design/design.md). 핵심 문구 제안은 “그날의 색을, 선으로 남기다.”이며 브랜드 최종 승인 문구가 아니다.

사진 임포트 전용 선화 기록의 새 디자인이다. 현재 파운데이션·컴포넌트·화면만 유지하며 카메라, 지도, 공유, 결제, 출시 화면은 포함하지 않는다. 앱 구현이나 클릭 가능한 네이티브 프로토타입은 아니다.

## Pen 구성

| 영역 | 내용 |
|---|---|
| 00 Foundations | 종이/잉크/행동/상태 색, 역할별 글자, 간격, 터치·이미지 확대 원칙 |
| 01 Components | 버튼, 입력, 아이콘 버튼, 필터 칩, 기록 카드, 팔레트, 안내, 확인 선택, 글 영역, 시스템 상태바, 처리 단계, 확인 대화상자, 이미지 비교, 요약 행 — 기존 15개 재사용 components 기준 |
| 02 Image fixtures | 디자인용 사진·선화와 품질 근거로 사용하지 않는다는 안내 |
| 03 States | 인증·사진·모델·Book·저장·삭제의 오류/복구 카드 18개 |
| 04 Confirmations | 초안 폐기, 사진 교체, 재인증 후 계정 영구 삭제 |
| 05 Interaction states | 기본·초점·눌림·비활성·처리 중, 입력 오류 |
| 06 Mobile flow | 비교→요약, 영역별 시트, 중앙 모달, 필수 safe area·키보드 계약 |
| 07 Startup flow | 스플래시 유지와 시작 파일 검사, 다운로드·이어받기·검증·오류 복구, 요청 처리 중 버튼 |

현재 Pen은 루트 63개(보드 8개, 재사용 기록 컴포넌트 1개, 화면 54개), 재사용 컴포넌트 15개다.

| 번호 | 화면 |
|---|---|
| 01–07 | 이메일 인증, 코드 확인, Book, 빈 Book, 사진 입력 확인, 모델 준비, 로컬 처리 |
| 08–11 | 결과 비교 1/2, 저장된 기록 상세, 기록 편집, 설정 |
| 12–16 | 초안 재개, AI 설명 실패, 선화 실패, 저장 대기, 편집 충돌 |
| 17–20 | 기록 삭제, 오프라인 로그아웃, 계정 삭제 재인증, 필터 |
| 21–24 | 태블릿 Book 834, 가로 비교 1194, 영문 인증·Book |
| 25–28 | 좁은 폭 320, 글씨 200%, 원본 보기 360, 확인 완료·요약으로 진행 |
| 29–30 | Book 320폭 1열, Book 200% 글씨·필터 진입 |
| 31, 33–35 | 기록 요약 2/2, 날짜/장소·통합 문구 편집·색 시트 |
| 36–39 | 사진 작업 시트, 글 읽기 시트, 기록 더보기 시트, 통합 문구 편집+키보드 안전영역 |
| 44–47 | 선화 확대 1×·4×·320폭, 전체 기록 읽기 |
| 48–51 | 이미지 내보내기·권한·저장 상태 |
| 00s, 06a–06g | 스플래시, AI 다운로드 안내·진행·일시 정지·검증, 연결 오류·저장 공간 부족·파일 손상 |

폰 기본은 390×844이며 360×800·320×640 변형을 포함한다. 비교와 요약을 두 단계로 나누고, AI 문구·내 메모·태그는 하나의 문구 편집 시트에서 함께 다루며 날짜/장소·대표색은 별도 바텀시트로 연다. 삭제는 중앙 확인 모달이다. 시트의 “초안에 적용”과 서버의 “저장하기/변경 저장”을 구분한다.

모든 화면·시트·모달의 콘텐츠는 safe area 안에 둔다. 기본 fixture는 상태바 포함 상단 62, 하단 34이며 실제 앱은 OS의 네 방향 inset을 사용한다. 키보드 시안은 높이 290의 예시이며 실제 키보드를 구현한 것은 아니다. Book의 누적 목록과 긴 원문 등 필요한 콘텐츠만 스크롤하고, 화면과 시트의 이중 스크롤은 금지한다.

스타일은 미니멀리즘을 바탕으로 흰 배경 컬러 선화를 중심에 둔다. Book 카드 상자·그림자를 덜어내고, 불투명한 밝은 시트와 어두운 배경막으로 편집 영역을 구분한다.

## 공통 규칙과 이미지

색은 primitive → semantic 변수로 연결하며 화면과 컴포넌트는 의미 변수로 참조한다. 본문 16, 보조 14, 작은 글 12, 제목 20/28, 줄 높이 1.5, 조작 최소 48×48을 사용한다. `better-*` 디자인 스킬의 대비·그룹화·가독성 원칙을 이 공통 규칙에 반영했다.

Pen의 본문은 Noto Sans KR, 브랜드/전시 문구는 Libre Baskerville이다. 이는 디자인 도구의 표현용 글꼴이며 앱의 시스템 글꼴 우선 원칙을 바꾸거나 폰트 패키지 설치를 요구하지 않는다. 초점과 오류는 색만으로 구분하지 않는다.

이미지 디자인용 생성 원본 `generated-1788887280309.png`는 사용자 사진이 아니다. 이를 `style1` 실제 선화 출력 `images/lineart-style1-source-rgb.png`로 변환해 적용했다. 흰 배경에 원본 RGB를 선 마스크에만 입히며 색면·5색 양자화·굵은 외곽선·내부선 제거·거친 인쇄·재배치·확산 모델은 적용하지 않는다. `palette1`~`palette5`는 별도 metadata이며 선화 색 수 제한이 아니다.

## 미리보기와 검증

- [파운데이션](previews/VqCCu.png) · [컴포넌트](previews/wlBIi.png)
- [Book](previews/ePGw7.png) · [결과 확인](previews/yhiki.png)
- [태블릿 비교](previews/H4nbI.png) · [영문 인증](previews/Op9oz.png)
- [빈 Book](previews/qr9tS.png) · [기록 상세](previews/QPxep.png)
- [Book 320](previews/dDLpN.png) · [Book 200%](previews/JfE7z.png)
- [기록 요약](previews/iZ6vL.png) · [메모 시트](previews/L844KQ.png) · [키보드 안전영역](previews/hGZdL.png)
- [날짜·장소](previews/h2C6Iq.png) · [AI 글·태그](previews/ZT1he.png)
- [필터 시트](previews/oIDLE.png) · [삭제 모달](previews/trgbv.png) · [모바일 흐름](previews/JlJfV.png)

2026-09-10 Pen 수정·저장 완료: 루트 60개, 재사용 컴포넌트 15개. 문구 71곳·선화 이미지 51곳 갱신, 기존 도장 문구 0개, placeholder 0개. 인증·Book·비교·상세·태블릿·320폭·다운로드 7개 화면을 시각 확인하고 대표 미리보기 19개를 갱신했다. 정적 검사에서 비활성 텍스트 11개와 의도된 스크롤/확대 영역 8개의 clipping을 구별했다. 새 문구의 비의도적 잘림은 관찰하지 않았다.

2026-09-11 현재 앱 동작과 동기화: 08/25~28·태블릿·모바일 흐름의 사용자 문구를 `컬러 스케치 확인`, `원본 사진`, `컬러 스케치`, `사진 바꾸기`로 통일하고 원본/컬러 스케치 탭 폭을 같게 했다. 성공 뒤 재생성 조작과 후보 교체 확인 시안을 제거했다. Pen 앱에서 08/27/28을 다시 열어 체크 전/후 CTA와 잘림 없음을 확인했고 JSON 파싱과 폐기 문구 검색이 통과했다.

2026-09-11 문구 흐름 동기화: 요약을 `문구 편집`·`날짜와 장소`·`사진에서 찾은 색` 3행으로 정리하고 AI 문구·내 메모·의미/분위기 태그를 단일 시트로 합쳤다. 폐기된 별도 메모·AI 제안·대체 화면 5개를 제거했다. 현재 루트 55개·재사용 15개·placeholder 0개이며 JSON, ID/ref, 금칙 문구, clipping·키보드 경계 정적 검사가 통과했다.

이 Pen 기록만으로 앱 코드·네이티브 동작 완료를 뜻하지 않는다. 실제 키보드·safe area·Android·모델/서버 통합 상태는 [프로젝트 현황](../docs/03_PROJECT_STATUS.md)을 따른다.

2026-09-12 초안 삭제 동기화: Book·두 초안·태블릿·좁은 폭 변형의 재개 버튼 옆에 기존 48px 아이콘 버튼과 휴지통 아이콘을 배치했다. 기존 확인 모달의 제목을 `초안을 삭제할까요?`, 본문을 `이 기기의 초안을 삭제해요. 저장된 기록은 유지돼요.`로 맞췄다. 별도 공통 컴포넌트나 화면을 추가하지 않았다. 두 초안 footer의 행 높이 52px·삭제 버튼 48px과 iPhone 앱의 동일 배치·확인창을 시각 확인했다.

2026-09-13 시작 화면 최신화: 기존 06b를 갱신하고 스플래시 00s, 다운로드 안내 06a, 일시 정지 06c, 파일 검증 06d, 연결 오류 06e, 저장 공간 부족 06f, 파일 손상 06g를 추가했다. `07 Startup flow` 아래 두 행으로 배치했다. 약 2.95GB와 와이파이 안내, 실제 바이트 진행률, 고정 하단의 다운로드·일시 정지·이어받기·다시 시도를 현재 `ModelSetupScreen`에 맞췄다. 검증 중에는 진행률과 조작 버튼을 표시하지 않고, 정상 파일이면 자동으로 앱에 진입한다. 요청 중 버튼의 `다운로드 준비 중`, `멈추는 중`도 보드에 반영했다.

- [시작 흐름](previews/startup/gUy2E.png) · [스플래시](previews/startup/A75ol0.png) · [다운로드 안내](previews/startup/a1JhB1.png)
- [다운로드 진행](previews/startup/z8Hbv.png) · [일시 정지](previews/startup/L2tpcK.png) · [파일 검증](previews/startup/YZ1xk.png)
- [연결 오류](previews/startup/aABgr.png) · [저장 공간 부족](previews/startup/KaNiR.png) · [파일 손상](previews/startup/K66JOY.png)

검증: Pen MCP에서 루트 63개·재사용 15개·placeholder 0개, 변경 범위의 clipping 0개와 다른 루트와의 겹침 0개를 확인했다. iPhone 17 Pro / iOS 26.5 Simulator에서 10개 임시 화면 상태, `SemanticText` 63개 문구의 측정 완료·원문 보존을 확인하고 원래 `ready` 상태로 복원했다. 대응하는 Pen 7개 화면의 사용자 문구 44개가 앱과 일치한다. 선화·계정·저장 데이터 변경이나 실제 모델 재다운로드는 수행하지 않았다. [검증 결과](previews/startup/validation.json) · [시뮬레이터 문구 측정](previews/startup/simulator-comparison.json) · [실제 다운로드 화면](previews/startup/simulator-downloading.png)

2026-09-13 시작 이미지: 내장 Imagegen으로 노트·커피잔·잎의 컬러 선화를 생성해 [앱 스플래시](../assets/images/splash-chroma-note.png)에 적용했다. 글자를 이미지에 넣지 않았고 종이색 `#F7F3EA` 배경, 280pt 이미지 영역, 중앙 정렬·contain을 사용한다. 기기 화면 비율과 무관하게 그림 비율을 유지하고 별도 표시 지연을 추가하지 않는다.

생성 프롬프트: “Create one polished mobile app splash illustration for Chroma Note, a quiet photo diary that turns the original colors of everyday photographs into delicate colored line drawings. Transparent PNG background, square composition, 1024 by 1024. Centered small still-life vignette drawn only with expressive fine colored ink contours: a warm ceramic coffee cup and saucer beside a simple open notebook and one small leafy branch, viewed at a gentle three-quarter angle. A few loose contour strokes suggest an ordinary moment being remembered. Refined Korean editorial stationery aesthetic, airy, restrained, organic, calm, mature. Muted deep blue #294B63, sage green, dusty terracotta, warm ochre and soft charcoal; limited harmonious palette. No filled color blocks, no photographic surfaces, no gradients, no watercolor washes, no shadows, no backdrop, no border or app icon tile. Crisp clean confident linework that remains legible when displayed at 220 pixels wide. Entire artwork within the central 75 percent of the square with generous clear transparent margins. No text, letters, logo, watermark or UI. This will be centered on a solid warm paper-colored #F7F3EA launch screen; keep the alpha background genuinely transparent, not a checkerboard painting. Deliver a finished raster illustration, not a mockup of a phone.”

스플래시 00s는 앱과 같은 원본 이미지를 참조한다. 새 레이어의 첫 내보내기가 비어 보이던 문제는 렌더링 완료 후 다시 내보내 정상 표시를 확인했다. [실제 iPhone 시작 캡처](../experiments/model-selection/data/model-delivery-20260913/splash-native.png)와 중앙 280pt·contain 배치를 대조했다. 최신 `ModelSetupGate`의 시작 파일 검사 중 스플래시 유지와 정상·누락·손상 분기를 보드에 기록했다. 이번 상태 주입 검증은 스플래시 표시 시간을 재검증한 것이 아니며, 해당 동작은 현재 소스 대조와 기존 시작 캡처를 근거로 한다.
