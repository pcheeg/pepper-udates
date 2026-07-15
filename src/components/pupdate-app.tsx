/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BellIcon, BookIcon, CameraIcon, ChevronIcon, HomeIcon, MoreIcon, PlusIcon, UserIcon } from "./icons";
import { db, ensureSession, forgotPassword, logIn, readSession, removeUpload, saveSession, Session, signedUrl, signOut, signUp, supabaseConfigured, updatePassword, upload } from "@/lib/supabase";

type TagColor = "purple" | "red" | "orange" | "yellow" | "green" | "light-blue" | "indigo" | "violet" | "pink";
type Profile = { id: string; display_name: string; avatar_path: string | null; bio: string | null; onboarding_complete: boolean; role: "admin" | "user"; member_tag: string; tag_color: TagColor };
type FamilyPerson = Pick<Profile, "id" | "display_name" | "avatar_path" | "bio" | "role" | "member_tag" | "tag_color">;
type Dog = { id: string; owner_id: string; name: string; breed: string; birthday: string; bio: string | null; photo_path: string | null; avatar_path: string | null };
type Photo = { id: string; pupdate_id: string; storage_path: string; sort_order: number; url?: string };
type Like = { id: string; pupdate_id: string; user_id: string; liker_name: string | null; created_at: string; person?: FamilyPerson };
type Comment = { id: string; pupdate_id: string; user_id: string; author_name: string; body: string; created_at: string; person?: FamilyPerson };
type Post = { id: string; owner_id: string; poster_name: string | null; poster?: FamilyPerson; poster_avatar_path?: string | null; poster_tag?: string; poster_tag_color?: TagColor; poster_role?: "admin" | "user"; caption: string; location: string | null; event_date: string | null; tags: string[]; created_at: string; photos: Photo[]; likes: Like[]; comments: Comment[] };
type CareEvent = { id: string; dog_id: string; event_type: "walk" | "feed"; occurred_at: string; created_at: string };
type Tab = "feed" | "add" | "scrapbook" | "profile" | "pepper";
type AuthView = "welcome" | "signup" | "login" | "forgot" | "reset";
const TAG_COLORS: { value: TagColor; label: string }[] = [{ value: "purple", label: "Purple" }, { value: "red", label: "Red" }, { value: "orange", label: "Orange" }, { value: "yellow", label: "Yellow" }, { value: "green", label: "Green" }, { value: "light-blue", label: "Light blue" }, { value: "indigo", label: "Indigo" }, { value: "violet", label: "Violet" }, { value: "pink", label: "Pink" }];

