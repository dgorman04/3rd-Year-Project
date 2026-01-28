// components/KPICard.js - Modern KPI card component with trend indicators
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function KPICard({ 
  title, 
  value, 
  trend, 
  trendLabel, 
  icon, 
  iconColor = "#2563eb",
  valueColor = "#111827" 
}) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        {trend !== null && trend !== undefined && (
          <View style={[styles.trend, isPositive && styles.trendPositive, isNegative && styles.trendNegative]}>
            <Text style={[styles.trendText, isPositive && styles.trendTextPositive, isNegative && styles.trendTextNegative]}>
              {isPositive ? "+" : ""}{trend}{trendLabel || "%"}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flex: 1,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 24,
  },
  trend: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  trendPositive: {
    backgroundColor: "#d1fae5",
  },
  trendNegative: {
    backgroundColor: "#fee2e2",
  },
  trendText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  trendTextPositive: {
    color: "#059669",
  },
  trendTextNegative: {
    color: "#dc2626",
  },
  value: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
});
