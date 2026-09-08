# Chroma Note — Project Handoff

## 0. 문서 목적

이 문서는 **Chroma Note 프로젝트를 Codex 또는 다른 개발 AI/개발자에게 넘기기 위한 핸드오프 문서**다.

단순 기능 목록이 아니라 다음을 모두 전달하는 것을 목표로 한다.

- 아이디어가 어떤 출발점에서 시작됐는지
- 어떤 논의와 판단을 거치며 방향이 바뀌었는지
- 어떤 아이디어가 폐기되거나 후순위로 밀렸는지
- 현재 확정된 제품 컨셉이 무엇인지
- V1에서 무엇을 만들고 무엇을 만들지 않을지
- UI/UX와 기술 구현에서 반드시 지켜야 할 원칙
- 이후 구현 과정에서 Codex가 임의로 원래의 게임 중심 기획으로 되돌리지 않도록 하기 위한 결정 근거

이 문서는 현재 프로젝트의 기준 문서다.
특별한 이유가 없는 한 이후 구현은 이 문서를 우선 기준으로 한다.

---

# 1. 프로젝트 기본 정보

## 프로젝트명

**Chroma Note**

## 한 줄 정의

> 일상에서 발견한 색을 사진과 컬러 인덱스로 기록하는 컬러 다이어리.

## 영문 카피 후보

- **Collect the colors you notice.**
- **Colors from everyday moments.**
- **A color diary made from everyday moments.**

현재 제품 성격에는 `Collect the colors you notice.`가 가장 잘 맞는다.

---

# 2. 아이디어의 출발점

초기 목표는 다음 조건을 만족하는 React Native + Expo 모바일 앱 아이디어를 찾는 것이었다.

- 구현이 너무 복잡하지 않을 것
- 흔한 CRUD 앱이나 커뮤니티 앱이 아닐 것
- 짧게 설명해도 “특이하다”는 느낌이 있을 것
- 스마트폰의 카메라, 햅틱, 알림 같은 모바일 특성을 활용할 것
- 서버 없이도 MVP가 가능한 방향이면 좋을 것

여러 후보 중 초기에 가장 유망했던 아이디어는 **Color Hunter**였다.

초기 Color Hunter는 다음 구조였다.

```text
오늘의 색 제시
→ 현실에서 비슷한 색 찾기
→ 카메라 촬영
→ 색 유사도 계산
→ 점수
→ 하루 컬렉션 / 스트릭
```

예:

```text
TODAY'S COLOR

#E86A5A
Coral Red

오늘 이 색을 찾아보세요.
```

촬영 후:

```text
Target
#E86A5A

Captured
#E56D60

MATCH
94%
```

이 단계에서는 다음 요소가 중심이었다.

- Daily Color
- 색 유사도 점수
- Streak
- ColorDex
- 희귀도
- XP
- Combo
- Daily/Weekly Challenge
- Target Color Hunt
- 현실 세계에서 색을 찾는 scavenger hunt 성격

---

# 3. 유사 서비스 조사 후의 판단

비슷한 레퍼런스를 조사하면서 다음 유형의 앱들이 이미 존재한다는 점을 확인했다.

- Daily Color를 제시하고 현실에서 찾는 앱
- 카메라로 실시간 색 근접도를 보여주는 앱
- 색을 수집하고 streak를 제공하는 앱
- Palette Hunt
- 사진 기반 컬러 스크랩북
- 색 유사도를 게임 점수로 사용하는 앱

따라서 단순히:

> “오늘의 색을 찾아 촬영하고 점수를 받는 앱”

으로 가면 차별화가 약하다는 판단이 나왔다.

이후 기획을 **단순 Color Hunt → 색 수집/기록 경험** 쪽으로 확장하기 시작했다.

---

# 4. 첫 번째 큰 방향 전환 — 하루 1회 제약 제거

초기에는 하루에 하나의 색만 찾도록 제한하는 구조가 있었다.

하지만 다음 문제를 확인했다.

> 하루에 한 번밖에 못 쓰는 앱은 쉽게 잊힌다.

따라서 **Daily 1회 사용 제약은 제거**하기로 했다.

## 변경 전

```text
오늘의 색
→ 한 번 수행
→ 오늘 사용 종료
```

## 변경 후