export default function PupdateApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dog, setDog] = useState<Dog | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [careEvents, setCareEvents] = useState<CareEvent[]>([]);
  const [tab, setTab] = useState<Tab>("feed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authView, setAuthView] = useState<AuthView>("welcome");

  const hydrate = useCallback(async (active: Session) => {
    const current = await ensureSession(active); setSession(current);
    const ownProfiles = await db<Profile[]>(current, "profiles", `?id=eq.${current.user.id}&select=*`);
    const ownProfile = ownProfiles[0] ?? null;
    const visibleProfiles = await db<Profile[]>(current, "profiles", "?select=*").catch(() => ownProfiles);
    const [dogs, updates, photos, care, likes, comments] = await Promise.all([
      db<Dog[]>(current, "dogs", "?select=*&order=created_at.asc&limit=1"),
      db<Omit<Post, "photos" | "likes" | "comments">[]>(current, "pupdates", "?select=*&order=created_at.desc"),
      db<Photo[]>(current, "pupdate_photos", "?select=*&order=sort_order.asc"),
      db<CareEvent[]>(current, "care_events", "?select=*&order=occurred_at.desc").catch(() => []),
      db<Like[]>(current, "pupdate_likes", "?select=*&order=created_at.asc").catch(() => []),
      db<Comment[]>(current, "pupdate_comments", "?select=*&order=created_at.asc").catch(() => []),
    ]);
    const withUrls = await Promise.all(photos.map(async photo => ({ ...photo, url: await signedUrl(current, "pupdates", photo.storage_path) ?? undefined })));
    setProfile(ownProfile); setDog(dogs[0] ?? null);
    setPosts(updates.map(post => { const posterProfile = visibleProfiles.find(item => item.id === post.owner_id); return { ...post, poster: posterProfile, poster_avatar_path: posterProfile?.avatar_path ?? null, poster_tag: posterProfile?.member_tag ?? "HOOMAN", poster_tag_color: posterProfile?.tag_color ?? "purple", poster_role: posterProfile?.role ?? "user", photos: withUrls.filter(photo => photo.pupdate_id === post.id), likes: likes.filter(like => like.pupdate_id === post.id).map(like => ({ ...like, person: visibleProfiles.find(item => item.id === like.user_id) })), comments: comments.filter(comment => comment.pupdate_id === post.id).map(comment => ({ ...comment, person: visibleProfiles.find(item => item.id === comment.user_id) })) }; }));
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
    {tab === "feed" && <Feed posts={posts} dog={dog} profile={profile} onCreate={() => setTab("add")} onChanged={reload} session={session} setError={setError} />}
    {tab === "add" && <AddPupdate session={session} profile={profile} onCreated={async () => { await reload(); setTab("feed"); }} setError={setError} />}
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

function Header({ dog, profile, session, onProfile }: { dog: Dog; profile: Profile; session: Session; onProfile: () => void }) { const [dogUrl, setDogUrl] = useState<string | null>(null); const [avatar, setAvatar] = useState<string | null>(null); useEffect(() => { void signedUrl(session, "avatars", dog.photo_path).then(setDogUrl); void signedUrl(session, "avatars", profile.avatar_path).then(setAvatar); }, [dog.photo_path, profile.avatar_path, session]); return <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black/[.05] bg-[#fbf8f3]/95 px-4 py-3 backdrop-blur"><button onClick={onProfile} className="relative size-11 overflow-hidden rounded-full bg-[#e8deee]">{dogUrl ? <Image src={dogUrl} alt={dog.name} fill sizes="44px" className="object-cover" /> : <span className="text-xl">🐾</span>}</button><div className="min-w-0 flex-1"><Logo compact /><p className="truncate text-[11px] font-semibold text-[#887d8c]">{dog.name} the {dog.breed}</p></div><button aria-label="Notifications" className="grid size-10 place-items-center rounded-full bg-white"><BellIcon className="size-5" /></button><button onClick={onProfile} className="relative size-9 overflow-hidden rounded-full bg-[#7450a8] text-xs font-bold text-white">{avatar ? <Image src={avatar} alt={profile.display_name} fill sizes="36px" className="object-cover" /> : profile.display_name.slice(0, 1).toUpperCase()}</button></header>; }

function Feed({ posts, dog, profile, onCreate, onChanged, session, setError }: { posts: Post[]; dog: Dog; profile: Profile; onCreate: () => void; onChanged: () => void; session: Session; setError: (s: string) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  async function refresh() { setRefreshing(true); setPullDistance(58); try { await onChanged(); } finally { window.setTimeout(() => { setRefreshing(false); setPullDistance(0); }, 350); } }
  function startPull(y: number) { if (window.scrollY <= 0 && !refreshing) setPullStart(y); }
  function movePull(y: number) { if (pullStart === null || refreshing) return; const distance = Math.max(0, y - pullStart); setPullDistance(Math.min(92, distance * 0.55)); }
  function finishPull() { if (pullStart === null || refreshing) return; setPullStart(null); if (pullDistance >= 58) void refresh(); else setPullDistance(0); }
  if (!posts.length) return <section className="grid min-h-[70vh] place-items-center px-7 text-center"><div><div className="mx-auto grid size-40 place-items-center rounded-[42px] bg-[#eee5f4] text-7xl shadow-inner" aria-hidden>🐶</div><h1 className="mt-7 font-serif text-3xl font-bold">The first page is yours</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#817687]">Share {dog.name}’s first moment and begin a scrapbook your family can keep forever.</p><button onClick={onCreate} className="primary mt-7">Create First Pupdate</button></div></section>;
  return <main onTouchStart={event => startPull(event.touches[0].clientY)} onTouchMove={event => movePull(event.touches[0].clientY)} onTouchEnd={finishPull} onTouchCancel={finishPull} className="px-3 py-5 overscroll-y-contain sm:px-6"><div aria-live="polite" style={{ height: pullDistance }} className="flex items-center justify-center overflow-hidden transition-[height] duration-200"><div className={`grid size-10 place-items-center rounded-full bg-white text-[#7450a8] shadow-sm ring-1 ring-black/[.05] ${pullDistance >= 58 && !refreshing ? "scale-100" : "scale-90"}`}><RefreshIcon className={`size-5 transition-transform ${refreshing ? "animate-spin" : pullDistance >= 58 ? "rotate-180" : ""}`} /></div><span className="sr-only">{refreshing ? "Refreshing feed" : pullDistance >= 58 ? "Release to refresh" : "Pull down to refresh"}</span></div><div className="space-y-5">{posts.map(post => <PostCard key={post.id} post={post} profile={profile} session={session} onChanged={onChanged} setError={setError} />)}</div></main>;
}

function PostCard({ post, profile, session, onChanged, setError }: { post: Post; profile: Profile; session: Session; onChanged: () => void; setError: (s: string) => void }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
  const [viewingPerson, setViewingPerson] = useState<FamilyPerson | null>(null);
  cons…10877 tokens truncated…l appear here.</div>}</section>{profile.role === "admin" && <AdminModeration session={session} currentUserId={profile.id} onChanged={onChanged} setError={setError} />}<button onClick={onSignOut} className="secondary mt-7 text-red-600">Sign out</button></main>;
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
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<"walk" | "feed" | null>(null);
  useEffect(() => { void signedUrl(session, "avatars", dog.photo_path).then(setUrl); }, [session, dog.photo_path]);
  async function replace(file?: File) { if (!file) return; try { const next = await upload(session, "avatars", file); await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ photo_path: next }) }); if (dog.photo_path) await removeUpload(session, "avatars", dog.photo_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function remove() { if (!dog.photo_path) return; try { await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ photo_path: null }) }); await removeUpload(session, "avatars", dog.photo_path); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function saveProfile(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); try { await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ name: String(data.get("name")), breed: String(data.get("breed")), birthday: String(data.get("birthday")), bio: String(data.get("bio")) || null, updated_at: new Date().toISOString() }) }); setEditing(false); await onChanged(); } catch (reason) { setError(message(reason)); } }
  async function recordCare(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (!recording) return; const data = new FormData(e.currentTarget); const occurredAt = new Date(`${data.get("date")}T${data.get("time")}`).toISOString(); try { await db(session, "care_events", "", { method: "POST", body: JSON.stringify({ owner_id: session.user.id, dog_id: dog.id, event_type: recording, occurred_at: occurredAt }) }); setRecording(null); await onChanged(); } catch (reason) { setError(message(reason)); } }
  const latest = (type: "walk" | "feed") => careEvents.find(event => event.event_type === type);
  // eslint-disable-next-line react/no-unescaped-entities
  return <main><div className="relative h-64 overflow-hidden bg-[#eee6f5]">{url ? <Image src={url} alt={dog.name} fill sizes="680px" className="object-cover" /> : <span className="grid h-full place-items-center text-8xl">🐾</span>}<div className="absolute inset-0 bg-gradient-to-t from-[#35243b]/70 via-transparent to-transparent" /><div className="absolute bottom-5 left-5 text-white"><p className="text-xs font-bold uppercase tracking-[.15em]">{dog.breed}</p><h1 className="font-serif text-4xl font-bold">{dog.name}</h1></div></div><section className="px-5 py-6 sm:px-7"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">Born {new Date(`${dog.birthday}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>{dog.bio && <p className="mt-3 text-sm leading-6 text-[#766b7a]">{dog.bio}</p>}</div><button onClick={() => setEditing(!editing)} className="shrink-0 rounded-full bg-[#eee6f5] px-4 py-2 text-xs font-bold text-[#67428f]">{editing ? "Cancel" : "Edit profile"}</button></div>{editing && <form onSubmit={saveProfile} className="mt-5 space-y-4 rounded-[24px] bg-white p-5 shadow-sm"><Field label="Name"><input name="name" defaultValue={dog.name} className="field" required /></Field><Field label="Breed"><input name="breed" defaultValue={dog.breed} className="field" required /></Field><Field label="Birthday"><input name="birthday" type="date" defaultValue={dog.birthday} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Bio (optional)"><textarea name="bio" defaultValue={dog.bio ?? ""} rows={4} maxLength={500} className="field resize-none" /></Field><button className="primary">Save Pepper's profile</button></form>}<div className="mt-5 rounded-[24px] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#8b62bd]">Pepper's profile photo</p><PhotoManager compact url={url} label={`${dog.name}'s photo`} onChange={replace} onDelete={remove} /></div><section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#8b62bd]">Private care notes</p><h2 className="mt-1 font-serif text-2xl font-bold">Today with {dog.name}</h2><div className="mt-4 grid grid-cols-2 gap-3">{(["walk", "feed"] as const).map(type => <article key={type} className="rounded-[22px] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8f8394]">Last {type === "walk" ? "walked" : "fed"}</p><strong className="mt-2 block font-serif text-lg">{latest(type) ? new Date(latest(type)!.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not recorded"}</strong><button onClick={() => setRecording(type)} className="mt-4 w-full rounded-full bg-[#7450a8] px-3 py-2.5 text-xs font-bold text-white">Record {type}</button></article>)}</div>{recording && <form onSubmit={recordCare} className="mt-4 rounded-[24px] border border-[#d9c7e8] bg-[#faf7fc] p-5"><p className="font-serif text-xl font-bold">Confirm {recording === "walk" ? "walk" : "feed"} time</p><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className="field" required /></Field><Field label="Time"><input name="time" type="time" defaultValue={new Date().toTimeString().slice(0, 5)} className="field" required /></Field></div><button className="primary mt-4">Confirm update</button><button type="button" onClick={() => setRecording(null)} className="mt-2 w-full py-2 text-xs font-bold text-[#7e7085]">Cancel</button></form>}</section><div className="mt-6 grid grid-cols-2 gap-3"><Stat value={posts.length} label="Pupdates" /><Stat value={posts.reduce((n, post) => n + post.photos.length, 0)} label="Memories" /></div></section></main>;
}

