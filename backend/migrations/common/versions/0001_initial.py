"""Fresh database schema; legacy migration chains are archived separately."""
from alembic import op
from app.core.database import CommonBase
from app.core.models import register_models
revision='common_0001'
down_revision=None
branch_labels=None
depends_on=None
def upgrade():
    register_models()
    CommonBase.metadata.create_all(op.get_bind())
def downgrade():
    raise RuntimeError('Database reset requires an explicit development-volume reset')
