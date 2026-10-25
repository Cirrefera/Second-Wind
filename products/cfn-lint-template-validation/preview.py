"""Run the native AWS CloudFormation Linter against an inline template."""
import json, os, pathlib, shutil, subprocess, sys, tempfile

MAX_TEMPLATE_BYTES = 262144
MAX_DIAGNOSTICS = 100

def validate_template(configuration):
    """Return cfn-lint diagnostics for a CloudFormation or SAM template string."""
    if not isinstance(configuration, dict):
        raise ValueError("configuration_required")
    template = configuration.get("template")
    if not isinstance(template, str) or not template.strip():
        raise ValueError("template_required")
    if len(template.encode("utf-8")) > MAX_TEMPLATE_BYTES:
        raise ValueError("template_too_large")
    region = configuration.get("region", "us-east-1")
    if not isinstance(region, str) or len(region) > 32:
        raise ValueError("invalid_region")
    with tempfile.TemporaryDirectory(prefix="cfn-lint-preview-") as tmp:
        path = pathlib.Path(tmp) / "template.yaml"
        path.write_text(template, encoding="utf-8")
        cli = pathlib.Path(sys.executable).with_name("cfn-lint")
        executable = str(cli) if cli.exists() else shutil.which("cfn-lint") or "cfn-lint"
        proc = subprocess.run(
            [executable, "--format", "json", "--template", str(path), "--regions", region],
            capture_output=True, text=True, timeout=30, check=False,
            env={**os.environ, "AWS_EC2_METADATA_DISABLED": "true"},
        )
    try:
        raw = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        raise RuntimeError("cfn_lint_output_invalid") from None
    if not isinstance(raw, list):
        raise RuntimeError("cfn_lint_output_invalid")
    diagnostics = []
    for item in raw[:MAX_DIAGNOSTICS]:
        if not isinstance(item, dict):
            continue
        rule = item.get("Rule") if isinstance(item.get("Rule"), dict) else {}
        location = item.get("Location") if isinstance(item.get("Location"), dict) else {}
        start = location.get("Start") if isinstance(location.get("Start"), dict) else {}
        diagnostics.append({
            "rule_id": str(rule.get("Id", item.get("Id", "unknown")))[:80],
            "level": str(item.get("Level", item.get("Type", "warning"))).lower()[:20],
            "line": start.get("LineNumber", start.get("Line")),
            "column": start.get("ColumnNumber", start.get("Column")),
            "message": str(item.get("Message", ""))[:1000],
        })
    return {"ok": proc.returncode == 0, "diagnostic_count": len(raw),
            "diagnostics": diagnostics, "truncated": len(raw) > MAX_DIAGNOSTICS}

def preview(configuration):
    """Return a bounded, message-free summary for private sandbox use."""
    result = validate_template(configuration)
    return {"ok": result["ok"], "diagnostic_count": result["diagnostic_count"],
            "rule_ids": sorted({item["rule_id"] for item in result["diagnostics"]}),
            "truncated": result["truncated"]}
