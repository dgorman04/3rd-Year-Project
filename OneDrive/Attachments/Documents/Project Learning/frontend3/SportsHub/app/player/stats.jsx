// app/player/stats.jsx - Personal stats: same view as manager's player detail (for logged-in player only)
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Platform, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import AppLayout from "../../components/AppLayout";
import PitchVisualization from "../../components/PitchVisualization";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";
import { LineChart } from "react-native-chart-kit";

const screenW = Dimensions.get("window").width;

function calculatePlayerRating(stats) {
  const goals = stats.shots_on_target || 0;
  const keyPasses = stats.key_passes || 0;
  const shotsOffTarget = stats.shots_off_target || 0;
  const tackles = stats.tackles || 0;
  const interceptions = stats.interceptions || 0;
  const clearances = stats.clearances || 0;
  const blocks = stats.blocks || 0;
  const duelsWon = stats.duels_won || 0;
  const duelsLost = stats.duels_lost || 0;
  const fouls = stats.fouls || 0;
  const totalDuels = duelsWon + duelsLost;
  const duelWinRate = totalDuels > 0 ? duelsWon / totalDuels : 0;
  let rating = 5.0;
  const attackingScore = (goals * 0.8) + (keyPasses * 0.3) - (shotsOffTarget * 0.1);
  rating += Math.min(attackingScore * 0.15, 3.0);
  const defensiveScore = (tackles * 0.4) + (interceptions * 0.5) + (clearances * 0.3) + (blocks * 0.4);
  rating += Math.min(defensiveScore * 0.12, 2.0);
  if (totalDuels > 0) rating += (duelWinRate - 0.5) * 0.5;
  rating -= Math.min(fouls * 0.1, 1.0);
  return Math.max(0, Math.min(10, rating));
}

