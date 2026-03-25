"""Core MCP client — integration layer between pyrfl and the ruflo CLI."""

import subprocess
import json
import sys

# Global flag — all ruflo invocations use v3 mode
_RUFLO_BASE = ["ruflo", "--v3-mode"]


def mcp_exec(tool: str, params: dict | None = None) -> dict:
    """Call ruflo MCP tool and return parsed JSON result."""
    cmd = [*_RUFLO_BASE, "mcp", "exec", "--tool", tool]
    if params:
        cmd += ["-p", json.dumps(params)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return {"success": False, "error": "ruflo not found. Install: npm i -g @claude-flow/cli@latest"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Timed out after 30s: ruflo mcp exec --tool {tool}"}
    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip() or f"Exit code {result.returncode}"}
    return parse_json(result.stdout)


def parse_json(raw: str) -> dict:
    """Extract JSON from potentially mixed output."""
    raw = raw.strip()
    if not raw:
        return {}
    # Try direct parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Find last balanced {} block
    try:
        end = raw.rindex("}")
        depth = 0
        for i in range(end, -1, -1):
            if raw[i] == "}":
                depth += 1
            elif raw[i] == "{":
                depth -= 1
            if depth == 0:
                return json.loads(raw[i : end + 1])
    except (ValueError, json.JSONDecodeError):
        pass
    # Try array
    try:
        end = raw.rindex("]")
        depth = 0
        for i in range(end, -1, -1):
            if raw[i] == "]":
                depth += 1
            elif raw[i] == "[":
                depth -= 1
            if depth == 0:
                return {"items": json.loads(raw[i : end + 1])}
    except (ValueError, json.JSONDecodeError):
        pass
    return {"raw": raw}


def list_tools() -> list[dict]:
    """Get all available MCP tools."""
    result = mcp_exec("tools_list")
    return result.get("tools", [])


def ruflo_run(cmd: str, sub: str, *args: str, timeout: int = 30) -> dict:
    """Run a ruflo CLI command directly and return parsed output."""
    full_cmd = [*_RUFLO_BASE, cmd, sub, *args]
    try:
        result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return {"success": False, "error": "ruflo not found. Install: npm i -g @claude-flow/cli@latest"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Timed out after {timeout}s: {' '.join(full_cmd)}"}
    output = result.stdout.strip()
    if result.returncode != 0:
        err = result.stderr.strip() or output or f"Exit code {result.returncode}"
        return {"success": False, "error": err, "raw": output}
    parsed = parse_json(output)
    if "raw" in parsed or not parsed:
        return {"success": True, "raw": output}
    parsed["success"] = True
    return parsed
