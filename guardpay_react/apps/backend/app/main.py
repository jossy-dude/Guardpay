from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.database import init_db
from .api import auth, backups, extras, guard, houses, settings as settings_api, state

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        from .services.backups import daily_snapshot_if_needed

        await daily_snapshot_if_needed()
    except Exception:
        pass
    yield


app = FastAPI(
    title="GuardPay v2",
    version="2.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# CORS: allow the Vite dev server during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Everything under /api is gated by require_auth once a device PIN is enabled,
# except /api/auth/* (login, set-pin, disable, status) and the public resident
# self-service endpoints under /api/public/*.
app.include_router(state.router, dependencies=[Depends(auth.require_auth)])
app.include_router(auth.router)
app.include_router(houses.router, dependencies=[Depends(auth.require_auth)])
app.include_router(guard.router, dependencies=[Depends(auth.require_auth)])
app.include_router(settings_api.router, dependencies=[Depends(auth.require_auth)])
app.include_router(backups.router, dependencies=[Depends(auth.require_auth)])
app.include_router(extras.router, dependencies=[Depends(auth.require_auth)])
app.include_router(extras.public_router)


@app.get("/api/health")
async def health():
    return {"ok": True, "version": "2.0.0"}


# Serve built frontend if present (production single-command mode).
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")