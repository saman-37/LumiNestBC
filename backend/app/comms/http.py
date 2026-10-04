"""Shared HTTPS settings for outbound API calls (ElevenLabs, Gemini).

Uses certifi's CA bundle so TLS verification works everywhere, including python.org macOS
builds that don't ship system certificates (which fail with CERTIFICATE_VERIFY_FAILED).
"""
import ssl
from functools import lru_cache

import certifi


@lru_cache(maxsize=1)
def ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())
