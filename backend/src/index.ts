/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Client,
  Group,
  type XmtpEnv,
  type DecodedMessage,
} from "@xmtp/node-sdk";
import cors from "cors";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import {
  appendToEnv,
  createSigner,
  defaultInboxes,
  getDbPath,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "./helper";
import { QuestMaster, QUEST_MASTER_PERSONALITIES } from "./agents/QuestMaster";
import { QuestOrchestrator } from "./services/QuestOrchestrator";
import { MiniAppLauncher } from "./services/MiniAppLauncher";
import type { Quest } from "./types/Quest";

const { 
  WALLET_KEY, 
  API_SECRET_KEY, 
  ENCRYPTION_KEY, 
  XMTP_ENV, 
  PORT,
  OPENAI_API_KEY 
} = validateEnvironment([
  "WALLET_KEY",
  "API_SECRET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "PORT",
  "OPENAI_API_KEY",
]);

let GROUP_ID = process.env.GROUP_ID;

// Global XMTP client
let xmtpClient: Client;

// AI Quest Master instances
let questMasters: Map<string, QuestMaster> = new Map();
let questOrchestrator: QuestOrchestrator;
let miniAppLauncher: MiniAppLauncher;

// WebSocket server for real-time updates
let wss: WebSocketServer;

// Initialize Quest Masters with different personalities
const initializeQuestMasters = () => {
  questMasters.clear();
  
  QUEST_MASTER_PERSONALITIES.forEach((personality) => {
    const questMaster = new QuestMaster(personality, OPENAI_API_KEY);
    questMasters.set(personality.name, questMaster);
    
    // Listen for quest events
    questMaster.on("questCreated", async (quest: Quest, conversationId: string) => {
      console.log(`🎯 Quest "${quest.title}" created by ${personality.name} for conversation ${conversationId}`);
      broadcastToClients({
        type: "questCreated",
        data: { quest, conversationId, questMaster: personality.name }
      });
      
      // Get the conversation object to pass to MiniAppLauncher
      try {
        const conversation = await xmtpClient.conversations.getConversationById(conversationId);
        if (conversation && conversation instanceof Group) {
          // Launch mini app for the quest with conversation object
          await miniAppLauncher.launchQuestMiniApp(quest, conversationId, conversation as Group<any>);
        } else {
          // Fallback without conversation object
          await miniAppLauncher.launchQuestMiniApp(quest, conversationId);
        }
      } catch (error) {
        console.error("❌ Error launching mini app:", error);
        // Fallback without conversation object
        await miniAppLauncher.launchQuestMiniApp(quest, conversationId);
      }
    });
    
    questMaster.on("questCompleted", (completion) => {
      console.log(`🏆 Quest completed by ${completion.participantInboxId}`);
      broadcastToClients({
        type: "questCompleted", 
        data: completion
      });
    });
  });
  
  console.log(`✅ Initialized ${questMasters.size} Quest Masters`);
};

// Initialize XMTP client and services
const initializeXmtpClient = async () => {
  // Create wallet signer and encryption key
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
  const dbPath = getDbPath(XMTP_ENV);
  
  // Create XMTP client
  xmtpClient = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath,
  });

  console.log("📡 XMTP Client initialized with inbox ID:", xmtpClient.inboxId);
  await xmtpClient.conversations.sync();
  
  let conversation: Group<any> | undefined;
  console.log("🆔 GROUP_ID", GROUP_ID);
  
  if (GROUP_ID) {
    const conv = await xmtpClient.conversations.getConversationById(GROUP_ID);
    conversation = conv instanceof Group ? conv as Group<any> : undefined;
  } else if (defaultInboxes.length > 0) {
    const newGroup = await xmtpClient.conversations.newGroup(defaultInboxes);
    conversation = newGroup as Group<any>;
    if (conversation) {
      console.log("🆕 New group created:", conversation.id);
      GROUP_ID = conversation.id;
      appendToEnv("GROUP_ID", GROUP_ID);
    }
  } else {
    console.log("⚠️ No default group created - will create groups dynamically");
  }
  
  if (!conversation && GROUP_ID) {
    console.error("❌ Failed to initialize XMTP client - conversation not found");
    return;
  }

  if (conversation) {
    await conversation.updateName("XMTP Social Quest Arena");

    const message = await conversation.send("🎮 Welcome to the Social Quest Arena! AI Quest Masters are standing by to create amazing challenges for our community!");
    console.log("💬 Welcome message sent:", message);

    await xmtpClient.conversations.sync();

    const isAdmin = conversation.isSuperAdmin(xmtpClient.inboxId);
    await conversation.sync();
    console.log("👑 Client is admin of the group:", isAdmin);
  }
  
  // Initialize services
  questOrchestrator = new QuestOrchestrator(questMasters, xmtpClient);
  miniAppLauncher = new MiniAppLauncher(process.env.NEXT_PUBLIC_URL || 'http://localhost:3000');
  
  // Start monitoring conversations for quest opportunities
  void startConversationMonitoring();
};

