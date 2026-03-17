import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAllGraphs, type GraphWorkflow } from "@/lib/api/graphs";
import { createSession } from "@/lib/api/sessions";
import { FileJson, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface GraphSelectionDialogProps {
  open: boolean;
  onGraphSelected: (graphId: string, sessionId: string) => void;
  currentGraphId?: string;
}

export function GraphSelectionDialog({
  open,
  onGraphSelected,
  currentGraphId,
}: GraphSelectionDialogProps) {
  const [graphs, setGraphs] = useState<GraphWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  const loadGraphs = useCallback(async () => {
    try {
      setLoading(true);
      const allGraphs = await getAllGraphs();
      // Filter out the current graph and only show available ones
      const availableGraphs = allGraphs.filter(g => g.graph_id !== currentGraphId);
      setGraphs(availableGraphs);
    } catch (error) {
      toast.error("Failed to load available workflows");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentGraphId]);

  useEffect(() => {
    if (open) {
      loadGraphs();
    }
  }, [open, loadGraphs]);

  async function handleSelectGraph(graphId: string) {
    try {
      setSelecting(true);
      // Send session_type "default" only when the selected workflow is the default
      const graph = graphs.find((g) => g.graph_id === graphId);
      const sessionType = graph?.is_default ? "default" : undefined;
      const response = await createSession(graphId, sessionType);
      onGraphSelected(graphId, response.session_id);
    } catch (error) {
      toast.error("Failed to start new session");
      console.error(error);
    } finally {
      setSelecting(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="size-5 text-green-500" />
            Session Complete
          </DialogTitle>
          <DialogDescription>
            Your current session has been completed. Would you like to explore another workflow?
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading available workflows...
            </div>
          ) : graphs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No other workflows are available at this time.
              </p>
              <Button onClick={() => window.location.reload()}>
                Start New Session
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                Select a workflow to continue:
              </p>
              {graphs.map((graph) => (
                <Card 
                  key={graph.graph_id} 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => !selecting && handleSelectGraph(graph.graph_id)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <FileJson className="size-6 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{graph.name}</h3>
                        {graph.is_default && (
                          <span className="text-xs text-muted-foreground">
                            Default workflow
                          </span>
                        )}
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      disabled={selecting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectGraph(graph.graph_id);
                      }}
                    >
                      {selecting ? "Starting..." : "Select"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              
              <div className="pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  Start Fresh Session
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}