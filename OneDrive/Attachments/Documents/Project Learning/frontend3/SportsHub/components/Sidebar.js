// components/Sidebar.js - Modern navigation sidebar (uses shared navConfig)
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { getNavItems, isNavActive } from "../lib/navConfig";

export default function Sidebar({ userRole = "manager", onClose = null, topOffset = 0 }) {
  const router = useRouter();
  const pathname = usePathname();
  const filteredItems = getNavItems(pathname, userRole);
  const isActive = (path) => isNavActive(path, pathname);

  return (
    <View style={[styles.sidebar, topOffset > 0 && { paddingTop: topOffset }]}>
      <View style={[styles.header, topOffset > 0 && styles.headerWithOffset]}>
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
  headerWithOffset: {
    paddingTop: 20,
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
    borderLeftWidth: 3,
    borderLeftColor: "#1e40af",
    marginLeft: 9,
    paddingLeft: 17,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4b5563",
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: "#1e40af",
    fontWeight: "600",
  },
});
