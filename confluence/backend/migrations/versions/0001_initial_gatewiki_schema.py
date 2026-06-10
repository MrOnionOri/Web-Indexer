"""initial gatewiki schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "confluence_spaces",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("key", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_email", sa.String(length=255), nullable=True),
        sa.Column("created_by_name", sa.String(length=160), nullable=True),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("is_restricted", sa.Boolean(), nullable=True),
        sa.Column("allowed_emails", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_confluence_spaces_key", "confluence_spaces", ["key"])

    op.create_table(
        "confluence_pages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("space_key", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("content", mysql.LONGTEXT(), nullable=True),
        sa.Column("subtopics", mysql.LONGTEXT(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_email", sa.String(length=255), nullable=False),
        sa.Column("created_by_name", sa.String(length=160), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("is_restricted", sa.Boolean(), nullable=True),
        sa.Column("allowed_emails", sa.Text(), nullable=True),
        sa.Column("comments_allowed", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_confluence_pages_space_key", "confluence_pages", ["space_key"])

    op.create_table(
        "confluence_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("page_id", sa.String(length=36), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("author_email", sa.String(length=255), nullable=False),
        sa.Column("author_name", sa.String(length=160), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["page_id"], ["confluence_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["confluence_comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_confluence_comments_page_id", "confluence_comments", ["page_id"])

    op.create_table(
        "confluence_comment_reactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("comment_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("user_name", sa.String(length=160), nullable=False),
        sa.Column("emoji", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["comment_id"], ["confluence_comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_confluence_comment_reactions_comment_id", "confluence_comment_reactions", ["comment_id"])


def downgrade() -> None:
    op.drop_index("ix_confluence_comment_reactions_comment_id", table_name="confluence_comment_reactions")
    op.drop_table("confluence_comment_reactions")
    op.drop_index("ix_confluence_comments_page_id", table_name="confluence_comments")
    op.drop_table("confluence_comments")
    op.drop_index("ix_confluence_pages_space_key", table_name="confluence_pages")
    op.drop_table("confluence_pages")
    op.drop_index("ix_confluence_spaces_key", table_name="confluence_spaces")
    op.drop_table("confluence_spaces")
