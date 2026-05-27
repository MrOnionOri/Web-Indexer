from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GateStack"
    environment: str = "local"
    secret_key: str = "change-this-secret-key"
    access_token_expire_minutes: int = 20
    refresh_token_expire_days: int = 14
    database_url: str | None = None
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "gatestack"
    db_table_prefix: str = "gatestack_"
    backend_cors_origins: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        user = quote_plus(self.db_user)
        password = f":{quote_plus(self.db_password)}" if self.db_password else ""
        database = quote_plus(self.db_name)
        return f"mysql+pymysql://{user}{password}@{self.db_host}:{self.db_port}/{database}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
