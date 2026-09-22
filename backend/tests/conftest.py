"""Session-wide fixtures.

The rate limiters in app.main are module-level singletons so they actually
share state across warm Lambda invocations (the point of them) - which means
every test in this suite that hits /process or /process-all through the same
Python process shares one counter too. Without a reset, a slow test run could
start tripping 429s on tests that have nothing to do with rate limiting.
"""
import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    from app import main

    main._process_limiter.calls.clear()
    main._process_all_limiter.calls.clear()
    yield
