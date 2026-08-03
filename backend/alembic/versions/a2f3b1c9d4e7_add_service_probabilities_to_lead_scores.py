"""add service_probabilities to lead_scores

Revision ID: a2f3b1c9d4e7
Revises: 6dcc27a021cf
Create Date: 2026-07-31 00:00:00.000000

Adds the service_probabilities JSONB column to lead_scores so the scoring
pipeline can persist all four service-line probabilities (branding, hiring,
learning_development, iac_partnership) per §3.8 of the project requirements:
"Company A has an 80% probability of requiring recruitment services AND a
65% probability of requiring corporate learning services."
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2f3b1c9d4e7"
down_revision: str | None = "6dcc27a021cf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lead_scores",
        sa.Column("service_probabilities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lead_scores", "service_probabilities")
