import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { NEIGHBORHOODS } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  account,
  availabilityWindows,
  bookings,
  bookingSessions,
  categories,
  classes,
  classMedia,
  credentials,
  creditLedger,
  feedback,
  feedbackDeliveries,
  feedbackEvents,
  leads,
  leadActivities,
  linkClicks,
  locations,
  memberships,
  membershipSubscriptions,
  cannedReplies,
  disputes,
  faqArticles,
  notifications,
  ticketMessages,
  tickets,
  orders,
  packPurchases,
  packs,
  payouts,
  platformSettings,
  promoCodes,
  promoRedemptions,
  recurrences,
  reviews,
  serviceAddons,
  serviceOptions,
  services,
  sessions,
  teachers,
  user,
  userRoles,
  visitBookings,
  waiverSignatures,
  waivers,
} from "@/lib/db/schema";
import { FAQ_ARTICLES } from "@/lib/faq";
import { quotePrice } from "@/lib/pricing";
import { syncRule } from "@/lib/studio-service";
import { zonedTimeToUtc } from "@/lib/time";
import { slugify } from "@/lib/utils";
import { ensureBootstrapAdmins } from "@/lib/admins";
import { putStoredObject } from "@/lib/storage";
import { wipeDemo } from "./wipe-demo";

const PASSWORD = "DemoPass123!";

type TeacherSeed = {
  email: string;
  name: string;
  slug: string;
  studio: string;
  neighborhood: string;
  specialties: string[];
  bio: string;
  hue: number;
  status?: string;
  instagram?: string;
  roles: ("teacher" | "student" | "admin" | "account_manager")[];
  firstFree?: boolean;
};

const teacherSeeds: TeacherSeed[] = [
  { email: "teacher@becreative.demo", name: "Maya Alvarez", slug: "maya-alvarez", studio: "Maya Alvarez Studio", neighborhood: "Silver Lake", specialties: ["Acting", "Scene study"], bio: "Scene study and on-camera work for actors who want a room that feels like a company, not a drop-in mill.", hue: 16, instagram: "@maya.acts", roles: ["teacher", "student"], firstFree: true },
  { email: "jordan@becreative.demo", name: "Jordan Hale", slug: "jordan-hale", studio: "Hale Improv", neighborhood: "Hollywood", specialties: ["Improv"], bio: "Long-form improv for people who are tired of being told to just say yes.", hue: 28, instagram: "@haleimprov", roles: ["teacher", "student"] },
  { email: "priya@becreative.demo", name: "Priya Shah", slug: "priya-shah", studio: "Shah Voice Lab", neighborhood: "Burbank", specialties: ["Voice"], bio: "Contemporary voice, mic technique, and the unglamorous work of singing in tune on purpose.", hue: 200, instagram: "@shahvoice", roles: ["teacher", "student"], firstFree: true },
  { email: "luis@becreative.demo", name: "Luis Ortega", slug: "luis-ortega", studio: "Ortega Guitar", neighborhood: "Echo Park", specialties: ["Guitar"], bio: "Fingerstyle and song accompaniment for adults starting over.", hue: 32, roles: ["teacher", "student"] },
  { email: "hannah@becreative.demo", name: "Hannah Cho", slug: "hannah-cho", studio: "Cho Piano", neighborhood: "Studio City", specialties: ["Piano"], bio: "Classical foundations with room for the songs you actually want to play.", hue: 250, roles: ["teacher", "student"] },
  { email: "andre@becreative.demo", name: "Andre Williams", slug: "andre-williams", studio: "Williams Vocals", neighborhood: "North Hollywood", specialties: ["Vocals"], bio: "R&B and musical theatre vocals. Breath, placement, and not apologizing for the high notes.", hue: 340, roles: ["teacher", "student"] },
  { email: "camila@becreative.demo", name: "Camila Reyes", slug: "camila-reyes", studio: "Reyes Hip-Hop", neighborhood: "Hollywood", specialties: ["Hip-hop"], bio: "Choreography lab for dancers who want combinations they can film the same night.", hue: 4, instagram: "@reyeshiphop", roles: ["teacher", "student"] },
  { email: "nina@becreative.demo", name: "Nina Petrova", slug: "nina-petrova", studio: "Petrova Ballet", neighborhood: "Los Feliz", specialties: ["Ballet"], bio: "Adult ballet that respects your knees and still asks for a clean fifth.", hue: 280, roles: ["teacher", "student"] },
  { email: "diego@becreative.demo", name: "Diego Morales", slug: "diego-morales", studio: "Morales Salsa", neighborhood: "Echo Park", specialties: ["Salsa"], bio: "On1 salsa for couples and singles. Social floor skills, not competition arms.", hue: 12, roles: ["teacher", "student"] },
  { email: "aisha@becreative.demo", name: "Aisha Bennett", slug: "aisha-bennett", studio: "Bennett Painting", neighborhood: "Venice", specialties: ["Painting"], bio: "Oil and acrylic for people who want a painting, not a paint night.", hue: 48, roles: ["teacher", "student"], firstFree: true },
  { email: "theo@becreative.demo", name: "Theo Lang", slug: "theo-lang", studio: "Lang Ceramics", neighborhood: "Highland Park", specialties: ["Ceramics"], bio: "Wheel throwing in a small studio. Clay under your nails is part of the tuition.", hue: 24, roles: ["teacher", "student"] },
  { email: "sofia@becreative.demo", name: "Sofia Marin", slug: "sofia-marin", studio: "Marin Photography", neighborhood: "Santa Monica", specialties: ["Photography"], bio: "Natural light portraits and the edit that comes after the walk.", hue: 190, roles: ["teacher", "student"] },
  { email: "elijah@becreative.demo", name: "Elijah Brooks", slug: "elijah-brooks", studio: "Brooks Screenwriting", neighborhood: "Burbank", specialties: ["Screenwriting"], bio: "Feature structure for writers who already have a draft and need a reader.", hue: 210, roles: ["teacher", "student"] },
  { email: "naomi@becreative.demo", name: "Naomi Feldman", slug: "naomi-feldman", studio: "Feldman Poetry", neighborhood: "Los Feliz", specialties: ["Poetry"], bio: "Workshop for poems that want to be read out loud, not just posted.", hue: 300, roles: ["teacher", "student"] },
  { email: "chris@becreative.demo", name: "Chris Dalton", slug: "chris-dalton", studio: "Dalton On Camera", neighborhood: "Studio City", specialties: ["On camera"], bio: "Self-tape and commercial on-camera. The frame is small. The choices are not.", hue: 220, roles: ["teacher", "student"] },
  { email: "riley@becreative.demo", name: "Riley Park", slug: "riley-park", studio: "Park Musical Theatre", neighborhood: "Hollywood", specialties: ["Musical theatre"], bio: "Song interpretation for actors who sing and singers who act.", hue: 350, roles: ["teacher", "student"] },
  { email: "amara@becreative.demo", name: "Amara Singh", slug: "amara-singh", studio: "Singh Contemporary", neighborhood: "Silver Lake", specialties: ["Contemporary"], bio: "Floorwork and phrase work. Come warm. Leave tired in a useful way.", hue: 140, roles: ["teacher", "student"] },
  { email: "ben@becreative.demo", name: "Ben Okonkwo", slug: "ben-okonkwo", studio: "Okonkwo Songs", neighborhood: "Pasadena", specialties: ["Songwriting"], bio: "Co-writing circle. Bring a title or a bad chorus. Leave with a better one.", hue: 36, roles: ["teacher", "student"] },
  { email: "lila@becreative.demo", name: "Lila Nguyen", slug: "lila-nguyen", studio: "Nguyen Clay", neighborhood: "Highland Park", specialties: ["Ceramics"], bio: "Handbuilding and surface. Pending approval, drafts only.", hue: 60, status: "pending", roles: ["teacher", "student"] },
];

const staff = [
  { email: "admin@becreative.demo", name: "Avery Chen", roles: ["admin", "student"] as const },
  { email: "manager@becreative.demo", name: "Sam Ortiz", roles: ["account_manager", "student"] as const },
  { email: "student@becreative.demo", name: "Jules Navarro", roles: ["student"] as const },
  { email: "ava@becreative.demo", name: "Ava Chen", roles: ["student"] as const },
  { email: "noah@becreative.demo", name: "Noah Brooks", roles: ["student"] as const },
];

type ClassSeed = {
  teacher: string;
  title: string;
  category: string;
  sub: string;
  level: string;
  format: string;
  delivery: "in_person" | "virtual";
  price: number;
  series?: number;
  size: number;
  minutes: number;
  featured?: boolean;
  firstFree?: boolean;
  seriesBook?: boolean;
  days?: [number, string][];
  frequency?: "weekly" | "biweekly" | "monthly";
  end?: "never" | "after";
  count?: number;
  once?: string;
  outcomes: string;
  bring: string;
};

