# Supabase 데이터 모델 재검토

> 2026-09-11 실제 개발 프로젝트 적용 후 점검. [기술 명세](02_TECH_SPEC.md)의 목표 계약, 적용된 스키마와 남은 서버 API를 구분한다.

## 결론

단일 `public.stamp_records`를 유지하고 **32개 열**로 현재 기록 계약을 표현한다. 이미지·메모·태그·생성 추적·동시성 정보는 기록과 수명이 같은 1:1 데이터다. 작은 배열/JSONB를 별도 테이블로 분할할 근거는 없다.

사용자는 `auth.users`에서 이메일 OTP로 관리하고 `stamp_records.user_id → auth.users.id`로 연결한다. 이메일이 바뀌어도 기록 관계가 유지되며 중복 프로필·사용자 테이블은 만들지 않는다. [DBML](chroma-note.dbml)은 앱 테이블 3개·40열과 참조용 Auth id/email을 설명한다. Auth 정의는 일부만 발췌했으며 DBML은 배포용 SQL을 대체하지 않는다.

## 실제 적용 상태

개발 프로젝트 `chroma-note-dev` / `jrtuwfateiblzkqtdbgo`에서 초기 `20260910082557`와 보완 `20260910152811` migration을 확인했다. SQL 정본은 [마이그레이션 폴더](../supabase/migrations/)다.

| 영역 | 적용 상태 |
|---|---|
| `public.stamp_records` | 32열·0행, PK id·image path UNIQUE·Book 복합 인덱스, RLS |
| `ai_field_note_edited` | nullable text·300 code point, null=원문·빈 문자열=숨김 |
| 태그 | 개수 8/3개, 1차원·항목 24자·비공백·NFC·중복 금지 CHECK |
| 팔레트 | 최대 5개·ready는 1~5개. 허용 키·자료형·대문자 HEX/RGB 정수 일치·weight 범위/합 CHECK |
| `app_private.record_tombstones` | 3열, 복합 PK, Auth FK CASCADE. RLS·클라이언트 차단 |
| `app_private.account_deletion_jobs` | 5열, PK user_id·Auth FK 없음. RLS·클라이언트 차단 |
| 내부 함수 | invoker 입력 검증 2개, definer 현재 계정 활성 확인 1개. 고정 search_path·최소 EXECUTE |
| 제품 mutation RPC / Edge Function | 0개. 내부 CHECK·RLS 함수는 저장 API가 아님 |
| Storage | 기존 private `stamp-images`, image/png, 5MiB를 유지 |
| 조회 | 존재하는 Auth 계정·탈퇴 작업 없는 소유자만 Record SELECT |
| 파일 | 본인 uploading 예약의 정확한 경로 INSERT, 본인 ready 경로 SELECT. upsert/직접 삭제 금지 |

태그는 서버에서 정규화한 뒤 저장하며 CHECK는 잘못된 값을 거부한다. 팔레트의 optional `color_name_key`는 비어 있지 않은 NFC 문자열이고 추가 임의 키를 허용하지 않는다. `uploading` 예약의 빈 팔레트는 허용하되 `ready`로 바꿀 때는 기존 필수 필드 제약도 통과해야 한다.

## 권한과 데이터 수명

클라이언트의 Record INSERT/UPDATE/DELETE 권한을 열지 않았다. 서버가 예약·파일 실물 검증·ready 확정을 해야 하므로, API가 없다고 직접 쓰기를 허용하면 저장 계약이 깨진다.

`app_private.current_account_is_active()`는 현재 JWT UID만 사용하고 Auth 행 존재·삭제 작업 부재를 확인한다. UID 인수나 사용자 수정 가능 metadata를 받지 않는다. `authenticated`에는 이 함수 호출용 schema USAGE/EXECUTE만 추가했으며 내부 테이블은 읽거나 쓸 수 없다. 입력 검증 함수는 서비스 역할만 호출 가능하다.

삭제 작업의 상태가 requested/processing/failed/complete 중 무엇이든 행이 있으면 잠긴다. 작업이 제거돼도 Auth 사용자가 없으면 이전 JWT로 접근하지 못한다. Storage의 Record EXISTS도 같은 RLS를 거치므로 파일 접근에 적용된다. 이 방어는 탈퇴 접수·세션 해제·파일 정리 작업 자체의 구현을 대신하지 않는다.

