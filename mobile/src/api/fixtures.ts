import { NEIGHBORHOODS } from "../../../lib/constants";
import type { PromoRule } from "../../../lib/pricing";
import type {
  AppNotification,
  BookingRecord,
  Catalog,
  Category,
  ClassDetail,
  ClassSession,
  FaqItem,
  LedgerEntry,
  NotificationPreferences,
  StudentUser,
  SupportTicket,
  TeacherProfile,
  Vertical,
  WalletMembership,
  WalletPack,
} from "./types";

export const DEMO_EMAIL = "student@becreative.demo";
export const DEMO_PASSWORD = "DemoPass123!";
export const DEMO_USER_ID = "user-student";
export const DEMO_TOKEN = "mock:user-student";
export const VERIFY_CODE = "123456";

const place = (name: string) => {
  const found = NEIGHBORHOODS.find((item) => item.name === name);
  if (!found) throw new Error(`Unknown neighborhood ${name}`);
  return found;
};

function at(now: Date, days: number, hour: number, minute = 0): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function session(id: string, starts: Date, minutes: number, capacity: number, confirmed: number): ClassSession {
  return {
    id,
    startsAt: starts.toISOString(),
    endsAt: new Date(starts.getTime() + minutes * 60_000).toISOString(),
    localDate: ymd(starts),
    status: "scheduled",
    capacity,
    confirmedCount: confirmed,
  };
}

const waiverBody =
  "This class is taught by an independent teacher. BeCreative is the booking platform, not the instructor. I will follow the teacher's safety notes and stop if I feel unwell. Wellness sessions (movement, sauna, cold plunge, massage, breathwork) are not medical care. I confirm the name I type is my signature.";

type Seed = {
  slug: string;
  title: string;
  teacherId: string;
  teacherSlug: string;
  teacherName: string;
  bio: string;
  categorySlug: string;
  categoryName: string;
  categoryId: string;
  vertical: Vertical;
  neighborhood: string;
  skillLevel: string;
  format: string;
  delivery: "in_person" | "virtual";
  minutes: number;
  size: number;
  price: number | null;
  series?: number | null;
  seriesBook?: boolean;
  firstFree?: boolean;
  offering?: ClassDetail["offeringKind"];
  description: string;
  outcomes: string;
  bring: string;
  hue: number;
  days: number[];
  hour: number;
  capacityLeft?: number[];
};

