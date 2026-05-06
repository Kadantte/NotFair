import { redirect } from "next/navigation";

export function generateStaticParams() {
  return [];
}

export default function VerticalAuditRoute() {
  redirect("/connect");
}
