"""group AI interactions into conversation sessions

Revision ID: 0003_ai_sessions
Revises: 0002_ai_interactions
Create Date: 2026-06-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_ai_sessions"
down_revision: Union[str, None] = "0002_ai_interactions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gatewiki_ai_interactions", sa.Column("session_id", sa.String(length=36), nullable=True))
    op.execute("UPDATE gatewiki_ai_interactions SET session_id = id WHERE session_id IS NULL")
    op.alter_column("gatewiki_ai_interactions", "session_id", existing_type=sa.String(length=36), nullable=False)
    op.create_index("ix_gatewiki_ai_interactions_session_id", "gatewiki_ai_interactions", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_gatewiki_ai_interactions_session_id", table_name="gatewiki_ai_interactions")
    op.drop_column("gatewiki_ai_interactions", "session_id")
