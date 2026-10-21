import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbTrailItem {
  label: string;
  /** Sem `to`: é a página atual (último item). */
  to?: string;
}

/**
 * Trilha de navegação das telas de detalhe ("Propriedades › Copa X"): mostra
 * onde o usuário está e leva de volta à lista, no lugar de um botão "Voltar"
 * solto.
 */
export const Breadcrumbs = ({ items }: { items: BreadcrumbTrailItem[] }) => (
  <Breadcrumb>
    <BreadcrumbList>
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && <BreadcrumbSeparator />}
          <BreadcrumbItem className="min-w-0">
            {item.to ? (
              <BreadcrumbLink asChild>
                <Link to={item.to}>{item.label}</Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </Fragment>
      ))}
    </BreadcrumbList>
  </Breadcrumb>
);
