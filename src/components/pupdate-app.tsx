/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BellIcon, BookIcon, CameraIcon, ChevronIcon, HomeIcon, MoreIcon, PlusIcon, UserIcon } from "./icons";
import { db, ensureSession, forgotPassword, logIn, readSession, removeUpload, saveSession, Session, storageImageUrl, signOut, signUp, supabaseConfigured, updatePassword, upload } from "@/lib/supabase";

type TagColor = "purple" | "red" | "orange" | "yellow" | "green" | "light-blue" | "indigo" | "violet" | "pink";
type Profile = { id: string; display_name: string; avatar_path: string | null; bio: string | null; onboarding_complete: boolean; role: "admin" | "user"; member_tag: string; tag_color: TagColor };
type FamilyPerson = Pick<Profile, "id" | "display_name" | "avatar_path" | "bio" | "role" | "member_tag" | "tag_color"> & { avatarUrl?: string | null };
type Dog = { id: string; owner_id: string; name: string; breed: string; birthday: string; bio: string | null; photo_path: string | null; avatar_path: string | null };
type Photo = { id: string; pupdate_id: string; storage_path: string; sort_order: number; url?: string };
type Like = { id: string; pupdate_id: string; user_id: string; liker_name: string | null; created_at: string; person?: FamilyPerson };
type Comment = { id: string; pupdate_id: string; user_id: string; author_name: string; body: string; created_at: string; person?: FamilyPerson };
type Post = { id: string; owner_id: string; poster_name: string | null; poster?: FamilyPerson; poster_avatar_path?: string | null; poster_tag?: string; poster_tag_color?: TagColor; poster_role?: "admin" | "user"; client_submission_id: string | null; caption: string; location: string | null; event_date: string | null; tags: string[]; created_at: string; photos: Photo[]; likes: Like[]; comments: Comment[] };
type CareEvent = { id: string; dog_id: string; event_type: "walk" | "feed"; occurred_at: string; created_at: string };
type Tab = "feed" | "add" | "scrapbook" | "profile" | "pepper";
type AuthView = "welcome" | "signup" | "login" | "forgot" | "reset";
const TAG_COLORS: { value: TagColor; label: string }[] = [{ value: "purple", label: "Purple" }, { value: "red", label: "Red" }, { value: "orange", label: "Orange" }, { value: "yellow", label: "Yellow" }, { value: "green", label: "Green" }, { value: "light-blue", label: "Light blue" }, { value: "indigo", label: "Indigo" }, { value: "violet", label: "Violet" }, { value: "pink", label: "Pink" }];
const FEED_PAGE_SIZE = 10;

async function withAvatarUrls(_session: Session, people: FamilyPerson[]) {
  const paths = Array.from(new Set(people.map(person => person.avatar_path).filter((path): path is string => Boolean(path))));
  const urls = new Map(paths.map(path => [path, storageImageUrl("avatars", path)] as const));
  return people.map(person => ({ ...person, avatarUrl: person.avatar_path ? urls.get(person.avatar_path) ?? null : null }));
}

