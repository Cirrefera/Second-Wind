"""Private product preview: run framework diagnostics without returning product files."""
import json
import os
import sys
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SLUG = 'chalice-rest-api-decorator-pattern'

def preview(configuration=None, selected_components=None):
    if not isinstance(configuration, dict):
        return {"slug": SLUG, "ok": False, "status": "invalid", "diagnostic_codes": ["invalid_configuration"]}
    if set(configuration) - {"language", "stage"}:
        return {"slug": SLUG, "ok": False, "status": "invalid", "diagnostic_codes": ["invalid_configuration"]}
    if configuration.get("language") != "python":
        return {"slug": SLUG, "ok": False, "status": "invalid", "diagnostic_codes": ["explicit_language_required"]}
    if selected_components not in (None, []):
        return {"slug": SLUG, "ok": False, "status": "invalid", "diagnostic_codes": ["unsupported_components"]}
    try:
        import chalice
    except ImportError:
        return {"slug": SLUG, "ok": False, "status": "unavailable", "diagnostic_codes": ["runtime_dependency_unavailable"]}
    with tempfile.TemporaryDirectory(prefix="sw-chalice-preview-") as tmp:
        work = Path(tmp)
        (work / "app.py").write_bytes((ROOT / "app.py").read_bytes())
        (work / ".chalice").mkdir()
        stage = configuration.get("stage", "dev")
        (work / ".chalice" / "config.json").write_text(json.dumps({"version": "2.0", "app_name": "preview", "stages": {stage: {}}}))
        command = [os.sys.executable, "-c", "from chalice.cli import main; main()", "package", str(work / "out")]
        if "stage" in configuration:
            command.extend(["--stage", configuration["stage"]])
        try:
            child_env = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "TMP", "TEMP", "LANG", "LC_ALL") if key in os.environ}
            child_env.update({"AWS_DEFAULT_REGION": "us-east-1", "AWS_EC2_METADATA_DISABLED": "true"})
            result = subprocess.run(command, cwd=work, env=child_env, capture_output=True, text=True, timeout=20, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return {"slug": SLUG, "ok": False, "status": "unavailable", "diagnostic_codes": ["framework_runtime_unavailable"]}
        response = {"slug": SLUG, "ok": result.returncode == 0, "status": "ok" if result.returncode == 0 else "error", "diagnostic_codes": [] if result.returncode == 0 else ["chalice_package_failed"]}
        if result.returncode == 0:
            template_path = work / "out" / "sam.json"
            try:
                template = json.loads(template_path.read_text())
                resources = template.get("Resources")
                if isinstance(resources, dict):
                    response["resource_count"] = len(resources)
            except (OSError, ValueError):
                pass
        return response

if __name__ == "__main__":
    try:
        input_value = json.loads(sys.stdin.read())
        result = preview(input_value, [])
    except (ValueError, TypeError):
        result = {"slug": SLUG, "ok": False, "status": "invalid", "diagnostic_codes": ["invalid_json"]}
    print(json.dumps(result, separators=(",", ":")))
