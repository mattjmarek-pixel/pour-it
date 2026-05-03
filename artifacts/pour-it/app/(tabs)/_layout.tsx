import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { MODE_COLORS } from "@/constants/colors";

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#0D0D14",
          borderTopWidth: 0,
          elevation: 0,
          height: isWeb ? 72 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(10,10,15,0.72)" },
              ]}
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: "#0D0D14" }]}
            />
          ),
        tabBarLabelStyle: {
          fontFamily: "DMSans_500Medium",
          fontSize: 11,
          marginBottom: 4,
        },
        tabBarInactiveTintColor: "rgba(255,255,255,0.35)",
      }}
    >
      <Tabs.Screen
        name="spirits"
        options={{
          title: "Spirits",
          tabBarActiveTintColor: MODE_COLORS.spirits,
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="wineglass" tintColor={color} size={size} />
            ) : (
              <Feather name="coffee" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="thc"
        options={{
          title: "THC",
          tabBarActiveTintColor: MODE_COLORS.thc,
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="leaf" tintColor={color} size={size} />
            ) : (
              <Feather name="feather" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="mocktails"
        options={{
          title: "Mocktails",
          tabBarActiveTintColor: MODE_COLORS.mocktails,
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="drop" tintColor={color} size={size} />
            ) : (
              <Feather name="droplet" size={size} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarActiveTintColor: "#EF4444",
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="heart" tintColor={color} size={size} />
            ) : (
              <Feather name="heart" size={size} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}
