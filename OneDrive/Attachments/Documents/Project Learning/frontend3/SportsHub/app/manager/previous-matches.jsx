// app/manager/previous-matches.jsx - View previous match statistics
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
import { API, ngrokHeaders } from "../../lib/config";
import { getToken, clearToken } from "../../lib/auth";

export default function PreviousMatches() {
  const [token, setToken] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      setToken(t);
      await loadMatches(t);
    })();
  }, []);

  const loadMatches = async (t) => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/matches/`, {
        headers: { Authorization: `Bearer ${t}`, ...ngrokHeaders() },
      });

      const raw = await res.text();
      let data = [];
      try {
        data = JSON.parse(raw);
      } catch {}

      if (!res.ok) {
        if (res.status === 401) {
          await clearToken();
          router.replace("/");
          return;
        }
        alert(data?.detail || "Failed to load matches.");
        return;
      }

      // Filter finished matches
      const finished = (Array.isArray(data) ? data : []).filter(
        (m) => m.state === "finished"
      );
      setMatches(finished);
    } catch (e) {
      console.log(e);
      alert("Network error loading matches.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {Platform.OS === "web" && <AppHeader subtitle="Previous Matches" />}
        <View style={styles.loadingContainer}>
          <Text>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === "web" && <AppHeader subtitle="Previous Matches" />}
      <ScrollView contentContainerStyle={styles.content}>
        {matches.length === 0 ? (
          <View style={styles.empty}>
            <Text>No previous matches</Text>
          </View>
        ) : (
          matches.map((match) => (
            <TouchableOpacity
              key={match.id}
              style={styles.item}
              onPress={() => router.push(`/manager/match/${match.id}`)}
            >
              <Text style={styles.title}>vs {match.opponent}</Text>
              <Text style={styles.meta}>
                {match.kickoff_at
                  ? new Date(match.kickoff_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "No date"}
              </Text>
              {match.formation && (
                <Text style={styles.meta}>Formation: {match.formation}</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  content: {
    padding: 12,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  title: {
    fontSize: 14,
    color: "#000",
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  empty: {
    padding: 16,
  },
});
