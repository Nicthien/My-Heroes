import { NextResponse } from "next/server";
import { getAllowAnonymousUsers } from "@/lib/server/app-settings";

export async function GET() {
  try {
    const allowAnonymousUsers = await getAllowAnonymousUsers();
    return NextResponse.json({ allowAnonymousUsers });
  } catch (error) {
    console.error("guest settings load failed", error);
    return NextResponse.json({ allowAnonymousUsers: true });
  }
}
