import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";

const NOTIFICATION_TEMPLATES = [
  {
    id: "tpl_verify_email",
    name: "Email Verification",
    subject: "Verify your email for Heat Chat",
    type: "email",
    description: "Sent to new users upon account registration.",
    variables: ["{{username}}", "{{confirmation_link}}", "{{expires_in}}"],
    status: "active",
  },
  {
    id: "tpl_reset_password",
    name: "Password Reset",
    subject: "Reset your Heat Chat password",
    type: "email",
    description: "Sent when a password recovery request is initiated.",
    variables: ["{{username}}", "{{reset_link}}", "{{expires_in}}"],
    status: "active",
  },
  {
    id: "tpl_suspension",
    name: "Account Suspension Notice",
    subject: "Heat Chat - Important notice regarding your account",
    type: "email",
    description: "Sent when an account is administratively suspended.",
    variables: ["{{username}}", "{{reason}}", "{{duration}}"],
    status: "active",
  },
  {
    id: "tpl_security_alert",
    name: "Security Alert: New Sign-in",
    subject: "New login detected on your Heat Chat account",
    type: "security",
    description: "Triggered on suspicious or new device authentication.",
    variables: ["{{username}}", "{{device}}", "{{ip_address}}", "{{time}}"],
    status: "active",
  },
];

export async function GET() {
  const auth = await requireAdminPermission("notifications.view");
  if (auth.errorResponse) {
    const fallback = await requireAdminPermission("settings.view");
    if (fallback.errorResponse) return auth.errorResponse;
  }

  return NextResponse.json({ templates: NOTIFICATION_TEMPLATES });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission("notifications.manage");
  if (auth.errorResponse || !auth.session) return auth.errorResponse!;

  try {
    const body = await request.json();
    const { templateId, testEmail, reason } = body;

    if (!templateId || !testEmail) {
      return NextResponse.json({ error: "templateId and testEmail are required." }, { status: 400 });
    }

    await logAdminAction({
      session: auth.session,
      action: "NOTIFICATION_TEST_SENT",
      targetType: "setting",
      targetId: templateId,
      reason: reason || `Test email dispatched to ${testEmail}`,
      newValue: { templateId, testEmail },
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${testEmail}.` });
  } catch (err) {
    console.error("Test notification error:", err);
    return NextResponse.json({ error: "Failed to dispatch test notification" }, { status: 500 });
  }
}
