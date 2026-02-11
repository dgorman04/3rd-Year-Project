// app/manager/players.jsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import AppLayout from "../../components/AppLayout";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";

// Calculate player rating based on attacking and defensive stats
function calculatePlayerRating(stats) {
  // Attacking stats (positive impact)
  const goals = stats.shots_on_target || 0;
  const keyPasses = stats.key_passes || 0;
  const shotsOffTarget = stats.shots_off_target || 0;
  
  // Defensive stats (positive impact)
  const tackles = stats.tackles || 0;
  const interceptions = stats.interceptions || 0;
  const clearances = stats.clearances || 0;
  const blocks = stats.blocks || 0;
  const duelsWon = stats.duels_won || 0;
  const duelsLost = stats.duels_lost || 0;
  
  // Negative stats (reduce rating)
  const fouls = stats.fouls || 0;
  
  // Calculate duel win rate
  const totalDuels = duelsWon + duelsLost;
  const duelWinRate = totalDuels > 0 ? duelsWon / totalDuels : 0;
  
  // Base rating starts at 5.0 (out of 10)
  let rating = 5.0;
  
  // Attacking contribution (max +3.0)
  const attackingScore = (goals * 0.8) + (keyPasses * 0.3) - (shotsOffTarget * 0.1);
  rating += Math.min(attackingScore * 0.15, 3.0);
  
  // Defensive contribution (max +2.0)
  const defensiveScore = (tackles * 0.4) + (interceptions * 0.5) + (clearances * 0.3) + (blocks * 0.4);
  rating += Math.min(defensiveScore * 0.12, 2.0);
  
  // Duel performance (max +0.5)
  if (totalDuels > 0) {
    rating += (duelWinRate - 0.5) * 0.5;
  }
  
  // Penalty for fouls (max -1.0)
  rating -= Math.min(fouls * 0.1, 1.0);
  
  // Clamp between 0 and 10
  return Math.max(0, Math.min(10, rating));
}

