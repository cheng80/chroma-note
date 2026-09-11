"""실행: 저장소 루트에서 python3 supabase/tests/gmail_alias_accounts.py

기존 .env.local의 Gmail IMAP 설정으로 +test01~03의 실제 OTP를 확인한다.
계정과 메일은 보존한다. 비밀번호·OTP·토큰은 출력하거나 파일에 저장하지 않는다.
"""

import email
import email.policy
import email.utils
import imaplib
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request


def request(base, key, path, body=None, token=None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        base + path, headers=headers,
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # 인증 오류 응답에도 민감 정보가 있을 수 있으므로 출력하지 않는다.
        return error.code, None


def receive_otp(mailbox, alias, first_uids):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        for folder, first_uid in first_uids.items():
            assert mailbox.select(folder, readonly=True)[0] == "OK"
            status, result = mailbox.uid("search", None, "UID", f"{first_uid}:*", "HEADER", "To", f'"{alias}"')
            assert status == "OK", "별칭 인증 메일 검색 실패"
            for uid in reversed(result[0].split()):
                if int(uid) < first_uid:
                    continue
                status, parts = mailbox.uid("fetch", uid, "(BODY.PEEK[])")
                assert status == "OK", "인증 메일 읽기 실패"
                raw = next(part[1] for part in parts if isinstance(part, tuple))
                message = email.message_from_bytes(raw, policy=email.policy.default)
                recipients = {address.lower() for _, address in email.utils.getaddresses(message.get_all("To", []))}
                if alias not in recipients:
                    continue
                body = message.get_body(preferencelist=("plain", "html"))
                if body is None:
                    continue
                content = re.sub(r"<[^>]*>", " ", body.get_content())
                codes = set(re.findall(r"(?<!\d)\d{6}(?!\d)", content))
                assert len(codes) == 1, "인증 메일의 6자리 코드가 명확하지 않음"
                return codes.pop()
        time.sleep(3)
    raise AssertionError("90초 안에 해당 별칭의 새 인증 메일을 수신하지 못함")


def main():
    # Node의 기존 env 파서를 재사용하고 secret은 자식 프로세스 메모리로만 전달한다.
    configured = subprocess.run([
        "node", "--input-type=module", "-e",
        'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util";'
        'console.log(JSON.stringify({mail:parseEnv(readFileSync(".env.local","utf8")),'
        'app:parseEnv(readFileSync(".env","utf8"))}));',
    ], capture_output=True, check=True, text=True)
    config = json.loads(configured.stdout)
    account, app = config["mail"], config["app"]
    base = app["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = app["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    assert base == "https://jrtuwfateiblzkqtdbgo.supabase.co", "개발 프로젝트만 허용"
    assert account["TEST_EMAIL_IMAP_HOST"] == "imap.gmail.com", "Gmail IMAP만 허용"
    assert int(account["TEST_EMAIL_IMAP_PORT"]) == 993, "TLS IMAP만 허용"
    address = account["TEST_EMAIL_ADDRESS"].strip().lower()
    assert re.fullmatch(r"[a-z0-9.]+@gmail\.com", address), "원본 Gmail 주소 필요"
    aliases = [address.replace("@", f"+test{index:02d}@") for index in range(1, 4)]
    sessions = []
    try:
        with imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30) as mailbox:
            mailbox.login(address, account["TEST_EMAIL_APP_PASSWORD"])
            status, listed = mailbox.list()
            assert status == "OK"
            # Gmail의 자동 보관·스팸 분류도 검사하되 메일을 이동하거나 읽음 처리하지 않는다.
            folders = [line.rsplit(b' "/" ', 1)[1].decode() for line in listed if b"\\All" in line or b"\\Junk" in line]
            assert folders, "Gmail 전체보관함·스팸함을 찾지 못함"
            for alias in aliases:
                first_uids = {}
                for folder in folders:
                    assert mailbox.select(folder, readonly=True)[0] == "OK"
                    first_uids[folder] = int(mailbox.response("UIDNEXT")[1][0])
                status, _ = request(base, key, "/auth/v1/otp", {"email": alias, "create_user": True})
                assert status == 200, f"{alias}: 인증 메일 요청 실패 HTTP {status}"
                print(f"진행: {alias} 인증 메일 발송", flush=True)
                code = receive_otp(mailbox, alias, first_uids)
                status, session = request(base, key, "/auth/v1/verify", {"email": alias, "token": code, "type": "email"})
                assert status == 200, f"{alias}: OTP 인증 실패 HTTP {status}"
                sessions.append(session)
                assert session["user"]["email"] == alias
                assert session["user"]["email_confirmed_at"]
                status, user = request(base, key, "/auth/v1/user", token=session["access_token"])
                assert status == 200 and user["id"] == session["user"]["id"], "로그인 사용자 불일치"
                status, _ = request(base, key, "/auth/v1/verify", {"email": alias, "token": code, "type": "email"})
                assert status in (400, 403), "사용한 OTP 재사용이 차단되지 않음"
                status, refreshed = request(base, key, "/auth/v1/token?grant_type=refresh_token", {"refresh_token": session["refresh_token"]})
                assert status == 200, "세션 갱신 실패"
                sessions[-1] = refreshed
                assert refreshed["user"]["id"] == user["id"], "갱신 후 계정 변경됨"
                print(f"PASS: {alias} 실제 메일 수신·OTP 로그인·재사용 차단·세션 갱신", flush=True)
        assert len({session["user"]["id"] for session in sessions}) == 3, "별칭 계정이 독립적이지 않음"
        supplied = [{"id": session["user"]["id"], "email": session["user"]["email"], "token": session["access_token"]} for session in sessions]
        result = subprocess.run(
            ["node", "supabase/tests/record_access.mjs", "--sessions-stdin"],
            input=json.dumps(supplied), text=True, capture_output=True,
        )
        print(result.stdout, end="", flush=True)
        assert result.returncode == 0, "DB/Storage 검사 실패; 인증정보 보호를 위해 stderr 생략"
    finally:
        errors = []
        for session in sessions:
            try:
                status, _ = request(base, key, "/auth/v1/logout?scope=local", {}, session["access_token"])
                assert status == 204, "검증 세션 로그아웃 실패"
                status, _ = request(base, key, "/auth/v1/token?grant_type=refresh_token", {"refresh_token": session["refresh_token"]})
                assert status in (400, 401, 403), "로그아웃한 세션의 갱신이 차단되지 않음"
            except Exception:
                errors.append(session["user"]["email"])
        assert not errors, "검증 세션 종료 실패: " + ", ".join(errors)
        print(f"PASS: 검증 세션 {len(sessions)}개 종료·갱신 차단, 계정 보존", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # 원본 예외/traceback에는 인증 응답이 포함될 수 있으므로 직접 만든 assertion만 표시.
        print("FAIL: " + (str(error) if isinstance(error, AssertionError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
