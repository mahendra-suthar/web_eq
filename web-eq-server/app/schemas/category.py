from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class CategoryTreeNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[str] = None
    subcategories_count: int = 0
    services_count: int = 0
    has_businesses: bool = False
    children: List[CategoryTreeNode] = Field(default_factory=list)


class SubcategoryMinimal(BaseModel):
    uuid: str
    name: str


class CategoryData(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[str] = None
    has_businesses: bool = False
