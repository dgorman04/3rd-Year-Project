import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from "react-native";

// Try to import expo-av, but handle if it's not installed
let Video, ResizeMode;
try {
  const expoAv = require("expo-av");
  Video = expoAv.Video;
  ResizeMode = expoAv.ResizeMode;
} catch (e) {
  // expo-av not installed yet
  Video = null;
  ResizeMode = null;
}

export default function VideoPlayer({ videoUrl, onSeek, currentTime = 0 }) {
  const videoRef = useRef(null);
  const [hasExpoAv, setHasExpoAv] = useState(Video !== null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const lastSeekTime = useRef(0);

  // Handle seeking when currentTime changes
  useEffect(() => {
    if (hasExpoAv && videoRef.current && currentTime > 0 && currentTime !== lastSeekTime.current) {
      lastSeekTime.current = currentTime;
      const seekToTime = currentTime * 1000; // expo-av uses milliseconds
      
      const attemptSeek = () => {
        if (!videoRef.current) return;
        
        videoRef.current.getStatusAsync()
          .then(status => {
            if (status.isLoaded) {
              setIsReady(true);
              return videoRef.current.setPositionAsync(seekToTime);
            } else {
              // Video not loaded yet, retry after a delay
              setTimeout(attemptSeek, 300);
            }
          })
          .catch(err => {
            console.log("Error getting video status for seek:", err);
            // Try seeking anyway after a delay
            setTimeout(() => {
              videoRef.current?.setPositionAsync(seekToTime).catch(seekErr => {
                console.log("Error seeking video:", seekErr);
              });
            }, 500);
          });
      };
      
      attemptSeek();
    }
  }, [currentTime, hasExpoAv]);

  // Handle video playback status updates
  const handlePlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setIsReady(true);
      setError(null);
    } else if (status.error) {
      setError(status.error);
      console.log("Video playback error:", status.error);
    }
  };

  // Handle video load
  const handleLoad = (status) => {
    console.log("Video load status:", status);
    if (status && status.isLoaded) {
      setIsReady(true);
      setError(null);
      console.log("Video loaded successfully");
    } else if (status && status.error) {
      const errorMsg = status.error.message || status.error.localizedDescription || "Failed to load video";
      setError(errorMsg);
      setIsReady(false);
      console.log("Video load error:", status.error);
    }
  };
  
  // Test video URL accessibility on mount
  useEffect(() => {
    if (videoUrl && Platform.OS === "web") {
      // Test if video URL is accessible
      fetch(videoUrl, { method: "HEAD" })
        .then(response => {
          if (!response.ok) {
            console.log("Video URL test failed:", response.status, response.statusText);
            setError(`Video not accessible (${response.status})`);
          } else {
            console.log("Video URL is accessible");
          }
        })
        .catch(err => {
          console.log("Video URL test error:", err);
          // Don't set error here - let the video component handle it
        });
    }
  }, [videoUrl]);

  if (!videoUrl) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video available</Text>
        <Text style={styles.placeholderSubtext}>Video URL is missing</Text>
      </View>
    );
  }
  
  // Log video URL for debugging (remove in production)
  useEffect(() => {
    console.log("VideoPlayer - Video URL:", videoUrl);
    console.log("VideoPlayer - Current time:", currentTime);
    console.log("VideoPlayer - Has expo-av:", hasExpoAv);
    console.log("VideoPlayer - Is ready:", isReady);
  }, [videoUrl, currentTime, hasExpoAv, isReady]);
  
  // Validate video URL
  const isValidUrl = videoUrl && (videoUrl.startsWith("http://") || videoUrl.startsWith("https://") || videoUrl.startsWith("/"));
  
  if (!isValidUrl) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Invalid Video URL</Text>
        <Text style={styles.placeholderSubtext}>The video URL format is incorrect</Text>
        <Text style={styles.placeholderNote}>URL: {videoUrl || "undefined"}</Text>
      </View>
    );
  }

  // For web, use expo-av Video component with proper handlers
  if (Platform.OS === "web") {
    if (!hasExpoAv) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Video Player Not Available</Text>
          <Text style={styles.placeholderSubtext}>expo-av is required for video playback</Text>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL(videoUrl)}
          >
            <Text style={styles.linkButtonText}>Open Video in Browser</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View style={styles.container}>
        {error && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>Video Error</Text>
            <Text style={styles.errorSubtext}>{error}</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL(videoUrl)}
            >
              <Text style={styles.linkButtonText}>Open Video in Browser</Text>
            </TouchableOpacity>
          </View>
        )}
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={styles.video}
          useNativeControls
          resizeMode={ResizeMode?.CONTAIN || "contain"}
          shouldPlay={false}
          progressUpdateIntervalMillis={1000}
          onLoad={handleLoad}
          onLoadStart={() => {
            setIsReady(false);
            setError(null);
            console.log("Video load started");
          }}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onError={(error) => {
            console.log("Video error callback:", error);
            const errorMsg = error?.message || error?.localizedDescription || error?.toString() || "Failed to load video";
            setError(errorMsg);
            setIsReady(false);
          }}
        />
      </View>
    );
  }

  // If expo-av is not installed, show a placeholder with link to video
  if (!hasExpoAv) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Video Player</Text>
        <Text style={styles.placeholderSubtext}>Install expo-av to play videos</Text>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => Linking.openURL(videoUrl)}
        >
          <Text style={styles.linkButtonText}>Open Video in Browser</Text>
        </TouchableOpacity>
        <Text style={styles.placeholderNote}>
          Run: cd frontend3/SportsHub && npm install
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Video Error</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL(videoUrl)}
          >
            <Text style={styles.linkButtonText}>Open Video in Browser</Text>
          </TouchableOpacity>
        </View>
      )}
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        progressUpdateIntervalMillis={1000}
        onLoad={handleLoad}
        onLoadStart={() => {
          setIsReady(false);
          setError(null);
          console.log("Video load started (native)");
        }}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={(error) => {
          console.log("Video error callback (native):", error);
          const errorMsg = error?.message || error?.localizedDescription || error?.toString() || "Failed to load video";
          setError(errorMsg);
          setIsReady(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  placeholderSubtext: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  placeholderNote: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  linkButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#3b82f6",
    borderRadius: 8,
  },
  linkButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    padding: 20,
  },
  errorText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  errorSubtext: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
});
