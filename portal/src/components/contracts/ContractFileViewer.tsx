import { useEffect, useState } from "react";
import mammoth from "mammoth";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type Props = {
  filePath: string;
  fileName: string | null;
};

export function ContractFileViewer({ filePath, fileName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);

  const ext = (fileName ?? filePath).split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx" || ext === "doc";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setDocxHtml(null);

    const load = async () => {
      try {
        const { data, error: signErr } = await supabase.storage
          .from("contracts")
          .createSignedUrl(filePath, 60 * 10);
        if (signErr || !data?.signedUrl) throw signErr ?? new Error("URL inválida");

        if (isPdf) {
          if (!cancelled) setPdfUrl(data.signedUrl);
        } else if (isDocx) {
          const res = await fetch(data.signedUrl);
          const buffer = await res.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!cancelled) setDocxHtml(result.value || "<p>Documento vazio.</p>");
        } else {
          if (!cancelled) setError("Formato não suportado para visualização.");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar arquivo");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [filePath, isPdf, isDocx]);

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando visualização...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center text-sm text-destructive">{error}</Card>
    );
  }

  if (isPdf && pdfUrl) {
    return (
      <Card className="overflow-hidden">
        <iframe
          src={pdfUrl}
          title={fileName ?? "Contrato"}
          className="w-full h-[70vh] border-0 bg-muted"
        />
      </Card>
    );
  }

  if (isDocx && docxHtml) {
    const safeHtml = DOMPurify.sanitize(docxHtml, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "span", "div", "blockquote", "hr"],
      ALLOWED_ATTR: ["href", "title", "colspan", "rowspan"],
    });
    return (
      <Card className="p-6 max-h-[70vh] overflow-y-auto">
        <div
          className="prose prose-sm max-w-none text-foreground [&_*]:text-foreground"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </Card>
    );
  }

  return (
    <Card className="p-6 text-center text-sm text-muted-foreground">
      Pré-visualização indisponível.
    </Card>
  );
}
