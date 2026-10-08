import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { isCatalogEvent } from "../../lib/analytics-events";
import { createStudentApi, resolveApiMode, type StudentApi } from "./api";
import type { AuthResult, ExperimentAssignment, PlatformName, StudentUser, Vertical } from "./api/types";
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
  acceptSession: (session: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: (user: StudentUser) => void;
  track: (event: string, properties?: Record<string, string | number | boolean | null | undefined>) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function platform(): PlatformName {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return "web";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const anonRef = useRef("anon-pending");
  const userRef = useRef<StudentUser | null>(null);
  const api = useMemo(
    () =>
      createStudentApi({
        mode: resolveApiMode(process.env.EXPO_PUBLIC_API_MODE, process.env.EXPO_PUBLIC_API_URL),
        baseUrl: process.env.EXPO_PUBLIC_API_URL,
        getToken: () => tokenRef.current,
        getPlatform: platform,
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
          const { user: me } = await api.me();
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
        const assigned = await api.experiment("class_cta", anonRef.current);
        if (!cancelled) setAssignments([assigned]);
      } catch {
        // Experiments are optional. The app still books.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const acceptSession = useCallback(async (session: AuthResult) => {
    tokenRef.current = session.token;
    userRef.current = session.user;
    setUser(session.user);
    await writeStored(TOKEN_KEY, session.token);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
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
    async (event: string, properties: Record<string, string | number | boolean | null | undefined> = {}) => {
      if (!isCatalogEvent(event)) return;
      const strings: Record<string, string> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (value === undefined || value === null) continue;
        strings[key] = String(value);
      }
      try {
        await api.track({
          name: event,
          platform: platform(),
          anonymousId: anonRef.current,
          path: undefined,
          properties: strings,
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
