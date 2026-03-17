import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getBackendApiBase } from "@/lib/backend-api";

export async function GET() {
  try {
    const docs: {
      id: string;
      name: string;
      url: string;
      bytes: number;
      createdAt: string | null;
      format: string;
    }[] = [];

    // PDFs from backend's rag_documents folder
    try {
      const backendUrl = `${getBackendApiBase()}/api/v1/rag/documents`;
      const resp = await fetch(backendUrl);
      if (resp.ok) {
        const data = (await resp.json()) as {
          documents?: {
            id: string;
            name: string;
            url: string;
            bytes: number;
            createdAt: string | null;
            format: string;
          }[];
        };
        if (Array.isArray(data.documents)) {
          docs.push(...data.documents);
        }
      }
    } catch (e) {
      console.error("[rag/documents] Failed to load PDFs from backend:", e);
    }

    // URL sources stored in MongoDB (rag_sources)
    try {
      const db = await getDb();
      const col = db.collection("rag_sources");
      const sources = await col
        .find({}, { sort: { createdAt: -1 }, limit: 200 })
        .toArray();
      docs.push(
        ...sources.map((s) => ({
          id: `url:${String(s._id)}`,
          name: s.url as string,
          url: s.url as string,
          bytes: 0,
          createdAt: s.createdAt
            ? new Date(s.createdAt as Date).toISOString()
            : null,
          format: "url",
        })),
      );
    } catch (e) {
      console.error("[rag/documents] Failed to load URL sources:", e);
    }

    docs.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ documents: docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch RAG documents", details: message },
      { status: 500 },
    );
  }
}

