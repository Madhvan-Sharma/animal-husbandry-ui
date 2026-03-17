import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, FastForward, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SkippedStep } from "@/providers/Stream";

interface AutoResolvedStepsProps {
  steps: SkippedStep[];
  className?: string;
}

export function AutoResolvedSteps({ steps, className }: AutoResolvedStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className={cn("inline-block", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FastForward className="h-3 w-3 mr-1.5" />
        <span>{steps.length} step{steps.length > 1 ? 's' : ''} auto-resolved</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 ml-1.5" />
        ) : (
          <ChevronDown className="h-3 w-3 ml-1.5" />
        )}
      </Button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Card className="mt-2 border-dashed">
              <CardContent className="p-3">
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <motion.div
                      key={`${step.timestamp}-${index}`}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex gap-2 p-2 rounded-md bg-muted/50"
                    >
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {step.question}
                        </p>
                        <p className="text-sm font-medium">
                          {step.label}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}