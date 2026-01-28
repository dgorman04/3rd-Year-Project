// app/player/dashboard.jsx - Player dashboard (view own profile and team stats)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";

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

export default function PlayerDashboard() {
  const [token, setToken] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [mlRecommendations, setMlRecommendations] = useState(null);
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

  // Auto-refresh data when screen comes into focus
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      loadData(token);
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [token]);

  const loadData = async (t) => {
    try {
      // Don't set loading to true on refresh - only on initial load
      if (!playerData) {
        setLoading(true);
      }

      // Load player profile
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

      // Load team performance stats (goals, matches, etc.) - TEAM LEVEL, not player level
      // Same endpoint as manager dashboard: /api/teams/performance-stats/
      try {
        const perfRes = await fetch(`${API}/teams/performance-stats/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        if (perfRes.ok) {
          const perfData = await perfRes.json().catch(() => ({}));
          console.log("Player Dashboard - Team Performance Data:", perfData);
          console.log("Team Goals Scored:", perfData?.goals?.scored);
          console.log("Team Goals Conceded:", perfData?.goals?.conceded);
          setTeamPerformance(perfData);
        } else {
          const errorData = await perfRes.json().catch(() => ({}));
          console.log("Failed to load team performance:", perfRes.status, errorData);
        }
      } catch (e) {
        console.log("Team performance fetch error:", e);
      }

      // Load ML recommendations
      if (profileData?.player?.id) {
        const mlRes = await fetch(`${API}/ml/performance-improvement/?player_id=${profileData.player.id}`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        const mlData = await mlRes.json().catch(() => ({}));
        if (mlRes.ok) {
          setMlRecommendations(mlData);
        }
      }
    } catch (e) {
      console.log("Error loading data:", e);
      if (!playerData) {
        alert("Network error loading data.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await clearToken();
    router.replace("/");
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader subtitle="Player Dashboard" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={[styles.loadingText, { marginTop: 12 }]}>Loading...</Text>
        </View>
      </View>
    );
  }

  // If no player data or no team, show join team option
  if (!playerData || !playerData.player || !playerData.team) {
    return (
      <View style={styles.container}>
        <AppHeader subtitle="Player Dashboard" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome!</Text>
            <Text style={styles.cardDescription}>
              Join a team to start viewing your stats and team performance.
            </Text>
            <TouchableOpacity
              style={styles.joinTeamButton}
              onPress={() => router.push("/player/join-team")}
            >
              <Text style={styles.joinTeamButtonText}>Join Team</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const performance = playerData.performance || {};
  const player = playerData.player || {};

  return (
    <View style={styles.container}>
      <AppHeader subtitle="Player Dashboard" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Player Profile Card */}
        <View style={[styles.card, { marginBottom: 16 }]}>
          <Text style={styles.cardTitle}>My Profile</Text>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.teamName}>{player.team?.team_name || "No team"}</Text>
        </View>

        {/* Performance Stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Performance</Text>
          <View style={styles.statsGrid}>
            {ALL_EVENTS.map((event) => {
              const stat = performance[event] || {};
              return (
                <View key={event} style={styles.statItem}>
                  <Text style={styles.statLabel}>{event.replace("_", " ")}</Text>
                  <Text style={styles.statValue}>{stat.total || 0}</Text>
                  {stat.matches > 0 && (
                    <Text style={styles.statSubtext}>
                      {stat.average_per_match?.toFixed(1) || 0} per match
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ML Recommendations */}
        {mlRecommendations && mlRecommendations.recommendations && (
          <View style={[styles.card, { marginBottom: 16 }]}>
            <Text style={styles.cardTitle}>Performance Recommendations</Text>
            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Overall Score</Text>
                <Text style={styles.metricValue}>
                  {mlRecommendations.performance_metrics?.overall_score || 0}
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Duel Win Rate</Text>
                <Text style={styles.metricValue}>
                  {mlRecommendations.performance_metrics?.duel_win_rate || 0}%
                </Text>
              </View>
            </View>

            {mlRecommendations.recommendations.map((rec, idx) => (
              <View key={idx} style={styles.recommendationItem}>
                <View style={styles.recommendationHeader}>
                  <Text style={styles.recommendationTitle}>{rec.title}</Text>
                  <View style={[
                    styles.priorityBadge,
                    rec.priority === "High" && styles.priorityHigh
                  ]}>
                    <Text style={styles.priorityText}>{rec.priority}</Text>
                  </View>
                </View>
                <Text style={styles.recommendationMessage}>{rec.message}</Text>
                <Text style={styles.recommendationCategory}>{rec.category}</Text>
                {rec.action_items && rec.action_items.length > 0 && (
                  <View style={styles.actionItems}>
                    {rec.action_items.map((item, i) => (
                      <Text key={i} style={styles.actionItem}>• {item}</Text>
                    ))}
                  </View>
                )}
                {rec.expected_improvement && (
                  <Text style={styles.expectedImprovement}>
                    Expected: {rec.expected_improvement}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Join Team Section */}
        {!playerData?.team && (
          <View style={[styles.card, { marginBottom: 16 }]}>
            <Text style={styles.cardTitle}>Join a Team</Text>
            <Text style={styles.cardDescription}>
              You're not currently on a team. Join a team to see your stats and performance.
            </Text>
            <TouchableOpacity
              style={styles.joinTeamButton}
              onPress={() => router.push("/player/join-team")}
            >
              <Text style={styles.joinTeamButtonText}>Join Team</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* If on team, show link to stats */}
        {playerData?.team && (
          <View style={[styles.card, { marginBottom: 16 }]}>
            <Text style={styles.cardTitle}>View Your Stats</Text>
            <Text style={styles.cardDescription}>
              See your performance and team statistics
            </Text>
            <TouchableOpacity
              style={styles.statsButton}
              onPress={() => router.push("/player/stats")}
            >
              <Text style={styles.statsButtonText}>View Stats</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Team Overview */}
        {teamPerformance && (
          <View style={styles.teamOverviewCard}>
            <Text style={styles.sectionTitle}>Team Overview</Text>
            <View style={styles.overviewGrid}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>Matches</Text>
                <Text style={styles.overviewValue}>{teamPerformance.match_count || 0}</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>Goals Scored</Text>
                <Text style={styles.overviewValue}>{teamPerformance.goals?.scored || 0}</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>Goals Conceded</Text>
                <Text style={styles.overviewValue}>{teamPerformance.goals?.conceded || 0}</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>Goal Difference</Text>
                <Text style={[styles.overviewValue, (teamPerformance.goals?.difference || 0) >= 0 ? styles.positiveValue : styles.negativeValue]}>
                  {teamPerformance.goals?.difference >= 0 ? '+' : ''}{teamPerformance.goals?.difference || 0}
                </Text>
              </View>
              {teamPerformance.record && (
                <>
                  <View style={styles.overviewItem}>
                    <Text style={styles.overviewLabel}>Wins</Text>
                    <Text style={styles.overviewValue}>{teamPerformance.record.wins || 0}</Text>
                  </View>
                  <View style={styles.overviewItem}>
                    <Text style={styles.overviewLabel}>Draws</Text>
                    <Text style={styles.overviewValue}>{teamPerformance.record.draws || 0}</Text>
                  </View>
                  <View style={styles.overviewItem}>
                    <Text style={styles.overviewLabel}>Losses</Text>
                    <Text style={styles.overviewValue}>{teamPerformance.record.losses || 0}</Text>
                  </View>
                  <View style={styles.overviewItem}>
                    <Text style={styles.overviewLabel}>Points</Text>
                    <Text style={styles.overviewValue}>{teamPerformance.record.points || 0}</Text>
                  </View>
                </>
              )}
            </View>
            {teamPerformance.most_used_formation && (
              <Text style={styles.formationText}>Most Used Formation: {teamPerformance.most_used_formation}</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

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
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 16,
  },
  cardDescription: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  playerName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statItem: {
    width: "30%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    margin: 6,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  statSubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    margin: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
  },
  recommendationItem: {
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  recommendationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    flex: 1,
  },
  priorityBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityHigh: {
    backgroundColor: "#fee2e2",
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
  },
  recommendationMessage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
    lineHeight: 20,
  },
  recommendationCategory: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3b82f6",
    marginBottom: 8,
  },
  actionItems: {
    marginTop: 8,
  },
  actionItem: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 4,
    lineHeight: 18,
  },
  expectedImprovement: {
    fontSize: 12,
    fontWeight: "800",
    color: "#10b981",
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ef4444",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  joinTeamButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  joinTeamButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  statsButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  statsButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  teamOverviewCard: {
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
    marginBottom: 16,
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  overviewItem: {
    width: "30%",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 14,
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
});
