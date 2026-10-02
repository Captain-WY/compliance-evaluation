from app.core.database import CaseBase as Base, case_engine as engine, CaseSession as AsyncSessionLocal, get_case_session as get_db
TestSessionLocal = AsyncSessionLocal
async def close_db(): await engine.dispose()
async def init_db():
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
