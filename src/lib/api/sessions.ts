// API functions for session management
// Base URL from NEXT_PUBLIC_WORKFLOW_API_URL (e.g. http://localhost:8000)

function getWorkflowApiBase(): string {
  return (
    (typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_WORKFLOW_API_URL
      : process.env.NEXT_PUBLIC_WORKFLOW_API_URL ?? process.env.WORKFLOW_API_URL) ??
    "http://localhost:8000"
  );
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  session_id: string;
  graph_id: string;
  user_id?: string;
  created_at: string;
  status: 'active' | 'completed' | 'terminated';
  chat_history?: ChatMessage[];
  history_length?: number;
}

export interface CreateSessionResponse {
  session_id: string;
  graph_id: string;
  question?: string;
}

export interface ChatChunk {
  message?: string;
  token?: string;
  interpreted?: string;
  skipped?: boolean;
  question?: string;
  label?: string;
  node_type?: string;
  condition?: string;
  terminal?: boolean;
}

// Helper function to handle API errors
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Create a new chat session. Pass sessionType "default" only when the selected workflow is the default; otherwise omit.
export async function createSession(graphId: string, sessionType?: string): Promise<CreateSessionResponse> {
  const response = await fetch(`${getWorkflowApiBase()}/sessions/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: sessionType ? JSON.stringify({ graph_id: graphId, session_type: sessionType }) : JSON.stringify({ graph_id: graphId }),
  });

  return handleResponse<CreateSessionResponse>(response);
}

// Send a message to the chat session (returns an async generator for streaming)
export async function* sendChatMessage(
  sessionId: string,
  message: string,
  signal?: AbortSignal
): AsyncGenerator<ChatChunk, void, unknown> {
  const response = await fetch(`${getWorkflowApiBase()}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error! status: ${response.status}`);
  }

  // Check if the response is an event stream
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/event-stream')) {
    // Handle Server-Sent Events (SSE)
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    let buffer = '';

    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const chunk = JSON.parse(data) as ChatChunk;
            yield chunk;
          } catch (e) {
            console.error('Failed to parse SSE data:', data, e);
          }
        }
      }
    }
  } else {
    // Fallback for non-SSE responses
    const data = await response.json();
    if (data.message) {
      yield { message: data.message };
    }
  }
}

// Reset a session
export async function resetSession(sessionId: string): Promise<{ message: string }> {
  const response = await fetch(`${getWorkflowApiBase()}/sessions/${sessionId}/reset`, {
    method: 'POST',
  });

  return handleResponse<{ message: string }>(response);
}

// Get session details
export async function getSession(sessionId: string, includeHistory: boolean = false): Promise<Session> {
  const response = await fetch(`${getWorkflowApiBase()}/sessions/${sessionId}`);
  
  const data = await handleResponse<any>(response);
  console.log("Session data from api", data);
  
  // Map backend response to our Session interface
  return {
    session_id: data.session_id,
    graph_id: data.graph_id,
    user_id: data.user_id,
    created_at: data.created_at || new Date().toISOString(),
    chat_history: includeHistory ? data.chat_history : undefined,
    status: data.status || 'active',
  };
}

// Delete a session
export async function deleteSession(sessionId: string): Promise<{ message: string }> {
  const response = await fetch(`${getWorkflowApiBase()}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  return handleResponse<{ message: string }>(response);
}