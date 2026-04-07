import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompetition, getCompetitors, createCompetitor, updateCompetitor, deleteCompetitor, importCompetitors, downloadCompetitorsImportTemplate } from "@/lib/api";
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
import { Trash2, Users } from "lucide-react";
import { CompetitorForm } from "@/components/CompetitorForm";
import {
  EmptyState,
  PageBackLink,
  PageHeader,
  PageLoadSkeleton,
  PageShell,
  MissingIdState,
} from "@/components/page-frame";

function formatCompetitorRole(role: string): string {
  if (!role) return "—";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export default function CompetitorsPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [competitorToDelete, setCompetitorToDelete] = useState<{ id: string; name: string } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: competition, isLoading: compLoading } = useQuery({
    queryKey: ["competitions", competitionId],
    queryFn: () => getCompetition(competitionId!),
    enabled: !!competitionId,
  });

  const { data, error } = useQuery({
    queryKey: ["competitors", competitionId],
    queryFn: () => getCompetitors(competitionId!),
    enabled: !!competitionId,
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createCompetitor>[1]) => createCompetitor(competitionId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors", competitionId] });
      setShowForm(false);
      toast.success("Competitor added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateCompetitor>[2] }) =>
      updateCompetitor(competitionId!, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors", competitionId] });
      setEditingId(null);
      toast.success("Competitor updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompetitor(competitionId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors", competitionId] });
      setCompetitorToDelete(null);
      toast.success("Competitor removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove competitor"),
  });

  const handleDeleteClick = (e: React.MouseEvent, c: { id: string; name: string }) => {
    e.stopPropagation();
    setCompetitorToDelete(c);
  };

  const handleConfirmDelete = () => {
    if (!competitorToDelete) return;
    deleteMutation.mutate(competitorToDelete.id);
  };

  useEffect(() => {
    if (!competitorToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleteMutation.isPending) {
        setCompetitorToDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [competitorToDelete, deleteMutation.isPending]);

  const handleImport = async () => {
    if (!importFile || !competitionId) return;
    try {
      const result = await importCompetitors(competitionId, importFile);
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["competitors", competitionId] });
      if (result.errors.length > 0) {
        toast.warning(`Imported ${result.created}; ${result.errors.length} row(s) had errors`);
      } else {
        toast.success(`Imported ${result.created} competitor(s)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setImportResult({ created: 0, errors: [{ row: 0, error: msg }] });
      toast.error(msg);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!competitionId) return;
    setTemplateLoading(true);
    try {
      const blob = await downloadCompetitorsImportTemplate(competitionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "competitors-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download template");
    } finally {
      setTemplateLoading(false);
    }
  };

  if (!competitionId) {
    return <MissingIdState message="Missing competition ID in the URL." backTo="/events" />;
  }

  if (compLoading || !competition) {
    return <PageLoadSkeleton variant="table" />;
  }

  const competitors = data?.competitors ?? [];

  return (
    <PageShell>
      <PageBackLink to={`/competitions/${competitionId}`}>Competition</PageBackLink>
      <PageHeader
        title="Competitors"
        description={competition.name}
        actions={
          !showForm && !editingId ? (
            <Button onClick={() => setShowForm(true)}>Add competitor</Button>
          ) : undefined
        }
      />

      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New competitor</CardTitle>
            <CardDescription>Add a competitor. Numbers are {competition.number_assignment_mode === "auto" ? "assigned automatically" : "optional"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompetitorForm
              competitionId={competitionId}
              divisionType={competition.division_type}
              onSuccess={() => createMutation.reset()}
              onCancel={() => setShowForm(false)}
              onSubmit={(body) => createMutation.mutate(body)}
              isSubmitting={createMutation.isPending}
              error={createMutation.error instanceof Error ? createMutation.error.message : undefined}
            />
          </CardContent>
        </Card>
      )}

      {editingId && (() => {
        const editingCompetitor = competitors.find((c) => c.id === editingId);
        if (!editingCompetitor) return null;
        return (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Edit competitor</CardTitle>
              <CardDescription>Update competitor details.</CardDescription>
            </CardHeader>
            <CardContent>
              <CompetitorForm
                competitionId={competitionId}
                initialValues={{
                  name: editingCompetitor.name,
                  role: competition.division_type === "random_partner" && editingCompetitor.role === "solo" ? "lead" : editingCompetitor.role,
                  email: editingCompetitor.email,
                  number: editingCompetitor.number,
                  partner_name: editingCompetitor.partner_name,
                }}
                competitorId={editingId}
                divisionType={competition.division_type}
                onCancel={() => setEditingId(null)}
                onSubmit={(body) => updateMutation.mutate({ id: editingId, body })}
                isSubmitting={updateMutation.isPending}
                error={updateMutation.error instanceof Error ? updateMutation.error.message : undefined}
              />
            </CardContent>
          </Card>
        );
      })()}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Import from Excel</CardTitle>
          <CardDescription>
            {competition.division_type === "fixed_partner"
              ? "Columns: Name, Role (lead/follow/solo, case-insensitive), Email, Number, Partner Name. First row = header."
              : competition.division_type === "random_partner"
                ? "Columns: Name, Role (lead/follow, case-insensitive), Email, Number. First row = header."
                : competition.division_type === "solo"
                  ? "Columns: Name, Email, Number. First row = header."
                  : "Columns: Name, Role (lead/follow/solo, case-insensitive), Email, Number. First row = header."}
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
            <Button onClick={handleImport} disabled={!importFile}>Import</Button>
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

      {error && (
        <p className="text-destructive mb-4">{error instanceof Error ? error.message : "Failed to load competitors"}</p>
      )}

      {competitors.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No competitors yet"
              description="Add dancers manually or import a spreadsheet. Numbers follow your competition’s assignment mode."
              action={<Button onClick={() => setShowForm(true)}>Add competitor</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Role</TableHead>
                {competition.division_type === "fixed_partner" && <TableHead>Partner</TableHead>}
                <TableHead className="w-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setEditingId(c.id)}
                >
                  <TableCell className="text-muted-foreground">{c.number != null ? c.number : "—"}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{formatCompetitorRole(c.role)}</TableCell>
                  {competition.division_type === "fixed_partner" && (
                    <TableCell className="text-muted-foreground">{c.partner_name ?? "—"}</TableCell>
                  )}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => handleDeleteClick(e, c)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Remove ${c.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {competitorToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-competitor-title"
          aria-describedby="delete-competitor-desc"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close dialog"
            disabled={deleteMutation.isPending}
            onClick={() => setCompetitorToDelete(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-lg">
            <h2 id="delete-competitor-title" className="font-display text-lg font-semibold">
              Remove competitor
            </h2>
            <p id="delete-competitor-desc" className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to remove &quot;{competitorToDelete.name}&quot;? This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCompetitorToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
