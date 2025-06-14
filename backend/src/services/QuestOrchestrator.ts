import { EventEmitter } from "events";
import type { Client, DecodedMessage } from "@xmtp/node-sdk";
import { Group } from "@xmtp/node-sdk";
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
    
    // Listen to quest events from all Quest Masters
    this.setupQuestMasterListeners();
  }

  /**
   * Set up event listeners for all Quest Masters
   */
  private setupQuestMasterListeners(): void {
    this.questMasters.forEach((questMaster, name) => {
      questMaster.on("questCreated", (quest: Quest, conversationId: string) => {
        this.activeQuests.set(quest.id, quest);
        this.emit("questCreated", quest, conversationId, name);
        console.log(`📋 Quest Orchestrator: Registered quest "${quest.title}" from ${name}`);
      });

      questMaster.on("questCompleted", (completion: QuestCompletion) => {
        this.questHistory.push(completion);
        this.activeQuests.delete(completion.questId);
        this.updateUserProfile(completion);
        this.emit("questCompleted", completion);
        console.log(`🏆 Quest Orchestrator: Quest completed by ${completion.participantInboxId}`);
      });
    });
  }

  /**
   * Get all active quests across all Quest Masters
   */
  getActiveQuests(conversationId?: string): Quest[] {
    const quests = Array.from(this.activeQuests.values());
    if (conversationId) {
      return quests.filter(q => q.conversationId === conversationId && q.status === "active");
    }
    return quests.filter(q => q.status === "active");
  }

  /**
   * Get quest by ID
   */
  getQuestById(questId: string): Quest | undefined {
    return this.activeQuests.get(questId);
  }

  /**
   * Join a quest
   */
  async joinQuest(questId: string, userInboxId: string): Promise<boolean> {
    const quest = this.activeQuests.get(questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    if (quest.status !== "active") {
      throw new Error("Quest is not active");
    }

    if (quest.participants.includes(userInboxId)) {
      return false; // Already joined
    }

    if (quest.participants.length >= quest.participantLimits.max) {
      throw new Error("Quest is full");
    }

    // Add participant
    quest.participants.push(userInboxId);
    this.activeQuests.set(questId, quest);

    // Update user preferences
    const questMaster = this.getQuestMasterForQuest(quest);
    if (questMaster) {
      questMaster.updateUserPreferences(userInboxId, quest.type);
    }

    this.emit("questJoined", { questId, userInboxId, quest });
    console.log(`👥 User ${userInboxId} joined quest "${quest.title}"`);
    
    return true;
  }

  /**
   * Complete a quest
   */
  async completeQuest(
    questId: string, 
    userInboxId: string, 
    result: any
  ): Promise<QuestCompletion> {
    const quest = this.activeQuests.get(questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    if (!quest.participants.includes(userInboxId)) {
      throw new Error("User is not a participant in this quest");
    }

    const questMaster = this.getQuestMasterForQuest(quest);
    if (!questMaster) {
      throw new Error("Quest Master not found for this quest");
    }

    // Complete the quest through the Quest Master
    await questMaster.completeQuest(questId, userInboxId, result);

    // The completion will be handled by the event listener
    const completion = this.questHistory.find(
      c => c.questId === questId && c.participantInboxId === userInboxId
    );

    if (!completion) {
      throw new Error("Quest completion not recorded");
    }

    return completion;
  }

  /**
   * Get user statistics
   */
  getUserStats(userInboxId: string): UserProfile {
    let profile = this.userProfiles.get(userInboxId);
    if (!profile) {
      profile = {
        inboxId: userInboxId,
        level: 1,
        xp: 0,
        preferences: [],
        completedQuests: [],
        socialScore: 0,
        lastActive: new Date(),
      };
      this.userProfiles.set(userInboxId, profile);
    }
    return profile;
  }

  /**
   * Get quest leaderboard
   */
  getLeaderboard(limit: number = 10): UserProfile[] {
    return Array.from(this.userProfiles.values())
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);
  }

  /**
   * Get quest history for a user
   */
  getUserQuestHistory(userInboxId: string): QuestCompletion[] {
    return this.questHistory.filter(c => c.participantInboxId === userInboxId);
  }

  /**
   * Trigger quest creation for a conversation
   */
  async triggerQuestCreation(conversationId: string): Promise<Quest | null> {
    try {
      const conversation = await this.xmtpClient.conversations.getConversationById(conversationId);
      if (!conversation || !(conversation instanceof Group)) {
        throw new Error("Conversation not found or not a group");
      }

      // Get recent messages and members
      const recentMessages = await conversation.messages({ limit: 10 });
      const members = await conversation.members();

      // Select a Quest Master based on conversation analysis
      const selectedQuestMaster = this.selectQuestMaster(recentMessages, members);
      
      if (selectedQuestMaster) {
        const quest = await selectedQuestMaster.analyzeAndCreateQuest(
          conversation,
          recentMessages,
          members
        );

        if (quest) {
          // Send quest announcement to the group
          const announcement = await selectedQuestMaster.generateQuestAnnouncement(quest);
          await conversation.send(announcement);
          return quest;
        }
      }

      return null;
    } catch (error) {
      console.error("Error triggering quest creation:", error);
      return null;
    }
  }

  /**
   * Select appropriate Quest Master based on conversation context
   */
  private selectQuestMaster(
    messages: DecodedMessage[], 
    members: any[]
  ): QuestMaster | null {
    // Simple selection logic - could be enhanced with ML
    const questMasterNames = Array.from(this.questMasters.keys());
    
    // Analyze message content for keywords
    const messageTexts = messages
      .map(m => m.content as string)
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Select based on content analysis
    if (messageTexts.includes("learn") || messageTexts.includes("help") || messageTexts.includes("teach")) {
      return this.questMasters.get("The Mentor") || null;
    }
    
    if (messageTexts.includes("compete") || messageTexts.includes("challenge") || messageTexts.includes("win")) {
      return this.questMasters.get("The Competitor") || null;
    }
    
    if (messageTexts.includes("create") || messageTexts.includes("art") || messageTexts.includes("design")) {
      return this.questMasters.get("The Creator") || null;
    }
    
    if (messageTexts.includes("connect") || messageTexts.includes("network") || messageTexts.includes("community")) {
      return this.questMasters.get("The Connector") || null;
    }
    
    if (messageTexts.includes("protocol") || messageTexts.includes("web3") || messageTexts.includes("blockchain")) {
      return this.questMasters.get("The Explorer") || null;
    }

    // Default to random selection
    const randomIndex = Math.floor(Math.random() * questMasterNames.length);
    return this.questMasters.get(questMasterNames[randomIndex]) || null;
  }

  /**
   * Find the Quest Master that created a specific quest
   */
  private getQuestMasterForQuest(quest: Quest): QuestMaster | null {
    // Since we don't store the creator, we'll need to find it by quest type preference
    for (const [name, questMaster] of this.questMasters) {
      const personality = questMaster.personality;
      if (personality.questTypes.includes(quest.type)) {
        return questMaster;
      }
    }
    return null;
  }

  /**
   * Update user profile after quest completion
   */
  private updateUserProfile(completion: QuestCompletion): void {
    const profile = this.getUserStats(completion.participantInboxId);
    
    // Update XP and level
    profile.xp += completion.rewards.xp;
    profile.level = Math.floor(profile.xp / 100) + 1;
    
    // Add completed quest
    if (!profile.completedQuests.includes(completion.questId)) {
      profile.completedQuests.push(completion.questId);
    }
    
    // Update social score based on quest type and performance
    profile.socialScore += this.calculateSocialScoreIncrease(completion);
    
    // Update last active
    profile.lastActive = new Date();
    
    this.userProfiles.set(completion.participantInboxId, profile);
  }

  /**
   * Calculate social score increase based on quest completion
   */
  private calculateSocialScoreIncrease(completion: QuestCompletion): number {
    const quest = this.activeQuests.get(completion.questId);
    if (!quest) return 5; // Default increase

    let increase = 5;
    
    // Bonus for different quest types
    switch (quest.type) {
      case "community_building":
        increase += 10;
        break;
      case "social_challenge":
        increase += 8;
        break;
      case "knowledge_quest":
        increase += 6;
        break;
      case "creative_contest":
        increase += 7;
        break;
      case "cross_protocol":
        increase += 9;
        break;
    }
    
    // Bonus for difficulty
    switch (quest.difficulty) {
      case "expert":
        increase += 15;
        break;
      case "hard":
        increase += 10;
        break;
      case "medium":
        increase += 5;
        break;
      case "easy":
        increase += 2;
        break;
    }
    
    return increase;
  }

  /**
   * Clean up expired quests
   */
  cleanupExpiredQuests(): void {
    const now = new Date();
    const expiredQuests: string[] = [];
    
    this.activeQuests.forEach((quest, questId) => {
      if (new Date(quest.expiresAt) < now) {
        quest.status = "expired";
        expiredQuests.push(questId);
      }
    });
    
    expiredQuests.forEach(questId => {
      this.activeQuests.delete(questId);
      this.emit("questExpired", questId);
    });
    
    if (expiredQuests.length > 0) {
      console.log(`🕐 Quest Orchestrator: Cleaned up ${expiredQuests.length} expired quests`);
    }
  }

  /**
   * Get quest analytics
   */
  getQuestAnalytics() {
    const totalQuests = this.activeQuests.size + this.questHistory.length;
    const completedQuests = this.questHistory.length;
    const activeUsers = new Set(this.questHistory.map(c => c.participantInboxId)).size;
    
    return {
      totalQuests,
      activeQuests: this.activeQuests.size,
      completedQuests,
      activeUsers,
      averageXpPerQuest: completedQuests > 0 
        ? this.questHistory.reduce((sum, c) => sum + c.rewards.xp, 0) / completedQuests 
        : 0,
      questTypeDistribution: this.getQuestTypeDistribution(),
    };
  }

  /**
   * Get distribution of quest types
   */
  private getQuestTypeDistribution() {
    const distribution: Record<string, number> = {};
    
    this.activeQuests.forEach(quest => {
      distribution[quest.type] = (distribution[quest.type] || 0) + 1;
    });
    
    this.questHistory.forEach(completion => {
      const quest = this.activeQuests.get(completion.questId);
      if (quest) {
        distribution[quest.type] = (distribution[quest.type] || 0) + 1;
      }
    });
    
    return distribution;
  }
} 