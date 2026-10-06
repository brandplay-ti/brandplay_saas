import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatCNPJ, formatCEP, formatPhone, isValidCNPJ, fetchCEP, onlyDigits } from "@/lib/cnpj";
import { validateLogoFile, LOGO_ACCEPT, LOGO_HINT } from "@/lib/logoValidation";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
];
const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS"];
const LOCALES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  cnpj: z.string().refine((v) => isValidCNPJ(v), "CNPJ inválido"),
  legal_name: z.string().trim().max(200).optional().or(z.literal("")),
  trade_name: z.string().trim().max(200).optional().or(z.literal("")),
  state_registration: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  legal_representative: z.string().trim().max(200).optional().or(z.literal("")),
  zip_code: z.string().trim().max(20).optional().or(z.literal("")),
  address_street: z.string().trim().max(255).optional().or(z.literal("")),
  address_number: z.string().trim().max(20).optional().or(z.literal("")),
  address_complement: z.string().trim().max(100).optional().or(z.literal("")),
  address_neighborhood: z.string().trim().max(100).optional().or(z.literal("")),
  address_city: z.string().trim().max(100).optional().or(z.literal("")),
  address_state: z.string().trim().max(2).optional().or(z.literal("")),
  timezone: z.string(),
  currency: z.string(),
  locale: z.string(),
});

type FormValues = z.infer<typeof schema>;

const empty: FormValues = {
  name: "", cnpj: "", legal_name: "", trade_name: "", state_registration: "",
  email: "", phone: "", website: "", legal_representative: "",
  zip_code: "", address_street: "", address_number: "", address_complement: "",
  address_neighborhood: "", address_city: "", address_state: "",
  timezone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR",
};

