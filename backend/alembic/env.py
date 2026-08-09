from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings
from app.core.db import engine
from app.models.base import Base

# Import model modules here so their tables register on Base.metadata for autogenerate.
from app.models.dataset import Dataset  # noqa: F401
from app.models.job import Job  # noqa: F401
from app.models.model_artifact import ModelArtifact  # noqa: F401
from app.models.run import Run  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