export default function PlayerStats() {
  const [token, setToken] = useState(null);
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState([]);
  const [matches, setMatches] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mlAnalysis, setMlAnalysis] = useState(null);
  const [playerXG, setPlayerXG] = useState(0);

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

        const profileRes = await fetch(`${API}/players/me/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const profileData = await profileRes.json().catch(() => ({}));

        if (!profileRes.ok) {
          if (profileRes.status === 401) {
            await clearToken();
            router.replace("/");
            return;
          }
          setLoading(false);
          return;
        }

        if (!profileData.player) {
          setLoading(false);
          return;
        }

        const playerData = profileData.player;
        const playerId = playerData.id;
        setPlayer(playerData);

        const statsRes = await fetch(`${API}/players/me/stats/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const sJson = await statsRes.json().catch(() => []);
        if (statsRes.ok) setStats(Array.isArray(sJson) ? sJson : []);

        let allMatches = [];
        const mRes = await fetch(`${API}/matches/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const mData = await mRes.json().catch(() => []);
        if (mRes.ok && Array.isArray(mData)) {
          allMatches = mData;
          setMatches(mData);
        }

        const allEventInstances = [];
        for (const match of allMatches) {
          try {
            const eventsRes = await fetch(`${API}/matches/${match.id}/events/`, {
              headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
            });
            if (eventsRes.ok) {
              const eventsData = await eventsRes.json().catch(() => []);
              if (Array.isArray(eventsData)) {
                const playerEvents = eventsData.filter((e) => Number(e.player_id) === Number(playerId));
                allEventInstances.push(...playerEvents);
              }
            }
          } catch (e) {
            console.log("Error loading events for match:", match.id, e);
          }
        }
        setEventInstances(allEventInstances);

        try {
          const xgRes = await fetch(`${API}/teams/player-xg-stats/`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          const xgData = await xgRes.json().catch(() => ({}));
          if (xgRes.ok && Array.isArray(xgData?.player_xg)) {
            const playerXGData = xgData.player_xg.find((p) => (p.player || "").trim().toLowerCase() === (playerData.name || "").trim().toLowerCase());
            setPlayerXG(playerXGData?.xg ?? 0);
          }
        } catch (e) {
          console.log("Error loading xG:", e);
        }

        try {
          const mlAnalysisRes = await fetch(`${API}/ml/performance-improvement/?player_id=${playerId}`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          if (mlAnalysisRes.ok) {
            const mlAnalysisData = await mlAnalysisRes.json().catch(() => ({}));
            if (mlAnalysisData.recommendations || mlAnalysisData.performance_metrics) {
              setMlAnalysis({
                players: [{ player_id: playerId, player_name: playerData.name, ...mlAnalysisData }],
              });
            }
          } else {
            const teamMlRes = await fetch(`${API}/ml/performance-improvement/`, {
              headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
            });
            const teamMlData = await teamMlRes.json().catch(() => ({}));
            if (teamMlRes.ok && teamMlData.players && Array.isArray(teamMlData.players)) {
              const playerAnalysis = teamMlData.players.find(
                (p) => Number(p.player_id) === Number(playerId) || (p.player_name && playerData.name && p.player_name.toLowerCase().trim() === playerData.name.toLowerCase().trim())
              );
              if (playerAnalysis) setMlAnalysis({ players: [playerAnalysis] });
            }
          }
        } catch (e) {
          console.log("Error loading ML analysis:", e);
        }
      } catch (e) {
        console.log(e);
        if (!player) alert(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const playerId = player?.id;

  const playerKPIs = useMemo(() => {
    if (!playerId) return { goals: 0, xg: 0, keyPasses: 0, duelsWon: 0, tackles: 0, interceptions: 0, rating: 0 };
    const playerStats = stats.filter((s) => Number(s.player_id) === Number(playerId));
    const goals = playerStats.filter((s) => s.event === "shots_on_target").reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const keyPasses = playerStats.filter((s) => s.event === "key_passes").reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const duelsWon = playerStats.filter((s) => s.event === "duels_won").reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const tackles = playerStats.filter((s) => s.event === "tackles").reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const interceptions = playerStats.filter((s) => s.event === "interceptions").reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    const allStats = {};
    playerStats.forEach((s) => {
      allStats[s.event] = (allStats[s.event] || 0) + (Number(s.count) || 0);
    });
    const overallRating = calculatePlayerRating(allStats);
    return { goals, xg: playerXG, keyPasses, duelsWon, tackles, interceptions, rating: overallRating };
  }, [stats, playerId, playerXG]);

  const zoneAnalysis = useMemo(() => {
    const zoneStats = {};
    const zoneEventCounts = {};
    eventInstances.forEach((instance) => {
      if (!instance.zone) return;
      const zone = instance.zone.toString();
      if (!zoneStats[zone]) {
        zoneStats[zone] = { total: 0, attacking: 0, defensive: 0, events: {} };
        zoneEventCounts[zone] = 0;
      }
      zoneStats[zone].total++;
      zoneEventCounts[zone]++;
      const event = instance.event;
      zoneStats[zone].events[event] = (zoneStats[zone].events[event] || 0) + 1;
      if (["shots_on_target", "shots_off_target", "key_passes"].includes(event)) zoneStats[zone].attacking++;
      if (["tackles", "interceptions", "clearances", "blocks", "duels_won"].includes(event)) zoneStats[zone].defensive++;
    });
    return { zoneStats, zoneEventCounts };
  }, [eventInstances]);

  const zoneSuggestions = useMemo(() => {
    const suggestions = [];
    const { zoneStats } = zoneAnalysis;
    const firstThirdZones = ["1", "4"];
    const middleThirdZones = ["2", "5"];
    const finalThirdZones = ["3", "6"];
    const firstThirdTotal = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const middleThirdTotal = middleThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const finalThirdTotal = finalThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const totalEvents = firstThirdTotal + middleThirdTotal + finalThirdTotal;
    if (totalEvents === 0) return suggestions;
    const firstThirdAttacking = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.attacking || 0), 0);
    const finalThirdAttacking = finalThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.attacking || 0), 0);
    if (finalThirdAttacking < firstThirdAttacking && finalThirdAttacking < totalEvents * 0.2) {
      suggestions.push({
        category: "Attacking",
        priority: "High",
        title: "Increase Final Third Activity",
        message: `Only ${Math.round((finalThirdAttacking / totalEvents) * 100)}% of attacking actions occur in the final third. Focus on positioning and movement to create more opportunities closer to goal.`,
        actionItems: ["Practice receiving the ball in advanced positions (Zones 3 & 6)", "Work on making runs into the penalty area", "Improve positioning during attacking phases"],
      });
    }
    const firstThirdDefensive = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.defensive || 0), 0);
    const middleThirdDefensive = middleThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.defensive || 0), 0);
    if (firstThirdDefensive > (middleThirdDefensive + finalThirdTotal) * 1.5) {
      suggestions.push({
        category: "Defensive",
        priority: "High",
        title: "Move Defensive Actions Higher",
        message: `${Math.round((firstThirdDefensive / totalEvents) * 100)}% of defensive actions occur in your own third. Press higher up the pitch to relieve pressure and win the ball in more advanced positions.`,
        actionItems: ["Practice pressing in the middle third (Zones 2 & 5)", "Work on intercepting passes before they reach your defensive third", "Improve positioning to cut off passing lanes earlier"],
      });
    }
    Object.entries(zoneStats).forEach(([zone, stats]) => {
      if (stats.total < 3) return;
      const zonePercentage = (stats.total / totalEvents) * 100;
      const attackingPercentage = stats.total > 0 ? (stats.attacking / stats.total) * 100 : 0;
      const defensivePercentage = stats.total > 0 ? (stats.defensive / stats.total) * 100 : 0;
      if (zonePercentage > 25 && attackingPercentage < 30 && defensivePercentage < 30) {
        suggestions.push({
          category: "Positioning",
          priority: "Medium",
          title: `Optimize Zone ${zone} Activity`,
          message: `Zone ${zone} accounts for ${Math.round(zonePercentage)}% of your activity but has mixed effectiveness. Focus on more decisive actions in this area.`,
          actionItems: ["Review game footage to identify patterns in Zone " + zone, "Work on decision-making when receiving the ball in this zone"],
        });
      }
    });
    return suggestions;
  }, [zoneAnalysis]);

  const heatmapData = useMemo(() => {
    const { zoneEventCounts } = zoneAnalysis;
    const zoneMap = {
      "1": "defensive_left",
      "2": "defensive_center",
      "3": "defensive_right",
      "4": "attacking_left",
      "5": "attacking_center",
      "6": "attacking_right",
    };
    const heatmap = {};
    Object.entries(zoneEventCounts).forEach(([zone, count]) => {
      const zoneId = zoneMap[zone];
      if (zoneId) heatmap[zoneId] = count;
    });
    return heatmap;
  }, [zoneAnalysis]);

  const ratingProgression = useMemo(() => {
    if (!playerId) return [];
    const playerStats = stats.filter((s) => Number(s.player_id) === Number(playerId));
    const matchRatings = {};
    playerStats.forEach((stat) => {
      const matchId = stat.match_id;
      if (!matchId) return;
      if (!matchRatings[matchId]) matchRatings[matchId] = {};
      matchRatings[matchId][stat.event] = (matchRatings[matchId][stat.event] || 0) + (Number(stat.count) || 0);
    });
    return Object.entries(matchRatings)
      .map(([matchId, matchStats]) => {
        const match = matches.find((m) => m.id === Number(matchId));
        const rating = calculatePlayerRating(matchStats);
        return {
          matchId: Number(matchId),
          rating,
          date: match?.kickoff_at ? new Date(match.kickoff_at) : new Date(),
          matchName: match ? `${match.opponent} (${match.goals_scored || 0}-${match.goals_conceded || 0})` : `Match ${matchId}`,
        };
      })
      .sort((a, b) => a.date - b.date);
  }, [stats, playerId, matches]);

  if (loading) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading your stats...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.joinCtaContent}>
            <View style={styles.joinCtaCard}>
              <Text style={styles.joinCtaTitle}>Join a team to view your personal stats</Text>
              <Text style={styles.joinCtaDescription}>
                Click here to join a team and view stats. Just ask your manager for the code.
              </Text>
              <TouchableOpacity
                style={styles.joinCtaButton}
                onPress={() => router.push("/player/join-team")}
              >
                <Text style={styles.joinCtaButtonText}>Join team</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.playerName}>{player?.name || "Player"}</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingLabel}>Overall Rating</Text>
            <Text style={styles.ratingValue}>{playerKPIs.rating.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.goals}</Text>
            <Text style={styles.kpiTitle}>Goals</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.xg.toFixed(2)}</Text>
            <Text style={styles.kpiTitle}>Expected Goals</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.keyPasses}</Text>
            <Text style={styles.kpiTitle}>Key Passes</Text>
          </View>
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.duelsWon}</Text>
            <Text style={styles.kpiTitle}>Duels Won</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.tackles}</Text>
            <Text style={styles.kpiTitle}>Tackles</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{playerKPIs.interceptions}</Text>
            <Text style={styles.kpiTitle}>Interceptions</Text>
          </View>
        </View>

        {ratingProgression.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Rating Progression</Text>
              <Text style={styles.cardSubtitle}>Performance rating over time</Text>
            </View>
            <LineChart
              data={{
                labels: ratingProgression.map((_, i) => {
                  if (ratingProgression.length <= 5) return `GW${i + 1}`;
                  if (i === 0 || i === ratingProgression.length - 1) return `GW${i + 1}`;
                  if (i % Math.ceil(ratingProgression.length / 5) === 0) return `GW${i + 1}`;
                  return "";
                }),
                datasets: [{ data: ratingProgression.map((r) => r.rating), color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`, strokeWidth: 3 }],
              }}
              width={Math.min(screenW - 80, 800)}
              height={280}
              chartConfig={{
                backgroundColor: "#ffffff",
                backgroundGradientFrom: "#f8f9fa",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                propsForDots: { r: "6", strokeWidth: "3", stroke: "#ffffff", fill: "#0f172a" },
                propsForBackgroundLines: { stroke: "#e2e8f0", strokeWidth: 1, strokeDasharray: "0" },
                fillShadowGradient: "#0f172a",
                fillShadowGradientOpacity: 0.1,
              }}
              bezier
              withInnerLines={false}
              withOuterLines={true}
              withVerticalLines={false}
              withHorizontalLines={true}
              style={styles.premiumChart}
            />
          </View>
        )}

        {Object.keys(heatmapData).length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Action Heatmap</Text>
              <Text style={styles.cardSubtitle}>Areas of highest activity on the pitch</Text>
            </View>
            <View style={styles.heatmapContainer}>
              <PitchVisualization width={Math.min(screenW - 100, 600)} height={400} heatMapData={heatmapData} />
            </View>
            <View style={styles.zoneStatsContainer}>
              {Object.entries(zoneAnalysis.zoneStats)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 3)
                .map(([zone, zoneStats]) => (
                  <View key={zone} style={styles.zoneStatItem}>
                    <Text style={styles.zoneStatLabel}>Zone {zone}</Text>
                    <Text style={styles.zoneStatValue}>{zoneStats.total} events</Text>
                    <Text style={styles.zoneStatDetail}>
                      {zoneStats.attacking} attacking, {zoneStats.defensive} defensive
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {zoneSuggestions.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Zone-Based Performance Insights</Text>
              <Text style={styles.cardSubtitle}>AI-powered analysis of your positioning and activity patterns</Text>
            </View>
            <View style={styles.recommendationsList}>
              {zoneSuggestions.map((suggestion, idx) => (
                <View key={idx} style={styles.recommendationItem}>
                  <View style={styles.recommendationHeader}>
                    <View style={styles.recommendationCategory}>
                      <Text style={styles.recommendationCategoryText}>{suggestion.category}</Text>
                    </View>
                    <Text style={styles.recTitle}>{suggestion.title}</Text>
                  </View>
                  <Text style={styles.recMessage}>{suggestion.message}</Text>
                  {suggestion.actionItems && suggestion.actionItems.length > 0 && (
                    <View style={styles.actionItemsContainer}>
                      {suggestion.actionItems.map((item, i) => (
                        <View key={i} style={styles.actionItemRow}>
                          <Text style={styles.actionItemBullet}>•</Text>
                          <Text style={styles.actionItemText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {mlAnalysis && mlAnalysis.players && Array.isArray(mlAnalysis.players) && mlAnalysis.players.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Performance Analysis & Insights</Text>
              <Text style={styles.cardSubtitle}>AI-powered performance evaluation and recommendations</Text>
            </View>
            {mlAnalysis.players.map((playerAnalysis, idx) => {
              const metrics = playerAnalysis.performance_metrics || {};
              const duelWinRate = metrics.duel_win_rate || 0;
              const shotAccuracy = metrics.shot_accuracy || 0;
              const defensiveActions = metrics.defensive_actions || 0;
              const keyPasses = metrics.key_passes || 0;
              const disciplineScore = metrics.discipline_score || 100;
              const insights = [];
              if (duelWinRate >= 60) insights.push({ type: "positive", category: "Physical Performance", title: "Strong Duel Performance", message: `Duel win rate of ${duelWinRate.toFixed(1)}% demonstrates excellent positioning and timing in 1v1 situations.`, priority: null, actionItems: [], expectedImprovement: null });
              if (shotAccuracy >= 50 && shotAccuracy > 0) insights.push({ type: "positive", category: "Attacking", title: "Effective Finishing", message: `Shot accuracy of ${shotAccuracy.toFixed(1)}% shows good composure in front of goal.`, priority: null, actionItems: [], expectedImprovement: null });
              if (defensiveActions >= 8) insights.push({ type: "positive", category: "Defensive Awareness", title: "High Defensive Involvement", message: `${defensiveActions} defensive actions indicate strong reading of the game.`, priority: null, actionItems: [], expectedImprovement: null });
              if (keyPasses >= 3) insights.push({ type: "positive", category: "Attacking", title: "Creative Playmaking", message: `${keyPasses} key passes demonstrate effective vision.`, priority: null, actionItems: [], expectedImprovement: null });
              if (disciplineScore >= 80) insights.push({ type: "positive", category: "Discipline", title: "Good Discipline", message: `Discipline score of ${disciplineScore.toFixed(1)} reflects good timing.`, priority: null, actionItems: [], expectedImprovement: null });
              if (playerAnalysis.recommendations && Array.isArray(playerAnalysis.recommendations)) {
                playerAnalysis.recommendations.forEach((rec) =>
                  insights.push({
                    type: "negative",
                    category: rec.category,
                    title: rec.title,
                    message: rec.message,
                    priority: rec.priority,
                    actionItems: rec.action_items || [],
                    expectedImprovement: rec.expected_improvement,
                  })
                );
              }
              return (
                <View key={idx}>
                  {insights.map((insight, insightIdx) => (
                    <View key={insightIdx} style={styles.mlInsightCard}>
                      <View style={styles.mlInsightHeader}>
                        <Text style={styles.mlInsightCategory}>{insight.category}</Text>
                        {insight.priority && <Text style={styles.mlInsightPriority}>{insight.priority}</Text>}
                      </View>
                      <Text style={styles.mlInsightTitle}>{insight.title}</Text>
                      <Text style={styles.mlInsightMessage}>{insight.message}</Text>
                      {insight.actionItems && insight.actionItems.length > 0 && (
                        <View style={styles.mlInsightActions}>
                          <Text style={styles.mlInsightActionsTitle}>Recommended Actions</Text>
                          {insight.actionItems.map((action, actionIdx) => (
                            <View key={actionIdx} style={styles.mlInsightActionItem}>
                              <View style={styles.mlInsightActionBullet} />
                              <Text style={styles.mlInsightActionText}>{action}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {insight.expectedImprovement && (
                        <View style={styles.mlInsightExpected}>
                          <Text style={styles.mlInsightExpectedText}>Expected: {insight.expectedImprovement}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  content: { padding: 28, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  loadingText: { marginTop: 16, fontSize: 15, color: "#64748b", fontWeight: "500" },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  errorText: { fontSize: 16, fontWeight: "600", color: "#0f172a", textAlign: "center" },
  errorSubtext: { marginTop: 8, fontSize: 14, color: "#64748b", textAlign: "center" },
  joinCtaContent: { padding: 24, flex: 1 },
  joinCtaCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  joinCtaTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 10 },
  joinCtaDescription: { fontSize: 14, color: "#64748b", lineHeight: 22, marginBottom: 20 },
  joinCtaButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  joinCtaButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 28,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playerName: { fontSize: 32, fontWeight: "800", color: "#0f172a", letterSpacing: -0.5 },
  ratingBadge: { alignItems: "flex-end" },
  ratingLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  ratingValue: { fontSize: 42, fontWeight: "800", color: "#0f172a", letterSpacing: -1.5, marginBottom: 8 },
  ratingNote: { maxWidth: 200, marginTop: 4 },
  ratingNoteText: { fontSize: 10, color: "#94a3b8", fontWeight: "500", lineHeight: 14, textAlign: "right" },
  kpiRow: { flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiValue: { fontSize: 40, fontWeight: "800", color: "#0f172a", marginBottom: 10, letterSpacing: -1 },
  kpiTitle: { fontSize: 13, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  card: { backgroundColor: "#ffffff", borderRadius: 12, padding: 28, marginBottom: 24, borderWidth: 1, borderColor: "#e2e8f0" },
  sectionHeader: { marginBottom: 24 },
  cardTitle: { fontSize: 22, fontWeight: "700", color: "#0f172a", marginBottom: 6, letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 14, color: "#64748b", fontWeight: "500" },
  premiumChart: { marginTop: 12, borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  chartWrapper: { marginTop: 8, alignItems: "center" },
  heatmapContainer: { marginTop: 16, marginBottom: 24, alignItems: "center" },
  zoneStatsContainer: { flexDirection: "row", gap: 16, marginTop: 16, flexWrap: "wrap" },
  zoneStatItem: { flex: 1, minWidth: 140, padding: 16, backgroundColor: "#f8f9fa", borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  zoneStatLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  zoneStatValue: { fontSize: 24, fontWeight: "800", color: "#0f172a", marginBottom: 4, letterSpacing: -0.5 },
  zoneStatDetail: { fontSize: 12, color: "#64748b", fontWeight: "500" },
  recommendationsList: { marginTop: 8 },
  recommendationItem: { padding: 20, backgroundColor: "#f8f9fa", borderRadius: 10, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: "#0f172a" },
  recommendationHeader: { marginBottom: 10 },
  recTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", letterSpacing: -0.2 },
  recMessage: { fontSize: 14, color: "#475569", lineHeight: 22, marginBottom: 14 },
  actionItemsContainer: { marginTop: 8 },
  actionItemRow: { flexDirection: "row", marginBottom: 8, paddingLeft: 4 },
  actionItemBullet: { fontSize: 14, fontWeight: "600", color: "#0f172a", marginRight: 12, width: 16 },
  actionItemText: { flex: 1, fontSize: 13, color: "#475569", lineHeight: 20 },
  recommendationCategory: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#0f172a", borderRadius: 4, marginBottom: 8 },
  recommendationCategoryText: { fontSize: 10, fontWeight: "700", color: "#ffffff", textTransform: "uppercase", letterSpacing: 0.8 },
  mlInsightCard: { backgroundColor: "#ffffff", borderRadius: 12, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: "#e2e8f0", borderLeftWidth: 3, borderLeftColor: "#0f172a", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  mlInsightHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  mlInsightCategory: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#f1f5f9", borderRadius: 4 },
  mlInsightPriority: { fontSize: 10, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#f8f9fa", borderRadius: 4, borderWidth: 1, borderColor: "#e2e8f0" },
  mlInsightTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginBottom: 10, letterSpacing: -0.3, lineHeight: 24 },
  mlInsightMessage: { fontSize: 14, color: "#475569", lineHeight: 22, marginBottom: 16, fontWeight: "400" },
  mlInsightActions: { backgroundColor: "#f8f9fa", borderRadius: 8, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  mlInsightActionsTitle: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  mlInsightActionItem: { flexDirection: "row", marginBottom: 10, alignItems: "flex-start" },
  mlInsightActionBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#0f172a", marginTop: 8, marginRight: 12 },
  mlInsightActionText: { flex: 1, fontSize: 13, color: "#475569", lineHeight: 20, fontWeight: "400" },
  mlInsightExpected: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  mlInsightExpectedText: { fontSize: 12, fontWeight: "600", color: "#64748b", fontStyle: "italic" },
});
