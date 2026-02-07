import { useNavigate } from "react-router-dom";
import type { CategoryWithServicesData } from "../../services/category/category.service";
import { getCategoryEmoji } from "../../utils/category-emoji";
import "./category-card.scss";

type Props = {
  category: CategoryWithServicesData;
  onClick?: () => void;
};

export default function CategoryCard({ category, onClick }: Props) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/categories/${category.uuid}`, {
        state: { category },
      });
    }
  };

  const emoji = getCategoryEmoji(category.name);
  const serviceNames = category.services.map((service) => service.name).join(", ") || "";

  return (
    <div className="category-card">
      <div className="category-card-action" onClick={handleClick}>
        <div className="category-card-content">
          <div className="category-card-emoji" aria-hidden="true">
            {emoji}
          </div>
          <div className="category-card-text">
            <h3 className="category-card-title">{category.name}</h3>
            <p className="category-card-desc">{serviceNames}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
