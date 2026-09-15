import { Feather } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router/react-navigation';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrossCategoryWarningModal } from '@/components/CrossCategoryWarningModal';
import { EmptyState } from '@/components/EmptyState';
import {
  AIVisionQuotaModal,
  type AIVisionQuotaIssue,
} from '@/components/AIVisionQuotaModal';
import { ScanToast } from '@/components/ScanToast';
import { useThcGate } from '@/context/ThcGateContext';
import {
  catalogModeToProductCategory,
  isCategoryCompatible,
  isProductCategory,
  type ProductCategory,
} from '@workspace/category-policy';
import type { AppMode, Product, Recipe } from '@/src/data/recipes';
import { PRODUCTS, findProductByBarcode } from '@/src/data/recipes';
import {
  buildFullCatalogHints,
  type SafetyProductCategory,
} from '@/src/services/mixerFlow';
import {
  createScanDeadline,
  type ScanDeadline,
  ScanTimeoutError,
} from '@/src/services/scanTimeout';
import {
  beginVisionAllowanceCheck,
  cancelVisionAllowance,
  commitVisionAllowance,
  releaseVisionAllowance,
  resolveVisionAllowance,
  type VisionAllowanceAttempt,
} from '@/src/services/scanUsage';
import { upsertMyBarProduct } from '@/src/services/myBarStorage';
import { safeNotification } from '@/utils/haptics';

interface ScanViewProps {
  mode: AppMode;
  accentColor: string;
  onProductFound: (product: Product) => void;
  onBrowseManually: () => void;
  onClose?: () => void;
}

const MODE_EMOJI: Record<AppMode, string> = {
  spirits: '🍸',
  thc: '🌿',
  mocktails: '🍹',
};

interface IdentifyAIRecipe {
  title: string;
  description: string;
  ingredients: { amount: string; unit: string; name: string }[];
  steps: string[];
  tags: string[];
}

type IdentifyResponse =
  | { status: 'not_a_drink' }
  | { status: 'uncertain' }
  | { status: 'category_mismatch'; detectedCategory: string; label: string }
  | { status: 'matched'; productId: string }
  | {
      status: 'ai';
      product: { name: string; brand: string; category: string; recipes: IdentifyAIRecipe[] };
      verificationToken: string;
    }
  | { status: 'not_found' };

interface CategoryMismatch {
  detectedCategory: SafetyProductCategory;
  productName?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RETICLE_WIDTH = 280;
const RETICLE_HEIGHT = 180;

const MODE_LABELS: Record<AppMode, string> = {
  spirits: 'Spirits',
  thc: 'THC',
  mocktails: 'Mocktails',
};

export function ScanView({
  mode,
  accentColor,
  onProductFound,
  onBrowseManually,
  onClose,
}: ScanViewProps) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Product not found — try browsing manually');
  const [identifying, setIdentifying] = useState(false);
  const [mismatch, setMismatch] = useState<CategoryMismatch | null>(null);
  const [quotaIssue, setQuotaIssue] = useState<AIVisionQuotaIssue | null>(null);
  const { locationToken } = useThcGate();
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannedRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const visionCheckInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const activeVisionAttemptRef = useRef<VisionAllowanceAttempt | null>(null);
  const activeDeadlineRef = useRef<ScanDeadline | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  const completeSuccessfulScan = (product: Product) => {
    if (!mountedRef.current) return;
    // My Bar observes successful scan output only. It does not participate in
    // identification, category safety, or recipe quality decisions.
    void Promise.resolve()
      .then(() => upsertMyBarProduct(product, mode))
      .catch(() => {
        // My Bar is best-effort. Its failures must never enter the scan flow.
      });
    onProductFound(product);
  };

  const cornerOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerOpacity, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(cornerOpacity, {
          toValue: 0.55,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [cornerOpacity]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      visionCheckInFlightRef.current = false;
      if (activeVisionAttemptRef.current) {
        cancelVisionAllowance(activeVisionAttemptRef.current);
        activeVisionAttemptRef.current = null;
      }
      activeDeadlineRef.current?.cancel();
      activeDeadlineRef.current = null;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);

    const raw = result.data?.trim() ?? '';
    if (!raw) {
      resetAfter(800);
      return;
    }

    // Search the ENTIRE catalog (all modes), not just the active mode, so a
    // cross-category scan is detected instead of silently falling through.
    const found = findProductByBarcode(raw);

    if (found) {
      const pCategory = catalogModeToProductCategory(found.mode);
      if (pCategory && isCategoryCompatible(mode, pCategory)) {
        safeNotification(Haptics.NotificationFeedbackType.Success);
        completeSuccessfulScan({ ...found.product, productCategory: pCategory });
        return;
      }
      // SAFETY: product belongs to a different category. Do NOT render the
      // product or its recipes — show the blocking warning modal instead.
      safeNotification(Haptics.NotificationFeedbackType.Warning);
      if (pCategory === 'spirits' || pCategory === 'thc') {
        setMismatch({
          detectedCategory: pCategory,
          productName: found.product.name,
        });
      } else {
        showToast("Couldn't confirm what this is — try scanning again or check the label", 2800);
      }
      return;
    }

    // No barcode match anywhere — fall back to AI vision identification.
    void identifyWithVision();
  };

