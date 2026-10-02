"""Use aware timestamps for shared dictionary audit fields."""
from alembic import op
from sqlalchemy import inspect,DateTime
revision='common_0002'
down_revision='common_0001'
branch_labels=None
depends_on=None
def upgrade():
    columns={c['name']:c for c in inspect(op.get_bind()).get_columns('sys_dicts')}
    for name in ['created_at','updated_at']:
        if not getattr(columns[name]['type'],'timezone',False):
            op.alter_column('sys_dicts',name,type_=DateTime(timezone=True),postgresql_using=f"{name} AT TIME ZONE 'UTC'")
def downgrade():raise RuntimeError('Development rollback requires explicit review')
