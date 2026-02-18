"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lobby, LobbyConfig } from "@/components/Lobby";
import { GameBoard } from "@/components/GameBoard";
import { TestBoard } from "@/components/TestBoard";

function HomeContent() {
  const [config, setConfig] = useState<LobbyConfig | null>(null);
  const searchParams = useSearchParams();

  if (searchParams.get("test") === "1") {
    return <TestBoard />;
  }

  if (!config) {
    return <Lobby onStart={setConfig} />;
  }

  return <GameBoard config={config} onReset={() => setConfig(null)} />;
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
