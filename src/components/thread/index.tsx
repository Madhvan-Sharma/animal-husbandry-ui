import React, { ReactNode, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useState, FormEvent } from "react";
import { Button } from "../ui/button";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import { DO_NOT_RENDER_ID_PREFIX } from "@/lib/ensure-tool-responses";
import { TooltipIconButton } from "./tooltip-icon-button";
import { VetAILogoSVG } from "../icons/medcare";
import {
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  XIcon,
  Plus,
  LogOut,
  Mic,
  Volume2,
} from "lucide-react";
import { NotificationsBell } from "./notifications-bell";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import Sidebar from "./sidebar";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Label } from "../ui/label";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
} from "./artifact";
import type { ContentBlock } from "@/lib/multimodal-utils";
import { CreateTicketProvider } from "./CreateTicketContext";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { AutoResolvedSteps } from "./AutoResolvedSteps";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
      >
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("rounded-full border-border bg-card/95", props.className)}
      onClick={() => scrollToBottom()}
    >
      <span>Scroll to bottom</span>
    </Button>
  );
}

const WELCOME_TAGLINE = "Smarter livestock care starts here.";
const WELCOME_SUBTEXT =
  "Ask care questions, share animal symptoms, or upload reference images. Your AI veterinary assistant is ready.";

// (Image preview panel removed)

function WelcomeSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center text-center max-w-md"
    >
      <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-2">
        {WELCOME_TAGLINE}
      </p>
      <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
        {WELCOME_SUBTEXT}
      </p>
    </motion.div>
  );
}


