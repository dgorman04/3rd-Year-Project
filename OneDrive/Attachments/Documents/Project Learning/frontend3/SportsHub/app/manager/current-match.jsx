// app/manager/current-match.jsx - View current/live match stats
import React, { useEffect, useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import AppLayout from "../../components/AppLayout";
import PitchVisualization from "../../components/PitchVisualization";
import { API, WS_URL, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";
import { BarChart, LineChart } from "react-native-chart-kit";

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

const chartConfig = {
  backgroundColor: "#ffffff",
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#ffffff",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(74, 144, 226, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
  style: {
    borderRadius: 4,
  },
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: "#4a90e2",
  },
};

const EVENT_TYPES = [
  { id: "passes", label: "Passes", color: "#3b82f6" },
  { id: "shots", label: "Shots", color: "#ef4444" },
  { id: "tackles", label: "Tackles", color: "#f59e0b" },
  { id: "dribbles", label: "Dribbles", color: "#8b5cf6" },
  { id: "crosses", label: "Crosses", color: "#ec4899" },
];

export default function CurrentMatch() {
  const [token, setToken] = useState(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [liveMatch, setLiveMatch] = useState(null);
  const [liveMatchStats, setLiveMatchStats] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState("Offline");
  const [selectedEventFilter, setSelectedEventFilter] = useState("shots_on_target"); // Default to shots on target
  const [liveHeatmapFilter, setLiveHeatmapFilter] = useState("duels"); // "duels", "attacking", "defensive"
  const [liveSuggestions, setLiveSuggestions] = useState([]);
  const [teamName, setTeamName] = useState(null);
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);
  const wsRef = useRef(null);
  const liveMatchPollRef = useRef(null);
  const shouldPollRef = useRef(false);

  useEffect(() => {
(async () => {
      const t = await getToken();
      setTokenLoaded(true); // Mark that token check is complete
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      // Load team name
      await loadTeamName(t);
      // Load live match first, then connect WebSocket
      await loadLiveMatch(t);
      // Connect WebSocket after a short delay to ensure state is set
      setTimeout(() => {
        connectWebSocket(t);
      }, 500);
    })();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const loadTeamName = async (t) => {
    try {
      const res = await fetch(`${API}/stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.team && data.team.team_name) {
          setTeamName(data.team.team_name);
        }
      }
    } catch (e) {
      console.log("Error loading team name:", e);
    }
  };
  
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

    const pollLiveMatch = async () => {
      if (!shouldPollRef.current || !tokenLoaded || !token || token === null || token === "" || liveMatchPollRef.current === null) {
        return;
      }
      const t = token;
      await loadLiveMatch(t);
    };

    if (tokenLoaded && token && token !== null && token !== "") {
      pollLiveMatch();
      liveMatchPollRef.current = setInterval(pollLiveMatch, 2000);
    }

    return () => {
      shouldPollRef.current = false;
      if (liveMatchPollRef.current) {
        clearInterval(liveMatchPollRef.current);
        liveMatchPollRef.current = null;
      }
    };
  }, [token, tokenLoaded]);

  const isMatchRunning = liveMatch && (liveMatch.state === "first_half" || liveMatch.state === "second_half");
  const hasSeededRunningRef = useRef(false);

  // Only when paused/finished: show time from API. Never touch display while running.
  useEffect(() => {
    if (!liveMatch) return;
    if (liveMatch.state === "paused" || liveMatch.state === "finished") {
      const apiElapsed = liveMatch.elapsed_seconds != null ? Math.floor(Number(liveMatch.elapsed_seconds)) : 0;
      setDisplayElapsedSeconds(apiElapsed);
    }
  }, [liveMatch?.state, liveMatch?.elapsed_seconds]);

  // When running: seed once (by match id) then only the interval updates. No deps on elapsed_seconds so poll never resets us to 0.
  useEffect(() => {
    if (!isMatchRunning) {
      hasSeededRunningRef.current = false;
      return;
    }
    const matchId = liveMatch?.id;
    if (matchId != null && !hasSeededRunningRef.current) {
      hasSeededRunningRef.current = true;
      const seed = liveMatch.elapsed_seconds != null ? Math.floor(Number(liveMatch.elapsed_seconds)) : 0;
      setDisplayElapsedSeconds(seed);
    }
    const interval = setInterval(() => setDisplayElapsedSeconds((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [isMatchRunning, liveMatch?.id]);

  const loadLiveMatch = async (t) => {
    try {
      const res = await fetch(`${API}/matches/current-live/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          console.log("Token expired or invalid, stopping live match polling");
          shouldPollRef.current = false; // Stop all future polling immediately
          // Stop polling if it's still active
          if (liveMatchPollRef?.current) {
            clearInterval(liveMatchPollRef.current);
            liveMatchPollRef.current = null;
          }
          await clearToken();
          router.replace("/");
          return;
        }
        setLiveMatch(null);
        setLiveMatchStats([]);
        setLoading(false);
        return;
      }

      // Only set liveMatch if we actually have a match AND it's not null/undefined
      // Backend uses state in_progress | paused for "current live" (see /api/matches/current-live/)
      if (data.match && data.match !== null && data.match !== undefined && data.match !== "null") {
        const matchState = data.match.state || data.match.match_state;
        const isLiveState = matchState && ["in_progress", "paused", "first_half", "second_half", "half_time"].includes(matchState);
        
        if (data.match.id && isLiveState) {
          setLiveMatch(data.match);
          await loadMatchStats(t, data.match.id);
          await loadEventInstances(t, data.match.id);
          await loadLiveSuggestions(t, data.match.id);
          await loadMLRecommendations(t, data.match.id);
        } else {
          // Match exists but not in live state or missing id - treat as no match
          console.log("Match not in live state or missing id:", { id: data.match.id, state: matchState });
          setLiveMatch(null);
          setLiveMatchStats([]);
          setEventInstances([]);
          setLiveSuggestions([]);
          setMlPlayerRecommendations(null);
        }
      } else {
        // No match returned - clear everything
        console.log("No live match returned from API");
        setLiveMatch(null);
        setLiveMatchStats([]);
        setEventInstances([]);
        setLiveSuggestions([]);
        setMlPlayerRecommendations(null);
      }
    } catch (e) {
      console.log(e);
      setLiveMatch(null);
      setLiveMatchStats([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMatchStats = async (t, matchId) => {
    try {
      const res = await fetch(`${API}/matches/${matchId}/stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try {
        data = JSON.parse(raw);
      } catch {}

      if (res.ok && Array.isArray(data)) {
        setLiveMatchStats(data);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const loadEventInstances = async (t, matchId) => {
    try {
      const res = await fetch(`${API}/matches/${matchId}/events/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try {
        data = JSON.parse(raw);
      } catch {}

      if (res.ok && Array.isArray(data)) {
        console.log("Loaded eventInstances from API:", data.length, "events");
        // Log defensive events specifically
        const defensiveFromAPI = data.filter(e => 
          e.event === "tackles" || 
          e.event === "interceptions" || 
          e.event === "clearances" || 
          e.event === "blocks" || 
          e.event === "duels_won" || 
          e.event === "duels_lost" || 
          e.event === "fouls"
        );
        console.log("Defensive events in API response:", defensiveFromAPI.length);
        if (defensiveFromAPI.length > 0) {
          console.log("Defensive events details:", defensiveFromAPI.map(e => ({ 
            id: e.id, 
            event: e.event, 
            zone: e.zone 
          })));
        }
        setEventInstances(data);
      } else {
        console.log("Failed to load eventInstances - res.ok:", res.ok, "data type:", typeof data, "isArray:", Array.isArray(data));
      }
    } catch (e) {
      console.log(e);
    }
  };

  const loadLiveSuggestions = async (t, matchId) => {
    try {
      const res = await fetch(`${API}/matches/${matchId}/live-suggestions/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}

      if (res.ok && Array.isArray(data?.suggestions)) {
        setLiveSuggestions(data.suggestions);
      }
    } catch (e) {
      console.log("Error loading live suggestions:", e);
    }
  };

  const loadMLRecommendations = async (t, matchId) => {
    try {
      // Fetch all players' ML recommendations for this match
      const res = await fetch(`${API}/ml/performance-improvement/?match_id=${matchId}`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setMlPlayerRecommendations(data);
      }
    } catch (e) {
      console.log("Error loading ML recommendations:", e);
    }
  };

  const endLiveMatch = async () => {
    if (!liveMatch?.id || !token) return;
    const message = "End this match and remove it from Live? It will no longer appear as the current live match.";
    if (Platform.OS === "web") {
      if (!window.confirm(message)) return;
    } else {
      return new Promise((resolve) => {
        Alert.alert("End live match?", message, [
          { text: "Cancel", style: "cancel", onPress: () => resolve() },
          { text: "End match", onPress: () => { resolve(); doEndLiveMatch(); } },
        ]);
      });
    }
    doEndLiveMatch();
  };

  const doEndLiveMatch = async () => {
    try {
      const res = await fetch(`${API}/matches/${liveMatch.id}/timer/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({ action: "finish" }),
      });
      if (res.ok) {
        setLiveMatch(null);
        setLiveMatchStats([]);
        setEventInstances([]);
        setLiveSuggestions([]);
        setMlPlayerRecommendations(null);
      } else {
        const err = await res.json().catch(() => ({}));
        if (Platform.OS === "web") alert(err?.detail || "Could not end match.");
        else Alert.alert("Error", err?.detail || "Could not end match.");
      }
    } catch (e) {
      console.log(e);
      if (Platform.OS === "web") alert("Network error ending match.");
      else Alert.alert("Error", "Network error ending match.");
    }
  };

  const connectWebSocket = (t) => {
    try {
      const wsUrl = `${WS_URL}?token=${t}`;
      console.log("Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        setWsStatus("Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("WebSocket message received:", data);
          
          // Handle stat updates - refresh data regardless of liveMatch state
          if (data.kind === "stat" && data.match_id) {
            console.log("Processing stat update for match:", data.match_id);
            // Always refresh if we have a match_id, even if liveMatch isn't set yet
            // This ensures we get updates as soon as they arrive
            loadMatchStats(t, data.match_id);
            loadEventInstances(t, data.match_id);
            loadLiveSuggestions(t, data.match_id);
            loadMLRecommendations(t, data.match_id);
            
            // Also refresh live match data to ensure we have the latest match info
            // This will update liveMatch state if a match exists
            loadLiveMatch(t);
          } else {
            console.log("WebSocket message ignored - kind:", data.kind, "match_id:", data.match_id);
          }
        } catch (e) {
          console.log("WebSocket message parse error:", e, "Raw data:", event.data);
        }
      };

      ws.onerror = (error) => {
        console.log("WebSocket error:", error);
        setWsStatus("Error");
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed. Code:", event.code, "Reason:", event.reason);
        setWsStatus("Offline");
        // Reconnect after 3 seconds if we have a token
        setTimeout(() => {
          if (t) {
            console.log("Attempting WebSocket reconnect...");
            connectWebSocket(t);
          }
        }, 3000);
      };
    } catch (e) {
      console.log("WebSocket connection error:", e);
      setWsStatus("Offline");
    }
  };

  // Calculate action areas from events (using zone field from eventInstances)
  const actionAreas = useMemo(() => {
    const areas = {
      defensive: 0,
      middle: 0,
      final: 0,
    };
    
    eventInstances.forEach((event) => {
      const zone = event.zone || "";
      // Zones 4, 5, 6 are defensive (our goal), 1, 2, 3 are attacking (opponent goal)
      if (zone === "4" || zone === "5" || zone === "6") areas.defensive++;
      // Zones 4, 5, 6 are attacking zones (final third)
      else if (zone === "4" || zone === "5" || zone === "6") areas.final++;
      // Middle is calculated from zones 2, 3, 4, 5 (middle areas)
      if (zone === "2" || zone === "3" || zone === "4" || zone === "5") areas.middle++;
    });

    const total = eventInstances.length || 1;
    return {
      defensive: Math.round((areas.defensive / total) * 100),
      middle: Math.round((areas.middle / total) * 100),
      final: Math.round((areas.final / total) * 100),
    };
  }, [eventInstances]);

  // Calculate heat map data by zone (1-6) and map to pitch zones
  const heatMapData = useMemo(() => {
    if (!selectedEventFilter) return {};
    
    const data = {};
    const filtered = eventInstances.filter(e => e.event === selectedEventFilter);
    
    filtered.forEach((event) => {
      const zone = event.zone;
      if (!zone) return;
      
      // Map zones 1-6 to pitch visualization zones
      // Zone mapping matches analyst recording: 1=Defensive Left, 2=Defensive Center, 3=Defensive Right
      // 4=Attacking Left, 5=Attacking Center, 6=Attacking Right
      let pitchZone = "defensive_center";
      if (zone === "1") pitchZone = "defensive_left";
      else if (zone === "2") pitchZone = "defensive_center";
      else if (zone === "3") pitchZone = "defensive_right";
      else if (zone === "4") pitchZone = "attacking_left";
      else if (zone === "5") pitchZone = "attacking_center";
      else if (zone === "6") pitchZone = "attacking_right";
      
      data[pitchZone] = (data[pitchZone] || 0) + 1;
    });
    return data;
  }, [eventInstances, selectedEventFilter]);

  // Filter events for heat map visualization
  const filteredEvents = useMemo(() => {
    if (!selectedEventFilter) return [];
    
    const filtered = eventInstances.filter(e => e.event === selectedEventFilter);
    
    // Map to format expected by PitchVisualization
    return filtered.map((event) => {
      const zone = event.zone;
      let pitchZone = "defensive_center";
      if (zone === "1") pitchZone = "defensive_left";
      else if (zone === "2") pitchZone = "defensive_center";
      else if (zone === "3") pitchZone = "defensive_right";
      else if (zone === "4") pitchZone = "attacking_left";
      else if (zone === "5") pitchZone = "attacking_center";
      else if (zone === "6") pitchZone = "attacking_right";
      
      return {
        ...event,
        zone: pitchZone,
        type: event.event?.replace(/_/g, "") || "unknown",
      };
    });
  }, [eventInstances, selectedEventFilter]);

  // Calculate formation vs formation analysis (separate from attacking stats)
  const formationAnalysis = useMemo(() => {
    if (!liveMatch?.formation) return null;
    
    const ourFormation = liveMatch.formation;
    const opponentFormation = liveMatch.opponent_formation || "Not Set";
    
    const duelsWon = liveMatchStats
      .filter(s => s.event === "duels_won")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    const duelsLost = liveMatchStats
      .filter(s => s.event === "duels_lost")
      .reduce((sum, s) => sum + (s.count || 0), 0);
    
    return {
      ourFormation,
      opponentFormation,
      duelsWon,
      duelsLost,
      duelWinRate: duelsWon + duelsLost > 0 ? Math.round((duelsWon / (duelsWon + duelsLost)) * 100) : 0,
    };
  }, [liveMatch, liveMatchStats]);

  // Analyze poor defensive actions
  const defensiveAnalysis = useMemo(() => {
    if (!Array.isArray(eventInstances) || eventInstances.length === 0) {
      return {
        totalDefensiveEvents: 0,
        fouls: 0,
        duelsWon: 0,
        duelsLost: 0,
        duelWinPct: 0,
        clearances: 0,
        tackles: 0,
        interceptions: 0,
        blocks: 0,
        issues: [],
        tips: [],
      };
    }

    // Count ALL defensive events regardless of zone - defensive actions can happen anywhere on the pitch
    // Zone structure: 1&4=First third, 2&5=Middle third, 3&6=Final third
    // For defensive analysis, we want to count all defensive event types regardless of where they occur
    const defensiveEvents = eventInstances.filter(e => {
      const ev = e.event;
      const isDefensiveEvent =
        ev === "tackles" ||
        ev === "interceptions" ||
        ev === "clearances" ||
        ev === "blocks" ||
        ev === "duels_won" ||
        ev === "duels_lost" ||
        ev === "fouls";
      
      return isDefensiveEvent;
    });
    
    // Debug: log defensive events to see what we're getting
    if (eventInstances.length > 0) {
      console.log("=== DEFENSIVE ANALYSIS DEBUG ===");
      console.log("Total eventInstances:", eventInstances.length);
      
      // Show all event types
      const allEventTypes = {};
      eventInstances.forEach(e => {
        const eventType = e.event || "unknown";
        allEventTypes[eventType] = (allEventTypes[eventType] || 0) + 1;
      });
      console.log("All events by type:", allEventTypes);
      
      // Show defensive events
      const defensiveEventCounts = {};
      defensiveEvents.forEach(e => {
        const eventType = e.event;
        defensiveEventCounts[eventType] = (defensiveEventCounts[eventType] || 0) + 1;
      });
      console.log("Defensive events by type:", defensiveEventCounts);
      console.log("Total defensive events found:", defensiveEvents.length);
      
      // Show all defensive event instances
      console.log("All defensive event instances:", defensiveEvents.map(e => ({ 
        id: e.id, 
        event: e.event, 
        zone: e.zone, 
        player: e.player?.name || e.player_id 
      })));
      console.log("=== END DEFENSIVE DEBUG ===");
    }
    
    const fouls = defensiveEvents.filter(e => e.event === "fouls").length;
    const duelsLost = defensiveEvents.filter(e => e.event === "duels_lost").length;
    const duelsWon = defensiveEvents.filter(e => e.event === "duels_won").length;
    const clearances = defensiveEvents.filter(e => e.event === "clearances").length;
    const tackles = defensiveEvents.filter(e => e.event === "tackles").length;
    const interceptions = defensiveEvents.filter(e => e.event === "interceptions").length;
    const blocks = defensiveEvents.filter(e => e.event === "blocks").length;

    const totalDuels = duelsWon + duelsLost;
    const duelWinPct = totalDuels > 0 ? Math.round((duelsWon / totalDuels) * 100) : 0;

    const tips = [];
    const issues = [];
    
    // Foul analysis
    if (fouls > 5) {
      issues.push({ type: "High Fouls", count: fouls, message: "Too many fouls in defensive areas - risk of cards and set pieces" });
      tips.push({ priority: "high", tip: "Focus on positioning rather than last-ditch tackles. Maintain defensive shape to reduce need for fouls." });
    } else if (fouls > 0 && fouls <= 5) {
      tips.push({ priority: "medium", tip: "Foul count is manageable. Continue to stay disciplined and avoid unnecessary challenges." });
    }
    
    // Duel analysis
    if (duelsLost > clearances + tackles) {
      issues.push({ type: "Duel Losses", count: duelsLost, message: "Losing too many duels in defensive third - need better positioning" });
      tips.push({ priority: "high", tip: "Improve defensive positioning. Players should anticipate opponent movement and cut off passing lanes." });
    } else if (duelsLost > 0) {
      tips.push({ priority: "medium", tip: "Work on winning aerial duels and ground duels. Better body positioning will improve success rate." });
    }
    
    // Clearance analysis
    if (clearances < tackles && tackles > 0) {
      issues.push({ type: "Clearance Rate", count: clearances, message: "Not clearing the ball effectively - more clearances needed" });
      tips.push({ priority: "high", tip: "When under pressure, prioritize clearing the ball to safety. Don't try to play out from the back when pressed." });
    } else if (clearances > 0) {
      tips.push({ priority: "low", tip: "Good clearance rate. Continue to clear danger zones effectively." });
    }
    
    // Interception analysis
    if (interceptions < tackles && tackles > 3) {
      tips.push({ priority: "medium", tip: "Increase interceptions by reading the game better. Position players to cut off passing lanes before tackles are needed." });
    } else if (interceptions > tackles) {
      tips.push({ priority: "low", tip: "Excellent interception rate. Continue to anticipate opponent passes." });
    }
    
    // Block analysis - check if opponent is getting shots on target from defensive events
    const opponentShots = eventInstances.filter(e => 
      (e.event === "shots_on_target" || e.event === "shots_off_target") && 
      (e.zone === "4" || e.zone === "5" || e.zone === "6")
    ).length;
    if (blocks < 2 && opponentShots > 3) {
      tips.push({ priority: "medium", tip: "Increase blocking efforts. Players should be more proactive in blocking shots and crosses." });
    }
    
    // Overall defensive tips
    if (defensiveEvents.length > 20 && issues.length === 0) {
      tips.push({ priority: "low", tip: "Defensive performance is solid. Maintain current intensity and organization." });
    }
    
    return {
      totalDefensiveEvents: defensiveEvents.length,
      fouls,
      duelsWon,
      duelsLost,
      duelWinPct,
      clearances,
      tackles,
      interceptions,
      blocks,
      issues,
      tips,
    };
  }, [eventInstances]);

  // Analyze attacking actions (includes shots, passes, etc.)
  const attackingAnalysis = useMemo(() => {
    // Count ALL attacking events regardless of zone - attacking actions can happen anywhere on the pitch
    // Attacking events: shots, key passes (these are the main attacking metrics)
    const attackingEvents = eventInstances.filter(e => {
      const ev = e.event;
      const isAttackingEvent =
        ev === "shots_on_target" ||
        ev === "shots_off_target" ||
        ev === "key_passes";
      
      return isAttackingEvent;
    });
    
    // Debug: log attacking events to see what we're getting
    if (eventInstances.length > 0) {
      const attackingEventCounts = {};
      attackingEvents.forEach(e => {
        const eventType = e.event;
        attackingEventCounts[eventType] = (attackingEventCounts[eventType] || 0) + 1;
      });
      console.log("Attacking events by type:", attackingEventCounts);
      console.log("Total attacking events found:", attackingEvents.length);
    }
    
    const shotsOnTarget = attackingEvents.filter(e => e.event === "shots_on_target").length;
    const shotsOffTarget = attackingEvents.filter(e => e.event === "shots_off_target").length;
    const keyPasses = attackingEvents.filter(e => e.event === "key_passes").length;
    const duelsWon = attackingEvents.filter(e => e.event === "duels_won").length;
    const duelsLost = attackingEvents.filter(e => e.event === "duels_lost").length;
    
    const totalShots = shotsOnTarget + shotsOffTarget;
    const shotAccuracy = totalShots > 0 ? Math.round((shotsOnTarget / totalShots) * 100) : 0;
    
    const tips = [];
    const issues = [];
    
    // Shot accuracy analysis
    if (shotsOffTarget > shotsOnTarget * 1.5 && totalShots > 3) {
      issues.push({ type: "Shot Accuracy", value: shotAccuracy, message: "Low shot accuracy - need better finishing in final third" });
      tips.push({ priority: "high", tip: "Focus on shot selection. Take shots when in good positions rather than forcing attempts. Work on composure in front of goal." });
    } else if (shotAccuracy >= 50 && totalShots > 0) {
      tips.push({ priority: "low", tip: "Good shot accuracy. Continue to create quality chances and maintain composure." });
    } else if (totalShots < 3 && attackingEvents.length > 10) {
      tips.push({ priority: "medium", tip: "Create more shooting opportunities. Be more direct in the final third and take shots when space opens up." });
    }
    
    // Key passes analysis
    if (keyPasses < 3 && totalShots > 5) {
      issues.push({ type: "Key Passes", count: keyPasses, message: "Not creating enough key passes - need better build-up play" });
      tips.push({ priority: "high", tip: "Increase key passes by playing through balls and creating space. Look for players making runs behind the defense." });
    } else if (keyPasses >= 5) {
      tips.push({ priority: "low", tip: "Excellent key pass creation. Continue to unlock the defense with incisive passing." });
    } else if (keyPasses > 0) {
      tips.push({ priority: "medium", tip: "Good key pass rate. Look for opportunities to increase through balls and final third passes." });
    }
    
    // Duel analysis in attacking areas
    if (duelsLost > duelsWon && attackingEvents.length > 10) {
      issues.push({ type: "Attacking Duels", message: "Losing too many duels in attacking areas - need better ball retention" });
      tips.push({ priority: "high", tip: "Improve ball retention in attacking areas. Use quick passing combinations and support play to avoid losing possession." });
    } else if (duelsWon > duelsLost) {
      tips.push({ priority: "low", tip: "Strong duel performance in attacking areas. Continue to win battles and maintain possession." });
    }
    
    // Overall attacking tips
    if (attackingEvents.length > 15 && issues.length === 0) {
      tips.push({ priority: "low", tip: "Attacking performance is strong. Maintain pressure and continue creating chances." });
    }
    
    // Conversion rate tips
    if (totalShots > 5 && shotsOnTarget < totalShots * 0.3) {
      tips.push({ priority: "medium", tip: "Work on shot placement. Aim for corners and low shots to increase goal probability." });
    }
    
    return {
      totalAttackingEvents: attackingEvents.length,
      shotsOnTarget,
      shotsOffTarget,
      keyPasses,
      duelsWon,
      duelsLost,
      shotAccuracy,
      issues,
      tips,
    };
  }, [eventInstances]);

  // Team-level "ML-style" insights based on current attacking & defensive patterns + formation
  const teamMlInsights = useMemo(() => {
    const insights = [];

    // Work out whether attack or defence is the bigger problem right now
    const defensiveHasIssues = !!(defensiveAnalysis && defensiveAnalysis.issues && defensiveAnalysis.issues.length > 0);
    const attackingHasIssues = !!(attackingAnalysis && attackingAnalysis.issues && attackingAnalysis.issues.length > 0);

    let primaryFocus: "attacking" | "defensive" | "balanced" = "balanced";
    if (defensiveHasIssues && !attackingHasIssues) primaryFocus = "defensive";
    else if (attackingHasIssues && !defensiveHasIssues) primaryFocus = "attacking";
    else if (attackingHasIssues && defensiveHasIssues) {
      // If both have issues, pick the side with more issues as the primary
      primaryFocus =
        (attackingAnalysis?.issues?.length || 0) >= (defensiveAnalysis?.issues?.length || 0)
          ? "attacking"
          : "defensive";
    }

    // Formation comparison insight – what this matchup is telling you
    if (formationAnalysis) {
      const { ourFormation, opponentFormation, duelWinRate } = formationAnalysis;
      let message = `You are lining up ${ourFormation} against ${opponentFormation}. `;

      if (duelWinRate >= 55) {
        message +=
          "You are winning most duels, so the shape is holding up physically. You can afford to commit an extra player forward if you need a goal.";
      } else if (duelWinRate <= 45) {
        message +=
          "You are losing too many duels. Consider tightening the middle of the pitch or adding an extra screen in front of the back line.";
      } else {
        message +=
          "Duels are fairly even. Any tactical tweaks you make will likely decide who controls the game from here.";
      }

      insights.push({
        type: "formation",
        priority: "medium",
        title: "Formation Matchup",
        message,
      });
    }

    // Fallback: basic insight based on xG if no specific attacking/defensive breakdown yet
    if (!insights.length && liveMatch && liveMatch.xg !== undefined) {
      const xgFor = parseFloat(liveMatch.xg || 0);
      insights.push({
        type: "overall",
        priority: xgFor >= 1 ? "high" : "medium",
        title: "Chance Quality",
        message:
          xgFor >= 1
            ? `Current xG: ${xgFor.toFixed(2)}. You are creating good chances. Keep the intensity and avoid cheap turnovers.`
            : `Current xG: ${xgFor.toFixed(2)}. Focus on higher-quality chances and better shot selection.`,
      });
    }

    // High level "what needs changing most" call-out
    insights.unshift({
      type: "focus",
      priority: primaryFocus === "balanced" ? "medium" : "high",
      title: "Where to Focus First",
      message:
        primaryFocus === "attacking"
          ? "Most of the current issues are in attack. Prioritise improving chance creation and shot quality before changing your defensive structure."
          : primaryFocus === "defensive"
          ? "Most of the current issues are defensive. Stabilise the back line and protect central spaces before committing extra players forward."
          : "Attacking and defensive metrics are fairly balanced. Small tweaks in both areas (pressing triggers and final-third decision making) will give you the biggest gain.",
    });

    return insights;
  }, [defensiveAnalysis, attackingAnalysis, formationAnalysis, liveMatch]);

  // Attacking-specific ML insights for the Attacking Analysis section
  const attackingMlInsights = useMemo(() => {
    if (!attackingAnalysis || attackingAnalysis.totalAttackingEvents === 0) return [];
    
    const insights = [];
    const hasIssues = attackingAnalysis.issues && attackingAnalysis.issues.length > 0;
    
    if (hasIssues) {
      insights.push({
        type: "attacking",
        priority: "high",
        title: "Attacking Performance",
        message:
          "Attacking data suggests you're not turning final‑third actions into enough high‑quality shots. Improve shot selection and support around the ball.",
      });
    } else {
      insights.push({
        type: "attacking",
        priority: "low",
        title: "Attacking Performance",
        message:
          "Attacking momentum is strong. Keep creating overloads wide and sustaining pressure in the final third.",
      });
    }
    
    return insights;
  }, [attackingAnalysis]);

  // Defensive-specific ML insights for the Defensive Analysis section
  const defensiveMlInsights = useMemo(() => {
    if (!defensiveAnalysis) return [];

    const insights = [];
    const hasIssues = defensiveAnalysis.issues && defensiveAnalysis.issues.length > 0;
    
    if (hasIssues) {
      insights.push({
        type: "defensive",
        priority: "high",
        title: "Defensive Performance",
        message:
          "Current defensive actions indicate pressure in your own third. Focus on organization, reducing fouls and clearing danger earlier.",
      });
    } else {
      insights.push({
        type: "defensive",
        priority: "low",
        title: "Defensive Performance",
        message:
          "Defensive structure is holding up well so far. Maintain compact distances between units and keep forcing low‑quality chances.",
      });
    }
    
    return insights;
  }, [defensiveAnalysis]);

  // Live heatmap data based on selected filter (duels, attacking events, defensive events)
  const liveHeatmapData = useMemo(() => {
    if (!Array.isArray(eventInstances) || eventInstances.length === 0) return {};

    const data = {};
    
    if (liveHeatmapFilter === "duels") {
      // Combine duels_won and duels_lost
      const duelEvents = eventInstances.filter(e => e.event === "duels_won" || e.event === "duels_lost");
      duelEvents.forEach((event) => {
        const zone = event.zone;
        if (!zone) return;
        let pitchZone = "defensive_center";
        if (zone === "1" || zone === 1) pitchZone = "defensive_left";
        else if (zone === "2" || zone === 2) pitchZone = "defensive_center";
        else if (zone === "3" || zone === 3) pitchZone = "defensive_right";
        else if (zone === "4" || zone === 4) pitchZone = "attacking_left";
        else if (zone === "5" || zone === 5) pitchZone = "attacking_center";
        else if (zone === "6" || zone === 6) pitchZone = "attacking_right";
        data[pitchZone] = (data[pitchZone] || 0) + 1;
      });
    } else if (liveHeatmapFilter === "attacking") {
      // High attacking events: shots_on_target, shots_off_target, key_passes
      const attackingEvents = eventInstances.filter(e => 
        e.event === "shots_on_target" || 
        e.event === "shots_off_target" || 
        e.event === "key_passes"
      );
      attackingEvents.forEach((event) => {
        const zone = event.zone;
        if (!zone) return;
        let pitchZone = "defensive_center";
        if (zone === "1" || zone === 1) pitchZone = "defensive_left";
        else if (zone === "2" || zone === 2) pitchZone = "defensive_center";
        else if (zone === "3" || zone === 3) pitchZone = "defensive_right";
        else if (zone === "4" || zone === 4) pitchZone = "attacking_left";
        else if (zone === "5" || zone === 5) pitchZone = "attacking_center";
        else if (zone === "6" || zone === 6) pitchZone = "attacking_right";
        data[pitchZone] = (data[pitchZone] || 0) + 1;
      });
    } else if (liveHeatmapFilter === "defensive") {
      // High defensive events: tackles, interceptions, clearances, blocks, fouls
      const defensiveEvents = eventInstances.filter(e => 
        e.event === "tackles" || 
        e.event === "interceptions" || 
        e.event === "clearances" || 
        e.event === "blocks" || 
        e.event === "fouls"
      );
      defensiveEvents.forEach((event) => {
        const zone = event.zone;
        if (!zone) return;
        let pitchZone = "defensive_center";
        if (zone === "1" || zone === 1) pitchZone = "defensive_left";
        else if (zone === "2" || zone === 2) pitchZone = "defensive_center";
        else if (zone === "3" || zone === 3) pitchZone = "defensive_right";
        else if (zone === "4" || zone === 4) pitchZone = "attacking_left";
        else if (zone === "5" || zone === 5) pitchZone = "attacking_center";
        else if (zone === "6" || zone === 6) pitchZone = "attacking_right";
        data[pitchZone] = (data[pitchZone] || 0) + 1;
      });
    }

    return data;
  }, [eventInstances, liveHeatmapFilter]);

  // Zone analysis and ML-style insights for heatmap
  const heatmapZoneInsights = useMemo(() => {
    if (!liveHeatmapData || Object.keys(liveHeatmapData).length === 0) return [];

    const insights = [];
    const totalEvents = Object.values(liveHeatmapData).reduce((sum, count) => sum + count, 0);
    if (totalEvents === 0) return [];

    // Calculate percentages for each zone
    const zonePercentages = {
      attacking_center: ((liveHeatmapData.attacking_center || 0) / totalEvents) * 100,
      attacking_left: ((liveHeatmapData.attacking_left || 0) / totalEvents) * 100,
      attacking_right: ((liveHeatmapData.attacking_right || 0) / totalEvents) * 100,
      defensive_center: ((liveHeatmapData.defensive_center || 0) / totalEvents) * 100,
      defensive_left: ((liveHeatmapData.defensive_left || 0) / totalEvents) * 100,
      defensive_right: ((liveHeatmapData.defensive_right || 0) / totalEvents) * 100,
    };

    if (liveHeatmapFilter === "attacking") {
      // Zone structure: 1&4=First third, 2&5=Middle third, 3&6=Final third
      // For attacking events, we want them in the final third (Zones 3 and 6) - closer to opponent's goal
      const finalThirdEvents = zonePercentages.defensive_right + zonePercentages.attacking_right; // Zones 3 and 6
      const middleThirdEvents = zonePercentages.defensive_center + zonePercentages.attacking_center; // Zones 2 and 5
      const firstThirdEvents = zonePercentages.defensive_left + zonePercentages.attacking_left; // Zones 1 and 4

      if (finalThirdEvents < 40 && (middleThirdEvents > 30 || firstThirdEvents > 20)) {
        insights.push({
          type: "attacking",
          title: "Final Third Penetration Needed",
          message: `Only ${finalThirdEvents.toFixed(0)}% of attacking events are in the final third (Zones 3 & 6). ${middleThirdEvents.toFixed(0)}% are in the middle third and ${firstThirdEvents.toFixed(0)}% in the first third. Increase penetration by:`,
          suggestions: [
            "Play more direct passes into the final third zones (Zone 3 - Defensive Right, Zone 6 - Attacking Right)",
            "Use quick combinations to break through midfield lines and reach the final third",
            "Position forwards higher to receive passes in dangerous areas near the opponent's goal",
            "Create overloads in wide areas then cut inside to final third zones",
            "Increase tempo in transition to catch opponents before they organize defensively",
          ],
        });
      } else if (finalThirdEvents >= 40) {
        insights.push({
          type: "attacking",
          title: "Strong Final Third Presence",
          message: `${finalThirdEvents.toFixed(0)}% of attacking events are in the final third (Zones 3 & 6). This shows good penetration into dangerous areas.`,
          suggestions: [
            "Continue creating chances in final third zones (Zones 3 & 6)",
            "Focus on shot selection and finishing quality in these high-value areas",
            "Maintain width to stretch the defense before cutting into final third",
            "Look for quick combinations between Zones 2/5 (middle) and Zones 3/6 (final third)",
          ],
        });
      }
    } else if (liveHeatmapFilter === "defensive") {
      // Zone structure: 1&4=First third, 2&5=Middle third, 3&6=Final third
      // For defensive events, we want them in final or middle third (away from our goal)
      // Final third = Zones 3 and 6, Middle third = Zones 2 and 5
      // First third (our goal) = Zones 1 and 4 - we want to avoid too many defensive actions here
      const finalThirdEvents = zonePercentages.defensive_right + zonePercentages.attacking_right; // Zones 3 and 6
      const middleThirdEvents = zonePercentages.defensive_center + zonePercentages.attacking_center; // Zones 2 and 5
      const firstThirdEvents = zonePercentages.defensive_left + zonePercentages.attacking_left; // Zones 1 and 4 (our goal)

      if (firstThirdEvents > 50 && (finalThirdEvents + middleThirdEvents) < 40) {
        insights.push({
          type: "defensive",
          title: "Defensive Actions Too Deep",
          message: `${firstThirdEvents.toFixed(0)}% of defensive events are in the first third (Zones 1 & 4 - near our goal). Only ${(finalThirdEvents + middleThirdEvents).toFixed(0)}% are in middle/final thirds. Move defensive actions higher up the pitch:`,
          suggestions: [
            "Press higher up the pitch to win the ball in middle third (Zones 2 & 5) or final third (Zones 3 & 6)",
            "Push defensive line forward to compress space and prevent opponents reaching your first third",
            "Intercept passes earlier in middle third (Zones 2 & 5) before they reach your defensive third",
            "Use midfielders to press and win duels in Zones 2, 3, 5, 6 to relieve pressure on your goal",
            "Win the ball back in opponent's half (final third - Zones 3 & 6) to launch quick counter-attacks",
          ],
        });
      } else if ((finalThirdEvents + middleThirdEvents) >= 50) {
        insights.push({
          type: "defensive",
          title: "Good Defensive Pressure Higher Up",
          message: `${(finalThirdEvents + middleThirdEvents).toFixed(0)}% of defensive events are occurring in middle/final thirds (Zones 2, 3, 5, 6). This relieves pressure on your goal.`,
          suggestions: [
            "Maintain this high pressing intensity in middle and final thirds",
            "Continue winning the ball in Zones 2, 3, 5, 6 to prevent opponents reaching your first third",
            "Stay compact when pressing to prevent gaps between defensive units",
            "Use turnovers in final third (Zones 3 & 6) to launch quick attacking transitions",
          ],
        });
      }
    } else if (liveHeatmapFilter === "duels") {
      // Zone structure: 1&4=First third, 2&5=Middle third, 3&6=Final third
      // For duels, we want them won in middle/final thirds to prevent opponents reaching our first third
      const firstThirdDuels = zonePercentages.defensive_left + zonePercentages.attacking_left; // Zones 1 and 4 (our goal)
      const middleThirdDuels = zonePercentages.defensive_center + zonePercentages.attacking_center; // Zones 2 and 5
      const finalThirdDuels = zonePercentages.defensive_right + zonePercentages.attacking_right; // Zones 3 and 6

      if (firstThirdDuels > 50) {
        insights.push({
          type: "duels",
          title: "Duels Concentrated in First Third",
          message: `${firstThirdDuels.toFixed(0)}% of duels are happening in the first third (Zones 1 & 4 - near our goal). Only ${(middleThirdDuels + finalThirdDuels).toFixed(0)}% in middle/final thirds.`,
          suggestions: [
            "Win more duels in middle third (Zones 2 & 5) to prevent opponents reaching your first third",
            "Use physical presence higher up the pitch in Zones 2, 3, 5, 6",
            "Break up play earlier in middle/final thirds before it reaches your penalty area",
            "Press aggressively in Zones 3 & 6 (final third) to win the ball back in dangerous areas",
          ],
        });
      } else if ((middleThirdDuels + finalThirdDuels) >= 50) {
        insights.push({
          type: "duels",
          title: "Strong Duel Presence in Middle/Final Thirds",
          message: `${(middleThirdDuels + finalThirdDuels).toFixed(0)}% of duels are in middle/final thirds (Zones 2, 3, 5, 6). This shows good physical presence away from your goal.`,
          suggestions: [
            "Maintain this physical presence in middle and final thirds",
            "Use duels won in final third (Zones 3 & 6) to create quick attacking opportunities",
            "Support players in duels with nearby teammates to increase win rate",
            "Continue winning the ball in Zones 2, 3, 5, 6 to prevent pressure on your goal",
          ],
        });
      }
    }

    return insights;
  }, [liveHeatmapData, liveHeatmapFilter]);

  // Build an "attacking vs defensive events over time" series for a trend chart
  const attackingDefensiveTrend = useMemo(() => {
    if (!Array.isArray(eventInstances) || eventInstances.length === 0) return null;

    const points = [];

    eventInstances.forEach((e, idx) => {
      const rawMinute =
        typeof e.minute === "number"
          ? e.minute
          : typeof e.minute === "string" && !isNaN(parseInt(e.minute, 10))
          ? parseInt(e.minute, 10)
          : null;

      // If we don't have a usable minute, just fall back to event index as an ordering bucket
      const bucket = rawMinute != null ? rawMinute : idx + 1;

      const ev = e.event;
      const isAttacking =
        ev === "shots_on_target" ||
        ev === "shots_off_target" ||
        ev === "key_passes" ||
        ev === "dribbles" ||
        ev === "crosses" ||
        ev === "passes";
      const isDefensive =
        ev === "tackles" ||
        ev === "interceptions" ||
        ev === "clearances" ||
        ev === "blocks" ||
        ev === "duels_won" ||
        ev === "duels_lost" ||
        ev === "fouls";

      if (!isAttacking && !isDefensive) return;

      points.push({ bucket, isAttacking, isDefensive });
    });

    if (!points.length) return null;

    // Sort by bucket (minute or pseudo‑time)
    points.sort((a, b) => a.bucket - b.bucket);

    const buckets = [];
    const series = [];
    let attTotal = 0;
    let defTotal = 0;

    points.forEach((p) => {
      if (p.isAttacking) attTotal += 1;
      if (p.isDefensive) defTotal += 1;

      const last = buckets[buckets.length - 1];
      if (last === p.bucket) {
        // Update last bucket
        series[series.length - 1] = {
          attacking: attTotal,
          defensive: defTotal,
        };
      } else {
        buckets.push(p.bucket);
        series.push({ attacking: attTotal, defensive: defTotal });
      }
    });

    const labels = buckets.map((b) => `Min ${b}`);
    const attackingValues = series.map((s) => s.attacking);
    const defensiveValues = series.map((s) => s.defensive);

    return { labels, attackingValues, defensiveValues };
  }, [eventInstances]);

  // Count events by type from actual data
  const eventCounts = useMemo(() => {
    const counts = {};
    ALL_EVENTS.forEach((eventType) => {
      counts[eventType] = eventInstances.filter(e => e.event === eventType).length;
    });
    return counts;
  }, [eventInstances]);

  // Don't render until token is loaded AND valid - this prevents ALL useEffects from running
  if (!tokenLoaded) return null;
  if (!token || token === null || token === "") {
    // Clear any polling that might have started
    if (liveMatchPollRef.current) {
      clearInterval(liveMatchPollRef.current);
      liveMatchPollRef.current = null;
    }
    shouldPollRef.current = false;
    return null;
  }

  if (loading) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4a90e2" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      </AppLayout>
    );
  }

  // If there is no live match, just show the prompt.
  // As long as the backend says a match is live (via /matches/current-live/),
  // we will show the dashboard even if WebSockets are offline.
  if (!liveMatch) {
    return (
      <AppLayout>
        <View style={styles.container}>
          {Platform.OS === "web" && (
            <View style={styles.webHeader}>
              <View>
                <Text style={styles.webTitle}>Live Match Analysis</Text>
                <Text style={styles.webSubtitle}>Real-time action areas and heat map visualization</Text>
              </View>
            </View>
          )}
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Start Analyzing a Match to View Live Statistics</Text>
              <Text style={styles.emptyText}>
                No match is currently being analyzed. Once an analyst starts recording a match, live statistics and analysis will appear here in real-time.
              </Text>
              <Text style={styles.emptySubtext}>
                WebSocket Status: {wsStatus}
              </Text>
            </View>
          </ScrollView>
        </View>
      </AppLayout>
    );
  }

  // When a live match exists, show full live analysis
  return (
    <AppLayout>
      <View style={styles.container}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View>
              <Text style={styles.webTitle}>Live Match Analysis</Text>
              <Text style={styles.webSubtitle}>Real-time action areas and heat map visualization</Text>
            </View>
            <View style={styles.statusContainer}>
              <View style={[styles.statusBadge, wsStatus === "Connected" && styles.statusBadgeConnected]}>
                <View style={[styles.statusDot, wsStatus === "Connected" && styles.statusDotConnected]} />
                <Text style={styles.statusText}>{wsStatus}</Text>
              </View>
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* Match Overview */}
          <View style={styles.matchCard}>
            <View style={styles.scoreboard}>
              <View style={styles.teamSection}>
                <Text style={styles.teamName}>{liveMatch.opponent || "Opponent"}</Text>
                <Text style={styles.score}>{liveMatch.goals_scored || 0}</Text>
              </View>
              <Text style={styles.vs}>-</Text>
              <View style={styles.teamSection}>
                <Text style={styles.teamName}>{teamName || "Your Team"}</Text>
                <Text style={styles.score}>{liveMatch.goals_conceded || 0}</Text>
              </View>
            </View>
            {/* Live match timer (read-only – analyst controls it) */}
            <View style={styles.timerDisplay}>
              <Text style={styles.timerTime}>
                {String(Math.floor(displayElapsedSeconds / 60)).padStart(2, "0")}:{String(displayElapsedSeconds % 60).padStart(2, "0")}
              </Text>
              <Text style={styles.timerState}>
                {(liveMatch.state === "paused" || liveMatch.match_state === "paused") ? "Paused" : (liveMatch.state === "first_half" || liveMatch.match_state === "first_half") ? "1st Half" : (liveMatch.state === "second_half" || liveMatch.match_state === "second_half") ? "2nd Half" : (liveMatch.state === "in_progress" || liveMatch.match_state === "in_progress") ? "Live" : (liveMatch.state === "finished" || liveMatch.match_state === "finished") ? "Finished" : "Live"}
              </Text>
            </View>
            {liveMatch.formation && (
              <View style={styles.matchDetails}>
                <Text style={styles.detailText}>Formation: {liveMatch.formation}</Text>
                {liveMatch.season && <Text style={styles.detailText}>Season: {liveMatch.season}</Text>}
              </View>
            )}
            <TouchableOpacity style={styles.endMatchButton} onPress={endLiveMatch}>
              <Text style={styles.endMatchButtonText}>Match not running? End it and clear from Live</Text>
            </TouchableOpacity>
          </View>

          {/* Live xG */}
          {liveMatch?.xg !== undefined && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Live Expected Goals (xG)</Text>
                <Text style={styles.cardSubtitle}>Real-time chance quality analysis</Text>
              </View>
              <View style={styles.xgRow}>
                <View style={styles.xgItem}>
                  <Text style={styles.xgLabel}>xG For</Text>
                  <Text style={styles.xgValue}>{parseFloat(liveMatch.xg || 0).toFixed(2)}</Text>
                  <Text style={styles.xgSubtext}>{liveMatch.goals_scored || 0} goals scored</Text>
                </View>
              </View>
            </View>
          )}

          {/* Team ML Insights (no individual players) */}
          {teamMlInsights.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Team Performance Insights</Text>
                <Text style={styles.cardSubtitle}>High-level match intelligence for your team</Text>
              </View>
              <View style={styles.mlAdviceList}>
                {teamMlInsights.map((insight, idx) => (
                  <View key={idx} style={styles.mlAdviceItem}>
                    <View style={styles.mlAdviceHeader}>
                      <Text style={styles.mlAdviceTitle}>{insight.title}</Text>
                    </View>
                    <Text style={styles.mlAdviceMessage}>{insight.message}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Attacking vs Defensive momentum over time */}
          {attackingDefensiveTrend && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Momentum Over Time</Text>
                <Text style={styles.cardSubtitle}>
                  Cumulative attacking vs defensive actions as the game progresses
                </Text>
              </View>
              <LineChart
                data={{
                  labels: attackingDefensiveTrend.labels,
                  datasets: [
                    {
                      data: attackingDefensiveTrend.attackingValues,
                      color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, // blue
                      strokeWidth: 2,
                    },
                    {
                      data: attackingDefensiveTrend.defensiveValues,
                      color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, // green
                      strokeWidth: 2,
                    },
                  ],
                  legend: ["Attacking Events", "Defensive Events"],
                }}
                width={Math.min(screenW - 48, 820)}
                height={300}
                chartConfig={{
                  backgroundColor: "#ffffff",
                  backgroundGradientFrom: "#ffffff",
                  backgroundGradientTo: "#ffffff",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                  propsForDots: {
                    r: "3",
                    strokeWidth: "2",
                    stroke: "#ffffff",
                  },
                  propsForBackgroundLines: {
                    stroke: "#e5e7eb",
                    strokeWidth: 1,
                  },
                }}
                bezier
                style={styles.premiumChart}
              />
            </View>
          )}

          {/* Live Event Heatmap */}
          {eventInstances && eventInstances.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Live Event Heatmap</Text>
                <Text style={styles.cardSubtitle}>Real-time event distribution across the pitch</Text>
              </View>
              
              {/* Filter Buttons */}
              <View style={styles.heatmapFilters}>
                <TouchableOpacity
                  style={[
                    styles.heatmapFilterButton,
                    liveHeatmapFilter === "duels" && styles.heatmapFilterButtonActive,
                  ]}
                  onPress={() => setLiveHeatmapFilter("duels")}
                >
                  <Text
                    style={[
                      styles.heatmapFilterText,
                      liveHeatmapFilter === "duels" && styles.heatmapFilterTextActive,
                    ]}
                  >
                    Duels Won & Lost
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.heatmapFilterButton,
                    liveHeatmapFilter === "attacking" && styles.heatmapFilterButtonActive,
                  ]}
                  onPress={() => setLiveHeatmapFilter("attacking")}
                >
                  <Text
                    style={[
                      styles.heatmapFilterText,
                      liveHeatmapFilter === "attacking" && styles.heatmapFilterTextActive,
                    ]}
                  >
                    High Attacking Events
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.heatmapFilterButton,
                    liveHeatmapFilter === "defensive" && styles.heatmapFilterButtonActive,
                  ]}
                  onPress={() => setLiveHeatmapFilter("defensive")}
                >
                  <Text
                    style={[
                      styles.heatmapFilterText,
                      liveHeatmapFilter === "defensive" && styles.heatmapFilterTextActive,
                    ]}
                  >
                    High Defensive Events
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Heatmap Visualization */}
              {Object.keys(liveHeatmapData).length > 0 && (
                <View style={styles.heatmapContainer}>
                  <PitchVisualization
                    width={Platform.OS === "web" ? Math.min(screenW - 100, 600) : screenW - 60}
                    height={Platform.OS === "web" ? 400 : 300}
                    heatMapData={liveHeatmapData}
                    events={[]}
                  />
                </View>
              )}

              {/* Zone Analysis & Insights */}
              {heatmapZoneInsights.length > 0 && (
                <View style={styles.heatmapInsightsContainer}>
                  <Text style={styles.heatmapInsightsTitle}>Zone Analysis & Improvement Suggestions</Text>
                  {heatmapZoneInsights.map((insight, idx) => (
                    <View key={idx} style={styles.heatmapInsightItem}>
                      <View style={styles.heatmapInsightHeader}>
                        <Text style={styles.heatmapInsightTitle}>{insight.title}</Text>
                      </View>
                      <Text style={styles.heatmapInsightMessage}>{insight.message}</Text>
                      {insight.suggestions && insight.suggestions.length > 0 && (
                        <View style={styles.heatmapSuggestionsList}>
                          {insight.suggestions.map((suggestion, sIdx) => (
                            <View key={sIdx} style={styles.heatmapSuggestionItem}>
                              <Text style={styles.heatmapSuggestionBullet}>•</Text>
                              <Text style={styles.heatmapSuggestionText}>{suggestion}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Defensive Analysis – detailed defensive improvement section */}
          {defensiveAnalysis && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Defensive Analysis</Text>
                <Text style={styles.cardSubtitle}>Defensive third performance</Text>
              </View>
              <Text style={styles.analysisSummary}>
                Fouls: {defensiveAnalysis.fouls} • Tackles: {defensiveAnalysis.tackles} • Clearances:{" "}
                {defensiveAnalysis.clearances} • Interceptions: {defensiveAnalysis.interceptions}
              </Text>
              <View style={styles.analysisGrid}>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Fouls</Text>
                  <Text
                    style={[
                      styles.analysisValue,
                      defensiveAnalysis.fouls > 5 && styles.analysisValueWarning,
                    ]}
                  >
                    {defensiveAnalysis.fouls}
                  </Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Clearances</Text>
                  <Text style={styles.analysisValue}>{defensiveAnalysis.clearances}</Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Tackles</Text>
                  <Text style={styles.analysisValue}>{defensiveAnalysis.tackles}</Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Interceptions</Text>
                  <Text style={styles.analysisValue}>{defensiveAnalysis.interceptions}</Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Duels Won %</Text>
                  <Text style={styles.analysisValue}>
                    {defensiveAnalysis.duelWinPct}
                    {defensiveAnalysis.duelWinPct !== 0 && "%"}
                  </Text>
                </View>
              </View>
              {/* Defensive ML Insights */}
              {defensiveMlInsights.length > 0 && (
                <View style={styles.mlInsightsContainer}>
                  <Text style={styles.mlInsightsTitle}>Defensive Performance Insights</Text>
                  {defensiveMlInsights.map((insight, idx) => (
                    <View key={idx} style={styles.mlAdviceItem}>
                      <View style={styles.mlAdviceHeader}>
                        <Text style={styles.mlAdviceTitle}>{insight.title}</Text>
                      </View>
                      <Text style={styles.mlAdviceMessage}>{insight.message}</Text>
                    </View>
                  ))}
                </View>
              )}
              {defensiveAnalysis.tips && defensiveAnalysis.tips.length > 0 && (
                <View style={styles.tipsContainer}>
                  <Text style={styles.tipsTitle}>Live Improvement Tips</Text>
                  {defensiveAnalysis.tips.map((tip, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.tipItem,
                        tip.priority === "high" && styles.tipItemHigh,
                        tip.priority === "medium" && styles.tipItemMedium,
                      ]}
                    >
                      <View style={styles.tipHeader} />
                      <Text style={styles.tipText}>{tip.tip}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Attacking Analysis – detailed attacking improvement section */}
          {attackingAnalysis && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Attacking Analysis</Text>
                <Text style={styles.cardSubtitle}>Final third performance - Shots & Passes</Text>
              </View>
              <Text style={styles.analysisSummary}>
                Shots on target: {attackingAnalysis.shotsOnTarget} /{" "}
                {attackingAnalysis.shotsOnTarget + attackingAnalysis.shotsOffTarget} (
                {attackingAnalysis.shotAccuracy}% accuracy) • Key passes: {attackingAnalysis.keyPasses}
              </Text>
              <View style={styles.analysisGrid}>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Shots on Target</Text>
                  <Text style={styles.analysisValue}>{attackingAnalysis.shotsOnTarget}</Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Shots Off Target</Text>
                  <Text
                    style={[
                      styles.analysisValue,
                      attackingAnalysis.shotsOffTarget >
                        attackingAnalysis.shotsOnTarget * 1.5 && styles.analysisValueWarning,
                    ]}
                  >
                    {attackingAnalysis.shotsOffTarget}
                  </Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Shot Accuracy</Text>
                  <Text style={styles.analysisValue}>{attackingAnalysis.shotAccuracy}%</Text>
                </View>
                <View style={styles.analysisItem}>
                  <Text style={styles.analysisLabel}>Key Passes</Text>
                  <Text style={styles.analysisValue}>{attackingAnalysis.keyPasses}</Text>
                </View>
              </View>

              {/* Attacking ML Insights */}
              {attackingMlInsights.length > 0 && (
                <View style={styles.mlInsightsContainer}>
                  <Text style={styles.mlInsightsTitle}>Attacking Performance Insights</Text>
                  {attackingMlInsights.map((insight, idx) => (
                    <View key={idx} style={styles.mlAdviceItem}>
                      <View style={styles.mlAdviceHeader}>
                        <Text style={styles.mlAdviceTitle}>{insight.title}</Text>
                      </View>
                      <Text style={styles.mlAdviceMessage}>{insight.message}</Text>
                    </View>
                  ))}
                </View>
              )}

              {attackingAnalysis.tips && attackingAnalysis.tips.length > 0 && (
                <View style={styles.tipsContainer}>
                  <Text style={styles.tipsTitle}>Live Improvement Tips</Text>
                  {attackingAnalysis.tips.map((tip, idx) => (
                    <View key={idx} style={styles.tipItem}>
                      <Text style={styles.tipText}>{tip.tip}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
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
    marginBottom: 8,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  liveText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statusBadgeConnected: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9ca3af",
  },
  statusDotConnected: {
    backgroundColor: "#22c55e",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  matchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  scoreboard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 16,
  },
  teamSection: {
    alignItems: "center",
    gap: 8,
  },
  teamLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e5e7eb",
  },
  teamName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  score: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111827",
  },
  vs: {
    fontSize: 24,
    fontWeight: "600",
    color: "#9ca3af",
  },
  matchDetails: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  detailText: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
  },
  timerDisplay: {
    alignItems: "center",
    marginVertical: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  timerTime: {
    fontSize: 28,
    fontWeight: "600",
    color: "#111827",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  timerState: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 4,
  },
  endMatchButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  endMatchButtonText: {
    fontSize: 14,
    color: "#b91c1c",
    fontWeight: "500",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
  },
  filterIcon: {
    fontSize: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  filterLabelActive: {
    color: "#3b82f6",
    fontWeight: "600",
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
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "normal",
  },
  content: {
    padding: 12,
    gap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  analyticsItem: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  analyticsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  suggestionsList: {
    gap: 12,
    marginTop: 8,
  },
  suggestionItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  suggestionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  suggestionCategory: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#f3f4f6",
  },
  priorityHigh: {
    backgroundColor: "#fee2e2",
  },
  priorityMedium: {
    backgroundColor: "#fef3c7",
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7280",
  },
  priorityTextHigh: {
    color: "#dc2626",
  },
  priorityTextMedium: {
    color: "#d97706",
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  suggestionMessage: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6b7280",
    lineHeight: 18,
  },
  eventFilterContainer: {
    marginBottom: 16,
  },
  eventFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  eventFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventFilterChipActive: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  eventFilterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  eventFilterTextActive: {
    color: "#ffffff",
  },
  eventCountBox: {
    minWidth: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  eventCountBoxActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  eventCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e3a8a",
  },
  eventCountTextActive: {
    color: "#1e3a8a",
  },
  formationComparison: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginBottom: 20,
    paddingVertical: 16,
  },
  formationItem: {
    alignItems: "center",
    flex: 1,
  },
  formationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  formationValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  formationVs: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9ca3af",
  },
  formationMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  formationMetricItem: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  formationMetricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  formationMetricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  formationValueUnknown: {
    color: "#9ca3af",
    fontSize: 24,
  },
  formationNote: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
    marginTop: 4,
    fontStyle: "italic",
  },
  mlAdviceList: {
    gap: 16,
    marginTop: 8,
  },
  mlAdviceItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mlAdviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  mlAdviceTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  mlAdviceTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  mlAdviceTypeDefensive: {
    backgroundColor: "#fee2e2",
  },
  mlAdviceTypeAttacking: {
    backgroundColor: "#dbeafe",
  },
  mlAdviceTypeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mlAdviceMessage: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 18,
  },
  mlAdvicePlayers: {
    gap: 10,
  },
  mlAdvicePlayerItem: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mlAdvicePlayerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  mlAdviceStrengths: {
    gap: 4,
  },
  mlAdviceStrengthText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 16,
  },
  analysisGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  analysisSummary: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4b5563",
    marginBottom: 10,
  },
  analysisItem: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  analysisLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analysisValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  analysisValueWarning: {
    color: "#dc2626",
  },
  issuesContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  issuesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  issueItem: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  issueType: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
    marginBottom: 4,
  },
  issueMessage: {
    fontSize: 12,
    fontWeight: "400",
    color: "#991b1b",
    lineHeight: 16,
  },
  premiumChart: {
    marginVertical: 8,
    borderRadius: 12,
  },
  xgRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  xgItem: {
    flex: 1,
    alignItems: "center",
  },
  xgLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xgValue: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  xgSubtext: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
  },
  xgDivider: {
    width: 1,
    height: 60,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 20,
  },
  xgDifference: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "center",
  },
  xgDifferenceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xgDifferenceValue: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  xgPositive: {
    color: "#059669",
  },
  xgNegative: {
    color: "#dc2626",
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchInfo: {
    flex: 1,
  },
  matchState: {
    fontSize: 14,
    color: "#666",
    fontWeight: "normal",
    marginBottom: 4,
  },
  matchScore: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
  },
  formation: {
    fontSize: 12,
    color: "#666",
    fontWeight: "normal",
  },
  chart: {
    marginVertical: 8,
    borderRadius: 4,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 24,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "normal",
    textAlign: "center",
    lineHeight: 20,
  },
  emptySubtext: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 12,
  },
  viewButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "normal",
  },
  mlInsightsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  mlInsightsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  tipsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  tipItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tipItemHigh: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  tipItemMedium: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  tipHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: 8,
  },
  tipPriorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#f3f4f6",
  },
  tipPriorityBadgeHigh: {
    backgroundColor: "#fee2e2",
  },
  tipPriorityBadgeMedium: {
    backgroundColor: "#fef3c7",
  },
  tipPriorityText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tipPriorityTextHigh: {
    color: "#dc2626",
  },
  tipPriorityTextMedium: {
    color: "#d97706",
  },
  tipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 18,
  },
  heatmapFilters: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  heatmapFilterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  heatmapFilterButtonActive: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  heatmapFilterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  heatmapFilterTextActive: {
    color: "#ffffff",
  },
  heatmapContainer: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heatmapInsightsContainer: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  heatmapInsightsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  heatmapInsightItem: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#1e3a8a",
  },
  heatmapInsightHeader: {
    marginBottom: 8,
  },
  heatmapInsightTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  heatmapInsightMessage: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 20,
    marginBottom: 12,
  },
  heatmapSuggestionsList: {
    marginTop: 8,
  },
  heatmapSuggestionItem: {
    flexDirection: "row",
    marginBottom: 8,
    paddingLeft: 4,
  },
  heatmapSuggestionBullet: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a8a",
    marginRight: 8,
    width: 16,
  },
  heatmapSuggestionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#4b5563",
    lineHeight: 18,
  },
});
