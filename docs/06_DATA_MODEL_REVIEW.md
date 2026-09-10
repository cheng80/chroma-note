# Supabase 데이터 모델 재검토

> 2026-09-10 읽기 전용 점검. 제공된 실제 프로젝트 메타데이터와 현재 [기술 명세](02_TECH_SPEC.md)를 대조했다. 이 문서는 적용 상태와 개선 제안을 구분하며, 스키마 변경을 실행하지 않는다.

## 이메일 기반 사용자 분리

사용자는 기존 `auth.users`에서 이메일 OTP로 관리하고 기록은 `stamp_records.user_id → auth.users.id`로 연결한다. 프로필이나 중복 사용자 테이블은 추가하지 않는다. 이메일은 로그인 주소이고, 변경되어도 기록 관계가 유지되도록 UUID를 관계 키로 사용한다.

[한글 설명이 포함된 DBML](chroma-note.dbml)에 앱 테이블 전체와 Auth의 `id`·`email`을 명시했다. Auth는 부분 정의이며 실제 `email`은 `varchar(255)`, NULL 허용이다. 앱의 이메일 로그인 요구와 관리 테이블의 제약을 구별한다. DBML은 배포용 SQL의 대체물이 아니다.

## 결론

`public.stamp_records`의 31개 열은 현재 Phase 1에서 기록 하나와 수명·소유권이 같은 1:1 상태다. 열 수만으로 테이블을 나눌 이유는 없다. 현재 0행이어서 성능 문제의 근거도 없다. 지금 분할하면 원자적 저장과 조회에 조인, RLS, 삭제 순서만 늘어난다.

따라서 현행 단일 테이블을 유지한다. `semantic_tags`, `mood_tags`, `color_tags`도 기록 안에서만 쓰이는 작고 제한된 값이므로 배열/JSONB가 맞다. 메모와 AI 원문은 의미와 수정 권한이 다르므로 `user_note`와 `ai_field_note`를 계속 분리한다. 명세의 `ai_field_note_edited`도 AI 원문을 보존하기 위한 별도 열로 추가하는 편이 맞지만, 현재 DB에는 없다.

가장 큰 차단점은 테이블 모양이 아니라 쓰기 경로다. 클라이언트는 `stamp_records`를 읽을 수만 있고, 명세가 요구하는 RPC와 Edge Function이 하나도 없다. Storage 업로드 정책은 `uploading` 예약 행을 전제로 하므로 서버의 `begin/finalize/edit/delete` 경계가 없으면 정상 저장을 완료할 수 없다.

## 실제 적용 상태

감사 기준 migration은 `20260910082557 initial_record_schema`다.

| 영역 | 실제 상태 | 판정 |
|---|---|---|
| `public.stamp_records` | 31열, 0행, PK `id`, `stamp_image_path` UNIQUE, Book 복합 인덱스 | 구조 유지 |
| `app_private.record_tombstones` | 3열, PK `(user_id, record_id)`, `user_id → auth.users.id ON DELETE CASCADE` | 삭제된 ID 보존 목적에 맞음 |
| `app_private.account_deletion_jobs` | 5열, PK `user_id`, Auth FK 없음 | Auth 사용자 삭제 뒤에도 작업을 살리려는 의도에 맞음 |
| DB 함수/트리거 | `public`·`app_private` 모두 0 | 서버 쓰기 경계 누락 |
| Edge Functions | 0 | 저장·수정·삭제·탈퇴 처리 누락 |
| Storage | private `stamp-images`, PNG만, 5MiB 제한 | 선화 결과 계약과 일치 |
| 권한/RLS | `authenticated`는 Record SELECT만, 소유자 행만 조회 | 직접 쓰기 차단은 의도대로이나 서버 API 필요 |
| Storage 정책 | 예약된 `uploading` 경로 INSERT, 소유자의 `ready` 경로 SELECT | 상태 기반 게이트 적용 |
| 보안 진단 | DB lints 없음 | 발견된 DB 보안 진단 없음 |

현행 데이터 관계와 FK/논리 연결은 [ERD](record-erd.html)에 정리했다. 실선만 실제 FK다. FK가 없는 논리 연결은 설명으로 구분한다. `record_tombstones.record_id`에는 Record FK가 없다. 삭제된 Record가 사라진 뒤에도 tombstone이 남아야 하므로 FK를 추가하면 안 된다. `account_deletion_jobs.user_id`도 Auth 삭제 이후 작업 지속을 위해 의도적으로 FK가 없다.

Auth의 유출 비밀번호 차단 비활성 경고는 현재 OTP 로그인 흐름과 별개다. 향후 비밀번호 로그인을 도입할 때만 [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)를 기준으로 최소 길이와 유출 비밀번호 차단을 검토한다.

## 명세와 실제 DB 차이