```text
원할 때 언제든 앱 실행
→ 색 발견
→ 촬영
→ 색 선택
→ 기록
→ 다시 발견
```

핵심 사용 트리거도 바뀌었다.

### 이전

> “오늘 아직 미션을 안 했다.”

### 현재

> “저 색 예쁜데?”

이 변화는 현재 Chroma Note의 핵심 방향을 결정한 중요한 지점이다.

---

# 5. 두 번째 방향 전환 — 앱이 정답을 판정하지 않는다

초기에는 목표색과 촬영색의 유사도를 계산해:

```text
94% MATCH
SUCCESS
```

처럼 앱이 사용자를 채점하는 구조였다.

그러나 현실의 색은 다음 요소의 영향을 많이 받는다.

- 조명
- 그림자
- 반사광
- 카메라 센서
- White Balance
- Exposure
- 촬영 위치

따라서 앱이 하나의 색을 “정답”으로 강제하는 것은 UX와 기술 양쪽에서 불필요하게 딱딱해진다.

현재 방향은 다음과 같다.

## 앱의 역할

> 정답 판정기가 아니라 **색 추천 도구**.

예:

```text
이 색과 가까워요

● Coral Red        94%
● Terra Cotta      89%
● Salmon           86%
● Burnt Sienna     78%
```

최종 선택은 사용자가 한다.

즉:

```text
카메라 / 이미지 분석
→ 유사 색 후보 제시
→ 사용자가 의미 있는 색을 선택
```

이 원칙은 유지한다.

---

# 6. 세 번째 방향 전환 — 사진에서 색을 “채집”한다

단순 촬영 후 자동 분석으로 끝내지 않고, 사용자가 사진 안에서 원하는 위치를 직접 선택하는 방향으로 발전했다.

## 기본 흐름

```text
사진 촬영
→ 촬영 결과 표시
→ 사용자가 사진의 특정 지점 터치
→ 해당 지점 주변 색 샘플링
→ 유사 색 후보 추천
→ 사용자 선택
```

예:

```text
┌─────────────────────────┐
│                         │
│       🪴                │
│          ●              │
│                         │
└─────────────────────────┘

        ● #587A52

        Olive Green
```

다른 지점을 선택하면 다른 색을 얻을 수 있다.

이후 더 발전해 **한 장의 사진에서 여러 색을 채집할 수 있도록** 한다.

예:

```text
              CREAM ━━━━━
┌──────────────────────┐
│      ☕              │
│                      │━━━━ BROWN
│          🪴          │
│                      │━━━━ MOSS
└──────────────────────┘
```

이 기능은 현재 Chroma Note의 중요한 차별 요소다.

---

# 7. 초기 게임화 방향과 폐기된 요소

한때 ColorDex를 중심으로 다음 게임 시스템을 검토했다.

- 256색 ColorDex
- 희귀도
- Common / Rare / Epic / Legendary
- XP
- Level
- Combo
- Personal Best
- Daily Hunt
- Weekly Quest
- Rainbow Set
- Gradient Hunt
- Speed Hunt
- Leaderboard

그러나 UI/UX를 구체화하면서 이러한 요소들이 제품을 다음처럼 보이게 할 위험이 있다는 판단이 나왔다.

> 색상 측정 도구 + 모바일 RPG UI

현재 제품의 목표 감성과 맞지 않는다.

따라서 아래 요소는 제거하거나 후순위로 밀렸다.

| 요소 | 현재 결정 |
|---|---|
| XP | 제거 |
| Level | 제거 |
| Rarity | 제거 또는 매우 약한 메타 정보 |
| Combo | 제거 |
| Leaderboard | 제거 |
| Daily 1회 제한 | 제거 |
| ColorDex 명칭 | 사용자 UI에서 제거 |
| 강한 Match 성공/실패 판정 | 제거 |
| Streak 중심 리텐션 | 제거 |
| Personal Best | 기본 기능에서는 제거 또는 Target 모드 보조 기능 |
| Challenge | `Ideas` 형태로 부드럽게 변경 |

---

# 8. UI/UX에 대한 핵심 문제 인식

이 앱은 기능만 구현하면 쉽게 다음과 같이 딱딱해질 수 있다.

```text
COLORDEX
137 / 256

Similarity 96.7%
Rarity ★★★
XP +120

DAILY QUEST
```

