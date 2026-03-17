import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBase } from "@/lib/backend-api";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const backendUrl = `${getBackendApiBase()}/api/v1/rag/upload`;
    const apiKey = request.headers.get("x-api-key");

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: formData,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json(
      {
        error: response.ok ? null : text || "RAG upload failed",
        details: text || undefined,
      },
      { status: response.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to upload PDF to RAG backend", details: message },
      { status: 500 }
    );
  }
}

