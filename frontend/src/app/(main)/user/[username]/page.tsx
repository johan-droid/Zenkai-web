"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { User, Calendar, BookOpen, Film, Edit3, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchPublicProfile, updateUserProfile, fetchRemoteLibrary, type UserProfile, type UserLibraryResponse } from "@/lib/api/auth";

export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = decodeURIComponent(resolvedParams.username);

  const { user: currentUser, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [libraryData, setLibraryData] = useState<UserLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwnProfile = currentUser && currentUser.username.toLowerCase() === username.toLowerCase();

  useEffect(() => {
    // Reset loading state when navigating between profiles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetchPublicProfile(username)
      .then((res) => {
        setProfile(res.user);
        setEditDisplayName(res.user.displayName || "");
        setEditBio(res.user.bio || "");
        setEditAvatarUrl(res.user.avatarUrl || "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "User profile not found");
      })
      .finally(() => {
        setLoading(false);
      });

    // If own profile, also load library stats
    if (isOwnProfile) {
      fetchRemoteLibrary().then(setLibraryData).catch(() => {});
    }
  }, [username, isOwnProfile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateUserProfile({
        displayName: editDisplayName.trim() || undefined,
        bio: editBio.trim() || undefined,
        avatarUrl: editAvatarUrl.trim() || null,
      });
      setProfile(updated);
      await refreshUser();
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-[#c8102e] border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-glass-border bg-black/20 text-muted-foreground">
          <User className="size-7" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">User Not Found</h1>
          <p className="text-sm text-muted-foreground">@{username} could not be found or has not registered yet.</p>
        </div>
        <Button variant="outline" asChild className="glass gap-2 rounded-xl">
          <Link href="/">
            <ArrowLeft className="size-4" />
            <span>Return to Home</span>
          </Link>
        </Button>
      </div>
    );
  }

  const joinDate = new Date(profile.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel relative flex flex-col gap-6 overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-glass-border bg-[#c8102e]/20 text-2xl font-bold uppercase text-[#ff4d6a] shadow-lg">
              {profile.username.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {profile.displayName || profile.username}
                </h1>
                {isOwnProfile && (
                  <Badge variant="outline" className="border-[#c8102e]/40 bg-[#c8102e]/10 text-xs text-[#ff4d6a]">
                    You
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            </div>
          </div>

          {isOwnProfile && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="glass gap-2 rounded-xl border-glass-border hover:bg-white/10"
            >
              <Edit3 className="size-3.5" />
              <span>Edit Profile</span>
            </Button>
          )}
        </div>

        {/* Bio */}
        {profile.bio ? (
          <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">{profile.bio}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No bio provided yet.</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="size-4" />
          <span>Joined {joinDate}</span>
        </div>

        {/* Edit Form Modal/Drawer */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-3 rounded-2xl border border-glass-border bg-black/30 p-4">
            <h3 className="text-sm font-bold text-foreground">Edit Your Public Profile</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                <Input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="e.g. Son Goku"
                  className="glass rounded-xl text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Avatar Image URL</label>
                <Input
                  type="url"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="glass rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Bio (up to 500 characters)</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Tell other viewers about your favorite anime and manga..."
                className="glass rounded-xl border border-glass-border bg-black/20 p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-[#c8102e]"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={saving} className="rounded-xl bg-[#c8102e] text-white hover:bg-[#a00d24]">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl">
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Library Stats Section */}
      {isOwnProfile && libraryData && (
        <section className="glass-panel flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight">Library Summary</h2>
            <Button variant="ghost" size="sm" asChild className="text-xs text-[#ff4d6a] hover:bg-[#c8102e]/10">
              <Link href="/library">View Full Library →</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-xl border border-glass-border bg-black/20 p-3">
              <span className="text-xs font-medium text-muted-foreground">Watching / Reading</span>
              <span className="text-2xl font-bold text-foreground">{libraryData.counts.watching}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-glass-border bg-black/20 p-3">
              <span className="text-xs font-medium text-muted-foreground">Completed</span>
              <span className="text-2xl font-bold text-emerald-400">{libraryData.counts.completed}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-glass-border bg-black/20 p-3">
              <span className="text-xs font-medium text-muted-foreground">Plan to Watch</span>
              <span className="text-2xl font-bold text-blue-400">{libraryData.counts.plan}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-glass-border bg-black/20 p-3">
              <span className="text-xs font-medium text-muted-foreground">Total Titles</span>
              <span className="text-2xl font-bold text-foreground">{libraryData.counts.total}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
