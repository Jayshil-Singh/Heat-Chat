import { Metadata } from "next";
import { DiscoverPageContent } from "@/components/discover/discover-page";

export const metadata: Metadata = {
  title: "Discover People | Heat Chat",
  description: "Find and connect with people who have opted into Heat Chat discovery.",
};

export default function DiscoverPage() {
  return <DiscoverPageContent />;
}
