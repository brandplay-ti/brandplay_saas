import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, MonitorX, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatTile } from "@/components/admin/StatTile";
import { useAdminClients } from "@/hooks/usePlatformAdmin";
import { useFiltroSalvo } from "@/hooks/useFiltroSalvo";
import { LIMITE_DE_FALHAS, useFalhasDeBanco, useFalhasDeTela } from "@/hooks/useLogsDeFalha";
import {
  ACOES_DE_BANCO,
  ehFalhaDeRls,
  momentoDaFalha,
  nomeDoCliente,
  nomesDasPolicies,
  ROTULO_DA_SEVERIDADE,
  ROTULO_DA_TABELA,
  SEM_CLIENTE,
  SEVERIDADES,
  TABELAS_COM_LOG,
  TODOS_OS_CLIENTES,
  type FalhaDeBanco,
  type FalhaDeTela,
} from "@/lib/logsDeFalha";
import { formatarNumero } from "@/lib/mascaras";

// Área da plataforma: os filtros não dependem da organização ativa.
const ESCOPO = { escopo: "plataforma" } as const;
const TELA = "admin-logs-falhas";

/** Espera a pessoa parar de digitar antes de consultar. */
function useValorAposPausa(valor: string, ms = 400) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(timer);
  }, [valor, ms]);
  return atrasado;
}

/**
 * Logs de falha de todos os clientes (BP-3). Só o superadmin lê (RLS da
 * 0045); a guarda do `AdminLayout` é experiência.
 */
