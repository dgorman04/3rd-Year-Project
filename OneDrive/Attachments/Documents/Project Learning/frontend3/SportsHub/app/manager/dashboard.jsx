// app/manager/dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";

import { API, WS_URL, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";
import AppLayout from "../../components/AppLayout";
import KPICard from "../../components/KPICard";
import PitchVisualization from "../../components/PitchVisualization";

// Charts (use react-native-chart-kit for all platforms; victory-native can be undefined on iOS)
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";

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


export default function ManagerDashboard() {
  const [token, setToken] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);

  const [stats, setStats] = useState({});
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [liveMatch, setLiveMatch] = useState(null);
  const [liveMatchStats, setLiveMatchStats] = useState([]);
  const [wsStatus, setWsStatus] = useState("Offline");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const wsRef = useRef(null);
  const liveMatchRef = useRef(null);
  liveMatchRef.current = liveMatch;
  const [insights, setInsights] = useState([]);
  const [playerXGStats, setPlayerXGStats] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [teamAIRecommendations, setTeamAIRecommendations] = useState(null);
  const [teamPerformanceSuggestions, setTeamPerformanceSuggestions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [selectedEventType, setSelectedEventType] = useState("shots_on_target");
  const [formationChartReady, setFormationChartReady] = useState(false);

  const API_STATS_URL = `${API}/stats/`;
  const API_INSIGHTS_URL = `${API}/analytics/insights/`;
  const API_TEAM_PERFORMANCE_URL = `${API}/teams/performance-stats/`;
  const API_PLAYER_XG_URL = `${API}/teams/player-xg-stats/`;
  const API_TEAM_SUGGESTIONS_URL = `${API}/teams/performance-suggestions/`;
  const API_CURRENT_LIVE_MATCH = `${API}/matches/current-live/`;
  const API_ML_IMPROVEMENT = `${API}/ml/performance-improvement/`;
  const API_MATCHES_URL = `${API}/matches/`;

  // ----------------------------
  // Load token and user role
  // ----------------------------
  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      setTokenLoaded(true); // Mark that token check is complete
      if (!t) {
        router.replace("/");
        return;
      }
      
      // Get user role
      try {
        const res = await fetch(`${API}/auth/me/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        if (res.ok) {
          const userData = await res.json().catch(() => ({}));
          setUserRole(userData.role || "manager");
        }
      } catch (e) {
        console.log("Error loading user:", e);
      }
    })();
  }, []);

  // ----------------------------
  // 1) Initial load via REST (JWT headers)
  // ----------------------------
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        setErrorMsg("");

        const res = await fetch(API_STATS_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...ngrokHeaders(),
          },
        });

        const raw = await res.text();
        console.log("STATS:", res.status, raw);

        let data = [];
        try {
          data = JSON.parse(raw);
        } catch {
          data = [];
        }

        if (!res.ok) {
          if (res.status === 401) {
            setErrorMsg("Unauthorized. Please log in again.");
            await clearToken();
            router.replace("/");
            return;
          }
          setErrorMsg(data?.detail || "Failed to load stats.");
          return;
        }

        if (cancelled) return;

        // Convert list -> nested object
        const formatted = {};
        (Array.isArray(data) ? data : []).forEach(({ player, event, count }) => {
          if (!player || !event) return;
          if (!formatted[player]) formatted[player] = {};
          formatted[player][event] = Number(count || 0);
        });

        setStats(formatted);

        // Default selected player
        const players = Object.keys(formatted);
        if (players.length) setSelectedPlayer((p) => p ?? players[0]);

        // Fetch team performance stats (goals, xG, formations, record)
        try {
          const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
          const perfRes = await fetch(`${API_TEAM_PERFORMANCE_URL}${seasonParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          if (perfRes.ok) {
            const perfData = await perfRes.json().catch(() => ({}));
            setTeamPerformance(perfData);
          }
        } catch (e) {
          console.log("Team performance fetch error:", e);
        }

        // Fetch analytics / suggestions (best‑effort)
        try {
          const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
          const insRes = await fetch(`${API_INSIGHTS_URL}${seasonParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          const insRaw = await insRes.text();
          let insJson = {};
          try {
            insJson = JSON.parse(insRaw);
          } catch {
            insJson = {};
          }
          if (insRes.ok && Array.isArray(insJson?.players)) {
            setInsights(insJson.players);
          }
        } catch (e) {
          console.log("Insights fetch error:", e);
        }

        // Fetch player xG stats
        try {
          const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
          const xgRes = await fetch(`${API_PLAYER_XG_URL}${seasonParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          if (xgRes.ok) {
            const xgData = await xgRes.json().catch(() => ({}));
            setPlayerXGStats(Array.isArray(xgData?.player_xg) ? xgData.player_xg : []);
          }
        } catch (e) {
          console.log("Player xG fetch error:", e);
        }

        // Fetch team performance suggestions
        try {
          const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
          const suggestionsRes = await fetch(`${API_TEAM_SUGGESTIONS_URL}${seasonParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          if (suggestionsRes.ok) {
            const suggestionsData = await suggestionsRes.json().catch(() => ({}));
            setTeamPerformanceSuggestions(Array.isArray(suggestionsData?.suggestions) ? suggestionsData.suggestions : []);
          }
        } catch (e) {
          console.log("Team suggestions fetch error:", e);
        }

        // ML Performance Analysis removed - now shown on individual player pages

        // First, fetch all matches to get available seasons (for the dropdown)
        try {
          const allMatchesRes = await fetch(API_MATCHES_URL, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          if (allMatchesRes.ok) {
            const allMatchesData = await allMatchesRes.json().catch(() => []);
            const allMatchesArray = Array.isArray(allMatchesData) ? allMatchesData : [];
            
            // Extract available seasons from all matches
            const seasons = [...new Set(allMatchesArray.map(m => m.season).filter(Boolean))].sort().reverse();
            setAvailableSeasons(seasons);
          }
        } catch (e) {
          console.log("Error fetching all matches for seasons:", e);
        }

        // Fetch matches for charts (filtered by season if selected)
        try {
          const seasonParam = selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : "";
          const matchesRes = await fetch(`${API_MATCHES_URL}${seasonParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...ngrokHeaders(),
            },
          });
          if (matchesRes.ok) {
            const matchesData = await matchesRes.json().catch(() => []);
            const matchesArray = Array.isArray(matchesData) ? matchesData : [];
            setMatches(matchesArray);
            
            // Fetch event instances for all matches (limit to recent 20 to avoid too many requests)
            const allInstances = [];
            for (const match of matchesArray.slice(0, 20)) {
              try {
                const eventsRes = await fetch(`${API}/matches/${match.id}/events/`, {
                  headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
                });
                if (eventsRes.ok) {
                  const instances = await eventsRes.json().catch(() => []);
                  if (Array.isArray(instances)) {
                    allInstances.push(...instances);
                  }
                }
              } catch (e) {
                console.log(`Error fetching events for match ${match.id}:`, e);
              }
            }
            setEventInstances(allInstances);
          }
        } catch (e) {
          console.log("Matches fetch error:", e);
        }
      } catch (err) {
        console.log("Stats fetch error:", err);
        setErrorMsg("Network error loading stats.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, selectedSeason]);

  // ----------------------------
  // Fetch current live match and its stats
  // ----------------------------
  const liveMatchPollRef = useRef(null);
  const shouldPollRef = useRef(false);
  
  useEffect(() => {
    // COMPLETELY DISABLE POLLING if token not loaded or invalid
    if (!tokenLoaded || !token || token === null || token === "") {
      shouldPollRef.current = false;
      if (liveMatchPollRef.current) {
        clearInterval(liveMatchPollRef.current);
        liveMatchPollRef.current = null;
      }
      return;
    }

    // Only start polling if we have a valid token AND token is loaded
    shouldPollRef.current = true;

    const fetchLiveMatch = async () => {
      // Multiple safety checks - stop immediately if any condition fails
      if (!shouldPollRef.current || !tokenLoaded || !token || token === null || token === "" || liveMatchPollRef.current === null) {
        console.log("Polling blocked: token check failed", { shouldPoll: shouldPollRef.current, tokenLoaded, hasToken: !!token });
        return;
      }

      // CRITICAL: Double-check token exists before making request
      const currentToken = token;
      if (!currentToken || currentToken === null || currentToken === "") {
        console.log("Polling blocked: no token available");
        shouldPollRef.current = false;
        if (liveMatchPollRef.current) {
          clearInterval(liveMatchPollRef.current);
          liveMatchPollRef.current = null;
        }
        return;
      }
      
      try {
        const res = await fetch(API_CURRENT_LIVE_MATCH, {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            ...ngrokHeaders(),
          },
        });

        // Handle 401 Unauthorized - token expired or invalid
        if (res.status === 401) {
          console.log("Token expired or invalid, stopping live match polling");
          shouldPollRef.current = false;
          if (liveMatchPollRef.current) {
            clearInterval(liveMatchPollRef.current);
            liveMatchPollRef.current = null;
          }
          await clearToken();
          router.replace("/");
          return;
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.match) {
            setLiveMatch(data.match);
            
            // Fetch live match stats
            const statsRes = await fetch(`${API}/matches/${data.match.id}/stats/`, {
              headers: {
                Authorization: `Bearer ${token}`,
                ...ngrokHeaders(),
              },
            });
            
            // Handle 401 for stats fetch too
            if (statsRes.status === 401) {
              console.log("Token expired during stats fetch, stopping polling");
              shouldPollRef.current = false;
              if (liveMatchPollRef.current) {
                clearInterval(liveMatchPollRef.current);
                liveMatchPollRef.current = null;
              }
              await clearToken();
              router.replace("/");
              return;
            }
            
            if (statsRes.ok) {
              const statsData = await statsRes.json().catch(() => []);
              setLiveMatchStats(Array.isArray(statsData) ? statsData : []);
            }
          } else {
            setLiveMatch(null);
            setLiveMatchStats([]);
          }
        }
      } catch (e) {
        console.log("Live match fetch error:", e);
        // On network errors, don't stop polling (might be temporary)
        // Only stop on 401 authentication errors
      }
    };

    // ONLY start polling if ALL conditions are met
    if (tokenLoaded && token && token !== null && token !== "") {
      fetchLiveMatch();
      liveMatchPollRef.current = setInterval(fetchLiveMatch, 5000);
    }
    
    return () => {
      shouldPollRef.current = false;
      if (liveMatchPollRef.current) {
        clearInterval(liveMatchPollRef.current);
        liveMatchPollRef.current = null;
      }
    };
  }, [token, tokenLoaded]);

  // ----------------------------
  // 2) Live updates via WebSocket (Node + Redis)
  // ----------------------------
  useEffect(() => {
    if (!token) return;
    if (!WS_URL) return;

    console.log("Connecting WS:", WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Manager WS Connected");
      setWsStatus("Live");
    };

    ws.onclose = () => {
      console.log("Manager WS Closed");
      setWsStatus("Offline");
    };

    ws.onerror = (err) => {
      console.log("⚠️ Manager WS Error:", err?.message || err);
    };

    ws.onmessage = async (e) => {
      try {
        const parsed = JSON.parse(e.data);

        // Messages from the Node server come from Redis `events` channel and
        // are shaped like { kind: "stat" | "chat", data: {...} }.
        const kind = parsed?.kind ?? "stat";
        const payload = parsed?.data ?? parsed;

        if (kind === "stat") {
          const { player, event, count, match_id, type, goals_scored, goals_conceded } = payload || {};
          
          // Handle goal updates
          if (type === "goal_update") {
            // Refresh team performance stats when goals are updated
            fetch(API_TEAM_PERFORMANCE_URL, {
              headers: {
                Authorization: `Bearer ${token}`,
                ...ngrokHeaders(),
              },
            })
              .then(res => res.json().catch(() => ({})))
              .then(data => {
                setTeamPerformance(data);
              })
              .catch(e => console.log("Error refreshing team performance:", e));
            
            // Also refresh live match if it's the current live match
            const currentLive = liveMatchRef.current;
            if (currentLive && match_id && Number(match_id) === currentLive.id) {
              fetch(API_CURRENT_LIVE_MATCH, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  ...ngrokHeaders(),
                },
              })
                .then(res => res.json().catch(() => ({})))
                .then(data => {
                  if (data.match) {
                    setLiveMatch(data.match);
                  }
                })
                .catch(e => console.log("Error refreshing live match:", e));
            }
            return;
          }
          
          // Handle regular stat events
          if (!player || !event) return;

          setStats((prev) => {
            const next = { ...prev };
            if (!next[player]) next[player] = {};
            next[player] = { ...next[player], [event]: Number(count || 0) };
            return next;
          });

          // If this event is for the live match, refresh live match stats
          const currentLive = liveMatchRef.current;
          if (currentLive && match_id && Number(match_id) === currentLive.id) {
            fetch(`${API}/matches/${currentLive.id}/stats/`, {
              headers: {
                Authorization: `Bearer ${token}`,
                ...ngrokHeaders(),
              },
            })
              .then(res => res.json().catch(() => []))
              .then(data => {
                setLiveMatchStats(Array.isArray(data) ? data : []);
              })
              .catch(e => console.log("Error refreshing live match stats:", e));
          }

          setSelectedPlayer((p) => p ?? player);
        }
      } catch (err) {
        console.log("WS parse error:", err);
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [token]);

  // ----------------------------
  // Derived analytics (memoized)
  // ----------------------------
  const players = useMemo(() => Object.keys(stats).sort(), [stats]);

  const totalEventsAll = useMemo(() => {
    let total = 0;
    for (const p of Object.keys(stats)) {
      for (const c of Object.values(stats[p] || {})) total += Number(c || 0);
    }
    return total;
  }, [stats]);

  const totalsPerPlayer = useMemo(() => {
    return players.map((p) =>
      Object.values(stats[p] || {}).reduce((a, b) => a + Number(b || 0), 0)
    );
  }, [players, stats]);

  const eventTotals = useMemo(() => {
    const totals = {};
    for (const p of Object.keys(stats)) {
      for (const [event, count] of Object.entries(stats[p] || {})) {
        totals[event] = (totals[event] || 0) + Number(count || 0);
      }
    }
    ALL_EVENTS.forEach((e) => {
      if (totals[e] == null) totals[e] = 0;
    });
    return totals;
  }, [stats]);

  const topPlayer = useMemo(() => {
    if (!players.length) return null;
    let best = players[0];
    let bestVal = -1;
    players.forEach((p, idx) => {
      const v = totalsPerPlayer[idx];
      if (v > bestVal) {
        bestVal = v;
        best = p;
      }
    });
    return { player: best, total: bestVal };
  }, [players, totalsPerPlayer]);

  const selectedPlayerSeries = useMemo(() => {
    const p = selectedPlayer;
    if (!p || !stats[p]) return ALL_EVENTS.map(() => 0);
    return ALL_EVENTS.map((e) => Number(stats[p]?.[e] || 0));
  }, [selectedPlayer, stats]);

  // ----------------------------
  // Chart configs
  // ----------------------------
  const chartConfig = useMemo(
    () => ({
      backgroundGradientFrom: "#ffffff",
      backgroundGradientTo: "#ffffff",
      decimalPlaces: 0,
      color: () => "#333",
      labelColor: () => "#333",
      propsForDots: { r: "3" },
      barPercentage: 0.65,
    }),
    []
  );

  const barDataSelectedPlayer = useMemo(
    () => ({
      labels: ALL_EVENTS.map((e) => e.replace("_", "\n")),
      datasets: [{ data: selectedPlayerSeries }],
    }),
    [selectedPlayerSeries]
  );



  const Pill = ({ label, active, onPress }) => (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const handleLogout = async () => {
    await clearToken();
    router.replace("/");
  };

  // Calculate KPIs from team performance
  const winRate = useMemo(() => {
    if (!teamPerformance?.record) return 0;
    const { wins, draws, losses } = teamPerformance.record;
    const total = wins + draws + losses;
    return total > 0 ? Math.round((wins / total) * 100) : 0;
  }, [teamPerformance]);

  const goalsScored = teamPerformance?.goals?.scored || 0;
  const activePlayers = players.length;

  // Calculate possession from matches (home vs away)
  const possessionAvg = useMemo(() => {
    // This is a simplified calculation - in a real app you'd have possession data per match
    const homeMatches = matches.filter(m => m.is_home).length;
    const totalMatches = matches.length || 1;
    // Estimate based on home advantage (typically teams have higher possession at home)
    return Math.round(50 + (homeMatches / totalMatches) * 10);
  }, [matches]);

  // Calculate match results by month from actual matches
  const matchResultsData = useMemo(() => {
    const monthStats = {};
    
    matches.forEach((match) => {
      if (!match.kickoff_at) return;
      const date = new Date(match.kickoff_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
      
      if (!monthStats[monthKey]) {
        monthStats[monthKey] = { wins: 0, draws: 0, losses: 0 };
      }
      
      if (match.goals_scored > match.goals_conceded) {
        monthStats[monthKey].wins++;
      } else if (match.goals_scored === match.goals_conceded) {
        monthStats[monthKey].draws++;
      } else {
        monthStats[monthKey].losses++;
      }
    });

    // Get last 6 months with data
    const months = Object.keys(monthStats).slice(-6);
    if (months.length === 0) {
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
      labels: months,
      datasets: [
        {
          data: months.map(m => monthStats[m].wins),
          color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
        },
        {
          data: months.map(m => monthStats[m].draws),
          color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})`,
        },
        {
          data: months.map(m => monthStats[m].losses),
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
        },
      ],
    };
  }, [matches]);

  // Calculate goals trend by month from actual matches
  const goalsTrendData = useMemo(() => {
    const monthStats = {};
    
    matches.forEach((match) => {
      if (!match.kickoff_at) return;
      const date = new Date(match.kickoff_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
      
      if (!monthStats[monthKey]) {
        monthStats[monthKey] = { scored: 0, conceded: 0 };
      }
      
      monthStats[monthKey].scored += match.goals_scored || 0;
      monthStats[monthKey].conceded += match.goals_conceded || 0;
    });

    const months = Object.keys(monthStats).slice(-6);
    if (months.length === 0) {
      return {
        labels: [],
        datasets: [
          { data: [], color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, strokeWidth: 2 },
          { data: [], color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 2 },
        ],
      };
    }

    return {
      labels: months,
      datasets: [
        {
          data: months.map(m => monthStats[m].scored),
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: months.map(m => monthStats[m].conceded),
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [matches]);

  // Filter matches by season
  const filteredMatches = useMemo(() => {
    if (!selectedSeason) return matches;
    return matches.filter(m => m.season === selectedSeason);
  }, [matches, selectedSeason]);

  // Calculate formation results with average points per match
  const formationResults = useMemo(() => {
    const formMap = {};
    filteredMatches.forEach(match => {
      if (!match.formation) return;
      if (!formMap[match.formation]) {
        formMap[match.formation] = { wins: 0, draws: 0, losses: 0, total: 0, points: 0 };
      }
      formMap[match.formation].total++;
      const scored = match.goals_scored || 0;
      const conceded = match.goals_conceded || 0;
      if (scored > conceded) {
        formMap[match.formation].wins++;
        formMap[match.formation].points += 3;
      } else if (scored === conceded) {
        formMap[match.formation].draws++;
        formMap[match.formation].points += 1;
      } else {
        formMap[match.formation].losses++;
      }
    });
    return Object.entries(formMap).map(([formation, data]) => ({
      formation,
      ...data,
      winRate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
      avgPointsPerMatch: data.total > 0 ? (data.points / data.total).toFixed(2) : 0,
    })).sort((a, b) => parseFloat(b.avgPointsPerMatch) - parseFloat(a.avgPointsPerMatch));
  }, [filteredMatches]);

  // Chart data for formation comparison - Victory format
  const formationChartData = useMemo(() => {
    if (formationResults.length === 0) return null;
    return formationResults.map((f, index) => ({
      x: f.formation,
      y: parseFloat(f.avgPointsPerMatch),
      label: parseFloat(f.avgPointsPerMatch).toFixed(2),
      index: index,
    }));
  }, [formationResults]);

  // Get max value for y-axis - fixed to 3 for consistent display
  const maxPoints = 3;

  // Delay mounting Formation BarChart so bars paint on first load (avoids refresh)
  useEffect(() => {
    if (formationChartData && formationChartData.length > 0) {
      const t = setTimeout(() => setFormationChartReady(true), 100);
      return () => clearTimeout(t);
    } else {
      setFormationChartReady(false);
    }
  }, [formationChartData]);

  // Enhanced insights algorithm
  const enhancedInsights = useMemo(() => {
    const insights = [];
    
    // xG Analysis (xG For only)
    if (teamPerformance?.xg) {
      const xgFor = teamPerformance.xg.for || 0;
      const goalsFor = teamPerformance.goals?.scored || 0;
      
      if (goalsFor > xgFor * 1.2 && xgFor > 0) {
        insights.push({
          type: "positive",
          category: "Finishing",
          title: "Clinical Finishing",
          message: `Scoring ${goalsFor} goals from ${xgFor.toFixed(1)} xG shows excellent finishing efficiency (${((goalsFor / xgFor) * 100).toFixed(0)}% conversion).`,
        });
      } else if (goalsFor < xgFor * 0.8 && xgFor > 0) {
        insights.push({
          type: "warning",
          category: "Finishing",
          title: "Underperforming xG",
          message: `Only ${goalsFor} goals from ${xgFor.toFixed(1)} xG suggests finishing needs improvement.`,
        });
      }
    }

    // Zone Analysis Insights
    const zoneAnalysis = {};
    eventInstances.forEach(instance => {
      if (!instance.zone || !instance.event) return;
      if (!zoneAnalysis[instance.event]) zoneAnalysis[instance.event] = {};
      if (!zoneAnalysis[instance.event][instance.zone]) {
        zoneAnalysis[instance.event][instance.zone] = 0;
      }
      zoneAnalysis[instance.event][instance.zone]++;
    });

    Object.entries(zoneAnalysis).forEach(([event, zones]) => {
      const total = Object.values(zones).reduce((sum, count) => sum + count, 0);
      if (total < 10) return; // Skip events with too few instances
      
      const maxZone = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];
      const percentage = (maxZone[1] / total) * 100;
      
      if (percentage > 40) {
        insights.push({
          type: "info",
          category: "Zone Analysis",
          title: `${event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} Concentration`,
          message: `${percentage.toFixed(0)}% of ${event.replace(/_/g, " ")} occur in Zone ${maxZone[0]}, indicating a clear pattern.`,
        });
      }
    });

    // Formation Performance
    if (formationResults.length > 0) {
      const bestFormation = formationResults
        .filter(f => f.total >= 3)
        .sort((a, b) => b.winRate - a.winRate)[0];

      if (bestFormation && bestFormation.winRate > 60) {
        insights.push({
          type: "positive",
          category: "Formation",
          title: "Strong Formation Performance",
          message: `${bestFormation.formation} has a ${bestFormation.winRate}% win rate across ${bestFormation.total} matches.`,
        });
      }
    }

    // Top Performers
    if (playerXGStats.length > 0) {
      insights.push({
        type: "info",
        category: "Attacking",
        title: "Top xG Contributor",
        message: `${playerXGStats[0].player} leads with ${playerXGStats[0].xg} xG, showing strong attacking threat.`,
      });
    }

    return insights.slice(0, 6); // Limit to top 6 insights
  }, [teamPerformance, eventInstances, formationResults, playerXGStats]);

  // Zone analysis for event heatmaps
  const zoneAnalysisByEvent = useMemo(() => {
    const zoneData = {};
    
    ALL_EVENTS.forEach(eventType => {
      const eventInstancesForType = eventInstances.filter(e => e.event === eventType && e.zone);
      const zoneCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
      
      eventInstancesForType.forEach(instance => {
        if (zoneCounts.hasOwnProperty(instance.zone)) {
          zoneCounts[instance.zone]++;
        }
      });
      
      const total = Object.values(zoneCounts).reduce((sum, count) => sum + count, 0);
      const maxCount = Math.max(...Object.values(zoneCounts), 1);
      
      zoneData[eventType] = {
        zoneCounts,
        total,
        maxCount,
        zonePercentages: Object.entries(zoneCounts).map(([zone, count]) => ({
          zone: `Zone ${zone}`,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
          intensity: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
        })).sort((a, b) => parseInt(a.zone.split(' ')[1]) - parseInt(b.zone.split(' ')[1])),
      };
    });
    
    return zoneData;
  }, [eventInstances]);

  // Don't render main UI until token is loaded AND valid (use View not null to avoid RN render error)
  if (!tokenLoaded) {
    return (
      <AppLayout>
        <View style={styles.screen} />
      </AppLayout>
    );
  }
  if (!token || token === null || token === "") {
    if (liveMatchPollRef.current) {
      clearInterval(liveMatchPollRef.current);
      liveMatchPollRef.current = null;
    }
    shouldPollRef.current = false;
    return (
      <AppLayout>
        <View style={styles.screen} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <View style={styles.screen}>
        {/* Web only: top header and status badge. On phone use sidebar only (no duplicate navbar). */}
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View>
              <Text style={styles.webTitle}>Dashboard</Text>
              <Text style={styles.webSubtitle}>Overview of team performance and key metrics</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, wsStatus === "Live" && styles.statusDotLive]} />
              <Text style={styles.statusText}>{wsStatus}</Text>
            </View>
          </View>
        )}

        {!!errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* Season Filter */}
          {availableSeasons.length > 0 && (
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
                >
                  <Picker.Item label="All Seasons" value="all" />
                  {availableSeasons.map((season) => (
                    <Picker.Item key={season} label={season} value={season} />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          {/* xG Overview */}
          {teamPerformance && (() => {
            const xgFor = teamPerformance.xg?.for || 0;
            const goalsScored = teamPerformance.goals?.scored || 0;
            const xgForDiff = goalsScored - xgFor;

            return (
              <View style={styles.xgCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Expected Goals (xG)</Text>
                  <Text style={styles.sectionSubtitle}>Performance Analysis</Text>
                </View>

                {/* xG For Section */}
                <View style={styles.xgSection}>
                  <View style={styles.xgSectionHeader}>
                    <View style={styles.xgSectionBar} />
                    <Text style={styles.xgSectionTitle}>xG For</Text>
                  </View>
                  <View style={styles.xgSectionContent}>
                    <View style={styles.xgMetricRow}>
                      <View style={styles.xgMetricItem}>
                        <Text style={styles.xgMetricLabel}>Expected Goals</Text>
                        <Text style={styles.xgMetricValue}>{xgFor.toFixed(2)}</Text>
                      </View>
                      <View style={styles.xgMetricDivider} />
                      <View style={styles.xgMetricItem}>
                        <Text style={styles.xgMetricLabel}>Goals Scored</Text>
                        <Text style={styles.xgMetricValue}>{goalsScored}</Text>
                      </View>
                    </View>
                    <View style={styles.xgDifferenceRow}>
                      <Text style={styles.xgDifferenceLabel}>Difference</Text>
                      <Text style={[
                        styles.xgDifferenceValue,
                        xgForDiff >= 0 ? styles.xgPositive : styles.xgNegative
                      ]}>
                        {xgForDiff >= 0 ? "+" : ""}{xgForDiff.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.xgPerformanceIndicator}>
                      <Text style={[
                        styles.xgPerformanceText,
                        xgForDiff >= 0 ? styles.xgPositive : styles.xgNegative
                      ]}>
                        {xgForDiff >= 0 ? "Overperforming" : "Underperforming"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Results by Formation - Premium Chart */}
          {formationChartData && formationChartData.length > 0 && formationChartReady && (
            <View style={styles.premiumChartCard}>
              <View style={styles.premiumChartHeader}>
                <View>
                  <Text style={styles.premiumChartTitle}>Formation Performance</Text>
                  <Text style={styles.premiumChartSubtitle}>Average Points Per Match</Text>
                </View>
              </View>
              <View style={styles.premiumChartContainer}>
                <View style={styles.chartWrapper}>
                  <View style={styles.chartYAxisLabel}>
                    <Text style={[styles.chartAxisLabelText, { transform: [{ rotate: "-90deg" }] }]}>POINTS</Text>
                  </View>
                  <BarChart
                    key={`formation-bars-${formationChartData.length}-${formationChartData.map(d => d.x).join("-")}`}
                    data={{
                      labels: formationChartData.map(d => d.x),
                      datasets: [{
                        data: formationChartData.map(d => Math.min(Number(d.y), 3)),
                      }],
                    }}
                    width={Platform.OS === "web" ? 750 : screenW - 60}
                    height={380}
                    chartConfig={{
                      backgroundColor: "transparent",
                      backgroundGradientFrom: "#ffffff",
                      backgroundGradientTo: "#ffffff",
                      decimalPlaces: 2,
                      color: (opacity = 1, index) => {
                        if (index === undefined || !formationChartData || !formationChartData[index]) {
                          return `rgba(37, 99, 235, ${opacity})`;
                        }
                        const datum = formationChartData[index];
                        if (!datum || datum.y === undefined) {
                          return `rgba(37, 99, 235, ${opacity})`;
                        }
                        const intensity = datum.y / maxPoints;
                        if (intensity > 0.75) return `rgba(30, 58, 138, ${opacity})`;
                        if (intensity > 0.5) return `rgba(37, 99, 235, ${opacity})`;
                        if (intensity > 0.25) return `rgba(59, 130, 246, ${opacity})`;
                        return `rgba(96, 165, 250, ${opacity})`;
                      },
                      labelColor: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
                      fillShadowGradient: "#2563eb",
                      fillShadowGradientOpacity: 0.9,
                      style: { borderRadius: 0 },
                      barPercentage: 0.65,
                      propsForBackgroundLines: {
                        strokeDasharray: "",
                        stroke: "#f1f5f9",
                        strokeWidth: 1,
                      },
                      propsForLabels: {
                        fontSize: 15,
                        fontWeight: "900",
                        fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
                        fill: "#0f172a",
                      },
                      propsForVerticalLabels: {
                        fontSize: 13,
                        fontWeight: "700",
                        fill: "#64748b",
                      },
                      propsForHorizontalLabels: {
                        fontSize: 16,
                        fontWeight: "800",
                        fill: "#0f172a",
                        fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
                      },
                      formatYLabel: (value) => {
                        const num = parseFloat(value);
                        const r = Math.round(num);
                        if (r >= 0 && r <= 3 && Math.abs(num - r) < 0.001) return String(r);
                        return "";
                      },
                      formatTopBarValue: (value) => Number(value).toFixed(2),
                    }}
                    style={styles.premiumChart}
                    showValuesOnTopOfBars
                    fromZero
                    fromNumber={3}
                    yAxisLabel=""
                    yAxisSuffix=""
                    yAxisInterval={1}
                    withInnerLines={true}
                    withVerticalLabels={true}
                    withHorizontalLabels={true}
                    segments={3}
                    yAxisMax={3}
                    yAxisMin={0}
                    verticalLabelRotation={0}
                  />
                </View>

                {/* X-Axis Label */}
                <View style={styles.chartXAxisLabel}>
                  <Text style={styles.chartAxisLabelText}>FORMATION</Text>
                </View>
              </View>
            </View>
          )}

          {/* Zone Analysis - Pitch Visualization */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Zone Analysis</Text>
              <Text style={styles.sectionSubtitle}>Shooting & Action Zones</Text>
            </View>
            
            {/* Event Type Selector */}
            <View style={styles.eventSelector}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.eventPills}>
                  {ALL_EVENTS.map((event) => (
                    <TouchableOpacity
                      key={event}
                      style={[styles.eventPill, selectedEventType === event && styles.eventPillActive]}
                      onPress={() => setSelectedEventType(event)}
                    >
                      <Text style={[styles.eventPillText, selectedEventType === event && styles.eventPillTextActive]}>
                        {event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Pitch Visualization - same design as home Zone Analysis */}
            {selectedEventType && (() => {
              const data = zoneAnalysisByEvent[selectedEventType];
              if (!data || data.total === 0) {
                return (
                  <View style={styles.pitchEmptyState}>
                    <Text style={styles.pitchEmptyText}>No data available for this event type</Text>
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
                <View style={styles.zoneAnalysisPitchContainer}>
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

          {/* Top Stat Leaders */}
          <View style={styles.topPerformersCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Performers</Text>
              <Text style={styles.sectionSubtitle}>Leaders in Key Performance Areas</Text>
            </View>
            
            {(() => {
              // Key performance stats
              const keyStats = [
                { label: "Shots on Target", event: "shots_on_target" },
                { label: "Key Passes", event: "key_passes" },
                { label: "Duels Won", event: "duels_won" },
                { label: "Highest xG", event: "xg", isXG: true },
              ];

              const topLeaders = keyStats.map(stat => {
                let leaders;
                if (stat.isXG) {
                  // For xG, use playerXGStats
                  leaders = playerXGStats
                    .map(p => ({
                      player: p.player,
                      count: p.xg,
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);
                } else {
                  // For regular stats
                  leaders = Object.entries(stats)
                    .map(([player, events]) => ({
                      player,
                      count: Number(events[stat.event] || 0),
                    }))
                    .filter(l => l.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);
                }

                return { ...stat, leaders };
              }).filter(stat => stat.leaders.length > 0);

              return (
                <View style={styles.topPerformersGrid}>
                  {topLeaders.map((stat, idx) => (
                    <View key={idx} style={styles.topPerformerCategory}>
                      <View style={styles.topPerformerCategoryHeader}>
                        <View style={styles.topPerformerCategoryBar} />
                        <Text style={styles.topPerformerCategoryLabel}>{stat.label}</Text>
                      </View>
                      <View style={styles.topPerformerList}>
                        {stat.leaders.map((leader, leaderIdx) => (
                          <View key={leaderIdx} style={styles.topPerformerItem}>
                            <View style={styles.topPerformerRankContainer}>
                              <Text style={styles.topPerformerRank}>
                                {leaderIdx + 1}
                              </Text>
                            </View>
                            <View style={styles.topPerformerInfo}>
                              <Text style={styles.topPerformerName}>{leader.player}</Text>
                              <View style={styles.topPerformerValueContainer}>
                                <Text style={styles.topPerformerValue}>
                                  {stat.isXG && leader.count != null ? Number(leader.count).toFixed(2) : (leader.count ?? 0)}
                                </Text>
                                {stat.isXG && (
                                  <Text style={styles.topPerformerUnit}>xG</Text>
                                )}
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>

          {/* Enhanced Quick Insights */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Insights</Text>
              <Text style={styles.sectionSubtitle}>Key Performance Indicators</Text>
            </View>
            
            <View style={styles.insightsContainer}>
              {enhancedInsights.length > 0 ? (
                enhancedInsights.map((insight, idx) => (
                  <View key={idx} style={[
                    styles.insightCard,
                    insight.type === "positive" && styles.insightCardPositive,
                    insight.type === "warning" && styles.insightCardWarning,
                    insight.type === "info" && styles.insightCardInfo,
                  ]}>
                    <View style={styles.insightCardHeader}>
                      <View style={styles.insightCategoryBadge}>
                        <Text style={styles.insightCategoryText}>{insight.category}</Text>
                      </View>
                      {insight.type === "positive" && <Text style={styles.insightIcon}>✓</Text>}
                      {insight.type === "warning" && <Text style={styles.insightIcon}>⚠</Text>}
                      {insight.type === "info" && <Text style={styles.insightIcon}>ℹ</Text>}
                    </View>
                    <Text style={styles.insightCardTitle}>{insight.title}</Text>
                    <Text style={styles.insightCardMessage}>{insight.message}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noInsightsText}>No insights available yet. Record more matches to generate insights.</Text>
              )}
            </View>
          </View>


          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </AppLayout>
  );
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
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9ca3af",
  },
  statusDotLive: {
    backgroundColor: "#ef4444",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
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
  chartsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 24,
    ...Platform.select({
      web: {
        display: "flex",
        flexWrap: "wrap",
      },
    }),
  },
  chartCard: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 400 : screenW - 48,
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
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 12,
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
  statusBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8f8f8",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  status: {
    color: "#333",
    fontWeight: "normal",
    fontSize: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  navBtn: {
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  navBtnText: {
    color: "#333",
    fontWeight: "normal",
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: "#ffebeb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffcccc",
  },
  errorText: {
    color: "#cc0000",
    fontWeight: "normal",
    fontSize: 12,
  },
  content: {
    padding: 12,
    gap: 12,
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  kpiLabel: {
    color: "#666",
    fontWeight: "normal",
    fontSize: 11,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  kpiHint: {
    marginTop: 4,
    color: "#666",
    fontSize: 10,
    fontWeight: "normal",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    marginTop: 4,
  },
  cardHint: {
    marginTop: 4,
    color: "#666",
    fontSize: 12,
    fontWeight: "normal",
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  pillActive: {
    backgroundColor: "#333",
    borderColor: "#333",
  },
  pillText: {
    color: "#333",
    fontWeight: "normal",
    fontSize: 12,
  },
  pillTextActive: {
    color: "#fff",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  statItem: {
    width: "30%",
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  insightRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  insightLabel: {
    color: "#666",
    fontWeight: "normal",
    fontSize: 12,
  },
  insightValue: {
    color: "#333",
    fontWeight: "600",
    fontSize: 12,
  },
  suggestionItem: {
    marginTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  suggestionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  suggestionCategory: {
    fontSize: 11,
    color: "#666",
    fontWeight: "normal",
    textTransform: "uppercase",
  },
  suggestionPriority: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "#f0f0f0",
  },
  priorityHigh: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  suggestionMessage: {
    fontSize: 12,
    color: "#666",
    fontWeight: "normal",
    marginBottom: 8,
    lineHeight: 18,
  },
  actionItemsContainer: {
    marginTop: 4,
  },
  actionItem: {
    fontSize: 12,
    color: "#555",
    fontWeight: "normal",
    marginTop: 4,
    lineHeight: 18,
  },
  chart: {
    marginTop: 12,
    borderRadius: 6,
  },
  performanceCompact: {
    marginTop: 8,
  },
  performanceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  compactItem: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 4,
  },
  compactValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  compactSubtext: {
    fontSize: 10,
    fontWeight: "normal",
    color: "#999",
    marginTop: 2,
  },
  positive: {
    color: "#10b981",
  },
  negative: {
    color: "#ef4444",
  },
  aiSubtitle: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 12,
    marginTop: 4,
  },
  aiRecommendationCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#eee",
  },
  aiPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  aiRecItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  aiRecTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  aiRecMessage: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
    marginBottom: 6,
  },
  aiActionItems: {
    marginTop: 4,
  },
  aiActionItem: {
    fontSize: 11,
    fontWeight: "normal",
    color: "#555",
    marginTop: 2,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    backgroundColor: "#fff",
    overflow: "hidden",
    marginTop: 6,
  },
  picker: {
    backgroundColor: "#fff",
    color: "#333",
    fontWeight: "normal",
  },
  pickerItem: {
    backgroundColor: "#fff",
    color: "#333",
  },
  navBtnLive: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  navBtnTextLive: {
    color: "#fff",
  },
  // Season Filter Styles - Matching Home Dashboard
  filterCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
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
  xgCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sectionHeader: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e8eaed",
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 4,
  },
  xgSection: {
    marginBottom: 24,
    backgroundColor: "#fafbfc",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e8eaed",
  },
  xgSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  xgSectionBar: {
    width: 4,
    height: 20,
    backgroundColor: "#1e3a8a",
    borderRadius: 2,
  },
  xgSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1d29",
    letterSpacing: -0.2,
  },
  xgSectionContent: {
    gap: 16,
  },
  xgMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  xgMetricItem: {
    flex: 1,
  },
  xgMetricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xgMetricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1d29",
    letterSpacing: -0.5,
  },
  xgMetricDivider: {
    width: 1,
    height: 50,
    backgroundColor: "#e8eaed",
  },
  xgDifferenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e8eaed",
  },
  xgDifferenceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: -0.1,
  },
  xgDifferenceValue: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  xgPositive: {
    color: "#059669",
  },
  xgNegative: {
    color: "#dc2626",
  },
  xgPerformanceIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8eaed",
  },
  xgPerformanceText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  formationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  formationCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  formationName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  formationStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  formationStatItem: {
    alignItems: "center",
  },
  formationStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  formationStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  formationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  formationMatches: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7280",
  },
  formationWinRate: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
  },
  eventSelector: {
    marginBottom: 20,
  },
  eventPills: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  eventPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventPillActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  eventPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  eventPillTextActive: {
    color: "#ffffff",
  },
  zoneHeatmapsContainer: {
    gap: 20,
  },
  eventHeatmapCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
  },
  eventHeatmapTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  eventHeatmapSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 16,
  },
  zoneHeatmapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  zoneHeatmapCell: {
    width: "31%",
    minWidth: 100,
  },
  zoneHeatmapCellInner: {
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
  zoneHeatmapZoneLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  zoneHeatmapValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  zoneHeatmapBar: {
    width: "100%",
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  zoneHeatmapBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  zoneHeatmapPercentage: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  insightsContainer: {
    gap: 12,
  },
  insightCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  insightCardPositive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  insightCardWarning: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  insightCardInfo: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },
  insightCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  insightCategoryBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  insightCategoryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightIcon: {
    fontSize: 18,
    fontWeight: "700",
  },
  insightCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  insightCardMessage: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6b7280",
    lineHeight: 20,
  },
  noInsightsText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
    textAlign: "center",
    padding: 20,
  },
  // Formation Chart Styles
  // Premium Chart Styles
  premiumChartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  premiumChartHeader: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#e2e8f0",
  },
  premiumChartTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  premiumChartSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  premiumChartContainer: {
    position: "relative",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    paddingBottom: 40,
    paddingLeft: 50,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "visible",
    alignItems: "center",
  },
  chartWrapper: {
    width: "100%",
    alignItems: "center",
  },
  chartYAxisLabel: {
    position: "absolute",
    left: -8,
    top: 200,
    zIndex: 10,
  },
  chartXAxisLabel: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    marginLeft: -50,
    zIndex: 10,
  },
  chartAxisLabelText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  premiumChart: {
    marginVertical: 8,
    borderRadius: 12,
    marginLeft: -10,
    marginRight: -10,
  },
  premiumChartYAxis: {
    position: "absolute",
    left: 8,
    top: 20,
    bottom: 20,
    justifyContent: "center",
  },
  premiumChartYAxisLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    transform: [{ rotate: "-90deg" }],
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  // Pitch Visualization Styles
  pitchContainer: {
    marginBottom: 24,
  },
  zoneAnalysisPitchContainer: {
    marginBottom: 0,
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
  pitchEmptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pitchEmptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
  },
  pitchZoneBarFill: {
    height: "100%",
    backgroundColor: "#111827",
    borderRadius: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  // Top Performers Styles - Premium & Human
  topPerformersCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  topPerformersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 8,
  },
  topPerformerCategory: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 280 : "100%",
    backgroundColor: "#fafbfc",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e8eaed",
  },
  topPerformerCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e8eaed",
    gap: 12,
  },
  topPerformerCategoryBar: {
    width: 4,
    height: 20,
    backgroundColor: "#1e3a8a",
    borderRadius: 2,
  },
  topPerformerCategoryLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1d29",
    letterSpacing: -0.2,
  },
  topPerformerList: {
    gap: 10,
  },
  topPerformerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e8eaed",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  topPerformerRankContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topPerformerRank: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    width: 24,
    height: 24,
    textAlign: "center",
    lineHeight: 24,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  topPerformerInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topPerformerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1d29",
    letterSpacing: -0.1,
    flex: 1,
  },
  topPerformerValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  topPerformerValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e3a8a",
    letterSpacing: -0.3,
  },
  topPerformerUnit: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
