from __future__ import annotations

ALLOWED_FILE_MIME_TYPES: tuple[str, ...] = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "text/plain",
)
ALLOWED_FILE_TYPES = frozenset(ALLOWED_FILE_MIME_TYPES)
ALLOWED_FILE_EXTENSIONS: tuple[str, ...] = (
    ".pdf",
    ".docx",
    ".xlsx",
    ".png",
    ".jpg",
    ".jpeg",
    ".txt",
)
MAX_FILE_SIZE = 100 * 1024 * 1024
DEFAULT_SCAN_STATUS = "SCAN_DEFERRED"
