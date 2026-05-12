import React from "react";
import "./button.scss";

interface ButtonProps {
  text?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  iconOnly?: boolean;
  color?: "blue" | "green" | "red" | "black" | "orange" | "green-small" | "lightBlue" | "transparent" | "purple" | "success";
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  loader?: boolean;
  outline?: boolean;
  size?: "sm" | "md" | "lg";
  is_white_loader?: boolean;
}

export default function Button({
  text,
  icon,
  iconRight,
  iconOnly = false,
  color = "blue",
  onClick,
  className = "",
  style,
  type = "button",
  disabled = false,
  loading = false,
  loader = false,
  outline = false,
  size = "md",
  is_white_loader = false
}: ButtonProps) {
  const variantClass = `button--${outline ? `outline-${color}` : color}`;
  const contentClass = iconOnly ? "button--icon-only" : "";
  const sizeClass = `button--${size}`;

  return (
    <button
      type={type}
      className={`button ${variantClass} ${sizeClass} ${contentClass} ${className} ${loading ? "button--loading" : ""}`}
      onClick={onClick}
      style={style}
      disabled={disabled || loading}
    >
      {loading ? (
        "Loading..."
      ) : (
        <>
          {icon && <span className="button-icon-left">{icon}</span>}
          {!iconOnly && <span>{text}</span>}
          {iconRight && <span className="button-icon-right">{iconRight}</span>}
        </>
      )}
    </button>
  );
}
