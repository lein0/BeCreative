import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { createStudentApi, resolveApiMode, type StudentApi } from "./api";
import type { AuthSession, ExperimentAssignment, StudentUser, TrackEvent, Vertical } from "./api/types";
import { readStored, writeStored } from "./storage";
import type { DeepLink } from "./linking/parse";

const TOKEN_KEY = "bc.token";
const ANON_KEY = "bc.anon";
const THEME_KEY = "bc.theme";
const VERTICAL_KEY = "bc.vertical";

type SchemePreference = "system" | "light" | "dark";

type SessionValue = {
  ready: boolean;
  user: StudentUser | null;
  api: StudentApi;
  apiMode: "mock" | "live";
  vertical: Vertical;
  setVertical: (vertical: Vertical) => void;
  schemePreference: SchemePreference;
  setSchemePreference: (value: SchemePreference) => void;
  assignments: ExperimentAssignment[];
  attribution: DeepLink | null;
  setAttribution: (link: DeepLink | null) => void;
  acceptSession: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: (user: StudentUser) => void;
  track: (event: string, properties?: TrackEvent["properties"]) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function platform(): "ios" | "android" {
  return Platform.OS === "android" ? "android" : "ios";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const anonRef = useRef("anon-pending");
  const userRef = useRef<StudentUser | null>(null);
  const api = useMemo(
    () =>
      createStudentApi({
        mode: resolveApiMode(process.env.EXPO_PUBLIC_API_MODE),
        baseUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000",
        getToken: () => tokenRef.current,
      }),
    [],
  );
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<StudentUser | null>(null);
  const [vertical, setVerticalState] = useState<Vertical>("creative");
  const [schemePreference, setSchemeState] = useState<SchemePreference>("system");
  const [assignments, setAssignments] = useState<ExperimentAssignment[]>([]);
  const [attribution, setAttribution] = useState<DeepLink | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, anon, theme, savedVertical] = await Promise.all([readStored(TOKEN_KEY), readStored(ANON_KEY), readStored(THEME_KEY), readStored(VERTICAL_KEY)]);
      const anonymousId = anon ?? `anon-${Math.random().toString(36).slice(2, 10)}`;
      if (!anon) await writeStored(ANON_KEY, anonymousId);
      anonRef.current = anonymousId;
      tokenRef.current = token;
      if (!cancelled && (theme === "light" || theme === "dark" || theme === "system")) setSchemeState(theme);
      if (!cancelled && (savedVertical === "creative" || savedVertical === "wellness")) setVerticalState(savedVertical);
      if (token) {
        try {
          const me = await api.me();
          if (!cancelled) {
            userRef.current = me;
            setUser(me);
          }
        } catch {
          tokenRef.current = null;
          await writeStored(TOKEN_KEY, null);
        }
      }
      try {
        const experiments = await api.experiments();
        if (!cancelled) setAssignments(experiments.assignments);
      } catch {
        // Experiments are optional. The app still books.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const acceptSession = useCallback(async (session: AuthSession) => {
    tokenRef.current = session.token;
    userRef.current = session.user;
    setUser(session.user);
    await writeStored(TOKEN_KEY, session.token);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Local sign-out still stands if the network is down.
    }
    tokenRef.current = null;
    userRef.current = null;
    setUser(null);
    await writeStored(TOKEN_KEY, null);
  }, [api]);

  const refreshUser = useCallback((next: StudentUser) => {
    userRef.current = next;
    setUser(next);
  }, []);

  const setVertical = useCallback((next: Vertical) => {
    setVerticalState(next);
    void writeStored(VERTICAL_KEY, next);
  }, []);

  const setSchemePreference = useCallback((next: SchemePreference) => {
    setSchemeState(next);
    void writeStored(THEME_KEY, next);
  }, []);

  const track = useCallback(
    async (event: string, properties: TrackEvent["properties"] = {}) => {
      try {
        await api.track({
          event,
          platform: platform(),
          occurredAt: new Date().toISOString(),
          anonymousId: anonRef.current,
          userId: userRef.current?.id ?? null,
          properties,
        });
      } catch {
        // Analytics must not block booking.
      }
    },
    [api],
  );

  const value: SessionValue = {
    ready,
    user,
    api,
    apiMode: api.mode,
    vertical,
    setVertical,
    schemePreference,
    setSchemePreference,
    assignments,
    attribution,
    setAttribution,
    acceptSession,
    signOut,
    refreshUser,
    track,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
