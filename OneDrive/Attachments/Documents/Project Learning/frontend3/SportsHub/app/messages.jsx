// app/messages.jsx - Redirects to section-specific Team Chat so navbar stays in current section
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { API, ngrokHeaders } from "../lib/config";
import { getToken } from "../lib/auth";

export default function Messages() {
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      try {
        const res = await fetch(`${API}/auth/me/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        const data = await res.json().catch(() => ({}));
        const role = res.ok ? (data.role || "manager") : "manager";
        if (role === "analyst") {
          router.replace("/analyst/messages");
        } else {
          router.replace("/manager/messages");
        }
      } catch (e) {
        router.replace("/manager/messages");
      }
      setRedirecting(false);
    })();
  }, []);

  if (redirecting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={styles.text}>Opening Team Chat...</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    gap: 16,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
  },
});
