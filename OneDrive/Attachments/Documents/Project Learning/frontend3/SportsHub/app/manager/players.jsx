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
        <View style={styles.screen}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1e40af" />
            <Text style={styles.loadingText}>Loading squad...</Text>
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

  const getRatingStyle = (rating) => {
    if (rating >= 7) return styles.ratingBadgeHigh;
    if (rating >= 5) return styles.ratingBadgeMid;
    return styles.ratingBadgeLow;
  };

  return (
    <AppLayout>
      <View style={styles.screen}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View style={styles.headerContent}>
              <Text style={styles.webTitle}>Squad</Text>
              <Text style={styles.webSubtitle}>
                {filteredPlayers.length} player{filteredPlayers.length !== 1 ? "s" : ""} · Tap a row to view profile
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setEditMode(!editMode)}
              style={[styles.editButton, editMode && styles.editButtonActive]}
            >
              <Text style={styles.editButtonText}>{editMode ? "Done" : "Edit Squad"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Squad Overview</Text>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>
            {!filteredPlayers.length ? (
              <View style={styles.emptyItem}>
                <Text style={styles.emptyText}>
                  {searchQuery.trim() ? "No players match your search." : "No players in the squad yet."}
                </Text>
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
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Key P</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Duels</Text>
                    </View>
                    <View style={[styles.colStat, styles.headerStatCell]}>
                      <Text style={[styles.tableHeaderText, styles.textCenter]}>Tack</Text>
                    </View>
                    {editMode && <View style={styles.colAction} />}
                  </View>
                  {filteredPlayers.map((p, index) => {
                    const playerStats = stats.filter(stat => stat.player_id === p.id);
                    const aggregatedStats = {};
                    playerStats.forEach(stat => {
                      aggregatedStats[stat.event] = (aggregatedStats[stat.event] || 0) + (Number(stat.count) || 0);
                    });
                    const playerRating = calculatePlayerRating(aggregatedStats);
                    const playerGoals = aggregatedStats.shots_on_target || 0;
                    const playerXG = xgMap[p.name] || 0;
                    const keyPasses = aggregatedStats.key_passes || 0;
                    const duelsWon = aggregatedStats.duels_won || 0;
                    const tackles = aggregatedStats.tackles || 0;

                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                        onPress={() => !editMode && router.push(`/manager/player/${p.id}`)}
                        activeOpacity={editMode ? 1 : 0.7}
                        disabled={editMode}
                      >
                        <View style={[styles.playerCell, styles.colPlayer]}>
                          <View style={styles.playerNameWrap}>
                            <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
                          </View>
                        </View>
                        <View style={[styles.colRating, styles.ratingCell]}>
                          <View style={[styles.ratingBadge, getRatingStyle(playerRating)]}>
                            <Text style={styles.ratingText}>{playerRating.toFixed(1)}</Text>
                          </View>
                        </View>
                        <View style={[styles.colStat, styles.statCell]}>
                          <Text style={styles.cellText}>{playerGoals}</Text>
                        </View>
                        <View style={[styles.colStat, styles.statCell]}>
                          <Text style={styles.cellText}>{playerXG.toFixed(1)}</Text>
                        </View>
                        <View style={[styles.colStat, styles.statCell]}>
                          <Text style={styles.cellText}>{keyPasses}</Text>
                        </View>
                        <View style={[styles.colStat, styles.statCell]}>
                          <Text style={styles.cellText}>{duelsWon}</Text>
                        </View>
                        <View style={[styles.colStat, styles.statCell]}>
                          <Text style={styles.cellText}>{tackles}</Text>
                        </View>
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
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
  webHeader: {
    padding: 24,
    paddingTop: Platform.OS === "web" ? 24 : 60,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...Platform.select({
      web: { borderLeftWidth: 4, borderLeftColor: "#1e40af" },
      default: {},
    }),
  },
  headerContent: {
    flex: 1,
  },
  webTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  editButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#1e40af",
    borderRadius: 10,
  },
  editButtonActive: {
    backgroundColor: "#059669",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderLeftWidth: 4,
    borderLeftColor: "#1e40af",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexWrap: "wrap",
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  searchContainer: {
    minWidth: 200,
    maxWidth: 280,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#f8fafc",
    color: "#111827",
  },
  tableContainer: {
    overflow: "hidden",
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#eff6ff",
    borderBottomWidth: 2,
    borderBottomColor: "#bfdbfe",
    alignItems: "center",
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e40af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerStatCell: {
    justifyContent: "center",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    minHeight: 60,
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  colPlayer: {
    width: 200,
    minWidth: 140,
    ...Platform.select({
      web: { width: "auto", flex: 2 },
    }),
  },
  colRating: {
    width: 72,
    minWidth: 64,
    ...Platform.select({
      web: { width: "auto", flex: 0.7 },
    }),
  },
  colStat: {
    width: 56,
    minWidth: 48,
    ...Platform.select({
      web: { width: "auto", flex: 0.6 },
    }),
  },
  colAction: {
    width: 90,
    minWidth: 80,
    ...Platform.select({
      web: { width: "auto", flex: 0.6 },
    }),
  },
  playerCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerNameWrap: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: -0.2,
  },
  statCell: {
    justifyContent: "center",
    alignItems: "center",
  },
  cellText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  ratingCell: {
    justifyContent: "center",
    alignItems: "center",
  },
  ratingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 44,
    alignItems: "center",
  },
  ratingBadgeHigh: {
    backgroundColor: "#d1fae5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
  },
  ratingBadgeMid: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  ratingBadgeLow: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  ratingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  textCenter: {
    textAlign: "center",
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  emptyItem: {
    padding: 48,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
});