export function Thread() {
  const [artifactOpen, closeArtifact] = useArtifactOpen();
  const [sidebarOpen, setSidebarOpen] = useQueryState(
    "sidebarOpen",
    parseAsBoolean.withDefault(false),
  );
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const onTicketCreatedRef = React.useRef<(() => void) | undefined>(undefined);
  const [input, setInput] = useState("");
  const {
    contentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks,
    dragOver,
    handlePaste,
  } = useFileUpload();
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const router = useRouter();

  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;

  // Speech-to-Text hook
  const {
    isListening,
    transcript,
    interimTranscript,
    error: sttError,
    isSupported: sttSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: false,
    interimResults: true,
    lang: "en-US",
  });

  // Text-to-Speech hook
  const {
    isSpeaking,
    stop: stopTts,
    speak,
    isSupported: ttsSupported,
  } = useSpeechSynthesis({
    rate: 1,
    pitch: 1,
    volume: 1,
  });

  const lastAiMessageRef = useRef<string>("");
  const isSubmittingFromSttRef = useRef(false);

  const lastError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        return;
      }

      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  // Handle TTS for AI responses
  useEffect(() => {
    if (!ttsEnabled || !ttsSupported || isLoading) return;

    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage &&
      lastMessage.type === "ai" &&
      typeof lastMessage.content === "string"
    ) {
      const messageText = lastMessage.content.trim();
      // Only speak if it's a new message and not empty
      if (messageText && messageText !== lastAiMessageRef.current) {
        lastAiMessageRef.current = messageText;
        // Wait a bit for the message to fully render, then speak
        const timer = setTimeout(() => {
          speak(messageText);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [messages, isLoading, ttsEnabled, ttsSupported, speak]);

  // Handle STT errors
  useEffect(() => {
    if (sttError) {
      toast.error("Speech recognition error", {
        description: sttError.includes("type your message")
          ? sttError
          : `${sttError} You can type your message instead.`,
        duration: 6000,
      });
    }
  }, [sttError]);

  // Handle STT transcript submission
  useEffect(() => {
    if (!isListening && transcript.trim() && !isSubmittingFromSttRef.current) {
      // User stopped recording and we have a transcript
      const finalText = transcript.trim();
      if (finalText) {
        // Populate input field briefly so user can see what was transcribed
        setInput(finalText);
        
        // Small delay to show the transcript, then auto-submit
        const submitTimer = setTimeout(() => {
          isSubmittingFromSttRef.current = true;
          setFirstTokenReceived(false);
          resetTranscript();
          
          // Stop any ongoing TTS
          stopTts();

          // Submit the transcribed text
          stream
            .submit(finalText, [], stream.sessionId || undefined)
            .catch((error) => {
              console.error("Error submitting transcribed text:", error);
            })
            .finally(() => {
              isSubmittingFromSttRef.current = false;
              setInput(""); // Clear input after submission
            });
        }, 500); // 500ms delay to show transcript

        return () => clearTimeout(submitTimer);
      }
    }
  }, [isListening, transcript, resetTranscript, stopTts, stream]);

  // Stop TTS if user starts recording
  useEffect(() => {
    if (isListening && isSpeaking) {
      stopTts();
    }
  }, [isListening, isSpeaking, stopTts]);

  // Stop STT if LLM is loading
  useEffect(() => {
    if (isLoading && isListening) {
      stopListening();
    }
  }, [isLoading, isListening, stopListening]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if ((input.trim().length === 0 && contentBlocks.length === 0) || isLoading)
      return;
    
    // Stop any ongoing recording
    if (isListening) {
      stopListening();
    }
    
    // Stop any ongoing TTS
    stopTts();
    
    setFirstTokenReceived(false);

    const inputText = input.trim();
    const blocksToSend = [...contentBlocks];
    
    // Clear input and blocks immediately before submitting
    setInput("");
    resetBlocks();
    
    try {
      await stream.submit(inputText, blocksToSend, stream.sessionId || undefined);
    } catch (error) {
      // Error handling is done in the Stream provider
      console.error("Error submitting message:", error);
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      // Stop any ongoing TTS
      stopTts();
      // Clear any existing transcript
      resetTranscript();
      startListening();
    }
  };

  const handleNewChat = () => {
    stream.setSessionId(null);
    window.location.reload();
  };
  const chatStarted = !!messages.length;

  return (
    <CreateTicketProvider
      openCreateTicket={() => setCreateTicketOpen(true)}
      onTicketCreatedRef={onTicketCreatedRef}
    >
      <CreateTicketDialog
        open={createTicketOpen}
        onOpenChange={setCreateTicketOpen}
        onCreated={() => onTicketCreatedRef.current?.()}
      />
      <div className="chat-shell flex h-screen w-full overflow-hidden">
      <div className="relative hidden lg:flex shrink-0">
        <motion.div
          className="absolute z-20 h-full overflow-hidden border-r bg-background"
          style={{ width: 400 }}
          animate={
            isLargeScreen
              ? { x: sidebarOpen ? 0 : -400 }
              : { x: sidebarOpen ? 0 : -400 }
          }
          initial={{ x: -400 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 400 }}
          >
            <Sidebar />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid w-full min-w-0 flex-1 grid-cols-[1fr_0fr] transition-all duration-500",
          artifactOpen && "grid-cols-[3fr_2fr]",
        )}
      >
        <motion.div
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden",
            !chatStarted && "grid-rows-[1fr]",
          )}
          layout={isLargeScreen}
          animate={{
            marginLeft: sidebarOpen ? (isLargeScreen ? 400 : 0) : 0,
            width: sidebarOpen
              ? isLargeScreen
                ? "calc(100% - 400px)"
                : "100%"
              : "100%",
          }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <header className="glass-panel relative z-10 mx-3 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="relative flex items-center justify-start gap-2">
              <div className="absolute left-0 z-10">
                {(!sidebarOpen || !isLargeScreen) && (
                  <Button
                    className="hover:bg-accent text-muted-foreground"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen((p) => !p)}
                  >
                    {sidebarOpen ? (
                      <PanelRightOpen className="size-5" />
                    ) : (
                      <PanelRightClose className="size-5" />
                    )}
                  </Button>
                )}
              </div>
              <motion.button
                className="flex cursor-pointer items-center gap-2.5"
                onClick={handleNewChat}
                animate={{ marginLeft: !sidebarOpen ? 48 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <VetAILogoSVG width={28} height={28} className="h-7 w-7 text-primary" />
                <span className="text-lg font-semibold tracking-tight text-foreground">
                  VetAI
                </span>
                <span className="hidden sm:inline text-xs font-medium text-muted-foreground border-l border-border pl-2.5">
                  VetAI Assistant
                </span>
              </motion.button>
            </div>
            <div className="flex items-center gap-1">
              <NotificationsBell />
              <TooltipIconButton
                size="lg"
                className="p-2.5 text-muted-foreground hover:text-foreground"
                tooltip="New conversation"
                variant="ghost"
                onClick={handleNewChat}
              >
                <SquarePen className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-2.5 text-muted-foreground hover:text-foreground"
                tooltip="Log out"
                variant="ghost"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.replace("/login");
                }}
              >
                <LogOut className="size-5" />
              </TooltipIconButton>
            </div>
          </header>

          <div className="relative flex flex-1 min-h-0 min-w-0 px-2 pb-2 pt-3">
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <StickToBottom className="relative flex-1 overflow-hidden">
            <StickyToBottomContent
              className={cn(
                "absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-track]:bg-transparent",
                !chatStarted && "mt-[20vh] flex flex-col items-stretch",
                chatStarted && "grid grid-rows-[1fr_auto]",
              )}
              contentClassName={cn(
                "pt-6 max-w-3xl mx-auto flex flex-col gap-0 w-full",
                !chatStarted ? "pb-4" : "pb-20",
              )}
              content={
                <>
                  {!chatStarted && (
                    <div className="flex flex-col items-center pt-6 pb-4">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35 }}
                        className="glass-panel mb-6 rounded-2xl p-6"
                      >
                        <VetAILogoSVG
                          width={64}
                          height={64}
                          className="h-16 w-16 sm:h-20 sm:w-20 text-primary mx-auto mb-4"
                        />
                        <WelcomeSection />
                      </motion.div>
                    </div>
                  )}
                  {messages
                    .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                    .map((message, index) => (
                      <div
                        key={message.id || `${message.type}-${index}`}
                        className={cn(
                          "-mx-2 mb-3 px-4 py-4",
                          message.type === "ai" ? "message-ai" : "message-human",
                        )}
                      >
                        {message.type === "human" ? (
                          <HumanMessage
                            message={message}
                            isLoading={isLoading}
                          />
                        ) : (
                          <>
                            {/* Show auto-resolved steps before AI message */}
                            {message.skippedSteps && message.skippedSteps.length > 0 && (
                              <div className="mb-2">
                                <AutoResolvedSteps
                                  steps={message.skippedSteps}
                                />
                              </div>
                            )}
                            <AssistantMessage
                              message={message}
                              isLoading={isLoading}
                            />
                          </>
                        )}
                      </div>
                    ))}
                </>
              }
              footer={
                <div
                  className={cn(
                    "sticky bottom-0 flex flex-col items-center bg-gradient-to-t from-background via-background/95 to-transparent",
                    !chatStarted ? "gap-4" : "gap-8",
                  )}
                >
                  <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />

                  <div
                    ref={dropRef}
                    className={cn(
                      "glass-panel relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl transition-all",
                      dragOver && "border-primary border-2 border-dashed ring-2 ring-primary/10",
                    )}
                  >
                    <form
                      onSubmit={handleSubmit}
                      className="grid grid-rows-[1fr_auto] gap-1"
                    >
                      <ContentBlocksPreview
                        blocks={contentBlocks}
                        onRemove={removeBlock}
                      />
                      <textarea
                        value={
                          isListening && (transcript || interimTranscript)
                            ? transcript || interimTranscript
                            : input
                        }
                        onChange={(e) => {
                          if (isListening) {
                            // User started typing while recording - stop recording
                            stopListening();
                            setInput(e.target.value);
                          } else {
                            setInput(e.target.value);
                          }
                        }}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.metaKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            const el = e.target as HTMLElement | undefined;
                            const form = el?.closest("form");
                            form?.requestSubmit();
                          }
                        }}
                        placeholder={
                          isListening
                            ? "Listening..."
                            : "Describe your animal's condition or ask a question..."
                        }
                        className="field-sizing-content min-h-[52px] resize-none border-none bg-transparent p-4 pb-2 text-foreground placeholder:text-muted-foreground shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                        disabled={isListening}
                      />
                      {isListening && (
                        <div className="px-4 pb-2 flex items-center gap-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="relative">
                              <Mic className="size-4 text-red-500" />
                              <span className="absolute top-0 right-0 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            </div>
                            <span>Recording...</span>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-4 border-t border-border/80 px-3 pb-3 pt-1">
                        <Label
                          htmlFor="file-input"
                          className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Plus className="size-4" />
                          Add image
                        </Label>
                        <input
                          id="file-input"
                          type="file"
                          onChange={handleFileUpload}
                          multiple
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="hidden"
                        />
                        {sttSupported && (
                          <TooltipIconButton
                            size="sm"
                            variant={isListening ? "default" : "ghost"}
                            onClick={handleMicClick}
                            disabled={isLoading}
                            className={cn(
                              "text-muted-foreground hover:text-foreground",
                              isListening && "bg-red-500/10 text-red-500 hover:text-red-600 hover:bg-red-500/20"
                            )}
                            tooltip={
                              isListening
                                ? "Stop recording"
                                : "Start voice input"
                            }
                          >
                            <Mic className={cn("size-4", isListening && "animate-pulse")} />
                          </TooltipIconButton>
                        )}
                        {ttsSupported && (
                          <TooltipIconButton
                            size="sm"
                            variant={ttsEnabled ? "default" : "ghost"}
                            onClick={() => {
                              if (isSpeaking) {
                                stopTts();
                              }
                              setTtsEnabled(!ttsEnabled);
                            }}
                            className={cn(
                              "text-muted-foreground hover:text-foreground",
                              ttsEnabled && "bg-primary/10 text-primary hover:text-primary/80"
                            )}
                            tooltip={
                              ttsEnabled
                                ? "Disable text-to-speech"
                                : "Enable text-to-speech"
                            }
                          >
                            <Volume2
                              className={cn(
                                "size-4",
                                isSpeaking && "animate-pulse"
                              )}
                            />
                          </TooltipIconButton>
                        )}
                        {stream.isLoading ? (
                          <Button
                            key="stop"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              stream.stop();
                              stopTts();
                            }}
                            className="ml-auto"
                          >
                            <LoaderCircle className="h-4 w-4 animate-spin mr-1.5" />
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            size="default"
                            className="ml-auto rounded-xl bg-primary px-5 text-primary-foreground shadow-sm hover:bg-primary/90"
                            disabled={
                              isLoading ||
                              isListening ||
                              (!input.trim() && contentBlocks.length === 0)
                            }
                          >
                            Send
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              }
            />
          </StickToBottom>
            </div>
          </div>
        </motion.div>
        <div className="relative flex flex-col border-l">
          <div className="absolute inset-0 flex min-w-[30vw] flex-col">
            <div className="grid grid-cols-[1fr_auto] border-b p-4">
              <ArtifactTitle className="truncate overflow-hidden" />
              <button
                onClick={closeArtifact}
                className="cursor-pointer"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <ArtifactContent className="relative flex-grow" />
          </div>
        </div>
      </div>
    </div>
    </CreateTicketProvider>
  );
}
