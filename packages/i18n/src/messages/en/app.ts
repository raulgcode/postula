/** /app: the panel's layout and its home. */
export const app = {
  navHome: "Home",
  navProfile: "Profile",
  navSettings: "Settings",
  navLabel: "Main menu",
  homeTitle: "Home",
  homeHeading: "Hi, {name}",
  homeIntro:
    "Your job search lives here: what Postula found, what's waiting for you and what you sent.",
  searchTitle: "Active search",
  searchOn: "On: Postula searches and prepares applications for you every day.",
  searchOff: "Off: nothing runs and it costs nothing. Your data stays as it is.",
  searchCost: "While it's on, the worker costs about US$0.25 a day.",
  searchTurnOn: "Turn the search on",
  searchTurnOff: "Turn the search off",
  searchSaving: "Saving…",
  workerRunning: "The worker is running.",
  workerStarting: "The worker is starting, it takes a few seconds.",
  workerStopped: "The worker is stopped.",
  workerUnknown: "On this computer the worker runs with pnpm dev.",
  workerUnreachable:
    "The worker couldn't start, so the search is still off. Try again in a minute.",
} as const;
