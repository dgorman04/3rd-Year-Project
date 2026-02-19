// app/manager/player/[id].jsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AppLayout from "../../../components/AppLayout";
import PitchVisualization from "../../../components/PitchVisualization";
import { API, ngrokHeaders } from "../../../lib/config";
import { getToken, clearToken } from "../../../lib/auth";
import { LineChart } from "react-native-chart-kit";

const screenW = Dimensions.get("window").width;

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

export default function PlayerProfile() {
  const { id } = useLocalSearchParams();
  const playerId = Number(id);

  const [token, setToken] = useState(null);
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState([]);
  const [matches, setMatches] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mlRecommendations, setMlRecommendations] = useState(null);
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
    if (!token || !playerId) return;

    (async () => {
      try {
        setLoading(true);

        // Load player info
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
          throw new Error("Failed to load players");
        }

        const found = (pJson.players || []).find((x) => Number(x.id) === Number(playerId));
        const playerData = found || { id: playerId, name: "Player" };
        setPlayer(playerData);
        console.log("Loaded player data:", playerData);

        // Load stats
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

        setStats(Array.isArray(sJson) ? sJson : []);

        // Load matches to get dates
        let allMatches = [];
        try {
          const mRes = await fetch(`${API}/matches/`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          const mData = await mRes.json().catch(() => []);
          if (mRes.ok && Array.isArray(mData)) {
            allMatches = mData;
            setMatches(mData);
          }
        } catch (e) {
          console.log("Error loading matches:", e);
        }

        // Load event instances for all matches for this player
        try {
          const allEventInstances = [];
          for (const match of allMatches) {
            try {
              const eventsRes = await fetch(`${API}/matches/${match.id}/events/`, {
                headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
              });
              if (eventsRes.ok) {
                const eventsData = await eventsRes.json().catch(() => []);
                if (Array.isArray(eventsData)) {
                  // Filter for this player
                  const playerEvents = eventsData.filter(e => e.player_id === playerId);
                  allEventInstances.push(...playerEvents);
                }
              }
            } catch (e) {
              console.log(`Error loading events for match ${match.id}:`, e);
            }
          }
          setEventInstances(allEventInstances);
        } catch (e) {
          console.log("Error loading event instances:", e);
        }

        // Load player xG stats
        try {
          const xgRes = await fetch(`${API}/teams/player-xg-stats/`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          const xgData = await xgRes.json().catch(() => ({}));
          if (xgRes.ok && Array.isArray(xgData?.player_xg)) {
            const playerXGData = xgData.player_xg.find(p => p.player === playerData.name);
            setPlayerXG(playerXGData?.xg || 0);
          }
        } catch (e) {
          console.log("Error loading xG:", e);
        }

        // Load ML recommendations
        const mlRes = await fetch(`${API}/ml/performance-improvement/?player_id=${playerId}`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const mlData = await mlRes.json().catch(() => ({}));
        if (mlRes.ok) {
          setMlRecommendations(mlData);
        }

        // Load ML Performance Analysis - try player-specific endpoint first
        try {
          // First try the player-specific endpoint
          const mlAnalysisRes = await fetch(`${API}/ml/performance-improvement/?player_id=${playerId}`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          
          if (mlAnalysisRes.ok) {
            const mlAnalysisData = await mlAnalysisRes.json().catch(() => ({}));
            console.log("Player-specific ML Analysis Response:", mlAnalysisData);
            
            // If we got a response with recommendations or performance_metrics, use it
            if (mlAnalysisData.recommendations || mlAnalysisData.performance_metrics) {
              // Add player info to match expected structure
              setMlAnalysis({ 
                players: [{
                  player_id: playerId,
                  player_name: playerData.name,
                  ...mlAnalysisData
                }] 
              });
              console.log("Set ML analysis from player-specific endpoint");
            }
          } else {
            console.log("Player-specific ML endpoint failed, trying team-level:", mlAnalysisRes.status);
            
            // Fallback to team-level endpoint
            const teamMlRes = await fetch(`${API}/ml/performance-improvement/`, {
              headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
            });
            const teamMlData = await teamMlRes.json().catch(() => ({}));
            console.log("Team-level ML Analysis Response:", teamMlData);
            
            if (teamMlRes.ok && teamMlData.players && Array.isArray(teamMlData.players)) {
              // Filter for this specific player
              const playerAnalysis = teamMlData.players.find(p => {
                const idMatch = Number(p.player_id) === Number(playerId);
                const nameMatch = p.player_name && playerData.name && 
                  p.player_name.toLowerCase().trim() === playerData.name.toLowerCase().trim();
                return idMatch || nameMatch;
              });
              
              if (playerAnalysis) {
                setMlAnalysis({ players: [playerAnalysis] });
                console.log("Set ML analysis from team-level endpoint");
              } else {
                console.log("No matching player in team-level response");
              }
            }
          }
        } catch (e) {
          console.log("Error loading ML analysis:", e);
        }
      } catch (e) {
        console.log(e);
        alert(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, playerId]);

  // Calculate player KPIs from stats
  const playerKPIs = useMemo(() => {
    const playerStats = stats.filter(s => Number(s.player_id) === playerId);
    
    const goals = playerStats
      .filter(s => s.event === "shots_on_target")
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    
    const keyPasses = playerStats
      .filter(s => s.event === "key_passes")
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    
    const duelsWon = playerStats
      .filter(s => s.event === "duels_won")
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    
    const tackles = playerStats
      .filter(s => s.event === "tackles")
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    
    const interceptions = playerStats
      .filter(s => s.event === "interceptions")
      .reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    
    // Calculate overall rating
    const allStats = {};
    playerStats.forEach(s => {
      allStats[s.event] = (allStats[s.event] || 0) + (Number(s.count) || 0);
    });
    const overallRating = calculatePlayerRating(allStats);
    
    return {
      goals,
      xg: playerXG,
      keyPasses,
      duelsWon,
      tackles,
      interceptions,
      rating: overallRating,
    };
  }, [stats, playerId, playerXG]);

  // Calculate zone-based statistics and heatmap data
  const zoneAnalysis = useMemo(() => {
    const zoneStats = {};
    const zoneEventCounts = {};
    
    eventInstances.forEach(instance => {
      if (!instance.zone) return;
      
      const zone = instance.zone.toString();
      if (!zoneStats[zone]) {
        zoneStats[zone] = {
          total: 0,
          attacking: 0,
          defensive: 0,
          events: {},
        };
        zoneEventCounts[zone] = 0;
      }
      
      zoneStats[zone].total++;
      zoneEventCounts[zone]++;
      
      const event = instance.event;
      zoneStats[zone].events[event] = (zoneStats[zone].events[event] || 0) + 1;
      
      // Categorize events
      if (["shots_on_target", "shots_off_target", "key_passes"].includes(event)) {
        zoneStats[zone].attacking++;
      }
      if (["tackles", "interceptions", "clearances", "blocks", "duels_won"].includes(event)) {
        zoneStats[zone].defensive++;
      }
    });
    
    return { zoneStats, zoneEventCounts };
  }, [eventInstances]);

  // Generate ML-style suggestions based on zone analysis
  const zoneSuggestions = useMemo(() => {
    const suggestions = [];
    const { zoneStats } = zoneAnalysis;
    
    // Zone mapping: 1&4=First third, 2&5=Middle third, 3&6=Final third
    const firstThirdZones = ["1", "4"];
    const middleThirdZones = ["2", "5"];
    const finalThirdZones = ["3", "6"];
    
    // Calculate totals per third
    const firstThirdTotal = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const middleThirdTotal = middleThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const finalThirdTotal = finalThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.total || 0), 0);
    const totalEvents = firstThirdTotal + middleThirdTotal + finalThirdTotal;
    
    if (totalEvents === 0) return suggestions;
    
    // Attacking analysis
    const firstThirdAttacking = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.attacking || 0), 0);
    const finalThirdAttacking = finalThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.attacking || 0), 0);
    
    if (finalThirdAttacking < firstThirdAttacking && finalThirdAttacking < totalEvents * 0.2) {
      suggestions.push({
        category: "Attacking",
        priority: "High",
        title: "Increase Final Third Activity",
        message: `Only ${Math.round((finalThirdAttacking / totalEvents) * 100)}% of attacking actions occur in the final third. Focus on positioning and movement to create more opportunities closer to goal.`,
        actionItems: [
          "Practice receiving the ball in advanced positions (Zones 3 & 6)",
          "Work on making runs into the penalty area",
          "Improve positioning during attacking phases",
        ],
      });
    }
    
    // Defensive analysis
    const firstThirdDefensive = firstThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.defensive || 0), 0);
    const middleThirdDefensive = middleThirdZones.reduce((sum, z) => sum + (zoneStats[z]?.defensive || 0), 0);
    
    if (firstThirdDefensive > (middleThirdDefensive + finalThirdTotal) * 1.5) {
      suggestions.push({
        category: "Defensive",
        priority: "High",
        title: "Move Defensive Actions Higher",
        message: `${Math.round((firstThirdDefensive / totalEvents) * 100)}% of defensive actions occur in your own third. Press higher up the pitch to relieve pressure and win the ball in more advanced positions.`,
        actionItems: [
          "Practice pressing in the middle third (Zones 2 & 5)",
          "Work on intercepting passes before they reach your defensive third",
          "Improve positioning to cut off passing lanes earlier",
        ],
      });
    }
    
    // Zone-specific insights
    Object.entries(zoneStats).forEach(([zone, stats]) => {
      if (stats.total < 3) return; // Skip zones with very few events
      
      const zonePercentage = (stats.total / totalEvents) * 100;
      const attackingPercentage = stats.total > 0 ? (stats.attacking / stats.total) * 100 : 0;
      const defensivePercentage = stats.total > 0 ? (stats.defensive / stats.total) * 100 : 0;
      
      // Identify zones with high activity but low effectiveness
      if (zonePercentage > 25 && attackingPercentage < 30 && defensivePercentage < 30) {
        suggestions.push({
          category: "Positioning",
          priority: "Medium",
          title: `Optimize Zone ${zone} Activity`,
          message: `Zone ${zone} accounts for ${Math.round(zonePercentage)}% of your activity but has mixed effectiveness. Focus on more decisive actions in this area.`,
          actionItems: [
            `Review game footage to identify patterns in Zone ${zone}`,
            "Work on decision-making when receiving the ball in this zone",
          ],
        });
      }
    });
    
    return suggestions;
  }, [zoneAnalysis]);

  // Prepare heatmap data for PitchVisualization
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
      if (zoneId) {
        heatmap[zoneId] = count;
      }
    });
    
    return heatmap;
  }, [zoneAnalysis]);

  // Calculate rating progression over time
  const ratingProgression = useMemo(() => {
    const playerStats = stats.filter(s => Number(s.player_id) === playerId);
    const matchRatings = {};
    
    // Group stats by match
    playerStats.forEach(stat => {
      const matchId = stat.match_id;
      if (!matchId) return;
      
      if (!matchRatings[matchId]) {
        matchRatings[matchId] = {};
      }
      matchRatings[matchId][stat.event] = (matchRatings[matchId][stat.event] || 0) + (Number(stat.count) || 0);
    });
    
    // Calculate rating per match and sort by date
    const ratings = Object.entries(matchRatings)
      .map(([matchId, matchStats]) => {
        const match = matches.find(m => m.id === Number(matchId));
        const rating = calculatePlayerRating(matchStats);
        return {
          matchId: Number(matchId),
          rating,
          date: match?.kickoff_at ? new Date(match.kickoff_at) : new Date(),
          matchName: match ? `${match.opponent} (${match.goals_scored || 0}-${match.goals_conceded || 0})` : `Match ${matchId}`,
        };
      })
      .sort((a, b) => a.date - b.date);
    
    return ratings;
  }, [stats, playerId, matches]);

  if (loading) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0f172a" />
            <Text style={styles.loadingText}>Loading player data...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Header */}
        <View style={styles.heroCard}>
          <View style={styles.heroInner}>
            <Text style={styles.playerName}>{player?.name || "Player"}</Text>
            <Text style={styles.heroSubtitle}>Player Profile</Text>
          </View>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingLabel}>Rating</Text>
            <Text style={styles.ratingValue}>{playerKPIs.rating.toFixed(1)}</Text>
            <Text style={styles.ratingOutOf}>/ 10</Text>
          </View>
        </View>

        {/* KPI Cards - each with accent color */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiGoals]}>
            <Text style={styles.kpiValue}>{playerKPIs.goals}</Text>
            <Text style={styles.kpiTitle}>Goals</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiXG]}>
            <Text style={styles.kpiValue}>{playerKPIs.xg.toFixed(2)}</Text>
            <Text style={styles.kpiTitle}>xG</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiPasses]}>
            <Text style={styles.kpiValue}>{playerKPIs.keyPasses}</Text>
            <Text style={styles.kpiTitle}>Key Passes</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiDuels]}>
            <Text style={styles.kpiValue}>{playerKPIs.duelsWon}</Text>
            <Text style={styles.kpiTitle}>Duels Won</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiTackles]}>
            <Text style={styles.kpiValue}>{playerKPIs.tackles}</Text>
            <Text style={styles.kpiTitle}>Tackles</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiInterceptions]}>
            <Text style={styles.kpiValue}>{playerKPIs.interceptions}</Text>
            <Text style={styles.kpiTitle}>Interceptions</Text>
          </View>
        </View>

        {/* Rating Progression Chart */}
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
                datasets: [{
                  data: ratingProgression.map(r => r.rating),
                  color: (opacity = 1) => `rgba(30, 64, 175, ${opacity})`,
                  strokeWidth: 3,
                }],
              }}
              width={Math.min(screenW - 80, 800)}
              height={280}
              chartConfig={{
                backgroundColor: "#ffffff",
                backgroundGradientFrom: "#eff6ff",
                backgroundGradientTo: "#ffffff",
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(30, 64, 175, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                propsForDots: {
                  r: "6",
                  strokeWidth: "3",
                  stroke: "#ffffff",
                  fill: "#1e40af",
                },
                propsForBackgroundLines: {
                  stroke: "#e2e8f0",
                  strokeWidth: 1,
                  strokeDasharray: "0",
                },
                fillShadowGradient: "#1e40af",
                fillShadowGradientOpacity: 0.15,
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

        {/* Zone Heatmap */}
        {Object.keys(heatmapData).length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Action Heatmap</Text>
              <Text style={styles.cardSubtitle}>Areas of highest activity on the pitch</Text>
            </View>
            <View style={styles.heatmapContainer}>
              <PitchVisualization
                width={Math.min(screenW - 100, 600)}
                height={400}
                heatMapData={heatmapData}
              />
            </View>
            <View style={styles.zoneStatsContainer}>
              {Object.entries(zoneAnalysis.zoneStats)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 3)
                .map(([zone, stats]) => (
                  <View key={zone} style={styles.zoneStatItem}>
                    <Text style={styles.zoneStatLabel}>Zone {zone}</Text>
                    <Text style={styles.zoneStatValue}>{stats.total} events</Text>
                    <Text style={styles.zoneStatDetail}>
                      {stats.attacking} attacking, {stats.defensive} defensive
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Zone-Based ML Suggestions */}
        {zoneSuggestions.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Zone-Based Performance Insights</Text>
              <Text style={styles.cardSubtitle}>Analysis of positioning and activity patterns</Text>
            </View>
            <View style={styles.recommendationsList}>
              {zoneSuggestions.map((suggestion, idx) => (
                <View key={idx} style={[styles.recommendationItem, suggestion.category === "Attacking" && styles.recItemAttacking, suggestion.category === "Defensive" && styles.recItemDefensive, suggestion.category === "Positioning" && styles.recItemPositioning]}>
                  <View style={styles.recommendationHeader}>
                    <View style={[styles.recommendationCategory, suggestion.category === "Attacking" && styles.recCatAttacking, suggestion.category === "Defensive" && styles.recCatDefensive, suggestion.category === "Positioning" && styles.recCatPositioning]}>
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

        {/* ML Performance Analysis */}
        {mlAnalysis && mlAnalysis.players && Array.isArray(mlAnalysis.players) && mlAnalysis.players.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>Performance Analysis & Insights</Text>
              <Text style={styles.cardSubtitle}>AI-powered performance evaluation and recommendations</Text>
            </View>
            
            {mlAnalysis.players.map((playerAnalysis, idx) => {
              // Extract performance metrics
              const metrics = playerAnalysis.performance_metrics || {};
              const duelWinRate = metrics.duel_win_rate || 0;
              const shotAccuracy = metrics.shot_accuracy || 0;
              const defensiveActions = metrics.defensive_actions || 0;
              const keyPasses = metrics.key_passes || 0;
              const disciplineScore = metrics.discipline_score || 100;
              
              // Generate insights based on metrics
              const insights = [];
              
              // Positive insights (strengths)
              if (duelWinRate >= 60) {
                insights.push({
                  type: "positive",
                  category: "Physical Performance",
                  title: "Strong Duel Performance",
                  message: `Duel win rate of ${duelWinRate.toFixed(1)}% demonstrates excellent positioning and timing in 1v1 situations. Continue focusing on body positioning and anticipation to maintain this level.`,
                });
              }
              if (shotAccuracy >= 50 && shotAccuracy > 0) {
                insights.push({
                  type: "positive",
                  category: "Attacking",
                  title: "Effective Finishing",
                  message: `Shot accuracy of ${shotAccuracy.toFixed(1)}% shows good composure in front of goal. Practice from various angles to maintain and improve this aspect of your game.`,
                });
              }
              if (defensiveActions >= 8) {
                insights.push({
                  type: "positive",
                  category: "Defensive Awareness",
                  title: "High Defensive Involvement",
                  message: `${defensiveActions} defensive actions indicate strong reading of the game and positioning. Continue maintaining high defensive awareness throughout matches.`,
                });
              }
              if (keyPasses >= 3) {
                insights.push({
                  type: "positive",
                  category: "Attacking",
                  title: "Creative Playmaking",
                  message: `${keyPasses} key passes demonstrate effective vision and decision-making in attack. Keep looking for opportunities to create goal-scoring chances for teammates.`,
                });
              }
              if (disciplineScore >= 80) {
                insights.push({
                  type: "positive",
                  category: "Discipline",
                  title: "Good Discipline",
                  message: `Discipline score of ${disciplineScore.toFixed(1)} reflects good timing and control in challenges. Continue focusing on clean challenges and proper positioning.`,
                });
              }
              
              // Negative insights (areas for improvement) from recommendations
              if (playerAnalysis.recommendations && Array.isArray(playerAnalysis.recommendations)) {
                playerAnalysis.recommendations.forEach(rec => {
                  insights.push({
                    type: "negative",
                    category: rec.category,
                    title: rec.title,
                    message: rec.message,
                    priority: rec.priority,
                    actionItems: rec.action_items || [],
                    expectedImprovement: rec.expected_improvement
                  });
                });
              }
              
              return (
                <View key={idx}>
                  {insights.map((insight, insightIdx) => (
                    <View key={insightIdx} style={styles.mlInsightCard}>
                      <View style={styles.mlInsightHeader}>
                        <Text style={styles.mlInsightCategory}>{insight.category}</Text>
                        {insight.priority && (
                          <Text style={styles.mlInsightPriority}>{insight.priority}</Text>
                        )}
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
                          <Text style={styles.mlInsightExpectedText}>
                            Expected: {insight.expectedImprovement}
                          </Text>
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
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    color: "#64748b",
    fontWeight: "500",
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e3a8a",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  heroInner: {},
  playerName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#93c5fd",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ratingBadge: {
    backgroundColor: "#1e40af",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    minWidth: 88,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  ratingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#93c5fd",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  ratingValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1.5,
  },
  ratingOutOf: {
    fontSize: 14,
    fontWeight: "600",
    color: "#93c5fd",
    marginTop: 2,
  },
  ratingNote: {
    maxWidth: 200,
    marginTop: 4,
  },
  ratingNoteText: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "500",
    lineHeight: 14,
    textAlign: "right",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  kpiCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderTopWidth: 4,
  },
  kpiGoals: { borderTopColor: "#059669" },
  kpiXG: { borderTopColor: "#1e40af" },
  kpiPasses: { borderTopColor: "#3b82f6" },
  kpiDuels: { borderTopColor: "#d97706" },
  kpiTackles: { borderTopColor: "#ea580c" },
  kpiInterceptions: { borderTopColor: "#7c3aed" },
  kpiValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
    letterSpacing: -1,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderLeftWidth: 4,
    borderLeftColor: "#1e40af",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  premiumChart: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  chartWrapper: {
    marginTop: 8,
    alignItems: "center",
  },
  metricsContainer: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 28,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  recommendationsList: {
    marginTop: 8,
  },
  recommendationItem: {
    padding: 20,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#1e40af",
  },
  recItemAttacking: { borderLeftColor: "#059669", backgroundColor: "#f0fdf4" },
  recItemDefensive: { borderLeftColor: "#7c3aed", backgroundColor: "#f5f3ff" },
  recItemPositioning: { borderLeftColor: "#d97706", backgroundColor: "#fffbeb" },
  recommendationHeader: {
    marginBottom: 10,
  },
  recommendationCategory: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#1e40af",
    borderRadius: 6,
    marginBottom: 8,
  },
  recCatAttacking: { backgroundColor: "#059669" },
  recCatDefensive: { backgroundColor: "#7c3aed" },
  recCatPositioning: { backgroundColor: "#d97706" },
  recTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.2,
  },
  recMessage: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 22,
    marginBottom: 14,
  },
  actionItemsContainer: {
    marginTop: 8,
  },
  actionItemRow: {
    flexDirection: "row",
    marginBottom: 8,
    paddingLeft: 4,
  },
  actionItemBullet: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    marginRight: 12,
    width: 16,
  },
  actionItemText: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
    lineHeight: 20,
  },
  heatmapContainer: {
    marginTop: 16,
    marginBottom: 24,
    alignItems: "center",
  },
  zoneStatsContainer: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
    flexWrap: "wrap",
  },
  zoneStatItem: {
    flex: 1,
    minWidth: 120,
    padding: 16,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderTopWidth: 3,
    borderTopColor: "#3b82f6",
  },
  zoneStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e40af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  zoneStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  zoneStatDetail: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  recommendationCategoryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  // ML Insights Section
  mlInsightCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderLeftWidth: 4,
    borderLeftColor: "#1e40af",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  mlInsightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  mlInsightCategory: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#1e40af",
    borderRadius: 6,
  },
  mlInsightPriority: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mlInsightTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  mlInsightMessage: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 22,
    marginBottom: 16,
    fontWeight: "400",
  },
  mlInsightActions: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  mlInsightActionsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e40af",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  mlInsightActionItem: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  mlInsightActionBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#1e40af",
    marginTop: 8,
    marginRight: 12,
  },
  mlInsightActionText: {
    flex: 1,
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 20,
    fontWeight: "400",
  },
  mlInsightExpected: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  mlInsightExpectedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    fontStyle: "italic",
  },
});
