import asyncio
from alembic import context
from app.core.models import register_models
from app.core.database import CommonBase,CaseBase,ComplianceBase,common_engine,case_engine,compliance_engine
register_models()
name=context.config.config_ini_section
metadata={'common':CommonBase.metadata,'cases':CaseBase.metadata,'compliance':ComplianceBase.metadata}[name]
engine={'common':common_engine,'cases':case_engine,'compliance':compliance_engine}[name]
def migrate(conn):
    context.configure(connection=conn,target_metadata=metadata,version_table='alembic_version')
    with context.begin_transaction():context.run_migrations()
async def run():
    async with engine.connect() as conn:await conn.run_sync(migrate)
    await engine.dispose()
asyncio.run(run())
