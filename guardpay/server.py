#!/usr/bin/env python3
"""
GuardPay - Neighborhood Security Fee Tracker
Entry point. Parses CLI args, initialises DB, starts HTTP server.

Usage:
    python3 server.py [PORT] [--no-browser] [--local]

Standard library only. Robust, audited, single-command.
"""
import os
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

# Ensure the guardpay/ directory is on sys.path so src.* imports resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.database import init_db
from src.backup import daily_snapshot_if_needed
from src.handlers import Handler
from src.utils import get_local_ip
from src.config import DB_FILE, BACKUP_DIR


def main():
    port = 8420
    bind = "0.0.0.0"
    no_browser = False
    args = sys.argv[1:]
    for a in args:
        if a == "--no-browser":
            no_browser = True
        elif a == "--local":
            bind = "127.0.0.1"
        elif a.isdigit():
            port = int(a)

    init_db()
    daily_snapshot_if_needed()

    server = ThreadingHTTPServer((bind, port), Handler)
    ip = get_local_ip()
    line = "=" * 56
    print(line)
    print("  GuardPay is running")
    print(line)
    print(f"  On this computer:   http://localhost:{port}")
    if bind != "127.0.0.1":
        print(f"  On your Wi-Fi:      http://{ip}:{port}")
        print("")
        print("  Send the second link to your phone -")
        print("  your phone just needs to be on the same Wi-Fi.")
    print(f"  Data is saved to {DB_FILE}")
    print(f"  Backups in {BACKUP_DIR}")
    print("  Press Ctrl+C to stop the server.")
    print(line)

    if not no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
