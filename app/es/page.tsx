import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Corrige Google Ads desde Claude | NotFair",
  description:
    "Dale a Claude acceso en vivo a Google Ads para diagnosticar problemas, recomendar correcciones y ejecutar cambios solo después de tu aprobación.",
  path: "/es",
});

export default function SpanishHome() {
  return <HomeRouteContent />;
}