이런 UI는 현재 제품 방향과 맞지 않는다.

이 앱에서 중요한 것은:

> **기능은 디지털이지만, 경험은 아날로그 문구/다이어리처럼 느껴져야 한다.**

UI가 딱딱하면 이 앱의 매력이 크게 떨어진다.

---

# 9. 최종 비주얼 컨셉

현재 가장 중요한 시각적 레퍼런스는 다음 세 가지다.

## 9.1 컬러 팬덱 / 색상 견본집

Pantone Formula Guide 같은:

- 색 견본 카드
- 팬 형태로 펼쳐지는 색
- 색 하나를 꺼내 보는 느낌
- 실제 사물 옆에 견본을 대보는 경험

단, 특정 브랜드를 직접 모방하는 것이 아니라 **컬러 팬덱의 물리적 경험**을 차용한다.

## 9.2 컬러 인덱스 포스트잇

다이어리 가장자리에 붙어 있는:

- 색색의 인덱스
- 페이지 밖으로 살짝 튀어나오는 탭
- 분류와 장식이 동시에 되는 문구
- 색이 많아질수록 책이 알록달록해지는 경험

## 9.3 다꾸 / 스크랩북

- 사진
- 색 인덱스
- 마스킹 테이프
- 날짜
- 약간의 불규칙한 배치
- 종이 질감
- 작은 메모
- 스와치

이 세 가지를 조합한다.

```text
Color Fan Deck
+
Index Sticky Notes
+
Diary / Scrapbook
=
Chroma Note
```

---

# 10. Chroma Note의 현재 제품 정의

## 핵심 컨셉

> 주변에서 발견한 색을 사진으로 남기고, 사진 속에서 원하는 색을 골라 컬러 인덱스처럼 붙이며 나만의 컬러 다이어리를 만든다.

중요한 것은 “정확한 색을 측정하는 도구”가 아니라는 점이다.

또한 “색을 사냥해서 도감을 완성하는 게임”도 아니다.

현재의 제품 정체성은:

> **색을 발견하고, 골라서, 기록하고, 쌓아가는 감성 컬러 다이어리**

다.

---

# 11. 핵심 사용자 경험

현재 권장하는 전체 흐름:

```text
발견
 ↓
사진 촬영
 ↓
사진에서 원하는 색 영역 터치
 ↓
색상 샘플링
 ↓
유사 색 후보 추천
 ↓
사용자가 색 선택
 ↓
Color Index 생성
 ↓
사진에 인덱스 붙이기
 ↓
Book에 저장
```

이 흐름이 제품의 가장 중요한 핵심 루프다.

---

# 12. 앱 구조

현재 하단 내비게이션은 3개 정도로 단순화한다.

```text
Find      Book      Ideas
```

---

## 12.1 Find

색을 발견하고 기록하는 기본 진입점.

기본 흐름:

```text
Camera
 ↓
Capture
 ↓
Photo
 ↓
Tap color
 ↓
Recommend colors
 ↓
Select color
 ↓
Attach Color Index
 ↓
Save to Book
```

---

## 12.2 Book

사용자의 컬러 기록 결과물.

Book에는 여러 보기 방식이 있을 수 있다.

### Diary

날짜 기준.

예:

```text
SEP 07

colors I noticed today


 [photo]━━ CORAL

      MOSS ━━[photo]

 [photo]
    ┗ SKY
```

### Colors

색상 기준.

```text
● ● ● ● ● ●
● ● ● ● ● ●
● ● ● ● ● ●
● ● ● ● ● ●
```

Hue 기준으로 자연스럽게 정렬할 수 있다.

### Swatches

수집한 색을 컬러 팬덱 / 견본집처럼 보는 모드.

---

## 12.3 Ideas

게임형 Daily Quest가 아니라 **관찰을 유도하는 제안**.

예:

```text
Try noticing

a blue
that isn't the sky.
```

또는:

```text
Find three greens
that don't look alike.
```

또는:

```text
Find a color
you don't know the name of.
```

중요:

- 사용 횟수를 제한하지 않는다.
- 완료 여부가 앱 사용의 필수 조건이 아니다.
- XP를 주는 퀘스트처럼 보이지 않는다.
- 앱을 다시 열게 만드는 작은 영감 역할만 한다.

