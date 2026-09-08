# Chroma Note V1 Pen 제작 brief

## 1. 목적과 현재 상태

이 문서는 구현 작업자가 `design/chroma-note.pen`을 수정할 때 따를 V1 디자인 방향이다. 현재 `.pen`의 token을 정본으로 삼고, 초기 화면에서 약했던 **Pantone index book의 물성**과 **촘촘한 post-it diary 밀도**를 강화한다.

산출물은 정적 디자인이다. 화면 전환, scroll, drag, focus 이동, 권한 요청, 저장, 백업·복원은 실제로 동작하거나 검증된 상태가 아니다. 아래 interaction과 접근성 항목은 구현 의도와 정적 상태 표현을 지정할 뿐이며 앱 검증 결과로 해석하지 않는다.

## 2. 범위와 산출물 수

- Main: 17개 요구 화면 × `390×844 phone` / `834×1194 tablet portrait` pair = **34 screens**.
- Main 요구 화면: Book, Empty, Detail, Find, Pick, Place, Colors, Color Detail, Ideas, Settings, Language, Backup, Restore, Edit, Permission, Saved, Zero Color.
- Extras: `360×800` Pick, `320×800` Pick(`rvPRh`), 영어 phone Pick, `1194×834` landscape Book = **4 screens**.
- 합계: **38 screen frames + 4 system/state boards**.
- System/state boards: `00 Foundations`, `01 Components`, `02 Patterns`, `03 States`.
- `03 States`에는 실제 상태 카드 **12개**를 둔다.

V1에는 촬영·사진 가져오기, 영역 색 채집, 3~5개 후보, 사진당 최대 5색, Color Index 붙이기·편집, Diary·Colors, Ideas, 한국어·영어 설정, 전체 수동 백업·복원을 포함한다. Swatches, Monthly Palette, 공유, Target, 로그인, 서버·cloud sync, 게임화, 실시간 camera 색 분석, 자유형 scrapbook editor는 제외한다.

실제 tab 순서는 `Find · Book · Ideas`이며 앱 시작 시 가운데 `Book`이 선택된다. Book-first는 tab 순서를 바꾸는 뜻이 아니다.

## 3. 실제 시각 방향

### 3.1 Book이 제품의 얼굴

Book은 일반 card feed가 아니라 **겹쳐진 종이 page에 photo와 작은 color labels가 촘촘히 붙은 기록물**로 보여야 한다.

- Phone Book: 한 viewport에 photo entry **2개**, Color Index label **총 6개**.
- Tablet Book: 펼친 **2 pages**, photo entry **4개**, Color Index label **총 11개**.
- 각 page는 `paper`와 `surface`가 2~3겹 어긋나 보이게 하되 읽기 순서는 고정한다. 큰 빈 card와 dashboard형 section을 만들지 않는다.
- Photo는 page 안에 붙은 인화 사진처럼 배치한다. labels는 photo edge와 page edge에 겹쳐 붙인다.
- Page 바깥 month tabs는 쌓인 종이를 암시하는 시각적 paper hints다. 작은 tab 자체에 핵심 조작을 맡기지 않는다.
- MonthHeader는 높이 **48px month selector button + chevron**으로 월 선택 affordance를 분명하게 표시한다. Camera action과 시각적으로 분리한다.
- Phone은 세로로 이어지는 layered pages, tablet은 중앙 gutter가 있는 open two-page spread를 사용한다.

### 3.2 Color Index label

- 초기 prototype의 큰 label을 줄여 photo와 page에 여러 장이 붙을 수 있게 한다.
- Label corner radius는 **`[1,3,3,1]`**이다. 현재 label에 없는 3px border를 새 규칙으로 추가하지 않는다.
- 이름은 읽을 수 있어야 하지만 photo보다 강한 button처럼 보이면 안 된다. 긴 이름은 label 폭으로 수용하고 한 글자 ellipsis로 의미를 숨기지 않는다.
- Label이 작아도 선택·편집용 hit area는 `48×48`을 유지한다.
- 한 photo의 labels는 최대 5개이며 색 면, 이름, 선택 check를 함께 사용한다.

### 3.3 Colors는 dense strips

Colors overview의 큰 color tile/grid를 사용하지 않는다. 한 화면에서 여러 색이 모인 느낌을 주는 **촘촘한 가로 color strips**를 사용한다.

