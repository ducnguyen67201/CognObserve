import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function WorkspaceSettingsMembersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Manage workspace members and permissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Members</CardTitle>
          <CardDescription>
            Invite and manage members of this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Member management coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
