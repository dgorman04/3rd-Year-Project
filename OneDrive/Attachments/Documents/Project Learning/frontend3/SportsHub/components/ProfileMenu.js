// components/ProfileMenu.js - Profile icon with dropdown menu
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { useRouter } from "expo-router";
import { clearToken } from "../lib/auth";

export default function ProfileMenu({ user }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const handleLogout = async () => {
    await clearToken();
    router.replace("/");
  };

  const handleViewProfile = () => {
    setVisible(false);
    router.push("/profile");
  };

  return (
    <>
      <TouchableOpacity
        style={styles.profileIcon}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.profileIconText}>👤</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Profile</Text>
              <Text style={styles.menuSubtitle}>{user?.email || "User"}</Text>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleViewProfile}
            >
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={handleLogout}
            >
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuClose}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
  },
  profileIconText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 16,
    width: "80%",
    maxWidth: 280,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  menuHeader: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    marginBottom: 10,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: "#f5f5f5",
  },
  menuItemDanger: {
    backgroundColor: "#ffe0e0",
    marginTop: 6,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "normal",
    color: "#333",
  },
  menuItemTextDanger: {
    color: "#c00",
  },
  menuClose: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  menuCloseText: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
  },
});