---

# 13. Color Index

Chroma Note에서 가장 중요한 시각적 오브젝트 중 하나.

사진에서 색을 선택하면 작은 컬러 인덱스가 만들어진다.

예:

```text
┌──────────────────────┐
│                      │
│        PHOTO         │━━━━ CORAL
│                      │
└──────────────────────┘
```

인덱스는:

- 사진 옆
- 사진 아래
- 페이지 가장자리

등에 붙을 수 있다.

## 중요한 UX 원칙

일반적인 `Save` 버튼을 강조하지 않는다.

가능하다면:

> **인덱스를 붙이는 행위 = 저장**

이라는 메타포를 사용한다.

즉 물리적인 스티커를 붙이는 느낌을 디지털 저장 행동으로 치환한다.

---

# 14. 한 사진에 여러 Color Index

한 장의 사진에서 여러 색을 선택할 수 있다.

예:

```text
              CREAM ━━━━━
┌──────────────────────┐
│      ☕              │
│                      │━━━━ BROWN
│          🪴          │
│                      │━━━━ MOSS
└──────────────────────┘
```

각 색은 독립적인 기록이면서 동시에 하나의 사진에 연결된다.

데이터 모델 설계 시:

```text
Photo
 ├─ ColorSample 1
 ├─ ColorSample 2
 └─ ColorSample 3
```

형태를 고려한다.

---

# 15. 카메라 UX — V1 원칙

카메라 커스텀과 관련해 중요한 기술적 결정을 내렸다.

## V1에서는 실시간 카메라 프레임 색 분석을 하지 않는다.

즉 아래 기능은 V1에서 제외한다.

```text
카메라 이동
→ 실시간 pixel buffer 분석
→ 실시간 RGB
→ 실시간 Delta E
→ 72%, 81%, 93% 계속 변화
```

이 방식은 Expo Managed 영역에서 난도가 크게 올라가고, 네이티브 frame processor까지 필요할 가능성이 높다.

또한 현재의 다이어리 감성에도 반드시 필요한 기능은 아니다.

---

# 16. 카메라에서 가능한 커스텀 UI

카메라 위에 React Native View를 overlay하는 수준은 적극 사용 가능하다.

예:

```text
┌────────────────────────┐
│                        │
│        CAMERA          │
│                        │
│          ○             │
│                        │
│    [ selected swatch ] │
│                        │
│           ◯            │
└────────────────────────┘
```

가능한 요소:

- 커스텀 셔터
- 중앙 가이드
- 견본 Color Swatch
- 안내 텍스트
- 드래그 가능한 컬러칩
- 촬영 후 애니메이션

중요:

> 카메라 프리뷰를 직접 복잡하게 뜯어고치는 것이 아니라, 카메라 프리뷰 위에 RN UI를 배치한다.

---

# 17. 촬영 후 색 추출

V1의 실제 색 분석은 촬영 후 수행한다.

권장 흐름:

```text
takePicture
 ↓
촬영 이미지
 ↓
사용자 touch position
 ↓
화면 좌표 → 이미지 좌표 변환
 ↓
작은 영역 sample/crop
 ↓
RGB 계산
 ↓
색 비교
```

한 픽셀보다는 작은 영역의 평균 또는 robust average를 사용하는 것이 좋다.

이유:

- 센서 노이즈
- jpeg artifact
- 작은 highlight
- edge pixel

영향을 줄일 수 있기 때문이다.

---

# 18. 색 비교 방식

단순 RGB Euclidean distance는 피한다.

권장:

```text
RGB
 ↓
sRGB linearization
 ↓
XYZ
 ↓
CIELAB
 ↓
Delta E
```

Delta E는 색 후보 추천에 사용한다.

그러나 사용자 UI에서는 반드시 숫자를 전면에 노출할 필요는 없다.

예:

```text
very close
close
a little warmer
a little softer
```

필요한 경우 상세 화면에서:

```text
92% alike
```

정도로 노출할 수 있다.

---

# 19. 색 이름 추천

사용자가 특정 색을 찍으면 하나의 결과로 고정하지 않는다.

예:

```text
Captured
#D96B62
```

추천:

```text
● Coral
● Clay
● Salmon
● Sienna
```

