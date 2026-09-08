# 인터페이스 검토 — 2026-09-07

## 범위와 적용 기준

대상은 `design/chroma-note.pen`의 38개 화면과 4개 시스템 보드다. `better-interface`를 기준으로 accessibility, colors, layout, typography, writing, UI 여섯 영역을 검토하고 `make-interfaces-feel-better`의 표면·모션 원칙을 함께 적용했다.

폰 17종·태블릿 세로 17종, 320/360px Pick, 영어 Pick, 태블릿 가로 Book을 포함한다. 실제 Expo 동작, 전체 영어 화면, 글꼴 200% 확대, 화면 읽기, 키보드·포커스·햅틱·모션 성능은 이번 정적 검토 범위가 아니다.

## 발견 사항과 반영

| 심각도 / 영역 | 위치 | 이전 | 수정 후 | 이유 |
|---|---|---|---|---|
| High / colors·accessibility | Foundations `cJSgg`, Cedar 인덱스 | 어두운 글자와 Cedar 배경 대비 2.79:1 | 흰 글자, 5.29:1 | 작은 색 이름도 읽을 수 있어야 한다. |
| Medium / layout | Book `f8bzpF`, `u0aWmC`, `bQD0n` | 월 제목이 텍스트로만 보임 | 184×48 월 선택 버튼과 chevron | 월별 탐색의 조작 위치를 명확히 한다. |
| Medium / typography | Pick·사진 캡션, 한국어 제목 | 일부 11px 글씨, 한국어를 Latin display fallback에 의존 | 최소 12px, 한국어 제목 Noto Sans KR | 작은 화면 가독성과 글꼴 일관성을 높인다. |
| Medium / layout·UI | 화면 헤더 전반 | 동작이 정의되지 않은 더 보기 31개 | 제거, 실제 설정·뒤로·편집 조작 유지 | 결과가 없는 조작을 구현 계약으로 넘기지 않는다. |
| Medium / writing | Pick `Z14Qa`, Place `cVJOb`, Saved `e11F83` | 선택·배치·저장 시점이 모호한 표현 | 붙일 위치 정하기 → 여기에 붙이기 → Book에 저장했어요 | 붙일 때마다 저장하는 계약을 분명히 한다. |
| Medium / writing | Restore `HlPVH`, `LlIYZ`, States `Hftdd` | 동일 기록에서 색·메모만 유지한다고 읽힐 수 있음 | 같은 기록은 건너뛰고 현재 기기 기록을 그대로 유지 | 사진·배치·날짜를 포함한 전체 기록 보존과 일치한다. |
| Medium / writing | States `Hftdd` 사진 파일 오류 | 백업이 동일 ID의 누락 사본을 복구할 것처럼 안내 | 색·날짜·메모 유지 안내, 다시 열기·기록 보기 | 현재 add-only 복원 계약이 제공하지 않는 복구를 약속하지 않는다. |
| Low / UI 표면 | Candidate `DMqfZ` | 외곽 8, 내부 4, padding 8 | 외곽 12 | 중첩 모서리 간격을 일관되게 한다. |
| Low / colors | `muted` token | soft 배경에서 부족한 보조 글자 대비 | #6B655B, soft 위 4.69:1 | 종이 느낌을 유지하면서 가독성을 확보한다. |

그 이전 디자인 수정에서는 Book을 겹친 종이·사진·작은 인덱스로 구성하고, 태블릿은 펼친 두 페이지로 바꿨다. Colors는 넓은 타일 대신 색 띠와 흰 이름표가 이어지는 구성이다. 원본 HTML의 팬덱·포스트잇·페이지 탭·스와치북을 시각적으로 참고했다.

## 검토 후 채택하지 않은 제안

- Book의 작은 인덱스를 모두 큰 버튼으로 확대: 촘촘한 기록물이라는 사용자 요청을 해친다. 구현에서는 보이는 종이 크기와 별개로 48px 조작 영역 및 상세 화면 접근을 제공한다.
- 카메라의 검은 preview band 제거: 실제 카메라 종횡비와 안전한 조작 영역이 결정되기 전 정적 그림만으로 제거하지 않는다.
- 후보 선택에 큰 bounce·축하 효과 추가: 조용한 기록 경험과 맞지 않는다. 150ms 상태 전환·220ms 부착, Reduce Motion 즉시 전환을 구현 기준으로 남긴다.
- 모든 태블릿 화면을 master-detail로 통일: Colors의 두 열 색 띠와 Book의 펼친 페이지는 각각의 탐색 목적을 따른다.

## 검증

| 확인 | 결과와 한계 |
|---|---|
| Pen CLI 0.3.6 저장·재열기 | PASS. 상대 경로 사진을 로딩한 뒤 렌더 가능. |
| 전체 트리 구조 | PASS. 42개 루트, 17 reusable component. |
| 확장된 component reference의 clipping | PASS. `Get(document, visitor, {resolveInstances:true})`에서 disabled 노드를 제외하고 `context.problems` 확인: 0건. |
| 단색 글자 대비 | PASS. 변수 색을 해석하고 가장 가까운 불투명 단색 부모와 비교한 746조합: 실패 0. 일반 글자 4.5:1, 24px 이상 3:1. 사진·알파 합성의 모든 픽셀을 평가한 결과는 아니다. |
| 대표 렌더 확인 | PASS. Book 폰·태블릿·가로, Colors 폰·태블릿, Pick 320/360/영어, 상세·Ideas·설정·백업·복원·상태 보드의 화면 구성을 확인. |
| 원본 보존·문서 검사 | PASS. 원본 4개 SHA-256 일치, 내부 파일 링크 존재, ID·참조·사진 경로 확인. 전체 staged 공백 검사에는 원본에서 보존한 공백 10건이 남으며, 새 작성·수정 파일의 공백 검사는 통과했다. |
| PNG·PDF 내보내기 | PASS. `Export(ids, "png", ..., {scale:1})`, `Export(ids, "pdf", ...)`로 42개 PNG와 PDF 생성. |
| 폰·태블릿 실동작 및 접근성 | NOT RUN. 확대 글씨·화면 읽기·초점·드래그 대안·Reduce Motion·실기기 사진 대비는 Expo 구현 후 검사한다. |
| 촬영·샘플링·저장·백업·복원 | NOT RUN. 화면의 안내와 계약을 검토했으며 기능 구현 증거는 아니다. |

## 판정

**Approve — 정적 디자인 기준으로 구현 착수 가능.** 앱 출시 승인이나 접근성 전체 통과를 뜻하지 않는다. 실제 구현에서는 사진 보관·좌표 변환·저장 실패·복원 검증과 함께 폰·태블릿, 한국어·영어, 접근성 상태를 확인해야 한다.
