import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { tituloDaPagina } from "@/lib/pageTitle";

/** Atualiza o título da aba a cada troca de rota (`src/lib/pageTitle.ts`). */
export const DocumentTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const titulo = tituloDaPagina(pathname);
    if (titulo) document.title = titulo;
  }, [pathname]);

  return null;
};
