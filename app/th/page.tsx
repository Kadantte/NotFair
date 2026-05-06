import { HomeRouteContent } from "@/components/marketing/home-route";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "แก้ Google Ads จาก Claude | NotFair",
  description:
    "ให้ Claude เข้าถึง Google Ads แบบสดเพื่อวิเคราะห์ปัญหา แนะนำวิธีแก้ และเปลี่ยนแคมเปญหลังจากคุณอนุมัติเท่านั้น",
  path: "/th",
});

export default function ThaiHome() {
  return <HomeRouteContent />;
}
