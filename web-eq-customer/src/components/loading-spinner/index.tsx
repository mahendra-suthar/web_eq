import "./loading-spinner.scss";

export interface LoadingSpinnerProps {
  /** Accessible label for the spinner */
  "aria-label"?: string;
  /** Optional size: sm (24px), md (36px), lg (48px) */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function LoadingSpinner({
  "aria-label": ariaLabel = "Loading",
  size = "md",
  className = "",
}: LoadingSpinnerProps) {
  return (
    <div
      className={`loading-spinner loading-spinner--${size} ${className}`.trim()}
      role="status"
      aria-label={ariaLabel}
      aria-hidden={false}
    >
      <span className="loading-spinner__circle" aria-hidden />
    </div>
  );
}
