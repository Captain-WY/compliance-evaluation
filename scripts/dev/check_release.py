"""Check the Git index before publishing. Never print credential values."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    paths = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).decode("utf-8").split("\0")
    errors: list[str] = []
    forbidden = {".local", ".superpowers", "node_modules", ".venv", "frontend_backup", "__pycache__"}
    old_roots = {"compliance-evaluation", "sld-cms", "tmp"}
    secret_patterns = [
        rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        rb"gh[pousr]_[A-Za-z0-9]{30,}",
        rb"github_pat_[A-Za-z0-9_]{30,}",
    ]
    # Compare against generated credentials, without logging their values.
    values: set[bytes] = set()
    local_env = ROOT / "deploy/local/.env"
    if local_env.exists():
        for line in local_env.read_text(encoding="utf-8-sig").splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            name, value = line.split("=", 1)
            value = value.strip().strip("\"'")
            if re.search(r"PASSWORD|SECRET|TOKEN", name) and len(value) >= 12:
                values.add(value.encode())
    paths = list(filter(None, paths))
    blobs = subprocess.check_output(
        ["git", "cat-file", "--batch"], cwd=ROOT,
        input="".join(f":{name}\n" for name in paths).encode("utf-8"),
    )
    offset = 0
    count = 0
    for name in paths:
        count += 1
        path = Path(name)
        if path.parts[0] in old_roots or forbidden.intersection(path.parts):
            errors.append(f"{name}: archived/generated directory tracked")
        if path.name.startswith(".env") and not path.name.endswith(".example"):
            errors.append(f"{name}: environment credentials tracked")
        header_end = blobs.index(b"\n", offset)
        header = blobs[offset:header_end].split()
        if len(header) != 3 or header[1] != b"blob":
            errors.append(f"{name}: index entry is not a regular blob")
            offset = header_end + 1
            continue
        size = int(header[2])
        offset = header_end + 1
        data = blobs[offset:offset + size]
        offset += size + 1
        if len(data) > 10 * 1024 * 1024:
            errors.append(f"{name}: file exceeds 10 MiB")
        if any(re.search(pattern, data) for pattern in secret_patterns):
            errors.append(f"{name}: private key or access token detected")
        if any(value in data for value in values):
            errors.append(f"{name}: generated local credential detected")
    staged = subprocess.check_output(["git", "ls-files", "--stage"], cwd=ROOT).decode("utf-8")
    if any(line.startswith("160000 ") for line in staged.splitlines()):
        errors.append("Git index contains a nested repository/submodule")
    for error in errors:
        print(error)
    print(f"Release index: {count} files, {len(errors)} violations")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