const AdminFailureLogs = () => {
  const clientes = useAdminClients();
  const [cliente, setCliente] = useFiltroSalvo(TELA, "cliente", TODOS_OS_CLIENTES, ESCOPO);
  const [usuario, setUsuario] = useFiltroSalvo(TELA, "usuario", "", ESCOPO);
  const [tabela, setTabela] = useFiltroSalvo(TELA, "tabela", "todas", {
    ...ESCOPO,
    permitidos: ["todas", ...TABELAS_COM_LOG, "unknown"],
  });
  const [acao, setAcao] = useFiltroSalvo(TELA, "acao", "todas", { ...ESCOPO, permitidos: ["todas", ...ACOES_DE_BANCO] });
  const [severidade, setSeveridade] = useFiltroSalvo(TELA, "severidade", "todas", {
    ...ESCOPO,
    permitidos: ["todas", ...SEVERIDADES],
  });
  const [aba, setAba] = useState("banco");
  const usuarioBuscado = useValorAposPausa(usuario);

  const banco = useFalhasDeBanco({ cliente, usuario: usuarioBuscado, tabela, acao });
  const tela = useFalhasDeTela({ cliente, usuario: usuarioBuscado, severidade });

  const nomes = useMemo(
    () => new Map((clientes.data ?? []).map((c) => [c.organization_id, c.name])),
    [clientes.data],
  );
  const opcoesDeCliente = useMemo(
    () => [...(clientes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [clientes.data],
  );
  const falhasDeRls = (banco.data ?? []).filter((f) => ehFalhaDeRls(f.error_message)).length;
  const atualizando = banco.isFetching || tela.isFetching;

  const atualizar = () => {
    void banco.refetch();
    void tela.refetch();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Logs de falhas"
        description={`Falhas de banco e de tela de todos os clientes, das mais recentes (até ${LIMITE_DE_FALHAS} por lista).`}
        actions={
          <Button onClick={atualizar} disabled={atualizando} variant="outline" className="gap-2 self-start md:self-auto">
            <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="space-y-1.5 md:w-72">
          <Label htmlFor="filtro-cliente">Cliente</Label>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger id="filtro-cliente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_OS_CLIENTES}>Todos os clientes</SelectItem>
              <SelectItem value={SEM_CLIENTE}>Sem organização</SelectItem>
              {opcoesDeCliente.map((c) => (
                <SelectItem key={c.organization_id} value={c.organization_id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="filtro-usuario">Usuário</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="filtro-usuario"
              className="pl-9"
              placeholder="E-mail ou id do usuário"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="banco" className="gap-2">
            <Database className="h-4 w-4" aria-hidden="true" /> Banco
          </TabsTrigger>
          <TabsTrigger value="tela" className="gap-2">
            <MonitorX className="h-4 w-4" aria-hidden="true" /> Tela
          </TabsTrigger>
        </TabsList>

        <TabsContent value="banco" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label="Falhas listadas" value={formatarNumero(banco.data?.length ?? 0)} icon={Database} />
            <StatTile label="Barradas pela RLS" value={formatarNumero(falhasDeRls)} icon={ShieldAlert} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="space-y-1.5 sm:w-64">
              <Label htmlFor="filtro-tabela">Tabela</Label>
              <Select value={tabela} onValueChange={setTabela}>
                <SelectTrigger id="filtro-tabela">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {[...TABELAS_COM_LOG, "unknown"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULO_DA_TABELA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:w-48">
              <Label htmlFor="filtro-acao">Ação</Label>
              <Select value={acao} onValueChange={setAcao}>
                <SelectTrigger id="filtro-acao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {ACOES_DE_BANCO.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Conteudo
            carregando={banco.isLoading}
            erro={banco.isError}
            vazio={(banco.data?.length ?? 0) === 0}
            icone={Database}
          >
            <TabelaDeFalhasDeBanco falhas={banco.data ?? []} nomes={nomes} />
          </Conteudo>
        </TabsContent>

        <TabsContent value="tela" className="space-y-4">
          <div className="space-y-1.5 sm:w-48">
            <Label htmlFor="filtro-severidade">Severidade</Label>
            <Select value={severidade} onValueChange={setSeveridade}>
              <SelectTrigger id="filtro-severidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {SEVERIDADES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ROTULO_DA_SEVERIDADE[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Conteudo
            carregando={tela.isLoading}
            erro={tela.isError}
            vazio={(tela.data?.length ?? 0) === 0}
            icone={MonitorX}
          >
            <TabelaDeFalhasDeTela falhas={tela.data ?? []} nomes={nomes} />
          </Conteudo>
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface ConteudoProps {
  carregando: boolean;
  erro: boolean;
  vazio: boolean;
  icone: typeof Database;
  children: React.ReactNode;
}

const Conteudo = ({ carregando, erro, vazio, icone, children }: ConteudoProps) => {
  if (carregando) return <LoadingSkeleton />;
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar as falhas</AlertTitle>
        <AlertDescription>Tente atualizar em instantes.</AlertDescription>
      </Alert>
    );
  }
  if (vazio) {
    return (
      <EmptyState
        icon={icone}
        title="Nenhuma falha encontrada"
        description="Nada registrado com esses filtros. Mude o cliente, o usuário ou os demais filtros."
      />
    );
  }
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">{children}</CardContent>
    </Card>
  );
};

const Cliente = ({ id, nomes }: { id: string | null; nomes: ReadonlyMap<string, string> }) => (
  <span className={id && nomes.has(id) ? "font-medium" : "text-muted-foreground"}>{nomeDoCliente(id, nomes)}</span>
);

const TabelaDeFalhasDeBanco = ({ falhas, nomes }: { falhas: FalhaDeBanco[]; nomes: ReadonlyMap<string, string> }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Data</TableHead>
        <TableHead>Cliente</TableHead>
        <TableHead>Usuário</TableHead>
        <TableHead>Tabela</TableHead>
        <TableHead>Ação</TableHead>
        <TableHead>Erro</TableHead>
        <TableHead className="hidden lg:table-cell">Local</TableHead>
        <TableHead className="hidden lg:table-cell">Policies</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {falhas.map((f) => {
        const policies = nomesDasPolicies(f.matching_policies);
        return (
          <TableRow key={f.id}>
            <TableCell className="whitespace-nowrap text-sm">{momentoDaFalha(f.created_at)}</TableCell>
            <TableCell className="max-w-48 truncate text-sm">
              <Cliente id={f.organization_id} nomes={nomes} />
            </TableCell>
            <TableCell className="max-w-56 truncate text-sm">{f.user_email ?? f.user_id}</TableCell>
            <TableCell>
              <Badge variant="secondary">{ROTULO_DA_TABELA[f.table_name] ?? f.table_name}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{f.action}</Badge>
            </TableCell>
            <TableCell className="min-w-72 max-w-xl">
              <div className="space-y-1">
                <p className="text-sm font-medium">{f.error_message ?? "Falha sem mensagem"}</p>
                {f.error_code && <p className="text-xs text-muted-foreground">Código: {f.error_code}</p>}
                {f.error_details && <p className="text-xs text-muted-foreground">{f.error_details}</p>}
                {f.error_hint && <p className="text-xs text-muted-foreground">Dica: {f.error_hint}</p>}
              </div>
            </TableCell>
            <TableCell className="hidden max-w-60 truncate text-xs text-muted-foreground lg:table-cell">
              {f.client_file ? `${f.client_file}${f.client_line ? `:${f.client_line}` : ""}` : "—"}
            </TableCell>
            <TableCell className="hidden max-w-72 lg:table-cell">
              {policies.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {policies.slice(0, 3).map((nome, i) => (
                    <Badge key={`${f.id}-${i}`} variant="outline">
                      {nome}
                    </Badge>
                  ))}
                  {policies.length > 3 && <span className="text-xs text-muted-foreground">+{policies.length - 3}</span>}
                </div>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

const TabelaDeFalhasDeTela = ({ falhas, nomes }: { falhas: FalhaDeTela[]; nomes: ReadonlyMap<string, string> }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Data</TableHead>
        <TableHead>Cliente</TableHead>
        <TableHead>Usuário</TableHead>
        <TableHead>Severidade</TableHead>
        <TableHead>Erro</TableHead>
        <TableHead className="hidden lg:table-cell">Rota</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {falhas.map((f) => (
        <TableRow key={f.id}>
          <TableCell className="whitespace-nowrap text-sm">{momentoDaFalha(f.created_at)}</TableCell>
          <TableCell className="max-w-48 truncate text-sm">
            <Cliente id={f.organization_id} nomes={nomes} />
          </TableCell>
          <TableCell className="max-w-56 truncate text-sm">{f.user_email ?? f.user_id ?? "Sem login"}</TableCell>
          <TableCell>
            <Badge variant={f.severity === "warning" ? "secondary" : "destructive"}>
              {ROTULO_DA_SEVERIDADE[f.severity] ?? f.severity}
            </Badge>
          </TableCell>
          <TableCell className="min-w-72 max-w-xl">
            <p className="text-sm font-medium">{f.message}</p>
            {(f.stack || f.component_stack) && (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Pilha de chamadas
                </summary>
                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all">
                  {[f.stack, f.component_stack].filter(Boolean).join("\n\n")}
                </pre>
              </details>
            )}
          </TableCell>
          <TableCell className="hidden max-w-60 truncate text-xs text-muted-foreground lg:table-cell">{f.route ?? "—"}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export default AdminFailureLogs;
