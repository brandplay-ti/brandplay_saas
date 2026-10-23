import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Loader2, Search, Trophy, Users } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useIsPlatformAdmin } from "@/hooks/usePlatformAdmin";
import { gruposVisiveis } from "@/lib/navegacao";
import { filtrarPaginas, termoDeBusca } from "@/lib/buscaGlobal";

type Resultado = { id: string; titulo: string; detalhe?: string; url: string };

const ehMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Busca global do painel (Ctrl+K / ⌘K): páginas do menu e registros da
 * organização ativa — patrocinadores, propriedades e contratos. Cada tipo só é
 * buscado para quem tem o módulo; o filtro por organização é o da tela (RLS
 * garante que só vêm organizações das quais o usuário é membro).
 */
export const CommandMenu = () => {
  const navigate = useNavigate();
  const { orgId, can, isAdmin, loading } = useOrganization();
  const { isPlatformAdmin } = useIsPlatformAdmin();
  const [open, setOpen] = useState(false);
  const [entrada, setEntrada] = useState("");
  const [termo, setTermo] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Espera a pessoa parar de digitar antes de ir ao banco.
  useEffect(() => {
    const t = setTimeout(() => setTermo(termoDeBusca(entrada)), 250);
    return () => clearTimeout(t);
  }, [entrada]);

  const paginas = useMemo(
    () =>
      gruposVisiveis({ can, isAdmin, loading, isPlatformAdmin }).flatMap((g) =>
        g.items.map((i) => ({ ...i, grupo: g.label })),
      ),
    [can, isAdmin, loading, isPlatformAdmin],
  );
  const paginasFiltradas = filtrarPaginas(paginas, entrada);

  const pode = {
    patrocinadores: !loading && (isAdmin || can("crm")),
    propriedades: !loading && (isAdmin || can("crm") || can("operacional")),
    contratos: !loading && (isAdmin || can("crm") || can("financeiro")),
  };

  const { data: registros, isFetching, isError } = useQuery({
    queryKey: ["busca-global", orgId, termo, pode.patrocinadores, pode.propriedades, pode.contratos],
    enabled: open && !!orgId && !!termo,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${termo}%`;
      const vazio = { data: [], error: null };
      const [sp, pr, ct] = await Promise.all([
        pode.patrocinadores
          ? supabase
              .from("sponsors")
              .select("id, name, trade_name")
              .eq("organization_id", orgId!)
              .is("archived_at", null)
              .or(`name.ilike.${like},trade_name.ilike.${like}`)
              .limit(5)
          : vazio,
        pode.propriedades
          ? supabase.from("sports_properties").select("id, name").eq("organization_id", orgId!).ilike("name", like).limit(5)
          : vazio,
        pode.contratos
          ? supabase
              .from("contracts")
              .select("id, title, brand, contract_number")
              .eq("organization_id", orgId!)
              .or(`title.ilike.${like},brand.ilike.${like},contract_number.ilike.${like}`)
              .limit(5)
          : vazio,
      ]);
      const erro = sp.error ?? pr.error ?? ct.error;
      if (erro) throw erro;
      return {
        patrocinadores: (sp.data ?? []).map(
          (s): Resultado => ({
            id: s.id,
            titulo: s.trade_name || s.name,
            detalhe: s.trade_name && s.trade_name !== s.name ? s.name : undefined,
            url: `/dashboard/patrocinadores/${s.id}`,
          }),
        ),
        propriedades: (pr.data ?? []).map(
          (p): Resultado => ({ id: p.id, titulo: p.name, url: `/dashboard/propriedades/${p.id}` }),
        ),
        contratos: (ct.data ?? []).map(
          (c): Resultado => ({
            id: c.id,
            titulo: c.title || c.brand || "Contrato",
            detalhe: [c.contract_number, c.brand].filter(Boolean).join(" · ") || undefined,
            url: `/dashboard/contratos?contract=${c.id}`,
          }),
        ),
      };
    },
  });

  const abrir = (url: string) => {
    setOpen(false);
    setEntrada("");
    navigate(url);
  };

  const grupos: { titulo: string; icone: typeof Users; itens: Resultado[] }[] = registros
    ? [
        { titulo: "Patrocinadores", icone: Users, itens: registros.patrocinadores },
        { titulo: "Propriedades", icone: Trophy, itens: registros.propriedades },
        { titulo: "Contratos", icone: FileSignature, itens: registros.contratos },
      ]
    : [];
  const temRegistros = grupos.some((g) => g.itens.length > 0);
  const buscando = !!termo && isFetching;
  const falhou = !!termo && !isFetching && isError;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Buscar páginas e registros"
        aria-keyshortcuts="Control+K Meta+K"
        className="h-9 w-9 justify-center px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
      >
        <Search className="h-4 w-4 sm:mr-2" aria-hidden />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline">
          {ehMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg">
          <DialogTitle className="sr-only">Busca</DialogTitle>
          <DialogDescription className="sr-only">
            Busque páginas, patrocinadores, propriedades e contratos da organização ativa.
          </DialogDescription>
          {/* shouldFilter={false}: o banco já filtra os registros (inclusive por
              número do contrato, que não aparece no texto do item). */}
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
            <CommandInput value={entrada} onValueChange={setEntrada} placeholder="Buscar páginas, patrocinadores, propriedades, contratos…" />
            <CommandList>
              {!buscando && !falhou && paginasFiltradas.length === 0 && !temRegistros && (
                <CommandEmpty>Nada encontrado para “{entrada.trim()}”.</CommandEmpty>
              )}
              {falhou && (
                <p className="px-4 py-3 text-sm text-destructive" role="alert">
                  Não foi possível buscar patrocinadores, propriedades e contratos agora. Tente de novo em instantes.
                </p>
              )}
              {buscando && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando registros…
                </div>
              )}
              {grupos.map(
                (g) =>
                  g.itens.length > 0 && (
                    <CommandGroup key={g.titulo} heading={g.titulo}>
                      {g.itens.map((r) => (
                        <CommandItem key={r.id} value={`${g.titulo}-${r.id}`} onSelect={() => abrir(r.url)}>
                          <g.icone className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                          <span className="truncate">{r.titulo}</span>
                          {r.detalhe && <span className="ml-2 truncate text-xs text-muted-foreground">{r.detalhe}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ),
              )}
              {paginasFiltradas.length > 0 && (
                <CommandGroup heading="Páginas">
                  {paginasFiltradas.map((p) => (
                    <CommandItem key={p.url} value={`pagina-${p.url}`} onSelect={() => abrir(p.url)}>
                      <p.icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                      <span>{p.title}</span>
                      <CommandShortcut>{p.grupo}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};
