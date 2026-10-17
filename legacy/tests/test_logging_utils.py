import json
from pathlib import Path
from jobassist.logging_utils import create_run_dir, save_screenshot, log_turn, save_summary


def test_logging_utils_flow(tmp_path):
    base_dir = tmp_path / "runs"
    run_dir = create_run_dir(base_dir)
    assert run_dir.is_dir()
    assert "run_" in run_dir.name

    # Save screenshot
    fake_png = b"\x89PNG\r\n\x1a\nfakeimagebytes"
    sc_path = save_screenshot(run_dir, 1, fake_png)
    assert sc_path.is_file()
    assert sc_path.name == "turn_001.png"
    assert sc_path.read_bytes() == fake_png

    # Log turn
    log_turn(run_dir, 1, "test_action", {"key": "val"}, "Test note")
    jsonl_path = run_dir / "run.jsonl"
    log_path = run_dir / "run.log"
    assert jsonl_path.is_file()
    assert log_path.is_file()

    with open(jsonl_path, "r", encoding="utf-8") as f:
        entry = json.loads(f.readline())
        assert entry["turn"] == 1
        assert entry["action"] == "test_action"
        assert entry["details"]["key"] == "val"
        assert entry["notes"] == "Test note"

    # Save summary
    summary_data = {"status": "completed", "turns": 1, "fields": ["name", "email"]}
    summary_path = save_summary(run_dir, summary_data)
    assert summary_path.is_file()
    with open(summary_path, "r", encoding="utf-8") as f:
        loaded = json.load(f)
        assert loaded["status"] == "completed"
        assert loaded["turns"] == 1
