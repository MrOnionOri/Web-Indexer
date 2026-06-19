"""add encrypted AI interaction records

Revision ID: 0002_ai_interactions
Revises: 0001_initial
Create Date: 2026-06-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = "0002_ai_interactions"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gatewiki_ai_interactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("user_name", sa.String(length=160), nullable=False),
        sa.Column("user_email", sa.String(length=255), nullable=False),
        sa.Column("question", mysql.LONGTEXT(), nullable=False),
        sa.Column("answer", mysql.LONGTEXT(), nullable=False),
        sa.Column("scope_type", sa.String(length=20), nullable=False, server_default="all"),
        sa.Column("space_key", sa.String(length=20), nullable=True),
        sa.Column("page_id", sa.String(length=36), nullable=True),
        sa.Column("page_title", sa.String(length=180), nullable=True),
        sa.Column("engine", sa.String(length=40), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=True),
        sa.Column("searched_pages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sources_json", mysql.LONGTEXT(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("review_status", sa.String(length=24), nullable=False, server_default="unreviewed"),
        sa.Column("review_note", mysql.LONGTEXT(), nullable=False),
        sa.Column("reviewed_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("reviewed_by_name", sa.String(length=160), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gatewiki_ai_interactions_user_id", "gatewiki_ai_interactions", ["user_id"])
    op.create_index("ix_gatewiki_ai_interactions_user_email", "gatewiki_ai_interactions", ["user_email"])
    op.create_index("ix_gatewiki_ai_interactions_scope_type", "gatewiki_ai_interactions", ["scope_type"])
    op.create_index("ix_gatewiki_ai_interactions_space_key", "gatewiki_ai_interactions", ["space_key"])
    op.create_index("ix_gatewiki_ai_interactions_page_id", "gatewiki_ai_interactions", ["page_id"])
    op.create_index("ix_gatewiki_ai_interactions_engine", "gatewiki_ai_interactions", ["engine"])
    op.create_index("ix_gatewiki_ai_interactions_review_status", "gatewiki_ai_interactions", ["review_status"])
    op.create_index("ix_gatewiki_ai_interactions_created_at", "gatewiki_ai_interactions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_gatewiki_ai_interactions_created_at", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_review_status", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_engine", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_page_id", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_space_key", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_scope_type", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_user_email", table_name="gatewiki_ai_interactions")
    op.drop_index("ix_gatewiki_ai_interactions_user_id", table_name="gatewiki_ai_interactions")
    op.drop_table("gatewiki_ai_interactions")
