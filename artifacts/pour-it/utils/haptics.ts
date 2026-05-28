import * as Haptics from 'expo-haptics';

export const safeImpact = async (style: Haptics.ImpactFeedbackStyle) => {
  try {
    await Haptics.impactAsync(style);
  } catch (_) {}
};

export const safeNotification = async (type: Haptics.NotificationFeedbackType) => {
  try {
    await Haptics.notificationAsync(type);
  } catch (_) {}
};

export const safeSelection = async () => {
  try {
    await Haptics.selectionAsync();
  } catch (_) {}
};
