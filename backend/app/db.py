import logging
import threading
import time
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings

log = logging.getLogger("lendwise.db")

# How often to retry a database that could not be reached (seconds).
RETRY_SECONDS = 30


class Base(DeclarativeBase):
    pass


class DatabaseUnavailable(Exception):
    """The database cannot be reached. Screening still works; saved data does not."""


def _make_engine(url: str):
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
    else:
        # Poolers (e.g. Supabase) close idle connections; check and recycle them. Fail fast when
        # the server is unreachable instead of hanging the request.
        kwargs.update(pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=5,
                      connect_args={"connect_timeout": 10})
    return create_engine(url, **kwargs)


engine = _make_engine(get_settings().resolved_database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from app import models_db  # noqa: F401  (register tables)

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """create_all() never alters existing tables; add new nullable/defaulted columns in place."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                ddl_type = col.type.compile(dialect=engine.dialect)
                default = ""
                if col.default is not None and col.default.is_scalar:
                    value = col.default.arg
                    literal = ("TRUE" if value else "FALSE") if isinstance(value, bool) else repr(value)
                    default = f" DEFAULT {literal}"
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl_type}{default}'))


_ready = False
_last_try = 0.0
_lock = threading.Lock()


def ensure_db(force: bool = False) -> bool:
    """Create the tables once the database is reachable. Never raises.

    A free Supabase project pauses after a week without use. The API must still start in that
    case, because screening does not need the database; only saved applications, messages and
    the officer dashboard do. Failed attempts are retried at most every RETRY_SECONDS.
    """
    global _ready, _last_try
    if _ready:
        return True
    with _lock:
        if _ready:
            return True
        now = time.monotonic()
        if not force and _last_try and now - _last_try < RETRY_SECONDS:
            return False
        _last_try = now
        try:
            init_db()
            _ready = True
            log.info("Database ready")
        except Exception as exc:  # unreachable host, paused project, wrong credentials
            first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
            log.error("Database not reachable, retrying in %ss: %s", RETRY_SECONDS, first_line[:300])
    return _ready


def database_status() -> str:
    return "ok" if ensure_db() else "unavailable"


def get_db() -> Iterator[Session]:
    if not ensure_db():
        raise DatabaseUnavailable()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
