from types import SimpleNamespace
import pytest
from sqlalchemy import select,update
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.main import app
from app.platform.scope import principal_context
from app.modules.cases.models.case_clues import CaseClue
@pytest.mark.asyncio
async def test_branch_clue_list_and_update_are_actor_scoped():
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:await conn.run_sync(CaseClue.__table__.create)
    factory=async_sessionmaker(engine,expire_on_commit=False)
    async with factory() as s:
        s.add_all([CaseClue(id='own',clue_title='own',source_type='MANUAL',created_by='branch',tenant_id='built-in'),CaseClue(id='peer',clue_title='peer',source_type='MANUAL',created_by='headquarters',tenant_id='built-in')]);await s.commit()
    user=SimpleNamespace(id='branch',tenant_id='built-in',scopes=['organization'])
    token=principal_context.set(user)
    try:
        async with factory() as s:
            rows=(await s.scalars(select(CaseClue))).all()
            assert [r.id for r in rows]==['own']
            assert await s.scalar(select(CaseClue).where(CaseClue.id=='peer')) is None
            result=await s.execute(update(CaseClue).where(CaseClue.id=='peer').values(clue_title='unauthorized'))
            assert result.rowcount==0
            await s.commit()
    finally:principal_context.reset(token)
    async with factory() as s:assert (await s.get(CaseClue,'peer')).clue_title=='peer'
    await engine.dispose()
@pytest.mark.asyncio
async def test_attachment_scope_cannot_be_skipped_by_omitting_content_type(monkeypatch):
    import json
    from starlette.requests import Request
    from fastapi import HTTPException
    from app.platform import auth,authorization
    from app.platform.scope import route_guard
    async def current(*args):return SimpleNamespace(id='lawyer',tenant_id='built-in',scopes=['organization'],role_codes=['external_lawyer'])
    async def permitted(*args):return True
    monkeypatch.setattr(auth,'current_user',current)
    monkeypatch.setattr(authorization,'enforce',permitted)
    async def receive():return {'type':'http.request','body':json.dumps({'businessType':'TASK','businessId':'another-users-task'}).encode(),'more_body':False}
    request=Request({'type':'http','method':'POST','path':'/api/bff/v1/attachments/list','headers':[], 'route':SimpleNamespace(path='/api/bff/v1/attachments/list')},receive)
    with pytest.raises(HTTPException) as exc:await anext(route_guard(request))
    assert exc.value.status_code==403
    assert principal_context.get() is None
