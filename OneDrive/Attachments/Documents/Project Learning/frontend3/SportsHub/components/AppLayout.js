// components/AppLayout.js - Layout wrapper with collapsible sidebar + top navbar on mobile
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Platform, TouchableOpacity, Text, Animated, Dimensions, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import Sidebar from "./Sidebar";
import TopNavBar, { TOP_BAR_HEIGHT } from "./TopNavBar";
import { getToken } from "../lib/auth";
import { API, ngrokHeaders } from "../lib/config";

// Detect mobile devices
const getIsMobile = () => {
  if (Platform.OS !== "web") return true;
  const { width } = Dimensions.get("window");
  return width < 768;
};

// Extra top padding on phone so navbar sits below status bar (not flush with top)
const TOP_INSET = Platform.select({
  web: 0,
  ios: 44,
  default: StatusBar?.currentHeight ?? 28,
});

export default function AppLayout({ children, showSidebar = true }) {
  const router = useRouter();
  const [userRole, setUserRole] = useState("manager");
  const [isMobile, setIsMobile] = useState(getIsMobile()); // Open by default on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
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
        {/* Top bar on mobile: hamburger + nav tabs */}
        {isMobile && (
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.menuButtonTop}
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
            {sidebarOpen ? (
              <TouchableOpacity
                style={styles.homeButtonTop}
                onPress={() => {
                  router.push("/home");
                  closeSidebar();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.homeButtonText}>STATO · Home</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.topNavWrap}>
                <TopNavBar userRole={userRole} compact />
              </View>
            )}
          </View>
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
          <Sidebar
            userRole={userRole}
            onClose={isMobile ? closeSidebar : null}
            topOffset={isMobile ? TOP_BAR_HEIGHT + TOP_INSET : 0}
          />
        </Animated.View>

        {/* Content */}
        <View
          style={[
            styles.content,
            !isMobile && sidebarOpen && styles.contentWithSidebar,
            isMobile && styles.contentWithTopBar,
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    height: TOP_BAR_HEIGHT + TOP_INSET,
    paddingTop: TOP_INSET,
    backgroundColor: "#eff6ff",
    borderBottomWidth: 3,
    borderBottomColor: "#3b82f6",
    paddingLeft: 4,
    zIndex: 1001,
  },
  menuButtonTop: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 22,
    marginRight: 4,
  },
  homeButtonTop: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e40af",
    letterSpacing: 0.5,
  },
  topNavWrap: {
    flex: 1,
    marginLeft: 4,
    minWidth: 0,
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
    backgroundColor: "#f8fafc",
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
        paddingTop: 0,
      },
    }),
  },
  contentWithTopBar: {
    paddingTop: TOP_BAR_HEIGHT + TOP_INSET,
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
