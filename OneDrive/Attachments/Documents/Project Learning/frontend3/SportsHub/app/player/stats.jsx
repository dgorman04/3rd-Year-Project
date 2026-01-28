// app/player/stats.jsx - Player stats page (team stats + own stats only)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import AppHeader from "../../components/AppHeader";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken } from "../../lib/auth";
import { router } from "expo-router";

const ALL_EVENTS = [
  "shots_on_target",
  "shots_off_target",
  "key_passes",
  "duels_won",
  "duels_lost",
  "fouls",
  "interceptions",
  "blocks",
  "tackles",
  "clearances",
];

export default function PlayerStats() {
  const [token, setToken] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadData(t);
    })();
  }, []);

  const loadData = async (t) => {
    try {
      setLoading(true);

      // Load player profile and stats
      const profileRes = await fetch(`${API}/players/me/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const profileData = await profileRes.json().catch(() => ({}));
      if (profileRes.ok) {
        setPlayerData(profileData);
      }

      // Load team stats
      const statsRes = await fetch(`${API}/stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const statsData = await statsRes.json().catch(() => []);
      if (statsRes.ok) {
        setTeamStats(Array.isArray(statsData) ? statsData : []);
      }

      // Load team performance stats (goals, matches, etc.)
      const perfRes = await fetch(`${API}/teams/performance-stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const perfData = await perfRes.json().catch(() => ({}));
      if (perfRes.ok) {
        setTeamPerformance(perfData);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh data
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      loadData(token);
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader subtitle="My Stats" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={[styles.loadingText, { marginTop: 12 }]}>Loading stats...</Text>
        </View>
      </View>
    );
  }

  if (!playerData || !playerData.player) {
    return (
      <View style={styles.container}>
        <AppHeader subtitle="My Stats" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No team assigned. Please join a team first.</Text>
        </View>
      </View>
    );
  }

  const performance = playerData.performance || {};
  const player = playerData.player || {};
  const team = playerData.team || {};

  // Calculate team totals
  const teamTotals = {};
  if (teamStats && Array.isArray(teamStats)) {
    teamStats.forEach((stat) => {
      teamTotals[stat.event] = (teamTotals[stat.event] || 0) + (stat.count || 0);
    });
  }

  return (
    <View style={styles.container}>
      <AppHeader subtitle="My Stats" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Player Info */}
        <View style={[styles.card, { marginBottom: 16 }]}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.teamName}>{team.team_name || "No Team"}</Text>
          <Text style={styles.roleText}>PLAYER</Text>
        </View>

        {/* My Performance Stats */}
        <View style={[styles.card, { marginBottom: 16 }]}>
          <Text style={styles.sectionTitle}>My Performance</Text>
          <View style={styles.statsGrid}>
            {ALL_EVENTS.map((event) => {
              const stat = performance[event] || {};
              const total = stat.total || 0;
              const matches = stat.matches || 0;
              const avg = stat.average_per_match || 0;

              return (
                <View key={event} style={styles.statItem}>
                  <Text style={styles.statLabel}>{event.replace("_", " ").toUpperCase()}</Text>
                  <Text style={styles.statValue}>{total}</Text>
                  {matches > 0 && (
                    <>
                      <Text style={styles.statSubtext}>{avg.toFixed(1)} avg/match</Text>
                      <Text style={styles.statSubtext}>{matches} matches</Text>
                    </>
                  )}
                  {matches === 0 && (
                    <Text style={styles.statSubtext}>No data yet</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Team Overall Stats */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Team Overall Stats</Text>
          <View style={styles.teamStatsList}>
            {ALL_EVENTS.map((event) => {
              const teamTotal = teamTotals[event] || 0;
              const myTotal = performance[event]?.total || 0;
              const percentage = teamTotal > 0 ? ((myTotal / teamTotal) * 100).toFixed(1) : 0;

              return (
                <View key={event} style={styles.teamStatItem}>
                  <View style={styles.teamStatRow}>
                    <Text style={styles.teamStatLabel}>{event.replace("_", " ").toUpperCase()}</Text>
                    <Text style={styles.teamStatValue}>You: {myTotal}</Text>
                  </View>
                  <View style={styles.teamStatRow}>
                    <Text style={styles.teamStatValue}>Team: {teamTotal}</Text>
                  </View>
                  {teamTotal > 0 && (
                    <>
                      <View style={styles.progressBarContainer}>
                        <View
                          style={[
                            styles.progressBar,
                            { width: `${Math.min(percentage, 100)}%` }
                          ]}
                        />
                      </View>
                      <Text style={styles.percentageText}>{percentage}% of team total</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>
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
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  playerName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  teamName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  statItem: {
    width: "30%",
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    margin: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
    textAlign: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  statSubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  overviewItem: {
    width: "30%",
    padding: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    margin: 6,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
    textAlign: "center",
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  positiveValue: {
    color: "#10b981",
  },
  negativeValue: {
    color: "#ef4444",
  },
  formationText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 16,
    textAlign: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  teamStatsList: {
  },
  teamStatItem: {
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  teamStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  teamStatLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  teamStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  progressBarContainer: {
    width: "100%",
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 6,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 4,
  },
  percentageText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textAlign: "right",
  },
});
