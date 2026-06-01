"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { addUserMcpServerAction } from "@/server/actions/mcp";

/**
 * Connections-page card that opens an "Add MCP server" dialog. Any
 * server that publishes RFC 9728 discovery + a DCR-capable AS metadata
 * doc can be added — Stripe, Vercel, Supabase, etc.
 *
 * No bearer-paste path: OAuth 2.0 only. The form submits to
 * `addUserMcpServerAction`, which probes discovery before persisting
 * the row, so a server that won't connect is rejected before the user
 * even sees a Connect button.
 */
export function AddMcpServerCard() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setDisplayName("");
    setResourceUrl("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await addUserMcpServerAction({
        display_name: displayName,
        resource_url: resourceUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Added MCP server '${result.key}'. Click Connect to authorize.`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Add an MCP server</p>
            <p className="text-xs text-muted-foreground">
              Connect any OAuth 2.0 MCP server — Stripe, Vercel, Supabase, or
              your own.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-3.5" />
            Add server
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add MCP server</DialogTitle>
            <DialogDescription>
              Paste the MCP server&apos;s resource URL. We&apos;ll verify it
              advertises OAuth 2.0 dynamic client registration before saving.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-display-name">Name</Label>
              <Input
                id="mcp-display-name"
                placeholder="Stripe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-resource-url">Remote MCP server URL</Label>
              <Input
                id="mcp-resource-url"
                type="url"
                placeholder="https://mcp.stripe.com/"
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                disabled={submitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                The HTTPS endpoint your agents will call. We derive the OAuth
                discovery URL from this automatically.
              </p>
            </div>
            {error ? (
              <p
                className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Add server
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
