import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function MatchTimer({ matchId, token, onTimeUpdate, onStateChange, onRunningChange, initialState = "not_started", initialElapsed = 0 }) {
  const [state, setState] = useState(initialState);
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning && (state === "first_half" || state === "second_half")) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, state]);

  // Notify parent of time updates (separate effect to avoid render issues)
  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(elapsed);
    }
  }, [elapsed, onTimeUpdate]);

  // Notify parent of running state changes
  useEffect(() => {
    if (onRunningChange) {
      onRunningChange(isRunning);
    }
  }, [isRunning, onRunningChange]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleAction = async (action) => {
    const { API, ngrokHeaders } = require("../lib/config");
    
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
          elapsed_seconds: elapsed,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newState = data.state || state;
        setState(newState);
        if (data.elapsed_seconds !== undefined) {
          setElapsed(data.elapsed_seconds);
        }

        let newRunning = isRunning;
        if (action === "start" || action === "resume") {
          newRunning = true;
          setIsRunning(true);
        } else if (action === "pause" || action === "finish") {
          newRunning = false;
          setIsRunning(false);
        }

        // Notify parent of state change
        if (onStateChange) {
          onStateChange(newState);
        }
        // Notify parent of running state change
        if (onRunningChange) {
          onRunningChange(newRunning);
        }
      }
    } catch (err) {
      console.error("Timer action error:", err);
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case "not_started":
        return "Not Started";
      case "first_half":
        return "1st Half";
      case "second_half":
        return "2nd Half";
      case "finished":
        return "Finished";
      default:
        return state;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.timerDisplay}>
        <Text style={styles.timeText}>{formatTime(elapsed)}</Text>
        <Text style={styles.stateText}>{getStateLabel()}</Text>
      </View>

      <View style={styles.controls}>
        {state === "not_started" && (
          <TouchableOpacity style={[styles.button, styles.startButton]} onPress={() => handleAction("start")}>
            <Text style={styles.buttonText}>Start Match</Text>
          </TouchableOpacity>
        )}

        {(state === "first_half" || state === "second_half") && (
          <>
            {isRunning ? (
              <TouchableOpacity style={[styles.button, styles.pauseButton]} onPress={() => handleAction("pause")}>
                <Text style={styles.buttonText}>Pause</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.button, styles.resumeButton]} onPress={() => handleAction("resume")}>
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {(state === "first_half" || state === "second_half") && (
          <TouchableOpacity style={[styles.button, styles.finishButton]} onPress={() => handleAction("finish")}>
            <Text style={styles.buttonText}>Finish Match</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
  },
  timerDisplay: {
    alignItems: "center",
    marginBottom: 10,
  },
  timeText: {
    fontSize: 32,
    fontWeight: "600",
    color: "#333",
    fontFamily: "monospace",
  },
  stateText: {
    fontSize: 12,
    fontWeight: "normal",
    color: "#666",
    marginTop: 4,
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "normal",
    fontSize: 12,
  },
  startButton: {
    backgroundColor: "#4a90e2",
  },
  pauseButton: {
    backgroundColor: "#4a90e2",
  },
  resumeButton: {
    backgroundColor: "#4a90e2",
  },
  finishButton: {
    backgroundColor: "#4a90e2",
  },
});