const classSeeds: ClassSeed[] = [
  { teacher: "maya-alvarez", title: "Scene Study", category: "acting", sub: "scene-study", level: "intermediate", format: "series", delivery: "in_person", price: 36, series: 240, size: 12, minutes: 120, featured: true, firstFree: true, seriesBook: true, days: [[2, "19:00"], [4, "19:00"]], end: "after", count: 8, outcomes: "hold a scene without indicating.", bring: "the sides, water, and shoes you can move in." },
  { teacher: "maya-alvarez", title: "Cold Read Lab", category: "acting", sub: "on-camera", level: "all_levels", format: "drop_in", delivery: "in_person", price: 28, size: 10, minutes: 90, days: [[1, "18:30"]], end: "never", outcomes: "make a choice in the first ten seconds.", bring: "nothing. Sides are printed." },
  { teacher: "maya-alvarez", title: "Self-Tape Sunday", category: "acting", sub: "on-camera", level: "beginner", format: "workshop", delivery: "in_person", price: 65, size: 8, minutes: 180, once: "2026-10-18", featured: true, outcomes: "a usable tape and a setup you can repeat at home.", bring: "a shirt that isn't the wall color." },
  { teacher: "jordan-hale", title: "Harold Night", category: "acting", sub: "improv", level: "intermediate", format: "drop_in", delivery: "in_person", price: 22, size: 14, minutes: 90, days: [[3, "20:00"]], end: "never", outcomes: "follow a game past the laugh.", bring: "soft shoes." },
  { teacher: "jordan-hale", title: "Improv for Actors", category: "acting", sub: "improv", level: "beginner", format: "series", delivery: "in_person", price: 30, series: 160, size: 12, minutes: 90, days: [[6, "11:00"]], frequency: "weekly", end: "after", count: 6, seriesBook: true, outcomes: "listen before you invent.", bring: "curiosity." },
  { teacher: "priya-shah", title: "Voice Foundations", category: "music", sub: "voice", level: "beginner", format: "drop_in", delivery: "in_person", price: 40, size: 8, minutes: 60, firstFree: true, days: [[2, "17:00"], [4, "18:00"]], end: "never", outcomes: "a warm-up you will actually do.", bring: "water and a song you like." },
  { teacher: "priya-shah", title: "Mic Technique", category: "music", sub: "voice", level: "intermediate", format: "workshop", delivery: "in_person", price: 85, size: 6, minutes: 150, once: "2026-11-07", outcomes: "how close is too close.", bring: "lyrics." },
  { teacher: "luis-ortega", title: "Fingerstyle Hour", category: "music", sub: "guitar", level: "intermediate", format: "drop_in", delivery: "in_person", price: 35, size: 6, minutes: 75, days: [[1, "19:00"]], frequency: "biweekly", end: "never", outcomes: "a pattern that survives a capo.", bring: "your guitar." },
  { teacher: "luis-ortega", title: "Songs You Know", category: "music", sub: "guitar", level: "beginner", format: "series", delivery: "in_person", price: 32, series: 180, size: 8, minutes: 75, days: [[6, "10:00"]], end: "after", count: 6, seriesBook: true, outcomes: "three songs all the way through.", bring: "a guitar that stays in tune for ten minutes." },
  { teacher: "hannah-cho", title: "Adult Piano", category: "music", sub: "piano", level: "beginner", format: "drop_in", delivery: "in_person", price: 45, size: 4, minutes: 60, days: [[5, "16:00"]], end: "never", outcomes: "hands that agree with each other.", bring: "nothing. The piano is here." },
  { teacher: "hannah-cho", title: "Repertoire Coaching", category: "music", sub: "piano", level: "advanced", format: "private_lesson", delivery: "in_person", price: 90, size: 1, minutes: 50, days: [[0, "14:00"]], frequency: "monthly", end: "never", outcomes: "one piece, cleaner.", bring: "the score." },
  { teacher: "andre-williams", title: "R&B Vocals", category: "music", sub: "voice", level: "intermediate", format: "drop_in", delivery: "in_person", price: 38, size: 10, minutes: 75, days: [[4, "19:30"]], end: "never", featured: true, outcomes: "riffs that serve the lyric.", bring: "a track on your phone." },
  { teacher: "andre-williams", title: "Audition Cut", category: "music", sub: "voice", level: "advanced", format: "workshop", delivery: "virtual", price: 55, size: 12, minutes: 90, once: "2026-10-25", outcomes: "a 32-bar cut you can defend.", bring: "a quiet room." },
  { teacher: "camila-reyes", title: "Choreo Lab", category: "dance", sub: "hip-hop", level: "intermediate", format: "drop_in", delivery: "in_person", price: 25, size: 20, minutes: 75, days: [[2, "19:00"], [4, "19:00"]], end: "never", featured: true, outcomes: "a combination you can film.", bring: "dance shoes or clean sneakers." },
  { teacher: "camila-reyes", title: "Beginner Grooves", category: "dance", sub: "hip-hop", level: "beginner", format: "drop_in", delivery: "in_person", price: 20, size: 18, minutes: 60, days: [[6, "12:00"]], end: "never", firstFree: true, outcomes: "bounce before steps.", bring: "water." },
  { teacher: "nina-petrova", title: "Adult Ballet", category: "dance", sub: "ballet", level: "beginner", format: "drop_in", delivery: "in_person", price: 28, size: 14, minutes: 75, days: [[1, "09:30"], [3, "09:30"]], end: "never", outcomes: "a barre that doesn't punish you.", bring: "slippers if you have them." },
  { teacher: "nina-petrova", title: "Center Work", category: "dance", sub: "ballet", level: "intermediate", format: "series", delivery: "in_person", price: 32, series: 200, size: 12, minutes: 90, days: [[5, "18:00"]], end: "after", count: 8, seriesBook: true, outcomes: "turns that finish where they started.", bring: "soft shoes." },
  { teacher: "diego-morales", title: "Salsa Social", category: "dance", sub: "salsa", level: "all_levels", format: "drop_in", delivery: "in_person", price: 18, size: 24, minutes: 75, days: [[5, "20:00"]], end: "never", featured: true, outcomes: "lead and follow without a speech.", bring: "dance shoes or leather soles." },
  { teacher: "diego-morales", title: "Partnerwork", category: "dance", sub: "salsa", level: "intermediate", format: "series", delivery: "in_person", price: 24, series: 120, size: 16, minutes: 75, days: [[0, "17:00"]], frequency: "biweekly", end: "after", count: 4, outcomes: "cross-body that doesn't yank.", bring: "a partner or come solo." },
  { teacher: "aisha-bennett", title: "Still Life Oil", category: "visual", sub: "painting", level: "all_levels", format: "workshop", delivery: "in_person", price: 95, size: 8, minutes: 180, once: "2026-10-24", featured: true, firstFree: false, outcomes: "one painting, not a sketch you abandon.", bring: "an apron. Paint is included." },
  { teacher: "aisha-bennett", title: "Color Notes", category: "visual", sub: "painting", level: "beginner", format: "drop_in", delivery: "in_person", price: 42, size: 10, minutes: 120, days: [[6, "14:00"]], end: "never", firstFree: true, outcomes: "mix a gray that isn't mud.", bring: "a sketchbook." },
  { teacher: "theo-lang", title: "Wheel Throwing", category: "visual", sub: "ceramics", level: "beginner", format: "series", delivery: "in_person", price: 55, series: 280, size: 6, minutes: 150, days: [[3, "18:00"]], end: "after", count: 6, seriesBook: true, outcomes: "a cylinder that is actually a cylinder.", bring: "clothes you can ruin." },
  { teacher: "theo-lang", title: "Open Studio", category: "visual", sub: "ceramics", level: "intermediate", format: "drop_in", delivery: "in_person", price: 30, size: 8, minutes: 120, days: [[6, "11:00"]], end: "never", outcomes: "finish the piece you started.", bring: "your work in progress." },
  { teacher: "sofia-marin", title: "Portrait Walk", category: "visual", sub: "photography", level: "intermediate", format: "workshop", delivery: "in_person", price: 70, size: 8, minutes: 150, once: "2026-10-17", outcomes: "ten frames you'd show someone.", bring: "any camera, including a phone." },
  { teacher: "sofia-marin", title: "Edit Hour", category: "visual", sub: "photography", level: "all_levels", format: "drop_in", delivery: "virtual", price: 25, size: 12, minutes: 60, days: [[2, "12:00"]], end: "never", outcomes: "a sequence, not a dump.", bring: "five photos." },
  { teacher: "elijah-brooks", title: "Feature Structure", category: "writing", sub: "screenwriting", level: "intermediate", format: "series", delivery: "in_person", price: 40, series: 220, size: 10, minutes: 120, days: [[1, "19:00"]], end: "after", count: 6, seriesBook: true, featured: true, outcomes: "a rewrite plan, not more notes.", bring: "ten pages." },
  { teacher: "elijah-brooks", title: "Table Read", category: "writing", sub: "screenwriting", level: "advanced", format: "workshop", delivery: "virtual", price: 30, size: 8, minutes: 120, once: "2026-11-02", outcomes: "hear the scene out loud.", bring: "the pages, shared ahead." },
  { teacher: "naomi-feldman", title: "Poem Workshop", category: "writing", sub: "poetry", level: "all_levels", format: "drop_in", delivery: "in_person", price: 20, size: 10, minutes: 90, days: [[3, "19:00"]], end: "never", outcomes: "one poem revised, not praised.", bring: "a poem or a blank page." },
  { teacher: "naomi-feldman", title: "Reading Night Prep", category: "writing", sub: "poetry", level: "intermediate", format: "workshop", delivery: "in_person", price: 15, size: 16, minutes: 90, once: "2026-10-29", outcomes: "a set that fits eight minutes.", bring: "your pages." },
  { teacher: "chris-dalton", title: "Commercial On Camera", category: "acting", sub: "on-camera", level: "beginner", format: "drop_in", delivery: "in_person", price: 34, size: 10, minutes: 90, days: [[2, "18:00"]], end: "never", outcomes: "a slate that doesn't apologize.", bring: "a solid shirt." },
  { teacher: "chris-dalton", title: "Self-Tape Clinic", category: "acting", sub: "on-camera", level: "intermediate", format: "private_lesson", delivery: "virtual", price: 80, size: 1, minutes: 45, days: [[4, "15:00"]], end: "never", outcomes: "your reader setup, fixed.", bring: "a recent tape." },
  { teacher: "riley-park", title: "Song as Scene", category: "acting", sub: "musical-theater", level: "intermediate", format: "drop_in", delivery: "in_person", price: 36, size: 10, minutes: 90, days: [[0, "15:00"]], end: "never", featured: true, outcomes: "the song does something.", bring: "sheet music or a track." },
  { teacher: "riley-park", title: "32 Bars", category: "acting", sub: "musical-theater", level: "advanced", format: "workshop", delivery: "in_person", price: 60, size: 8, minutes: 150, once: "2026-11-08", outcomes: "a cut with a button.", bring: "your book." },
  { teacher: "amara-singh", title: "Floorwork", category: "dance", sub: "contemporary", level: "intermediate", format: "drop_in", delivery: "in_person", price: 24, size: 14, minutes: 75, days: [[1, "19:30"], [3, "19:30"]], end: "never", outcomes: "down and up without crashing.", bring: "kneepads if you want them." },
  { teacher: "amara-singh", title: "Phrase Lab", category: "dance", sub: "contemporary", level: "advanced", format: "series", delivery: "in_person", price: 28, series: 150, size: 12, minutes: 90, days: [[6, "16:00"]], end: "after", count: 5, seriesBook: true, outcomes: "a phrase you authored.", bring: "warm body." },
  { teacher: "ben-okonkwo", title: "Co-write Circle", category: "music", sub: "songwriting", level: "all_levels", format: "drop_in", delivery: "in_person", price: 22, size: 8, minutes: 120, days: [[4, "19:00"]], end: "never", outcomes: "a chorus that survives the drive home.", bring: "a notebook or a phone note." },
  { teacher: "ben-okonkwo", title: "Title First", category: "music", sub: "songwriting", level: "beginner", format: "workshop", delivery: "virtual", price: 18, size: 15, minutes: 90, once: "2026-10-22", outcomes: "three titles worth a song.", bring: "nothing." },
  { teacher: "jordan-hale", title: "Duo Scenes from Nothing", category: "acting", sub: "improv", level: "advanced", format: "workshop", delivery: "in_person", price: 40, size: 10, minutes: 120, once: "2026-11-14", outcomes: "a two-person scene with a stake.", bring: "a partner optional." },
  { teacher: "priya-shah", title: "Choir Blend", category: "music", sub: "voice", level: "all_levels", format: "drop_in", delivery: "virtual", price: 0, size: 20, minutes: 45, days: [[0, "18:00"]], end: "never", outcomes: "sing with other people, free.", bring: "headphones." },
  { teacher: "sofia-marin", title: "Golden Hour", category: "visual", sub: "photography", level: "beginner", format: "drop_in", delivery: "in_person", price: 35, size: 8, minutes: 90, days: [[5, "17:00"]], frequency: "biweekly", end: "never", outcomes: "use the light you have.", bring: "a camera." },
];

