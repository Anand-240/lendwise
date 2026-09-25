from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LendWise API"
    jwt_secret: str = "change-me-demo-secret"
    jwt_expire_minutes: int = 480
    admin_email: str = "admin@lendwise.demo"
    admin_password: str = "Admin@123"  # plain text or a bcrypt hash ($2b$...)
    demo_interest_rate: float = 10.5
    business_timezone: str = "Asia/Kolkata"  # day boundaries for dashboard charts and date filters
    cors_origins: str = "http://localhost:3000"
    database_url: str = "sqlite:///./lendwise.db"
    model_path: str = "app/ml/artifacts/model.pkl"
    scaler_path: str = "app/ml/artifacts/scaler.pkl"
    artifacts_dir: str = "app/ml/artifacts"
    model_url: str = ""  # optional: download model.pkl here on first boot if missing (e.g. on Render)
    model_sha256: str = ""  # optional integrity check for the downloaded model
    log_level: str = "info"
    rate_limit_per_minute: int = 10
    rate_limit_global_per_minute: int = 120  # backstop across all clients (IP headers can be spoofed)
    force_demo_mode: bool = False
    # Model output is a recommendation; a loan officer makes the final decision.
    require_officer_review: bool = True

    # Public site URL used for links inside emails.
    public_site_url: str = "http://localhost:3000"

    # Email: without RESEND_API_KEY, emails are captured in the outbox (demo) instead of delivered.
    resend_api_key: str = ""
    email_from: str = "LendWise <no-reply@lendwise.demo>"
    email_reply_to: str = ""

    # Phone OTP: without Twilio credentials, codes are generated locally and shown on screen (demo).
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_verify_service_sid: str = ""
    require_phone_verification: bool = True
    otp_ttl_seconds: int = 600
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 30
    otp_max_sends_per_hour: int = 5
    phone_token_ttl_minutes: int = 30

    @property
    def email_mode(self) -> str:
        return "live" if self.resend_api_key else "demo"

    @property
    def sms_mode(self) -> str:
        live = self.twilio_account_sid and self.twilio_auth_token and self.twilio_verify_service_sid
        return "live" if live else "demo"

    @field_validator("log_level")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    def resolve(self, path: str) -> Path:
        p = Path(path)
        return p if p.is_absolute() else BACKEND_DIR / p

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url.strip()
        # Hosted Postgres (Supabase, Neon, Render) hands out postgres:// or postgresql:// URLs;
        # SQLAlchemy needs the driver named explicitly to use psycopg 3.
        for scheme in ("postgres://", "postgresql://"):
            if url.startswith(scheme):
                url = "postgresql+psycopg://" + url[len(scheme):]
                break
        if url.startswith("postgresql+psycopg://") and "sslmode=" not in url:
            host = url.split("@", 1)[-1].split("/", 1)[0].split(":", 1)[0]
            if host not in ("localhost", "127.0.0.1", "db", "postgres"):
                url += ("&" if "?" in url else "?") + "sslmode=require"
        if not url.startswith("sqlite"):
            return url
        # Anchor relative SQLite paths to backend/ so the DB location doesn't depend on cwd.
        prefix = "sqlite:///"
        if url.startswith(prefix) and not url.startswith(prefix + "/"):
            rel = url[len(prefix):]
            if rel != ":memory:":
                return prefix + str(self.resolve(rel))
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
