// The workspace Files tab's tree: the folder the session's tree browses (the workspace
// root unless rooted elsewhere) and its uncommitted changes, under a header naming the
// folder with Back to working folder and Reveal Active File.

import { FolderDotIcon, LocateFixedIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChangedSort } from "@/lib/changedSort";
import { isOwnerLevel } from "@/lib/permissionsApi";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import {
  RunnerOfflineError,
  joinBrowseLocation,
  relativizeToWorkspace,
  useWorkspaceAllFiles,
  useWorkspaceChangedFiles,
  useWorkspaceEnvironment,
} from "@/hooks/useWorkspaceChangedFiles";
import { breadcrumbSegments, workspaceFolderName } from "@/shell/breadcrumbPaths";
import { useRememberedBrowseLocation } from "@/shell/filesPane/browseLocations";
import { activeFileTreePath } from "@/shell/fileTree/activeFileTreePath";
import { changesWithinFolder, visibleEntries } from "@/shell/fileTree/filesTreeListings";
import { FilesTree } from "@/shell/fileTree/FilesTree";
import { REVEAL_ACTIVE_FILE_LABEL } from "@/shell/fileTree/revealActiveFile";
import {
  BACK_TO_WORKING_FOLDER_LABEL,
  planFolderAsTreeRoot,
  planWorkingFolderReturn,
  showTreeRoot,
} from "@/shell/fileTree/treeRoot";
import { useTreeActiveReveal } from "@/shell/fileTree/useTreeActiveReveal";

export interface FilesPageTreeProps {
  conversationId: string;
  /** The tree is on screen, so it takes up the session's reveal requests. */
  active: boolean;
  /** The file the page shows, which the tree opens down to. */
  activePath: string | undefined;
  sort: ChangedSort;
  showHidden: boolean;
  /** Shows hidden files, for a workspace whose every file is hidden. */
  onShowHidden?: () => void;
  /**
   * A file picked in the tree, workspace-relative or absolute outside it. `newTab` for
   * a ⌘-click (Ctrl-click off macOS) or a middle click, which want it in its own tab.
   */
  onFileSelect: (path: string, options?: { newTab: true }) => void;
}

function TreeMessage({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <p
      role={alert ? "alert" : "status"}
      className={
        alert ? "px-3 py-2 text-ui text-destructive" : "px-3 py-2 text-ui text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}

function HeaderButton({
  label,
  tooltip,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* aria-disabled, not disabled, so the tooltip can still say why. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-disabled={disabled || undefined}
          className="shrink-0 text-muted-foreground hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:text-muted-foreground"
          onClick={() => {
            if (!disabled) onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function FilesPageTree({
  conversationId,
  active,
  activePath,
  sort,
  showHidden,
  onShowHidden,
  onFileSelect,
}: FilesPageTreeProps) {
  const environment = useWorkspaceEnvironment(conversationId);
  const workspaceRoot = environment.data?.root ?? null;
  const browsed = useRememberedBrowseLocation(conversationId);
  // The wire form: "" for the workspace root, relative inside it, absolute outside.
  const location = relativizeToWorkspace(browsed, workspaceRoot);
  const { session } = useSession(conversationId);
  const canBrowseOutside = isOwnerLevel(session?.permissionLevel ?? null);
  const files = useWorkspaceAllFiles(conversationId, {}, location);
  const changes = useWorkspaceChangedFiles(conversationId);
  const reveal = useTreeActiveReveal({
    conversationId,
    active,
    activePath: activePath ?? null,
    location,
    workspaceRoot,
    workspaceKnown: environment.data !== undefined || environment.isError,
    showHidden,
  });
  const away = planWorkingFolderReturn({ browsed, workspaceRoot }).availability.available;
  const folderName =
    browsed === null
      ? workspaceFolderName(workspaceRoot)
      : (breadcrumbSegments(browsed).at(-1)?.label ?? browsed);

  const header = (
    <div
      className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border pr-1 pl-3"
      data-testid="files-page-tree-header"
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-ui",
          away ? "text-foreground" : "text-muted-foreground",
        )}
        title={browsed ?? workspaceRoot ?? undefined}
      >
        {folderName}
      </span>
      {away ? (
        <HeaderButton
          label={BACK_TO_WORKING_FOLDER_LABEL}
          tooltip={BACK_TO_WORKING_FOLDER_LABEL}
          onClick={() => showTreeRoot(conversationId, null)}
        >
          <FolderDotIcon />
        </HeaderButton>
      ) : null}
      <HeaderButton
        label={REVEAL_ACTIVE_FILE_LABEL}
        tooltip={
          reveal.plan.availability.available
            ? REVEAL_ACTIVE_FILE_LABEL
            : (reveal.plan.availability.reason ?? REVEAL_ACTIVE_FILE_LABEL)
        }
        disabled={!reveal.plan.availability.available}
        onClick={reveal.revealActiveFile}
      >
        <LocateFixedIcon />
      </HeaderButton>
    </div>
  );

  const body = (() => {
    if (files.isPending) return <TreeMessage>Loading files…</TreeMessage>;
    if (files.isError) {
      return files.error instanceof RunnerOfflineError ? (
        <TreeMessage>The session’s machine is offline. Send a message to reconnect it.</TreeMessage>
      ) : (
        <TreeMessage alert>{`Couldn’t list the files: ${files.error.message}`}</TreeMessage>
      );
    }
    if (!files.data.available) {
      return <TreeMessage>This session has no workspace files.</TreeMessage>;
    }
    const entries = files.data.data;
    if (entries.length === 0) {
      return (
        <TreeMessage>{away ? "This folder is empty." : "No files in the workspace."}</TreeMessage>
      );
    }
    if (visibleEntries(entries, showHidden).length === 0) {
      return (
        <div className="flex flex-col items-start gap-2 pb-2">
          <TreeMessage>Every file here is hidden.</TreeMessage>
          {onShowHidden ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mx-3"
              onClick={onShowHidden}
            >
              Show hidden files
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <FilesTree
        key={`${conversationId}\0${location}`}
        conversationId={conversationId}
        browseLocation={location}
        rootEntries={entries}
        changedFiles={changesWithinFolder(
          changes.data?.available ? changes.data.data : [],
          location,
          workspaceRoot,
        )}
        sort={sort}
        showHidden={showHidden}
        refreshToken={0}
        onFileSelect={(path, options) => onFileSelect(joinBrowseLocation(location, path), options)}
        // Double-clicking a folder, or its menu's Open folder as root, roots the tree there.
        onNavigateDir={(path) => {
          const plan = planFolderAsTreeRoot({
            folder: joinBrowseLocation(location, path),
            browsed,
            workspaceRoot,
            canBrowseOutside,
          });
          if (plan.availability.available) showTreeRoot(conversationId, plan.root);
        }}
        reveal={null}
        activeFile={activeFileTreePath(activePath, location, workspaceRoot)}
        activeReveal={reveal.activeReveal}
        onActiveRevealHandled={reveal.onActiveRevealHandled}
        label="Workspace files"
      />
    );
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
}