| 우선순위 | 차이 | 영향 | 개선 제안 |
|---|---|---|---|
| 차단 | mutation RPC/Edge Function 없음 | 예약 행을 만들고 검증 후 `ready`로 확정할 제품 저장 경로가 없음 | 작은 `record-lifecycle` 서버 API로 `begin/finalize/abort/edit/delete` 구현 |
| 높음 | `ai_field_note_edited` 열 없음 | 원 AI 문구와 사용자 수정문을 별도 보존할 수 없음 | nullable text 열과 300자 제한 추가. `null`은 원문 표시, 빈 문자열은 숨김 |
| 높음 | 태그는 개수만 제한 | 24자 초과, 빈값, NFC 정규화 후 중복을 DB가 허용 | 서버 쓰기 경계에서 정규화·검증하고 DB 제약으로 최종 방어 |
| 높음 | `color_tags`는 배열 자료형과 개수만 검사 | 항목 키/형식, HEX-RGB 일치, weight 범위·합계가 보장되지 않음 | finalize에서 전체 검증하고 DB 함수/CHECK로 최종 방어 |
| 중간 | 명세의 서버 시각·version 증가가 트리거/함수로 구현되지 않음 | 직접 쓸 수는 없지만 향후 서버 mutation이 누락할 수 있음 | mutation 함수 한곳에서 `updated_at`, `version`, 불변 열을 관리 |

태그 검증은 각 항목 24 Unicode code point 이하, 빈 문자열 금지, Unicode NFC 정규화 후 중복 금지를 포함해야 한다. `color_tags`는 각 항목의 허용 키, `#RRGGBB`, RGB 정수 3개(0~255), HEX-RGB 일치, `0 < weight <= 1`, 전체 합 `1±0.001`을 검사해야 한다. 이 항목들은 제안이며 이번 점검에서 적용하지 않았다.

## 31열 단일 테이블 판단

현재 열은 다음 네 묶음이지만 모두 Record와 함께 생성·조회·수정·삭제되는 1:1 상태다.

- 이미지 상태: `status`, `stamp_image_path`, checksum, bytes, width, height
- 사용자·AI 내용: scene, 태그, `ai_field_note`, `user_note`, 날짜, 장소, 즐겨찾기
- 생성 추적: `analysis_meta`, `model_meta`, `style_meta`
- 동시성·멱등성: version, operation ID/hash, 생성 ID/hash, 서버 시각, 삭제 요청 시각

1:1 보조 테이블로 수직 분할해도 데이터 중복이 줄지 않는다. 오히려 ready 확정, CAS 편집, 삭제를 여러 테이블에 걸쳐 처리하고 정책을 반복해야 한다. JSONB 세 열의 합에는 이미 16KiB 상한이 있고, Record 수가 0인 현재는 분할로 해결할 측정된 병목도 없다.

다음 요구가 실제로 생길 때만 분리한다.

| 도입 요구 | 분리 기준 | 후보 구조 |
|---|---|---|
| 공유 태그 사전과 이름 변경 | 한 태그를 여러 Record가 참조하고 중앙에서 편집해야 함 | `tags`, `record_tags` |
| Record당 여러 이미지 | 이미지별 경로·순서·상태·삭제 수명이 생김 | `record_images` |
| 생성 이력/후보 보존 | 한 Record에 여러 실행·모델·결과를 조회해야 함 | `record_generations` |
| 큰 분석 데이터의 독립 보존 | Record 본문과 접근권한·보존기간·조회 빈도가 달라짐 | 별도 분석 테이블 또는 객체 저장 |

단순히 사용자나 Record가 많아지는 것은 분할 기준이 아니다. 실제 쿼리 지연, 행 크기, 인덱스 사용량을 측정한 뒤 인덱스나 보관 정책부터 조정한다.

## 컬러 선화 전환의 데이터 영향

현재 결과물은 흰 배경의 컬러 선화다. 단일 채널 선 마스크에 같은 위치의 정규화 원본 RGB를 입히며, 서버에는 완성 PNG만 저장한다. `stamp_records`, `stamp_image_path`, `stamp-images`, `stamp.png`는 호환 식별자로 유지한다. 이번 범위에는 rename DDL이 없으며 필요하지도 않다.

스타일 메타데이터는 현재 선화 계약인 white source RGB masked lines를 식별할 수 있어야 한다. 기존 `style_meta`로 충분하므로 새 테이블을 만들지 않는다. 제품 UI와 문서에서는 “선화/기록”으로 표시하고 저장 식별자만 기존 이름을 유지한다.

## 적용 순서 제안

1. 서버 `record-lifecycle` API와 제한된 DB mutation 함수를 먼저 구현해 저장 차단을 해소한다.
2. 같은 migration에 `ai_field_note_edited`와 태그·색상 최종 제약을 추가한다.
3. 다른 UID, 잘못된 경로, 잘못된 color payload, 재시도/CAS, 삭제 중단을 통합 검증한다.
4. 실제 데이터가 쌓인 뒤 쿼리와 행 크기를 측정하고, 위 분리 기준이 충족될 때만 ERD를 확장한다.

이번 작업은 읽기 전용 감사 결과를 문서화한 것이다. 메타데이터를 읽는 서버 조회만 수행했으며 migration 실행, 권한 변경, Storage 변경은 하지 않았다.

## 공식 근거

테이블 관계·배열/JSONB 선택은 [Tables](https://supabase.com/docs/guides/database/tables)와 [JSON](https://supabase.com/docs/guides/database/json), grants와 RLS의 구별은 [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)를 대조했다. 단일 테이블 유지 판단은 현재 제품의 1:1 수명과 실제 스키마에 대한 설계 판단이다.
