// app/player/team-stats.jsx - Redirect to home (landing = team stats)
import { useEffect } from "react";
import { router } from "expo-router";
import { getToken } from "../../lib/auth";

export default function PlayerTeamStats() {
  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) {
        router.replace("/");
        return;
      }
      router.replace("/home");
    })();
  }, []);

  return null;
}
