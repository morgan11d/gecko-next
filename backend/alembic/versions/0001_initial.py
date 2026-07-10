"""Initial Gecko Next schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("customer", sa.String(), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("rules", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("input_format", sa.String(), nullable=False),
        sa.Column("output_format", sa.String(), nullable=False),
    )

    op.create_table(
        "media_files",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("original_name", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("waveform_peaks", sa.JSON(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("media_file_id", sa.String(), sa.ForeignKey("media_files.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("assignee_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("verifier_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="Новая"),
        sa.Column("priority", sa.String(), nullable=False, server_default="normal"),
        sa.Column("deadline", sa.Date(), nullable=False),
        sa.Column("listened_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("return_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "speakers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_name", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("editable", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "segments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("speaker_id", sa.String(), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.Column("is_crosstalk", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("listened", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source_format", sa.String(), nullable=True),
        sa.Column("source_index", sa.Integer(), nullable=True),
        sa.Column("source_payload", sa.JSON(), nullable=True),
    )

    op.create_table(
        "terms",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("normalized_value", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
        sa.Column("annotator_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("verifier_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("occurrences", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "verification_comments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("segment_id", sa.String(), nullable=True),
        sa.Column("author_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "transcript_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("segments_snapshot", sa.JSON(), nullable=False),
        sa.Column("author_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("new_value", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_segments_task_time", "segments", ["task_id", "start_ms", "end_ms"])
    op.create_index("ix_segments_task_speaker", "segments", ["task_id", "speaker_id"])
    op.create_index("ix_terms_project_normalized", "terms", ["project_id", "normalized_value"])
    op.create_index("ix_comments_task_status", "verification_comments", ["task_id", "status"])
    op.create_index("ix_audit_entity", "audit_log", ["entity_type", "entity_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_entity", table_name="audit_log")
    op.drop_index("ix_comments_task_status", table_name="verification_comments")
    op.drop_index("ix_terms_project_normalized", table_name="terms")
    op.drop_index("ix_segments_task_speaker", table_name="segments")
    op.drop_index("ix_segments_task_time", table_name="segments")
    op.drop_table("audit_log")
    op.drop_table("transcript_versions")
    op.drop_table("verification_comments")
    op.drop_table("terms")
    op.drop_table("segments")
    op.drop_table("speakers")
    op.drop_table("tasks")
    op.drop_table("media_files")
    op.drop_table("projects")
    op.drop_table("users")