- 각 strip은 최소 `48px` touch row다.
- Leading 영역은 기준색을 넓고 정확하게 보여 주는 color band다.
- Trailing end는 `surface`의 흰 종이 조각이며 색 이름과 연결 photo 수를 담는다.
- Strip 사이 간격은 작게 유지해 index book처럼 연속해서 읽히게 한다.
- 색 이름·photo 수는 흰 end에 두며 동적 색 위에 작은 text를 직접 올리지 않는다.
- Tablet portrait는 큰 tile이나 selected detail 없이 2개 strip columns를 보여 준다. 선택 색 detail은 별도 Color Detail pair에 둔다.

### 3.4 정서

Warm off-white paper, neutral chrome, editorial photo record, 실제 색이 중심이다. 종이 겹침, 작은 그림자, 1~3° 회전, edge tabs로 물성을 만들되 rainbow chrome, 과한 texture, 유리 효과, 수집률·badge·점수는 쓰지 않는다.

제품 UI에는 `PhotoEntry`, `ColorReference`, ID, merge, database, cache, raw pixel, Delta E 같은 기술어를 노출하지 않는다.

### 3.5 Voice와 핵심 copy

문구는 따뜻하고 짧게 쓴다. 기능 내부 구조보다 지금 보는 대상과 다음 행동을 말하며, 저장 전 단계와 실제 저장 action을 구분한다. 아래는 반복 적용할 기준이며 전체 문자열 catalog가 아니다.

| 상황 | 사용할 표현 | 피할 표현 / 이유 |
|---|---|---|
| 채집색 label | `사진 속 색` | `사진에서 채집` — 내부 용어처럼 들림 |
| 기준색 label | `인덱스로 붙일 색` | `인덱스에 표시` — 결과보다 구조를 설명함 |
| 후보 안내 | `마음에 드는 색을 골라보세요` | `마음에 가까운 색` — 부자연스러움 |
| Pick의 다음 단계 | `붙일 위치 정하기` | `코랄 인덱스 붙이러 가기` — 이 단계에서 저장되는 것으로 오해 가능 |
| Place의 저장 action | `여기에 붙이기` | `이 위치에 붙이기` — 더 짧은 현재 표현 사용 |
| 저장 완료 | `Book에 저장했어요` | `Book에 붙였어요` — 저장 결과를 명확히 함 |
| Book 이동 | `Book 열기` | `Book으로`, `돌아가기` — 목적지가 불분명함 |
| Colors heading | `모아 둔 색` | `My Color Index` — 사용자 언어와 맞지 않음 |
| 파괴 action | `사진 기록 삭제` | 화면마다 다른 삭제 button label |
| 날짜·월 | `2026년 9월`, `9월 7일 월요일` | 영문식 월·일 표기 혼용 |

Navigation brand는 `Find`, `Book`, `Ideas`, `Diary`, `Colors`를 그대로 유지한다.

## 4. Foundation — 현재 `.pen` 정본

### 4.1 Color tokens

| Token | Value | 역할 |
|---|---:|---|
| `paper` | `#F7F3EA` | canvas, Book page 바탕 |
| `surface` | `#FFFDFA` | sheet, field, Colors name end |
| `ink` | `#292823` | 제목, 본문, 핵심 icon |
| `muted` | `#6B655B` | 보조 문구, metadata |
| `line` | `#D9D2C6` | 종이·field 경계 |
| `soft` | `#EDE7DB` | neutral chrome, notice 배경 |
| `accent` | `#56694C` | focus/selected 강조; 현재 primary button은 ink 사용 |
| `danger` | `#A03D32` | 삭제·폐기·오류 |

`muted #6B655B`는 `soft #EDE7DB` 위에서 WCAG 대비 `4.69:1`로 계산됐다. 최종 렌더의 실제 조합은 다시 확인한다.

현재 demo 색 `coral #D88069`, `sage #9DAF96`, `sky #8BA8B7`, `butter #D5B875`, `cedar #8E614F`는 화면 예시다. 실제 기준색 목록의 확정값으로 간주하지 않는다. 채집색과 선택 기준색은 서로 다른 swatch로 함께 보여 준다.

### 4.2 Typography

