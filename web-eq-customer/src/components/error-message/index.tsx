import type { ReactNode } from "react";
import "./error-message.scss";

export type ErrorMessageVariant = "error" | "success" | "info";

export interface ErrorMessageProps {
  children: ReactNode;
  variant?: ErrorMessageVariant;
  role?: "alert" | "status";
  className?: string;
}

export default function ErrorMessage({
  children,
  variant = "error",
  role = "alert",
  className = "",
}: ErrorMessageProps) {
  return (
    <div
      className={`error-message-block error-message-block--${variant} ${className}`.trim()}
      role={role}
    >
      {children}
    </div>
  );
}
