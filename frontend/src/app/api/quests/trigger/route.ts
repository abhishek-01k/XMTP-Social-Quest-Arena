import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const API_SECRET = process.env.API_SECRET_KEY || "xmtp-social-quest-arena-secret-key-2024";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${BACKEND_URL}/api/quests/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-secret": API_SECRET,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || "Failed to trigger quest" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error triggering quest:", error);
    return NextResponse.json(
      { error: "Failed to trigger quest creation" },
      { status: 500 }
    );
  }
}