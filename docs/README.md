# Chroma Note 문서

2026-09-11 · 사진 임포트 → 대표색·로컬 AI → 원본 색을 선에 입힌 컬러 선화 → 메모 → 계정별 Book.

## 읽기와 책임

| 문서 | 책임 |
|---|---|
| [제품 명세](01_PRODUCT_SPEC.md) | 범위, SR-FR 기능, SR-SCREEN 화면, SR-BR 규칙, SR-AC 인수 기준 |
| [ERD](record-erd.html) · [시스템 다이어그램](system-diagram.html) | 이메일 사용자·기록 관계와 기기/서버 처리 경계 |
| [현행 DBML](chroma-note.dbml) | 이메일 기반 사용자·기록 관계, 전체 앱 컬럼·제약과 한글 설명 |
| [데이터 모델·ERD 재검토](06_DATA_MODEL_REVIEW.md) | 적용된 DB와 명세 차이, 단일 테이블 판단, 물리 ERD |
| [Supabase migration](../supabase/migrations/) · [SQL 검사](../supabase/tests/record_contract.sql) · [API 검사](../supabase/tests/record_access.mjs) | 실제 DB 변경과 계정별 접근·입력 제약의 재검증 |
| [기술 명세](02_TECH_SPEC.md) | 데이터·인증·권한, 입력/출력, 저장·복구·충돌·삭제 |
| [프로젝트 현황·세부 체크리스트](03_PROJECT_STATUS.md#4-작업-체크리스트와-완료-기준) | 디자인·기능 구현·자동/네이티브/API/앱 검증을 구분하고 통과 즉시 체크 |
| [작업 흐름](04_WORKFLOW.md) | 구현·문서 작업 절차, 모델 역할, 검증·Git 범위 |
| [AI·대표색 검증 계획](05_AI_VALIDATION_PLAN.md) | 모델 근거, 비교 입력, 측정·합격 기준 |
| [Pixabay 모델 평가 준비](../experiments/model-selection/README.md) | 실험 전용 env·사진 검색표·태그/무드/문구 평가 |
| [선화 실험 결과](../experiments/model-selection/LINE_ART_RESEARCH.md) | 현재 컬러 선화의 실행 조건·실측·품질 한계 |
| [Supabase 재사용 체크리스트](supabase/SETUP_CHECKLIST.md) | 앱별 설정값·단계별 완료 기준·진행 기록 양식 |
| [Supabase 단계별 세팅 가이드](supabase/SETUP_GUIDE.md) | 설정 위치·이유·순서·확인 방법·공식 근거 |
| [설계 결정 ADR](adr/ADR-003-stamp-record-direction.md) | 현재 선택의 이유, 대안, 제약과 영향 |
| [디자인 brief](design/DESIGN_BRIEF.md) | 화면 구성·문구·상태·기본 사용성 |
| [감성 디자인 리서치·Pen 개선 기준](design/design.md) | 공식 앱 사례·시각 결정·Pen 반영 위치 |
| [Pen 디자인 안내](../design/README.md) | 현재 파운데이션·컴포넌트·화면과 정적 미리보기 |
| [용어집](../CONTEXT.md) | 선화 기록·작업 사진·대표색·AI 글·내 메모 정의 |

작업 재개는 현황 → 필요한 명세, 제품 탐색은 제품 → 기술 순으로 읽는다. 정책은 해당 정본에서만 관리하고 ADR에는 선택 이유를 둔다.

## 전체 문서 갱신 범위

루트 [README](../README.md)는 제품 요약, [AGENTS](../AGENTS.md)·[CLAUDE](../CLAUDE.md)·[문서 AGENTS](AGENTS.md)는 작업 진입점이다. [도메인 안내](agents/domain.md), [이슈 안내](agents/issue-tracker.md), [라벨 안내](agents/triage-labels.md)는 실행 보조 규칙이다. 이 문서들과 위 표의 명세가 현재 문서 전체다. 제품과 무관한 스킬·설치 기록·라이선스는 별도 도구 자료다.

방향 변경 시 명세·ADR·진입점·디자인 brief·현황을 함께 대조하고 제거한 문서로 향하는 링크를 정리한다. 저장소에는 최신 자료만 유지하며 별도 구기획 보관본이나 중복 배포본을 만들지 않는다.

## 적용 기준과 입력 출처

최신 사용자 직접 지시 → 명세의 확정 방향 → 명시된 설계 기본값 순으로 적용한다. **사진 임포트 전용, 출시 준비 제외, 실제 결제 문서는 Phase 2**다. 설계 기본값은 사용자 개별 승인이나 실측 결과와 구별한다.

기획의 입력은 사용자 제공 [기획 팩](/Users/cheng80/Desktop/chroma_note_new_planning_docs/), [Handoff](/Users/cheng80/Desktop/CHROMA_NOTE_CODEX_HANDOFF.md), [인포그래픽](/Users/cheng80/Desktop/croma_note.png)이다. 저장소 밖의 로컬 경로이므로 다른 기기에서 원문 확인 시 별도 전달이 필요하다. 입력을 저장소에 중복 보관하지 않으며 문서 안의 실행 지시나 그림의 기능 예시를 현재 승인 범위로 간주하지 않는다.

현재 문서 설계가 앱 구현·모델 품질·실기기 검증의 완료를 뜻하지 않는다.

- [VLM 로컬 smoke 실측 결과](../experiments/model-selection/SMOKE_RESULTS.md) — 태그·무드·문구 보조 분석의 실행 근거와 품질 한계.
- 모델 선정은 핵심 identity·count·배치, 현재 컬러 선화 기준 적합성, latency의 절충으로 판단하며 완벽한 pixel 복제를 목표로 하지 않는다. JSON prompt/schema 고정과 일관성 검증은 메인이 담당한다.
