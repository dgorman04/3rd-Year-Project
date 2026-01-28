// app/messages.jsx - Team messaging/chat feature
import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import AppLayout from "../components/AppLayout";
import { API, WS_URL, ngrokHeaders } from "../lib/config";
import { getToken, clearToken } from "../lib/auth";

export default function Messages() {
  const [token, setToken] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsStatus, setWsStatus] = useState("Offline");
  const scrollViewRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadMessages(t);
      connectWebSocket(t);
    })();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Fallback polling so chat still updates even if WebSocket is down
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      loadMessages(token);
    }, 8000); // every 8 seconds

    return () => clearInterval(interval);
  }, [token]);

  const loadMessages = async (t) => {
    try {
      const res = await fetch(`${API}/chat/messages/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const data = await res.json().catch(() => []);
      if (res.ok) {
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const connectWebSocket = (t) => {
    if (!WS_URL) return;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 15; // 30 seconds (15 * 2 seconds)
    let reconnectTimeout = null;

    const connect = () => {
      try {
        const socket = new WebSocket(WS_URL);
        wsRef.current = socket;

        socket.onopen = () => {
          setWsStatus("Connected");
          reconnectAttempts = 0; // Reset on successful connection
        };

        socket.onclose = () => {
          setWsStatus("Offline");
          
          // Attempt reconnection (REQ-7: every 2 seconds for 30 seconds)
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(() => {
              console.log(`Reconnecting... (attempt ${reconnectAttempts})`);
              connect();
            }, 2000);
          } else {
            setWsStatus("Connection Failed");
          }
        };

        socket.onerror = (err) => {
          console.log("WebSocket error:", err);
          setWsStatus("Error");
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.kind === "chat") {
              const message = data.data;
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
              });
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          } catch (e) {
            console.log("Error parsing WebSocket message:", e);
          }
        };
      } catch (e) {
        console.log("WebSocket connection error:", e);
        setWsStatus("Connection Error");
      }
    };

    connect();

    // Cleanup function
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !token || sending) return;

    const text = messageText.trim();
    setMessageText("");
    setSending(true);

    try {
      const res = await fetch(`${API}/chat/messages/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        // Message will be added via WebSocket broadcast, but add optimistically
        setMessages((prev) => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, { ...data, sender: "You" }];
        });
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData?.detail || "Failed to send message.");
      }
    } catch (e) {
      console.log(e);
      alert("Error sending message.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const statusColor =
    wsStatus === "Connected" ? "#16a34a" :
    wsStatus === "Connection Failed" || wsStatus === "Error" ? "#dc2626" :
    "#9ca3af";

  return (
    <AppLayout>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        {/* Page header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Team Chat</Text>
            <Text style={styles.subtitle}>Real-time messaging for your squad</Text>
          </View>
          <View style={[styles.statusPill, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>
              {wsStatus === "Connected" ? "Live" : "Updating"}
            </Text>
          </View>
        </View>

        {/* Messages area */}
        <View style={styles.chatCard}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Start the conversation with your staff and players.
                </Text>
              </View>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender === "You";
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageRow,
                      isMe ? styles.messageRowRight : styles.messageRowLeft,
                    ]}
                  >
                    {!isMe && (
                      <View style={styles.avatarCircle}>
                        <Text style={styles.avatarInitial}>
                          {(msg.sender || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.messageBubble,
                        isMe ? styles.messageBubbleRight : styles.messageBubbleLeft,
                      ]}
                    >
                      <View style={styles.messageHeader}>
                        <Text style={styles.messageSender}>
                          {msg.sender || "Unknown"}
                          {msg.sender_role ? ` · ${msg.sender_role}` : ""}
                        </Text>
                        <Text style={styles.messageTime}>
                          {formatTime(msg.timestamp)}
                        </Text>
                      </View>
                      <Text style={styles.messageText}>
                        {msg.message || msg.text}
                      </Text>
                    </View>
                    {isMe && (
                      <View style={styles.avatarSpacer} />
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message to your team..."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={500}
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!messageText.trim() || sending}
            >
              <Text style={styles.sendButtonText}>{sending ? "..." : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "500",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chatCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarSpacer: {
    width: 40,
    marginLeft: 8,
  },
  avatarInitial: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  messageBubble: {
    maxWidth: "78%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  messageBubbleLeft: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  messageBubbleRight: {
    backgroundColor: "#0f172a",
    borderTopRightRadius: 4,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  messageSender: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
  messageTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginLeft: 8,
  },
  messageText: {
    fontSize: 14,
    color: "#0f172a",
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "flex-end",
    backgroundColor: "#f9fafb",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0f172a",
    maxHeight: 100,
    backgroundColor: "#ffffff",
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
