import {
  type FieldMetadata,
  getFormProps,
  getInputProps,
  type SubmissionResult,
  useForm,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  remoteOptions,
  salaryCurrencies,
  searchFormSchema,
  searchModes,
  updateSearchFormSchema,
} from "@postula/contracts";
import type * as React from "react";
import { Form, Link } from "react-router";
import { TextAreaField } from "~/components/text-area-field";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useT } from "~/lib/i18n";
import type { searchFormDefaults } from "~/lib/searches";

const remoteLabels = {
  remote: "searches.remoteRemote",
  hybrid: "searches.remoteHybrid",
  any: "searches.remoteAny",
} as const;

const modeLabels = { manual: "searches.modeManual", semi: "searches.modeSemi" } as const;

/**
 * Everything about a search the person edits, in four short cards. The same schema validates in
 * the browser and in the route's action; an unchecked "required" box means "only a preference".
 */
export function SearchForm({
  id,
  mode,
  defaultValue,
  lastResult,
  saving,
  submitLabel,
  cancelTo,
  children,
}: {
  id: string;
  mode: "create" | "update";
  defaultValue: ReturnType<typeof searchFormDefaults> & { id?: string };
  lastResult: SubmissionResult<string[]> | undefined;
  saving: boolean;
  submitLabel: string;
  cancelTo: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  const schema = mode === "create" ? searchFormSchema : updateSearchFormSchema;
  const [form, fields] = useForm({
    id,
    lastResult,
    defaultValue,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema }),
  });
  const criteria = fields.criteria.getFieldset();
  const titles = criteria.titles.getFieldset();
  const keywords = criteria.keywords.getFieldset();
  const remote = criteria.remote.getFieldset();
  const regions = criteria.regions.getFieldset();
  const salary = criteria.salary.getFieldset();

  return (
    <Form method="post" className="grid gap-6" {...getFormProps(form)}>
      {children}
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <TextField
            field={fields.name}
            label={t("searches.nameLabel")}
            description={t("searches.nameHint")}
          />
          <CheckboxField field={fields.enabled} label={t("searches.enabledLabel")} />
        </CardContent>
      </Card>

      <Section title={t("searches.sectionWhat")}>
        <TextAreaField
          field={titles.values}
          label={t("searches.titlesLabel")}
          description={t("searches.titlesHint")}
        />
        <RequiredField field={titles.required} />
        <TextAreaField
          field={keywords.include}
          label={t("searches.keywordsIncludeLabel")}
          description={t("searches.keywordsIncludeHint")}
        />
        <TextAreaField
          field={keywords.exclude}
          label={t("searches.keywordsExcludeLabel")}
          description={t("searches.keywordsExcludeHint")}
        />
        <RequiredField field={keywords.required} />
        <TextAreaField
          field={criteria.excludedCompanies}
          label={t("searches.excludedCompaniesLabel")}
          description={t("searches.excludedCompaniesHint")}
        />
      </Section>

      <Section title={t("searches.sectionWhere")}>
        <Choice
          field={remote.value}
          legend={t("searches.remoteLabel")}
          options={remoteOptions.map((value) => ({ value, label: t(remoteLabels[value]) }))}
        />
        <RequiredField field={remote.required} />
        <TextAreaField
          field={regions.values}
          label={t("searches.regionsLabel")}
          description={t("searches.regionsHint")}
        />
        <RequiredField field={regions.required} />
      </Section>

      <Section title={t("searches.sectionPay")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            field={salary.ideal}
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            label={t("searches.salaryIdealLabel")}
            description={t("searches.salaryIdealHint")}
          />
          <TextField
            field={salary.minimum}
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            label={t("searches.salaryMinimumLabel")}
            description={t("searches.salaryMinimumHint")}
          />
        </div>
        <Choice
          field={salary.currency}
          legend={t("searches.currencyLabel")}
          options={salaryCurrencies.map((value) => ({ value, label: value }))}
        />
        <RequiredField field={salary.required} />
      </Section>

      <Section title={t("searches.sectionWhen")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField field={fields.runAt} type="time" label={t("searches.runAtLabel")} />
          <TextField
            field={fields.timeZone}
            label={t("searches.timeZoneLabel")}
            description={t("searches.timeZoneHint")}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <Choice
          field={fields.mode}
          legend={t("searches.modeLabel")}
          options={searchModes.map((value) => ({ value, label: t(modeLabels[value]) }))}
          stacked
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            field={fields.minScore}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            label={t("searches.minScoreLabel")}
            description={t("searches.minScoreHint")}
          />
          <TextField
            field={fields.dailyLimit}
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            label={t("searches.dailyLimitLabel")}
          />
        </div>
      </Section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link to={cancelTo}>{t("searches.cancel")}</Link>
        </Button>
        <Button type="submit" size="lg" name="intent" value="settings" disabled={saving}>
          {saving ? t("searches.saving") : submitLabel}
        </Button>
      </div>
    </Form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function CheckboxField({
  field,
  label,
  description,
}: {
  field: FieldMetadata<unknown>;
  label: string;
  description?: string;
}) {
  const descriptionId = description ? `${field.id}-description` : undefined;
  const props = getInputProps(field as FieldMetadata<boolean>, {
    type: "checkbox",
    ariaDescribedBy: descriptionId,
  });
  return (
    <div className="grid gap-1">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input {...props} key={props.key} className="size-5 shrink-0 accent-primary" />
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="pl-8 text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      <FieldErrors id={field.errorId} errors={field.errors} />
    </div>
  );
}

/** "Required": off by default, so the criterion above only adds or takes points. */
function RequiredField({ field }: { field: FieldMetadata<unknown> }) {
  const t = useT();
  return (
    <CheckboxField
      field={field}
      label={t("searches.requiredLabel")}
      description={t("searches.requiredHint")}
    />
  );
}

function Choice({
  field,
  legend,
  options,
  stacked = false,
}: {
  field: FieldMetadata<unknown>;
  legend: string;
  options: { value: string; label: string }[];
  stacked?: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={stacked ? "grid gap-2" : "flex flex-wrap gap-2"}>
        {options.map((option) => {
          const props = getInputProps(field as FieldMetadata<string>, {
            type: "radio",
            value: option.value,
          });
          return (
            <label
              key={option.value}
              className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary"
            >
              <input {...props} key={option.value} className="size-4 shrink-0 accent-primary" />
              {option.label}
            </label>
          );
        })}
      </div>
      <FieldErrors id={field.errorId} errors={field.errors} />
    </fieldset>
  );
}
