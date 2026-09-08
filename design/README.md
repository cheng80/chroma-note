# Chroma Note 디자인 파일

편집 원본은 [chroma-note.pen](chroma-note.pen), 열람본은 [42페이지 PDF](export.pdf)다. 사진은 상대 경로 `assets/`를 사용하므로 원본과 함께 유지한다.

Pen CLI `0.3.6`으로 저장·재열기·내보내기를 확인했다. 첫 실행에서는 사진·아이콘 로딩이 끝난 뒤 렌더한다.

```sh
npx --yes @pen.dev/cli@0.3.6 interactive --in design/chroma-note.pen --out design/chroma-note.pen
```

38개 화면과 4개 시스템 보드, 17개 재사용 컴포넌트가 있다. [디자인 기준](../docs/design/DESIGN_BRIEF.md)과 [검토 기록](../docs/design/INTERFACE_REVIEW.md)을 함께 읽는다. 정적 디자인이며 앱 구현 완료를 뜻하지 않는다.

| 화면 / 보드 | PNG |
|---|---|
| 00 · Foundations / 파운데이션 | [RdQ0I](previews/RdQ0I.png) |
| 01 · Components / 컴포넌트 | [WBjSO](previews/WBjSO.png) |
| 02 · Patterns / 기록과 상태 | [cqSDl](previews/cqSDl.png) |
| Phone / 04-book / Book | [f8bzpF](previews/f8bzpF.png) |
| Phone / 04-empty / Book | [oHGpq](previews/oHGpq.png) |
| Tablet / 04-book / Book | [u0aWmC](previews/u0aWmC.png) |
| Tablet / 04-empty / Book | [p6gCoP](previews/p6gCoP.png) |
| Phone / 05-detail / 골목의 오후 | [xBtfm](previews/xBtfm.png) |
| Phone / 01-find / Find | [VZnia](previews/VZnia.png) |
| Phone / 02-pick / 색 고르기 | [Z14Qa](previews/Z14Qa.png) |
| Phone / 03-place / 인덱스 붙이기 | [cVJOb](previews/cVJOb.png) |
| Tablet / 05-detail / 골목의 오후 | [BsWf2](previews/BsWf2.png) |
| Tablet / 01-find / Find | [YZXpr](previews/YZXpr.png) |
| Tablet / 02-pick / 색 고르기 | [uElKT](previews/uElKT.png) |
| Tablet / 03-place / 인덱스 붙이기 | [QT1qD](previews/QT1qD.png) |
| Phone / 06-colors / Book | [Qq64N](previews/Qq64N.png) |
| Phone / 07-color-detail / 코랄 | [c0T4QK](previews/c0T4QK.png) |
| Phone / 08-ideas / Ideas | [oPAKP](previews/oPAKP.png) |
| Phone / 09-settings / 설정 | [kV2NG](previews/kV2NG.png) |
| Tablet / 06-colors / Book | [y1jla](previews/y1jla.png) |
| Tablet / 07-color-detail / 코랄 | [sorAp](previews/sorAp.png) |
| Tablet / 08-ideas / Ideas | [afMEp](previews/afMEp.png) |
| Tablet / 09-settings / 설정 | [cPboY](previews/cPboY.png) |
| Phone / 10-language / 언어 / Language | [zXxbF](previews/zXxbF.png) |
| Phone / 11-backup / 백업 파일 만들기 | [Ndj04](previews/Ndj04.png) |
| Phone / 12-restore / 백업에서 복원 | [HlPVH](previews/HlPVH.png) |
| Phone / 13-edit / 기록 편집 | [VDDtU](previews/VDDtU.png) |
| Phone / 14-permission / Find | [NHo8u](previews/NHo8u.png) |
| Tablet / 10-language / 언어 / Language | [kGkox](previews/kGkox.png) |
| Tablet / 11-backup / 백업 파일 만들기 | [QF6AU](previews/QF6AU.png) |
| Tablet / 12-restore / 백업에서 복원 | [LlIYZ](previews/LlIYZ.png) |
| Tablet / 13-edit / 기록 편집 | [TrNHZ](previews/TrNHZ.png) |
| Tablet / 14-permission / Find | [VhC4n](previews/VhC4n.png) |
| 03 · States / 저장 · 권한 · 백업 | [Hftdd](previews/Hftdd.png) |
| Phone / 15-saved / 골목의 오후 | [e11F83](previews/e11F83.png) |
| Phone / 16-zero-color / 색을 기다리는 사진 | [q4p6q](previews/q4p6q.png) |
| Tablet / 15-saved / 골목의 오후 | [C6X5Y](previews/C6X5Y.png) |
| Tablet / 16-zero-color / 색을 기다리는 사진 | [B0M6uk](previews/B0M6uk.png) |
| Phone 360 / Color Pick | [UjRSb](previews/UjRSb.png) |
| Phone EN / Choose a color | [F2KDH](previews/F2KDH.png) |
| Tablet landscape / Book | [bQD0n](previews/bQD0n.png) |
| Phone 320 / Color Pick | [rvPRh](previews/rvPRh.png) |

## 사진 출처

- `assets/terracotta.jpg`: [Martins Cardoso / Unsplash](https://unsplash.com/@martinscardoso_unsplash), [사용 이미지](https://images.unsplash.com/photo-1767978690630-83bfeb382bac?w=1080&q=85&fit=max).
- `assets/leaves.jpg`: [Abdullah Aslam / Unsplash](https://unsplash.com/@abdullahaslam_11575630_sink), [사용 이미지](https://images.unsplash.com/photo-1672219286179-8925a7306d62?w=1080&q=85&fit=max).
- 원본 HTML의 팬덱·포스트잇·페이지 탭 이미지는 방향 참고용이며 제품 자산으로 재배포하지 않는다. 기준색 번호는 디자인 예시이며 Pantone 공식 목록이 아니다.
