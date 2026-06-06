import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost:   "btn-ghost",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const base = variantClassMap[variant];
  return (
    <button className={`${base}${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </button>
  );
}
