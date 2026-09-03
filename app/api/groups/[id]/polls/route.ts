import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { PollDto } from "@/types/chat";

/**
 * GET /api/groups/[id]/polls
 * Fetch polls for a group conversation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  // Caller must be member
  const { data: member } = await supabase
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "FORBIDDEN", message: "You are not a member of this group" } },
      { status: 403 }
    );
  }

  // Fetch polls with options and votes
  const { data: polls, error: fetchErr } = await supabase
    .from("polls")
    .select(`
      id,
      conversation_id,
      message_id,
      question,
      is_multiple_choice,
      is_anonymous,
      allow_vote_change,
      is_closed,
      closed_at,
      closed_by,
      created_by,
      created_at,
      options:poll_options (
        id,
        poll_id,
        option_text,
        position,
        votes:poll_votes (
          id,
          user_id
        )
      )
    `)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "DATABASE_ERROR", message: fetchErr.message } },
      { status: 500 }
    );
  }

  const pollDtos: PollDto[] = (polls || []).map((poll: any) => {
    let totalVotes = 0;
    const sortedOptions = (poll.options || []).sort((a: any, b: any) => a.position - b.position);

    const options = sortedOptions.map((opt: any) => {
      const votes = opt.votes || [];
      const voteCount = votes.length;
      totalVotes += voteCount;
      const isVotedByMe = votes.some((v: any) => v.user_id === user.id);

      return {
        id: opt.id,
        pollId: opt.poll_id,
        optionText: opt.option_text,
        position: opt.position,
        voteCount,
        // For anonymous polls, hide voter user IDs to ensure privacy
        voterUserIds: poll.is_anonymous ? undefined : votes.map((v: any) => v.user_id),
        isVotedByMe,
      };
    });

    return {
      id: poll.id,
      conversationId: poll.conversation_id,
      messageId: poll.message_id,
      question: poll.question,
      isMultipleChoice: poll.is_multiple_choice,
      isAnonymous: poll.is_anonymous,
      allowVoteChange: poll.allow_vote_change,
      isClosed: poll.is_closed,
      closedAt: poll.closed_at,
      closedBy: poll.closed_by,
      createdBy: poll.created_by,
      createdAt: poll.created_at,
      totalVotes,
      options,
    };
  });

  return NextResponse.json({
    ok: true,
    data: { polls: pollDtos },
    error: null,
  });
}

/**
 * POST /api/groups/[id]/polls
 * Create a new poll in the group conversation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const options = Array.isArray(body.options) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
  const isMultipleChoice = Boolean(body.isMultipleChoice);
  const isAnonymous = Boolean(body.isAnonymous);
  const allowVoteChange = body.allowVoteChange !== false;

  if (question.length < 1 || question.length > 300) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Question must be between 1 and 300 characters" } },
      { status: 400 }
    );
  }

  if (options.length < 2 || options.length > 10) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "VALIDATION_ERROR", message: "Poll must contain between 2 and 10 options" } },
      { status: 400 }
    );
  }

  // Call atomic create_poll RPC
  const { data: pollId, error: rpcErr } = await (supabase.rpc as any)("create_poll", {
    p_conversation_id: conversationId,
    p_question: question,
    p_options: options,
    p_is_multiple_choice: isMultipleChoice,
    p_is_anonymous: isAnonymous,
    p_allow_vote_change: allowVoteChange,
  });

  if (rpcErr) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "CREATION_FAILED", message: rpcErr.message || "Failed to create poll" } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { pollId },
    error: null,
  });
}
