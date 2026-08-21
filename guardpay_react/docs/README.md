# Ledger — Launch & Ops

The app (formerly codenamed *guardpay*) is now launched with the global command:

```bash
ledger
```

It builds the frontend (if you pass no `--no-build` flag) and starts the FastAPI
backend, which serves the built UI on port `8420`.

## Usage

```bash
ledger                         # build frontend + run on 0.0.0.0:8420
ledger --port 9001             # different port
ledger --host 127.0.0.1        # localhost only
ledger --no-browser            # don't auto-open a browser
ledger --no-build              # skip the frontend build (use latest dist)
ledger --help                  # all options
```

The `ledger` binary is a symlink created in `~/.local/bin` (already on PATH)
pointing at `cli/ledger`. To (re)install after a move:

```bash
rm -f ~/.local/bin/ledger
ln -s /home/jossy/Documents/Projects/Payment-tracker/guardpay_react/cli/ledger ~/.local/bin/ledger
```

## Layout

- `apps/frontend/` — React 19 + Vite + Tailwind 4 + TanStack Query frontend.
  `pnpm build` writes to `apps/frontend/dist/`.
- `apps/backend/` — FastAPI + SQLAlchemy + SQLite (WAL). Uvicorn serves the
  built frontend from `apps/frontend/dist` in production mode
  (`app/main.py`). Dev server normally runs on :5173.
- `apps/data/guardpay.db` — the SQLite database; `apps/data/backups/` holds DB snapshots.
- `cli/ledger` — the production launcher script (installed as the `ledger` command).

## Notes

- Production single-command mode requires a built frontend; `ledger` rebuilds it
  automatically unless `--no-build` is passed.
- The old `guardpay` command was removed in favor of `ledger`.