const leadsSeed = [
  ["Sunset Scene Lab", "Acting", "Scene study", "studio", "Hollywood", "A", "meeting_booked", "2026-10-09"],
  ["Echo Park Clay", "Visual art", "Ceramics", "studio", "Echo Park", "A", "replied", "2026-10-06"],
  ["NoHo Voice Room", "Music", "Voice", "school", "North Hollywood", "B", "contacted", "2026-10-12"],
  ["Venice Light House", "Visual art", "Photography", "studio", "Venice", "B", "attempted", ""],
  ["Los Feliz Barre", "Dance", "Ballet", "studio", "Los Feliz", "A", "demo_done", "2026-10-08"],
  ["Burbank Pages", "Writing", "Screenwriting", "collective", "Burbank", "C", "not_contacted", ""],
  ["Silver Lake Floor", "Dance", "Contemporary", "studio", "Silver Lake", "B", "onboarding", "2026-10-15"],
  ["Pasadena Chorus", "Music", "Songwriting", "school", "Pasadena", "C", "not_interested", ""],
  ["Santa Monica Frames", "Visual art", "Photography", "studio", "Santa Monica", "A", "live", ""],
  ["Highland Kiln", "Visual art", "Ceramics", "studio", "Highland Park", "A", "meeting_booked", "2026-10-07"],
  ["Hollywood Harold", "Acting", "Improv", "theater", "Hollywood", "B", "contacted", "2026-10-20"],
  ["Studio City Tape", "Acting", "On camera", "studio", "Studio City", "A", "replied", "2026-10-11"],
  ["Fairfax Salsa Social", "Dance", "Salsa", "social", "Hollywood", "B", "attempted", ""],
  ["Atwater Poems", "Writing", "Poetry", "collective", "Los Feliz", "C", "not_contacted", ""],
  ["Glendale Keys", "Music", "Piano", "school", "Burbank", "B", "demo_done", "2026-10-18"],
  ["Mar Vista Oils", "Visual art", "Painting", "studio", "Venice", "A", "contacted", "2026-10-05"],
  ["Eastside Guitar", "Music", "Guitar", "studio", "Echo Park", "B", "do_not_contact", ""],
  ["West Adams Hip-Hop", "Dance", "Hip-hop", "studio", "Hollywood", "A", "meeting_booked", "2026-10-10"],
  ["Frogtown Words", "Writing", "Screenwriting", "collective", "Echo Park", "C", "attempted", ""],
  ["Los Feliz Song Circle", "Music", "Songwriting", "social", "Los Feliz", "B", "replied", "2026-10-14"],
] as const;

function portrait(initials: string, hue: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="hsl(${hue} 38% 24%)"/><circle cx="300" cy="230" r="110" fill="hsl(${hue} 45% 68%)"/><path d="M120 620c30-160 120-230 180-230s150 70 180 230" fill="hsl(${hue} 32% 48%)"/><text x="300" y="248" text-anchor="middle" font-size="64" font-family="Georgia" fill="#1c1714">${initials}</text></svg>`;
}

function cover(title: string, hue: number) {
  const safe = title.replaceAll("&", "&amp;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="hsl(${hue} 42% 32%)"/><circle cx="640" cy="120" r="160" fill="hsl(${(hue + 28) % 360} 55% 52%)" opacity="0.85"/><rect x="40" y="380" width="360" height="260" rx="24" fill="hsl(${(hue + 50) % 360} 30% 18%)"/><text x="56" y="120" font-size="28" font-family="Georgia" fill="#f6f1e8">${safe}</text></svg>`;
}

function jitter(seed: string, base: number) {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) % 1000;
  return base + (hash - 500) / 25000;
}