사용자가 최종 선택한다.

이 원칙을 구현에서 바꾸지 않는다.

---

# 20. Swatch / Fan Deck

수집한 색 또는 탐색 가능한 색을 실제 컬러 팬덱 같은 인터랙션으로 보여줄 수 있다.

개념 예:

```text
          ┌───────────┐
         / Sky       /
        /───────────/
       / Azure     /
      /───────────/
     / Cerulean  /
    /───────────/
   / Cobalt    /
  └───────────┘
       ●
```

이 UI는 브랜드 경험을 강화하는 기능이다.

하지만 V1 MVP 구현이 무거워지면 단순 Swatch 리스트 / 카드 구조로 먼저 구현하고 팬 애니메이션은 이후 단계로 미뤄도 된다.

---

# 21. Target Color 기능

초기 Color Hunt의 흔적 중 하나로 유지할 수 있지만 **보조 기능**이다.

예:

```text
Try finding

   COBALT

 ███████████

somewhere around you.
```

목표색을 미리 선택한 뒤 실제 환경에서 찾아보는 모드.

그러나 기본 사용 흐름은:

```text
현실에서 먼저 발견
→ 촬영
→ 색 선택
```

이다.

Target 모드가 메인 내비게이션이 되어서는 안 된다.

---

# 22. Monthly Palette

사용자가 일정 기간 Chroma Note를 사용하면 기록 자체가 자연스럽게 시각적 결과물이 된다.

예:

```text
MY
SEPTEMBER
2026


█ █ █ █ █ █
█ █ █ █ █ █
█ █ █ █ █ █
█ █ █ █ █ █


27 colors
I noticed this month.
```

또는 사진을 섞은 다꾸형 결과물도 가능하다.

Monthly Palette는:

- 회고
- 공유
- 장기 사용 동기

역할을 할 수 있다.

V1 핵심은 아니지만 높은 우선순위의 후속 기능이다.

---

# 23. 시각 디자인 원칙

## 기본 배경

- 따뜻한 off-white
- pure white보다 종이 같은 느낌
- 과한 texture는 금지
- texture가 필요하면 매우 약하게

## UI 자체

- 무채색 중심
- 사용자가 수집한 색이 화면의 주인공
- 과한 gradient / rainbow UI 금지
- 게임 UI처럼 보이지 않게 한다

## Typography

- 얇고 깔끔한 본문
- 적절한 serif 또는 handwritten accent는 선택 가능
- 손글씨 폰트를 전체 UI에 사용하지 않는다
- 날짜 / 작은 메모 등에만 제한적으로 사용할 수 있다

## Layout

완벽한 grid만 사용하지 않는다.

의도적으로:

- 1~3도 정도의 작은 회전
- 살짝 어긋난 카드
- 사진 옆으로 나온 index
- 마스킹 테이프
- 종이 여백

등을 활용할 수 있다.

단, 실제 usability를 해칠 정도로 랜덤하게 만들지는 않는다.

---

# 24. 디지털 UI를 물리적 문구 메타포로 변환

Chroma Note의 핵심 디자인 언어.

| 일반 앱 UI | Chroma Note |
|---|---|
| Card | 종이 조각 |
| Tab | 컬러 인덱스 |
| Category | 색 인덱스 |
| Save | 붙이기 |
| Delete | 떼어내기 |
| Collection | Book |
| History | Diary |
| Color picker | Swatch |
| Filter | Index / Color tabs |
| Share | 페이지 / Palette |
| Target | 견본 골라보기 |

이 원칙은 UI를 설계할 때 적극 활용한다.

---

# 25. 브랜드명 결정 과정

초기에 검토했던 이름:

- Color Hunter
- ColorDex
- HueDex
- Hue Index
- Color Index
- Hue Note
- Swatch Book
- Palette Note

그러나 다음 문제가 있었다.

### Color Hunter / HueDex

- 게임 느낌이 너무 강함
- 현재 제품 방향과 불일치

### Hue Index / Color Index

- 기능 의미는 좋음
- 너무 일반 명사 조합
- 앱스토어에서 브랜드 구분력이 약할 가능성

최종적으로:

# **Chroma Note**

를 선택했다.

이후 프로젝트 내 명칭은 Chroma Note로 통일한다.

