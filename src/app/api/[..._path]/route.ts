import { NextRequest, NextResponse } from "next/server";

// This file acts as a proxy for requests to your Langflow server.
export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ _path: string[] }> }
) {
  try {
    const apiKey = request.headers.get("x-api-key");
    const langflowUrl =
      process.env.LANGFLOW_API_URL ||
      process.env.NEXT_PUBLIC_LANGFLOW_API_URL ||
      "http://localhost:7860";
    const { _path: pathParts } = await params;

    // POST /api/files/upload/[flowId] - multipart form data, forward to Langflow
    if (
      pathParts.length >= 3 &&
      pathParts[0] === "files" &&
      pathParts[1] === "upload"
    ) {
      const flowId = pathParts[2];
      if (!flowId) {
        return NextResponse.json(
          { error: "Flow ID is required for file upload" },
          { status: 400 }
        );
      }
      const formData = await request.formData();
      const response = await fetch(
        `${langflowUrl}/api/v1/files/upload/${flowId}`,
        {
          method: "POST",
          headers: {
            ...(apiKey && { "x-api-key": apiKey }),
          },
          body: formData,
        }
      );
      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }
      return NextResponse.json(data);
    }

    // POST /api/run/[flowId] - JSON body, execute flow
    if (pathParts.length < 2 || pathParts[0] !== "run") {
      return NextResponse.json(
        { error: "Invalid path. Expected /api/run/[flowId] or /api/files/upload/[flowId]" },
        { status: 400 }
      );
    }

    const flowId = pathParts[1];
    if (!flowId) {
      return NextResponse.json(
        { error: "Flow ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const useStreaming = body.stream !== false;
    const { stream: _stream, ...bodyWithoutStream } = body;
    const runUrl = `${langflowUrl}/api/v1/run/${flowId}?stream=${useStreaming}`;
    const response = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey && { "x-api-key": apiKey }),
      },
      body: JSON.stringify(bodyWithoutStream),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    }

    if (!useStreaming) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const cause =
      error instanceof Error && "cause" in error
        ? String((error as Error & { cause?: unknown }).cause)
        : "";
    const langflowUrl =
      process.env.LANGFLOW_API_URL ||
      process.env.NEXT_PUBLIC_LANGFLOW_API_URL ||
      "http://localhost:7860";
    console.error("API proxy error:", message, cause || "", "→", langflowUrl);
    return NextResponse.json(
      {
        error: "Langflow request failed",
        details:
          message === "fetch failed"
            ? `Cannot reach Langflow at ${langflowUrl}. Ensure the Langflow server is running.`
            : message,
      },
      { status: 502 }
    );
  }
}
