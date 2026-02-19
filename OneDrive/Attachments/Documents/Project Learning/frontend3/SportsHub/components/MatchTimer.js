import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

/**
 * Controlled timer: parent owns elapsedSeconds and stateValue.
 * Even if this component remounts, it receives the correct values from parent – no reset to 0.
 */
export default function MatchTimer({
  matchId,
  token,
  onTimeUpdate,
  onStateChange,
  onRunningChange,
  elapsedSeconds = 0,
  stateValue = "not_started",
}) {
  const [isRunning, setIsRunning] = useState(stateValue === "first_half" || stateValue === "second_half");
  const intervalRef = useRef(null);
  // High-water mark: never decrease. Survives stale props so pause never sends/displays 0.
  const elapsedHighWaterRef = useRef(0);

  const propElapsed = typeof elapsedSeconds === "number" ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  if (propElapsed > elapsedHighWaterRef.current) {
    elapsedHighWaterRef.current = propElapsed;
  }

  useEffect(() => {
    setIsRunning(stateValue === "first_half" || stateValue === "second_half");
  }, [stateValue]);

  // When running: tick every second by updating parent (parent owns the value)
  useEffect(() => {
    if (!isRunning || (stateValue !== "first_half" && stateValue !== "second_half")) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      onTimeUpdate?.((prev) => (typeof prev === "number" ? prev + 1 : prev));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, stateValue, onTimeUpdate]);

  useEffect(() => {
    if (onRunningChange) onRunningChange(isRunning);
  }, [isRunning, onRunningChange]);

  const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds)));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleAction = async (action) => {
    const { API, ngrokHeaders } = require("../lib/config");
    // Use high-water mark so we never send or display 0 when we've already counted higher
    const currentElapsed = Math.max(elapsedHighWaterRef.current, propElapsed, 0);
    elapsedHighWaterRef.current = currentElapsed;
    // Update parent immediately so UI never flashes 0 (before any async)
    onTimeUpdate?.(currentElapsed);
    try {
      const res = await fetch(`${API}/matches/${matchId}/timer/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...ngrokHeaders(),
        },
        body: JSON.stringify({
          action,
          elapsed_seconds: currentElapsed,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let newState = data.state ?? stateValue;
        if (action === "pause") newState = "paused";
        if (action === "resume" || action === "start") newState = (newState === "first_half" || newState === "second_half") ? newState : "first_half";
        if (action === "finish") newState = "finished";
        onStateChange?.(newState);
        if (action === "start" || action === "resume") setIsRunning(true);
        else if (action === "pause" || action === "finish") setIsRunning(false);
        if (onRunningChange) onRunningChange(action === "start" || action === "resume");
      }
    } catch (err) {
      console.error("Timer action error:", err);
    }
  };

  const getStateLabel = () => {
    switch (stateValue) {
      case "not_started":
        return "Not Started";
      case "first_half":
        return "1st Half";
      case "second_half":
        return "2nd Half";
      case "in_progress":
        return "Live";
      case "paused":
        return "Paused";
      case "finished":
        return "Finished";
      default:
        return stateValue;
    }
  };

  const displayElapsed = Math.max(propElapsed, elapsedHighWaterRef.current, 0);

  return (
    <View style={styles.container}>
      <View style={styles.timerDisplay}>
        <Text style={styles.timeText}>{formatTime(displayElapsed)}</Text>
        <Text style={styles.stateText}>{getStateLabel()}</Text>
      </View>

      <View style={styles.controls}>
        {stateValue === "not_started" && (
          <TouchableOpacity style={[styles.button, styles.startButton]} onPress={() => handleAction("start")}>
            <Text style={styles.buttonText}>Start Match</Text>
          </TouchableOpacity>
        )}

        {(stateValue === "first_half" || stateValue === "second_half" || stateValue === "paused") && (
          <>
            {stateValue === "paused" ? (
              <TouchableOpacity style={[styles.button, styles.resumeButton]} onPress={() => handleAction("resume")}>
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
            ) : isRunning ? (
              <TouchableOpacity style={[styles.button, styles.pauseButton]} onPress={() => handleAction("pause")}>
                <Text style={styles.buttonText}>Pause</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.button, styles.resumeButton]} onPress={() => handleAction("resume")}>
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, styles.finishButton]} onPress={() => handleAction("finish")}>
              <Text style={styles.buttonText}>Finish Match</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderTopWidth: 3,
    borderTopColor: "#1e40af",
  },
  timerDisplay: {
    alignItems: "center",
    marginBottom: 14,
  },
  timeText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  stateText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 88,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },
  startButton: {
    backgroundColor: "#1e40af",
  },
  pauseButton: {
    backgroundColor: "#1e40af",
  },
  resumeButton: {
    backgroundColor: "#059669",
  },
  finishButton: {
    backgroundColor: "#4b5563",
  },
});
