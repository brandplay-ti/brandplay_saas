import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BackendErrorLog = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  organization_id: string | null;
  table_name: string;
  action: string;
  client_file: string | null;
  client_line: number | null;
  attempted_row_keys: string[] | null;
  error_code: string | null;
  error_message: string | null;
  error_details: string | null;
  error_hint: string | null;
  matching_policies: Array<{ policyname?: string; cmd?: string; qual?: string; with_check?: string }> | null;
};

type BackendErrorLogQuery = {
  select: (columns: string) => BackendErrorLogQuery;
  in: (column: string, values: string[]) => BackendErrorLogQuery;
  order: (column: string, options: { ascending: boolean }) => BackendErrorLogQuery;
  limit: (count: number) => BackendErrorLogQuery;
  eq: (column: string, value: string) => BackendErrorLogQuery;
  ilike: (column: string, value: string) => BackendErrorLogQuery;
  then: PromiseLike<{ data: BackendErrorLog[] | null; error: { message: string } | null }>["then"];
};

const backendLogsClient = supabase as unknown as {
  from: (table: "backend_error_logs") => BackendErrorLogQuery;
};

const TABLE_LABELS: Record<string, string> = {
  organizations: "Organizações",
  organization_members: "Membros da organização",
  opportunities: "Negociações",
};

const ACTIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const TABLES = ["organizations", "organization_members", "opportunities"];

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível carregar os logs.";

export default function FailureLogs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<BackendErrorLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [userFilter, setUserFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const loadLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = backendLogsClient
        .from("backend_error_logs")
        .select("id, created_at, user_id, user_email, organization_id, table_name, action, client_file, client_line, attempted_row_keys, error_code, error_message, error_details, error_hint, matching_policies")
        .in("table_name", TABLES)
        .order("created_at", { ascending: false })
        .limit(100);

      if (tableFilter !== "all") query = query.eq("table_name", tableFilter);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      const userNeedle = userFilter.trim();
      if (userNeedle) {
        query = isUuid(userNeedle) ? query.eq("user_id", userNeedle) : query.ilike("user_email", `%${userNeedle}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs((data ?? []) as BackendErrorLog[]);
    } catch (error) {
      toast({ title: "Erro ao carregar logs", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [actionFilter, tableFilter, toast, user, userFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const needle = userFilter.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) => (log.user_email ?? log.user_id).toLowerCase().includes(needle));
  }, [logs, userFilter]);

  const summary = useMemo(() => {
    const rls = filteredLogs.filter((log) => log.error_message?.toLowerCase().includes("row-level security")).length;
    return { total: filteredLogs.length, rls };
  }, [filteredLogs]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logs de falhas</h1>
          <p className="text-muted-foreground mt-1">Falhas recentes em organizações e negociações.</p>
        </div>
        <Button onClick={loadLogs} disabled={loading} className="gap-2 self-start md:self-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Registros filtrados</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Falhas RLS</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-destructive">{summary.rls}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Última atualização</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-medium">{new Date().toLocaleTimeString("pt-BR")}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="user-filter">Usuário</Label>
            <Input id="user-filter" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLogs()} placeholder="email ou id" />
          </div>
          <div className="space-y-2">
            <Label>Tabela</Label>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {TABLES.map((table) => <SelectItem key={table} value={table}>{TABLE_LABELS[table]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ação</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ACTIONS.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Policies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell className="max-w-56 truncate text-sm">{log.user_email ?? log.user_id}</TableCell>
                  <TableCell><Badge variant="secondary">{TABLE_LABELS[log.table_name] ?? log.table_name}</Badge></TableCell>
                  <TableCell><Badge>{log.action}</Badge></TableCell>
                  <TableCell className="max-w-60 truncate text-xs text-muted-foreground">{log.client_file}{log.client_line ? `:${log.client_line}` : ""}</TableCell>
                  <TableCell className="min-w-80 max-w-xl">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{log.error_message ?? "Falha sem mensagem"}</p>
                        {log.error_code && <p className="text-xs text-muted-foreground">Código: {log.error_code}</p>}
                        {log.error_details && <p className="text-xs text-muted-foreground">{log.error_details}</p>}
                        {log.error_hint && <p className="text-xs text-muted-foreground">Hint: {log.error_hint}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <div className="flex flex-wrap gap-1">
                      {(log.matching_policies ?? []).slice(0, 3).map((policy, index) => (
                        <Badge key={`${log.id}-${index}`} variant="outline">{policy.policyname ?? policy.cmd ?? "policy"}</Badge>
                      ))}
                      {(log.matching_policies?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">Nenhuma policy retornada</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Nenhum log encontrado.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}