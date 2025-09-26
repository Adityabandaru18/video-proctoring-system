import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Log from "@/models/Log";

export async function POST(req: NextRequest) {
  await dbConnect();
  try {
    const data = await req.json();
    const log = new Log(data);
    await log.save();
    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch (error) {
    console.error("Error saving log:", error);
    return NextResponse.json({ success: false, error: "Could not save log" }, { status: 500 });
  }
}

export async function GET() {
  await dbConnect();
  try {
    const logs = await Log.find().sort({ integrityScore: -1 });
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Could not fetch logs" }, { status: 500 });
  }
}
