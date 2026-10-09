import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PublicClass, Vertical } from "@mobile/api/types";
import { ClassCardView } from "@mobile/components/ClassCardView";
import { MapCanvas } from "@mobile/components/MapCanvas";
import { Body, Button, Chip, Display, Segmented, Sheet } from "@mobile/components/ui";
import { matchesLocalDay } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function Explore() {
  const router = useRouter();
  const { api, vertical, setVertical, track } = useSession();
  const { colors, fonts } = useAppTheme();
  const [rows, setRows] = useState<PublicClass[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [date, setDate] = useState("");
  const [maxPriceCents, setMaxPriceCents] = useState<number | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);

  useEffect(() => {
    void track("screen_view", { screen: "explore" });
  }, [track]);

  useEffect(() => {
    void api.explore({ q, vertical }).then((result) => setRows(result.classes));
  }, [api, q, vertical]);

  const chips = useMemo(() => [...new Set(rows.map((item) => item.category).filter((item): item is string => Boolean(item)))], [rows]);
  const classes = rows.filter((item) => {
    if (category && item.category !== category) return false;
    if (maxPriceCents != null && (item.priceCents ?? 0) > maxPriceCents) return false;
    if (freeOnly && item.priceCents !== 0) return false;
    if (date && item.nextStartsAt && !matchesLocalDay(item.nextStartsAt, date)) return false;
    return true;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}>
        <Display testID="explore-title">Explore</Display>
        <Segmented
          value={vertical}
          onChange={(id) => {
            setVertical(id as Vertical);
            setCategory(null);
            void track("filter_used", { vertical: id });
          }}
          options={[{ id: "creative", label: "Creative" }, { id: "wellness", label: "BeWell" }]}
        />
        <TextInput
          accessibilityLabel="Search classes"
          testID="search"
          value={q}
          onChangeText={setQ}
          placeholder={vertical === "wellness" ? "Search yoga, sauna, massage" : "Search classes"}
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => void track("search", { q })}
          style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.ink, fontFamily: fonts.body, fontSize: 16 }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
          {chips.map((item) => (
            <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Segmented value={view} onChange={(id) => setView(id as "list" | "map")} options={[{ id: "list", label: "List" }, { id: "map", label: "Map" }]} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Filters" onPress={() => setFiltersOpen(true)} style={{ minWidth: 48, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <Text style={{ fontFamily: fonts.medium, color: colors.ink }}>Filter</Text>
          </Pressable>
        </View>
        <Body muted>{classes.length} classes</Body>
        {view === "map" ? <MapCanvas classes={classes} onOpen={(slug) => router.push(`/c/${slug}`)} /> : null}
        <View style={{ gap: 12 }} testID="class-list">
          {classes.map((item) => (
            <ClassCardView key={item.id} item={item} onPress={() => router.push(`/c/${item.slug}`)} />
          ))}
        </View>
        {!classes.length ? <Body muted>Nothing matches those filters. Clear one and look again.</Body> : null}
      </ScrollView>
      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <Body>Date (YYYY-MM-DD)</Body>
          <TextInput accessibilityLabel="Date" value={date} onChangeText={setDate} placeholder="2026-10-18" placeholderTextColor={colors.muted} style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, color: colors.ink }} />
          <Body>Price</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[{ id: "any", label: "Any", cents: null }, { id: "25", label: "Under $25", cents: 2500 }, { id: "40", label: "Under $40", cents: 4000 }, { id: "80", label: "Under $80", cents: 8000 }].map((item) => (
              <Chip key={item.id} label={item.label} selected={maxPriceCents === item.cents} onPress={() => setMaxPriceCents(item.cents)} />
            ))}
          </View>
          <Chip label="Free" selected={freeOnly} onPress={() => setFreeOnly((value) => !value)} />
          <Button label="Show classes" onPress={() => setFiltersOpen(false)} />
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}
