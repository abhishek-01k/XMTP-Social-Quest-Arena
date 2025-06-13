import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const API_SECRET = process.env.API_SECRET_KEY || "xmtp-social-quest-arena-secret-key-2024";

export async function GET(
  request: NextRequest,
  { params }: { params: { questId: string } }
) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/quests/${params.questId}`, {
      headers: {
        "x-api-secret": API_SECRET,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Quest not found" },
          { status: 404 }
        );
      }
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching quest details:", error);
    return NextResponse.json(
      { error: "Failed to fetch quest details" },
      { status: 500 }
    );
  }
}