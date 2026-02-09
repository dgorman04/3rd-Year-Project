// app/player/join-team.jsx - Player join team page
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken } from "../../lib/auth";

export default function PlayerJoinTeam() {
  const [token, setToken] = useState(null);
  const [teamCode, setTeamCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currentTeam, setCurrentTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadCurrentTeam(t);
    })();
  }, []);

  const loadCurrentTeam = async (t) => {
    try {
      const res = await fetch(`${API}/players/me/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.team) {
        setCurrentTeam(data.team);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async () => {
    setError("");
    if (!teamCode.trim() || !playerName.trim()) {
      setError("Team code and player name are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/players/join-team/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({
          team_code: teamCode.trim().toUpperCase(),
          player_name: playerName.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || "Failed to join team.");
        return;
      }

      alert("Successfully joined team!");
      router.replace("/player/stats");
    } catch (err) {
      console.log(err);
      setError("Network error. Please check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!currentTeam) return;
    
    const confirm = await new Promise((resolve) => {
      // In a real app, use a proper confirmation dialog
      alert("Are you sure you want to leave this team?");
      resolve(true);
    });

    setBusy(true);
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

      alert("Successfully left team.");
      setCurrentTeam(null);
      router.replace("/player/dashboard");
    } catch (err) {
      console.log(err);
      alert("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {Platform.OS === "web" && <AppHeader subtitle="Join Team" />}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === "web" && <AppHeader subtitle="Join Team" />}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Current Team */}
        {currentTeam && (
          <View style={styles.currentTeamCard}>
            <Text style={styles.currentTeamTitle}>Current Team</Text>
            <Text style={styles.currentTeamName}>{currentTeam.team_name}</Text>
            <Text style={styles.currentTeamClub}>{currentTeam.club_name}</Text>
            <TouchableOpacity
              style={styles.leaveButton}
              onPress={handleLeaveTeam}
              disabled={busy}
            >
              <Text style={styles.leaveButtonText}>Leave Team</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Join Team Form */}
        {!currentTeam && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join a Team</Text>
            <Text style={styles.cardSubtitle}>
              Enter the team code provided by your manager and your player name
            </Text>

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Team Code</Text>
              <TextInput
                placeholder="Enter team code"
                style={styles.input}
                placeholderTextColor="#9ca3af"
                value={teamCode}
                onChangeText={(text) => setTeamCode(text.toUpperCase())}
                autoCapitalize="characters"
                editable={!busy}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Player Name</Text>
              <TextInput
                placeholder="Your name as it appears in the team roster"
                style={styles.input}
                placeholderTextColor="#9ca3af"
                value={playerName}
                onChangeText={setPlayerName}
                editable={!busy}
              />
              <Text style={styles.helperText}>
                If your name is not in the team roster, you will be added automatically
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.joinButton, busy && styles.joinButtonDisabled]}
              onPress={handleJoinTeam}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.joinButtonText}>Join Team</Text>
              )}
            </TouchableOpacity>
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
    backgroundColor: "#f1f5f9",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  currentTeamCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  currentTeamTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
  },
  currentTeamName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  currentTeamClub: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 20,
  },
  leaveButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  leaveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 24,
  },
  errorContainer: {
    backgroundColor: "#fee2e2",
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: "#e2e8f0",
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    fontWeight: "600",
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 6,
    fontWeight: "600",
  },
  joinButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
