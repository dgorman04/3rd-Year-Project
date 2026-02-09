// app/analyst/record-events.jsx - Start a new match and record events
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import AppLayout from "../../components/AppLayout";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";

function generateSeasonOptions() {
  const currentYear = new Date().getFullYear();
  const seasons = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    seasons.push(`${y}/${String(y + 1).slice(-2)}`);
  }
  return seasons;
}

export default function RecordEvents() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availableSeasons, setAvailableSeasons] = useState([]);

  const [opponent, setOpponent] = useState("");
  const [analystName, setAnalystName] = useState("");
  const [formation, setFormation] = useState("");
  const [opponentFormation, setOpponentFormation] = useState("");
  const [season, setSeason] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [busy, setBusy] = useState(false);

  const FORMATIONS = [
    { label: "Select formation...", value: "" },
    { label: "4-4-2", value: "4-4-2" },
    { label: "4-3-3", value: "4-3-3" },
    { label: "3-5-2", value: "3-5-2" },
    { label: "4-2-3-1", value: "4-2-3-1" },
    { label: "3-4-3", value: "3-4-3" },
    { label: "5-3-2", value: "5-3-2" },
    { label: "4-1-4-1", value: "4-1-4-1" },
    { label: "Other", value: "other" },
  ];

  useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
      if (!t) {
        router.replace("/");
        return;
      }
      await loadAvailableSeasons(t);
      setLoading(false);
    })();
  }, []);

  const loadAvailableSeasons = async (t) => {
    try {
      const res = await fetch(`${API}/matches/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        const matches = Array.isArray(data) ? data : [];
        // Extract unique seasons from existing matches
        const seasons = [...new Set(matches.map(m => m.season).filter(Boolean))];
        setAvailableSeasons(seasons.sort().reverse()); // Most recent first
      }
    } catch (e) {
      console.log("Error loading seasons:", e);
    }
  };

  const start = async () => {
    if (!token) return;

    const opp = opponent.trim();
    const an = analystName.trim();
    const seasonValue = season || null;

    if (!opp) return alert("Enter opponent name.");
    if (!an) return alert("Enter analyst name.");

    try {
      setBusy(true);

      const res = await fetch(`${API}/matches/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({
          opponent: opp,
          analyst_name: an,
          formation: formation || null,
          opponent_formation: opponentFormation || null,
          season: seasonValue,
          is_home: isHome,
          kickoff_at: new Date().toISOString(),
        }),
      });

      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        const errorMsg = data?.detail || data?.message || `Error ${res.status}: Could not create match.`;
        console.error("Match creation error:", errorMsg, data);
        alert(errorMsg);
        return;
      }

      router.replace(`/analyst/match/${data.id}`);
    } catch (e) {
      console.log(e);
      alert("Network error creating match.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !token) {
    return (
      <AppLayout>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading...</Text>
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
              <Text style={styles.webTitle}>Start New Match</Text>
              <Text style={styles.webSubtitle}>Set up match details and begin recording events</Text>
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 1</Text>
              </View>
              <Text style={styles.cardTitle}>Match Setup</Text>
              <Text style={styles.cardSubtitle}>
                Confirm the core match details so your live data is correctly tagged for analysis.
              </Text>
            </View>

            {/* Basic Match Info */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Match Details</Text>

              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <Text style={styles.label}>Opponent <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    value={opponent}
                    onChangeText={setOpponent}
                    placeholder="e.g. Shelbourne FC"
                    style={styles.input}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <View style={styles.formColumn}>
                  <Text style={styles.label}>Analyst Name <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    value={analystName}
                    onChangeText={setAnalystName}
                    placeholder="e.g. Darren"
                    style={styles.input}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </View>
            </View>

            {/* Season selection */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Season</Text>
              <View style={styles.formRow}>
                <View style={[styles.formColumn, styles.compactColumn]}>
                  <View style={styles.dropdownShell}>
                    <Text style={styles.dropdownLabel}>Competition Season</Text>
                    <View style={styles.dropdownWrapper}>
                      <View style={styles.pickerContainer}>
                        <Picker
                          selectedValue={season}
                          onValueChange={setSeason}
                          style={styles.picker}
                          itemStyle={styles.pickerItem}
                        >
                          <Picker.Item label="Select season..." value="" />
                          {generateSeasonOptions().map((s) => (
                            <Picker.Item key={s} label={s} value={s} />
                          ))}
                        </Picker>
                      </View>
                      <Text style={styles.dropdownChevron}>⌄</Text>
                    </View>
                  </View>
                  {availableSeasons.length > 0 && (
                    <Text style={styles.hintText}>
                      Previously recorded: {availableSeasons.slice(0, 3).join(", ")}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Venue selection */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Venue</Text>
              <View style={styles.venueRow}>
                <TouchableOpacity
                  style={[styles.venueButton, isHome && styles.venueButtonActive]}
                  onPress={() => setIsHome(true)}
                >
                  <Text style={[styles.venueButtonText, isHome && styles.venueButtonTextActive]}>
                    Home team
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.venueButton, !isHome && styles.venueButtonActive]}
                  onPress={() => setIsHome(false)}
                >
                  <Text style={[styles.venueButtonText, !isHome && styles.venueButtonTextActive]}>
                    Away team
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tactical Setup */}
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionLabel}>Tactical Setup</Text>

              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <View style={styles.dropdownShell}>
                    <Text style={styles.dropdownLabel}>Our Formation</Text>
                    <View style={styles.dropdownWrapper}>
                      <View style={styles.pickerContainer}>
                        <Picker
                          selectedValue={formation}
                          onValueChange={setFormation}
                          style={styles.picker}
                          itemStyle={styles.pickerItem}
                        >
                          {FORMATIONS.map((f) => (
                            <Picker.Item key={f.value} label={f.label} value={f.value} />
                          ))}
                        </Picker>
                      </View>
                      <Text style={styles.dropdownChevron}>⌄</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.formColumn}>
                  <View style={styles.dropdownShell}>
                    <Text style={styles.dropdownLabel}>Opponent Formation</Text>
                    <View style={styles.dropdownWrapper}>
                      <View style={styles.pickerContainer}>
                        <Picker
                          selectedValue={opponentFormation}
                          onValueChange={setOpponentFormation}
                          style={styles.picker}
                          itemStyle={styles.pickerItem}
                        >
                          {FORMATIONS.map((f) => (
                            <Picker.Item key={f.value} label={f.label} value={f.value} />
                          ))}
                        </Picker>
                      </View>
                      <Text style={styles.dropdownChevron}>⌄</Text>
                    </View>
                  </View>
                </View>
              </View>

              <Text style={styles.supportingText}>
                These shapes are used across your dashboards to compare results by system and guide tactical decisions.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, busy && styles.submitButtonDisabled]}
              disabled={busy}
              onPress={start}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Start Match & Begin Recording</Text>
              )}
            </TouchableOpacity>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  content: {
    padding: 24,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    maxWidth: Platform.OS === "web" ? 720 : "100%",
    alignSelf: Platform.OS === "web" ? "center" : "stretch",
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
    lineHeight: 20,
  },
  stepBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    marginBottom: 10,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionGroup: {
    marginBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  formRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  formColumn: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 260 : "100%",
  },
  compactColumn: {
    minWidth: Platform.OS === "web" ? 220 : "100%",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  chipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  dropdownShell: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#e5e7eb",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  dropdownWrapper: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#f9fafb",
  },
  formSection: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
    color: "#111827",
    fontWeight: "600",
    fontSize: 14,
  },
  required: {
    color: "#dc2626",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    color: "#111827",
    fontWeight: "400",
  },
  pickerContainer: {
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    overflow: "hidden",
  },
  picker: {
    backgroundColor: "transparent",
    color: "#0f172a",
    fontWeight: "400",
  },
  pickerItem: {
    backgroundColor: "#ffffff",
    color: "#111827",
  },
  dropdownChevron: {
    position: "absolute",
    right: 10,
    top: 10,
    fontSize: 14,
    color: "#475569",
    pointerEvents: "none",
  },
  hintText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
  },
  supportingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 18,
  },
  venueRow: {
    flexDirection: "row",
    gap: 12,
  },
  venueButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  venueButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  venueButtonText: {
    color: "#6b7280",
    fontWeight: "600",
    fontSize: 14,
  },
  venueButtonTextActive: {
    color: "#ffffff",
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontWeight: "600",
    fontSize: 16,
    color: "#ffffff",
  },
});