// XMTP Service Functions
const removeUserFromDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    await conversation.sync();
    console.log("conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    if (isMember) {
      await conversation.sync();
      await (conversation as Group).removeMembers([newUserInboxId]);
      console.log("Removed user from group");
    } else {
      console.log("User not in group");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error adding user to default group chat:", error);
    return false;
  }
};
// XMTP Service Functions
const addUserToDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    await conversation.sync();
    console.log("conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    if (!isMember) {
      await conversation.sync();
      await (conversation as Group).addMembers([newUserInboxId]);
      await conversation.send("added to group");
      console.log("Added user to group");
    } else {
      console.log("User already in group");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error adding user to default group chat:", error);
    return false;
  }
};

// API Middleware
const validateApiSecret = (req: Request, res: Response, next: () => void) => {
  console.log("🔑 validateApiSecret called for path:", req.path);
  const apiSecret = req.headers["x-api-secret"];
  if (apiSecret !== API_SECRET_KEY) {
    console.log("❌ Invalid API secret:", apiSecret);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  console.log("✅ API secret validated successfully");
  next();
};

// Express App Setup
const app = express();
const server = createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Add global request logger
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/health", (req, res) => {
  console.log("✅ HEALTH CHECK ENDPOINT HIT");
  res.json({ status: "ok" });
});

app.post(
  "/api/xmtp/add-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log(
        "Adding user to default group chat with id:",
        GROUP_ID,
        "and inboxId:",
        inboxId,
      );
      const result = await addUserToDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully added user to default group chat"
          : "You are already in the group",
      });
      console.log("⚪ Response sent for add-inbox");
    } catch (error) {
      console.error("Error adding user to default group chat:", error);
      res.status(500).json({
        message: "You are not in the group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

app.post(
  "/api/xmtp/remove-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log("Removing user from group with inboxId:", inboxId);
      const result = await removeUserFromDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully removed user from default group chat"
          : "Failed to remove user from default group chat",
      });
      console.log("⚪ Response sent for remove-inbox");
    } catch (error) {
      console.error("Error removing user from default group chat:", error);
      res.status(500).json({
        message: "Failed to remove user from default group chat",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
app.get(
  "/api/xmtp/get-group-id",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      console.log("🔵 Inside get-group-id async block");
      console.log("Current client inbox ID:", req.query.inboxId);
      console.log("Looking for group with ID:", GROUP_ID);
      const conversation = await xmtpClient.conversations.getConversationById(
        GROUP_ID ?? "",
      );
      console.log("🟢 Conversation fetched:", conversation?.id);
      if (!conversation) {
        console.log("⚠️ No conversation found");
        return res.status(404).json({ error: "Group not found" });
      }
      await conversation.sync();
      console.log("🟡 Conversation synced");

      const groupMembers = await (conversation as Group).members();
      const messages = await (conversation as Group).messages();
      const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;

      const isMember = groupMembers.some(
        (member) => member.inboxId === req.query.inboxId,
      );

      console.log("🟣 isMember check complete:", isMember);
      console.log("🟣 Client inbox ID:", req.query.inboxId);

      // Format member information for the response
      const formattedMembers = groupMembers.map((member) => ({
        inboxId: member.inboxId,
        // Only include the first and last characters of the wallet address for privacy
        displayInboxId: `${member.inboxId.slice(0, 6)}...${member.inboxId.slice(-6)}`,
        isAdmin: (conversation as Group).isAdmin(member.inboxId),
        isSuperAdmin: (conversation as Group).isSuperAdmin(member.inboxId),
      }));

      // Format last message for the response
      const formattedLastMessage = lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            sentAt: lastMessage.sentAt,
            // Use sender or inboxId depending on what's available
            senderInboxId: lastMessage.senderInboxId || "unknown",
            displaySenderId: lastMessage.senderInboxId
              ? `${lastMessage.senderInboxId.slice(0, 6)}...${lastMessage.senderInboxId.slice(-6)}`
              : "unknown",
          }
        : null;

      const responseObject = {
        groupId: process.env.GROUP_ID,
        groupName: (conversation as Group).name,
        isMember,
        memberCount: groupMembers.length,
        members: formattedMembers,
        lastMessage: formattedLastMessage,
        messageCount: messages.length,
      };

      res.json(responseObject);
      console.log("⚪ Response sent for get-group-id");
    } catch (error) {
      console.error("❌ Error in get-group-id:", error);
      res.status(500).json({ error: "Failed to fetch group info" });
    }
  },
);

// Broadcast message to all connected WebSocket clients
const broadcastToClients = (message: any) => {
  if (!wss) return;
  
  wss.clients.forEach((client: any) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// Initialize WebSocket server
const initializeWebSocketServer = () => {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws: any) => {
    console.log("🔌 New WebSocket connection");
    
    ws.on("message", (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("📨 WebSocket message received:", message);
        
        // Handle different message types
        switch (message.type) {
          case "subscribe":
            // Client subscribing to updates
            ws.send(JSON.stringify({ type: "subscribed", data: "Connected to Quest Arena" }));
            break;
          case "questAction":
            // Handle quest-related actions
            void handleQuestAction(message.data, ws);
            break;
        }
      } catch (error) {
        console.error("❌ Error handling WebSocket message:", error);
      }
    });
    
    ws.on("close", () => {
      console.log("🔌 WebSocket connection closed");
    });
  });
};