- Body: `Noto Sans KR`.
- Display: `Cormorant Garamond`; 영문 브랜드와 짧은 Latin display에만 사용한다.
- 본문 `16/24`, button `15/22`, 보조 문구 `13/20`.
- 화면 text는 최소 `12px`; 기존 `11px` text는 `12px`로 올린다.
- 한국어 heading은 `Noto Sans KR`를 사용해 Latin display font fallback에 기대지 않는다. `Cormorant Garamond`는 Latin display에 제한한다.
- 한국어 main screens와 대표 영어 Pick에 실제 문자열을 넣는다. 영어 전체 앱과 모든 font scale을 검증했다고 표시하지 않는다.
- `360px` compact에서 글자 크기를 줄여 맞추지 않고 wrapping·scroll로 처리한다.

### 4.3 Spacing, shape, elevation

- Spacing: `4, 8, 12, 16, 24, 32, 48`.
- Phone content margin `24`; compact `360px`에서는 필요한 화면만 `16`까지 줄일 수 있다.
- Tablet content margin `32`.
- Radius: photo `4`, control `12`, sheet/dialog `24`, Color Index label `[1,3,3,1]`.
- Elevation small: `0 2 4 #00000012` — label과 작은 떠 있는 종이.
- Elevation sheet: `0 8 28 #00000012` — dialog와 sheet.
- Segment와 모든 주요 조작의 touch height는 **48px**다.

### 4.4 Motion annotation

- Press scale `0.96`.
- 일반 state transition `150ms`.
- Color Index 붙이기 `220ms`.
- Reduce Motion에서는 즉시 전환한다.

이 값은 정적 `.pen`의 annotation이며 체감·성능은 아직 검증되지 않았다. Bounce, confetti, score animation은 넣지 않는다.

### 4.5 Accessibility intent

- 모든 조작 hit area는 최소 `48×48`.
- 선택·오류·제한은 색만으로 표시하지 않고 이름, check/icon, text를 함께 쓴다.
- Drag가 필요한 Color Index에는 구현 시 preset 위치 선택 대안을 제공한다.
- Dialog는 phone bottom sheet, tablet centered panel로 그리며 안전한 action을 먼저 읽게 한다.
- Text scaling, screen reader 순서, focus, 전체 화면 대비는 앱 구현과 렌더된 화면에서 별도 검증한다. 이 brief에서 통과를 주장하지 않는다.

## 5. Component 설계 역할과 현재 재사용 현황

현재 `.pen`에서 `reusable: true`인 component는 **17개**다: 3 Actions, Color Index Label, Color Candidate, Feedback Notice, Phone/Tablet Navigation, Diary/Colors Segment, 2 Photos, Memo Input, Settings Row, Collection Tile, Photo Entry, Confirmation Dialog, Index-book Strip.

아래 표는 화면을 일관되게 만드는 **구현 component 계획/설계 역할**이다. 현재 17개 reusable object와 일대일로 대응하지 않으며, 모든 항목과 variant가 이미 reusable로 구현됐다고 주장하지 않는다. 특히 `PaperPageStack`, `MonthHeader`, `MonthEdgeTabs`, `ColorCompare`, `NavRailBookCompact`, `ProgressResult`는 설계 역할 이름이다.

| Component | 실제 방향 | 필수 정적 variants |
|---|---|---|
| `PaperPageStack` | 2~3겹 page, 얇은 line, 약한 shadow | single, layered, open-left, open-right |
| `MonthHeader` | 높이 48, 월 제목과 선택 chevron | default, pressed, focused |
| `MonthEdgeTabs` | page edge의 paper hint | 1~5 tabs, decorative/selected hint |
| `PhotoEntry` | photo, 날짜, memo, 0~5 labels | default, zero-color, selected, missing-photo |
| `ColorIndexLabel` | compact, radius `[1,3,3,1]` | default, selected, duplicate, saving, error, removable |
| `ColorStrip` | color band + white name end | default, selected, pressed, empty-result |
| `ColorCompare` | `사진 속 색` + `인덱스로 붙일 색` | raw-only, candidate selected, changed |
| `ColorCandidate` | radius `12`, swatch, 이름, check | default, selected, duplicate, disabled-at-5 |
| `SampleMarker` | photo marker + sampled swatch | idle, analyzing, active, failed |
| `AppTabsPhone` | `Find · Book · Ideas` | default, selected, pressed |
| `NavRailStandard` | tablet width `176` | selected, unselected; icon + label |
| `NavRailBookCompact` | Book 전용 width `112` | icon over label, selected/unselected |
| `Segment` | Diary/Colors 등 2-way control | default, selected, focused; touch height 48 |
| `Action` | primary, secondary, text, icon | default, pressed, busy, disabled, error |
| `Field` | 날짜, memo, language row | default, editing, saving, saved, error |
| `Notice` | empty, permission, warning, failure | title, 설명, recovery action |
| `DialogSheet` | 확인·삭제·폐기·복원 | default, busy, failed |
| `ProgressResult` | backup/restore 진행과 결과 | processing, canceled, success, failed |

