from typing import Optional, cast

from pydantic import BaseModel

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

