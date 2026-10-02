"""Role vocabulary adapters; the public role grants remain the single authority."""
CASE_ROLES={'platform_admin':'SYS_ADMIN','hq_business':'LEGAL_ADMIN','branch_business':'CASE_HANDLER','department_business':'BUSINESS_USER','external_lawyer':'EXTERNAL_LAWYER'}
def case_role_codes(codes):return {CASE_ROLES.get(code,code) for code in codes}
