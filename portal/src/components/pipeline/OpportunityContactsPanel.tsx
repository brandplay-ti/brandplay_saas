import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Users, Mail, Phone, AlertCircle, Building2 } from "lucide-react";

export type ContactType = "geral" | "contrato" | "financeiro";

type OpportunityContact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  contact_type: ContactType;
  is_primary: boolean;
};

const TYPE_META: Record<ContactType, { label: string; className: string }> = {
  geral: { label: "Contato", className: "bg-muted text-muted-foreground border-border" },
  contrato: { label: "Contrato", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  financeiro: { label: "Financeiro", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
};

const emptyForm = {
  name: "",
  role: "",
  email: "",
  phone: "",
  contact_type: "geral" as ContactType,
};

interface Props {
  opportunityId: string;
  sponsorId: string | null;
  hasContract?: boolean;
  hasInstallments?: boolean;
}

export const OpportunityContactsPanel = ({
  opportunityId,
  sponsorId,
  hasContract = false,
  hasInstallments = false,
}: Props) => {
  const [contacts, setContacts] = useState<OpportunityContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("opportunity_contacts")
      .select("id,name,role,email,phone,contact_type,is_primary")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar contatos", { description: error.message });
    } else {
      setContacts((data ?? []) as OpportunityContact[]);
    }
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => {
    load();
  }, [load]);

  const missingContract = hasContract && !contacts.some((c) => c.contact_type === "contrato");
  const missingFinance = hasInstallments && !contacts.some((c) => c.contact_type === "financeiro");

  const openForm = (type: ContactType) => {
    setForm({ ...emptyForm, contact_type: type });
    setShowForm(true);
  };

  const addContact = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome do contato");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("opportunity_contacts").insert({
      opportunity_id: opportunityId,
      name: form.name.trim(),
      role: form.role.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contact_type: form.contact_type,
      is_primary: contacts.length === 0,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar contato", { description: error.message });
      return;
    }
    toast.success(
      sponsorId
        ? "Contato adicionado e sincronizado com o patrocinador"
        : "Contato adicionado. Ao vincular um patrocinador, ele será sincronizado.",
    );
    setForm(emptyForm);
    setShowForm(false);
    load();
  };

  const removeContact = async (id: string) => {
    const { error } = await supabase.from("opportunity_contacts").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir contato", { description: error.message });
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const grouped = useMemo(() => {
    const order: ContactType[] = ["geral", "contrato", "financeiro"];
    return order
      .map((type) => ({ type, items: contacts.filter((c) => c.contact_type === type) }))
      .filter((g) => g.items.length > 0);
  }, [contacts]);

  return (
    <div className="border rounded-lg p-3 space-y-3" data-field="contatos">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-primary" />
          Contatos da oportunidade
          {contacts.length > 0 && <Badge variant="secondary">{contacts.length}</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => openForm("geral")}>
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5" />
        {sponsorId
          ? "Contatos são sincronizados automaticamente com a ficha do patrocinador."
          : "Sem patrocinador vinculado — os contatos serão copiados assim que você vincular um."}
      </p>

      {(missingContract || missingFinance) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-2 text-xs">
          {missingContract && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Contrato criado: informe o contato responsável pelo contrato.
              </span>
              <Button size="sm" variant="outline" onClick={() => openForm("contrato")}>
                Adicionar
              </Button>
            </div>
          )}
          {missingFinance && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Parcelas geradas: informe o contato financeiro.
              </span>
              <Button size="sm" variant="outline" onClick={() => openForm("financeiro")}>
                Adicionar
              </Button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Nome*</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do contato"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={form.contact_type}
                onValueChange={(v) => setForm({ ...form, contact_type: v as ContactType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Contato geral</SelectItem>
                  <SelectItem value="contrato">Responsável pelo contrato</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Cargo</Label>
              <Input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Ex.: Diretor de Marketing"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={form.phone}
                inputMode="tel"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-0000"
              />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contato@empresa.com"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={addContact} disabled={saving}>
              Salvar contato
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando contatos…</p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum contato cadastrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.type} className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {TYPE_META[group.type].label}
              </div>
              {group.items.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant="outline" className={TYPE_META[c.contact_type].className}>
                        {TYPE_META[c.contact_type].label}
                      </Badge>
                      {c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-0.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:underline">
                          <Mail className="h-3 w-3" /> {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:underline">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeContact(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
