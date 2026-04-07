import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createCompetition, type CreateCompetitionBody } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  division_type: z.enum(["random_partner", "fixed_partner", "solo"]),
  number_assignment_mode: z.enum(["manual", "auto"]).default("auto"),
});

type FormValues = z.infer<typeof schema>;

const divisionOptions = [
  { value: "random_partner", label: "Random partner (Mix & Match)" },
  { value: "fixed_partner", label: "Fixed partner (Strictly)" },
  { value: "solo", label: "Solo Jazz" },
];

const numberModeOptions = [
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Auto" },
];

type CompetitionFormProps = {
  eventId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function CompetitionForm({ eventId, onSuccess, onCancel }: CompetitionFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      division_type: "random_partner",
      number_assignment_mode: "auto",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createCompetition(eventId, values as CreateCompetitionBody);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create competition";
      setError("root", { message: msg });
      toast.error(msg);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Lindy Hop Mix & Match" />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="division_type">Division</Label>
        <Select
          id="division_type"
          options={divisionOptions}
          {...register("division_type")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="number_assignment_mode">Number assignment</Label>
        <Select
          id="number_assignment_mode"
          options={numberModeOptions}
          {...register("number_assignment_mode")}
        />
      </div>
      {errors.root && (
        <p className="text-sm text-destructive">{errors.root.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create competition"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
