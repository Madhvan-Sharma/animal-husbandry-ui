import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBase } from "@/lib/backend-api";
import { getDb } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const url =
      body && typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 },
      );
    }

    const backendUrl = `${getBackendApiBase()}/api/v1/rag/add-url`;
    const apiKey = request.headers.get("x-api-key");

    const resp = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ url }),
    });

    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await resp.json();

      if (resp.ok) {
        try {
          const db = await getDb();
          const col = db.collection("rag_sources");
          await col.insertOne({
            url,
            chunksAdded:
              typeof data.chunksAdded === "number" ? data.chunksAdded : null,
            createdAt: new Date(),
          });
        } catch (e) {
          console.error("[rag/add-url] Failed to persist source:", e);
        }
      }

      return NextResponse.json(data, { status: resp.status });
    }

    const text = await resp.text();
    return NextResponse.json(
      {
        error: resp.ok ? null : text || "RAG add-url failed",
        details: text || undefined,
      },
      { status: resp.status },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to add URL to RAG backend", details: message },
      { status: 500 },
    );
  }
}