const seeds: Seed[] = [
  { slug: "scene-study", title: "Scene Study", teacherId: "teacher-maya", teacherSlug: "maya-alvarez", teacherName: "Maya Alvarez", bio: "Scene work for actors who want to stop indicating.", categorySlug: "acting", categoryName: "Acting", categoryId: "cat-acting", vertical: "creative", neighborhood: "Silver Lake", skillLevel: "intermediate", format: "series", delivery: "in_person", minutes: 120, size: 12, price: 3600, series: 24000, seriesBook: true, firstFree: true, description: "Eight weeks of scene work in a small room. You bring sides, you leave with a choice you can repeat.", outcomes: "hold a scene without indicating.", bring: "the sides, water, and shoes you can move in.", hue: 18, days: [3, 10, 17, 24], hour: 19 },
  { slug: "cold-read", title: "Cold Read Lab", teacherId: "teacher-maya", teacherSlug: "maya-alvarez", teacherName: "Maya Alvarez", bio: "Scene work for actors who want to stop indicating.", categorySlug: "acting", categoryName: "Acting", categoryId: "cat-acting", vertical: "creative", neighborhood: "Silver Lake", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 90, size: 10, price: 2800, description: "A new set of sides every week. Make a choice in the first ten seconds.", outcomes: "make a choice in the first ten seconds.", bring: "nothing. Sides are printed.", hue: 28, days: [5, 12], hour: 18 },
  { slug: "harold-night", title: "Harold Night", teacherId: "teacher-jordan", teacherSlug: "jordan-hale", teacherName: "Jordan Hale", bio: "Long-form comedy for people who already like each other a little.", categorySlug: "comedy", categoryName: "Comedy", categoryId: "cat-comedy", vertical: "creative", neighborhood: "Hollywood", skillLevel: "intermediate", format: "drop_in", delivery: "in_person", minutes: 90, size: 14, price: 2200, description: "A Harold for performers who want the game to last longer than the laugh.", outcomes: "follow a game past the laugh.", bring: "soft shoes.", hue: 42, days: [2, 9], hour: 20 },
  { slug: "song-as-scene", title: "Song as Scene", teacherId: "teacher-riley", teacherSlug: "riley-park", teacherName: "Riley Park", bio: "Songs that do something, not songs that pose.", categorySlug: "music", categoryName: "Music", categoryId: "cat-music", vertical: "creative", neighborhood: "Los Feliz", skillLevel: "intermediate", format: "drop_in", delivery: "in_person", minutes: 90, size: 10, price: 3600, description: "Bring a song. Treat it like a scene with a stake.", outcomes: "the song does something.", bring: "sheet music or a track.", hue: 200, days: [6, 13], hour: 15 },
  { slug: "sunday-hip-hop", title: "Sunday Hip-hop", teacherId: "teacher-nia", teacherSlug: "nia-brooks", teacherName: "Nia Brooks", bio: "Grooves you can take to an audition on Monday.", categorySlug: "dance", categoryName: "Dance", categoryId: "cat-dance", vertical: "creative", neighborhood: "Echo Park", skillLevel: "beginner", format: "drop_in", delivery: "in_person", minutes: 75, size: 16, price: 2500, description: "A beginner hip-hop class with live counts and no shame in the back row.", outcomes: "a phrase you can remember.", bring: "sneakers that are not brand new.", hue: 330, days: [4, 11], hour: 11 },
  { slug: "life-drawing", title: "Life Drawing", teacherId: "teacher-sofia", teacherSlug: "sofia-marin", teacherName: "Sofia Marin", bio: "Short poses, long looking.", categorySlug: "art", categoryName: "Art", categoryId: "cat-art", vertical: "creative", neighborhood: "Venice", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 150, size: 12, price: 3000, description: "Gesture and a longer pose. Paper is in the room.", outcomes: "see the weight, not the outline.", bring: "charcoal if you have a favorite.", hue: 12, days: [7], hour: 14 },
  { slug: "decks-101", title: "Decks 101", teacherId: "teacher-devon", teacherSlug: "devon-cho", teacherName: "Devon Cho", bio: "Beatmatching without the myth.", categorySlug: "dj", categoryName: "DJ", categoryId: "cat-dj", vertical: "creative", neighborhood: "Santa Monica", skillLevel: "beginner", format: "workshop", delivery: "in_person", minutes: 120, size: 8, price: 5500, description: "Two decks, one afternoon, a mix you can play for a friend.", outcomes: "beatmatch a chorus.", bring: "headphones.", hue: 265, days: [8], hour: 13 },
  { slug: "window-light", title: "Window Light Portraits", teacherId: "teacher-sofia", teacherSlug: "sofia-marin", teacherName: "Sofia Marin", bio: "Short poses, long looking.", categorySlug: "photo", categoryName: "Photo", categoryId: "cat-photo", vertical: "creative", neighborhood: "Venice", skillLevel: "beginner", format: "workshop", delivery: "in_person", minutes: 180, size: 8, price: 7000, description: "Natural light only. You leave with a setup you can repeat in an apartment.", outcomes: "a portrait that isn't flat.", bring: "a camera or a phone.", hue: 80, days: [9], hour: 10 },
  { slug: "sunrise-flow", title: "Sunrise Flow", teacherId: "teacher-lena", teacherSlug: "lena-ortiz", teacherName: "Lena Ortiz", bio: "Slow mornings, honest effort.", categorySlug: "yoga", categoryName: "Yoga", categoryId: "cat-yoga", vertical: "wellness", neighborhood: "Echo Park", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 60, size: 14, price: 2200, firstFree: true, description: "A quiet vinyasa before the day gets loud. All levels, with a wall nearby.", outcomes: "leave looser than you arrived.", bring: "a mat if you have one. Loaners are in the corner.", hue: 150, days: [1, 4, 8], hour: 8 },
  { slug: "sound-bath", title: "Evening Sound Bath", teacherId: "teacher-lena", teacherSlug: "lena-ortiz", teacherName: "Lena Ortiz", bio: "Slow mornings, honest effort.", categorySlug: "sound-baths", categoryName: "Sound baths", categoryId: "cat-sound", vertical: "wellness", neighborhood: "Los Feliz", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 75, size: 18, price: 3000, description: "Bowls, a blanket, and an hour where nobody asks you to produce anything.", outcomes: "a slower nervous system.", bring: "socks.", hue: 170, days: [6], hour: 19 },
  { slug: "restorative-massage", title: "Restorative Massage", teacherId: "teacher-amira", teacherSlug: "amira-hassan", teacherName: "Amira Hassan", bio: "Unhurried bodywork in a quiet room.", categorySlug: "massage", categoryName: "Massage", categoryId: "cat-massage", vertical: "wellness", neighborhood: "Los Feliz", skillLevel: "all_levels", format: "private_lesson", delivery: "in_person", minutes: 60, size: 1, price: 12000, offering: "appointment", description: "A 60-minute session. Add stones, aromatherapy, or extra time when you book.", outcomes: "shoulders that drop.", bring: "nothing. The table is ready.", hue: 130, days: [2, 3, 4], hour: 11 },
  { slug: "sit-for-twenty", title: "Sit for Twenty", teacherId: "teacher-lena", teacherSlug: "lena-ortiz", teacherName: "Lena Ortiz", bio: "Slow mornings, honest effort.", categorySlug: "meditation", categoryName: "Meditation", categoryId: "cat-meditation", vertical: "wellness", neighborhood: "Echo Park", skillLevel: "beginner", format: "drop_in", delivery: "in_person", minutes: 30, size: 20, price: 0, description: "A free twenty-minute sit with a short talk at the end. No one checks your posture.", outcomes: "practice sitting still.", bring: "a cushion if you want one.", hue: 160, days: [3, 10], hour: 7 },
  { slug: "cedar-sauna", title: "Cedar Sauna", teacherId: "teacher-noah", teacherSlug: "noah-park", teacherName: "Noah Park", bio: "Heat, cold, and a place to lie down after.", categorySlug: "sauna", categoryName: "Sauna", categoryId: "cat-sauna", vertical: "wellness", neighborhood: "Venice", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 45, size: 8, price: 3500, offering: "capacity", description: "Reserve a spot in the cedar room. Capacity is the whole point: it stays quiet.", outcomes: "heat without a crowd.", bring: "a towel and water.", hue: 20, days: [1, 2, 3], hour: 16, capacityLeft: [2, 5, 0] },
  { slug: "cold-plunge", title: "Cold Plunge", teacherId: "teacher-noah", teacherSlug: "noah-park", teacherName: "Noah Park", bio: "Heat, cold, and a place to lie down after.", categorySlug: "cold-plunge", categoryName: "Cold plunge", categoryId: "cat-plunge", vertical: "wellness", neighborhood: "Venice", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 20, size: 4, price: 1800, offering: "capacity", description: "A guided three-minute plunge with a warm room after. Spots are limited.", outcomes: "a calm exit, not a performance.", bring: "a swimsuit.", hue: 190, days: [1, 2], hour: 17, capacityLeft: [3, 1] },
  { slug: "mobility-stretch", title: "Mobility Stretch", teacherId: "teacher-lena", teacherSlug: "lena-ortiz", teacherName: "Lena Ortiz", bio: "Slow mornings, honest effort.", categorySlug: "stretching", categoryName: "Stretching", categoryId: "cat-stretch", vertical: "wellness", neighborhood: "Silver Lake", skillLevel: "all_levels", format: "drop_in", delivery: "in_person", minutes: 50, size: 12, price: 2000, description: "Hips, spine, and the parts that sit all day. No choreography.", outcomes: "stand up taller.", bring: "clothes you can lie down in.", hue: 140, days: [5], hour: 12 },
];

