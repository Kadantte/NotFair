import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Corriger Google Ads depuis Claude | NotFair",
  description:
    "Donnez à Claude un accès Google Ads en direct pour diagnostiquer les problèmes, recommander des corrections et exécuter les changements seulement après approbation.",
  path: "/fr",
});

export default function FrenchHome() {
  return <HomeRouteContent />;
}
