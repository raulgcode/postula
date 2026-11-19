import { type FieldMetadata, getTextareaProps } from "@conform-to/react";
import type * as React from "react";
import { FieldErrors } from "~/components/text-field";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

export interface TextAreaFieldProps
  extends Omit<React.ComponentProps<"textarea">, "name" | "id" | "defaultValue"> {
  field: FieldMetadata<unknown>;
  label: string;
  description?: string;
}

/** `TextField` for long texts: label, textarea and errors wired to a Conform field. */
export function TextAreaField({
  field,
  label,
  description,
  className,
  ...textareaProps
}: TextAreaFieldProps) {
  const descriptionId = description ? `${field.id}-description` : undefined;
  const conformProps = getTextareaProps(field as FieldMetadata<string>, {
    ariaDescribedBy: descriptionId,
  });
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={field.id}>{label}</Label>
      <Textarea {...textareaProps} {...conformProps} key={conformProps.key} />
      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      <FieldErrors id={field.errorId} errors={field.errors} />
    </div>
  );
}
