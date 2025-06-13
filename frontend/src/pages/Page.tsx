"use client";

import { useEffect, useState } from "react";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Header } from "@/components/Header";
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import QuestDashboard from "@/components/QuestDashboard";
import { useXMTP } from "@/context/xmtp-context";
import BotChat from "@/examples/BotChat";
import ConnectionInfo from "@/examples/ConnectionInfo";
import GroupChat from "@/examples/GroupChat";
import WalletConnection from "@/examples/WalletConnection";

export default function QuestArenaPage() {
  const { client, initializing, disconnect } = useXMTP();
  const [isConnected, setIsConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [activeTab, setActiveTab] = useState<"quests" | "chat" | "bot">("quests");

  // Mark as mounted on client-side
  useEffect(() => {
    setMounted(true);

    // Add a safety timeout
    const timeoutId = setTimeout(() => {
      setShowLoader(false);
    }, 5000); // Reduced to 5 seconds for better UX

    return () => clearTimeout(timeoutId);
  }, []);

  // Update loader state based on initializing
  useEffect(() => {
    setShowLoader(initializing);
  }, [initializing]);

  // Show loader while not mounted
  if (!mounted) {
    return (
      <SafeAreaContainer>
        <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
          <FullPageLoader />
        </div>
      </SafeAreaContainer>
    );
  }

  return (
    <SafeAreaContainer>
      <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
        <Header isConnected={isConnected || !!client} />

        {showLoader ? (
          <FullPageLoader />
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex flex-col gap-4 px-4 py-4">
              <ConnectionInfo onConnectionChange={setIsConnected} />

              {!client && <WalletConnection />}

              {client && (
                <>
                  {/* Tab Navigation */}
                  <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                    <button
                      onClick={() => setActiveTab("quests")}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "quests"
                          ? "bg-purple-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      🎯 Quests
                    </button>
                    <button
                      onClick={() => setActiveTab("chat")}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "chat"
                          ? "bg-purple-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      💬 Group Chat
                    </button>
                    <button
                      onClick={() => setActiveTab("bot")}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "bot"
                          ? "bg-purple-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      🤖 Bot Chat
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Tab Content */}
            {client && (
              <div className="flex-1 overflow-auto px-4 pb-4">
                {activeTab === "quests" && <QuestDashboard />}
                
                {activeTab === "chat" && (
                  <div className="h-full">
                    <GroupChat />
                  </div>
                )}
                
                {activeTab === "bot" && (
                  <div className="h-full">
                    <BotChat />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </SafeAreaContainer>
  );
}
