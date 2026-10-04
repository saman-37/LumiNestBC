"""ElevenLabs audio is generated once per exact text and reused."""
import pytest

from app import config
from app.comms import voice


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    voice.clear_audio_cache()
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "test")
    yield
    voice.clear_audio_cache()


def test_same_text_calls_elevenlabs_once(monkeypatch):
    calls = []
    monkeypatch.setattr(voice, "text_to_speech", lambda text: calls.append(text) or b"mp3")
    first = voice.audio_id_for("Hello there")
    second = voice.audio_id_for("Hello there")
    assert first == second and calls == ["Hello there"]
    assert voice.get_cached_audio(first) == b"mp3"
    voice.audio_id_for("Something else")
    assert len(calls) == 2


def test_failed_generation_is_not_cached(monkeypatch):
    results = iter([None, b"mp3"])
    monkeypatch.setattr(voice, "text_to_speech", lambda text: next(results))
    assert voice.audio_id_for("Hi") is None
    assert voice.audio_id_for("Hi") is not None


def test_dynamic_answers_expire_but_fixed_phrases_stay(monkeypatch):
    monkeypatch.setattr(voice, "text_to_speech", lambda text: b"mp3")
    clock = iter([0.0, 0.0, 10_000.0])
    monkeypatch.setattr(voice.time, "monotonic", lambda: next(clock))
    fixed = voice.audio_id_for("greeting", fixed=True)
    dynamic = voice.audio_id_for("Lantern House has 2 beds")
    voice.audio_id_for("a later answer")  # inserting runs eviction at t=10000
    assert voice.get_cached_audio(fixed) == b"mp3"
    assert voice.get_cached_audio(dynamic) is None


def test_prewarm_generates_fixed_phrases_once(monkeypatch):
    calls = []
    monkeypatch.setattr(voice, "text_to_speech", lambda text: calls.append(text) or b"mp3")
    assert voice.prewarm_fixed_phrases() == len(voice.FIXED_PHRASES)
    voice.prewarm_fixed_phrases()
    assert len(calls) == len(voice.FIXED_PHRASES)


def test_model_is_configurable(monkeypatch):
    sent = {}

    class FakeResponse:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b"mp3"

    def fake_urlopen(req, timeout, context=None):
        import json
        sent.update(json.loads(req.data))
        return FakeResponse()

    monkeypatch.setattr(voice.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(config, "ELEVENLABS_MODEL", "eleven_flash_v2_5")
    assert voice.text_to_speech("Hi") == b"mp3" and sent["model_id"] == "eleven_flash_v2_5"


class FakeResponse:
    status = 200

    def __init__(self, body=b"mp3-bytes"):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_quota_refusal_is_logged_with_reason_and_pauses_requests(monkeypatch, caplog):
    import io
    import json
    import urllib.error
    calls = []
    body = json.dumps({"detail": {"status": "quota_exceeded", "message": "You have 10 credits remaining"}}).encode()

    def refuse(req, **kwargs):
        calls.append(req.get_header("Xi-api-key"))
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, io.BytesIO(body))
    monkeypatch.setattr(voice.urllib.request, "urlopen", refuse)
    assert voice.text_to_speech("Hello") is None
    assert "quota_exceeded: You have 10 credits remaining" in caplog.text
    assert voice.text_to_speech("Hello again") is None
    assert calls == ["test"]  # paused: the second line didn't hit ElevenLabs


def test_audio_is_reused_from_disk_after_a_restart(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "AUDIO_DISK_CACHE_DIR", str(tmp_path))
    calls = []
    monkeypatch.setattr(voice.urllib.request, "urlopen", lambda req, **kw: calls.append(1) or FakeResponse())
    assert voice.text_to_speech("Welcome") == b"mp3-bytes"
    voice.clear_audio_cache()  # what a restart does to the memory cache
    assert voice.text_to_speech("Welcome") == b"mp3-bytes"
    assert calls == [1] and len(list(tmp_path.glob("*.mp3"))) == 1


def test_startup_log_shows_key_length_not_key(monkeypatch, caplog):
    import logging
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "sk_secret_value_1234")
    voice.log_tts_config()
    assert "length 20" in caplog.text and "sk_secret" not in caplog.text
