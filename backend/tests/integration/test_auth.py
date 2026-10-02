import json,time
import jwt,pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from app.platform import auth
@pytest.fixture
def jwt_setup(monkeypatch):
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    jwk=json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()));jwk.update(kid='test',alg='RS256')
    monkeypatch.setattr(auth,'_jwks_cache',(time.time(),{'keys':[jwk]}))
    cfg=auth.get_settings()
    monkeypatch.setattr(cfg,'casdoor_client_id','client')
    monkeypatch.setattr(cfg,'casdoor_public_endpoint','http://issuer.example')
    return key,{'sub':'immutable-subject','iss':'http://issuer.example','aud':'client','exp':int(time.time())+600,'iat':int(time.time())}
@pytest.mark.asyncio
async def test_signed_jwt_issuer_audience_expiry(jwt_setup):
    key,claims=jwt_setup
    token=jwt.encode(claims,key,algorithm='RS256',headers={'kid':'test'})
    assert (await auth.validate_token(token))['sub']=='immutable-subject'
    for wrong in [{'iss':'http://other.example'},{'aud':'other-client'},{'exp':int(time.time())-60}]:
        token=jwt.encode({**claims,**wrong},key,algorithm='RS256',headers={'kid':'test'})
        with pytest.raises(HTTPException) as exc:await auth.validate_token(token)
        assert exc.value.status_code==401
@pytest.mark.asyncio
async def test_unsigned_and_algorithm_confusion_rejected(jwt_setup):
    _,claims=jwt_setup
    for token in [jwt.encode(claims,'',algorithm='none'),jwt.encode(claims,'test',algorithm='HS256')]:
        with pytest.raises(HTTPException) as exc:await auth.validate_token(token)
        assert exc.value.status_code==401
