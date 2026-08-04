"""
Rotating file logger for GuardPay.

The stdlib HTTP server logs every request to stderr by default, which is
noisy in a terminal you're leaving open all day — so handlers.py suppresses
it. That meant there was no record at all when something went wrong.

This gives GuardPay a real (but quiet) log: requests, errors, and admin
actions go to guardpay.log next to the database, capped at a couple of MB
with two rotated backups. The Settings > Diagnostics panel reads the tail
of this file for the "Run Diagnostics" log viewer.
"""
import logging
from logging.handlers import RotatingFileHandler

from .config import LOG_FILE, LOG_MAX_BYTES, LOG_BACKUP_COUNT

_logger = None


def get_logger():
    global _logger
    if _logger is not None:
        return _logger
    logger = logging.getLogger("guardpay")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        try:
            fh = RotatingFileHandler(
                LOG_FILE, maxBytes=LOG_MAX_BYTES, backupCount=LOG_BACKUP_COUNT, encoding="utf-8"
            )
            fh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S"))
            logger.addHandler(fh)
        except OSError:
            # If the log file can't be opened (read-only filesystem, etc.) fall
            # back to a null handler rather than crashing the server over logging.
            logger.addHandler(logging.NullHandler())
    logger.propagate = False
    _logger = logger
    return logger