반복 구현이 필요한 항목은 기존 17개 reusable object를 우선 확장한다. 설계 역할 표를 근거로 빈 reusable component나 모든 variant가 이미 존재한다고 취급하지 않는다.

## 6. Adaptive canvas

### Phone `390×844`

단일 task pane과 하단 tabs를 사용한다. Book은 2 photo entries/6 labels가 첫 viewport에서 읽히도록 density를 맞춘다. Sticky action은 content와 겹치지 않는다.

### Compact Android `360×800`

Main pair로 세지 않고 별도 Pick screen의 **3 candidates**, action, text wrapping만 확인한다. `03 States`의 cards는 폭 약 `416px` column에 있으며 360 검증으로 간주하지 않는다. Text나 48px hit area를 줄여 맞추지 않는다.

`320×800` Pick(`rvPRh`)은 더 좁은 폭의 추가 clipping·wrapping 확인용이다. 이 한 화면을 다른 flow나 모든 font scale의 검증으로 확대 해석하지 않는다.

### Tablet portrait `834×1194`

- 기본 화면은 `NavRailStandard` width `176`을 사용한다.
- Book만 `NavRailBookCompact` width `112`, icon-over-label로 paper 면적을 확보한다.
- Book은 open 2 pages/4 photo entries/11 labels를 보여 준다.
- Pick/Place는 photo와 controls를 나누고, Colors는 두 열의 strip 목록, Settings는 목록과 안내를 나눈다. Phone 화면을 단순 확대하지 않는다.

### Tablet landscape `1194×834`

Book 대표 adaptive frame을 만든다. Compact 112 rail + open two-page spread를 유지하고, portrait 요소 수를 늘리는 대신 4 entries/11 labels의 관계와 page gutter를 재배치한다.

## 7. Main 17 pairs — 34 static screens

각 항목은 `390×844 phone`과 `834×1194 tablet portrait` 한 쌍이다. 현재 `.pen`의 route형 숫자 frame 이름은 유지할 수 있으며, 아래 번호는 요구 묶음 번호다.

### 01. Book

- 시작 화면. Phone 2 entries/6 labels, tablet open 2 pages/4 entries/11 labels.
- Layered paper, 48px MonthHeader, edge month tabs, Diary/Colors, settings 진입을 포함한다.
- 날짜·photo·memo·labels가 한 기록으로 읽혀야 하며 일반 feed card처럼 분리하지 않는다.

### 02. Empty

- 빈 Book도 page stack을 유지한다.
- `눈길이 머문 색으로 첫 페이지를 채워보세요`와 촬영·사진 가져오기 진입.
- 읽기 실패는 Empty와 섞지 않고 `03 States`에서 따로 표현한다.

### 03. Detail

- 선택 photo, 채집색/기준색, labels, 날짜, memo, `편집`과 `사진 기록 삭제` 진입.
- 0색과 missing photo는 별도 main/state에서 다루며 Detail에는 저장된 정상 기록을 보여 준다.
- Tablet은 176 rail + 사진과 색·메모 inspector.

### 04. Find

- Camera preview, custom shutter, gallery 진입, 짧은 안내.
- 실시간 색 수치·점수·판정은 없다.
- Tablet은 176 rail 뒤에서 preview와 capture controls를 분리한다.

### 05. Pick

