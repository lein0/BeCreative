import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "../theme/theme";

const BOUNDS = { north: 34.22, south: 33.95, east: -118.1, west: -118.55 };

function project(lat: number, lng: number) {
  const x = (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
  const y = (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south);
  return { left: `${Math.min(92, Math.max(4, x * 100))}%` as const, top: `${Math.min(88, Math.max(6, y * 100))}%` as const };
}

export function MapCanvas({ classes, onOpen }: { classes: { id: string; slug: string; title: string; lat?: number | null; lng?: number | null; neighborhood?: string | null }[]; onOpen: (slug: string) => void }) {
  const { colors, fonts } = useAppTheme();
  const pins = classes.filter((item) => item.lat != null && item.lng != null);
  return (
    <View accessibilityLabel="Map of classes in Los Angeles" style={{ height: 320, borderRadius: 24, backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.line, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 13, position: "absolute", left: 16, top: 16 }}>Los Angeles</Text>
      {!pins.length ? <Text style={{ fontFamily: fonts.body, color: colors.ink, textAlign: "center" }}>These classes don't include a map pin yet. The list has the next date and the price.</Text> : null}
      {pins.map((item) => {
        const point = project(item.lat!, item.lng!);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => onOpen(item.slug)}
            style={{ position: "absolute", left: point.left, top: point.top, minHeight: 44, maxWidth: 140, borderRadius: 999, backgroundColor: colors.accent, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }}
          >
            <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: colors.onAccent, fontSize: 12 }}>{item.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
