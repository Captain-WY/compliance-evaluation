from casbin import Enforcer, Model
MODEL = '''[request_definition]
r = sub, obj, act
[policy_definition]
p = sub, obj, act
[role_definition]
g = _, _
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
'''
def make_enforcer(policies):
    model=Model(); model.load_model_from_text(MODEL)
    enforcer=Enforcer(model)
    for role,obj,act in policies: enforcer.add_policy(role,obj,act)
    return enforcer
async def enforce(user, resource, action):
    from app.core.database import CommonSession
    from app.modules.cases.models.casbin_rule import CasbinRule
    from sqlalchemy import select
    async with CommonSession() as s:
        rows=(await s.scalars(select(CasbinRule).where(CasbinRule.ptype=='p'))).all()
    enforcer=make_enforcer([(r.v0,r.v1,r.v2) for r in rows])
    return any(enforcer.enforce(role,resource,action) for role in user.role_codes)