- Photo marker, 채집색, 3~5개 후보, 선택 기준색을 한 흐름으로 보여 준다.
- 채집색과 선택색은 동시에 보이며 similarity percentage는 없다.
- 안내는 `마음에 드는 색을 골라보세요`, 다음 단계 action은 `붙일 위치 정하기`다. 이 action 자체를 저장 완료처럼 표현하지 않는다.
- Duplicate는 기존 label 강조, 5색에서는 추가 선택을 비활성화하고 이유를 적는다.

### 06. Place

- Compact Color Index label을 photo/page edge에 배치하고 primary action은 `여기에 붙이기`.
- 첫 붙이기가 photo+첫 색 저장이다. 추가 label도 붙일 때마다 저장한다.
- `최종 저장`, photo 단위 `완료` button은 없다. 저장 실패 시 이미 붙은 labels는 유지한다.

### 07. Colors

- 큰 tile 대신 dense `ColorStrip` 목록을 사용한다.
- Heading은 `모아 둔 색`을 사용한다.
- 각 strip은 기준색 band + 흰 name end + 연결 photo 수로 구성한다.
- Tablet portrait의 현재 화면은 176 rail + **2개 strip columns**다. 선택 detail은 이 화면에 없고 별도 Color Detail pair에서 보여 준다.

### 08. Color Detail

- 기준색 strip/header와 연결 photos를 보여 준다. 현재 정적 화면에는 photo별 채집색 swatch를 따로 그리지 않았다. 실제 구현에서 색 상세를 열면 보존된 채집색을 확인할 수 있어야 한다.
- 연결 photo 없음과 조회 실패를 구분한다.
- Tablet은 176 rail + 선택색 정보와 연결된 사진 목록.

### 09. Ideas

- 관찰 문장과 `색 찾으러 가기`. 완료, score, reward, streak는 없다.
- Empty일 때도 자유로운 Find 진입을 유지한다.
- Tablet은 176 rail + 세 개의 관찰 제안 카드.

### 10. Settings

- `언어`, `백업과 복원`, `앱 정보`만 둔다.
- Account, server, sync, storage optimization 설정은 없다.
- Tablet은 176 rail + settings list/detail.

### 11. Language

- `시스템 설정`, `한국어`, `English` 선택과 현재 상태.
- 변경 즉시 적용되는 상태를 그리되 실제 localization 동작이 검증됐다고 표시하지 않는다.

### 12. Backup

- 전체 Book을 하나의 backup 파일로 만드는 화면과 processing/result 상태.
- 부분 선택, gallery original 선택, gallery relink는 없다.
- 외부 저장·공유가 취소되거나 실패하면 success로 표시하지 않는다.

### 13. Restore

- 파일 선택, 전체 검증, 가져오기, 결과를 보여 준다.
- 현재 Book에 없는 photo records만 추가한다. 같은 ID는 photo·색·label 위치·날짜·memo 전체를 현재 기기 값으로 유지하고 건너뛴다.
- 결과는 `추가됨 / 건너뜀`으로 알린다. 손상·미지원·사진 누락·공간 부족이면 기존 Book을 보존하고 부분 성공으로 끝내지 않는다.
- 제품 copy에는 `merge` 대신 `가져오기`, `추가됨`, `건너뜀`을 쓴다.

### 14. Edit

- 날짜, memo, Color Index 위치·변경·떼어내기, photo record 삭제 진입.
- 편집 조작 완료 시 저장하며 별도 최종 save가 없다.
- 마지막 label을 떼어도 photo record와 stored photo는 유지한다.

### 15. Permission

- Camera: 요청 전, 허용, 거부, 설정 열기, 사용 불가.
- Photo picker: 바로 선택 가능, 접근 요청이 필요한 경우, 거부, 취소, 가져오기 실패.
- OS picker 자체는 다시 디자인하지 않는다. 취소는 오류가 아니며 기존 Book을 변경하지 않는다.

### 16. Saved

- 첫 label 부착 직후의 저장 완료 screen pair다.
- `Book에 저장했어요`와 `다른 색도 같은 사진에 붙여 보세요.`를 text로 보여 준다.
- `다른 색 붙이기`와 `Book 열기`는 다음 이동이며 별도 최종 저장이 아니다.

### 17. Zero Color

- 마지막 label을 떼어낸 뒤에도 photo, 날짜, memo가 남은 screen pair다.
- `붙인 색이 없어요`와 `색 붙이기`를 제공한다.
- Photo record 전체 삭제와 혼동시키지 않는다.