function PepperProfileV2({ session, dog, posts, careEvents, onChanged, setError }: { session: Session; dog: Dog; posts: Post[]; careEvents: CareEvent[]; onChanged: () => void; setError: (s: string) => void }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hoomans, setHoomans] = useState<(FamilyPerson & { avatarUrl: string | null })[]>([]);
  const [viewingHooman, setViewingHooman] = useState<FamilyPerson | null>(null);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<"walk" | "feed" | null>(null);
  useEffect(() => {
    void signedUrl(session, "avatars", dog.photo_path).then(setCoverUrl);
    void signedUrl(session, "avatars", dog.avatar_path).then(setAvatarUrl);
  }, [session, dog.photo_path, dog.avatar_path]);
  useEffect(() => {
    void db<Profile[]>(session, "profiles", "?select=*&order=created_at.asc")
      .then(async profiles => setHoomans(await Promise.all(profiles.map(async person => ({ ...person, avatarUrl: await signedUrl(session, "avatars", person.avatar_path) })))))
      .catch(reason => setError(message(reason)));
  }, [session, setError]);

  async function replacePhoto(column: "photo_path" | "avatar_path", file?: File) {
    if (!file) return;
    try {
      const next = await upload(session, "avatars", file);
      const old = dog[column];
      await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ [column]: next, updated_at: new Date().toISOString() }) });
      if (old) await removeUpload(session, "avatars", old);
      await onChanged();
    } catch (reason) { setError(message(reason)); }
  }

  async function removePhoto(column: "photo_path" | "avatar_path") {
    const old = dog[column];
    if (!old) return;
    try {
      await db(session, "dogs", `?id=eq.${dog.id}`, { method: "PATCH", body: JSON.stringify({ [column]: null, updated_at: new Date().toISOString() }) });
      await removeUpload(session, "avatars", old);
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

export { Header as LegacyHeader, ProfilePage as LegacyProfilePage, PepperProfile as LegacyPepperProfile };