`Color Index`는 앱 이름이 아니라 내부 시각 오브젝트 명칭으로 활용한다.

---

# 26. 용어 정의

현재 권장 용어:

| 개념 | 사용자 노출 명칭 |
|---|---|
| 앱 | Chroma Note |
| 촬영/색 발견 | Find |
| 전체 기록 | Book |
| 날짜별 기록 | Diary |
| 색상별 보기 | Colors |
| 색 견본 | Swatch |
| 사진에 붙이는 색 라벨 | Color Index |
| 관찰 아이디어 | Ideas |
| 월간 색 모음 | Monthly Palette |

초기의 `ColorDex`, `Quest`, `XP`, `Hunter Rank` 등의 표현은 사용하지 않는다.

---

# 27. V1 권장 화면

## 27.1 Find

- CameraView
- Custom shutter
- Gallery import 여부는 선택
- Capture

## 27.2 Photo Color Pick

- 촬영 이미지
- 사용자 tap
- 샘플 위치 marker
- 후보 색 swatches
- 여러 색 추가 가능

## 27.3 Index Placement

- 선택한 색 인덱스 생성
- 사진 주위에 배치
- 간단한 위치 조정
- 필요하면 삭제 / 변경

## 27.4 Book

- 날짜별 Diary
- 날짜별 여러 사진
- 각 사진의 Color Index

## 27.5 Colors

- 수집된 색 목록
- hue 정렬
- 색을 선택하면 관련 사진 확인

## 27.6 Ideas

- 관찰 문장
- 선택적으로 Target color
- 완료 강제 없음

---

# 28. V1 기술 스택

기본 기준:

- React Native
- Expo
- TypeScript

권장 패키지 후보:

```text
expo-camera
expo-image-manipulator
expo-haptics
expo-sqlite
expo-sharing
react-native-reanimated
```

필요 시 패키지는 최신 Expo SDK 호환성을 확인해서 선택한다.

---

# 29. 데이터 저장

V1은 **Local-first**로 간다.

서버:

- 없음

계정:

- 없음

로그인:

- 없음

기본 저장소:

- SQLite

사진 파일은 로컬 파일 시스템에 저장하고 SQLite에는 메타데이터 및 경로를 저장하는 구조를 고려한다.

---

# 30. 권장 데이터 모델 초안

예시이며 구현 시 조정 가능하다.

```text
PhotoEntry
- id
- imageUri
- createdAt
- width
- height
- note?
- layoutStyle?

ColorSample
- id
- photoEntryId
- sourceX
- sourceY
- sampledHex
- sampledRgb
- sampledLab
- selectedColorId
- createdAt

ColorReference
- id
- name
- hex
- lab
- family
- order

ColorIndexPlacement
- id
- colorSampleId
- positionX
- positionY
- rotation
- style

Idea
- id
- text
- targetColorId?
- type
```

PhotoEntry 하나에 ColorSample 여러 개를 연결할 수 있어야 한다.

---

# 31. 색 레퍼런스 데이터

앱에는 사용자에게 추천할 **내부 기준 색 목록**이 필요하다.

중요:

특정 상용 색상 시스템의 데이터 또는 이름을 그대로 무단 복제하지 않는다.

자체적인:

- 색 이름
- HEX
- Lab
- family

데이터셋을 구성한다.

초기에는 약 100~300색 정도로 충분하다.

너무 많은 색을 시작부터 넣어 UX를 복잡하게 만들 필요는 없다.

---

# 32. 구현 난이도 관리 원칙

이 프로젝트의 목표는:

> 복잡한 컴퓨터 비전 앱을 만드는 것이 아니라, 구현 난도 대비 감성이 강한 앱을 만드는 것.

따라서 다음 원칙을 따른다.

## V1에서 하지 않는다

- 실시간 frame processor
- 실시간 pixel RGB sampling
- 실시간 object detection
- AI image recognition
- 서버
- 계정
- SNS
- 친구
- 랭킹
- 클라우드 동기화
- 복잡한 자유형 다꾸 에디터
- 완전한 WYSIWYG scrapbook 편집기

---

# 33. 다꾸 편집 기능 범위

완전한 자유형 다꾸 편집기를 만들면 구현 범위가 급격히 커진다.

따라서 V1에서는 제한한다.

권장:

