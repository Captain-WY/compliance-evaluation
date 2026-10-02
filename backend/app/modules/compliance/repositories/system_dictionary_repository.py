from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.models import InspectionPlanModel, SysDictModel


class SystemDictionaryRepository:
    async def list_all_items(self, session: AsyncSession) -> list[SysDictModel]:
        rows = await session.scalars(
            select(SysDictModel).order_by(
                SysDictModel.dict_type,
                SysDictModel.sort_order,
                SysDictModel.dict_code,
            )
        )
        return list(rows.all())

    async def list_business_items(
        self,
        session: AsyncSession,
        *,
        dict_types: list[str] | None,
    ) -> list[SysDictModel]:
        statement = select(SysDictModel).where(
            SysDictModel.is_deleted.is_(False),
            SysDictModel.is_active.is_(True),
        )
        if dict_types:
            statement = statement.where(SysDictModel.dict_type.in_(dict_types))
        statement = statement.order_by(
            SysDictModel.dict_type,
            SysDictModel.sort_order,
            SysDictModel.dict_code,
        )
        rows = await session.scalars(statement)
        return list(rows.all())

    async def list_inspection_plans(self, session: AsyncSession) -> list[InspectionPlanModel]:
        rows = await session.scalars(select(InspectionPlanModel))
        return list(rows.all())

    def add_item(self, session: AsyncSession, row: SysDictModel) -> None:
        session.add(row)

    async def commit(self, session: AsyncSession) -> None:
        await session.commit()


system_dictionary_repository = SystemDictionaryRepository()