// Quest API endpoints
app.get("/api/quests/active", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const activeQuests = questOrchestrator ? questOrchestrator.getActiveQuests() : [];
    res.json(activeQuests);
  } catch (error) {
    console.error("❌ Error fetching active quests:", error);
    res.status(500).json({ error: "Failed to fetch active quests" });
  }
});

app.get("/api/quests/user/:inboxId/stats", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const { inboxId } = req.params;
    const stats = questOrchestrator ? questOrchestrator.getUserStats(inboxId) : null;
    res.json(stats || { level: 1, xp: 0, questsCompleted: 0, socialScore: 0 });
  } catch (error) {
    console.error("❌ Error fetching user stats:", error);
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
});

// Get quest details by ID
app.get("/api/quests/:questId", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const { questId } = req.params;
    const miniAppConfig = miniAppLauncher.getMiniAppConfig(questId);
    
    if (!miniAppConfig) {
      return res.status(404).json({ error: "Quest not found" });
    }
    
    res.json({
      quest: miniAppConfig,
      participants: miniAppLauncher.getQuestParticipants(questId),
      isActive: miniAppLauncher.isQuestActive(questId),
      url: miniAppLauncher.getMiniAppUrl(questId)
    });
  } catch (error) {
    console.error("❌ Error fetching quest details:", error);
    res.status(500).json({ error: "Failed to fetch quest details" });
  }
});

// Join a quest
app.post("/api/quests/:questId/join", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const { questId } = req.params;
    const { inboxId } = req.body;
    
    if (!inboxId) {
      return res.status(400).json({ error: "Missing inboxId" });
    }
    
    const success = miniAppLauncher.addParticipant(questId, inboxId);
    
    if (success) {
      // Broadcast participant joined event
      broadcastToClients({
        type: "participantJoined",
        data: { questId, inboxId }
      });
      
      res.json({ success: true, message: "Successfully joined quest" });
    } else {
      res.status(400).json({ error: "Failed to join quest" });
    }
  } catch (error) {
    console.error("❌ Error joining quest:", error);
    res.status(500).json({ error: "Failed to join quest" });
  }
});

// Leave a quest
app.post("/api/quests/:questId/leave", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const { questId } = req.params;
    const { inboxId } = req.body;
    
    if (!inboxId) {
      return res.status(400).json({ error: "Missing inboxId" });
    }
    
    const success = miniAppLauncher.removeParticipant(questId, inboxId);
    
    if (success) {
      // Broadcast participant left event
      broadcastToClients({
        type: "participantLeft",
        data: { questId, inboxId }
      });
      
      res.json({ success: true, message: "Successfully left quest" });
    } else {
      res.status(400).json({ error: "Failed to leave quest" });
    }
  } catch (error) {
    console.error("❌ Error leaving quest:", error);
    res.status(500).json({ error: "Failed to leave quest" });
  }
});

