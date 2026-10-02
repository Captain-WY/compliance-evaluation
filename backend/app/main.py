from contextlib import asynccontextmanager
import asyncio,uuid
from fastapi import FastAPI,Depends,Request,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import text
from app.core.config import get_settings
from app.core.database import common_engine,case_engine,compliance_engine
from app.core.models import register_models
register_models()
from app.platform import auth,files,dictionaries
from app.platform.scope import route_guard,install_scope_filters
from app.modules.compliance.core.errors import register_exception_handlers
from app.modules.cases.core.exceptions import BusinessException
from app.modules.cases.router import router as case_router
from app.modules.compliance.api.router import api_router as ce_router
install_scope_filters()
@asynccontextmanager
async def lifespan(app):
    from app.adapters.compliance_runtime import initialize_runtime
    await initialize_runtime()
    yield
    from app.modules.cases.api.bff.v1.notifications_bff import sse_shutdown_event
    sse_shutdown_event.set()
    for engine in [common_engine,case_engine,compliance_engine]:await engine.dispose()
def create_app():
    application=FastAPI(title='Compliance Evaluation',version='0.2.0',lifespan=lifespan)
    register_exception_handlers(application)
    application.add_middleware(CORSMiddleware,allow_origins=get_settings().cors_allow_origins.split(','),allow_methods=['*'],allow_headers=['*'],allow_credentials=True)
    @application.middleware('http')
    async def request_context(request,call_next):
        request.state.request_id=request.headers.get('X-Request-ID') or str(uuid.uuid4())
        response=await call_next(request)
        if request.url.path.startswith('/api/inspection/') and request.method in ['POST','PATCH','PUT','DELETE'] and response.status_code<400:
            from app.adapters.compliance_runtime import persist_plans
            await persist_plans()
        response.headers['X-Request-ID']=request.state.request_id;return response
    @application.exception_handler(BusinessException)
    async def business_error(request,exc):return JSONResponse(status_code=400,content={'code':exc.code,'message':exc.message,'details':exc.details})
    @application.get('/api/health')
    async def health():return {'status':'healthy','service':'compliance-evaluation'}
    @application.get('/api/ready')
    async def ready():
        import httpx
        from redis.asyncio import Redis
        from app.platform.files import storage
        checks={}
        for name,engine in [('common',common_engine),('cases',case_engine),('compliance',compliance_engine)]:
            try:
                async with engine.connect() as conn:await conn.execute(text('SELECT 1'))
                checks[name]='ok'
            except Exception:checks[name]='unavailable'
        try:
            client=Redis.from_url(get_settings().redis_url);await client.ping();await client.aclose();checks['redis']='ok'
        except Exception:checks['redis']='unavailable'
        try:checks['minio']='ok' if await asyncio.to_thread(storage().bucket_exists,get_settings().minio_bucket) else 'unavailable'
        except Exception:checks['minio']='unavailable'
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r=await client.get(get_settings().casdoor_endpoint+'/.well-known/jwks');r.raise_for_status();checks['casdoor']='ok'
        except Exception:checks['casdoor']='unavailable'
        return JSONResponse(status_code=200 if all(v=='ok' for v in checks.values()) else 503,content={'status':'ready' if all(v=='ok' for v in checks.values()) else 'not_ready','checks':checks})
    application.include_router(auth.router)
    application.include_router(files.router,dependencies=[Depends(route_guard)])
    application.include_router(dictionaries.router,dependencies=[Depends(route_guard)])
    # Public health/login have a unique owner; all retained business routes require actual authorization.
    from fastapi import APIRouter
    retained=APIRouter()
    for route in ce_router.routes:
        if route.path.startswith(('/auth','/health','/ready','/_foundation','/contracts')):continue
        retained.routes.append(route)
    application.include_router(retained,prefix='/api',dependencies=[Depends(route_guard)])
    application.include_router(case_router,dependencies=[Depends(route_guard)])
    application.add_api_route('/api/auth/me',auth.me,methods=['GET'])
    application.add_api_route('/api/v1/auth/me',auth.me,methods=['GET'])
    return application
app=create_app()
