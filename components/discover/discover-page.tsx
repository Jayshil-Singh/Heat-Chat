"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Compass, Users, UserCheck, AlertCircle, RefreshCw, Sparkles, Shield } from "lucide-react";
import { DiscoverToggle } from "./discover-toggle";
import { DiscoverSearch } from "./discover-search";
import { PersonCard } from "./person-card";
import { PersonCardSkeleton } from "./person-card-skeleton";
import { FriendRequestList } from "./friend-request-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useDiscoverPeople } from "@/hooks/use-discover-people";
import { useFriendRequests } from "@/hooks/use-friend-requests";
import { useConversations } from "@/hooks/use-conversations";

export function DiscoverPageContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"discover" | "requests">("discover");

  const {
    isDiscoverable,
    isPreferenceLoading,
    isToggling,
    toggleDiscoverability,
    people,
    isLoading: isPeopleLoading,
    error: peopleError,
    searchQuery,
    setSearchQuery,
    refreshPeople,
    sendRequest,
    cancelRequest,
    acceptRequest,
  } = useDiscoverPeople();

  const {
    incoming,
    outgoing,
    isLoading: isRequestsLoading,
    error: requestsError,
    acceptRequest: acceptFriendRequest,
    declineRequest: declineFriendRequest,
    cancelRequest: cancelFriendRequest,
    refreshRequests,
  } = useFriendRequests();

  const { getOrCreateDirectChat } = useConversations();

  const handleStartChat = async (targetUserId: string) => {
    try {
      const res = await getOrCreateDirectChat(targetUserId);
      if (res?.conversationId) {
        router.push(`/chat/${res.conversationId}`);
      }
    } catch (err) {
      console.error("[Heat Chat] handleStartChat error:", err);
    }
  };

  const incomingCount = incoming.length;

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6 w-full min-w-0 max-w-full box-border">
      {/* Page Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-heat-500 font-semibold text-xs mb-1">
          <Compass className="h-4 w-4" />
          <span>Social Discovery</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Discover People
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Find people who are open to connecting.
        </p>
      </div>

      {/* Privacy Discovery Toggle Card */}
      <DiscoverToggle
        isDiscoverable={isDiscoverable}
        isLoading={isPreferenceLoading || isToggling}
        onToggle={toggleDiscoverability}
      />

      {/* Primary Section Switcher */}
      <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("discover")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all min-h-[44px] sm:min-h-[36px] ${
            activeTab === "discover"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Compass className="h-4 w-4 text-heat-500" />
          <span>Discover People</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all min-h-[44px] sm:min-h-[36px] relative ${
            activeTab === "requests"
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Friend Requests</span>
          {incomingCount > 0 && (
            <span className="ml-1 rounded-full bg-heat-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
              {incomingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Discover People */}
      {activeTab === "discover" && (
        <div className="space-y-4">
          {/* If current user is not discoverable, show a soft informational banner */}
          {!isDiscoverable && !isPreferenceLoading && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <Shield className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="truncate">You&apos;re hidden from Discover People.</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleDiscoverability}
                disabled={isToggling}
                className="h-8 px-3 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40 text-xs shrink-0"
              >
                Enable discovery
              </Button>
            </div>
          )}

          {/* Search Bar */}
          <DiscoverSearch
            value={searchQuery}
            onChange={setSearchQuery}
            isLoading={isPeopleLoading}
          />

          {/* Error Banner (shown if refreshing failed while preserving existing list) */}
          {peopleError && people.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{peopleError}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshPeople}
                className="h-8 px-2.5 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry</span>
              </Button>
            </div>
          )}

          {/* Results List */}
          {isPeopleLoading && people.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <PersonCardSkeleton key={i} />
              ))}
            </div>
          ) : people.length > 0 ? (
            <div className="space-y-3" aria-label="Discoverable people list">
              {people.map((person) => (
                <PersonCard
                  key={person.user_id}
                  person={person}
                  onSendRequest={sendRequest}
                  onCancelRequest={cancelRequest}
                  onAcceptRequest={acceptRequest}
                  onStartChat={handleStartChat}
                />
              ))}
            </div>
          ) : peopleError ? (
            <EmptyState
              icon={<AlertCircle className="h-7 w-7 text-rose-500" />}
              title="Unable to load people"
              description={peopleError}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshPeople}
                  className="h-9 px-3.5 text-xs gap-1.5 rounded-xl border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Try again</span>
                </Button>
              }
              className="py-14"
            />
          ) : (
            <EmptyState
              icon={<Users className="h-7 w-7 text-zinc-400" />}
              title={searchQuery ? "No people found" : "No discoverable people yet"}
              description={
                searchQuery
                  ? "Try searching for another name or username."
                  : "Check back soon as more people enable discovery!"
              }
              className="py-14"
            />
          )}
        </div>
      )}

      {/* Tab: Friend Requests */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {requestsError && (incoming.length > 0 || outgoing.length > 0) && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{requestsError}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshRequests}
                className="h-8 px-2.5 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry</span>
              </Button>
            </div>
          )}

          <FriendRequestList
            incoming={incoming}
            outgoing={outgoing}
            isLoading={isRequestsLoading}
            error={requestsError}
            onRetry={refreshRequests}
            onAccept={acceptFriendRequest}
            onDecline={declineFriendRequest}
            onCancel={cancelFriendRequest}
          />
        </div>
      )}
    </div>
  );
}
