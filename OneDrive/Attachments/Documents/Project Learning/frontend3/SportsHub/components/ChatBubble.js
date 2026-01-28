// components/ChatBubble.js - Small chat bubble for manager/analyst quick chat
import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { API, WS_URL, ngrokHeaders } from "../lib/config";
import { getToken } from "../lib/auth";

export default function ChatBubble({ userRole }) {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const scrollViewRef = useRef(null);

  // Only show for managers (not analysts or players)
  if (userRole !== "manager") {
    return null;
  }

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    loadMessages();
  }, [token]);

  useEffect(() => {
    if (!token || !WS_URL) return;

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      setSocket(ws);
    };
    ws.onclose = () => {
      setSocket(null);
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (token) {
          const newWs = new WebSocket(WS_URL);
          newWs.onopen = () => setSocket(newWs);
          newWs.onmessage = handleWebSocketMessage;
          newWs.onerror = () => {};
          newWs.onclose = () => setSocket(null);
        }
      }, 3000);
    };
    ws.onerror = () => {};
    ws.onmessage = handleWebSocketMessage;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [token]);

  const handleWebSocketMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.kind === "chat") {
        const message = data.data || data;
        // Only show messages from managers
        if (message.sender_role === "manager") {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some(m => m.id === message.id)) return prev;
            return [message, ...prev];
          });
          if (!visible) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      }
    } catch (e) {
      console.log("WS parse error:", e);
    }
  };

  const loadMessages = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/chat/messages/`, {
        headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
      });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        // Filter to only manager messages
        const filtered = data.filter(
          (msg) => msg.sender_role === "manager"
        );
        setMessages(filtered);
      }
    } catch (e) {
      console.log("Error loading messages:", e);
    }
  };

  const sendMessage = async () => {
    if (!token || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`${API}/chat/messages/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({ message: newMessage.trim() }),
      });

      if (res.ok) {
        setNewMessage("");
        // Message will come via WebSocket
      } else {
        alert("Failed to send message");
      }
    } catch (e) {
      console.log("Error sending message:", e);
      alert("Network error");
    } finally {
      setSending(false);
    }
  };

  const openChat = () => {
    setVisible(true);
    setUnreadCount(0);
    loadMessages();
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <>
      {/* Chat Bubble Button */}
      <TouchableOpacity style={styles.bubble} onPress={openChat}>
        <Text style={styles.bubbleText}>💬</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal visible={visible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Team Chat</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => {
                if (scrollViewRef.current) {
                  scrollViewRef.current.scrollToEnd({ animated: true });
                }
              }}
            >
              {messages.length === 0 ? (
                <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
              ) : (
                messages.map((msg, idx) => (
                  <View
                    key={msg.id || idx}
                    style={[
                      styles.messageBubble,
                      msg.sender_role === userRole && styles.myMessage,
                    ]}
                  >
                    <Text style={msg.sender_role === userRole ? styles.myMessageSender : styles.messageSender}>
                      {msg.sender} ({msg.sender_role})
                    </Text>
                    <Text style={msg.sender_role === userRole ? styles.myMessageText : styles.messageText}>
                      {msg.message}
                    </Text>
                    <Text style={msg.sender_role === userRole ? styles.myMessageTime : styles.messageTime}>
                      {formatTime(msg.timestamp)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                multiline
                onSubmitEditing={sendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={!newMessage.trim() || sending}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1000,
  },
  bubbleText: {
    fontSize: 24,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "70%",
    maxHeight: 600,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    fontSize: 24,
    color: "#666",
    fontWeight: "300",
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 14,
  },
  messageBubble: {
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    maxWidth: "80%",
  },
  myMessage: {
    backgroundColor: "#4a90e2",
    alignSelf: "flex-end",
  },
  messageSender: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
  },
  myMessageSender: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  myMessageText: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
  },
  myMessageTime: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
    color: "#333",
  },
  sendButton: {
    backgroundColor: "#4a90e2",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
