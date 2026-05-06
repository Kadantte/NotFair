import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Исправляйте Google Ads из Claude | NotFair",
  description:
    "Дайте Claude прямой доступ к Google Ads, чтобы диагностировать проблемы, рекомендовать исправления и выполнять изменения только после вашего одобрения.",
  path: "/ru",
});

export default function RussianHome() {
  return <HomeRouteContent />;
}
