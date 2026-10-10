"""add signals table and opportunity/engagement score columns

Revision ID: b7e1f4a9c2d3
Revises: a2f3b1c9d4e7
Create Date: 2026-10-02 00:00:00.000000

Adds the structured Business Signal Engine (signals table — typed, directional,
confidence-scored events such as hiring/expansion/funding/technology_adoption/
leadership_change/layoffs/hiring_freeze) plus the new Opportunity Score /
Engagement Score / intent trend columns on lead_scores.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e1f4a9c2d3"
down_revision: str | None = "a2f3b1c9d4e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "signals",
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("company_id", sa.UUID(), nullable=True),
        sa.Column("raw_document_id", sa.UUID(), nullable=True),
        sa.Column("signal_type", sa.String(length=50), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("confidence", sa.Numeric(precision=5, scale=4), nullable=False),
        sa.Column("headline", sa.Text(), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "signal_type IN ('hiring', 'expansion', 'funding', 'technology_adoption', "
            "'leadership_change', 'layoffs', 'hiring_freeze')",
            name="signals_signal_type_check",
        ),
        sa.CheckConstraint("direction IN ('positive', 'negative')", name="signals_direction_check"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["raw_document_id"], ["raw_documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_signals_company", "signals", ["company_id"], unique=False)
    op.create_index(
        "idx_signals_detected_at", "signals", [sa.text("detected_at DESC")], unique=False
    )

    op.add_column("lead_scores", sa.Column("opportunity_score", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("lead_scores", sa.Column("engagement_score", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("lead_scores", sa.Column("intent_trend", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("lead_scores", "intent_trend")
    op.drop_column("lead_scores", "engagement_score")
    op.drop_column("lead_scores", "opportunity_score")

    op.drop_index("idx_signals_detected_at", table_name="signals")
    op.drop_index("idx_signals_company", table_name="signals")
    op.drop_table("signals")
