"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

type CreateTicketContextValue = {
  openCreateTicket: () => void;
  registerOnTicketCreated: (fn: () => void) => void;
};

const CreateTicketContext = createContext<CreateTicketContextValue | null>(
  null,
);

export function CreateTicketProvider({
  children,
  openCreateTicket,
  onTicketCreatedRef,
}: {
  children: ReactNode;
  openCreateTicket: () => void;
  onTicketCreatedRef: React.MutableRefObject<(() => void) | undefined>;
}) {
  const registerOnTicketCreated = useCallback((fn: () => void) => {
    onTicketCreatedRef.current = fn;
  }, [onTicketCreatedRef]);

  const value: CreateTicketContextValue = {
    openCreateTicket,
    registerOnTicketCreated,
  };

  return (
    <CreateTicketContext.Provider value={value}>
      {children}
    </CreateTicketContext.Provider>
  );
}

export function useCreateTicket(): CreateTicketContextValue {
  const ctx = useContext(CreateTicketContext);
  if (!ctx) {
    throw new Error("useCreateTicket must be used within CreateTicketProvider");
  }
  return ctx;
}

export function useCreateTicketOptional(): CreateTicketContextValue | null {
  return useContext(CreateTicketContext);
}
