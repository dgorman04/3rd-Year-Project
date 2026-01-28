// components/AppHeader.jsx - Clean navigation header with side-by-side buttons
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { getToken } from "../lib/auth";
import { API, ngrokHeaders } from "../lib/config";
import ProfileMenu from "./ProfileMenu";

export default function AppHeader({ subtitle, showBack = true, showHome = true, showProfile = true, rightAction }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  
  // Don't show navigation on home page or login page
  const isHomePage = pathname === "/home";
  const isLoginPage = pathname === "/";
  const shouldShowBack = showBack && !isHomePage && !isLoginPage;
  const shouldShowHome = showHome && !isHomePage && !isLoginPage;
  const shouldShowProfile = showProfile && !isLoginPage;

  useEffect(() => {
    if (shouldShowProfile) {
      (async () => {
        const token = await getToken();
        if (token) {
          try {
            const res = await fetch(`${API}/auth/me/`, {
              headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              setUser(data);
            }
          } catch (e) {
            console.log(e);
          }
        }
      })();
    }
  }, [shouldShowProfile]);

  const handleHome = () => {
    router.push("/home");
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/home");
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Left Navigation */}
      <View style={styles.leftNav}>
        {shouldShowBack && (
          <TouchableOpacity onPress={handleBack} style={styles.navButton}>
            <Text style={styles.navButtonText}>‹</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Center Title */}
      <View style={styles.center}>
        <Text style={styles.title}>SportsHub</Text>
        {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
      </View>

      {/* Right Navigation */}
      <View style={styles.rightNav}>
        {rightAction}
        {shouldShowHome && (
          <TouchableOpacity onPress={handleHome} style={styles.navButton}>
            <Text style={styles.navButtonText}>Home</Text>
          </TouchableOpacity>
        )}
        {shouldShowProfile && <ProfileMenu user={user} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftNav: {
    width: 60,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  rightNav: {
    width: 60,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
  },
  navButtonText: {
    fontSize: 18,
    fontWeight: "normal",
    color: "#333",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  sub: {
    marginTop: 2,
    color: "#666",
    fontWeight: "normal",
    fontSize: 11,
  },
});
