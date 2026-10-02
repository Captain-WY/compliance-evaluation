from contextvars import ContextVar
from sqlalchemy import event, select, or_
from sqlalchemy.orm import Session, with_loader_criteria
principal_context=ContextVar('principal',default=None)
def install_scope_filters():
    from app.modules.cases.models.cases import Case
    from app.modules.cases.models.case_members import CaseMember
    from app.modules.cases.models.case_clues import CaseClue
    from app.modules.cases.models.case_counsels import CaseCounsel
    from app.modules.cases.models.external_lawyers import ExternalLawyer
    @event.listens_for(Session,'do_orm_execute')
    def scoped_cases(state):
        user=principal_context.get()
        if not user or not (state.is_select or state.is_update or state.is_delete) or 'all' in user.scopes: return
        state.statement=state.statement.options(with_loader_criteria(CaseClue,or_(CaseClue.created_by==user.id,CaseClue.assignee_id==user.id),include_aliases=True))
        allowed=select(CaseMember.case_id).where(CaseMember.user_id==user.id,CaseMember.tenant_id==user.tenant_id,CaseMember.is_deleted.is_(False),CaseMember.status=='ACTIVE')
        counsel=select(CaseCounsel.case_id).join(ExternalLawyer,ExternalLawyer.id==CaseCounsel.lawyer_id).where(ExternalLawyer.user_id==user.id,CaseCounsel.is_deleted.is_(False),ExternalLawyer.is_deleted.is_(False))
        state.statement=state.statement.options(with_loader_criteria(Case,or_(Case.created_by==user.id,Case.id.in_(allowed),Case.id.in_(counsel)),include_aliases=True))
from fastapi import Request
async def route_guard(request: Request):
    from fastapi import HTTPException
    from app.platform.auth import current_user
    from app.platform.authorization import enforce
    authorization=request.headers.get('authorization')
    user=await current_user(request,authorization)
    resource=request.scope['route'].path
    if not await enforce(user,resource,request.method): raise HTTPException(403,'Permission denied')
    if resource.startswith('/api/integrations/ekp/'):
        raise HTTPException(503,'EKP integration is not configured')
    if resource.startswith(('/api/bff/v1/ai/sessions/','/api/bff/v1/ai/chat/')):
        raise HTTPException(503,'AI chat integration is not configured')
    token=principal_context.set(user)
    try:
        if request.method in ['POST','PATCH','PUT'] and resource not in ['/api/files','/api/platform/files']:
            import json
            try:payload=await request.json()
            except (json.JSONDecodeError, UnicodeDecodeError):payload=None
            if isinstance(payload,dict):
                case_id=payload.get('case_id') or payload.get('caseId')
                clue_id=payload.get('clue_id') or payload.get('clueId')
                if clue_id and 'all' not in user.scopes:
                    from app.core.database import CaseSession
                    from app.modules.cases.models.case_clues import CaseClue
                    async with CaseSession() as s:
                        clue=await s.scalar(select(CaseClue).where(CaseClue.id==clue_id,CaseClue.tenant_id==user.tenant_id,CaseClue.is_deleted.is_(False)))
                    if clue is None:raise HTTPException(404,'Clue not found')
                if '/attachments/' in resource and not resource.endswith('/presign-put') and 'all' not in user.scopes:
                    from app.core.database import CommonSession
                    from app.modules.cases.models.sys_attachments import SysAttachment
                    attachment_id=payload.get('attachmentId')
                    if attachment_id:
                        async with CommonSession() as s:
                            attachment=await s.get(SysAttachment,attachment_id)
                        if not attachment or attachment.tenant_id!=user.tenant_id or attachment.is_deleted:
                            raise HTTPException(404,'Attachment not found')
                        if request.url.path.endswith('/delete') and attachment.uploader_id!=user.id:
                            raise HTTPException(403,'Only the uploader may delete this attachment')
                        business_type=attachment.business_type;business_id=attachment.business_id
                    else:
                        business_type=payload.get('businessType');business_id=payload.get('businessId')
                    if business_type not in ['CASE','CASE_DOCUMENT'] or not business_id:
                        raise HTTPException(403,'Attachment business scope is not authorized')
                    case_id=business_id
                if case_id and 'all' not in user.scopes:
                    from app.core.database import CaseSession
                    from app.modules.cases.models.cases import Case
                    async with CaseSession() as s:
                        case=await s.scalar(select(Case).where(Case.id==case_id,Case.tenant_id==user.tenant_id))
                        if case is None: raise HTTPException(404,'Case not found')
        yield user
    finally:
        principal_context.reset(token)
