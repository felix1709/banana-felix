import { memo, useMemo } from "react";
import type { ChatMessage } from "../../types/agent";
import { formatAssistantText } from "./chatTextFormat";

interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  streamingText?: string;
}

export const ChatBubble = memo(function ChatBubble({ message, streaming, streamingText }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const rawContent = streaming ? (streamingText ?? message.content) : message.content;
  const parts = useMemo(
    () => isUser ? [{ text: rawContent, highlight: false }] : formatAssistantText(rawContent),
    [isUser, rawContent],
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
        paddingLeft: isUser ? 32 : 0,
        paddingRight: isUser ? 0 : 32,
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #facc15, #f97316)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
            marginRight: 8,
            marginTop: 2,
          }}
        >
          🍌
        </div>
      )}
      <div
        style={{
          maxWidth: "min(92%, 620px)",
          padding: "8px 12px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser ? "#3b82f6" : "#27272a",
          color: isUser ? "#ffffff" : "#e4e4e7",
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          height: "auto",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        {parts.map((part, index) => (
          <span
            key={`${index}-${part.text}`}
            style={part.highlight ? { color: "#f87171", fontWeight: 700 } : undefined}
          >
            {part.text}
          </span>
        ))}
        {streaming && (
          <span className="jiaojiao-cursor" style={{ display: "inline-block", width: 2, height: 14, background: "#facc15", marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s infinite" }} />
        )}
      </div>
    </div>
  );
});
