import { z } from "zod";

// Quest Types Schema
export const QuestSchema = z.object({
  id: z.string(),
  type: z.enum([
    "social_challenge",
    "knowledge_quest", 
    "creative_contest",
    "community_building",
    "cross_protocol"
  ]),
  title: z.string(),
  description: z.string(),
  difficulty: z.enum(["easy", "medium", "hard", "expert"]),
  duration: z.number(), // in minutes
  participantLimits: z.object({
    min: z.number(),
    max: z.number(),
  }),
  rewards: z.object({
    xp: z.number(),
    tokens: z.number().optional(),
    badges: z.array(z.string()).optional(),
  }),
  requirements: z.array(z.string()).optional(),
  miniAppConfig: z.object({
    type: z.enum(["dashboard", "game", "poll", "leaderboard", "gallery"]),
    config: z.record(z.any()),
  }),
  conversationId: z.string(),
  createdAt: z.date().default(() => new Date()),
  expiresAt: z.date(),
  status: z.enum(["active", "completed", "expired"]).default("active"),
  participants: z.array(z.string()).default([]),
});

export const UserProfileSchema = z.object({
  inboxId: z.string(),
  level: z.number().default(1),
  xp: z.number().default(0),
  preferences: z.array(z.string()).default([]),
  completedQuests: z.array(z.string()).default([]),
  socialScore: z.number().default(0),
  lastActive: z.date().default(() => new Date()),
});

export const QuestCompletionSchema = z.object({
  questId: z.string(),
  participantInboxId: z.string(),
  completedAt: z.date().default(() => new Date()),
  result: z.any(),
  rewards: z.object({
    xp: z.number(),
    tokens: z.number().optional(),
    badges: z.array(z.string()).optional(),
  }),
  newLevel: z.number(),
});

export type Quest = z.infer<typeof QuestSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type QuestCompletion = z.infer<typeof QuestCompletionSchema>;

export interface QuestMasterPersonality {
  name: string;
  description: string;
  questTypes: Quest["type"][];
  style: "encouraging" | "competitive" | "creative" | "analytical" | "adventurous";
  systemPrompt: string;
} 