## 8. Four system/state boards와 extras

### `00 Foundations`

현재 token, typography, spacing, shape, motion annotation, adaptive canvas 목록을 보여 준다.

### `01 Components`

Reusable components와 variants를 보여 준다. Book label과 Colors strip의 새 compact direction을 정본으로 삼는다.

### `02 Patterns`

Layered Book entry, raw-vs-selected color, attach-save, 삭제 확인 등 반복되는 기록 pattern을 보여 준다.

### `03 States` — 12 cards

1. Camera 접근 꺼짐.
2. 미부착 선택이 있는 이탈 확인.
3. 동일 기준색 duplicate.
4. 5색 limit.
5. Color Index 저장 실패.
6. Photo record 삭제 확인.
7. Backup 생성 실패.
8. Restore 파일 검증 실패.
9. Restore 성공: 추가됨/건너뜀.
10. 색 분석 중.
11. 색 분석 실패.
12. Photo file missing.

각 card는 `상태 / 사용자 문구 / 보존되는 기록 / 다음 action`을 보여 준다. Empty, zero-color, missing-photo, read failure를 같은 상태로 취급하지 않는다.

### Extra screens

- `360×800 Pick`: 3 candidates, text wrapping, 48px actions를 보는 compact 대표 화면.
- `320×800 Pick`(`rvPRh`): 가장 좁은 Pick의 clipping·wrapping 확인 화면.
- `390×844 English Pick`: `Choose a color`, `From your photo`, `Color for your index`, `Choose a shade you like`. **대표 Pick 한 화면만 영어로 확인한 것이며 영어 전체 앱 검증이 아니다.**
- `1194×834 Book`: compact 112 rail, open two pages, 4 entries/11 labels, 48px month header.

## 9. V1 정책 guardrails

- 사용자가 후보 중 기준색을 고른다. 앱은 정답·성공 점수를 강제하지 않는다.
- 한 photo에 서로 다른 기준색 최대 5개. Duplicate는 새 기록을 만들거나 채집색을 덮어쓰지 않는다.
- Color Index를 붙일 때마다 저장한다. 후속 저장 실패가 앞서 저장한 기록을 지우지 않는다.
- 첫 붙이기 전 이탈은 확인 후 폐기하며 강제 종료 draft 복구는 없다.
- 저장된 photo는 gallery original과 분리된 앱 보관 사본을 사용한다. Original 삭제·수정·권한 철회 뒤에도 기존 Book은 gallery relink를 요구하지 않는다.
- 마지막 label 제거 후에도 zero-color photo record를 유지한다. Photo record 전체 삭제는 확인 후 처리하고 휴지통은 없다.
- Ideas는 선택적 관찰 제안이며 완료·보상·사용 제한이 없다.
- Backup은 전체 기록만 포함한다. Restore는 새 photo records만 추가하고 same-ID 현재 기록은 전체 유지한다.
- Restore 검증·쓰기 실패는 기존 Book을 훼손하거나 불완전한 결과를 완료로 표시하지 않는다.
- 언어 설정은 복원하지 않으며 현재 기기 설정을 유지한다.
- 기술 상태를 제품 copy로 노출하지 않는다.

## 10. 원본 HTML reference URL mapping

아래는 `docs/chroma_note_handoff_package/chroma_note_project_handoff.html`에 이미 포함된 URL만 정리한 것이다. 새 competitor research나 비교 평가는 하지 않는다.