  const showToast = (message: string, ms: number) => {
    setToastMessage(message);
    setToastVisible(true);
    safeNotification(Haptics.NotificationFeedbackType.Warning);
    resetAfter(ms);
  };

  const showRetryError = () => {
    setToastMessage('Something went wrong, please try again');
    setToastVisible(true);
    safeNotification(Haptics.NotificationFeedbackType.Error);
    scannedRef.current = false;
    setScanned(false);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 2800);
  };

  const identifyWithVision = async () => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain || !cameraRef.current) {
      showToast('Product not found — try browsing manually', 2400);
      return;
    }

    // Fail closed: THC identification requires the server-signed location
    // token. Without it, don't even capture/send — the server rejects with
    // 403 anyway.
    if (mode === 'thc' && !locationToken) {
      showToast('Location verification required — please re-verify your state', 2800);
      return;
    }

    // This synchronous guard runs before any async allowance read so a double
    // tap cannot start two checks/captures from this ScanView.
    if (visionCheckInFlightRef.current) return;
    visionCheckInFlightRef.current = true;

    // The allowance check is intentionally before setIdentifying, the capture
    // deadline, and takePictureAsync. Unknown storage fails closed without
    // silently resetting the user to three free scans.
    const allowanceAttempt = beginVisionAllowanceCheck();
    activeVisionAttemptRef.current = allowanceAttempt;
    let allowanceReservation: VisionAllowanceAttempt | null = null;
    const isAttemptActive = () =>
      mountedRef.current &&
      visionCheckInFlightRef.current &&
      activeVisionAttemptRef.current?.id === allowanceAttempt.id;

    try {
      const allowance = await resolveVisionAllowance(allowanceAttempt);
      if (!isAttemptActive()) return;
      if (allowance.status === 'exhausted') {
        setQuotaIssue('exhausted');
        return;
      }
      if (allowance.status === 'unknown') {
        setQuotaIssue('unknown');
        return;
      }
      allowanceReservation = allowance.reservation;

      if (!isAttemptActive()) return;
      setIdentifying(true);
      const deadline = createScanDeadline();
      activeDeadlineRef.current = deadline;
      if (!isAttemptActive()) return;
      const photo = await deadline.run(
        cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
          skipProcessing: true,
        })
      );
      if (!isAttemptActive()) return;
      if (!photo?.base64) {
        showToast('Product not found — try browsing manually', 2400);
        return;
      }

      // Identification is always checked against every known product. The
      // active mode controls compatibility and recipes, never catalog safety.
      const hints = buildFullCatalogHints(PRODUCTS);

      const controller = new AbortController();
      activeControllerRef.current = controller;
      if (!isAttemptActive()) return;
      const res = await deadline.run(
        fetch(`https://${domain}/api/identify-bottle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: photo.base64,
            products: hints,
            mode,
            // Server-side THC geo-enforcement: THC identification is rejected
            // without a valid server-signed location token.
            ...(mode === 'thc' ? { locationToken } : {}),
          }),
          signal: controller.signal as AbortSignal,
        }),
        () => controller.abort()
      );
      if (!isAttemptActive()) return;
      if (!res.ok) {
        showToast('Product not found — try browsing manually', 2400);
        return;
      }

      const data = (await res.json()) as IdentifyResponse;
      if (!isAttemptActive()) return;

      if (data.status === 'not_a_drink') {
        showToast("This doesn't look like a drink — please scan a beverage", 2800);
        return;
      }

      if (data.status === 'uncertain') {
        showToast("Couldn't confirm what this is — try scanning again or check the label", 2800);
        return;
      }

      if (data.status === 'category_mismatch') {
        if (
          isProductCategory(data.detectedCategory) &&
          data.detectedCategory !== 'mixer' &&
          !isCategoryCompatible(mode, data.detectedCategory)
        ) {
          safeNotification(Haptics.NotificationFeedbackType.Warning);
          setMismatch({
            detectedCategory: data.detectedCategory,
            productName: data.label || undefined,
          });
        } else {
          showToast("Couldn't confirm what this is — try scanning again or check the label", 2800);
        }
        return;
      }

      if (data.status === 'matched') {
        const matchedEntry = (Object.entries(PRODUCTS) as [AppMode, Product[]][])
          .flatMap(([catalogMode, products]) =>
            products.map((product) => ({ catalogMode, product }))
          )
          .find(({ product }) => product.id === data.productId);
        if (matchedEntry) {
          const pCategory = catalogModeToProductCategory(matchedEntry.catalogMode);
          if (!isAttemptActive()) return;
          const commit = await commitVisionAllowance(allowanceReservation);
          allowanceReservation = null;
          if (!isAttemptActive()) return;
          if (commit.status !== 'committed' && commit.status !== 'bypassed') {
            // A usable product is never delivered unless its allowance commit
            // succeeded. Persistence failure is recoverable, not a product
            // identification success.
            setQuotaIssue('unknown');
            return;
          }
          safeNotification(Haptics.NotificationFeedbackType.Success);
          completeSuccessfulScan({
            ...matchedEntry.product,
            productCategory: pCategory || undefined,
          });
          return;
        }
        showToast('Product not found — try browsing manually', 2400);
        return;
      }

      if (data.status === 'ai') {
        const aiProduct = buildAIProduct(data.product, data.verificationToken);
        if (!isAttemptActive()) return;
        const commit = await commitVisionAllowance(allowanceReservation);
        allowanceReservation = null;
        if (!isAttemptActive()) return;
        if (commit.status !== 'committed' && commit.status !== 'bypassed') {
          // A usable product is never delivered unless its allowance commit
          // succeeded. Persistence failure is recoverable, not a product
          // identification success.
          setQuotaIssue('unknown');
          return;
        }
        safeNotification(Haptics.NotificationFeedbackType.Success);
        completeSuccessfulScan(aiProduct);
        return;
      }

      showToast('Product not found — try browsing manually', 2400);
    } catch (error) {
      if (!isAttemptActive()) return;
      if (
        error instanceof ScanTimeoutError ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        showRetryError();
      } else {
        showToast('Product not found — try browsing manually', 2400);
      }
    } finally {
      if (allowanceReservation) {
        // Only successful matched/AI products reach commitVisionAllowance.
        // Every failure, timeout, mismatch, and unusable result returns the
        // in-memory permit without changing persisted usage.
        releaseVisionAllowance(allowanceReservation);
      }
      if (activeVisionAttemptRef.current?.id === allowanceAttempt.id) {
        activeVisionAttemptRef.current = null;
      }
      activeDeadlineRef.current = null;
      activeControllerRef.current = null;
      if (mountedRef.current) setIdentifying(false);
      visionCheckInFlightRef.current = false;
    }
  };

  const buildAIProduct = (
    aiProduct: {
      name: string;
      brand: string;
      category: string;
      recipes: IdentifyAIRecipe[];
    },
    verificationToken?: string
  ): Product => {
    const baseSlug = slugify(aiProduct.name) || 'ai-product';
    const recipes: Recipe[] = aiProduct.recipes.slice(0, 3).map((r, i) => ({
      id: `ai-${baseSlug}-${i}`,
      title: r.title,
      description: r.description,
      tier: 'ai',
      ingredients: r.ingredients,
      steps: r.steps,
      tags: r.tags,
    }));

    return {
      id: `ai-${baseSlug}-${Date.now()}`,
      name: aiProduct.name,
      brand: aiProduct.brand,
      emoji: MODE_EMOJI[mode],
      category: aiProduct.category,
      spiritType: aiProduct.brand || aiProduct.category,
      flavorNotes: [],
      aiGenerated: true,
      verificationToken,
      recipes,
      productCategory: isProductCategory(aiProduct.category)
        ? (aiProduct.category as ProductCategory)
        : undefined,
    };
  };

  const resetAfter = (ms: number) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      scannedRef.current = false;
      setScanned(false);
      setToastVisible(false);
    }, ms);
  };

  const handleMismatchCancel = () => {
    setMismatch(null);
    resetAfter(0);
  };

  const handleQuotaIssueDismiss = () => {
    setQuotaIssue(null);
    resetAfter(0);
  };

  // Web fallback: CameraView's barcode scanning is unreliable in the iframe
  // preview, so we show a simple browse-manually surface instead of a broken
  // camera. The reticle still renders so the design intent is visible.
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 16 },
        ]}
      >
        <View style={styles.topBarInline}>
          {onClose && (
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          )}
          <Text style={styles.modeLabel}>{MODE_LABELS[mode]}</Text>
        </View>
        <View style={styles.webNoticeWrap}>
          <View style={[styles.reticle, { width: RETICLE_WIDTH, height: RETICLE_HEIGHT }]}>
            <Reticle accentColor={accentColor} opacity={cornerOpacity} />
          </View>
          <Text style={styles.webNoticeTitle}>Camera preview not available on web</Text>
          <Text style={styles.webNoticeSub}>
            On a device, point at a barcode to scan automatically.
          </Text>
        </View>
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
          style={styles.browseLinkWrap}
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <EmptyState
          icon="📷"
          title="Camera access needed"
          subtitle="Enable camera access in Settings to scan bottles"
          accentColor={accentColor}
          actionLabel="Open Settings"
          onAction={() => Linking.openSettings()}
        />
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
          style={styles.browseLinkWrap}
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        active={isFocused}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Dim overlays around the reticle */}
      <View style={[styles.overlay, styles.overlayTop, { height: '50%', marginBottom: RETICLE_HEIGHT / 2 }]} />
      <View style={[styles.overlay, styles.overlayBottom, { height: '50%', marginTop: RETICLE_HEIGHT / 2 }]} />
      <View
        style={[
          styles.overlaySide,
          { width: `50%`, marginRight: RETICLE_WIDTH / 2, left: 0 },
        ]}
      />
      <View
        style={[
          styles.overlaySide,
          { width: `50%`, marginLeft: RETICLE_WIDTH / 2, right: 0 },
        ]}
      />

      {/* Reticle */}
      <View
        pointerEvents="none"
        style={[
          styles.reticle,
          {
            width: RETICLE_WIDTH,
            height: RETICLE_HEIGHT,
            top: '50%',
            left: '50%',
            marginLeft: -RETICLE_WIDTH / 2,
            marginTop: -RETICLE_HEIGHT / 2,
            position: 'absolute',
          },
        ]}
      >
        <Reticle accentColor={accentColor} opacity={cornerOpacity} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {onClose && (
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
        )}
        <Text style={styles.modeLabel}>{MODE_LABELS[mode]}</Text>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          style={styles.torchBtn}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
          hitSlop={8}
        >
          <Feather name={torch ? 'zap' : 'zap-off'} size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Identifying overlay while Claude Vision runs */}
      {identifying && (
        <View pointerEvents="none" style={styles.identifyingOverlay}>
          <View style={styles.identifyingCard}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.identifyingText}>Identifying with AI…</Text>
          </View>
        </View>
      )}

      {/* Toast above the browse-manually link */}
      <View
        pointerEvents="none"
        style={[
          styles.toastSlot,
          {
            top: '50%',
            marginTop: RETICLE_HEIGHT / 2 + 24,
          },
        ]}
      >
        <ScanToast message={toastMessage} visible={toastVisible} />
      </View>

      {/* Browse manually link */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>

      {/* Blocking cross-category safety modal — no bypass path */}
      {mismatch && (
        <CrossCategoryWarningModal
          visible
          detectedCategory={mismatch.detectedCategory}
          currentMode={mode}
          productName={mismatch.productName}
          onCancel={handleMismatchCancel}
        />
      )}

      {quotaIssue && (
        <AIVisionQuotaModal
          visible
          issue={quotaIssue}
          accentColor={accentColor}
          onDismiss={handleQuotaIssueDismiss}
        />
      )}
    </View>
  );
}

function Reticle({
  accentColor,
  opacity,
}: {
  accentColor: string;
  opacity: Animated.Value;
}) {
  return (
    <>
      <Animated.View
        style={[styles.corner, styles.cornerTL, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerTR, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerBL, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerBR, { borderColor: accentColor, opacity }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayTop: { top: 0 },
  overlayBottom: { bottom: 0 },
  overlaySide: {
    position: 'absolute',
    top: '50%',
    height: RETICLE_HEIGHT,
    marginTop: -RETICLE_HEIGHT / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reticle: {
    borderRadius: 18,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  topBarInline: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeLabel: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  torchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  toastSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  identifyingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  identifyingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(10,10,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  identifyingText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    alignItems: 'center',
  },
  browseLinkWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  browseLink: {
    fontFamily: 'DMSans_400Regular',
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  webNoticeWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  webNoticeTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 12,
  },
  webNoticeSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 260,
  },
});
