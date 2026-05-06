import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Corrija Google Ads pelo Claude | NotFair",
  description:
    "Dê ao Claude acesso ao vivo ao Google Ads para diagnosticar problemas, recomendar correções e executar mudanças somente depois da aprovação.",
  path: "/pt-BR",
});

export default function BrazilianPortugueseHome() {
  return <HomeRouteContent />;
}
