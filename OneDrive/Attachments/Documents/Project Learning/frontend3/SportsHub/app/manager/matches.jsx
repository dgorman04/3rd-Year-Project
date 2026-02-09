// app/manager/matches.jsx
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Dimensions } from "react-native";
import { router } from "expo-router";

import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";
import AppLayout from "../../components/AppLayout";
import { LineChart } from "react-native-chart-kit";

const screenW = Dimensions.get("window").width;

export default function ManagerMatches() {
  const [token, setToken] = useState(null);
  const [allMatches, setAllMatches] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (t, season = null) => {
    try {
      setLoading(true);

      const url = season ? `${API}/matches/?season=${encodeURIComponent(season)}` : `${API}/matches/`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try { data = JSON.parse(raw); } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        alert(data?.detail || "Failed to load matches.");
        return;
      }

      setAllMatches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log(e);
      alert("Network error loading matches.");
    } finally {
      setLoading(false);
    }
  };
  
  // Load all matches first to get available seasons
  const loadAllMatches = async (t) => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/matches/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try { data = JSON.parse(raw); } catch {}

      if (res.ok) {
        setAllMatches(Array.isArray(data) ? data : []);
      } else {
        if (res.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        console.log("Failed to load matches:", data?.detail || res.statusText);
      }
    } catch (e) {
      console.log("Error loading matches:", e);
    } finally {
      setLoading(false);
    }
  };
  
  // Get available seasons from all matches
  const availableSeasons = useMemo(() => {
    const seasons = new Set();
    allMatches.forEach(m => {
      if (m.season) {
        seasons.add(m.season);
      }
    });
    return Array.from(seasons).sort().reverse();
  }, [allMatches]);
  
  // Filter matches by selected season
  const matches = useMemo(() => {
    if (!selectedSeason) return allMatches;
    return allMatches.filter(m => m.season === selectedSeason);
  }, [allMatches, selectedSeason]);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      if (!t) {
        router.replace("/");
        return;
      }
      await loadAllMatches(t);
    })();
  }, []);

  // Calculate form chart data (last 10 matches) from actual match results
  const formData = useMemo(() => {
    const recentMatches = matches.slice(0, 10).reverse();
    const formValues = recentMatches.map((m) => {
      if (m.goals_scored > m.goals_conceded) return 3; // Win
      if (m.goals_scored === m.goals_conceded) return 1; // Draw
      return 0; // Loss
    });
    
    if (formValues.length === 0) {
      return {
        labels: [],
        datasets: [{
          data: [],
          color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
          strokeWidth: 3,
        }],
      };
    }
    
    return {
      labels: formValues.map((_, i) => `GW${i + 1}`),
      datasets: [{
        data: formValues,
        color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
        strokeWidth: 3,
      }],
    };
  }, [matches]);
  
  // Calculate match statistics
  const matchStats = useMemo(() => {
    if (matches.length === 0) return null;
    
    const wins = matches.filter(m => m.goals_scored > m.goals_conceded).length;
    const draws = matches.filter(m => m.goals_scored === m.goals_conceded).length;
    const losses = matches.filter(m => m.goals_scored < m.goals_conceded).length;
    const totalGoals = matches.reduce((sum, m) => sum + (m.goals_scored || 0), 0);
    const totalConceded = matches.reduce((sum, m) => sum + (m.goals_conceded || 0), 0);
    const totalXG = matches.reduce((sum, m) => sum + (parseFloat(m.xg || 0)), 0);
    
    return {
      wins,
      draws,
      losses,
      totalGoals,
      totalConceded,
      totalXG: totalXG.toFixed(2),
      goalDifference: totalGoals - totalConceded,
    };
  }, [matches]);

  if (!token) return null;

  return (
    <AppLayout>
      <View style={styles.screen}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.webTitle}>Match Analysis</Text>
                <Text style={styles.webSubtitle}>Recent matches and performance trends</Text>
              </View>
              {availableSeasons.length > 0 && (
                <View style={styles.seasonSelector}>
                  <Text style={styles.seasonLabel}>Season:</Text>
                  <View style={styles.seasonButtons}>
                    <TouchableOpacity
                      style={[styles.seasonButton, !selectedSeason && styles.seasonButtonActive]}
                      onPress={() => setSelectedSeason(null)}
                    >
                      <Text style={[styles.seasonButtonText, !selectedSeason && styles.seasonButtonTextActive]}>
                        All
                      </Text>
                    </TouchableOpacity>
                    {availableSeasons.map(season => (
                      <TouchableOpacity
                        key={season}
                        style={[styles.seasonButton, selectedSeason === season && styles.seasonButtonActive]}
                        onPress={() => setSelectedSeason(season)}
                      >
                        <Text style={[styles.seasonButtonText, selectedSeason === season && styles.seasonButtonTextActive]}>
                          {season}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
        
        <ScrollView contentContainerStyle={styles.content}>
          {/* Season Selector - Mobile */}
          {Platform.OS !== "web" && availableSeasons.length > 0 && (
            <View style={styles.mobileSeasonSelector}>
              <Text style={styles.mobileSeasonLabel}>Filter by Season</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileSeasonScroll}>
                <View style={styles.mobileSeasonButtons}>
                  <TouchableOpacity
                    style={[styles.mobileSeasonButton, !selectedSeason && styles.mobileSeasonButtonActive]}
                    onPress={() => setSelectedSeason(null)}
                  >
                    <Text style={[styles.mobileSeasonButtonText, !selectedSeason && styles.mobileSeasonButtonTextActive]}>
                      All
                    </Text>
                  </TouchableOpacity>
                  {availableSeasons.map(season => (
                    <TouchableOpacity
                      key={season}
                      style={[styles.mobileSeasonButton, selectedSeason === season && styles.mobileSeasonButtonActive]}
                      onPress={() => setSelectedSeason(season)}
                    >
                      <Text style={[styles.mobileSeasonButtonText, selectedSeason === season && styles.mobileSeasonButtonTextActive]}>
                        {season}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          
          {/* Match Statistics Overview */}
          {matchStats && (
            <View style={styles.statsCard}>
              <View style={styles.statsHeader}>
                <Text style={styles.statsTitle}>Season Overview</Text>
                <Text style={styles.statsSubtitle}>
                  {selectedSeason ? `Performance metrics for ${selectedSeason} season` : "Performance metrics across all matches"}
                </Text>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{matchStats.wins}</Text>
                  <Text style={styles.statLabel}>Wins</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{matchStats.draws}</Text>
                  <Text style={styles.statLabel}>Draws</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{matchStats.losses}</Text>
                  <Text style={styles.statLabel}>Losses</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{matchStats.totalGoals}</Text>
                  <Text style={styles.statLabel}>Goals</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{matchStats.totalConceded}</Text>
                  <Text style={styles.statLabel}>Conceded</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, matchStats.goalDifference >= 0 ? styles.statPositive : styles.statNegative]}>
                    {matchStats.goalDifference > 0 ? '+' : ''}{matchStats.goalDifference}
                  </Text>
                  <Text style={styles.statLabel}>Goal Diff</Text>
                </View>
              </View>
            </View>
          )}
          
          {/* Last 10 Matches Form Chart */}
          {formData.labels.length > 0 && (
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Recent Form</Text>
                <Text style={styles.chartSubtitle}>Last 10 matches performance trend</Text>
              </View>
              <LineChart
                data={formData}
                width={Platform.OS === "web" ? 800 : screenW - 80}
                height={240}
                chartConfig={{
                  backgroundColor: "#ffffff",
                  backgroundGradientFrom: "#ffffff",
                  backgroundGradientTo: "#ffffff",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: {
                    r: "6",
                    strokeWidth: "2",
                    stroke: "#0f172a",
                  },
                  propsForBackgroundLines: {
                    strokeDasharray: "",
                    stroke: "#e2e8f0",
                    strokeWidth: 1,
                  },
                }}
                bezier
                style={styles.chart}
                fromZero
                yAxisMax={3}
                segments={3}
              />
              <View style={styles.formLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotWin]} />
                  <Text style={styles.legendText}>Win (3 pts)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotDraw]} />
                  <Text style={styles.legendText}>Draw (1 pt)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.legendDotLoss]} />
                  <Text style={styles.legendText}>Loss (0 pts)</Text>
                </View>
              </View>
            </View>
          )}
          {/* Recent Matches - grid of small cards (same layout as analyst review matches) */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconLine} />
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptyText}>Match history will appear here once matches are recorded.</Text>
            </View>
          ) : (
            <View style={styles.matchesGrid}>
              {matches.map((m) => {
                const result = m.goals_scored > m.goals_conceded
                  ? { text: "W", color: "#0f172a", bg: "#e2e8f0" }
                  : m.goals_scored === m.goals_conceded
                    ? { text: "D", color: "#475569", bg: "#f1f5f9" }
                    : { text: "L", color: "#64748b", bg: "#f8fafc" };
                return (
                  <View key={m.id} style={styles.matchCard}>
                    <View style={styles.matchCardHeader}>
                      <View style={styles.matchCardHeaderLeft}>
                        <Text style={styles.matchCardOpponent}>vs {m.opponent}</Text>
                        <Text style={styles.matchCardDate}>
                          {m.kickoff_at
                            ? new Date(m.kickoff_at).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "No date"}
                        </Text>
                        {m.season && (
                          <Text style={styles.matchCardSeason}>Season: {m.season}</Text>
                        )}
                      </View>
                      <View style={[styles.matchCardResultBadge, { backgroundColor: result.bg }]}>
                        <Text style={[styles.matchCardResultText, { color: result.color }]}>{result.text}</Text>
                      </View>
                    </View>

                    <View style={styles.matchCardScore}>
                      <View style={styles.matchCardScoreItem}>
                        <Text style={styles.matchCardScoreLabel}>Our Goals</Text>
                        <Text style={styles.matchCardScoreValue}>{m.goals_scored || 0}</Text>
                      </View>
                      <Text style={styles.matchCardScoreDivider}>-</Text>
                      <View style={styles.matchCardScoreItem}>
                        <Text style={styles.matchCardScoreLabel}>Opponent Goals</Text>
                        <Text style={styles.matchCardScoreValue}>{m.goals_conceded || 0}</Text>
                      </View>
                    </View>

                    <View style={styles.matchCardDetails}>
                      {m.formation && (
                        <View style={styles.matchCardDetailItem}>
                          <Text style={styles.matchCardDetailLabel}>Formation</Text>
                          <Text style={styles.matchCardDetailValue}>{m.formation}</Text>
                        </View>
                      )}
                      <View style={styles.matchCardDetailItem}>
                        <Text style={styles.matchCardDetailLabel}>Venue</Text>
                        <Text style={styles.matchCardDetailValue}>{m.is_home ? "Home" : "Away"}</Text>
                      </View>
                      <View style={styles.matchCardDetailItem}>
                        <Text style={styles.matchCardDetailLabel}>Status</Text>
                        <Text style={[styles.matchCardDetailValue, styles.matchCardStatusText]}>
                          {m.state || "not_started"}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.matchCardViewButton}
                      onPress={() => router.push(`/manager/match/${m.id}`)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.matchCardViewButtonText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </AppLayout>
  );
}

function formatKickoff(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#f9fafb",
  },
  webHeader: {
    padding: 24,
    paddingTop: Platform.OS === "web" ? 24 : 60,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  webTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  webSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
  },
  seasonSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  seasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  seasonButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  seasonButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  seasonButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  seasonButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  seasonButtonTextActive: {
    color: "#ffffff",
  },
  content: { 
    padding: 24,
    gap: 16,
  },
  mobileSeasonSelector: {
    marginBottom: 16,
  },
  mobileSeasonLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  mobileSeasonScroll: {
    marginHorizontal: -4,
  },
  mobileSeasonButtons: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  mobileSeasonButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  mobileSeasonButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  mobileSeasonButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  mobileSeasonButtonTextActive: {
    color: "#ffffff",
  },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  formLegend: {
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
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendDotWin: {
    backgroundColor: "#059669",
  },
  legendDotDraw: {
    backgroundColor: "#d97706",
  },
  legendDotLoss: {
    backgroundColor: "#dc2626",
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  statsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statsHeader: {
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  statsSubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    padding: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  statPositive: {
    color: "#059669",
  },
  statNegative: {
    color: "#dc2626",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chartHeader: {
    marginBottom: 20,
  },
  chartSubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 4,
  },
  loadingWrap: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 56,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIconLine: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
  },
  matchesGrid: {
    gap: 20,
    ...Platform.select({
      web: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gap: "20px",
      },
    }),
  },
  matchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  matchCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  matchCardHeaderLeft: {
    flex: 1,
  },
  matchCardOpponent: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  matchCardDate: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
    marginBottom: 4,
  },
  matchCardSeason: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 4,
  },
  matchCardResultBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  matchCardResultText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  matchCardScore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    marginBottom: 20,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    gap: 20,
  },
  matchCardScoreItem: {
    flex: 1,
    alignItems: "center",
  },
  matchCardScoreLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  matchCardScoreValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  matchCardScoreDivider: {
    fontSize: 20,
    fontWeight: "500",
    color: "#94a3b8",
  },
  matchCardDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  matchCardDetailItem: {
    flex: 1,
    minWidth: 90,
  },
  matchCardDetailLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  matchCardDetailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  matchCardStatusText: {
    textTransform: "capitalize",
  },
  matchCardViewButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  matchCardViewButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
