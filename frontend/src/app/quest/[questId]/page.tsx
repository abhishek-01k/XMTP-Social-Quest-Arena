"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import { useXMTP } from "@/context/xmtp-context";

interface QuestDetails {
  questId: string;
  conversationId: string;
  type: string;
  config: {
    title: string;
    description: string;
    difficulty: string;
    duration: number;
    rewards: {
      xp: number;
      tokens?: number;
      badges?: string[];
    };
    participantLimits: {
      min: number;
      max: number;
    };
    requirements?: string[];
  };
  launchedAt: string;
  url: string;
  status: 'active' | 'completed' | 'expired';
  participants: string[];
}

interface QuestResponse {
  quest: QuestDetails;
  participants: string[];
  isActive: boolean;
  url: string;
}

export default function QuestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { client } = useXMTP();
  
  const questId = params?.questId as string;
  const conversationId = searchParams?.get('conversationId');
  const questType = searchParams?.get('type');
  const questTitle = searchParams?.get('title');
  
  const [questDetails, setQuestDetails] = useState<QuestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isParticipant, setIsParticipant] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch quest details
  useEffect(() => {
    const fetchQuestDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/quests/${questId}`, {
          headers: {
            'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quest details');
        }

        const data: QuestResponse = await response.json();
        setQuestDetails(data);
        
        // Check if current user is a participant
        if (client?.inboxId) {
          setIsParticipant(data.participants.includes(client.inboxId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (questId) {
      fetchQuestDetails();
    }
  }, [questId, client?.inboxId]);

  // Join quest
  const handleJoinQuest = async () => {
    if (!client?.inboxId || !questDetails) return;
    
    try {
      setActionLoading(true);
      const response = await fetch(`/api/quests/${questId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
        },
        body: JSON.stringify({ inboxId: client.inboxId }),
      });

      if (response.ok) {
        setIsParticipant(true);
        // Refresh quest details
        const updatedResponse = await fetch(`/api/quests/${questId}`, {
          headers: {
            'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
          },
        });
        if (updatedResponse.ok) {
          const updatedData: QuestResponse = await updatedResponse.json();
          setQuestDetails(updatedData);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to join quest');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join quest');
    } finally {
      setActionLoading(false);
    }
  };

  // Leave quest
  const handleLeaveQuest = async () => {
    if (!client?.inboxId || !questDetails) return;
    
    try {
      setActionLoading(true);
      const response = await fetch(`/api/quests/${questId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
        },
        body: JSON.stringify({ inboxId: client.inboxId }),
      });

      if (response.ok) {
        setIsParticipant(false);
        // Refresh quest details
        const updatedResponse = await fetch(`/api/quests/${questId}`, {
          headers: {
            'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
          },
        });
        if (updatedResponse.ok) {
          const updatedData: QuestResponse = await updatedResponse.json();
          setQuestDetails(updatedData);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to leave quest');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave quest');
    } finally {
      setActionLoading(false);
    }
  };

  // Complete quest
  const handleCompleteQuest = async () => {
    if (!client?.inboxId || !questDetails) return;
    
    try {
      setActionLoading(true);
      const response = await fetch(`/api/quests/${questId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
        },
        body: JSON.stringify({ 
          inboxId: client.inboxId,
          result: { completed: true, timestamp: new Date().toISOString() }
        }),
      });

      if (response.ok) {
        // Refresh quest details
        const updatedResponse = await fetch(`/api/quests/${questId}`, {
          headers: {
            'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || 'xmtp-social-quest-arena-secret-key-2024',
          },
        });
        if (updatedResponse.ok) {
          const updatedData: QuestResponse = await updatedResponse.json();
          setQuestDetails(updatedData);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to complete quest');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete quest');
    } finally {
      setActionLoading(false);
    }
  };

  // Get quest type emoji
  const getQuestEmoji = (type: string) => {
    const emojiMap: Record<string, string> = {
      'social_challenge': '🤝',
      'knowledge_quest': '🧠',
      'creative_contest': '🎨',
      'community_building': '🏘️',
      'cross_protocol': '🌐',
    };
    return emojiMap[type] || '🎯';
  };

  // Get difficulty stars
  const getDifficultyStars = (difficulty: string) => {
    const levelMap: Record<string, number> = {
      'easy': 1,
      'medium': 2,
      'hard': 3,
      'expert': 4,
    };
    const level = levelMap[difficulty] || 1;
    return '⭐'.repeat(level);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'completed': return 'text-blue-400';
      case 'expired': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <SafeAreaContainer>
        <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p>Loading quest details...</p>
            </div>
          </div>
        </div>
      </SafeAreaContainer>
    );
  }

  if (error || !questDetails) {
    return (
      <SafeAreaContainer>
        <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-center">
              <div className="text-red-400 text-6xl mb-4">❌</div>
              <h2 className="text-xl font-bold mb-2">Quest Not Found</h2>
              <p className="text-gray-400 mb-4">{error || 'This quest may have expired or been removed.'}</p>
              <Button 
                onClick={() => window.history.back()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </SafeAreaContainer>
    );
  }

  const quest = questDetails.quest;

  return (
    <SafeAreaContainer>
      <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <Button 
            onClick={() => window.history.back()}
            className="bg-gray-800 hover:bg-gray-700 text-sm px-3 py-2"
          >
            ← Back
          </Button>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quest.status)}`}>
            {quest.status.toUpperCase()}
          </div>
        </div>

        {/* Quest Details */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-6">
            {/* Quest Header */}
            <div className="text-center">
              <div className="text-6xl mb-2">{getQuestEmoji(quest.type)}</div>
              <h1 className="text-2xl font-bold text-white mb-2">{quest.config.title}</h1>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-yellow-400">{getDifficultyStars(quest.config.difficulty)}</span>
                <span className="text-gray-400">•</span>
                <span className="text-purple-400">{quest.config.difficulty.toUpperCase()}</span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Description</h3>
              <p className="text-gray-300">{quest.config.description}</p>
            </div>

            {/* Quest Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-1">Duration</h4>
                <p className="text-white">{quest.config.duration} minutes</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-1">XP Reward</h4>
                <p className="text-yellow-400 font-bold">{quest.config.rewards.xp} XP</p>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">
                Participants ({questDetails.participants.length}/{quest.config.participantLimits.max})
              </h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, (questDetails.participants.length / quest.config.participantLimits.max) * 100)}%` 
                    }}
                  ></div>
                </div>
                <span className="text-sm text-gray-400">
                  {questDetails.participants.length}/{quest.config.participantLimits.max}
                </span>
              </div>
            </div>

            {/* Requirements */}
            {quest.config.requirements && quest.config.requirements.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-2">Requirements</h4>
                <ul className="space-y-1">
                  {quest.config.requirements.map((req, index) => (
                    <li key={index} className="text-gray-300 text-sm flex items-center gap-2">
                      <span className="text-purple-400">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rewards */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Rewards</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Experience Points</span>
                  <span className="text-yellow-400 font-bold">{quest.config.rewards.xp} XP</span>
                </div>
                {quest.config.rewards.tokens && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Tokens</span>
                    <span className="text-green-400 font-bold">{quest.config.rewards.tokens}</span>
                  </div>
                )}
                {quest.config.rewards.badges && quest.config.rewards.badges.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Badges</span>
                    <div className="flex gap-1">
                      {quest.config.rewards.badges.map((badge, index) => (
                        <span key={index} className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {client && quest.status === 'active' && (
          <div className="p-4 border-t border-gray-800">
            <div className="space-y-3">
              {!isParticipant ? (
                <Button
                  onClick={handleJoinQuest}
                  disabled={actionLoading || questDetails.participants.length >= quest.config.participantLimits.max}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600"
                >
                  {actionLoading ? 'Joining...' : 'Join Quest 🎮'}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleCompleteQuest}
                    disabled={actionLoading}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading ? 'Completing...' : 'Complete Quest 🏆'}
                  </Button>
                  <Button
                    onClick={handleLeaveQuest}
                    disabled={actionLoading}
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    {actionLoading ? 'Leaving...' : 'Leave Quest'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {quest.status === 'completed' && (
          <div className="p-4 border-t border-gray-800">
            <div className="text-center text-green-400 font-semibold">
              🏆 Quest Completed!
            </div>
          </div>
        )}

        {quest.status === 'expired' && (
          <div className="p-4 border-t border-gray-800">
            <div className="text-center text-red-400 font-semibold">
              ⏰ Quest Expired
            </div>
          </div>
        )}
      </div>
    </SafeAreaContainer>
  );
} 