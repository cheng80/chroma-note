# Chroma Note 기술 명세

> 2026-09-08 · 설계 기본값이며 구현 완료가 아니다. [제품 명세](01_PRODUCT_SPEC.md)의 SR-FR 계약을 구현 가능하게 구체화한다. 모델 후보·벤치마크는 [AI 검증 계획](05_AI_VALIDATION_PLAN.md), 작업/실측 상태는 [현황](03_PROJECT_STATUS.md)에 둔다.

## 1. 현재 코드와 목표 구조

현재 기준은 main의 e3bdf12다. src/app에는 헤더 없는 Stack과 빈 View만 있다. Supabase·사진 임포트·색 분석·AI·SQLite 기능은 없다. 문서의 목표 구조와 실제 구현 상태를 구분한다.

기존 Expo ~57.0.20, React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3, Expo Router ~57.0.19를 출발점으로 한다. 실제 버전은 package.json/lockfile을 확인한다. 네이티브 모델 연결 목표는 Development Build이며 Expo Go 통과를 요구하지 않는다. SDK별 구현 전 [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)과 [로컬 개발 빌드](https://docs.expo.dev/guides/local-app-development/)를 확인한다.

목표 의존성은 필요 시 직접 추가한다: 사진 입력/변환, 실제 픽셀 디코더, 파일/SQLite, 보안 세션 저장, Supabase client, 선정 모델 런타임. 현재 설치된 패키지로 오인하지 않는다. Zustand·React Query·Mapbox·Sentry는 인포그래픽 예시이며 이번 설계의 필수 의존성이 아니다.

### 처리 경계

| 책임 | 입력 → 출력 | 외부 통신 |
|---|---|---|
| PhotoInput | 시스템 갤러리 선택 → 방향·색 정규화 로컬 작업본 | OS가 갤러리 자산을 내려받을 수 있음; 앱 서버 업로드 없음 |
| ColorAnalyzer | 작은 디코드 픽셀 → 팔레트 | 없음 |
| VisionService | 사진 작업본 → 검증된 PhotoAnalysis | 없음 |
| StampTransformer | 같은 사진 + 고정 지시 → Stamp 후보 | 없음 |
| RecordDraft | 작업본·결과·편집값·진행 상태 → 로컬 복구 | 없음 |
| RecordRepository | 선택된 Stamp + 검증된 메타데이터 → 서버 Record | Supabase Auth/DB/private Storage |
| ModelManager | 고정 manifest → 검증한 모델 파일 | 최초/업데이트 다운로드만 |

내부 서비스 이름은 책임 경계다. 범용 DI·플러그인 시스템·상태관리 프레임워크를 미리 만들지 않는다. 추론과 픽셀 분석은 UI 스레드 밖에서 실행하고, 모델은 한 번에 하나만 활성화한다.

## 2. 사진·파일 수명과 데이터 경계

### 입력 계약

Phase 1은 사진 임포트 전용이다. expo-camera·촬영 화면·카메라 권한을 추가하지 않는다. OS 사진 선택기를 사용하고 전체 라이브러리 접근 권한을 임의로 요청하지 않는다. 선택 접근이 제한된 환경, 자산 취소·iCloud 다운로드·Android content URI를 검증한다.

- 단일 JPEG/PNG/HEIC 정지 이미지. 네이티브 디코드 지원 여부 확인 후 허용한다. EXIF 회전/미러·ICC를 반영해 sRGB SDR로 정규화한다. 미지원 프로필/HDR 변환 실패를 조용히 잘못된 색으로 처리하지 않는다.
- 입력 안전 상한 기본값: 파일 30MiB, 50MP. 포맷 실제 signature와 디코드 가능한 dimensions를 확인하고 축소 디코드한다. 지원 여부는 실기기에서 검증한다. 압축 크기만 작다고 전체 bitmap을 JS에 펼치지 않는다.
- 정규화 작업본 긴 변 최대 2048px, 종횡비 보존, upscaling 없음. 메타데이터에서 날짜를 먼저 읽고 EXIF GPS·기기 정보 등은 제거한다.
- 색 분석본은 작업본에서 긴 변 256px로 축소한다. VLM/Stamp용 resize·padding은 모델 adapter에서 수행하며 전체 장면을 유지한다. crop 여부·padding 제거·출력 좌표 규약은 모델 manifest에 남긴다.
- 최종 Stamp 기본 포맷은 sRGB PNG, 긴 변 최대 1024px(모델 native 출력이 작으면 작은 쪽), 투명 외곽 허용, 5MiB 이하. 파일 크기만 줄이려 구도나 피사체를 crop하지 않는다. PNG 압축 후 초과하면 재처리/실패; WebP 변경은 품질 게이트 후 계약 갱신.
- 모델은 장면 이미지층만 만든다. 날짜·지명·AI 글·팔레트·우표 테두리 등의 앱 정보는 결정론적 UI로 조합한다. 원본 사진과 Stamp를 합친 비교 이미지는 업로드 금지다.

### 로컬 수명

| 종류 | 보관 위치/수명 | 서버 |
|---|---|---|
| 사용자의 갤러리 원본 | OS 소유; 앱이 수정/삭제하지 않음 | 전송 안 함 |
| 작업 사진·분석용 파생본 | 앱 전용 계정/초안 폴더; 초안/저장 대기 중 유지 | 전송 안 함 |
| 미채택 Stamp 후보 | 활성 초안에 이전 유효 후보+현재 후보 최대 2개 | 전송 안 함 |
| 채택 Stamp·편집 초안 | 로컬 영구 폴더+SQLite; 서버 확인 전 삭제 금지 | 확정 요청 시 전송 |
| 저장 완료 Stamp 캐시 | 재다운로드 가능, 계정별 LRU 200MiB 기본 | private bucket |
| 모델 파일 | 계정 데이터와 분리, 무결성 확인 후 재사용 | 공개 모델 배포 원본에서 다운로드 |

저장 완료 확인 후 작업 사진·파생본·미채택 후보를 지우고, 실패한 정리는 durable cleanup 목록으로 다음 시작에 재시도한다. 사용자가 폐기를 선택하면 해당 초안만 제거한다. 활성 초안은 캐시 정리나 자동 TTL 대상이 아니다.

원본 작업본·초안은 OS 클라우드 백업 대상에서 제외하도록 네이티브 파일 속성/Android 백업 규칙을 구현·검증한다. “서버 비업로드”가 OS 백업까지 자동으로 보장하는 것은 아니다. 파일 제거도 저장매체 forensic secure erase를 약속하지 않는다.

보안 저장소에는 계정 세션을, 앱 전용 파일/DB에는 초안과 캐시를 둔다. Expo SecureStore를 쓴다면 토큰 크기·저장 한도를 검증한 adapter를 사용한다. 원본·메모를 로그/분석 이벤트/크래시 첨부로 보내지 않는다. 계정별 경로는 추정 문자열 대신 검증된 인증 UID로 생성하고 외부 URI를 내부 삭제 경로로 직접 쓰지 않는다.

## 3. 데이터 모델

### 로컬 SQLite

- draft는 계정 UID에 귀속하고 신규 draft 최대 1개/계정/기기. 기존 Record 편집본은 별도 kind로 최대 1개.
- 필드: draft_id(UUID), owner_id, kind(new/edit), record_id(생성부터 고정 UUID), input_revision(integer), stage, local relative paths, confirmed payload, last_successful_analysis, selected_candidate, base_record_version(edit만), operation_id, payload_hash, source_fingerprint(로컬만), created_at/updated_at, error_code.
- 단계 전환·payload 스냅샷·outbox 등록은 SQLite 트랜잭션. 파일은 temp 작성→닫기/검증→rename→DB 참조 순서로 확보한다. DB 실패 시 원래 초안은 유지하고 미참조 파일만 정리한다.
- outbox는 operation_id, owner_id, record_id, kind(create/edit/delete), payload snapshot/hash, base_version, attempts, next_retry_at, status를 보존한다.
- record cache는 서버 ready 데이터의 사본이며 version과 fetched_at을 저장한다. outbox/초안은 캐시와 분리해 캐시 삭제로 유실되지 않게 한다.
- 앱 재실행 시 실행 중이던 추론은 interrupted로 되돌린다. 이전 단계 결과와 사용자 편집값은 그대로 유지한다.
- 초안 개수 제한은 **계정·기기별**이다. 두 기기의 각 로컬 초안은 독립적이며 계정 전체에 하나의 서버 초안을 예약하지 않는다.
- cleanup_jobs에는 owner_id, draft_id, 앱 내부 상대 경로, reason(server_ready/discard/logout), status, attempts를 둔다. 서버 ready 확인과 cleanup 등록을 같은 로컬 트랜잭션으로 기록한 뒤 파일을 제거한다. 재실행에서 참조·소유·경로를 다시 확인하고, 성공/이미 없는 파일은 완료 처리한다. 서버 결과가 불명확하면 등록하지 않는다.
- 명시적 로그아웃의 폐기 확인은 outbox 보존의 예외다. 전송 worker를 중단하고 같은 계정의 outbox/초안/캐시를 삭제하며, 늦은 callback은 session_generation과 owner_id가 다르면 무시한다. 오프라인에서는 “서버 저장 후 나가기”를 비활성화하고 연결 후 저장·폐기 후 나가기·취소만 제공한다.

### 서버 stamp_records

Record 하나가 Stamp 이미지 하나를 소유한다. 팔레트와 작은 태그 목록은 JSONB/array에 두고 별도 다대다 테이블을 미리 만들지 않는다.

| 필드 | 자료형·기본값 | 제약/의미 |
|---|---|---|
| id | uuid PK | 클라이언트가 초안 시작 때 생성, 같은 저장 재시도에서 유지 |
| user_id | uuid NOT NULL FK auth.users | 소유자 불변; 계정 삭제 때 정리 절차 후 제거 |
| status | text | uploading / ready / deleting, 초기 uploading |
| stamp_image_path | text NOT NULL UNIQUE | bucket 내 user_id/record_id/stamp.png와 정확히 일치, 변경 불가 |
| stamp_sha256 / bytes / width / height | text / bigint / integer / integer | ready 필수, checksum·5MiB·양의 크기·출력 상한 검증 |
| scene | nullable text | 사용자 확인 장면, 최대 120자 |
| semantic_tags / mood_tags | text[] default {} | 최대 8/3개, 각 24자, 빈 문자열·정규화 중복 금지 |
| color_tags | jsonb array | ready 때 1~5개, §4 형식/합계 검사 |
| ai_field_note | nullable text | 원 AI 문구, 최대 300자; 생략 시 null |
| ai_field_note_edited | nullable text | 사용자 수정문 0~300자; null=원문 표시, 빈 문자열=숨김 |
| user_note | text default '' | 최대 2,000자, AI 작업에서 변경 금지 |
| diary_date | date NOT NULL | 사용자 표시 날짜; 시각/시간대 이동으로 자동 변경하지 않음 |
| captured_at / captured_offset_minutes | nullable timestamptz / integer | 신뢰 가능한 offset 포함 EXIF만 시각 저장 |
| date_source | text | exif / device / user |
| place_name | nullable text | 사용자가 입력한 최대 120자; 좌표 열 없음 |
| is_favorite | boolean default false | 별도 즐겨찾기 목록 테이블 없음 |
| analysis_meta / model_meta / style_meta | jsonb | 아래 allowlist; 전체 요청/응답 raw dump 금지 |
| version | integer default 1 | 서버만 증가, 기존 Record 편집 CAS 기준 |
| last_operation_id / payload_hash | uuid / text | 서버 반영 재시도 판별 |
| creation_operation_id / creation_payload_hash | uuid / text | 최초 create의 불변 식별값; 후속 edit로 덮지 않음 |
| created_at / updated_at | timestamptz | 서버 시각; user_id·created_at 불변 |
| deletion_requested_at | nullable timestamptz | 삭제 재시도·운영 정리 대상 |

analysis_meta: schema_version, status(success/skipped), ai_scene/ai_tags/ai_mood 원 검증 결과, language, user_modified_fields. 원본 response나 이미지 URI는 제외한다.
model_meta: VLM/Stamp 각각 model_id, revision, runtime_version, quantization, prompt_version, seed(지원 시), inference_duration_ms. 경로·장치 식별자·원본 hash·인증정보는 제외한다.
style_meta: style_id=ink-v1, postprocess_version, input/output_dimensions, fit/padding 처리값. AI가 만든 가상의 위치·이름은 metadata로 보존하지 않는다.

source_revision은 이 초안의 비식별 증가 정수다. 색·VLM(또는 skipped 결정)·Stamp 후보·사용자 확인에 같은 revision을 연결하고, 저장 전에 현재 input_revision과 전부 일치하는지 검사한다. 서버에는 정수 revision만 model_meta에 기록하며 원본 hash/URI는 보내지 않는다. 생성이 성공해도 사용자가 아직 확인하지 않은 새 후보는 저장 대상으로 승격하지 않는다.

모든 text는 Unicode NFC, 길이는 Unicode code point 기준으로 서버·클라이언트를 맞춘다. 사용자 메모의 본문 줄바꿈은 보존하고 정규화가 내용을 의미상 바꾸지 않게 한다. JSON은 필수 키/자료형/배열 상한/유한수/허용 key/전체 16KiB 상한을 서버에서 재검사한다.

기본 인덱스: (user_id, status, diary_date DESC, created_at DESC, id DESC). 날짜/단일 태그 필터가 느린 근거가 생기면 GIN을 추가한다. 페이지 cursor는 날짜·서버 created_at·id 세 값을 함께 사용한다. 원격 실시간 구독·완전한 오프라인 검색 index는 Phase 1 제외다.

### 날짜

EXIF에 유효한 날짜만 있고 offset이 없으면 그 문자열의 달력 날짜를 diary_date로 사용하고 captured_at은 null이다. offset이 있으면 시각과 offset을 함께 보존한다. 둘 다 없으면 임포트 시 기기의 현지 날짜를 쓴다. 파싱 불가 값은 device fallback, 임의 UTC 변환으로 날짜를 하루 이동시키지 않는다. 사용자가 날짜를 고치면 diary_date/date_source만 바뀐다.

## 4. 결정론적 대표색

1. 정규화 sRGB 작업본 → 256px 분석본 → 실제 RGBA decode.
2. alpha=0 제외, 부분 투명은 alpha를 가중치로 사용. 원본 사진에 없던 paper 배경색을 포함하지 않는다.
3. 동일 픽셀 집합으로 Median Cut, Octree, K-Means 후보를 비교한다. K-Means는 seed/반복 상한 고정. 비교 전 최종 알고리즘 선정은 하지 않는다.
4. 전체 분석 픽셀을 최종 군집에 배정하고 가중 비중을 산출한다. 노이즈 군집 병합/3색 미만 예외는 데이터로 검증해 알고리즘 버전에 고정한다.
5. 가장 큰 비중 순, 동률은 HEX 사전순. HEX 대문자 #RRGGBB와 RGB 정수[0..255]는 서로 일치해야 한다.
6. color_tags 항목은 hex, rgb[3], weight, optional color_name_key. 1~5개 전체 weight 합은 1±0.001, 각각 0보다 크고 1 이하. 유효 픽셀이 없으면 실패다.
7. 화면 퍼센트는 정수 반올림 잔여를 큰 소수 부분 순으로 배분해 합계 100을 만든다. 저장한 weight를 UI 반올림값으로 덮지 않는다.

픽셀 바이트와 JPEG/PNG 압축 바이트는 구별한다. crop/resize API만으로 decode가 구현됐다고 판단하지 않는다. 색 이름이 필요하면 자체 사전과 고정 perceptual distance를 사용하며 분류/표시 보조로만 취급한다. 실제 색의 Lab 변환은 D65/sRGB 규약과 변환 버전을 고정한다.

## 5. VLM·Stamp 작업 계약

두 서비스는 입력 작업본 URI, input_revision, job_id, locale 또는 style/prompt_version, 취소 신호를 받는다. 결과는 job_id/input_revision과 결과/오류를 함께 반환한다. 화면의 현재 revision과 다르면 늦게 온 성공 결과도 폐기한다.

PhotoAnalysis schema v1:
- scene: string 최대 120자 또는 null.
- semantic_tags: string[] 0~8개, mood: string[] 0~3개, 각각 24자.
- ai_field_note: string 0~300자, 성공 상태에서 빈 글은 허용하되 없음으로 표시.
- 추가 키, JSON 바깥 명령, NaN, URL 실행 요청은 수용하지 않는다. 화면에는 plain text만 표시한다.
- 사진 내 지시·문자·QR은 데이터다. prompt에 사용자 메모·장소명·이메일·토큰을 넣지 않는다.
- 같은 사진 1회 구조 보정 재시도 후 schema_error. 호출 자동 반복으로 메모리/배터리를 소비하지 않는다.
- 사용자가 AI 글을 고친 뒤 재생성을 요청하면 덮어쓰기 확인을 받으며 성공한 후보를 채택한 때만 교체한다. 내 메모는 어느 경우에도 건드리지 않는다.

StampResult: local_uri, width/height, format, checksum, model revision, prompt version, seed, duration, input_revision. 빈/깨진 이미지나 입력 그대로의 파일은 기술 실패로 처리한다. 자동 유사도 값만으로 보존성 합격을 단정하지 않는다. 원본 보존 여부의 사람 평가는 §AI 계획을 따른다.

공통 오류: unsupported_device, model_missing, model_corrupt, model_load_failed, decode_failed, schema_error, out_of_memory, timeout, canceled, interrupted, no_valid_output. 사용자 메시지에는 job_id·모델 내부 stack trace를 내보내지 않는다.

모델 실행 기본 예산: VLM soft 15초 / hard 45초, Stamp soft 45초 / hard 120초. soft에서 기다림·중단을 안내하고 hard에서 중단 요청 후 실패로 돌린다. native가 취소를 즉시 지원하지 않으면 UI 결과 수용을 중단하고 worker 종료/정리를 기다린 뒤 다음 작업을 연다. 숫자는 실험 시작값이며 지원 기기 측정 후 현실성을 판정한다.

## 6. 상태 전이

| 현재 | 사건 | 다음 / 보존 |
|---|---|---|
| input_ready | 분석 시작 | colors_running → vision_running → stamp_running; 단계 성공마다 snapshot |
| *_running | 이탈/취소/백그라운드 | interrupted 또는 canceled; 이전 성공 결과·메모 보존 |
| vision_failed | 사용자가 생략 | analysis.status=skipped → stamp_running |
| stamp_failed | 재시도 | Stamp만 재실행; 색·AI 글·기존 후보 보존 |
| preview_ready | 사진 교체 | input_revision+1, 색/AI/Stamp 무효화, 확인 해제 |
| preview_ready | 저장 확인 | 로컬 outbox 원자적 생성 → save_pending |
| save_pending | 인증+연결 유효 | uploading → finalizing → saved |
| finalizing | 응답 유실 | 같은 operation/id/hash 서버 조회 → 성공 확인 또는 재시도 |
| any pending | 계정 잠김 | blocked_auth; 소유 계정 재인증만 해제 |
| saved | 새 편집 | edit draft(base_version) → CAS 저장 또는 conflict |
| ready | 삭제 요청 | deleting → 객체 정리 → 행 제거 |
| deleting | 오래된 edit/save | 거부; ready로 되돌릴 수 없음 |

uploading/finalizing 중 payload는 불변 snapshot이다. 수정하려면 진행 결과를 먼저 확인하고 별도 edit로 처리한다. 전송 중 취소는 “전송 대기 중단”이며 이미 서버에 확정됐을 수 있다. 서버 조회 후 저장됨이면 Record 삭제를 별도 확인한다. 존재 여부가 불명확할 때 원본을 지우지 않는다.

## 7. Supabase 인증·권한

공식 [OTP 문서](https://supabase.com/docs/guides/auth/auth-email-passwordless)의 Email OTP 경로를 사용한다. signInWithOtp는 이름만으로 숫자 메일을 보장하지 않으므로 메일 template을 숫자 token 방식으로 설정하고 실제 수신 테스트를 한다. 신규 가입을 허용하는 단일 입력 흐름, verifyOtp의 email 타입을 사용한다. 프로젝트 설정 기본 제안은 6자리·10분 만료·재발송 최소 60초이며 실제 설정과 UI 안내를 맞춘다. 서비스의 서버 rate limit 판정을 우선한다.

세션 복원과 foreground refresh는 [React Native 가이드](https://supabase.com/docs/guides/auth/quickstarts/react-native)를 참조하되 공개 예제의 저장 수단을 민감 세션 저장의 최종 보안 결정으로 그대로 복제하지 않는다.

### 권한 표

| 대상 | anon/미인증 | 소유자 | 타 계정 | 제한된 서버 처리 |
|---|---|---|---|---|
| Record 조회 | 거부 | 자기 행만 | 거부 | 정리/검증 목적만 |
| create/edit/finalize RPC | 거부 | 자기 계정 상태·버전 검증 후 | 거부 | 같은 검증 필수 |
| Storage download | 거부 | 자기 ready 결과만 | 거부 | 정리/해시 검사 |
| Storage upload | 거부 | 자기 uploading 예약 경로 1개만 | 거부 | 검증 실패 정리 |
| Record/Storage 삭제 | 거부 | 삭제 요청만 | 거부 | 삭제 작업 소유 범위만 |

[RLS 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)에 따라 grants와 RLS를 함께 구성한다. 모든 노출 테이블 RLS, 소유자 조건 auth.uid()=user_id, UPDATE의 기존 행 USING/새 행 WITH CHECK, 소유자 변경 금지를 검사한다. 클라이언트의 user_metadata를 권한으로 쓰지 않는다. 익명 Auth 가입은 Phase 1 사용하지 않는다.

일반 클라이언트에는 읽기와 제한된 mutation RPC만 부여한다. ready/status/version/path를 Data API 직접 UPDATE해서 finalize나 CAS를 우회하지 못하게 한다. RPC는 명시적 UID 검증·허용 필드 검증·row lock을 수행한다. 권한상 SECURITY DEFINER가 필요한 경우 search_path 고정, PUBLIC/anon EXECUTE 회수, 최소 권한 함수 소유자, 호출자 UID/account 상태 검증을 필수로 한다. 직접 쓰기 권한이 없는 invoker 함수로 우연히 동작할 것이라 가정하지 않는다.

Storage는 private bucket stamp-images다. [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)에 따라 객체 경로 첫 segment와 UID만 비교하는 데서 끝내지 않고 해당 Record의 경로/상태도 검사한다. 클라이언트 upsert=false, 기존 이미지 덮어쓰기·직접 삭제는 허용하지 않는다. 공개 URL을 저장하거나 private 데이터를 public bucket으로 옮기지 않는다.

다운로드는 인증 요청으로 가져오는 방식을 기본으로 한다. [비공개 파일 제공](https://supabase.com/docs/guides/storage/serving/downloads)의 signed URL은 필요할 때만 짧게 쓰며 DB 영구 링크로 저장하지 않는다. private Storage는 종단간 암호화나 AI 익명화의 보장이 아니다.

앱에는 publishable key만, service_role/secret은 서버 측 관리 경계에만 둔다. 서버는 요청 body의 UID 대신 검증된 세션의 UID를 기준으로 작업한다.

## 8. 저장 프로토콜과 정리

DB와 Storage는 한 트랜잭션이 아니다. 다음 순서를 계약으로 고정한다.

1. 클라이언트가 로컬 초안+최종 Stamp를 확보하고 operation_id와 canonical payload hash를 고정한다.
2. begin_record가 UID/계정 상태를 검사하고 uploading 행과 불변 path를 예약한다. 동일 ID/hash는 예약/ready 상태를 반환하고 다른 hash는 conflict다.
3. 클라이언트가 해당 경로에 최종 PNG를 업로드한다. 이미 존재하면 임의 overwrite하지 않고 finalize 확인으로 이동한다.
4. 인증된 finalize 처리기가 객체 존재·실제 포맷/dimensions/크기·checksum을 확인한다. 애플리케이션 업로드 경로에는 원본 URI를 받는 인수가 없다. 서버는 파일만 보고 원본 여부를 완벽히 판별하지 못하므로 비업로드는 클라이언트 데이터 경계+전송 검증으로 입증한다.
5. DB transaction에서 UID·계정 active·status=uploading·operation/hash를 다시 확인하고 검증된 payload와 ready 상태를 확정한다. 이미 ready이며 같으면 같은 성공을 반환한다.
6. 클라이언트가 ready/hash를 확인한 후 성공 표시·원본 정리. 응답 유실 시 같은 ID 조회로 확인하며 새 UUID를 만들지 않는다.

begin/finalize/abort/edit/delete는 제품용 mutation 경계 이름이며 아직 배포된 API가 아니다. 구현 때 하나의 작은 인증 서버 모듈과 제한된 DB 함수로 구성할 수 있다. 새 범용 워크플로 엔진은 필요 없다.

서버 실행 주체는 **Supabase Edge Function의 단일 record-lifecycle 모듈**로 정한다. 사용자 요청은 검증된 JWT/UID, 정리 호출은 Vault에 둔 서버 전용 자격으로 구별한다. 함수 안에서만 Storage/Auth 관리 key를 사용하고 요청에 담긴 경로·UID로 관리 작업 범위를 확장하지 않는다. 지연 삭제·고아 정리는 Supabase Cron이 15분마다 같은 모듈의 정리 동작을 호출하는 기본값이다. 제한된 batch와 재시도 상태를 사용하며 앱 foreground에만 삭제 책임을 맡기지 않는다. [Edge Functions](https://supabase.com/docs/guides/functions), [Cron](https://supabase.com/docs/guides/cron)의 실제 설정·실행 제한을 구현 전에 확인한다.

**오류·재시도:** 네트워크/5xx는 foreground에서 2/5/15초 간격 최대 3회 자동 재시도 후 수동 재시도, 429는 Retry-After 우선. 401은 세션 갱신 1회 후 blocked_auth. validation/forbidden/hash conflict는 자동 재시도 금지다. 오프라인 동안 timer를 계속 돌리지 않는다.

**중간 데이터:** uploading 예약 24시간 무활동은 정리 후보이며 사용자의 로컬 초안은 남긴다. 정리 작업이 row lock으로 deleting으로 바꾼 뒤 Storage 삭제→행 삭제 순서로 실행한다. finalize가 먼저 ready가 됐으면 정리 대상에서 제외한다. 클라이언트는 정리 중이면 기다리고 행이 없어졌을 때 같은 ID/hash로 다시 예약한다. 작업 중 업로드 경합으로 생긴 미참조 객체는 삭제 후 재검사 및 주기적 고아 검사로 수렴시킨다.

**고아 객체:** 예약 없는 객체/참조 불일치 중 24시간 grace를 지난 항목만 제한된 서버 작업이 정리한다. 업로드 시점·상태를 재검사하고 개인 이미지를 정리 로그에 첨부하지 않는다. 정리 실패는 재시도 상태와 operation 식별자만 남긴다.

## 9. 변경·삭제·계정 탈퇴

### 기존 Record 편집

update_record는 base_version과 operation_id/hash를 받는다. 잠금 안에서 owner·active·ready·version 일치를 검사한 뒤 허용 필드만 갱신하고 version+1. 마지막 operation과 동일하면 같은 성공을 반환한다. 그 뒤 다른 편집이 반영된 오래된 operation은 conflict와 현재 version을 반환하며 이전 값을 다시 적용하지 않는다. 오래된 version은 최신 값을 조회하고 내 편집을 재적용하며, deleting/없는 ID는 not_found다. upsert로 삭제된 Record를 다시 만들지 않는다. create 응답 복구는 편집 hash가 아니라 불변 creation_operation_id/creation_payload_hash로 확인한다.

원격 목록은 화면 focus·수동 새로고침·변경 성공 때 재조회한다. 캐시는 오래됐음을 표시하고 전역 즉시 동기화를 약속하지 않는다. 오프라인 수정은 로컬 edit draft/outbox이며 서버 충돌 해결 전 성공 표시하지 않는다.

### Record 삭제

delete_record는 row lock으로 deleting 전환, 사용자 목록에서 숨김 → 서버 Storage 객체 삭제 → Record 행 삭제. 중간 실패는 deleting으로 재시도한다. 이미 없는 객체/행은 멱등 성공이다. 서버 정리 뒤 클라이언트 캐시·draft를 제거한다. offline 기기의 과거 편집은 다음 연결 시 not_found로 막고 서버 삭제 사실을 알린다.

삭제 의도가 있는 delete/abort는 deleting 전환과 같은 DB 트랜잭션에서 record_tombstones(user_id, record_id, deleted_at)를 기록한다. 원본·이미지·메모는 포함하지 않는다. begin_record가 이 UID/ID를 다시 예약하지 못하도록 검사하며 tombstone은 계정 유지 동안 보존한다. 새로 만들기는 새 UUID다. 단순 24시간 미완료 예약 청소는 사용자 삭제가 아니므로 tombstone 없이 같은 ID 재시도를 허용한다. 계정 탈퇴 때 tombstone도 제거한다.

서버 확인 전 클라이언트가 삭제 취소/복구를 제공하지 않는다. 업로드 중인 신규 기록의 폐기는 abort도 같은 deleting 경로로 처리한다. 서버 결과 불명확 시 대기 상태를 보존하고 원본 폐기 경고와 구별한다.

### 계정 탈퇴

계정 삭제는 데이터 수명 계약이며 스토어 정책 문서가 아니다. 서버 전용 account_deletion_jobs(user_id PK, requested_at, status, last_error, attempts)를 둔다.
- 최근 재인증(기본 5분 이내)을 확인한 endpoint가 active 계정을 deleting으로 잠근다. 모든 create/edit/finalize·Storage 쓰기가 이 잠금을 검사한다.
- 전체 세션 해제를 요청하고 해당 사용자의 Storage 객체를 API로 삭제한 뒤 DB Record·Auth user를 정리한다. Auth user 삭제만으로 Storage 정리를 대신하지 않는다.
- 실패는 재시도 가능한 서버 job에 남기고 새 업로드/로그인을 통한 사용 재개를 허용하지 않는다. 앱을 닫아도 정리가 계속될 수 있어야 한다.
- 클라이언트는 접수 후 자기 데이터 접근을 잠그고 로컬 민감 데이터를 정리한다. 삭제 완료의 인증된 조회 수단 또는 접수 토큰 기반 제한된 상태 조회를 제공한다. 접수 토큰은 보안 저장소에만 두고 삭제 외 데이터를 읽지 못하게 한다.
- 삭제 완료 job의 직접 UID는 결과 확인 뒤 제거하고, 남기는 운영 집계는 비식별 상태/실패 건수로 한정한다. 삭제 재요청은 이미 삭제된 계정으로 새 데이터를 만들지 않는다.

[Supabase 사용자 관리](https://supabase.com/docs/guides/auth/managing-user-data)는 사용자 삭제 뒤 기존 JWT가 만료 전 유효할 수 있음과 Storage 소유 객체 정리 필요를 설명한다. 앱의 계정 잠금 검사를 적용하고, 백업/로그의 실제 보존 기간까지 즉시 삭제됐다고 안내하지 않는다. 서비스 백업의 보존 기간·제거 가능성은 실제 프로젝트 구성 확인 전 약속하지 않는다.

## 10. 모델 파일과 런타임 계약

모델 manifest에는 model_id/revision, 파일별 SHA-256/bytes, license URL+확인 revision, 허용 runtime/OS, 필요한 disk/RAM, input/output 규격, prompt version을 기록한다. 공개 이름만으로 모델을 내려받지 않는다.

다운로드는 temp 경로→bytes/hash 확인→활성 pointer 원자적 교체. 중단 시 이전 정상 모델은 유지하고 불완전 파일은 실행하지 않는다. 다운로드한 모델에 포함된 임의 원격 코드를 신뢰 실행하는 경로는 앱에 두지 않는다. 서명/출처 확인과 네이티브 binary 버전은 구현 단계에서 묶어 고정한다.

출력 품질 승인과 iOS/Android 호환성은 별도 게이트다. Mac에서 실행된다는 이유로 ONNX/ExecuTorch/Core ML/LiteRT가 자동 지원한다고 쓰지 않는다. 변환·양자화가 허용되는지와 학습을 요구하는지를 확인하고, 형식 변환 후 동일 사진군을 다시 비교한다.

## 11. 검증 연결과 이번 미실행 범위

- SR-AC-001: 실제 OTP 수신·verify·세션 재실행·만료·다른 사용자·탈퇴 중 요청.
- SR-AC-002~005: 방향/프로필/손상/단색/전체 투명/한계 크기, VLM schema/프롬프트 주입/생략, Stamp 품질·취소·사진 revision, 메모 보존.
- SR-AC-006: 로컬 파일 rename/DB 실패, begin/upload/finalize 각 경계에서 중단, 응답 유실, hash 불일치, 계정 전환, 원본/EXIF/로그/OS 백업 비유출.
- SR-AC-007~008: 31개 pagination, 동일 날짜 tie, 오프라인 캐시, 두 기기 CAS 충돌/삭제, 다른 UID의 DB/Storage/RPC 접근, 정리 경합·고아 객체·계정 삭제 재시도.
- SR-AC-009: 실제 네이티브 기기·폰/태블릿·한/영·접근성·메모리·발열. 기준 시간/기기 게이트는 AI 계획을 따른다.

이번 작업은 문서 설계·공식 자료 대조다. DB migration/RLS·파일 삭제·모델 실행·Development Build를 수행한 것이 아니다. SDK와 Supabase 변경내역은 2026-09-08에 확인했으며 구체 프로젝트 설정은 아직 확인하지 않았다. [Supabase changelog](https://supabase.com/changelog)는 해당 기능 구현 직전에 다시 확인한다.
