"use client";

import dynamic from "next/dynamic";
import { FullPageLoader } from "@/components/FullPageLoader";

// Dynamically import the ExamplePage with SSR disabled
const ExamplePageNoSSR = dynamic(() => import("@/pages/page"), {
  ssr: false,
  loading: () => <FullPageLoader />,
});

export default function ClientPage() {
  return <ExamplePageNoSSR />;
}
