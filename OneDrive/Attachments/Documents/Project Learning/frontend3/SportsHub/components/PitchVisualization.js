// components/PitchVisualization.js - Soccer pitch visualization for heat maps and event plotting
import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, { Rect, Circle, Line, Path, Text } from "react-native-svg";

const { width: screenWidth } = Dimensions.get("window");

export default function PitchVisualization({ 
  width = screenWidth - 100, 
  height = 600,
  events = [],
  heatMapData = null,
  onZoneClick = null,
  selectedZone = null,
}) {
  const pitchWidth = width;
  const pitchHeight = height;
  const centerX = pitchWidth / 2;
  const centerY = pitchHeight / 2;

  // Define pitch zones (6 zones as per requirements)
  // Zone mapping matches analyst recording interface:
  // Zone 1=Defensive Left, 2=Defensive Center, 3=Defensive Right (BOTTOM - our goal)
  // Zone 4=Attacking Left, 5=Attacking Center, 6=Attacking Right (TOP - opponent's goal)
  const zones = [
    { id: "defensive_left", zoneNum: 1, x: 0, y: pitchHeight / 2, width: pitchWidth / 3, height: pitchHeight / 2, label: "DL" },
    { id: "defensive_center", zoneNum: 2, x: pitchWidth / 3, y: pitchHeight / 2, width: pitchWidth / 3, height: pitchHeight / 2, label: "DC" },
    { id: "defensive_right", zoneNum: 3, x: (pitchWidth * 2) / 3, y: pitchHeight / 2, width: pitchWidth / 3, height: pitchHeight / 2, label: "DR" },
    { id: "attacking_left", zoneNum: 4, x: 0, y: 0, width: pitchWidth / 3, height: pitchHeight / 2, label: "AL" },
    { id: "attacking_center", zoneNum: 5, x: pitchWidth / 3, y: 0, width: pitchWidth / 3, height: pitchHeight / 2, label: "AC" },
    { id: "attacking_right", zoneNum: 6, x: (pitchWidth * 2) / 3, y: 0, width: pitchWidth / 3, height: pitchHeight / 2, label: "AR" },
  ];

  // Calculate heat map colors based on event density
  const getHeatColor = (zoneId) => {
    if (!heatMapData) return "#10b981"; // Default green
    const count = heatMapData[zoneId] || 0;
    const maxCount = Math.max(...Object.values(heatMapData || {}), 1);
    const intensity = count / maxCount;
    
    // Color gradient from light green to dark red
    if (intensity < 0.2) return "#d1fae5";
    if (intensity < 0.4) return "#86efac";
    if (intensity < 0.6) return "#10b981";
    if (intensity < 0.8) return "#f59e0b";
    return "#dc2626";
  };

  return (
    <View style={styles.container}>
      <Svg width={pitchWidth} height={pitchHeight} viewBox={`0 0 ${pitchWidth} ${pitchHeight}`}>
        {/* Pitch background */}
        <Rect
          x="0"
          y="0"
          width={pitchWidth}
          height={pitchHeight}
          fill="#10b981"
          stroke="#ffffff"
          strokeWidth="2"
        />

        {/* Draw zones with heat map colors */}
        {zones.map((zone) => (
          <React.Fragment key={zone.id}>
            <Rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              fill={getHeatColor(zone.id)}
              fillOpacity={0.6}
              stroke={selectedZone === zone.id ? "#2563eb" : "#000000"}
              strokeWidth={selectedZone === zone.id ? 3 : 2}
              onPress={() => onZoneClick && onZoneClick(zone.id)}
            />
            {/* Zone number label with background circle for visibility */}
            <Circle
              cx={zone.x + zone.width / 2}
              cy={zone.y + zone.height / 2}
              r={Math.min(zone.width, zone.height) * 0.12}
              fill="#000000"
              fillOpacity={0.6}
            />
            <Text
              x={zone.x + zone.width / 2}
              y={zone.y + zone.height / 2}
              fontSize={Math.min(zone.width, zone.height) * 0.18}
              fontWeight="900"
              fill="#ffffff"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {zone.zoneNum}
            </Text>
          </React.Fragment>
        ))}

        {/* Center line */}
        <Line
          x1={0}
          y1={centerY}
          x2={pitchWidth}
          y2={centerY}
          stroke="#ffffff"
          strokeWidth="2"
        />

        {/* Center circle */}
        <Circle
          cx={centerX}
          cy={centerY}
          r={pitchHeight * 0.15}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
        />

        {/* Penalty boxes */}
        <Rect
          x={0}
          y={pitchHeight * 0.2}
          width={pitchWidth * 0.2}
          height={pitchHeight * 0.6}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
        />
        <Rect
          x={pitchWidth * 0.8}
          y={pitchHeight * 0.2}
          width={pitchWidth * 0.2}
          height={pitchHeight * 0.6}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
        />

        {/* Goals */}
        <Rect
          x={-pitchWidth * 0.05}
          y={pitchHeight * 0.35}
          width={pitchWidth * 0.05}
          height={pitchHeight * 0.3}
          fill="#ffffff"
        />
        <Rect
          x={pitchWidth}
          y={pitchHeight * 0.35}
          width={pitchWidth * 0.05}
          height={pitchHeight * 0.3}
          fill="#ffffff"
        />

        {/* Plot events */}
        {events.map((event, index) => {
          const zone = zones.find((z) => z.id === event.zone);
          if (!zone) return null;
          
          const x = zone.x + zone.width / 2 + (Math.random() - 0.5) * zone.width * 0.6;
          const y = zone.y + zone.height / 2 + (Math.random() - 0.5) * zone.height * 0.6;
          
          const eventColors = {
            pass: "#3b82f6",
            shot: "#ef4444",
            tackle: "#f59e0b",
            dribble: "#8b5cf6",
            cross: "#ec4899",
            interception: "#10b981",
            clearance: "#6366f1",
            foul: "#dc2626",
          };

          return (
            <Circle
              key={index}
              cx={x}
              cy={y}
              r={6}
              fill={eventColors[event.type] || "#6b7280"}
              opacity={0.8}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
  },
});
