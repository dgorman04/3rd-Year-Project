// app/profile.jsx - User profile page showing team code
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from "react-native";
import { router } from "expo-router";
import AppLayout from "../components/AppLayout";
import { API, ngrokHeaders } from "../lib/config";
import { getToken, clearToken } from "../lib/auth";

export default function Profile() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

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

  const handleLogout = async () => {
    await clearToken();
    router.replace("/");
  };

  const handleLeaveTeam = async () => {
    if (!team || user?.role !== "player") return;
    Alert.alert(
      "Leave team",
      "Are you sure you want to leave this team? You can rejoin later with the team code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave team",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            try {
              const res = await fetch(`${API}/players/leave-team/`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  ...ngrokHeaders(),
                },
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                alert(data?.detail || "Failed to leave team.");
                return;
              }
              setTeam(null);
              // Go to home (team stats landing); they will see join CTA and no stats until they rejoin
              router.replace("/home");
            } catch (err) {
              alert("Network error.");
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !token) {
    return (
      <AppLayout>
        <View style={styles.container}>
          {Platform.OS === "web" && (
            <View style={styles.webHeader}>
              <Text style={styles.webTitle}>Profile</Text>
              <Text style={styles.webSubtitle}>Account and team information</Text>
            </View>
          )}
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <View style={styles.container}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <Text style={styles.webTitle}>Profile</Text>
            <Text style={styles.webSubtitle}>Account and team information</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* User Info */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Account Information</Text>
              <Text style={styles.cardSubtitle}>Your account details</Text>
            </View>
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email || "N/A"}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Role</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>
                    {(user?.role || "N/A").charAt(0).toUpperCase() + (user?.role || "N/A").slice(1)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Team Info */}
          {team && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Team Information</Text>
                <Text style={styles.cardSubtitle}>Your team details</Text>
              </View>
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Club</Text>
                  <Text style={styles.infoValue}>{team.club_name || "N/A"}</Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Team</Text>
                  <Text style={styles.infoValue}>{team.team_name || "N/A"}</Text>
                </View>
              </View>
              
              {/* Team Code Section - Prominent for Managers and Analysts */}
              {team.team_code && (user?.role === "manager" || user?.role === "analyst") && (
                <View style={styles.teamCodeSection}>
                  <View style={styles.teamCodeHeader}>
                    <Text style={styles.teamCodeLabel}>Team Access Code</Text>
                    <Text style={styles.teamCodeDescription}>
                      Share this code with players so they can join your team and view statistics
                    </Text>
                  </View>
                  <View style={styles.teamCodeBox}>
                    <Text style={styles.teamCodeValue}>{team.team_code}</Text>
                  </View>
                  <View style={styles.teamCodeInfo}>
                    <Text style={styles.teamCodeInfoTitle}>Players can use this code to:</Text>
                    <View style={styles.teamCodeInfoList}>
                      <Text style={styles.teamCodeInfoItem}>• Join your team</Text>
                      <Text style={styles.teamCodeInfoItem}>• View team overall statistics</Text>
                      <Text style={styles.teamCodeInfoItem}>• Access their individual performance stats</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Leave team - only for players, only when in a team */}
              {user?.role === "player" && (
                <View style={styles.leaveTeamSection}>
                  <TouchableOpacity
                    style={[styles.leaveTeamButton, leaving && styles.leaveTeamButtonDisabled]}
                    onPress={handleLeaveTeam}
                    disabled={leaving}
                  >
                    <Text style={styles.leaveTeamButtonText}>
                      {leaving ? "Leaving…" : "Leave team"}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.leaveTeamHint}>You can rejoin later with the team code.</Text>
                </View>
              )}
            </View>
          )}

          {/* Logout Section */}
          <View style={styles.logoutCard}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </TouchableOpacity>
            <Text style={styles.logoutHint}>You will be redirected to the login page</Text>
          </View>
        </ScrollView>
      </View>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  webHeader: {
    padding: 24,
    paddingTop: Platform.OS === "web" ? 24 : 60,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  webTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  webSubtitle: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  content: {
    padding: 24,
    paddingBottom: 32,
    gap: 16,
    maxWidth: Platform.OS === "web" ? 720 : "100%",
    alignSelf: Platform.OS === "web" ? "center" : "stretch",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
  },
  infoSection: {
    gap: 0,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  infoDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#0f172a",
  },
  roleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "capitalize",
  },
  teamCodeSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  teamCodeHeader: {
    marginBottom: 16,
  },
  teamCodeLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  teamCodeDescription: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    lineHeight: 18,
  },
  teamCodeBox: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  teamCodeValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  teamCodeInfo: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#0f172a",
  },
  teamCodeInfoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  teamCodeInfoList: {
    gap: 6,
  },
  teamCodeInfoItem: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4b5563",
    lineHeight: 20,
  },
  leaveTeamSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  leaveTeamButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  leaveTeamButtonDisabled: { opacity: 0.6 },
  leaveTeamButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  leaveTeamHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  logoutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: "center",
  },
  logoutButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  logoutHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
    marginTop: 12,
    textAlign: "center",
  },
});
