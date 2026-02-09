// components/AppLayout.js - Layout wrapper with collapsible sidebar
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Platform, TouchableOpacity, Text, Animated, Dimensions } from "react-native";
import Sidebar from "./Sidebar";
import { getToken } from "../lib/auth";
import { API, ngrokHeaders } from "../lib/config";

// Detect mobile devices
const getIsMobile = () => {
  if (Platform.OS !== "web") return true;
  const { width } = Dimensions.get("window");
  return width < 768;
};

export default function AppLayout({ children, showSidebar = true }) {
  const [userRole, setUserRole] = useState("manager");
  const [isMobile, setIsMobile] = useState(getIsMobile());
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile); // Open by default on desktop, closed on mobile
  const [slideAnim] = useState(new Animated.Value(getIsMobile() ? -260 : 0));

  // Update mobile detection on dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      const mobile = Platform.OS !== "web" || window.width < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false); // Close sidebar when switching to mobile
      } else {
        setSidebarOpen(true); // Open sidebar when switching to desktop
      }
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      
            if (token) {
        try {
          const res = await fetch(`${API}/auth/me/`, {
            headers: { Authorization: `Bearer ${token}`, ...ngrokHeaders() },
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            setUserRole(data.role || "manager");
          }
        } catch (e) {
          console.log(e);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (isMobile) {
      Animated.timing(slideAnim, {
        toValue: sidebarOpen ? 0 : -260,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [sidebarOpen, isMobile]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  if (showSidebar) {
    return (
      <View style={styles.container}>
        {/* Hamburger Menu Button - Only on Mobile */}
        {isMobile && (
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={toggleSidebar}
            activeOpacity={0.7}
          >
            <View style={styles.menuIcon}>
              {!sidebarOpen ? (
                <>
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                </>
              ) : (
                <Text style={styles.closeIcon}>✕</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Overlay for Mobile */}
        {isMobile && sidebarOpen && (
          <TouchableOpacity 
            style={styles.overlay} 
            activeOpacity={1}
            onPress={closeSidebar}
          />
        )}

        {/* Sidebar */}
        <Animated.View 
          style={[
            styles.sidebarContainer,
            isMobile && {
              transform: [{ translateX: slideAnim }],
              position: "absolute",
              zIndex: 1000,
              height: "100%",
            },
            !isMobile && sidebarOpen && {
              position: "fixed",
            },
          ]}
        >
          <Sidebar userRole={userRole} onClose={isMobile ? closeSidebar : null} />
        </Animated.View>

        {/* Content */}
        <View 
          style={[
            styles.content,
            !isMobile && sidebarOpen && styles.contentWithSidebar,
          ]}
        >
          {children}
        </View>
      </View>
    );
  }

  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    width: "100%",
    height: "100%",
    ...Platform.select({
      web: {
        minHeight: "100vh",
        display: "flex",
        flexDirection: "row",
      },
    }),
  },
  menuButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 50,
    left: 16,
    zIndex: 1001,
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: "space-between",
    alignItems: "center",
  },
  menuLine: {
    width: "100%",
    height: 2,
    backgroundColor: "#1e3a8a",
    borderRadius: 1,
    marginVertical: 2,
  },
  closeIcon: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e3a8a",
    lineHeight: 20,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 999,
  },
  sidebarContainer: {
    ...Platform.select({
      web: {
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: 260,
        zIndex: 100,
      },
      default: {
        position: "absolute",
        left: 0,
        top: 0,
        height: "100%",
        width: 260,
        zIndex: 1000,
      },
    }),
  },
  content: {
    flex: 1,
    backgroundColor: "#f9fafb",
    ...Platform.select({
      web: {
        marginLeft: 0,
        overflow: "visible",
        minHeight: "100vh",
        height: "100vh",
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
      },
      default: {
        marginLeft: 0,
        height: "100%",
        width: "100%",
        // Start content below hamburger on phone (hamburger top: 50, height: 44, + gap)
        paddingTop: 104,
      },
    }),
  },
  contentWithSidebar: {
    ...Platform.select({
      web: {
        marginLeft: 260,
        width: "calc(100% - 260px)",
        flex: 1,
      },
    }),
  },
});
