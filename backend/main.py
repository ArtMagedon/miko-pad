import json
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

BOARD_FILE = Path(os.environ.get("BOARD_FILE", "/data/board.excalidraw"))
EMPTY_BOARD = {"elements": [], "appState": {}, "files": {}}

app = FastAPI(title="Miko Pad API", docs_url=None, redoc_url=None)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/board")
async def get_board() -> JSONResponse:
    if not BOARD_FILE.exists():
        return JSONResponse(EMPTY_BOARD)

    try:
        with BOARD_FILE.open("r", encoding="utf-8") as board:
            data = json.load(board)
        if not isinstance(data, dict):
            raise ValueError("Board root must be a JSON object")
        return JSONResponse(data)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Cannot read board file: {error}") from error


@app.put("/api/board")
async def put_board(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON") from error

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Board must be a JSON object")
    if not isinstance(data.get("elements", []), list):
        raise HTTPException(status_code=400, detail="'elements' must be an array")
    if not isinstance(data.get("appState", {}), dict):
        raise HTTPException(status_code=400, detail="'appState' must be an object")
    if not isinstance(data.get("files", {}), dict):
        raise HTTPException(status_code=400, detail="'files' must be an object")

    try:
        BOARD_FILE.parent.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{BOARD_FILE.name}.",
            suffix=".tmp",
            dir=BOARD_FILE.parent,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as temporary:
                temporary.write(encoded)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, BOARD_FILE)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Cannot save board file: {error}") from error

    return {"status": "saved", "bytes": len(encoded.encode("utf-8"))}
