"""add unique partial index for active reminders

Revision ID: d0e2f7b1a4c3
Revises: c7f0b6788459
Create Date: 2026-08-06 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd0e2f7b1a4c3'
down_revision: Union[str, None] = 'c7f0b6788459'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One active reminder per house. SQLite partial index — ignored rows that
    # have been resolved (is_active = 0) so history can keep multiple records.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_house_reminder_active_one
        ON house_reminder (house_id) WHERE is_active = 1
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_house_reminder_active_one")
