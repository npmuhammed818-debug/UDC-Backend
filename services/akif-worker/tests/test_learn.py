from app import learn


def test_curated_topics_do_not_spend_model_quota(monkeypatch):
    monkeypatch.setattr(learn, "llm_status", lambda: {"configured": True})
    def fail(*args, **kwargs):
        raise AssertionError("must not call model for curated term")
    monkeypatch.setattr(learn, "complete", fail)
    assert "Cost, Insurance" in learn.explain_topic(learn.LearnRequest(topic="CIF")).explanation


def test_general_tutor_uses_fixed_udc_flow_and_handles_provider_failure(monkeypatch):
    monkeypatch.setattr(learn, "llm_status", lambda: {"configured": True})
    def complete(messages, sensitivity=None):
        assert sensitivity == "generic"
        assert "DLC" in messages[0]["content"]
        assert "explicit buyer agreement" in messages[0]["content"]
        assert "uses only DLC" not in messages[0]["content"]
        assert "SGS at destination" in messages[0]["content"]
        return "MOQ is the smallest order a seller accepts."
    monkeypatch.setattr(learn, "complete", complete)
    assert "smallest" in learn.explain_topic(learn.LearnRequest(topic="What is MOQ?")).explanation
    monkeypatch.setattr(learn, "complete", lambda messages, sensitivity=None: (_ for _ in ()).throw(RuntimeError("SECRET")))
    assert "SECRET" not in learn.explain_topic(learn.LearnRequest(topic="What is MOQ?")).explanation
