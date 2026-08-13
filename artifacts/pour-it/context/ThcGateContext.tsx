import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

import {
  isThcLegalIn,
  normalizeRegionToAbbr,
} from '@/src/data/legalStatesForTHC';

/**
 * Session-scoped THC geo-gate.
 *
 * Fail-closed by design: THC access is blocked unless we affirmatively verify
 * (via GPS reverse-geocoding, or user self-report as a fallback) that the user
 * is in a state where recreational cannabis is legal. Denied permission,
 * geocoding failure, or unknown state all block.
 *
 * Nothing is persisted across app launches, and each verification expires
 * after RECHECK_INTERVAL_MS within a session so a traveling user is re-checked.
 */

const RECHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export type ThcGateStatus =
  | 'idle' // not yet checked this session
  | 'checking' // location check in flight
  | 'allowed' // verified legal state
  | 'blocked' // verified NOT legal state
  | 'unverified'; // location denied/failed — offer manual fallback

interface ThcGateState {
  status: ThcGateStatus;
  /** USPS abbreviation of the verified or self-reported state, if known. */
  stateAbbr: string | null;
  /**
   * Server-signed location verification token. Present only when status is
   * 'allowed' — the API server cross-checked the state against its own legal
   * list and signed it. All THC API requests must carry this token; the
   * server rejects THC requests without it (fail closed).
   */
  locationToken: string | null;
  /** True when the current result came from user self-report, not GPS. */
  selfReported: boolean;
  /** Run (or re-run) the GPS verification. No-op if one is already running. */
  verifyLocation: () => Promise<void>;
  /** Re-verify if the last successful check is stale (per-session TTL). */
  ensureFresh: () => void;
  /** Manual fallback: user self-reports their state. */
  submitManualState: (abbr: string) => Promise<void>;
}

const ThcGateContext = createContext<ThcGateState | null>(null);

export function ThcGateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ThcGateStatus>('idle');
  const [stateAbbr, setStateAbbr] = useState<string | null>(null);
  const [selfReported, setSelfReported] = useState(false);
  const [locationToken, setLocationToken] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastCheckedAt = useRef<number>(0);

  /**
   * Exchange a locally-verified state for a server-signed location token.
   * The server independently cross-checks legality — if it disagrees with the
   * bundled client list (e.g. a law changed), the server wins. Network or
   * server failure fails closed to 'unverified'.
   */
  const finishVerification = useCallback(async (abbr: string, manual: boolean) => {
    setStateAbbr(abbr);
    setSelfReported(manual);
    setLocationToken(null);
    // Client-side pre-check for instant UX on clearly-illegal states; the
    // server remains the enforcement boundary either way.
    if (!isThcLegalIn(abbr)) {
      setStatus('blocked');
      return;
    }
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) {
      setStatus('unverified');
      return;
    }
    try {
      const res = await fetch(`https://${domain}/api/verify-thc-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: abbr }),
      });
      if (!res.ok) {
        setStatus('unverified');
        return;
      }
      const data = (await res.json()) as { legal?: boolean; locationToken?: string };
      if (data.legal && typeof data.locationToken === 'string') {
        setLocationToken(data.locationToken);
        setStatus('allowed');
      } else {
        // Server says not legal — server list outranks the bundled one.
        setStatus('blocked');
      }
    } catch {
      setStatus('unverified'); // fail closed on network failure
    }
  }, []);

  const verifyLocation = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('checking');
    // Record every attempt (success or failure) so a failed check does not
    // look "stale" immediately and re-trigger in a loop on the next render.
    lastCheckedAt.current = Date.now();
    try {
      // Web: expo-location reverse geocoding is unsupported in the browser,
      // so GPS can never verify a state there. Go straight to the manual
      // fallback instead of prompting for a permission we can't use.
      if (Platform.OS === 'web') {
        setStatus('unverified');
        return;
      }
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('unverified'); // fail closed; manual fallback offered
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const first = places[0];
      const abbr = normalizeRegionToAbbr(first?.region ?? null);
      // A US check: if the geocode has no recognizable US state, we cannot
      // verify legality — fail closed to unverified (manual fallback).
      if (!abbr) {
        setStatus('unverified');
        return;
      }
      await finishVerification(abbr, false);
    } catch {
      // GPS or geocoding failure — never assume legal.
      setStatus('unverified');
    } finally {
      inFlight.current = false;
    }
  }, [finishVerification]);

  // Refs so ensureFresh stays referentially stable across status changes —
  // ThcGate's focus effect depends on it, and an unstable callback would
  // re-run the effect on every state transition (causing a re-check loop).
  const statusRef = useRef(status);
  statusRef.current = status;

  const ensureFresh = useCallback(() => {
    if (inFlight.current || statusRef.current === 'checking') return;
    const stale = Date.now() - lastCheckedAt.current > RECHECK_INTERVAL_MS;
    // Verify on first use this session, or when the last attempt (any
    // outcome, GPS or self-reported) has aged past the TTL. Failed attempts
    // are timestamped too, so they only retry on a fresh focus after the TTL.
    if (statusRef.current === 'idle' || stale) {
      void verifyLocation();
    }
  }, [verifyLocation]);

  const submitManualState = useCallback(
    async (abbr: string) => {
      const normalized = normalizeRegionToAbbr(abbr);
      lastCheckedAt.current = Date.now();
      if (!normalized) {
        setStateAbbr(null);
        setSelfReported(true);
        setLocationToken(null);
        setStatus('blocked');
        return;
      }
      setStatus('checking');
      // Same path as GPS: legality is confirmed (and the token signed) by the server.
      await finishVerification(normalized, true);
    },
    [finishVerification]
  );

  const value = useMemo(
    () => ({
      status,
      stateAbbr,
      selfReported,
      locationToken,
      verifyLocation,
      ensureFresh,
      submitManualState,
    }),
    [status, stateAbbr, selfReported, locationToken, verifyLocation, ensureFresh, submitManualState]
  );

  return <ThcGateContext.Provider value={value}>{children}</ThcGateContext.Provider>;
}

export function useThcGate(): ThcGateState {
  const ctx = useContext(ThcGateContext);
  if (!ctx) throw new Error('useThcGate must be used within ThcGateProvider');
  return ctx;
}