export function fixturePromos(): PromoRule[] {
  return [
    {
      code: "BECREATIVE15",
      active: true,
      discountType: "percent",
      percentOffBps: 1500,
      amountOffCents: 0,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      maxPerCustomer: 1,
      firstTimeOnly: false,
      minPurchaseCents: 0,
      funding: "platform",
      platformSharePercent: 100,
      appliesTo: "all",
      teacherId: null,
      classIds: [],
      categoryIds: [],
      packIds: [],
      membershipIds: [],
      cities: [],
    },
    {
      code: "MAYA10",
      active: true,
      discountType: "fixed",
      percentOffBps: 0,
      amountOffCents: 1000,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      maxPerCustomer: null,
      firstTimeOnly: false,
      minPurchaseCents: 0,
      funding: "teacher",
      platformSharePercent: 0,
      appliesTo: "classes",
      teacherId: "teacher-maya",
      classIds: [],
      categoryIds: [],
      packIds: [],
      membershipIds: [],
      cities: [],
    },
  ];
}

export type FixtureWorld = {
  now: Date;
  catalog: Catalog;
  classes: ClassDetail[];
  user: StudentUser;
  introUsed: Set<string>;
  bookings: BookingRecord[];
  packs: WalletPack[];
  memberships: WalletMembership[];
  ledger: LedgerEntry[];
  notifications: AppNotification[];
  preferences: NotificationPreferences;
  tickets: SupportTicket[];
  promos: PromoRule[];
};

