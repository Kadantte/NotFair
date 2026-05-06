import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads aus Claude korrigieren | NotFair",
  description:
    "Geben Sie Claude Live-Zugriff auf Google Ads, um Probleme zu diagnostizieren, Korrekturen zu empfehlen und Änderungen erst nach Freigabe auszuführen.",
  path: "/de",
});

export default function GermanHome() {
  return <HomeRouteContent />;
}
