"""add check constraints

Revision ID: c7f0b6788459
Revises: 75574ab6950d
Create Date: 2026-08-06 09:19:44.838746

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7f0b6788459'
down_revision: Union[str, None] = '75574ab6950d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite has no ALTER to add CHECK constraints, so each table is rebuilt via
    # alembic batch mode (data-preserving). FK ondelete is intentionally NOT
    # touched here: house deletes are soft, and rebuilding FK tables in SQLite
    # batch mode duplicates foreign keys.
    with op.batch_alter_table('houses', recreate='always') as batch_op:
        batch_op.create_check_constraint('ck_houses_fee_ge_0', 'fee >= 0')

    with op.batch_alter_table('payments', recreate='always') as batch_op:
        batch_op.create_check_constraint('ck_payments_amount_ge_0', 'amount >= 0')
        batch_op.create_check_constraint('ck_payments_month_key_format', "month_key LIKE '____-__'")

    with op.batch_alter_table('guard_payments', recreate='always') as batch_op:
        batch_op.create_check_constraint('ck_guard_payments_amount_ge_0', 'amount >= 0')
        batch_op.create_check_constraint('ck_guard_payments_month_key_format', "month_key LIKE '____-__'")


def downgrade() -> None:
    with op.batch_alter_table('guard_payments', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_guard_payments_month_key_format', type_='check')
        batch_op.drop_constraint('ck_guard_payments_amount_ge_0', type_='check')

    with op.batch_alter_table('payments', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_payments_month_key_format', type_='check')
        batch_op.drop_constraint('ck_payments_amount_ge_0', type_='check')

    with op.batch_alter_table('houses', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_houses_fee_ge_0', type_='check')