export default function ManagerPlayers() {
  const [token, setToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [playerXGStats, setPlayerXGStats] = useState([]);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      if (!t) router.replace("/");
    })();
  }, []);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoading(true);

        // 1) players
        const pRes = await fetch(`${API}/teams/players/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const pRaw = await pRes.text();
        let pJson = {};
        try { pJson = JSON.parse(pRaw); } catch {}

        if (!pRes.ok) {
          if (pRes.status === 401) {
            await clearToken();
            router.replace("/");
            return;
          }
          throw new Error(pJson?.detail || "Failed to load players");
        }

        // 2) stats (for computing KPIs)
        const sRes = await fetch(`${API}/stats/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const sRaw = await sRes.text();
        let sJson = [];
        try { sJson = JSON.parse(sRaw); } catch {}

        if (!sRes.ok) {
          if (sRes.status === 401) {
            await clearToken();
            router.replace("/");
            return;
          }
          throw new Error("Failed to load stats");
        }

        // 3) Load player xG stats
        try {
          const xgRes = await fetch(`${API}/teams/player-xg-stats/`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          const xgData = await xgRes.json().catch(() => ({}));
          if (xgRes.ok && Array.isArray(xgData?.player_xg)) {
            setPlayerXGStats(xgData.player_xg);
          }
        } catch (e) {
          console.log("Error loading xG:", e);
        }

        setPlayers(pJson.players || []);
        setStats(Array.isArray(sJson) ? sJson : []);
      } catch (e) {
        console.log(e);
        alert(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Build map: player_id -> { event -> count }
  const statMap = useMemo(() => {
    const map = {};
    for (const row of stats) {
      const pid = row.player_id;
      const ev = row.event;
      const ct = Number(row.count || 0);
      if (!pid || !ev) continue;
      if (!map[pid]) map[pid] = {};
      map[pid][ev] = ct;
    }
    return map;
  }, [stats]);

  // Build map: player name -> xG
  const xgMap = useMemo(() => {
    const map = {};
    playerXGStats.forEach((p) => {
      map[p.player] = p.xg || 0;
    });
    return map;
  }, [playerXGStats]);

  // Filter players by search query
  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return players;
    const query = searchQuery.toLowerCase();
    return players.filter((p) => p.name?.toLowerCase().includes(query));
  }, [players, searchQuery]);

  if (loading) {
    return (
      <AppLayout>
        <View style={{ flex: 1, backgroundColor: "#f8f9fa" }}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading player data...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  // Core remove logic shared between web + native
  const performRemovePlayer = async (playerId) => {
    setRemoving(playerId);
    try {
      const res = await fetch(`${API}/teams/players/${playerId}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        Alert.alert("Error", json?.detail || "Failed to remove player");
        return;
      }

      // Refresh players list
      const pRes = await fetch(`${API}/teams/players/`, {
        headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
      });
      if (pRes.ok) {
        const pJson = await pRes.json().catch(() => ({}));
        setPlayers(pJson.players || []);
      }
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Network error");
    } finally {
      setRemoving(null);
    }
  };

  const handleRemovePlayer = (playerId) => {
    if (!token) return;

    // React Native Web's Alert ignores multiple buttons, so use
    // a native browser confirm dialog on web to ensure the
    // destructive action actually fires.
    if (Platform.OS === "web") {
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm("Remove this player from the team?")
          : true;
      if (!confirmed) return;
      void performRemovePlayer(playerId);
      return;
    }

    Alert.alert(
      "Remove Player",
      "Remove this player from the team?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void performRemovePlayer(playerId);
          },
        },
      ]
    );
  };

  return (
    <AppLayout>
      <View style={{ flex: 1, backgroundColor: "#f8f9fa" }}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View style={styles.headerContent}>
              <Text style={styles.webTitle}>Player Performance</Text>
              <Text style={styles.webSubtitle}>Comprehensive player statistics and performance metrics</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setEditMode(!editMode)}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>{editMode ? "Done" : "Edit Squad"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Squad Overview</Text>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search players..."
                  placeholderTextColor="#9ca3af"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>
            {!filteredPlayers.length ? (
              <View style={styles.emptyItem}>
                <Text style={styles.emptyText}>No players found.</Text>
              </View>
            ) : (
              <View style={styles.tableContainer}>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <View style={styles.colPlayer}>
                      <Text style={styles.tableHeaderText}>Player</Text>
                    </View>
                    <View style={[styles.colRating, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Rating</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Goals</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>xG</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Key Passes</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Duels Won</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Tackles</Text>
                    </View>
                    {editMode && <View style={styles.colAction} />}
                  </View>
                  {filteredPlayers.map((p) => {
                    // Calculate all stats for this player
                    const playerStats = stats.filter(stat => stat.player_id === p.id);
                    
                    // Aggregate stats by event type
                    const aggregatedStats = {};
                    playerStats.forEach(stat => {
                      aggregatedStats[stat.event] = (aggregatedStats[stat.event] || 0) + (Number(stat.count) || 0);
                    });
                    
                    // Calculate rating
                    const playerRating = calculatePlayerRating(aggregatedStats);
                    
                    // Calculate goals from shots_on_target
                    const playerGoals = aggregatedStats.shots_on_target || 0;
                    
                    // Get xG from API data
                    const playerXG = xgMap[p.name] || 0;
                    
                    // Calculate key passes
                    const keyPasses = aggregatedStats.key_passes || 0;
                    
                    // Calculate duels won
                    const duelsWon = aggregatedStats.duels_won || 0;
                    
                    // Calculate tackles
                    const tackles = aggregatedStats.tackles || 0;
                    
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.tableRow}
                        onPress={() => !editMode && router.push(`/manager/player/${p.id}`)}
                        disabled={editMode}
                      >
                        <View style={[styles.playerCell, styles.colPlayer]}>
                          <Text style={styles.playerName}>{p.name}</Text>
                        </View>
                        <View style={[styles.colRating, styles.ratingCell]}>
                          <Text style={[styles.ratingText, styles.textCenter]}>{playerRating.toFixed(1)}</Text>
                        </View>
                        <Text style={[styles.cellText, styles.colStat, styles.textCenter]}>{playerGoals}</Text>
                        <Text style={[styles.cellText, styles.colStat, styles.textCenter]}>{playerXG.toFixed(1)}</Text>
                        <Text style={[styles.cellText, styles.colStat, styles.textCenter]}>{keyPasses}</Text>
                        <Text style={[styles.cellText, styles.colStat, styles.textCenter]}>{duelsWon}</Text>
                        <Text style={[styles.cellText, styles.colStat, styles.textCenter]}>{tackles}</Text>
                        {editMode && (
                          <View style={styles.colAction}>
                            <TouchableOpacity
                              onPress={() => handleRemovePlayer(p.id)}
                              disabled={removing === p.id}
                              style={styles.removeButton}
                            >
                              <Text style={styles.removeText}>{removing === p.id ? "..." : "Remove"}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  webHeader: {
    padding: 28,
    paddingTop: Platform.OS === "web" ? 28 : 60,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerContent: {
    flex: 1,
  },
  webTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  editButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#0f172a",
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  content: { 
    padding: 28,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  searchContainer: {
    width: 280,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#ffffff",
    color: "#0f172a",
  },
  tableContainer: {
    overflow: "hidden",
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    alignItems: "center",
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerStatCell: {
    justifyContent: "center",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    minHeight: 64,
  },
  // Column widths
  colPlayer: {
    width: 240,
    minWidth: 200,
    ...Platform.select({
      web: {
        width: "auto",
        flex: 2,
      },
    }),
  },
  colRating: {
    width: 80,
    minWidth: 70,
    ...Platform.select({
      web: {
        width: "auto",
        flex: 0.8,
      },
    }),
  },
  colStat: {
    width: 90,
    minWidth: 80,
    ...Platform.select({
      web: {
        width: "auto",
        flex: 1,
      },
    }),
  },
  colAction: {
    width: 100,
    minWidth: 80,
    ...Platform.select({
      web: {
        width: "auto",
        flex: 0.8,
      },
    }),
  },
  playerCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  cellText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e293b",
  },
  ratingCell: {
    justifyContent: "center",
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  textCenter: {
    textAlign: "center",
  },
  removeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fee2e2",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  emptyItem: {
    padding: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
});
