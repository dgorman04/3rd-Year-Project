import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Picker } from "@react-native-picker/picker";

import { API, WS_URL, ngrokHeaders } from "../../../lib/config";
import { getToken, clearToken } from "../../../lib/auth";
import MatchTimer from "../../../components/MatchTimer";
import AppLayout from "../../../components/AppLayout";
import PitchVisualization from "../../../components/PitchVisualization";

const EVENTS = [
  { key: "shots_on_target", label: "Shots on Target" },
  { key: "shots_off_target", label: "Shots off Target" },
  { key: "key_passes", label: "Key Passes" },
  { key: "duels_won", label: "Duels Won" },
  { key: "duels_lost", label: "Duels Lost" },
  { key: "fouls", label: "Fouls" },
  { key: "interceptions", label: "Interceptions" },
  { key: "blocks", label: "Blocks" },
  { key: "tackles", label: "Tackles" },
  { key: "clearances", label: "Clearances" },
];

const PITCH_ZONES = [
  { id: "1", label: "Zone 1", position: "Defensive Left" },
  { id: "2", label: "Zone 2", position: "Defensive Center" },
  { id: "3", label: "Zone 3", position: "Defensive Right" },
  { id: "4", label: "Zone 4", position: "Attacking Left" },
  { id: "5", label: "Zone 5", position: "Attacking Center" },
  { id: "6", label: "Zone 6", position: "Attacking Right" },
];

