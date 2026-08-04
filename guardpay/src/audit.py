"""
Audit trail — records every mutation with actor, before/after JSON.
"""
import json

from .utils import now_iso


def write_audit(conn, actor, action, entity, entity_id=None, before=None, after=None):
    conn.execute(
        "INSERT INTO audit_log (actor, action, entity, entity_id, before_json, after_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (actor or 'anon', action, entity, entity_id,
         json.dumps(before, ensure_ascii=False) if before is not None else None,
         json.dumps(after, ensure_ascii=False) if after is not None else None,
         now_iso())
    )
