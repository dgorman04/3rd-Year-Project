import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Picker } from "@react-native-picker/picker";

import { API, WS_URL, ngrokHeaders } from "../../../lib/config";
import { getToken, clearToken } from "../../../lib/auth";
import MatchTimer from "../../../components/MatchTimer";
import AppHeader from "../../../components/AppHeader";
import AppLayout from "../../../components/AppLayout";
import ChatBubble from "../../../components/ChatBubble";

const EVENTS = [
  { key: "shots_on_target", label: "Shots on Target", icon: "🎯", color: "#10b981", bg: "#d1fae5" },
  { key: "shots_off_target", label: "Shots off Target", icon: "⚽", color: "#f59e0b", bg: "#fef3c7" },
  { key: "key_passes", label: "Key Passes", icon: "🔑", color: "#3b82f6", bg: "#dbeafe" },
  { key: "duels_won", label: "Duels Won", icon: "💪", color: "#22c55e", bg: "#dcfce7" },
  { key: "duels_lost", label: "Duels Lost", icon: "❌", color: "#ef4444", bg: "#fee2e2" },
  { key: "fouls", label: "Fouls", icon: "⚠️", color: "#f97316", bg: "#ffedd5" },
  { key: "interceptions", label: "Interceptions", icon: "🛡️", color: "#8b5cf6", bg: "#ede9fe" },
  { key: "blocks", label: "Blocks", icon: "🚫", color: "#6366f1", bg: "#e0e7ff" },
  { key: "tackles", label: "Tackles", icon: "⚔️", color: "#06b6d4", bg: "#cffafe" },
  { key: "clearances", label: "Clearances", icon: "🧹", color: "#84cc16", bg: "#ecfccb" },
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

  const [token, setToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [match, setMatch] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedZone, setSelectedZone] = useState(null);
  const [recordingFor, setRecordingFor] = useState("team");
  const [goalsScored, setGoalsScored] = useState(0);
  const [goalsConceded, setGoalsConceded] = useState(0);
  const [wsStatus, setWsStatus] = useState("Offline");
  const [message, setMessage] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [matchState, setMatchState] = useState("not_started");
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState([]);
  const [userRole, setUserRole] = useState(null);

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

    if (recordingFor === "team") {
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

        setMessage(`✓ ${selectedEvent} recorded for ${selectedPlayer}`);
        setSelectedZone(null);
        setSelectedEvent("");
      } catch (err) {
        console.log("Fetch error:", err);
        setMessage("Server connection failed");
      }
    } else {
      if (!selectedEvent) {
        setMessage("Select event");
        return;
      }

      const url = `${API}/matches/${matchId}/opposition/`;

      try {
        const getRes = await fetch(`${API}/matches/${matchId}/opposition/`, {
          headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
        });
        let currentCount = 0;
        if (getRes.ok) {
          const oppStats = await getRes.json().catch(() => []);
          const existing = oppStats.find((s) => s.event === selectedEvent);
          if (existing) {
            currentCount = existing.count || 0;
          }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...ngrokHeaders(),
          },
          body: JSON.stringify({ 
            event: selectedEvent,
            count: currentCount + 1,
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
          setMessage(json?.detail || "Error recording opposition event");
          return;
        }

        setMessage(`✓ Opposition ${selectedEvent} recorded`);
        setSelectedEvent("");
      } catch (err) {
        console.log("Fetch error:", err);
        setMessage("Server connection failed");
      }
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
  const isReadyToRecord = selectedEvent && (recordingFor === "opposition" || (selectedPlayer && selectedZone));

  return (
    <AppLayout>
      <View style={styles.screen}>
        {Platform.OS !== "web" && (
          <AppHeader 
            subtitle={
              loadingMatch 
                ? "Loading match…" 
                : match 
                ? `vs ${match.opponent}`
                : `Match ID: ${matchId}`
            } 
          />
        )}
        
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

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Score Section - Prominent */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Our Team</Text>
                <Text style={styles.scoreValue}>{goalsScored}</Text>
                <TouchableOpacity 
                  style={[styles.goalButton, styles.goalButtonScored]} 
                  onPress={() => recordGoal("scored")}
                >
                  <Text style={styles.goalButtonText}>+ Goal</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.scoreDividerContainer}>
                <Text style={styles.scoreDivider}>-</Text>
              </View>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Opponent</Text>
                <Text style={styles.scoreValue}>{goalsConceded}</Text>
                <TouchableOpacity 
                  style={[styles.goalButton, styles.goalButtonConceded]} 
                  onPress={() => recordGoal("conceded")}
                >
                  <Text style={styles.goalButtonText}>+ Goal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Recording Mode Toggle - Compact */}
          <View style={styles.modeCard}>
            <Text style={styles.sectionLabel}>Recording For</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeButton, recordingFor === "team" && styles.modeButtonActive]}
                onPress={() => setRecordingFor("team")}
              >
                <Text style={[styles.modeButtonText, recordingFor === "team" && styles.modeButtonTextActive]}>
                  Our Team
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, recordingFor === "opposition" && styles.modeButtonActive]}
                onPress={() => setRecordingFor("opposition")}
              >
                <Text style={[styles.modeButtonText, recordingFor === "opposition" && styles.modeButtonTextActive]}>
                  Opposition
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Event Selection - Visual Grid */}
          <View style={styles.eventsCard}>
            <Text style={styles.sectionLabel}>Select Event Type</Text>
            <View style={styles.eventsGrid}>
              {EVENTS.map((event) => {
                const isSelected = selectedEvent === event.key;
                return (
                  <TouchableOpacity
                    key={event.key}
                    style={[
                      styles.eventButton,
                      isSelected && { 
                        backgroundColor: event.bg,
                        borderColor: event.color,
                        borderWidth: 2,
                      }
                    ]}
                    onPress={() => setSelectedEvent(event.key)}
                  >
                    <Text style={styles.eventIcon}>{event.icon}</Text>
                    <Text style={[
                      styles.eventLabel,
                      isSelected && { color: event.color, fontWeight: "700" }
                    ]}>
                      {event.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Player Selection (Team only) */}
          {recordingFor === "team" && (
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
          )}

          {/* Pitch Zone Selection (Team only) */}
          {recordingFor === "team" && (
            <View style={styles.zoneCard}>
              <Text style={styles.sectionLabel}>Select Pitch Zone</Text>
              <View style={styles.zoneGrid}>
                {PITCH_ZONES.map((zone) => {
                  const isSelected = selectedZone === zone.id;
                  return (
                    <TouchableOpacity
                      key={zone.id}
                      style={[
                        styles.zoneButton,
                        isSelected && styles.zoneButtonActive
                      ]}
                      onPress={() => setSelectedZone(zone.id)}
                    >
                      <Text style={[
                        styles.zoneNumber,
                        isSelected && styles.zoneNumberActive
                      ]}>
                        {zone.id}
                      </Text>
                      <Text style={[
                        styles.zoneLabel,
                        isSelected && styles.zoneLabelActive
                      ]}>
                        {zone.position}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Record Button - Prominent */}
          <TouchableOpacity 
            style={[
              styles.recordButton,
              !isReadyToRecord && styles.recordButtonDisabled
            ]} 
            onPress={submitEvent}
            disabled={!isReadyToRecord}
          >
            {selectedEventData ? (
              <View style={styles.recordButtonContent}>
                <Text style={styles.recordButtonIcon}>{selectedEventData.icon}</Text>
                <Text style={styles.recordButtonText}>
                  Record {selectedEventData.label}
                  {recordingFor === "team" && selectedPlayer && ` • ${selectedPlayer}`}
                  {recordingFor === "team" && selectedZone && ` • Zone ${selectedZone}`}
                </Text>
              </View>
            ) : (
              <Text style={styles.recordButtonText}>Select event to record</Text>
            )}
          </TouchableOpacity>

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
        {userRole && Platform.OS !== "web" && <ChatBubble userRole={userRole} />}
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
    minWidth: Platform.OS === "web" ? 150 : "45%",
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  eventIcon: {
    fontSize: 28,
  },
  eventLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
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
  recordButtonDisabled: {
    backgroundColor: "#9ca3af",
    shadowOpacity: 0,
    elevation: 0,
  },
  recordButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recordButtonIcon: {
    fontSize: 24,
  },
  recordButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
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
