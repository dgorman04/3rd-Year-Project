// app/index.jsx
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { setToken, clearToken } from "../lib/auth";
import { API, ngrokHeaders } from "../lib/config";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Clear any stale token when login page loads
  useEffect(() => {
    clearToken().catch(() => {
      // Ignore errors when clearing token
    });
  }, []);

  const handleLogin = async () => {
    setError("");
    
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    
    setBusy(true);
    try {
      const loginUrl = `${API}/auth/login/`;
      console.log("Attempting login to:", loginUrl);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          ...ngrokHeaders() 
        },
        body: JSON.stringify({
          username: email.toLowerCase().trim(),
          password,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      // 404 on phone usually means wrong API URL (localhost doesn't work on device)
      if (res.status === 404) {
        setError(
          "Server not found (404). On a phone you cannot use localhost.\n\n" +
          "1. In SportsHub folder, edit .env and set EXPO_PUBLIC_API_BASE to either:\n" +
          "   • Your computer's IP, e.g. http://192.168.1.x:8000 (phone and PC on same Wi‑Fi), or\n" +
          "   • Your current ngrok URL (e.g. https://xxxx.ngrok-free.app) if using ngrok.\n" +
          "2. Restart the app (stop Expo and run npx expo start again)."
        );
        return;
      }

      const rawResponse = await res.text();
      let tokens = {};
      
      try {
        tokens = JSON.parse(rawResponse);
      } catch (parseErr) {
        console.log("Failed to parse login response:", rawResponse);
        setError(`Server error: ${res.status} ${res.statusText}. Please check if the backend is running.`);
        return;
      }

      if (!res.ok || !tokens?.access) {
        const errorMsg = tokens?.detail || tokens?.message || `Login failed (${res.status}). Please check your credentials.`;
        setError(errorMsg);
        return;
      }

      // 2) Fetch /me
      const meUrl = `${API}/auth/me/`;
      console.log("Fetching user profile from:", meUrl);
      
      // Create AbortController for timeout
      const meController = new AbortController();
      const meTimeoutId = setTimeout(() => meController.abort(), 15000); // 15 second timeout
      
      const meRes = await fetch(meUrl, {
        headers: { 
          Authorization: `Bearer ${tokens.access}`, 
          ...ngrokHeaders() 
        },
        signal: meController.signal,
      });
      
      clearTimeout(meTimeoutId);

      const meRaw = await meRes.text();
      let me = {};
      
      try {
        me = JSON.parse(meRaw);
      } catch (parseErr) {
        console.log("Failed to parse /me response:", meRaw);
        setError("Could not load user profile.");
        return;
      }

      if (!meRes.ok) {
        setError(me?.detail || me?.message || "Could not load profile.");
        return;
      }

      await setToken(tokens.access);

      // ✅ 4) ALWAYS go to home page after login
      router.replace("/home");
    } catch (err) {
      console.error("Login error:", err);
      
      // More specific error messages
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        setError("Request timed out. Please check:\n1. Your internet connection\n2. The server is accessible\n3. Try again");
      } else if (err.message?.includes("Failed to fetch") || err.message?.includes("Network request failed") || err.message?.includes("NetworkError")) {
        setError(
          "Cannot connect to server.\n\n" +
          "App is using: " + API + "\n\n" +
          "On a phone, localhost does not work. In .env set EXPO_PUBLIC_API_BASE to your computer's IP (e.g. http://192.168.1.x:8000) or your ngrok URL, then restart the app."
        );
      } else if (err.message?.includes("timeout")) {
        setError("Request timed out. Please check your connection and try again.");
      } else {
        setError(`Network error: ${err.message || "Please check your connection."}`);
      }
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
        {/* Brand Section - Centered and Prominent */}
        <View style={styles.brandSection}>
          <View style={styles.brandContainer}>
            <Text style={styles.brandTitle}>STATO</Text>
            <View style={styles.brandUnderline} />
          </View>
          <Text style={styles.brandTagline}>Sports Analytics Platform</Text>
        </View>

        {/* Login Card - Centered */}
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>Login</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="Enter your email"
              style={styles.input}
              placeholderTextColor="#9ca3af"
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
              placeholder="Enter your password"
              style={styles.input}
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, busy && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.signupButton}
            onPress={() => router.push("/team/signup")}
            disabled={busy}
          >
            <Text style={styles.signupButtonText}>Create Team Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signupButton, styles.playerSignupButton]}
            onPress={() => router.push("/player/signup")}
            disabled={busy}
          >
            <Text style={[styles.signupButtonText, styles.playerSignupButtonText]}>Player Signup</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0e27", // Deep navy background
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
    marginBottom: 56,
    width: "100%",
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 64,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 8,
    textAlign: "center",
    textShadowColor: "rgba(59, 130, 246, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandUnderline: {
    width: 80,
    height: 4,
    backgroundColor: "#3b82f6",
    marginTop: 8,
    borderRadius: 2,
  },
  brandTagline: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "400",
    letterSpacing: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  loginCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 40,
    width: "100%",
    maxWidth: 440,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "400",
    marginBottom: 36,
    textAlign: "center",
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 14,
    borderRadius: 10,
    marginBottom: 28,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    padding: 16,
    borderRadius: 10,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    fontWeight: "400",
  },
  loginButton: {
    backgroundColor: "#1e40af", // Deep professional blue
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 28,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  dividerText: {
    marginHorizontal: 20,
    color: "#94a3b8",
    fontWeight: "500",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  signupButton: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    marginBottom: 14,
  },
  signupButtonText: {
    color: "#1e293b",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  playerSignupButton: {
    backgroundColor: "#059669", // Professional green
    borderColor: "#059669",
  },
  playerSignupButtonText: {
    color: "#ffffff",
  },
});