export function buildFixtures(now = new Date()): FixtureWorld {
  const categories: Category[] = [
    { id: "cat-acting", slug: "acting", name: "Acting", parentId: null, vertical: "creative" },
    { id: "cat-comedy", slug: "comedy", name: "Comedy", parentId: null, vertical: "creative" },
    { id: "cat-music", slug: "music", name: "Music", parentId: null, vertical: "creative" },
    { id: "cat-dance", slug: "dance", name: "Dance", parentId: null, vertical: "creative" },
    { id: "cat-art", slug: "art", name: "Art", parentId: null, vertical: "creative" },
    { id: "cat-dj", slug: "dj", name: "DJ", parentId: null, vertical: "creative" },
    { id: "cat-photo", slug: "photo", name: "Photo", parentId: null, vertical: "creative" },
    { id: "cat-yoga", slug: "yoga", name: "Yoga", parentId: null, vertical: "wellness" },
    { id: "cat-sound", slug: "sound-baths", name: "Sound baths", parentId: null, vertical: "wellness" },
    { id: "cat-massage", slug: "massage", name: "Massage", parentId: null, vertical: "wellness" },
    { id: "cat-meditation", slug: "meditation", name: "Meditation", parentId: null, vertical: "wellness" },
    { id: "cat-sauna", slug: "sauna", name: "Sauna", parentId: null, vertical: "wellness" },
    { id: "cat-plunge", slug: "cold-plunge", name: "Cold plunge", parentId: null, vertical: "wellness" },
    { id: "cat-stretch", slug: "stretching", name: "Stretching", parentId: null, vertical: "wellness" },
  ];
  const classes: ClassDetail[] = seeds.map((seed) => {
    const spot = place(seed.neighborhood);
    const sessions = seed.days.map((day, index) => {
      const starts = at(now, day, seed.hour);
      const left = seed.capacityLeft?.[index];
      const confirmed = left == null ? 2 : Math.max(0, seed.size - left);
      return session(`sess-${seed.slug}-${index}`, starts, seed.minutes, seed.size, confirmed);
    });
    const slots = seed.offering === "appointment" || seed.offering === "capacity" ? sessions.map((item) => ({
      id: `slot-${item.id}`,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      remaining: Math.max(0, item.capacity - item.confirmedCount),
      priceCents: seed.price ?? 0,
    })) : [];
    const teacher: ClassDetail["teacher"] = {
      id: seed.teacherId,
      slug: seed.teacherSlug,
      studioName: seed.teacherName,
      bio: seed.bio,
      specialties: [seed.categoryName],
      instagram: null,
      website: null,
      neighborhood: seed.neighborhood,
    };
    return {
      id: `class-${seed.slug}`,
      slug: seed.slug,
      title: seed.title,
      description: seed.description,
      outcomes: seed.outcomes,
      prerequisites: "",
      whatToBring: seed.bring,
      skillLevel: seed.skillLevel,
      format: seed.format,
      delivery: seed.delivery,
      durationMinutes: seed.minutes,
      maxSize: seed.size,
      pricePerSessionCents: seed.price,
      pricePerSeriesCents: seed.series ?? null,
      seriesBookingEnabled: Boolean(seed.seriesBook),
      firstClassFree: Boolean(seed.firstFree),
      vertical: seed.vertical,
      offeringKind: seed.offering ?? "class",
      categorySlug: seed.categorySlug,
      categoryName: seed.categoryName,
      coverHue: seed.hue,
      teacher,
      location: { neighborhood: spot.name, city: "Los Angeles", lat: spot.lat, lng: spot.lng, addressLine1: `${spot.name} studio` },
      sessions: seed.offering ? [] : sessions,
      slots,
      addons: seed.offering === "appointment" ? [
        { id: "addon-stones", name: "Hot stones", priceCents: 1500, minutes: 0 },
        { id: "addon-aroma", name: "Aromatherapy", priceCents: 1000, minutes: 0 },
        { id: "addon-extra", name: "Extra 15 minutes", priceCents: 2500, minutes: 15 },
      ] : [],
      waiver: { required: true, title: "Student waiver", body: waiverBody },
      introAlreadyUsed: false,
      reviews: [{ id: `rev-${seed.slug}`, rating: 5, body: "Small room, clear notes, no rush.", author: "A student" }],
      packs: seed.categorySlug === "acting" ? [{ id: "pack-scene-5", slug: "scene-5", name: "5-class pack", description: "Five drop-in credits for Maya's acting classes.", creditCount: 5, priceCents: 14000, expiryDays: 90 }] : [],
      memberships: seed.categorySlug === "yoga" ? [{ id: "mem-bewell", slug: "bewell-monthly", name: "BeWell monthly", description: "Four wellness classes a month with Lena.", termMonths: 1, priceCents: 7200, classesPerPeriod: 4, unlimited: false, pauseCancelPolicy: "Cancel before the next renewal." }] : [],
    };
  });

  const cold = classes.find((item) => item.slug === "cold-read")!;
  const harold = classes.find((item) => item.slug === "harold-night")!;
  const bookings: BookingRecord[] = [
    {
      id: "book-cold",
      classSlug: cold.slug,
      classTitle: cold.title,
      teacherName: cold.teacher.studioName || "Teacher",
      kind: "session",
      status: "confirmed",
      startsAt: cold.sessions[0].startsAt,
      endsAt: cold.sessions[0].endsAt,
      location: "Silver Lake",
      sessionId: cold.sessions[0].id,
      slotId: null,
      partySize: 1,
      orderId: "order-cold",
    },
    {
      id: "book-harold",
      classSlug: harold.slug,
      classTitle: harold.title,
      teacherName: harold.teacher.studioName || "Teacher",
      kind: "session",
      status: "confirmed",
      startsAt: at(now, 0, now.getHours() + 2).toISOString(),
      endsAt: at(now, 0, now.getHours() + 3, 30).toISOString(),
      location: "Hollywood",
      sessionId: harold.sessions[0].id,
      slotId: null,
      partySize: 1,
      orderId: "order-harold",
    },
  ];

  return {
    now,
    catalog: { categories, neighborhoods: NEIGHBORHOODS.map((item) => ({ ...item })), feePercent: 10, feeFixedCents: 0 },
    classes,
    user: {
      id: DEMO_USER_ID,
      name: "Sam Rivera",
      email: DEMO_EMAIL,
      emailVerified: true,
      phone: "+13105550100",
      smsOptIn: false,
      imageUrl: null,
    },
    introUsed: new Set([`${DEMO_USER_ID}:teacher-maya`]),
    bookings,
    packs: [
      {
        id: "purchase-scene-5",
        packId: "pack-scene-5",
        name: "5-class pack",
        teacherName: "Maya Alvarez",
        creditsTotal: 5,
        creditsRemaining: 3,
        expiresAt: new Date(now.getTime() + 60 * 86400000).toISOString(),
        classSlugs: ["scene-study", "cold-read"],
        categorySlugs: ["acting"],
      },
    ],
    memberships: [
      {
        id: "sub-bewell",
        membershipId: "mem-bewell",
        name: "BeWell monthly",
        teacherName: "Lena Ortiz",
        status: "active",
        currentPeriodEnd: new Date(now.getTime() + 20 * 86400000).toISOString(),
        classesPerPeriod: 4,
        classesUsedThisPeriod: 1,
        unlimited: false,
        classSlugs: ["sunrise-flow", "sound-bath", "sit-for-twenty", "mobility-stretch"],
        categorySlugs: ["yoga", "sound-baths", "meditation", "stretching"],
      },
    ],
    ledger: [
      { id: "led-1", direction: "debit", sourceType: "pack", label: "Spent 1 credit on Cold Read Lab", createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() },
      { id: "led-2", direction: "credit", sourceType: "pack", label: "Restored 1 credit after a cancel", createdAt: new Date(now.getTime() - 4 * 86400000).toISOString() },
    ],
    notifications: [
      { id: "note-1", title: "Seat reserved", body: "Cold Read Lab is on your calendar this week.", read: false, createdAt: new Date(now.getTime() - 3600_000).toISOString(), href: "/bookings" },
      { id: "note-2", title: "BeWell", body: "Sunrise Flow has three spots tomorrow morning.", read: true, createdAt: new Date(now.getTime() - 86400000).toISOString(), href: "/c/sunrise-flow" },
    ],
    preferences: { pushBookings: true, pushReminders: true, pushMarketing: false, smsOptIn: false },
    tickets: [],
    promos: fixturePromos(),
  };
}

