"""
Reusable pagination utility for list APIs.
Uses count from subquery without order_by for correct total; applies order_by only for data fetch.
"""
from sqlalchemy import func
from sqlalchemy.orm import Query
from typing import Any, Tuple, List, Optional


def paginate_query(
    query: Query,
    page: int,
    limit: int,
    order_by: Optional[Any] = None,
) -> Tuple[List[Any], int]:
    """
    Apply DB-level pagination to a query.

    :param query: Base query (filters, group_by, etc.). Should NOT have order_by/offset/limit.
    :param page: 1-based page number.
    :param limit: Page size.
    :param order_by: Optional order_by clause(s). Applied only for the data query, not for count.
    :return: (items, total)
    """
    # Count from subquery (query should not have order_by/offset/limit when passed in)
    total = (
        query.session.query(func.count())
        .select_from(query.subquery())
        .scalar()
        or 0
    )
    if order_by is not None:
        query = query.order_by(order_by)
    offset = (page - 1) * limit
    items = query.offset(offset).limit(limit).all()
    return items, total