// Complete a quest
app.post("/api/quests/:questId/complete", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const { questId } = req.params;
    const { inboxId, result } = req.body;
    
    if (!inboxId) {
      return res.status(400).json({ error: "Missing inboxId" });
    }
    
    // Complete the quest in mini app launcher
    const success = miniAppLauncher.completeQuest(questId, inboxId);
    
    if (success && questOrchestrator) {
      // Process quest completion through orchestrator
      const questMasterNames = Array.from(questMasters.keys());
      const randomQuestMaster = questMasters.get(
        questMasterNames[Math.floor(Math.random() * questMasterNames.length)]
      );
      
      if (randomQuestMaster) {
        await randomQuestMaster.completeQuest(questId, inboxId, result);
      }
      
      // Broadcast quest completion event
      broadcastToClients({
        type: "questCompleted",
        data: { questId, inboxId, result }
      });
      
      res.json({ success: true, message: "Quest completed successfully" });
    } else {
      res.status(400).json({ error: "Failed to complete quest" });
    }
  } catch (error) {
    console.error("❌ Error completing quest:", error);
    res.status(500).json({ error: "Failed to complete quest" });
  }
});

// Get all mini apps
app.get("/api/miniapps", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const activeMiniApps = miniAppLauncher.getActiveMiniApps();
    res.json(activeMiniApps);
  } catch (error) {
    console.error("❌ Error fetching mini apps:", error);
    res.status(500).json({ error: "Failed to fetch mini apps" });
  }
});

// Clean up expired mini apps
app.post("/api/miniapps/cleanup", validateApiSecret, async (req: Request, res: Response) => {
  try {
    const cleaned = miniAppLauncher.cleanupExpiredMiniApps();
    res.json({ success: true, cleaned });
  } catch (error) {
    console.error("❌ Error cleaning up mini apps:", error);
    res.status(500).json({ error: "Failed to cleanup mini apps" });
  }
});

app.post("/api/quests/trigger", validateApiSecret, async (req: Request, res: Response) => {
  try {
    // Manually trigger quest creation for testing
    const { conversationId } = req.body;
    
    if (!conversationId || !questOrchestrator) {
      return res.status(400).json({ error: "Missing conversationId or quest system not initialized" });
    }
    
    const conversation = await xmtpClient.conversations.getConversationById(conversationId);
    if (!conversation || !(conversation instanceof Group)) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    // Select a random quest master
    const questMasterNames = Array.from(questMasters.keys());
    const randomQuestMaster = questMasters.get(
      questMasterNames[Math.floor(Math.random() * questMasterNames.length)]
    );
    
    if (randomQuestMaster) {
      const members = await conversation.members();
      const recentMessages = await conversation.messages({ limit: 10 });
      
      const quest = await randomQuestMaster.analyzeAndCreateQuest(
        conversation,
        recentMessages,
        members
      );
      
      if (quest) {
        const announcement = await randomQuestMaster.generateQuestAnnouncement(quest);
        await conversation.send(announcement);
        res.json({ success: true, quest });
      } else {
        res.json({ success: false, message: "No quest created" });
      }
    } else {
      res.status(500).json({ error: "No quest masters available" });
    }
  } catch (error) {
    console.error("❌ Error triggering quest:", error);
    res.status(500).json({ error: "Failed to trigger quest" });
  }
});

