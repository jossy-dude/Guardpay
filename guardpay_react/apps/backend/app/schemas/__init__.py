from pydantic import BaseModel, Field, field_validator
from typing import Literal
import json
import re

_MONTH_KEY_RE = re.compile(r"^(19[7-9]\d|200\d|20[1-9]\d|2100)-((0[1-9])|(1[0-2]))$")


def validate_month_key(v: str) -> str:
    if not _MONTH_KEY_RE.fullmatch(v):
        raise ValueError("month_key must be a valid YYYY-MM string")
    return v

# ---- House ----
class HouseCreate(BaseModel):
    name: str = Field(min_length=1)
    house_number: str = Field(min_length=1)
    fee: int = Field(default=4000, ge=0)
    notes: str = ""
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def _validate_avatar(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError("avatar must be a JSON object string or null") from exc
        if not isinstance(parsed, dict):
            raise ValueError("avatar must be a JSON object string or null")
        return v


class HouseUpdate(BaseModel):
    id: int
    name: str
    house_number: str
    fee: int = Field(ge=0)
    notes: str = ""
    active: bool = True
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def _validate_avatar(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError("avatar must be a JSON object string or null") from exc
        if not isinstance(parsed, dict):
            raise ValueError("avatar must be a JSON object string or null")
        return v


class HouseOut(BaseModel):
    id: int
    name: str
    house_number: str
    fee: int
    notes: str
    active: bool
    created_month: str
    created_at: str
    updated_at: str
    deleted_at: str | None = None
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def _validate_avatar(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError("avatar must be a JSON object string or null") from exc
        if not isinstance(parsed, dict):
            raise ValueError("avatar must be a JSON object string or null")
        return v

    model_config = {"from_attributes": True}


# ---- Payment ----
class PaymentToggle(BaseModel):
    house_id: int
    month_key: str
    paid: bool = True
    date: str | None = None
    amount: int | None = None
    note: str = ""

    _mkey = field_validator("month_key")(validate_month_key)


class PaymentUpdate(BaseModel):
    id: int
    paid_date: str | None = None
    amount: int | None = None
    note: str = ""


class PaymentOut(BaseModel):
    id: int
    house_id: int
    month_key: str
    paid_date: str | None = None
    amount: int
    note: str
    source: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ---- Guard ----
class GuardCreate(BaseModel):
    month_key: str
    amount: int = Field(ge=0)
    paid_date: str
    method: str = "transfer"
    note: str = ""

    _mkey = field_validator("month_key")(validate_month_key)


class GuardOut(BaseModel):
    id: int
    month_key: str
    paid_date: str
    amount: int
    method: str
    note: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ---- Reminder ----
class ReminderCreate(BaseModel):
    house_id: int
    note: str = ""


# ---- Settings ----
class SettingsUpdate(BaseModel):
    neighborhood_name: str | None = None
    currency: str | None = None
    due_day: int | None = Field(default=None, ge=1, le=28)
    guard_name: str | None = None
    guard_salary: int | None = Field(default=None, ge=0)
    backup_before_changes: bool | None = None
    default_fee: int | None = Field(default=None, ge=0)
    guard_account_suffix: str | None = None
    calendar_mode: Literal["gregorian", "ethiopian"] | None = None
    month_language: Literal["english", "amharic"] | None = None
    heatmap_shape: Literal["square", "rounded"] | None = None


# ---- Bulk add ----
class BulkAdd(BaseModel):
    lines: list[str] = Field(default_factory=list)
    default_fee: int = 4000


# ---- Excel import ----
class HouseImportItem(BaseModel):
    house_number: str
    name: str
    fee: int | None = None
    aliases: list[str] = Field(default_factory=list)
    months: list[str] = Field(default_factory=list)  # canonical YYYY-MM or human label
    paid_day: int | None = None


class HouseImport(BaseModel):
    households: list[HouseImportItem] = Field(default_factory=list)
    default_fee: int = 4000
    calendar_mode: Literal["gregorian", "ethiopian"] = "gregorian"


# ---- Auth ----
class PinSet(BaseModel):
    pin: str = Field(min_length=4, max_length=64)
    current_pin: str | None = None


class PinLogin(BaseModel):
    pin: str


# ---- Export ----
class ExportRequest(BaseModel):
    format: str  # pdf | csv | json | xlsx
    template: str = "monthly"  # monthly | guard | scorecard | outstanding | annual
    mode: str = "image"  # image | text
    month: str | None = None
    columns: list[str] = Field(default_factory=list)