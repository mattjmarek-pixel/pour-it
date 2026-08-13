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
  /** True when the current result came from user self-report, not GPS. */
  selfReported: boolean;
  /** Run (or re-run) the GPS verification. No-op if one is already running. */
  verifyLocation: () => Promise<void>;
  /** Re-verify if the last successful check is stale (per-session TTL). */
  ensureFresh: () => void;
  /** Manual fallback: user self-reports their state. */
  submitManualState: (abbr: string) => void;
}

const ThcGateContext = createContext<ThcGateState | null>(null);

export function ThcGateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ThcGateStatus>('idle');
  const [stateAbbr, setStateAbbr] = useState<string | null>(null);
  const [selfReported, setSelfReported] = useState(false);
  const inFlight = useRef(false);
  const lastCheckedAt = useRef<number>(0);

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
      setStateAbbr(abbr);
      setSelfReported(false);
      setStatus(isThcLegalIn(abbr) ? 'allowed' : 'blocked');
    } catch {
      // GPS or geocoding failure — never assume legal.
      setStatus('unverified');
    } finally {
      inFlight.current = false;
    }
  }, []);

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

  const submitManualState = useCallback((abbr: string) => {
    const normalized = normalizeRegionToAbbr(abbr);
    setStateAbbr(normalized);
    setSelfReported(true);
    lastCheckedAt.current = Date.now();
    // Same legality check as the GPS path — an illegal or unknown selection blocks.
    setStatus(isThcLegalIn(normalized) ? 'allowed' : 'blocked');
  }, []);

  const value = useMemo(
    () => ({ status, stateAbbr, selfReported, verifyLocation, ensureFresh, submitManualState }),
    [status, stateAbbr, selfReported, verifyLocation, ensureFresh, submitManualState]
  );

  return <ThcGateContext.Provider value={value}>{children}</ThcGateContext.Provider>;
}

export function useThcGate(): ThcGateState {
  const ctx = useContext(ThcGateContext);
  if (!ctx) throw new Error('useThcGate must be used within ThcGateProvider');
  return ctx;
}