[ERD](record-erd.html)의 실선은 실제 FK다. `record_tombstones.record_id`는 삭제 후 남아야 하므로 Record FK를 두지 않는다. `account_deletion_jobs.user_id` 역시 Auth 삭제 이후 정리를 이어 가기 위해 Auth FK가 없다.

## 검증

- [SQL 검사](../supabase/tests/record_contract.sql): 태그·팔레트·메모 경계와 실제 CHECK 거부, 본인/잠긴 계정/삭제 UID 접근, 내부 테이블·함수 권한을 검증했다. 전체 ROLLBACK으로 자료를 남기지 않는다.
- [HTTP 검사](../supabase/tests/record_access.mjs): `node supabase/tests/record_access.mjs`. 합성 계정 A/B·미인증으로 DB 격리·직접 쓰기, 파일 예약/경로·PNG/5MiB·ready 읽기·타인/미인증·public URL·upsert·직접 삭제 제한 등 29개 확인을 통과했다.
- HTTP fixture의 ready 전환은 서버 역할로 만든 테스트 상태다. 제품 finalize/파일 checksum 검증의 성공으로 계산하지 않는다.
- 합성 계정·PNG·기록 정리 후 Auth 1개·Record 0개·Storage 객체 0개·내부 자료 0개를 확인했다. 기존 사용자의 계정·사진을 변경하지 않았다.
- 깨끗한 별도 DB에서 migration 전체 재적용은 미실행이다. 로컬 SQL과 원격 migration 이력 일치는 별도로 확인한다.

## 보안 진단

성능 Advisor 결과 0개, DB 보안 ERROR 0개다. 남은 진단은 다음과 같다.

- [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) INFO 2개: 내부 테이블은 서비스 역할만 관리하고 클라이언트는 전부 차단하는 의도다. 경고를 없애기 위해 허용 정책을 추가하지 않는다.
- [유출 비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) WARN 1개: 기존 비활성 설정. 현재 제품은 이메일 OTP를 사용하지만 비밀번호 인증 endpoint 자체가 비활성이라는 뜻은 아니다. 이번 합성 테스트 계정은 임시 난수 비밀번호로 인증 후 삭제했으며 OTP 품질 검사로 집계하지 않는다. 비밀번호 로그인 도입 시 보호·요금제 조건을 확인해야 한다.

## 남은 명세 차이와 다음 단계

| 남은 작업 | 영향 |
|---|---|
| record-lifecycle의 begin/finalize/abort/edit/delete | 현재 정상 앱 저장을 완주할 API가 없음 |
| 서버 시각·version·CAS·operation/hash·불변 필드 관리 | 컬럼만 있으며 mutation 경계에서 원자적으로 처리해야 함 |
| 나머지 text NFC·metadata allowlist·실제 PNG/hash 검증 | DB의 기본 길이/객체/크기 CHECK만으로 전체 입력 계약을 보장하지 못함 |
| 탈퇴 접수·세션 해제·정리 job/재시도 | 잠금 정책과 관리 테이블만 있고 실행 worker가 없음 |
| 깨끗한 DB 재현·전체 API/앱 통합 | 재현 SQL·권한 검증과 기능 전체 완료는 별개 |

서버 쓰기는 검증된 UID와 허용 필드만 사용해야 한다. 서비스 역할은 RLS를 우회하므로 사용자 입력 UID를 신뢰하면 안 된다.

## 컬러 선화 전환과 확장 기준

`stamp_records`, `stamp_image_path`, `stamp-images`, `stamp.png`는 호환 식별자로 유지한다. 완성 PNG와 기존 `style_meta`로 원본 RGB 선 마스킹을 표현할 수 있어 rename이나 새 테이블이 필요하지 않다. 원본 사진은 업로드하지 않는다.

공유 태그 사전, 기록당 여러 이미지, 별도 생성 이력, 대용량 분석 데이터의 독립 수명이 실제 요구로 생길 때만 테이블을 나눈다. 사용자 수나 열 수만으로 분할하지 않고 실제 쿼리 지연·행 크기·인덱스 사용을 먼저 측정한다.

## 공식 근거

[Tables](https://supabase.com/docs/guides/database/tables), [JSON](https://supabase.com/docs/guides/database/json), [API grants와 RLS](https://supabase.com/docs/guides/api/securing-your-api), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)를 대조했다. 단일 테이블 유지와 내부 차단 정책은 현재 제품 수명·접근 계약에 따른 설계 판단이다.