| 원본 URL | 참고할 개념 | 복제하지 않을 것 |
|---|---|---|
| [Fan deck source](https://tecwoodoutdoorfloor.com/blog/mau-pantone-la-gi.html) · [image](https://tecwoodoutdoorfloor.com/upload/images/Blog/bang-mau-pentone.jpg) | 한 축에 모인 색 견본, 조밀한 color index book의 물성 | Pantone 브랜드, 제품 형태, 명칭·번호 체계 |
| [Pastel index source](https://shop.mochithings.com/products/98805) · [image](https://assets-production.mochi.media/products/98805/photos/square_thumbnail_215934-pastel-index-sticky-note-5c6273.jpg) | Page에 여러 index가 겹쳐 붙는 밀도 | 상품 layout, pastel 조합, 포장·branding |
| [Planner tabs source](https://plannersavenue.com/collections/index-tabs-page-flags) · [image](https://plannersavenue.com/cdn/shop/collections/Index_Tabs_and_Page_Flags.png?v=1727742828) | Page edge의 month/color tabs와 쌓인 종이 hint | Tab 상품 모양과 색 배열의 직접 복제 |
| [Washi swatch source](https://www.archerandolive.com/blogs/news/how-to-create-a-washi-tape-sample-book) · [image](https://cdn.shopify.com/s/files/1/1201/4358/files/Image_2_2cce2808-5491-4250-a592-d3a23e994582.jpg?v=1655902505) | Photo·색·짧은 memo가 한 page 결과물이 되는 감성 | 장식 pattern, tape artwork, 특정 page composition |
| [Color Collect source](https://colorcollect.cc/) · [capture image](https://is1-ssl.mzstatic.com/image/thumb/Purple124/v4/b2/5b/09/b25b0942-5e55-6615-3a3d-fad8e7087c20/pr_source.jpg/471x1024.webp) · [gallery image](https://is1-ssl.mzstatic.com/image/thumb/Purple114/v4/6e/6d/05/6e6d05c7-d3a3-6d1b-f87a-580eb71686be/pr_source.jpg/471x1024.webp) | 현실 photo에서 색을 고르고 photo와 색을 함께 찾는 기능 관계 | 앱 chrome, palette card, navigation, screen composition |
| [Color Hunt App Store](https://apps.apple.com/us/app/color-hunt-photo-scrapbook/id6791556079) | 원본 HTML에 남은 기능 맥락 link | UI·게임 loop·branding을 디자인 근거로 사용하지 않음 |

원본 HTML의 Color Collect 공유 image `https://is1-ssl.mzstatic.com/image/thumb/Purple124/v4/a4/9f/4a/a49f4a1c-e1b9-3385-1c3d-88a7c617f5c2/pr_source.jpg/471x1024.webp`는 V1 제외 기능인 공유용이므로 이번 화면 제작에 사용하지 않는다.

## 11. 정적 디자인 QA와 현재 확인 범위

아래는 구현 시에도 유지할 체크리스트다. 실제 수행한 검증과 승인 범위는 [인터페이스 검토](INTERFACE_REVIEW.md)를 따른다.

- [ ] 17 main 항목에 phone/tablet pair가 모두 있어 34 screens다.
- [ ] Extras 4개를 더해 38 screen frames이며 system/state boards는 별도 4개다.
- [ ] `03 States`에 위 12 state cards가 있다.
- [ ] Book은 phone 2 entries/6 labels, tablet 2 pages/4 entries/11 labels다.
- [ ] Layered paper, 48px MonthHeader, edge month tabs가 보인다.
- [ ] Tablet은 기본 176 rail, Book만 112 icon-over-label rail이다.
- [ ] Colors는 큰 tile 없이 dense strips + white name ends다.
- [ ] Color Index는 compact, radius `[1,3,3,1]`, 48px hit area이며 존재하지 않는 3px border를 전제하지 않는다.
- [ ] Segment touch height가 48px다.
- [ ] 화면 text 최소값은 12px이고 한국어 heading은 `Noto Sans KR`다.
- [ ] Foundation 값이 현재 `.pen` token과 일치한다.
- [ ] 채집색/선택색, duplicate/5색 제한, zero-color/missing photo가 구분된다.
- [ ] Attach-save, no final save, delete confirm, draft discard 정책이 화면과 state board에 반영됐다.
- [ ] Backup 전체, restore add-only/same-ID whole skip, no partial, no gallery relink가 반영됐다.
- [ ] Camera/picker 권한과 주요 async failure state가 있다.
- [ ] 대표 영어 Pick만 확인 범위로 표시하고 영어 전체 앱·모든 font scale 검증을 주장하지 않는다.
- [ ] 제품 copy에 기술어·점수·게임화 표현이 없다.
- [ ] 정적 산출물을 실제 interaction·접근성·runtime 검증 완료로 표시하지 않았다.

최근 전체 수정 뒤 main CLI의 global expanded-reference clipping check는 `0`이다. 이는 정적 `.pen` clipping 검사 결과이며 실제 앱 layout·interaction 검증을 뜻하지 않는다.
