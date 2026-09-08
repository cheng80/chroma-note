# Issue tracker: GitHub

이 저장소의 실행 티켓은 `cheng80/chroma-note`의 GitHub Issues에서 관리한다. 제품·기술 계약의 정본은 [문서 목록](../README.md)의 명세이고, 실행 현황은 [프로젝트 현황](../03_PROJECT_STATUS.md)이다. 티켓에는 관련 SR-FR/SR-BR·PLAN ID와 정본 링크를 연결하고 현재 명세와 일치하는지 확인한다. 저장소 안에서 `gh` CLI를 사용하며 대상 저장소는 Git remote에서 확인한다.

## 기본 작업

- 생성: `gh issue create --title "제목" --body-file <본문파일>`
- 조회: `gh issue view <number> --comments`. 라벨 등 구조화된 정보는 `--json number,title,body,labels,comments`로 조회한다.
- 목록: `gh issue list --state open --json number,title,body,labels,comments`. 필요에 따라 `--label`과 `--state`를 지정한다.
- 댓글: `gh issue comment <number> --body-file <본문파일>`
- 라벨 추가·제거: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- 종료: `gh issue close <number>`

여러 줄 본문은 파일에 작성하고 `--body-file`로 전달한다. “fetch the relevant ticket”은 해당 이슈와 댓글 조회다. 생성·댓글·라벨·담당자·종료 등 원격 변경은 현재 사용자 요청에 포함된 경우에 수행한다. 스킬의 “publish” 문구나 문서 갱신만으로 게시 권한을 추정하지 않는다.

## Pull requests as a triage surface

**PRs as a request surface: no.**

외부 PR을 요청으로 접수하려면 이 값을 `yes`로 바꾼다. 이때 같은 triage 라벨과 상태를 적용하며 `gh pr view`, `gh pr diff`, `gh pr list`, `gh pr comment`, `gh pr edit`, `gh pr close`를 사용한다. 자동 탐색은 외부 기여자의 PR을 대상으로 하고, 사용자가 명시한 PR은 작성자와 관계없이 다룬다.

GitHub 이슈와 PR은 번호 공간을 공유한다. `#42`처럼 종류가 불명확하면 `gh pr view 42`로 확인하고 이슈인 경우 `gh issue view 42`로 조회한다.

## Wayfinding operations

`/wayfinder`의 map은 `wayfinder:map` 라벨을 가진 이슈 하나이며 Notes / Decisions-so-far / Fog를 담는다.

- 하위 티켓은 GitHub sub-issue로 연결하고 `wayfinder:<type>` 라벨(`research` / `prototype` / `grilling` / `task`)을 사용한다. sub-issue를 사용할 수 없으면 map 본문의 작업 목록에 연결하고 하위 본문에 `Part of #<map>`을 기록한다.
- 차단 관계는 GitHub issue dependencies를 사용한다. 사용할 수 없으면 하위 본문에 `Blocked by: #<n>, #<n>`을 기록한다. 모든 차단 이슈가 닫혀야 작업할 수 있다.
- 다음 작업은 map의 열린 하위 티켓 중 열린 차단 이슈와 담당자가 없는 첫 항목이다.
- 작업 시작 시 `gh issue edit <n> --add-assignee @me`로 담당자를 지정한다.
- 해결 내용을 댓글로 기록하고 티켓을 닫은 뒤 map의 Decisions-so-far에 요점과 링크를 추가한다.
