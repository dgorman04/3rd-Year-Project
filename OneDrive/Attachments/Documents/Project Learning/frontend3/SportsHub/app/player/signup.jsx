// app/player/signup.jsx - Player signup page
import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { setToken } from "../../lib/auth";
import { API, ngrokHeaders } from "../../lib/config";
import AppHeader from "../../components/AppHeader";

export default function PlayerSignup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/players/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ngrokHeaders() },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
          player_name: playerName.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || "Signup failed. Please check your information.");
        return;
      }

      // Auto-login after signup
      const loginRes = await fetch(`${API}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ngrokHeaders() },
        body: JSON.stringify({
          username: email.toLowerCase().trim(),
          password,
        }),
      });

      const tokens = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && tokens?.access) {
        await setToken(tokens.access);
        router.replace("/home");
      } else {
        router.replace("/");
      }
    } catch (err) {
      console.log(err);
      setError("Network error. Please check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Section */}
        <View style={styles.brandSection}>
          <View style={styles.brandContainer}>
            <Text style={styles.brandTitle}>STATO</Text>
            <View style={styles.brandUnderline} />
          </View>
          <Text style={styles.brandTagline}>Create Your Player Account</Text>
        </View>

        {/* Signup Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleContainer}>
              <Text style={styles.cardTitle}>Player Information</Text>
              <View style={styles.cardTitleUnderline} />
            </View>
            <Text style={styles.cardSubtitle}>Enter your details to get started</Text>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              placeholder="your.email@example.com"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={email}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              editable={!busy}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="Minimum 8 characters"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              placeholder="John Smith"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={playerName}
              onChangeText={setPlayerName}
              editable={!busy}
            />
          </View>

          <TouchableOpacity
            style={[styles.signupButton, busy && styles.signupButtonDisabled]}
            onPress={handleSignup}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.signupButtonText}>Create Player Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/")}
            disabled={busy}
          >
            <Text style={styles.loginButtonText}>Already have an account? Sign in</Text>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
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
    width: "100%",
    maxWidth: 440,
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
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    alignItems: "center",
  },
  cardTitleContainer: {
    alignItems: "center",
    marginBottom: 8,
    width: "100%",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  cardTitleUnderline: {
    width: 48,
    height: 2,
    backgroundColor: "#3b82f6",
    marginTop: 6,
    borderRadius: 1,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "400",
    lineHeight: 18,
    textAlign: "center",
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 14,
    borderRadius: 10,
    marginBottom: 24,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textAlign: "center",
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
  helperText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
    fontWeight: "400",
  },
  signupButton: {
    backgroundColor: "#059669",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signupButtonDisabled: {
    opacity: 0.5,
  },
  signupButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  dividerText: {
    marginHorizontal: 20,
    color: "#94a3b8",
    fontWeight: "500",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  loginButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  loginButtonText: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
