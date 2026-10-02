from typing import Any

from pydantic import BaseModel, Field


class ConfigDictionaryItem(BaseModel):
    dict_id: str = Field(alias="dictId")
    dict_type: str = Field(alias="dictType")
    dict_code: str = Field(alias="dictCode")
    dict_label: str = Field(alias="dictLabel")
    dict_label_en: str | None = Field(default=None, alias="dictLabelEn")
    parent_id: str | None = Field(default=None, alias="parentId")
    sort_order: int = Field(alias="sortOrder")
    is_active: bool = Field(alias="isActive")
    is_system: bool = Field(alias="isSystem")
    edit_policy: str = Field(alias="editPolicy")
    description: str | None = None
    ui_meta: dict[str, Any] = Field(default_factory=dict, alias="uiMeta")
    source: str
    version: int

    model_config = {"populate_by_name": True}


class ConfigDictionariesResponse(BaseModel):
    schema_version: int = Field(default=1, alias="schemaVersion")
    source: str = "database"
    dictionaries: dict[str, list[ConfigDictionaryItem]]

    model_config = {"populate_by_name": True}


class DictionaryAdminItem(BaseModel):
    dict_id: str = Field(alias="dictId")
    parent_id: str | None = Field(default=None, alias="parentId")
    dict_type: str = Field(alias="dictType")
    dict_code: str = Field(alias="dictCode")
    label: str
    label_en: str | None = Field(default=None, alias="labelEn")
    sort_order: int = Field(alias="sortOrder")
    active: bool
    is_system: bool = Field(alias="isSystem")
    edit_policy: str = Field(alias="editPolicy")
    description: str | None = None
    ui_meta: dict[str, Any] = Field(default_factory=dict, alias="uiMeta")
    source: str
    version: int
    is_deleted: bool = Field(alias="isDeleted")

    model_config = {"populate_by_name": True}


class DictionaryAdminTypeSummary(BaseModel):
    dict_type: str = Field(alias="dictType")
    type_label: str = Field(alias="typeLabel")
    item_count: int = Field(alias="itemCount")
    active_count: int = Field(alias="activeCount")
    inactive_count: int = Field(alias="inactiveCount")

    model_config = {"populate_by_name": True}


class DictionaryAdminTypeListResponse(BaseModel):
    schema_version: int = Field(default=1, alias="schemaVersion")
    source: str = "database"
    items: list[DictionaryAdminTypeSummary]

    model_config = {"populate_by_name": True}


class DictionaryAdminItemListResponse(BaseModel):
    items: list[DictionaryAdminItem]
    page: int
    page_size: int = Field(alias="pageSize")
    total: int

    model_config = {"populate_by_name": True}


class DictionaryAdminItemCreateRequest(BaseModel):
    dict_type: str = Field(alias="dictType", min_length=1, max_length=64)
    dict_code: str = Field(alias="dictCode", min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    label_en: str | None = Field(default=None, alias="labelEn", max_length=160)
    parent_id: str | None = Field(default=None, alias="parentId", max_length=80)
    sort_order: int = Field(default=0, alias="sortOrder")
    active: bool = True
    description: str | None = None
    ui_meta: dict[str, Any] = Field(default_factory=dict, alias="uiMeta")

    model_config = {"populate_by_name": True}


class DictionaryAdminItemUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    label: str | None = Field(default=None, min_length=1, max_length=160)
    label_en: str | None = Field(default=None, alias="labelEn", max_length=160)
    sort_order: int | None = Field(default=None, alias="sortOrder")
    active: bool | None = None
    description: str | None = None
    ui_meta: dict[str, Any] | None = Field(default=None, alias="uiMeta")

    model_config = {"populate_by_name": True}


class DictionaryAdminSortItem(BaseModel):
    dict_id: str = Field(alias="dictId", min_length=1)
    sort_order: int = Field(alias="sortOrder")
    version: int = Field(ge=1)

    model_config = {"populate_by_name": True}


class DictionaryAdminSortRequest(BaseModel):
    items: list[DictionaryAdminSortItem] = Field(min_length=1)

    model_config = {"populate_by_name": True}


class DictionaryAdminDeleteResponse(BaseModel):
    deleted_count: int = Field(alias="deletedCount")
    dict_ids: list[str] = Field(alias="dictIds")

    model_config = {"populate_by_name": True}
