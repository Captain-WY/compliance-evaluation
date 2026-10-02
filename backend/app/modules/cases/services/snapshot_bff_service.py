"""Snapshot BFF Service (2.S19).

替代 legacy snapshot_service.py (S19-PRE2 D12)。
snapshotType 路由：FINANCIAL → financial_snapshots，COMPLIANCE → data_snapshots。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

_VALID_SNAPSHOT_TYPES = frozenset({"FINANCIAL", "COMPLIANCE"})

from ..core.exceptions import BusinessException
from ..models.data_snapshots import DataSnapshot
from ..models.financial_snapshots import FinancialSnapshot
from ..providers.storage import IStorageProvider
from ..schemas.dashboard import (
    SnapshotDetailRequest,
    SnapshotDetailResponse,
    SnapshotDownloadUrlRequest,
    SnapshotDownloadUrlResponse,
    SnapshotListItem,
    SnapshotListRequest,
    SnapshotListResponse,
)

_FINANCIAL_TYPE_NAME = "财务快照"
_COMPLIANCE_TYPE_NAME = "合规数据快照"
_FINANCIAL_STATUS_NAMES = {"GENERATING": "生成中", "LOCKED": "已锁定"}
_COMPLIANCE_STATUS_NAMES = {"DRAFT": "草稿", "FINAL": "已定稿"}
_SNAPSHOT_BUCKET = "compliance-snapshots"


def _financial_status_name(status: Optional[str]) -> str:
    return _FINANCIAL_STATUS_NAMES.get(status or "", status or "")


def _compliance_status_name(status: Optional[str]) -> str:
    return _COMPLIANCE_STATUS_NAMES.get(status or "", status or "")


def _fmt_date(d) -> Optional[str]:
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()
    return str(d)


async def list_snapshots(
    req: SnapshotListRequest,
    tenant_id: str,
    db: AsyncSession,
) -> SnapshotListResponse:
    snapshot_type = req.snapshotType
    if snapshot_type is not None and snapshot_type not in _VALID_SNAPSHOT_TYPES:
        raise BusinessException(code=5512, message="snapshotType 参数非法，允许: FINANCIAL / COMPLIANCE")
    page = req.page
    page_size = req.pageSize
    items: list[SnapshotListItem] = []

    async def _fetch_financial() -> list[SnapshotListItem]:
        stmt = select(FinancialSnapshot).where(
            FinancialSnapshot.is_deleted == False,
            FinancialSnapshot.tenant_id == tenant_id,
        )
        if req.period:
            stmt = stmt.where(FinancialSnapshot.period == req.period)
        stmt = stmt.order_by(FinancialSnapshot.created_at.desc())
        rows = (await db.execute(stmt)).scalars().all()
        return [
            SnapshotListItem(
                snapshotId=r.id,
                snapshotType="FINANCIAL",
                snapshotTypeName=_FINANCIAL_TYPE_NAME,
                snapshotName=r.snapshot_name,
                period=r.period,
                snapshotDate=_fmt_date(r.snapshot_date),
                status=r.status or "GENERATING",
                statusName=_financial_status_name(r.status),
                fileSize=None,  # D20: financial_snapshots 无 file_size
                lockedAt=_fmt_date(r.locked_at),
                createdAt=_fmt_date(r.created_at) or "",
            )
            for r in rows
        ]

    async def _fetch_compliance() -> list[SnapshotListItem]:
        stmt = select(DataSnapshot).where(
            DataSnapshot.is_deleted == False,
            DataSnapshot.tenant_id == tenant_id,
        )
        stmt = stmt.order_by(DataSnapshot.created_at.desc())
        rows = (await db.execute(stmt)).scalars().all()
        return [
            SnapshotListItem(
                snapshotId=r.id,
                snapshotType="COMPLIANCE",
                snapshotTypeName=_COMPLIANCE_TYPE_NAME,
                snapshotName=r.snapshot_name,
                period=None,
                snapshotDate=_fmt_date(r.snapshot_date),
                status=r.status or "DRAFT",
                statusName=_compliance_status_name(r.status),
                fileSize=r.file_size,
                lockedAt=None,
                createdAt=_fmt_date(r.created_at) or "",
            )
            for r in rows
        ]

    if snapshot_type == "FINANCIAL":
        items = await _fetch_financial()
    elif snapshot_type == "COMPLIANCE":
        items = await _fetch_compliance()
    else:
        fin = await _fetch_financial()
        comp = await _fetch_compliance()
        items = sorted(fin + comp, key=lambda x: x.createdAt or "", reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    paged = items[start: start + page_size]

    return SnapshotListResponse(total=total, page=page, pageSize=page_size, items=paged)


async def get_snapshot_detail(
    req: SnapshotDetailRequest,
    tenant_id: str,
    db: AsyncSession,
) -> SnapshotDetailResponse:
    if req.snapshotType not in ("FINANCIAL", "COMPLIANCE"):
        raise BusinessException(code=5512, message="snapshotType 参数非法，允许: FINANCIAL / COMPLIANCE")

    if req.snapshotType == "FINANCIAL":
        row = (
            await db.execute(
                select(FinancialSnapshot).where(
                    FinancialSnapshot.id == req.snapshotId,
                    FinancialSnapshot.is_deleted == False,
                    FinancialSnapshot.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise BusinessException(code=5510, message="快照不存在")
        return SnapshotDetailResponse(
            snapshotId=row.id,
            snapshotType="FINANCIAL",
            snapshotTypeName=_FINANCIAL_TYPE_NAME,
            snapshotName=row.snapshot_name,
            period=row.period,
            snapshotDate=_fmt_date(row.snapshot_date),
            description=row.notes,
            recordCount=None,
            fileSize=None,
            status=row.status or "GENERATING",
            statusName=_financial_status_name(row.status),
            lockedAt=_fmt_date(row.locked_at),
            createdAt=_fmt_date(row.created_at) or "",
            createdBy=row.created_by,
        )
    else:
        row = (
            await db.execute(
                select(DataSnapshot).where(
                    DataSnapshot.id == req.snapshotId,
                    DataSnapshot.is_deleted == False,
                    DataSnapshot.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise BusinessException(code=5510, message="快照不存在")
        return SnapshotDetailResponse(
            snapshotId=row.id,
            snapshotType="COMPLIANCE",
            snapshotTypeName=_COMPLIANCE_TYPE_NAME,
            snapshotName=row.snapshot_name,
            period=None,
            snapshotDate=_fmt_date(row.snapshot_date),
            description=row.description,
            recordCount=row.record_count,
            fileSize=row.file_size,
            status=row.status or "DRAFT",
            statusName=_compliance_status_name(row.status),
            lockedAt=None,
            createdAt=_fmt_date(row.created_at) or "",
            createdBy=row.created_by,
        )


async def get_download_url(
    req: SnapshotDownloadUrlRequest,
    tenant_id: str,
    db: AsyncSession,
    storage: IStorageProvider,
) -> SnapshotDownloadUrlResponse:
    if req.snapshotType not in ("FINANCIAL", "COMPLIANCE"):
        raise BusinessException(code=5512, message="snapshotType 参数非法，允许: FINANCIAL / COMPLIANCE")

    if req.snapshotType == "FINANCIAL":
        # FINANCIAL 无文件，返回 null（D13/D20）
        return SnapshotDownloadUrlResponse(
            snapshotId=req.snapshotId,
            downloadUrl=None,
            expiresAt=None,
            fileName=None,
        )

    row = (
        await db.execute(
            select(DataSnapshot).where(
                DataSnapshot.id == req.snapshotId,
                DataSnapshot.is_deleted == False,
                DataSnapshot.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5510, message="快照不存在")
    if not row.s3_file_url:
        raise BusinessException(code=5511, message="快照文件已过期或不可用")

    # s3_file_url 格式: bucket/filename 或完整路径，取文件名部分
    filename = row.s3_file_url.rsplit("/", 1)[-1]
    expires = 900  # 15 分钟
    url = await storage.get_file_url(bucket=_SNAPSHOT_BUCKET, filename=filename, expires=expires)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires)).isoformat()

    return SnapshotDownloadUrlResponse(
        snapshotId=row.id,
        downloadUrl=url,
        expiresAt=expires_at,
        fileName=filename,
    )
