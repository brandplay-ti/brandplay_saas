import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/PasswordInput";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { useAdminAiAction, useAdminIaClienteDetalhe } from "@/hooks/useAdminAi";
import { IA_FORNECEDOR_LABEL, type IaFornecedor } from "@/lib/adminAi";

const FORNECEDORES: IaFornecedor[] = ["openai", "gemini", "anthropic"];

const AdminAiClientDetail = () => {
  const { id = "" } = useParams<{ id: string }>();
  const detalhe = useAdminIaClienteDetalhe(id);
  const acao = useAdminAiAction();

  const [provider, setProvider] = useState<IaFornecedor>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [comentarioChave, setComentarioChave] = useState("");
  const [comentarioRevogar, setComentarioRevogar] = useState("");

  const [aiEnabled, setAiEnabled] = useState(true);
  const [budgetReais, setBudgetReais] = useState("");
  const [alertaPct, setAlertaPct] = useState("80");
  const [hardLimit, setHardLimit] = useState<boolean | null>(null);
  const [comentarioCfg, setComentarioCfg] = useState("");

  if (detalhe.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  if (detalhe.isError || !detalhe.data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Organização não encontrada</AlertTitle>
        <AlertDescription>
          <Button variant="link" className="px-0" asChild>
            <Link to="/admin/ia">Voltar à lista de IA</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const d = detalhe.data;
  const org = d.organizacao as { id: string; nome: string };
  const efetivo = d.efetivo as { ia_habilitada: boolean; orcamento_cents: number | null; chave_exclusiva: boolean };

  const salvarChave = () =>
    acao.mutate(
      {
        action: "definir_cliente",
        organization_id: id,
        provider,
        api_key: apiKey,
        comment: comentarioChave,
      },
      {
        onSuccess: () => {
          toast.success("Chave exclusiva salva.");
          setApiKey("");
          setComentarioChave("");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const revogar = () =>
    acao.mutate(
      { action: "revogar_cliente", organization_id: id, comment: comentarioRevogar },
      {
        onSuccess: () => {
          toast.success("Chave exclusiva revogada; a organização volta à padrão.");
          setComentarioRevogar("");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const salvarConfig = () => {
    const cents =
      budgetReais.trim() === ""
        ? null
        : Math.round(Number(budgetReais.replace(",", ".")) * 100);
    if (budgetReais.trim() !== "" && (Number.isNaN(cents) || cents! < 0)) {
      toast.error("Orçamento inválido.");
      return;
    }
    acao.mutate(
      {
        action: "configurar_cliente",
        organization_id: id,
        ai_enabled: aiEnabled,
        monthly_budget_cents: cents,
        alert_threshold_pct: Number(alertaPct) || 80,
        hard_limit: hardLimit,
        comment: comentarioCfg,
      },
      {
        onSuccess: () => {
          toast.success("Configuração de IA salva.");
          setComentarioCfg("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs
        items={[
          { label: "Administração", to: "/admin" },
          { label: "IA", to: "/admin/ia" },
          { label: org.nome },
        ]}
      />
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/ia">
          <ArrowLeft /> Voltar
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{org.nome}</h1>
        <p className="text-muted-foreground text-sm">
          Gasto no mês:{" "}
          {Number(d.gasto_mes_brl ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          {d.pct_usado != null ? ` · ${d.pct_usado}% do orçamento` : ""}
          {Number(d.via_padrao_mes ?? 0) > 0 ? ` · ${d.via_padrao_mes} chamadas via chave padrão (visão)` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chave exclusiva</CardTitle>
          <CardDescription>
            {efetivo.chave_exclusiva
              ? "Esta organização usa credencial própria."
              : "Usa a chave padrão da plataforma (ou semente do ambiente)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
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
            <Label>Nova chave de API</Label>
            <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <Label>Comentário</Label>
            <Textarea value={comentarioChave} onChange={(e) => setComentarioChave(e.target.value)} rows={2} />
          </div>
          <Button
            disabled={acao.isPending || !apiKey || comentarioChave.trim().length < 3}
            onClick={salvarChave}
          >
            Definir chave exclusiva (teste obrigatório)
          </Button>

          {efetivo.chave_exclusiva && (
            <div className="border-t pt-4 space-y-2">
              <Label>Revogar chave exclusiva</Label>
              <Textarea value={comentarioRevogar} onChange={(e) => setComentarioRevogar(e.target.value)} rows={2} />
              <Button
                variant="destructive"
                disabled={acao.isPending || comentarioRevogar.trim().length < 3}
                onClick={revogar}
              >
                Revogar e voltar à padrão
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orçamento e corte</CardTitle>
          <CardDescription>Valores efetivos hoje: IA {efetivo.ia_habilitada ? "ligada" : "desligada"}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="flex items-center gap-2">
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} id="ia-enabled" />
            <Label htmlFor="ia-enabled">IA habilitada</Label>
          </div>
          <div>
            <Label>Orçamento mensal (R$)</Label>
            <Input
              value={budgetReais}
              onChange={(e) => setBudgetReais(e.target.value)}
              placeholder="Vazio = sem teto / herda do plano"
            />
          </div>
          <div>
            <Label>Alerta em (%)</Label>
            <Input value={alertaPct} onChange={(e) => setAlertaPct(e.target.value)} />
          </div>
          <div>
            <Label>Corte ao esgotar 100%</Label>
            <Select
              value={hardLimit === null ? "padrao" : hardLimit ? "sim" : "nao"}
              onValueChange={(v) => setHardLimit(v === "padrao" ? null : v === "sim")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Regra padrão (Q5)</SelectItem>
                <SelectItem value="sim">Cortar</SelectItem>
                <SelectItem value="nao">Só alertar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comentário</Label>
            <Textarea value={comentarioCfg} onChange={(e) => setComentarioCfg(e.target.value)} rows={2} />
          </div>
          <Button disabled={acao.isPending || comentarioCfg.trim().length < 3} onClick={salvarConfig}>
            Salvar configuração
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAiClientDetail;
