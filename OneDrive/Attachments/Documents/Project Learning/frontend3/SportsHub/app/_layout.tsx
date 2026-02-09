// app/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="home" />

      <Stack.Screen name="team/signup" />
      <Stack.Screen name="profile" />

      {/* Manager Routes */}
      <Stack.Screen name="manager/dashboard" />
      <Stack.Screen name="manager/matches" />
      <Stack.Screen name="manager/match/[id]" />
      <Stack.Screen name="manager/current-match" />
      <Stack.Screen name="manager/previous-matches" />
      <Stack.Screen name="manager/overall-stats" />
      <Stack.Screen name="manager/players" />
      <Stack.Screen name="manager/player/[id]" />
      <Stack.Screen name="manager/messages" />

      {/* Analyst Routes */}
      <Stack.Screen name="analyst/dashboard" />
      <Stack.Screen name="analyst/match/[id]" />
      <Stack.Screen name="analyst/record-events" />
      <Stack.Screen name="analyst/review-matches" />
      <Stack.Screen name="analyst/messages" />

      {/* Player Routes */}
      <Stack.Screen name="player/signup" />
      <Stack.Screen name="player/dashboard" />
      <Stack.Screen name="player/join-team" />
      <Stack.Screen name="player/stats" />
      <Stack.Screen name="player/team-stats" />

      {/* Common Routes */}
      <Stack.Screen name="messages" />
    </Stack>
  );
}
