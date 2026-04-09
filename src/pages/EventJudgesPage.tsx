import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import {
  getEvent,
  getEventJudges,
  createEventJudge,
  updateEventJudge,
  deleteEventJudge,
  importEventJudges,
  downloadJudgesImportTemplate,
} from "@/lib/api";
import type { Judge } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorStateCard,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

export default function EventJudgesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const queryClient = useQueryClient();
  const addJudgeFormRef = useRef<HTMLFormElement | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(
    null
  );
  const [templateLoading, setTemplateLoading] = useState(false);

  const {
    data: event,
    isLoading: eventLoading,
    error: eventError,
  } = useQuery({
    queryKey: ["events", eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  const { data, error } = useQuery({
    queryKey: ["event-judges", eventId],
    queryFn: () => getEventJudges(eventId!),
    enabled: !!eventId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; email?: string }) => createEventJudge(eventId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-judges", eventId] });
      setNewName("");
      setNewEmail("");
      toast.success("Judge added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { judgeId: string; body: { name?: string; email?: string } }) =>
      updateEventJudge(eventId!, payload.judgeId, payload.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-judges", eventId] });
      queryClient.invalidateQueries({ queryKey: ["judges"] });
      setEditingId(null);
      toast.success("Judge updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (judgeId: string) => deleteEventJudge(eventId!, judgeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-judges", eventId] });
      queryClient.invalidateQueries({ queryKey: ["judges"] });
      setEditingId(null);
      toast.success("Judge removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), email: newEmail.trim() || undefined });
  };

  const openEdit = (j: Judge) => {
    setEditingId(j.id);
    setEditName(j.name);
    setEditEmail(j.email ?? "");
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      judgeId: editingId,
      body: { name: editName.trim() || undefined, email: editEmail.trim() || undefined },
    });
  };

  const handleImport = async () => {
    if (!importFile || !eventId) return;
    try {
      const result = await importEventJudges(eventId, importFile);
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["event-judges", eventId] });
      queryClient.invalidateQueries({ queryKey: ["judges"] });
      if (result.errors.length > 0) {
        toast.warning(`Imported ${result.created}; ${result.errors.length} row(s) had errors`);
      } else {
        toast.success(`Imported ${result.created} judge(s)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setImportResult({ created: 0, errors: [{ row: 0, error: msg }] });
      toast.error(msg);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!eventId) return;
    setTemplateLoading(true);
    try {
      const blob = await downloadJudgesImportTemplate(eventId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "judges-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download template");
    } finally {
      setTemplateLoading(false);
    }
  };

  if (!eventId) {
    return <MissingIdState message="Missing event ID in the URL." />;
  }

  if (eventLoading) {
    return <PageLoadSkeleton variant="table" />;
  }

  if (eventError || !event) {
    return (
      <ErrorStateCard
        title="Could not load event"
        message={eventError instanceof Error ? eventError.message : "Event not found"}
      />
    );
  }

  const judges = data?.judges ?? [];

  return (
    <PageShell>
      <PageBackLink to={`/events/${eventId}`}>Event</PageBackLink>
      <PageHeader
        title="Event judges"
        description={
          <>
            Shared pool for <span className="font-medium text-foreground">{event.name}</span>. Assign judges to each
            competition from that competition&apos;s Judges page.{" "}
            <Link to={`/events/${eventId}`} className="text-primary underline-offset-4 hover:underline">
              Back to event overview
            </Link>
          </>
        }
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add judge</CardTitle>
          <CardDescription>Add a judge to this event. Then assign them to competitions from the competition Judges page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            ref={addJudgeFormRef}
            className="flex flex-wrap gap-4 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addJudgeFormRef.current?.requestSubmit();
                }}
                placeholder="Judge name"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label>Email (optional)</Label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addJudgeFormRef.current?.requestSubmit();
                }}
                type="email"
                placeholder="email@example.com"
              />
            </div>
            <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add judge"}
            </Button>
          </form>
        </CardContent>
        {createMutation.error && (
          <CardContent className="pt-0 text-sm text-destructive">
            {createMutation.error instanceof Error ? createMutation.error.message : "Failed"}
          </CardContent>
        )}
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Import from Excel</CardTitle>
          <CardDescription>
            Columns: Name, Email (optional). First row = header.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-4 items-end flex-wrap">
            <Button variant="outline" onClick={handleDownloadTemplate} disabled={templateLoading}>
              {templateLoading ? "Downloading…" : "Download template"}
            </Button>
            <div className="flex-1 min-w-[200px]">
              <Label>File (xlsx)</Label>
              <Input
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
              />
            </div>
            <Button onClick={handleImport} disabled={!importFile}>
              Import
            </Button>
          </div>
        </CardContent>
        {importResult && (
          <CardContent className="pt-0 text-sm">
            Created: {importResult.created}.{" "}
            {importResult.errors.length > 0 &&
              `Errors: ${importResult.errors.map((e) => `Row ${e.row}: ${e.error}`).join("; ")}`}
          </CardContent>
        )}
      </Card>

      {editingId && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Edit judge</CardTitle>
            <CardDescription>Update name and email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Judge name" />
              </div>
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label>Email (optional)</Label>
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" placeholder="email@example.com" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating…" : "Update"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
            {updateMutation.error && (
              <p className="text-sm text-destructive">{updateMutation.error instanceof Error ? updateMutation.error.message : "Failed"}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Event judges</CardTitle>
          <CardDescription>Judges for this event. Click a row to edit; remove to delete.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load"}
            </p>
          )}
          {judges.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="No judges in this pool yet"
              description="Add names above or import from Excel. You will assign them to Prelim and Final on each competition page."
              className="border-0 bg-transparent py-10"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {judges.map((j) => (
                  <TableRow
                    key={j.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(j)}
                  >
                    <TableCell className="font-medium">{j.name}</TableCell>
                    <TableCell className="text-muted-foreground">{j.email ?? "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(j.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
