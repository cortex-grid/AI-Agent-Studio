"""Export service - copies deliverables and injects project.json."""
from pathlib import Path
import json
import zipfile
import tempfile
import shutil
import re
from typing import Union, Dict, Any, List, Tuple, Optional
from ..models.project import Project
from .project_validator import (
    validate_project_payload,
    ProjectValidationError,
    HOSTED_TOOL_SUBTYPES,
    MCP_TOOL_SUBTYPES,
)
from .tool_catalog import get_tool_catalog


def create_export_zip(project: Union[Project, Dict[str, Any]]) -> bytes:
    """Create export ZIP."""
    deliverables_dir = Path(__file__).parent.parent.parent / "deliverables"
    backend_template = deliverables_dir / "backend-python"
    frontend_dir = deliverables_dir / "frontend"
    
    if not backend_template.exists():
        raise FileNotFoundError(f"Backend template not found: {backend_template}")
    if not frontend_dir.exists():
        raise FileNotFoundError(f"Frontend not found: {frontend_dir}")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        export_root = Path(temp_dir) / "export"
        export_root.mkdir()
        
        shutil.copytree(backend_template, export_root / "backend-python")
        shutil.copytree(frontend_dir, export_root / "frontend")
        
        # Convert project to dict if it's a Pydantic model
        project_dict = project.model_dump() if hasattr(project, 'model_dump') else project
        if not isinstance(project_dict, dict):
            raise TypeError("Project payload must be a dict or Project model")
        
        project_file = export_root / "project.json"
        with open(project_file, "w", encoding="utf-8") as f:
            json.dump(project_dict, f, indent=2, ensure_ascii=False)

        # Validate payload before packaging
        try:
            validate_project_payload(project_dict)
        except ProjectValidationError as exc:
            raise ValueError(f"Export aborted due to project validation errors: {exc}") from exc

        # Extract info from project dict
        graph = project_dict.get("graph", {})
        nodes = graph.get("nodes", [])
        agent_count = len([n for n in nodes if n.get("kind") in {"agent", "teamManager", "teamDirector"}])
        tool_count = len([n for n in nodes if n.get("kind") == "tool"])
        
        settings = project_dict.get("settings", {})
        provider = settings.get("defaultProvider", "openai") if isinstance(settings, dict) else "openai"
        project_name = project_dict.get("name", "Exported Project")
        
        readme = export_root / "README.md"
        readme.write_text(f"""# {project_name}

Exported from Agent Canvas

Agents: {agent_count}
Tools: {tool_count}
Provider: {provider}
""", encoding="utf-8")

        catalog_map = {item["subtype"]: item for item in get_tool_catalog()}

        _write_tool_manifest(
            nodes=nodes,
            backend_path=export_root / "backend-python",
            catalog_map=catalog_map,
        )
        _write_env_guidance(
            nodes=nodes,
            backend_path=export_root / "backend-python",
            catalog_map=catalog_map,
        )
        _write_evaluation_suite(export_root / "backend-python")

        zip_path = Path(temp_dir) / "project.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path in export_root.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(export_root)
                    zipf.write(file_path, arcname)
        
        return zip_path.read_bytes()


