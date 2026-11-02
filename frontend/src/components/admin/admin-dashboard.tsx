"use client";

import React from "react";
import { Layout, User, Shield, Settings, ShieldCheck, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AdminDashboardProps {
  userRole: "user" | "moderator" | "admin";
  onRoleChange: (role: "user" | "moderator" | "admin") => void;
}

export function AdminDashboard({ userRole, onRoleChange }: AdminDashboardProps) {
  const { toast } = useToast();

  const handleAction = async (action: "destroy" | "delete" | "ban" | "unban" | "delete-data") => {
    const confirmed = window.confirm(
      `Are you sure you want to ${action}? This action cannot be undone.`
    );
    if (!confirmed) return;
    
    toast({
      title: "Action confirmed",
      description: `${action.charAt(0).toUpperCase() + action.slice(1)} action will be performed`,
      variant: "destructive",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Layout className="size-5 text-amber-400" />
              <span className="text-xl font-semibold text-gray-900">Zenkai Admin</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu">
                  <User className="size-4" />
                </Button>
              </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onRoleChange("user")}>
                    <span>Switch to User</span>
                  </DropdownMenuItem>
                  {userRole !== "admin" && (
                    <DropdownMenuItem onClick={() => onRoleChange("moderator")}>
                      <span>Moderator Mode</span>
                    </DropdownMenuItem>
                  )}
                  {userRole !== "user" && (
                    <DropdownMenuItem onClick={() => onRoleChange("admin")}>
                      <span>Admin Mode</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled>
                    <span>Version {process.env.NEXT_PUBLIC_APP_VERSION || "2.0.0"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
      </nav>

      <main className="p-4 sm:p-6 lg:p-8">
        {/* Role-based content */}
        {userRole === "admin" && (
          <AdminPanel onRoleChange={onRoleChange} />
        )}
        {userRole === "moderator" && (
          <ModeratorPanel onRoleChange={onRoleChange} />
        )}
        {userRole === "user" && (
          <UserPanel />
        )}
      </main>
    </div>
  );
}

/* Role panels */
function AdminPanel({ onRoleChange }: { onRoleChange: (role: "user" | "moderator" | "admin") => void }) {
  const { toast } = useToast();
  return (
    <div className="pt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Administrator Panel</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Button
          onClick={() => toast({ title: "Feature Coming Soon", description: "Admin panel under development", variant: "default" })}
        >
          User Management
        </Button>
        <Button
          onClick={() => toast({ title: "Feature Coming Soon", description: "System settings under development", variant: "default" })}
        >
          System Settings
        </Button>
        <Button
          onClick={() => toast({ title: "Feature Coming Soon", description: "Analytics under development", variant: "default" })}
        >
          Dashboard
        </Button>
      </div>
      
      <hr className="my-6 border-gray-200" />
      
      <div className="space-y-4">
        <h3 className="text-semibold mb-3">System Announcements</h3>
        <Button variant="outline" size="sm" onClick={() => toast({ title: "Announcement", description: "No announcements at this time", variant: "default" })}>
          View Announcements
        </Button>
        
        <hr />
        
        <h3 className="text-semibold mb-3">Background Jobs</h3>
        <Button variant="outline" size="sm" onClick={() => toast({ title: "Jobs", description: "No active jobs", variant: "default" })}>
          Job Status
        </Button>
        
        <hr />
        
        <h3 className="text-semibold mb-3">Audit Log</h3>
        <Button variant="outline" size="sm" onClick={() => toast({ title: "Audit Log", description: "No log entries", variant: "default" })}>
          View Log
        </Button>
      </div>
    </div>
  );
}

function ModeratorPanel({ onRoleChange }: { onRoleChange: (role: "user" | "moderator" | "admin") => void }) {
  const { toast } = useToast();
  return (
    <div className="pt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Moderator Panel</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Button
          onClick={() => toast({ title: "Moderation", description: "Comment review queue", variant: "default" })}>
          Review Queue
        </Button>
        <Button
          onClick={() => toast({ title: "Moderation", description: "User warnings", variant: "default" })}>
          User Actions
        </Button>
      </div>
      
      <hr className="my-6 border-gray-200" />
      
      <div className="space-y-4">
        <h3 className="text-semibold mb-3">Recent Activity</h3>
        <p className="text-zinc-500">Recent comments, reviews, and reports</p>
        
        <hr />
        
        <h3 className="text-semibold mb-3">Settings</h3>
        <p className="text-zinc-500">Moderator settings</p>
      </div>
    </div>
  );
}

function UserPanel() {
  return (
    <div className="pt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Account</h2>
      <p className="text-zinc-500">Welcome to Zenkai! Your role: User</p>
      <ul className="mt-4 space-y-2 text-zinc-400">
        <li>Browse anime and manga</li>
        <li>Track your progress</li>
        <li>Write reviews and comments</li>
        <li>Manage your library</li>
      </ul>
    </div>
  );
}
