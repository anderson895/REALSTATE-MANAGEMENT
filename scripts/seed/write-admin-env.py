"""Wires a downloaded Firebase service account JSON into .env.local.

    python scripts/seed/write-admin-env.py <downloaded-key>.json

Why a script rather than copy-paste: the private key is ~1700 characters of
PEM with real newlines. It has to become a single quoted line with escaped
newlines, and getting that wrong produces an authentication error that reads
like a permissions problem. This does it the same way every time.

Refuses to write if the key belongs to a different project than .env.local
targets — a mismatched credential authenticates fine and then reads an empty
database, which is a confusing failure to debug.
"""
import json
import os
import re
import sys

BACKSLASH = chr(92)
NEWLINE = chr(10)
ENV_FILE = ".env.local"


def read_env_value(text: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}=(.*)$", text, flags=re.M)
    return match.group(1).strip() if match else ""


def set_env_value(text: str, key: str, value: str) -> str:
    pattern = rf"^{re.escape(key)}=.*$"
    # A callable replacement is required: re.sub processes backslash escapes in
    # a template string, which would turn the escaped newlines back into real ones.
    if re.search(pattern, text, flags=re.M):
        return re.sub(pattern, lambda _m: f"{key}={value}", text, count=1, flags=re.M)
    return text.rstrip(NEWLINE) + f"{NEWLINE}{key}={value}{NEWLINE}"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    key_path = sys.argv[1]
    if not os.path.exists(key_path):
        print(f"ERROR: no such file: {key_path}")
        return 1
    if not os.path.exists(ENV_FILE):
        print(f"ERROR: {ENV_FILE} not found. Run from the repo root.")
        return 1

    with open(key_path, encoding="utf-8") as fh:
        sa = json.load(fh)

    for field in ("type", "project_id", "client_email", "private_key"):
        if field not in sa:
            print(f"ERROR: {key_path} is missing '{field}' — is this a service account key?")
            return 1
    if sa["type"] != "service_account":
        print(f"ERROR: expected type=service_account, got {sa['type']}")
        return 1

    with open(ENV_FILE, encoding="utf-8") as fh:
        env = fh.read()

    target = read_env_value(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID")
    if target and target != sa["project_id"]:
        print("ERROR: project mismatch — refusing to write.")
        print(f"  {ENV_FILE} targets : {target}")
        print(f"  this key belongs to: {sa['project_id']}")
        print("\nDownload the key from the project the app actually points at.")
        return 1

    private_key = sa["private_key"].replace(NEWLINE, BACKSLASH + "n")

    env = set_env_value(env, "FIREBASE_ADMIN_CLIENT_EMAIL", sa["client_email"])
    env = set_env_value(env, "FIREBASE_ADMIN_PRIVATE_KEY", '"' + private_key + '"')
    env = set_env_value(env, "GOOGLE_CLOUD_PROJECT_ID", sa["project_id"])
    env = set_env_value(env, "GOOGLE_APPLICATION_CREDENTIALS", "./" + os.path.basename(key_path))

    with open(ENV_FILE, "w", encoding="utf-8", newline=NEWLINE) as fh:
        fh.write(env)

    written = open(ENV_FILE, encoding="utf-8").read()
    value = read_env_value(written, "FIREBASE_ADMIN_PRIVATE_KEY")

    print(f"Wired {os.path.basename(key_path)} into {ENV_FILE}")
    print(f"  project      : {sa['project_id']}")
    print(f"  client email : {sa['client_email']}")
    print(f"  private key  : {len(value)} chars, "
          f"{value.count(BACKSLASH + 'n')} escape sequences, "
          f"single line={NEWLINE not in value}")
    print("\nNext:  node --env-file=.env.local --import tsx scripts/verify-credentials.ts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
