import type { PendingApproval, TraceEvent } from "../api/types";

export type MessageStatus = "sending" | "done" | "error";
export type MessageRole = "operator" | "agent";

export type Message = {
  readonly id: string;
  readonly role: MessageRole;
  readonly text: string;
  readonly status: MessageStatus;
  readonly trace?: readonly TraceEvent[];
  readonly pendingApproval?: PendingApproval;
  readonly requestId?: string;
  readonly errorText?: string;
};
