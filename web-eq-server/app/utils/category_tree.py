"""Build category tree responses for GET /category/tree (shared validation + assembly)."""

from __future__ import annotations

from typing import Any, List, Optional
from uuid import UUID

from fastapi import HTTPException

from app.schemas.category import CategoryTreeNode


def _row_to_node(row: Any) -> CategoryTreeNode:
    return CategoryTreeNode(
        uuid=str(row.uuid),
        name=row.name,
        description=row.description,
        image=row.image,
        parent_category_id=str(row.parent_category_id) if row.parent_category_id else None,
        subcategories_count=int(row.subcategories_count or 0),
        services_count=int(row.services_count or 0),
        children=[],
    )


def _sort_tree(nodes: List[CategoryTreeNode]) -> List[CategoryTreeNode]:
    nodes.sort(key=lambda x: x.name.lower())
    for node in nodes:
        _sort_tree(node.children)
    return nodes


def _validate_parent_scope(rows: List[Any], parent_uuid: UUID) -> None:
    if not any(str(row.uuid) == str(parent_uuid) for row in rows):
        raise HTTPException(status_code=404, detail="Parent category not found")
    for row in rows:
        if str(row.uuid) == str(parent_uuid) and row.parent_category_id is not None:
            raise HTTPException(status_code=400, detail="Not a root category")


def _forest_from_nodes(nodes: dict[str, CategoryTreeNode]) -> List[CategoryTreeNode]:
    roots: List[CategoryTreeNode] = []
    for node in nodes.values():
        if node.parent_category_id:
            parent = nodes.get(node.parent_category_id)
            if parent:
                parent.children.append(node)
            else:
                roots.append(node)
        else:
            roots.append(node)
    return _sort_tree(roots)


def _scoped_parent(nodes: dict[str, CategoryTreeNode], parent_uuid: UUID) -> List[CategoryTreeNode]:
    parent_node = nodes.get(str(parent_uuid))
    if not parent_node:
        raise HTTPException(status_code=404, detail="Parent category not found")
    parent_node.children = [
        node for node in nodes.values() if node.parent_category_id == parent_node.uuid
    ]
    parent_node.children.sort(key=lambda x: x.name.lower())
    return [parent_node]


def build_category_tree(rows: List[Any], parent_uuid: Optional[UUID] = None) -> List[CategoryTreeNode]:
    if parent_uuid is not None:
        _validate_parent_scope(rows, parent_uuid)

    if not rows:
        return []

    nodes = {str(row.uuid): _row_to_node(row) for row in rows}

    if parent_uuid is not None:
        return _scoped_parent(nodes, parent_uuid)

    return _forest_from_nodes(nodes)
