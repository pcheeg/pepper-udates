export type UserId = "peter" | "mum" | "dad";
export type ReactionType = "love" | "funny" | "adorable" | "paw";
export type CareType = "walk" | "feed";
export type ScrapbookTag = "walkies" | "holiday" | "treats" | "with-friends";

export type User = {
  id: UserId;
  name: string;
  relationship: string;
  bio: string;
  avatar?: string;
  colour: string;
  isAdmin?: boolean;
};

export type Dog = {
  name: string;
  breed: string;
  dateOfBirth: string;
  bio: string;
  photo: string;
};

export type Photo = { src: string; alt: string };

export type Post = {
  id: string;
  authorId: UserId;
  createdAt: string;
  originalDate: string;
  location?: string;
  caption: string;
  photos: Photo[];
  likes: number;
  reactions: Record<ReactionType, number>;
  comments: string[];
  tags: ScrapbookTag[];
  milestone?: boolean;
  favourite?: boolean;
  taggedUserId?: UserId;
};

export type CareEvent = {
  id: string;
  type: CareType;
  recordedAt: string;
  userId: UserId;
};
