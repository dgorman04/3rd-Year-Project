// components/Sidebar.js - Modern navigation sidebar inspired by professional sports analytics apps
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";

// Home page navigation (simplified)
const HOME_NAV_ITEMS = [
  { path: "/manager/dashboard", label: "Manager Section", roles: ["manager", "analyst"] },
  { path: "/analyst/dashboard", label: "Analyst Section", roles: ["manager", "analyst"] },
  { path: "/player/stats", label: "Personal Stats", roles: ["player"] },
  { path: "/messages", label: "Team Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

// Manager section navigation (detailed) — use /manager/messages so navbar stays manager
const MANAGER_NAV_ITEMS = [
  { path: "/manager/dashboard", label: "Manager Dashboard", roles: ["manager"] },
  { path: "/manager/current-match", label: "Live Match", roles: ["manager"] },
  { path: "/manager/players", label: "Players", roles: ["manager"] },
  { path: "/manager/matches", label: "Matches", roles: ["manager"] },
  { path: "/manager/messages", label: "Team Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

// Analyst section navigation (detailed) — use /analyst/messages so navbar stays analyst
const ANALYST_NAV_ITEMS = [
  { path: "/analyst/dashboard", label: "Analyst Dashboard", roles: ["analyst"] },
  { path: "/analyst/record-events", label: "Start New Match", roles: ["analyst"] },
  { path: "/analyst/review-matches", label: "Review Matches", roles: ["analyst"] },
  { path: "/analyst/messages", label: "Team Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

// Player section navigation — Personal Stats, Team Chat, Profile (so Team Chat visible on stats/profile too)
const PLAYER_NAV_ITEMS = [
  { path: "/player/stats", label: "Personal Stats", roles: ["player"] },
  { path: "/messages", label: "Team Chat", roles: ["player"] },
  { path: "/profile", label: "Profile", roles: ["player"] },
];

export default function Sidebar({ userRole = "manager", onClose = null }) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine which navigation set to use based on current path
  const isHomePage = pathname === "/home";
  const isManagerSection = pathname?.startsWith("/manager/");
  const isAnalystSection = pathname?.startsWith("/analyst/");
  const isPlayerSection = pathname?.startsWith("/player/");

  let navItemsToUse = HOME_NAV_ITEMS; // Default to home navigation
  let usingManagerNav = false;
  let usingAnalystNav = false;
  let usingPlayerNav = false;

  if (isManagerSection) {
    navItemsToUse = MANAGER_NAV_ITEMS;
    usingManagerNav = true;
  } else if (isAnalystSection) {
    navItemsToUse = ANALYST_NAV_ITEMS;
    usingAnalystNav = true;
  } else if (isPlayerSection) {
    navItemsToUse = PLAYER_NAV_ITEMS;
    usingPlayerNav = true;
  } else if (pathname === "/messages") {
    // Legacy /messages: show nav by user role so sidebar is consistent
    if (userRole === "manager") {
      navItemsToUse = MANAGER_NAV_ITEMS;
      usingManagerNav = true;
    } else if (userRole === "analyst") {
      navItemsToUse = ANALYST_NAV_ITEMS;
      usingAnalystNav = true;
    } else {
      navItemsToUse = HOME_NAV_ITEMS;
    }
  } else if (isHomePage) {
    navItemsToUse = HOME_NAV_ITEMS;
  }

  // Filter nav items based on role
  // For manager/analyst/player sections we always show the full section navbar,
  // regardless of underlying role, so the section feels self-contained.
  const filteredItems = navItemsToUse.filter((item) => {
    if (usingManagerNav || usingAnalystNav || usingPlayerNav) {
      return true;
    }

    if (item.roles) {
      return item.roles.includes(userRole);
    }
    // Fallback to old logic for backwards compatibility
    if (item.path.includes("/manager/") && userRole !== "manager") return false;
    if (item.path.includes("/analyst/") && userRole !== "analyst") return false;
    if (item.path.includes("/player/") && userRole !== "player") return false;
    return true;
  });

  const isActive = (path) => {
    if (path === "/home") return pathname === "/home";
    if (path === "/manager/dashboard") return pathname === "/manager/dashboard" || pathname?.startsWith("/manager/");
    if (path === "/analyst/dashboard") return pathname === "/analyst/dashboard" || pathname?.startsWith("/analyst/");
    if (path === "/analyst/record-events") return pathname === "/analyst/record-events" || pathname?.includes("/analyst/match/");
    if (path === "/analyst/review-matches") return pathname === "/analyst/review-matches";
    if (path === "/player/stats") return pathname === "/player/stats";
    if (path === "/profile") return pathname === "/profile";
    if (path === "/manager/messages") return pathname === "/manager/messages";
    if (path === "/analyst/messages") return pathname === "/analyst/messages";
    if (path === "/player/messages") return pathname === "/player/messages";
    if (path === "/messages") return pathname === "/messages" || pathname === "/player/messages";
    return pathname?.startsWith(path);
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            router.push("/home");
            if (onClose) {
              onClose(); // Close sidebar on mobile after navigation
            }
          }} 
          style={styles.logoContainer}
        >
          <Text style={styles.logo}>STATO</Text>
          <View style={styles.logoUnderline} />
        </TouchableOpacity>
      </View>
      <View style={styles.navItems}>
        {filteredItems.map((item) => {
          const active = isActive(item.path);
          return (
            <TouchableOpacity
              key={item.path}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.path)}
            >
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 260,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    height: "100%",
    ...Platform.select({
      web: {
        height: "100vh",
      },
      default: {
        height: "100%",
      },
    }),
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    padding: 24,
    paddingTop: Platform.OS === "web" ? 24 : 60,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#0a0e27",
  },
  logoContainer: {
    alignItems: "center",
    width: "100%",
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 4,
    marginBottom: 6,
  },
  logoUnderline: {
    width: 48,
    height: 3,
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  navItems: {
    paddingTop: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: "#eff6ff",
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: "#1e40af",
    fontWeight: "600",
  },
});
