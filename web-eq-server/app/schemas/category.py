from typing import Optional, cast, List, Dict
from pydantic import BaseModel, Field
from app.models.category import Category


class CategoryData(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[str] = None

    @classmethod
    def from_category(cls, category: Category) -> "CategoryData":
        description = cast(Optional[str], getattr(category, "description", None))
        image = cast(Optional[str], getattr(category, "image", None))
        parent_category_id = cast(Optional[object], getattr(category, "parent_category_id", None))

        return cls(
            uuid=str(category.uuid),
            name=str(category.name),
            description=str(description) if description is not None else None,
            image=str(image) if image is not None else None,
            parent_category_id=str(parent_category_id) if parent_category_id is not None else None,
        )


class CategoryWithServicesData(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    services: List[Dict[str, str]] = Field(default_factory=list)

    @classmethod
    def from_category_with_services(cls, category: Category, services: List[Dict[str, str]]) -> "CategoryWithServicesData":
        return cls(
            uuid=str(category.uuid),
            name=str(category.name),
            description=cast(Optional[str], getattr(category, "description", None)),
            image=cast(Optional[str], getattr(category, "image", None)),
            services=services,
        )