// app/analyst/review-matches.jsx - View previous matches and review stats
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
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
    if (match.goals_scored > match.goals_conceded) return { text: "W", color: "#10b981", bg: "#d1fae5" };
    if (match.goals_scored === match.goals_conceded) return { text: "D", color: "#f59e0b", bg: "#fef3c7" };
    return { text: "L", color: "#ef4444", bg: "#fee2e2" };
  };

  if (loading && matches.length === 0) {
    return (
      <AppLayout>
        <View style={styles.container}>
          {Platform.OS !== "web" && <AppHeader subtitle="Review Matches" />}
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading matches...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <View style={styles.container}>
        {Platform.OS !== "web" && <AppHeader subtitle="Review Matches" />}
        
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
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptyText}>
                {selectedSeason !== "all" 
                  ? `No matches found for season ${selectedSeason}.`
                  : "Start recording events to see matches here."}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push("/analyst/record-events")}
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
                          {match.is_home ? "🏠 Home" : "✈️ Away"}
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
                      onPress={() => router.push(`/analyst/match/${match.id}`)}
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
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  content: {
    padding: 24,
    gap: 20,
  },
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  picker: {
    backgroundColor: "#fff",
    color: "#111827",
    fontWeight: "400",
  },
  pickerItem: {
    backgroundColor: "#fff",
    color: "#111827",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 48,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
  },
  emptyButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  matchesGrid: {
    gap: 16,
    ...Platform.select({
      web: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
        gap: "16px",
      },
    }),
  },
  matchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  matchHeaderLeft: {
    flex: 1,
  },
  matchOpponent: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  matchDate: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
    marginBottom: 4,
  },
  matchSeason: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9ca3af",
    marginTop: 4,
  },
  resultBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  resultText: {
    fontSize: 18,
    fontWeight: "700",
  },
  matchScore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    gap: 16,
  },
  scoreItem: {
    flex: 1,
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  scoreDivider: {
    fontSize: 24,
    fontWeight: "600",
    color: "#9ca3af",
  },
  matchDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  detailItem: {
    flex: 1,
    minWidth: 100,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  statusText: {
    textTransform: "capitalize",
  },
  viewButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  viewButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
