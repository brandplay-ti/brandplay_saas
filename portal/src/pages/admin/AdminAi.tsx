import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, KeyRound, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PasswordInput } from "@/components/PasswordInput";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdminAiAction, useAdminIaClientes, useAdminIaPadrao } from "@/hooks/useAdminAi";
import { IA_FORNECEDOR_LABEL, IA_MODO_LABEL, type IaFornecedor } from "@/lib/adminAi";

const FORNECEDORES: IaFornecedor[] = ["openai", "gemini", "anthropic"];

const AdminAi = () => {
  const padrao = useAdminIaPadrao();
  const clientes = useAdminIaClientes();
  const acao = useAdminAiAction();

  const [filtroModo, setFiltroModo] = useState<string>("all");
  const [filtroFornecedor, setFiltroFornecedor] = useState<string>("all");
  const [acima80, setAcima80] = useState(false);

  const [provider, setProvider] = useState<IaFornecedor>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [modelRapido, setModelRapido] = useState("");
  const [modelPadrao, setModelPadrao] = useState("");
  const [modelVisao, setModelVisao] = useState("");
  const [comentario, setComentario] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);

  const lista = useMemo(() => {
    let rows = clientes.data ?? [];
    if (filtroModo !== "all") rows = rows.filter((c) => c.mode === filtroModo);
    if (filtroFornecedor !== "all") rows = rows.filter((c) => c.provider === filtroFornecedor);
    if (acima80) rows = rows.filter((c) => (c.pct_used ?? 0) >= 80);
    return rows;
  }, [clientes.data, filtroModo, filtroFornecedor, acima80]);

  const testar = () =>
    acao.mutate(
      {
        action: "testar",
        provider,
        api_key: apiKey,
        model_rapido: modelRapido || undefined,
        model_padrao: modelPadrao || undefined,
        model_visao: modelVisao || undefined,
      },
      {
        onSuccess: () => toast.success("Conexão com o fornecedor validada."),
        onError: (e) => toast.error(e.message),
      },
    );

  const salvarPadrao = () =>
    acao.mutate(
      {
        action: "definir_padrao",
        provider,
        api_key: apiKey,
        model_rapido: modelRapido || undefined,
        model_padrao: modelPadrao || undefined,
        model_visao: modelVisao || undefined,
        comment: comentario,
      },
      {
        onSuccess: () => {
          toast.success("Chave padrão da plataforma atualizada.");
          setDialogAberto(false);
          setApiKey("");
          setComentario("");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  if (padrao.isLoading || clientes.isLoading) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  if (padrao.isError || clientes.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar a gestão de IA</AlertTitle>
        <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
      </Alert>
    );
  }

  const p = padrao.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="IA dos clientes"
        description="Chave padrão da plataforma, credenciais exclusivas por organização, orçamento e preços de modelos. A chave nunca é exibida por completo — só o final (••••1234)."
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/ia/precos">Preços de modelos</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" /> Chave padrão da plataforma
          </CardTitle>
          <CardDescription>
            Usada por todas as organizações sem chave exclusiva. Teste a conexão antes de salvar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {p ? (
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Fornecedor</dt>
                <dd className="font-medium">{IA_FORNECEDOR_LABEL[p.provider] ?? p.provider}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Chave</dt>
                <dd className="font-mono">••••{p.key_hint}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Modelos</dt>
                <dd>
                  rápido {p.model_rapido} · padrão {p.model_padrao}
                  {p.model_visao ? ` · visão ${p.model_visao}` : " · sem visão (usa exceção Q4)"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Último teste</dt>
                <dd>{p.last_validated_at ? new Date(p.last_validated_at).toLocaleString("pt-BR") : "—"}</dd>
              </div>
              {p.last_error && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Último erro</dt>
                  <dd className="text-destructive">{p.last_error}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma chave no banco. Enquanto isso, vale a semente do ambiente (`AI_DEFAULT_*`) ou cadastre abaixo.
            </p>
          )}

          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button>
                <Sparkles className="h-4 w-4" /> {p ? "Trocar chave padrão" : "Cadastrar chave padrão"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Chave padrão da plataforma</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Fornecedor</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as IaFornecedor)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORNECEDORES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {IA_FORNECEDOR_LABEL[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="admin-ia-chave-padrao">Chave de API</Label>
                  <PasswordInput
                    id="admin-ia-chave-padrao"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <Label>Modelo rápido</Label>
                    <Input value={modelRapido} onChange={(e) => setModelRapido(e.target.value)} placeholder="opcional" />
                  </div>
                  <div>
                    <Label>Modelo padrão</Label>
                    <Input value={modelPadrao} onChange={(e) => setModelPadrao(e.target.value)} placeholder="opcional" />
                  </div>
                  <div>
                    <Label>Modelo visão</Label>
                    <Input value={modelVisao} onChange={(e) => setModelVisao(e.target.value)} placeholder="opcional" />
                  </div>
                </div>
                <div>
                  <Label>Comentário (auditoria)</Label>
                  <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" disabled={acao.isPending || !apiKey} onClick={testar}>
                  {acao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Testar conexão
                </Button>
                <Button disabled={acao.isPending || !apiKey || comentario.trim().length < 3} onClick={salvarPadrao}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organizações</CardTitle>
          <CardDescription>Modo de credencial, consumo do mês e orçamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filtroModo} onValueChange={setFiltroModo}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os modos</SelectItem>
                <SelectItem value="exclusiva">Exclusiva</SelectItem>
                <SelectItem value="padrao">Padrão</SelectItem>
                <SelectItem value="semente">Semente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroFornecedor} onValueChange={setFiltroFornecedor}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {FORNECEDORES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {IA_FORNECEDOR_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={acima80 ? "default" : "outline"} size="sm" onClick={() => setAcima80((v) => !v)}>
              Acima de 80% do orçamento
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organização</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Consumo (R$)</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead>%</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma organização neste filtro.
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((c) => (
                  <TableRow key={c.organization_id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{IA_MODO_LABEL[c.mode] ?? c.mode}</Badge>
                    </TableCell>
                    <TableCell>{c.provider ? IA_FORNECEDOR_LABEL[c.provider] : "—"}</TableCell>
                    <TableCell>{c.spent_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                    <TableCell>
                      {c.budget_cents != null
                        ? (c.budget_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "Sem teto"}
                    </TableCell>
                    <TableCell>
                      {c.pct_used != null ? (
                        <span className={c.pct_used >= 80 ? "text-warning-strong font-medium" : ""}>
                          {Math.round(c.pct_used)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admin/ia/clientes/${c.organization_id}`}>Detalhe</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAi;
