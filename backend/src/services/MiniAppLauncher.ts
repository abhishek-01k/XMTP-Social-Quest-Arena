import type { Quest } from "../types/Quest";
import type { Group } from "@xmtp/node-sdk";

interface MiniAppConfig {
  questId: string;
  conversationId: string;
  type: string;
  config: any;
  launchedAt: Date;
  url?: string;
  status: 'active' | 'completed' | 'expired';
  participants: string[];
}

export class MiniAppLauncher {
  private activeMiniApps: Map<string, MiniAppConfig> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    console.log("🚀 MiniAppLauncher initialized with base URL:", this.baseUrl);
  }

  /**
   * Launch a mini app for a specific quest
   */
  async launchQuestMiniApp(quest: Quest, conversationId: string, conversation?: Group<any>): Promise<boolean> {
    try {
      console.log(`🎮 Launching mini app for quest: ${quest.title}`);
      
      // Generate unique mini app URL
      const miniAppUrl = this.generateMiniAppUrl(quest, conversationId);
      
      const miniAppConfig: MiniAppConfig = {
        questId: quest.id,
        conversationId,
        type: quest.miniAppConfig.type,
        config: {
          ...quest.miniAppConfig.config,
          title: quest.title,
          description: quest.description,
          difficulty: quest.difficulty,
          duration: quest.duration,
          rewards: quest.rewards,
          participantLimits: quest.participantLimits,
          requirements: quest.requirements,
        },
        launchedAt: new Date(),
        url: miniAppUrl,
        status: 'active',
        participants: [],
      };

      // Store the mini app configuration
      this.activeMiniApps.set(quest.id, miniAppConfig);

      // Send mini app link to the conversation if available
      if (conversation) {
        const miniAppMessage = this.generateMiniAppMessage(quest, miniAppUrl);
        await conversation.send(miniAppMessage);
      }

      // Set up auto-expiration based on quest duration
      this.scheduleAutoExpiration(quest.id, quest.duration);

      console.log(`✅ Mini app launched for quest ${quest.id} at ${miniAppUrl}`);
      return true;
    } catch (error) {
      console.error("❌ Error launching mini app:", error);
      return false;
    }
  }

  /**
   * Generate a unique URL for the quest mini app
   */
  private generateMiniAppUrl(quest: Quest, conversationId: string): string {
    const params = new URLSearchParams({
      questId: quest.id,
      conversationId,
      type: quest.miniAppConfig.type,
      title: encodeURIComponent(quest.title),
    });

    return `${this.baseUrl}/quest/${quest.id}?${params.toString()}`;
  }

  /**
   * Generate a message with mini app link and instructions
   */
  private generateMiniAppMessage(quest: Quest, url: string): string {
    const emoji = this.getQuestEmoji(quest.type);
    const difficultyStars = '⭐'.repeat(this.getDifficultyLevel(quest.difficulty));
    
    return `${emoji} **${quest.title}** ${difficultyStars}

${quest.description}

🎯 **Quest Details:**
• Type: ${quest.type.replace('_', ' ').toUpperCase()}
• Difficulty: ${quest.difficulty.toUpperCase()}
• Duration: ${quest.duration} minutes
• Participants: ${quest.participantLimits.min}-${quest.participantLimits.max}
• XP Reward: ${quest.rewards.xp}

🚀 **Join Quest:** ${url}

React with 🎮 to participate!`;
  }

  /**
   * Get emoji for quest type
   */
  private getQuestEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      'social_challenge': '🤝',
      'knowledge_quest': '🧠',
      'creative_contest': '🎨',
      'community_building': '🏘️',
      'cross_protocol': '🌐',
    };
    return emojiMap[type] || '🎯';
  }

  /**
   * Get difficulty level as number
   */
  private getDifficultyLevel(difficulty: string): number {
    const levelMap: Record<string, number> = {
      'easy': 1,
      'medium': 2,
      'hard': 3,
      'expert': 4,
    };
    return levelMap[difficulty] || 1;
  }

  /**
   * Schedule auto-expiration for a quest
   */
  private scheduleAutoExpiration(questId: string, durationMinutes: number): void {
    setTimeout(() => {
      const miniApp = this.activeMiniApps.get(questId);
      if (miniApp && miniApp.status === 'active') {
        miniApp.status = 'expired';
        console.log(`⏰ Quest ${questId} has expired after ${durationMinutes} minutes`);
      }
    }, durationMinutes * 60 * 1000);
  }

  /**
   * Add participant to a quest
   */
  addParticipant(questId: string, participantInboxId: string): boolean {
    const miniApp = this.activeMiniApps.get(questId);
    if (!miniApp || miniApp.status !== 'active') {
      return false;
    }

    if (!miniApp.participants.includes(participantInboxId)) {
      miniApp.participants.push(participantInboxId);
      console.log(`👤 Added participant ${participantInboxId} to quest ${questId}`);
    }

    return true;
  }

  /**
   * Remove participant from a quest
   */
  removeParticipant(questId: string, participantInboxId: string): boolean {
    const miniApp = this.activeMiniApps.get(questId);
    if (!miniApp) {
      return false;
    }

    const index = miniApp.participants.indexOf(participantInboxId);
    if (index > -1) {
      miniApp.participants.splice(index, 1);
      console.log(`👤 Removed participant ${participantInboxId} from quest ${questId}`);
      return true;
    }

    return false;
  }

  /**
   * Complete a quest and update status
   */
  completeQuest(questId: string, completedBy: string): boolean {
    const miniApp = this.activeMiniApps.get(questId);
    if (!miniApp || miniApp.status !== 'active') {
      return false;
    }

    miniApp.status = 'completed';
    console.log(`🏆 Quest ${questId} completed by ${completedBy}`);
    return true;
  }

  /**
   * Get mini app configuration for a quest
   */
  getMiniAppConfig(questId: string): MiniAppConfig | undefined {
    return this.activeMiniApps.get(questId);
  }

  /**
   * Get mini app URL for a quest
   */
  getMiniAppUrl(questId: string): string | undefined {
    const miniApp = this.activeMiniApps.get(questId);
    return miniApp?.url;
  }

  /**
   * Check if a quest is active
   */
  isQuestActive(questId: string): boolean {
    const miniApp = this.activeMiniApps.get(questId);
    return miniApp?.status === 'active' || false;
  }

  /**
   * Get participants for a quest
   */
  getQuestParticipants(questId: string): string[] {
    const miniApp = this.activeMiniApps.get(questId);
    return miniApp?.participants || [];
  }

  /**
   * Close a mini app when quest is completed or expired
   */
  closeMiniApp(questId: string): boolean {
    const miniApp = this.activeMiniApps.get(questId);
    if (!miniApp) {
      return false;
    }

    miniApp.status = 'expired';
    console.log(`🔒 Mini app closed for quest ${questId}`);
    return true;
  }

  /**
   * Get all active mini apps
   */
  getActiveMiniApps(): MiniAppConfig[] {
    return Array.from(this.activeMiniApps.values()).filter(app => app.status === 'active');
  }

  /**
   * Get all mini apps (active, completed, expired)
   */
  getAllMiniApps(): MiniAppConfig[] {
    return Array.from(this.activeMiniApps.values());
  }

  /**
   * Clean up expired mini apps
   */
  cleanupExpiredMiniApps(): number {
    let cleaned = 0;
    const now = new Date();
    
    for (const [questId, miniApp] of this.activeMiniApps.entries()) {
      const expiredTime = new Date(miniApp.launchedAt.getTime() + (60 * 60 * 1000)); // 1 hour default
      
      if (miniApp.status === 'expired' && now > expiredTime) {
        this.activeMiniApps.delete(questId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired mini apps`);
    }

    return cleaned;
  }
} 