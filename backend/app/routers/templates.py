"""
Templates router - Serves pre-built agent team templates.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import json
from pathlib import Path

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"


def _load_templates():
    """Load all template files."""
    templates = []
    if not TEMPLATES_DIR.exists():
        return templates
    
    for template_file in TEMPLATES_DIR.glob("*.json"):
        try:
            with open(template_file, "r", encoding="utf-8") as f:
                template = json.load(f)
                templates.append({
                    "id": template.get("id"),
                    "name": template.get("name"),
                    "description": template.get("description"),
                    "category": template.get("metadata", {}).get("category"),
                    "tags": template.get("metadata", {}).get("tags", []),
                })
        except Exception as e:
            print(f"Error loading template {template_file}: {e}")
    
    return templates


@router.get("")
async def list_templates():
    """List all available templates."""
    templates = _load_templates()
    return {
        "templates": templates,
        "count": len(templates)
    }


@router.get("/{template_id}")
async def get_template(template_id: str):
    """Get a specific template by ID."""
    template_file = TEMPLATES_DIR / f"{template_id}.json"
    
    if not template_file.exists():
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
    
    try:
        with open(template_file, "r", encoding="utf-8") as f:
            template = json.load(f)
        return template
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading template: {str(e)}")


@router.get("/category/{category}")
async def get_templates_by_category(category: str):
    """Get all templates in a category."""
    templates = _load_templates()
    filtered = [t for t in templates if t.get("category", "").lower() == category.lower()]
    return {
        "category": category,
        "templates": filtered,
        "count": len(filtered)
    }
