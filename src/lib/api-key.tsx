/** Returns Langflow API key: localStorage first, then NEXT_PUBLIC_LANGFLOW_API_KEY from .env.local */
export function getApiKey(): string | null {
  try {
    if (typeof window !== "undefined") {
      const fromStorage = window.localStorage.getItem("lg:chat:apiKey");
      if (fromStorage) return fromStorage;
    }
    return process.env.NEXT_PUBLIC_LANGFLOW_API_KEY ?? null;
  } catch {
    return process.env.NEXT_PUBLIC_LANGFLOW_API_KEY ?? null;
  }
}
