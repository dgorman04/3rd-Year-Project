// app/analyst/dashboard.jsx - Professional analyst navigation dashboard
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { router } from "expo-router";
import AppHeader from "../../components/AppHeader";
import AppLayout from "../../components/AppLayout";

export default function AnalystDashboard() {
  return (
    <AppLayout>
      <View style={styles.screen}>
        {Platform.OS !== "web" && <AppHeader subtitle="Analyst Dashboard" />}
        
        {Platform.OS === "web" && (
          <View style={styles.webHeader}>
            <View>
              <Text style={styles.webTitle}>Analyst Dashboard</Text>
              <Text style={styles.webSubtitle}>Record match events and analyze performance</Text>
            </View>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content}>
          {/* Welcome Section */}
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>Welcome to Analyst Station</Text>
            <Text style={styles.welcomeText}>
              Record live match events, track player performance, and generate insights in real-time.
            </Text>
          </View>

          {/* Action Cards */}
          <View style={styles.cardsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push("/analyst/record-events")}
            >
              <View style={styles.cardIconContainer}>
                <Text style={styles.cardIcon}>⚽</Text>
              </View>
              <Text style={styles.cardTitle}>Start New Match</Text>
              <Text style={styles.cardDescription}>
                Begin recording events for a new match. Set up opponent, formation, and season details.
              </Text>
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>New Match</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push("/analyst/review-matches")}
            >
              <View style={styles.cardIconContainer}>
                <Text style={styles.cardIcon}>📊</Text>
              </View>
              <Text style={styles.cardTitle}>Review Matches</Text>
              <Text style={styles.cardDescription}>
                View and analyze previous matches. Review statistics, formations, and performance data.
              </Text>
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>History</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Features Section */}
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Analyst Features</Text>
            <View style={styles.quickStatsGrid}>
              <View style={styles.quickStatCard}>
                <Text style={styles.quickStatValue}>⚡</Text>
                <Text style={styles.quickStatLabel}>Live Recording</Text>
                <Text style={styles.quickStatDesc}>Record events in real-time during matches with precise timestamps and zone tracking</Text>
              </View>
              <View style={styles.quickStatCard}>
                <Text style={styles.quickStatValue}>🎯</Text>
                <Text style={styles.quickStatLabel}>Zone Analysis</Text>
                <Text style={styles.quickStatDesc}>Map events to specific pitch zones for tactical analysis and heat map visualization</Text>
              </View>
              <View style={styles.quickStatCard}>
                <Text style={styles.quickStatValue}>📈</Text>
                <Text style={styles.quickStatLabel}>Performance Insights</Text>
                <Text style={styles.quickStatDesc}>Receive AI-powered tactical suggestions based on live match data and patterns</Text>
              </View>
              <View style={styles.quickStatCard}>
                <Text style={styles.quickStatValue}>👥</Text>
                <Text style={styles.quickStatLabel}>Player Tracking</Text>
                <Text style={styles.quickStatDesc}>Track individual player statistics including shots, passes, tackles, and more</Text>
              </View>
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
  content: {
    padding: 24,
    gap: 24,
  },
  welcomeCard: {
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
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#6b7280",
    lineHeight: 22,
  },
  cardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    ...Platform.select({
      web: {
        display: "flex",
        flexWrap: "wrap",
      },
    }),
  },
  actionCard: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 300 : "100%",
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
    position: "relative",
    overflow: "hidden",
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 32,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  cardBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  statsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  quickStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    ...Platform.select({
      web: {
        display: "flex",
        flexWrap: "wrap",
      },
    }),
  },
  quickStatCard: {
    flex: 1,
    minWidth: Platform.OS === "web" ? 200 : "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickStatValue: {
    fontSize: 32,
    marginBottom: 8,
  },
  quickStatLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
    textAlign: "center",
  },
  quickStatDesc: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6b7280",
    textAlign: "center",
  },
});
