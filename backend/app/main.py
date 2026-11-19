import os

# Applications are scored one at a time. Starting an OpenMP thread pool for every call costs far
# more than the work itself (about 60 ms against 4 ms per model on an 8-core laptop), so the API
# runs OpenMP single-threaded. This must be set before scikit-learn loads OpenMP.
os.environ.setdefault("OMP_NUM_THREADS", "1")

import logging  # noqa: E402
from contextlib import asynccontextmanager
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db import init_db
from app.middleware import RequestContextMiddleware
from app.ml.registry import get_screener
from app.ml.validator import InputError
from app.routers import admin, applications, contact, health, metadata, screen

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lendwise")
# Uvicorn's access log prints full query strings (e.g. ?email= on status checks). Our middleware
# logs method + route template + status instead, so PII never reaches the logs.
logging.getLogger("uvicorn.access").disabled = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    get_screener().load()
    log.info("LendWise API ready (models=%s, email=%s)", get_screener().mode, settings.email_mode)
    yield


app = FastAPI(
    title="LendWise API",
    version="1.0.0",
    description="Loan eligibility screening and charge-off risk prediction. Two monotonic, calibrated "
    "gradient boosting models score loan amount, FICO score and DTI; a loan officer makes the final decision.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Access-Token"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestContextMiddleware)


def _error(request: Request, status_code: int, code: str, message: str, details=None, headers=None):
    body = {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "request_id": getattr(request.state, "request_id", None),
        }
    }
    return JSONResponse(status_code=status_code, content=jsonable_encoder(body), headers=headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: HTTPException):
    code = HTTPStatus(exc.status_code).phrase.upper().replace(" ", "_")
    return _error(request, exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    details = []
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", ()) if p not in ("body", "query", "header", "path")]
        msg = e.get("msg", "Invalid value").removeprefix("Value error, ")
        if not loc and ": " in msg:
            # Cross-field checks report "field: message; field: message".
            for part in msg.split("; "):
                field, _, m = part.partition(": ")
                details.append({"field": field, "message": m})
            continue
        details.append({"field": ".".join(loc) or None, "message": msg})
    return _error(request, 422, "VALIDATION_ERROR", "Some fields are invalid. Please review and try again.", details)


@app.exception_handler(InputError)
async def input_error(request: Request, exc: InputError):
    # One clear message and nothing scored (report Section 3.1.2).
    return _error(request, 422, "VALIDATION_ERROR", exc.message, [exc.as_dict()])


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    log.exception("Unhandled error rid=%s", getattr(request.state, "request_id", None))
    return _error(request, 500, "INTERNAL_ERROR", "Something went wrong on our side. Please try again.")


for r in (health.router, metadata.router, screen.router, applications.router, contact.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root():
    return {"name": "LendWise API", "docs": "/docs", "health": "/api/v1/health"}