export default function AnalystMatchDashboard() {
  const params = useLocalSearchParams();
  const matchId = String(params?.id || "").trim();
  const screenW = Dimensions.get("window").width;
  const isCompactPhone = Platform.OS !== "web" && screenW < 420;

  const [token, setToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [match, setMatch] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedZone, setSelectedZone] = useState(null);
  const [goalsScored, setGoalsScored] = useState(0);
  const [goalsConceded, setGoalsConceded] = useState(0);
  const [wsStatus, setWsStatus] = useState("Offline");
  const [message, setMessage] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [matchState, setMatchState] = useState("not_started");
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [teamName, setTeamName] = useState(null);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      if (!t) router.replace("/");
      
      try {
        const res = await fetch(`${API}/auth/me/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        if (res.ok) {
          const userData = await res.json().catch(() => ({}));
          setUserRole(userData.role || "analyst");
        }
      } catch (e) {
        console.log("Error loading user:", e);
      }

      // Load team name (for clear goal labels)
      try {
        const teamRes = await fetch(`${API}/stats/`, {
          headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
        });
        if (teamRes.ok) {
          const teamJson = await teamRes.json().catch(() => ({}));
          if (teamJson?.team?.team_name) setTeamName(teamJson.team.team_name);
        }
      } catch (e) {
        console.log("Error loading team name:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!token) return;
      if (!matchId) return;

      try {
        setLoadingMatch(true);
        const res = await fetch(`${API}/matches/${matchId}/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });

        const raw = await res.text();
        let json = {};
        try {
          json = JSON.parse(raw);
        } catch {}

        if (!res.ok) {
          setMatch(null);
          return;
        }

        setMatch(json);
        if (json.state) {
          setMatchState(json.state);
          setIsTimerRunning(json.state === "first_half" || json.state === "second_half");
        } else {
          setMatchState("not_started");
          setIsTimerRunning(false);
        }
        setElapsedSeconds(json.elapsed_seconds || 0);
        setGoalsScored(json.goals_scored || 0);
        setGoalsConceded(json.goals_conceded || 0);
      } catch (e) {
        console.log("Match load error:", e);
      } finally {
        setLoadingMatch(false);
      }
    })();
  }, [token, matchId]);

  useEffect(() => {
    (async () => {
      if (!token) return;

      try {
        setLoadingPlayers(true);
        const res = await fetch(`${API}/teams/players/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });

        const raw = await res.text();
        let json = {};
        try {
          json = JSON.parse(raw);
        } catch {}

        if (!res.ok) {
          if (res.status === 401) {
            await clearToken();
            router.replace("/");
            return;
          }
          alert(json?.detail || "Failed to load squad.");
          return;
        }

        const list = json.players || [];
        setPlayers(list);
        if (list.length) setSelectedPlayer((prev) => prev || String(list[0].name));
      } catch (e) {
        console.log(e);
        alert("Network error loading players.");
      } finally {
        setLoadingPlayers(false);
      }
    })();
  }, [token]);

  const loadLiveSuggestions = async () => {
    if (!token || !matchId) return;
    if (matchState === "not_started" || matchState === "finished") {
      setLiveSuggestions([]);
      return;
    }

    try {
      const res = await fetch(`${API}/matches/${matchId}/live-suggestions/`, {
        headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setLiveSuggestions(Array.isArray(json?.suggestions) ? json.suggestions : []);
      }
    } catch (e) {
      console.log("Error loading suggestions:", e);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (!WS_URL) return;

    const socket = new WebSocket(WS_URL);
    socket.onopen = () => setWsStatus("Live");
    socket.onclose = () => setWsStatus("Offline");
    socket.onerror = (err) => console.log("WS error:", err?.message || err);
    socket.onmessage = (event) => {
      console.log("WS:", event.data);
      if (matchId && matchState !== "not_started" && matchState !== "finished") {
        loadLiveSuggestions();
      }
    };

    return () => {
      try {
        socket.close();
      } catch {}
    };
  }, [token, matchId, matchState]);

  useEffect(() => {
    if (!token || !matchId) return;
    if (matchState === "not_started" || matchState === "finished") {
      setLiveSuggestions([]);
      return;
    }

    loadLiveSuggestions();
    const interval = setInterval(loadLiveSuggestions, 10000);
    return () => clearInterval(interval);
  }, [token, matchId, matchState]);

  const playerNames = useMemo(() => (players || []).map((p) => p.name), [players]);

  const zoneIdToNum = useMemo(
    () => ({
      defensive_left: "1",
      defensive_center: "2",
      defensive_right: "3",
      attacking_left: "4",
      attacking_center: "5",
      attacking_right: "6",
    }),
    []
  );
  const zoneNumToId = useMemo(
    () => ({
      "1": "defensive_left",
      "2": "defensive_center",
      "3": "defensive_right",
      "4": "attacking_left",
      "5": "attacking_center",
      "6": "attacking_right",
    }),
    []
  );

  const submitEvent = async () => {
    setMessage("");

    if (!matchId) {
      setMessage("Missing match id");
      return;
    }

    if (matchState === "not_started") {
      setMessage("Must start match first");
      return;
    }

    if (!isTimerRunning) {
      setMessage("Resume match to record event");
      return;
    }

    if (!selectedEvent || !selectedPlayer || !selectedZone) {
      setMessage("Select event, player & zone");
      return;
    }

    const url = `${API}/matches/${matchId}/${selectedEvent}/${encodeURIComponent(selectedPlayer)}/increment/`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({
          zone: selectedZone,
          second: elapsedSeconds,
        }),
      });

      const raw = await res.text();
      let json = {};
      try {
        json = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          setMessage("Unauthorized");
          await clearToken();
          router.replace("/");
          return;
        }
        setMessage(json?.detail || "Error recording event");
        return;
      }

      setMessage(`Recorded: ${selectedEvent.replace(/_/g, " ")} • ${selectedPlayer} • Zone ${selectedZone}`);
      setSelectedZone(null);
      setSelectedEvent("");
    } catch (err) {
      console.log("Fetch error:", err);
      setMessage("Server connection failed");
    }
  };

  const recordGoal = async (type) => {
    setMessage("");

    if (!matchId) {
      setMessage("Missing match id");
      return;
    }

    try {
      const updateData = {};
      if (type === "scored") {
        updateData.goals_scored = goalsScored + 1;
        setGoalsScored(updateData.goals_scored);
      } else {
        updateData.goals_conceded = goalsConceded + 1;
        setGoalsConceded(updateData.goals_conceded);
      }

      const res = await fetch(`${API}/matches/${matchId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify(updateData),
      });

      const raw = await res.text();
      let json = {};
      try {
        json = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          setMessage("Unauthorized");
          await clearToken();
          router.replace("/");
          return;
        }
        setMessage(json?.detail || "Error updating score");
        return;
      }

      setMessage(type === "scored" ? "✓ Goal scored!" : "✓ Goal conceded");
    } catch (err) {
      console.log("Fetch error:", err);
      setMessage("Server connection failed");
    }
  };

  const finishMatch = async () => {
    if (!token || !matchId) return;
    
    try {
      const res = await fetch(`${API}/matches/${matchId}/timer/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({ action: "finish" }),
      });
      
      if (res.ok) {
        alert("Match finished! Returning to dashboard.");
        router.replace("/analyst/dashboard");
      } else {
        router.replace("/analyst/dashboard");
      }
    } catch (e) {
      console.log("Error finishing match:", e);
      router.replace("/analyst/dashboard");
    }
  };

  if (!token) return null;

  const selectedEventData = EVENTS.find(e => e.key === selectedEvent);
  const isReadyToRecord = !!(selectedEvent && selectedPlayer && selectedZone);
  const ourTeamLabel = teamName || "Our Team";
  const opponentLabel = match?.opponent || "Opponent";
  const selectedZoneId = selectedZone ? zoneNumToId[String(selectedZone)] : null;

  return (
    <AppLayout>
      <View style={styles.screen}>
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.webTitle}>
                {loadingMatch ? "Loading match…" : match ? `vs ${match.opponent}` : `Match ID: ${matchId}`}
              </Text>
              <Text style={styles.webSubtitle}>
                {match?.kickoff_at ? new Date(match.kickoff_at).toLocaleString() : "Match Analysis"}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, wsStatus === "Live" && styles.statusDotLive]} />
                <Text style={styles.statusText}>{wsStatus}</Text>
              </View>
              <TouchableOpacity style={styles.finishBtn} onPress={finishMatch}>
                <Text style={styles.finishBtnText}>Finish Match</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {Platform.OS !== "web" && (
          <View style={styles.actionBar}>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, wsStatus === "Live" && styles.statusDotLive]} />
              <Text style={styles.statusText}>{wsStatus}</Text>
            </View>
            <TouchableOpacity style={styles.finishBtn} onPress={finishMatch}>
              <Text style={styles.finishBtnText}>Finish Match</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Match Timer */}
        {match && (
          <View style={styles.timerContainer}>
            <MatchTimer
              matchId={matchId}
              token={token}
              onTimeUpdate={setElapsedSeconds}
              onStateChange={setMatchState}
              onRunningChange={setIsTimerRunning}
              initialState={match.state || "not_started"}
              initialElapsed={match.elapsed_seconds || 0}
            />
          </View>
        )}

        <ScrollView
          contentContainerStyle={[
            styles.content,
            Platform.OS !== "web" && styles.contentWithBottomBar,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Score Section */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>{ourTeamLabel}</Text>
                <Text style={styles.scoreValue}>{goalsScored}</Text>
                <TouchableOpacity 
                  style={[styles.goalButton, styles.goalButtonScored]} 
                  onPress={() => recordGoal("scored")}
                >
                  <Text style={styles.goalButtonText}>Add goal</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.scoreDividerContainer}>
                <Text style={styles.scoreDivider}>-</Text>
              </View>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>{opponentLabel}</Text>
                <Text style={styles.scoreValue}>{goalsConceded}</Text>
                <TouchableOpacity 
                  style={[styles.goalButton, styles.goalButtonConceded]} 
                  onPress={() => recordGoal("conceded")}
                >
                  <Text style={styles.goalButtonText}>Add goal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Event Selection */}
          <View style={styles.eventsCard}>
            <Text style={styles.sectionLabel}>Select Event Type</Text>
            {isCompactPhone ? (
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedEvent || ""}
                  onValueChange={(v) => setSelectedEvent(v)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  <Picker.Item label="Choose event..." value="" />
                  {EVENTS.map((e) => (
                    <Picker.Item key={e.key} label={e.label} value={e.key} />
                  ))}
                </Picker>
              </View>
            ) : (
              <View style={styles.eventsGrid}>
                {EVENTS.map((event) => {
                  const isSelected = selectedEvent === event.key;
                  return (
                    <TouchableOpacity
                      key={event.key}
                      style={[
                        styles.eventButton,
                        isSelected && styles.eventButtonActive
                      ]}
                      onPress={() => setSelectedEvent(event.key)}
                    >
                      <View style={[styles.eventAccent, isSelected && styles.eventAccentActive]} />
                      <Text style={[styles.eventLabel, isSelected && styles.eventLabelActive]}>
                        {event.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Player Selection */}
          <View style={styles.selectionCard}>
            <Text style={styles.sectionLabel}>Select Player</Text>
            {loadingPlayers ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.loadingText}>Loading players...</Text>
              </View>
            ) : (
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedPlayer || ""}
                  onValueChange={(v) => setSelectedPlayer(v)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  <Picker.Item label={playerNames.length ? "Choose player..." : "No players available"} value="" />
                  {playerNames.map((name) => (
                    <Picker.Item key={name} label={name} value={name} />
                  ))}
                </Picker>
              </View>
            )}
          </View>

          {/* Zone Selection (clickable pitch) */}
          <View style={styles.zoneCard}>
            <View style={styles.zoneHeaderRow}>
              <Text style={styles.sectionLabel}>Select Pitch Zone</Text>
              <Text style={styles.zoneSelectedText}>
                {selectedZone ? `Selected: Zone ${selectedZone}` : "Tap a zone on the pitch"}
              </Text>
            </View>
            <View style={styles.pitchWrapper}>
              <PitchVisualization
                width={Platform.OS === "web" ? Math.min(screenW - 80, 520) : screenW - 40}
                height={Platform.OS === "web" ? 300 : 260}
                heatMapData={null}
                pitchColor="#0b8a5a"
                pitchLineColor="#ffffff"
                zoneFillColor="#10b981"
                selectedZone={selectedZoneId}
                onZoneClick={(zoneId) => {
                  const zoneNum = zoneIdToNum[zoneId];
                  if (zoneNum) setSelectedZone(zoneNum);
                }}
                events={[]}
              />
            </View>
            <View style={styles.zoneLegend}>
              <Text style={styles.zoneLegendText}>Zones 1 & 4: first third • Zones 2 & 5: middle third • Zones 3 & 6: final third</Text>
            </View>
          </View>

          {/* Record button inside scroll for web (phone uses fixed bottom bar) */}
          {Platform.OS === "web" && (
            <TouchableOpacity 
              style={[
                styles.recordButton,
                !isReadyToRecord && styles.recordButtonDisabled
              ]} 
              onPress={submitEvent}
              disabled={!isReadyToRecord}
            >
              {selectedEventData ? (
                <Text style={styles.recordButtonText}>
                  Record {selectedEventData.label}
                  {selectedPlayer ? ` • ${selectedPlayer}` : ""}
                  {selectedZone ? ` • Zone ${selectedZone}` : ""}
                </Text>
              ) : (
                <Text style={styles.recordButtonText}>Select event to record</Text>
              )}
            </TouchableOpacity>
          )}

          {!!message && (
            <View style={[
              styles.messageContainer,
              message.startsWith("✓") && styles.messageContainerSuccess
            ]}>
              <Text style={[
                styles.message,
                message.startsWith("✓") && styles.messageSuccess
              ]}>
                {message}
              </Text>
            </View>
          )}

          {/* Live Suggestions */}
          {liveSuggestions.length > 0 && (
            <View style={styles.suggestionsCard}>
              <View style={styles.suggestionsHeader}>
                <Text style={styles.suggestionsTitle}>Live Tactical Insights</Text>
                <Text style={styles.suggestionsSubtitle}>AI-powered recommendations</Text>
              </View>
              {liveSuggestions.map((suggestion, idx) => (
                <View key={idx} style={styles.suggestionItem}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionCategory}>{suggestion.category}</Text>
                    <View style={[
                      styles.priorityBadge,
                      suggestion.priority === "High" && styles.priorityBadgeHigh
                    ]}>
                      <Text style={[
                        styles.priorityText,
                        suggestion.priority === "High" && styles.priorityTextHigh
                      ]}>
                        {suggestion.priority}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <Text style={styles.suggestionMessage}>{suggestion.message}</Text>
                  {suggestion.action_items && suggestion.action_items.length > 0 && (
                    <View style={styles.actionItemsContainer}>
                      {suggestion.action_items.map((item, itemIdx) => (
                        <Text key={itemIdx} style={styles.actionItem}>• {item}</Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Fixed bottom action bar for phone */}
        {Platform.OS !== "web" && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[
                styles.recordButton,
                styles.recordButtonBottom,
                !isReadyToRecord && styles.recordButtonDisabled,
              ]}
              onPress={submitEvent}
              disabled={!isReadyToRecord}
            >
              {selectedEventData ? (
                <Text style={styles.recordButtonText} numberOfLines={2}>
                  Record {selectedEventData.label}
                  {selectedPlayer ? ` • ${selectedPlayer}` : ""}
                  {selectedZone ? ` • Zone ${selectedZone}` : ""}
                </Text>
              ) : (
                <Text style={styles.recordButtonText}>Select event, player, and zone</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#f9fafb" 
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
  headerLeft: {
    flex: 1,
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  finishBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  finishBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  timerContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  contentWithBottomBar: {
    paddingBottom: 140,
  },
  scoreCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  scoreBox: {
    flex: 1,
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 16,
  },
  goalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  goalButtonScored: {
    backgroundColor: "#10b981",
  },
  goalButtonConceded: {
    backgroundColor: "#ef4444",
  },
  goalButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  scoreDividerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scoreDivider: {
    fontSize: 36,
    fontWeight: "800",
    color: "#9ca3af",
  },
  modeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modeRow: {
    flexDirection: "row",
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  modeButtonText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: "#ffffff",
  },
  eventsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  eventsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  eventButton: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 180 : "48%",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "flex-start",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  eventButtonActive: {
    borderColor: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  eventAccent: {
    width: 6,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    marginTop: 2,
  },
  eventAccentActive: {
    backgroundColor: "#0f172a",
  },
  eventLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    lineHeight: 18,
  },
  eventLabelActive: {
    color: "#0f172a",
  },
  selectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  loadingText: {
    color: "#6b7280",
    fontWeight: "400",
    fontSize: 14,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  picker: {
    width: "100%",
    backgroundColor: "#fff",
    color: "#111827",
    fontWeight: "400",
  },
  pickerItem: {
    backgroundColor: "#fff",
    color: "#111827",
  },
  zoneCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  zoneHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  zoneSelectedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  pitchWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  zoneLegend: {
    marginTop: 10,
  },
  zoneLegendText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 16,
    textAlign: "center",
  },
  zoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  zoneButton: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 150 : "45%",
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  zoneButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  zoneNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6b7280",
  },
  zoneNumberActive: {
    color: "#ffffff",
  },
  zoneLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
    textAlign: "center",
  },
  zoneLabelActive: {
    color: "#ffffff",
  },
  recordButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    marginTop: 8,
  },
  recordButtonBottom: {
    marginTop: 0,
  },
  recordButtonDisabled: {
    backgroundColor: "#9ca3af",
    shadowOpacity: 0,
    elevation: 0,
  },
  recordButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: "rgba(249, 250, 251, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  messageContainer: {
    backgroundColor: "#eff6ff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  messageContainerSuccess: {
    backgroundColor: "#d1fae5",
    borderColor: "#86efac",
  },
  message: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
  },
  messageSuccess: {
    color: "#065f46",
  },
  suggestionsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  suggestionsHeader: {
    marginBottom: 16,
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  suggestionsSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "400",
  },
  suggestionItem: {
    marginTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  suggestionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  suggestionCategory: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  priorityBadgeHigh: {
    backgroundColor: "#fee2e2",
  },
  priorityText: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  priorityTextHigh: {
    color: "#dc2626",
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  suggestionMessage: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "400",
    marginBottom: 12,
    lineHeight: 20,
  },
  actionItemsContainer: {
    marginTop: 8,
  },
  actionItem: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "400",
    marginTop: 4,
    lineHeight: 20,
  },
});
