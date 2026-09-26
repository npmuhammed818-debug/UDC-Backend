from pathlib import Path
from tempfile import NamedTemporaryFile

from docling.document_converter import DocumentConverter
from fastapi import HTTPException, UploadFile

from .models import DocumentExtractionResponse

MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_SUFFIXES = {
    ".pdf",
    ".docx",
    ".xlsx",
    ".pptx",
    ".html",
    ".htm",
    ".txt",
    ".md",
}

_converter = DocumentConverter()


async def extract_document(file: UploadFile) -> DocumentExtractionResponse:
    filename = file.filename or "document"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="unsupported_document_type")

    payload = await file.read(MAX_FILE_BYTES + 1)
    if len(payload) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")
    if not payload:
        raise HTTPException(status_code=400, detail="empty_document")

    temp_path: Path | None = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(payload)
            temp_path = Path(tmp.name)

        result = _converter.convert(temp_path)
        markdown = result.document.export_to_markdown()
        return DocumentExtractionResponse(
            filename=filename,
            markdown=markdown,
            character_count=len(markdown),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="document_parse_failed") from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
