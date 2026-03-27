import "./star-rating.scss";

interface StarRatingProps {
  rating: number;
  size?: "sm" | "md" | "lg";
}

export default function StarRating({ rating, size = "sm" }: StarRatingProps) {
  return (
    <div className={`sr-stars sr-stars--${size}`} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => {
        const full = rating >= s;
        const half = !full && rating >= s - 0.5;
        return (
          <span
            key={s}
            className={`sr-star${full ? " sr-star--full" : half ? " sr-star--half" : " sr-star--empty"}`}
            aria-hidden="true"
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
