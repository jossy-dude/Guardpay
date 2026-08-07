from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(120), default="admin")
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    before_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[str] = mapped_column(String(40), default="")


class Household(Base):
    __tablename__ = "houses"
    __table_args__ = (
        UniqueConstraint("house_number"),
        CheckConstraint("fee >= 0", name="ck_houses_fee_ge_0"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(300))
    house_number: Mapped[str] = mapped_column(String(60))
    fee: Mapped[int] = mapped_column(Integer, default=500)
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_month: Mapped[str] = mapped_column(String(7))
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))
    deleted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)

    payments: Mapped[list["Payment"]] = relationship(back_populates="house", cascade="all, delete-orphan")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("house_id", "month_key"),
        CheckConstraint("amount >= 0", name="ck_payments_amount_ge_0"),
        CheckConstraint("month_key LIKE '____-__'", name="ck_payments_month_key_format"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id"), index=True)
    month_key: Mapped[str] = mapped_column(String(7))
    paid_date: Mapped[str | None] = mapped_column(String(40), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(40), default="manual")  # manual
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))

    house: Mapped["Household"] = relationship(back_populates="payments")


class GuardPayment(Base):
    __tablename__ = "guard_payments"
    __table_args__ = (
        UniqueConstraint("month_key"),
        CheckConstraint("amount >= 0", name="ck_guard_payments_amount_ge_0"),
        CheckConstraint("month_key LIKE '____-__'", name="ck_guard_payments_month_key_format"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    month_key: Mapped[str] = mapped_column(String(7))
    paid_date: Mapped[str] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20), default="transfer")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class FeeChange(Base):
    __tablename__ = "fee_change"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id"), index=True)
    old_fee: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_fee: Mapped[int] = mapped_column(Integer)
    changed_at: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(Text, default="")


class HouseReminder(Base):
    __tablename__ = "house_reminder"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40))
    reminded_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class HouseAlias(Base):
    __tablename__ = "house_aliases"
    __table_args__ = (UniqueConstraint("house_id", "alias"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("houses.id"), index=True)
    alias: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[str] = mapped_column(String(40))


class AuthSecret(Base):
    __tablename__ = "auth_secret"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pin_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    pin_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    pin_salt: Mapped[str | None] = mapped_column(Text, nullable=True)
    iterations: Mapped[int] = mapped_column(Integer, default=200000)
    session_secret: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40), default="")
    updated_at: Mapped[str] = mapped_column(String(40), default="")