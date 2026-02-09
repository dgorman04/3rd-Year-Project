// app/analyst/match-review/[id].jsx – same as manager match detail for analyst review
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform, ActivityIndicator } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, router } from "expo-router";

import { API, ngrokHeaders, normalizeRecordingUrl } from "../../../lib/config";
import { getToken, clearToken } from "../../../lib/auth";
import VideoPlayer from "../../../components/VideoPlayer";
import AppHeader from "../../../components/AppHeader";
import AppLayout from "../../../components/AppLayout";
import PitchVisualization from "../../../components/PitchVisualization";
import * as DocumentPicker from "expo-document-picker";

const screenW = Dimensions.get("window").width;

// Calculate team performance rating
function calculateTeamRating(stats) {
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
  if (totalDuels > 0) {
    rating += (duelWinRate - 0.5) * 0.5;
  }
  rating -= Math.min(fouls * 0.1, 1.0);
  return Math.max(0, Math.min(10, rating));
}

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

const DUELS_CHART_HEIGHT = 220;
const DUELS_BAR_COLORS = { won: "#1e3a8a", lost: "#93c5fd" };

function DuelsByThirdChart({ duelsByThird, screenW }) {
  const thirds = [
    { key: "first", label: "First Third", won: duelsByThird.first.won, lost: duelsByThird.first.lost },
    { key: "middle", label: "Middle Third", won: duelsByThird.middle.won, lost: duelsByThird.middle.lost },
    { key: "final", label: "Final Third", won: duelsByThird.final.won, lost: duelsByThird.final.lost },
  ];
  const maxVal = Math.max(
    1,
    ...thirds.flatMap((t) => [t.won, t.lost])
  );
  const chartWidth = Platform.OS === "web" ? Math.min(480, screenW - 80) : screenW - 80;
  const barAreaHeight = DUELS_CHART_HEIGHT - 32;
  // Unique integer labels: 1, 2, ... maxVal (each once; no 0 on axis to avoid zero below x-axis).
  const yAxisLabels = (() => {
    if (maxVal <= 0) return [];
    if (maxVal <= 8) {
      const arr = [];
      for (let n = maxVal; n >= 1; n--) arr.push(n);
      return arr;
    }
    const step = Math.max(1, Math.ceil(maxVal / 5));
    const arr = [];
    for (let n = maxVal; n >= 1; n -= step) arr.push(n);
    if (arr[arr.length - 1] !== 1) arr.push(1);
    return arr;
  })();

  return (
    <View style={styles.duelsChartWrapper}>
      <View style={[styles.duelsChartInner, { width: chartWidth }]}>
        {/* Y-axis label */}
        <View style={styles.duelsYAxisWrap}>
          <Text style={styles.duelsYAxisTitle}>Amount</Text>
          <View style={[styles.duelsYAxisLabels, { minHeight: DUELS_CHART_HEIGHT }]}>
            {yAxisLabels.map((n, i) => (
              <Text key={i} style={styles.duelsYAxisLabel}>{n}</Text>
            ))}
          </View>
        </View>
        {/* Chart area with grid and bars */}
        <View style={[styles.duelsChartArea, { height: DUELS_CHART_HEIGHT }]}>
          {/* Horizontal grid lines */}
          {yAxisLabels.slice(0, -1).map((_, i) => (
            <View
              key={i}
              style={[
                styles.duelsGridLine,
                {
                  top: `${(i / (yAxisLabels.length - 1)) * 100}%`,
                },
              ]}
            />
          ))}
          {/* Bars per third */}
          <View style={[styles.duelsBarsRow, { height: barAreaHeight }]}>
            {thirds.map((third) => {
              const wonHeight = maxVal > 0 ? (third.won / maxVal) * barAreaHeight : 0;
              const lostHeight = maxVal > 0 ? (third.lost / maxVal) * barAreaHeight : 0;
              return (
                <View key={third.key} style={styles.duelsThirdGroup}>
                  <View style={styles.duelsBarsPair}>
                    <View style={styles.duelsBarCell}>
                      {third.won > 0 && (
                        <Text style={styles.duelsBarValueOnBar}>{third.won}</Text>
                      )}
                      <View
                        style={[
                          styles.duelsVerticalBar,
                          {
                            height: third.won > 0 ? Math.max(wonHeight, 4) : 0,
                            backgroundColor: DUELS_BAR_COLORS.won,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.duelsBarCell}>
                      {third.lost > 0 && (
                        <Text style={styles.duelsBarValueOnBar}>{third.lost}</Text>
                      )}
                      <View
                        style={[
                          styles.duelsVerticalBar,
                          {
                            height: third.lost > 0 ? Math.max(lostHeight, 4) : 0,
                            backgroundColor: DUELS_BAR_COLORS.lost,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.duelsThirdLabel} numberOfLines={2}>{third.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AnalystMatchReview() {
  const { id } = useLocalSearchParams();
  const matchId = String(id || "");

  const [token, setToken] = useState(null);
  const [match, setMatch] = useState(null);
  const [stats, setStats] = useState([]);
  const [eventInstances, setEventInstances] = useState([]);
  const [oppositionStats, setOppositionStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const videoPlayerRef = useRef(null);
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState(null);
  const [timelinePlayerFilter, setTimelinePlayerFilter] = useState(null);
  const [timelineEventTypeFilter, setTimelineEventTypeFilter] = useState(null);
  const [matchPerformanceSuggestions, setMatchPerformanceSuggestions] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [heatmapFilter, setHeatmapFilter] = useState("attacking"); // "attacking" | "defensive"

  const load = async (t) => {
    try {
      setLoading(true);

      // 1) match header
      const mRes = await fetch(`${API}/matches/${matchId}/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const mRaw = await mRes.text();
      let mJson = {};
      try { mJson = JSON.parse(mRaw); } catch {}

      if (!mRes.ok) {
        if (mRes.status === 401) {
          console.log("Authentication failed - redirecting to login");
          await clearToken();
          router.replace("/");
          return;
        }
        console.log("Match load error:", mRes.status, mJson);
        alert(mJson?.detail || `Could not load match (${mRes.status}).`);
        return;
      }
      
      console.log("Match loaded:", mJson.id, "Has recording:", mJson.has_recording, "Recording URL:", mJson.recording_url);
      setMatch(mJson);

      // 2) match stats
      const sRes = await fetch(`${API}/matches/${matchId}/stats/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      const sRaw = await sRes.text();
      let sJson = [];
      try { sJson = JSON.parse(sRaw); } catch {}

      if (!sRes.ok) {
        alert(sJson?.detail || "Could not load match stats.");
        return;
      }

      setStats(Array.isArray(sJson) ? sJson : []);

      // 3) Event instances with timestamps
      const eRes = await fetch(`${API}/matches/${matchId}/events/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      if (eRes.ok) {
        const eJson = await eRes.json().catch(() => []);
        setEventInstances(Array.isArray(eJson) ? eJson : []);
      }

      // 4) Opposition stats
      const oRes = await fetch(`${API}/matches/${matchId}/opposition/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      if (oRes.ok) {
        const oJson = await oRes.json().catch(() => []);
        setOppositionStats(Array.isArray(oJson) ? oJson : []);
      }

      // 5) Match Performance Suggestions
      try {
        const perfRes = await fetch(`${API}/matches/${matchId}/performance-suggestions/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        if (perfRes.ok) {
          const perfData = await perfRes.json().catch(() => ({}));
          setMatchPerformanceSuggestions(perfData);
        }
      } catch (e) {
        console.log("Error loading match performance suggestions:", e);
      }

    } catch (e) {
      console.log(e);
      alert("Network error loading match.");
    } finally {
      setLoading(false);
    }
  };
  
  const uploadVideo = async () => {
    try {
      setUploadingVideo(true);
      
      // Pick video file
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "web" ? ["video/*"] : ["video/mp4", "video/quicktime", "video/x-msvideo"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      
      if (result.canceled) {
        setUploadingVideo(false);
        return;
      }
      
      const file = result.assets?.[0];
      if (!file) {
        alert("No file selected.");
        setUploadingVideo(false);
        return;
      }
      
      // Create FormData
      const formData = new FormData();
      
      // For web, we need to convert the file
      if (Platform.OS === "web") {
        // Fetch the file as blob
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append("file", blob, file.name || "video.mp4");
      } else {
        // For native, use the file URI directly with proper format
        formData.append("file", {
          uri: file.uri,
          type: file.mimeType || "video/mp4",
          name: file.name || "video.mp4",
        });
      }
      
      // Upload to backend
      const headers = {
        Authorization: `Bearer ${token}`,
        ...ngrokHeaders(),
      };
      
      // Don't set Content-Type for FormData - let the browser/native set it with boundary
      const uploadRes = await fetch(`${API}/matches/${matchId}/video/`, {
        method: "POST",
        headers: headers,
        body: formData,
      });
      
      const uploadData = await uploadRes.json().catch(() => ({}));
      
      if (!uploadRes.ok) {
        console.log("Video upload failed:", uploadRes.status, uploadData);
        alert(uploadData?.detail || `Failed to upload video (${uploadRes.status}).`);
        setUploadingVideo(false);
        return;
      }
      
      console.log("Video upload response:", uploadData);
      
      // Reload match data to get updated recording URL
      await load(token);
      
      // Check if video was successfully uploaded
      if (uploadData.recording_url || uploadData.video_url) {
        const recordingUrl = uploadData.recording_url || uploadData.video_url;
        setMatch(prev => ({
          ...prev,
          has_recording: true,
          recording_url: recordingUrl,
        }));
        alert("Video uploaded successfully!");
      } else {
        // If no URL in response, check the reloaded match data
        alert("Video upload completed. Refreshing match data...");
      }
    } catch (e) {
      console.log("Video upload error:", e);
      alert(`Failed to upload video: ${e?.message || e}`);
    } finally {
      setUploadingVideo(false);
    }
  };

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      if (!t) {
        router.replace("/");
        return;
      }
      await load(t);
    })();
  }, []);

  const totalsByPlayer = useMemo(() => {
    const map = {};
    for (const row of stats) {
      const name = row.player || "Unknown";
      map[name] = (map[name] || 0) + Number(row.count || 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const totalsByEvent = useMemo(() => {
    const map = {};
    for (const row of stats) {
      const e = row.event || "unknown";
      map[e] = (map[e] || 0) + Number(row.count || 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  // Filtered stats by player
  const filteredStats = useMemo(() => {
    if (!selectedPlayerFilter) return stats;
    return stats.filter((s) => s.player === selectedPlayerFilter);
  }, [stats, selectedPlayerFilter]);

  // Event breakdown for selected player or all players
  const eventBreakdown = useMemo(() => {
    const breakdown = {};
    ALL_EVENTS.forEach((e) => breakdown[e] = 0);
    
    filteredStats.forEach((row) => {
      const e = row.event;
      if (breakdown[e] !== undefined) {
        breakdown[e] = (breakdown[e] || 0) + Number(row.count || 0);
      }
    });
    
    return breakdown;
  }, [filteredStats]);

  // Zone analysis for this match
  const zoneAnalysis = useMemo(() => {
    const zones = {};
    eventInstances.forEach((e) => {
      if (e.zone) {
        if (!zones[e.zone]) zones[e.zone] = { total: 0, events: {} };
        zones[e.zone].total += 1;
        zones[e.zone].events[e.event] = (zones[e.zone].events[e.event] || 0) + 1;
      }
    });
    return zones;
  }, [eventInstances]);

  // Calculate team KPIs
  const teamKPIs = useMemo(() => {
    const goals = totalsByEvent.find(([e]) => e === "shots_on_target")?.[1] || 0;
    const keyPasses = totalsByEvent.find(([e]) => e === "key_passes")?.[1] || 0;
    const duelsWon = totalsByEvent.find(([e]) => e === "duels_won")?.[1] || 0;
    const tackles = totalsByEvent.find(([e]) => e === "tackles")?.[1] || 0;
    const interceptions = totalsByEvent.find(([e]) => e === "interceptions")?.[1] || 0;
    const shotsOnTarget = totalsByEvent.find(([e]) => e === "shots_on_target")?.[1] || 0;
    const shotsOffTarget = totalsByEvent.find(([e]) => e === "shots_off_target")?.[1] || 0;
    const totalShots = shotsOnTarget + shotsOffTarget;
    const shotAccuracy = totalShots > 0 ? (shotsOnTarget / totalShots * 100) : 0;
    const duelsLost = totalsByEvent.find(([e]) => e === "duels_lost")?.[1] || 0;
    const totalDuels = duelsWon + duelsLost;
    const duelWinRate = totalDuels > 0 ? (duelsWon / totalDuels * 100) : 0;
    
    // Calculate xG from event instances
    let xg = 0;
    eventInstances.forEach(e => {
      if (e.event === "shots_on_target") {
        if (["4", "5", "6"].includes(e.zone)) xg += 0.3;
        else if (["1", "2", "3"].includes(e.zone)) xg += 0.1;
        else xg += 0.2;
      } else if (e.event === "shots_off_target") {
        xg += 0.05;
      }
    });
    
    // Calculate team rating
    const allStats = {};
    totalsByEvent.forEach(([event, count]) => {
      allStats[event] = count;
    });
    const rating = calculateTeamRating(allStats);
    
    return {
      goals,
      xg: xg.toFixed(2),
      keyPasses,
      duelsWon,
      tackles,
      interceptions,
      shotAccuracy: shotAccuracy.toFixed(1),
      duelWinRate: duelWinRate.toFixed(1),
      rating: rating.toFixed(1),
    };
  }, [totalsByEvent, eventInstances]);
  
  // Zone heatmap data
  const heatmapData = useMemo(() => {
    const zoneMap = {
      "1": "defensive_left",
      "2": "defensive_center",
      "3": "defensive_right",
      "4": "attacking_left",
      "5": "attacking_center",
      "6": "attacking_right",
    };
    
    const heatmap = {};
    eventInstances.forEach(e => {
      if (e.zone) {
        const zoneId = zoneMap[e.zone];
        if (zoneId) {
          heatmap[zoneId] = (heatmap[zoneId] || 0) + 1;
        }
      }
    });
    
    return heatmap;
  }, [eventInstances]);
  
  // Calculate xG progression throughout the match
  const xgProgression = useMemo(() => {
    // Sort events by time
    const sortedEvents = eventInstances
      .filter(e => e.second !== null && e.second !== undefined)
      .sort((a, b) => (a.second || 0) - (b.second || 0));
    
    // If no events, return empty array
    if (sortedEvents.length === 0) {
      return [];
    }
    
    let xgFor = 0;
    const progression = [];
    
    // Calculate xG for each event
    sortedEvents.forEach(event => {
      if (event.event === "shots_on_target") {
        // Our shots on target
        if (["4", "5", "6"].includes(event.zone)) {
          xgFor += 0.3; // Attacking zones
        } else if (["1", "2", "3"].includes(event.zone)) {
          xgFor += 0.1; // Defensive zones
        } else {
          xgFor += 0.2; // Default
        }
      } else if (event.event === "shots_off_target") {
        // Our shots off target
        xgFor += 0.05;
      }
      
      progression.push({
        time: event.second || 0,
        xgFor: xgFor,
      });
    });
    
    // Add data points at regular intervals for smoother graph
    const intervalData = [];
    
    // If no progression data, return empty array
    if (progression.length === 0) {
      return intervalData;
    }
    
    const maxTime = progression[progression.length - 1].time;
    const intervals = Math.min(20, Math.floor(maxTime / 60)); // Every minute or max 20 points
    
    for (let i = 0; i <= intervals; i++) {
      const time = (maxTime / intervals) * i;
      const closest = progression.reduce((prev, curr) => 
        Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev,
        progression[0]
      );
      
      if (closest) {
        intervalData.push({
          time: Math.floor(time / 60), // Convert to minutes
          xgFor: closest.xgFor,
        });
      }
    }
    
    return intervalData;
  }, [eventInstances, match]);
  
  // Prepare chart data for xG progression (xG For only)
  const xgChartData = useMemo(() => {
    if (xgProgression.length === 0) return null;
    
    const labels = xgProgression.map(p => `${p.time}'`);
    const xgForData = xgProgression.map(p => parseFloat(p.xgFor.toFixed(2)));
    
    return {
      labels: labels,
      datasets: [
        {
          data: xgForData,
          color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
          strokeWidth: 3,
        },
      ],
    };
  }, [xgProgression]);
  
  // Team vs Opposition comparison chart data
  const comparisonChartData = useMemo(() => {
    const events = ["shots_on_target", "key_passes", "duels_won", "tackles", "interceptions"];
    const ourData = events.map(e => totalsByEvent.find(([evt]) => evt === e)?.[1] || 0);
    const oppData = events.map(e => {
      const oppStat = oppositionStats.find(s => s.event === e);
      return oppStat?.count || 0;
    });
    
    return {
      labels: events.map(e => e.replace("_", "\n")),
      datasets: [
        {
          data: ourData,
          color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: oppData,
          color: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [totalsByEvent, oppositionStats]);
  
  // Zone distribution chart data
  const zoneChartData = useMemo(() => {
    const zoneLabels = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5", "Zone 6"];
    const zoneData = [1, 2, 3, 4, 5, 6].map(z => zoneAnalysis[z]?.total || 0);
    
    return {
      labels: zoneLabels,
      datasets: [{
        data: zoneData,
        color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
        strokeWidth: 2,
      }],
    };
  }, [zoneAnalysis]);
  
  // Player performance breakdown
  const playerPerformance = useMemo(() => {
    const players = {};
    totalsByPlayer.forEach(([name]) => {
      const playerStats = stats.filter(s => s.player === name);
      const playerEvents = {};
      playerStats.forEach(s => {
        playerEvents[s.event] = (playerEvents[s.event] || 0) + (Number(s.count) || 0);
      });
      players[name] = {
        totalEvents: playerStats.reduce((sum, s) => sum + (Number(s.count) || 0), 0),
        goals: playerEvents.shots_on_target || 0,
        keyPasses: playerEvents.key_passes || 0,
        duelsWon: playerEvents.duels_won || 0,
        tackles: playerEvents.tackles || 0,
        interceptions: playerEvents.interceptions || 0,
        rating: calculateTeamRating(playerEvents),
      };
    });
    return Object.entries(players)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.rating - a.rating);
  }, [totalsByPlayer, stats]);
  
  // Match insights/analysis
  const matchInsights = useMemo(() => {
    const insights = [];
    const shotsOnTarget = totalsByEvent.find(([e]) => e === "shots_on_target")?.[1] || 0;
    const shotsOffTarget = totalsByEvent.find(([e]) => e === "shots_off_target")?.[1] || 0;
    const totalShots = shotsOnTarget + shotsOffTarget;
    const shotAccuracy = totalShots > 0 ? (shotsOnTarget / totalShots * 100).toFixed(1) : 0;
    
    const duelsWon = totalsByEvent.find(([e]) => e === "duels_won")?.[1] || 0;
    const duelsLost = totalsByEvent.find(([e]) => e === "duels_lost")?.[1] || 0;
    const totalDuels = duelsWon + duelsLost;
    const duelWinRate = totalDuels > 0 ? (duelsWon / totalDuels * 100).toFixed(1) : 0;

    if (totalShots > 0) {
      insights.push({
        title: "Shot Accuracy",
        value: `${shotAccuracy}%`,
        description: `${shotsOnTarget} on target out of ${totalShots} total shots`,
      });
    }

    if (totalDuels > 0) {
      insights.push({
        title: "Duel Win Rate",
        value: `${duelWinRate}%`,
        description: `${duelsWon} won out of ${totalDuels} duels`,
      });
    }

    const keyPasses = totalsByEvent.find(([e]) => e === "key_passes")?.[1] || 0;
    if (keyPasses > 0) {
      insights.push({
        title: "Key Passes",
        value: `${keyPasses}`,
        description: `Total key passes in this match`,
      });
    }

    return insights;
  }, [totalsByEvent]);

  // Duels by third: first (zones 1,3), middle (zones 2,5), final (zones 4,6) – non-overlapping
  const duelsByThird = useMemo(() => {
    const firstZones = ["1", "3"];
    const middleZones = ["2", "5"];
    const finalZones = ["4", "6"];
    const toThird = (zone) => {
      const z = String(zone);
      if (firstZones.includes(z)) return "first";
      if (middleZones.includes(z)) return "middle";
      if (finalZones.includes(z)) return "final";
      return null;
    };
    const counts = { first: { won: 0, lost: 0 }, middle: { won: 0, lost: 0 }, final: { won: 0, lost: 0 } };
    eventInstances.forEach((e) => {
      if (e.event !== "duels_won" && e.event !== "duels_lost") return;
      const third = toThird(e.zone);
      if (!third) return;
      if (e.event === "duels_won") counts[third].won += 1;
      else counts[third].lost += 1;
    });
    return counts;
  }, [eventInstances]);

  // Heatmap by filter (attacking / defensive only)
  const liveHeatmapData = useMemo(() => {
    if (!Array.isArray(eventInstances) || eventInstances.length === 0) return {};
    const data = {};
    const zoneToPitch = (zone) => {
      if (zone === "1" || zone === 1) return "defensive_left";
      if (zone === "2" || zone === 2) return "defensive_center";
      if (zone === "3" || zone === 3) return "defensive_right";
      if (zone === "4" || zone === 4) return "attacking_left";
      if (zone === "5" || zone === 5) return "attacking_center";
      if (zone === "6" || zone === 6) return "attacking_right";
      return "defensive_center";
    };
    if (heatmapFilter === "attacking") {
      eventInstances.filter(e => e.event === "shots_on_target" || e.event === "shots_off_target" || e.event === "key_passes").forEach((event) => {
        if (event.zone) {
          const p = zoneToPitch(event.zone);
          data[p] = (data[p] || 0) + 1;
        }
      });
    } else if (heatmapFilter === "defensive") {
      eventInstances.filter(e => e.event === "tackles" || e.event === "interceptions" || e.event === "clearances" || e.event === "blocks" || e.event === "fouls").forEach((event) => {
        if (event.zone) {
          const p = zoneToPitch(event.zone);
          data[p] = (data[p] || 0) + 1;
        }
      });
    }
    return data;
  }, [eventInstances, heatmapFilter]);

  const heatmapZoneInsights = useMemo(() => {
    if (!liveHeatmapData || Object.keys(liveHeatmapData).length === 0) return [];
    const totalEvents = Object.values(liveHeatmapData).reduce((sum, count) => sum + count, 0);
    if (totalEvents === 0) return [];
    const zonePercentages = {
      attacking_center: ((liveHeatmapData.attacking_center || 0) / totalEvents) * 100,
      attacking_left: ((liveHeatmapData.attacking_left || 0) / totalEvents) * 100,
      attacking_right: ((liveHeatmapData.attacking_right || 0) / totalEvents) * 100,
      defensive_center: ((liveHeatmapData.defensive_center || 0) / totalEvents) * 100,
      defensive_left: ((liveHeatmapData.defensive_left || 0) / totalEvents) * 100,
      defensive_right: ((liveHeatmapData.defensive_right || 0) / totalEvents) * 100,
    };
    const insights = [];
    if (heatmapFilter === "attacking") {
      const finalThird = zonePercentages.defensive_right + zonePercentages.attacking_right;
      if (finalThird < 40) {
        insights.push({ title: "Final Third Penetration Needed", message: `Only ${finalThird.toFixed(0)}% of attacking events are in the final third.`, suggestions: ["Play more direct passes into the final third.", "Create overloads wide and cut inside."] });
      } else {
        insights.push({ title: "Strong Final Third Presence", message: `${finalThird.toFixed(0)}% of attacking events are in the final third.`, suggestions: [] });
      }
    } else if (heatmapFilter === "defensive") {
      const firstThird = zonePercentages.defensive_left + zonePercentages.attacking_left;
      if (firstThird > 50) {
        insights.push({ title: "Defensive Actions Too Deep", message: `${firstThird.toFixed(0)}% of defensive events are near our goal.`, suggestions: ["Press higher.", "Win the ball in middle/final thirds."] });
      } else {
        insights.push({ title: "Good Defensive Pressure Higher Up", message: "Defensive events are spread higher up the pitch.", suggestions: [] });
      }
    }
    return insights;
  }, [liveHeatmapData, heatmapFilter]);

  const timelinePlayers = useMemo(() => {
    const names = [...new Set(eventInstances.map((e) => e.player).filter(Boolean))];
    return names.sort((a, b) => String(a).localeCompare(String(b)));
  }, [eventInstances]);
  const timelineEventTypes = useMemo(() => {
    const types = [...new Set(eventInstances.map((e) => e.event).filter(Boolean))];
    return types.sort((a, b) => String(a).localeCompare(String(b)));
  }, [eventInstances]);
  const filteredEventInstances = useMemo(() => {
    return eventInstances
      .filter((e) => e.second !== null && e.second !== undefined)
      .filter((e) => !timelinePlayerFilter || e.player === timelinePlayerFilter)
      .filter((e) => !timelineEventTypeFilter || e.event === timelineEventTypeFilter)
      .sort((a, b) => (a.second || 0) - (b.second || 0));
  }, [eventInstances, timelinePlayerFilter, timelineEventTypeFilter]);

  if (!token) return null;

  if (loading) {
    return (
      <AppLayout>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading match analysis...</Text>
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ScrollView contentContainerStyle={styles.content}>
        {match && (
          <>
            {/* Match Header */}
            <View style={styles.matchHeaderCard}>
              <View style={styles.matchHeaderContent}>
                <View style={styles.matchHeaderMain}>
                  <Text style={styles.matchOpponent}>vs {match.opponent}</Text>
                  <View style={styles.matchScore}>
                    <Text style={styles.scoreValue}>{match.goals_scored || 0}</Text>
                    <Text style={styles.scoreSeparator}>—</Text>
                    <Text style={styles.scoreValue}>{match.goals_conceded || 0}</Text>
                  </View>
                </View>
                <View style={styles.matchMeta}>
                  <Text style={styles.metaItem}>{formatKickoff(match.kickoff_at)}</Text>
                  <Text style={styles.metaItem}>{match.is_home ? "Home" : "Away"}</Text>
                  {match.season && <Text style={styles.metaItem}>Season: {match.season}</Text>}
                </View>
                {match.formation && (
                  <View style={styles.formationRow}>
                    <Text style={styles.formationLabel}>Formation: {match.formation}</Text>
                    {match.opponent_formation && (
                      <Text style={styles.formationLabel}>Opponent: {match.opponent_formation}</Text>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Performance KPIs */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Match Performance</Text>
                <Text style={styles.cardSubtitle}>Key performance indicators</Text>
              </View>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.rating}</Text>
                  <Text style={styles.kpiLabel}>Team Rating</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.goals}</Text>
                  <Text style={styles.kpiLabel}>Goals</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.xg}</Text>
                  <Text style={styles.kpiLabel}>xG</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.keyPasses}</Text>
                  <Text style={styles.kpiLabel}>Key Passes</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.duelsWon}</Text>
                  <Text style={styles.kpiLabel}>Duels Won</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.tackles}</Text>
                  <Text style={styles.kpiLabel}>Tackles</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.shotAccuracy}%</Text>
                  <Text style={styles.kpiLabel}>Shot Accuracy</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{teamKPIs.duelWinRate}%</Text>
                  <Text style={styles.kpiLabel}>Duel Win Rate</Text>
                </View>
              </View>
            </View>

            {/* xG Difference (like live match) */}
            {(match?.xg !== undefined || teamKPIs.xg) && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.cardTitle}>Expected Goals (xG)</Text>
                  <Text style={styles.cardSubtitle}>Chance quality analysis</Text>
                </View>
                <View style={styles.xgRow}>
                  <View style={styles.xgItem}>
                    <Text style={styles.xgLabel}>xG For</Text>
                    <Text style={styles.xgValue}>
                      {match?.xg != null ? parseFloat(match.xg).toFixed(2) : teamKPIs.xg}
                    </Text>
                    <Text style={styles.xgSubtext}>{match?.goals_scored ?? 0} goals scored</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Event Heatmap (attacking / defensive hot zones, like live match) */}
            {eventInstances.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.cardTitle}>Event Heatmap</Text>
                  <Text style={styles.cardSubtitle}>Event distribution across the pitch</Text>
                </View>
                <View style={styles.heatmapFilters}>
                  <TouchableOpacity
                    style={[styles.heatmapFilterButton, heatmapFilter === "attacking" && styles.heatmapFilterButtonActive]}
                    onPress={() => setHeatmapFilter("attacking")}
                  >
                    <Text style={[styles.heatmapFilterText, heatmapFilter === "attacking" && styles.heatmapFilterTextActive]}>
                      Attacking Events
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.heatmapFilterButton, heatmapFilter === "defensive" && styles.heatmapFilterButtonActive]}
                    onPress={() => setHeatmapFilter("defensive")}
                  >
                    <Text style={[styles.heatmapFilterText, heatmapFilter === "defensive" && styles.heatmapFilterTextActive]}>
                      Defensive Events
                    </Text>
                  </TouchableOpacity>
                </View>
                {Object.keys(liveHeatmapData).length > 0 ? (
                  <>
                    <View style={styles.heatmapContainer}>
                      <PitchVisualization
                        width={Platform.OS === "web" ? Math.min(700, screenW - 100) : screenW - 80}
                        height={Platform.OS === "web" ? 400 : 300}
                        heatMapData={liveHeatmapData}
                      />
                    </View>
                    {heatmapZoneInsights.length > 0 && (
                      <View style={styles.heatmapInsightsContainer}>
                        <Text style={styles.heatmapInsightsTitle}>Zone Analysis</Text>
                        {heatmapZoneInsights.map((insight, idx) => (
                          <View key={idx} style={styles.heatmapInsightItem}>
                            <Text style={styles.heatmapInsightTitle}>{insight.title}</Text>
                            <Text style={styles.heatmapInsightMessage}>{insight.message}</Text>
                            {insight.suggestions && insight.suggestions.length > 0 && (
                              <View style={styles.heatmapSuggestionsList}>
                                {insight.suggestions.map((s, sIdx) => (
                                  <View key={sIdx} style={styles.heatmapSuggestionItem}>
                                    <Text style={styles.heatmapSuggestionBullet}>•</Text>
                                    <Text style={styles.heatmapSuggestionText}>{s}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.emptyEventsText}>No events recorded for this filter.</Text>
                )}
              </View>
            )}

            {/* Duels by Third – custom clustered bar chart (thirds on x-axis, Won dark blue, Lost light blue) */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Duels by Third</Text>
                <Text style={styles.cardSubtitle}>Duels won vs duels lost in each zone</Text>
              </View>
              {duelsByThird.first.won + duelsByThird.first.lost + duelsByThird.middle.won + duelsByThird.middle.lost + duelsByThird.final.won + duelsByThird.final.lost === 0 ? (
                <Text style={styles.emptyEventsText}>No duels recorded for this match.</Text>
              ) : (
                <>
                  <DuelsByThirdChart duelsByThird={duelsByThird} screenW={screenW} />
                  <View style={styles.duelsLegend}>
                    <View style={styles.duelsLegendItem}>
                      <View style={[styles.duelsLegendDot, { backgroundColor: "#1e3a8a" }]} />
                      <Text style={styles.duelsLegendText}>Won</Text>
                    </View>
                    <View style={styles.duelsLegendItem}>
                      <View style={[styles.duelsLegendDot, { backgroundColor: "#93c5fd" }]} />
                      <Text style={styles.duelsLegendText}>Lost</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Player Performance Rankings */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Player Performance</Text>
                <Text style={styles.cardSubtitle}>Individual contributions ranked by rating</Text>
              </View>
              {playerPerformance.length === 0 ? (
                <Text style={styles.emptyEventsText}>No events recorded for this match.</Text>
              ) : (
                playerPerformance.map((player, idx) => (
                    <View key={player.name} style={styles.playerRow}>
                      <View style={styles.playerRank}>
                        <Text style={styles.playerRankText}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{player.name}</Text>
                        <View style={styles.playerStatsRow}>
                          <Text style={styles.playerStat}>Goals: {player.goals}</Text>
                          <Text style={styles.playerStat}>Key Passes: {player.keyPasses}</Text>
                          <Text style={styles.playerStat}>
                            Duels: {(player.duelsWon || 0) > 0 ? player.duelsWon : "—"}
                          </Text>
                          <Text style={styles.playerStat}>Tackles: {player.tackles}</Text>
                        </View>
                      </View>
                      <View style={styles.playerRating}>
                        <Text style={styles.playerRatingValue}>{player.rating.toFixed(1)}</Text>
                        <Text style={styles.playerRatingLabel}>Rating</Text>
                      </View>
                    </View>
                ))
              )}
            </View>

            {/* Match Insights */}
            {matchPerformanceSuggestions && matchPerformanceSuggestions.suggestions && matchPerformanceSuggestions.suggestions.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.cardTitle}>Match Insights</Text>
                  <Text style={styles.cardSubtitle}>Strategic recommendations for improvement</Text>
                </View>
                {matchPerformanceSuggestions.suggestions.map((suggestion, idx) => (
                  <View key={idx} style={styles.insightCard}>
                    <Text style={styles.insightTitle}>{suggestion.title || suggestion.category}</Text>
                    <Text style={styles.insightMessage}>{suggestion.message || suggestion.description}</Text>
                    {suggestion.action_items && suggestion.action_items.length > 0 && (
                      <View style={styles.insightActions}>
                        {suggestion.action_items.map((action, actionIdx) => (
                          <Text key={actionIdx} style={styles.insightActionItem}>→ {action}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Event Timeline – filter by player and event type, jump to video */}
            {eventInstances.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.cardTitle}>Event Timeline</Text>
                  <Text style={styles.cardSubtitle}>All actions in the game — filter by player or event type, tap to jump in video</Text>
                </View>
                <View style={styles.timelineFilters}>
                  <View style={styles.timelineFilterGroup}>
                    <Text style={styles.timelineFilterLabel}>Player</Text>
                    <View style={styles.timelinePickerWrap}>
                      <Picker
                        selectedValue={timelinePlayerFilter ?? "all"}
                        onValueChange={(v) => setTimelinePlayerFilter(v === "all" ? null : v)}
                        style={styles.timelinePicker}
                        itemStyle={Platform.OS === "ios" ? styles.timelinePickerItemIOS : undefined}
                      >
                        <Picker.Item label="All players" value="all" />
                        {timelinePlayers.map((name) => (
                          <Picker.Item key={name} label={String(name)} value={name} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                  <View style={styles.timelineFilterGroup}>
                    <Text style={styles.timelineFilterLabel}>Event type</Text>
                    <View style={styles.timelinePickerWrap}>
                      <Picker
                        selectedValue={timelineEventTypeFilter ?? "all"}
                        onValueChange={(v) => setTimelineEventTypeFilter(v === "all" ? null : v)}
                        style={styles.timelinePicker}
                        itemStyle={Platform.OS === "ios" ? styles.timelinePickerItemIOS : undefined}
                      >
                        <Picker.Item label="All events" value="all" />
                        {timelineEventTypes.map((type) => (
                          <Picker.Item
                            key={type}
                            label={String(type).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                            value={type}
                          />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </View>
                <ScrollView style={styles.timelineContainer} nestedScrollEnabled>
                  {filteredEventInstances.length === 0 ? (
                    <Text style={styles.emptyEventsText}>No events match the selected filters.</Text>
                  ) : (
                    filteredEventInstances.map((event, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.timelineItem,
                          selectedTimestamp === event.second && styles.timelineItemSelected
                        ]}
                        onPress={() => {
                          if (match.has_recording && match.recording_url) {
                            const sec = event.second != null ? Number(event.second) : 0;
                            setSelectedTimestamp(sec);
                            videoPlayerRef.current?.seekTo?.(sec);
                          } else {
                            alert("No video available. Please upload a video first.");
                          }
                        }}
                      >
                        <View style={styles.timelineTime}>
                          <Text style={styles.timelineTimeText}>{formatTime(event.second)}</Text>
                          {match.has_recording && match.recording_url && (
                            <Text style={styles.timelineJumpText}>Jump →</Text>
                          )}
                        </View>
                        <View style={styles.timelineContent}>
                          <Text style={styles.timelinePlayer}>{event.player}</Text>
                          <Text style={styles.timelineEvent}>{event.event.replace(/_/g, " ")}</Text>
                          {event.zone && (
                            <Text style={styles.timelineZone}>Zone {event.zone}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* Match Recording */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Match Recording</Text>
                <Text style={styles.cardSubtitle}>
                  {match.has_recording && match.recording_url 
                    ? "Video playback with event navigation" 
                    : "Upload a video to review match events"}
                </Text>
              </View>
              
              {match.has_recording && match.recording_url ? (
                <VideoPlayer 
                  ref={videoPlayerRef}
                  videoUrl={normalizeRecordingUrl(match.recording_url)} 
                  currentTime={selectedTimestamp}
                  key={normalizeRecordingUrl(match.recording_url)}
                />
              ) : (
                <View style={styles.uploadContainer}>
                  <View style={styles.uploadPlaceholder}>
                    <Text style={styles.uploadPlaceholderText}>No video uploaded</Text>
                    <Text style={styles.uploadPlaceholderSubtext}>
                      Upload a match recording to review events and jump to specific moments
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.uploadButton, uploadingVideo && styles.uploadButtonDisabled]}
                    onPress={uploadVideo}
                    disabled={uploadingVideo}
                  >
                    {uploadingVideo ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.uploadButtonText}>Upload Video</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              
              {match.has_recording && match.recording_url && (
                <TouchableOpacity
                  style={styles.replaceVideoButton}
                  onPress={uploadVideo}
                  disabled={uploadingVideo}
                >
                  {uploadingVideo ? (
                    <ActivityIndicator size="small" color="#64748b" />
                  ) : (
                    <Text style={styles.replaceVideoButtonText}>Replace Video</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
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

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingBottom: 40,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  matchHeaderCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  matchHeaderContent: {
    gap: 16,
  },
  matchHeaderMain: {
    alignItems: "center",
    marginBottom: 8,
  },
  matchOpponent: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  matchScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -1,
  },
  scoreSeparator: {
    fontSize: 32,
    fontWeight: "600",
    color: "#94a3b8",
  },
  matchMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "center",
  },
  metaItem: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
  },
  formationRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 8,
  },
  formationLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
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
  emptyEventsText: {
    fontSize: 14,
    color: "#64748b",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 16,
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
    borderTopColor: "#e2e8f0",
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
  heatmapInsightsContainer: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  heatmapInsightsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 16,
  },
  heatmapInsightItem: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#1e3a8a",
  },
  heatmapInsightTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  heatmapInsightMessage: {
    fontSize: 14,
    fontWeight: "500",
    color: "#475569",
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
    color: "#475569",
    lineHeight: 18,
  },
  analysisSummary: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
    marginBottom: 10,
  },
  analysisGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  analysisItem: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  analysisLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analysisValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  analysisValueWarning: {
    color: "#dc2626",
  },
  mlInsightsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  mlInsightsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
  },
  mlAdviceItem: {
    marginBottom: 12,
  },
  mlAdviceTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  mlAdviceMessage: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
  },
  tipsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
  },
  tipItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tipItemHigh: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  tipItemMedium: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  tipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
    lineHeight: 18,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 120,
    padding: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  kpiValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heatmapContainer: {
    marginTop: 16,
    marginBottom: 24,
    alignItems: "center",
  },
  duelsChartWrapper: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  duelsChartInner: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
    overflow: "hidden",
  },
  duelsYAxisWrap: {
    marginRight: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  duelsYAxisTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  duelsYAxisLabels: {
    flex: 1,
    justifyContent: "space-between",
  },
  duelsYAxisLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },
  duelsChartArea: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "#e2e8f0",
    paddingLeft: 12,
    position: "relative",
  },
  duelsGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  duelsBarsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  duelsThirdGroup: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 4,
  },
  duelsBarsPair: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  duelsBarCell: {
    flex: 1,
    maxWidth: 44,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  duelsVerticalBar: {
    width: "100%",
    minWidth: 20,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    position: "relative",
  },
  duelsBarValueOnBar: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  duelsThirdLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    marginTop: 4,
  },
  duelsLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  duelsLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  duelsLegendDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  duelsLegendText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  zoneStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  zoneStatCard: {
    flex: 1,
    minWidth: 100,
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  zoneStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  zoneStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  zoneStatDetail: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  chart: {
    marginTop: 16,
    borderRadius: 12,
  },
  comparisonList: {
    marginTop: 16,
  },
  comparisonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  comparisonEvent: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    flex: 1,
  },
  comparisonValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  comparisonValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 30,
    textAlign: "center",
  },
  comparisonSeparator: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
  },
  comparisonDiff: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 40,
    textAlign: "right",
  },
  comparisonDiffPositive: {
    color: "#059669",
  },
  comparisonDiffNegative: {
    color: "#dc2626",
  },
  xgLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 20,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  xgSummary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  xgSummaryItem: {
    alignItems: "center",
  },
  xgSummaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  xgSummaryValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  filterRow: {
    marginBottom: 20,
  },
  filterButtons: {
    flexDirection: "row",
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  filterButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  filterButtonTextActive: {
    color: "#ffffff",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  playerRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  playerRankText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  playerStatsRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  playerStat: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  playerRating: {
    alignItems: "flex-end",
  },
  playerRatingValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  playerRatingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightCard: {
    padding: 20,
    marginBottom: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 3,
    borderLeftColor: "#0f172a",
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  insightMessage: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 22,
    marginBottom: 12,
  },
  insightActions: {
    marginTop: 8,
  },
  insightActionItem: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 6,
  },
  timelineFilters: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 16,
    marginBottom: 20,
  },
  timelineFilterGroup: {
    flex: 1,
    minWidth: 140,
  },
  timelineFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelinePickerWrap: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  timelinePicker: {
    height: 44,
  },
  timelinePickerItemIOS: {
    fontSize: 14,
    color: "#0f172a",
  },
  timelineContainer: {
    maxHeight: 400,
  },
  timelineItem: {
    flexDirection: "row",
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  timelineTime: {
    width: 60,
    marginRight: 16,
  },
  timelineTimeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    fontFamily: Platform.OS === "web" ? "monospace" : "monospace",
  },
  timelineContent: {
    flex: 1,
  },
  timelinePlayer: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  timelineEvent: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 4,
  },
  timelineZone: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  timelineItemSelected: {
    backgroundColor: "#f1f5f9",
    borderColor: "#0f172a",
    borderWidth: 2,
  },
  timelineJumpText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f172a",
    marginTop: 4,
  },
  uploadContainer: {
    alignItems: "center",
    padding: 40,
  },
  uploadPlaceholder: {
    alignItems: "center",
    marginBottom: 24,
  },
  uploadPlaceholderText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
  },
  uploadPlaceholderSubtext: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
  },
  uploadButton: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  replaceVideoButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  replaceVideoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
});
