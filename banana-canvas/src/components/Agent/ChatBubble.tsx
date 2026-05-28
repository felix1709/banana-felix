import { memo } from "react";
import type { ChatMessage } from "../../types/agent";

interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  streamingText?: string;
}

export const ChatBubble = memo(function ChatBubble({ message, streaming, streamingText }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const content = streaming ? (streamingText ?? message.content) : message.content;

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
          maxWidth: "85%",
          padding: "8px 12px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser ? "#3b82f6" : "#27272a",
          color: isUser ? "#ffffff" : "#e4e4e7",
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        {content}
        {streaming && (
          <span className="jiaojiao-cursor" style={{ display: "inline-block", width: 2, height: 14, background: "#facc15", marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s infinite" }} />
        )}
      </div>
    </div>
  );
});
