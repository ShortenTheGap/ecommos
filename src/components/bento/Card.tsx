import { HTMLAttributes } from "react";

export type CardVariant = "default" | "soft" | "ink" | "accent";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
}

const variantClassMap: Record<CardVariant, string> = {
  default: "bento-card",
  soft:    "bento-card bento-card--soft",
  ink:     "bento-card bento-card--ink",
  accent:  "bento-card bento-card--accent",
};

export function Card({
  variant = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  const base = variantClassMap[variant];
  return (
    <div className={`${base}${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}