// Start Server
void (async () => {
  try {
    // Initialize Quest Masters
    initializeQuestMasters();
    
    // Initialize XMTP client
    await initializeXmtpClient();
    
    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🔌 WebSocket server ready for connections`);
    });
    
    // Initialize WebSocket server after HTTP server starts
    initializeWebSocketServer();
    
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
})();

// Handle quest actions from frontend
const handleQuestAction = async (data: any, ws: any) => {
  try {
    switch (data.action) {
      case "joinQuest":
        if (data.questId && data.userInboxId) {
          const success = miniAppLauncher.addParticipant(data.questId, data.userInboxId);
          if (success) {
            broadcastToClients({
              type: "participantJoined",
              data: { questId: data.questId, inboxId: data.userInboxId }
            });
            ws.send(JSON.stringify({ 
              type: "questJoined", 
              data: { questId: data.questId, success: true } 
            }));
          } else {
            ws.send(JSON.stringify({ 
              type: "error", 
              data: "Failed to join quest" 
            }));
          }
        }
        break;
        
      case "leaveQuest":
        if (data.questId && data.userInboxId) {
          const success = miniAppLauncher.removeParticipant(data.questId, data.userInboxId);
          if (success) {
            broadcastToClients({
              type: "participantLeft",
              data: { questId: data.questId, inboxId: data.userInboxId }
            });
            ws.send(JSON.stringify({ 
              type: "questLeft", 
              data: { questId: data.questId, success: true } 
            }));
          }
        }
        break;
        
      case "completeQuest":
        if (data.questId && data.userInboxId) {
          const success = miniAppLauncher.completeQuest(data.questId, data.userInboxId);
          if (success) {
            // Process quest completion through orchestrator
            const questMasterNames = Array.from(questMasters.keys());
            const randomQuestMaster = questMasters.get(
              questMasterNames[Math.floor(Math.random() * questMasterNames.length)]
            );
            
            if (randomQuestMaster) {
              await randomQuestMaster.completeQuest(data.questId, data.userInboxId, data.result);
            }
            
            broadcastToClients({
              type: "questCompleted",
              data: { questId: data.questId, inboxId: data.userInboxId, result: data.result }
            });
            
            ws.send(JSON.stringify({ 
              type: "questCompleted", 
              data: { questId: data.questId, success: true } 
            }));
          }
        }
        break;
        
      case "getUserStats":
        if (data.userInboxId && questOrchestrator) {
          const stats = questOrchestrator.getUserStats(data.userInboxId);
          ws.send(JSON.stringify({ 
            type: "userStats", 
            data: stats || { level: 1, xp: 0, questsCompleted: 0, socialScore: 0 } 
          }));
        }
        break;
        
      case "getActiveQuests":
        const activeQuests = questOrchestrator ? questOrchestrator.getActiveQuests() : [];
        ws.send(JSON.stringify({ 
          type: "activeQuests", 
          data: activeQuests 
        }));
        break;
        
      case "getQuestDetails":
        if (data.questId) {
          const miniAppConfig = miniAppLauncher.getMiniAppConfig(data.questId);
          if (miniAppConfig) {
            ws.send(JSON.stringify({ 
              type: "questDetails", 
              data: {
                quest: miniAppConfig,
                participants: miniAppLauncher.getQuestParticipants(data.questId),
                isActive: miniAppLauncher.isQuestActive(data.questId),
                url: miniAppLauncher.getMiniAppUrl(data.questId)
              }
            }));
          } else {
            ws.send(JSON.stringify({ 
              type: "error", 
              data: "Quest not found" 
            }));
          }
        }
        break;
        
      default:
        ws.send(JSON.stringify({ 
          type: "error", 
          data: `Unknown action: ${data.action}` 
        }));
    }
  } catch (error: unknown) {
    console.error("❌ Error handling quest action:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    ws.send(JSON.stringify({ type: "error", data: errorMessage }));
  }
};

// Monitor conversations for quest creation opportunities
const startConversationMonitoring = async () => {
  console.log("👁️ Starting conversation monitoring for quest opportunities...");
  
  try {
    const stream = await xmtpClient.conversations.streamAllMessages();
    
    for await (const message of stream) {
      if (
        message?.senderInboxId.toLowerCase() === xmtpClient.inboxId.toLowerCase() ||
        message?.contentType?.typeId !== "text"
      ) {
        continue;
      }
      
      try {
        await handleNewMessage(message);
      } catch (error) {
        console.error("❌ Error handling message:", error);
      }
    }
  } catch (error) {
    console.error("❌ Error in conversation monitoring:", error);
    // Restart monitoring after delay
    setTimeout(() => {
      void startConversationMonitoring();
    }, 10000);
  }
};

// Handle new messages and trigger quest creation
const handleNewMessage = async (message: DecodedMessage) => {
  const conversation = await xmtpClient.conversations.getConversationById(
    message.conversationId
  );
  
  if (!conversation || !(conversation instanceof Group)) {
    return;
  }
  
  // Check if it's time to create a quest (simplified logic for now)
  const shouldCreateQuest = Math.random() < 0.1; // 10% chance for demo
  
  if (shouldCreateQuest) {
    console.log("🎯 Triggering quest creation for conversation:", conversation.id);
    
    // Select a random quest master
    const questMasterNames = Array.from(questMasters.keys());
    const randomQuestMaster = questMasters.get(
      questMasterNames[Math.floor(Math.random() * questMasterNames.length)]
    );
    
    if (randomQuestMaster) {
      try {
        const members = await conversation.members();
        const recentMessages = await conversation.messages({ limit: 10 });
        
        const quest = await randomQuestMaster.analyzeAndCreateQuest(
          conversation,
          recentMessages,
          members
        );
        
        if (quest) {
          const announcement = await randomQuestMaster.generateQuestAnnouncement(quest);
          await conversation.send(announcement);
        }
      } catch (error) {
        console.error("❌ Error creating quest:", error);
      }
    }
  }
};
