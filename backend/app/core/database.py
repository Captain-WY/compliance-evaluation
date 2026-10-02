from collections.abc import AsyncIterator
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import get_settings
class CommonBase(DeclarativeBase): pass
class CaseBase(DeclarativeBase): pass
class ComplianceBase(DeclarativeBase): pass
settings = get_settings()
common_engine = create_async_engine(settings.common_database_url, pool_pre_ping=True)
case_engine = create_async_engine(settings.case_database_url, pool_pre_ping=True)
compliance_engine = create_async_engine(settings.compliance_database_url, pool_pre_ping=True)
# Route pure common-model operations to common DB. Business transactions stay on their own engine.
# Mixed SQL joins are forbidden: common references must be resolved by separate queries.
class RoutedSession(Session):
    def get_bind(self, mapper=None, clause=None, **kw):
        if clause is not None:
            from sqlalchemy.sql import visitors
            owners={e.metadata for e in visitors.iterate(clause) if hasattr(e,'metadata') and hasattr(e,'columns')}
            if CommonBase.metadata in owners:
                if CaseBase.metadata in owners or ComplianceBase.metadata in owners:
                    raise RuntimeError('Cross-database SQL join is forbidden; resolve common references separately')
                return common_engine.sync_engine
        if mapper is not None and mapper.persist_selectable.metadata is CommonBase.metadata:
            return common_engine.sync_engine
        return super().get_bind(mapper=mapper, clause=clause, **kw)
CommonSession = async_sessionmaker(common_engine, expire_on_commit=False)
CaseSession = async_sessionmaker(case_engine, sync_session_class=RoutedSession, expire_on_commit=False)
ComplianceSession = async_sessionmaker(compliance_engine, sync_session_class=RoutedSession, expire_on_commit=False)
async def get_common_session() -> AsyncIterator[AsyncSession]:
    async with CommonSession() as s: yield s
async def get_case_session() -> AsyncIterator[AsyncSession]:
    async with CaseSession() as s:
        try:
            yield s
            await s.commit()
        except Exception:
            await s.rollback(); raise
async def get_compliance_session() -> AsyncIterator[AsyncSession]:
    async with ComplianceSession() as s: yield s
