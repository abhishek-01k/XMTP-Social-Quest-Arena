import type { Client, Group, DecodedMessage } from "@xmtp/node-sdk";
import { EventEmitter } from "events";
import type { QuestMaster } from "../agents/QuestMaster";
import type { Quest, UserProfile, QuestCompletion } from "../types/Quest";

export class QuestOrchestrator extends EventEmitter {
  private questMasters: Map<string, QuestMaster>;
  private xmtpClient: Client;
  private activeQuests: Map<string, Quest> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private conversationAnalytics: Map<string, any> = new Map();
  private questHistory: QuestCompletion[] = [];

  constructor(questMasters: Map<string, QuestMaster>, xmtpClient: Client) {
    super();
    this.questMasters = questMasters;
    this.xmtpClient = xmtpClient;
    
    // Listen to quest master events
    this.setupQuestMasterListeners();
  }

  private setupQuestMasterListeners(): void {
    this.questMasters.forEach((questMaster, name) => {
      questMaster.on("questCreated", (quest: Quest, conversationId: string) => {
        this.activeQuests.set(quest.id, quest);
        this.emit("questCreated", quest, conversationId, name);
      });

      questMaster.on("questCompleted", (completion: QuestCompletion) => {
        this.questHistory.push(completion);
        this.activeQuests.delete(completion.questId);
        this.emit("questCompleted", completion);
      });
    });
  }

  /**
   * Determine if a quest should be created based on conversation activity
   */
  async shouldCreateQuest(
    conversation: Group,
    message: DecodedMessage
  ): Promise<boolean> {
    const conversationId = conversation.id;
    
    // Get conversation analytics
    const analytics = await this.getConversationAnalytics(conversationId);
    
    // Check if there's already an active quest for this conversation
    const hasActiveQuest = Array.from(this.activeQuests.values())
      .some(quest => quest.conversationId === conversationId && quest.status === "active");
    
    if (hasActiveQuest) {
      return false;
    }

    // Quest creation criteria
    const criteria = {
      messagesSinceLastQuest: analytics.messagesSinceLastQuest || 0,
      activeUsers: analytics.activeUsers || 0,
      engagementLevel: analytics.engagementLevel || 0,
      timeSinceLastQuest: analytics.timeSinceLastQuest || 0,
    };

    // Create quest if:
    // - At least 10 messages since last quest
    // - At least 2 active users
    // - High engagement (>0.5)
    // - At least 30 minutes since last quest
    return (
      criteria.messagesSinceLastQuest >= 10 &&
      criteria.activeUsers >= 2 &&
      criteria.engagementLevel > 0.5 &&
      criteria.timeSinceLastQuest >= 30 * 60 * 1000 // 30 minutes in ms
    );
  }

  /**
   * Create a quest for a specific conversation
   */
  async createQuestForConversation(
    conversation: Group,
    specificQuestMaster?: QuestMaster
  ): Promise<Quest | null> {
    try {
      // Select appropriate quest master
      const questMaster = specificQuestMaster || this.selectQuestMaster(conversation);
      
      if (!questMaster) {
        console.error("No suitable Quest Master found");
        return null;
      }

      // Get recent messages and members
      const messages = await conversation.messages({ limit: 20 });
      const members = await conversation.members();

      // Create quest
      const quest = await questMaster.analyzeAndCreateQuest(
        conversation,
        messages,
        members
      );

      if (quest) {
        // Send quest announcement to the group
        const announcement = await questMaster.generateQuestAnnouncement(quest);
        await conversation.send(announcement);
        
        // Update analytics
        this.updateConversationAnalytics(conversation.id, {
          lastQuestCreated: new Date(),
          messagesSinceLastQuest: 0,
        });

        console.log(`🎯 Quest "${quest.title}" created for conversation ${conversation.id}`);
      }

      return quest;
    } catch (error) {
      console.error("Error creating quest:", error);
      return null;
    }
  }

  /**
   * Select the most appropriate Quest Master for a conversation
   */
  selectQuestMaster(conversation: Group): QuestMaster | null {
    // For now, select randomly - could be enhanced with ML
    const questMasterArray = Array.from(this.questMasters.values());
    if (questMasterArray.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * questMasterArray.length);
    return questMasterArray[randomIndex];
  }

  /**
   * Handle user joining a quest
   */
  async joinQuest(questId: string, userInboxId: string): Promise<boolean> {
    const quest = this.activeQuests.get(questId);
    if (!quest) return false;

    // Check if user is already participating
    if (quest.participants.includes(userInboxId)) {
      return false;
    }

    // Check participant limits
    if (quest.participants.length >= quest.participantLimits.max) {
      return false;
    }

    // Add user to quest
    quest.participants.push(userInboxId);
    this.activeQuests.set(questId, quest);

    // Update user profile
    const userProfile = this.getUserProfile(userInboxId);
    this.userProfiles.set(userInboxId, userProfile);

    // Notify conversation
    const conversation = await this.xmtpClient.conversations.getConversationById(quest.conversationId);
    if (conversation) {
      await conversation.send(`🎮 ${userInboxId.slice(0, 8)}... joined the quest "${quest.title}"!`);
    }

    this.emit("questJoined", { questId, userInboxId });
    return true;
  }