export function teacherProfile(world: FixtureWorld, slug: string): TeacherProfile | null {
  const owned = world.classes.filter((item) => item.teacher.slug === slug);
  if (!owned.length) return null;
  const teacher = owned[0].teacher;
  return {
    ...teacher,
    vertical: owned[0].vertical,
    neighborhood: teacher.neighborhood,
    classes: owned.map(toCard),
    packs: owned.flatMap((item) => item.packs).filter((pack, index, list) => list.findIndex((other) => other.id === pack.id) === index),
    memberships: owned.flatMap((item) => item.memberships).filter((plan, index, list) => list.findIndex((other) => other.id === plan.id) === index),
  };
}

export function toCard(detail: ClassDetail) {
  const next = [...detail.sessions, ...detail.slots.map((slot) => ({ startsAt: slot.startsAt }))]
    .map((item) => item.startsAt)
    .sort()[0] ?? null;
  return {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    teacherName: detail.teacher.studioName || "Teacher",
    teacherSlug: detail.teacher.slug,
    vertical: detail.vertical,
    categorySlug: detail.categorySlug,
    categoryName: detail.categoryName,
    neighborhood: detail.location?.neighborhood ?? null,
    lat: detail.location?.lat ?? null,
    lng: detail.location?.lng ?? null,
    delivery: detail.delivery,
    format: detail.format,
    skillLevel: detail.skillLevel,
    durationMinutes: detail.durationMinutes,
    pricePerSessionCents: detail.pricePerSessionCents,
    pricePerSeriesCents: detail.pricePerSeriesCents,
    firstClassFree: detail.firstClassFree,
    nextStartsAt: next,
    offeringKind: detail.offeringKind,
    coverHue: detail.coverHue,
  };
}