def _write_tool_manifest(
    nodes: List[Dict[str, Any]],
    backend_path: Path,
    catalog_map: Dict[str, Dict[str, Any]],
) -> None:
    """Generate tool manifest and ensure required tool implementations exist."""
    tools_dir = backend_path / "tools"
    manifest_path = backend_path / "tools_manifest.json"

    manifest: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for node in nodes:
        if node.get("kind") != "tool":
            continue

        node_id = node.get("id", "")
        data = node.get("data") or {}
        subtype = data.get("subtype")
        label = data.get("label")
        config = data.get("toolConfig") or {}

        if not subtype:
            raise ValueError(f"Tool node '{node_id or label}' missing subtype")

        if subtype in seen:
            # Skip duplicates; manifest only needs unique subtypes
            continue

        category, module_path = _classify_tool(subtype, tools_dir)
        catalog_entry = catalog_map.get(subtype, {})

        manifest.append(
            {
                "subtype": subtype,
                "label": catalog_entry.get("label", label),
                "category": category,
                "module": module_path,
                "configExample": config,
                "source": catalog_entry.get("source"),
                "requires": catalog_entry.get("requires"),
                "samplePrompts": catalog_entry.get("sample_prompts"),
            }
        )
        seen.add(subtype)

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _classify_tool(subtype: str, tools_dir: Path) -> Tuple[str, Optional[str]]:
    """Return category and module path for a tool subtype."""
    normalized = subtype.replace("-", "_")
    tool_file = tools_dir / f"{normalized}.py"
    tool_package = tools_dir / normalized / "__init__.py"

    if subtype in HOSTED_TOOL_SUBTYPES:
        return "hosted", None

    if subtype in MCP_TOOL_SUBTYPES:
        return "mcp", None

    if tool_file.exists():
        return "function", str(tool_file.relative_to(tools_dir.parent))

    if tool_package.exists():
        return "function", str(tool_package.parent.relative_to(tools_dir.parent))

    raise FileNotFoundError(
        f"Tool subtype '{subtype}' does not have an implementation under {tools_dir}"
    )


def _write_env_guidance(
    nodes: List[Dict[str, Any]],
    backend_path: Path,
    catalog_map: Dict[str, Dict[str, Any]],
) -> None:
    """Create an env guidance file listing required secrets for selected tools."""
    items: List[Tuple[str, str, List[str]]] = []
    seen: set[str] = set()

    for node in nodes:
        if node.get("kind") != "tool":
            continue

        subtype = (node.get("data") or {}).get("subtype")
        if not subtype or subtype in seen:
            continue

        catalog_entry = catalog_map.get(subtype, {})
        requires = catalog_entry.get("requires") or []
        label = catalog_entry.get("label") or node.get("data", {}).get("label") or subtype

        items.append((subtype, label, requires))
        seen.add(subtype)

    if not items:
        return

    env_lines = [
        "# Autogenerated summary of environment variables referenced by tools.",
        "# Review and add the values below into your deployment secrets.",
        "",
    ]

    seen_vars: set[str] = set()

    for subtype, label, requires in items:
        env_lines.append(f"# {label} ({subtype})")
        if not requires:
            env_lines.append("#   This tool does not declare required secrets.")
            env_lines.append("")
            continue

        vars_for_tool: List[str] = []
        for requirement in requires:
            for candidate in _extract_env_vars(requirement):
                if candidate not in seen_vars:
                    vars_for_tool.append(candidate)
                    seen_vars.add(candidate)

        if vars_for_tool:
            for var in vars_for_tool:
                env_lines.append(f"{var}=")
        else:
            env_lines.append("#   " + "; ".join(requires))

        env_lines.append("")

    env_path = backend_path / ".env.generated.example"
    env_path.write_text("\n".join(env_lines), encoding="utf-8")


def _extract_env_vars(text: str) -> List[str]:
    """Extract uppercase environment-like tokens from text."""
    return re.findall(r"[A-Z][A-Z0-9_]{2,}", text or "")



def _write_evaluation_suite(backend_path: Path) -> None:
    evaluations_dir = Path(__file__).resolve().parents[2] / ".evaluations"
    if not evaluations_dir.exists():
        return

    scenarios = []
    for file_path in sorted(evaluations_dir.glob("*.json")):
        try:
            with file_path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            scenarios.append(payload)
        except Exception as exc:
            print(f"Failed to include evaluation scenario {file_path}: {exc}")

    if not scenarios:
        return

    tests_dir = backend_path / "tests"
    tests_dir.mkdir(parents=True, exist_ok=True)
    suite_path = tests_dir / "scenarios.json"
    suite_path.write_text(json.dumps({"scenarios": scenarios}, indent=2), encoding="utf-8")
