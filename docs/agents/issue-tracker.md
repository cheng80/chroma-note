# Issue tracker: GitHub

이 저장소의 이슈와 작업 명세는 `cheng80/chroma-note`의 GitHub Issues에 기록한다. 저장소 안에서 `gh` CLI를 사용하며 대상 저장소는 Git remote에서 확인한다.

## 기본 작업

- 생성: `gh issue create --title "제목" --body-file <본문파일>`
- 조회: `gh issue view <number> --comments`. 라벨 등 구조화된 정보는 `--json number,title,body,labels,comments`로 조회한다.
- 목록: `gh issue list --state open --json number,title,body,labels,comments`. 필요에 따라 `--label`과 `--state`를 지정한다.
- 댓글: `gh issue comment <number> --body-file <본문파일>`
- 라벨 추가·제거: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- 종료: `gh issue close <number>`

여러 줄 본문은 파일에 작성하고 `--body-file`로 전달한다. 스킬이 “publish to the issue tracker”를 지시하면 이슈를 생성하고, “fetch the relevant ticket”을 지시하면 해당 이슈와 댓글을 조회한다.

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
