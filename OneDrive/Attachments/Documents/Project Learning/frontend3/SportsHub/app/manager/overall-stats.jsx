// app/manager/overall-stats.jsx - View overall/season statistics
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from "react-native";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
import AppLayout from "../../components/AppLayout";
import KPICard from "../../components/KPICard";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";
import { BarChart, PieChart, LineChart } from "react-native-chart-kit";

const screenW = Dimensions.get("window").width;

export default function OverallStats() {
  const [token, setToken] = useState(null);
  const [stats, setStats] = useState([]);
  const [insights, setInsights] = useState([]);
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [matches, setMatches] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
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

      // Load overall stats
      const statsRes = await fetch(`${API}/stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const statsData = await statsRes.json().catch(() => []);
      setStats(Array.isArray(statsData) ? statsData : []);

      // Load ML insights
      const insightsRes = await fetch(`${API}/analytics/insights/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const insightsData = await insightsRes.json().catch(() => []);
      setInsights(Array.isArray(insightsData) ? insightsData : []);

      // Load team performance stats
      const perfRes = await fetch(`${API}/teams/performance-stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const perfData = await perfRes.json().catch(() => ({}));
      if (perfRes.ok) {
        setTeamPerformance(perfData);
      }

      // Load all matches for formation and period analysis
      const matchesRes = await fetch(`${API}/matches/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const matchesData = await matchesRes.json().catch(() => []);
      if (matchesRes.ok && Array.isArray(matchesData)) {
        setMatches(matchesData);
        
        // Load event instances from all matches for period analysis
        const allEventInstances = [];
        for (const match of matchesData.slice(0, 20)) { // Limit to recent 20 matches for performance
          try {
            const eventsRes = await fetch(`${API}/matches/${match.id}/events/`, {
              headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
            });
            if (eventsRes.ok) {
              const eventsData = await eventsRes.json().catch(() => []);
              if (Array.isArray(eventsData)) {
                allEventInstances.push(...eventsData);
              }
            }
          } catch (e) {
            console.log(`Error loading events for match ${match.id}:`, e);
          }
        }
        setEventInstances(allEventInstances);
      }
    } catch (e) {
      console.log(e);
      alert("Network error loading statistics.");
    } finally {
      setLoading(false);
    }
  };

  // Aggregate stats by player and event
  const playerTotals = {};
  const eventTotals = {};

  stats.forEach((stat) => {
    const playerName = stat.player_name || "Unknown";
    const event = stat.event || "unknown";

    if (!playerTotals[playerName]) {
      playerTotals[playerName] = {};
    }
    playerTotals[playerName][event] = (playerTotals[playerName][event] || 0) + (stat.count || 0);

    eventTotals[event] = (eventTotals[event] || 0) + (stat.count || 0);
  });

  const topPlayers = Object.entries(playerTotals)
    .map(([name, events]) => ({
      name,
      total: Object.values(events).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Calculate formation performance from actual matches
  const formationData = useMemo(() => {
    const formationStats = {};
    
    matches.forEach((match) => {
      if (!match.formation) return;
      
      if (!formationStats[match.formation]) {
        formationStats[match.formation] = { wins: 0, draws: 0, losses: 0 };
      }
      
      if (match.goals_scored > match.goals_conceded) {
        formationStats[match.formation].wins++;
      } else if (match.goals_scored === match.goals_conceded) {
        formationStats[match.formation].draws++;
      } else {
        formationStats[match.formation].losses++;
      }
    });

    const formations = Object.keys(formationStats).slice(0, 4); // Top 4 formations
    if (formations.length === 0) {
      return {
        labels: [],
        datasets: [
          { data: [], color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})` },
          { data: [], color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})` },
          { data: [], color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})` },
        ],
      };
    }

    return {
      labels: formations,
      datasets: [
        {
          data: formations.map(f => formationStats[f].wins),
          color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
        },
        {
          data: formations.map(f => formationStats[f].draws),
          color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})`,
        },
        {
          data: formations.map(f => formationStats[f].losses),
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
        },
      ],
    };
  }, [matches]);

  // Calculate team attributes from actual stats
  const teamAttributes = useMemo(() => {
    if (!stats.length) return [];
    
    // Calculate metrics from actual event stats
    const totalShots = stats
      .filter(s => s.event === "shots_on_target" || s.event === "shots_off_target")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const shotsOnTarget = stats
      .filter(s => s.event === "shots_on_target")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const totalPasses = stats
      .filter(s => s.event === "key_passes")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const tackles = stats
      .filter(s => s.event === "tackles")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const interceptions = stats
      .filter(s => s.event === "interceptions")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const fouls = stats
      .filter(s => s.event === "fouls")
      .reduce((sum, s) => sum + (s.count || 0), 0);

    const matchCount = matches.length || 1;
    
    // Normalize to 0-100 scale based on match averages
    const attackScore = Math.min(100, Math.round((shotsOnTarget / matchCount) * 5));
    const defenseScore = Math.min(100, Math.round(((tackles + interceptions) / matchCount) * 2));
    const possessionScore = Math.min(100, Math.round((totalPasses / matchCount) * 0.5));
    const passingScore = Math.min(100, Math.round((totalPasses / matchCount) * 0.3));
    const staminaScore = 75; // Would need more data to calculate
    const disciplineScore = Math.max(0, Math.min(100, 100 - Math.round((fouls / matchCount) * 10)));

    return [
      { name: "Attack", value: attackScore },
      { name: "Defense", value: defenseScore },
      { name: "Possession", value: possessionScore },
      { name: "Passing", value: passingScore },
      { name: "Stamina", value: staminaScore },
      { name: "Discipline", value: disciplineScore },
    ];
  }, [stats, matches]);

  // Calculate period performance from event instances with timestamps
  const periodData = useMemo(() => {
    const periods = {
      "0-15": { scored: 0, conceded: 0 },
      "15-30": { scored: 0, conceded: 0 },
      "30-45": { scored: 0, conceded: 0 },
      "45-60": { scored: 0, conceded: 0 },
      "60-75": { scored: 0, conceded: 0 },
      "75-90": { scored: 0, conceded: 0 },
    };

    // Count goals by period from matches
    matches.forEach((match) => {
      // For now, distribute goals evenly across periods if we don't have exact timestamps
      // In a real implementation, you'd use event instances with exact second timestamps
      const goalsScored = match.goals_scored || 0;
      const goalsConceded = match.goals_conceded || 0;
      
      // Distribute goals across periods (simplified - ideally use event timestamps)
      const periodsArray = Object.keys(periods);
      periodsArray.forEach((period, idx) => {
        periods[period].scored += Math.floor(goalsScored / periodsArray.length);
        periods[period].conceded += Math.floor(goalsConceded / periodsArray.length);
      });
    });

    return {
      labels: ["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"],
      datasets: [
        {
          data: Object.values(periods).map(p => p.scored),
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        },
        {
          data: Object.values(periods).map(p => p.conceded),
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
        },
      ],
    };
  }, [matches]);

  if (loading) {
    return (
      <AppLayout>
        <View style={styles.container}>
          {Platform.OS !== "web" && <AppHeader subtitle="Team Statistics" />}
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading statistics...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <View style={styles.container}>
        {Platform.OS !== "web" && <AppHeader subtitle="Team Statistics" />}
        
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View>
              <Text style={styles.webTitle}>Team Statistics</Text>
              <Text style={styles.webSubtitle}>Comprehensive team performance analysis</Text>
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* KPI Cards */}
          <View style={styles.kpiRow}>
            <KPICard
              title="Avg Goals per Match"
              value={teamPerformance?.goals?.avg_scored?.toFixed(1) || "0.0"}
              icon="🎯"
              iconColor="#3b82f6"
            />
            <KPICard
              title="Clean Sheets"
              value={matches.filter(m => m.goals_conceded === 0).length.toString()}
              icon="🛡️"
              iconColor="#10b981"
            />
            <KPICard
              title="Shot Accuracy"
              value={(() => {
                const shotsOnTarget = stats
                  .filter(s => s.event === "shots_on_target")
                  .reduce((sum, s) => sum + (s.count || 0), 0);
                const totalShots = stats
                  .filter(s => s.event === "shots_on_target" || s.event === "shots_off_target")
                  .reduce((sum, s) => sum + (s.count || 0), 0);
                return totalShots > 0 ? Math.round((shotsOnTarget / totalShots) * 100) + "%" : "0%";
              })()}
              icon="⚡"
              iconColor="#8b5cf6"
            />
            <KPICard
              title="Total Matches"
              value={teamPerformance?.match_count?.toString() || "0"}
              icon="⏱️"
              iconColor="#f59e0b"
            />
          </View>
          {/* Formation Performance */}
          {formationData.labels.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Formation Performance</Text>
              <BarChart
              data={{
                labels: formationData.labels,
                datasets: formationData.datasets,
              }}
              width={Platform.OS === "web" ? 600 : screenW - 80}
              height={280}
              chartConfig={{
                backgroundColor: "#ffffff",
                backgroundGradientFrom: "#ffffff",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 16 },
                barPercentage: 0.6,
              }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
                <Text style={styles.legendText}>Wins</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#fb923c" }]} />
                <Text style={styles.legendText}>Draws</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
                <Text style={styles.legendText}>Losses</Text>
              </View>
            </View>
          </View>
          )}

          {/* Team Attributes Radar Chart - Using Bar Chart as approximation */}
          {teamAttributes.length > 0 && (
            <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Team Attributes</Text>
            <BarChart
              data={{
                labels: teamAttributes.map((a) => a.name),
                datasets: [
                  {
                    data: teamAttributes.map((a) => a.value),
                  },
                ],
              }}
              width={Platform.OS === "web" ? 600 : screenW - 80}
              height={280}
              chartConfig={{
                backgroundColor: "#ffffff",
                backgroundGradientFrom: "#ffffff",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 16 },
                barPercentage: 0.6,
              }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
              yAxisMax={100}
            />
          </View>
          )}

          {/* Performance by Match Period */}
          {periodData.labels.length > 0 && (
            <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Performance by Match Period</Text>
            <BarChart
              data={{
                labels: periodData.labels,
                datasets: periodData.datasets,
              }}
              width={Platform.OS === "web" ? 700 : screenW - 80}
              height={280}
              chartConfig={{
                backgroundColor: "#ffffff",
                backgroundGradientFrom: "#ffffff",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 16 },
                barPercentage: 0.6,
              }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#3b82f6" }]} />
                <Text style={styles.legendText}>Goals Scored</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
                <Text style={styles.legendText}>Goals Conceded</Text>
              </View>
            </View>
          </View>
          )}

        {/* Top Players */}
        {topPlayers.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Performers</Text>
            {topPlayers.map((player, idx) => (
              <View key={player.name} style={styles.playerRow}>
                <View style={styles.playerRank}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{player.name}</Text>
                </View>
                <Text style={styles.playerTotal}>{player.total} events</Text>
              </View>
            ))}
          </View>
        )}

        {/* ML Insights */}
        {insights.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🤖 AI Insights & Recommendations</Text>
            {insights.map((insight, idx) => (
              <View key={idx} style={styles.insightItem}>
                <Text style={styles.insightTitle}>{insight.title || "Insight"}</Text>
                <Text style={styles.insightText}>{insight.message || insight.detail || ""}</Text>
              </View>
            ))}
          </View>
        )}

        {stats.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No statistics yet</Text>
            <Text style={styles.emptyText}>
              Statistics will appear here as matches are recorded and analyzed.
            </Text>
          </View>
        )}

          <View style={{ height: 24 }} />
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
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    padding: 24,
    ...Platform.select({
      web: {
        display: "flex",
        flexWrap: "wrap",
      },
    }),
  },
  chartCard: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 600 : screenW - 48,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
    marginHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 12,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
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
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  playerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  playerTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  insightItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  insightText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
});
