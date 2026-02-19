// Top navbar for mobile – shows nav links in a horizontal strip at the top
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { getNavItems, isNavActive } from "../lib/navConfig";

const TOP_BAR_HEIGHT = 48;

export default function TopNavBar({ userRole = "manager", compact = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = getNavItems(pathname, userRole);

  const content = (
    <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => {
          const active = isNavActive(item.path, pathname);
          const label = item.shortLabel || item.label;
          return (
            <TouchableOpacity
              key={item.path}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => router.push(item.path)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
  );

  if (compact) return content;
  return <View style={styles.container}>{content}</View>;
}

export { TOP_BAR_HEIGHT };

const styles = StyleSheet.create({
  container: {
    height: TOP_BAR_HEIGHT,
    backgroundColor: "#eff6ff",
    borderBottomWidth: 3,
    borderBottomColor: "#3b82f6",
    zIndex: 100,
  },
  scrollContent: {
    paddingHorizontal: 8,
    alignItems: "center",
    minWidth: "100%",
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    marginHorizontal: 3,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: "#1e40af",
    borderBottomWidth: 0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#475569",
  },
  tabTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
