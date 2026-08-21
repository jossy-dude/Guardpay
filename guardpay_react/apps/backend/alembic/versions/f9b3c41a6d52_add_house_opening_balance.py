"""add opening_balance column to houses

Revision ID: f9b3c41a6d52
Revises: a3f7c9e2b1d4
Create Date: 2026-08-07 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f9b3c41a6d52'
down_revision: Union[str, None] = 'a3f7c9e2b1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("houses", sa.Column("opening_balance", sa.Integer(), nullable=False, server_default="0"))

def downgrade() -> None:
    with op.batch_alter_table("houses") as batch:
        batch.drop_column("opening_balance")