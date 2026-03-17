// API functions for graph workflow management
// Base URL from NEXT_PUBLIC_WORKFLOW_API_URL (e.g. http://localhost:8000)

export interface GraphWorkflow {
  graph_id: string;
  name: string;
  workflow?: any; // JSON content - optional as backend doesn't return it in list
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
  start_node?: string;
  node_count?: number;
}

export interface IngestGraphResponse {
  graph_id: string;
  metadata: {
    name: string;
  };
}

function getWorkflowApiBase(): string {
  return (
    (typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_WORKFLOW_API_URL
      : process.env.NEXT_PUBLIC_WORKFLOW_API_URL ?? process.env.WORKFLOW_API_URL) ??
    "http://localhost:8000"
  );
}

// Store default graph ID in localStorage
const DEFAULT_GRAPH_KEY = 'default_graph_id';

// Helper function to handle API errors
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Ingest a new graph workflow
export async function ingestGraph(name: string, workflow: any): Promise<IngestGraphResponse> {
  const response = await fetch(`${getWorkflowApiBase()}/graphs/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, workflow }),
  });

  return handleResponse<IngestGraphResponse>(response);
}

// Get all graph workflows
export async function getAllGraphs(): Promise<GraphWorkflow[]> {
  const response = await fetch(`${getWorkflowApiBase()}/graphs`);
  const data = await handleResponse<{ count: number; graphs: GraphWorkflow[] }>(response);
  
  // Add is_default flag based on localStorage
  const defaultGraphId = localStorage.getItem(DEFAULT_GRAPH_KEY);
  return data.graphs.map(graph => ({
    ...graph,
    is_default: graph.graph_id === defaultGraphId,
  }));
}

// Delete a graph workflow
export async function deleteGraph(graphId: string): Promise<{ message: string }> {
  // Check if it's the default graph
  const defaultGraphId = localStorage.getItem(DEFAULT_GRAPH_KEY);
  if (graphId === defaultGraphId) {
    throw new Error("Cannot delete the default graph");
  }

  const response = await fetch(`${getWorkflowApiBase()}/graphs/${graphId}`, {
    method: 'DELETE',
  });

  return handleResponse<{ message: string }>(response);
}

// Set default graph (stored in localStorage since backend doesn't have this concept)
export async function setDefaultGraph(graphId: string): Promise<{ message: string }> {
  // Verify the graph exists
  const graphs = await getAllGraphs();
  const graph = graphs.find(g => g.graph_id === graphId);
  if (!graph) {
    throw new Error("Graph not found");
  }
  
  localStorage.setItem(DEFAULT_GRAPH_KEY, graphId);
  return { message: "Default graph updated successfully" };
}

// Get default graph ID
export async function getDefaultGraphId(): Promise<string> {
  const defaultId = localStorage.getItem(DEFAULT_GRAPH_KEY);
  
  if (!defaultId) {
    // If no default is set, get the first available graph
    const graphs = await getAllGraphs();
    if (graphs.length > 0) {
      const firstGraphId = graphs[0].graph_id;
      localStorage.setItem(DEFAULT_GRAPH_KEY, firstGraphId);
      return firstGraphId;
    }
    throw new Error("No graphs available");
  }
  
  return defaultId;
}

// Update a graph workflow
export async function updateGraph(graphId: string, name: string, workflow: any): Promise<GraphWorkflow> {
  // Backend doesn't have an update endpoint, so we'll delete and re-create
  // First check if it's the default graph
  const defaultGraphId = localStorage.getItem(DEFAULT_GRAPH_KEY);
  const wasDefault = graphId === defaultGraphId;
  
  // Delete the old graph
  await deleteGraph(graphId);
  
  // Create new graph with updated content
  const response = await ingestGraph(name, workflow);
  
  // If it was default, set the new graph as default
  if (wasDefault) {
    await setDefaultGraph(response.graph_id);
  }
  
  return {
    graph_id: response.graph_id,
    name: response.metadata.name,
    workflow,
    is_default: wasDefault,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}