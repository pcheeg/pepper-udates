import type { CareEvent, Dog, Photo, Post, User } from "./types";

export const pepperPhotos: Photo[] = [
  { src: "/images/pepper-beach.webp", alt: "Pepper running along the beach" },
  { src: "/images/pepper-garden.webp", alt: "Pepper sitting in the garden" },
  { src: "/images/pepper-sofa.webp", alt: "Pepper asleep on the sofa" },
  { src: "/images/pepper-woods.webp", alt: "Pepper on a woodland walk" },
];

export const initialUsers: User[] = [
  { id: "peter", name: "Peter", relationship: "Pepper’s human", bio: "Chief photographer and treat provider.", avatar: "/images/peter-profile.webp", colour: "#7350a5", isAdmin: true },
  { id: "mum", name: "Mum", relationship: "Pepper’s human", bio: "Keeper of cosy blankets and the best cuddles.", colour: "#b86f81" },
  { id: "dad", name: "Dad", relationship: "Pepper’s human", bio: "Weekend walker and expert ball thrower.", colour: "#547c78" },
];

export const initialDog: Dog = {
  name: "Pepper",
  breed: "Cockapoo",
  dateOfBirth: "2025-08-14",
  bio: "Professional sock thief, treat enthusiast and centre of attention.",
  photo: "/images/pepper-garden.webp",
};

export const initialPosts: Post[] = [
  { id: "post-1", authorId: "peter", createdAt: "2026-07-12T12:30:00", originalDate: "2026-07-12", location: "West Wittering", caption: "Sandy paws, salty curls, and absolutely no intention of coming home. Our happiest little beach girl.", photos: [pepperPhotos[0], pepperPhotos[1]], likes: 8, reactions: { love: 0, funny: 1, adorable: 4, paw: 2 }, comments: ["Mum: Look at that smile!", "Dad: Best day with our girl.", "Mum: We need another beach day soon."], tags: ["holiday"], favourite: false },
  { id: "post-2", authorId: "mum", createdAt: "2026-07-10T18:15:00", originalDate: "2026-07-10", location: "Home", caption: "Sunday plans: cancelled. Pepper has claimed the good blanket and we’re all too soft to move her.", photos: [pepperPhotos[2]], likes: 6, reactions: { love: 0, funny: 3, adorable: 2, paw: 0 }, comments: ["Peter: As she should!"], tags: [], favourite: true },
  { id: "post-3", authorId: "dad", createdAt: "2026-06-28T09:20:00", originalDate: "2026-06-28", location: "Ashridge Woods", caption: "Our favourite walking buddy wearing her favourite colour. She found every muddy puddle, naturally.", photos: [pepperPhotos[3]], likes: 10, reactions: { love: 0, funny: 2, adorable: 5, paw: 4 }, comments: ["Mum: Beautiful Pepper!"], tags: ["walkies"], milestone: true },
  { id: "post-4", authorId: "peter", createdAt: "2026-06-14T16:00:00", originalDate: "2026-06-14", caption: "Ten months old today and somehow getting cheekier by the minute.", photos: [pepperPhotos[1]], likes: 9, reactions: { love: 0, funny: 1, adorable: 4, paw: 3 }, comments: ["Dad: Never change, Pep."], tags: [], milestone: true, favourite: true },
];

export const initialCareEvents: CareEvent[] = [
  { id: "walk-1", type: "walk", recordedAt: "2026-07-12T13:15:00", userId: "peter" },
  { id: "walk-2", type: "walk", recordedAt: "2026-07-11T18:40:00", userId: "mum" },
  { id: "walk-3", type: "walk", recordedAt: "2026-07-11T08:20:00", userId: "dad" },
  { id: "feed-1", type: "feed", recordedAt: "2026-07-12T15:10:00", userId: "mum" },
  { id: "feed-2", type: "feed", recordedAt: "2026-07-12T08:05:00", userId: "peter" },
  { id: "feed-3", type: "feed", recordedAt: "2026-07-11T17:55:00", userId: "dad" },
];
