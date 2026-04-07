import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent, type CreateEventBody } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  year: z.coerce.number().int().min(1900).max(2100),
});

type FormValues = z.infer<typeof schema>;

type EventFormProps = {
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function EventForm({ onSuccess, onCancel }: EventFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", year: new Date().getFullYear() },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createEvent(values as CreateEventBody);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create event";
      setError("root", { message: msg });
      toast.error(msg);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Summer Swing" />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="year">Year</Label>
        <Input
          id="year"
          type="number"
          {...register("year")}
          placeholder="2025"
        />
        {errors.year && (
          <p className="text-sm text-destructive">{errors.year.message}</p>
        )}
      </div>
      {errors.root && (
        <p className="text-sm text-destructive">{errors.root.message}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create event"}
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
