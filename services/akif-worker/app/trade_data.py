import json
from datetime import UTC, datetime

import comtradeapicall
from fastapi import HTTPException

from .models import ComtradePreviewRequest, ComtradePreviewResponse


def preview_comtrade(request: ComtradePreviewRequest) -> ComtradePreviewResponse:
    try:
        frame = comtradeapicall.previewFinalData(
            typeCode="C",
            freqCode=request.frequency,
            clCode=request.classification,
            period=request.period,
            reporterCode=request.reporter_code,
            cmdCode=request.cmd_code,
            flowCode=request.flow_code,
            partnerCode=request.partner_code,
            partner2Code=request.partner2_code,
            customsCode=request.customs_code,
            motCode=request.mot_code,
            maxRecords=request.max_records,
            format_output="JSON",
            aggregateBy=None,
            breakdownMode="classic",
            countOnly=False,
            includeDesc=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="un_comtrade_request_failed") from exc

    if frame is None:
        raise HTTPException(status_code=502, detail="un_comtrade_empty_response")

    records = json.loads(frame.to_json(orient="records", date_format="iso"))
    return ComtradePreviewResponse(
        retrieved_at=datetime.now(UTC).isoformat(),
        source_url="https://comtradeapi.un.org/public/v1/preview/C/"
        f"{request.frequency}/{request.classification}",
        query=request.model_dump(),
        records=records,
    )
