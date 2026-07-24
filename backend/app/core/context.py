from contextvars import ContextVar

# Correlates log lines and error envelopes to a single request. Set by the
# request-id middleware; read by the logging formatter and exception handlers.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
