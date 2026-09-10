# Chroma Note 프로젝트 현황

갱신일: **2026-09-11 (Asia/Seoul)**. 코드 확인 기준: `b04f8cf`, Pen 변경 기준: `c2ece32`. 이번 문서·DB 변경의 커밋은 Git 이력에서 확인한다.

현재: **컬러 선화 기획·Pen 반영 완료 / VLM 평가 50장 확보·품질 미달 / Supabase 테이블·RLS·Storage 보완 및 권한 검증 완료 / 저장 API·실제 앱 연결 미완료**.

## 1. 현재 범위와 변경

- 제품은 사진의 원본 RGB를 선에 입힌 흰 배경 컬러 선화 다이어리다. Informative Drawings `style1` 선 마스크에 같은 위치의 원본색을 적용한다. 스타일 2·색면 채우기·5색 양자화·외곽선 확장·거친 인쇄·확산형 이미지 생성은 현재 범위가 아니다.
- 태그는 사진 처리 시 자동 분석하고 AI 메모는 사용자 요청 시에만 생성한다. 사용자 메모를 자동으로 덮어쓰지 않는다.
- 원본과 파생 원본은 기기에서만 처리하고, Supabase에는 완성 선화 PNG와 기록 정보를 계정별 비공개로 보관한다. 앱 전체에서 이 경계가 검증됐다는 뜻은 아니다.
- 최신 문서만 유지한다. 현재와 모순되는 과거 작업 지시·미착수 표기·폐기한 실험 비교 기준을 제거했다. [제품](01_PRODUCT_SPEC.md)·[기술](02_TECH_SPEC.md)·[ADR](adr/ADR-003-stamp-record-direction.md)이 계약 정본이다.
- 이전 Git 정리는 `b04f8cf`로 main에 반영됐다. 이번 시작 시 로컬/원격 main만 존재하고 추가 Worktree가 없음을 확인했다. 보존용 stash는 자동 폐기하지 않는다. 완료 조건은 [작업 흐름 §7](04_WORKFLOW.md#7-git데이터-보호)을 따른다.
- 폐기한 FLUX·SD-Turbo·DreamLite 등 Stamp 생성 실험의 코드·산출물·의존성을 정리했다. VLM·현재 선화 자료와 SmolVLM2 ontology adapter·검증은 보존했다. 삭제한 로컬 정리 보고서 링크를 현재 증거로 사용하지 않는다.

### 디자인과 선화

[Pen 안내](../design/README.md): 저장 완료, **루트 60개·재사용 15개·placeholder 0개**. 스타일 1로 변환한 디자인 이미지 51곳·문구 71곳, 대표 7화면 시각 검사·PNG 19개 내보내기를 완료한 기록이다. clipping 19개는 비활성 텍스트 11개와 스크롤/확대 영역 8개로 구별했다. 디자인용 생성 원본의 변환은 사용자 사진군 품질 합격 근거가 아니다.

[선화 실험 결과](../experiments/model-selection/LINE_ART_RESEARCH.md)의 날짜·단계별 측정을 따른다.

| 측정 | 확인 결과 | 남은 한계 |
|---|---|---|
| Mac 스타일 1·원본 RGB 마스킹 | 사진 5장, 이전 선 픽셀 범위 유지·색 합성 검증. 카페 입력 512→1024px 디테일 비교 | 얼굴·손·식생 세부 손실, 최종 제품 품질 승인과 구별 |
| iPhone 14 Pro Max / iOS 26.6 | 별도 앱 40회. warm 중앙값 작은 사진 0.056~0.075초, 카페 0.209초; 최초 모델 준비 0.881초 | 제품 앱·VLM 전체 흐름이 아닌 선화 단독 |
| 현재 기준 iPad mini 6 / iPadOS 26.6.1 | 카페 1024/1536px 각각 최초 1회+반복 5회. warm 중앙값 0.223789→0.600536초, +0.376747초·2.68배. peak footprint 87.3→177.6MiB | 얼굴·손 개선이 크지 않아 기본 1024px 유지. 장시간·임의 크기·Android·전체 앱 미검증 |

선화 실험은 최초 원출력 품질 미달 → 원본색 마스킹 → 실기기 시간 측정으로 이어졌다. 초기 실패를 후속 실측이 없다는 뜻으로 읽지 않으며, 시간 통과를 품질 합격으로 계산하지 않는다. 해상도 변경 외 Lanczos 전처리·실수 마스크 합성 개선은 미적용이다.

## 2. 실제 구현 사실

- `src/app/_layout.tsx`는 Expo Router Stack, `src/app/index.tsx`는 `src/ui/AppDemo.tsx` 진입이다.
- 인증·Book·처리·비교 1/2·요약 2/2·편집·상세는 **메모리 상태와 fixture를 이용한 UI**다. 실제 기기 사진 임포트, 대표색, VLM/선화 모델, SQLite 초안, Supabase 인증/저장은 앱에 통합되지 않았다. 앱 종료 후 데이터 보존을 보장하지 않는다.
- 공통 `RecordArtwork`로 선화·날짜/장소·전체 글·태그를 표시한다. 상세 사진 팝업은 1~4배 확대·이동·초기화를 제공한다.
- 내보내기는 같은 기록을 1080px PNG로 합성해 OS 사진 보관함에 추가한다. 권한·캡처·저장 실패를 구분하고 원본·버튼·상태 문구는 출력하지 않는다.
- 패키지는 npm/`package-lock.json`으로 관리한다. 실제 버전·검증 명령은 `package.json`을 확인한다.
- `tsconfig.json`에서 실험 `data/`를 제외해 vendor 코드 때문에 실패하던 전체 타입 검사를 해결했다. EAS 연결·Expo Go UI 검증과 네이티브 모델 포함 제품 빌드 완료는 별개다.

## 3. 보존할 설계 기본값

| 항목 | 현재 계약 |
|---|---|
| 기록/입력 | 사진 1장 임포트 → 선화 하나+대표색/글/태그. 카메라·일괄 입력 제외 |
| 초안/원본 | 계정·기기별 신규 1개+편집 1개, 서버 ready 확인 전 원본 보존 |
| AI 실패 | VLM은 명시 생략 허용; 선화·대표색 실패는 완성 저장 불가 |
| 저장/충돌 | 동일 ID·operation/hash, image+DB 검증, version CAS |
| 날짜/장소 | 별도 달력 날짜와 사용자 장소명; 좌표 없음 |
| 탐색/삭제 | Book 날짜·태그·즐겨찾기; 영구 삭제·탈퇴 정리는 서버 재시도 |
| 제외 | 원본 서버 업로드, 클라우드 사진 AI, 지도/공개 공유/다중 스타일, 스토어 출시 준비 |
| 후속 | 실제 결제 정책·연동은 핵심 기능 완료 후 Phase 2에서 별도 요청 |

상세 기본값은 제품·기술 명세를 따른다. 기본값과 사용자의 개별 승인·실측 결과를 구별한다.

## 4. 작업 체크리스트와 완료 기준

모델 선정과 UI·Supabase 구축은 독립 진행할 수 있다. **2026-09-11 사용자가 문서 최신화와 실제 DB·Storage·RLS 정합화를 요청했다.** 과거 모델 선정 대기 조건은 이번 서버 설정의 선행 조건이 아니다. 실제 모델 연결·앱 통합 완료에는 각 검증 게이트가 필요하다.

### 4.1 AI 모델 선정 테스트

- [x] **PLAN-00 / 평가 자산:** smoke 5장과 frozen 40장+holdout 10장·annotation·출처/hash를 확보했다. 원본/캐시는 Git 제외다.
- [ ] **PLAN-00 / 환경·사용조건:** 실행할 후보의 정확한 가중치·런타임·변환/재배포 조건과 목표 모바일 범위를 확정한다.
- [ ] **PLAN-01 / VLM·대표색:** SmolVLM2 50장 실행은 완료했지만 품질 미달. 대표색 알고리즘 비교·결정성 검증은 미실행이다.
- [ ] **PLAN-02 / 선화:** 현재 원본 RGB 선화와 승인된 결과를 기준으로 사람·사물·배치·세부 보존을 검증한다. 과거 ChatGPT 도장 유사도를 기준으로 쓰지 않는다.
- [ ] **PLAN-03 / 모바일·선정:** iPad mini 6에서 VLM·선화 전체 대기, 최초/재사용 로드·취소·오프라인·장시간·메모리와 Android 경로를 검증한다.
- [ ] **모델 선정 완료:** 모델·대표색 방식·언어·사진군·사용조건·기기별 통과/실패와 제한을 결과에 근거해 확정한다.

### 4.2 프론트엔드 — UI와 실제 데이터 연결 구분

- [x] **PLAN-05 / 화면:** 인증·Book·처리·비교·요약·편집·상세·내보내기 UI 구현.
- [ ] **PLAN-05 / 모바일·로컬 데이터:** safe area·키보드·200% 글씨·한/영·VoiceOver/TalkBack, 실제 임포트·초안 영속성·실패 복구 검증.
- [ ] **PLAN-06 / 선정 모델 연결:** 실제 대표색/VLM/선화, 준비·취소·오류·revision과 메모 보존을 앱에 연결.
- [ ] **프론트엔드 완료:** UI 대역 검증과 실제 로컬 처리/영속 데이터 검증을 각각 통과.

### 4.3 Supabase 구축 — 별도 개발 환경 검증

- [x] **PLAN-04 / 환경·정상 인증:** 개발 프로젝트·키 분리, 이메일 OTP 정상 발송/인증/세션 조회/로그아웃 확인.
- [x] **PLAN-04 / 테이블·Storage·RLS:** 누락 필드·태그/색상 CHECK, private PNG 버킷, A/B/미인증 권한·파일 제한·계정 잠금 검증.
- [ ] **PLAN-04 / 저장 API:** begin/upload/finalize·edit CAS·abort/delete·탈퇴·정리 worker 구현. 서버 시각/version·불변 열·metadata allowlist·실제 PNG/hash도 여기서 검증.
- [ ] **PLAN-04 / 재현성:** 전체 migration을 폐기 가능한 별도 DB에 재적용하고 Auth/서버 API·중복·응답 유실·부분 실패·삭제 후 재생성 방지를 검증.
- [ ] **Supabase 구축 전체 완료:** 앱 없이 저장·편집·삭제 수명까지 통과. 테이블·권한 세팅 완료와 구별.

[단계별 가이드](supabase/SETUP_GUIDE.md)와 [체크리스트](supabase/SETUP_CHECKLIST.md)는 다른 앱용 빈 템플릿으로 유지한다. 이 프로젝트의 실제 상태는 아래가 정본이다.

| 단계 | 적용 상태 |
|---|---|
| SB-01~02 환경·키 | `chroma-note-dev` / `jrtuwfateiblzkqtdbgo` / 도쿄 `ap-northeast-1`, ACTIVE_HEALTHY. 앱 `.env`와 서버 `docs/supabase/.env.server` 분리·Git 제외 |
| SB-03 인증 | 이메일 OTP 6자리·600초, Gmail SMTP 465·재발송 최소 60초. 정상 경로 통과; 오입력·만료·제한·기존 계정 재로그인·앱 세션 복원은 남음 |
| SB-04 데이터 | `stamp_records` 32열, 내부 관리 2개 테이블. 보완 migration `20260910152811_align_record_contract` 적용 |
| SB-05 파일 | `stamp-images` private, image/png, 5MiB. 본인 uploading 예약만 INSERT, 본인 ready만 SELECT, upsert/직접 삭제 차단 |
| SB-06 서버 | 제품 mutation RPC·Edge Function·정리 작업 미구현. 내부 검증/RLS 함수 3개는 제품 API가 아님 |
| SB-07 독립 검증 | SQL·29개 HTTP API 확인 통과. 전체 저장 수명·깨끗한 DB 재구축은 미실행 |
| SB-08 실제 연결 | 앱 Supabase 클라이언트·실제 모델/초안 연결 미완료 |
| SB-09 운영 | 해당 없음 — 출시·과금 준비 제외 |

**인증/키 인수인계:** 공개 키 `/auth/v1/settings` HTTP 200, 서버 키 `/rest/v1/` HTTP 200을 확인했다. 공개 키의 OpenAPI `/rest/v1/` 401은 데이터 조회 검증과 별개다. 2026-09-09 Gmail SMTP 인증 실패를 설정 수정 후 해소했고, 가입 코드 수신→verify 200→user 200→logout 204를 확인했다. 테스트 OTP는 비웠으며 토큰을 보관하지 않았다. 정상 인증 계정 1개는 유지한다. 앱/서버 키·SMTP 비밀번호를 다시 요청하거나 문서에 복사하지 않는다.

**현재 단계 → 다음:** SB-04/05 보완·권한 검증 완료 → SB-06 서버 저장 수명 구현. 이번 테스트는 합성 계정만 사용했고 기존 계정·자료를 수정/삭제하지 않았다.

### 4.4 실제 연동과 통합 검증

- [ ] **PLAN-07:** 서버 독립 검증과 프론트엔드 준비 후 대역을 실제 OTP·세션·DB·Storage/API로 교체한다. 오프라인·응답 유실·충돌·계정 변경에서 초안과 원본을 보존한다.
- [ ] **PLAN-08:** iOS/Android에서 임포트→색/VLM/선화→비교→요약→저장→Book→편집/삭제를 완주하고 접근성·원본의 네트워크/로그/OS 백업 비유출을 검증한다.
- [ ] **통합 완료:** SR-AC-001~011의 실제 결과와 미실행 항목을 남긴다. 모델·UI·서버·통합 완료를 서로 대신하지 않는다.

| 작업 | 선행 |
|---|---|
| PLAN-00 | 없음 — 평가 자산·환경·사용조건 |
| PLAN-01 / PLAN-02 | PLAN-00 — 독립적인 VLM/대표색·선화 비교 |
| PLAN-03 | 후보별 기초 품질 확인 — 모바일 검증·선정 |
| PLAN-04 / PLAN-05 | 현재 계약과 사용자 승인 — 서버 구축·UI 독립 진행 |
| PLAN-06 | PLAN-05·PLAN-03 선정 결과 — 모델 앱 연결 |
| PLAN-07 | PLAN-04/05/06 — 실제 서비스 연결 |
| PLAN-08 | PLAN-07 — 두 플랫폼 전체 인수 |
| Phase 2 | 핵심 기능 완료 후 별도 요청 |

## 5. 남은 증거 게이트

| ID | 상태 | 증거 / 다음 행동 |
|---|---|---|
| BENCH-SET-001 | DATASET_READY | manifest·annotation 각 50장, frozen 40+holdout 10. 확보 완료와 품질 합격은 별개 |
| MODEL-001 | QUALITY_FAIL | SmolVLM2 실행/schema 50/50, precision 90/115=78.26%, core coverage frozen 67.5%·holdout 40%. 기준 90% 미달, 보조 제안 실험만 유지 |
| MODEL-003 / SIMULATOR-001 | NATIVE_PARTIAL | Qwen·SmolVLM 계열 별도 네이티브 실행 근거 있음. 50장 실행은 사진마다 새 프로세스·모델 로드 포함, warm 제품 성능 아님 |
| LINEART-001 | DEVICE_PARTIAL | 위 선화 단독·해상도 검증. 세부 품질·전체 앱·Android·장시간 검증 남음 |
| COLOR-001 | NOT_RUN | 실제 픽셀 decoder·색공간·군집 알고리즘·단색/투명/비중 |
| DEVICE-001 | SELECTED_PARTIAL | 현재 실 테스트 기기 iPad mini 6. VLM 포함 전체 앱 성능 미검증 |
| DATA-001 | CONFIG_PASS / LIFECYCLE_NOT_RUN | 테이블/Storage 권한과 데이터 제약 통과. 저장 멱등성·CAS·정리·탈퇴 전체 흐름 미구현 |
| PRIVACY-001 | NOT_RUN | 실제 앱 네트워크·로그·파일/OS 백업에서 원본 비유출 |
| ENV-001 | PASS | 전체 TypeScript·lint 통과. 이전 vendor 포함 오류 해결 |

VLM 측정 근거는 [SMOKE_RESULTS](../experiments/model-selection/SMOKE_RESULTS.md)와 로컬 `data/plan01-vlm-smolvlm2-20260910T025411Z/summary.json`이다. 후속 `113000Z`·`113500Z` 시도는 모델 로드 실패이며, 앞선 품질 측정이나 성공으로 합산하지 않는다. 전체 50장 peak RSS·대표색은 NOT_RUN이다. 모델이 기준에 못 미쳐도 원본을 클라우드 AI로 보내는 방식으로 자동 전환하지 않는다.

## 6. 검증 상태

### 이번 문서·Supabase 정합화 — 2026-09-11

- 원격 migration `20260910152811` 적용 성공. 기존 초기 migration `20260910082557`도 원격 기록 그대로 [로컬 migration 폴더](../supabase/migrations/)에 복원했다.
- [SQL 검사](../supabase/tests/record_contract.sql): 빈값/중복/다차원/NFC/24자 태그, 잘못된 팔레트 키·HEX/RGB·weight, 메모 300 code point 경계, 실제 CHECK 거부, 본인 조회·탈퇴 잠금·삭제된 UID 차단 통과. 전체 트랜잭션 ROLLBACK.
- [HTTP 검사](../supabase/tests/record_access.mjs): `node supabase/tests/record_access.mjs`. 개발 프로젝트 guard와 기존 로컬 env를 사용한다. 합성 계정 2개로 DB 격리·직접 쓰기 차단·예약 경로·PNG/5MiB·ready 조회·타인/미인증 차단·upsert/직접 삭제 차단 등 29개 확인 통과. 테스트용 서버 직접 ready 설정은 finalize API 검증이 아니다.
- 테스트 계정/기록/파일 정리 후 **Auth 1개, Record 0개, 객체 0개, 내부 삭제 자료 0개**를 다시 확인했다. 실제 사용자 사진·메일 발송을 사용하지 않았다.
- DB 성능 Advisor 항목 0개. 보안 오류 0개이며 내부 테이블의 정책 없는 RLS INFO 2개는 서버 전용 차단 의도다. 유출 비밀번호 보호 비활성 WARN 1개는 기존 설정이며 OTP 제품 경로와 별도다. [판정 근거](06_DATA_MODEL_REVIEW.md#보안-진단).
- `npx tsc --noEmit`, `npm run lint` 통과. 앱/UI 코드 변경은 없으며 이전 모델 실험·시뮬레이터 검사를 이번 실행으로 반복 집계하지 않는다.
- 문서 로컬 경로·앵커 159개 확인, DBML→PostgreSQL 변환 통과. 초기·보완 migration 파일 내용은 원격 이력과 일치한다. API 검사의 실패 정리 순서를 보완했으며 중간 검사 코드 오류도 수정·재실행했다. 실패 시 fixture가 정리됨을 실제 확인했다.

### 유지되는 이전 검증과 공백

- UI 상태 전이·내보내기 크기·Android 확대 좌표 검사, iOS/Android/Web export를 통과한 기록이 있다. iOS Simulator에서 전체 기록·상세 팝업·1080px PNG 갤러리 저장을 확인했다.
- iOS 두 손가락 자동화, Android 멀티터치·TalkBack, 실기기 safe area·키보드·스크린리더·초안 복구는 아직 미검증이다.
- Pen 정적 검증은 최신 60/15/0 기준을 사용한다. 이전 46개 루트·14개 컴포넌트 검증 수치를 최신 파일에 적용하지 않는다.
- 이번에는 모델 추론을 다시 실행하지 않았다. VLM·선화의 실행 조건과 상세 검사는 각 실험 결과 문서를 따른다.

## 7. 다음 작업

1. `record-lifecycle`의 begin/finalize/abort/edit/delete·탈퇴/정리 경계를 구현하고 멱등성·CAS·불변 열·실제 파일/hash·metadata 검증을 완성한다.
2. iPad mini 6에서 VLM 태그·명시 AI 메모까지 포함한 전체 대기시간과 품질을 검증한다. Expo Go는 UI 검사용이며 앱 내부 AI는 네이티브 코드가 포함된 자체 빌드로 확인한다.
3. 실제 모델·서버·로컬 영속 초안을 앱에 연결하고 Android 및 전체 회귀·개인정보 인수 기준을 검증한다.

문서·테이블 설정 완료를 제품 앱 저장 완료로 안내하지 않는다.
