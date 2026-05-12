import "./button.scss";

type ButtonProps = {
  text: string;
  color?: "blue" | "green" | "red" | "black" | "orange" | "transparent" | "outline-blue";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
};

export default function Button({
  text,
  color = "blue",
  size = "md",
  onClick,
  disabled = false,
  loading = false,
  type = "button",
  className = "",
}: ButtonProps) {
  const buttonClasses = [
    "button",
    `button--${color}`,
    `button--${size}`,
    loading ? "button--loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {text}
    </button>
  );
}
