import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { googleCalendarLink, type CalendarEvent } from "../booking/flow";

export async function addToCalendar(event: CalendarEvent): Promise<"added" | "opened"> {
  if (Platform.OS === "web") {
    await Linking.openURL(googleCalendarLink(event));
    return "opened";
  }
  const Calendar = await import("expo-calendar");
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    await Linking.openURL(googleCalendarLink(event));
    return "opened";
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendar = calendars.find((item) => item.allowsModifications) ?? calendars[0];
  if (!calendar) {
    await Linking.openURL(googleCalendarLink(event));
    return "opened";
  }
  await Calendar.createEventAsync(calendar.id, {
    title: event.title,
    startDate: event.startsAt,
    endDate: event.endsAt,
    location: event.location,
    notes: event.details,
    timeZone: "America/Los_Angeles",
  });
  return "added";
}
