import { clsx } from "@shared/utils";
import { type VariantProps, cva } from "class-variance-authority";

const typographyVariants = cva("font-inter text-base-text tracking-normal", {
  variants: {
    variant: {
      overline:
        "font-firaSans text-brand-primary text-sm font-semibold leading-none tracking-wider uppercase",
      h1: "text-5xl leading-14 font-bold tracking-tight max-sm:text-3xl",
      h2: "text-2xl leading-8 font-bold tracking-tight",
      h3: "text-xl leading-6 font-semibold",
      label: "text-base leading-6 font-semibold",
      bodyMedium: "text-base leading-6 font-medium",
      body: "text-base leading-6 font-normal",
      bodySm: "text-sm leading-5 font-normal",
      caption: "text-xs leading-4 font-normal"
    }
  },
  defaultVariants: {
    variant: "body"
  }
});

type TypographyTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "span";

interface Props extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof typographyVariants> {
  tag?: TypographyTag;
  colorInherit?: boolean;
}

const Typography = ({ tag = "p", colorInherit, variant, className, ...props }: Props) => {
  const Tag = tag;

  return (
    <Tag
      className={clsx(typographyVariants({ variant, className }), colorInherit && "text-inherit")}
      {...props}
    />
  );
};

export { Typography, typographyVariants };