- Color Index 위치 조정
- 2~3개의 페이지 레이아웃
- 작은 회전 정도
- 자동 날짜
- 선택적 마스킹 테이프 decoration

사용자가 모든 오브젝트를 자유롭게 resize/rotate/layer하는 구조는 V1에서 제외한다.

---

# 34. 인터랙션 / 애니메이션

과한 게임 애니메이션 금지.

권장하는 micro interaction:

- 색 선택 시 작은 햅틱
- Color Index가 사진에 “붙는” 애니메이션
- Book 페이지 이동
- Swatch를 꺼내는 느낌
- Index 탭이 살짝 튀어나오는 모션

애니메이션은:

- 빠르고 튀는 게임 UI보다
- 약간의 관성과 물리감
- 종이/스티커 느낌

을 지향한다.

---

# 35. 제품의 리텐션 구조

초기에는 다음을 리텐션으로 생각했다.

```text
Daily challenge
Streak
XP
Collection progress
```

현재는 다르다.

Chroma Note의 핵심 리텐션은:

> **사용할수록 내 Book이 점점 예뻐진다.**

즉:

```text
매일의 실제 경험
→ 사진
→ 색
→ 페이지
→ 나만의 시각 기록
```

이 결과물이 다시 앱을 열게 하는 이유가 되어야 한다.

---

# 36. 가장 중요한 UX 판단

개발 중 기능을 추가할 때 다음 질문을 먼저 한다.

> 이 기능이 사용자를 “색을 측정하게” 만드는가, 아니면 “색을 발견하게” 만드는가?

Chroma Note는 후자를 선택한다.

또한:

> 이 기능이 앱을 게임처럼 보이게 하는가, 아니면 나만의 컬러 다이어리를 만드는 경험을 강화하는가?

후자를 우선한다.

---

# 37. 구현 시 우선순위

## Phase 1 — Core

1. Expo 프로젝트 구성
2. Camera 촬영
3. 촬영 이미지 저장
4. Photo Entry 모델
5. 사진 화면 터치 좌표 처리
6. 색 샘플 추출
7. RGB / Lab 변환
8. 유사 색 추천
9. 사용자 색 선택
10. 한 사진에 여러 색 연결
11. SQLite 저장

## Phase 2 — Chroma Note UX

1. Color Index UI
2. Index placement
3. Book / Diary
4. Colors 보기
5. 기본 Paper / Index visual system
6. Reanimated micro interactions
7. Haptics

## Phase 3 — Product polish

1. Ideas
2. Swatches
3. Monthly Palette
4. Sharing
5. 여러 page layout
6. Target Color mode

## 이후 검토

- Fan Deck 고급 애니메이션
- Widget
- Backup/export
- Cloud sync
- AI 기반 object label
- 실시간 frame color processing

---

# 38. Codex 구현 지침

Codex가 작업을 시작할 때 다음을 지킨다.

## 먼저 확인할 것

- 현재 Expo SDK
- React Native 버전
- 기존 프로젝트 구조
- 기존 package.json
- 사용 중인 navigation 방식
- 상태관리 방식
- SQLite 사용 여부
- 사용자 변경사항

기존 프로젝트가 있다면 새 프레임워크나 라이브러리를 불필요하게 추가하지 않는다.

---

## 변경 원칙

- 작은 단위로 구현한다.
- 기존 사용자 코드를 임의로 덮어쓰지 않는다.
- 디자인 시스템을 초기에 단순하게 만든다.
- 복잡한 abstraction을 먼저 만들지 않는다.
- V1에 필요 없는 서버 구조를 추가하지 않는다.
- 앱이 동작하기 전부터 과도한 architecture를 만들지 않는다.

---

# 39. Codex가 임의로 바꾸면 안 되는 결정

다음 항목은 현재 기획상 의도적인 결정이다.

### 1. 하루 1회 제한 없음

촬영 횟수 제한을 도입하지 않는다.

### 2. 앱이 색 정답을 강제하지 않음

후보를 추천하고 사용자가 선택한다.

### 3. 한 사진에서 여러 색 선택 가능

1 Photo = 1 Color 구조로 제한하지 않는다.

### 4. 실시간 프레임 분석은 V1에서 제외

성능 최적화를 이유로 먼저 네이티브 frame processor를 만드는 방향으로 가지 않는다.

