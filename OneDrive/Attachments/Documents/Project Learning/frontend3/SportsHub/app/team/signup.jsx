// app/team/signup.jsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import AppHeader from "../../components/AppHeader";
import { API, ngrokHeaders } from "../../lib/config";

function parsePlayersCSV(text) {
  // Forgiving CSV parser:
  // - supports "name" header
  // - supports 1 name per line
  // - supports comma separated lines
  // - removes blanks
  const cleaned = (text || "").replace(/\r/g, "\n");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const parts = line.includes(",")
      ? line.split(",").map((p) => p.trim())
      : [line];

    for (const p of parts) {
      const name = (p || "").trim();
      if (!name) continue;

      const low = name.toLowerCase();
      if (low === "name" || low === "player" || low === "player_name") continue;

      out.push(name);
    }
  }

  // unique, preserve order
  const seen = new Set();
  return out.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function TeamSignup() {
  const router = useRouter();

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [players, setPlayers] = useState([]); // ✅ squad from CSV
  const [busy, setBusy] = useState(false);

  const pickCSV = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/plain", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled) return;

      const file = res.assets?.[0];
      console.log("PICKED FILE:", file);

      if (!file?.uri) {
        alert("No file URI returned.");
        return;
      }

      let text = "";

      // ✅ Web: blob/http URIs must be read with fetch()
      if (file.uri.startsWith("blob:") || file.uri.startsWith("http")) {
        const r = await fetch(file.uri);
        text = await r.text();
      } else {
        // ✅ Native: read with FileSystem
        text = await FileSystem.readAsStringAsync(file.uri);
      }

      const names = parsePlayersCSV(text);

      if (!names.length) {
        alert("No player names found in CSV.");
        return;
      }

      setPlayers(names);
      alert(`Loaded ${names.length} players from CSV.`);
    } catch (e) {
      console.log("CSV IMPORT ERROR:", e);
      alert(`Could not import CSV: ${e?.message || e}`);
    }
  };

  const submit = async () => {
    if (!clubName.trim() || !teamName.trim()) {
      alert("Please enter club name and team name.");
      return;
    }
    if (!email.trim() || !password.trim()) {
      alert("Please enter email and password.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        club_name: clubName.trim(),
        team_name: teamName.trim(),
        email: email.toLowerCase().trim(),
        password,
        players, // ✅ send squad list to backend
      };

      const res = await fetch(`${API}/teams/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ngrokHeaders() },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      console.log("SIGNUP:", res.status, raw);

      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        alert(data?.detail || JSON.stringify(data) || "Team signup failed.");
        return;
      }

      alert("Team created! Now log in.");
      router.replace("/");
    } catch (e) {
      console.log(e);
      alert("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Section */}
        <View style={styles.brandSection}>
          <View style={styles.brandContainer}>
            <Text style={styles.brandTitle}>STATO</Text>
            <View style={styles.brandUnderline} />
          </View>
          <Text style={styles.brandTagline}>Create Your Team Account</Text>
        </View>

        {/* Team Information Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Team Information</Text>
            <Text style={styles.cardSubtitle}>Enter your club and team details</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Club Name</Text>
            <TextInput
              style={styles.input}
              value={clubName}
              onChangeText={setClubName}
              placeholder="Dublin FC"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Team Name</Text>
            <TextInput
              style={styles.input}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="U19 First Team"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="manager@club.com"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Minimum 8 characters"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Squad Upload Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Player Roster</Text>
            <Text style={styles.cardSubtitle}>Import your squad from a CSV file</Text>
          </View>

          <TouchableOpacity style={styles.uploadButton} onPress={pickCSV} disabled={busy}>
            <View style={styles.uploadIconContainer}>
              <Text style={styles.uploadIcon}>+</Text>
            </View>
            <Text style={styles.uploadButtonText}>Choose CSV File</Text>
            <Text style={styles.uploadButtonHint}>CSV format with one player name per line</Text>
          </TouchableOpacity>

          {!!players.length && (
            <View style={styles.playersLoadedContainer}>
              <View style={styles.playersLoadedHeader}>
                <Text style={styles.playersLoadedCount}>{players.length} players imported</Text>
                <TouchableOpacity onPress={() => setPlayers([])} style={styles.clearButtonContainer}>
                  <Text style={styles.clearButton}>Remove</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.playersPreview}>
                <Text style={styles.playersPreviewText}>
                  {players.slice(0, 4).join(", ")}
                  {players.length > 4 ? `, and ${players.length - 4} more` : ""}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Action Card */}
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.createButton, busy && styles.createButtonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            <Text style={styles.createButtonText}>
              {busy ? "Creating Team..." : "Create Team Account"}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => router.replace("/")}
            style={styles.linkContainer}
          >
            <Text style={styles.link}>Already have a team? Sign in</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0e27",
  },
  content: { 
    padding: 24, 
    paddingTop: 60,
    gap: 24,
  },
  brandSection: {
    alignItems: "center",
    marginBottom: 40,
    width: "100%",
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 52,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 5,
    textAlign: "center",
  },
  brandUnderline: {
    width: 56,
    height: 3,
    backgroundColor: "#3b82f6",
    marginTop: 8,
    borderRadius: 2,
  },
  brandTagline: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
    letterSpacing: 1.2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 0.5,
    borderColor: "#e5e7eb",
  },
  cardHeader: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "400",
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 15,
    color: "#111827",
    fontWeight: "400",
  },
  uploadButton: {
    backgroundColor: "#f9fafb",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderStyle: "dashed",
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  uploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  uploadIcon: {
    fontSize: 24,
    color: "#3b82f6",
    fontWeight: "300",
  },
  uploadButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 6,
  },
  uploadButtonHint: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "400",
  },
  playersLoadedContainer: {
    marginTop: 18,
    padding: 14,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  playersLoadedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  playersLoadedCount: {
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  clearButtonContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButton: {
    fontSize: 12,
    fontWeight: "500",
    color: "#dc2626",
  },
  playersPreview: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  playersPreviewText: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "400",
    lineHeight: 18,
  },
  createButton: {
    backgroundColor: "#1e40af",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  linkContainer: {
    marginTop: 18,
    alignItems: "center",
  },
  link: { 
    textAlign: "center", 
    color: "#3b82f6", 
    fontWeight: "500",
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
