// app/profile.jsx - User profile page showing team code
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import AppHeader from "../components/AppHeader";
import { API, ngrokHeaders } from "../lib/config";
import { getToken, clearToken } from "../lib/auth";

export default function Profile() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadProfile(t);
    })();
  }, []);

  const loadProfile = async (t) => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/auth/me/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser(data);
        setTeam(data.team);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !token) {
    return (
      <View style={styles.container}>
        <AppHeader subtitle="Profile" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader subtitle="Profile" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user?.email || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role:</Text>
            <Text style={styles.infoValue}>{user?.role || "N/A"}</Text>
          </View>
        </View>

        {/* Team Info */}
        {team && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Team Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Club:</Text>
              <Text style={styles.infoValue}>{team.club_name || "N/A"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Team:</Text>
              <Text style={styles.infoValue}>{team.team_name || "N/A"}</Text>
            </View>
            
            {/* Team Code Section - Prominent for Managers and Analysts */}
            {team.team_code && (user?.role === "manager" || user?.role === "analyst") && (
              <View style={styles.teamCodeSection}>
                <Text style={styles.teamCodeLabel}>🔑 Team Access Code</Text>
                <Text style={styles.teamCodeDescription}>
                  Share this code with players so they can join your team and view stats
                </Text>
                <View style={styles.teamCodeBox}>
                  <Text style={styles.teamCodeValue}>{team.team_code}</Text>
                </View>
                <View style={styles.teamCodeInfo}>
                  <Text style={styles.teamCodeInfoText}>
                    Players can use this code to join your team and access:
                  </Text>
                  <Text style={styles.teamCodeInfoItem}>• Team overall statistics</Text>
                  <Text style={styles.teamCodeInfoItem}>• Their individual performance stats</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "normal",
    color: "#666",
  },
  content: {
    padding: 12,
    gap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "normal",
    color: "#333",
  },
  teamCodeSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  teamCodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  teamCodeDescription: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 12,
    lineHeight: 18,
  },
  teamCodeBox: {
    backgroundColor: "#4a90e2",
    borderRadius: 6,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  teamCodeValue: {
    fontSize: 28,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: 2,
  },
  teamCodeInfo: {
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#4a90e2",
  },
  teamCodeInfoText: {
    fontSize: 11,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 6,
  },
  teamCodeInfoItem: {
    fontSize: 11,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 3,
    marginLeft: 6,
  },
});