### 5. 게임화 최소화

XP / Level / Rarity / Leaderboard를 임의로 추가하지 않는다.

### 6. Local-first

초기부터 계정/백엔드를 만들지 않는다.

### 7. UI는 도구가 아니라 다이어리

Analytics/dashboard 형태로 만들지 않는다.

### 8. Color Index 메타포 유지

색 라벨은 단순 chip UI가 아니라 앱의 핵심 시각 언어다.

---

# 40. 비기능적 목표

## 성능

- 촬영 후 색 분석은 체감상 즉시 또는 매우 짧게 완료되어야 한다.
- 이미지를 전체 해상도로 JS 처리하지 않도록 주의한다.
- 필요한 영역을 작게 crop/resize 후 분석하는 방식을 우선 검토한다.

## 접근성

- 색만으로 상태를 전달하지 않는다.
- 색 이름 / 텍스트 보조를 제공한다.
- 충분한 contrast를 유지한다.

## 개인정보

V1은 Local-first.

- 사진을 외부 서버로 보내지 않는다.
- AI API를 기본 호출하지 않는다.
- 위치정보는 필수 기능으로 사용하지 않는다.

---

# 41. 현재의 제품 중심 문장

개발 도중 방향이 흔들릴 경우 다음 문장으로 돌아간다.

> **Chroma Note는 일상에서 발견한 색을 사진과 컬러 인덱스로 기록하고, 시간이 지날수록 나만의 컬러 다이어리를 만들어가는 앱이다.**

그리고 제품 경험의 핵심 순서는:

> **발견 → 찍기 → 고르기 → 붙이기 → 쌓이기**

다.

```text
DISCOVER
   ↓
CAPTURE
   ↓
PICK
   ↓
INDEX
   ↓
BOOK
```

---

# 42. 최종 요약

## 시작점

색을 찾아 점수를 얻는 **Color Hunter 게임**.

## 중간 발전

- ColorDex
- 수집
- 유사도
- Target Hunt
- 반복 촬영
- Challenge

## 문제 인식

- 하루 1회 앱은 리텐션이 약함
- 게임 UI는 감성을 해침
- 색 정답 판정은 현실 환경에서 경직됨
- 실시간 카메라 분석은 구현 난도가 불필요하게 높음

## 최종 방향

# Chroma Note

**컬러 팬덱 + 인덱스 포스트잇 + 다이어리/스크랩북의 감성을 결합한 색 기록 앱.**

주변에서 발견한 색을 사진으로 찍고,
사진 속 원하는 색을 직접 골라,
컬러 인덱스로 붙이고,
그 결과가 Book에 계속 쌓인다.

게임 시스템은 제품의 중심이 아니다.

수집률을 올리는 것이 목적이 아니라:

> **내가 지나친 일상의 색을 다시 보게 만드는 것**

이 제품의 핵심 가치다.

---

# 43. 다음 구현 시 첫 번째 목표

Codex가 실제 구현을 시작한다면 첫 번째 milestone은 아래가 적절하다.

```text
Camera 촬영
→ 사진 결과 화면
→ 사진 특정 지점 터치
→ 해당 영역 대표색 추출
→ 유사 색 3~5개 추천
→ 사용자 선택
→ PhotoEntry + ColorSample SQLite 저장
```

이 기능이 먼저 안정적으로 동작해야 한다.

UI 다꾸, Fan Deck, Monthly Palette 등의 감성 레이어는 **이 핵심 플로우가 작동한 후** 위에 올린다.

단, 구조를 만들 때 Color Index와 한 사진 다중 색 구조를 고려해 데이터 모델을 설계한다.

---

# 44. 현재 상태

- 프로젝트명: **Chroma Note**
- 플랫폼: 모바일
- 프레임워크: **React Native + Expo**
- 언어: TypeScript
- 저장 방식: Local-first / SQLite
- 서버: V1 없음
- 로그인: V1 없음
- AI: V1 없음
- 핵심 입력: Camera
- 핵심 데이터: Photo + Color Samples
- 핵심 결과물: Color Diary / Book
- 핵심 디자인 메타포: Color Swatch + Index Sticky + Diary
- 핵심 구현 우선순위: 촬영 후 색 선택 및 추천