export default function PupdateApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dog, setDog] = useState<Dog | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [careEvents, setCareEvents] = useState<CareEvent[]>([]);
  const [tab, setTab] = useState<Tab>("feed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authView, setAuthView] = useState<AuthView>("welcome");

  const hydrate = useCallback(async (active: Session) => {
    const current = await ensureSession(active); saveSession(current); setSession(current);
    const ownProfiles = await db<Profile[]>(current, "profiles", `?id=eq.${current.user.id}&select=*`);
    const ownProfile = ownProfiles[0] ?? null;
    const visibleProfiles = await withAvatarUrls(current, await db<Profile[]>(current, "profiles", "?select=*").catch(() => ownProfiles));
    const [dogs, fetchedUpdates, care] = await Promise.all([
      db<Dog[]>(current, "dogs", "?select=*&order=created_at.asc&limit=1"),
      db<Omit<Post, "photos" | "likes" | "comments">[]>(current, "pupdates", `?select=*&order=created_at.desc&limit=${FEED_PAGE_SIZE + 1}`),
      db<CareEvent[]>(current, "care_events", "?select=*&order=occurred_at.desc").catch(() => []),
    ]);
    const updates = fetchedUpdates.slice(0, FEED_PAGE_SIZE);
    const postIds = updates.map(post => post.id);
    const related = postIds.length ? `?pupdate_id=in.(${postIds.join(",")})&select=*` : "?pupdate_id=eq.00000000-0000-0000-0000-000000000000&select=*";
    const [photos, likes, comments] = await Promise.all([
      db<Photo[]>(current, "pupdate_photos", `${related}&order=sort_order.asc`),
      db<Like[]>(current, "pupdate_likes", `${related}&order=created_at.asc`).catch(() => []),
      db<Comment[]>(current, "pupdate_comments", `${related}&order=created_at.asc`).catch(() => []),
    ]);
    const withUrls = photos.map(photo => ({ ...photo, url: storageImageUrl("pupdates", photo.storage_path) ?? undefined }));
    setProfile(ownProfile); setDog(dogs[0] ?? null);
    setPosts(updates.map(post => { const posterProfile = visibleProfiles.find(item => item.id === post.owner_id); return { ...post, poster: posterProfile, poster_avatar_path: posterProfile?.avatar_path ?? null, poster_tag: posterProfile?.member_tag ?? "HOOMAN", poster_tag_color: posterProfile?.tag_color ?? "purple", poster_role: posterProfile?.role ?? "user", photos: withUrls.filter(photo => photo.pupdate_id === post.id), likes: likes.filter(like => like.pupdate_id === post.id).map(like => ({ ...like, person: visibleProfiles.find(item => item.id === like.user_id) })), comments: comments.filter(comment => comment.pupdate_id === post.id).map(comment => ({ ...comment, person: visibleProfiles.find(item => item.id === comment.user_id) })) }; }));
    setHasMorePosts(fetchedUpdates.length > FEED_PAGE_SIZE);
    setCareEvents(care);
    return current;
  }, []);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("access_token") && hash.get("refresh_token")) {
      const next: Session = { access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")!, expires_at: Math.floor(Date.now() / 1000) + Number(hash.get("expires_in") ?? 3600), user: { id: "" } };
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${next.access_token}` } })
        .then(response => response.json()).then(user => {
          next.user = user;
          saveSession(next);
          if (hash.get("type") === "recovery") {
            setSession(next);
            setAuthView("reset");
          } else {
            void hydrate(next).catch(reason => setError(message(reason)));
          }
        }).finally(() => setLoading(false));
      window.history.replaceState({}, "", window.location.pathname); return;
    }
    const stored = readSession();
    if (!stored) { queueMicrotask(() => setLoading(false)); return; }
    queueMicrotask(() => { void hydrate(stored).catch(reason => { saveSession(null); setError(reason.message); }).finally(() => setLoading(false)); });
  }, [hydrate]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      void ensureSession(session).then(next => setSession(next)).catch(() => { saveSession(null); setSession(null); });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [session]);

  async function authenticated(next: Session) { setLoading(true); setError(""); try { await hydrate(next); } catch (reason) { setError(message(reason)); } finally { setLoading(false); } }
  async function reload() { if (session) await hydrate(session); }
  function mergePost(next: Post) { setPosts(current => [next, ...current.filter(post => post.id !== next.id && (!next.client_submission_id || post.client_submission_id !== next.client_submission_id))].sort((a, b) => b.created_at.localeCompare(a.created_at))); }
  async function loadMorePosts() {
    if (!session || loadingMorePosts || !posts.length) return;
    setLoadingMorePosts(true);
    try {
      const current = await ensureSession(session); saveSession(current); setSession(current);
      const visibleProfiles = await withAvatarUrls(current, await db<Profile[]>(current, "profiles", "?select=*").catch(() => profile ? [profile] : []));
      const oldest = posts[posts.length - 1];
      const fetchedUpdates = await db<Omit<Post, "photos" | "likes" | "comments">[]>(current, "pupdates", `?select=*&order=created_at.desc&created_at=lt.${encodeURIComponent(oldest.created_at)}&limit=${FEED_PAGE_SIZE + 1}`);
      const updates = fetchedUpdates.slice(0, FEED_PAGE_SIZE);
      const postIds = updates.map(post => post.id);
      const related = postIds.length ? `?pupdate_id=in.(${postIds.join(",")})&select=*` : "?pupdate_id=eq.00000000-0000-0000-0000-000000000000&select=*";
      const [photos, likes, comments] = await Promise.all([
        db<Photo[]>(current, "pupdate_photos", `${related}&order=sort_order.asc`),
        db<Like[]>(current, "pupdate_likes", `${related}&order=created_at.asc`).catch(() => []),
        db<Comment[]>(current, "pupdate_comments", `${related}&order=created_at.asc`).catch(() => []),
      ]);
      const withUrls = photos.map(photo => ({ ...photo, url: storageImageUrl("pupdates", photo.storage_path) ?? undefined }));
      const page = updates.map(post => { const posterProfile = visibleProfiles.find(item => item.id === post.owner_id); return { ...post, poster: posterProfile, poster_avatar_path: posterProfile?.avatar_path ?? null, poster_tag: posterProfile?.member_tag ?? "HOOMAN", poster_tag_color: posterProfile?.tag_color ?? "purple", poster_role: posterProfile?.role ?? "user", photos: withUrls.filter(photo => photo.pupdate_id === post.id), likes: likes.filter(like => like.pupdate_id === post.id).map(like => ({ ...like, person: visibleProfiles.find(item => item.id === like.user_id) })), comments: comments.filter(comment => comment.pupdate_id === post.id).map(comment => ({ ...comment, person: visibleProfiles.find(item => item.id === comment.user_id) })) }; });
      setPosts(current => [...current, ...page.filter(next => !current.some(post => post.id === next.id || (next.client_submission_id && post.client_submission_id === next.client_submission_id)))]); setHasMorePosts(fetchedUpdates.length > FEED_PAGE_SIZE);
    } catch (reason) { setError(message(reason)); } finally { setLoadingMorePosts(false); }
  }
  function openPupdate(postId: string) { setTab("feed"); window.setTimeout(() => document.getElementById(`pupdate-${postId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
  async function logout() { if (!session) return; await signOut(session); setSession(null); setProfile(null); setDog(null); setPosts([]); setTab("feed"); setAuthView("welcome"); }

  if (loading) return <Loading />;
  if (!supabaseConfigured) return <SetupRequired />;
  if (!session) return <AuthScreen view={authView} setView={setAuthView} onSession={authenticated} error={error} setError={setError} />;
  if (authView === "reset") return <ResetPassword session={session} onDone={() => { setAuthView("welcome"); void authenticated(session); }} />;
  if (!profile?.onboarding_complete || !dog) return <Onboarding session={session} initialName={String(session.user.user_metadata?.display_name ?? "")} onDone={reload} />;

  return <div className="mx-auto min-h-screen max-w-[680px] bg-[#fbf8f3] pb-24 text-[#312b34] shadow-[0_0_70px_rgba(50,35,60,0.08)]">
    <AppHeader dog={dog} profile={profile} posts={posts} session={session} onPepper={() => setTab("pepper")} onProfile={() => setTab("profile")} onPupdate={openPupdate} />
    {error && <Notice text={error} onClose={() => setError("")} />}
    {tab === "feed" && <Feed posts={posts} dog={dog} profile={profile} onCreate={() => setTab("add")} onChanged={reload} onLoadMore={loadMorePosts} hasMore={hasMorePosts} loadingMore={loadingMorePosts} session={session} setError={setError} />}
    {tab === "add" && <AddPupdate session={session} profile={profile} onCreated={post => { mergePost(post); setTab("feed"); }} setError={setError} />}
    {tab === "scrapbook" && <Scrapbook posts={posts} dog={dog} profile={profile} session={session} onChanged={reload} setError={setError} />}
    {tab === "pepper" && <PepperProfileV2 session={session} dog={dog} posts={posts} careEvents={careEvents} onChanged={reload} setError={setError} />}
    {tab === "profile" && <UserProfile session={session} profile={profile} posts={posts.filter(post => post.owner_id === session.user.id)} onChanged={reload} onSignOut={logout} setError={setError} />}
    <BottomNav tab={tab} setTab={setTab} />
  </div>;
}

function AuthScreen({ view, setView, onSession, error, setError }: { view: AuthView; setView: (v: AuthView) => void; onSession: (s: Session) => void; error: string; setError: (s: string) => void }) {
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); const data = new FormData(event.currentTarget);
    try {
      if (view === "login") onSession(await logIn(String(data.get("email")), String(data.get("password"))));
      if (view === "signup") { const result = await signUp(String(data.get("email")), String(data.get("password")), String(data.get("name"))); if (result.session) onSession(result.session); else setNotice("Check your email to confirm your account, then log in."); }
      if (view === "forgot") { await forgotPassword(String(data.get("email"))); setNotice("Password reset instructions are on their way."); }
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  if (view === "welcome") return <main className="grid min-h-screen place-items-center bg-[#fbf8f3] px-6"><div className="w-full max-w-md text-center"><Logo /><div className="mx-auto mt-10 grid size-36 place-items-center rounded-full bg-[#eee4f5] text-7xl shadow-inner" aria-hidden>🐾</div><h1 className="mt-8 font-serif text-4xl font-bold">Pepper’s story, shared.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#7c7181]">A private home for every Pupdate, favourite photo and family memory.</p><button onClick={() => setView("signup")} className="primary mt-9">Create an account</button><button onClick={() => setView("login")} className="secondary mt-3">Log in</button></div></main>;
  return <main className="min-h-screen bg-[#fbf8f3] px-6 py-10"><div className="mx-auto max-w-md"><button onClick={() => { setView("welcome"); setError(""); }} className="text-sm font-bold text-[#7350a5]">← Back</button><div className="mt-8"><Logo /></div><h1 className="mt-8 font-serif text-3xl font-bold">{view === "signup" ? "Join Pupdates" : view === "login" ? "Welcome back" : "Reset your password"}</h1><p className="mt-2 text-sm text-[#7c7181]">{view === "forgot" ? "We’ll email you a secure reset link." : "Your private Pepper scrapbook is waiting."}</p>{error && <p className="mt-5 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p className="mt-5 rounded-2xl bg-[#eee6f5] p-3 text-sm text-[#67428f]">{notice}</p>}<form onSubmit={submit} className="mt-7 space-y-4">{view === "signup" && <Field label="Your name"><input className="field" name="name" required autoComplete="name" /></Field>}<Field label="Email"><input className="field" name="email" type="email" required autoComplete="email" /></Field>{view !== "forgot" && <Field label="Password"><input className="field" name="password" type="password" minLength={8} required autoComplete={view === "signup" ? "new-password" : "current-password"} /></Field>}<button disabled={busy} className="primary">{busy ? "Please wait…" : view === "signup" ? "Sign up" : view === "login" ? "Log in" : "Send reset link"}</button></form>{view === "login" && <button onClick={() => setView("forgot")} className="mt-5 w-full text-sm font-bold text-[#7350a5]">Forgot password?</button>}</div></main>;
}

function ResetPassword({ session, onDone }: { session: Session; onDone: () => void }) { const [error, setError] = useState(""); return <main className="grid min-h-screen place-items-center bg-[#fbf8f3] px-6"><form className="w-full max-w-md" onSubmit={async e => { e.preventDefault(); const password = String(new FormData(e.currentTarget).get("password")); try { await updatePassword(session, password); onDone(); } catch (reason) { setError(message(reason)); } }}><Logo /><h1 className="mt-8 font-serif text-3xl font-bold">Choose a new password</h1>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6"><Field label="New password"><input name="password" className="field" type="password" minLength={8} required /></Field></div><button className="primary mt-5">Save password</button></form></main>; }

function Onboarding({ session, initialName, onDone }: { session: Session; initialName: string; onDone: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(""); const data = new FormData(e.currentTarget); let path: string | null = null; try { if (photo) path = await upload(session, "avatars", photo); await db(session, "profiles", "?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: session.user.id, display_name: String(data.get("humanName")), bio: String(data.get("bio")) || null, avatar_path: path, onboarding_complete: true }) }); await onDone(); } catch (reason) { if (path) await removeUpload(session, "avatars", path).catch(() => undefined); setError(message(reason)); } finally { setBusy(false); } }
  return <main className="min-h-screen bg-[#fbf8f3] px-6 py-10"><form onSubmit={submit} className="mx-auto max-w-md"><Logo /><p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-[#8057ac]">Welcome to the family</p><h1 className="mt-2 font-serif text-4xl font-bold">Create your profile</h1><p className="mt-3 text-sm leading-6 text-[#7a6f7e]">Add a few details so everyone knows which Hooman is sharing Pepper’s moments.</p>{error && <p className="mt-5 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<PhotoPicker file={photo} setFile={setPhoto} label="Add profile photo" /><div className="mt-7 space-y-4"><Field label="Your name"><input name="humanName" defaultValue={initialName} className="field" required autoComplete="name" /></Field><Field label="Bio (optional)"><textarea name="bio" className="field resize-none" rows={4} maxLength={300} placeholder="Tell the family a little about you" /></Field></div><button disabled={busy} className="primary mt-6">{busy ? "Creating profile…" : "Confirm"}</button></form></main>;
}

function Header({ dog, profile, onProfile }: { dog: Dog; profile: Profile; session: Session; onProfile: () => void }) { const dogUrl = storageImageUrl("avatars", dog.photo_path); const avatar = storageImageUrl("avatars", profile.avatar_path); return <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/[.05] bg-[#fbf8f3]/95 px-4 py-3 backdrop-blur"><button onClick={onProfile} className="relative size-11 overflow-hidden rounded-full bg-[#e8deee]">{dogUrl ? <Image src={dogUrl} alt={dog.name} fill sizes="44px" className="object-cover" /> : <span className="text-xl">🐾</span>}</button><div className="min-w-0 flex-1"><Logo compact /><p className="truncate text-[11px] font-semibold text-[#887d8c]">{dog.name} the {dog.breed}</p></div><button aria-label="Notifications" className="grid size-10 place-items-center rounded-full bg-white"><BellIcon className="size-5" /></button><button onClick={onProfile} className="relative size-9 overflow-hidden rounded-full bg-[#7450a8] text-xs font-bold text-white">{avatar ? <Image src={avatar} alt={profile.display_name} fill sizes="36px" className="object-cover" /> : profile.display_name.slice(0, 1).toUpperCase()}</button></header>; }

function Feed({ posts, dog, profile, onCreate, onChanged, onLoadMore, hasMore, loadingMore, session, setError }: { posts: Post[]; dog: Dog; profile: Profile; onCreate: () => void; onChanged: () => void; onLoadMore: () => void; hasMore: boolean; loadingMore: boolean; session: Session; setError: (s: string) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  async function refresh() { setRefreshing(true); setPullDistance(58); try { await onChanged(); } finally { window.setTimeout(() => { setRefreshing(false); setPullDistance(0); }, 350); } }
  function startPull(y: number) { if (window.scrollY <= 0 && !refreshing) setPullStart(y); }
  function movePull(y: number) { if (pullStart === null || refreshing) return; const distance = Math.max(0, y - pullStart); setPullDistance(Math.min(92, distance * 0.55)); }
  function finishPull() { if (pullStart === null || refreshing) return; setPullStart(null); if (pullDistance >= 58) void refresh(); else setPullDistance(0); }
  if (!posts.length) return <section className="grid min-h-[70vh] place-items-center px-7 text-center"><div><div className="mx-auto grid size-40 place-items-center rounded-[42px] bg-[#eee5f4] text-7xl shadow-inner" aria-hidden>🐶</div><h1 className="mt-7 font-serif text-3xl font-bold">The first page is yours</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#817687]">Share {dog.name}’s first moment and begin a scrapbook your family can keep forever.</p><button onClick={onCreate} className="primary mt-7">Create First Pupdate</button></div></section>;
  return <main onTouchStart={event => startPull(event.touches[0].clientY)} onTouchMove={event => movePull(event.touches[0].clientY)} onTouchEnd={finishPull} onTouchCancel={finishPull} className="px-3 py-5 overscroll-y-contain sm:px-6"><div aria-live="polite" style={{ height: pullDistance }} className="flex items-center justify-center overflow-hidden transition-[height] duration-200"><div className={`grid size-10 place-items-center rounded-full bg-white text-[#7450a8] shadow-sm ring-1 ring-black/[.05] ${pullDistance >= 58 && !refreshing ? "scale-100" : "scale-90"}`}><RefreshIcon className={`size-5 transition-transform ${refreshing ? "animate-spin" : pullDistance >= 58 ? "rotate-180" : ""}`} /></div><span className="sr-only">{refreshing ? "Refreshing feed" : pullDistance >= 58 ? "Release to refresh" : "Pull down to refresh"}</span></div><div className="space-y-5">{posts.map(post => <PostCard key={post.id} post={post} profile={profile} session={session} onChanged={onChanged} setError={setError} />)}</div>{hasMore && <button type="button" onClick={onLoadMore} disabled={loadingMore} className="secondary mt-6">{loadingMore ? "Loading older Pupdates..." : "Load older Pupdates"}</button>}</main>;
}

function PostCard({ post, profile, session, onChanged, setError }: { post: Post; profile: Profile; session: Session; onChanged: () => void; setError: (s: string) => void }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [viewingPerson, setViewingPerson] = useState<FamilyPerson | null>(null);
  const [showLikers, setShowLikers] = useState(false);
  const liked = post.likes.some(like => like.user_id === session.user.id);
  const author = post.poster?.display_name || post.poster_name || "Hooman";
  const authorAvatar = post.poster?.avatarUrl ?? null;
  async function edit() { const caption = window.prompt("Edit caption", post.caption); if (caption === null) return; try { await db(session, "pupdates", `?id=eq.${post.id}`, { method: "PATCH", body: JSON.stringify({ caption, updated_at: new Date().toISOString() }) }); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function remove() { if (!window.confirm("Delete this Pupdate permanently?")) return; try { await Promise.all(post.photos.map(photo => removeUpload(session, "pupdates", photo.storage_path))); await db(session, "pupdates", `?id=eq.${post.id}`, { method: "DELETE" }); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function toggleLike() { try { if (liked) await db(session, "pupdate_likes", `?pupdate_id=eq.${post.id}&user_id=eq.${session.user.id}`, { method: "DELETE" }); else { setLikeAnimating(true); window.setTimeout(() => setLikeAnimating(false), 520); await db(session, "pupdate_likes", "", { method: "POST", body: JSON.stringify({ pupdate_id: post.id, user_id: session.user.id, liker_name: profile.display_name }) }); } await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function addComment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("comment")).trim(); if (!body) return; try { await db(session, "pupdate_comments", "", { method: "POST", body: JSON.stringify({ pupdate_id: post.id, user_id: session.user.id, author_name: profile.display_name, body }) }); form.reset(); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function removeComment(comment: Comment) { if (!window.confirm("Delete this comment permanently?")) return; try { await db(session, "pupdate_comments", `?id=eq.${comment.id}`, { method: "DELETE" }); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function savePhoto() { const photo = post.photos[index]; if (!photo?.url) return; try { const response = await fetch(photo.url); if (!response.ok) throw new Error("The photo could not be downloaded."); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `pupdate-${post.id}-${index + 1}.${blob.type.split("/")[1] || "jpg"}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (reason) { setError(message(reason)); } }
  function finishSwipe(end: number) { if (touchStart === null) return; const distance = end - touchStart; if (distance < -45 && index < post.photos.length - 1) setIndex(value => value + 1); if (distance > 45 && index > 0) setIndex(value => value - 1); setTouchStart(null); }
  const visibleComments = showAllComments ? post.comments : post.comments.slice(0, 2);
  const canDeletePost = post.owner_id === session.user.id || profile.role === "admin";
  return <article id={`pupdate-${post.id}`} className="scroll-mt-20 overflow-hidden rounded-[26px] border border-black/[.05] bg-white shadow-[0_9px_30px_rgba(55,40,65,.06)]">{viewingPerson && <FamilyProfileModal person={viewingPerson} session={session} onClose={() => setViewingPerson(null)} />}{showLikers && <LikersModal likes={post.likes} onClose={() => setShowLikers(false)} onSelect={person => { setShowLikers(false); setViewingPerson(person); }} />}<div className="flex items-center gap-4 px-5 py-4"><button onClick={() => post.poster && setViewingPerson(post.poster)} disabled={!post.poster} aria-label={`Open ${author}'s profile`} className="relative grid size-11 shrink-0 overflow-hidden rounded-full bg-[#7450a8] text-sm font-bold text-white">{authorAvatar ? <Image src={authorAvatar} alt={author} fill sizes="44px" className="object-cover" /> : <span className="grid h-full place-items-center">{author.slice(0, 1).toUpperCase()}</span>}</button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><button onClick={() => post.poster && setViewingPerson(post.poster)} disabled={!post.poster} className="min-w-0 truncate text-left text-sm font-bold">{author}</button><TagBadge label={post.poster_role === "admin" ? "CHIEF HOOMAN" : post.poster_tag || "HOOMAN"} color={post.poster_tag_color || "purple"} compact /></div><p className="mt-1 text-[11px] text-[#8f8497]">{formatDate(post.created_at)}{post.location ? ` · ${post.location}` : ""}</p></div><div className="flex items-center gap-1"><button type="button" onClick={savePhoto} aria-label="Save photo to camera roll" title="Save to camera roll" className="grid size-9 place-items-center"><SaveIcon className="size-5" /></button>{canDeletePost && <div className="relative"><button onClick={() => setMenu(!menu)} className="grid size-9 place-items-center"><MoreIcon className="size-5" /></button>{menu && <div className="absolute right-0 z-10 w-32 rounded-xl bg-white p-1 text-xs font-bold shadow-xl">{post.owner_id === session.user.id && <button onClick={edit} className="w-full px-3 py-2 text-left">Edit</button>}<button onClick={remove} className="w-full px-3 py-2 text-left text-red-600">Delete</button></div>}</div>}</div></div>{post.photos[0]?.url && <div onTouchStart={event => setTouchStart(event.touches[0].clientX)} onTouchEnd={event => finishSwipe(event.changedTouches[0].clientX)} className="relative flex w-full max-h-[min(80vh,850px)] touch-pan-y items-center justify-center overflow-hidden bg-[#eee9e3]"><Image src={post.photos[index].url!} alt={post.caption || "Pupdate photo"} width={1280} height={960} sizes="(max-width: 680px) 100vw, 680px" quality={72} loading="lazy" decoding="async" draggable={false} className="block h-auto max-h-[min(80vh,850px)] w-full object-contain" />{index > 0 && <SlideButton left onClick={() => setIndex(index - 1)} />}{index < post.photos.length - 1 && <SlideButton onClick={() => setIndex(index + 1)} />}{post.photos.length > 1 && <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/25 px-2 py-1">{post.photos.map((photo, photoIndex) => <span key={photo.id} className={`size-1.5 rounded-full ${photoIndex === index ? "bg-white" : "bg-white/50"}`} />)}</div>}</div>}<div className="p-4"><div className="relative flex items-center gap-2"><button onClick={toggleLike} aria-label={liked ? "Unlike Pupdate" : "Like Pupdate"} className={`grid size-10 shrink-0 place-items-center rounded-full ${liked ? "bg-[#f0e7f7] text-[#7450a8]" : "bg-[#f5f1ed] text-[#645b67]"}`}><svg viewBox="0 0 24 24" aria-hidden="true" className={`size-6 ${likeAnimating ? "opacity-0" : "opacity-100"}`} fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg></button>{likeAnimating && <span className="paw-stamp-animation pointer-events-none absolute left-0 top-0 grid size-10 place-items-center text-[#7450a8]"><svg viewBox="0 0 48 48" aria-hidden="true" className="size-10" fill="currentColor"><ellipse cx="24" cy="30" rx="11" ry="9" transform="rotate(-8 24 30)"/><ellipse cx="11" cy="20" rx="5" ry="6" transform="rotate(-28 11 20)"/><ellipse cx="21" cy="13" rx="5" ry="7" transform="rotate(-8 21 13)"/><ellipse cx="33" cy="14" rx="5" ry="7" transform="rotate(12 33 14)"/><ellipse cx="39" cy="24" rx="5" ry="6" transform="rotate(30 39 24)"/></svg></span>}<LikeSummary likes={post.likes} currentProfile={profile} onPerson={setViewingPerson} onAll={() => setShowLikers(true)} /></div><p className="mt-3 text-sm leading-6"><button onClick={() => post.poster && setViewingPerson(post.poster)} disabled={!post.poster} style={{ fontWeight: 800 }}>{author}</button> {post.caption}</p><div className="mt-3 space-y-2">{visibleComments.map(comment => <div key={comment.id} className="flex items-start gap-2 text-sm"><p className="flex min-w-0 flex-1 items-baseline gap-1"><button onClick={() => comment.person && setViewingPerson(comment.person)} disabled={!comment.person} style={{ fontWeight: 800 }} className="shrink-0 leading-5">{comment.author_name}</button><span className="min-w-0 leading-5">{comment.body}</span></p>{(comment.user_id === session.user.id || profile.role === "admin") && <button onClick={() => removeComment(comment)} aria-label={`Delete comment by ${comment.author_name}`} className="shrink-0 text-[11px] font-bold text-red-500">Delete</button>}</div>)}{post.comments.length > 2 && <button onClick={() => setShowAllComments(value => !value)} className="text-xs font-bold text-[#7d7182]">{showAllComments ? "Show fewer comments" : `See all ${post.comments.length} comments`}</button>}</div>{post.tags.length > 0 && <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-[#8b62bd]">{post.tags.join(" · ")}</p>}<form onSubmit={addComment} className="mt-3 flex gap-2"><input name="comment" maxLength={500} aria-label="Add comment" placeholder="Add comment" className="min-w-0 flex-1 rounded-full bg-[#f5f1ed] px-4 py-2.5 text-sm outline-none" /><button className="rounded-full bg-[#7450a8] px-4 text-xs font-bold text-white">Send</button></form></div></article>;
}

function AddPupdate({ session, profile, onCreated, setError }: { session: Session; profile: Profile; onCreated: (post: Post) => void; setError: (s: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const additions = Array.from(selected);
    const firstNewIndex = files.length;
    setFiles(current => [...current, ...additions]);
    setIndex(firstNewIndex);
  }
  function removeCurrent() {
    setFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
    setIndex(current => Math.max(0, Math.min(current, files.length - 2)));
  }
  function finishSwipe(end: number) {
    if (touchStart === null) return;
    const distance = end - touchStart;
    if (distance < -45 && index < files.length - 1) setIndex(value => value + 1);
    if (distance > 45 && index > 0) setIndex(value => value - 1);
    setTouchStart(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current || !files.length) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const uploaded: string[] = [];
    const clientSubmissionId = crypto.randomUUID();
    try {
      for (const file of files) uploaded.push(await upload(session, "pupdates", file));
      const [post] = await db<Omit<Post, "photos" | "likes" | "comments">[]>(session, "pupdates", "?on_conflict=client_submission_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ owner_id: session.user.id, poster_name: profile.display_name, client_submission_id: clientSubmissionId, caption: String(data.get("caption")), location: String(data.get("location")) || null, event_date: String(data.get("eventDate")) || null, tags: data.getAll("tags") }) });
      const photos = await db<Photo[]>(session, "pupdate_photos", "?on_conflict=pupdate_id,sort_order", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(uploaded.map((storage_path, sort_order) => ({ owner_id: session.user.id, pupdate_id: post.id, storage_path, sort_order }))) });
      const withUrls = photos.map(photo => ({ ...photo, url: storageImageUrl("pupdates", photo.storage_path) ?? undefined }));
      const poster = profile.avatar_path ? { ...profile, avatarUrl: storageImageUrl("avatars", profile.avatar_path) } : profile;
      onCreated({ ...post, poster, poster_avatar_path: profile.avatar_path, poster_tag: profile.member_tag ?? "HOOMAN", poster_tag_color: profile.tag_color ?? "purple", poster_role: profile.role, photos: withUrls, likes: [], comments: [] });
      setFiles([]);
      setIndex(0);
    } catch (reason) {
      await Promise.all(uploaded.map(path => removeUpload(session, "pupdates", path).catch(() => undefined)));
      setError(message(reason));
    } finally { submittingRef.current = false; setBusy(false); }
  }

  return <main className="px-5 py-6 sm:px-7"><h1 className="font-serif text-3xl font-bold">Add Pupdate</h1><form onSubmit={submit}>{files.length ? <div onTouchStart={event => setTouchStart(event.touches[0].clientX)} onTouchEnd={event => finishSwipe(event.changedTouches[0].clientX)} className="relative mt-6 flex min-h-52 max-h-[min(70vh,720px)] touch-pan-y items-center justify-center overflow-hidden rounded-[28px] bg-[#eee9e3]"><img src={previews[index]} alt={`Selected photo ${index + 1}`} draggable={false} className="block h-auto max-h-[min(70vh,720px)] w-full select-none object-contain" />{index > 0 && <SlideButton left onClick={() => setIndex(value => value - 1)} />}{index < files.length - 1 && <SlideButton onClick={() => setIndex(value => value + 1)} />}<div className="absolute right-3 top-3 flex gap-2"><label className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/95 text-[#7450a8] shadow-lg" aria-label="Add more photos"><input className="sr-only" type="file" accept="image/*" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /><PlusIcon className="size-5" /></label><button type="button" onClick={removeCurrent} aria-label="Remove this photo" className="grid size-11 place-items-center rounded-full bg-white/95 text-red-600 shadow-lg"><TrashIcon className="size-5" /></button></div>{files.length > 1 && <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5">{files.map((file, photoIndex) => <button type="button" aria-label={`Show photo ${photoIndex + 1}`} key={`${file.name}-${file.lastModified}-${photoIndex}`} onClick={() => setIndex(photoIndex)} className={`size-2 rounded-full ${photoIndex === index ? "bg-white" : "bg-white/50"}`} />)}</div>}</div> : <label className="mt-6 grid min-h-52 cursor-pointer place-items-center rounded-[28px] border-2 border-dashed border-[#c9b4df] bg-[#f2ecf7] p-6 text-center"><input className="sr-only" type="file" accept="image/*" multiple disabled={busy} onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /><span><CameraIcon className="mx-auto size-9 text-[#7450a8]" /><strong className="mt-3 block">Choose photos</strong><small className="mt-1 block text-[#887a90]">Upload one or more moments</small></span></label>}<div className="mt-5 space-y-4"><Field label="Caption"><textarea name="caption" className="field resize-none" rows={4} maxLength={2200} /></Field><Field label="Location (optional)"><input name="location" className="field" /></Field><Field label="Event date (optional)"><input name="eventDate" type="date" className="field" /></Field><Field label="Private scrapbook tags"><div className="grid grid-cols-2 gap-2">{["walkies", "holiday", "treats", "with-friends"].map(tag => <label key={tag} className="rounded-full bg-white px-4 py-3 text-xs font-bold capitalize ring-1 ring-black/[.06]"><input type="checkbox" name="tags" value={tag} className="mr-2 accent-[#7450a8]" />{tag.replace("-", " ")}</label>)}</div></Field></div><button type="submit" disabled={busy || !files.length} className="primary mt-6">{busy ? "Posting…" : "Post Pupdate"}</button></form></main>;
}

function Scrapbook({ posts, dog, profile, session, onChanged, setError }: { posts: Post[]; dog: Dog; profile: Profile; session: Session; onChanged: () => void; setError: (s: string) => void }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [showPosters, setShowPosters] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const profileUrl = storageImageUrl("avatars", profile.avatar_path);
  const posters = Array.from(new Set(posts.map(post => post.poster_name || profile.display_name))).sort();
  const filtered = posts.filter(post => {
    const author = post.poster_name || profile.display_name;
    const words = `${post.caption} ${post.location ?? ""} ${author}`.toLowerCase();
    return (!query.trim() || words.includes(query.trim().toLowerCase())) && (!tag || post.tags.includes(tag)) && (!poster || author === poster);
  });
  const months = filtered.reduce<Record<string, Post[]>>((groups, post) => {
    const date = new Date(post.event_date ? `${post.event_date}T00:00:00` : post.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    (groups[key] ??= []).push(post);
    return groups;
  }, {});
  const monthKeys = Object.keys(months).sort().reverse();
  const filters = [["walkies", "Walkies"], ["holiday", "Holiday"], ["treats", "Treats"], ["with-friends", "With Friends"]];
  return <main className="px-4 py-6 sm:px-7">
    <h1 className="font-serif text-3xl font-bold">Scrapbook</h1>
    <p className="mt-2 text-sm text-[#84798a]">Every Pupdate in one place!<br />{dog.name}, scrapbooked.</p>
    <div className="mt-5 rounded-[24px] bg-white p-3 shadow-sm">
      <label className="flex items-center gap-2 rounded-2xl bg-[#f4f0ec] px-4"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Pupdates" className="search-input min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /></label>
      <div className="scrollbar-none mt-3 flex touch-pan-x gap-2 overflow-x-auto pb-1">
        <button onClick={() => { setTag(null); setPoster(null); setShowPosters(false); }} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${!tag && !poster ? "bg-[#7450a8] text-white" : "bg-[#eee6f5] text-[#67428f]"}`}>All</button>
        <button onClick={() => setShowPosters(value => !value)} aria-expanded={showPosters} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${poster || showPosters ? "bg-[#7450a8] text-white" : "bg-[#eee6f5] text-[#67428f]"}`}>Posted by</button>
        {filters.map(([value, label]) => <button key={value} onClick={() => { setTag(tag === value ? null : value); setPoster(null); setShowPosters(false); }} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${tag === value ? "bg-[#7450a8] text-white" : "bg-[#eee6f5] text-[#67428f]"}`}>{label}</button>)}
      </div>
      {showPosters && <div className="scrollbar-none mt-3 flex touch-pan-x gap-3 overflow-x-auto border-t border-[#eee7f0] px-1 pt-4 pb-1">
        <button onClick={() => { setPoster(null); setTag(null); }} className="shrink-0 px-1 text-center"><span className={`mx-auto grid size-11 place-items-center rounded-full text-lg font-bold ${!poster ? "bg-[#7450a8] text-white ring-2 ring-[#c8afe1] ring-offset-2" : "bg-[#eee6f5] text-[#7450a8]"}`}>★</span><span className="mt-1.5 block text-[10px] font-bold">Everyone</span></button>
        {posters.map(name => <button key={name} onClick={() => { setPoster(name); setTag(null); }} className="shrink-0 px-1 text-center"><span className={`relative mx-auto grid size-11 overflow-hidden rounded-full text-sm font-bold ${poster === name ? "bg-[#7450a8] text-white ring-2 ring-[#c8afe1] ring-offset-2" : "bg-[#eee6f5] text-[#7450a8]"}`}>{name === profile.display_name && profileUrl ? <Image src={profileUrl} alt={name} fill sizes="44px" className="object-cover" /> : name.slice(0, 1).toUpperCase()}</span><span className="mt-1.5 block max-w-16 truncate text-[10px] font-bold">{name}</span></button>)}
      </div>}
    </div>
    {monthKeys.length ? <div className="mt-7 space-y-8">{monthKeys.map(key => { const date = new Date(`${key}-01T00:00:00`); return <section key={key} className="border-t border-[#ded4e2] pt-5 first:border-0 first:pt-0"><div className="mb-3 flex items-end justify-between"><h2 className="font-serif text-2xl font-bold">{date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2><span className="text-[11px] font-bold text-[#8b7e90]">{months[key].length} {months[key].length === 1 ? "Pupdate" : "Pupdates"}</span></div><div className="grid grid-cols-3 gap-1.5">{months[key].flatMap(post => post.photos.map(photo => <button key={photo.id} onClick={() => setOpenPostId(post.id)} aria-label={`Open Pupdate by ${post.poster_name || profile.display_name}`} className="relative aspect-square overflow-hidden rounded-xl bg-[#e8e1e9]">{photo.url && <Image src={photo.url} alt={post.caption || "Scrapbook memory"} fill sizes="(max-width: 680px) 33vw, 180px" quality={55} loading="lazy" decoding="async" className="object-cover" />}</button>))}</div></section>; })}</div> : <EmptySmall text={posts.length ? "No Pupdates match those filters." : "Photos will appear here after your first Pupdate."} />}
    {openPostId && posts.find(post => post.id === openPostId) && <div role="dialog" aria-modal="true" aria-label="Full Pupdate" className="fixed inset-0 z-50 overflow-y-auto bg-[#302a33]/70 px-3 py-5 backdrop-blur-sm"><div className="mx-auto max-w-[640px]"><div className="sticky top-0 z-10 mb-3 flex justify-end"><button onClick={() => setOpenPostId(null)} aria-label="Close Pupdate" className="grid size-11 place-items-center rounded-full bg-white text-2xl shadow-lg">×</button></div><PostCard post={posts.find(post => post.id === openPostId)!} profile={profile} session={session} onChanged={onChanged} setError={setError} /></div></div>}
  </main>;
}

function ProfilePage({ session, profile, dog, posts, onChanged, onSignOut, setError }: { session: Session; profile: Profile; dog: Dog; posts: Post[]; onChanged: () => void; onSignOut: () => void; setError: (s: string) => void }) { const accountUrl = storageImageUrl("avatars", profile.avatar_path); const dogUrl = storageImageUrl("avatars", dog.photo_path); async function replace(kind: "user" | "dog", file?: File) { if (!file) return; try { const next = await upload(session, "avatars", file); const old = kind === "user" ? profile.avatar_path : dog.photo_path; await db(session, kind === "user" ? "profiles" : "dogs", kind === "user" ? `?id=eq.${session.user.id}` : `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify(kind === "user" ? { avatar_path: next } : { photo_path: next }) }); if (old) await removeUpload(session, "avatars", old); await onChanged(); } catch (reason) { setError(message(reason)); } } async function remove(kind: "user" | "dog") { const old = kind === "user" ? profile.avatar_path : dog.photo_path; if (!old) return; try { await db(session, kind === "user" ? "profiles" : "dogs", kind === "user" ? `?id=eq.${session.user.id}` : `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify(kind === "user" ? { avatar_path: null } : { photo_path: null }) }); await removeUpload(session, "avatars", old); await onChanged(); } catch (reason) { setError(message(reason)); } } return <main className="px-5 py-6 sm:px-7"><section className="rounded-[28px] bg-white p-5 shadow-sm"><h1 className="font-serif text-2xl font-bold">Your account</h1><PhotoManager url={accountUrl} label={profile.display_name} onChange={file => replace("user", file)} onDelete={() => remove("user")} /><p className="mt-3 text-sm text-[#7d7281]">{session.user.email}</p></section><section className="mt-5 overflow-hidden rounded-[28px] bg-white shadow-sm"><div className="relative h-56 bg-[#eee6f5]">{dogUrl ? <Image src={dogUrl} alt={dog.name} fill sizes="680px" className="object-cover" /> : <span className="grid h-full place-items-center text-7xl">🐾</span>}</div><div className="p-5"><h2 className="font-serif text-3xl font-bold">{dog.name}</h2><p className="mt-1 text-sm font-semibold">{dog.breed} · born {new Date(`${dog.birthday}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>{dog.bio && <p className="mt-3 text-sm leading-6 text-[#766b7a]">{dog.bio}</p>}<PhotoManager compact url={dogUrl} label={`${dog.name}’s photo`} onChange={file => replace("dog", file)} onDelete={() => remove("dog")} /></div></section><div className="mt-5 grid grid-cols-2 gap-3"><Stat value={posts.length} label="Pupdates" /><Stat value={posts.reduce((n, post) => n + post.photos.length, 0)} label="Memories" /></div><button onClick={onSignOut} className="secondary mt-7 text-red-600">Sign out</button></main>; }

function PhotoManager({ url, label, onChange, onDelete, compact = false, crop = !label.toLowerCase().includes("header") }: { url: string | null; label: string; onChange: (f?: File) => void; onDelete: () => void; compact?: boolean; crop?: boolean }) {
  const [selected, setSelected] = useState<File | null>(null);
  function choose(file?: File) { if (!file) return; if (crop) setSelected(file); else onChange(file); }
  return <><div className={`flex items-center gap-3 ${compact ? "mt-5" : "mt-4"}`}><div className={`relative size-16 shrink-0 overflow-hidden bg-[#eee6f5] ${crop ? "rounded-full" : "rounded-2xl"}`}>{url ? <Image src={url} alt={label} fill sizes="64px" className="object-cover" /> : <UserIcon className="m-4 size-8 text-[#7450a8]" />}</div><div className="flex min-h-16 flex-wrap items-center gap-2"><label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full bg-[#7450a8] px-4 py-2 text-center text-xs font-bold leading-none text-white"><input type="file" accept="image/*" className="sr-only" onChange={event => { choose(event.target.files?.[0]); event.currentTarget.value = ""; }} />{url ? "Replace photo" : "Upload photo"}</label>{url && <button onClick={onDelete} className="inline-flex min-h-10 items-center justify-center rounded-full bg-red-50 px-4 py-2 text-xs font-bold leading-none text-red-600">Delete</button>}</div></div>{selected && <CropPhotoModal file={selected} label={label} onCancel={() => setSelected(null)} onSave={file => { setSelected(null); onChange(file); }} />}</>;
}

function CropPhotoModal({ file, label, onCancel, onSave }: { file: File; label: string; onCancel: () => void; onSave: (file: File) => void }) {
  const source = useMemo(() => URL.createObjectURL(file), [file]); const [zoom, setZoom] = useState(1); const [offset, setOffset] = useState({ x: 0, y: 0 }); const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null); const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  function move(event: ReactPointerEvent<HTMLDivElement>) { if (!drag.current) return; setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }); }
  async function save() { const image = imageRef.current; if (!image) return; setSaving(true); const size = 512; const preview = 280; const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom; const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size; canvas.getContext("2d")?.drawImage(image, size / 2 - image.naturalWidth * scale / 2 + offset.x * size / preview, size / 2 - image.naturalHeight * scale / 2 + offset.y * size / preview, image.naturalWidth * scale, image.naturalHeight * scale); const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .9)); if (blob) onSave(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cropped.jpg`, { type: "image/jpeg" })); else setSaving(false); }
  return <div role="dialog" aria-modal="true" aria-label={`Position ${label}`} className="fixed inset-0 z-[90] grid place-items-center bg-[#302a33]/75 p-5 backdrop-blur-sm"><section className="w-full max-w-sm rounded-[30px] bg-[#fbf8f3] p-6 text-center shadow-2xl"><h2 className="font-serif text-2xl font-bold">Position your photo</h2><p className="mt-1 text-sm text-[#7d7281]">Drag to move it inside the circle, then zoom if needed.</p><div onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} className="relative mx-auto mt-5 size-[280px] touch-none cursor-grab overflow-hidden rounded-full bg-[#e8e0eb] ring-4 ring-white shadow-lg active:cursor-grabbing">{source && <img ref={imageRef} src={source} alt="Crop preview" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 size-full max-w-none select-none object-cover" style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})` }} />}</div><label className="mt-5 block text-left text-xs font-bold uppercase tracking-[.12em] text-[#67428f]">Zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="mt-2 w-full accent-[#7450a8]" /></label><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onCancel} className="secondary">Cancel</button><button type="button" onClick={save} disabled={saving} className="primary">{saving ? "Saving…" : "Use photo"}</button></div></section></div>;
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) { const items: [Tab, ReactNode, string][] = [["feed", <HomeIcon key="h" />, "Feed"], ["add", <PlusIcon key="a" />, "Add Pupdate"], ["scrapbook", <BookIcon key="b" />, "Scrapbook"], ["profile", <UserIcon key="u" />, "Profile"]]; return <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[calc(78px+env(safe-area-inset-bottom))] max-w-[680px] items-center justify-evenly border-t border-black/[.06] bg-white/95 px-6 pb-[env(safe-area-inset-bottom)] backdrop-blur">{items.map(([name, icon, label]) => <button key={name} aria-label={label} onClick={() => setTab(name)} className={`grid size-14 place-items-center rounded-full [&>svg]:size-7 ${tab === name ? "bg-[#eee6f5] text-[#7450a8]" : "text-[#827786]"}`}>{icon}</button>)}</nav>; }
function SlideButton({ left, onClick }: { left?: boolean; onClick: () => void }) { return <button aria-label={left ? "Previous photo" : "Next photo"} onClick={onClick} className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-lg ${left ? "left-3" : "right-3"}`}><ChevronIcon className={`size-5 ${left ? "rotate-180" : ""}`} /></button>; }
function SaveIcon({ className = "" }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M12 3v12" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 14.5V20h14v-5.5" /></svg>; }
function RefreshIcon({ className = "" }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.35 5.65" /><path d="M20 4v7h-7" /></svg>; }
function TrashIcon({ className = "" }: { className?: string }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></svg>; }
function PhotoPicker({ file, setFile, label }: { file: File | null; setFile: (f: File | null) => void; label: string }) { const preview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]); useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]); return <label className="mx-auto mt-7 grid size-36 cursor-pointer place-items-center overflow-hidden rounded-full bg-[#eee6f5] text-center text-[#7450a8] ring-4 ring-white shadow-lg"><input type="file" accept="image/*" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />{preview ? <Image src={preview} alt="Photo preview" width={144} height={144} unoptimized className="h-full w-full object-cover" /> : <span><CameraIcon className="mx-auto size-7" /><small className="mt-2 block w-24 font-bold">{label}</small></span>}</label>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[#675c6c]">{label}</span>{children}</label>; }
function Logo({ compact = false }: { compact?: boolean }) { return <div><span className={`${compact ? "text-xl" : "text-3xl"} font-serif font-bold text-[#67428f]`}>Pupdates</span>{!compact && <span className="ml-2 text-lg">🐾</span>}</div>; }
function LikeSummary({ likes, currentProfile, onPerson, onAll }: { likes: Like[]; currentProfile: Profile; onPerson: (person: FamilyPerson) => void; onAll: () => void }) { const name = (like: Like) => like.person?.display_name || like.liker_name || (like.user_id === currentProfile.id ? currentProfile.display_name : "Someone"); const personButton = (like: Like) => <button key={like.id} onClick={() => like.person && onPerson(like.person)} disabled={!like.person} className="font-bold">{name(like)}</button>; if (!likes.length) return null; if (likes.length === 1) return <span className="text-xs font-bold">Liked by {personButton(likes[0])}</span>; if (likes.length === 2) return <span className="text-xs font-bold">Liked by {personButton(likes[0])} and {personButton(likes[1])}</span>; return <span className="text-xs font-bold">Liked by {personButton(likes[0])}, {personButton(likes[1])} and <button onClick={onAll} className="font-bold">{likes.length - 2} {likes.length === 3 ? "other" : "others"}</button></span>; }
function FamilyProfileModal({ person, onClose }: { person: FamilyPerson; session: Session; onClose: () => void }) { const avatar = person.avatarUrl ?? storageImageUrl("avatars", person.avatar_path); return <div role="dialog" aria-modal="true" aria-label={`${person.display_name}'s profile`} className="fixed inset-0 z-[70] grid place-items-center bg-[#302a33]/70 p-5 backdrop-blur-sm" onClick={onClose}><section onClick={event => event.stopPropagation()} className="w-full max-w-sm rounded-[30px] bg-[#fbf8f3] p-6 text-center shadow-2xl"><button onClick={onClose} aria-label="Close profile" className="ml-auto grid size-9 place-items-center rounded-full bg-white text-xl">×</button><div className="relative mx-auto mt-1 size-28 overflow-hidden rounded-full bg-[#eee6f5]">{avatar ? <Image src={avatar} alt={person.display_name} fill sizes="112px" className="object-cover" /> : <span className="grid h-full place-items-center text-3xl font-bold text-[#7450a8]">{person.display_name.slice(0, 1).toUpperCase()}</span>}</div><h2 className="mt-4 font-serif text-3xl font-bold">{person.display_name}</h2><div className="mt-3 flex justify-center"><TagBadge label={person.role === "admin" ? "CHIEF HOOMAN" : person.member_tag || "HOOMAN"} color={person.tag_color || "purple"} /></div>{person.bio && <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-[#6f6574]">{person.bio}</p>}<p className="mt-3 text-sm text-[#7d7281]">Pepper&apos;s family</p></section></div>; }
function LikersModal({ likes, onClose, onSelect }: { likes: Like[]; onClose: () => void; onSelect: (person: FamilyPerson) => void }) { return <div role="dialog" aria-modal="true" aria-label="People who liked this Pupdate" className="fixed inset-0 z-[70] grid place-items-center bg-[#302a33]/70 p-5 backdrop-blur-sm" onClick={onClose}><section onClick={event => event.stopPropagation()} className="w-full max-w-sm rounded-[30px] bg-[#fbf8f3] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl font-bold">Liked by</h2><button onClick={onClose} aria-label="Close liker list" className="grid size-9 place-items-center rounded-full bg-white text-xl">×</button></div><div className="mt-4 space-y-2">{likes.map(like => <button key={like.id} onClick={() => like.person && onSelect(like.person)} disabled={!like.person} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left"><span className="grid size-10 place-items-center rounded-full bg-[#eee6f5] text-sm font-bold text-[#7450a8]">{(like.person?.display_name || like.liker_name || "?").slice(0, 1).toUpperCase()}</span><span className="font-bold">{like.person?.display_name || like.liker_name || "Someone"}</span></button>)}</div></section></div>; }
function TagBadge({ label, color, compact = false }: { label: string; color: TagColor; compact?: boolean }) { const styles: Record<TagColor, string> = { purple: "bg-[#7450a8] text-white", red: "bg-[#dc4c4c] text-white", orange: "bg-[#e87932] text-white", yellow: "bg-[#f2cf54] text-[#594600]", green: "bg-[#4f9b68] text-white", "light-blue": "bg-[#86c8e8] text-[#19485f]", indigo: "bg-[#4f5fa8] text-white", violet: "bg-[#8c55b8] text-white", pink: "bg-[#df77a5] text-white" }; return <span className={`shrink-0 rounded-full font-bold uppercase tracking-[.1em] ${compact ? "px-2.5 py-1 text-[8px]" : "mb-1 px-3 py-1 text-[10px]"} ${styles[color]}`}>{label}</span>; }
function Stat({ value, label }: { value: number; label: string }) { return <div className="rounded-[22px] bg-[#eee6f5] p-4 text-center"><strong className="font-serif text-2xl">{value}</strong><span className="mt-1 block text-xs font-bold text-[#7d6d86]">{label}</span></div>; }
function EmptySmall({ text }: { text: string }) { return <div className="mt-8 rounded-[24px] bg-white p-8 text-center text-sm text-[#817687]">{text}</div>; }
function Notice({ text, onClose }: { text: string; onClose: () => void }) { return <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700"><span className="flex-1">{text}</span><button onClick={onClose} aria-label="Dismiss">×</button></div>; }
function Loading() { return <main className="grid min-h-screen place-items-center bg-[#fbf8f3]"><div className="text-center"><Logo /><p className="mt-4 text-sm text-[#817687]">Opening your scrapbook…</p></div></main>; }
function SetupRequired() { return <main className="grid min-h-screen place-items-center bg-[#fbf8f3] px-6"><div className="max-w-md rounded-[28px] bg-white p-7 text-center shadow-xl"><Logo /><h1 className="mt-6 font-serif text-2xl font-bold">Supabase connection needed</h1><p className="mt-3 text-sm leading-6 text-[#7b7080]">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the app.</p></div></main>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
function message(reason: unknown) { return reason instanceof Error ? reason.message : "Something went wrong. Please try again."; }

function NotificationBell({ posts, profile, onPupdate }: { posts: Post[]; profile: Profile; onPupdate: (postId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const activities = useMemo(() => posts.filter(post => post.owner_id === profile.id).flatMap(post => [
    ...post.likes.filter(like => like.user_id !== profile.id).map(like => ({ id: `like-${like.id}`, postId: post.id, date: like.created_at, text: `${like.person?.display_name || like.liker_name || "Someone"} liked your Pupdate` })),
    ...post.comments.filter(comment => comment.user_id !== profile.id).map(comment => ({ id: `comment-${comment.id}`, postId: post.id, date: comment.created_at, text: `${comment.author_name} commented: “${comment.body}”` })),
  ]).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [posts, profile.id]);
  const seenKey = `pupdate.notifications.seen.${profile.id}`;
  useEffect(() => { queueMicrotask(() => { const latest = activities[0]?.date; setUnread(Boolean(latest && latest > (localStorage.getItem(seenKey) ?? ""))); }); }, [activities, seenKey]);
  function toggle() { const next = !open; setOpen(next); if (next) { const latest = activities[0]?.date ?? new Date().toISOString(); localStorage.setItem(seenKey, latest); setUnread(false); } }
  return <div className="relative"><button onClick={toggle} aria-label="Notifications" aria-expanded={open} className="relative grid size-10 place-items-center rounded-full bg-white"><BellIcon className="size-5" />{unread && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#7450a8] ring-2 ring-white" />}</button>{open && <section className="absolute right-0 top-12 z-40 w-[min(21rem,calc(100vw-2rem))] rounded-[22px] bg-white p-4 shadow-2xl"><h2 className="font-serif text-xl font-bold">Notifications</h2>{activities.length ? <div className="mt-3 space-y-2">{activities.map(activity => <button type="button" key={activity.id} onClick={() => { setOpen(false); onPupdate(activity.postId); }} className="block w-full rounded-2xl bg-[#f7f3ef] p-3 text-left transition hover:bg-[#f0e9e3]"><p className="text-sm leading-5">{activity.text}</p><p className="mt-1 text-[10px] text-[#8b7f8e]">{formatDate(activity.date)}</p></button>)}</div> : <p className="mt-3 rounded-2xl bg-[#f7f3ef] p-4 text-sm text-[#7d7281]">No new activity yet.</p>}</section>}</div>;
}

function AppHeader({ dog, profile, posts, onPepper, onProfile, onPupdate }: { dog: Dog; profile: Profile; posts: Post[]; session: Session; onPepper: () => void; onProfile: () => void; onPupdate: (postId: string) => void }) {
  const dogUrl = storageImageUrl("avatars", dog.avatar_path ?? dog.photo_path);
  const avatar = storageImageUrl("avatars", profile.avatar_path);
  return <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/[.05] bg-[#fbf8f3]/95 px-4 py-3 backdrop-blur"><button onClick={onPepper} aria-label={`Open ${dog.name}'s profile`} className="relative size-11 overflow-hidden rounded-full bg-[#e8deee]">{dogUrl ? <Image src={dogUrl} alt={dog.name} fill sizes="44px" className="object-cover" /> : <span className="text-xl">🐾</span>}</button><button onClick={onPepper} className="min-w-0 flex-1 text-left"><Logo compact /><p className="truncate text-[11px] font-semibold text-[#887d8c]">{dog.name} the {dog.breed}</p></button><NotificationBell posts={posts} profile={profile} onPupdate={onPupdate} /><button onClick={onProfile} aria-label="Open your profile" className="relative size-9 overflow-hidden rounded-full bg-[#7450a8] text-xs font-bold text-white">{avatar ? <Image src={avatar} alt={profile.display_name} fill sizes="36px" className="object-cover" /> : profile.display_name.slice(0, 1).toUpperCase()}</button></header>;
}

function UserProfile({ session, profile, posts, onChanged, onSignOut, setError }: { session: Session; profile: Profile; posts: Post[]; onChanged: () => void; onSignOut: () => void; setError: (s: string) => void }) {
  const url = storageImageUrl("avatars", profile.avatar_path);
  async function replace(file?: File) { if (!file) return; try { const next = await upload(session, "avatars", file); await db(session, "profiles", `?id=eq.${session.user.id}`, { method: "PATCH", body: JSON.stringify({ avatar_path: next }) }); if (profile.avatar_path) await removeUpload(session, "avatars", profile.avatar_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function remove() { if (!profile.avatar_path) return; try { await db(session, "profiles", `?id=eq.${session.user.id}`, { method: "PATCH", body: JSON.stringify({ avatar_path: null }) }); await removeUpload(session, "avatars", profile.avatar_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function saveName(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); const display_name = String(data.get("displayName")); const bio = String(data.get("bio")).trim() || null; try { await db(session, "profiles", `?id=eq.${session.user.id}`, { method: "PATCH", body: JSON.stringify({ display_name, bio, updated_at: new Date().toISOString() }) }); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function saveTagColor(tag_color: TagColor) { try { await db(session, "profiles", `?id=eq.${session.user.id}`, { method: "PATCH", body: JSON.stringify({ tag_color }) }); await onChanged(); } catch (reason) { setError(message(reason)); } }
  const recent = posts.slice(0, 3);
  return <main className="px-5 py-6 sm:px-7"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Your account</p><h1 className="mt-1 font-serif text-3xl font-bold">{profile.display_name}</h1></div><TagBadge label={profile.role === "admin" ? "CHIEF HOOMAN" : profile.member_tag || "HOOMAN"} color={profile.tag_color || "purple"} /></div><section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#8b62bd]">Your profile photo</p><PhotoManager url={url} label={profile.display_name} onChange={replace} onDelete={remove} /><form onSubmit={saveName} className="mt-5"><Field label="Your display name"><div className="flex gap-2"><input name="displayName" defaultValue={profile.display_name} className="field min-w-0" required /><button className="rounded-full bg-[#eee6f5] px-4 text-xs font-bold text-[#67428f]">Save</button></div></Field><div className="mt-4"><Field label="Bio (optional)"><textarea name="bio" defaultValue={profile.bio ?? ""} className="field resize-none" rows={3} maxLength={300} /></Field></div></form><div className="mt-4"><Field label="Your tag colour"><select value={profile.tag_color || "purple"} onChange={event => saveTagColor(event.target.value as TagColor)} className="field">{TAG_COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select></Field></div></section><section className="mt-5 rounded-[24px] bg-[#eee6f5] px-5 py-4 text-center"><strong className="font-serif text-3xl">{posts.length}</strong><span className="mt-1 block text-xs font-bold uppercase tracking-[.12em] text-[#765d84]">Pupdates posted</span></section><section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Recent Pupdates</p>{recent.length ? <div className="mt-3 grid grid-cols-3 gap-2">{recent.map(post => <article key={post.id} className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="relative aspect-square bg-[#eee6f5]">{post.photos[0]?.url ? <Image src={post.photos[0].url} alt={post.caption || "Recent Pupdate"} fill sizes="(max-width: 680px) 30vw, 160px" quality={55} loading="lazy" decoding="async" className="object-cover" /> : <span className="grid h-full place-items-center text-2xl">🐾</span>}</div><div className="p-2.5"><p className="truncate text-xs font-bold">{post.caption || "A Pepper moment"}</p><p className="mt-1 text-[10px] text-[#8a7f8d]">{new Date(post.event_date ? `${post.event_date}T00:00:00` : post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p></div></article>)}</div> : <div className="mt-3 rounded-[22px] bg-white p-5 text-center text-sm text-[#7d7281]">Your latest Pupdates will appear here.</div>}</section>{profile.role === "admin" && <AdminModeration session={session} currentUserId={profile.id} onChanged={onChanged} setError={setError} />}<button onClick={onSignOut} className="secondary mt-7 text-red-600">Sign out</button></main>;
}

type ModerationProfile = Pick<Profile, "id" | "display_name" | "role" | "avatar_path" | "member_tag" | "tag_color">;

function AdminModeration({ session, currentUserId, onChanged, setError }: { session: Session; currentUserId: string; onChanged: () => void; setError: (s: string) => void }) {
  const [members, setMembers] = useState<ModerationProfile[]>([]);
  const load = useCallback(async () => {
    setMembers(await db<ModerationProfile[]>(session, "profiles", "?select=id,display_name,role,avatar_path,member_tag,tag_color&order=created_at.asc"));
  }, [session]);
  useEffect(() => { queueMicrotask(() => { void load().catch(reason => setError(message(reason))); }); }, [load, setError]);
  async function removeAccount(member: ModerationProfile) { if (!window.confirm(`Remove ${member.display_name} from the family? Their account and all associated data will be permanently deleted.`)) return; try { const [dogs, photos] = await Promise.all([db<Pick<Dog, "photo_path" | "avatar_path">[]>(session, "dogs", `?owner_id=eq.${member.id}&select=photo_path,avatar_path`), db<Pick<Photo, "storage_path">[]>(session, "pupdate_photos", `?owner_id=eq.${member.id}&select=storage_path`)]); const avatarPaths = [member.avatar_path, ...dogs.flatMap(dog => [dog.photo_path, dog.avatar_path])].filter((path): path is string => Boolean(path)); await Promise.all([...avatarPaths.map(path => removeUpload(session, "avatars", path)), ...photos.map(photo => removeUpload(session, "pupdates", photo.storage_path))]); await db(session, "rpc/admin_delete_account", "", { method: "POST", body: JSON.stringify({ target_user_id: member.id }) }); await load(); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function saveTag(event: FormEvent<HTMLFormElement>, member: ModerationProfile) { event.preventDefault(); const data = new FormData(event.currentTarget); try { await db(session, "profiles", `?id=eq.${member.id}`, { method: "PATCH", body: JSON.stringify({ member_tag: String(data.get("memberTag")).trim().toUpperCase(), tag_color: String(data.get("tagColor")) }) }); await load(); await onChanged(); } catch (reason) { setError(message(reason)); } }
  return <section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Family management</p><details className="mt-3 rounded-[22px] bg-white p-4 shadow-sm"><summary className="cursor-pointer text-sm font-bold">People <span className="text-[#8a7f8d]">({members.length})</span></summary><div className="mt-3 space-y-3">{members.map(member => <div key={member.id} className="rounded-2xl bg-[#f7f3ef] p-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-[#eee6f5] text-xs font-bold text-[#7450a8]">{member.display_name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{member.display_name}</span><TagBadge label={member.role === "admin" ? "CHIEF HOOMAN" : member.member_tag || "HOOMAN"} color={member.tag_color || "purple"} compact />{member.id === currentUserId ? <span className="text-[10px] font-bold uppercase text-[#8b62bd]">You</span> : <button onClick={() => removeAccount(member)} className="rounded-full bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">Remove</button>}</div>{member.id !== currentUserId && <form onSubmit={event => saveTag(event, member)} className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"><input name="memberTag" defaultValue={member.member_tag || "HOOMAN"} maxLength={24} aria-label={`Tag for ${member.display_name}`} className="min-w-0 rounded-xl bg-white px-3 py-2 text-xs font-bold uppercase" required /><select name="tagColor" defaultValue={member.tag_color || "purple"} aria-label={`Tag colour for ${member.display_name}`} className="min-w-0 rounded-xl bg-white px-2 py-2 text-xs">{TAG_COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select><button className="rounded-xl bg-[#7450a8] px-3 text-xs font-bold text-white">Save</button></form>}</div>)}</div></details></section>;
}

function PepperProfile({ session, dog, posts, careEvents, onChanged, setError }: { session: Session; dog: Dog; posts: Post[]; careEvents: CareEvent[]; onChanged: () => void; setError: (s: string) => void }) {
  const url = storageImageUrl("avatars", dog.photo_path);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<"walk" | "feed" | null>(null);
  async function replace(file?: File) { if (!file) return; try { const next = await upload(session, "avatars", file); await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ photo_path: next }) }); if (dog.photo_path) await removeUpload(session, "avatars", dog.photo_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function remove() { if (!dog.photo_path) return; try { await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ photo_path: null }) }); await removeUpload(session, "avatars", dog.photo_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function saveProfile(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); try { await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ name: String(data.get("name")), breed: String(data.get("breed")), birthday: String(data.get("birthday")), bio: String(data.get("bio")) || null, updated_at: new Date().toISOString() }) }); setEditing(false); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function recordCare(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (!recording) return; const data = new FormData(e.currentTarget); const occurredAt = new Date(`${data.get("date")}T${data.get("time")}`).toISOString(); try { await db(session, "care_events", "", { method: "POST", body: JSON.stringify({ owner_id: session.user.id, dog_id: dog.id, event_type: recording, occurred_at: occurredAt }) }); setRecording(null); await onChanged(); } catch (reason) { setError(message(reason)); } }
  const latest = (type: "walk" | "feed") => careEvents.find(event => event.event_type === type);
  // eslint-disable-next-line react/no-unescaped-entities
  return <main><div className="relative h-64 overflow-hidden bg-[#eee6f5]">{url ? <Image src={url} alt={dog.name} fill sizes="680px" className="object-cover" /> : <span className="grid h-full place-items-center text-8xl">🐾</span>}<div className="absolute inset-0 bg-gradient-to-t from-[#35243b]/70 via-transparent to-transparent" /><div className="absolute bottom-5 left-5 text-white"><p className="text-xs font-bold uppercase tracking-[.15em]">{dog.breed}</p><h1 className="font-serif text-4xl font-bold">{dog.name}</h1></div></div><section className="px-5 py-6 sm:px-7"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">Born {new Date(`${dog.birthday}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>{dog.bio && <p className="mt-3 text-sm leading-6 text-[#766b7a]">{dog.bio}</p>}</div><button onClick={() => setEditing(!editing)} className="shrink-0 rounded-full bg-[#eee6f5] px-4 py-2 text-xs font-bold text-[#67428f]">{editing ? "Cancel" : "Edit profile"}</button></div>{editing && <form onSubmit={saveProfile} className="mt-5 space-y-4 rounded-[24px] bg-white p-5 shadow-sm"><Field label="Name"><input name="name" defaultValue={dog.name} className="field" required /></Field><Field label="Breed"><input name="breed" defaultValue={dog.breed} className="field" required /></Field><Field label="Birthday"><input name="birthday" type="date" defaultValue={dog.birthday} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Bio (optional)"><textarea name="bio" defaultValue={dog.bio ?? ""} rows={4} maxLength={500} className="field resize-none" /></Field><button className="primary">Save Pepper's profile</button></form>}<div className="mt-5 rounded-[24px] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#8b62bd]">Pepper's profile photo</p><PhotoManager compact url={url} label={`${dog.name}'s photo`} onChange={replace} onDelete={remove} /></div><section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Private care notes</p><h2 className="mt-1 font-serif text-2xl font-bold">Today with {dog.name}</h2><div className="mt-4 grid grid-cols-2 gap-3">{(["walk", "feed"] as const).map(type => <article key={type} className="rounded-[22px] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8f8394]">Last {type === "walk" ? "walked" : "fed"}</p><strong className="mt-2 block font-serif text-lg">{latest(type) ? new Date(latest(type)!.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not recorded"}</strong><button onClick={() => setRecording(type)} className="mt-4 w-full rounded-full bg-[#7450a8] px-3 py-2.5 text-xs font-bold text-white">Record {type}</button></article>)}</div>{recording && <form onSubmit={recordCare} className="mt-4 rounded-[24px] border border-[#d9c7e8] bg-[#faf7fc] p-5"><p className="font-serif text-xl font-bold">Confirm {recording === "walk" ? "walk" : "feed"} time</p><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Time"><input name="time" type="time" defaultValue={new Date().toTimeString().slice(0, 5)} className="field" required /></Field></div><button className="primary mt-4">Confirm update</button><button type="button" onClick={() => setRecording(null)} className="mt-2 w-full py-2 text-xs font-bold text-[#7e7085]">Cancel</button></form>}</section><div className="mt-6 grid grid-cols-2 gap-3"><Stat value={posts.length} label="Pupdates" /><Stat value={posts.reduce((n, post) => n + post.photos.length, 0)} label="Memories" /></div></section></main>;
}

function PepperProfileV2({ session, dog, posts, careEvents, onChanged, setError }: { session: Session; dog: Dog; posts: Post[]; careEvents: CareEvent[]; onChanged: () => void; setError: (s: string) => void }) {
  const coverUrl = storageImageUrl("avatars", dog.photo_path);
  const avatarUrl = storageImageUrl("avatars", dog.avatar_path);
  const [hoomans, setHoomans] = useState<FamilyPerson[]>([]);
  const [viewingHooman, setViewingHooman] = useState<FamilyPerson | null>(null);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<"walk" | "feed" | null>(null);
  useEffect(() => {
    void db<Profile[]>(session, "profiles", "?select=*&order=created_at.asc")
      .then(async profiles => setHoomans(await withAvatarUrls(session, profiles)))
      .catch(reason => setError(message(reason)));
  }, [session, setError]);

  async function replacePhoto(column: "photo_path" | "avatar_path", file?: File) {
    if (!file) return;
    try {
      const next = await upload(session, "avatars", file);
      const old = dog[column];
      await db(session, "rpc/set_shared_dog_photo", "", { method: "POST", body: JSON.stringify({ target_dog_id: dog.id, photo_column: column, photo_path: next }) });
      if (old) await removeUpload(session, "avatars", old).catch(() => undefined);
      await onChanged();
    } catch (reason) { setError(message(reason)); }
  }

  async function removePhoto(column: "photo_path" | "avatar_path") {
    const old = dog[column];
    if (!old) return;
    try {
      await db(session, "rpc/set_shared_dog_photo", "", { method: "POST", body: JSON.stringify({ target_dog_id: dog.id, photo_column: column, photo_path: null }) });
      await removeUpload(session, "avatars", old).catch(() => undefined);
      await onChanged();
    } catch (reason) { setError(message(reason)); }
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    try {
      await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ name: String(data.get("name")), breed: String(data.get("breed")), birthday: String(data.get("birthday")), bio: String(data.get("bio")) || null, updated_at: new Date().toISOString() }) });
      setEditing(false); await onChanged();
    } catch (reason) { setError(message(reason)); }
  }

  async function recordCare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!recording) return; const data = new FormData(e.currentTarget);
    try {
      await db(session, "care_events", "", { method: "POST", body: JSON.stringify({ owner_id: session.user.id, dog_id: dog.id, event_type: recording, occurred_at: new Date(`${data.get("date")}T${data.get("time")}`).toISOString() }) });
      setRecording(null); await onChanged();
    } catch (reason) { setError(message(reason)); }
  }

  const latest = (type: "walk" | "feed") => careEvents.find(event => event.event_type === type);
  const birthday = new Date(`${dog.birthday}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  return <main>
    {viewingHooman && <FamilyProfileModal person={viewingHooman} session={session} onClose={() => setViewingHooman(null)} />}
    <div className="relative h-64 overflow-hidden bg-[#eee6f5]">{coverUrl ? <Image src={coverUrl} alt={dog.name} fill sizes="680px" className="object-cover" /> : <span className="grid h-full place-items-center text-8xl">🐾</span>}<div className="absolute inset-0 bg-gradient-to-t from-[#35243b]/70 via-transparent to-transparent" /><div className="absolute bottom-5 left-5 text-white"><p className="text-xs font-bold uppercase tracking-[.15em]">{dog.breed}</p><h1 className="font-serif text-4xl font-bold">{dog.name}</h1></div><div className="absolute bottom-5 right-5 grid min-w-16 place-items-center rounded-2xl bg-white/90 px-3 py-2 text-center text-[#67428f] shadow-lg backdrop-blur"><span className="text-xl" aria-hidden>&#127874;</span><strong className="mt-0.5 text-[10px] tracking-[.1em]">{birthday}</strong></div></div>
    <section className="px-5 py-6 sm:px-7">
      {dog.bio ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#766b7a]">{dog.bio}</p> : <p className="mt-3 text-sm italic text-[#94899a]">Add a little about {dog.name}.</p>}
      <button onClick={() => setEditing(!editing)} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-[#eee6f5] px-5 text-xs font-bold text-[#67428f]">{editing ? "Cancel editing" : "Edit profile"}</button>
      {editing && <form onSubmit={saveProfile} className="mt-5 space-y-4 rounded-[24px] bg-white p-5 shadow-sm"><Field label="Name"><input name="name" defaultValue={dog.name} className="field" required /></Field><Field label="Breed"><input name="breed" defaultValue={dog.breed} className="field" required /></Field><Field label="Birthday"><input name="birthday" type="date" defaultValue={dog.birthday} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Bio (optional)"><textarea name="bio" defaultValue={dog.bio ?? ""} rows={5} maxLength={500} className="field resize-none" /></Field><button className="primary">Save Pepper’s profile</button></form>}

      <section className="mt-7"><h2 className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Pepper&apos;s Hoomans</h2>{hoomans.length ? <div className="mt-4 flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{hoomans.map(person => <button key={person.id} onClick={() => setViewingHooman(person)} className="flex w-20 shrink-0 flex-col items-center text-center"><span className="relative grid size-16 overflow-hidden rounded-full bg-[#eee6f5] text-lg font-bold text-[#7450a8] ring-2 ring-white shadow-sm">{person.avatarUrl ? <Image src={person.avatarUrl} alt={person.display_name} fill sizes="64px" className="object-cover" /> : <span className="grid h-full place-items-center">{person.display_name.slice(0, 1).toUpperCase()}</span>}</span><span className="mt-2 w-full truncate text-xs font-bold">{person.display_name}</span></button>)}</div> : <p className="mt-3 text-sm text-[#8d8290]">No Hoomans have joined yet.</p>}</section>

      <section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Private care notes</p><div className="mt-4 grid grid-cols-2 gap-3">{(["walk", "feed"] as const).map(type => <article key={type} className="rounded-[22px] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8f8394]">Last {type === "walk" ? "walked" : "fed"}</p><strong className="mt-2 block font-serif text-lg">{latest(type) ? new Date(latest(type)!.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not recorded"}</strong><button onClick={() => setRecording(type)} className="mt-4 w-full rounded-full bg-[#7450a8] px-3 py-2.5 text-xs font-bold text-white">Record {type}</button></article>)}</div>{recording && <form onSubmit={recordCare} className="mt-4 rounded-[24px] border border-[#d9c7e8] bg-[#faf7fc] p-5"><p className="font-serif text-xl font-bold">Confirm {recording === "walk" ? "walk" : "feed"} time</p><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Time"><input name="time" type="time" defaultValue={new Date().toTimeString().slice(0, 5)} className="field" required /></Field></div><button className="primary mt-4">Confirm update</button><button type="button" onClick={() => setRecording(null)} className="mt-2 w-full py-2 text-xs font-bold text-[#7e7085]">Cancel</button></form>}</section>

      <section className="mt-7"><h2 className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Change photos</h2><div className="mt-3 rounded-[24px] bg-white p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#67428f]">Profile photo</p><p className="mt-1 text-xs text-[#8d8290]">Shown in the small circle at the top of the app.</p><PhotoManager compact url={avatarUrl} label={`${dog.name} profile photo`} onChange={file => replacePhoto("avatar_path", file)} onDelete={() => removePhoto("avatar_path")} /></div><div className="my-5 h-px bg-black/[.06]" /><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#67428f]">Header</p><p className="mt-1 text-xs text-[#8d8290]">Shown across the top of Pepper’s profile.</p><PhotoManager compact url={coverUrl} label={`${dog.name} header photo`} onChange={file => replacePhoto("photo_path", file)} onDelete={() => removePhoto("photo_path")} /></div></div></section>
      <div className="mt-6 grid grid-cols-2 gap-3"><Stat value={posts.length} label="Pupdates" /><Stat value={posts.reduce((n, post) => n + post.photos.length, 0)} label="Memories" /></div>
    </section>
  </main>;
}

// Legacy components are not used by the main app, but remain exported for now. They share the same signed URL cache if rendered.
export { Header as LegacyHeader, ProfilePage as LegacyProfilePage, PepperProfile as LegacyPepperProfile };







