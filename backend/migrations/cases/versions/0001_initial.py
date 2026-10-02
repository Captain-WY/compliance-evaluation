"""Fresh database schema; legacy migration chains are archived separately."""
from alembic import op
from app.core.database import CaseBase
from app.core.models import register_models
revision='cases_0001'
down_revision=None
branch_labels=None
depends_on=None
def upgrade():
    register_models()
    CaseBase.metadata.create_all(op.get_bind())
def downgrade():
    raise RuntimeError('Database reset requires an explicit development-volume reset')