async function main() {
  await wipeDemo();
  const password = await hashPassword(PASSWORD);
  const now = new Date();

  await db.insert(platformSettings).values({ id: 1, feePercent: 10, feeFixedCents: 0 }).onConflictDoNothing();

  const categoryIds = new Map<string, string>();
  const tree: { slug: string; name: string; children: { slug: string; name: string }[] }[] = [
    { slug: "acting", name: "Acting", children: [{ slug: "scene-study", name: "Scene study" }, { slug: "improv", name: "Improv" }, { slug: "on-camera", name: "On camera" }, { slug: "musical-theater", name: "Musical theater" }] },
    { slug: "music", name: "Music", children: [{ slug: "voice", name: "Voice" }, { slug: "guitar", name: "Guitar" }, { slug: "piano", name: "Piano" }, { slug: "songwriting", name: "Songwriting" }] },
    { slug: "dance", name: "Dance", children: [{ slug: "hip-hop", name: "Hip-hop" }, { slug: "ballet", name: "Ballet" }, { slug: "salsa", name: "Salsa" }, { slug: "contemporary", name: "Contemporary" }] },
    { slug: "visual", name: "Visual art", children: [{ slug: "painting", name: "Painting" }, { slug: "ceramics", name: "Ceramics" }, { slug: "photography", name: "Photography" }] },
    { slug: "writing", name: "Writing", children: [{ slug: "screenwriting", name: "Screenwriting" }, { slug: "poetry", name: "Poetry" }] },
  ];
  for (const parent of tree) {
    const id = `cat-${parent.slug}`;
    categoryIds.set(parent.slug, id);
    await db.insert(categories).values({ id, name: parent.name, slug: parent.slug, vertical: "creative" }).onConflictDoNothing();
    for (const child of parent.children) {
      const childId = `cat-${child.slug}`;
      categoryIds.set(child.slug, childId);
      await db.insert(categories).values({ id: childId, name: child.name, slug: child.slug, parentId: id, vertical: "creative" }).onConflictDoNothing();
    }
  }

  const artDir = path.join(process.cwd(), "public", "seed");
  await mkdir(path.join(artDir, "classes"), { recursive: true });

  async function makeUser(email: string, name: string, roles: readonly string[]) {
    const id = crypto.randomUUID();
    await db.insert(user).values({ id, name, email, emailVerified: true, isDemo: true, createdAt: now, updatedAt: now });
    await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password, createdAt: now, updatedAt: now });
    for (const role of roles) await db.insert(userRoles).values({ id: crypto.randomUUID(), userId: id, role });
    return id;
  }

  const staffIds = new Map<string, string>();
  for (const person of staff) staffIds.set(person.email, await makeUser(person.email, person.name, person.roles));

  const teacherIds = new Map<string, { id: string; userId: string }>();
  for (const teacher of teacherSeeds) {
    const userId = await makeUser(teacher.email, teacher.name, teacher.roles);
    const id = crypto.randomUUID();
    const initials = teacher.name.split(" ").map((part) => part[0]).join("");
    const photo = `/seed/${teacher.slug}.svg`;
    await writeFile(path.join(artDir, `${teacher.slug}.svg`), portrait(initials, teacher.hue));
    await db.insert(teachers).values({
      id,
      userId,
      slug: teacher.slug,
      studioName: teacher.studio,
      bio: teacher.bio,
      photoUrl: photo,
      specialties: teacher.specialties,
      instagram: teacher.instagram,
      status: teacher.status ?? "approved",
      firstClassFree: Boolean(teacher.firstFree),
      isDemo: true,
    });
    teacherIds.set(teacher.slug, { id, userId });
  }

  const classIds = new Map<string, { id: string; slug: string; price: number; teacherId: string }>();
  for (const item of classSeeds) {
    const teacher = teacherIds.get(item.teacher);
    if (!teacher) continue;
    const place = NEIGHBORHOODS.find((neighborhood) => neighborhood.name === teacherSeeds.find((row) => row.slug === item.teacher)?.neighborhood) ?? NEIGHBORHOODS[0]!;
    const classId = crypto.randomUUID();
    const classSlug = slugify(item.title);
    const hue = teacherSeeds.find((row) => row.slug === item.teacher)?.hue ?? 20;
    const coverPath = `/seed/classes/${classSlug}.svg`;
    await writeFile(path.join(artDir, "classes", `${classSlug}.svg`), cover(item.title, hue));
    let locationId: string | null = null;
    if (item.delivery === "in_person") {
      locationId = crypto.randomUUID();
      await db.insert(locations).values({
        id: locationId,
        name: teacherSeeds.find((row) => row.slug === item.teacher)?.studio,
        addressLine1: `${100 + (hue % 80)} ${place.name} Ave`,
        city: "Los Angeles",
        state: "CA",
        postalCode: "90026",
        neighborhood: place.name,
        lat: jitter(item.title, place.lat),
        lng: jitter(item.title + "x", place.lng),
        isDemo: true,
      });
    }
    await db.insert(classes).values({
      id: classId,
      teacherId: teacher.id,
      categoryId: categoryIds.get(item.category)!,
      subcategoryId: categoryIds.get(item.sub),
      locationId,
      slug: classSlug,
      title: item.title,
      description: `${item.title} with ${teacherSeeds.find((row) => row.slug === item.teacher)?.studio}. ${item.outcomes}`,
      outcomes: item.outcomes,
      whatToBring: item.bring,
      skillLevel: item.level,
      format: item.format,
      delivery: item.delivery,
      virtualLink: item.delivery === "virtual" ? "https://meet.example/becreative" : null,
      maxSize: item.size,
      durationMinutes: item.minutes,
      pricePerSessionCents: Math.round(item.price * 100),
      pricePerSeriesCents: item.series ? Math.round(item.series * 100) : null,
      seriesBookingEnabled: Boolean(item.seriesBook),
      firstClassFree: Boolean(item.firstFree),
      status: teacherSeeds.find((row) => row.slug === item.teacher)?.status === "pending" ? "draft" : "published",
      featured: Boolean(item.featured),
      waitlistEnabled: true,
      coverImageUrl: coverPath,
      isDemo: true,
    });
    await db.insert(classMedia).values({ id: crypto.randomUUID(), classId, url: coverPath, type: "image", sortOrder: 0, isDemo: true });
    classIds.set(`${item.teacher}:${item.title}`, { id: classId, slug: classSlug, price: Math.round(item.price * 100), teacherId: teacher.id });
    if (item.days?.length) {
      const recurrenceId = crypto.randomUUID();
      await db.insert(recurrences).values({
        id: recurrenceId,
        classId,
        timezone: "America/Los_Angeles",
        frequency: item.frequency ?? "weekly",
        days: item.days.map(([weekday, time]) => ({ weekday, time })),
        startDate: "2026-10-13",
        endType: item.end ?? "never",
        endCount: item.end === "after" ? item.count ?? 8 : null,
        durationMinutes: item.minutes,
        capacity: item.size,
      });
      await syncRule(recurrenceId, "2026-10-07");
    }
    if (item.once) {
      const startsAt = zonedTimeToUtc(item.once, "11:00");
      await db.insert(sessions).values({
        id: crypto.randomUUID(),
        classId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + item.minutes * 60_000),
        localDate: item.once,
        capacity: item.size,
        status: "scheduled",
        isDemo: true,
      });
    }
  }

  const maya = teacherIds.get("maya-alvarez")!;
  const scene = classIds.get("maya-alvarez:Scene Study")!;
  const packId = crypto.randomUUID();
  const pack10 = crypto.randomUUID();
  await db.insert(packs).values([
    { id: packId, teacherId: maya.id, slug: "five-class-pack", name: "5-class pack", description: "Five scene study or cold read drop-ins. Credits last 90 days.", creditCount: 5, priceCents: 15000, expiryDays: 90, classIds: [], isDemo: true },
    { id: pack10, teacherId: maya.id, slug: "ten-class-pack", name: "10-class pack", description: "Ten classes across Maya's studio.", creditCount: 10, priceCents: 28000, expiryDays: 90, isDemo: true },
  ]);
  const priya = teacherIds.get("priya-shah")!;
  await db.insert(packs).values({ id: crypto.randomUUID(), teacherId: priya.id, slug: "voice-five", name: "Voice 5-pack", description: "Five voice classes.", creditCount: 5, priceCents: 17500, expiryDays: 90, isDemo: true });
  const membershipId = crypto.randomUUID();
  await db.insert(memberships).values({
    id: membershipId,
    teacherId: maya.id,
    slug: "monthly-studio",
    name: "Monthly studio",
    description: "Four classes a month at Maya Alvarez Studio.",
    termMonths: 1,
    kind: "capped",
    classesPerPeriod: 4,
    priceCents: 12000,
    recurring: true,
    pauseCancelPolicy: "Cancel anytime before the next renewal. Pause up to 30 days.",
    isDemo: true,
  });
  await db.insert(memberships).values({
    id: crypto.randomUUID(),
    teacherId: teacherIds.get("camila-reyes")!.id,
    slug: "unlimited-month",
    name: "Unlimited month",
    termMonths: 1,
    kind: "unlimited",
    priceCents: 14000,
    recurring: true,
    pauseCancelPolicy: "Cancel before renewal.",
    isDemo: true,
  });

  await db.insert(promoCodes).values([
    { id: crypto.randomUUID(), teacherId: maya.id, code: "MAYA10", discountType: "percent", percentOffBps: 1000, appliesTo: "all", funding: "teacher", platformSharePercent: 0, maxPerCustomer: 1, isDemo: true },
    { id: crypto.randomUUID(), teacherId: null, code: "BECREATIVE15", discountType: "percent", percentOffBps: 1500, appliesTo: "all", funding: "platform", platformSharePercent: 100, isDemo: true },
    { id: crypto.randomUUID(), teacherId: priya.id, code: "FIRSTSONG", discountType: "fixed", amountOffCents: 1000, appliesTo: "classes", funding: "teacher", firstTimeOnly: true, isDemo: true },
  ]);

  const [platformCode] = await db.select().from(promoCodes).where(eq(promoCodes.code, "BECREATIVE15")).limit(1);
  const studentId = staffIds.get("student@becreative.demo")!;
  const avaId = staffIds.get("ava@becreative.demo")!;

  const past = zonedTimeToUtc("2026-09-15", "19:00");
  const past2 = zonedTimeToUtc("2026-09-22", "19:00");
  const pastSession = crypto.randomUUID();
  const pastSession2 = crypto.randomUUID();
  await db.insert(sessions).values([
    { id: pastSession, classId: scene.id, startsAt: past, endsAt: new Date(past.getTime() + 120 * 60_000), localDate: "2026-09-15", capacity: 12, status: "completed", isDemo: true },
    { id: pastSession2, classId: scene.id, startsAt: past2, endsAt: new Date(past2.getTime() + 120 * 60_000), localDate: "2026-09-22", capacity: 12, status: "completed", isDemo: true },
  ]);
  const upcoming = await db.select().from(sessions).where(eq(sessions.classId, scene.id));
  const future = upcoming.find((session) => session.status === "scheduled" && session.localDate >= "2026-10-13");

  async function book(input: { userId: string; sessionId: string; list: number; code?: typeof platformCode; when: Date }) {
    const quote = quotePrice({
      listPriceCents: input.list,
      feePercent: 10,
      feeFixedCents: 0,
      promo: input.code
        ? {
            code: input.code.code,
            active: true,
            discountType: "percent",
            percentOffBps: input.code.percentOffBps,
            amountOffCents: 0,
            startsAt: null,
            endsAt: null,
            maxRedemptions: null,
            maxPerCustomer: null,
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
          }
        : null,
    });
    const orderId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: input.userId,
      teacherId: maya.id,
      kind: "booking",
      status: "paid",
      listPriceCents: quote.listPriceCents,
      discountCents: quote.discountCents,
      studentPaysCents: quote.studentPaysCents,
      platformFeeCents: quote.platformFeeCents,
      teacherAmountCents: quote.teacherAmountCents,
      platformFundedCents: quote.platformFundedCents,
      teacherFundedCents: quote.teacherFundedCents,
      platformLiabilityCents: quote.platformLiabilityCents,
      promoCodeId: input.code?.id,
      paymentPath: "cash",
      ref: input.code ? "share" : "class",
      utmSource: "instagram",
      isDemo: true,
      createdAt: input.when,
    });
    await db.insert(bookings).values({ id: bookingId, orderId, userId: input.userId, classId: scene.id, kind: "session", status: "confirmed", source: "online", isDemo: true, createdAt: input.when });
    await db.insert(bookingSessions).values({ id: crypto.randomUUID(), bookingId, sessionId: input.sessionId, checkedIn: input.when < now });
    if (input.code) {
      await db.insert(promoRedemptions).values({ id: crypto.randomUUID(), promoCodeId: input.code.id, userId: input.userId, orderId, discountCents: quote.discountCents, platformFundedCents: quote.platformFundedCents, teacherFundedCents: 0 });
    }
    return quote.teacherAmountCents;
  }

  let teacherOnline = 0;
  teacherOnline += await book({ userId: studentId, sessionId: pastSession, list: 3600, when: new Date("2026-09-10T18:00:00Z") });
  teacherOnline += await book({ userId: studentId, sessionId: pastSession2, list: 3600, when: new Date("2026-09-18T18:00:00Z") });
  if (future && platformCode) teacherOnline += await book({ userId: avaId, sessionId: future.id, list: 3600, code: platformCode, when: new Date("2026-10-02T18:00:00Z") });
  if (future) {
    const second = upcoming.find((session) => session.id !== future.id && session.status === "scheduled");
    if (second) teacherOnline += await book({ userId: studentId, sessionId: second.id, list: 3600, when: new Date("2026-10-03T18:00:00Z") });
  }

  const purchaseId = crypto.randomUUID();
  await db.insert(packPurchases).values({ id: purchaseId, userId: studentId, packId, teacherId: maya.id, creditsTotal: 5, creditsRemaining: 3, expiresAt: new Date("2027-01-07T00:00:00Z"), isDemo: true });
  await db.insert(creditLedger).values({ id: crypto.randomUUID(), userId: studentId, teacherId: maya.id, sourceType: "pack", sourceId: purchaseId, direction: "grant" });
  await db.insert(membershipSubscriptions).values({
    id: crypto.randomUUID(),
    userId: avaId,
    membershipId,
    teacherId: maya.id,
    status: "active",
    currentPeriodStart: new Date("2026-10-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    classesUsedThisPeriod: 1,
    classesPerPeriod: 4,
    unlimited: false,
    isDemo: true,
  });
  await db.insert(payouts).values({ id: crypto.randomUUID(), teacherId: maya.id, amountCents: 5000, status: "paid", notes: "September transfer", isDemo: true });

  await db.insert(reviews).values([
    { id: crypto.randomUUID(), teacherId: maya.id, classId: scene.id, userId: studentId, rating: 5, body: "The room is serious without being precious. I booked the series.", isDemo: true },
    { id: crypto.randomUUID(), teacherId: maya.id, classId: scene.id, userId: avaId, rating: 5, body: "First class free got me in the door. The notes were specific.", isDemo: true },
    { id: crypto.randomUUID(), teacherId: teacherIds.get("camila-reyes")!.id, userId: staffIds.get("noah@becreative.demo")!, rating: 4, body: "Choreo lab is sweaty and clear.", isDemo: true },
  ]);

  const clickRefs = ["profile", "bio", "class", "qr", "share", "instagram", "promo"];
  for (const ref of clickRefs) {
    for (let i = 0; i < (ref === "bio" ? 6 : 2); i += 1) {
      await db.insert(linkClicks).values({ id: crypto.randomUUID(), teacherId: maya.id, targetType: ref, targetId: scene.id, path: ref === "bio" ? "/t/maya-alvarez/bio" : "/c/scene-study", ref, utmSource: ref === "instagram" ? "instagram" : null, utmMedium: ref === "instagram" ? "bio" : null, isDemo: true });
    }
  }

  const managerId = staffIds.get("manager@becreative.demo")!;
  const adminId = staffIds.get("admin@becreative.demo")!;
  for (const [index, lead] of leadsSeed.entries()) {
    const [business, category, subcategory, type, neighborhood, priority, status, due] = lead;
    const id = `lead-${slugify(business)}`;
    const place = NEIGHBORHOODS.find((item) => item.name === neighborhood);
    await db.insert(leads).values({
      id,
      businessName: business,
      category,
      subcategory,
      businessType: type,
      city: "Los Angeles",
      neighborhood,
      streetAddress: `${200 + index} ${neighborhood} Ave`,
      zip: "90026",
      phone: `213-555-01${String(index).padStart(2, "0")}`,
      email: `hello@${slugify(business)}.example`,
      website: `https://${slugify(business)}.example`,
      websiteDomain: `${slugify(business)}.example`,
      instagram: `@${slugify(business)}`,
      contactName: `${business.split(" ")[0]} Owner`,
      contactRole: "Owner",
      rating: "4.6",
      reviewCount: 40 + index,
      priceHint: "$25-40",
      offersOnline: index % 3 === 0,
      classFormats: "drop-in, series",
      estSize: "12",
      notes: `${business} came up in a neighborhood walk.`,
      sourceUrls: `https://${slugify(business)}.example`,
      dateAdded: "2026-09-01",
      priority,
      outreachStatus: status,
      lastContacted: status === "not_contacted" ? null : "2026-10-01",
      nextStep: due ? "Follow up" : "",
      nextStepDue: due || null,
      assignedUserId: index % 2 === 0 ? managerId : adminId,
      isDemo: true,
    });
    if (status !== "not_contacted") {
      await db.insert(leadActivities).values({ id: crypto.randomUUID(), leadId: id, type: "email", body: `Introduced BeCreative to ${business}.`, authorUserId: index % 2 === 0 ? managerId : adminId, isDemo: true });
    }
    void place;
  }

  const demoShot = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAoACgMBIgACEQEDEQH/xAAbAAACAgMBAAAAAAAAAAAAAAADBAECBQYAB//EAB4QAAIBAwUAAAAAAAAAAAAAAAECAwQFERIGITH/xAAXAQADAQAAAAAAAAAAAAAAAAAAAQID/8QAFREBAQAAAAAAAAAAAAAAAAAAAAH/2gAMAwEAAhEDEQA/AKp6m1t7i3uY4Y5Y0kkjVHU4A5J9qc0//9k=",
    "base64",
  );
  await putStoredObject("feedback/demo/explore.jpg", demoShot, "image/jpeg");
  const feedbackRows = [
    {
      id: "feedback-demo-map",
      authorUserId: adminId,
      authorRole: "admin",
      type: "bug",
      priority: "normal",
      title: "Neighborhood label sits under the pin",
      body: "On Explore, the Silver Lake label is hidden behind the map pin.",
      url: "http://localhost:3000/explore",
      route: "/explore",
      selector: "main > section:nth-of-type(1)",
      elementText: "Explore",
      targets: [{ selector: "main > section:nth-of-type(1)", text: "Explore" }],
      marks: [{ type: "box" as const, x: 420, y: 280, w: 160, h: 48 }],
      viewport: { w: 1280, h: 800, dpr: 1.5, scroll_x: 0, scroll_y: 0 },
      device: "desktop",
      screenshotKey: "feedback/demo/explore.jpg",
      sensitive: false,
      status: "approved",
      approvedBy: adminId,
      approvedAt: new Date("2026-10-07T18:00:00Z"),
      authorReadAt: new Date("2026-10-07T18:05:00Z"),
      inboxReadAt: new Date("2026-10-07T18:05:00Z"),
    },
    {
      id: "feedback-demo-copy",
      authorUserId: managerId,
      authorRole: "account_manager",
      type: "copy",
      priority: "high",
      title: "Series price is easy to miss",
      body: "The series price on Scene Study should sit next to the session price, not under the fold.",
      url: "http://localhost:3000/c/scene-study",
      route: "/c/scene-study",
      selector: "main > h1",
      elementText: "Scene Study",
      targets: [{ selector: "main > h1", text: "Scene Study" }],
      marks: [{ type: "circle" as const, x: 240, y: 180, r: 36 }],
      viewport: { w: 390, h: 844, dpr: 1.5, scroll_x: 0, scroll_y: 120 },
      device: "phone",
      screenshotKey: null,
      sensitive: false,
      status: "pending_review",
      authorReadAt: new Date("2026-10-07T19:00:00Z"),
      inboxReadAt: null,
    },
    {
      id: "feedback-demo-billing",
      authorUserId: managerId,
      authorRole: "account_manager",
      type: "bug",
      priority: "high",
      title: null,
      body: "The payout line on billing does not match the Stripe transfer.",
      url: "http://localhost:3000/teach/billing",
      route: "/teach/billing",
      selector: "main > section:nth-of-type(1)",
      elementText: "Payouts",
      targets: [{ selector: "main > section:nth-of-type(1)", text: "Payouts" }],
      marks: [{ type: "arrow" as const, x1: 80, y1: 200, x2: 220, y2: 260 }],
      viewport: { w: 1280, h: 800, dpr: 1, scroll_x: 0, scroll_y: 0 },
      device: "desktop",
      screenshotKey: null,
      sensitive: true,
      status: "needs_info",
      approvedBy: adminId,
      approvedAt: new Date("2026-10-06T16:00:00Z"),
      authorReadAt: new Date("2026-10-06T16:00:00Z"),
      inboxReadAt: new Date("2026-10-06T16:30:00Z"),
    },
    {
      id: "feedback-demo-hero",
      authorUserId: adminId,
      authorRole: "admin",
      type: "design",
      priority: "low",
      title: "Name the city in the hero",
      body: "The homepage hero should say Los Angeles before the first scroll.",
      url: "http://localhost:3000/",
      route: "/",
      selector: null,
      elementText: null,
      targets: [],
      marks: [],
      viewport: { w: 1280, h: 800, dpr: 1, scroll_x: 0, scroll_y: 0 },
      device: "desktop",
      screenshotKey: null,
      sensitive: false,
      status: "deployed",
      approvedBy: adminId,
      approvedAt: new Date("2026-10-01T15:00:00Z"),
      fixPrUrl: "https://github.com/lein0/BeCreative/pull/1",
      fixNotes: "Hero now names Los Angeles.",
      authorReadAt: new Date("2026-10-02T15:00:00Z"),
      inboxReadAt: new Date("2026-10-02T15:00:00Z"),
    },
  ];
  for (const row of feedbackRows) {
    await db.insert(feedback).values({ ...row, isDemo: true });
    await db.insert(feedbackEvents).values({
      id: `${row.id}-created`,
      feedbackId: row.id,
      kind: "created",
      body: row.body,
      actorUserId: row.authorUserId,
      actorName: row.authorUserId === adminId ? "Avery Chen" : "Sam Ortiz",
    });
  }
  await db.insert(feedbackDeliveries).values({
    id: "feedback-demo-map-delivery",
    feedbackId: "feedback-demo-map",
    attempt: 1,
    status: "undelivered",
    error: "FEEDBACK_WEBHOOK_URL is not set",
  });
  await db.insert(feedbackEvents).values({
    id: "feedback-demo-map-dispatch",
    feedbackId: "feedback-demo-map",
    kind: "dispatch",
    body: "Webhook not configured. Recorded as undelivered.",
    actorName: "fix loop",
    createdAt: new Date("2026-10-07T18:02:00Z"),
  });
  await db.insert(feedbackEvents).values({
    id: "feedback-demo-billing-comment",
    feedbackId: "feedback-demo-billing",
    kind: "comment",
    body: "Which payout date should I compare to Stripe?",
    actorName: "fixer",
    createdAt: new Date("2026-10-07T12:00:00Z"),
  });

  await seedWellness({
    password,
    now,
    artDir,
    studentId: staffIds.get("student@becreative.demo")!,
    avaId: staffIds.get("ava@becreative.demo")!,
  });

  await db.insert(faqArticles).values(FAQ_ARTICLES.map((article) => ({ id: `faq-${article.slug}`, ...article })));
  await db.insert(cannedReplies).values({ id: "canned-refund-window", title: "Refund window", body: "Full refund until 24 hours before the start. Studio credit until 2 hours before. After that the seat is not refunded.", category: "refunds" });
  const [demoOrder] = await db.select().from(orders).where(eq(orders.userId, studentId)).limit(1);
  if (demoOrder) {
    await db.insert(disputes).values({
      id: "dp_demo_scene",
      orderId: demoOrder.id,
      teacherId: maya.id,
      userId: studentId,
      amountCents: demoOrder.studentPaysCents,
      reason: "fraudulent",
      status: "needs_response",
      evidenceStatus: "assembling",
      dueBy: new Date("2026-10-20T00:00:00Z"),
      attendanceConfirmed: false,
      summary: "Demo dispute for Scene Study. Evidence is assembled from the booking, the policy checkbox, and the receipt.",
      evidence: { customer_name: "Jules Navarro", product_description: "Scene Study" },
      isDemo: true,
    });
  }
  await db.insert(tickets).values({
    id: "ticket-demo-class",
    userId: studentId,
    teacherId: maya.id,
    category: "class",
    priority: "normal",
    status: "open",
    subject: "Can I move Scene Study to Thursday?",
    route: "teacher",
    slaDueAt: new Date(now.getTime() + 24 * 3_600_000),
    isDemo: true,
  });
  await db.insert(ticketMessages).values({ id: "ticket-demo-class-msg", ticketId: "ticket-demo-class", authorUserId: studentId, body: "Thursday works better this week. Happy to keep the same seat." });
  await db.insert(tickets).values({
    id: "ticket-demo-safety",
    userId: studentId,
    teacherId: maya.id,
    category: "safety",
    priority: "urgent",
    status: "open",
    subject: "The side door lock stuck after class",
    route: "admin",
    escalatedAt: now,
    slaDueAt: now,
    isDemo: true,
  });
  await db.insert(ticketMessages).values({ id: "ticket-demo-safety-msg", ticketId: "ticket-demo-safety", authorUserId: studentId, body: "We could not lock the side door on the way out. Please tell the studio." });

  await db.insert(notifications).values([
    { id: "note-demo-booking", userId: maya.userId, event: "booking.created", title: "New booking: Scene Study", body: "Jules Navarro booked Scene Study.", href: "/teach/sessions", isDemo: true },
    { id: "note-demo-student", userId: studentId, event: "booking.confirmed", title: "You're booked: Scene Study", body: "Your seat is reserved. A receipt is in this note.", href: "/bookings", isDemo: true },
    { id: "note-demo-receipt", userId: studentId, event: "receipt.sent", title: "Receipt for Scene Study", body: "This confirms the amount and the cancellation policy you accepted.", href: "/bookings", isDemo: true },
  ]);

  await ensureBootstrapAdmins();
  console.log(`Seeded ${teacherSeeds.length} teachers, ${classSeeds.length} classes, ${leadsSeed.length} leads.`);
  console.log(`Demo password ${PASSWORD}`);
  console.log(`Online teacher amount recorded for Maya before the $50 payout: ${(teacherOnline / 100).toFixed(2)}`);
}