  /**
   * Handle quest completion
   */
  async completeQuest(
    questId: string, 
    userInboxId: string, 
    result: any
  ): Promise<QuestCompletion | null> {
    const quest = this.activeQuests.get(questId);
    if (!quest || !quest.participants.includes(userInboxId)) {
      return null;
    }

    // Find the appropriate quest master
    const questMaster = Array.from(this.questMasters.values())
      .find(qm => qm.getActiveQuests().some(q => q.id === questId));

    if (questMaster) {
      await questMaster.completeQuest(questId, userInboxId, result);
    }

    // Create completion record
    const completion: QuestCompletion = {
      questId,
      participantInboxId: userInboxId,
      completedAt: new Date(),
      result,
      rewards: quest.rewards,
      newLevel: this.getUserProfile(userInboxId).level,
    };

    this.questHistory.push(completion);

    // Notify conversation
    const conversation = await this.xmtpClient.conversations.getConversationById(quest.conversationId);
    if (conversation) {
      await conversation.send(
        `🏆 ${userInboxId.slice(0, 8)}... completed "${quest.title}"! ` +
        `Earned ${quest.rewards.xp} XP${quest.rewards.tokens ? ` and ${quest.rewards.tokens} tokens` : ""}!`
      );
    }

    return completion;
  }

  /**
   * Get conversation analytics
   */
  private async getConversationAnalytics(conversationId: string): Promise<any> {
    if (!this.conversationAnalytics.has(conversationId)) {
      this.conversationAnalytics.set(conversationId, {
        messagesSinceLastQuest: 0,
        activeUsers: 0,
        engagementLevel: 0,
        timeSinceLastQuest: 0,
        lastQuestCreated: null,
      });
    }

    const analytics = this.conversationAnalytics.get(conversationId);
    
    // Update analytics with fresh data
    try {
      const conversation = await this.xmtpClient.conversations.getConversationById(conversationId);
      if (conversation) {
        const messages = await conversation.messages({ limit: 50 });
        const members = await (conversation as Group).members();
        
        // Calculate active users (users who sent messages in last hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentMessages = messages.filter(m => m.sentAt > oneHourAgo);
        const activeUsers = new Set(recentMessages.map(m => m.senderInboxId)).size;
        
        // Calculate engagement level
        const engagementLevel = members.length > 0 ? activeUsers / members.length : 0;
        
        // Update analytics
        analytics.activeUsers = activeUsers;
        analytics.engagementLevel = engagementLevel;
        
        if (analytics.lastQuestCreated) {
          analytics.timeSinceLastQuest = Date.now() - analytics.lastQuestCreated.getTime();
        }
      }
    } catch (error) {
      console.error("Error updating conversation analytics:", error);
    }

    return analytics;
  }

  /**
   * Update conversation analytics
   */
  private updateConversationAnalytics(conversationId: string, updates: any): void {
    const current = this.conversationAnalytics.get(conversationId) || {};
    this.conversationAnalytics.set(conversationId, { ...current, ...updates });
  }

  /**
   * Get or create user profile
   */
  private getUserProfile(inboxId: string): UserProfile {
    if (!this.userProfiles.has(inboxId)) {
      this.userProfiles.set(inboxId, {
        inboxId,
        level: 1,
        xp: 0,
        preferences: [],
        completedQuests: [],
        socialScore: 0,
        lastActive: new Date(),
      });
    }
    return this.userProfiles.get(inboxId)!;
  }

  /**
   * Get user statistics
   */
  getUserStats(inboxId: string) {
    const profile = this.getUserProfile(inboxId);
    const completedQuests = this.questHistory.filter(
      completion => completion.participantInboxId === inboxId
    );
    
    return {
      level: profile.level,
      xp: profile.xp,
      questsCompleted: completedQuests.length,
      socialScore: profile.socialScore,
      recentAchievements: completedQuests.slice(-5),
    };
  }

  /**
   * Get active quests
   */
  getActiveQuests(): Quest[] {
    return Array.from(this.activeQuests.values());
  }

  /**
   * Notify about member changes
   */
  notifyMemberChange(conversationId: string, action: "added" | "removed", inboxId: string): void {
    const analytics = this.conversationAnalytics.get(conversationId);
    if (analytics) {
      // Reset some analytics when membership changes
      analytics.engagementLevel = 0;
      this.conversationAnalytics.set(conversationId, analytics);
    }
    
    this.emit("memberChange", { conversationId, action, inboxId });
  }

  /**
   * Clean up expired quests
   */
  cleanupExpiredQuests(): void {
    const now = new Date();
    const expiredQuests: string[] = [];

    this.activeQuests.forEach((quest, questId) => {
      if (quest.expiresAt < now) {
        expiredQuests.push(questId);
      }
    });

    expiredQuests.forEach(questId => {
      const quest = this.activeQuests.get(questId);
      if (quest) {
        quest.status = "expired";
        this.activeQuests.delete(questId);
        this.emit("questExpired", quest);
      }
    });

    if (expiredQuests.length > 0) {
      console.log(`🧹 Cleaned up ${expiredQuests.length} expired quests`);
    }
  }
} 