# Chroma Note

사진의 원래 색을 선으로 남기고, 내 메모와 함께 모으는 **컬러 선화 다이어리**입니다.

소개 문구 제안: **그날의 색을, 선으로 남기다.** 사진을 원래 색이 담긴 선화로 바꾸고, 기억하고 싶은 이야기를 더합니다. 날짜·태그·즐겨찾기로 Book을 다시 펼쳐 봅니다.

현재 앱 UI는 테스트 대역으로 구현돼 있으며, 컬러 선화는 별도 실험 앱에서 iPhone과 iPad mini 6 실행을 확인했습니다. 제품 앱의 실제 모델·인증·저장 연결, Android 검증은 남아 있습니다. **사진 임포트 전용**, Phase 1 핵심 기능 기준입니다. 스토어 출시 준비는 이번 범위 밖이며 실제 결제 정책·연동 문서는 Phase 2에서 별도로 다룹니다.

- [문서 안내](docs/README.md)
- [제품 명세](docs/01_PRODUCT_SPEC.md)
- [기술 명세](docs/02_TECH_SPEC.md)
- [현재 상태와 구현 순서](docs/03_PROJECT_STATUS.md)
- [AI·대표색 검증 계획](docs/05_AI_VALIDATION_PLAN.md)

기획 정본은 [설계 결정](docs/adr/ADR-003-stamp-record-direction.md)과 [화면 설계](docs/design/DESIGN_BRIEF.md)입니다. 2026-09-10 컬러 선화 방향으로 문서를 갱신했으며, [Pen 디자인·미리보기](design/README.md)도 실제 선화 출력으로 갱신했습니다. 앱의 기존 문구·이미지와 실제 모델 연결은 후속 반영 대상입니다. 실제 선화와 측정 조건은 [선화 실험 결과](experiments/model-selection/LINE_ART_RESEARCH.md)에서 확인합니다.

개발 명령은 package.json, 적용 지침은 [AGENTS.md](AGENTS.md)에서 확인합니다. 모델/네이티브 기능은 Development Build를 목표로 하며 모델 선정과 실기기 검증이 남아 있습니다.
