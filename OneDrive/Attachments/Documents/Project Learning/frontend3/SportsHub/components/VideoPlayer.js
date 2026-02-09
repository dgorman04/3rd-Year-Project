import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from "react-native";

let Video, ResizeMode;
try {
  const expoAv = require("expo-av");
  Video = expoAv.Video;
  ResizeMode = expoAv.ResizeMode;
} catch {
  Video = null;
  ResizeMode = null;
}

const VideoPlayer = forwardRef(function VideoPlayer({ videoUrl, onSeek, currentTime }, ref) {
  const videoRef = useRef(null);
  const webVideoRef = useRef(null);
  const webContainerRef = useRef(null);
  const durationRef = useRef(0);
  const isSeekingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const desiredTimeRef = useRef(null);

  const isWeb = Platform.OS === "web" || (typeof window !== "undefined" && typeof document !== "undefined");
  const hasExpoAv = !!Video;

  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  /* ---------- NATIVE STATUS ---------- */
  const onStatus = (status) => {
    if (!status?.isLoaded) return;
    if (isSeekingRef.current) return;
    wasPlayingRef.current = !!status.isPlaying;
    const pos = (status.positionMillis || 0) / 1000;
    const dur = (status.durationMillis ?? 0) / 1000;
    durationRef.current = dur;
    setDuration(dur);
    setPosition(pos);
  };

  /* ---------- SEEK ---------- */
  const seekTo = async (seconds) => {
    if (seconds == null) return;
    onSeek?.(seconds);

    if (isWeb) {
      const d = durationRef.current || duration;
      const clamped = d ? Math.max(0, Math.min(seconds, d)) : Math.max(0, seconds);
      desiredTimeRef.current = clamped;
      setPosition(clamped);
      if (webVideoRef.current) {
        webVideoRef.current.currentTime = clamped;
      }
      return;
    }

    if (!videoRef.current) return;
    const dur = durationRef.current || 0;
    const clamped = dur ? Math.max(0, Math.min(seconds, dur)) : Math.max(0, seconds);
    const wasPlaying = wasPlayingRef.current;
    isSeekingRef.current = true;
    setPosition(clamped);
    try {
      await videoRef.current.pauseAsync();
      await new Promise((r) => setTimeout(r, 80));
      await videoRef.current.setPositionAsync(clamped * 1000, {
        toleranceMillisBefore: 0,
        toleranceMillisAfter: 0,
      });
      if (wasPlaying) {
        await videoRef.current.playAsync();
      }
    } catch (_) {
      try {
        await videoRef.current?.setPositionAsync(clamped * 1000);
        if (wasPlaying) await videoRef.current?.playAsync();
      } catch (_) {}
    }
    setTimeout(() => { isSeekingRef.current = false; }, 300);
  };

  useImperativeHandle(ref, () => ({ seekTo }), []);

  /* ---------- SYNC EXTERNAL currentTime (timeline click) ---------- */
  useEffect(() => {
    if (currentTime == null) return;
    seekTo(currentTime);
  }, [currentTime]);

  /* ---------- NATIVE BAR ---------- */
  const onBarPress = (e) => {
    if (!barWidth || !durationRef.current) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
    seekTo(ratio * durationRef.current);
  };

  /* ---------- WEB: inject <video> + progress bar (no expo-av on web) ---------- */
  useEffect(() => {
    if (!isWeb || !videoUrl) return;
    const container = webContainerRef.current;
    if (!container) return;
    const getDom = (n) => {
      if (!n) return null;
      if (typeof n.appendChild === "function") return n;
      try {
        const r = require("react-dom");
        const d = r.findDOMNode ? r.findDOMNode(n) : null;
        return d && typeof d.appendChild === "function" ? d : null;
      } catch (_) {
        return null;
      }
    };
    const dom = getDom(container);
    if (!dom) return;

    const video = document.createElement("video");
    video.src = videoUrl;
    video.controls = false;
    video.preload = "auto";
    video.playsInline = true;
    video.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        durationRef.current = video.duration;
        setDuration(video.duration);
      }
      setError(null);
      const seekSec = desiredTimeRef.current;
      if (seekSec != null && Number.isFinite(seekSec) && seekSec > 0) {
        video.currentTime = Math.min(seekSec, video.duration || seekSec);
        setPosition(video.currentTime);
      }
    };
    video.ontimeupdate = () => setPosition(video.currentTime);
    video.onerror = () => {
      const code = video.error?.code;
      const msg = video.error?.message || "Failed to load video";
      if (__DEV__ && video.error) console.warn("Video load error", code, msg, videoUrl);
      setError(msg);
    };

    const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec < 10 ? "0" : ""}${sec}`;
    };
    const controlsBar = document.createElement("div");
    controlsBar.style.cssText = "position:absolute;left:0;right:0;bottom:18px;height:36px;display:flex;align-items:center;padding:0 10px;background:linear-gradient(transparent,rgba(0,0,0,0.7));z-index:4;pointer-events:none";
    const timeSpan = document.createElement("span");
    timeSpan.style.cssText = "color:#fff;font-size:13px;font-family:system-ui,sans-serif";
    timeSpan.textContent = "0:00 / 0:00";
    controlsBar.appendChild(timeSpan);
    const playBtn = document.createElement("button");
    playBtn.setAttribute("type", "button");
    playBtn.setAttribute("aria-label", "Play");
    playBtn.style.cssText = "position:absolute;left:8px;bottom:18px;width:40px;height:36px;border:0;background:rgba(0,0,0,0.5);color:#fff;font-size:18px;border-radius:6px;cursor:pointer;z-index:6;display:flex;align-items:center;justify-content:center";
    playBtn.textContent = "▶";
    playBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    };
    const updatePlayBtn = () => {
      playBtn.textContent = video.paused ? "▶" : "❚❚";
      playBtn.setAttribute("aria-label", video.paused ? "Play" : "Pause");
    };
    video.onplay = updatePlayBtn;
    video.onpause = updatePlayBtn;

    const track = document.createElement("div");
    track.setAttribute("role", "slider");
    track.setAttribute("aria-label", "Video progress");
    track.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:14px;background:rgba(255,255,255,0.3);cursor:pointer;z-index:5";
    const fill = document.createElement("div");
    fill.style.cssText = "height:100%;background:#3b82f6";
    track.appendChild(fill);
    let seeking = false;
    const updateFill = () => {
      if (seeking) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        const pct = (video.currentTime / video.duration) * 100;
        fill.style.width = `${pct}%`;
        setPosition(video.currentTime);
      }
    };
    const updateTimeDisplay = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      timeSpan.textContent = `${formatTime(video.currentTime)} / ${formatTime(d)}`;
    };
    track.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = track.getBoundingClientRect();
      const w = rect.width;
      if (!w || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / w));
      const sec = ratio * video.duration;
      desiredTimeRef.current = sec;
      seeking = true;
      fill.style.width = `${ratio * 100}%`;
      setPosition(sec);
      const wasPaused = video.paused;
      video.pause();
      video.currentTime = sec;
      video.onseeked = () => {
        seeking = false;
        updateFill();
        updateTimeDisplay();
        video.onseeked = null;
      };
      if (!wasPaused) {
        video.play().catch(() => {});
      }
      updateTimeDisplay();
      setTimeout(() => {
        if (seeking) {
          seeking = false;
          updateFill();
          updateTimeDisplay();
        }
      }, 1500);
    };

    dom.appendChild(video);
    dom.appendChild(controlsBar);
    dom.appendChild(playBtn);
    dom.appendChild(track);
    webVideoRef.current = video;
    const onTimeUpdate = () => {
      updateFill();
      updateTimeDisplay();
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onTimeUpdate);
      if (dom.contains(video)) dom.removeChild(video);
      if (dom.contains(controlsBar)) dom.removeChild(controlsBar);
      if (dom.contains(playBtn)) dom.removeChild(playBtn);
      if (dom.contains(track)) dom.removeChild(track);
      webVideoRef.current = null;
    };
  }, [isWeb, videoUrl]);

  /* ---------- SYNC currentTime PROP TO WEB VIDEO ---------- */
  useEffect(() => {
    if (!isWeb || currentTime == null) return;
    const d = durationRef.current || 0;
    const clamped = d ? Math.max(0, Math.min(currentTime, d)) : Math.max(0, currentTime);
    desiredTimeRef.current = clamped;
    setPosition(clamped);
    if (webVideoRef.current) {
      webVideoRef.current.currentTime = clamped;
    }
  }, [isWeb, currentTime]);

  /* ---------- GUARDS ---------- */
  if (!videoUrl) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video</Text>
      </View>
    );
  }

  const validUrl = videoUrl.startsWith("http") || videoUrl.startsWith("https") || videoUrl.startsWith("/");
  if (!validUrl) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Invalid video URL</Text>
      </View>
    );
  }

  /* ---------- WEB ---------- */
  if (isWeb) {
    return (
      <View style={styles.container}>
        {error && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>Video Error</Text>
            <Text style={styles.errorSubtext}>{error}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(videoUrl)}>
              <Text style={styles.link}>Open in browser</Text>
            </TouchableOpacity>
          </View>
        )}
        <View ref={webContainerRef} style={styles.video} collapsable={false} />
      </View>
    );
  }

  /* ---------- NO EXPO ---------- */
  if (!hasExpoAv) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>expo-av required</Text>
        <TouchableOpacity onPress={() => Linking.openURL(videoUrl)}>
          <Text style={styles.link}>Open in browser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ---------- NATIVE ---------- */
  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode={ResizeMode?.CONTAIN ?? "contain"}
        useNativeControls={false}
        shouldPlay={false}
        progressUpdateIntervalMillis={500}
        onPlaybackStatusUpdate={onStatus}
        onError={() => setError("Failed to load video")}
      />

      {duration > 0 && (
        <View
          style={styles.progressTrack}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onBarPress}
        >
          <View
            style={[styles.progressFill, { width: `${(position / duration) * 100}%` }]}
            pointerEvents="none"
          />
        </View>
      )}

      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorSubtext}>{error}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(videoUrl)}>
            <Text style={styles.link}>Open in browser</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

export default VideoPlayer;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
  },
  placeholder: {
    aspectRatio: 16 / 9,
    backgroundColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  placeholderText: {
    color: "#fff",
    fontWeight: "700",
  },
  link: {
    color: "#3b82f6",
    marginTop: 10,
    fontWeight: "600",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorSubtext: {
    color: "#ef4444",
    textAlign: "center",
  },
});
