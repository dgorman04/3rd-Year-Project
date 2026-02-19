// Shared nav config for Sidebar and TopNavBar

export const HOME_NAV_ITEMS = [
  { path: "/manager/dashboard", label: "Manager Section", shortLabel: "Manager", roles: ["manager", "analyst"] },
  { path: "/analyst/dashboard", label: "Analyst Section", shortLabel: "Analyst", roles: ["manager", "analyst"] },
  { path: "/player/stats", label: "Personal Stats", shortLabel: "Stats", roles: ["player"] },
  { path: "/messages", label: "Team Chat", shortLabel: "Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

export const MANAGER_NAV_ITEMS = [
  { path: "/manager/dashboard", label: "Manager Dashboard", shortLabel: "Dashboard", roles: ["manager"] },
  { path: "/manager/current-match", label: "Live Match", shortLabel: "Live", roles: ["manager"] },
  { path: "/manager/players", label: "Players", roles: ["manager"] },
  { path: "/manager/matches", label: "Matches", roles: ["manager"] },
  { path: "/manager/messages", label: "Team Chat", shortLabel: "Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

export const ANALYST_NAV_ITEMS = [
  { path: "/analyst/dashboard", label: "Analyst Dashboard", shortLabel: "Dashboard", roles: ["analyst"] },
  { path: "/analyst/record-events", label: "Start New Match", shortLabel: "New Match", roles: ["analyst"] },
  { path: "/analyst/review-matches", label: "Review Matches", shortLabel: "Review", roles: ["analyst"] },
  { path: "/analyst/messages", label: "Team Chat", shortLabel: "Chat", roles: ["manager", "analyst", "player"] },
  { path: "/profile", label: "Profile", roles: ["manager", "analyst", "player"] },
];

export const PLAYER_NAV_ITEMS = [
  { path: "/player/stats", label: "Personal Stats", shortLabel: "Stats", roles: ["player"] },
  { path: "/messages", label: "Team Chat", shortLabel: "Chat", roles: ["player"] },
  { path: "/profile", label: "Profile", roles: ["player"] },
];

export function getNavItems(pathname, userRole = "manager") {
  const isHomePage = pathname === "/home";
  const isManagerSection = pathname?.startsWith("/manager/");
  const isAnalystSection = pathname?.startsWith("/analyst/");
  const isPlayerSection = pathname?.startsWith("/player/");

  let navItemsToUse = HOME_NAV_ITEMS;
  let usingSectionNav = false;

  if (isManagerSection) {
    navItemsToUse = MANAGER_NAV_ITEMS;
    usingSectionNav = true;
  } else if (isAnalystSection) {
    navItemsToUse = ANALYST_NAV_ITEMS;
    usingSectionNav = true;
  } else if (isPlayerSection) {
    navItemsToUse = PLAYER_NAV_ITEMS;
    usingSectionNav = true;
  } else if (pathname === "/messages") {
    if (userRole === "manager") {
      navItemsToUse = MANAGER_NAV_ITEMS;
      usingSectionNav = true;
    } else if (userRole === "analyst") {
      navItemsToUse = ANALYST_NAV_ITEMS;
      usingSectionNav = true;
    }
  }

  const filtered = navItemsToUse.filter((item) => {
    if (usingSectionNav) return true;
    return item.roles && item.roles.includes(userRole);
  });

  return filtered;
}

export function isNavActive(path, pathname) {
  if (path === "/home") return pathname === "/home";
  if (path === "/manager/dashboard") return pathname === "/manager/dashboard" || pathname?.startsWith("/manager/");
  if (path === "/analyst/dashboard") return pathname === "/analyst/dashboard" || pathname?.startsWith("/analyst/");
  if (path === "/analyst/record-events") return pathname === "/analyst/record-events" || pathname?.includes("/analyst/match/");
  if (path === "/analyst/review-matches") return pathname === "/analyst/review-matches";
  if (path === "/player/stats") return pathname === "/player/stats";
  if (path === "/profile") return pathname === "/profile";
  if (path === "/manager/messages") return pathname === "/manager/messages";
  if (path === "/analyst/messages") return pathname === "/analyst/messages";
  if (path === "/messages") return pathname === "/messages" || pathname === "/player/messages";
  return pathname?.startsWith(path);
}
