// app/home.jsx - Unified home dashboard with team overview
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Dimensions } from "react-native";
import { router } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";
import AppLayout from "../components/AppLayout";
import PitchVisualization from "../components/PitchVisualization";
import { API, ngrokHeaders } from "../lib/config";
import { getToken, clearToken } from "../lib/auth";

const screenW = Dimensions.get("window").width;

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

export default function Home() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [stats, setStats] = useState(null);
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadData(t, null);
    })();
  }, []);

  // Reload team performance when season filter changes (any role with a team)
  useEffect(() => {
    if (!token || !team) return;
    (async () => {
      try {
        const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
        const perfRes = await fetch(`${API}/teams/performance-stats/${seasonParam}`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        const perfData = await perfRes.json().catch(() => ({}));
        if (perfRes.ok) {
          setTeamPerformance(perfData);
        }
      } catch (e) {
        console.log("Error loading team performance:", e);
      }
    })();
  }, [selectedSeason, token, team]);

  const loadData = async (t, season = null) => {
    try {
      setLoading(true);
      setFetchError(null);

      // Fetch user profile
      const meRes = await fetch(`${API}/auth/me/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meRes.ok) {
        setUser(meData);
        setTeam(meData.team);
      } else {
        console.log("Failed to load user profile:", meRes.status);
      }

      // Fetch matches
      const matchesRes = await fetch(`${API}/matches/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const matchesData = await matchesRes.json().catch(() => ({}));
      const matchesArray = Array.isArray(matchesData) ? matchesData : [];
      setMatches(matchesArray);

      // Extract available seasons
      const seasons = [...new Set(matchesArray.map(m => m.season).filter(Boolean))].sort().reverse();
      setAvailableSeasons(seasons);

      // Fetch team performance stats for anyone with a team (managers, analysts, players)
      if (meData.team) {
        const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
        const perfRes = await fetch(`${API}/teams/performance-stats/${seasonParam}`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        const perfData = await perfRes.json().catch(() => ({}));
        if (perfRes.ok) {
          setTeamPerformance(perfData);
        } else {
          console.log("Failed to load team performance:", perfRes.status);
        }
      }
    } catch (e) {
      console.log("Error loading data:", e);
      setFetchError(e?.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const role = user?.role || "analyst";
  const isManager = role === "manager";
  const isAnalyst = role === "analyst";
  const isPlayer = role === "player";
  
  // Filter matches by selected season
  const filteredMatches = useMemo(() => {
    if (!selectedSeason) return matches;
    return matches.filter(m => m.season === selectedSeason);
  }, [matches, selectedSeason]);

  // Calculate stats from filtered matches or team performance
  const calculatedStats = useMemo(() => {
    if (selectedSeason && filteredMatches.length > 0) {
      // Calculate from filtered matches when season is selected
      let wins = 0, draws = 0, losses = 0;
      let goalsScored = 0, goalsConceded = 0;
      
      filteredMatches.forEach(match => {
        const scored = match.goals_scored || 0;
        const conceded = match.goals_conceded || 0;
        goalsScored += scored;
        goalsConceded += conceded;
        
        if (scored > conceded) wins++;
        else if (scored === conceded) draws++;
        else losses++;
      });
      
      const totalMatches = wins + draws + losses || 1;
      const winRate = Math.round((wins / totalMatches) * 100);
      const totalPoints = (wins * 3) + (draws * 1);
      
      return {
        totalGoals: goalsScored,
        totalGoalsConceded: goalsConceded,
        winRate,
        totalPoints,
        matches: filteredMatches.length,
      };
    } else {
      // Use team performance data when no season filter
      return {
        totalGoals: teamPerformance?.goals?.scored || 0,
        totalGoalsConceded: teamPerformance?.goals?.conceded || 0,
        winRate: teamPerformance?.record ? 
          Math.round((teamPerformance.record.wins / (teamPerformance.record.wins + teamPerformance.record.draws + teamPerformance.record.losses || 1)) * 100) : 0,
        totalPoints: teamPerformance?.record?.points || 0,
        matches: matches.length,
      };
    }
  }, [filteredMatches, selectedSeason, teamPerformance, matches]);

  const totalGoals = calculatedStats.totalGoals;
  const totalGoalsConceded = calculatedStats.totalGoalsConceded;
  const winRate = calculatedStats.winRate;
  const totalPoints = calculatedStats.totalPoints;

  // Calculate season record from filtered matches
  const seasonRecord = useMemo(() => {
    if (selectedSeason && filteredMatches.length > 0) {
      let wins = 0, draws = 0, losses = 0;
      filteredMatches.forEach(match => {
        const scored = match.goals_scored || 0;
        const conceded = match.goals_conceded || 0;
        if (scored > conceded) wins++;
        else if (scored === conceded) draws++;
        else losses++;
      });
      return { wins, draws, losses };
    }
    return teamPerformance?.record || null;
  }, [filteredMatches, selectedSeason, teamPerformance]);

  // Prepare chart data
  const chartData = useMemo(() => {
    // Points per match (0 = loss, 1 = draw, 3 = win) – last 10 matches, so form/dips are visible
    const recentMatches = filteredMatches.slice(0, 10).reverse(); // Get last 10, reverse to show oldest to newest
    let cumulativePoints = 0;
    const pointsData = recentMatches.map((match, index) => {
      let matchPoints = 0;
      const goalsScored = match.goals_scored || 0;
      const goalsConceded = match.goals_conceded || 0;
      if (goalsScored > goalsConceded) matchPoints = 3; // Win
      else if (goalsScored === goalsConceded) matchPoints = 1; // Draw
      else matchPoints = 0; // Loss
      
      cumulativePoints += matchPoints;
      return {
        match: index + 1,
        points: cumulativePoints,
        matchPoints,
        opponent: match.opponent || 'Unknown',
        result: goalsScored > goalsConceded ? 'W' : goalsScored === goalsConceded ? 'D' : 'L',
      };
    });

    const pointsProgressionData = {
      labels: pointsData.map((_, i) => `GW${i + 1}`),
      datasets: [
        {
          data: pointsData.map(d => d.matchPoints),
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
      ],
      matchDetails: pointsData,
    };

    // Zone Analysis - All Event Types Combined
    const zoneCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    
    eventInstances.forEach(instance => {
      if (instance.zone && zoneCounts.hasOwnProperty(instance.zone)) {
        zoneCounts[instance.zone]++;
      }
    });
    
    const total = Object.values(zoneCounts).reduce((sum, count) => sum + count, 0);
    
    const zoneAnalysisData = {
      zoneCounts,
      total,
      zonePercentages: Object.entries(zoneCounts).map(([zone, count]) => ({
        zone: `Zone ${zone}`,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      })),
    };

    // Goals Trend by Game Week (Last 10 Matches)
    const recentMatchesForGoals = filteredMatches.slice(0, 10).reverse(); // Get last 10, reverse to show oldest to newest
    const scored = recentMatchesForGoals.length > 0
      ? recentMatchesForGoals.map(m => m.goals_scored || 0)
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const conceded = recentMatchesForGoals.length > 0
      ? recentMatchesForGoals.map(m => m.goals_conceded || 0)
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const goalsTrendMax = Math.max(1, ...scored, ...conceded);
    const goalsTrendData = {
      labels: recentMatchesForGoals.length > 0
        ? recentMatchesForGoals.map((_, i) => `GW${i + 1}`)
        : ['GW1', 'GW2', 'GW3', 'GW4', 'GW5', 'GW6', 'GW7', 'GW8', 'GW9', 'GW10'],
      datasets: [
        {
          data: scored,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: conceded,
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
          strokeWidth: 2,
        },
      ],
      segments: goalsTrendMax,
    };

    return { 
      pointsProgressionData: pointsProgressionData || { labels: [], datasets: [], matchDetails: [] }, 
      zoneAnalysisData: zoneAnalysisData || { zoneCounts: {}, total: 0, zonePercentages: [] }, 
      goalsTrendData: goalsTrendData || { labels: [], datasets: [], segments: 1 }
    };
  }, [filteredMatches, eventInstances]);

  // Fetch event instances for filtered matches to calculate zone heatmap
  // This must come AFTER filteredMatches is defined
  useEffect(() => {
    if (!token || !filteredMatches || filteredMatches.length === 0) {
      setEventInstances([]);
      return;
    }

    (async () => {
      try {
        // Fetch event instances for all filtered matches
        const allInstances = [];
        for (const match of filteredMatches.slice(0, 20)) { // Limit to 20 matches to avoid too many requests
          try {
            const res = await fetch(`${API}/matches/${match.id}/events/`, {
              headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
            });
            if (res.ok) {
              const instances = await res.json().catch(() => []);
              if (Array.isArray(instances)) {
                allInstances.push(...instances);
              }
            }
          } catch (e) {
            console.log(`Error fetching events for match ${match.id}:`, e);
          }
        }
        setEventInstances(allInstances);
      } catch (e) {
        console.log("Error fetching event instances:", e);
        setEventInstances([]);
      }
    })();
  }, [filteredMatches, token]);

  // Early return AFTER all hooks
  if (loading) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1e40af" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  // API unreachable (e.g. ngrok not running or wrong URL)
  if (fetchError) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={styles.errorTitle}>Can't reach server</Text>
            <Text style={styles.errorText}>
              {fetchError}. Make sure ngrok is running (ngrok http 8000) and that
              EXPO_PUBLIC_API_BASE in .env matches your ngrok URL. Restart Expo after changing .env.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => token && loadData(token, selectedSeason)}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppLayout>
    );
  }

  // If no token, redirect to login (but don't block rendering if we have data)
  if (!token) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1e40af" />
            <Text style={styles.loadingText}>Authenticating...</Text>
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
              <Text style={styles.webTitle}>Dashboard</Text>
              <Text style={styles.webSubtitle}>Team overview and performance metrics</Text>
            </View>
          </View>
        )}

        <ScrollView 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={{ 
            flex: 1,
            width: "100%",
            ...Platform.select({
              web: {
                height: "100%",
              },
            }),
          }}
        >
          {/* Player with no team: only show join CTA — no stats until assigned to a team */}
          {isPlayer && !team && (
            <TouchableOpacity
              style={styles.joinTeamPromptCard}
              onPress={() => router.push("/player/join-team")}
              activeOpacity={0.85}
            >
              <Text style={styles.joinTeamPromptTitle}>Join a team</Text>
              <Text style={styles.joinTeamPromptSubtitle}>
                Ask your manager for the team code, then enter it here to join and view team and personal stats.
              </Text>
              <Text style={styles.joinTeamPromptButton}>Enter team code →</Text>
            </TouchableOpacity>
          )}

          {/* Season Filter + Team Overview + Charts — only when user has a team */}
          {team && (
          <>
          <View style={styles.filterCard}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterLabel}>Filter by Season</Text>
              {selectedSeason && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{selectedSeason}</Text>
                </View>
              )}
            </View>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedSeason || "all"}
                onValueChange={(value) => setSelectedSeason(value === "all" ? null : value)}
                style={styles.picker}
                itemStyle={Platform.OS === "ios" ? styles.pickerItemIOS : undefined}
                prompt="Season"
              >
                <Picker.Item label="All Seasons" value="all" />
                {availableSeasons.map((season) => (
                  <Picker.Item key={season} label={String(season)} value={season} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Team Overview Card */}
          <View style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
                <View style={styles.teamHeaderRow}>
                  <View style={styles.teamInfoContainer}>
                    <Text style={styles.teamName}>{team.team_name}</Text>
                    {selectedSeason && (
                      <Text style={styles.currentSeason}>Season: {selectedSeason}</Text>
                    )}
                    {team.team_code && (role === "manager" || role === "analyst") && (
                      <View style={styles.teamCodeBadge}>
                        <Text style={styles.teamCodeLabel}>Team Code:</Text>
                        <Text style={styles.teamCodeValue}>{team.team_code}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              
              {/* Key Performance Metrics */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{calculatedStats.matches || 0}</Text>
                  <Text style={styles.metricLabel}>Matches</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{team.players_count || 0}</Text>
                  <Text style={styles.metricLabel}>Players</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{totalGoals}</Text>
                  <Text style={styles.metricLabel}>Goals Scored</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{totalGoalsConceded}</Text>
                  <Text style={styles.metricLabel}>Goals Conceded</Text>
                </View>
                {teamPerformance && (
                  <>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{winRate}%</Text>
                      <Text style={styles.metricLabel}>Win Rate</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{totalPoints}</Text>
                      <Text style={styles.metricLabel}>Points</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Team Record */}
              {seasonRecord && (
                <View style={styles.recordSection}>
                  <Text style={styles.recordTitle}>
                    {selectedSeason ? `${selectedSeason} Record` : 'Season Record'}
                  </Text>
                  <View style={styles.recordStats}>
                    <View style={styles.recordItem}>
                      <Text style={[styles.recordValue, styles.recordWin]}>{seasonRecord.wins || 0}</Text>
                      <Text style={styles.recordLabel}>Wins</Text>
                    </View>
                    <View style={styles.recordItem}>
                      <Text style={[styles.recordValue, styles.recordDraw]}>{seasonRecord.draws || 0}</Text>
                      <Text style={styles.recordLabel}>Draws</Text>
                    </View>
                    <View style={styles.recordItem}>
                      <Text style={[styles.recordValue, styles.recordLoss]}>{seasonRecord.losses || 0}</Text>
                      <Text style={styles.recordLabel}>Losses</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

          {/* Performance Charts */}
          <View style={styles.chartsContainer}>
            {/* Points Gained Over Time Chart (Last 10 Matches) */}
            {chartData?.pointsProgressionData?.labels && chartData.pointsProgressionData.labels.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Form (Points per Match)</Text>
                <Text style={styles.chartSubtitle}>Last 10 Matches — 0 = Loss, 1 = Draw, 3 = Win</Text>
                <LineChart
                  data={chartData.pointsProgressionData}
                  width={Platform.OS === "web" ? screenW - 320 : screenW - 80}
                  height={220}
                  chartConfig={{
                    backgroundColor: "#ffffff",
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: { borderRadius: 16 },
                    propsForDots: {
                      r: "5",
                      strokeWidth: "2",
                    },
                  }}
                  bezier
                  style={styles.chart}
                  fromZero
                  yAxisInterval={1}
                />
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
                    <Text style={styles.legendText}>Win (3 pts)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#fbbf24" }]} />
                    <Text style={styles.legendText}>Draw (1 pt)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
                    <Text style={styles.legendText}>Loss (0 pts)</Text>
                  </View>
                </View>
                <View style={styles.matchDetailsContainer}>
                  {chartData.pointsProgressionData.matchDetails.map((detail, idx) => (
                    <View key={idx} style={styles.matchDetailItem}>
                      <Text style={styles.matchDetailLabel}>GW{detail.match}</Text>
                      <Text style={styles.matchDetailOpponent}>{detail.opponent}</Text>
                      <View style={[styles.matchDetailResult, 
                        detail.result === 'W' ? styles.resultWin :
                        detail.result === 'D' ? styles.resultDraw : styles.resultLoss
                      ]}>
                        <Text style={styles.matchDetailResultText}>{detail.result}</Text>
                      </View>
                      <Text style={styles.matchDetailPoints}>+{detail.matchPoints}</Text>
                      <Text style={styles.matchDetailTotal}>{detail.points} pts</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Charts Row - Compact Side by Side */}
            <View style={styles.chartsRowCompact}>
              {/* Zone Analysis - Same pitch as other heatmaps, keep percentages/counts */}
              <View style={styles.chartCardCompact}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>Zone Analysis</Text>
                    <Text style={styles.chartSubtitle}>All Events</Text>
                  </View>
                </View>

                {(() => {
                  const data = chartData?.zoneAnalysisData;
                  if (!data || data.total === 0) {
                    return (
                      <View style={styles.pitchEmptyStateCompact}>
                        <Text style={styles.pitchEmptyText}>No data available</Text>
                      </View>
                    );
                  }

                  const heatMapData = {
                    defensive_left: data.zoneCounts["1"] || 0,
                    defensive_center: data.zoneCounts["2"] || 0,
                    defensive_right: data.zoneCounts["3"] || 0,
                    attacking_left: data.zoneCounts["4"] || 0,
                    attacking_center: data.zoneCounts["5"] || 0,
                    attacking_right: data.zoneCounts["6"] || 0,
                  };

                  const zoneNumToId = { "1": "defensive_left", "2": "defensive_center", "3": "defensive_right", "4": "attacking_left", "5": "attacking_center", "6": "attacking_right" };
                  const zoneLabels = {};
                  data.zonePercentages.forEach((z) => {
                    const num = z.zone.replace("Zone ", "");
                    const id = zoneNumToId[num];
                    if (id) zoneLabels[id] = `${z.percentage}%`;
                  });

                  return (
                    <View style={styles.pitchContainerCompact}>
                      <View style={styles.zoneAnalysisPitchWrapper}>
                        <PitchVisualization
                          width={Math.min(screenW - 72, 380)}
                          height={300}
                          heatMapData={heatMapData}
                          zoneLabels={zoneLabels}
                          minimalContainer
                        />
                      </View>
                      <Text style={styles.zoneAnalysisTotalCaption}>Total events: {data.total}</Text>
                    </View>
                  );
                })()}
              </View>

              {/* Goals Trend Chart - Compact */}
              <View style={styles.chartCardCompact}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>Goals Trend</Text>
                    <Text style={styles.chartSubtitle}>Last 10 Matches by Game Week</Text>
                  </View>
                </View>
                <View style={styles.goalsChartContainer}>
                  {chartData?.goalsTrendData ? (
                    <LineChart
                      data={chartData.goalsTrendData}
                      width={Math.min(screenW - 72, 440)}
                      height={260}
                      chartConfig={{
                        backgroundColor: "#ffffff",
                        backgroundGradientFrom: "#ffffff",
                        backgroundGradientTo: "#ffffff",
                        decimalPlaces: 0,
                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        style: { borderRadius: 16 },
                        propsForDots: {
                          r: "5",
                          strokeWidth: "2",
                        },
                      }}
                      bezier
                      style={styles.chart}
                      fromZero
                      segments={chartData.goalsTrendData.segments ?? 2}
                      yAxisInterval={1}
                    />
                  ) : (
                    <View style={styles.heatmapEmptyState}>
                      <Text style={styles.heatmapEmptyText}>No goals data available</Text>
                    </View>
                  )}
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
              </View>
            </View>
          </View>

          </>
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
    width: "100%",
    ...Platform.select({
      web: {
        minHeight: "100vh",
        height: "100%",
      },
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    maxWidth: 320,
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#1e40af",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
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
  content: {
    padding: 24,
    gap: 20,
    width: "100%",
    flexGrow: 1,
    ...Platform.select({
      web: {
        minWidth: 0,
        minHeight: "100%",
      },
    }),
  },
  joinTeamPromptCard: {
    backgroundColor: "#059669",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  joinTeamPromptTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
  },
  joinTeamPromptSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginBottom: 16,
    lineHeight: 20,
  },
  joinTeamPromptButton: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  overviewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  overviewHeader: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  teamName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  teamCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  teamCodeLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  teamCodeValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    textAlign: "center",
  },
  recordSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  recordStats: {
    flexDirection: "row",
    gap: 16,
  },
  recordItem: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  recordValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  recordWin: {
    color: "#059669",
  },
  recordDraw: {
    color: "#f59e0b",
  },
  recordLoss: {
    color: "#dc2626",
  },
  recordLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  statsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: 140,
    padding: 14,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statItemValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  statItemLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    lineHeight: 16,
  },
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.2,
  },
  filterBadge: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  filterBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  picker: {
    backgroundColor: "#f9fafb",
    color: "#111827",
    height: 50,
    ...Platform.select({
      ios: { width: "100%" },
      default: {},
    }),
  },
  pickerItemIOS: {
    fontSize: 16,
    color: "#111827",
  },
  teamHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamInfoContainer: {
    flex: 1,
  },
  currentSeason: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 4,
  },
  chartsContainer: {
    gap: 20,
  },
  chartsRow: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 20,
    ...Platform.select({
      web: {
        display: "flex",
        flexWrap: "wrap",
      },
    }),
  },
  chartsRowCompact: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 20,
    alignItems: "stretch",
    width: "100%",
  },
  chartCardCompact: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 0 : "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chartCardSmall: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 300 : "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chartHeader: {
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
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
  breakdownContainer: {
    marginTop: 16,
    gap: 8,
  },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  breakdownMonth: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    width: 32,
  },
  breakdownBars: {
    flex: 1,
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
  },
  breakdownBar: {
    height: "100%",
  },
  breakdownText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
    width: 40,
    textAlign: "right",
  },
  chartSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6b7280",
    marginBottom: 16,
    marginTop: -8,
  },
  matchDetailsContainer: {
    marginTop: 16,
    gap: 8,
  },
  matchDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  matchDetailLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    width: 32,
  },
  matchDetailOpponent: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#111827",
  },
  matchDetailResult: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  resultWin: {
    backgroundColor: "#22c55e",
  },
  resultDraw: {
    backgroundColor: "#fbbf24",
  },
  resultLoss: {
    backgroundColor: "#ef4444",
  },
  matchDetailResultText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  matchDetailPoints: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
    width: 40,
    textAlign: "right",
  },
  matchDetailTotal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e40af",
    width: 50,
    textAlign: "right",
  },
  heatmapContainer: {
    marginTop: 12,
  },
  // Clean Grid-Based Heatmap
  heatmapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  heatmapCell: {
    width: "31%", // 3 columns with gaps
    minWidth: 100,
  },
  heatmapCellInner: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(0, 0, 0, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    backgroundColor: "#ffffff",
  },
  heatmapZoneLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heatmapValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  heatmapSubtext: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  heatmapBar: {
    width: "100%",
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  heatmapBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  heatmapPercentage: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  // Color Scale Legend
  heatmapLegendContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  heatmapLegendTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textAlign: "center",
  },
  heatmapLegendBar: {
    flexDirection: "row",
    height: 20,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  heatmapLegendSegment: {
    flex: 1,
  },
  heatmapLegendLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  heatmapLegendLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9ca3af",
    flex: 1,
    textAlign: "center",
  },
  // Team Labels
  heatmapTeamLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  heatmapTeamLabel: {
    flex: 1,
    alignItems: "center",
  },
  heatmapTeamLabelText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heatmapEmptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heatmapEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  heatmapEmptySubtext: {
    fontSize: 13,
    fontWeight: "400",
    color: "#9ca3af",
    textAlign: "center",
  },
  // Event Selector Styles (matching manager dashboard)
  eventSelector: {
    marginBottom: 20,
  },
  eventPills: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
  },
  eventPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventPillActive: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  eventPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "capitalize",
  },
  eventPillTextActive: {
    color: "#ffffff",
  },
  // Pitch Visualization Styles (matching manager dashboard)
  pitchContainer: {
    marginBottom: 24,
  },
  pitchEventTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  pitchEventSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 16,
  },
  pitchField: {
    backgroundColor: "#16a34a",
    borderRadius: 16,
    padding: 24,
    borderWidth: 4,
    borderColor: "#ffffff",
    position: "relative",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    minHeight: 650,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pitchGoalTop: {
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginBottom: 24,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#e5e7eb",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pitchGoalBottom: {
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 24,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#e5e7eb",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pitchGoalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  pitchZonesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    width: "100%",
    justifyContent: "space-between",
  },
  pitchZone: {
    width: "48%",
    minHeight: 140,
    borderRadius: 12,
    padding: 18,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  pitchZoneContent: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  pitchZoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  pitchZoneLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pitchZoneCount: {
    fontSize: 42,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -1,
  },
  pitchZoneSubtext: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pitchZonePercentage: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    letterSpacing: 0.3,
  },
  pitchZoneBar: {
    width: "100%",
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 8,
  },
  pitchZoneBarFill: {
    height: "100%",
    backgroundColor: "#000000",
    borderRadius: 5,
  },
  pitchEmptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pitchEmptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
  },
  pitchContainerCompact: {
    marginBottom: 0,
  },
  pitchEventSubtitleCompact: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 12,
    textAlign: "center",
  },
  zoneAnalysisPitchWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(248,250,252,0.6)",
  },
  zoneAnalysisTotalCaption: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  premiumChart: {
    marginVertical: 8,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  pitchFieldCompact: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    padding: Platform.OS === "web" ? 16 : 12,
    borderWidth: 3,
    borderColor: "#ffffff",
    position: "relative",
    width: "100%",
    alignSelf: "center",
    minHeight: Platform.OS === "web" ? 400 : 350,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    overflow: "hidden",
  },
  pitchGoalTopCompact: {
    backgroundColor: "#ffffff",
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    paddingHorizontal: Platform.OS === "web" ? 16 : 12,
    borderRadius: 8,
    marginBottom: Platform.OS === "web" ? 12 : 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    width: "100%",
  },
  pitchGoalBottomCompact: {
    backgroundColor: "#ffffff",
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    paddingHorizontal: Platform.OS === "web" ? 16 : 12,
    borderRadius: 8,
    marginTop: Platform.OS === "web" ? 12 : 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    width: "100%",
  },
  pitchGoalLabelCompact: {
    fontSize: Platform.OS === "web" ? 10 : 9,
    fontWeight: "700",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pitchZonesContainerCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    justifyContent: "space-between",
    ...Platform.select({
      web: {
        gap: 10,
      },
      default: {
        marginHorizontal: -5,
      },
    }),
  },
  pitchZoneCompact: {
    width: "48%",
    minHeight: Platform.OS === "web" ? 90 : 80,
    borderRadius: 10,
    padding: Platform.OS === "web" ? 12 : 10,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    overflow: "hidden",
    marginBottom: Platform.OS === "web" ? 0 : 10,
    marginHorizontal: Platform.OS === "web" ? 0 : 5,
  },
  pitchZoneContentCompact: {
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  pitchZoneHeaderCompact: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  pitchZoneLabelCompact: {
    fontSize: Platform.OS === "web" ? 12 : 11,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  pitchZoneCountCompact: {
    fontSize: Platform.OS === "web" ? 28 : 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  pitchZonePercentageCompact: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    letterSpacing: 0.2,
  },
  pitchZoneBarCompact: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 6,
  },
  pitchEmptyStateCompact: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  goalsChartContainer: {
    marginTop: 8,
    alignItems: "center",
  },
  heatmapLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  heatmapLegendLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
  },
  heatmapLegendGradient: {
    flexDirection: "row",
    gap: 4,
  },
  heatmapLegendBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  heatmapLegendText: {
    fontSize: 10,
    fontWeight: "400",
    color: "#9ca3af",
  },
});
