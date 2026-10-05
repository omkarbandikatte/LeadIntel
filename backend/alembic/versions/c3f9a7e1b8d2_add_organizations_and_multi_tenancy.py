"""add organizations/service_offerings and make the platform multi-tenant

Revision ID: c3f9a7e1b8d2
Revises: b7e1f4a9c2d3
Create Date: 2026-10-06 00:00:00.000000

Introduces real multi-tenancy: any company can sign up (POST
/api/organizations/signup), describe itself and its own service catalog, and
get leads generated/scored against its own ICP — instead of the whole
platform being hardcoded to one company (Cloud Counselage) and its 4 fixed
service lines.

- organizations / service_offerings: new tables, one row per tenant and one
  row per service that tenant sells (replaces the ServiceLine enum).
- users.organization_id, companies.organization_id, crm_deals.organization_id:
  nullable tenant-scoping FKs (nullable so pre-existing rows/tests keep
  working; the application layer always sets them for new data).
- Drops the CHECK constraints that pinned crm_deals.service_line,
  nlp_features.predicted_need_category and lead_scores.recommended_service to
  the 4 fixed Cloud Counselage values — these are now free-form per-tenant
  service keys.
- Backfills a default "Cloud Counselage" organization + its original 4
  service offerings, and attaches every pre-existing user/company/crm_deal to
  it, so none of the platform's existing data or behavior changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f9a7e1b8d2"
down_revision: str | None = "b7e1f4a9c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DEFAULT_ORG_NAME = "Cloud Counselage"
_DEFAULT_SERVICE_OFFERINGS = [
    ("branding", "Branding", "branding, marketing, or public image"),
    ("hiring", "Hiring", "hiring, recruitment, or workforce expansion"),
    ("learning_development", "Learning & Development", "employee learning, training, or upskilling"),
    ("iac_partnership", "Industry-Academia Partnership", "IT infrastructure, cloud, or technology partnership"),
]


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("industry", sa.String(length=255), nullable=True),
        sa.Column("employee_count_band", sa.String(length=50), nullable=True),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("icp_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "service_offerings",
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "key", name="uq_service_offerings_org_key"),
    )

    op.add_column("users", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "users_organization_id_fkey", "users", "organizations", ["organization_id"], ["id"], ondelete="CASCADE"
    )

    op.add_column("companies", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "companies_organization_id_fkey",
        "companies",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("crm_deals", sa.Column("organization_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "crm_deals_organization_id_fkey",
        "crm_deals",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # service_line/predicted_need_category/recommended_service are no longer a
    # fixed 4-value set — each organization defines its own service catalog.
    op.drop_constraint("crm_deals_service_line_check", "crm_deals", type_="check")
    op.drop_constraint("nlp_features_predicted_need_category_check", "nlp_features", type_="check")
    op.drop_constraint("lead_scores_recommended_service_check", "lead_scores", type_="check")

    # ------------------------------------------------------------------
    # Backfill: attach all pre-existing data to a default organization so
    # nothing about the platform's existing (single-tenant) behavior changes.
    # ------------------------------------------------------------------
    connection = op.get_bind()
    org_id = connection.execute(
        sa.text("INSERT INTO organizations (name) VALUES (:name) RETURNING id"),
        {"name": _DEFAULT_ORG_NAME},
    ).scalar_one()

    for key, label, description in _DEFAULT_SERVICE_OFFERINGS:
        connection.execute(
            sa.text(
                "INSERT INTO service_offerings (organization_id, key, label, description) "
                "VALUES (:org_id, :key, :label, :description)"
            ),
            {"org_id": org_id, "key": key, "label": label, "description": description},
        )

    connection.execute(sa.text("UPDATE users SET organization_id = :org_id"), {"org_id": org_id})
    connection.execute(sa.text("UPDATE companies SET organization_id = :org_id"), {"org_id": org_id})
    connection.execute(
        sa.text("UPDATE crm_deals SET organization_id = :org_id WHERE company_id IS NOT NULL"),
        {"org_id": org_id},
    )


def downgrade() -> None:
    op.create_check_constraint(
        "lead_scores_recommended_service_check",
        "lead_scores",
        "recommended_service IN ('branding', 'hiring', 'learning_development', 'iac_partnership')",
    )
    op.create_check_constraint(
        "nlp_features_predicted_need_category_check",
        "nlp_features",
        "predicted_need_category IN ('branding', 'hiring', 'learning_development', 'iac_partnership')",
    )
    op.create_check_constraint(
        "crm_deals_service_line_check",
        "crm_deals",
        "service_line IN ('branding', 'hiring', 'learning_development', 'iac_partnership')",
    )

    op.drop_constraint("crm_deals_organization_id_fkey", "crm_deals", type_="foreignkey")
    op.drop_column("crm_deals", "organization_id")

    op.drop_constraint("companies_organization_id_fkey", "companies", type_="foreignkey")
    op.drop_column("companies", "organization_id")

    op.drop_constraint("users_organization_id_fkey", "users", type_="foreignkey")
    op.drop_column("users", "organization_id")

    op.drop_table("service_offerings")
    op.drop_table("organizations")
