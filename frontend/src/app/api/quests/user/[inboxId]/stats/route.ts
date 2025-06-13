import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const API_SECRET = process.env.API_SECRET_KEY || "xmtp-social-quest-arena-secret-key-2024";

export async function GET(
  request: NextRequest,
  { params }: { params: { inboxId: string } }
) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/quests/user/${params.inboxId}/stats`, {
      headers: {
        "x-api-secret": API_SECRET,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json(
      { 
        level: 1, 
        xp: 0, 
        questsCompleted: 0, 
        socialScore: 0,
        lastActive: new Date().toISOString()
      },
      { status: 200 }
    );
  }
}