const WAIVER = `This is a liability waiver for a wellness visit. It is not medical care, a diagnosis, or a treatment plan, and it does not collect health information.

I choose to take part in yoga, movement, bodywork, breath practice, or bathing at my own pace. I will stop if something does not feel right. I accept the ordinary risks of these activities and release the practitioner from liability for those ordinary risks.`;

async function seedWellness(input: { password: string; now: Date; artDir: string; studentId: string; avaId: string }) {
  const wellnessTree: { slug: string; name: string; children?: { slug: string; name: string }[] }[] = [
    { slug: "yoga", name: "Yoga", children: [{ slug: "vinyasa", name: "Vinyasa" }, { slug: "restorative-yoga", name: "Restorative" }] },
    { slug: "pilates", name: "Pilates", children: [{ slug: "reformer", name: "Reformer" }, { slug: "mat-pilates", name: "Mat" }] },
    { slug: "stretching", name: "Stretching" },
    { slug: "meditation", name: "Meditation" },
    { slug: "breathwork", name: "Breathwork" },
    { slug: "sound-baths", name: "Sound baths" },
    { slug: "massage", name: "Massage", children: [{ slug: "swedish", name: "Swedish" }, { slug: "deep-tissue", name: "Deep tissue" }] },
    { slug: "bodywork", name: "Bodywork" },
    { slug: "reiki", name: "Reiki" },
    { slug: "sauna", name: "Sauna" },
    { slug: "cold-plunge", name: "Cold plunge" },
    { slug: "contrast", name: "Contrast therapy" },
    { slug: "float", name: "Float" },
    { slug: "bathhouse", name: "Bathhouses" },
  ];
  const categoryIds = new Map<string, string>();
  for (const parent of wellnessTree) {
    const id = `cat-${parent.slug}`;
    categoryIds.set(parent.slug, id);
    await db.insert(categories).values({ id, name: parent.name, slug: parent.slug, vertical: "wellness" }).onConflictDoNothing();
    for (const child of parent.children ?? []) {
      const childId = `cat-${child.slug}`;
      categoryIds.set(child.slug, childId);
      await db.insert(categories).values({ id: childId, name: child.name, slug: child.slug, parentId: id, vertical: "wellness" }).onConflictDoNothing();
    }
  }

  const studios = [
    { slug: "silver-lake-still", email: "wellness-yoga@becreative.demo", name: "Noor Hale", studio: "Silver Lake Still", neighborhood: "Silver Lake", hue: 150, specialties: ["Yoga", "Stretching"], bio: "Vinyasa and private hours in a quiet Silver Lake room. Movement only — no health intake." },
    { slug: "echo-park-reformer", email: "wellness-pilates@becreative.demo", name: "Elena Voss", studio: "Echo Park Reformer", neighborhood: "Echo Park", hue: 168, specialties: ["Pilates"], bio: "Reformer and mat sessions with time between clients." },
    { slug: "atwater-bodywork", email: "wellness-body@becreative.demo", name: "Chris Okonkwo", studio: "Atwater Bodywork", neighborhood: "Atwater Village", hue: 28, specialties: ["Massage", "Reiki"], bio: "Massage, bodywork, and Reiki. Add hot stones or CBD oil. Liability waiver only." },
    { slug: "highland-park-quiet", email: "wellness-quiet@becreative.demo", name: "Mina Cho", studio: "Highland Park Quiet", neighborhood: "Highland Park", hue: 200, specialties: ["Meditation", "Breathwork", "Sound baths"], bio: "Sitting, breath, and sound baths. Come as you are." },
    { slug: "frogtown-baths", email: "wellness-bath@becreative.demo", name: "Rae Molina", studio: "Frogtown Baths", neighborhood: "Frogtown", hue: 190, specialties: ["Sauna", "Cold plunge", "Contrast therapy"], bio: "Sauna, cold plunge, and contrast rounds with a headcount on every slot." },
    { slug: "venice-float", email: "wellness-float@becreative.demo", name: "Jules Park", studio: "Venice Float", neighborhood: "Venice", hue: 210, specialties: ["Float"], bio: "A private float tank, reset between guests." },
  ] as const;

  const teacherIds = new Map<string, string>();
  for (const studio of studios) {
    const userId = crypto.randomUUID();
    await db.insert(user).values({ id: userId, name: studio.name, email: studio.email, emailVerified: true, isDemo: true, createdAt: input.now, updatedAt: input.now });
    await db.insert(account).values({ id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: input.password, createdAt: input.now, updatedAt: input.now });
    await db.insert(userRoles).values({ id: crypto.randomUUID(), userId, role: "teacher" });
    const teacherId = crypto.randomUUID();
    const initials = studio.name.split(" ").map((part) => part[0]).join("");
    await writeFile(path.join(input.artDir, `${studio.slug}.svg`), portrait(initials, studio.hue));
    await db.insert(teachers).values({
      id: teacherId,
      userId,
      slug: studio.slug,
      studioName: studio.studio,
      bio: studio.bio,
      photoUrl: `/seed/${studio.slug}.svg`,
      specialties: [...studio.specialties],
      status: "approved",
      isDemo: true,
    });
    teacherIds.set(studio.slug, teacherId);
    await db.insert(waivers).values({ id: crypto.randomUUID(), teacherId, body: WAIVER, version: 1 });
  }

  async function place(teacherSlug: string, title: string) {
    const studio = studios.find((item) => item.slug === teacherSlug)!;
    const neighborhood = NEIGHBORHOODS.find((item) => item.name === studio.neighborhood) ?? NEIGHBORHOODS[1]!;
    const id = crypto.randomUUID();
    await db.insert(locations).values({
      id,
      name: studio.studio,
      addressLine1: `${120 + (studio.hue % 40)} ${neighborhood.name} Ave`,
      city: "Los Angeles",
      state: "CA",
      postalCode: "90026",
      neighborhood: neighborhood.name,
      lat: jitter(title, neighborhood.lat),
      lng: jitter(`${title}-w`, neighborhood.lng),
      isDemo: true,
    });
    return id;
  }

  async function addClass(item: { teacher: string; title: string; category: string; sub?: string; price: number; minutes: number; size: number; days: [number, string][]; bring: string }) {
    const teacherId = teacherIds.get(item.teacher)!;
    const classId = crypto.randomUUID();
    const classSlug = slugify(item.title);
    const coverPath = `/seed/classes/${classSlug}.svg`;
    await writeFile(path.join(input.artDir, "classes", `${classSlug}.svg`), cover(item.title, studios.find((studio) => studio.slug === item.teacher)?.hue ?? 150));
    await db.insert(classes).values({
      id: classId,
      teacherId,
      categoryId: categoryIds.get(item.category)!,
      subcategoryId: item.sub ? categoryIds.get(item.sub) : null,
      locationId: await place(item.teacher, item.title),
      slug: classSlug,
      title: item.title,
      description: `${item.title}. A group practice. No health questionnaire.`,
      outcomes: "Leave a little quieter than you arrived.",
      whatToBring: item.bring,
      skillLevel: "all_levels",
      format: "drop_in",
      delivery: "in_person",
      maxSize: item.size,
      durationMinutes: item.minutes,
      pricePerSessionCents: Math.round(item.price * 100),
      status: "published",
      waitlistEnabled: true,
      coverImageUrl: coverPath,
      isDemo: true,
    });
    const recurrenceId = crypto.randomUUID();
    await db.insert(recurrences).values({
      id: recurrenceId,
      classId,
      timezone: "America/Los_Angeles",
      frequency: "weekly",
      days: item.days.map(([weekday, time]) => ({ weekday, time })),
      startDate: "2026-10-08",
      endType: "never",
      durationMinutes: item.minutes,
      capacity: item.size,
    });
    await syncRule(recurrenceId, "2026-10-08");
  }

  await addClass({ teacher: "silver-lake-still", title: "Morning Vinyasa", category: "yoga", sub: "vinyasa", price: 28, minutes: 75, size: 12, days: [[2, "09:00"], [4, "09:00"]], bring: "A mat if you have one" });
  await addClass({ teacher: "silver-lake-still", title: "Slow Stretch", category: "stretching", price: 24, minutes: 60, size: 14, days: [[3, "18:00"]], bring: "Comfortable clothes" });
  await addClass({ teacher: "echo-park-reformer", title: "Reformer Foundations", category: "pilates", sub: "reformer", price: 40, minutes: 50, size: 8, days: [[1, "12:00"], [3, "12:00"]], bring: "Grip socks" });
  await addClass({ teacher: "highland-park-quiet", title: "Evening Sound Bath", category: "sound-baths", price: 30, minutes: 60, size: 16, days: [[5, "19:00"]], bring: "A layer to lie down in" });
  await addClass({ teacher: "highland-park-quiet", title: "Breathwork Circle", category: "breathwork", price: 26, minutes: 45, size: 12, days: [[0, "10:00"]], bring: "Water" });
  await addClass({ teacher: "highland-park-quiet", title: "Saturday Sit", category: "meditation", price: 18, minutes: 40, size: 18, days: [[6, "09:00"]], bring: "Nothing" });

  async function addService(item: {
    teacher: string;
    slug: string;
    title: string;
    category: string;
    kind: "appointment" | "access";
    description: string;
    buffer?: number;
    lead?: number;
    cancel?: number;
    waiver?: boolean;
    slotMinutes?: number;
    capacity?: number;
    price?: number;
    days: number[];
    start: string;
    end: string;
    options?: { minutes: number; price: number }[];
    addons?: { name: string; price: number; minutes: number }[];
  }) {
    const id = crypto.randomUUID();
    await db.insert(services).values({
      id,
      teacherId: teacherIds.get(item.teacher)!,
      categoryId: categoryIds.get(item.category)!,
      locationId: await place(item.teacher, item.title),
      slug: item.slug,
      title: item.title,
      description: item.description,
      kind: item.kind,
      bufferMinutes: item.buffer ?? 0,
      leadTimeHours: item.lead ?? 2,
      cancellationHours: item.cancel ?? 24,
      slotMinutes: item.slotMinutes ?? null,
      capacity: item.capacity ?? 1,
      priceCents: Math.round((item.price ?? 0) * 100),
      waiverRequired: Boolean(item.waiver),
      status: "published",
      isDemo: true,
    });
    for (const [index, option] of (item.options ?? []).entries()) {
      await db.insert(serviceOptions).values({ id: crypto.randomUUID(), serviceId: id, label: `${option.minutes} min`, minutes: option.minutes, priceCents: Math.round(option.price * 100), sortOrder: index });
    }
    for (const addon of item.addons ?? []) {
      await db.insert(serviceAddons).values({ id: crypto.randomUUID(), serviceId: id, name: addon.name, priceCents: Math.round(addon.price * 100), minutes: addon.minutes });
    }
    for (const weekday of item.days) {
      await db.insert(availabilityWindows).values({ id: crypto.randomUUID(), serviceId: id, weekday, startTime: item.start, endTime: item.end });
    }
    return id;
  }

  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  const privateYoga = await addService({
    teacher: "silver-lake-still",
    slug: "private-yoga",
    title: "Private yoga",
    category: "yoga",
    kind: "appointment",
    description: "A one-to-one yoga hour. Choose 60 or 90 minutes. The studio waiver is signed once.",
    buffer: 15,
    waiver: true,
    days: [1, 2, 3, 4, 5, 6],
    start: "09:00",
    end: "17:00",
    options: [{ minutes: 60, price: 90 }, { minutes: 90, price: 120 }],
  });
  await addService({
    teacher: "echo-park-reformer",
    slug: "private-reformer",
    title: "Private reformer",
    category: "pilates",
    kind: "appointment",
    description: "A private Pilates reformer session.",
    buffer: 15,
    days: [1, 2, 3, 4, 5],
    start: "10:00",
    end: "18:00",
    options: [{ minutes: 50, price: 85 }, { minutes: 80, price: 120 }],
  });
  await addService({
    teacher: "atwater-bodywork",
    slug: "therapeutic-massage",
    title: "Therapeutic massage",
    category: "massage",
    kind: "appointment",
    description: "Massage and bodywork. Hot stones or CBD oil can be added. This is not medical treatment.",
    buffer: 15,
    waiver: true,
    days: [2, 3, 4, 5, 6],
    start: "10:00",
    end: "18:00",
    options: [{ minutes: 60, price: 140 }, { minutes: 90, price: 190 }],
    addons: [{ name: "Hot stones", price: 25, minutes: 0 }, { name: "CBD oil", price: 20, minutes: 0 }],
  });
  await addService({
    teacher: "atwater-bodywork",
    slug: "reiki-session",
    title: "Reiki session",
    category: "reiki",
    kind: "appointment",
    description: "A quiet Reiki hour. The same studio waiver covers it.",
    buffer: 10,
    waiver: true,
    days: [3, 5],
    start: "11:00",
    end: "16:00",
    options: [{ minutes: 60, price: 95 }],
  });
  await addService({
    teacher: "frogtown-baths",
    slug: "sauna-six",
    title: "Sauna",
    category: "sauna",
    kind: "access",
    description: "A shared sauna. Six people per slot.",
    slotMinutes: 45,
    capacity: 6,
    price: 28,
    days: weekdays,
    start: "08:00",
    end: "20:00",
  });
  await addService({
    teacher: "frogtown-baths",
    slug: "cold-plunge",
    title: "Cold plunge",
    category: "cold-plunge",
    kind: "access",
    description: "A cold plunge with four spots each round.",
    slotMinutes: 20,
    capacity: 4,
    price: 18,
    lead: 1,
    days: weekdays,
    start: "08:00",
    end: "20:00",
  });
  await addService({
    teacher: "frogtown-baths",
    slug: "contrast-circuit",
    title: "Contrast circuit",
    category: "contrast",
    kind: "access",
    description: "Heat then cold, eight people per round.",
    slotMinutes: 30,
    capacity: 8,
    price: 32,
    days: weekdays,
    start: "09:00",
    end: "19:00",
  });
  await addService({
    teacher: "venice-float",
    slug: "float-tank",
    title: "Float tank",
    category: "float",
    kind: "appointment",
    description: "A private float. The tank resets before the next guest.",
    buffer: 30,
    days: weekdays,
    start: "09:00",
    end: "20:00",
    options: [{ minutes: 60, price: 89 }],
  });

  const yogaId = teacherIds.get("silver-lake-still")!;
  await db.insert(credentials).values({ id: crypto.randomUUID(), teacherId: yogaId, label: "RYT-200", identifier: "YA-20481", verified: true, verifiedAt: input.now, isDemo: true });
  await db.insert(credentials).values({ id: crypto.randomUUID(), teacherId: teacherIds.get("atwater-bodywork")!, label: "CAMTC", identifier: "CAMTC-88312", verified: true, verifiedAt: input.now, isDemo: true });
  await db.insert(credentials).values({ id: crypto.randomUUID(), teacherId: teacherIds.get("highland-park-quiet")!, label: "Sound healing certificate", identifier: null, verified: false, isDemo: true });

  const packId = crypto.randomUUID();
  await db.insert(packs).values({
    id: packId,
    teacherId: yogaId,
    slug: "still-five",
    name: "5-visit pack",
    description: "Five yoga visits, group or private.",
    creditCount: 5,
    priceCents: 36000,
    expiryDays: 90,
    categoryIds: [categoryIds.get("yoga")!],
    isDemo: true,
  });
  const packOrder = crypto.randomUUID();
  await db.insert(orders).values({ id: packOrder, userId: input.studentId, teacherId: yogaId, kind: "pack", status: "paid", listPriceCents: 36000, studentPaysCents: 36000, teacherAmountCents: 32400, platformFeeCents: 3600, paymentPath: "cash", isDemo: true });
  await db.insert(packPurchases).values({ id: crypto.randomUUID(), orderId: packOrder, userId: input.studentId, packId, teacherId: yogaId, creditsTotal: 5, creditsRemaining: 5, isDemo: true });

  const bathId = teacherIds.get("frogtown-baths")!;
  const membershipId = crypto.randomUUID();
  await db.insert(memberships).values({
    id: membershipId,
    teacherId: bathId,
    slug: "bathhouse-unlimited",
    name: "Unlimited baths",
    description: "Unlimited sauna, plunge, and contrast visits this month.",
    termMonths: 1,
    kind: "unlimited",
    priceCents: 8900,
    recurring: true,
    categoryIds: [categoryIds.get("sauna")!, categoryIds.get("cold-plunge")!, categoryIds.get("contrast")!, categoryIds.get("bathhouse")!],
    isDemo: true,
  });
  const memberOrder = crypto.randomUUID();
  await db.insert(orders).values({ id: memberOrder, userId: input.studentId, teacherId: bathId, kind: "membership", status: "paid", listPriceCents: 8900, studentPaysCents: 8900, teacherAmountCents: 8010, platformFeeCents: 890, paymentPath: "cash", isDemo: true });
  const periodEnd = new Date(input.now);
  periodEnd.setDate(periodEnd.getDate() + 30);
  await db.insert(membershipSubscriptions).values({
    id: crypto.randomUUID(),
    orderId: memberOrder,
    userId: input.studentId,
    membershipId,
    teacherId: bathId,
    status: "active",
    currentPeriodStart: input.now,
    currentPeriodEnd: periodEnd,
    unlimited: true,
    isDemo: true,
  });

  const [waiver] = await db.select().from(waivers).where(eq(waivers.teacherId, yogaId)).limit(1);
  const signatureId = crypto.randomUUID();
  await db.insert(waiverSignatures).values({
    id: signatureId,
    waiverId: waiver!.id,
    teacherId: yogaId,
    userId: input.avaId,
    version: 1,
    signedName: "Ava Chen",
    ip: "127.0.0.1",
    signedAt: input.now,
  });
  const visitOrder = crypto.randomUUID();
  const startsAt = zonedTimeToUtc("2026-10-12", "10:00", "America/Los_Angeles");
  await db.insert(orders).values({ id: visitOrder, userId: input.avaId, teacherId: yogaId, kind: "visit", status: "pay_at_studio", listPriceCents: 9000, studentPaysCents: 9000, paymentPath: "cash", isDemo: true });
  await db.insert(visitBookings).values({
    id: crypto.randomUUID(),
    orderId: visitOrder,
    userId: input.avaId,
    serviceId: privateYoga,
    offeringKind: "appointment",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    status: "confirmed",
    waiverSignatureId: signatureId,
    isDemo: true,
  });
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
