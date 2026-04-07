import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { CreateCompetitorBody } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["lead", "follow", "solo"]),
  email: z.string().optional(),
  number: z.coerce.number().int().min(0).optional().nullable(),
  partner_name: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const roleOptionsAll = [
  { value: "lead", label: "Lead" },
  { value: "follow", label: "Follow" },
  { value: "solo", label: "Solo" },
];

const roleOptionsLeadFollow = [
  { value: "lead", label: "Lead" },
  { value: "follow", label: "Follow" },
];

type CompetitorFormProps = {
  competitionId: string;
  initialValues?: CreateCompetitorBody;
  competitorId?: string;
  divisionType?: "random_partner" | "fixed_partner" | "solo";
  onSuccess?: () => void;
  onCancel?: () => void;
  onSubmit: (body: CreateCompetitorBody) => void;
  isSubmitting: boolean;
  error?: string;
};

export function CompetitorForm({
  initialValues,
  competitorId,
  divisionType,
  onCancel,
  onSubmit,
  isSubmitting,
  error: externalError,
}: CompetitorFormProps) {
  const isEdit = !!competitorId;
  const roleOptions = divisionType === "random_partner" ? roleOptionsLeadFollow : roleOptionsAll;
  const defaultRole = divisionType === "random_partner" ? "lead" : "solo";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues ?? {
      name: "",
      role: defaultRole as FormValues["role"],
      email: "",
      number: undefined,
      partner_name: "",
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        name: initialValues.name,
        role: initialValues.role,
        email: initialValues.email ?? "",
        number: initialValues.number ?? undefined,
        partner_name: initialValues.partner_name ?? "",
      });
    }
  }, [initialValues, reset, competitorId]);

  function onFormSubmit(values: FormValues) {
    const body: CreateCompetitorBody = {
      name: values.name,
      role: values.role,
    };
    if (values.email) body.email = values.email;
    if (values.number != null && values.number > 0) body.number = values.number;
    if (divisionType === "fixed_partner" && values.partner_name) {
      body.partner_name = values.partner_name;
    }
    onSubmit(body);
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select id="role" options={roleOptions} {...register("role")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input id="email" type="email" {...register("email")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="number">Number (optional)</Label>
        <Input id="number" type="number" min={0} {...register("number")} />
      </div>
      {divisionType === "fixed_partner" && (
        <div className="space-y-2">
          <Label htmlFor="partner_name">Partner name (optional)</Label>
          <Input id="partner_name" {...register("partner_name")} />
        </div>
      )}
      {externalError && <p className="text-sm text-destructive">{externalError}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isEdit ? "Updating…" : "Adding…") : isEdit ? "Update" : "Add"}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
