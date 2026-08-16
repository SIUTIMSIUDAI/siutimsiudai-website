// Pure routing policy for the launch flow. Kept free of React and expo-router so it is trivially
// unit-testable: given a snapshot of app state, it returns the single route the user belongs on.
// app/_layout.tsx feeds it live store values and performs the actual router.replace.
//
// Order of the gate (each step blocks the next):
//   onboarding intro -> sign in -> set new password -> email verification -> health profile -> app.

export type GateTarget =
  | "/onboarding"
  | "/auth/sign-in"
  | "/auth/reset-password"
  | "/auth/verify-email"
  | "/profile-setup"
  | "/(tabs)";

export interface GateInput {
  /** appStore rehydrated from storage yet? */
  hydrated: boolean;
  /** authStore has resolved the initial getSession()? */
  authReady: boolean;
  /**
   * An auth deep link is being turned into a session right now.
   *
   * Holds the gate completely still while that is in flight. The link signs the user in a moment
   * from now, but until it lands they still look signed out, and the gate would replace
   * /auth/callback with sign-in mid-exchange — which is exactly how a tapped reset link ends up
   * showing the sign-in screen instead of the reset screen.
   */
  linkResolving: boolean;
  onboardingComplete: boolean;
  signedIn: boolean;
  /** The signed-in user's email is confirmed (always true for OAuth accounts). */
  emailVerified: boolean;
  /** An email account just signed up and is awaiting its confirmation link. */
  pendingVerification: boolean;
  /**
   * This session came from a password recovery link, so the user still owes us a new password.
   * A recovery link signs you in as a side effect; without this the gate would wave the user
   * straight through to the app and the password they came to reset would stay unchanged.
   */
  recoveryPending: boolean;
  /** A health profile has been saved. */
  profileComplete: boolean;
}

/**
 * Resolve the route the user should be on, or null while state is still loading (caller should do
 * nothing and keep the splash up). Pure and synchronous.
 */
export function resolveGate(i: GateInput): GateTarget | null {
  if (!i.hydrated || !i.authReady || i.linkResolving) return null;
  if (!i.onboardingComplete) return "/onboarding";
  if (!i.signedIn) {
    // A pending email signup has no session yet but must land on the verify screen, not sign-in.
    return i.pendingVerification ? "/auth/verify-email" : "/auth/sign-in";
  }
  // Recovery comes before the verification wall on purpose: clicking the emailed link IS proof the
  // address is real, so bouncing that user to "please verify your email" would be both wrong and a
  // dead end. It also comes before profile setup, so nobody is asked for their height and weight
  // while their account still has a password they have forgotten.
  if (i.recoveryPending) return "/auth/reset-password";
  // Signed in: an unconfirmed email session (rare) still can't pass the verification wall.
  if (!i.emailVerified) return "/auth/verify-email";
  if (!i.profileComplete) return "/profile-setup";
  return "/(tabs)";
}

// The route segments (as returned by expo-router's useSegments) that satisfy each target. Used by
// the layout to decide whether a redirect is actually needed, so it never replaces onto the route
// it is already on. A prefix match allows any leaf inside (tabs).
export const GATE_SEGMENTS: Record<GateTarget, string[]> = {
  "/onboarding": ["onboarding"],
  "/auth/sign-in": ["auth", "sign-in"],
  "/auth/reset-password": ["auth", "reset-password"],
  "/auth/verify-email": ["auth", "verify-email"],
  "/profile-setup": ["profile-setup"],
  "/(tabs)": ["(tabs)"],
};

// Screens that belong to a gate step without being the step itself. The gate is a "you are not
// where you should be, go there" loop, so any side route pushed from a gating screen gets replaced
// the instant the user opens it — the forgot-password screen would appear and vanish in one frame.
// Listing it here says: a user standing on forgot-password has already satisfied the sign-in step,
// leave them alone. They are still signed out, so the moment they navigate back the normal rules
// apply again; this widens where the step is satisfied, never whether it is.
const SATELLITE_SEGMENTS: Partial<Record<GateTarget, string[][]>> = {
  "/auth/sign-in": [["auth", "forgot-password"]],
  // Profile setup is where we first compute a calorie target from someone's body metrics, so it
  // carries a link to the citations for those figures (Guideline 1.4.1). That link is worthless if
  // the gate replaces the screen the moment it opens, which is exactly what would happen: the user
  // has no saved health profile yet, so the gate still wants them on /profile-setup.
  "/profile-setup": [["sources"]],
};

function matches(path: string[], segments: string[]): boolean {
  return path.every((seg, idx) => segments[idx] === seg);
}

/** True when the current router segments already satisfy the target (so no redirect is needed). */
export function isAtTarget(target: GateTarget, segments: string[]): boolean {
  if (matches(GATE_SEGMENTS[target], segments)) return true;
  return (SATELLITE_SEGMENTS[target] ?? []).some((path) => matches(path, segments));
}

// The pre-app "gating" routes: the launch-flow screens a user sits on before being cleared into the
// app, plus the bare index entry route. Once the gate resolves to "/(tabs)" (user is cleared), the
// layout only pulls them in from one of these; any other in-app stack route they pushed
// (subscription, recipe, cook, ...) is left alone. Without this the gate would yank every non-tab
// route straight back to the tabs.
const PRE_APP_ROOTS = ["index", "onboarding", "auth", "profile-setup"];

// The exception to that rule. Forgot-password sits under `auth/` because that is where it belongs
// for a signed-out user, but a signed-in one reaches it too, from the change-password screen, when
// they discover they cannot remember the current password they were just asked for. Classified by
// root alone it would count as pre-app, and the gate would haul that user back to the tabs the
// instant the screen opened. Matched on the full path so it exempts this screen and nothing else.
const NON_GATING_ROUTES = [["auth", "forgot-password"]];

export function isPreAppRoute(segments: string[]): boolean {
  if (NON_GATING_ROUTES.some((path) => matches(path, segments))) return false;
  const root = segments[0];
  // expo-router reports the root index route ("/") as no segments; treat that as pre-app too.
  return root === undefined || PRE_APP_ROOTS.includes(root);
}
