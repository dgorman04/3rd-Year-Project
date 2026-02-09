// app/analyst/review-matches.jsx - View previous matches and review stats
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import AppLayout from "../../components/AppLayout";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";

export default function ReviewMatches() {
  const [token, setToken] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState("all");

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadMatches(t, null);
    })();
  }, []);

  const loadMatches = async (t, seasonFilter) => {
    try {
      setLoading(true);
      const url = seasonFilter && seasonFilter !== "all" 
        ? `${API}/matches/?season=${encodeURIComponent(seasonFilter)}`
        : `${API}/matches/`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try {
        data = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        alert(data?.detail || "Failed to load matches.");
        return;
      }

      setMatches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log(e);
      alert("Network error loading matches.");
    } finally {
      setLoading(false);
    }
  };

  const availableSeasons = useMemo(() => {
    const seasons = new Set();
    matches.forEach(m => {
      if (m.season) seasons.add(m.season);
    });
    return Array.from(seasons).sort().reverse();
  }, [matches]);

  useEffect(() => {
    if (token) {
      loadMatches(token, selectedSeason);
    }
  }, [selectedSeason, token]);

  const getMatchResult = (match) => {
    if (match.goals_scored > match.goals_conceded) return { text: "W", color: "#0f172a", bg: "#e2e8f0" };
    if (match.goals_scored === match.goals_conceded) return { text: "D", color: "#475569", bg: "#f1f5f9" };
    return { text: "L", color: "#64748b", bg: "#f8fafc" };
  };

  if (loading && matches.length === 0) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading matches...</Text>
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
            <View>
              <Text style={styles.webTitle}>Review Matches</Text>
              <Text style={styles.webSubtitle}>View and analyze previous match statistics</Text>
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* Season Filter */}
          {availableSeasons.length > 0 && (
            <View style={styles.filterCard}>
              <Text style={styles.filterLabel}>Filter by Season</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedSeason}
                  onValueChange={(value) => setSelectedSeason(value)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  <Picker.Item label="All Seasons" value="all" />
                  {availableSeasons.map((season) => (
                    <Picker.Item key={season} label={season} value={season} />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          {matches.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconLine} />
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptyText}>
                {selectedSeason !== "all"
                  ? `No matches found for season ${selectedSeason}.`
                  : "Start recording events to see matches here."}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/analyst/record-events")}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyButtonText}>Start New Match</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.matchesGrid}>
              {matches.map((match) => {
                const result = getMatchResult(match);
                return (
                  <View key={match.id} style={styles.matchCard}>
                    <View style={styles.matchHeader}>
                      <View style={styles.matchHeaderLeft}>
                        <Text style={styles.matchOpponent}>vs {match.opponent}</Text>
                        <Text style={styles.matchDate}>
                          {match.kickoff_at
                            ? new Date(match.kickoff_at).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "No date"}
                        </Text>
                        {match.season && (
                          <Text style={styles.matchSeason}>Season: {match.season}</Text>
                        )}
                      </View>
                      <View style={[styles.resultBadge, { backgroundColor: result.bg }]}>
                        <Text style={[styles.resultText, { color: result.color }]}>{result.text}</Text>
                      </View>
                    </View>

                    <View style={styles.matchScore}>
                      <View style={styles.scoreItem}>
                        <Text style={styles.scoreLabel}>Our Goals</Text>
                        <Text style={styles.scoreValue}>{match.goals_scored || 0}</Text>
                      </View>
                      <Text style={styles.scoreDivider}>-</Text>
                      <View style={styles.scoreItem}>
                        <Text style={styles.scoreLabel}>Opponent Goals</Text>
                        <Text style={styles.scoreValue}>{match.goals_conceded || 0}</Text>
                      </View>
                    </View>

                    <View style={styles.matchDetails}>
                      {match.formation && (
                        <View style={styles.detailItem}>
                          <Text style={styles.detailLabel}>Formation</Text>
                          <Text style={styles.detailValue}>{match.formation}</Text>
                        </View>
                      )}
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Venue</Text>
                        <Text style={styles.detailValue}>
                          {match.is_home ? "Home" : "Away"}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Status</Text>
                        <Text style={[styles.detailValue, styles.statusText]}>
                          {match.state || "not_started"}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.viewButton}
                      onPress={() => router.push(`/analyst/match-review/${match.id}`)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.viewButtonText}>View Details</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  webHeader: {
    padding: 28,
    paddingTop: Platform.OS === "web" ? 28 : 60,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  webTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#64748b",
  },
  content: {
    padding: 24,
    paddingBottom: 40,
    gap: 24,
  },
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  picker: {
    backgroundColor: "transparent",
    color: "#0f172a",
    fontWeight: "500",
  },
  pickerItem: {
    color: "#0f172a",
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
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
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
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  matchHeaderLeft: {
    flex: 1,
  },
  matchOpponent: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  matchDate: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
    marginBottom: 4,
  },
  matchSeason: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 4,
  },
  resultBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  resultText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  matchScore: {
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
  scoreItem: {
    flex: 1,
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  scoreDivider: {
    fontSize: 20,
    fontWeight: "500",
    color: "#94a3b8",
  },
  matchDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  detailItem: {
    flex: 1,
    minWidth: 90,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  statusText: {
    textTransform: "capitalize",
  },
  viewButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  viewButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
