import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { useAdminAiAction, useAdminIaPrecos } from "@/hooks/useAdminAi";
import { IA_FORNECEDOR_LABEL, type IaFornecedor } from "@/lib/adminAi";

const FORNECEDORES: IaFornecedor[] = ["openai", "gemini", "anthropic"];

const AdminAiPrecos = () => {
  const precos = useAdminIaPrecos();
  const acao = useAdminAiAction();

  const [provider, setProvider] = useState<IaFornecedor>("gemini");
  const [model, setModel] = useState("");
  const [inputBrl, setInputBrl] = useState("");
  const [outputBrl, setOutputBrl] = useState("");
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");

  const salvar = () => {
    const input = Number(inputBrl.replace(",", "."));
    const output = Number(outputBrl.replace(",", "."));
    if (!model.trim() || Number.isNaN(input) || Number.isNaN(output)) {
      toast.error("Preencha modelo e preços.");
      return;
    }
    acao.mutate(
      {
        action: "definir_preco",
        provider,
        model: model.trim(),
        input_brl_per_mtok: input,
        output_brl_per_mtok: output,
        valid_from: validFrom,
        comment,
      },
      {
        onSuccess: () => {
          toast.success("Preço salvo.");
          setComment("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (precos.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (precos.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar preços</AlertTitle>
        <AlertDescription>Tente recarregar a página.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/ia">
          <ArrowLeft /> IA
        </Link>
      </Button>
      <PageHeader
        title="Preços de modelos"
        description="Valores em reais por 1 milhão de tokens, usados no custo estimado de ai_usage_events."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cadastrar ou atualizar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 max-w-xl">
          <div className="grid grid-cols-2 gap-2">
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
              <Label>Modelo</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Entrada (R$/1M tokens)</Label>
              <Input value={inputBrl} onChange={(e) => setInputBrl(e.target.value)} />
            </div>
            <div>
              <Label>Saída (R$/1M tokens)</Label>
              <Input value={outputBrl} onChange={(e) => setOutputBrl(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Vigência (AAAA-MM-DD)</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label>Comentário</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
          <Button disabled={acao.isPending || comment.trim().length < 3} onClick={salvar}>
            Salvar preço
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tabela vigente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Vigência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(precos.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum preço cadastrado. O custo estimado ficará nulo até cadastrar.
                  </TableCell>
                </TableRow>
              ) : (
                (precos.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{IA_FORNECEDOR_LABEL[p.provider]}</TableCell>
                    <TableCell className="font-mono text-xs">{p.model}</TableCell>
                    <TableCell>{p.input_brl_per_mtok}</TableCell>
                    <TableCell>{p.output_brl_per_mtok}</TableCell>
                    <TableCell>{p.valid_from}</TableCell>
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

export default AdminAiPrecos;