export const OrganizationForm = () => {
  const { orgId, isAdmin, refresh } = useOrganization();
  const [values, setValues] = useState<FormValues>(empty);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
      if (data) {
        setValues({
          name: data.name ?? "",
          cnpj: data.cnpj ? formatCNPJ(data.cnpj) : "",
          legal_name: data.legal_name ?? "",
          trade_name: data.trade_name ?? "",
          state_registration: data.state_registration ?? "",
          email: data.email ?? "",
          phone: data.phone ? formatPhone(data.phone) : "",
          website: data.website ?? "",
          legal_representative: data.legal_representative ?? "",
          zip_code: data.zip_code ? formatCEP(data.zip_code) : "",
          address_street: data.address_street ?? "",
          address_number: data.address_number ?? "",
          address_complement: data.address_complement ?? "",
          address_neighborhood: data.address_neighborhood ?? "",
          address_city: data.address_city ?? "",
          address_state: data.address_state ?? "",
          timezone: data.timezone ?? "America/Sao_Paulo",
          currency: data.currency ?? "BRL",
          locale: data.locale ?? "pt-BR",
        });
        setLogoPath(data.logo_path);
        if (data.logo_path) {
          const { data: pub } = supabase.storage.from("org-logos").getPublicUrl(data.logo_path);
          setLogoUrl(pub.publicUrl);
        }
      }
      setLoading(false);
    })();
  }, [orgId]);

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const handleCepBlur = async () => {
    const data = await fetchCEP(values.zip_code);
    if (data) {
      setValues((p) => ({
        ...p,
        address_street: data.street ?? p.address_street,
        address_neighborhood: data.neighborhood ?? p.address_neighborhood,
        address_city: data.city ?? p.address_city,
        address_state: data.state ?? p.address_state,
      }));
      toast.success("Endereço preenchido pelo CEP");
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!orgId) return;
    const check = await validateLogoFile(file);
    if (!check.ok) {
      toast.error(check.error!);
      return;
    }
    if (check.warning) toast.warning(check.warning);
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Falha ao enviar logo: " + error.message);
      setUploading(false);
      return;
    }
    await supabase.from("organizations").update({ logo_path: path }).eq("id", orgId);
    setLogoPath(path);
    const { data: pub } = supabase.storage.from("org-logos").getPublicUrl(path);
    setLogoUrl(pub.publicUrl + `?t=${Date.now()}`);
    toast.success("Logo atualizado");
    setUploading(false);
    refresh();
  };

  const handleSave = async () => {
    if (!orgId) return;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) errs[i.path[0] as string] = i.message;
      });
      setErrors(errs);
      toast.error("Verifique os campos destacados");
      return;
    }
    setSaving(true);
    const payload = {
      ...parsed.data,
      cnpj: onlyDigits(parsed.data.cnpj),
      phone: parsed.data.phone ? onlyDigits(parsed.data.phone) : null,
      zip_code: parsed.data.zip_code ? onlyDigits(parsed.data.zip_code) : null,
      legal_name: parsed.data.legal_name || null,
      trade_name: parsed.data.trade_name || null,
      state_registration: parsed.data.state_registration || null,
      email: parsed.data.email || null,
      website: parsed.data.website || null,
      legal_representative: parsed.data.legal_representative || null,
      address_street: parsed.data.address_street || null,
      address_number: parsed.data.address_number || null,
      address_complement: parsed.data.address_complement || null,
      address_neighborhood: parsed.data.address_neighborhood || null,
      address_city: parsed.data.address_city || null,
      address_state: parsed.data.address_state || null,
    };
    const { error } = await supabase.from("organizations").update(payload).eq("id", orgId);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("organizations_cnpj_unique")
        ? "Este CNPJ já está cadastrado em outra organização"
        : "Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Organização atualizada");
    refresh();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const disabled = !isAdmin;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
          <CardDescription>Logo, nome e dados fiscais da organização.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 rounded-lg">
              {logoUrl ? <AvatarImage src={logoUrl} alt="Logo" className="object-contain" /> : null}
              <AvatarFallback className="rounded-lg bg-muted">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={LOGO_ACCEPT}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {logoPath ? "Trocar logo" : "Enviar logo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">{LOGO_HINT}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome de exibição *" error={errors.name}>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} disabled={disabled} />
            </Field>
            <Field label="CNPJ *" error={errors.cnpj}>
              <Input
                value={values.cnpj}
                onChange={(e) => set("cnpj", formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                disabled={disabled}
              />
            </Field>
            <Field label="Razão social" error={errors.legal_name}>
              <Input value={values.legal_name} onChange={(e) => set("legal_name", e.target.value)} disabled={disabled} />
            </Field>
            <Field label="Nome fantasia" error={errors.trade_name}>
              <Input value={values.trade_name} onChange={(e) => set("trade_name", e.target.value)} disabled={disabled} />
            </Field>
            <Field label="Inscrição estadual" error={errors.state_registration}>
              <Input value={values.state_registration} onChange={(e) => set("state_registration", e.target.value)} disabled={disabled} />
            </Field>
            <Field label="Responsável legal" error={errors.legal_representative}>
              <Input value={values.legal_representative} onChange={(e) => set("legal_representative", e.target.value)} disabled={disabled} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Telefone" error={errors.phone}>
            <Input value={values.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(11) 99999-9999" disabled={disabled} />
          </Field>
          <Field label="Site" error={errors.website}>
            <Input value={values.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." disabled={disabled} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
          <CardDescription>Digite o CEP para preenchimento automático.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Field label="CEP" error={errors.zip_code} className="md:col-span-2">
            <Input value={values.zip_code} onChange={(e) => set("zip_code", formatCEP(e.target.value))} onBlur={handleCepBlur} placeholder="00000-000" disabled={disabled} />
          </Field>
          <Field label="Rua / Logradouro" error={errors.address_street} className="md:col-span-4">
            <Input value={values.address_street} onChange={(e) => set("address_street", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Número" error={errors.address_number} className="md:col-span-1">
            <Input value={values.address_number} onChange={(e) => set("address_number", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Complemento" error={errors.address_complement} className="md:col-span-2">
            <Input value={values.address_complement} onChange={(e) => set("address_complement", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Bairro" error={errors.address_neighborhood} className="md:col-span-3">
            <Input value={values.address_neighborhood} onChange={(e) => set("address_neighborhood", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="Cidade" error={errors.address_city} className="md:col-span-4">
            <Input value={values.address_city} onChange={(e) => set("address_city", e.target.value)} disabled={disabled} />
          </Field>
          <Field label="UF" error={errors.address_state} className="md:col-span-2">
            <Select value={values.address_state} onValueChange={(v) => set("address_state", v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferências</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Fuso horário">
            <Select value={values.timezone} onValueChange={(v) => set("timezone", v)} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moeda padrão">
            <Select value={values.currency} onValueChange={(v) => set("currency", v)} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Idioma">
            <Select value={values.locale} onValueChange={(v) => set("locale", v)} disabled={disabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className ?? ""}`}>
    <Label className="text-xs">{label}</Label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);
