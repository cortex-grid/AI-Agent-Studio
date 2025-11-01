from fastapi import APIRouter, UploadFile, File
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from typing import Dict, Any
from ..models.messages import ExportRequest
from ..services.exporter import create_export_zip
from ..services.project_validator import validate_project_payload, ProjectValidationError

router = APIRouter()


@router.post("/")
async def export_project(payload: ExportRequest):
    try:
        zip_bytes = create_export_zip(payload.project)
        project_name = payload.project.get("name", "project") if isinstance(payload.project, dict) else "project"
        filename = f"{project_name.replace(' ', '-').lower()}.zip"
        
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download")
async def download(path: str):
    return FileResponse(path)


@router.post("/validate")
async def validate_project(payload: ExportRequest):
    try:
        validate_project_payload(payload.project)
        return {"valid": True, "issues": []}
    except ProjectValidationError as exc:
        return {"valid": False, "issues": exc.issues}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
