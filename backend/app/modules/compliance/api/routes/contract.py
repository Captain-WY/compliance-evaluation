from fastapi import APIRouter, Request

from app.modules.compliance.contracts.loader import load_p0_contract_summary, load_p1_contract_summary
from app.modules.compliance.core.responses import success_response

router = APIRouter(prefix="/contracts", tags=["contracts"])


@router.get("/p0", name="p0-contract-summary")
async def p0_contract_summary(request: Request) -> dict:
    return success_response(load_p0_contract_summary(), request)


@router.get("/p1", name="p1-contract-summary")
async def p1_contract_summary(request: Request) -> dict:
    return success_response(load_p1_contract_summary(), request)
